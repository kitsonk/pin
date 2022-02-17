import { type ModuleGraphJson, semver } from "./deps.ts";

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

/** Base for the npm registry APIs. */
const NPM_REGISTRY = "https://registry.npmjs.org/";

/** URL patterns of supported npm package registries which can be analyzed. */
const PATTERNS = new Map([
  [
    "esm.sh",
    new URLPattern(
      "http{s}?://esm.sh/:org(@[^/]+)?/:pkg([^@/]+){@}?:ver([^/]+)?{/}?:mod?",
    ),
  ],
  [
    "cdn.esm.sh",
    new URLPattern(
      "http{s}?://cdn.esm.sh/:regver(v[0-9]+)/:org(@[^/]+)?/:pkg([^@/]+)@:ver{/}?:mod*",
    ),
  ],
  [
    "skypack.dev",
    new URLPattern({
      protocol: "https",
      hostname: "cdn.skypack.dev",
      pathname: "/:org(@[^/]+)?/:pkg([^@/]+){@}?:ver([^/]+)?{/}?:mod?",
      search: "*",
    }),
  ],
]);

/** Identify npm packages in remote imports and parse out the package and
 * the optional semver/version/tag. */
export function analyzeImports(
  imports: string[],
): [
  deps: Map<string, Set<string>>,
  parsed: Map<string, [pkg: string, ver: string]>,
] {
  const deps = new Map<string, Set<string>>();
  const parsed = new Map<string, [string, string]>();

  for (const dep of imports) {
    for (const pattern of PATTERNS.values()) {
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
  return [deps, parsed];
}

/** Given parsed and resolved dependencies, build an import map. */
export function buildImportMap(
  parsed: Map<string, [string, string]>,
  resolved: Map<string, Map<string, string>>,
): ImportMap {
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

  return importMap;
}

/** Given an module graph JSON structure, identify all the remote imports and
 * return them. */
export function extractRemoteImports(json: ModuleGraphJson): string[] {
  const imports = new Set<string>();
  const modules = new Map<string, Record<string, string>>();
  for (const module of json.modules) {
    const specifiers: Record<string, string> = Object.create(null);
    if (module.dependencies) {
      for (const dependency of module.dependencies) {
        if (isRemoteSpecifier(dependency.specifier)) {
          imports.add(dependency.specifier);
        }
        const resolved = dependency.code?.specifier ??
          dependency.type?.specifier;
        if (isRemoteSpecifier(resolved)) {
          specifiers[dependency.specifier] = resolved;
        }
      }
      if (isRemoteSpecifier(module.typesDependency?.specifier)) {
        imports.add(module.typesDependency!.specifier);
      }
      if (isRemoteSpecifier(module.typesDependency?.dependency?.specifier)) {
        specifiers[module.typesDependency!.specifier] =
          module.typesDependency!.dependency.specifier;
      }
    }
    if (isRemoteSpecifier(module.specifier)) {
      modules.set(module.specifier, specifiers);
    }
  }
  return [...imports];
}

/** Determines if a specifier is considered remote or not. */
function isRemoteSpecifier(specifier: string | undefined): specifier is string {
  return specifier ? /^https?:/i.test(specifier) : false;
}

/** Asynchronously fetches npm registry abbreviated package data for a given
 * package. */
export async function getPackage(
  pkg: string,
): Promise<NpmPackageDataAbbreviated> {
  const res = await fetch(`${NPM_REGISTRY}${pkg}`, {
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

/** Given a set of versions for a package, and a set of ranges, find the
 * most optimal version for each range. */
export function reduceVersions(
  versions: string[],
  ranges: string[],
): Map<string, string> {
  const map = new Map<string, { intersects: string[]; max: string }>();
  for (const range of ranges) {
    const intersects = ranges.filter((r) =>
      semver.intersects(range, r, { loose: true })
    );
    const max = intersects.reduce((prev, curr) => {
      // deno-lint-ignore no-explicit-any
      const max = semver.maxSatisfying(versions, curr) as any;
      return prev && semver.gt(max, prev) ? prev : max;
    }, "");
    map.set(range, { intersects, max });
  }
  const result = new Map<string, string>();
  for (const [range, { intersects, max }] of map) {
    result.set(
      range,
      intersects.reduce((prev, curr) => {
        const { max: currMax } = map.get(curr)!;
        return semver.lt(currMax, prev) ? prev : currMax;
      }, max),
    );
  }
  return result;
}

/** Query the npm registry for package information and attempt to resolve the
 * best match. */
export async function resolveNpmVersions(
  deps: Map<string, Set<string>>,
): Promise<Map<string, Map<string, string>>> {
  const resolved = new Map<string, Map<string, string>>();

  for (const [pkg, vers] of deps) {
    const info = await getPackage(pkg);
    const versions = Object.keys(info.versions);

    const ranges = new Map<string, string>();
    for (const ver of vers) {
      let range;
      if (ver === "") {
        range = info["dist-tags"]["latest"];
      } else if (info["dist-tags"][ver]) {
        range = info["dist-tags"][ver];
      } else if (/^\d/.test(ver)) {
        range = `^${ver}`;
      } else {
        range = ver;
      }
      ranges.set(range, ver);
    }

    const reduced = reduceVersions(versions, [...ranges.keys()]);
    const remapped = new Map<string, string>();
    for (const [range, version] of reduced) {
      remapped.set(ranges.get(range)!, version);
    }

    resolved.set(pkg, remapped);
  }
  return resolved;
}
