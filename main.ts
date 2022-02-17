#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write --allow-net

import {
  colors,
  createCache,
  createGraph,
  parse,
  SEP,
  toFileUrl,
} from "./deps.ts";
import {
  analyzeImports,
  buildImportMap,
  extractRemoteImports,
  resolveNpmVersions,
} from "./lib.ts";

const VERSION = "0.0.2";

// logging to stderr so stdout can be piped
console.error(`${colors.bold("pin")} - version ${VERSION}`);

const argv = parse(Deno.args, {
  alias: {
    "output": "o",
  },
});

const [input] = argv._;

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

// extract remote imports
const imports = extractRemoteImports(json);

// identify and parse out npm packages and versions from imports
const [deps, parsed] = analyzeImports(imports);

if (deps.size) {
  console.error(
    `${colors.green("Identified")} npm dependencies of "${
      [...deps.keys()].join(`", "`)
    }"`,
  );
}

// resolve the npm version with the npm registry
const resolved = await resolveNpmVersions(deps);

// generate the import map
const importMap = buildImportMap(parsed, resolved);

// output the import map
const { output } = argv;
if (output) {
  await Deno.writeTextFile(output, JSON.stringify(importMap, undefined, "  "));
} else {
  console.log(JSON.stringify(importMap, undefined, "  "));
}
