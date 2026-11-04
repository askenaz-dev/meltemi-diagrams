import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import {
  C4_PROFILE,
  ELEMENT_ONLY_PROPERTIES,
  FLOW_PROFILE,
  FREE_PROFILE,
  SEQUENCE_PROFILE,
  STYLE_PROPERTIES,
  compile,
  profileTakesRotation,
  takesRotation,
  type FlowDiagram,
} from "../src/index.js";

const diagram = (type: string, body: string) =>
  `language "0.2"\ndiagram d: ${type} {\n${body}\n}\n`;

function compiled(text: string) {
  const compilation = compile(text);
  const at = (d: { range: { start: { offset: number }; end: { offset: number } } }) =>
    compilation.text.slice(d.range.start.offset, d.range.end.offset);
  return {
    diagram: compilation.document.diagrams[0] as FlowDiagram,
    codes: compilation.diagnostics.map((d) => d.code),
    found: compilation.diagnostics.map((d) => [d.code, at(d), d.message]),
  };
}

const flow = (body: string) => compiled(diagram("flow", body));
const free = (body: string) => compiled(diagram("free", body));
const stylesOf = (d: FlowDiagram) => d.styles.map((s) => [s.target, s.properties]);

describe("rotation", () => {
  afterEach(() => setLocale("en"));

  it("is an element style property from 0 to 360", () => {
    expect(STYLE_PROPERTIES.rotation).toEqual({ kind: "number", min: 0, max: 360 });
    expect(ELEMENT_ONLY_PROPERTIES).toContain("rotation");
    expect(takesRotation("node")).toBe(true);
    expect(takesRotation("group")).toBe(false);
    expect(
      [FLOW_PROFILE, FREE_PROFILE, SEQUENCE_PROFILE, C4_PROFILE].map(profileTakesRotation),
    ).toEqual([true, true, false, false]);
  });

  it("turns every kind of element of a flow diagram but groups", () => {
    const { codes, diagram: d } = flow(
      '  api["API"]\n  decision ok "OK?"\n  data db "DB"\n  note memo "Memo"\n  tag t "T"\n  style api, ok, db, memo, t { rotation 30 }',
    );
    expect(codes).toEqual([]);
    expect(stylesOf(d).map(([, p]) => p)).toEqual(Array(5).fill({ rotation: 30 }));
  });

  it("turns free boxes, texts, icons and images, from a rule too", () => {
    const { codes, diagram: d } = free(
      '  box a "A"\n  text heading "Title"\n  icon i "tabler:server"\n  rule text { rotation 90 }\n  style a, i { rotation 12.5 }',
    );
    expect(codes).toEqual([]);
    expect(stylesOf(d)).toEqual([
      ["a", { rotation: 12.5 }],
      ["i", { rotation: 12.5 }],
    ]);
    expect(d.rules.map((r) => r.properties)).toEqual([{ rotation: 90 }]);
  });

  it("refuses a group in a block it shares with a node, which keeps its rotation", () => {
    const { found, diagram: d } = free(
      '  group g "G" {\n    box a "A"\n  }\n  style g, a { rotation 45; fill "#fff" }',
    );
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "rotation",
        "`rotation` does not turn `group` elements such as `g`; it turns the other elements of flow diagrams and free compositions.",
      ],
    ]);
    expect(stylesOf(d)).toEqual([
      ["g", { fill: "#fff" }],
      ["a", { rotation: 45, fill: "#fff" }],
    ]);
  });

  it("refuses a rule of groups and a relation", () => {
    const { found } = flow(
      "  a -> b as r\n  rule group { rotation 10 }\n  style r { rotation 10 }",
    );
    expect(found.map(([code, text]) => [code, text])).toEqual([
      ["prop.invalid-value", "rotation"],
      ["prop.invalid-value", "rotation"],
    ]);
    expect(found[0]![2]).toBe(
      "`rotation` does not turn `group` elements; it turns the other elements of flow diagrams and free compositions.",
    );
  });

  it("refuses rotation in sequence diagrams", () => {
    const { found } = compiled(
      diagram(
        "sequence",
        '  participant web\n  participant api\n  web -> api: "Pay"\n  style web { rotation 10 }',
      ),
    );
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "rotation",
        "`rotation` turns the elements of flow diagrams and free compositions; sequence diagrams draw theirs upright.",
      ],
    ]);
  });

  it("refuses an angle out of range", () => {
    const { found } = flow('  api["API"]\n  style api { rotation 400 }');
    expect(found).toHaveLength(1);
    expect(found[0]![0]).toBe("prop.invalid-value");
    expect(found[0]![1]).toBe("400");
    expect(found[0]![2]).toMatch(/0.*360/);
  });

  it("explains its refusals in Spanish", () => {
    setLocale("es");
    const { found } = free('  group g "G" {\n    box a "A"\n  }\n  style g { rotation 45 }');
    expect(found[0]![2]).toBe(
      "`rotation` no gira los elementos `group` como `g`; gira los demás elementos de los diagramas de flujo y las composiciones libres.",
    );
  });
});
