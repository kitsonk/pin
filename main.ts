#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write --allow-net

import { SEP, toFileUrl } from "https://deno.land/std@0.125.0/path/mod.ts";
import { parse } from "https://deno.land/std@0.125.0/flags/mod.ts";
import { createCache } from "https://deno.land/x/deno_cache@0.2.1/mod.ts";
import { createGraph } from "https://deno.land/x/deno_graph@0.22.0/mod.ts";

const cache = createCache();
const { cacheInfo, load } = cache;

Deno.cwd();
const argv = parse(Deno.args);

const url = new URL(String(argv._[0]), toFileUrl(`${Deno.cwd()}${SEP}`));

console.log(url.toString());

const graph = await createGraph(url.toString(), { cacheInfo, load });

console.log(graph.toString());
