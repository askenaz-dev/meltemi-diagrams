import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { renderSvg } from "@meltemi/diagrams-render";
import {
  coverageOf,
  extensionOf,
  importText,
  IMPORT_EXTENSIONS,
  mergeImport,
  stemOf,
  type ImportResult,
  type SourceFormat,
} from "@meltemi/diagrams-import";

const root = fileURLToPath(new URL("../../../corpus/import/", import.meta.url));
const engine = createElkEngine();

function reader(dir: string) {
  return (path: string): string | undefined => {
    try {
      return readFileSync(join(dir, path), "utf8");
    } catch {
      return undefined;
    }
  };
}

/** The report as stored next to each input: stable, without absolute paths. */
function report(result: ImportResult): string {
  return (
    JSON.stringify(
      {
        status: result.status,
        format: result.format,
        diagrams: result.diagrams.map((d) => ({
          id: d.id,
          type: d.type,
          model: d.model,
          kind: d.source.kind,
          lines: [d.source.range.start.line, d.source.range.end.line],
        })),
        findings: result.findings.map(
          (f) =>
            `${f.range.start.line}:${f.range.start.column} ${f.severity} ${f.code} [${f.construct}${f.status ? ` ${f.status}` : ""}${f.essential ? " essential" : ""}] ${f.message}`,
        ),
        coverage: result.coverage.map((c) => ({
          diagram: c.diagram,
          mapped: c.mapped,
          approximated: c.approximated,
          dropped: c.dropped,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

/** Every flow, free and sequence diagram lays out with ELK and renders; C4 views too. */
function rendersAll(text: string): void {
  const compilation = compile(text);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  for (const diagram of compilation.document.diagrams) {
    const result = layoutDiagram(compilation, diagram, { engine });
    expect(result.scene, `${diagram.id} has no scene`).not.toBeNull();
    expect(renderSvg(result.scene!)).toContain("<svg");
  }
}

const IGNORED = new Set(["id", "import", "format", "self-check", "importer", "markdown.block"]);

/** Constructs a diagram reports must be documented in the coverage tables. */
function documented(result: ImportResult): string[] {
  const formatOf = new Map(result.diagrams.map((d) => [d.id, d.source.format] as const));
  const missing: string[] = [];
  const check = (construct: string, diagram: string | null) => {
    if (IGNORED.has(construct)) return;
    const format: SourceFormat | undefined = diagram !== null ? formatOf.get(diagram) : undefined;
    const found = format
      ? coverageOf(format, construct)
      : (coverageOf("mermaid", construct) ?? coverageOf("plantuml", construct));
    if (!found) missing.push(construct);
  };
  for (const finding of result.findings) check(finding.construct, finding.diagram);
  for (const coverage of result.coverage) {
    for (const c of coverage.constructs) check(c.construct, coverage.diagram);
  }
  return [...new Set(missing)];
}

for (const folder of ["mermaid", "plantuml", "markdown"]) {
  const dir = join(root, folder);
  const inputs = readdirSync(dir).filter(
    (name) => statSync(join(dir, name)).isFile() && IMPORT_EXTENSIONS.includes(extensionOf(name)),
  );
  describe(`corpus/import/${folder}`, () => {
    for (const name of inputs) {
      it(name, async () => {
        const text = readFileSync(join(dir, name), "utf8");
        const result = importText(text, { fileName: name, readFile: reader(dir) });
        await expect(report(result)).toMatchFileSnapshot(join(dir, `${stemOf(name)}.report.json`));
        if (result.text !== null) {
          await expect(result.text).toMatchFileSnapshot(join(dir, `${stemOf(name)}.meltemi`));
          rendersAll(result.text);
          // Deterministic: the same input gives the same bytes.
          expect(importText(text, { fileName: name, readFile: reader(dir) }).text).toBe(
            result.text,
          );
        }
        expect(documented(result)).toEqual([]);
      });
    }
  });
}

describe("corpus/import/merge", () => {
  const dir = join(root, "merge");
  for (const name of readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory())) {
    it(name, async () => {
      const caseDir = join(dir, name);
      const source = readdirSync(caseDir).find((n) => IMPORT_EXTENSIONS.includes(extensionOf(n)))!;
      const existing = readFileSync(join(caseDir, "existing.meltemi"), "utf8");
      const imported = importText(readFileSync(join(caseDir, source), "utf8"), {
        fileName: source,
        readFile: reader(caseDir),
      });
      expect(imported.text).not.toBeNull();
      const merged = mergeImport(existing, imported.text!);
      await expect(merged.text).toMatchFileSnapshot(join(caseDir, "merged.meltemi"));
      await expect(
        merged.findings
          .map(
            (f) =>
              `${f.range.start.line}:${f.range.start.column} ${f.severity} ${f.code} ${f.message}`,
          )
          .join("\n") + "\n",
      ).toMatchFileSnapshot(join(caseDir, "merged.findings.txt"));
      rendersAll(merged.text);
      // Merging again changes nothing.
      expect(mergeImport(merged.text, imported.text!).text).toBe(merged.text);
    });
  }
});
