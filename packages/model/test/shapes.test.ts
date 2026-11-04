import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import {
  BOX_SHAPES,
  C4_PROFILE,
  ELEMENT_ONLY_PROPERTIES,
  FLOW_PROFILE,
  FREE_PROFILE,
  SEQUENCE_PROFILE,
  STYLE_PROPERTIES,
  compile,
  profileTakesShape,
  readDiagramType,
  takesShape,
  toJson,
  type FlowDiagram,
} from "../src/index.js";

const diagram = (type: string, body: string, before = "") =>
  `language "0.2"\n${before}diagram d: ${type} {\n${body}\n}\n`;

function compiled(text: string) {
  const compilation = compile(text);
  const at = (d: { range: { start: { offset: number }; end: { offset: number } } }) =>
    compilation.text.slice(d.range.start.offset, d.range.end.offset);
  return {
    compilation,
    diagram: compilation.document.diagrams[0] as FlowDiagram,
    theme: compilation.document.themes[0],
    diagnostics: compilation.diagnostics,
    codes: compilation.diagnostics.map((d) => d.code),
    /** Each diagnostic as its code, the text it covers and its message. */
    found: compilation.diagnostics.map((d) => [d.code, at(d), d.message]),
  };
}

const flow = (body: string, before = "") => compiled(diagram("flow", body, before));
const free = (body: string, before = "") => compiled(diagram("free", body, before));
const stylesOf = (d: FlowDiagram) => d.styles.map((s) => [s.target, s.properties]);

describe("the shape vocabulary", () => {
  it("lists twenty-four shapes in the palette's order", () => {
    expect(BOX_SHAPES).toEqual([
      "rounded",
      "rectangle",
      "square",
      "ellipse",
      "circle",
      "diamond",
      "cylinder",
      "pill",
      "triangle",
      "parallelogram",
      "trapezoid",
      "pentagon",
      "hexagon",
      "octagon",
      "star",
      "cloud",
      "document",
      "callout",
      "arrow",
      "framed",
      "flag",
      "person",
      "agent",
      "icon",
    ]);
  });

  it("gives shapes to nodes and boxes only", () => {
    expect(["node", "box"].map(takesShape)).toEqual([true, true]);
    const others = ["decision", "data", "note", "tag", "group", "text", "participant", "system"];
    expect(others.filter(takesShape)).toEqual([]);
    const profiles = [FLOW_PROFILE, FREE_PROFILE, SEQUENCE_PROFILE, C4_PROFILE];
    expect(profiles.map(profileTakesShape)).toEqual([true, true, false, false]);
  });

  it("accepts every shape on a free box", () => {
    for (const shape of BOX_SHAPES) {
      const { codes, diagram: d } = free(`  box a "A"\n  style a { shape ${shape} }`);
      expect(codes, shape).toEqual([]);
      expect(d.styles[0]!.properties).toEqual({ shape });
    }
  });

  it("lists the twenty-four shapes for an unknown one", () => {
    const { found } = free('  box a "A"\n  style a { shape blob }');
    expect(BOX_SHAPES).toHaveLength(24);
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "blob",
        `Invalid value \`blob\` for \`shape\`; expected one of ${BOX_SHAPES.join(", ")}.`,
      ],
    ]);
    expect(found[0]![2]).toContain("flag, person, agent, icon.");
  });
});

describe("the icon shape", () => {
  it("is accepted on a flow node with its icon", () => {
    const { codes, diagram: d } = flow(
      '  lambda["Lambda"]\n  style lambda { icon "aws:lambda"; shape icon }',
    );
    expect(codes).toEqual([]);
    expect(stylesOf(d)).toEqual([["lambda", { icon: "aws:lambda", shape: "icon" }]]);
  });

  it("is accepted on a free box with a label position, and refused on an icon object", () => {
    const { found, diagram: d } = free(
      '  box fn "Lambda"\n  icon i "tabler:bolt"\n  style fn { shape icon; labelPosition right }\n  style i { shape icon }',
    );
    expect(stylesOf(d)[0]).toEqual(["fn", { shape: "icon", labelPosition: "right" }]);
    expect(found.map((f) => [f[0], f[1]])).toEqual([["prop.invalid-value", "shape"]]);
  });
});

describe("the agent shape", () => {
  it("is accepted on a flow node", () => {
    const { codes, diagram: d } = flow('  planner["Planner"]\n  style planner { shape agent }');
    expect(codes).toEqual([]);
    expect(stylesOf(d)).toEqual([["planner", { shape: "agent" }]]);
  });

  it("is accepted on a free box and in a rule of boxes", () => {
    const { codes, diagram: d } = free(
      '  box a "Planner"\n  style a { shape agent }\n  rule box { shape agent }',
    );
    expect(codes).toEqual([]);
    expect(stylesOf(d)).toEqual([["a", { shape: "agent" }]]);
    expect(d.rules.map((r) => [r.kind, r.properties])).toEqual([["box", { shape: "agent" }]]);
  });

  it("is refused on a decision, naming node and box", () => {
    const { found } = flow('  decision ok "OK?"\n  style ok { shape agent }');
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `decision` elements such as `ok`; it applies to `node` and `box` elements.",
      ],
    ]);
  });
});

describe("shape on flow nodes", () => {
  it("accepts a shape on a node", () => {
    const { codes, diagram: d } = flow('  api["API"]\n  style api { shape hexagon }');
    expect(codes).toEqual([]);
    expect(stylesOf(d)).toEqual([["api", { shape: "hexagon" }]]);
  });

  it("refuses a shape on a decision, naming node and box", () => {
    const { found, diagram: d } = flow('  decision ok "OK?"\n  style ok { shape ellipse }');
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `decision` elements such as `ok`; it applies to `node` and `box` elements.",
      ],
    ]);
    expect(stylesOf(d)).toEqual([["ok", {}]]);
  });

  it("refuses a shape on data stores, notes, tags and groups", () => {
    for (const declaration of [
      'data db "DB"',
      'note n "Note"',
      'tag t "Tag"',
      'group g "G" {\n    a["A"]\n  }',
    ]) {
      const id = declaration.split(" ")[1]!;
      const { found } = flow(`  ${declaration}\n  style ${id} { shape hexagon }`);
      expect(found, declaration).toHaveLength(1);
      expect(found[0]![0]).toBe("prop.invalid-value");
      expect(found[0]![1]).toBe("shape");
      expect(found[0]![2]).toContain(`such as \`${id}\`; it applies to \`node\` and \`box\``);
    }
  });

  it("reports a block for a node and a decision on the decision only", () => {
    const { found, diagram: d } = flow(
      '  api["API"]\n  decision ok "OK?"\n  style api, ok { shape hexagon; fill "#fff" }',
    );
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `decision` elements such as `ok`; it applies to `node` and `box` elements.",
      ],
    ]);
    expect(stylesOf(d)).toEqual([
      ["api", { shape: "hexagon", fill: "#fff" }],
      ["ok", { fill: "#fff" }],
    ]);
  });

  it("refuses a shape on a relation, naming node and box", () => {
    const { found, diagram: d } = flow("  a -> b as request\n  style request { shape hexagon }");
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to relations such as `request`; it applies to `node` and `box` elements.",
      ],
    ]);
    expect(stylesOf(d)).toEqual([["request", {}]]);
  });

  it("does not report a shape set again for a target that refused it", () => {
    const { codes } = flow(
      '  decision ok "OK?"\n  style ok { shape hexagon }\n  style ok { shape pill }',
    );
    expect(codes).toEqual(["prop.invalid-value", "prop.invalid-value"]);
  });

  it("takes the text size beside the shape and still refuses free alignment", () => {
    const { found } = flow('  api["API"]\n  style api { fontSize 20; shape pill; textAlign left }');
    expect(found).toEqual([
      ["prop.invalid-value", "textAlign", "`textAlign` applies to free diagrams only."],
    ]);
  });

  it("offers shape among the style properties of flow diagrams", () => {
    const { diagnostics } = flow('  api["API"]\n  style api { shade "red" }');
    expect(diagnostics[0]!.hints![0]).toContain("`shape`");
    expect(diagnostics[0]!.hints![0]).toContain("`radius`");
    expect(diagnostics[0]!.hints![0]).toContain("`fontSize`");
    expect(diagnostics[0]!.hints![0]).not.toContain("`textAlign`");
  });
});

describe("shape in free diagrams", () => {
  it("refuses a shape on a group", () => {
    const { found } = free('  group g "G" {\n    box a "A"\n  }\n  style g { shape ellipse }');
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `group` elements such as `g`; it applies to `node` and `box` elements.",
      ],
    ]);
  });

  it("refuses a shape on text, icons and images, as their rules do", () => {
    const { found, diagram: d } = free(
      '  text t "T"\n  icon i "tabler:server"\n  image p "p.png"\n  box b "B"\n  style t { shape hexagon }\n  style i { shape star }\n  style p, b { shape ellipse; fill "#fff" }\n  rule text { shape pill }',
    );
    const refusal = (kind: string, id: string) =>
      `\`shape\` does not apply to \`${kind}\` elements such as \`${id}\`; it applies to \`node\` and \`box\` elements.`;
    expect(found).toEqual([
      ["prop.invalid-value", "shape", refusal("text", "t")],
      ["prop.invalid-value", "shape", refusal("icon", "i")],
      ["prop.invalid-value", "shape", refusal("image", "p")],
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `text` elements; it applies to `node` and `box` elements.",
      ],
    ]);
    // The refused shape is dropped from the object; the box beside it keeps it.
    expect(stylesOf(d)).toEqual([
      ["t", {}],
      ["i", {}],
      ["p", { fill: "#fff" }],
      ["b", { shape: "ellipse", fill: "#fff" }],
    ]);
  });

  it("lets classes with a shape style text, icons and images, ignoring the shape", () => {
    const { codes } = free(
      '  text t "T"\n  icon i "tabler:server"\n  class round { shape circle; fill "#fff" }\n  style t, i { class round }',
    );
    expect(codes).toEqual([]);
  });

  it("accepts a shape on the kinds of declared types, drawn as boxes", () => {
    const erd = readDiagramType(
      { type: "erd", elements: { entity: { label: "Entity" } } },
      null,
    ).definition!;
    const compilation = compile(
      'diagram s: erd {\n  entity a "A"\n  style a { shape cloud }\n  rule entity { shape hexagon }\n}\n',
      { types: [erd] },
    );
    expect(compilation.diagnostics).toEqual([]);
    const d = compilation.document.diagrams[0]!;
    expect(d.styles[0]!.properties).toEqual({ shape: "cloud" });
    expect(d.rules.map((r) => [r.kind, r.properties])).toEqual([["entity", { shape: "hexagon" }]]);
  });
});

describe("shape in sequence diagrams and C4 views", () => {
  it("keeps refusing it on participants", () => {
    const { found } = compiled(
      diagram(
        "sequence",
        "  participant a\n  participant b\n  a -> b\n  style a { shape hexagon }",
      ),
    );
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `participant` elements such as `a`; it applies to `node` and `box` elements.",
      ],
    ]);
  });

  it("keeps refusing it in sequence classes", () => {
    const { found } = compiled(
      diagram("sequence", "  participant a\n  class hex { shape hexagon }"),
    );
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` applies to `node` and `box` elements; sequence diagrams draw each kind with its own shape.",
      ],
    ]);
  });

  it("keeps refusing it on the entities of C4 views, and takes a radius", () => {
    const { found } = compiled(
      'language "0.2"\nmodel m {\n  system shop "Shop"\n}\n' +
        "diagram v: c4 using m {\n  level context\n  style shop { shape hexagon; radius 4 }\n  class hex { shape hexagon }\n}\n",
    );
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `system` elements such as `shop`; it applies to `node` and `box` elements.",
      ],
      [
        "prop.invalid-value",
        "shape",
        "`shape` applies to `node` and `box` elements; C4 views draw each kind with its own shape.",
      ],
    ]);
  });
});

describe("radius", () => {
  it("is a number from 0 to 64 for elements only", () => {
    expect(STYLE_PROPERTIES.radius).toEqual({ kind: "number", min: 0, max: 64 });
    expect(ELEMENT_ONLY_PROPERTIES).toContain("radius");
    expect(ELEMENT_ONLY_PROPERTIES).toContain("shape");
  });

  it("records the radius of a group and of a node with its shape", () => {
    const { codes, diagram: d } = flow(
      '  group backend "Backend" {\n    api["API"]\n  }\n  style backend { radius 0 }\n  style api { radius 20; shape hexagon }',
    );
    expect(codes).toEqual([]);
    expect(stylesOf(d)).toEqual([
      ["backend", { radius: 0 }],
      ["api", { radius: 20, shape: "hexagon" }],
    ]);
  });

  it("takes pixels and the bounds of its range, on boxes, notes and groups of free diagrams", () => {
    const { codes, diagram: d } = free(
      '  group g "G" {\n    box a "A"\n  }\n  box b "B"\n  style a { radius 12px }\n  style b { radius 64 }\n  style g { radius 0 }',
    );
    expect(codes).toEqual([]);
    expect(stylesOf(d)).toEqual([
      ["a", { radius: 12 }],
      ["b", { radius: 64 }],
      ["g", { radius: 0 }],
    ]);
    expect(flow('  note n "N"\n  style n { radius 4 }').codes).toEqual([]);
  });

  it("names the range when out of it, and refuses relations", () => {
    const {
      found,
      diagnostics,
      diagram: d,
    } = flow(
      '  api["API"]\n  api -> db as request\n  style api { radius 99 }\n  style request { radius 4 }',
    );
    expect(found).toEqual([
      ["prop.invalid-value", "99", "`radius` expects a number from 0 to 64."],
      ["prop.invalid-value", "radius", "`radius` does not apply to relations such as `request`."],
    ]);
    expect(diagnostics[1]!.hints).toEqual(["`radius` applies to elements."]);
    expect(stylesOf(d)).toEqual([
      ["api", {}],
      ["request", {}],
    ]);
  });

  it("refuses a negative radius and a percentage", () => {
    expect(flow('  api["API"]\n  style api { radius -1 }').codes).toEqual(["prop.invalid-value"]);
    expect(flow('  api["API"]\n  style api { radius 10% }').codes).toEqual(["prop.invalid-value"]);
  });

  it("keeps the theme tokens' range", () => {
    const { found } = compiled("theme t { groupRadius 80 }\n");
    expect(found).toEqual([
      ["prop.invalid-value", "80", "`groupRadius` expects a number from 0 to 64."],
    ]);
  });
});

describe("shape and radius in rules and classes", () => {
  it("lets rules of groups, nodes and notes set a radius", () => {
    const { codes, diagram: d } = flow(
      "  a -> b\n  rule group { radius 0 }\n  rule node { radius 2 }\n  rule note { radius 4 }",
    );
    expect(codes).toEqual([]);
    expect(d.rules.map((r) => [r.kind, r.properties])).toEqual([
      ["group", { radius: 0 }],
      ["node", { radius: 2 }],
      ["note", { radius: 4 }],
    ]);
    expect(free('  box a "A"\n  rule box { radius 0; shape octagon }').codes).toEqual([]);
  });

  it("lets rules of nodes and boxes set a shape, and refuses it for other kinds", () => {
    const { found, diagram: d } = flow(
      '  a -> b\n  rule node { shape hexagon }\n  rule decision { shape hexagon; fill "#fff" }',
    );
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `decision` elements; it applies to `node` and `box` elements.",
      ],
    ]);
    expect(d.rules.map((r) => [r.kind, r.properties])).toEqual([
      ["node", { shape: "hexagon" }],
      ["decision", { fill: "#fff" }],
    ]);
  });

  it("refuses shape and radius in rules of relations", () => {
    const { found } = flow("  a -> b\n  rule relation { shape pill; radius 4 }");
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to relations; it applies to `node` and `box` elements.",
      ],
      ["prop.invalid-value", "radius", "`radius` does not apply to relations."],
    ]);
  });

  it("refuses a shape in a theme rule for groups, and takes it for boxes", () => {
    const { found, theme } = compiled(
      "theme t {\n  rule group { shape ellipse; radius 0 }\n  rule box { shape star }\n}\n",
    );
    expect(found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` does not apply to `group` elements; it applies to `node` and `box` elements.",
      ],
    ]);
    expect(theme!.rules.map((r) => [r.kind, r.properties])).toEqual([
      ["group", { radius: 0 }],
      ["box", { shape: "star" }],
    ]);
  });

  it("lets classes carry a shape and a radius, ignored where they do not apply", () => {
    const { codes, diagram: d } = flow(
      '  decision ok "OK?"\n  api["API"]\n  class round { shape circle; radius 6 }\n  style ok, api { class round }',
    );
    expect(codes).toEqual([]);
    expect(d.classes.map((c) => [c.id, c.properties])).toEqual([
      ["round", { shape: "circle", radius: 6 }],
    ]);
  });
});

describe("shape in the model JSON", () => {
  it("emits the shape the declaration implies, right after the source", () => {
    const { compilation } = flow('  db[("Database")]\n  node api "API"\n  data ledger "Ledger"');
    const [d] = toJson(compilation).diagrams;
    expect(d!.elements.map((e) => [e.id, e.shape])).toEqual([
      ["db", "cylinder"],
      ["api", null],
      ["ledger", null],
    ]);
    for (const element of d!.elements) {
      const keys = Object.keys(element);
      expect(keys[keys.indexOf("shape") - 1]).toBe("source");
    }
  });

  it("keeps a style's shape in the styles", () => {
    const { compilation } = free('  db[("Orders")]\n  box a "A"\n  style a { shape hexagon }');
    const [d] = toJson(compilation).diagrams;
    expect(d!.elements.map((e) => [e.id, e.shape])).toEqual([
      ["db", "cylinder"],
      ["a", null],
    ]);
    expect(d!.styles[0]!.properties).toEqual({ shape: "hexagon" });
  });
});

describe("the words of shape refusals", () => {
  afterEach(() => setLocale("en"));

  it("are in Spanish too", () => {
    setLocale("es");
    const { found } = flow(
      '  decision ok "OK?"\n  a -> ok as r\n  style ok { shape hexagon }\n  style r { shape pill }\n  rule tag { shape star }\n  style a { textAlign left }',
    );
    expect(found.map((f) => f[2])).toEqual([
      "`shape` no se aplica a los elementos `decision` como `ok`; se aplica a los elementos `node` y `box`.",
      "`shape` no se aplica a las relaciones como `r`; se aplica a los elementos `node` y `box`.",
      "`shape` no se aplica a los elementos `tag`; se aplica a los elementos `node` y `box`.",
      "`textAlign` solo se aplica a las composiciones libres.",
    ]);
    expect(free('  icon i "tabler:server"\n  style i { shape star }').found).toEqual([
      [
        "prop.invalid-value",
        "shape",
        "`shape` no se aplica a los elementos `icon` como `i`; se aplica a los elementos `node` y `box`.",
      ],
    ]);
  });
});
