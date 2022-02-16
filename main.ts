#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write --allow-net

import { parse } from "https://deno.land/std@0.125.0/flags/mod.ts";
import * as colors from "https://deno.land/std@0.125.0/fmt/colors.ts";
import { SEP, toFileUrl } from "https://deno.land/std@0.125.0/path/mod.ts";
import { createCache } from "https://deno.land/x/deno_cache@0.2.1/mod.ts";
import {
  createGraph,
  type ModuleGraphJson,
} from "https://deno.land/x/deno_graph@0.22.0/mod.ts";
import { default as semver } from "https://cdn.skypack.dev/semver@7.3.5";

interface ImportMap {
  imports: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
}

interface NpmDist {
  tarball: string;
  shasum: string;
  integrity?: string;
  fileCount?: number;
  unpackedSize?: number;
  "npm-signature"?: string;
}

interface NpmVersionDataAbbreviated {
  name: string;
  version: string;
  dist: NpmDist;
  deprecated?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bundleDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  bin?: unknown;
  directories?: Record<string, unknown>;
  engines?: unknown;
}

interface NpmPackageDataAbbreviated {
  name: string;
  modified: string;
  "dist-tags": Record<string, string>;
  versions: Record<string, NpmVersionDataAbbreviated>;
}

/** Asynchronously fetches npm registry abbreviated package data for a given
 * package. */
async function getPackage(pkg: string): Promise<NpmPackageDataAbbreviated> {
  const res = await fetch(`https://registry.npmjs.org/${pkg}`, {
    headers: {
      accept: "application/vnd.npm.install-v1+json, application/json;q=0.9",
    },
  });
  if (res.status !== 200) {
    throw new Error(
      `Received ${res.status} ${res.statusText} from npm registry.`,
    );
  }
  return res.json();
}

/** Given an module graph JSON structure, identify all the remote imports and
 * return them. */
function extractRemoteImports(json: ModuleGraphJson): string[] {
  const imports = new Set<string>();
  const modules = new Map<string, Record<string, string>>();
  for (const module of json.modules) {
    const specifiers: Record<string, string> = Object.create(null);
    if (module.dependencies) {
      for (const dependency of module.dependencies) {
        if (dependency.specifier.match(/^https?:/i)) {
          imports.add(dependency.specifier);
        }
        const resolved = dependency.code?.specifier ??
          dependency.type?.specifier;
        if (resolved && resolved.match(/^https?:/i)) {
          specifiers[dependency.specifier] = resolved;
        }
      }
      if (module.typesDependency?.specifier.match(/^https?:/i)) {
        imports.add(module.typesDependency.specifier);
      }
      if (module.typesDependency?.dependency?.specifier?.match(/^https?:/i)) {
        specifiers[module.typesDependency.specifier] =
          module.typesDependency.dependency.specifier;
      }
    }
    if (module.specifier.match(/^https?:/i)) {
      modules.set(module.specifier, specifiers);
    }
  }
  return [...imports];
}

const VERSION = "0.0.1";

// logging to stderr so stdout can be piped
console.error(`${colors.bold("pin")} - version ${VERSION}`);

const argv = parse(Deno.args, {
  alias: {
    "output": "o",
  },
});

const input = argv._[0];

if (!input) {
  console.error(
    `${
      colors.red(colors.bold("error"))
    }: A module must be supplied to analyze.`,
  );
  Deno.exit(1);
}

// gives access to the DENO_DIR
const cache = createCache();
const { cacheInfo, load } = cache;

// we use the Deno.cwd() as the base for any argument passed in.
const url = new URL(String(input), toFileUrl(`${Deno.cwd()}${SEP}`));
console.error(`${colors.green("Analyzing")} ${url.toString()}`);
const graph = await createGraph(url.toString(), { cacheInfo, load });
const json = graph.toJSON();

const imports = extractRemoteImports(json);

/** URL patterns of supported npm package registries which can be analyzed. */
const patterns = new Map([
  [
    "esm.sh",
    new URLPattern(
      "http{s}?://esm.sh/:org(@[^/]+)?/:pkg([^@/]+){@}?:ver?/:mod?",
    ),
  ],
  [
    "cdn.esm.sh",
    new URLPattern(
      "http{s}?://cdn.esm.sh/:regver(v[0-9]+)/:org(@[^/]+)?/:pkg([^@/]+)@:ver/:mod*",
    ),
  ],
  [
    "skypack.dev",
    new URLPattern({
      protocol: "https",
      hostname: "cdn.skypack.dev",
      pathname: "/:org(@[^/]+)?/:pkg([^@/]+){@}?:ver?/:mod?",
      search: "*",
    }),
  ],
]);

// Identify npm packages in the remote dependencies parse out the package and
// optional semver/version/tag.

const deps = new Map<string, Set<string>>();
const parsed = new Map<string, [string, string]>();

for (const dep of imports) {
  for (const pattern of patterns.values()) {
    const match = pattern.exec(dep);
    if (match) {
      const pkg = match.pathname.groups.org
        ? `${match.pathname.groups.org}/${match.pathname.groups.pkg}`
        : match.pathname.groups.pkg;
      const ver = match.pathname.groups.ver;
      let vers;
      if (deps.has(pkg)) {
        vers = deps.get(pkg)!;
      } else {
        vers = new Set<string>();
        deps.set(pkg, vers);
      }
      vers.add(ver);
      parsed.set(dep, [pkg, ver]);
      break;
    }
  }
}

if (deps.size) {
  console.error(
    `${colors.green("Identified")} npm dependencies of "${
      [...deps.keys()].join(`", "`)
    }"`,
  );
}

// Query the npm registry for package information and attempt to resolve the
// best match. Versions that

const infos = new Map<string, NpmPackageDataAbbreviated>();
const resolved = new Map<string, Map<string, string>>();

for (const [pkg, vers] of deps) {
  const info = await getPackage(pkg);
  infos.set(pkg, await getPackage(pkg));
  const pkgVers = Object.keys(info.versions);
  const resolvedVersions = new Map<string, string>();
  for (const ver of vers) {
    // if the version is a dist-tag, we will use the version, if the version
    // appears to be a plain "pinned" version, we will actually follow the
    // behavior of `npm i` which is to treat it as only a fixed major release
    // allowing it to float.
    const v = info["dist-tags"][ver] ?? /^\d/.test(ver) ? `^${ver}` : ver;
    const resolved = semver.maxSatisfying(pkgVers, v, { loose: true });
    if (resolved) {
      resolvedVersions.set(ver, resolved);
    }
  }
  resolved.set(pkg, resolvedVersions);
}

// now generate the import map
const importMap: ImportMap = { imports: {} };

for (const [key, [pkg, ver]] of parsed) {
  const resolvedVersions = resolved.get(pkg);
  if (resolvedVersions) {
    const mappedVersion = resolvedVersions.get(ver);
    if (mappedVersion) {
      importMap.imports[key] = key.replace(ver, mappedVersion);
    }
  }
}

// output the import map

const output = argv["output"];

if (output) {
  await Deno.writeTextFile(output, JSON.stringify(importMap, undefined, "  "));
} else {
  console.log(JSON.stringify(importMap, undefined, "  "));
}
