import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { renderSvg } from "../src/index.js";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";

const measurer = createNodeFontLibrary();

/**
 * Real-world sheets under `examples/` render without diagnostics and their stored SVG stays in
 * sync with the source. The folder may be absent or empty in a public checkout. Projects (folders
 * with a `project.json`, such as the purchase example) compile with their imports and are checked
 * by the acceptance suite instead.
 */
const root = join(REPO_ROOT, "examples");

function archFiles(dir: string): string[] {
  if (!existsSync(dir) || existsSync(join(dir, "project.json"))) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...archFiles(path));
    else if (entry.endsWith(".meltemi")) found.push(path);
  }
  return found;
}

const files = archFiles(root);

describe("examples", () => {
  it
    .skipIf(files.length === 0)
    .each(files.map((f) => [relative(REPO_ROOT, f).split("\\").join("/"), f] as const))(
    "%s renders cleanly",
    async (_name, path) => {
      const compilation = compile(readFileSync(path, "utf8"));
      expect(compilation.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
      expect(compilation.document.diagrams).toHaveLength(1);
      const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer });
      expect(result.diagnostics).toEqual([]);
      const svg = renderSvg(result.scene!);
      await expect(svg).toMatchFileSnapshot(path.replace(/\.meltemi$/, ".svg"));
    },
  );
});
