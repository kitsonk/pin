# pin

A proof-of-concept dependency management utility for Deno CLI.

## Concepts

The core concepts of the utility are:

- Dependencies are best expressed in code. Deno applications often store their
  dependencies in a `deps.ts`, but could have them spread throughout the code
  base.
- Import maps are the best way to provide a "lockfile" and resolution mechanism
  for Deno programmes.
- When using packages from the npm registry, via a CDN, they do not account for
  the aggregate dependencies, meaning transient dependencies can easily be
  duplicated, or a "top level" dependency can be one version and a transient
  dependency can be another version.

## Usage

If you clone the repository locally, and are on a UNIX-like system, and have
Deno in your path you can just do:

```
> ./main.ts -o import-map.json examples/esm-sh.ts
> deno info --import-map import-map.json examples/esm-sh.ts
```

## Things to do

This proof-of-concept is very limited at the moment. There are several things
that it should do:

- Deal with dependencies without a version or tag (implied latest).
- Collapse imports to share the most common path. Currently every import module
  get a unique entry.
- Populate the `"scopes"` of the import map. Currently the `"imports"` is only
  the top level external imports. When dealing with individual modules and
  resolving the minimum acceptable graph, there is need to provide this.
- Be able to consume an "upstream" import map and output a modified one.

There are also things that we should consider more widely:

- Supporting semantic version ranges on `deno.land/x`.
- Support providing `deno.land/std` based on the client version of Deno.
- Provide `npm.deno.land`. While the likes of esm.sh is great, there are still
  some challenges. For example when handling type definitions, they are often
  incompatible with how Deno actually needs to load them, and they need to be
  transformed. As well as we can build better tooling around it, and better
  integration into it.

## Example

This is the dependency map of `examples/esm-sh.ts` without the import map:

```
local: /pin/examples/esm-sh.ts type: TypeScript dependencies: 16 unique (total
1.13MB)

file:///pin/examples/esm-sh.ts (195B) ├─┬ https://esm.sh/react-dom@17.0.1 (192B)
│ ├─┬ https://cdn.esm.sh/v66/@types/react-dom@17.0.11/index.d.ts (4.02KB) │ │
└─┬ https://cdn.esm.sh/v66/@types/react@17.0.39/index.d.ts (148.34KB) │ │ ├──
https://cdn.esm.sh/v66/@types/react@17.0.39/global.d.ts (7.01KB) │ │ ├──
https://cdn.esm.sh/v66/@types/prop-types@15.7.4/index.d.ts (3.58KB) │ │ ├──
https://cdn.esm.sh/v66/@types/scheduler@0.16.2/tracing.d.ts (4.03KB) │ │ └──
https://cdn.esm.sh/v66/csstype@3.0.10/index.d.ts (844.54KB) │ ├─┬
https://cdn.esm.sh/v66/react-dom@17.0.1/deno/react-dom.js (118.34KB) │ │ ├──
https://cdn.esm.sh/v66/object-assign@4.1.1/deno/object-assign.js (1.7KB) │ │ ├─┬
https://cdn.esm.sh/v66/react@17.0.1/deno/react.js (8.13KB) │ │ │ └──
https://cdn.esm.sh/v66/object-assign@4.1.1/deno/object-assign.js * │ │ └──
https://cdn.esm.sh/v66/scheduler@0.20.2/deno/scheduler.js (6.3KB) ├─┬
https://esm.sh/react-spectrum@1.2.3 (214B) │ ├─┬
https://cdn.esm.sh/v66/react-spectrum@1.2.3/dist/Spectrum.d.ts (1.68KB) │ │ └──
https://cdn.esm.sh/v66/@types/react@17.0.39/index.d.ts * │ ├─┬
https://cdn.esm.sh/v66/react-spectrum@1.2.3/deno/react-spectrum.js (2.96KB) │ │
└─┬ https://cdn.esm.sh/v66/react@17.0.2/deno/react.js (8.13KB) │ │ └──
https://cdn.esm.sh/v66/object-assign@4.1.1/deno/object-assign.js * └─┬
https://esm.sh/react@17.0.1 (172B) ├──
https://cdn.esm.sh/v66/@types/react@17.0.39/index.d.ts * ├──
https://cdn.esm.sh/v66/react@17.0.1/deno/react.js *
```

If you use the pin tool to generate an import map, the dependency map looks
like:

```
local: /pin/examples/esm-sh.ts type: TypeScript dependencies: 15 unique (total
1.12MB)

file:///pin/examples/esm-sh.ts (195B) ├─┬ https://esm.sh/react-dom@17.0.2 (192B)
│ ├─┬ https://cdn.esm.sh/v66/@types/react-dom@17.0.11/index.d.ts (4.02KB) │ │
└─┬ https://cdn.esm.sh/v66/@types/react@17.0.39/index.d.ts (148.34KB) │ │ ├──
https://cdn.esm.sh/v66/@types/react@17.0.39/global.d.ts (7.01KB) │ │ ├──
https://cdn.esm.sh/v66/@types/prop-types@15.7.4/index.d.ts (3.58KB) │ │ ├──
https://cdn.esm.sh/v66/@types/scheduler@0.16.2/tracing.d.ts (4.03KB) │ │ └──
https://cdn.esm.sh/v66/csstype@3.0.10/index.d.ts (844.54KB) │ ├─┬
https://cdn.esm.sh/v66/react-dom@17.0.2/deno/react-dom.js (118.34KB) │ │ ├──
https://cdn.esm.sh/v66/object-assign@4.1.1/deno/object-assign.js (1.7KB) │ │ ├─┬
https://cdn.esm.sh/v66/react@17.0.2/deno/react.js (8.13KB) │ │ │ └──
https://cdn.esm.sh/v66/object-assign@4.1.1/deno/object-assign.js * │ │ └──
https://cdn.esm.sh/v66/scheduler@0.20.2/deno/scheduler.js (6.3KB) ├─┬
https://esm.sh/react-spectrum@1.2.3 (214B) │ ├─┬
https://cdn.esm.sh/v66/react-spectrum@1.2.3/dist/Spectrum.d.ts (1.68KB) │ │ └──
https://cdn.esm.sh/v66/@types/react@17.0.39/index.d.ts * │ ├─┬
https://cdn.esm.sh/v66/react-spectrum@1.2.3/deno/react-spectrum.js (2.96KB) │ │
└── https://cdn.esm.sh/v66/react@17.0.2/deno/react.js * └─┬
https://esm.sh/react@17.0.2 (172B) ├──
https://cdn.esm.sh/v66/@types/react@17.0.39/index.d.ts * ├──
https://cdn.esm.sh/v66/react@17.0.2/deno/react.js *
```

Most specifically, there is no longer the critical duplication of React, only
version 17.0.2 appears in the graph, and 17.0.1 is eliminated.

```
```
