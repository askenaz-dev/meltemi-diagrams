import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

/**
 * The player runtime as one browser script: `dist/player.js` in a built package, or bundled now
 * with esbuild when the package runs from its sources.
 */
export function playerScript(): string {
  if (cached !== undefined) return cached;
  if (!import.meta.url.endsWith(".ts")) {
    const built = new URL("./player.js", import.meta.url);
    if (!existsSync(built)) {
      throw new Error("The player runtime dist/player.js is missing; build the package.");
    }
    cached = readFileSync(built, "utf8");
    return cached;
  }
  const require = createRequire(import.meta.url);
  const esbuild = require("esbuild") as typeof import("esbuild");
  const result = esbuild.buildSync({
    entryPoints: [fileURLToPath(new URL("./runtime.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    conditions: ["@meltemi/diagrams-source"],
    minify: true,
    legalComments: "none",
    logLevel: "silent",
  });
  cached = result.outputFiles[0]!.text;
  return cached;
}
