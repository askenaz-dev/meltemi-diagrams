import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { compile, toJson, type FlowDiagram } from "../src/index.js";

function compileText(text: string, id = "d") {
  const compilation = compile(text);
  const diagram = compilation.document.diagrams.find((d) => d.id === id) as FlowDiagram;
  const found = compilation.diagnostics.map((d) => [
    d.code,
    d.message,
    d.hints?.[0] ?? "",
    compilation.text.slice(d.range.start.offset, d.range.end.offset),
  ]);
  return { compilation, diagram, found };
}

const compileBody = (type: string, body: string) =>
  compileText(`language "0.2"\ndiagram d: ${type} {\n${body}\n}\n`);

const entry = (diagram: FlowDiagram, target: string) =>
  Object.assign({}, ...diagram.styles.filter((s) => s.target === target).map((s) => s.properties));

const NOTES_HINT = "`textFormat` applies to notes";

describe("the textFormat property", () => {
  afterEach(() => setLocale("en"));

  it("is taken by notes of free compositions and flow diagrams, and written to JSON", () => {
    for (const type of ["free", "flow"]) {
      const { compilation, diagram, found } = compileBody(
        type,
        '  note snippet "if (a) {\\n  return;\\n}"\n  style snippet { textFormat code }',
      );
      expect(found, type).toEqual([]);
      expect(entry(diagram, "snippet")).toEqual({ textFormat: "code" });
      const json = toJson(compilation) as unknown as {
        diagrams: { styles: { target: string; properties: Record<string, unknown> }[] }[];
      };
      expect(json.diagrams[0]!.styles.find((s) => s.target === "snippet")!.properties).toEqual({
        textFormat: "code",
      });
    }
  });

  it("is taken by a class and by a rule of notes", () => {
    const { diagram, found } = compileBody(
      "free",
      '  note a "a"\n  note b "b" { class snippet }\n  class snippet { textFormat code; fontSize 12 }\n  rule note { textFormat plain }',
    );
    expect(found).toEqual([]);
    expect(diagram.classes.find((c) => c.id === "snippet")!.properties).toEqual({
      textFormat: "code",
      fontSize: 12,
    });
    expect(diagram.rules.find((r) => r.kind === "note")!.properties).toEqual({
      textFormat: "plain",
    });
  });

  it("is taken by a named note of a sequence diagram and by its rule", () => {
    const { diagram, found } = compileBody(
      "sequence",
      '  api -> db: "Query"\n  note n over api "retry:\\n  3 times"\n  style n { textFormat code }\n  rule note { textFormat code }',
    );
    expect(found).toEqual([]);
    expect(entry(diagram, "n")).toEqual({ textFormat: "code" });
  });

  it("is taken by the note of a C4 view", () => {
    const { diagram, found } = compileText(
      'language "0.2"\nmodel m {\n  system shop "Shop" {\n    container api "API"\n  }\n}\ndiagram v: c4 using m {\n  level container\n  scope shop\n  note cache "ttl = 300" on shop.api\n  style cache { textFormat code }\n}\n',
      "v",
    );
    expect(found).toEqual([]);
    expect(entry(diagram, "cache")).toEqual({ textFormat: "code" });
  });

  it("is refused on a box, with the hint that it applies to notes", () => {
    const { diagram, found } = compileBody(
      "free",
      '  box api "API"\n  style api { textFormat code; fill "#eef" }',
    );
    expect(found.map((f) => [f[0], f[3]])).toEqual([["prop.invalid-value", "textFormat"]]);
    expect(found[0]![2]).toContain(NOTES_HINT);
    expect(entry(diagram, "api")).not.toHaveProperty("textFormat");
  });

  it("is refused on a relation and on a sticky", () => {
    const { found } = compileBody(
      "free",
      '  box a "A"\n  box b "B"\n  a -> b as r\n  sticky s "Todo"\n  style r { textFormat code }\n  style s { textFormat code }',
    );
    expect(found.map((f) => [f[0], f[3]])).toEqual([
      ["prop.invalid-value", "textFormat"],
      ["prop.invalid-value", "textFormat"],
    ]);
    expect(found[0]![2]).toContain(NOTES_HINT);
  });

  it("is refused by a rule of another kind", () => {
    const { diagram, found } = compileBody("free", '  box a "A"\n  rule box { textFormat code }');
    expect(found.map((f) => [f[0], f[3]])).toEqual([["prop.invalid-value", "textFormat"]]);
    expect(found[0]![2]).toContain(NOTES_HINT);
    expect(diagram.rules.find((r) => r.kind === "box")?.properties ?? {}).not.toHaveProperty(
      "textFormat",
    );
  });

  it("is refused on a fragment of a sequence diagram", () => {
    const { found } = compileBody(
      "sequence",
      '  alt f "ok" {\n    a -> b: "Pay"\n  }\n  style f { textFormat code }',
    );
    expect(found.map((f) => [f[0], f[3]])).toEqual([["prop.invalid-value", "textFormat"]]);
  });

  it("is refused on a task of a gantt chart", () => {
    const { found } = compileBody(
      "gantt",
      '  task a "Build" from 2026-11-02 for 3d\n  style a { textFormat code }',
    );
    expect(found.map((f) => [f[0], f[3]])).toEqual([["prop.invalid-value", "textFormat"]]);
    expect(found[0]![2]).toContain(NOTES_HINT);
  });

  it("is ignored without a diagnostic when a class carries it to a box", () => {
    const { found } = compileBody(
      "free",
      '  box a "A" { class snippet }\n  class snippet { textFormat code; fill "#eef" }',
    );
    expect(found).toEqual([]);
  });

  it("refuses a value that is not plain or code", () => {
    const { found } = compileBody("free", '  note n "x"\n  style n { textFormat markdown }');
    expect(found.map((f) => [f[0], f[3]])).toEqual([["prop.invalid-value", "markdown"]]);
    expect(found[0]![1]).toContain("plain, code");
  });

  it("says the refusal in Spanish", () => {
    setLocale("es");
    const { found } = compileBody("free", '  box api "API"\n  style api { textFormat code }');
    expect(found[0]![2]).toContain("`textFormat` se aplica a las notas");
  });

  it("keeps the note's label as written", () => {
    const { diagram } = compileBody(
      "free",
      '  note n "if (a) {\\n\\treturn;\\n}"\n  style n { textFormat code }',
    );
    expect(diagram.elementsById.get("n")!.label).toBe("if (a) {\n\treturn;\n}");
  });
});

describe("the code tokens", () => {
  it("are colour tokens of theme blocks, in the model JSON", () => {
    const { compilation, found } = compileText(
      'language "0.2"\ntheme docs { extends "technical.light"; code "#fff7ed"; codeText "#111111" }\ndiagram d: free {\n  theme "docs"\n  note n "x"\n}\n',
    );
    expect(found).toEqual([]);
    const json = toJson(compilation) as unknown as {
      themes: { id: string; tokens: Record<string, unknown> }[];
    };
    expect(json.themes.find((t) => t.id === "docs")!.tokens).toMatchObject({
      code: "#fff7ed",
      codeText: "#111111",
    });
  });

  it("refuse a value that is not a colour", () => {
    const { found } = compileText(
      'language "0.2"\ntheme docs { extends "technical.light"; codeText 12 }\n',
    );
    expect(found.map((f) => [f[0], f[3]])).toEqual([["prop.invalid-value", "12"]]);
  });

  it("are listed among the tokens of the unknown-token hint", () => {
    const { found } = compileText('language "0.2"\ntheme docs { codez "#fff" }\n');
    expect(found[0]![0]).toBe("prop.unknown");
    expect(found.flat().join(" ")).toContain("codeText");
  });
});
