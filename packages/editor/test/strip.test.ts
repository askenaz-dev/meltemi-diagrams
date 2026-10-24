import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import {
  analyzeDocument,
  CanvasSession,
  type CanvasAction,
  type HostMessage,
  type InspectorModel,
} from "../src/index.js";

const SHEET = [
  'language "0.2"',
  "",
  "theme brand {",
  '  extends "technical.light"',
  '  accent "#6A4FD0"',
  "  dashDuration 600ms",
  "}",
  "",
  "diagram checkout: flow {",
  "  layout manual",
  "  node api",
  "  node db",
  "  node cache",
  "  api -> db as save",
  "  animate save { effect dash }",
  "  animate api { effect pulse }",
  "  placement {",
  "    place api at (100, 100)",
  "    place db at (400, 100)",
  "    place cache at (400, 300)",
  "  }",
  "}",
  "",
].join("\n");

function open(text: string) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  let messages: readonly HostMessage[] = session.update(
    analyzeDocument({ text: current, revision: rev }),
  );
  const send = (message: unknown) => {
    const result = session.receive(message);
    if (result.plan) {
      current = applyTextEdits(current, result.plan.edits);
      rev++;
      messages = session.update(analyzeDocument({ text: current, revision: rev }));
    } else if (result.messages.length > 0) {
      messages = [...result.messages];
    }
    return result;
  };
  send({ type: "pickDiagram", diagram: "checkout" });
  return {
    send,
    text: () => current,
    apply: (action: CanvasAction) => {
      const result = send({ type: "action", revision: rev, action });
      if (!result.plan) throw new Error(JSON.stringify(result.messages));
      return result;
    },
    inspector: (): InspectorModel =>
      messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model,
  };
}

const strip = (model: InspectorModel) =>
  model.fields.filter((f) => f.section === "strip").map((f) => f.name);

describe("style strip", () => {
  it("comes first for a box: colours, line, width, corner radius, rotation, shape and its effects", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "select", ids: ["db"] });
    const model = canvas.inspector();
    expect(strip(model)).toEqual([
      "style.fill",
      "style.stroke",
      "style.color",
      "style.line",
      "style.width",
      "style.radius",
      "style.rotation",
      "style.shape",
      "effect.dash",
      "effect.pulse",
    ]);
    expect(model.fields.slice(0, 10).every((f) => f.section === "strip")).toBe(true);
  });

  it("offers the theme's colour tokens with the colours it resolves them to", () => {
    const canvas = open(SHEET.replace("  layout manual", '  theme "brand"\n  layout manual'));
    canvas.send({ type: "select", ids: ["db"] });
    const fill = canvas.inspector().fields.find((f) => f.name === "style.fill")!;
    expect(fill.swatches).toHaveLength(16);
    expect(fill.swatches!.map((s) => s.token).slice(0, 3)).toEqual([
      "background",
      "surface",
      "ink",
    ]);
    expect(fill.swatches!.find((s) => s.token === "accent")!.color).toBe("#6A4FD0");
    expect(fill.swatches!.find((s) => s.token === "danger")!.color).toMatch(/^#/);
  });

  it("shows a relation's line, heads, route, corners and the four effects, with the theme's speed", () => {
    const canvas = open(SHEET.replace("  layout manual", '  theme "brand"\n  layout manual'));
    canvas.send({ type: "select", ids: ["save"] });
    const model = canvas.inspector();
    expect(strip(model)).toEqual([
      "style.fill",
      "style.stroke",
      "style.color",
      "line",
      "style.width",
      "style.arrowtail",
      "style.arrowhead",
      "style.routing",
      "style.corners",
      "effect.flow",
      "effect.dash",
      "effect.dash.duration",
      "effect.dash.repeat",
      "effect.dash.delay",
      "effect.dash.direction",
      "effect.pulse",
      "effect.trace",
    ]);
    const speed = model.fields.find((f) => f.name === "effect.dash.duration")!;
    expect(speed).toMatchObject({ value: null, placeholder: "600", group: "effect.dash" });
    // Every field of the dash belongs to its card; the toggles belong to none.
    for (const name of ["effect.dash.repeat", "effect.dash.delay", "effect.dash.direction"]) {
      expect(model.fields.find((f) => f.name === name)).toMatchObject({ group: "effect.dash" });
    }
    expect(model.fields.find((f) => f.name === "effect.dash")!.group).toBeUndefined();
    expect(model.fields.some((f) => f.section !== "strip" && f.name.startsWith("effect."))).toBe(
      false,
    );
    // Pictures, with what applies without a written value.
    const field = (name: string) => model.fields.find((f) => f.name === name)!;
    expect(field("line")).toMatchObject({ value: "solid", glyphs: "line" });
    expect(field("line").options).toEqual(["solid", "dashed", "dotted"]);
    expect(field("style.arrowtail")).toMatchObject({ placeholder: "none", glyphs: "arrowStart" });
    expect(field("style.arrowhead")).toMatchObject({ placeholder: "triangle", glyphs: "arrowEnd" });
    expect(field("style.routing")).toMatchObject({ placeholder: "auto", glyphs: "route" });
    expect(field("style.corners")).toMatchObject({ placeholder: "sharp", glyphs: "corners" });
    expect(model.fields.some((f) => f.name === "style.line")).toBe(false);
  });

  it("shows a line's heads as none greyed, writes a head, and keeps it a line when dashed", () => {
    const canvas = open(SHEET.replace("  api -> db as save", "  api -- db as save"));
    canvas.send({ type: "select", ids: ["save"] });
    const field = (name: string) => canvas.inspector().fields.find((f) => f.name === name)!;
    expect(field("style.arrowhead")).toMatchObject({ value: null, placeholder: "none" });
    expect(field("style.arrowtail")).toMatchObject({ value: null, placeholder: "none" });
    canvas.apply({ kind: "setField", ids: ["save"], field: "style.arrowhead", value: "triangle" });
    expect(canvas.text()).toContain("style save { arrowhead triangle }");
    canvas.send({ type: "select", ids: ["save"] });
    canvas.apply({ kind: "setField", ids: ["save"], field: "line", value: "dashed" });
    expect(canvas.text()).toContain("  api --- db as save\n");
  });

  it("gives a selection of several targets the toggles only, with no grouped field", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "select", ids: ["api", "db", "cache"] });
    const model = canvas.inspector();
    expect(model.fields.find((f) => f.name === "effect.pulse")).toMatchObject({
      value: null,
      mixed: true,
      section: "strip",
    });
    expect(model.fields.some((f) => f.group !== undefined)).toBe(false);
    expect(model.fields.some((f) => /^effect\.\w+\./.test(f.name))).toBe(false);
  });

  it("writes the line as the arrow or a dotted style, and keeps a two-way arrow two-way", () => {
    const canvas = open(SHEET.replace("  api -> db as save", "  api <-> db as save"));
    canvas.send({ type: "select", ids: ["save"] });
    const field = (name: string) => canvas.inspector().fields.find((f) => f.name === name)!;
    // A two-way arrow's start takes the end's head.
    expect(field("style.arrowtail").placeholder).toBe("triangle");
    canvas.apply({ kind: "setField", ids: ["save"], field: "line", value: "dotted" });
    expect(canvas.text()).toContain("style save { line dotted }");
    canvas.send({ type: "select", ids: ["save"] });
    expect(field("line").value).toBe("dotted");
    canvas.apply({ kind: "setField", ids: ["save"], field: "line", value: "dashed" });
    expect(canvas.text()).toContain("  api <--> db as save\n");
    expect(canvas.text()).not.toContain("line dotted");
    canvas.apply({ kind: "setField", ids: ["save"], field: "style.arrowtail", value: "diamond" });
    expect(canvas.text()).toContain("style save { arrowtail diamond }");
  });

  it("names an anonymous relation to make it dotted", () => {
    const canvas = open(SHEET.replace("  api -> db as save", "  api -> db as save\n  db -> cache"));
    canvas.send({ type: "select", ids: ["db->cache#1"] });
    canvas.apply({ kind: "setField", ids: ["db->cache#1"], field: "line", value: "dotted" });
    expect(canvas.text()).toContain("  db -> cache as db_cache\n");
    expect(canvas.text()).toContain("style db_cache { line dotted }");
  });

  it("keeps the engine's speed for a built-in theme", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "select", ids: ["save"] });
    expect(
      canvas.inspector().fields.find((f) => f.name === "effect.dash.duration")!.placeholder,
    ).toBe("1000");
  });

  it("starts the diagram's fields with the theme and its counterpart", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "select", ids: [] });
    const theme = canvas.inspector().fields[0]!;
    expect(theme).toMatchObject({
      name: "theme",
      section: "strip",
      quick: [{ label: "Dark", value: "technical.dark" }],
    });
    canvas.apply({ kind: "setField", ids: [], field: "theme", value: "technical.dark" });
    expect(canvas.text()).toContain('  theme "technical.dark"\n');
    canvas.send({ type: "select", ids: [] });
    expect(canvas.inspector().fields[0]!.quick).toEqual([
      { label: "Light", value: "technical.light" },
    ]);
    // The sketch family switches the same way, and the theme field offers it.
    canvas.apply({ kind: "setField", ids: [], field: "theme", value: "sketch.light" });
    canvas.send({ type: "select", ids: [] });
    expect(canvas.inspector().fields[0]!.quick).toEqual([{ label: "Dark", value: "sketch.dark" }]);
    expect(canvas.inspector().fields[0]!.options).toEqual(
      expect.arrayContaining(["sketch.light", "sketch.dark"]),
    );
  });

  it("styles a selection in one step and shows shared effects as mixed", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "select", ids: ["api", "db", "cache"] });
    const model = canvas.inspector();
    expect(model.fields.find((f) => f.name === "effect.pulse")).toMatchObject({
      value: null,
      mixed: true,
    });
    expect(model.fields.find((f) => f.name === "style.fill")).toMatchObject({
      value: null,
      fromTheme: true,
    });
    const result = canvas.apply({
      kind: "setField",
      ids: ["api", "db", "cache"],
      field: "style.fill",
      value: "surface",
    });
    expect(result.plan!.operation.kind).toBe("batch");
    for (const id of ["api", "db", "cache"]) {
      expect(canvas.text()).toContain(`style ${id} { fill surface }`);
    }
  });
});

describe("corner radius and shape", () => {
  const FREE = [
    'language "0.2"',
    "",
    "diagram board: free {",
    '  group g "G" {',
    '    box a "A"',
    "  }",
    '  text t "T"',
    "  placement {",
    "    place g at (300, 200)",
    "    size g (400, 240)",
    "    place a at (80, 30)",
    "    place t at (700, 100)",
    "  }",
    "}",
    "",
  ].join("\n");

  function board() {
    const canvas = open(FREE);
    canvas.send({ type: "pickDiagram", diagram: "board" });
    return canvas;
  }

  const field = (model: InspectorModel, name: string) => model.fields.find((f) => f.name === name);

  it("shows the shape of a node with pictures and its radius with a slider, the theme's greyed", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "select", ids: ["api"] });
    const model = canvas.inspector();
    expect(field(model, "style.shape")).toMatchObject({
      label: "Shape",
      type: "enum",
      value: null,
      placeholder: "rounded",
      glyphs: "shape",
      section: "strip",
    });
    expect(field(model, "style.shape")!.options).toHaveLength(24);
    expect(field(model, "style.radius")).toMatchObject({
      label: "Corner radius",
      type: "number",
      value: null,
      placeholder: "8",
      range: { min: 0, max: 64, step: 1 },
      section: "strip",
    });
  });

  it("greys the radius a rule gives", () => {
    const canvas = open(SHEET.replace("  node api\n", "  rule node { radius 2 }\n  node api\n"));
    canvas.send({ type: "select", ids: ["api"] });
    expect(field(canvas.inspector(), "style.radius")).toMatchObject({
      value: null,
      placeholder: "2",
    });
  });

  it("writes the radius from the strip as a number", () => {
    const canvas = open(SHEET);
    canvas.apply({ kind: "setField", ids: ["api"], field: "style.radius", value: 0 });
    expect(canvas.text()).toContain("style api { radius 0 }");
    canvas.apply({ kind: "setField", ids: ["db"], field: "style.radius", value: "12px" });
    expect(canvas.text()).toContain("style db { radius 12 }");
    canvas.send({ type: "select", ids: ["api"] });
    expect(field(canvas.inspector(), "style.radius")).toMatchObject({ value: 0 });
  });

  it("refuses a radius out of range and leaves the text as it is", () => {
    const canvas = open(SHEET);
    const result = canvas.send({
      type: "action",
      revision: 1,
      action: { kind: "setField", ids: ["api"], field: "style.radius", value: 90 },
    });
    expect(result.plan).toBeUndefined();
    expect(result.messages[0]).toMatchObject({
      type: "rejected",
      reason: "Write a number from 0 to 64.",
    });
    expect(canvas.text()).toBe(SHEET);
  });

  it("greys the theme's group radius and writes a square group", () => {
    const canvas = board();
    canvas.send({ type: "select", ids: ["g"] });
    const model = canvas.inspector();
    expect(field(model, "style.radius")).toMatchObject({ value: null, placeholder: "14" });
    expect(field(model, "style.shape")).toBeUndefined();
    canvas.apply({ kind: "setField", ids: ["g"], field: "style.radius", value: 0 });
    expect(canvas.text()).toContain("style g { radius 0 }");
  });

  it("writes a box's shape by its picture", () => {
    const canvas = board();
    canvas.send({ type: "select", ids: ["a"] });
    expect(field(canvas.inspector(), "style.shape")).toMatchObject({ placeholder: "rounded" });
    canvas.apply({ kind: "setField", ids: ["a"], field: "style.shape", value: "ellipse" });
    expect(canvas.text()).toContain("style a { shape ellipse }");
    canvas.send({ type: "select", ids: ["a"] });
    expect(field(canvas.inspector(), "style.shape")).toMatchObject({ value: "ellipse" });
  });

  it("offers them only to the kinds that take them", () => {
    const flow = open(
      SHEET.replace("  node cache", '  node cache\n  decision ok "OK?"\n  note memo "Memo"'),
    );
    // A decision's diamond takes a radius on its vertices, sharp by default; it takes no shape.
    flow.send({ type: "select", ids: ["ok"] });
    expect(field(flow.inspector(), "style.shape")).toBeUndefined();
    expect(field(flow.inspector(), "style.radius")).toMatchObject({ placeholder: "0" });
    flow.send({ type: "select", ids: ["memo"] });
    expect(field(flow.inspector(), "style.shape")).toBeUndefined();
    expect(field(flow.inspector(), "style.radius")).toMatchObject({ placeholder: "8" });
    // Several: what every one of them takes.
    flow.send({ type: "select", ids: ["api", "db"] });
    expect(strip(flow.inspector())).toEqual(
      expect.arrayContaining(["style.radius", "style.shape"]),
    );
    flow.send({ type: "select", ids: ["api", "memo"] });
    expect(field(flow.inspector(), "style.shape")).toBeUndefined();
    expect(field(flow.inspector(), "style.radius")).toMatchObject({ placeholder: "8" });
    flow.send({ type: "select", ids: ["api", "save"] });
    expect(field(flow.inspector(), "style.radius")).toBeUndefined();
    const free = board();
    // A text's frame (a fill, a stroke or a pattern) has the radius; it takes no shape.
    free.send({ type: "select", ids: ["t"] });
    expect(field(free.inspector(), "style.shape")).toBeUndefined();
    expect(field(free.inspector(), "style.radius")).toMatchObject({ placeholder: "8" });
    // A group and a box share no default radius.
    free.send({ type: "select", ids: ["g", "a"] });
    expect(field(free.inspector(), "style.radius")!.placeholder).toBeUndefined();
  });

  it("shows the radius wherever corners are drawn, and none on shapes without corners", () => {
    const flow = open(
      SHEET.replace("  placement {", "  style db { shape hexagon }\n  placement {").replace(
        "  node cache\n",
        "  node cache\n  style cache { shape circle }\n",
      ),
    );
    // A hexagon's vertices are sharp until a radius rounds them.
    flow.send({ type: "select", ids: ["db"] });
    expect(field(flow.inspector(), "style.shape")).toMatchObject({ value: "hexagon" });
    expect(field(flow.inspector(), "style.radius")).toMatchObject({
      value: null,
      placeholder: "0",
    });
    expect(strip(flow.inspector())).toContain("style.radius");
    flow.apply({ kind: "setField", ids: ["db"], field: "style.radius", value: 10 });
    expect(flow.text()).toContain("style db { shape hexagon; radius 10 }");
    // A circle has no corners.
    flow.send({ type: "select", ids: ["cache"] });
    expect(field(flow.inspector(), "style.radius")).toBeUndefined();
    // Several: a rounded node and a hexagon both draw a radius, which they do not share.
    flow.send({ type: "select", ids: ["api", "db"] });
    expect(field(flow.inspector(), "style.radius")).toBeDefined();
    expect(field(flow.inspector(), "style.radius")!.placeholder).toBeUndefined();
    // A rounded node and a circle do not both draw one.
    flow.send({ type: "select", ids: ["api", "cache"] });
    expect(field(flow.inspector(), "style.radius")).toBeUndefined();
    const canvas = board();
    const drawn: Record<string, string | undefined> = {
      rectangle: "0",
      square: "0",
      framed: "0",
      hexagon: "0",
      star: "0",
      person: "24",
      agent: "12",
      icon: "8",
      pill: undefined,
      ellipse: undefined,
      circle: undefined,
      cylinder: undefined,
      cloud: undefined,
      document: undefined,
    };
    for (const [shape, placeholder] of Object.entries(drawn)) {
      canvas.apply({ kind: "setField", ids: ["a"], field: "style.shape", value: shape });
      canvas.send({ type: "select", ids: ["a"] });
      const radius = field(canvas.inspector(), "style.radius");
      if (placeholder === undefined) expect(radius, shape).toBeUndefined();
      else expect(radius, shape).toMatchObject({ placeholder });
    }
    canvas.apply({ kind: "setField", ids: ["a"], field: "style.shape", value: null });
    canvas.send({ type: "select", ids: ["a"] });
    expect(field(canvas.inspector(), "style.radius")).toMatchObject({ placeholder: "8" });
  });

  it("shows the text alignment after the shape: both for a box, across for a text, none on a node", () => {
    const canvas = board();
    canvas.send({ type: "select", ids: ["a"] });
    const box = canvas.inspector();
    const names = strip(box);
    expect(names.slice(names.indexOf("style.shape"), names.indexOf("style.shape") + 3)).toEqual([
      "style.shape",
      "style.textAlign",
      "style.verticalAlign",
    ]);
    expect(field(box, "style.textAlign")).toMatchObject({
      label: "Text alignment",
      type: "enum",
      value: null,
      placeholder: "center",
      options: ["left", "center", "right"],
      glyphs: "textAlign",
    });
    expect(field(box, "style.verticalAlign")).toMatchObject({
      label: "Vertical alignment",
      value: null,
      placeholder: "middle",
      options: ["top", "middle", "bottom"],
      glyphs: "verticalAlign",
    });
    canvas.send({ type: "select", ids: ["t"] });
    const text = canvas.inspector();
    expect(field(text, "style.textAlign")).toMatchObject({ placeholder: "left", section: "strip" });
    expect(field(text, "style.verticalAlign")).toBeUndefined();
    const node = open(SHEET);
    node.send({ type: "select", ids: ["api"] });
    expect(field(node.inspector(), "style.textAlign")).toBeUndefined();
    expect(field(node.inspector(), "style.verticalAlign")).toBeUndefined();
  });

  it("writes both alignments in one edit, and greys what a rule gives, not what is written", () => {
    const canvas = board();
    canvas.apply({
      kind: "setFields",
      ids: ["a"],
      fields: [
        { field: "style.textAlign", value: "left" },
        { field: "style.verticalAlign", value: "top" },
      ],
    });
    expect(canvas.text()).toContain("style a { textAlign left; verticalAlign top }");
    canvas.send({ type: "select", ids: ["a"] });
    expect(field(canvas.inspector(), "style.textAlign")).toMatchObject({
      value: "left",
      placeholder: "center",
    });
    canvas.apply({ kind: "setField", ids: ["a"], field: "style.verticalAlign", value: null });
    expect(canvas.text()).toContain("style a { textAlign left }");
    const ruled = open(
      FREE.replace('  group g "G" {\n', '  rule box { verticalAlign top }\n  group g "G" {\n'),
    );
    ruled.send({ type: "pickDiagram", diagram: "board" });
    ruled.send({ type: "select", ids: ["a"] });
    expect(field(ruled.inspector(), "style.verticalAlign")).toMatchObject({
      value: null,
      placeholder: "top",
    });
  });
});

describe("rotation", () => {
  const field = (model: InspectorModel, name: string) => model.fields.find((f) => f.name === name);

  it("is a slider from 0 to 359 with 0 greyed, written and removed from the strip", () => {
    const canvas = open(SHEET);
    canvas.send({ type: "select", ids: ["api"] });
    expect(field(canvas.inspector(), "style.rotation")).toMatchObject({
      label: "Rotation",
      type: "number",
      value: null,
      placeholder: "0",
      range: { min: 0, max: 359, step: 1 },
      section: "strip",
    });
    canvas.apply({ kind: "setField", ids: ["api"], field: "style.rotation", value: 30 });
    expect(canvas.text()).toContain("style api { rotation 30 }");
    canvas.send({ type: "select", ids: ["api"] });
    expect(field(canvas.inspector(), "style.rotation")).toMatchObject({ value: 30 });
    canvas.apply({ kind: "setField", ids: ["api"], field: "style.rotation", value: 0 });
    expect(canvas.text()).not.toContain("rotation");
  });

  it("greys a rule's angle and is not offered on a group", () => {
    const canvas = open(
      SHEET.replace(
        "  node api\n",
        '  rule node { rotation 15 }\n  group g "G" {\n    node api\n  }\n',
      ),
    );
    canvas.send({ type: "select", ids: ["api"] });
    expect(field(canvas.inspector(), "style.rotation")).toMatchObject({ placeholder: "15" });
    canvas.send({ type: "select", ids: ["g"] });
    expect(field(canvas.inspector(), "style.rotation")).toBeUndefined();
  });

  it("refuses an angle out of range", () => {
    const canvas = open(SHEET);
    const result = canvas.send({
      type: "action",
      revision: 1,
      action: { kind: "setField", ids: ["api"], field: "style.rotation", value: 400 },
    });
    expect(result.plan).toBeUndefined();
    expect(canvas.text()).toBe(SHEET);
  });
});

describe("the Icon field", () => {
  it("writes the icon the canvas's picker chose for a node and a relation in one edit", () => {
    const canvas = open(SHEET);
    const result = canvas.apply({
      kind: "setField",
      ids: ["api", "save"],
      field: "style.icon",
      value: "tabler:server",
    });
    expect(result.plan!.operation.kind).toBe("batch");
    expect(canvas.text()).toContain('style api { icon "tabler:server" }');
    expect(canvas.text()).toContain('style save { icon "tabler:server" }');
  });
});
