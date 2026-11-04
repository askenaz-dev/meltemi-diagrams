// Bundles the catalog runtime into one script, dist/catalog.js: the catalog and the player,
// with no third-party code. Usage: node build.mjs (after tsc -p tsconfig.build.json).
import { buildSync } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
buildSync({
  absWorkingDir: here,
  entryPoints: [join(here, "src", "runtime.ts")],
  outfile: join(here, "dist", "catalog.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  conditions: ["@meltemi/diagrams-source"],
  minify: true,
  legalComments: "none",
  logLevel: "warning",
});
console.log("Built packages/catalog/dist/catalog.js");
