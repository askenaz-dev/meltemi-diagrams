import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import {
  ARROW_LENGTH,
  endMarker,
  layoutDiagram,
  relationEnds,
  roundCorners,
  type ArrowheadKind,
  type GroupItem,
  type MarkerPart,
  type PathItem,
  type PolylineItem,
  type Scene,
} from "../src/index.js";

const L = ARROW_LENGTH;
const pointsOf = (part: MarkerPart | undefined) => {
  if (!part || part.kind === "circle") throw new Error("not a line or polygon");
  return part.points;
};
const W = (L * 7) / 8;
const line = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

function scene(text: string): Scene {
  const compilation = compile(text);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return layoutDiagram(compilation, compilation.document.diagrams[0]!, {}).scene!;
}

function relation(s: Scene, id: string): GroupItem {
  const find = (items: readonly Scene["items"][number][]): GroupItem | undefined => {
    for (const item of items) {
      if (item.kind !== "group") continue;
      if (item.role === "relation" && item.id === id) return item;
      const inner = find(item.items);
      if (inner) return inner;
    }
    return undefined;
  };
  return find(s.items)!;
}

const flow = (body: string) =>
  `theme plain { extends "technical.light"; frame none }\ndiagram d: flow {\n  layout manual\n  theme "plain"\n  a["A"]\n  b["B"]\n${body}\n  placement { place a at (100, 100); place b at (400, 100) }\n}\n`;

describe("end markers", () => {
  const trimmedBy = (kind: ArrowheadKind) => 100 - endMarker(line, kind, L, W).line.at(-1)!.x;

  it("stops the line at the back of shapes and reaches the tip under lines", () => {
    expect(trimmedBy("none")).toBe(0);
    expect(trimmedBy("triangle")).toBeCloseTo(L);
    expect(trimmedBy("triangleOutline")).toBeCloseTo(L);
    expect(trimmedBy("open")).toBe(0);
    expect(trimmedBy("diamond")).toBeCloseTo(1.5 * L);
    expect(trimmedBy("diamondOutline")).toBeCloseTo(1.5 * L);
    expect(trimmedBy("circle")).toBeCloseTo(0.9 * L);
    expect(trimmedBy("circleOutline")).toBeCloseTo(0.9 * L);
    for (const kind of ["bar", "cross", "many", "oneOrMany", "onlyOne"] as const) {
      expect(trimmedBy(kind), kind).toBe(0);
    }
    expect(trimmedBy("zeroOrOne")).toBeCloseTo(1.9 * L);
    expect(trimmedBy("zeroOrMany")).toBeCloseTo(1.9 * L);
  });

  it("fills solid shapes and outlines hollow ones", () => {
    const filled = endMarker(line, "diamond", L, W).parts[0]!;
    const hollow = endMarker(line, "diamondOutline", L, W).parts[0]!;
    expect(filled).toMatchObject({ kind: "polygon", filled: true });
    expect(hollow).toMatchObject({ kind: "polygon", filled: false });
    expect(endMarker(line, "circleOutline", L, W).parts[0]).toMatchObject({
      kind: "circle",
      r: 0.45 * L,
      filled: false,
    });
  });

  it("draws a crow's foot from L before the tip to the tip", () => {
    const [foot] = endMarker(line, "many", L, W).parts;
    expect(foot).toMatchObject({ kind: "polyline" });
    const points = pointsOf(foot);
    expect(points[1]).toEqual({ x: 100 - L, y: 0 });
    expect(points[0]!.x).toBe(100);
    expect(points[2]!.x).toBe(100);
    expect(Math.abs(points[0]!.y - points[2]!.y)).toBeCloseTo(1.2 * W);
  });

  it("puts the start head on the reversed line", () => {
    const ends = relationEnds(line, "triangle", "triangle", L, W);
    expect(ends.line[0]!.x).toBeCloseTo(L);
    expect(ends.line.at(-1)!.x).toBeCloseTo(100 - L);
    const startTip = pointsOf(ends.start[0])[0]!;
    expect(startTip.x).toBe(0);
  });
});

describe("rounded corners", () => {
  it("replaces a bend by a curve 10 px from it", () => {
    const rounded = roundCorners(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 200 },
      ],
      10,
    );
    expect(rounded).toContainEqual({ x: 90, y: 50 });
    expect(rounded).toContainEqual({ x: 100, y: 60 });
    expect(rounded).not.toContainEqual({ x: 100, y: 50 });
  });

  it("takes half the shorter segment when it is shorter than the radius", () => {
    const rounded = roundCorners(
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 100 },
      ],
      10,
    );
    expect(rounded).toContainEqual({ x: 4, y: 0 });
  });

  it("leaves straight joints alone", () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(roundCorners(straight, 10)).toEqual(straight);
  });
});

describe("relation ends in the scene", () => {
  it("draws a two-way arrow with a head at both ends, after the line and before the label", () => {
    const s = scene(flow('  a <-> b: "sync" as sync'));
    const group = relation(s, "sync");
    const kinds = group.items.map((i) => (i.kind === "group" ? i.role : i.kind));
    expect(kinds).toEqual(["polyline", "path", "path", "label"]);
    const lineItem = group.items[0] as PolylineItem;
    const first = lineItem.points[0]!;
    const last = lineItem.points.at(-1)!;
    // Both ends pulled back to the base of their triangles.
    expect(Math.abs(last.x - first.x)).toBeLessThan(300 - 2 * L + 1);
    expect((group.items[1] as PathItem).fill).toBe(lineItem.stroke);
  });

  it("takes the start head from arrowtail, and none without it", () => {
    const one = relation(scene(flow("  a -> b as r")), "r");
    expect(one.items.filter((i) => i.kind === "path")).toHaveLength(1);
    const tail = relation(scene(flow("  a -> b as r\n  style r { arrowtail diamond }")), "r");
    expect(tail.items.filter((i) => i.kind === "path")).toHaveLength(2);
    const off = relation(scene(flow("  a <-> b as r\n  style r { arrowtail none }")), "r");
    expect(off.items.filter((i) => i.kind === "path")).toHaveLength(1);
  });

  it("draws dotted lines with round dots", () => {
    const s = scene(flow("  a -> b as r\n  style r { line dotted }"));
    const lineItem = relation(s, "r").items[0] as PolylineItem;
    expect(lineItem.dashed).toBe("dotted");
  });

  it("rounds an elbow when the style or the theme asks", () => {
    const body = (extra: string) =>
      flow(`  a -> b as r\n  style r { routing orthogonal${extra} }`).replace(
        "place b at (400, 100)",
        "place b at (400, 300)",
      );
    const sharp = relation(scene(body("")), "r").items[0] as PolylineItem;
    const rounded = relation(scene(body("; corners rounded")), "r").items[0] as PolylineItem;
    expect(rounded.points.length).toBeGreaterThan(sharp.points.length);
    const bends = sharp.points.slice(1, -1);
    for (const bend of bends) expect(rounded.points).not.toContainEqual(bend);
  });

  it("trims a curve at both ends", () => {
    const s = scene(flow("  a <-> b as r\n  style r { routing bezier }"));
    const group = relation(s, "r");
    expect(group.items[0]).toMatchObject({ kind: "path", fill: "none" });
    expect(group.items.filter((i) => i.kind === "path")).toHaveLength(3);
  });
});

describe("sequence messages", () => {
  it("draws two-way messages and any head", () => {
    const s = scene(
      'diagram s: sequence {\n  participant a "A"\n  participant b "B"\n  a <-> b: "Sync" as sync\n  a -> b: "Own" as own\n  style own { arrowhead diamond; arrowtail circle }\n}\n',
    );
    const sync = relation(s, "sync");
    expect(sync.items.filter((i) => i.kind === "path")).toHaveLength(2);
    const own = relation(s, "own");
    expect(own.items.filter((i) => i.kind === "path")).toHaveLength(2);
  });
});
