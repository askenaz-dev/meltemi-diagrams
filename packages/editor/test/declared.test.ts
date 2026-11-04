import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planEdit } from "@meltemi/diagrams-edit";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile, readDiagramType } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { analyzeDocument, completions, hover } from "../src/index.js";

const manifest = JSON.parse(
  readFileSync(
    join(CORPUS_ROOT, "projects", "valid", "plugins", "plugins", "erd", "meltemi-plugin.json"),
    "utf8",
  ),
);
const types = manifest.diagramTypes.map(
  (t: unknown) => readDiagramType(t, { name: "erd", version: "1.0.0" }).definition!,
);
const TEXT = `diagram s: erd {
  entity customer "Customer" { owner "Sales" }
  view open "Open"
  customer -> customer: "x" { cardinality one_to_many }
}
`;

function analysis(text: string) {
  return analyzeDocument({ text, compilation: compile(text, { types }) });
}

describe("declared types in the editor", () => {
  it("complete kinds, their properties and the values of enumerations", () => {
    const body = TEXT.indexOf("  view");
    const kinds = completions(analysis(TEXT), body + 2).map((c) => c.label);
    expect(kinds).toEqual(expect.arrayContaining(["entity", "view", "box", "group"]));
    const block = TEXT.indexOf('owner "Sales"');
    const properties = completions(analysis(TEXT), block).map((c) => c.label);
    expect(properties).toEqual(
      expect.arrayContaining(["owner", "rows", "archived", "description"]),
    );
    const value = TEXT.indexOf("one_to_many");
    const values = completions(analysis(TEXT), value).map((c) => c.label);
    expect(values).toEqual(["one_to_one", "one_to_many", "many_to_many"]);
  });

  it("describe a kind on hover, with its plugin", () => {
    const at = TEXT.indexOf("entity customer") + 2;
    const result = hover(analysis(TEXT), at)!;
    expect(result.markdown).toContain("**entity** — Entity: A table");
    expect(result.markdown).toContain("from the plugin `erd` 1.0.0");
    expect(result.markdown).toContain("- `owner` string (required)");
  });

  it("create an element of a declared kind from the palette", () => {
    const compilation = compile(TEXT, { types });
    const result = planEdit(compilation, {
      kind: "createElement",
      diagram: "s",
      elementKind: "view" as never,
      id: "recent",
    });
    expect(result.ok).toBe(true);
    const text = result.ok ? applyTextEdits(TEXT, result.plan.edits) : "";
    expect(text).toContain('view recent "View"');
  });
});
