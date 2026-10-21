import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

function flow(body: string) {
  const compilation = compile(`language "0.2"\ndiagram d: flow {\n${body}\n}\n`);
  return {
    compilation,
    diagram: compilation.document.diagrams[0]!,
    codes: compilation.diagnostics.map((d) => d.code),
  };
}

describe("annotations", () => {
  it("declares notes and tags", () => {
    const { diagram, codes } = flow(
      '  note limits "Límites a validar\\nOBO: 30 RPS"\n  tag pkce "PKCE"',
    );
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("limits")).toMatchObject({
      kind: "note",
      label: "Límites a validar\nOBO: 30 RPS",
    });
    expect(diagram.elementsById.get("pkce")).toMatchObject({ kind: "tag", label: "PKCE" });
  });

  it("lets annotations be relation endpoints", () => {
    const { codes } = flow('  tag t "T"\n  a -> t');
    expect(codes).toEqual([]);
  });
});

describe("shared styles", () => {
  it("applies one block to several targets", () => {
    const { diagram, codes } = flow(
      '  obo["OBO"]\n  ciba["CIBA"]\n  cimd["CIMD"]\n  style obo, ciba, cimd { line dashed; stroke "#6a4fd0" }',
    );
    expect(codes).toEqual([]);
    expect(diagram.styles.map((s) => s.target)).toEqual(["obo", "ciba", "cimd"]);
    for (const style of diagram.styles) {
      expect(style.properties).toEqual({ line: "dashed", stroke: "#6a4fd0" });
      expect(style.node).toBe(diagram.styles[0]!.node);
    }
    const columns = diagram.styles.map((s) => s.targetRange.start.column);
    expect(columns).toEqual([9, 14, 20]);
    expect(diagram.references.filter((r) => r.role === "style").map((r) => r.target)).toEqual([
      "obo",
      "ciba",
      "cimd",
    ]);
  });

  it("reports a property repeated for a target and keeps the others", () => {
    const { diagram, compilation } = flow(
      '  api["API"]\n  db[("DB")]\n  style api { fill "#fff" }\n  style api, db { fill "#000" }',
    );
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.duplicate");
    expect(d!.range.start.line).toBe(6);
    expect(d!.related?.[0]!.range.start.line).toBe(5);
    expect(diagram.styles.find((s) => s.target === "db")!.properties).toEqual({ fill: "#000" });
  });

  it("accepts `line` on relations and rejects other values", () => {
    const { diagram, codes } = flow("  a -> b as r\n  style r { line dashed }");
    expect(codes).toEqual([]);
    expect(diagram.styles[0]!.properties).toEqual({ line: "dashed" });
    expect(flow("  a -> b as r\n  style r { line dotted }").codes).toEqual([]);
    expect(flow("  a -> b as r\n  style r { line wavy }").codes).toEqual(["prop.invalid-value"]);
  });

  it("animates several targets", () => {
    const { diagram, codes } = flow(
      "  a -> b as r\n  b -> c as s\n  animate r, s { effect flow; duration 1s }",
    );
    expect(codes).toEqual([]);
    expect(diagram.animations.map((a) => [a.target, a.effect, a.durationMs])).toEqual([
      ["r", "flow", 1000],
      ["s", "flow", 1000],
    ]);
  });

  it("rejects a non-identifier target", () => {
    expect(flow('  a -> b\n  style "a" { fill "#fff" }').codes).toEqual(["prop.invalid-value"]);
  });
});
