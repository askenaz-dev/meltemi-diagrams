import { describe, expect, it } from "vitest";
import { BUILT_IN_CLASSES, BUILT_IN_THEMES, compile, toJson } from "../src/index.js";

const diagram = (body: string, before = "") => `${before}diagram d: flow {\n${body}\n}\n`;

function compiled(text: string) {
  const compilation = compile(text);
  return {
    compilation,
    diagram: compilation.document.diagrams[0]!,
    theme: compilation.document.themes[0],
    codes: compilation.diagnostics.map((d) => d.code),
    diagnostics: compilation.diagnostics,
  };
}

describe("theme tokens", () => {
  it("reads type, spacing and arrowhead tokens as numbers and words", () => {
    const { theme, codes } = compiled("theme t { labelSize 15; padding 20px; arrowhead open }\n");
    expect(codes).toEqual([]);
    expect(theme!.tokens).toEqual({ labelSize: 15, padding: 20, arrowhead: "open" });
  });

  it("names the range of a number out of range", () => {
    const { diagnostics } = compiled("theme t { labelSize 80 }\n");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(diagnostics[0]!.message).toContain("from 6 to 48");
    expect(diagnostics[0]!.range.start.column).toBe(21);
  });

  it("rejects quoted numbers and weights that are not bundled", () => {
    const { diagnostics } = compiled('theme t { radius "8"; labelWeight 650 }\n');
    expect(diagnostics.map((d) => d.message)).toEqual([
      "`radius` expects a number from 0 to 64.",
      "`labelWeight` expects one of 400, 500, 600, 700.",
    ]);
  });

  it("accepts the semantic colour tokens", () => {
    const { theme, codes } = compiled(
      'theme t { success "#0a0"; warning "#fa0"; danger "#f00"; info "#00f" }\n',
    );
    expect(codes).toEqual([]);
    expect(Object.keys(theme!.tokens)).toEqual(["success", "warning", "danger", "info"]);
  });

  it("lists six built-in themes", () => {
    expect(BUILT_IN_THEMES).toEqual([
      "technical.light",
      "technical.dark",
      "editorial.light",
      "editorial.dark",
      "stage.light",
      "stage.dark",
    ]);
  });
});

describe("class declarations", () => {
  it("declares a class in a diagram with numbers and token colours", () => {
    const { diagram: d, codes } = compiled(diagram("  class critical { stroke danger; width 2 }"));
    expect(codes).toEqual([]);
    expect(d.classes.map((c) => [c.id, c.properties])).toEqual([
      ["critical", { stroke: "@danger", width: 2 }],
    ]);
  });

  it("declares classes and rules in a theme", () => {
    const { theme, codes } = compiled(
      "theme t {\n  class proposed { line dashed; stroke warning }\n  rule data { pattern dots }\n}\n",
    );
    expect(codes).toEqual([]);
    expect(theme!.classes.map((c) => c.id)).toEqual(["proposed"]);
    expect(theme!.rules.map((r) => [r.kind, r.properties])).toEqual([
      ["data", { pattern: "dots" }],
    ]);
    expect(theme!.tokens).toEqual({});
  });

  it("refuses classes that apply other classes", () => {
    const { diagnostics } = compiled(diagram("  class a { class b }"));
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(diagnostics[0]!.hints?.[0]).toContain("cannot apply other classes");
  });

  it("reports a class declared twice", () => {
    const { diagnostics } = compiled(
      diagram('  class hot { fill "#fee" }\n  class hot { fill "#fee" }'),
    );
    expect(diagnostics.map((d) => [d.code, d.range.start.line])).toEqual([["ref.duplicate-id", 3]]);
    expect(diagnostics[0]!.related?.[0]!.range.start.line).toBe(2);
  });

  it("keeps classes apart from element ids", () => {
    const { codes } = compiled(diagram('  class api { fill "#fff" }\n  api["API"] { class api }'));
    expect(codes).toEqual([]);
  });

  it("refuses class declarations inside groups and classes without a block", () => {
    const { codes } = compiled(
      diagram('  group g "G" {\n    class inner { fill "#fff" }\n    a["A"]\n  }\n  class lonely'),
    );
    expect(codes).toEqual(["prop.unknown", "prop.invalid-value"]);
  });
});

describe("applying classes", () => {
  it("records classes of elements, relations, groups and style statements", () => {
    const { diagram: d, codes } = compiled(
      diagram(
        [
          '  group edge "Edge" { class external; api["API"] { class critical, proposed } }',
          "  api -> db as save { class proposed }",
          "  style api, db { class highlight }",
        ].join("\n"),
      ),
    );
    expect(codes).toEqual([]);
    const names = (list: readonly { name: string }[]) => list.map((c) => c.name);
    expect(names(d.elementsById.get("edge")!.classes)).toEqual(["external"]);
    expect(names(d.elementsById.get("api")!.classes)).toEqual(["critical", "proposed"]);
    expect(names(d.relationsByKey.get("save")!.classes)).toEqual(["proposed"]);
    expect(d.styles.map((s) => [s.target, names(s.classes)])).toEqual([
      ["api", ["highlight"]],
      ["db", ["highlight"]],
    ]);
    expect(d.elementsById.get("api")!.classes[0]!.range.start.column).toBe(58);
  });

  it("reports a class applied twice to a target by style statements", () => {
    const { diagnostics } = compiled(
      diagram("  a -> b\n  style a { class x }\n  style a { class y }"),
    );
    expect(diagnostics.map((d) => [d.code, d.range.start.line])).toEqual([["prop.duplicate", 4]]);
  });

  it("rejects class names that are not identifiers", () => {
    const { codes } = compiled(diagram('  api["API"] { class "hot" }'));
    expect(codes).toEqual(["prop.invalid-value"]);
  });

  it("provides the built-in classes", () => {
    expect(Object.keys(BUILT_IN_CLASSES)).toEqual([
      "highlight",
      "critical",
      "proposed",
      "deprecated",
      "external",
      "c4_person",
      "c4_system",
      "c4_container",
      "c4_component",
      "c4_external",
      "c4_boundary",
    ]);
  });
});

describe("rules", () => {
  it("reads a rule per kind", () => {
    const { diagram: d, codes } = compiled(
      diagram("  rule data { pattern dots }\n  rule relation { arrowhead open; width 2 }"),
    );
    expect(codes).toEqual([]);
    expect(d.rules.map((r) => [r.kind, r.properties])).toEqual([
      ["data", { pattern: "dots" }],
      ["relation", { arrowhead: "open", width: 2 }],
    ]);
  });

  it("lists the kinds for an unknown kind", () => {
    const { diagnostics } = compiled(diagram('  rule service { fill "#fff" }'));
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(diagnostics[0]!.message).toContain("node, decision, data, group, note, tag, relation");
  });

  it("reports a property set twice for the same kind", () => {
    const { diagnostics, diagram: d } = compiled(
      diagram('  rule node { fill "#111" }\n  rule node { fill "#222"; stroke "#222" }'),
    );
    expect(diagnostics.map((x) => [x.code, x.range.start.line])).toEqual([["prop.duplicate", 3]]);
    expect(d.rules[1]!.properties).toEqual({ stroke: "#222" });
  });

  it("refuses properties that do not apply to the kind", () => {
    const { diagnostics } = compiled(
      diagram(
        "  rule relation { pattern dots }\n  rule node { arrowhead none }\n  rule tag { class x }",
      ),
    );
    expect(diagnostics.map((d) => d.code)).toEqual([
      "prop.invalid-value",
      "prop.invalid-value",
      "prop.unknown",
    ]);
  });
});

describe("style properties", () => {
  it("stores token colours, numbers and patterns", () => {
    const { diagram: d, codes } = compiled(
      diagram('  db[("DB")]\n  style db { fill danger; width 2; pattern hatch; class critical }'),
    );
    expect(codes).toEqual([]);
    expect(d.styles[0]!.properties).toEqual({ fill: "@danger", width: 2, pattern: "hatch" });
    expect(d.styles[0]!.classes.map((c) => c.name)).toEqual(["critical"]);
  });

  it("explains a colour word that is not a token", () => {
    const { diagnostics } = compiled(diagram("  a -> b\n  style a { fill red }"));
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(diagnostics[0]!.message).toBe("`red` is not a color token.");
    expect(diagnostics[0]!.hints).toContain('Write `fill "red"` for a CSS color.');
    expect(diagnostics[0]!.hints![0]).toContain("danger");
  });

  it("names the range of an outline width", () => {
    const { diagnostics } = compiled(diagram("  a -> b\n  style a { width 40 }"));
    expect(diagnostics[0]!.message).toBe("`width` expects a number from 0 to 16.");
  });

  it("refuses patterns on relations and arrowheads on elements", () => {
    const { diagnostics, diagram: d } = compiled(
      diagram("  a -> b as request\n  style a, request { pattern dots; arrowhead open }"),
    );
    expect(diagnostics.map((x) => [x.code, x.message])).toEqual([
      ["prop.invalid-value", "`pattern` does not apply to relations such as `request`."],
      ["prop.invalid-value", "`arrowhead` does not apply to elements such as `a`."],
    ]);
    expect(d.styles.map((s) => [s.target, s.properties])).toEqual([
      ["a", { pattern: "dots" }],
      ["request", { arrowhead: "open" }],
    ]);
  });
});

describe("presets and canvas", () => {
  it("records a preset", () => {
    const { diagram: d, codes } = compiled(diagram("  preset slide"));
    expect(codes).toEqual([]);
    expect([d.properties.preset, d.properties.canvas]).toEqual(["slide", null]);
  });

  it("records a fixed canvas", () => {
    const { diagram: d, codes } = compiled(diagram("  canvas (1280, 720px)"));
    expect(codes).toEqual([]);
    expect(d.properties.canvas).toEqual({ width: 1280, height: 720 });
  });

  it("refuses a preset and a canvas together", () => {
    const { diagnostics } = compiled(diagram("  preset slide\n  canvas (800, 600)"));
    expect(diagnostics.map((d) => [d.code, d.range.start.line])).toEqual([
      ["prop.invalid-value", 3],
    ]);
  });

  it("lists the presets and checks canvas sizes", () => {
    const { diagnostics } = compiled(diagram("  preset poster"));
    expect(diagnostics[0]!.message).toContain("document, slide");
    const small = compiled(diagram("  canvas (50, 600)"));
    expect(small.diagnostics[0]!.message).toBe(
      "`canvas` expects `(width, height)` with numbers from 100 to 10000.",
    );
  });
});

describe("JSON", () => {
  it("emits classes, rules, presets and applied classes", () => {
    const json = toJson(
      compile(
        diagram(
          '  preset document\n  class hot { fill danger }\n  rule data { pattern dots }\n  api["API"] { class hot }',
          "theme t { labelSize 14; class quiet { color muted } }\n\n",
        ),
      ),
    );
    const d = json.diagrams[0]!;
    expect(d.properties.preset).toBe("document");
    expect(d.properties.canvas).toBeNull();
    expect(d.classes.map((c) => [c.id, c.properties])).toEqual([["hot", { fill: "@danger" }]]);
    expect(d.rules.map((r) => [r.kind, r.properties])).toEqual([["data", { pattern: "dots" }]]);
    expect(d.elements[0]!.classes).toEqual(["hot"]);
    expect(json.themes[0]!.tokens).toEqual({ labelSize: 14 });
    expect(json.themes[0]!.classes.map((c) => c.id)).toEqual(["quiet"]);
  });
});

describe("duration tokens", () => {
  it("reads effect durations as milliseconds and refuses times out of range", () => {
    const { theme, diagnostics } = compiled(
      "theme t { flowDuration 800ms; dashDuration 1.5s; pulseDuration 20ms }\n",
    );
    expect(theme!.tokens).toEqual({ flowDuration: 800, dashDuration: 1500 });
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        "prop.invalid-value",
        "`pulseDuration` expects a time from 100 ms to 60 s, such as `1200ms`.",
      ],
    ]);
  });

  it("asks for a unit, as animate does", () => {
    const { diagnostics } = compiled("theme t { flowDuration 800 }\n");
    expect(diagnostics.map((d) => d.message)).toEqual(["`flowDuration` needs a time unit."]);
  });
});

describe("icons", () => {
  it("reads the icon tokens and refuses other positions", () => {
    const { theme, diagnostics } = compiled(
      "theme t { iconSize 20; iconPosition right }\ntheme u { iconPosition middle }\n",
    );
    expect(theme!.tokens).toEqual({ iconSize: 20, iconPosition: "right" });
    expect(diagnostics.map((d) => d.message)).toEqual([
      "Invalid value `middle` for `iconPosition`; expected one of left, right, top, bottom, center.",
    ]);
  });

  it("reads the five icon positions, the label positions and icon sizes", () => {
    const { diagram: d, codes } = compiled(
      diagram(
        [
          "  a -> b",
          "  c -> d",
          '  style a { icon "tabler:server"; iconPosition right; iconSize 32 }',
          "  style b { iconPosition bottom; iconSize 24px }",
          "  style c { iconPosition center; labelPosition top; iconSize auto }",
          "  style d { iconPosition left; labelPosition right }",
          "  rule data { iconSize 48; labelPosition left }",
        ].join("\n"),
      ),
    );
    expect(codes).toEqual([]);
    expect(d.styles.map((s) => [s.target, s.properties])).toEqual([
      ["a", { icon: "tabler:server", iconPosition: "right", iconSize: 32 }],
      ["b", { iconPosition: "bottom", iconSize: 24 }],
      ["c", { iconPosition: "center", labelPosition: "top", iconSize: "auto" }],
      ["d", { iconPosition: "left", labelPosition: "right" }],
    ]);
    expect(d.rules[0]!.properties).toEqual({ iconSize: 48, labelPosition: "left" });
  });

  it("refuses an icon size out of range or with another word, naming 8 to 128", () => {
    const { diagnostics } = compiled(
      diagram(
        "  a -> b\n  style a { iconSize 200 }\n  style b { iconSize big; labelPosition center }",
      ),
    );
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["prop.invalid-value", "`iconSize` expects `auto` or a number from 8 to 128."],
      ["prop.invalid-value", "`iconSize` expects `auto` or a number from 8 to 128."],
      [
        "prop.invalid-value",
        "Invalid value `center` for `labelPosition`; expected one of top, bottom, left, right.",
      ],
    ]);
    // The diagnostic covers the value written.
    expect(diagnostics[0]!.range.start.column).toBe(22);
    expect(diagnostics[0]!.range.end.column).toBe(25);
  });

  it("refuses the label position and the icon size on relations", () => {
    const { diagnostics } = compiled(
      diagram(
        "  a -> b as r\n  style r { iconSize 24; labelPosition top }\n  rule relation { iconSize auto }",
      ),
    );
    expect(diagnostics.map((d) => [d.code, d.hints?.[0]])).toEqual([
      ["prop.invalid-value", "`iconSize` applies to elements."],
      ["prop.invalid-value", "`labelPosition` applies to elements."],
      ["prop.invalid-value", "`iconSize` applies to elements."],
    ]);
  });

  it("records icon values with the range of the string", () => {
    const {
      diagram: d,
      theme,
      codes,
    } = compiled(
      diagram(
        '  class db { icon "tabler:database" }\n  rule node { icon "tabler:box"; iconColor accent }\n  a -> b\n  style a, b { icon "tabler:server"; iconPosition top }',
        'theme t { class x { icon "brand:logo" } }\n\n',
      ),
    );
    expect(codes).toEqual([]);
    expect(d.icons.map((i) => [i.reference, i.range.start.line, i.range.start.column])).toEqual([
      ["tabler:database", 4, 19],
      ["tabler:box", 5, 20],
      ["tabler:server", 7, 21],
    ]);
    expect(theme!.icons.map((i) => i.reference)).toEqual(["brand:logo"]);
    expect(d.rules[0]!.properties).toEqual({ icon: "tabler:box", iconColor: "@accent" });
  });

  it("refuses an icon position on relations", () => {
    const { diagnostics } = compiled(
      diagram(
        "  a -> b as r\n  style r { iconPosition top }\n  rule relation { iconPosition left }",
      ),
    );
    expect(diagnostics.map((d) => [d.code, d.hints?.[0]])).toEqual([
      ["prop.invalid-value", "`iconPosition` applies to elements."],
      ["prop.invalid-value", "`iconPosition` applies to elements."],
    ]);
  });
});
