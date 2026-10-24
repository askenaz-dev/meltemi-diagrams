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

  it("refuses flow kinds with the free kinds in the hint", () => {
    const { compilation } = free('  decision ok "OK?"');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.unknown");
    expect(d!.hints).toEqual([
      "Free diagrams declare `box`, `text`, `icon`, `image`, `note`, `line` and `group`.",
    ]);
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

  it("takes every effect, and a text refuses flow naming relations and lines", () => {
    const line = free(
      "  line l from (0, 0) to (300, 0)\n  animate l { effect flow }\n  animate l { effect dash }\n  animate l { effect pulse }\n  animate l { effect trace }",
    );
    expect(line.codes).toEqual([]);
    const text = free('  text t "Note"\n  animate t { effect flow }');
    expect(text.codes).toEqual(["animate.invalid-target"]);
    expect(text.compilation.diagnostics[0]!.message).toBe(
      "Flow particles run along relations and lines; name the relation (`a -> b as r`) and animate it.",
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
