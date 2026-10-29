import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { IconRegistry, type ImageResolver } from "@meltemi/diagrams-assets";
import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  TextMetrics,
  estimateMeasurer,
  THEMES,
  layoutDiagram,
  penPath,
  stacked,
  wrapLines,
  type GroupItem,
  type ImageItem,
  type LayoutEngine,
  type LayoutOptions,
  type PathItem,
  type RectItem,
  type Scene,
  type SceneItem,
  type TextItem,
} from "../src/index.js";

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';

function run(body: string, options: LayoutOptions = {}, extra = "") {
  const compilation = compile(`${PLAIN}${extra}diagram d: free {\n  theme "plain"\n${body}\n}\n`);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const diagram = compilation.document.diagrams.find((d) => d.id === "d")!;
  const result = layoutDiagram(compilation, diagram, options);
  return { ...result, codes: result.diagnostics.map((d) => d.code) };
}

function scene(body: string, options: LayoutOptions = {}): Scene {
  const result = run(body, options);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return result.scene;
}

function element(scene: Scene, id: string): GroupItem {
  const found = scene.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === "element",
  );
  if (!found) throw new Error(`no element ${id}`);
  return found;
}

const of = <K extends SceneItem["kind"]>(g: GroupItem, kind: K) =>
  g.items.filter((i): i is Extract<SceneItem, { kind: K }> => i.kind === kind);

describe("free lines", () => {
  /** The scene point of a diagram point: the scene is moved by the layout's offset. */
  const at = (result: ReturnType<typeof run>, x: number, y: number) => ({
    x: x + result.offset!.x,
    y: y + result.offset!.y,
  });

  it("draws a straight line as a connector of its own, with no head", () => {
    const result = run("  line l from (40, 200) to (520, 200)");
    const group = element(result.scene!, "l");
    const [line] = of(group, "polyline");
    expect(line!.points).toEqual([at(result, 40, 200), at(result, 520, 200)]);
    expect(line).toMatchObject({ stroke: "#526579", strokeWidth: 1.3 });
    expect(of(group, "path")).toEqual([]);
    expect(group.track).toEqual(line!.points);
    expect(result.boxes!.get("l")).toEqual({ x: 40, y: 200, width: 480, height: 1 });
    expect(result.connectors!.get("l")).toMatchObject({
      points: [
        { x: 40, y: 200 },
        { x: 520, y: 200 },
      ],
      via: [],
    });
  });

  it("rounds a bend, cuts a head and stops the line at its base", () => {
    const result = run(
      "  line l from (0, 0) to (200, 100) via [(200, 0)]\n  style l { routing orthogonal; corners rounded; arrowhead triangle }",
    );
    const drawn = result.connectors!.get("l")!.line;
    expect(drawn).toContainEqual({ x: 190, y: 0 });
    expect(drawn).toContainEqual({ x: 200, y: 10 });
    expect(drawn).not.toContainEqual({ x: 200, y: 0 });
    // The head points down at (200, 100); the line stops above it.
    expect(drawn.at(-1)!.x).toBe(200);
    expect(drawn.at(-1)!.y).toBeLessThan(100);
    const [head] = of(element(result.scene!, "l"), "path");
    expect(head!.fill).toBe("#526579");
  });

  it("routes a line as written: straight by default, elbows when orthogonal, a curve with bezier", () => {
    const plain = run(
      "  routing orthogonal\n  line l from (100, 100) to (300, 100) via [(200, 150)]",
    );
    expect(plain.connectors!.get("l")!.points).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      { x: 300, y: 100 },
    ]);
    const elbow = run("  line l from (0, 0) to (200, 100)\n  style l { routing orthogonal }");
    expect(elbow.connectors!.get("l")!.points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
    ]);
    const curved = run(
      "  line l from (0, 0) to (200, 0) via [(100, 60)]\n  style l { routing bezier }",
    );
    const group = element(curved.scene!, "l");
    const [path] = of(group, "path");
    expect(path!.d).toMatch(/C/);
    expect(path!.fill).toBe("none");
    expect(group.track!.length).toBeGreaterThan(3);
  });

  it("moves a line with its group, which keeps its statement", () => {
    const body = (x: number) =>
      `  group g "G" {\n    line l from (20, 40) to (120, 40)\n  }\n  placement {\n    place g at (${x}, 200)\n    size g (400, 240)\n  }`;
    const left = run(body(300));
    const right = run(body(500));
    expect(right.boxes!.get("l")!.x - left.boxes!.get("l")!.x).toBe(200);
    expect(left.origins!.get("l")).toEqual({ x: 116, y: 120 });
    expect(left.boxes!.get("l")).toMatchObject({ x: 136, y: 160 });
  });

  it("draws a label pill at the middle, or where its label statement puts it", () => {
    const middle = run('  line l "Step" from (0, 0) to (300, 0)');
    const pill = middle.labels!.get("l")!;
    expect(pill.x + pill.width / 2).toBeCloseTo(150, 5);
    const label = element(middle.scene!, "l").items.find(
      (i) => i.kind === "group" && i.role === "label",
    );
    expect(label).toBeDefined();
    const moved = run('  line l "Step" from (0, 0) to (300, 0)\n  placement { label l at 20% }');
    const box = moved.labels!.get("l")!;
    expect(box.x + box.width / 2).toBeCloseTo(60, 5);
  });

  it("paints a line in source order and leaves it out of the composition checks", () => {
    const result = run(
      '  box a "A"\n  line l from (0, 20) to (200, 20)\n  box b "B"\n  placement {\n    place a at (60, 20)\n    place b at (300, 20)\n  }',
    );
    const order = result
      .scene!.items.filter((i): i is GroupItem => i.kind === "group" && i.role === "element")
      .map((i) => i.id);
    expect(order).toEqual(["a", "l", "b"]);
    expect(result.codes).not.toContain("layout.overlap");
  });

  it("draws a line with no length as a point, and says so", () => {
    const result = run("  line l from (10, 10) to (10, 10)");
    const warning = result.diagnostics.find((d) => d.code === "layout.degenerate-line");
    expect(warning).toMatchObject({ severity: "warning" });
    const [dot] = of(element(result.scene!, "l"), "path");
    expect(dot!.fill).toBe("#526579");
  });

  it("draws the heads written on a line, shorter by their lengths", () => {
    const result = run(
      "  line l from (0, 0) to (200, 0)\n  style l { arrowtail circle; arrowhead triangle }",
    );
    const drawn = result.connectors!.get("l")!.line;
    expect(drawn[0]!.x).toBeGreaterThan(0);
    expect(drawn.at(-1)!.x).toBeLessThan(200);
    expect(of(element(result.scene!, "l"), "path")).toHaveLength(2);
  });

  it("derives a group's size from the line it holds", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n    line l from (0, 120) to (400, 120)\n  }\n  placement {\n    place g at (300, 200)\n    place a at (80, 28)\n  }',
    );
    const group = result.boxes!.get("g")!;
    const line = result.boxes!.get("l")!;
    expect(group.x).toBeLessThanOrEqual(line.x);
    expect(group.x + group.width).toBeGreaterThanOrEqual(line.x + line.width);
  });
});

describe("pen strokes", () => {
  /** The scene point of a diagram point: the scene is moved by the layout's offset. */
  const at = (result: ReturnType<typeof run>, x: number, y: number) => ({
    x: x + result.offset!.x,
    y: y + result.offset!.y,
  });
  const strokeOf = (group: GroupItem) => of(group, "path")[0]!;
  const { ink, accent, highlight } = THEMES["technical.light"]!;

  it("draws a stroke as one path through the midpoints of its points", () => {
    expect(
      penPath([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
      ]),
    ).toBe("M 0 0 Q 20 0 20 10 L 20 20");
    const result = run("  pen p [(0, 0), (20, 0), (20, 20)]\n  style p { width 3 }");
    const group = element(result.scene!, "p");
    const [p0, p1, mid, p2] = [
      at(result, 0, 0),
      at(result, 20, 0),
      at(result, 20, 10),
      at(result, 20, 20),
    ];
    expect(group.items).toEqual([
      {
        kind: "path",
        d: `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${mid.x} ${mid.y} L ${p2.x} ${p2.y}`,
        fill: "none",
        stroke: ink,
        strokeWidth: 3,
        dashed: false,
        rounded: true,
      },
    ]);
    expect(group.track).toEqual([p0, p1, p2]);
    expect(group.freehand).toBe(true);
    // The box of the points grown by half the width, where the scene and hosts find it.
    const bounds = { x: -1.5, y: -1.5, width: 23, height: 23 };
    expect(group.bounds).toMatchObject({ ...at(result, -1.5, -1.5), width: 23, height: 23 });
    expect(result.boxes!.get("p")).toEqual(bounds);
    expect(result.pens!.get("p")).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
      ],
      bounds,
      width: 3,
    });
    // The canvas holds the stroke and its margins.
    expect(result.scene!.width).toBe(23 + 2 * 20);
    expect(result.codes).toEqual([]);
  });

  it("draws two points as a segment, 3 wide in the theme's ink by default", () => {
    const result = run("  pen p [(0, 0), (30.5, 40)]");
    const [a, b] = [at(result, 0, 0), at(result, 30.5, 40)];
    expect(strokeOf(element(result.scene!, "p"))).toMatchObject({
      d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
      stroke: ink,
      strokeWidth: 3,
    });
    expect(result.pens!.get("p")!.width).toBe(3);
  });

  it("draws one point as a disc of the stroke's width", () => {
    const result = run("  pen p [(40, 40)]\n  style p { width 6 }");
    const c = at(result, 40, 40);
    expect(element(result.scene!, "p").items).toEqual([
      {
        kind: "path",
        d: `M${c.x - 3} ${c.y}a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z`,
        fill: ink,
        stroke: "none",
        strokeWidth: 0,
        dashed: false,
      },
    ]);
    expect(result.boxes!.get("p")).toEqual({ x: 37, y: 37, width: 6, height: 6 });
  });

  it("moves a stroke with its group, whose derived size holds it", () => {
    const sized = run(
      '  group g "G" {\n    pen p [(10, 10), (30, 20)]\n  }\n  placement {\n    place g at (500, 320)\n    size g (400, 240)\n  }',
    );
    expect(sized.origins!.get("p")).toEqual({ x: 316, y: 240 });
    const start = at(sized, 326, 250);
    expect(strokeOf(element(sized.scene!, "p")).d.startsWith(`M ${start.x} ${start.y} L `)).toBe(
      true,
    );
    expect(sized.pens!.get("p")!.points).toEqual([
      { x: 326, y: 250 },
      { x: 346, y: 260 },
    ]);
    const derived = run(
      '  group g "G" {\n    box a "A"\n    pen p [(10, 10), (300, 120)]\n  }\n  placement {\n    place g at (300, 200)\n    place a at (80, 28)\n  }',
    );
    const group = derived.boxes!.get("g")!;
    const pen = derived.boxes!.get("p")!;
    expect(group.x + group.width).toBeCloseTo(pen.x + pen.width + 16, 6);
    expect(group.y + group.height).toBeCloseTo(pen.y + pen.height + 16, 6);
  });

  it("draws a highlighter stroke wide, in the theme's highlight, at its style's opacity", () => {
    const result = run(
      '  text t "Read this first"\n  pen mark [(0, 20), (160, 20)]\n  style mark { stroke highlight; width 20; opacity 0.35 }\n  placement {\n    place t at (80, 20)\n  }',
    );
    const group = element(result.scene!, "mark");
    expect(highlight).toBe("#ffe600");
    expect(strokeOf(group)).toMatchObject({ stroke: highlight, strokeWidth: 20, rounded: true });
    // The whole stroke is translucent; a story's opacity stays apart.
    expect(group.styleOpacity).toBe(0.35);
    expect(group.opacity).toBeUndefined();
    expect(result.codes).toEqual([]);
  });

  it("takes no part in the composition checks or the label audit", () => {
    const result = run(
      '  box a "Alpha"\n  box b "Beta"\n  a -> b: "pays" as pay\n  pen p [(40, 100), (250, 98), (460, 100)]\n  style p { width 8 }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(
      result.diagnostics.filter((d) => d.data?.ids?.includes("p") || d.message.includes("`p`")),
    ).toEqual([]);
    // The connector runs straight on, as it does over a line.
    expect(result.connectors!.get("pay")!.points).toEqual([
      { x: 180, y: 100 },
      { x: 320, y: 100 },
    ]);
  });

  it("is painted in source order on its layer, as a line is", () => {
    const s = scene(
      '  layers main, front\n  box a "A"\n  pen p [(0, 20), (200, 20)]\n  pen q [(0, 60), (200, 60)] { layer front }\n  box b "B"\n  placement {\n    place a at (60, 20)\n    place b at (300, 20)\n  }',
    );
    expect(order(s)).toEqual(["element:a", "element:p", "element:b", "element:q"]);
    expect(element(s, "q").layer).toBe("front");
  });

  it("draws its heads along its end segments, the stroke stopping at them", () => {
    const result = run(
      "  pen p [(0, 0), (100, 0), (200, 40)]\n  style p { width 4; arrowhead triangle; arrowtail open }",
    );
    const group = element(result.scene!, "p");
    expect(group.items.map((i) => i.kind)).toEqual(["path", "polyline", "path"]);
    const [stroke, tail, head] = group.items as [PathItem, SceneItem, PathItem];
    // An open tail leaves the stroke whole; its point is the first point.
    const first = at(result, 0, 0);
    expect(stroke.d.startsWith(`M ${first.x} ${first.y} Q `)).toBe(true);
    expect(tail).toMatchObject({ kind: "polyline", stroke: ink, strokeWidth: 4 });
    // The triangle is three widths long: the stroke ends 12 before the tip, on the last segment.
    expect(head).toMatchObject({ fill: ink, stroke: "none" });
    const end = /L (\S+) (\S+)$/.exec(stroke.d)!.slice(1).map(Number) as [number, number];
    const tip = at(result, 200, 40);
    expect(Math.hypot(tip.x - end[0], tip.y - end[1])).toBeCloseTo(12, 1);
    // The track keeps every point, the heads' too.
    expect(group.track).toEqual([first, at(result, 100, 0), tip]);
  });

  it("takes its heads from the stroke without repeated points, and a dot stays a dot", () => {
    const result = run(
      "  pen p [(0, 0), (50, 0), (50, 0)]\n  pen q [(0, 40), (0, 40), (50, 40)]\n  pen d [(10, 80), (10, 80), (10, 80)]\n  style p, q, d { width 2; arrowhead triangle; arrowtail triangle }",
    );
    /** The numbers of path data, as (x, y) pairs. */
    const pairs = (d: string) => {
      const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      return numbers.flatMap((v, i) => (i % 2 === 0 ? [{ x: v, y: numbers[i + 1]! }] : []));
    };
    for (const [id, y] of [
      ["p", 0],
      ["q", 40],
    ] as const) {
      const group = element(result.scene!, id);
      expect(
        group.items.map((i) => i.kind),
        id,
      ).toEqual(["path", "path", "path"]);
      const [stroke, tail, head] = group.items as [PathItem, PathItem, PathItem];
      // The heads point along the stroke, not across it: tips at its ends, bases on either side
      // of its line, the theme's arrow size (8) long.
      for (const [part, x, base] of [
        [tail, 0, 8],
        [head, 50, 42],
      ] as const) {
        const [tip, ...rest] = pairs(part.d);
        expect(tip, id).toEqual(at(result, x, y));
        expect(
          rest.map((p) => p.x),
          id,
        ).toEqual([at(result, base, y).x, at(result, base, y).x]);
        expect(Math.min(...rest.map((p) => p.y)), id).toBeLessThan(tip!.y);
        expect(Math.max(...rest.map((p) => p.y)), id).toBeGreaterThan(tip!.y);
      }
      // The stroke stops at both heads.
      const ends = pairs(stroke.d);
      expect(ends[0], id).toEqual(at(result, 8, y));
      expect(ends.at(-1), id).toEqual(at(result, 42, y));
      // The track keeps the points as written.
      expect(group.track, id).toHaveLength(3);
    }
    const dot = element(result.scene!, "d");
    expect(dot.items).toHaveLength(1);
    expect(dot.items[0]).toMatchObject({ kind: "path", stroke: "none" });
    expect(result.codes).toEqual([]);
  });

  it("lays out a stroke of 130,000 points", () => {
    const points = Array.from(
      { length: 130_000 },
      (_, i) => `(${(i % 997) / 10}, ${Math.floor(i / 997) / 10})`,
    ).join(" ");
    const result = run(`  pen p [${points}]`);
    expect(result.codes).toEqual([]);
    // Points from (0, 0) to (99.6, 13), grown by half the default width of 3.
    expect(result.boxes!.get("p")).toEqual({ x: -1.5, y: -1.5, width: 102.6, height: 16 });
    expect(element(result.scene!, "p").track).toHaveLength(130_000);
  });

  it("takes its stroke, width, line and heads from a rule, as lines take their heads", () => {
    const result = run(
      "  rule pen { width 5; stroke accent; line dashed; arrowhead triangle }\n  rule line { arrowhead open }\n  pen p [(0, 0), (100, 0)]\n  pen q [(0, 40), (100, 40)]\n  line l from (0, 80) to (100, 80)",
    );
    for (const id of ["p", "q"]) {
      const group = element(result.scene!, id);
      expect(strokeOf(group), id).toMatchObject({ stroke: accent, strokeWidth: 5, dashed: true });
      expect(group.items[1], id).toMatchObject({ kind: "path", fill: accent });
    }
    // The line ends in an open head, a polyline after its own.
    expect(of(element(result.scene!, "l"), "polyline")).toHaveLength(2);
  });

  it("draws widths up to 64", () => {
    const result = run(
      '  box a "A"\n  box b "B"\n  a -> b as r\n  pen p [(0, 200), (300, 200)]\n  style a { width 24 }\n  style r { width 30 }\n  style p { width 64 }\n  placement {\n    place a at (100, 100)\n    place b at (500, 100)\n  }',
    );
    expect(of(element(result.scene!, "a"), "rect")[0]!.strokeWidth).toBe(24);
    const relation = result.scene!.items.find(
      (i): i is GroupItem => i.kind === "group" && i.id === "r",
    )!;
    expect(of(relation, "polyline")[0]!.strokeWidth).toBe(30);
    expect(strokeOf(element(result.scene!, "p")).strokeWidth).toBe(64);
    expect(result.boxes!.get("p")).toEqual({ x: -32, y: 168, width: 364, height: 64 });
  });

  it("keeps its points in an automatic layout, out of the engine's request", () => {
    let request: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (r) => {
        request = r;
        return gridEngine.arrange(r);
      },
    };
    const result = run(
      '  layout auto\n  box a "A"\n  box b "B"\n  a -> b\n  pen p [(0, 0), (40, 10)]',
      {
        engine: spy,
      },
    );
    expect(result.codes).toEqual([]);
    expect(request!.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(result.pens!.get("p")!.points).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 10 },
    ]);
  });

  it("draws nothing for a stroke whose statement does not compile", () => {
    const compilation = compile(
      `${PLAIN}diagram d: free {\n  theme "plain"\n  box a "A"\n  pen p [10, 20]\n  placement {\n    place a at (100, 100)\n  }\n}\n`,
    );
    expect(compilation.diagnostics.map((d) => d.code)).toContain("prop.invalid-value");
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    expect(order(result.scene!)).toEqual(["element:a"]);
    expect(result.pens!.size).toBe(0);
    expect(result.boxes!.has("p")).toBe(false);
  });
});

describe("opacity", () => {
  it("fades elements, groups, lines and pens by their style, apart from a story's opacity", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n  }\n  line l from (0, 300) to (200, 300)\n  text t "T"\n  box b "B"\n  style g { opacity 0.8 }\n  style a { opacity 0.5 }\n  style l { opacity 0.25 }\n  style b { opacity 1 }\n  placement {\n    place g at (200, 100)\n    place a at (80, 28)\n    place t at (400, 300)\n    place b at (600, 100)\n  }',
    );
    const s = result.scene!;
    expect(element(s, "g").styleOpacity).toBe(0.8);
    // `a` is in `g`: its own 0.5 times the group's 0.8.
    expect(element(s, "a").styleOpacity).toBeCloseTo(0.4, 10);
    expect(element(s, "l").styleOpacity).toBe(0.25);
    // Opaque drawings say nothing; stories set `opacity`, which the layout leaves alone.
    expect(element(s, "t").styleOpacity).toBeUndefined();
    expect(element(s, "b").styleOpacity).toBeUndefined();
    expect(element(s, "a").opacity).toBeUndefined();
  });

  it("comes from classes and rules too", () => {
    const s = scene(
      '  class faint { opacity 0.4 }\n  rule text { opacity 0.6 }\n  box a "A" { class faint }\n  text t "T"\n  placement {\n    place a at (100, 100)\n    place t at (100, 200)\n  }',
    );
    expect(element(s, "a").styleOpacity).toBe(0.4);
    expect(element(s, "t").styleOpacity).toBe(0.6);
  });

  it("fades a group with everything it holds, at every depth", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n    sticky s "S"\n    line l from (0, 200) to (100, 200)\n    pen p [(0, 0), (30, 10)]\n    group inner "Inner" {\n      box b "B"\n    }\n  }\n  box out "Out"\n  style g { opacity 0.3 }\n  style s { opacity 0.5 }\n  style inner { opacity 0.5 }\n  placement {\n    place g at (300, 300)\n    place a at (80, 40)\n    place s at (300, 120)\n    place inner at (120, 300)\n    place b at (80, 40)\n    place out at (800, 100)\n  }',
    );
    const s = result.scene!;
    expect(element(s, "g").styleOpacity).toBe(0.3);
    // The scene is flat: the group's children are its siblings, faded by it.
    for (const id of ["a", "l", "p"]) expect(element(s, id).styleOpacity, id).toBe(0.3);
    expect(element(s, "s").styleOpacity).toBeCloseTo(0.15, 10);
    expect(element(s, "inner").styleOpacity).toBeCloseTo(0.15, 10);
    expect(element(s, "b").styleOpacity).toBeCloseTo(0.15, 10);
    expect(element(s, "out").styleOpacity).toBeUndefined();
  });
});

describe("stickies", () => {
  const light = THEMES["technical.light"]!;
  /** A sheet with the sticky `s` placed at (100, 100), its card from (20, 20) to (180, 180). */
  const card = (text: string, more = "", placement = "") =>
    `  sticky s "${text}"\n${more}  placement {\n    place s at (100, 100)\n${placement}  }`;
  /** `count` words taken in turn from `words`, one sentence. */
  const words = (count: number, ...list: string[]) =>
    Array.from({ length: count }, (_, i) => list[i % list.length]).join(" ");
  const SIXTY = words(60, "we", "ship", "the", "new", "cart", "on", "time");
  const FOUR_HUNDRED = words(400, "move", "the", "catalogue", "cache", "to", "edge");
  /** The width of a line of a sticky's text as the estimate measures it. */
  const widthOf = (t: TextItem) => estimateMeasurer.width(t.text, light.font, t.weight, t.size);

  it("are square cards of 160 at the 13 px label size with a shadow, scaled with it", () => {
    const result = run(card("Idea"));
    expect(result.boxes!.get("s")).toEqual({ x: 20, y: 20, width: 160, height: 160 });
    expect(result.codes).toEqual([]);
    const g = element(result.scene!, "s");
    const [shadow, paper, ...rest] = of(g, "rect");
    expect(rest).toEqual([]);
    // A soft shadow 3 px lower, in black at 15 %, then the card: no outline unless styled.
    expect(shadow).toEqual({
      kind: "rect",
      x: 20,
      y: 23,
      width: 160,
      height: 160,
      radius: 2,
      fill: "#000000",
      stroke: "none",
      strokeWidth: 0,
      dashed: false,
      opacity: 0.15,
    });
    expect(paper).toMatchObject({
      x: 20,
      y: 20,
      width: 160,
      height: 160,
      radius: 2,
      fill: light.sticky,
      stroke: "none",
      strokeWidth: 0,
    });
    expect(g.items.slice(0, 2)).toEqual([shadow, paper]);
    // The text is centred in the card at 1.2 times the label size, in the theme's `stickyText`.
    expect(of(g, "text")).toEqual([
      expect.objectContaining({
        x: 100,
        y: 100,
        text: "Idea",
        size: 15.6,
        weight: 400,
        anchor: "middle",
        fill: light.stickyText,
        font: "body",
      }),
    ]);
    expect(g.bounds).toMatchObject({ x: 20, y: 20, width: 160, height: 160, radius: 2 });
    expect(g.textClip).toBeUndefined();
    const stage = run(card("Idea"), { theme: "stage.light" });
    expect(stage.boxes!.get("s")).toMatchObject({ width: 197, height: 197 });
    expect(of(element(stage.scene!, "s"), "text")[0]!.size).toBe(
      Math.round(THEMES["stage.light"]!.labelSize * 1.2 * 100) / 100,
    );
  });

  it("wrap their text at the inner width, at spaces, lines 1.25 times the size apart", () => {
    const text = "Move the catalogue cache to the edge before the sale";
    const result = run(card(text));
    expect(result.codes).toEqual([]);
    const lines = of(element(result.scene!, "s"), "text");
    expect(lines.length).toBeGreaterThan(1);
    // The card is 160 wide and the padding 16: the lines are no wider than 128.
    for (const line of lines) expect(widthOf(line)).toBeLessThanOrEqual(128);
    expect(lines.map((l) => l.text).join(" ")).toBe(text);
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.y - lines[i - 1]!.y).toBe(19.5);
    // Each line took as many words as fit.
    for (let i = 1; i < lines.length; i++) {
      const next = lines[i]!.text.split(" ")[0]!;
      expect(widthOf({ ...lines[i - 1]!, text: `${lines[i - 1]!.text} ${next}` })).toBeGreaterThan(
        128,
      );
    }
    // The block is centred in the card.
    const middle = (lines[0]!.y + lines[lines.length - 1]!.y) / 2;
    expect(middle).toBeCloseTo(100, 6);
    expect(result.stickies!.get("s")).toMatchObject({
      area: { x: 36, y: 36, width: 128, height: 128 },
      size: 15.6,
      line: 19.5,
      lines: lines.map((l) => l.text),
      fits: true,
    });
  });

  it("keep the breaks of the text and break a word longer than the card", () => {
    const long = "Supercalifragilisticexpialidocious";
    const result = run(card(`Plan\\n\\n${long}`));
    const lines = of(element(result.scene!, "s"), "text").map((t) => t.text);
    expect(lines.slice(0, 2)).toEqual(["Plan", ""]);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.slice(2).join("")).toBe(long);
    for (const line of of(element(result.scene!, "s"), "text")) {
      expect(widthOf(line)).toBeLessThanOrEqual(128);
    }
  });

  it("shrink their text by one pixel at a time until it fits", () => {
    const result = run(card(SIXTY));
    expect(result.codes).toEqual([]);
    const lines = of(element(result.scene!, "s"), "text");
    const size = lines[0]!.size;
    expect(size).toBeLessThan(15.6);
    expect(size).toBeGreaterThanOrEqual(8);
    // Stepped down from 15.6 by whole pixels.
    expect(Math.round((15.6 - size) * 100) % 100).toBe(0);
    const line = Math.round(size * 1.25 * 100) / 100;
    expect(lines.length * line).toBeLessThanOrEqual(128);
    for (const l of lines) {
      expect(l.size).toBe(size);
      expect(widthOf(l)).toBeLessThanOrEqual(128);
    }
    expect(lines.map((l) => l.text).join(" ")).toBe(SIXTY);
    expect(result.stickies!.get("s")).toMatchObject({ size, fits: true });
    // One pixel more would not fit.
    const larger = Math.round((size + 1) * 100) / 100;
    const wrapped = wrapLines(SIXTY, 128, (t) =>
      estimateMeasurer.width(t, light.font, 400, larger),
    );
    expect((wrapped.length * Math.round(larger * 1.25 * 100)) / 100).toBeGreaterThan(128);
  });

  it("warn and clip a text that does not fit even at 8 px, with a size that holds it", () => {
    const result = run(card(FOUR_HUNDRED));
    const overflow = result.diagnostics.filter((d) => d.code === "layout.text-overflow");
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({
      severity: "warning",
      message:
        "The text of `s` does not fit its 160 × 160 px card even at 8 px, and is clipped: it needs 332 × 332 px.",
      hints: ["Use `size s (332, 332)`, or shorten the text."],
      data: { ids: ["s"], size: { element: "s", width: 332, height: 332 } },
    });
    // On the sticky's declaration: its size is the default one.
    expect(overflow[0]!.range.start.line).toBe(8);
    // The label audit says nothing more about the clipped lines.
    expect(result.codes).toEqual(["layout.text-overflow"]);
    const g = element(result.scene!, "s");
    const lines = of(g, "text");
    expect(lines.every((l) => l.size === 8)).toBe(true);
    // The block starts at the top of the room, and its lines are clipped to the card.
    expect(lines[0]!.y).toBe(36 + 5);
    expect(g.textClip).toEqual({
      id: "clip-d-s",
      x: 20,
      y: 20,
      width: 160,
      height: 160,
      radius: 2,
    });
    expect(result.stickies!.get("s")).toMatchObject({ size: 8, line: 10, fits: false });
    // The size the hint gives holds the text, and a size too small is reported on its statement.
    const fitted = run(card(FOUR_HUNDRED, "", "    size s (332, 332)\n"));
    expect(fitted.codes).toEqual([]);
    expect(element(fitted.scene!, "s").textClip).toBeUndefined();
    const small = run(card(FOUR_HUNDRED, "", "    size s (331, 331)\n"));
    expect(small.codes).toEqual(["layout.text-overflow"]);
    expect(small.diagnostics[0]!.range.start.line).toBe(11);
  });

  it("keep a written size, wrapping at its width, and start from a written font size", () => {
    const result = run(
      card(
        "Ship the cart",
        "  style s { fontSize 20; fontWeight 700; textAlign left; verticalAlign top }\n",
        "    size s (240, 120)\n",
      ),
    );
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("s")).toEqual({ x: -20, y: 40, width: 240, height: 120 });
    const [first] = of(element(result.scene!, "s"), "text");
    // At the top left of the room inside the padding, anchored at its start.
    expect(first).toMatchObject({
      text: "Ship the cart",
      size: 20,
      weight: 700,
      anchor: "start",
      x: -20 + 16 + result.offset!.x,
      y: 40 + 16 + 12.5 + result.offset!.y,
    });
    const bottom = run(
      card(
        "Ship",
        "  style s { textAlign right; verticalAlign bottom }\n",
        "    size s (240, 120)\n",
      ),
    );
    expect(of(element(bottom.scene!, "s"), "text")[0]).toMatchObject({
      anchor: "end",
      x: 220 - 16 + bottom.offset!.x,
      y: 160 - 16 - 9.75 + bottom.offset!.y,
    });
    // A sticky uses `verticalAlign`: it is not reported as ignored.
    expect(bottom.codes).toEqual([]);
  });

  it("take their fill, outline, colour and corners from styles, classes and rules", () => {
    const result = run(
      '  class hot { shape ellipse; fill "#f8bbd0" }\n  rule sticky { radius 6; color "#333333" }\n  sticky s "Idea" { class hot }\n  style s { stroke danger; width 2; line dashed }\n  placement {\n    place s at (100, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    const g = element(result.scene!, "s");
    const [shadow, paper] = of(g, "rect");
    expect(shadow).toMatchObject({ radius: 6, fill: "#000000" });
    expect(paper).toMatchObject({
      radius: 6,
      fill: "#f8bbd0",
      stroke: light.danger,
      strokeWidth: 2,
      dashed: true,
    });
    expect(of(g, "text")[0]!.fill).toBe("#333333");
    // A class's shape does not reach a sticky: its card is a rectangle for hosts and connectors.
    expect(result.shapes!.get("s")).toBe("rectangle");
    expect(result.radii!.get("s")).toBe(6);
    const plain = run(card("Idea"));
    expect(plain.shapes!.get("s")).toBe("rectangle");
    expect(plain.radii!.get("s")).toBe(2);
  });

  it("draw an icon at the top left, on a row of its own above the text", () => {
    const icons = new IconRegistry(createNodeIconPacks());
    const result = run(
      card("Ship the new cart on time", '  style s { icon "tabler:server"; iconColor danger }\n'),
      { icons },
    );
    expect(result.codes).toEqual([]);
    const g = element(result.scene!, "s");
    const icon = g.items.find((i): i is GroupItem => i.kind === "group" && i.role === "icon");
    expect(icon).toBeDefined();
    // The icon comes after the card and before the text, in the corner inside the padding.
    expect(g.items.indexOf(icon!)).toBe(2);
    const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(icon!.transform!)!;
    const corner = { x: 36 + result.offset!.x, y: 36 + result.offset!.y };
    expect(Number(x)).toBeGreaterThanOrEqual(corner.x);
    expect(Number(x)).toBeLessThan(corner.x + 18);
    expect(Number(y)).toBeGreaterThanOrEqual(corner.y);
    expect(Number(y)).toBeLessThan(corner.y + 18);
    // The theme's icon size, 18, and its gap, 7: the room starts 25 below the padding and keeps
    // the card's width, so the text stays centred on the card.
    const text = result.stickies!.get("s")!;
    expect(text.area).toEqual({ x: 36, y: 36 + 25, width: 128, height: 128 - 25 });
    for (const line of of(g, "text")) {
      expect(widthOf(line)).toBeLessThanOrEqual(128);
      expect(line.x).toBe(100 + result.offset!.x);
      expect(line.y - line.size / 2).toBeGreaterThan(corner.y + 25);
    }
    const sized = run(card("Idea", '  style s { icon "tabler:server"; iconSize 32 }\n'), {
      icons,
    });
    expect(sized.stickies!.get("s")!.area).toMatchObject({ y: 36 + 32 + 13, height: 128 - 45 });
  });

  it("are rectangles that connectors end on, that overlap boxes and turn", () => {
    const result = run(
      '  sticky a "A"\n  box b "B"\n  a -> b\n  placement {\n    place a at (100, 100)\n    place b at (500, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    const [connector] = [...result.connectors!.values()];
    // From the card's east edge to the box's west edge.
    expect(connector!.fromSide).toBe("east");
    expect(connector!.toSide).toBe("west");
    expect(connector!.points[0]).toEqual({ x: 180, y: 100 });
    expect(connector!.points[connector!.points.length - 1]).toEqual({ x: 420, y: 100 });
    const overlap = run(
      '  sticky a "A"\n  box b "B"\n  placement {\n    place a at (100, 100)\n    place b at (200, 100)\n  }',
    );
    expect(overlap.codes).toEqual(["layout.overlap"]);
    expect(overlap.diagnostics[0]!.data!.ids).toEqual(["a", "b"]);
    const turned = run(card("Idea", "  style s { rotation 10 }\n"));
    expect(turned.codes).toEqual([]);
    const r = (v: number) => Math.round(v * 100) / 100;
    expect(element(turned.scene!, "s").transform).toBe(
      `rotate(10 ${r(100 + turned.offset!.x)} ${r(100 + turned.offset!.y)})`,
    );
  });

  it("place their text room in a group's interior", () => {
    const result = run(
      '  group g "G" {\n    sticky s "Idea"\n  }\n  placement {\n    place g at (300, 200)\n    size g (400, 300)\n    place s at (100, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    const origin = result.origins!.get("s")!;
    expect(result.boxes!.get("s")).toEqual({
      x: origin.x + 20,
      y: origin.y + 20,
      width: 160,
      height: 160,
    });
    expect(result.stickies!.get("s")!.area).toEqual({
      x: origin.x + 36,
      y: origin.y + 36,
      width: 128,
      height: 128,
    });
  });

  it("are measured and drawn in the hand font under the sketch themes", () => {
    const measurer = createNodeFontLibrary();
    const sketch = THEMES["sketch.light"]!;
    const text = "Move the catalogue cache to the edge before the sale";
    const result = run(card(text), { theme: "sketch.light", measurer });
    expect(result.codes).toEqual([]);
    expect(result.scene!.sketch).toBe("light");
    expect(result.scene!.fonts.body).toBe(sketch.font);
    expect(sketch.font.startsWith('"Patrick Hand"')).toBe(true);
    const lines = of(element(result.scene!, "s"), "text");
    const width = (line: string) => measurer.width(line, sketch.font, 400, lines[0]!.size);
    for (const line of lines) expect(width(line.text)).toBeLessThanOrEqual(128);
    // Wrapped greedily as the hand font measures it.
    for (let i = 1; i < lines.length; i++) {
      const next = lines[i]!.text.split(" ")[0]!;
      expect(width(`${lines[i - 1]!.text} ${next}`)).toBeGreaterThan(128);
    }
    expect(of(element(result.scene!, "s"), "rect")[1]!.fill).toBe(sketch.sticky);
  });
});

describe("wrapLines", () => {
  /** Every character 10 wide. */
  const measure = (line: string) => Array.from(line).length * 10;

  it("fills each line with as many words as fit", () => {
    expect(wrapLines("one two three four", 90, measure)).toEqual(["one two", "three", "four"]);
    expect(wrapLines("one two three four", 1000, measure)).toEqual(["one two three four"]);
  });

  it("keeps every break of the text and empty lines", () => {
    expect(wrapLines("a\n\nb c", 30, measure)).toEqual(["a", "", "b c"]);
    expect(wrapLines("", 30, measure)).toEqual([""]);
  });

  it("breaks a word longer than the width between characters, on lines of its own", () => {
    expect(wrapLines("ab abcdefgh c", 40, measure)).toEqual(["ab", "abcd", "efgh", "c"]);
    // At least one character per line, however narrow.
    expect(wrapLines("abc", 5, measure)).toEqual(["a", "b", "c"]);
  });

  it("drops the spaces where it breaks", () => {
    expect(wrapLines("abc   def", 40, measure)).toEqual(["abc", "def"]);
    expect(wrapLines("abc ", 30, measure)).toEqual(["abc"]);
  });

  it("breaks a long word measuring each piece a few times, never the whole word", () => {
    let measured = 0;
    let longest = 0;
    const counting = (line: string) => {
      measured += line.length;
      longest = Math.max(longest, line.length);
      return measure(line);
    };
    // Pieces of 12 characters, then the end of the word joined by the next ones.
    const lines = wrapLines(`${"x".repeat(40_000)} y z`, 120, counting);
    expect(lines).toHaveLength(3334);
    expect(lines.slice(0, -1).every((l) => l === "x".repeat(12))).toBe(true);
    expect(lines.at(-1)).toBe("xxxx y z");
    // Linear in the text: a few measures of a line's length per piece (it was quadratic).
    expect(measured).toBeLessThan(8 * 40_000);
    expect(longest).toBeLessThan(100);
    // Characters outside the basic plane are never cut in two.
    expect(wrapLines("😀".repeat(50), 30, measure)).toEqual([
      ...Array<string>(16).fill("😀😀😀"),
      "😀😀",
    ]);
  });

  it("lays out a sticky of 40,000 characters in well under a second", () => {
    const started = performance.now();
    const result = run(`  sticky s "${"x".repeat(40_000)}"\n  placement { place s at (100, 100) }`);
    const elapsed = performance.now() - started;
    expect(result.codes).toEqual(["layout.text-overflow"]);
    // It took 28 s; it takes about 0.1 s. The bound leaves room for a busy machine.
    expect(elapsed).toBeLessThan(3000);
  });
});

describe("list groups", () => {
  /** Where each child sits in its group: its box's top-left corner from the interior origin. */
  const inside = (result: ReturnType<typeof run>, ...ids: string[]) =>
    ids.map((id) => {
      const box = result.boxes!.get(id)!;
      const origin = result.origins!.get(id)!;
      return { x: box.x - origin.x, y: box.y - origin.y };
    });
  const sizeOf = (result: ReturnType<typeof run>, id: string) => {
    const { width, height } = result.boxes!.get(id)!;
    return { width, height };
  };
  /** An engine that answers as the grid engine and keeps the request it was asked. */
  const spying = () => {
    const seen: { request?: Parameters<LayoutEngine["arrange"]>[0] } = {};
    const engine: LayoutEngine = {
      name: "spy",
      arrange: (r) => {
        seen.request = r;
        return gridEngine.arrange(r);
      },
    };
    return { engine, seen };
  };

  it("stack a column's children from the interior origin, each where the previous ends plus the spacing", () => {
    const result = run(
      '  group todo "To do" { layout column; spacing 12; sticky a "A"; sticky b "B" }\n  placement {\n    place todo at (100, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    // 160 plus twice the group padding wide; the header, 160 + 12 + 160 and the padding tall.
    expect(result.boxes!.get("todo")).toEqual({ x: 4, y: -94, width: 192, height: 40 + 332 + 16 });
    expect(result.boxes!.get("a")).toEqual({ x: 20, y: -54, width: 160, height: 160 });
    expect(result.boxes!.get("b")).toEqual({ x: 20, y: 118, width: 160, height: 160 });
    expect(result.origins!.get("b")).toEqual({ x: 20, y: -54 });
    expect(result.lists!.get("todo")).toEqual({
      layout: "column",
      spacing: 12,
      align: "start",
      children: ["a", "b"],
      origin: { x: 20, y: -54 },
    });
  });

  it("put a row's children side by side, half the group padding apart by default", () => {
    const result = run(
      '  group r "" { layout row; box a "A"; box b "B" }\n  placement {\n    place r at (300, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(inside(result, "a", "b")).toEqual([
      { x: 0, y: 0 },
      { x: 168, y: 0 },
    ]);
    // An untitled group: the padding all round.
    expect(result.boxes!.get("r")).toEqual({ x: 120, y: 56, width: 360, height: 88 });
    expect(result.lists!.get("r")).toMatchObject({ layout: "row", spacing: 8, align: "start" });
  });

  it("align children across the axis at the start, in the centre or at the end", () => {
    const column = (align: string) =>
      run(
        `  group c "" {\n    layout column; align ${align}\n    box a "A"\n    box w "W"\n  }\n  placement {\n    place c at (300, 200)\n    size w (300, 40)\n  }`,
      );
    expect(inside(column("start"), "a", "w")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 64 },
    ]);
    expect(inside(column("center"), "a", "w")).toEqual([
      { x: 70, y: 0 },
      { x: 0, y: 64 },
    ]);
    expect(inside(column("end"), "a", "w")[0]).toEqual({ x: 140, y: 0 });
    const row = run(
      '  group r "" {\n    layout row; align center\n    box a "A"\n    box t "T"\n  }\n  placement {\n    place r at (300, 200)\n    size t (100, 120)\n  }',
    );
    expect(inside(row, "a", "t")).toEqual([
      { x: 0, y: 32 },
      { x: 168, y: 0 },
    ]);
    expect(row.codes).toEqual([]);
  });

  it("stretch the children without a written size across the interior, and keep the written ones", () => {
    const result = run(
      '  group c "" {\n    layout column; align stretch\n    box a "A"\n    box w "W"\n    box n "N"\n    sticky s "Stretched card"\n  }\n  placement {\n    place c at (300, 300)\n    size w (240, 40)\n    size n (100, 40)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(sizeOf(result, "a")).toEqual({ width: 240, height: 56 });
    expect(sizeOf(result, "w")).toEqual({ width: 240, height: 40 });
    expect(sizeOf(result, "n")).toEqual({ width: 100, height: 40 });
    expect(sizeOf(result, "s")).toEqual({ width: 240, height: 160 });
    expect(inside(result, "a", "w", "n", "s")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 64 },
      { x: 0, y: 112 },
      { x: 0, y: 160 },
    ]);
    // The card is drawn at its stretched size, its text wrapped at that width.
    const card = of(element(result.scene!, "s"), "rect")[1]!;
    expect(card.width).toBe(240);
    expect(result.stickies!.get("s")!.area.width).toBe(240 - 2 * 16);
  });

  it("check the text of a stretched sticky at the size it is drawn", () => {
    const text = Array.from({ length: 400 }, (_, i) => ["move", "the", "cache"][i % 3]).join(" ");
    const alone = run(`  sticky s "${text}"\n  placement {\n    place s at (100, 100)\n  }`);
    expect(alone.codes).toEqual(["layout.text-overflow"]);
    const stretched = run(
      `  group c "" {\n    layout column; align stretch\n    sticky s "${text}"\n    box w "W"\n  }\n  placement {\n    place c at (1000, 300)\n    size w (1800, 40)\n  }`,
    );
    expect(stretched.codes).toEqual([]);
    expect(stretched.stickies!.get("s")!.fits).toBe(true);
  });

  it("draw the columns of a row that stretches as tall as the tallest, one spacing apart", () => {
    const result = run(
      '  group row "" {\n    layout row; align stretch\n    group one "One" {\n      layout column\n      box p "P"\n    }\n    group two "Two" {\n      layout column\n      box q "Q"\n    }\n  }\n  placement {\n    place row at (400, 300)\n    size p (160, 244)\n    size q (160, 444)\n  }',
    );
    expect(result.codes).toEqual([]);
    const one = result.boxes!.get("one")!;
    const two = result.boxes!.get("two")!;
    // 300 and 500 tall by their children; both 500 in the row.
    expect(one.height).toBe(500);
    expect(two.height).toBe(500);
    expect(two.y).toBe(one.y);
    expect(two.x - (one.x + one.width)).toBe(8);
    expect(inside(result, "p", "q")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(result.boxes!.get("row")).toMatchObject({ width: 16 + 192 + 8 + 192 + 16, height: 532 });
  });

  it("align the children of a list that the list holding it stretched", () => {
    const result = run(
      '  group outer "" {\n    layout column; align stretch\n    group inner "Inner" {\n      layout column; align center\n      box c "C"\n    }\n    box w "W"\n  }\n  placement {\n    place outer at (400, 300)\n    size w (400, 40)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(sizeOf(result, "inner").width).toBe(400);
    // Centred in the stretched interior, 400 less twice the padding.
    expect(inside(result, "c")).toEqual([{ x: (368 - 160) / 2, y: 0 }]);
  });

  it("take a written size as the least size, growing past it when the children need more", () => {
    const sheet = (size: string) =>
      run(
        `  group col "Column" {\n    layout column; spacing 80\n    sticky a "A"\n    sticky b "B"\n  }\n  placement {\n    place col at (300, 400)\n    size col ${size}\n  }`,
      );
    const grown = sheet("(240, 200)");
    expect(grown.codes).toEqual([]);
    // 240 wide as written; the header, 160 + 80 + 160 and the padding tall.
    expect(sizeOf(grown, "col")).toEqual({ width: 240, height: 40 + 400 + 16 });
    expect(grown.boxes!.get("col")!.y).toBe(400 - 456 / 2);
    expect(sizeOf(sheet("(400, 600)"), "col")).toEqual({ width: 400, height: 600 });
  });

  it("ignore and report the place of a child, which the list places", () => {
    const result = run(
      '  group todo "To do" {\n    layout column\n    sticky a "A"\n    sticky b "B"\n  }\n  placement {\n    place todo at (300, 300)\n    place b at (40, 40)\n  }',
    );
    expect(result.codes).toEqual(["layout.place-ignored"]);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "warning",
      message: "The `place` of `b` is ignored: the list `todo` places its children in order.",
      hints: ["Remove `place b`, or remove `layout` from `todo` to place its children yourself."],
      data: { ids: ["b", "todo"] },
    });
    // On the `place` statement.
    expect(result.diagnostics[0]!.range.start.line).toBe(15);
    expect(inside(result, "b")).toEqual([{ x: 0, y: 168 }]);
  });

  it("leave lines and pens at their points, and hold them in the group's size", () => {
    const result = run(
      '  group col "Column" {\n    layout column\n    sticky s "S"\n    pen p [(10, 10), (60, 10)]\n    line l from (0, 0) to (40, 400)\n  }\n  placement {\n    place col at (400, 400)\n  }',
    );
    expect(result.codes).toEqual([]);
    const origin = result.origins!.get("s")!;
    expect(inside(result, "s")).toEqual([{ x: 0, y: 0 }]);
    expect(result.pens!.get("p")!.points).toEqual([
      { x: origin.x + 10, y: origin.y + 10 },
      { x: origin.x + 60, y: origin.y + 10 },
    ]);
    expect(result.connectors!.get("l")!.points[1]).toEqual({ x: origin.x + 40, y: origin.y + 400 });
    expect(result.lists!.get("col")!.children).toEqual(["s"]);
    // The line reaches 400 below the origin, past the card.
    expect(sizeOf(result, "col")).toEqual({ width: 192, height: 40 + 400 + 16 });
  });

  it("are one box of an automatic layout, whose children keep their order inside it", () => {
    const { engine, seen } = spying();
    const result = run(
      '  layout auto\n  group col "Column" {\n    layout column\n    sticky s1 "One"\n    sticky s2 "Two"\n    sticky s3 "Three"\n  }\n  box a "A"\n  box b "B"\n  s1 -> a\n  a -> b\n  s2 -> s3',
      { engine },
    );
    expect(result.codes).toEqual([]);
    const request = seen.request!;
    expect(request.nodes.map((n) => [n.id, n.width, n.height])).toEqual([
      ["col", 192, 40 + 3 * 160 + 2 * 8 + 16],
      ["a", 160, 56],
      ["b", 160, 56],
    ]);
    expect(request.groups).toEqual([]);
    // A relation to a child ends on the list; one within the list stays out.
    expect(request.edges.map((e) => [e.source, e.target, e.sourcePort])).toEqual([
      ["col", "a", null],
      ["a", "b", null],
    ]);
    // The list sits where the engine put it, its children in a column inside it.
    const col = result.boxes!.get("col")!;
    expect(col).toEqual({ x: 100 - 96, y: 100 - 276, width: 192, height: 552 });
    expect(inside(result, "s1", "s2", "s3")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 168 },
      { x: 0, y: 336 },
    ]);
    expect(result.origins!.get("s1")).toEqual({ x: col.x + 16, y: col.y + 40 });
    expect([...result.connectors!.keys()]).toEqual(["s1->a#1", "a->b#1", "s2->s3#1"]);
  });

  it("keep the places of what they hold in an automatic layout, and are arranged when unplaced in an assisted one", () => {
    const { engine, seen } = spying();
    const assisted = run(
      '  layout assisted\n  group col "Column" { layout column; box p "P"; box q "Q" }\n  box a "A"\n  a -> p\n  placement {\n    place a at (100, 100)\n  }',
      { engine },
    );
    expect(assisted.codes).toEqual([]);
    expect(seen.request!.nodes.map((n) => [n.id, n.fixed])).toEqual([
      ["col", null],
      ["a", { x: 100, y: 100 }],
    ]);
    expect(seen.request!.edges.map((e) => [e.source, e.target])).toEqual([["a", "col"]]);
    expect(assisted.boxes!.get("a")).toMatchObject({ x: 20, y: 72 });
    expect(inside(assisted, "p", "q")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 64 },
    ]);
    // Kept on the engine's side of the placed box, clear of it.
    const col = assisted.boxes!.get("col")!;
    expect(col).toMatchObject({ width: 192, height: 40 + 120 + 16 });
    expect(col.x + col.width).toBeLessThan(20);
    // A placed list is a fixed box of the arrangement, which the others keep clear of.
    const fixed = run(
      '  layout assisted\n  group col "Column" { layout column; box p "P"; box q "Q" }\n  box a "A"\n  a -> p\n  placement {\n    place col at (100, 100)\n  }',
      { engine },
    );
    expect(fixed.codes).toEqual([]);
    expect(seen.request!.nodes.map((n) => [n.id, n.fixed])).toEqual([
      ["col", { x: 100, y: 100 }],
      ["a", null],
    ]);
    expect(fixed.boxes!.get("col")).toEqual({ x: 4, y: 12, width: 192, height: 176 });
    expect(fixed.boxes!.get("a")!.x).toBeGreaterThanOrEqual(196);
    // In `auto`, a group inside a list keeps the places of its children, and nothing is ignored.
    const placed = run(
      '  layout auto\n  group col "Column" {\n    layout column\n    group g "G" {\n      box a "A"\n    }\n  }\n  box b "B"\n  placement {\n    place a at (90, 40)\n  }',
      { engine },
    );
    expect(placed.codes).toEqual([]);
    expect(seen.request!.nodes.map((n) => n.id)).toEqual(["col", "b"]);
    expect(inside(placed, "g", "a")).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 12 },
    ]);
  });

  it("draw a kanban board: a row of columns of stickies at equal height", () => {
    const result = run(
      [
        '  group board "" {',
        "    layout row; align stretch; spacing 24",
        '    group todo "To do" {',
        "      layout column",
        '      sticky t1 "Write the brief"',
        '      sticky t2 "Draw the board"',
        "    }",
        '    group doing "Doing" {',
        "      layout column",
        '      sticky d1 "Test the lists"',
        '      sticky d2 "Fix the gaps"',
        '      sticky d3 "Ship"',
        "    }",
        '    group done "Done" {',
        "      layout column",
        '      sticky f1 "Plan"',
        "    }",
        "  }",
        "  placement {",
        "    place board at (500, 400)",
        "  }",
      ].join("\n"),
    );
    expect(result.codes).toEqual([]);
    const columns = ["todo", "doing", "done"].map((id) => result.boxes!.get(id)!);
    expect(columns.map((c) => c.height)).toEqual([552, 552, 552]);
    expect(columns.map((c) => c.y)).toEqual([columns[0]!.y, columns[0]!.y, columns[0]!.y]);
    expect(columns[1]!.x - columns[0]!.x).toBe(192 + 24);
    expect(columns[2]!.x - columns[1]!.x).toBe(192 + 24);
    expect(inside(result, "d1", "d2", "d3")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 168 },
      { x: 0, y: 336 },
    ]);
    expect(result.lists!.get("board")!.children).toEqual(["todo", "doing", "done"]);
  });

  it("need a place for what a plain group inside them holds, and for themselves", () => {
    const sheet = (place: string) =>
      run(
        `  group col "Column" {\n    layout column\n    group g "G" {\n      box a "A"\n    }\n  }\n  placement {\n    place col at (300, 300)\n${place}  }`,
      );
    const missing = sheet("");
    expect(missing.scene).toBeNull();
    expect(missing.codes).toEqual(["layout.missing-placement"]);
    expect(missing.diagnostics[0]!.message).toBe(
      "`a` has no `place` statement; inside the list `col`, the group `g` is not a list and needs a position for each child.",
    );
    const placed = sheet("    place a at (90, 40)\n");
    expect(placed.codes).toEqual([]);
    // The plain group is derived from its child, and placed by the list.
    expect(sizeOf(placed, "g")).toEqual({ width: 16 + 170 + 16, height: 40 + 68 + 16 });
    expect(inside(placed, "g")).toEqual([{ x: 0, y: 0 }]);
    const unplaced = run('  group col "Column" { layout column; box a "A" }');
    expect(unplaced.scene).toBeNull();
    expect(unplaced.codes).toEqual(["layout.missing-placement"]);
  });
});

describe("interior coordinates", () => {
  const sheet = (x: number) =>
    `  group g "G" {\n    box a "A"\n  }\n  placement {\n    place g at (${x}, 200)\n    size g (400, 240)\n    place a at (60, 40)\n  }`;

  it("places children relative to the interior of their group", () => {
    const result = run(sheet(300));
    // The group spans 100..500 × 80..320; its interior starts at (116, 120).
    expect(result.boxes!.get("g")).toEqual({ x: 100, y: 80, width: 400, height: 240 });
    expect(result.boxes!.get("a")).toEqual({ x: 96, y: 132, width: 160, height: 56 });
    expect(result.origins!.get("a")).toEqual({ x: 116, y: 120 });
  });

  it("moves the children with their group", () => {
    const before = run(sheet(300)).boxes!.get("a")!;
    const after = run(sheet(500)).boxes!.get("a")!;
    expect(after.x - before.x).toBe(200);
    expect(after.y).toBe(before.y);
  });

  it("derives the size of a group from its children", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n  }\n  placement {\n    place g at (300, 200)\n    place a at (100, 50)\n  }',
    );
    expect(result.boxes!.get("g")).toMatchObject({ width: 16 + 180 + 16, height: 40 + 78 + 16 });
  });

  it("derives an untitled group with the padding above its interior", () => {
    const result = run(
      '  group g "" {\n    box a "A"\n  }\n  placement {\n    place g at (300, 200)\n    place a at (100, 50)\n  }',
    );
    const g = result.boxes!.get("g")!;
    expect(g).toEqual({ x: 194, y: 145, width: 16 + 180 + 16, height: 16 + 78 + 16 });
    expect(result.origins!.get("a")).toEqual({ x: g.x + 16, y: g.y + 16 });
    expect(of(element(result.scene!, "g"), "text")).toEqual([]);
  });

  it("gives an untitled group no minimum width", () => {
    const result = run(
      '  group g "" {\n    box a ""\n  }\n  placement {\n    place g at (300, 200)\n    place a at (2, 2)\n    size a (4, 4)\n  }',
    );
    expect(result.boxes!.get("g")).toMatchObject({ width: 16 + 4 + 16, height: 16 + 4 + 16 });
  });

  it("keeps the band of a group with an empty label and a description or an icon", () => {
    const body = (inside: string, extra = "") =>
      `  group g "" {\n${inside}    box a "A"\n  }\n${extra}  placement {\n    place g at (300, 200)\n    size g (400, 240)\n    place a at (60, 40)\n  }`;
    const described = run(body('    description "Backend"\n'));
    expect(described.origins!.get("a")).toEqual({ x: 116, y: 120 });
    const band = element(described.scene!, "g");
    const outline = of(band, "rect")[0]!;
    const text = of(band, "text").find((t) => t.text === "Backend")!;
    expect(text.y).toBeGreaterThan(outline.y);
    expect(text.y).toBeLessThan(outline.y + 40);
    const icon = run(body("", '  style g { icon "tabler:server" }\n'));
    expect(icon.origins!.get("a")).toEqual({ x: 116, y: 120 });
  });

  it("draws an untitled group as a plain rectangle with its fill", () => {
    const s = scene(
      '  group g "" {\n    box a "A"\n  }\n  style g { fill "#dae8fc" }\n  placement {\n    place g at (300, 200)\n    size g (400, 240)\n    place a at (60, 40)\n  }',
    );
    const g = element(s, "g");
    expect(of(g, "rect")).toHaveLength(1);
    expect(of(g, "rect")[0]).toMatchObject({ fill: "#dae8fc", width: 400, height: 240 });
    expect(of(g, "text")).toEqual([]);
  });

  it("cuts no hole for the title of an untitled group in the connectors that pass over it", () => {
    // `p -> q` runs along y = 98, where the title of a titled `g` is drawn.
    const pieces = (label: string) => {
      const s = scene(
        `  group g ${label} {\n    box a "A"\n  }\n  box p "P"\n  box q "Q"\n  p -> q as link\n  placement {\n    place g at (300, 200)\n    size g (400, 240)\n    place a at (60, 80)\n    place p at (-40, 98)\n    place q at (640, 98)\n  }`,
      );
      const link = s.items.find(
        (i): i is GroupItem => i.kind === "group" && i.id === "link" && i.role === "relation",
      )!;
      return of(link, "polyline").length;
    };
    expect(pieces('"Backend"')).toBe(2);
    expect(pieces('""')).toBe(1);
  });

  it("keeps labels off the title band of a titled group only", () => {
    // `p -> q` runs along y = 140 over the top of `g`, which spans 270..330 × 120..220.
    const label = (title: string) =>
      run(
        `  group g ${title}\n  box p "P"\n  box q "Q"\n  p -> q: "x" as link\n  placement {\n    place g at (300, 170)\n    size g (60, 100)\n    place p at (120, 140)\n    place q at (430, 140)\n  }`,
      ).labels!.get("link")!;
    const center = (box: { x: number; width: number }) => box.x + box.width / 2;
    // The connector spans 200..350: the label stays in the middle over an untitled group, and
    // slides to the first clear stop, a third of the way, beside a title.
    expect(center(label('""'))).toBe(275);
    expect(center(label('"G"'))).toBeCloseTo(251);
  });

  it("nests interiors", () => {
    const result = run(
      '  group outer "Outer" {\n    group inner "Inner" {\n      box a "A"\n    }\n  }\n  placement {\n    place outer at (400, 300)\n    size outer (600, 400)\n    place inner at (200, 120)\n    size inner (300, 200)\n    place a at (100, 60)\n  }',
    );
    // outer: 100..700 × 100..500, interior (116, 140); inner centre (316, 260), box 166..466 ×
    // 160..360, interior (182, 200); a centre (282, 260).
    expect(result.boxes!.get("inner")).toEqual({ x: 166, y: 160, width: 300, height: 200 });
    expect(result.boxes!.get("a")).toEqual({ x: 202, y: 232, width: 160, height: 56 });
    expect(result.origins!.get("inner")).toEqual({ x: 116, y: 140 });
    expect(result.origins!.get("a")).toEqual({ x: 182, y: 200 });
  });

  it("needs a place for every group in manual layouts", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n  }\n  placement {\n    place a at (60, 40)\n  }',
    );
    expect(result.scene).toBeNull();
    expect(result.codes).toEqual(["layout.missing-placement"]);
    expect(result.diagnostics[0]!.message).toContain("Group `g`");
  });

  it("keeps route waypoints in diagram coordinates", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n  }\n  box b "B"\n  a -> b as r\n  placement {\n    place g at (200, 200)\n    place a at (90, 40)\n    place b at (600, 400)\n    route r from a.east to b.west via [(400, 400)]\n  }',
    );
    expect(result.connectors!.get("r")!.via).toEqual([{ x: 400, y: 400 }]);
    expect(result.connectors!.get("r")!.points).toContainEqual({ x: 400, y: 400 });
  });
});

describe("free objects", () => {
  it("sizes a text object from its measured text", () => {
    const result = run(
      '  text heading "Arquitectura"\n  style heading { fontSize 32 }\n  placement {\n    place heading at (300, 100)\n  }',
    );
    const theme = THEMES["technical.light"]!;
    const width = new TextMetrics(estimateMeasurer, theme).width("Arquitectura", "body", 600, 32);
    expect(result.boxes!.get("heading")).toMatchObject({ width: Math.ceil(width), height: 40 });
    const text = of(element(result.scene!, "heading"), "text")[0]!;
    expect(text).toMatchObject({ size: 32, anchor: "start", text: "Arquitectura" });
    expect(of(element(result.scene!, "heading"), "rect")).toEqual([]);
  });

  it("breaks text at line breaks and aligns it", () => {
    const s = scene(
      '  text t "One\\nTwo"\n  style t { textAlign right; fontSize 20; fontWeight 400 }\n  placement {\n    place t at (300, 100)\n    size t (300, 60)\n  }',
    );
    const lines = of(element(s, "t"), "text");
    expect(lines.map((l) => [l.text, l.anchor, l.weight])).toEqual([
      ["One", "end", 400],
      ["Two", "end", 400],
    ]);
    expect(lines[1]!.y - lines[0]!.y).toBe(25);
  });

  it("draws a frame for text with a fill", () => {
    const s = scene(
      '  text t "Note"\n  style t { fill "#fffbe6"; stroke warning }\n  placement {\n    place t at (300, 100)\n  }',
    );
    expect(of(element(s, "t"), "rect")[0]).toMatchObject({ fill: "#fffbe6" });
  });

  it.each([
    ["rectangle", "rect", 0],
    ["pill", "rect", 28],
    ["rounded", "rect", 8],
  ] as const)("draws %s boxes as rects", (shape, kind, radius) => {
    const s = scene(
      `  box a "A"\n  style a { shape ${shape} }\n  placement {\n    place a at (200, 100)\n  }`,
    );
    const outline = of(element(s, "a"), kind)[0] as RectItem;
    expect(outline.radius).toBe(radius);
  });

  it.each([
    ["ellipse", " A"],
    ["diamond", " L"],
    ["cylinder", " A"],
  ])("draws %s boxes as paths", (shape, command) => {
    const s = scene(
      `  box a "A"\n  style a { shape ${shape} }\n  placement {\n    place a at (200, 100)\n  }`,
    );
    const outline = of(element(s, "a"), "path")[0] as PathItem;
    expect(outline.d).toContain(command);
  });

  it("draws the shorthand data form as a cylinder", () => {
    const s = scene('  db[("Orders")]\n  placement {\n    place db at (200, 100)\n  }');
    expect(of(element(s, "db"), "path")).toHaveLength(2);
  });

  it("aligns box labels", () => {
    const s = scene(
      '  box a "A"\n  style a { textAlign left; fontSize 18 }\n  placement {\n    place a at (200, 100)\n    size a (200, 60)\n  }',
    );
    const label = of(element(s, "a"), "text")[0] as TextItem;
    const outline = of(element(s, "a"), "rect")[0] as RectItem;
    expect(label).toMatchObject({ anchor: "start", size: 18, x: outline.x + 16 });
  });

  it("draws an icon placeholder without an icon resolver", () => {
    const s = scene('  icon s "tabler:server"\n  placement {\n    place s at (100, 100)\n  }');
    const g = element(s, "s");
    expect(of(g, "rect")[0]).toMatchObject({ width: 48, height: 48, dashed: true });
  });
});

describe("images", () => {
  const sheet =
    '  image logo "logo.png" { description "Company logo" }\n  placement {\n    place logo at (200, 100)\n  }';

  it("draws a placeholder and warns without a resolver", () => {
    const result = run(sheet);
    expect(result.codes).toEqual(["layout.image-unavailable"]);
    expect(result.boxes!.get("logo")).toMatchObject({ width: 160, height: 120 });
    const g = element(result.scene!, "logo");
    expect(of(g, "rect")[0]).toMatchObject({ dashed: true });
    expect(of(g, "text")[0]!.text).toBe("logo.png");
  });

  it("embeds a resolved image at its pixel size", () => {
    const images: ImageResolver = {
      resolve: (path) =>
        path === "logo.png"
          ? { format: "png", width: 320, height: 80, href: "data:image/png;base64,AAAA" }
          : undefined,
    };
    const result = run(sheet, { images });
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("logo")).toMatchObject({ width: 320, height: 80 });
    const image = of(element(result.scene!, "logo"), "image")[0] as ImageItem;
    expect(image).toMatchObject({
      width: 320,
      height: 80,
      href: "data:image/png;base64,AAAA",
      title: "Company logo",
    });
  });

  it("scales wide images down to 640", () => {
    const images: ImageResolver = {
      resolve: () => ({ format: "png", width: 1280, height: 720, href: "data:image/png;base64," }),
    };
    expect(run(sheet, { images }).boxes!.get("logo")).toMatchObject({ width: 640, height: 360 });
  });
});

/** The drawn elements and relations of a scene, in paint order. */
const order = (s: Scene) =>
  s.items.flatMap((i) => (i.kind === "group" ? [`${i.role}:${i.id}`] : []));

describe("layers and paint order", () => {
  it("paints groups, then objects in source order, then relations, per layer", () => {
    const s = scene(
      '  layers main, front\n  box a "A" { layer front }\n  box b "B"\n  group g "G" {\n    box c "C"\n  }\n  b -> c as r\n  placement {\n    place a at (100, 100)\n    place b at (300, 100)\n    place g at (300, 400)\n    size g (300, 200)\n    place c at (100, 60)\n  }',
    );
    expect(order(s)).toEqual(["element:g", "element:b", "element:c", "relation:r", "element:a"]);
  });

  it("does not report overlaps between layers", () => {
    const body =
      '  layers back\n  box a "A" { layer back }\n  box b "B"\n  placement {\n    place a at (100, 100)\n    place b at (120, 110)\n  }';
    expect(run(body).codes).toEqual([]);
    expect(run(body.replace(" { layer back }", "")).codes).toEqual(["layout.overlap"]);
  });

  const stack = (first: string, second: string, third = "") =>
    `  ${first}\n  ${second}\n${third ? `  ${third}\n` : ""}  placement {\n    place outer at (300, 200)\n    size outer (260, 240)\n    place middle at (300, 200)\n    size middle (210, 180)\n    place inner at (300, 200)\n    size inner (150, 130)\n  }`;

  it("draws a stack outer first and does not report it", () => {
    const result = run(stack('box outer ""', 'box middle ""', 'box inner ""'));
    expect(result.codes).toEqual([]);
    expect(order(result.scene!)).toEqual(["element:outer", "element:middle", "element:inner"]);
  });

  it("reports a stack declared inner first on the outer box", () => {
    const result = run(stack('box inner ""', 'box outer ""').replace(/\n.*middle.*/g, ""));
    expect(result.codes).toEqual(["layout.overlap"]);
    expect(result.diagnostics[0]!.data).toEqual({ ids: ["inner", "outer"] });
    expect(result.diagnostics[0]!.range.start.line).toBe(9); // `box outer`, one-based
    expect(result.diagnostics[0]!.hints).toEqual([
      "Declare `outer` before `inner` to draw a stack.",
    ]);
  });

  it("gives hosts the stack rule the checks use", () => {
    const outer = { x: 0, y: 0, width: 260, height: 240 };
    expect(stacked(outer, { x: 55, y: 55, width: 150, height: 130 })).toBe(true);
    expect(stacked(outer, { x: 0, y: 0, width: 260, height: 240 })).toBe(false);
    expect(stacked(outer, { x: 200, y: 55, width: 150, height: 130 })).toBe(false);
    expect(stacked({ x: 55, y: 55, width: 150, height: 130 }, outer)).toBe(false);
  });

  it("reports boxes that coincide: one hides the other, which is no stack", () => {
    const body = (label: string) =>
      `  box a ${label}\n  box b ${label}\n  placement {\n    place a at (200, 200)\n    place b at (200, 200)\n  }`;
    for (const label of ['""', '"A"']) {
      const result = run(body(label));
      expect(result.codes, label).toEqual(["layout.overlap"]);
      expect(result.diagnostics[0]!.data).toEqual({ ids: ["a", "b"] });
      expect(result.diagnostics[0]!.hints).toBeUndefined();
    }
  });

  it("takes a box a pixel inside another on one side as a stack, half a pixel as no stack", () => {
    const body = (inner: string) =>
      `  box outer ""\n  box inner ""\n  placement {\n    place outer at (300, 200)\n    size outer (160, 56)\n    place inner at (300, 200)\n    size inner ${inner}\n  }`;
    expect(run(body("(158, 56)")).codes).toEqual([]);
    expect(run(body("(160, 54)")).codes).toEqual([]);
    expect(run(body("(159, 56)")).codes).toEqual(["layout.overlap"]);
  });

  it("does not hold a box to the margin of its group on another layer", () => {
    // `a` is 4 px inside the left edge of `g`, which is on `back` while `a` is on `main`.
    const body =
      '  layers back, main\n  group g "" {\n    layer back\n    box a "A"\n  }\n  placement {\n    place g at (300, 200)\n    size g (400, 200)\n    place a at (68, 16)\n  }';
    expect(run(body).codes).toEqual([]);
    expect(run(body.replace("    layer back\n", "")).codes).toEqual(["layout.container-margin"]);
    // A titled group's band is not checked across layers either.
    expect(run(body.replace('group g ""', 'group g "G"')).codes).toEqual([]);
  });

  it("does not check a band on a back layer against boxes, groups or connectors", () => {
    const body =
      '  layers back, main\n  box band "" { layer back }\n  box api "API"\n  box db "DB"\n  group g "G" {\n    box c "C"\n  }\n  api -> db as call\n  style call { routing polyline }\n  placement {\n    place band at (400, 200)\n    size band (300, 200)\n    place api at (250, 200)\n    place db at (700, 200)\n    place g at (450, 360)\n    size g (200, 160)\n    place c at (84, 70)\n  }';
    expect(run(body).codes).toEqual([]);
    // On one layer, the band overlaps `api` and the group, and the connector runs through it.
    const flat = run(body.replace(" { layer back }", ""));
    expect(flat.diagnostics.map((d) => [d.code, d.data?.ids])).toEqual([
      ["layout.overlap", ["band", "api"]],
      ["layout.overlap", ["band", "g"]],
      ["layout.connector-crossing", ["call", "band"]],
    ]);
  });

  it("does not report a connector between boxes stacked inside another box", () => {
    const body = (routing: string) =>
      `  box outer ""\n  box a "A"\n  box b "B"\n  a -> b as link\n${routing}  placement {\n    place outer at (300, 200)\n    size outer (400, 200)\n    place a at (200, 200)\n    place b at (400, 200)\n  }`;
    expect(run(body("  style link { routing polyline }\n")).codes).toEqual([]);
    // A default connector keeps its straight route instead of going around the container.
    const result = run(body(""));
    expect(result.codes).toEqual([]);
    expect(result.connectors!.get("link")!.points).toEqual([
      { x: 280, y: 200 },
      { x: 320, y: 200 },
    ]);
  });

  it("keeps a straight connector over a band on a back layer", () => {
    const result = run(
      '  layers back, main\n  box band "" { layer back }\n  box api "API"\n  box db "DB"\n  api -> db as call\n  placement {\n    place band at (400, 200)\n    size band (300, 200)\n    place api at (150, 200)\n    place db at (650, 200)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(result.connectors!.get("call")!.points).toEqual([
      { x: 230, y: 200 },
      { x: 570, y: 200 },
    ]);
  });
});

describe("modes", () => {
  it("arranges every object in auto, writing nothing", () => {
    const result = run('  layout auto\n  box a "A"\n  box b "B"\n  box c "C"\n  a -> b\n  b -> c', {
      engine: gridEngine,
    });
    expect(result.codes).toEqual([]);
    const [a, b, c] = ["a", "b", "c"].map((id) => result.boxes!.get(id)!);
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBeLessThan(c!.x);
  });

  it("fits groups to their children in auto and reports their origins", () => {
    const result = run('  layout auto\n  group g "G" {\n    box a "A"\n  }\n  a -> b', {
      engine: gridEngine,
    });
    const g = result.boxes!.get("g")!;
    expect(result.origins!.get("a")).toEqual({ x: g.x + 16, y: g.y + 40 });
  });

  it("refuses a placed child of an unplaced group in assisted", () => {
    const result = run(
      '  layout assisted\n  group g "G" {\n    box a "A"\n  }\n  box b "B"\n  a -> b\n  placement {\n    place a at (60, 40)\n  }',
      { engine: gridEngine },
    );
    expect(result.codes).toEqual(["layout.missing-placement"]);
  });

  it("arranges unplaced boxes over a band on a back layer in assisted", () => {
    let request: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    // A column of boxes over the band, which spans 50..550 × 50..350.
    const column: LayoutEngine = {
      name: "column",
      arrange: (r) => {
        request = r;
        return {
          centers: new Map(r.nodes.map((n, i) => [n.id, { x: 300, y: 100 + i * 100 }])),
          routes: new Map(),
        };
      },
    };
    const result = run(
      '  layout assisted\n  layers back, main\n  group band "" { layer back }\n  box a "A"\n  box b "B"\n  box c "C"\n  a -> b\n  b -> c\n  placement {\n    place band at (300, 200)\n    size band (500, 300)\n  }',
      { engine: column },
    );
    expect(result.codes).toEqual([]);
    expect(request!.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(result.boxes!.get("band")).toEqual({ x: 50, y: 50, width: 500, height: 300 });
    // Nothing is pushed out of the band.
    expect(["a", "b", "c"].map((id) => result.boxes!.get(id))).toEqual([
      { x: 220, y: 72, width: 160, height: 56 },
      { x: 220, y: 172, width: 160, height: 56 },
      { x: 220, y: 272, width: 160, height: 56 },
    ]);
    expect(order(result.scene!)[0]).toBe("element:band");
  });

  it("leaves a band out of the engine's request, so it takes no slot there", () => {
    let request: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (r) => {
        request = r;
        return gridEngine.arrange(r);
      },
    };
    const result = run(
      '  layout assisted\n  layers back, main\n  group band "" { layer back }\n  group hold "" {\n    box c "C"\n  }\n  box a "A"\n  box b "B"\n  a -> b\n  b -> band\n  placement {\n    place band at (300, 200)\n    size band (500, 300)\n    place hold at (900, 200)\n    size hold (300, 200)\n  }',
      { engine: spy },
    );
    expect(result.codes).toEqual([]);
    // A placed and sized group that holds a box is still a container of the arrangement.
    expect(request!.groups.map((g) => g.id)).toEqual(["hold"]);
    expect(request!.nodes.map((n) => n.id)).toEqual(["c", "a", "b"]);
    // The relation to the band is drawn, but the engine does not see it.
    expect(request!.edges.map((e) => [e.source, e.target])).toEqual([["a", "b"]]);
    expect([...result.connectors!.keys()]).toHaveLength(2);
  });

  it("arranges unplaced objects around placed ones in assisted", () => {
    const result = run(
      '  layout assisted\n  box a "A"\n  box b "B"\n  a -> b\n  placement {\n    place a at (200, 100)\n  }',
      { engine: gridEngine },
    );
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("a")).toMatchObject({ x: 120, y: 72 });
    expect(result.boxes!.has("b")).toBe(true);
  });
});
