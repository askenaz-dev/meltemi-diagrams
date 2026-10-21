// Copies the JavaScript modules of the capture (the DevTools client and the worker, which a plain
// `node` runs) and their declarations into dist/. Usage: node build.mjs (after tsc).
import { copyFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const name of readdirSync(join(here, "src"))) {
  if (name.endsWith(".mjs") || name.endsWith(".d.mts")) {
    copyFileSync(join(here, "src", name), join(here, "dist", name));
  }
}
console.log("Copied the capture modules to packages/capture/dist");
