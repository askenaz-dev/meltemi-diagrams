import { scalePenPoints, type Point } from "@meltemi/diagrams-editor/canvas";
import { describe, expect, it } from "vitest";
import {
  penPathOf,
  penResize,
  pointToSegment,
  segmentToSegment,
  simplifyStroke,
  strokeSamples,
  sweepDistance,
  sweepTouches,
  tenthPoints,
} from "../src/pen.js";
import { readPenChoice, toolColour, toolOpacity, toolWidth } from "../src/pen-menu.js";

/**
 * The layout's own `penPath`, which the canvas page does not load: imported by a name the
 * compiler does not follow (the canvas package does not depend on the layout), and resolved by
 * the test runner as every workspace package is.
 */
const LAYOUT = "@meltemi/diagrams-layout";
const layout = (await import(/* @vite-ignore */ LAYOUT)) as {
  penPath(points: readonly Point[]): string;
};

/** A wavy stroke of `count` points with decimals, as a hand draws one. */
const wave = (count: number): Point[] =>
  Array.from({ length: count }, (_, i) => ({
    x: 12.345 + i * 7.25,
    y: 40 + Math.sin(i / 2) * 18.123,
  }));

describe("the stroke in progress", () => {
  it("is drawn with the path the layout draws a pen with", () => {
    const samples: Point[][] = [
      [{ x: 10, y: 20 }],
      [
        { x: 10, y: 20 },
        { x: 40.55, y: 20.125 },
      ],
      [
        { x: 300, y: 200 },
        { x: 340, y: 190 },
        { x: 380, y: 210 },
        { x: 420, y: 200 },
      ],
      [
        { x: -5.5, y: 0 },
        { x: 0, y: -7.25 },
        { x: 5.5, y: 0 },
      ],
      wave(40),
    ];
    for (const points of samples) expect(penPathOf(points)).toBe(layout.penPath(points));
  });

  it("is empty without points and a dot with one", () => {
    expect(penPathOf([])).toBe("");
    expect(penPathOf([{ x: 3, y: 4 }])).toBe("M 3 4 L 3 4");
  });
});

describe("the release of a stroke", () => {
  it("keeps the ends and drops the points within the tolerance", () => {
    // A nearly straight run with one real corner.
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0.2 },
      { x: 20, y: -0.3 },
      { x: 30, y: 0 },
      { x: 30.2, y: 10 },
      { x: 30, y: 20 },
    ];
    expect(simplifyStroke(points, 0.75)).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
    ]);
    // A finer tolerance keeps the wobble.
    expect(simplifyStroke(points, 0.1).length).toBeGreaterThan(3);
  });

  it("scales the tolerance with the zoom: zoomed in keeps more of the same hand", () => {
    const hand = wave(200).map((p) => ({ x: p.x / 10, y: p.y / 10 }));
    const at100 = simplifyStroke(hand, 0.75);
    const at400 = simplifyStroke(hand, 0.75 / 4);
    expect(at400.length).toBeGreaterThan(at100.length);
    expect(at100[0]).toEqual(hand[0]);
    expect(at100[at100.length - 1]).toEqual(hand[hand.length - 1]);
  });

  it("leaves one or two points alone, and a long stroke without recursion", () => {
    expect(simplifyStroke([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }]);
    expect(simplifyStroke([], 1)).toEqual([]);
    // A tremble of half a unit along a long straight run: its two ends.
    const long = Array.from({ length: 50_000 }, (_, i) => ({ x: i, y: (i % 2) / 2 }));
    expect(simplifyStroke(long, 0.75)).toHaveLength(2);
    // Five thousand points of a hand, all kept, still quickly.
    const started = performance.now();
    expect(simplifyStroke(wave(5000), 0.01).length).toBeGreaterThan(1000);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("rounds to a tenth and drops repeated points", () => {
    expect(
      tenthPoints([
        { x: 184.06, y: 63.94 },
        { x: 184.0400001, y: 63.96 },
        { x: -0.04, y: 2.25 },
      ]),
    ).toEqual([
      { x: 184.1, y: 63.9 },
      { x: 184, y: 64 },
      { x: 0, y: 2.3 },
    ]);
    // A press that did not move is a dot.
    expect(
      tenthPoints([
        { x: 5.01, y: 5 },
        { x: 5.02, y: 5.01 },
      ]),
    ).toEqual([{ x: 5, y: 5 }]);
  });
});

describe("the eraser", () => {
  it("measures points and segments", () => {
    expect(pointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(pointToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(pointToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
    // Crossing segments touch; parallel ones are apart.
    expect(segmentToSegment({ x: 0, y: -5 }, { x: 0, y: 5 }, { x: -5, y: 0 }, { x: 5, y: 0 })).toBe(
      0,
    );
    expect(segmentToSegment({ x: 0, y: 2 }, { x: 10, y: 2 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(
      2,
    );
  });

  it("samples the midpoint chain from the first point to the last", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ];
    const samples = strokeSamples(points);
    expect(samples[0]).toEqual({ x: 0, y: 0 });
    expect(samples[samples.length - 1]).toEqual({ x: 20, y: 0 });
    // The curve stays inside the hull of its points: it never reaches its control's height.
    expect(Math.max(...samples.map((p) => p.y))).toBeLessThan(10);
    expect(strokeSamples([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });

  it("hits a stroke its sweep crosses between two moves, and misses one beyond its reach", () => {
    const stroke = strokeSamples([
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]);
    // A fast move from above to below the stroke crosses it.
    expect(sweepDistance({ x: 50, y: 0 }, { x: 50, y: 100 }, stroke)).toBe(0);
    expect(sweepDistance({ x: 50, y: 40 }, { x: 50, y: 40 }, stroke)).toBe(10);
    expect(
      sweepTouches({ x: 50, y: 40 }, { x: 50, y: 40 }, 8, { x: 0, y: 49, width: 100, height: 2 }),
    ).toBe(false);
    expect(
      sweepTouches({ x: 50, y: 42 }, { x: 50, y: 42 }, 8, { x: 0, y: 49, width: 100, height: 2 }),
    ).toBe(true);
    // A dot is hit near its one point.
    expect(sweepDistance({ x: 3, y: 4 }, { x: 3, y: 4 }, [{ x: 0, y: 0 }])).toBe(5);
  });
});

describe("a selected stroke scaled by its handles", () => {
  // A stroke 3 wide whose points span (100, 50) to (200, 100): bounds grown by 1.5.
  const bounds = { x: 98.5, y: 48.5, width: 103, height: 53 };

  it("moves the edges of the handle and keeps the opposite corner, off the grid", () => {
    expect(penResize(bounds, 3, "se", { x: 100.25, y: 50 }, false)).toEqual({
      x: 98.5,
      y: 48.5,
      width: 203.25,
      height: 103,
    });
    // The north-west handle keeps the south-east corner.
    const nw = penResize(bounds, 3, "nw", { x: 50, y: 20 }, false);
    expect(nw.x + nw.width).toBe(bounds.x + bounds.width);
    expect(nw.y + nw.height).toBe(bounds.y + bounds.height);
    expect(nw).toMatchObject({ x: 148.5, y: 68.5 });
    // A side handle moves one edge alone.
    expect(penResize(bounds, 3, "e", { x: -50, y: 40 }, false)).toEqual({
      ...bounds,
      width: 53,
    });
  });

  it("keeps at least 4 units of points, and never folds the stroke over", () => {
    const folded = penResize(bounds, 3, "se", { x: -500, y: -500 }, false);
    expect(folded).toEqual({ x: 98.5, y: 48.5, width: 7, height: 7 });
    const west = penResize(bounds, 3, "w", { x: 500, y: 0 }, false);
    expect(west.width).toBe(7);
    expect(west.x + west.width).toBe(bounds.x + bounds.width);
  });

  it("keeps the proportions with Shift", () => {
    // A corner takes the factor of the axis that changed most.
    const corner = penResize(bounds, 3, "se", { x: 100, y: 10 }, true);
    expect(corner).toEqual({ x: 98.5, y: 48.5, width: 203, height: 103 });
    // A side scales the other axis about its middle.
    const side = penResize(bounds, 3, "e", { x: 100, y: 0 }, true);
    expect(side.width).toBe(203);
    expect(side.height).toBe(103);
    expect(side.y + side.height / 2).toBe(bounds.y + bounds.height / 2);
  });

  it("leaves an axis the stroke does not span, and a dot, as they are", () => {
    // A level stroke 8 wide: its height is its width.
    const level = { x: 6, y: 46, width: 108, height: 8 };
    expect(penResize(level, 8, "se", { x: 50, y: 50 }, false)).toEqual({
      ...level,
      width: 158,
    });
    expect(penResize(level, 8, "s", { x: 0, y: 50 }, true)).toEqual(level);
    const dot = { x: 8.5, y: 8.5, width: 3, height: 3 };
    expect(penResize(dot, 3, "se", { x: 40, y: 40 }, true)).toEqual(dot);
  });

  it("gives the box the session scales the points to", () => {
    const points = [
      { x: 100, y: 50 },
      { x: 150, y: 100 },
      { x: 200, y: 75 },
    ];
    const box = penResize(bounds, 3, "se", { x: 100, y: 50 }, false);
    // The points' box twice as large, about its north-west corner.
    expect(scalePenPoints(points, bounds, box, 3)).toEqual([
      { x: 100, y: 50 },
      { x: 200, y: 150 },
      { x: 300, y: 100 },
    ]);
  });
});

describe("the pen menu's choices kept with the canvas's state", () => {
  it("default to the pen, 3 wide, in ink, and the highlighter in highlight", () => {
    const defaults = {
      tool: "pen",
      width: 3,
      colour: "@ink",
      highlightColour: "@highlight",
    };
    expect(readPenChoice(undefined)).toEqual(defaults);
    expect(readPenChoice(null)).toEqual(defaults);
    expect(readPenChoice("pen")).toEqual(defaults);
  });

  it("keep what is well formed and replace what is not", () => {
    expect(
      readPenChoice({
        tool: "highlighter",
        width: 8,
        colour: "@danger",
        highlightColour: "#E03131",
      }),
    ).toEqual({ tool: "highlighter", width: 8, colour: "@danger", highlightColour: "#E03131" });
    // A width the menu does not offer, a colour that is no colour, a tool that is not one.
    expect(
      readPenChoice({ tool: "brush", width: 900, colour: "red; }", highlightColour: 12 }),
    ).toEqual({ tool: "pen", width: 3, colour: "@ink", highlightColour: "@highlight" });
    expect(readPenChoice({ width: 2.5, colour: "#12345" })).toMatchObject({
      width: 3,
      colour: "@ink",
    });
  });

  it("draw the pen in its colour and width, the highlighter at 20 and 35 %", () => {
    const pen = readPenChoice({ tool: "pen", width: 4, colour: "@accent" });
    expect([toolColour(pen), toolWidth(pen), toolOpacity(pen)]).toEqual(["@accent", 4, 1]);
    const highlighter = { ...pen, tool: "highlighter" as const };
    expect([toolColour(highlighter), toolWidth(highlighter), toolOpacity(highlighter)]).toEqual([
      "@highlight",
      20,
      0.35,
    ]);
  });
});
