import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { compile, toJson, type FlowDiagram } from "../src/index.js";

function compileBody(type: string, body: string) {
  const compilation = compile(`language "0.2"\ndiagram d: ${type} {\n${body}\n}\n`);
  const diagram = compilation.document.diagrams.find((d) => d.id === "d") as FlowDiagram;
  const found = compilation.diagnostics.map((d) => [
    d.code,
    d.message,
    d.hints?.[0] ?? "",
    compilation.text.slice(d.range.start.offset, d.range.end.offset),
  ]);
  return { compilation, diagram, found };
}

const entry = (diagram: FlowDiagram, target: string) =>
  Object.assign({}, ...diagram.styles.filter((s) => s.target === target).map((s) => s.properties));

describe("text properties in every profile", () => {
  afterEach(() => setLocale("en"));

  it("takes a font, a size and a weight on a flow node, and writes them to JSON", () => {
    const { compilation, diagram, found } = compileBody(
      "flow",
      '  api["API"]\n  style api { font "Roboto"; fontSize 16; fontWeight 500 }',
    );
    expect(found).toEqual([]);
    expect(entry(diagram, "api")).toEqual({ font: "Roboto", fontSize: 16, fontWeight: 500 });
    const json = toJson(compilation) as unknown as {
      diagrams: { styles: { target: string; properties: Record<string, unknown> }[] }[];
    };
    expect(json.diagrams[0]!.styles.find((s) => s.target === "api")!.properties).toEqual({
      font: "Roboto",
      fontSize: 16,
      fontWeight: 500,
    });
  });

  it("takes them on relations of a flow diagram", () => {
    const { diagram, found } = compileBody(
      "flow",
      '  api["API"]; db["DB"]\n  api -> db as request\n  style api { font "Open Sans"; fontSize 15 }\n  style request { fontWeight 600 }',
    );
    expect(found).toEqual([]);
    expect(entry(diagram, "api")).toEqual({ font: "Open Sans", fontSize: 15 });
    expect(entry(diagram, "request")).toEqual({ fontWeight: 600 });
  });

  it("takes a rule for every note of a sequence diagram, and a style of a named note", () => {
    const { diagram, found } = compileBody(
      "sequence",
      '  a -> b: "Pay"\n  note n1 over a "Retries"\n  rule note { fontSize 12; font "Caveat" }\n  style n1 { fontSize 14 }\n  style a { fontWeight 700 }',
    );
    expect(found).toEqual([]);
    expect(diagram.rules.find((r) => r.kind === "note")!.properties).toEqual({
      fontSize: 12,
      font: "Caveat",
    });
  });

  it("refuses them on an image, and a class ignores them there", () => {
    const { found } = compileBody(
      "free",
      '  image logo "logo.png" { class big }\n  box a "A" { class big }\n  class big { fontSize 24 }\n  style logo { font "Lora" }',
    );
    expect(found.map((f) => f.slice(0, 1).concat(f.slice(2)))).toEqual([
      [
        "prop.invalid-value",
        "`font`, `fontSize` and `fontWeight` apply to what draws text: boxes, nodes, groups, notes, tags, stickies, texts, participants, entities, relations and lines, not icons, images or pens.",
        "font",
      ],
    ]);
  });

  it("refuses them in a rule of icons", () => {
    const { found } = compileBody("free", '  icon i "tabler:server"\n  rule icon { fontSize 12 }');
    expect(found.map((f) => [f[0], f[3]])).toEqual([["prop.invalid-value", "fontSize"]]);
  });

  it("refuses values that do not fit", () => {
    const { found } = compileBody(
      "flow",
      '  a["A"]\n  style a { font ""; fontSize 200; fontWeight 650 }',
    );
    expect(found.map((f) => [f[0], f[3], f[1]])).toEqual([
      [
        "prop.invalid-value",
        '""',
        '`font` expects a non-empty quoted font stack such as "Roboto".',
      ],
      ["prop.invalid-value", "200", expect.stringContaining("6") as unknown as string],
      [
        "prop.invalid-value",
        "650",
        expect.stringContaining("400, 500, 600, 700") as unknown as string,
      ],
    ]);
  });

  it("keeps the alignment free-only", () => {
    const { diagram, found } = compileBody(
      "flow",
      '  api["API"]\n  style api { fontSize 15; textAlign left }',
    );
    expect(entry(diagram, "api")).toEqual({ fontSize: 15 });
    expect(found.map((f) => [f[0], f[3]])).toEqual([["prop.invalid-value", "textAlign"]]);
    expect(found[0]![2]).toContain("`textAlign` and `verticalAlign`");
  });

  it("says the refusals in Spanish", () => {
    setLocale("es");
    const { found } = compileBody(
      "free",
      '  image logo "logo.png"\n  style logo { fontWeight 700 }',
    );
    expect(found[0]![2]).toBe(
      "`font`, `fontSize` y `fontWeight` se aplican a lo que dibuja texto: cajas, nodos, grupos, notas, etiquetas, notas adhesivas, textos, participantes, entidades, relaciones y líneas, no a iconos, imágenes ni trazos de lápiz.",
    );
  });
});
