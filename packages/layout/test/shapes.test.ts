import { describe, expect, it } from "vitest";
import { BOX_SHAPES, compile, type Point } from "@meltemi/diagrams-model";
import {
  SHAPE_SIZES,
  auditLabels,
  estimateMeasurer,
  layoutDiagram,
  onOutline,
  pointInShape,
  segmentCrossesShape,
  shapeMagnets,
  shapeOutline,
  shapeTextArea,
  shapeTextCenter,
  type Box,
  type BoxShape,
  type GroupItem,
  type LayoutEngine,
  type LayoutOptions,
  type PathItem,
  type Scene,
  type SceneItem,
  type TextItem,
} from "../src/index.js";

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';

function run(
  body: string,
  options: LayoutOptions = {},
  kind = "free",
  extra = "",
  theme = "plain",
) {
  const compilation = compile(
    `${PLAIN}${extra}diagram d: ${kind} {\n  theme "${theme}"\n${body}\n}\n`,
  );
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const diagram = compilation.document.diagrams.find((d) => d.id === "d")!;
  const result = layoutDiagram(compilation, diagram, options);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return { ...result, scene: result.scene, codes: result.diagnostics.map((d) => d.code) };
}

function element(scene: Scene, id: string, role = "element"): GroupItem {
  const found = scene.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === role,
  );
  if (!found) throw new Error(`no ${role} ${id}`);
  return found;
}

const of = <K extends SceneItem["kind"]>(g: GroupItem, kind: K) =>
  g.items.filter((i): i is Extract<SceneItem, { kind: K }> => i.kind === kind);

/** The box a group was drawn in, in scene coordinates. */
const drawn = (g: GroupItem): Box => {
  const { x, y, width, height } = g.bounds!;
  return { x, y, width, height };
};

/** How far a point is from a polygon's outline. */
function distanceToOutline(polygon: readonly Point[], p: Point): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t =
      length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }
  return best;
}

/** The box the glyphs of a text cover, as the label audit measures it with estimates. */
function glyphs(text: TextItem): Box {
  const width = estimateMeasurer.width(text.text, "Inter", text.weight, text.size);
  const top = text.baseline - (0.7 + 0.06) * text.size;
  const bottom = text.baseline + 0.22 * text.size;
  const x =
    text.anchor === "start" ? text.x : text.anchor === "end" ? text.x - width : text.x - width / 2;
  return { x, y: top, width, height: bottom - top };
}

const corners = (b: Box): Point[] => [
  { x: b.x, y: b.y },
  { x: b.x + b.width, y: b.y },
  { x: b.x + b.width, y: b.y + b.height },
  { x: b.x, y: b.y + b.height },
];

const within = (outer: Box, inner: Box, tolerance = 0.01) =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.width <= outer.x + outer.width + tolerance &&
  inner.y + inner.height <= outer.y + outer.height + tolerance;

const SHAPES = BOX_SHAPES as readonly BoxShape[];
/** Shapes whose outline is their box. */
const BOXED = new Set<BoxShape>(["rounded", "rectangle", "square", "framed", "icon"]);
/** Shapes whose text keeps the whole width of the box. */
const FULL_WIDTH = new Set<BoxShape>(["rounded", "rectangle", "square", "cylinder", "person"]);

const BOX = { x: 100, y: 50, width: 160, height: 80 };

describe("shape geometry", () => {
  it("has a default size for every shape, square shapes 120 × 120", () => {
    expect(Object.keys(SHAPE_SIZES).sort()).toEqual([...SHAPES].sort());
    expect(SHAPE_SIZES.square).toEqual({ width: 120, height: 120 });
    expect(SHAPE_SIZES.circle).toEqual({ width: 120, height: 120 });
    expect(SHAPE_SIZES.star).toEqual({ width: 120, height: 120 });
    // The six shapes of 1.7 keep their sizes.
    expect(SHAPE_SIZES.rounded).toEqual({ width: 160, height: 56 });
    expect(SHAPE_SIZES.ellipse).toEqual({ width: 160, height: 72 });
    expect(SHAPE_SIZES.diamond).toEqual({ width: 160, height: 80 });
    expect(SHAPE_SIZES.cylinder).toEqual({ width: 160, height: 64 });
    expect(SHAPE_SIZES.pill).toEqual({ width: 160, height: 56 });
    expect(SHAPE_SIZES.person).toEqual({ width: 160, height: 104 });
    expect(SHAPE_SIZES.agent).toEqual({ width: 160, height: 120 });
    // An icon shape is the icon's square; its label is outside it.
    expect(SHAPE_SIZES.icon).toEqual({ width: 64, height: 64 });
  });

  const COMMANDS: Record<BoxShape, RegExp> = {
    rounded: /^M[^A]* A8 8 0 0 1/,
    rectangle: /^M\S+ \S+ L\S+ \S+ L\S+ \S+ L\S+ \S+ Z$/,
    square: /^M\S+ \S+ L\S+ \S+ L\S+ \S+ L\S+ \S+ Z$/,
    ellipse: /^M\S+ \S+ A80 40 0 1 0/,
    circle: /^M\S+ \S+ A80 40 0 1 0/,
    diamond: /^M180 50 L260 90 L180 130 L100 90 Z$/,
    cylinder: /^M100 58 L100 122 A80 8 .* Z M100 58 A80 8 .* Z$/,
    pill: /^M140 50 .*A40 40 0 0 1/,
    triangle: /^M180 50 L260 130 L100 130 Z$/,
    parallelogram: /^M132 50 L260 50 L228 130 L100 130 Z$/,
    trapezoid: /^M132 50 L228 50 L260 130 L100 130 Z$/,
    pentagon: /^M180 50 L260 80.4 L229.6 130 L130.4 130 L100 80.4 Z$/,
    hexagon: /^M140 50 L220 50 L260 90 L220 130 L140 130 L100 90 Z$/,
    octagon:
      /^M123.2 50 L236.8 50 L260 73.2 L260 106.8 L236.8 130 L123.2 130 L100 106.8 L100 73.2 Z$/,
    star: /^M180 50 (L\S+ \S+ ){9}Z$/,
    cloud: /^M\S+ \S+( C\S+ \S+ \S+ \S+ \S+ \S+){7} Z$/,
    document: /^M100 50 L260 50 L260 \S+ C\S+ \S+ \S+ \S+ 100 \S+ Z$/,
    callout: /^M100 50 L260 50 L260 114 L156 114 L124 130 L132 114 L100 114 Z$/,
    arrow: /^M100 70 L204 70 L204 50 L260 90 L204 130 L204 110 L100 110 Z$/,
    framed: /^M100 50 L260 50 L260 130 L100 130 Z M108 50 L108 130 M252 50 L252 130$/,
    flag: /^M100 50 L260 50 L260 130 L100 130 L124 90 Z$/,
    person: /^M\S+ \S+ L.* A\S+ \S+ 0 1 0/,
    // The body, the head, two eyes, the mouth, the antenna from the top of the head and its dot.
    agent:
      /^M108 75.6 L252 75.6 A8 8 0 0 1 [^M]* Z M175.01 56.4 [^M]* Z( M\S+ 64.46 A\S+ \S+ 0 1 1 [^M]* Z){2} M\S+ 70.61 L\S+ 70.61 M180 56.4 L180 53.58 M178.21 51.79 A1.79 1.79 0 1 1 [^M]* Z$/,
    // The icon's square.
    icon: /^M100 50 L260 50 L260 130 L100 130 Z$/,
  };

  it.each(SHAPES.map((s) => [s] as const))("draws %s as path data and a polygon", (shape) => {
    const { d, points } = shapeOutline(shape, BOX);
    expect(d).toMatch(COMMANDS[shape]);
    expect(d).not.toContain("NaN");
    expect(points.length).toBeGreaterThanOrEqual(3);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(BOX.x - 1e-9);
      expect(p.x).toBeLessThanOrEqual(BOX.x + BOX.width + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(BOX.y - 1e-9);
      expect(p.y).toBeLessThanOrEqual(BOX.y + BOX.height + 1e-9);
    }
  });

  it.each(SHAPES.map((s) => [s] as const))("still draws %s in a 24 px box", (shape) => {
    const small = { x: 0, y: 0, width: 24, height: 24 };
    const { d, points } = shapeOutline(shape, small);
    expect(d).not.toContain("NaN");
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(24 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(24 + 1e-9);
    }
    expect(pointInShape(shape, small, { x: 12, y: 14 })).toBe(true);
  });

  it.each(SHAPES.map((s) => [s] as const))("moves a pinned end on %s onto the outline", (shape) => {
    const { points } = shapeOutline(shape, BOX);
    for (const [side, at] of [
      ["north", { x: BOX.x + BOX.width * 0.3, y: BOX.y }],
      ["south", { x: BOX.x + BOX.width * 0.7, y: BOX.y + BOX.height }],
      ["west", { x: BOX.x, y: BOX.y + BOX.height * 0.3 }],
      ["east", { x: BOX.x + BOX.width, y: BOX.y + BOX.height * 0.6 }],
    ] as const) {
      const end = onOutline(shape, BOX, at, side);
      expect(distanceToOutline(points, end), `${shape} ${side}`).toBeLessThan(0.5);
      if (BOXED.has(shape)) expect(end).toBe(at);
    }
  });

  it.each(SHAPES.map((s) => [s] as const))("puts the magnets of %s on its outline", (shape) => {
    const { points } = shapeOutline(shape, BOX);
    const magnets = shapeMagnets(shape, BOX);
    expect(magnets.length).toBeGreaterThanOrEqual(4);
    for (const magnet of magnets) {
      expect(distanceToOutline(points, magnet.point)).toBeLessThan(0.5);
      // Written as a side percentage, the layout moves the end back onto the magnet.
      const fraction = magnet.position / 100;
      const at =
        magnet.side === "north" || magnet.side === "south"
          ? {
              x: BOX.x + BOX.width * fraction,
              y: magnet.side === "north" ? BOX.y : BOX.y + BOX.height,
            }
          : {
              x: magnet.side === "west" ? BOX.x : BOX.x + BOX.width,
              y: BOX.y + BOX.height * fraction,
            };
      const end = onOutline(shape, BOX, at, magnet.side);
      expect(end.x).toBeCloseTo(magnet.point.x, 6);
      expect(end.y).toBeCloseTo(magnet.point.y, 6);
    }
  });

  it("gives boxes their middles and corners, ellipses and circles only their middles", () => {
    expect(shapeMagnets("rectangle", BOX)).toHaveLength(8);
    expect(shapeMagnets("rounded", BOX)).toHaveLength(8);
    // An icon shape's magnets are the middles and corners of its square.
    expect(shapeMagnets("icon", { x: 0, y: 0, width: 64, height: 64 }).map((m) => m.point)).toEqual(
      [
        { x: 32, y: 0 },
        { x: 64, y: 32 },
        { x: 32, y: 64 },
        { x: 0, y: 32 },
        { x: 0, y: 0 },
        { x: 64, y: 0 },
        { x: 64, y: 64 },
        { x: 0, y: 64 },
      ],
    );
    expect(shapeMagnets("ellipse", BOX).map((m) => [m.side, m.position])).toEqual([
      ["north", 50],
      ["east", 50],
      ["south", 50],
      ["west", 50],
    ]);
    expect(shapeMagnets("circle", { x: 0, y: 0, width: 120, height: 120 })).toHaveLength(4);
    expect(shapeMagnets("diamond", BOX)).toHaveLength(4);
    // A hexagon: four middles, two of which are its pointed vertices, and four more vertices.
    expect(shapeMagnets("hexagon", BOX).map((m) => m.point)).toEqual([
      { x: 180, y: 50 },
      { x: 260, y: 90 },
      { x: 180, y: 130 },
      { x: 100, y: 90 },
      { x: 140, y: 50 },
      { x: 220, y: 50 },
      { x: 220, y: 130 },
      { x: 140, y: 130 },
    ]);
    // A star's five points are on its box; its inner corners are not magnets.
    const star = shapeMagnets("star", { x: 0, y: 0, width: 120, height: 120 });
    expect(star.filter((m) => m.position !== 50)).toHaveLength(4);
  });

  it.each(SHAPES.map((s) => [s] as const))("keeps the text area of %s inside it", (shape) => {
    const center = shapeTextCenter(shape, BOX);
    const area = shapeTextArea(shape, BOX, center.y - 7, center.y + 7, center.x);
    expect(area.width).toBeGreaterThan(0);
    for (const corner of corners(area)) expect(pointInShape(shape, BOX, corner)).toBe(true);
  });

  it("measures the rows of diamonds and ellipses exactly", () => {
    const diamond = shapeTextArea("diamond", BOX, 80, 100, 180);
    expect(diamond.width).toBeCloseTo(160 * (1 - 20 / 80), 6);
    const ellipse = shapeTextArea("ellipse", BOX, 80, 100, 180);
    expect(ellipse.width).toBeCloseTo(160 * Math.sqrt(1 - (10 / 40) ** 2), 6);
    // A band beyond the shape has no width.
    expect(shapeTextArea("diamond", BOX, 40, 60, 180).width).toBe(0);
  });

  it("moves the text centre towards the wide part of apex shapes", () => {
    expect(shapeTextCenter("triangle", BOX).y).toBeCloseTo(50 + (80 * 2) / 3, 6);
    expect(shapeTextCenter("pentagon", BOX).y).toBeGreaterThan(90);
    expect(shapeTextCenter("diamond", BOX)).toEqual({ x: 180, y: 90 });
    expect(shapeTextCenter("callout", BOX).y).toBeLessThan(90);
  });

  it("moves an end in a corner of the box to the nearest point of the outline", () => {
    const corner = { x: BOX.x, y: BOX.y };
    // The normal of either side only grazes the diamond's vertex: the end goes onto the edge.
    expect(onOutline("diamond", BOX, corner, "west")).toEqual({ x: 116, y: 82 });
    expect(onOutline("diamond", BOX, corner, "north")).toEqual({ x: 116, y: 82 });
    // A cylinder's end stays by the corner, on the rim beside the wall, not at the rim's top.
    const rim = onOutline("cylinder", BOX, corner, "west");
    expect(rim.x).toBeGreaterThan(BOX.x);
    expect(rim.x).toBeLessThan(BOX.x + 4);
    expect(rim.y).toBeGreaterThan(BOX.y);
    expect(rim.y).toBeLessThan(BOX.y + 8);
    expect(distanceToOutline(shapeOutline("cylinder", BOX).points, rim)).toBeLessThan(0.5);
    // An ellipse's end goes onto its shoulder.
    const shoulder = onOutline(
      "ellipse",
      BOX,
      { x: BOX.x + BOX.width, y: BOX.y + BOX.height },
      "east",
    );
    expect(shoulder.x).toBeGreaterThan(220);
    expect(shoulder.x).toBeLessThan(260);
    expect(shoulder.y).toBeGreaterThan(90);
    expect(shoulder.y).toBeLessThan(130);
    expect(distanceToOutline(shapeOutline("ellipse", BOX).points, shoulder)).toBeLessThan(0.5);
    // A corner the outline passes through is its own nearest point.
    const base = { x: BOX.x, y: BOX.y + BOX.height };
    expect(onOutline("triangle", BOX, base, "west")).toBe(base);
  });

  it("puts an agent's text in its body and its north magnet on the top of its head", () => {
    const magnets = shapeMagnets("agent", BOX);
    expect(magnets.map((m) => [m.side, m.position, m.point])).toEqual([
      ["north", 50, { x: 180, y: 56.4 }],
      ["east", 50, { x: 260, y: 90 }],
      ["south", 50, { x: 180, y: 130 }],
      ["west", 50, { x: 100, y: 90 }],
    ]);
    // The antenna rises above the head, but is no part of the outline.
    expect(Math.min(...shapeOutline("agent", BOX).points.map((p) => p.y))).toBe(56.4);
    expect(shapeOutline("agent", BOX).d).toContain("M180 56.4 L180 53.58");
    expect(shapeTextCenter("agent", BOX)).toEqual({ x: 180, y: 102.8 });
    // Rows of the head hold no text; rows of the body hold the whole width.
    expect(shapeTextArea("agent", BOX, 60, 70, 180).width).toBe(0);
    expect(shapeTextArea("agent", BOX, 96, 110, 180)).toEqual({
      x: 100,
      y: 96,
      width: 160,
      height: 14,
    });
  });

  it("keeps an agent's head and antenna in the top third, so spread ends meet its body", () => {
    const box = { x: 0, y: 0, width: 160, height: 120 };
    const top = Math.min(...shapeOutline("agent", box).points.map((p) => p.y));
    expect(top).toBeCloseTo(9.6, 6);
    // Two ends on a side lie at a third and two thirds of it: both meet the body.
    for (const y of [40, 80]) {
      expect(onOutline("agent", box, { x: 160, y }, "east").x).toBeGreaterThan(148);
      expect(onOutline("agent", box, { x: 0, y }, "west").x).toBeLessThan(12);
    }
  });

  it("crosses a shape through its outline only", () => {
    // Through the top-left corner of the diamond's box, above its upper-left edge.
    expect(segmentCrossesShape("diamond", BOX, { x: 90, y: 70 }, { x: 130, y: 40 })).toBe(false);
    expect(segmentCrossesShape("rectangle", BOX, { x: 90, y: 70 }, { x: 130, y: 40 })).toBe(true);
    expect(segmentCrossesShape("diamond", BOX, { x: 90, y: 90 }, { x: 270, y: 90 })).toBe(true);
  });
});

/** The shapes that draw their text inside them: all but the icon, whose label is outside. */
const TEXT_SHAPES = SHAPES.filter((shape) => shape !== "icon");

/** Every shape of a free box that holds its text, drawn at its default size with a label. */
const everyShape = (label: string) =>
  [
    ...TEXT_SHAPES.map((shape, i) => `  box s${i} "${label}"\n  style s${i} { shape ${shape} }`),
    "  placement {",
    ...TEXT_SHAPES.map(
      (_, i) => `    place s${i} at (${(i % 4) * 800}, ${Math.floor(i / 4) * 600})`,
    ),
    "  }",
  ].join("\n");

describe("free objects are drawn", () => {
  it.each(SHAPES.map((s) => [s] as const))("lays out %s at its default size", (shape) => {
    const result = run(
      `  box a "A"\n  style a { shape ${shape} }\n  placement {\n    place a at (200, 100)\n  }`,
    );
    const box = result.boxes!.get("a")!;
    expect([box.width, box.height]).toEqual([SHAPE_SIZES[shape].width, SHAPE_SIZES[shape].height]);
    expect(result.shapes!.get("a")).toBe(shape);
  });

  it("keeps every label inside its shape, at the default size, without a warning", () => {
    const result = run(everyShape("Payments reconciliation"));
    expect(result.codes).toEqual([]);
    TEXT_SHAPES.forEach((shape, i) => {
      const g = element(result.scene, `s${i}`);
      const box = drawn(g);
      const label = of(g, "text")[0]!;
      for (const corner of corners(glyphs(label))) {
        expect(pointInShape(shape, box, corner), `${shape} ${JSON.stringify(corner)}`).toBe(true);
      }
      if (FULL_WIDTH.has(shape)) expect(g.bounds!.inner).toBeUndefined();
      else expect(within(g.bounds!.inner!, glyphs(label), 0.75)).toBe(true);
    });
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("grows a hexagon for its label beyond a rounded box with the same label", () => {
    const result = run(
      '  box a "Payments reconciliation"\n  box b "Payments reconciliation"\n  style a { shape hexagon }\n  placement {\n    place a at (200, 100)\n    place b at (600, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    const hexagon = result.boxes!.get("a")!;
    expect(hexagon.width).toBeGreaterThan(result.boxes!.get("b")!.width);
    const g = element(result.scene, "a");
    const label = of(g, "text")[0]!;
    for (const corner of corners(glyphs(label))) {
      expect(pointInShape("hexagon", drawn(g), corner)).toBe(true);
    }
  });

  it("draws an agent that holds its label in its body", () => {
    const result = run(
      '  box a "Planner\\nagent"\n  box b "User"\n  b -> a as r\n  style a { shape agent }\n  placement {\n    place a at (300, 300)\n    place b at (300, 60)\n    route r from b.south to a.north\n  }',
    );
    expect(result.codes).toEqual([]);
    const box = result.boxes!.get("a")!;
    expect(box.width).toBeGreaterThanOrEqual(160);
    const g = element(result.scene, "a");
    const drawnBox = drawn(g);
    const labels = of(g, "text");
    expect(labels.map((t) => t.text)).toEqual(["Planner", "agent"]);
    expect(labels[1]!.baseline - labels[0]!.baseline).toBe(16);
    // Both lines lie inside the body: the rows they cover reach the sides of the box.
    for (const label of labels) {
      for (const corner of corners(glyphs(label))) {
        expect(pointInShape("agent", drawnBox, corner), JSON.stringify(corner)).toBe(true);
        const row = { x: drawnBox.x + 1, y: corner.y };
        expect(pointInShape("agent", drawnBox, row), JSON.stringify(row)).toBe(true);
      }
    }
    expect(within(g.bounds!.inner!, glyphs(labels[0]!), 0.75)).toBe(true);
    // The north end meets the top of the head, below the antenna.
    const end = result.connectors!.get("r")!.points.at(-1)!;
    const head = Math.min(...shapeOutline("agent", box).points.map((p) => p.y));
    expect(end).toEqual({ x: box.x + box.width / 2, y: head });
    expect(head).toBeGreaterThan(box.y);
    // One path: the body, the head, its eyes and mouth, the antenna and its dot.
    const paths = of(g, "path");
    expect(paths).toHaveLength(1);
    expect(paths[0]!.d.match(/M/g)).toHaveLength(7);
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("grows an agent until its body holds its lines", () => {
    const result = run(
      '  box a "One\\ntwo\\nthree\\nfour\\nfive"\n  style a { shape agent }\n  placement {\n    place a at (300, 300)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("a")!.height).toBeGreaterThan(120);
    const g = element(result.scene, "a");
    for (const label of of(g, "text")) {
      for (const corner of corners(glyphs(label))) {
        expect(pointInShape("agent", drawn(g), { x: drawn(g).x + 1, y: corner.y })).toBe(true);
      }
    }
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("reports an agent too short for its lines, and suggests a taller one", () => {
    const result = run(
      '  box a "Planner\\nagent"\n  style a { shape agent }\n  placement {\n    place a at (300, 300)\n    size a (160, 40)\n  }',
    );
    // The body of a 40 px agent is 27.2 px tall; the two lines need 29.
    const overflow = result.diagnostics.find((d) => d.code === "layout.text-overflow")!;
    const fit = overflow.data!.size as { width: number; height: number };
    expect(fit.height).toBeGreaterThan(40);
    expect(overflow.hints![0]).toContain(`size a (${fit.width}, ${fit.height})`);
  });

  it("draws a square untitled group with no corner radius and no text", () => {
    const result = run(
      '  group g "" {\n    box a "A"\n  }\n  style g { fill "#dae8fc"; radius 0 }\n  placement {\n    place g at (300, 200)\n    size g (400, 240)\n    place a at (60, 40)\n  }',
    );
    const g = element(result.scene, "g");
    expect(of(g, "rect")).toHaveLength(1);
    expect(of(g, "rect")[0]).toMatchObject({ radius: 0, fill: "#dae8fc" });
    expect(of(g, "text")).toEqual([]);
  });

  it("refuses an unknown shape and draws the box rounded", () => {
    const compilation = compile(
      `${PLAIN}diagram d: free {\n  theme "plain"\n  box a "A"\n  style a { shape blob }\n  placement {\n    place a at (200, 100)\n  }\n}\n`,
    );
    const problem = compilation.diagnostics.find((d) => d.code === "prop.invalid-value")!;
    expect(problem.message).toContain("blob");
    expect(JSON.stringify(problem)).toContain("hexagon");
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    expect(result.shapes!.get("a")).toBe("rounded");
    expect(of(element(result.scene!, "a"), "rect")[0]!.radius).toBe(8);
  });

  it("draws the new shapes as one outline path and keeps the overlay on it", () => {
    const result = run(
      '  box a "A"\n  box b "B"\n  style a { shape star; pattern hatch }\n  style b { shape framed }\n  placement {\n    place a at (200, 100)\n    place b at (500, 100)\n  }',
    );
    const star = of(element(result.scene, "a"), "path");
    expect(star).toHaveLength(2);
    expect(star[1]!.d).toBe(star[0]!.d);
    expect(star[1]!.fill).toMatch(/^url\(#pattern-/);
    // A framed box is a rectangle with its two inner lines.
    const framed = element(result.scene, "b");
    expect(of(framed, "rect")[0]!.radius).toBe(0);
    expect(of(framed, "path")[0]).toMatchObject({ fill: "none" });
  });

  it("reports the drawn shape of every element box", () => {
    const result = run(
      '  layout manual\n  node api "API"\n  node hex "Hex"\n  decision ok "OK?"\n  data db "DB"\n  tag t "JWT"\n  note n "Note"\n  group g "G" { node c "C" }\n  style hex { shape hexagon }\n  placement {\n    place api at (100, 100)\n    place hex at (400, 100)\n    place ok at (700, 100)\n    place db at (100, 300)\n    place t at (400, 300)\n    place n at (700, 300)\n    place c at (100, 500)\n  }',
      {},
      "flow",
    );
    expect(Object.fromEntries(result.shapes!)).toEqual({
      api: "rounded",
      hex: "hexagon",
      ok: "diamond",
      db: "cylinder",
      t: "pill",
      n: "rounded",
      c: "rounded",
    });
  });
});

describe("shaped node sizes", () => {
  const flow = (body: string) => run(`  layout manual\n${body}`, {}, "flow");

  it("gives a node with a shape that shape's default size, grown until its text fits", () => {
    const result = flow(
      '  node a "API"\n  node b "Payments reconciliation"\n  node c "API"\n  style a, b { shape hexagon }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n    place c at (700, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("a")).toMatchObject({ width: 160, height: 64 });
    expect(result.boxes!.get("b")!.width).toBeGreaterThan(160);
    expect(result.boxes!.get("c")).toMatchObject({ width: 160, height: 56 });
    expect(of(element(result.scene, "a"), "path")[0]!.d).toMatch(/^M\S+ \S+( L\S+ \S+){5} Z$/);
  });

  it("keeps the default size of a decision whose label fits the diamond", () => {
    const result = flow(
      '  decision ok "Approved?"\n  decision long "Is the payment approved by risk?"\n  placement {\n    place ok at (100, 100)\n    place long at (500, 100)\n  }',
    );
    expect(result.boxes!.get("ok")).toMatchObject({ width: 160, height: 80 });
    const long = result.boxes!.get("long")!;
    expect(long.width).toBeGreaterThan(160);
    const g = element(result.scene, "long");
    for (const corner of corners(glyphs(of(g, "text")[0]!))) {
      expect(pointInShape("diamond", drawn(g), corner)).toBe(true);
    }
  });

  it("grows a diamond with several lines so its description no longer crosses the outline", () => {
    const result = flow(
      '  decision d "Decide" {\n    description "first line of text\\nsecond line is much longer"\n  }\n  placement {\n    place d at (300, 200)\n  }',
    );
    expect(result.codes).toEqual([]);
    const g = element(result.scene, "d");
    for (const text of of(g, "text")) {
      for (const corner of corners(glyphs(text))) {
        expect(pointInShape("diamond", drawn(g), corner), text.text).toBe(true);
      }
    }
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("suggests a width at which the text fits the shape", () => {
    const body = (size: string) =>
      `  decision d "Decide" {\n    description "first line of text\\nsecond line is much longer"\n  }\n  placement {\n    place d at (300, 200)\n    size d ${size}\n  }`;
    const narrow = flow(body("(160, 80)"));
    const overflow = narrow.diagnostics.find((d) => d.code === "layout.text-overflow")!;
    expect(overflow.data?.ids).toEqual(["d"]);
    const fit = overflow.data!.size as { width: number; height: number };
    expect(fit.height).toBe(80);
    expect(fit.width).toBeGreaterThan(160);
    expect(overflow.hints![0]).toContain(`size d (${fit.width}, 80)`);
    // At the suggested size the text fits: no warning, nothing beyond the inscribed area.
    const fitted = flow(body(`(${fit.width}, ${fit.height})`));
    expect(fitted.codes).toEqual([]);
    expect(auditLabels(fitted.scene, estimateMeasurer)).toEqual([]);
  });

  it("keeps the overflow check of boxes for rounded nodes and data stores", () => {
    const result = flow(
      '  node a "A rather long label"\n  data b "A rather long label"\n  placement {\n    place a at (100, 100)\n    size a (100, 56)\n    place b at (400, 100)\n    size b (100, 64)\n  }',
    );
    expect(result.codes).toEqual(["layout.text-overflow", "layout.text-overflow"]);
  });

  it("breaks a node's label at \\n into lines drawn inside its shape", () => {
    const result = flow(
      '  node a "Payments\\nreconciliation"\n  node b "One\\ntwo\\nthree"\n  node c "Payments reconciliation"\n  style a, c { shape hexagon }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n    place c at (700, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    const a = element(result.scene, "a");
    expect(of(a, "text").map((t) => t.text)).toEqual(["Payments", "reconciliation"]);
    for (const text of of(a, "text")) {
      for (const corner of corners(glyphs(text))) {
        expect(pointInShape("hexagon", drawn(a), corner), text.text).toBe(true);
      }
    }
    // Two lines take less width than one, and three lines a taller box, centred on it.
    expect(result.boxes!.get("a")!.width).toBeLessThan(result.boxes!.get("c")!.width);
    const b = element(result.scene, "b");
    expect(drawn(b).height).toBeGreaterThan(56);
    const middle = drawn(b).y + drawn(b).height / 2;
    expect(of(b, "text").map((t) => t.y - middle)).toEqual([-16, 0, 16]);
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("does not report a flow node with a shape and no text", () => {
    const result = flow(
      '  node a ""\n  style a { shape ellipse }\n  placement {\n    place a at (300, 200)\n    size a (300, 10)\n  }',
    );
    expect(result.codes).toEqual([]);
  });
});

describe("text overflow of shapes", () => {
  /** A free box with a label, a shape and a size. */
  const sized = (label: string, shape: string, size: string, extra = "") =>
    run(
      `  box a "${label}"\n  style a { shape ${shape}${extra} }\n  placement {\n    place a at (300, 200)\n    size a ${size}\n  }`,
    );
  const overflowOf = (result: ReturnType<typeof run>) =>
    result.diagnostics.find((d) => d.code === "layout.text-overflow");
  /** Shapes whose text area is narrower than their box. */
  const SHAPED = SHAPES.filter((shape) => !FULL_WIDTH.has(shape));

  it.each([
    ["star", "(24, 24)"],
    ["diamond", "(24, 24)"],
    ["triangle", "(24, 24)"],
    ["arrow", "(24, 24)"],
    ["arrow", "(40, 24)"],
    ["star", "(40, 24)"],
    ["ellipse", "(300, 10)"],
    ["hexagon", "(300, 10)"],
    ["pill", "(300, 10)"],
    ["cloud", "(300, 10)"],
    ["triangle", "(300, 10)"],
  ])("does not report a %s of %s with no text", (shape, size) => {
    expect(sized("", shape, size).codes).toEqual([]);
    // With a label, the same shape is too small.
    expect(sized("A", shape, size).codes).toEqual(["layout.text-overflow"]);
  });

  it("suggests a taller shape when no width holds the text at its height", () => {
    const overflow = overflowOf(sized("A", "ellipse", "(600, 14)"))!;
    const fit = overflow.data!.size as { width: number; height: number };
    expect(fit.width).toBe(600);
    expect(fit.height).toBeGreaterThan(14);
    expect(overflow.message).toBe(`\`a\` is 14 px tall but its text "A" needs ${fit.height} px.`);
    expect(overflow.hints).toEqual([`Use \`size a (600, ${fit.height})\`, or shorten the text.`]);
    // A box both too narrow and too flat names both measures.
    const both = overflowOf(sized("Payments reconciliation", "diamond", "(40, 14)"))!;
    const grown = both.data!.size as { width: number; height: number };
    expect(grown.width).toBeGreaterThan(40);
    expect(grown.height).toBeGreaterThan(14);
    expect(both.message).toBe(
      `\`a\` is 40 × 14 px but its text "Payments reconciliation" needs ${grown.width} × ${grown.height} px.`,
    );
    // While some width holds the text at the written height, the height is kept.
    const wide = overflowOf(sized("Payments reconciliation", "diamond", "(40, 16)"))!;
    expect((wide.data!.size as { height: number }).height).toBe(16);
  });

  it("clears the warning at the size it suggests, for every shape", () => {
    for (const shape of SHAPED) {
      for (const size of [
        "(40, 72)",
        "(600, 14)",
        "(60, 30)",
        "(400, 24)",
        "(40, 14)",
        "(24, 8)",
      ]) {
        const label = "Payments reconciliation service";
        const overflow = overflowOf(sized(label, shape, size));
        if (!overflow) continue;
        const fit = overflow.data!.size as { width: number; height: number };
        expect(Number.isInteger(fit.width), `${shape} ${size}`).toBe(true);
        expect(overflow.hints![0]).toContain(`size a (${fit.width}, ${fit.height})`);
        const fitted = sized(label, shape, `(${fit.width}, ${fit.height})`);
        expect(fitted.codes, `${shape} ${size} → ${fit.width} × ${fit.height}`).toEqual([]);
      }
    }
  });

  it("does not report text that a shape reaches into by less than a pixel", () => {
    // The wave of the document reaches 0.12 px into the row of the descenders.
    expect(sized("Payments reconciliation service", "document", "(400, 24)").codes).toEqual([]);
  });

  it("rounds the widths of shapes up to whole pixels", () => {
    const label = "Payments reconciliation service for long labels";
    const result = run(
      `  box a "${label}"\n  box b "${label}"\n  style a { shape document }\n  style b { shape callout }\n  placement {\n    place a at (300, 200)\n    place b at (300, 400)\n  }`,
    );
    for (const id of ["a", "b"]) {
      const box = result.boxes!.get(id)!;
      expect(box.width, id).toBeGreaterThan(160);
      expect(Number.isInteger(box.width), `${id} ${box.width}`).toBe(true);
    }
    const overflow = overflowOf(sized("Payments", "document", "(40, 72)"))!;
    const fit = overflow.data!.size as { width: number; height: number };
    expect(Number.isInteger(fit.width), String(fit.width)).toBe(true);
    expect(overflow.message).toBe(
      `\`a\` is 40 px wide but its text "Payments" needs ${fit.width} px.`,
    );
  });
});

describe("route anchors on outlines", () => {
  const pinned = (shape: string, size: string, at: string, end: string) =>
    run(
      `  box a "A"\n  box d ""\n  a -> d as r\n  style d { shape ${shape} }\n  placement {\n    place a at (80, 60)\n    size a (40, 24)\n    place d at ${at}\n    size d ${size}\n    route r from a.south to ${end}\n  }`,
    );

  it("ends a pinned connector on a diamond's upper-left edge", () => {
    const result = pinned("diamond", "(160, 80)", "(280, 200)", "d.north 5%");
    expect(result.codes).toEqual([]);
    const points = result.connectors!.get("r")!.points;
    expect(points[points.length - 1]).toEqual({ x: 208, y: 196 });
    // The other end of the box stays where the rectangle ends it.
    expect(
      pinned("diamond", "(160, 80)", "(280, 200)", "d.east 95%")
        .connectors!.get("r")!
        .points.at(-1),
    ).toEqual({ x: 288, y: 236 });
  });

  it("ends a pinned connector on an ellipse", () => {
    const result = pinned("ellipse", "(160, 72)", "(280, 400)", "d.west 8%");
    const end = result.connectors!.get("r")!.points.at(-1)!;
    const box = result.boxes!.get("d")!;
    expect(distanceToOutline(shapeOutline("ellipse", box).points, end)).toBeLessThan(0.5);
    expect(end.x).toBeCloseTo(280 - 80 * Math.sqrt(1 - ((369.76 - 400) / 36) ** 2), 6);
    // The arrowhead's tip is the end.
    const head = of(element(result.scene, "r", "relation"), "path")[0] as PathItem;
    const [x, y] = /^M(\S+) (\S+)/.exec(head.d)!.slice(1).map(Number) as [number, number];
    expect(x).toBeCloseTo(end.x + result.offset!.x, 1);
    expect(y).toBeCloseTo(end.y + result.offset!.y, 1);
  });

  it("keeps the ends of rectangles and rounded boxes on the box", () => {
    const result = pinned("rounded", "(160, 80)", "(280, 200)", "d.north 5%");
    expect(result.connectors!.get("r")!.points.at(-1)).toEqual({ x: 208, y: 160 });
  });

  it("moves anchors chosen by the layout onto the outline", () => {
    // Facing sides meet at the centre of their overlap, off the diamond's top vertex.
    const result = run(
      '  layout manual\n  node a "A"\n  decision d "D?"\n  a -> d as r\n  placement {\n    place a at (60, 60)\n    place d at (100, 260)\n  }',
      {},
      "flow",
    );
    const points = result.connectors!.get("r")!.points;
    // The overlap of 20..140 and 20..180 is centred on x = 80: 20 px left of the top vertex.
    expect(points.at(-1)).toEqual({ x: 80, y: 230 });
  });

  it("moves parallel lanes onto the outline", () => {
    const result = run(
      '  layout manual\n  node a "A"\n  decision d "D?"\n  a -> d as r1\n  a -> d as r2\n  placement {\n    place a at (100, 60)\n    place d at (100, 260)\n  }',
      {},
      "flow",
    );
    const ends = ["r1", "r2"].map((r) => result.connectors!.get(r)!.points.at(-1)!);
    expect(ends).toEqual([
      { x: 92, y: 224 },
      { x: 108, y: 224 },
    ]);
  });

  it("ends lanes clamped to a cylinder's corners by the corners, not at its rims' middles", () => {
    // Four labelled lanes between a node and a lower store: the outer ones are clamped to the
    // store's corners.
    const result = run(
      '  layout manual\n  node a "A"\n  data d "D"\n  a -> d: "insert" as insert\n  a -> d: "update" as update\n  d -> a: "rows" as rows\n  d -> a: "events" as events\n  placement {\n    place a at (100, 100)\n    place d at (500, 100)\n  }',
      {},
      "flow",
    );
    expect(result.codes).toEqual([]);
    const box = result.boxes!.get("d")!;
    const outline = shapeOutline("cylinder", box).points;
    const insert = result.connectors!.get("insert")!.points.at(-1)!;
    const events = result.connectors!.get("events")!.points[0]!;
    for (const [end, cornerY] of [
      [insert, box.y],
      [events, box.y + box.height],
    ] as const) {
      expect(distanceToOutline(outline, end)).toBeLessThan(0.5);
      expect(end.x - box.x).toBeLessThan(4);
      expect(Math.abs(end.y - cornerY)).toBeLessThan(8);
    }
  });

  it("moves the ends of the engine's routes onto the outline", () => {
    const engine: LayoutEngine = {
      name: "fixed",
      arrange: () => ({
        centers: new Map([
          ["a", { x: 100, y: 100 }],
          ["d", { x: 100, y: 300 }],
        ]),
        routes: new Map([
          [
            "r",
            [
              { x: 100, y: 128 },
              { x: 100, y: 200 },
              { x: 60, y: 200 },
              { x: 60, y: 260 },
            ],
          ],
        ]),
      }),
    };
    const result = run(
      '  layout auto\n  node a "A"\n  decision d "D?"\n  a -> d as r',
      { engine },
      "flow",
    );
    expect(result.connectors!.get("r")!.points).toEqual([
      { x: 100, y: 128 },
      { x: 100, y: 200 },
      { x: 60, y: 200 },
      { x: 60, y: 280 },
    ]);
  });

  it("keeps orthogonal ends square to their side", () => {
    const result = run(
      '  box a "A"\n  box d ""\n  a -> d as r\n  style d { shape diamond }\n  style r { routing orthogonal }\n  placement {\n    place a at (80, 60)\n    size a (40, 24)\n    place d at (280, 200)\n    size d (160, 80)\n    route r from a.east to d.north 5%\n  }',
    );
    const points = result.connectors!.get("r")!.points;
    const [before, last] = points.slice(-2) as [Point, Point];
    expect(last).toEqual({ x: 208, y: 196 });
    expect(before.x).toBe(208);
  });
});

describe("composition checks on outlines", () => {
  const corner = (shape: string) =>
    run(
      `  box a "A"\n  box b "B"\n  box d ""\n  a -> b as r\n  style r { routing polyline }\n  style d { shape ${shape} }\n  placement {\n    place a at (180, 190)\n    size a (40, 20)\n    place b at (290, 130)\n    size b (60, 20)\n    place d at (300, 200)\n    size d (160, 80)\n    route r from a.east to b.west\n  }`,
    );

  it("does not report a connector through a diamond's empty corner", () => {
    expect(corner("diamond").codes).toEqual([]);
    // Through the same corner of a rectangle, it is a crossing.
    const crossed = corner("rectangle");
    expect(crossed.diagnostics.map((d) => [d.code, d.data?.ids])).toEqual([
      ["layout.connector-crossing", ["r", "d"]],
    ]);
  });

  it("still reports a connector through a diamond", () => {
    const result = run(
      '  box a "A"\n  box b "B"\n  box d ""\n  a -> b as r\n  style r { routing polyline }\n  style d { shape diamond }\n  placement {\n    place a at (60, 200)\n    place b at (540, 200)\n    place d at (300, 200)\n    size d (160, 80)\n  }',
    );
    expect(result.diagnostics.map((d) => [d.code, d.data?.ids])).toEqual([
      ["layout.connector-crossing", ["r", "d"]],
    ]);
  });
});

describe("label audit in the inscribed area", () => {
  it("reports a description line that crosses a diamond, by how far it goes beyond", () => {
    // 101.6 px wide with the estimates.
    const line = "ABCDEFGHJabcde.";
    const result = run(
      `  box d "Decide" {\n    description "short\\n${line}"\n  }\n  style d { shape diamond }\n  placement {\n    place d at (280, 200)\n    size d (160, 80)\n  }`,
    );
    // The explicit size is too small: the overflow check names the box, so the audit's finding is
    // not repeated as a warning.
    expect(result.codes).toEqual(["layout.text-overflow"]);
    const g = element(result.scene, "d");
    const text = of(g, "text").find((t) => t.text === line)!;
    const center = { x: g.bounds!.x + 80, y: g.bounds!.y + 40 };
    expect(text.baseline - center.y).toBeCloseTo(21.85, 2);
    const width = estimateMeasurer.width(line, "Inter", 400, 11);
    expect(width).toBeCloseTo(101.64, 2);
    // The text column reaches 24.6 px below the centre, read 0.75 px inside its end: 23.85 px,
    // where the diamond is 64.6 px wide.
    expect(g.bounds!.inner).toMatchObject({ width: 64.6 });
    const cuts = auditLabels(result.scene, estimateMeasurer).filter((p) => p.kind === "cut");
    expect(cuts.map((p) => [p.text.owner, p.text.text])).toContainEqual(["d", line]);
    const cut = cuts.find((p) => p.text.text === line)!;
    expect(cut.kind === "cut" && cut.by).toBe("shape");
    expect(cut.kind === "cut" && cut.overflow).toBeCloseTo(width / 2 - 32.3, 1);
  });

  it.each([
    ["document", "(400, 24)"],
    ["document", "(400, 21)"],
    ["diamond", "(400, 24)"],
  ])("does not report left-aligned text inside a flat %s of %s", (shape, size) => {
    const result = run(
      `  box a "Left"\n  style a { shape ${shape}; textAlign left }\n  placement {\n    place a at (300, 200)\n    size a ${size}\n  }`,
    );
    const g = element(result.scene, "a");
    const label = of(g, "text")[0]!;
    // Every corner of the text lies inside the outline, far from the document's wave crest.
    for (const corner of corners(glyphs(label))) {
      expect(pointInShape(shape as BoxShape, drawn(g), corner), JSON.stringify(corner)).toBe(true);
    }
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
    expect(result.codes).toEqual([]);
  });

  it("holds the texts of boxes to their box", () => {
    const result = run(
      '  box a "A label far too long for the box"\n  box b ""\n  box c ""\n  placement {\n    place a at (200, 100)\n    size a (60, 56)\n    place b at (-100, 100)\n    place c at (500, 100)\n  }',
    );
    expect(element(result.scene, "a").bounds!.inner).toBeUndefined();
    expect(
      auditLabels(result.scene, estimateMeasurer).map((p) => p.kind === "cut" && p.by),
    ).toEqual(["shape"]);
  });
});

describe("corner radius", () => {
  const flow = (body: string, extra = "") => run(`  layout manual\n${body}`, {}, "flow", extra);
  const radius = (s: Scene, id: string) => of(element(s, id), "rect")[0]!.radius;

  it("rounds a node and a group by their own radius, over the theme's", () => {
    const result = flow(
      '  group backend "Backend" { node api "API" }\n  group other "Other" { node web "Web" }\n  style api { radius 2 }\n  style backend { radius 0 }\n  placement {\n    place api at (100, 100)\n    place web at (400, 100)\n  }',
    );
    expect(radius(result.scene, "api")).toBe(2);
    expect(radius(result.scene, "web")).toBe(8);
    expect(radius(result.scene, "backend")).toBe(0);
    expect(radius(result.scene, "other")).toBe(14);
    // Halos and review marks follow the drawn radius.
    expect(element(result.scene, "api").bounds!.radius).toBe(2);
    expect(element(result.scene, "backend").bounds!.radius).toBe(0);
  });

  it("draws a square node", () => {
    const result = flow(
      '  node proxy "P"\n  node api "API"\n  style proxy { radius 0 }\n  placement {\n    place proxy at (100, 100)\n    place api at (400, 100)\n  }',
    );
    expect(radius(result.scene, "proxy")).toBe(0);
    expect(radius(result.scene, "api")).toBe(8);
  });

  it("clamps the radius to half the shorter side", () => {
    const result = flow(
      '  node a "A"\n  style a { radius 64 }\n  placement {\n    place a at (100, 100)\n  }',
    );
    expect(radius(result.scene, "a")).toBe(28);
  });

  it("squares every group by a rule", () => {
    const result = flow(
      '  rule group { radius 0 }\n  group g1 "One" { node a "A" }\n  group g2 "Two" { node b "B" }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }',
    );
    expect(radius(result.scene, "g1")).toBe(0);
    expect(radius(result.scene, "g2")).toBe(0);
  });

  it("puts an element's radius over the theme token", () => {
    const result = run(
      '  layout manual\n  node api "API"\n  node web "Web"\n  style api { radius 12 }\n  placement {\n    place api at (100, 100)\n    place web at (400, 100)\n  }',
      {},
      "flow",
      'theme square {\n  extends "plain"\n  radius 0\n}\n\n',
      "square",
    );
    expect(radius(result.scene, "api")).toBe(12);
    expect(radius(result.scene, "web")).toBe(0);
  });

  it("rounds rounded boxes, rectangles, squares, notes and framed free objects, but not pills", () => {
    const result = run(
      '  box a "A"\n  box b "B"\n  box c "C"\n  box p "P"\n  text t "T"\n  style a { radius 4 }\n  style b { shape rectangle; radius 4 }\n  style c { shape square; radius 4 }\n  style p { shape pill; radius 4 }\n  style t { fill "#eee"; radius 3 }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n    place c at (700, 100)\n    place p at (100, 300)\n    place t at (400, 300)\n  }',
    );
    expect(radius(result.scene, "a")).toBe(4);
    expect(radius(result.scene, "b")).toBe(4);
    expect(radius(result.scene, "c")).toBe(4);
    expect(radius(result.scene, "p")).toBe(28);
    expect(radius(result.scene, "t")).toBe(3);
    const note = flow(
      '  note n "Note"\n  style n { fill "#fff"; radius 5 }\n  placement {\n    place n at (100, 100)\n  }',
    );
    expect(radius(note.scene, "n")).toBe(5);
  });

  it("draws a pill or a tag taller than wide as the stadium of its outline", () => {
    const result = run(
      '  box p "P"\n  style p { shape pill }\n  placement {\n    place p at (200, 200)\n    size p (40, 200)\n  }',
    );
    const pill = element(result.scene, "p");
    // Half the shorter side: the rounded ends of `shapeOutline`, not an ellipse.
    expect(radius(result.scene, "p")).toBe(20);
    expect(shapeOutline("pill", drawn(pill)).d).toContain("A20 20 0 0 1");
    const tag = flow(
      '  tag t "T"\n  placement {\n    place t at (100, 100)\n    size t (24, 60)\n  }',
    );
    expect(radius(tag.scene, "t")).toBe(12);
    // Wider than tall, they keep half the height.
    expect(
      radius(flow('  tag t "JWT"\n  placement {\n    place t at (100, 100)\n  }').scene, "t"),
    ).toBe(9);
  });

  it("keeps square corners on rectangles and sharp vertices on polygons without a radius", () => {
    const result = run(
      '  box a "A"\n  box b "B"\n  style a { shape hexagon }\n  style b { shape rectangle }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }',
    );
    expect(of(element(result.scene, "a"), "path")[0]!.d).toMatch(/^M\S+ \S+( L\S+ \S+){5} Z$/);
    expect(radius(result.scene, "b")).toBe(0);
  });

  it("rounds the vertices of polygons by their radius", () => {
    const result = run(
      '  box a "A"\n  style a { shape hexagon; radius 10 }\n  placement {\n    place a at (100, 100)\n  }',
    );
    const g = element(result.scene, "a");
    expect(of(g, "rect")).toEqual([]);
    const d = of(g, "path")[0]!.d;
    // Six corners: a straight edge to each cut, then a curve through the vertex.
    expect(d).toMatch(/^M\S+ \S+ Q\S+ \S+ \S+ \S+( L\S+ \S+ Q\S+ \S+ \S+ \S+){5} Z$/);
    // The first corner is the top-left vertex: its curve starts 10 px from it along the left edge.
    const box = drawn(g);
    const outline = shapeOutline("hexagon", box, { radius: 10 });
    expect(outline.d).toBe(d);
    const sharp = shapeOutline("hexagon", box);
    const vertex = sharp.points[0]!;
    const [, x, y] = /^M(\S+) (\S+)/.exec(d)!;
    expect(Math.hypot(Number(x) - vertex.x, Number(y) - vertex.y)).toBeCloseTo(10, 1);
  });

  it("rounds a decision and leaves a circle as it is", () => {
    const result = run(
      '  layout manual\n  decision choose "Pay?"\n  node c "C"\n  node plain "P"\n  style choose { radius 8 }\n  style c { shape circle; radius 12 }\n  style plain { shape circle }\n  placement {\n    place choose at (100, 100)\n    place c at (400, 100)\n    place plain at (700, 100)\n  }',
      {},
      "flow",
    );
    expect(result.codes).toEqual([]);
    const diamond = of(element(result.scene, "choose"), "path")[0]!.d;
    expect(diamond).toMatch(/^M\S+ \S+ Q\S+ \S+ \S+ \S+( L\S+ \S+ Q\S+ \S+ \S+ \S+){3} Z$/);
    const circle = (id: string) => {
      const g = element(result.scene, id);
      const box = drawn(g);
      // The same path as an unrounded circle of the same box.
      return of(g, "path")[0]!.d === shapeOutline("circle", box).d;
    };
    expect(circle("c")).toBe(true);
    expect(circle("plain")).toBe(true);
  });

  it("puts magnets, hit tests and connector ends on a rounded polygon's curves", () => {
    const box = { x: 0, y: 0, width: 160, height: 80 };
    const round = { radius: 16 };
    // The diamond's left vertex is cut: the corner of the sharp diamond lies outside the rounded one.
    expect(pointInShape("diamond", box, { x: 1, y: 40 })).toBe(true);
    expect(pointInShape("diamond", box, { x: 1, y: 40 }, round)).toBe(false);
    // A connector coming from the left meets the rounded corner, inside the sharp vertex.
    const end = onOutline("diamond", box, { x: 0, y: 40 }, "west", round);
    expect(end.x).toBeGreaterThan(1);
    expect(end.y).toBeCloseTo(40, 5);
    // The magnet that sat on the vertex sits on the middle of its curve.
    const magnets = shapeMagnets("diamond", box, round).map((m) => m.point);
    expect(magnets.some((p) => Math.abs(p.y - 40) < 0.01 && Math.abs(p.x - end.x) < 0.5)).toBe(
      true,
    );
    expect(magnets.some((p) => p.x === 0 && p.y === 40)).toBe(false);
  });

  it("ends a connector on a rounded diamond's curve", () => {
    const result = run(
      '  layout manual\n  node a "A"\n  node d "D"\n  style d { shape diamond; radius 16 }\n  a -> d as go\n  placement {\n    place a at (100, 100)\n    place d at (400, 100)\n  }',
      {},
      "flow",
    );
    const g = element(result.scene, "d");
    const box = drawn(g);
    const line = of(element(result.scene, "go", "relation"), "polyline")[0]!;
    const tip = line.points[line.points.length - 1]!;
    // The line stops at the base of the head, 8 px before the outline; the outline is past the
    // sharp vertex at the box's left edge.
    expect(tip.x + 8).toBeGreaterThan(box.x + 1);
  });
});
