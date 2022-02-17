import { assertEquals } from "https://deno.land/std@0.125.0/testing/asserts.ts";
import { analyzeImports, reduceVersions } from "./lib.ts";

Deno.test({
  name: "analyzeImports - esm.sh",
  fn() {
    const actual = analyzeImports([
      "https://esm.sh/package@1.0.0",
      "https://esm.sh/@scope/package@1.0.0",
      "https://esm.sh/package@1.0.1/",
      "https://esm.sh/package@1.0.1/index.js",
      "https://esm.sh/package",
      "https://esm.sh/package/",
      "https://esm.sh/package/index.js",
      "https://esm.sh/package@^1.0.0",
      "https://esm.sh/package@~1.0.0",
    ]);
    assertEquals(
      actual[0],
      new Map([
        ["package", new Set(["", "1.0.0", "1.0.1", "^1.0.0", "~1.0.0"])],
        [
          "@scope/package",
          new Set(["1.0.0"]),
        ],
      ]),
    );
    assertEquals(
      actual[1],
      new Map([
        ["https://esm.sh/package@1.0.0", ["package", "1.0.0"]],
        [
          "https://esm.sh/@scope/package@1.0.0",
          ["@scope/package", "1.0.0"],
        ],
        ["https://esm.sh/package@1.0.1/", ["package", "1.0.1"]],
        ["https://esm.sh/package@1.0.1/index.js", ["package", "1.0.1"]],
        ["https://esm.sh/package", ["package", ""]],
        ["https://esm.sh/package/", ["package", ""]],
        ["https://esm.sh/package/index.js", ["package", ""]],
        ["https://esm.sh/package@^1.0.0", ["package", "^1.0.0"]],
        ["https://esm.sh/package@~1.0.0", ["package", "~1.0.0"]],
      ]),
    );
  },
});

Deno.test({
  name: "semver",
  fn() {
    const versions = [
      "0.12.0",
      "1.0.0",
      "1.0.1",
      "1.0.2",
      "1.1.0",
      "1.1.2",
      "2.0.0",
      "2.0.1",
      "2.0.2",
    ];
    const ranges = [
      "1.0.0",
      "^2.0.0",
      "^1.0.0",
      "~1.1.0",
      "~1.0.0",
    ];
    const actual = reduceVersions(versions, ranges);
    assertEquals(
      actual,
      new Map([
        ["1.0.0", "1.0.0"],
        ["^2.0.0", "2.0.2"],
        ["^1.0.0", "1.1.2"],
        ["~1.1.0", "1.1.2"],
        ["~1.0.0", "1.0.0"],
      ]),
    );
  },
});
