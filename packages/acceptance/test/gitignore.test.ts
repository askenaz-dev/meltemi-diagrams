// What the public repository holds: the ignore file keeps the local secrets, Wrangler's state, the
// downloaded VS Code, the release's tarballs, the owner's scratch project and the proposal
// documents out of every commit, and keeps the sources, the corpus, the gallery, the examples and
// the brand in.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface Rule {
  readonly negated: boolean;
  readonly directory: boolean;
  readonly anchored: boolean;
  readonly pattern: RegExp;
}

/** The rules of a `.gitignore`, as far as this repository writes them: globs, `!`, a trailing `/`. */
function rulesOf(text: string): Rule[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const negated = line.startsWith("!");
      let body = negated ? line.slice(1) : line;
      const directory = body.endsWith("/");
      if (directory) body = body.slice(0, -1);
      if (body.startsWith("/")) body = body.slice(1);
      const anchored = body.includes("/");
      const source = body
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*");
      return { negated, directory, anchored, pattern: new RegExp(`^${source}$`) };
    });
}

/** Whether Git would ignore a file at `path` (forward slashes, relative to the root). */
function ignored(rules: readonly Rule[], path: string): boolean {
  const segments = path.split("/");
  let result = false;
  for (const rule of rules) {
    let candidates: string[];
    if (rule.directory) {
      candidates = segments
        .slice(0, -1)
        .map((_, i) => (rule.anchored ? segments.slice(0, i + 1) : [segments[i]!]).join("/"));
    } else {
      candidates = rule.anchored ? [path] : [segments.at(-1)!];
    }
    if (candidates.some((candidate) => rule.pattern.test(candidate))) result = !rule.negated;
  }
  return result;
}

describe("the public repository", () => {
  const rules = rulesOf(readFileSync(join(ROOT, ".gitignore"), "utf8"));

  it.each([
    "node_modules/vitest/package.json",
    "packages/model/dist/index.js",
    "packages/cloud/.dev.vars",
    "packages/cloud/.dev.vars.local",
    "packages/cloud/.wrangler/state/v3/d1/db.sqlite",
    "packages/cloud/wrangler.deploy.json",
    "packages/cloud/wrangler.publish.deploy.json",
    "packages/vscode/.vscode-test/vscode-win32-x64-archive-1.141.0/Code.exe",
    "packages/vscode/.test-output/canvas-group-kinds.png",
    "release/meltemi-diagrams-1.8.0.vsix",
    "release/manifest.json",
    "mi-prueba/project.json",
    "propuesta-detallada-diagramas-como-codigo.pdf",
    "propuesta-detallada-diagramas-como-codigo.docx",
    "packages/cli/tsconfig.tsbuildinfo",
  ])("ignores %s", (path) => {
    expect(ignored(rules, path)).toBe(true);
  });

  it.each([
    "packages/cloud/.dev.vars.example",
    "packages/cloud/wrangler.jsonc",
    "packages/cloud/wrangler.publish.jsonc",
    "packages/vscode/package.json",
    "brand/meltemi-diagrams-glyph.svg",
    "corpus/valid/flow/basic.meltemi",
    "gallery/README.md",
    "examples/purchase/project.json",
    "docs/media/editing-demo.gif",
    "schemas/model.schema.json",
    "scripts/deploy-config.mjs",
    ".github/workflows/ci.yml",
  ])("keeps %s", (path) => {
    expect(ignored(rules, path)).toBe(false);
  });
});
