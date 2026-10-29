import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { compile, toJson, type FlowDiagram } from "../src/index.js";

function free(body: string, extra = "") {
  const compilation = compile(`language "0.2"\n${extra}diagram d: free {\n${body}\n}\n`);
  const diagram = compilation.document.diagrams.find((d) => d.id === "d") as FlowDiagram;
  return { compilation, diagram, codes: compilation.diagnostics.map((d) => d.code) };
}

function flow(body: string) {
  const compilation = compile(`language "0.2"\ndiagram d: flow {\n${body}\n}\n`);
  return { compilation, codes: compilation.diagnostics.map((d) => d.code) };
}

const overview = readFileSync(join(CORPUS_ROOT, "valid", "free", "overview.meltemi"), "utf8");

describe("free diagrams compile", () => {
  it("compiles the proposal's example", () => {
    const compilation = compile(overview);
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    expect(diagram.type).toBe("free");
    expect(diagram.properties.layout).toBe("manual");
    expect(diagram.elements.map((e) => [e.id, e.kind, e.label])).toEqual([
      ["heading", "text", "Arquitectura de eventos"],
      ["api", "box", "API"],
      ["events", "box", "Event bus"],
    ]);
    expect(diagram.relations.map((r) => r.key)).toEqual(["publish"]);
    expect(diagram.animations).toHaveLength(1);
  });

  it("defaults to a manual layout and the main layer", () => {
    const { diagram } = free('  box a "A"');
    expect(diagram.properties.layout).toBe("manual");
    expect(diagram.properties.layers).toEqual(["main"]);
  });

  it("reads the shorthand as boxes, the data form with a cylinder", () => {
    const { diagram, codes } = free('  a["A"]\n  db[("Orders")]\n  a -> c');
    expect(codes).toEqual([]);
    expect(diagram.elements.map((e) => [e.id, e.kind, e.shape, e.implicit])).toEqual([
      ["a", "box", null, false],
      ["db", "box", "cylinder", false],
      ["c", "box", null, true],
    ]);
  });

  it("refuses flow kinds with the free kinds in the hint, lines, notes, pens and stickies among them", () => {
    const { compilation } = free('  decision ok "OK?"');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.unknown");
    expect(d!.hints).toEqual([
      "Free diagrams declare `box`, `text`, `icon`, `image`, `note`, `sticky`, `line`, `pen` and `group`.",
    ]);
    expect(d!.data?.candidates).toEqual(expect.arrayContaining(["line", "note", "pen", "sticky"]));
  });

  it("lists the free declarations, pens and stickies among them, in the hint of an unknown statement", () => {
    const { compilation } = free("  shade a");
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.unknown");
    expect(d!.hints).toEqual([
      "Free diagrams accept `box`, `text`, `icon`, `image`, `note`, `sticky`, `line`, `pen` and `group` declarations, relations, `direction`, `layout`, `theme`, `title`, `description`, `preset`, `canvas`, `routing`, `layers`, `placement`, `style`, `animate`, `class` and `rule`.",
    ]);
    expect(d!.data?.candidates).toContain("pen");
    expect(d!.data?.candidates).toContain("sticky");
  });

  it("refuses free kinds in flow diagrams", () => {
    const { compilation } = flow('  box a "A"');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.unknown");
    expect(d!.hints![0]).toContain("`box` belongs to free diagrams");
  });

  it("accepts groups with free objects, relations and blocks", () => {
    const { diagram, codes } = free(
      '  group g "G" {\n    description "Inside"\n    box a "A" { description "Box" }\n    text t "Note"\n    a -> t\n  }',
    );
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("a")).toMatchObject({ groupPath: ["g"], description: "Box" });
    expect(diagram.elementsById.get("g")).toMatchObject({ kind: "group", description: "Inside" });
    expect(diagram.relations[0]!.groupPath).toEqual(["g"]);
  });
});

describe("headless relations", () => {
  it("takes the line tokens: a dashed line has no heads", () => {
    const { diagram, codes } = free('  a["A"]\n  b["B"]\n  a --- b\n  a -- b as plain');
    expect(codes).toEqual([]);
    expect(diagram.relations.map((r) => [r.key, r.line, r.heads, r.twoWay])).toEqual([
      ["a->b#1", "dashed", "none", false],
      ["plain", "solid", "none", false],
    ]);
  });
});

describe("free lines", () => {
  it("reads a line with bends, a label and its styles", () => {
    const { diagram, codes } = free(
      '  line divider "Phase 2" from (40, 200) to (520, 200) via [(280, 180)]\n  style divider { line dashed; arrowhead triangle }',
    );
    expect(codes).toEqual([]);
    const line = diagram.elementsById.get("divider")!;
    expect(line).toMatchObject({ kind: "line", label: "Phase 2", labelWritten: true });
    expect(line.line).toEqual({
      from: { x: 40, y: 200 },
      to: { x: 520, y: 200 },
      via: [{ x: 280, y: 180 }],
    });
    expect(diagram.styles.find((s) => s.target === "divider")!.properties).toMatchObject({
      line: "dashed",
      arrowhead: "triangle",
    });
  });

  it("keeps a line's points as written inside a group, with no label by default", () => {
    const { diagram, codes } = free(
      '  group g "G" {\n    line l from (0, 0) to (100, 0)\n  }\n  placement { place g at (300, 200) }',
    );
    expect(codes).toEqual([]);
    const line = diagram.elementsById.get("l")!;
    expect(line.groupPath).toEqual(["g"]);
    expect(line.label).toBe("");
    expect(line.line).toEqual({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, via: [] });
  });

  it("refuses a line in a flow diagram and lists it among the free kinds", () => {
    const { compilation } = flow("  line l from (0, 0) to (100, 0)");
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.unknown");
    expect(d!.hints?.join(" ")).toMatch(/node/);
    const decision = free('  decision ok "OK?"');
    expect(decision.codes).toContain("prop.unknown");
    expect(decision.compilation.diagnostics[0]!.hints?.join(" ")).toMatch(/`line`/);
  });

  it("refuses malformed points with the form", () => {
    const { compilation } = free("  line l from (0, 0) to 100");
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.invalid-value");
    expect(d!.range.start.column).toBe(25);
    expect(d!.hints).toContain(
      'Form: `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), ...]]`.',
    );
    expect(free("  line l from (0, 0)").codes).toEqual(["prop.invalid-value"]);
    expect(free("  line l from (0, 0) to (9, 9) via [(1, 2)] extra").codes).toEqual([
      "prop.invalid-value",
    ]);
  });

  it("refuses a place, a size and a box's properties on a line", () => {
    const { compilation } = free(
      "  line l from (0, 0) to (100, 0)\n  placement { place l at (50, 50) }\n  style l { shape pill }",
    );
    const refusals = compilation.diagnostics.map((d) => [d.code, d.message]);
    expect(refusals).toContainEqual([
      "prop.invalid-value",
      "`l` is a line; `place` does not apply to it.",
    ]);
    expect(
      compilation.diagnostics.find((d) => d.message.startsWith("`l` is a line"))!.hints,
    ).toEqual(["A line's points are written in its statement: `line <id> from (x, y) to (x, y)`."]);
    expect(
      refusals.some(([code, message]) => code === "prop.invalid-value" && /shape/.test(message!)),
    ).toBe(true);
    const radius = free("  line l from (0, 0) to (100, 0)\n  style l { radius 4; rotation 30 }");
    expect(radius.compilation.diagnostics.map((d) => d.message)).toContain(
      "`radius` does not apply to lines such as `l`.",
    );
    expect(radius.codes).toHaveLength(2);
  });

  it("takes every effect, and a text refuses flow naming relations, lines and pens", () => {
    const line = free(
      "  line l from (0, 0) to (300, 0)\n  animate l { effect flow }\n  animate l { effect dash }\n  animate l { effect pulse }\n  animate l { effect trace }",
    );
    expect(line.codes).toEqual([]);
    const text = free('  text t "Note"\n  animate t { effect flow }');
    expect(text.codes).toEqual(["animate.invalid-target"]);
    expect(text.compilation.diagnostics[0]!.message).toBe(
      "Flow particles run along relations, lines and pens; name the relation (`a -> b as r`) and animate it.",
    );
    const trace = free('  text t "Note"\n  animate t { effect trace }');
    expect(trace.compilation.diagnostics[0]!.message).toBe(
      "A trace runs along relations, lines and pens; name the relation (`a -> b as r`) and animate it.",
    );
  });

  it("takes a relation's properties, a rule for lines and a label placement", () => {
    const { diagram, codes } = free(
      '  line l "Step" from (0, 0) to (200, 0)\n  rule line { line dashed }\n  style l { routing orthogonal; corners rounded; arrowtail circle; stroke accent; width 2 }\n  placement { label l at 30% offset (0, -16) }',
    );
    expect(codes).toEqual([]);
    expect(diagram.placement.find((p) => p.statement === "label")).toMatchObject({
      target: "l",
      at: 30,
      offset: { x: 0, y: -16 },
    });
  });
});

describe("pen strokes", () => {
  const FORM = "Form: `pen <id> [(x, y), (x, y), ...]`.";
  const WRITTEN = "A pen's points are written in its statement: `pen <id> [(x, y), (x, y), ...]`.";
  const TAKES = "a pen takes `stroke`, `width`, `line`, `opacity`, `arrowhead` and `arrowtail`.";

  it("compiles a stroke with its decimals and its styles", () => {
    const { diagram, codes } = free(
      "  pen arrow [(40, 60), (90.5, 58), (140, 70), (150, 66)]\n  style arrow { width 4; arrowhead triangle }",
    );
    expect(codes).toEqual([]);
    const arrow = diagram.elementsById.get("arrow")!;
    expect(arrow).toMatchObject({ kind: "pen", label: "", labelWritten: false, line: null });
    expect(arrow.pen).toEqual({
      points: [
        { x: 40, y: 60 },
        { x: 90.5, y: 58 },
        { x: 140, y: 70 },
        { x: 150, y: 66 },
      ],
    });
    expect(diagram.styles.find((s) => s.target === "arrow")!.properties).toEqual({
      width: 4,
      arrowhead: "triangle",
    });
  });

  it("keeps a stroke's points as written inside a group", () => {
    const { diagram, codes } = free(
      '  group notes "Notes" {\n    pen p [(10, 10), (30, 20)]\n  }\n  placement { place notes at (300, 200) }',
    );
    expect(codes).toEqual([]);
    const p = diagram.elementsById.get("p")!;
    expect(p.groupPath).toEqual(["notes"]);
    expect(p.pen!.points).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 20 },
    ]);
  });

  it("takes one point, negative coordinates and a list across lines", () => {
    const dot = free("  pen dot [(100, 100)]");
    expect(dot.codes).toEqual([]);
    expect(dot.diagram.elementsById.get("dot")!.pen!.points).toEqual([{ x: 100, y: 100 }]);
    const long = free("  pen p [\n    (0, 0), (10, 10),\n    (-20.5, -3),\n  ]");
    expect(long.codes).toEqual([]);
    expect(long.diagram.elementsById.get("p")!.pen!.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: -20.5, y: -3 },
    ]);
  });

  it("takes the block of a free element", () => {
    const { diagram, codes } = free(
      '  layers back, main\n  pen p [(0, 0), (10, 10)] {\n    description "A tick"\n    class faded\n    layer back\n    url "https://example.com"\n  }\n  class faded { opacity 0.5 }',
    );
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("p")).toMatchObject({
      description: "A tick",
      layer: "back",
      url: "https://example.com",
      classes: [{ name: "faded" }],
    });
  });

  it("refuses a port in its block, as a block without ports does; a line keeps its ports", () => {
    const { compilation, diagram } = free("  pen p [(0, 0)] {\n    port out east\n  }");
    expect(
      compilation.diagnostics.map((d) => [d.code, d.message, d.hints, d.range.start.line]),
    ).toEqual([
      [
        "prop.unknown",
        "Unknown property `port` in an element block.",
        ["Element blocks accept `description`, `class`, `layer`, `link` and `url`."],
        4,
      ],
    ]);
    expect(diagram.elementsById.get("p")!.ports).toEqual([]);
    const line = free("  line l from (0, 0) to (10, 10) {\n    port out east\n  }");
    expect(line.codes).toEqual([]);
    expect(line.diagram.elementsById.get("l")!.ports.map((p) => p.name)).toEqual(["out"]);
  });

  it.each([
    ["numbers that are not tuples", "  pen p [10, 20, 30]", 10],
    ["an empty list", "  pen p []", 9],
    ["no list", "  pen p", 3],
    ["a point with units", "  pen p [(1px, 2)]", 10],
  ])("refuses %s with the form", (_name, body, column) => {
    const { compilation, diagram } = free(body);
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      [
        "prop.invalid-value",
        "A pen takes a list of points `(x, y)` after its id, at least one.",
        [FORM],
      ],
    ]);
    expect(compilation.diagnostics[0]!.range.start.column).toBe(column);
    expect(diagram.elementsById.has("p")).toBe(false);
  });

  it("refuses a label and a value after the points", () => {
    const { compilation } = free('  pen p "Label" [(0, 0)]\n  pen q [(0, 0)] extra');
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      ["prop.invalid-value", "`p` is a pen, which has no label; its points follow its id.", [FORM]],
      [
        "prop.invalid-value",
        "Unexpected value; expected `pen <id> [(x, y), (x, y), ...]`.",
        [FORM],
      ],
    ]);
  });

  it("refuses a place, a size and a rotation, its points being in its statement", () => {
    const { compilation, diagram } = free(
      "  pen p [(0, 0), (10, 10)]\n  placement {\n    place p at (10, 10)\n    size p (20, 20)\n  }\n  style p { rotation 45 }",
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      ["prop.invalid-value", "`p` is a pen; `place` does not apply to it.", [WRITTEN]],
      ["prop.invalid-value", "`p` is a pen; `size` does not apply to it.", [WRITTEN]],
      ["prop.invalid-value", "`p` is a pen; `rotation` does not apply to it.", [WRITTEN]],
    ]);
    expect(diagram.placement).toEqual([]);
    expect(diagram.styles[0]!.properties).toEqual({});
  });

  it("refuses a box's properties, naming the ones a pen takes", () => {
    const { compilation, diagram } = free(
      '  pen p [(0, 0), (10, 10)]\n  style p { fill surface }\n  style p { shape pill; radius 4; routing orthogonal; corners rounded; fontSize 20; icon "tabler:x"; pattern dots }',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual(
      ["fill", "shape", "radius", "routing", "corners", "fontSize", "icon", "pattern"].map(
        (name) => [
          "prop.invalid-value",
          `\`${name}\` does not apply to pens such as \`p\`; ${TAKES}`,
        ],
      ),
    );
    // Reported on the property, not on the statement.
    expect(compilation.diagnostics[0]!.range.start).toMatchObject({ line: 4, column: 13 });
    expect(diagram.styles.map((s) => s.properties)).toEqual([{}, {}]);
  });

  it("takes a stroke's properties", () => {
    const { diagram, codes } = free(
      "  pen p [(0, 0), (10, 10)]\n  style p { stroke accent; width 64; line dashed; opacity 0.5; arrowhead open; arrowtail bar }",
    );
    expect(codes).toEqual([]);
    expect(diagram.styles[0]!.properties).toEqual({
      stroke: "@accent",
      width: 64,
      line: "dashed",
      opacity: 0.5,
      arrowhead: "open",
      arrowtail: "bar",
    });
  });

  it("refuses a width of 0 on a pen, on the value, and keeps it on a box", () => {
    const { compilation, diagram } = free(
      '  pen p [(0, 0), (10, 10)]\n  box b "B"\n  style p, b { width 0 }',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      [
        "prop.invalid-value",
        "`width` expects a number from 1 to 64.",
        ["A pen is drawn one pixel wide at least; remove the pen to hide its stroke."],
      ],
    ]);
    expect(compilation.diagnostics[0]!.range.start).toMatchObject({ line: 5, column: 22 });
    expect(diagram.styles.map((s) => [s.target, s.properties])).toEqual([
      ["p", {}],
      ["b", { width: 0 }],
    ]);
  });

  it("is refused by flow, sequence and C4 diagrams, belonging to free diagrams", () => {
    const flowPen = flow("  pen p [(0, 0), (10, 10)]").compilation.diagnostics;
    expect(flowPen.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(flowPen[0]!.hints![0]).toContain("`pen` belongs to free diagrams");
    const sequence = compile(
      "diagram s: sequence {\n  participant a\n  pen p [(0, 0), (10, 10)]\n}\n",
    ).diagnostics;
    expect(sequence.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(sequence[0]!.hints![0]).toContain("`pen` belongs to free diagrams");
    const c4 = compile(
      'model m {\n  system s "S"\n}\ndiagram v: c4 using m {\n  level context\n  pen p [(0, 0), (10, 10)]\n}\n',
    ).diagnostics;
    expect(c4.map((d) => d.code)).toEqual(["prop.unknown"]);
  });

  it("takes a rule for every pen, its heads included", () => {
    const { diagram, codes } = free(
      "  pen a [(0, 0), (10, 0)]\n  pen b [(0, 20), (10, 20)]\n  rule pen { width 5; stroke accent; arrowhead open }",
    );
    expect(codes).toEqual([]);
    expect(diagram.rules.map((r) => [r.kind, r.properties])).toEqual([
      ["pen", { width: 5, stroke: "@accent", arrowhead: "open" }],
    ]);
  });

  it("refuses in a rule for pens what a pen does not take", () => {
    const { compilation, diagram } = free(
      "  pen a [(0, 0)]\n  rule pen { fill accent; routing orthogonal; width 0; rotation 4; shape pill }",
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["prop.invalid-value", "`fill` does not apply to `pen` elements."],
      ["prop.invalid-value", "`routing` does not apply to `pen` elements."],
      ["prop.invalid-value", "`width` expects a number from 1 to 64."],
      [
        "prop.invalid-value",
        "`rotation` does not turn `pen` elements; it turns the other elements of flow diagrams and free compositions.",
      ],
      [
        "prop.invalid-value",
        "`shape` does not apply to `pen` elements; it applies to `node` and `box` elements.",
      ],
    ]);
    expect(compilation.diagnostics[0]!.hints).toEqual([
      "A pen takes `stroke`, `width`, `line`, `opacity`, `arrowhead` and `arrowtail`.",
    ]);
    expect(diagram.rules[0]!.properties).toEqual({});
  });

  it("takes heads in rules for lines and pens, and a rule for stickies", () => {
    const { diagram, codes } = free(
      '  rule line { arrowhead open; arrowtail bar; routing orthogonal; corners rounded }\n  rule pen { arrowhead triangle }\n  rule sticky { fill "#fff59d" }',
    );
    expect(codes).toEqual([]);
    expect(diagram.rules.map((r) => [r.kind, r.properties])).toEqual([
      ["line", { arrowhead: "open", arrowtail: "bar", routing: "orthogonal", corners: "rounded" }],
      ["pen", { arrowhead: "triangle" }],
      ["sticky", { fill: "#fff59d" }],
    ]);
    // Other element kinds still refuse heads in rules.
    expect(free("  rule box { arrowhead open }").codes).toEqual(["prop.invalid-value"]);
  });

  it("refuses rules for lines and pens in flow diagrams, naming free diagrams", () => {
    const { compilation } = flow("  a -> b\n  rule pen { width 2 }\n  rule line { width 2 }");
    expect(compilation.diagnostics.map((d) => d.message)).toEqual([
      "`pen` elements belong to free diagrams; this is a flow diagram.",
      "`line` elements belong to free diagrams; this is a flow diagram.",
    ]);
  });

  it("runs every effect as a line does", () => {
    const { diagram, codes } = free(
      "  pen p [(0, 0), (40, 10), (80, 0)]\n  animate p { effect trace; repeat 1 }\n  animate p { effect flow }\n  animate p { effect dash }\n  animate p { effect pulse }",
    );
    expect(codes).toEqual([]);
    expect(diagram.animations.map((a) => [a.target, a.effect, a.repeat])).toEqual([
      ["p", "trace", 1],
      ["p", "flow", null],
      ["p", "dash", null],
      ["p", "pulse", null],
    ]);
  });

  it("is no candidate for a note's attachment", () => {
    const { compilation } = free('  pen p [(0, 0)]\n  box a "A"\n  note n "N" on ghost');
    expect(compilation.diagnostics[0]!.data?.candidates).toEqual(["a"]);
  });
});

describe("opacity", () => {
  it("is stored as a number on pens, elements, groups and lines", () => {
    const { diagram, codes } = free(
      '  pen mark [(0, 0), (40, 0)]\n  box a "A"\n  group g "G" {\n    text t "T"\n  }\n  line l from (0, 0) to (10, 0)\n  style mark { width 20; opacity 0.35 }\n  style a, g, l, t { opacity 0.5 }\n  class faded { opacity 0 }\n  rule note { opacity 1 }',
    );
    expect(codes).toEqual([]);
    expect(diagram.styles.map((s) => [s.target, s.properties])).toEqual([
      ["mark", { width: 20, opacity: 0.35 }],
      ["a", { opacity: 0.5 }],
      ["g", { opacity: 0.5 }],
      ["l", { opacity: 0.5 }],
      ["t", { opacity: 0.5 }],
    ]);
    expect(diagram.classes[0]!.properties).toEqual({ opacity: 0 });
    expect(diagram.rules[0]!.properties).toEqual({ opacity: 1 });
  });

  it("is refused on a relation, naming elements, groups, lines and pens", () => {
    const { compilation, diagram } = free(
      '  box a "A"\n  box b "B"\n  a -> b as request\n  style request { opacity 0.5 }\n  rule relation { opacity 0.5 }',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      [
        "prop.invalid-value",
        "`opacity` does not apply to relations such as `request`.",
        ["`opacity` applies to elements, groups, lines and pens."],
      ],
      [
        "prop.invalid-value",
        "`opacity` does not apply to relations.",
        ["`opacity` applies to elements, groups, lines and pens."],
      ],
    ]);
    expect(diagram.styles[0]!.properties).toEqual({});
  });

  it("is refused out of its range, on the value", () => {
    const { compilation } = free('  box a "A"\n  style a { opacity 1.5 }');
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["prop.invalid-value", "`opacity` expects a number from 0 to 1."],
    ]);
    expect(compilation.diagnostics[0]!.range.start.column).toBe(21);
  });

  it("is refused in flow diagrams, naming free diagrams", () => {
    const { compilation } = flow(
      "  api -> db\n  style api { opacity 0.5 }\n  class c { opacity 0.2 }",
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      [
        "prop.invalid-value",
        "`opacity` applies to free diagrams only.",
        [
          "Flow, sequence and C4 diagrams draw every element opaque; free diagrams fade elements, groups, lines and pens with `opacity`.",
        ],
      ],
      [
        "prop.invalid-value",
        "`opacity` applies to free diagrams only.",
        [
          "Flow, sequence and C4 diagrams draw every element opaque; free diagrams fade elements, groups, lines and pens with `opacity`.",
        ],
      ],
    ]);
    // The hint of a flow style block does not offer it.
    const unknown = flow('  api["API"]\n  style api { shade 1 }').compilation.diagnostics[0]!;
    expect(unknown.hints![0]).not.toContain("opacity");
  });
});

describe("stickies", () => {
  const FORM = 'Form: `sticky <id> "Text"`.';
  const TAKES =
    "A sticky takes `fill`, `stroke`, `color`, `line`, `width`, `fontSize`, `fontWeight`, `textAlign`, `verticalAlign`, `radius`, `rotation`, `opacity`, `icon`, `iconColor` and `iconSize`.";

  it("compiles a sticky with its text, a line break and a fill", () => {
    const { diagram, codes } = free(
      '  sticky idea "Cache the\\ncatalogue"\n  style idea { fill "#f8bbd0" }',
    );
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("idea")).toMatchObject({
      kind: "sticky",
      label: "Cache the\ncatalogue",
      labelWritten: true,
      line: null,
      pen: null,
      list: null,
    });
    expect(diagram.styles[0]!.properties).toEqual({ fill: "#f8bbd0" });
  });

  it("is a relation endpoint", () => {
    const { diagram, codes } = free('  sticky a "A"\n  box b "B"\n  a -> b');
    expect(codes).toEqual([]);
    expect(diagram.relations.map((r) => [r.from, r.to])).toEqual([["a", "b"]]);
  });

  it("takes a box's block, a place, a size, ports and the constraints", () => {
    const { diagram, codes } = free(
      '  layers back, main\n  sticky s "S" {\n    description "A card"\n    class pink\n    layer back\n    url "https://example.com"\n    port top north 25%\n  }\n  box b "B"\n  class pink { fill "#f8bbd0" }\n  placement {\n    place s at (40, 40)\n    size s (200, 200)\n    align s, b top\n  }',
    );
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("s")).toMatchObject({
      description: "A card",
      layer: "back",
      url: "https://example.com",
      classes: [{ name: "pink" }],
      ports: [{ name: "top", side: "north", position: 0.25 }],
    });
    expect(diagram.placement.map((p) => [p.statement, p.target])).toEqual([
      ["place", "s"],
      ["size", "s"],
    ]);
    expect(diagram.constraints.map((c) => c.targets)).toEqual([["s", "b"]]);
  });

  it("needs its text, with the form in the hint, and is still declared", () => {
    const { compilation, diagram } = free("  sticky s\n  box b\n  s -> b");
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      ["prop.invalid-value", '`sticky s` needs its text; expected `sticky <id> "Text"`.', [FORM]],
    ]);
    expect(diagram.elementsById.get("s")).toMatchObject({ kind: "sticky", labelWritten: false });
    expect(diagram.relations).toHaveLength(1);
  });

  it("refuses a text that is not a string and a value after the text", () => {
    const { compilation } = free('  sticky s 12\n  sticky t "T" "U"');
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["prop.invalid-value", "The text of `s` must be a quoted string."],
      ["prop.invalid-value", 'Unexpected value after the text; expected `sticky <id> "Text"`.'],
    ]);
  });

  it("refuses a shape, naming node and box", () => {
    const { compilation, diagram } = free('  sticky s "S"\n  style s { shape hexagon }');
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        "prop.invalid-value",
        "`shape` does not apply to `sticky` elements such as `s`; it applies to `node` and `box` elements.",
      ],
    ]);
    expect(compilation.diagnostics[0]!.range.start).toMatchObject({ line: 4, column: 13 });
    expect(diagram.styles[0]!.properties).toEqual({});
  });

  it("refuses a pattern, the icon placements and the relation properties, naming what it takes", () => {
    const { compilation, diagram } = free(
      '  sticky s "S"\n  style s { pattern dots; iconPosition top; labelPosition bottom; arrowhead open; routing orthogonal }',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual(
      ["pattern", "iconPosition", "labelPosition", "arrowhead", "routing"].map((name) => [
        "prop.invalid-value",
        `\`${name}\` does not apply to stickies such as \`s\`.`,
        [TAKES],
      ]),
    );
    expect(diagram.styles[0]!.properties).toEqual({});
  });

  it("takes a card's properties, the whiteboard tokens among the colours", () => {
    const { diagram, codes } = free(
      '  sticky s "S"\n  style s {\n    fill sticky\n    stroke accent\n    color stickyText\n    line dashed\n    width 2\n    fontSize 20\n    fontWeight 700\n    textAlign left\n    verticalAlign top\n    radius 8\n    rotation 4\n    opacity 0.9\n    icon "tabler:bulb"\n    iconColor accent\n    iconSize 24\n  }',
    );
    expect(codes).toEqual([]);
    expect(diagram.styles[0]!.properties).toEqual({
      fill: "@sticky",
      stroke: "@accent",
      color: "@stickyText",
      line: "dashed",
      width: 2,
      fontSize: 20,
      fontWeight: 700,
      textAlign: "left",
      verticalAlign: "top",
      radius: 8,
      rotation: 4,
      opacity: 0.9,
      icon: "tabler:bulb",
      iconColor: "@accent",
      iconSize: 24,
    });
    expect(diagram.icons.map((i) => i.reference)).toEqual(["tabler:bulb"]);
  });

  it("takes a rule for every sticky, which refuses what a sticky does not take", () => {
    const { compilation, diagram } = free(
      '  sticky s "S"\n  rule sticky { fill "#fff59d"; radius 4; pattern dots; shape pill }',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      ["prop.invalid-value", "`pattern` does not apply to `sticky` elements.", [TAKES]],
      [
        "prop.invalid-value",
        "`shape` does not apply to `sticky` elements; it applies to `node` and `box` elements.",
        undefined,
      ],
    ]);
    expect(diagram.rules[0]!.properties).toEqual({ fill: "#fff59d", radius: 4 });
  });

  it("is refused by flow, sequence and C4 diagrams, belonging to free diagrams", () => {
    const flowSticky = flow('  sticky s "S"').compilation.diagnostics;
    expect(flowSticky.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(flowSticky[0]!.hints![0]).toContain("`sticky` belongs to free diagrams");
    const sequence = compile(
      'diagram s: sequence {\n  participant a\n  sticky n "N"\n}\n',
    ).diagnostics;
    expect(sequence.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(sequence[0]!.hints![0]).toContain("`sticky` belongs to free diagrams");
    const c4 = compile(
      'model m {\n  system s "S"\n}\ndiagram v: c4 using m {\n  level context\n  sticky n "N"\n}\n',
    ).diagnostics;
    expect(c4.map((d) => d.code)).toEqual(["prop.unknown"]);
  });

  it("takes a pulse, and a dash once a stroke gives its card an outline; no flow", () => {
    const fine = free(
      '  sticky s "S"\n  animate s { effect dash }\n  animate s { effect pulse }\n  style s { stroke "#d92d20" }',
    );
    expect(fine.codes).toEqual([]);
    expect(fine.diagram.animations.map((a) => a.effect)).toEqual(["dash", "pulse"]);
    // A class or a rule of the diagram outlines it too.
    expect(
      free(
        '  sticky s "S" { class edged }\n  class edged { stroke accent }\n  animate s { effect dash }',
      ).codes,
    ).toEqual([]);
    expect(
      free('  sticky s "S"\n  rule sticky { stroke accent }\n  animate s { effect dash }').codes,
    ).toEqual([]);
    // Its fill is no line: a dash on a card without a stroke would draw nothing.
    for (const more of ["", '\n  style s { fill "#f8bbd0" }']) {
      const bare = free(
        `  sticky s "S"\n  animate s { effect dash }\n  animate s { effect pulse }${more}`,
      );
      expect(bare.codes).toEqual(["animate.invalid-target"]);
      expect(bare.compilation.diagnostics[0]!.message).toBe(
        "`s` is a sticky without an outline; a moving dash follows a line or a box.",
      );
      expect(bare.compilation.diagnostics[0]!.hints).toEqual([
        "Give it a `stroke` in a `style`, a class or a `rule` of this diagram, or use a pulse.",
      ]);
      expect(bare.diagram.animations.map((a) => a.effect)).toEqual(["pulse"]);
    }
    expect(free('  sticky s "S"\n  animate s { effect flow }').codes).toEqual([
      "animate.invalid-target",
    ]);
  });

  it("is an element of stories", () => {
    const compilation = compile(
      'language "0.2"\ndiagram d: free {\n  sticky s "S"\n}\nstory tour for d {\n  scene one {\n    reveal s\n    highlight s\n  }\n}\n',
    );
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.document.stories[0]!.references.map((r) => [r.id, r.kind])).toEqual([
      ["s", "element"],
      ["s", "element"],
    ]);
  });
});

describe("list groups", () => {
  const LAYOUT_HINT = "Write `layout column` or `layout row` in the group's block.";

  it("reads a column of cards", () => {
    const { diagram, codes } = free(
      '  group todo "To do" { layout column; spacing 12; sticky a "A"; sticky b "B" }',
    );
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("todo")!.list).toEqual({
      layout: "column",
      spacing: 12,
      align: null,
    });
    expect(diagram.elementsById.get("a")).toMatchObject({ groupPath: ["todo"], list: null });
  });

  it("reads a board of columns", () => {
    // One group per line: `} group` on one line would chain a second block to the first.
    const { diagram, codes } = free(
      '  group board "" {\n    layout row; align stretch\n    group todo "To do" { layout column }\n    group done "Done" { layout column }\n  }',
    );
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("board")!.list).toEqual({
      layout: "row",
      spacing: null,
      align: "stretch",
    });
    for (const id of ["todo", "done"]) {
      expect(diagram.elementsById.get(id)).toMatchObject({
        groupPath: ["board"],
        list: { layout: "column", spacing: null, align: null },
      });
    }
  });

  it("leaves list null on other groups and on elements, and the diagram's layout as it was", () => {
    const { diagram, codes } = free(
      '  layout assisted\n  group g "G" {\n    description "Plain"\n    box a "A"\n  }\n  group c "C" {\n    layout column\n  }',
    );
    expect(codes).toEqual([]);
    expect(diagram.properties.layout).toBe("assisted");
    expect(diagram.elementsById.get("g")!.list).toBeNull();
    expect(diagram.elementsById.get("a")!.list).toBeNull();
    expect(diagram.elementsById.get("c")!.list).toMatchObject({ layout: "column" });
  });

  it("refuses spacing or align without a layout, on the property", () => {
    const { compilation, diagram } = free(
      '  group g "G" {\n    spacing 12\n    align center\n    box a "A"\n  }',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      [
        "prop.invalid-value",
        "`spacing` arranges the children of a list; this group writes no `layout`.",
        [LAYOUT_HINT],
      ],
      [
        "prop.invalid-value",
        "`align` arranges the children of a list; this group writes no `layout`.",
        [LAYOUT_HINT],
      ],
    ]);
    expect(compilation.diagnostics[0]!.range.start).toMatchObject({ line: 4, column: 5 });
    expect(diagram.elementsById.get("g")!.list).toBeNull();
  });

  it("refuses other values, listing the ones each takes", () => {
    const { compilation, diagram } = free(
      '  group g "G" {\n    layout grid\n  }\n  group h "H" {\n    layout column\n    spacing 500\n    align middle\n  }',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["prop.invalid-value", "Invalid value `grid` for `layout`; expected one of column, row."],
      ["prop.invalid-value", "`spacing` expects a number from 0 to 400."],
      [
        "prop.invalid-value",
        "Invalid value `middle` for `align`; expected one of start, center, end, stretch.",
      ],
    ]);
    // Reported on the value.
    expect(compilation.diagnostics[0]!.range.start).toMatchObject({ line: 4, column: 12 });
    expect(diagram.elementsById.get("g")!.list).toBeNull();
    expect(diagram.elementsById.get("h")!.list).toEqual({
      layout: "column",
      spacing: null,
      align: null,
    });
  });

  it("says that the diagram's layout modes are no list layouts", () => {
    const { compilation } = free('  group g "G" {\n    layout auto\n  }');
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual([
      [
        "prop.invalid-value",
        "Invalid value `auto` for `layout`; expected one of column, row.",
        [
          "`layout auto` is a statement of the diagram; a group block takes `layout column` or `layout row`.",
        ],
      ],
    ]);
  });

  it("refuses a property written twice", () => {
    expect(free('  group g "G" {\n    layout column\n    layout row\n  }').codes).toEqual([
      "prop.duplicate",
    ]);
  });

  it("is prop.unknown in element blocks", () => {
    const { codes } = free('  box a "A" { layout column }\n  sticky s "S" { spacing 4 }');
    expect(codes).toEqual(["prop.unknown", "prop.unknown"]);
  });

  it("is offered for an unknown statement of a free group block", () => {
    const { compilation } = free('  group g "G" {\n    spaceing 12\n  }');
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(compilation.diagnostics[0]!.data?.candidates).toEqual([
      "description",
      "url",
      "layout",
      "spacing",
      "align",
    ]);
    const flowGroup = flow('  group g {\n    spaceing 12\n    a["A"]\n  }').compilation;
    expect(flowGroup.diagnostics[0]!.data?.candidates).toEqual(["description", "url"]);
  });

  it("is refused in flow diagrams, naming free diagrams", () => {
    const { compilation, codes } = flow(
      '  group g {\n    layout column\n    spacing 8\n    align end\n    a["A"]\n  }',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message, d.hints])).toEqual(
      ["layout", "spacing", "align"].map((name) => [
        "prop.invalid-value",
        `A group's \`${name}\` belongs to the lists of free diagrams; this is a flow diagram.`,
        [
          "Free diagrams arrange a group's children in a column or a row with `layout column` or `layout row`.",
        ],
      ]),
    );
    expect(codes).toHaveLength(3);
    expect(compilation.diagnostics[0]!.range.start).toMatchObject({ line: 4, column: 5 });
    const diagram = compilation.document.diagrams[0] as FlowDiagram;
    expect(diagram.elementsById.get("g")!.list).toBeNull();
    // Sequence groups have no lists either.
    const sequence = compile(
      "diagram s: sequence {\n  group g {\n    layout row\n    participant a\n  }\n}\n",
    ).diagnostics;
    expect(sequence.map((d) => [d.code, d.message])).toEqual([
      [
        "prop.invalid-value",
        "A group's `layout` belongs to the lists of free diagrams; this is a sequence diagram.",
      ],
    ]);
  });
});

describe("free objects", () => {
  it("requires the text of a text object", () => {
    const { codes, compilation } = free("  text t");
    expect(codes).toEqual(["prop.invalid-value"]);
    expect(compilation.diagnostics[0]!.message).toContain("needs its text");
  });

  it("reads icon sources and lists them with the diagram's icons", () => {
    const { diagram, codes } = free('  icon s "tabler:server"');
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("s")).toMatchObject({
      kind: "icon",
      label: "s",
      source: "tabler:server",
    });
    expect(diagram.icons.map((i) => i.reference)).toEqual(["tabler:server"]);
  });

  it("refuses a malformed icon reference", () => {
    const { codes } = free('  icon s "server"');
    expect(codes).toEqual(["prop.invalid-value"]);
  });

  it("reads image paths", () => {
    const { diagram, codes } = free('  image logo "img/logo.png" { description "Logo" }');
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("logo")).toMatchObject({
      kind: "image",
      source: "img/logo.png",
      description: "Logo",
    });
    expect(diagram.images.map((i) => [i.element, i.path])).toEqual([["logo", "img/logo.png"]]);
  });

  it.each([
    ["a URL", "https://example.com/logo.png"],
    ["an absolute path", "/logo.png"],
    ["a drive path", "C:/logo.png"],
    ["backslashes", "img\\\\logo.png"],
  ])("refuses %s as an image path", (_name, path) => {
    const { codes } = free(`  image logo "${path}"`);
    expect(codes).toEqual(["asset.outside-project"]);
  });

  it("accepts the free style properties", () => {
    const { diagram, codes } = free(
      '  text h "Title"\n  box a "A"\n  style h { fontSize 32; fontWeight 700; textAlign center }\n  style a { shape ellipse }',
    );
    expect(codes).toEqual([]);
    expect(diagram.styles.map((s) => s.properties)).toEqual([
      { fontSize: 32, fontWeight: 700, textAlign: "center" },
      { shape: "ellipse" },
    ]);
  });

  it("refuses the text properties in flow diagrams, naming free diagrams", () => {
    const { compilation } = flow('  api["API"]\n  style api { fontSize 20 }');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.invalid-value");
    expect(d!.message).toBe("`fontSize` applies to free diagrams only.");
    expect(d!.hints![0]).toContain("theme's type scale");
  });

  it("refuses the text properties in flow classes and rules, and takes shapes there", () => {
    const { codes } = flow(
      "  a -> b\n  class big { fontSize 20 }\n  rule node { textAlign left }\n  rule node { shape pill }",
    );
    expect(codes).toEqual(["prop.invalid-value", "prop.invalid-value"]);
  });

  it("checks rule kinds against the profile", () => {
    expect(free('  box a "A"\n  rule node { fill "#fff" }').codes).toEqual(["prop.invalid-value"]);
    expect(free('  box a "A"\n  rule box { fill "#fff" }').codes).toEqual([]);
    expect(flow('  a -> b\n  rule text { fill "#fff" }').codes).toEqual(["prop.invalid-value"]);
  });

  it("accepts the vertical alignment of a box, refuses it in flow and lists its values", () => {
    const { diagram, codes } = free('  box a "A"\n  style a { verticalAlign top; textAlign left }');
    expect(codes).toEqual([]);
    expect(diagram.styles[0]!.properties).toEqual({ verticalAlign: "top", textAlign: "left" });
    const refused = flow('  api["API"]\n  style api { verticalAlign bottom }').compilation
      .diagnostics;
    expect(refused.map((d) => [d.code, d.message])).toEqual([
      ["prop.invalid-value", "`verticalAlign` applies to free diagrams only."],
    ]);
    const unknown = free('  box a "A"\n  style a { verticalAlign center }').compilation.diagnostics;
    expect(unknown.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(unknown[0]!.message).toContain("top, middle, bottom");
  });

  it("checks font sizes and weights", () => {
    expect(free('  text h "T"\n  style h { fontSize 200 }').codes).toEqual(["prop.invalid-value"]);
    expect(free('  text h "T"\n  style h { fontWeight 450 }').codes).toEqual([
      "prop.invalid-value",
    ]);
  });
});

describe("layers", () => {
  it("lists layers back to front with main last when unlisted", () => {
    const { diagram, codes } = free(
      '  layers back, front\n  box a "A" { layer front }\n  box b "B"\n  a -> b { layer back }',
    );
    expect(codes).toEqual([]);
    expect(diagram.properties.layers).toEqual(["back", "front", "main"]);
    expect(diagram.elementsById.get("a")!.layer).toBe("front");
    expect(diagram.elementsById.get("b")!.layer).toBeNull();
    expect(diagram.relations[0]!.layer).toBe("back");
  });

  it("keeps main where it is listed", () => {
    const { diagram } = free('  layers main, front\n  box a "A"');
    expect(diagram.properties.layers).toEqual(["main", "front"]);
  });

  it("reports an unknown layer with the declared layers", () => {
    const { compilation } = free('  layers back\n  box a "A" { layer front }');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("ref.unknown-layer");
    expect(d!.hints![0]).toBe("Layers: back, main.");
  });

  it("takes layers in flow diagrams too, and refuses them in sequence diagrams", () => {
    const { compilation, codes } = flow(
      '  layers back, main\n  group band "Band" { layer back }\n  api["API"]\n  api -> api as loop { layer back }',
    );
    expect(codes).toEqual([]);
    const diagram = compilation.document.diagrams[0] as FlowDiagram;
    expect(diagram.properties.layers).toEqual(["back", "main"]);
    expect(diagram.elementsById.get("band")!.layer).toBe("back");
    expect(diagram.elementsById.get("api")!.layer).toBeNull();
    expect(diagram.relations[0]!.layer).toBe("back");
    expect(flow('  api["API"] { layer front }').codes).toEqual(["ref.unknown-layer"]);
    const sequence = compile("diagram s: sequence {\n  layers back\n  participant a\n}\n");
    expect(sequence.diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
  });

  it("reports a layer listed twice", () => {
    expect(free('  layers a, a\n  box x "X"').codes).toEqual(["prop.duplicate"]);
  });
});

describe("identity links", () => {
  const source = 'diagram checkout: flow {\n  api["API Gateway"]\n  api -> db\n}\n';

  it("resolves a link to an element of another diagram", () => {
    const { diagram, codes } = free('  box api "API Gateway" { link checkout.api }', source);
    expect(codes).toEqual([]);
    expect(diagram.elementsById.get("api")!.link).toMatchObject({
      owner: "api",
      binding: null,
      diagram: "checkout",
      element: "api",
    });
    expect(diagram.links).toHaveLength(1);
  });

  it("reports an unknown element on the element part", () => {
    const { compilation, diagram } = free('  box a "A" { link checkout.ghost }', source);
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("ref.unknown-link");
    expect(compilation.text.slice(d!.range.start.offset, d!.range.end.offset)).toBe("ghost");
    expect(diagram.hasErrors).toBe(true);
  });

  it("reports an unknown diagram", () => {
    const { codes } = free('  box a "A" { link nowhere.api }', source);
    expect(codes).toEqual(["ref.unknown-link"]);
  });

  it("reports a link to its own diagram", () => {
    const { codes } = free('  box a "A"\n  box b "B" { link d.a }');
    expect(codes).toEqual(["ref.unknown-link"]);
  });

  it("leaves links through imports to the project", () => {
    const imports = 'import "./shop.meltemi" as shop\nimport checkout as co from "./c.meltemi"\n';
    const { codes, diagram } = free(
      '  box a "A" { link shop.checkout.api }\n  box b "B" { link co.api }',
      imports,
    );
    expect(codes).toEqual([]);
    expect(diagram.links.map((l) => [l.binding, l.diagram, l.element])).toEqual([
      ["shop", "checkout", "api"],
      [null, "co", "api"],
    ]);
  });

  it("reports a three-part link without a namespace import", () => {
    const { codes } = free('  box a "A" { link shop.checkout.api }');
    expect(codes).toEqual(["ref.unknown-link"]);
  });

  it("accepts links in flow element and group blocks, not in relations", () => {
    const other = 'diagram other: free {\n  box api "API"\n}\n';
    const compilation = compile(
      `language "0.2"\n${other}diagram d: flow {\n  api["API"] { link other.api }\n  group g { link other.api\n x["X"] }\n  api -> x { link other.api }\n}\n`,
    );
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
  });
});

describe("free diagrams in JSON", () => {
  it("serialises the type, layers, sources, links and layers of relations", () => {
    const source = 'diagram checkout: flow {\n  api["API"]\n}\n';
    const { compilation } = free(
      '  layers back\n  icon s "tabler:server" { layer back; link checkout.api }\n  box b "B"\n  s -> b { layer back }',
      source,
    );
    const json = toJson(compilation);
    const diagram = json.diagrams.find((d) => d.id === "d")!;
    expect(diagram.type).toBe("free");
    expect(diagram.properties.layers).toEqual(["back", "main"]);
    expect(diagram.elements[0]).toMatchObject({
      id: "s",
      kind: "icon",
      layer: "back",
      link: { binding: null, diagram: "checkout", element: "api" },
      source: "tabler:server",
    });
    expect(diagram.relations[0]!.layer).toBe("back");
    const flowJson = json.diagrams.find((d) => d.id === "checkout")!;
    expect(flowJson.properties.layers).toEqual(["main"]);
    expect(flowJson.elements[0]).toMatchObject({ layer: null, link: null, source: null });
  });
});

describe("profile gating", () => {
  it("compiles free beside flow and c4", () => {
    const compilation = compile(
      'language "0.2"\nmodel m { system s }\ndiagram a: free { box x "X" }\ndiagram b: c4 using m { level context }\n',
    );
    expect(compilation.document.diagrams.map((d) => d.type)).toEqual(["free", "c4"]);
    expect(compilation.diagnostics.map((d) => d.code)).toEqual([]);
  });
});

describe("notes in free compositions", () => {
  it("declares a note with its text, layer and style", () => {
    const { diagram, codes } = free(
      '  layers main, front\n  note hint "Draft\\nnot final" { layer front }\n  style hint { fill "#fff3bf"; stroke "#e8a600"; textAlign center }',
    );
    expect(codes).toEqual([]);
    const hint = diagram.elementsById.get("hint")!;
    expect(hint.kind).toBe("note");
    expect(hint.label).toBe("Draft\nnot final");
    expect(hint.layer).toBe("front");
    expect(hint.attachedTo).toBeNull();
    expect(Object.keys(diagram.styles[0]!.properties)).toEqual(["fill", "stroke", "textAlign"]);
  });

  it("takes rules, links and the text properties, and refuses a shape", () => {
    expect(free('  note n "T"\n  rule note { fill "#fff3bf"; fontSize 12 }').codes).toEqual([]);
    const refused = free('  note n "T"\n  style n { shape pill }').compilation.diagnostics;
    expect(refused.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(refused[0]!.message).toMatch(/node/);
    expect(refused[0]!.message).toMatch(/box/);
  });

  it("needs its text, and keeps the other flow kinds out", () => {
    const missing = free("  note n").compilation.diagnostics;
    expect(missing.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(missing[0]!.message).toContain("needs its text");
    expect(missing[0]!.message).toContain('`note <id> "Text" [on <element>]`');
    expect(free('  tag t "T"').codes).toEqual(["prop.unknown"]);
    expect(free('  decision d "D"').codes).toEqual(["prop.unknown"]);
  });

  it("attaches a note to any element, and the text properties stay refused in flow", () => {
    const attached = free(
      '  box api "API"\n  group g "G" { box inner "I" }\n  note n "Scales" on inner',
    );
    expect(attached.codes).toEqual([]);
    expect(attached.diagram.elementsById.get("n")!.attachedTo).toBe("inner");
    const { compilation } = flow(
      '  api["API"]\n  note limits "T"\n  style limits { textAlign center }',
    );
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(compilation.diagnostics[0]!.message).toMatch(/free diagrams only/);
  });
});
