import { describe, expect, it } from "vitest";
import { selectInRect, strokeCrossesRect } from "../src/canvas/selection.js";

describe("directional rectangle selection", () => {
  const elbow = new Map([
    [
      "arrow",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    ],
  ]);

  it("keeps full containment as the default in either drag direction", () => {
    expect(selectInRect(new Map(), { x: -1, y: -1, width: 102, height: 102 }, elbow)).toEqual([
      "arrow",
    ]);
    expect(selectInRect(new Map(), { x: 101, y: 101, width: -102, height: -102 }, elbow)).toEqual([
      "arrow",
    ]);
    expect(selectInRect(new Map(), { x: 90, y: 40, width: 20, height: 20 }, elbow)).toEqual([]);
  });

  it("crosses a segment with both endpoints outside the rectangle", () => {
    expect(
      selectInRect(new Map(), { x: 110, y: 60, width: -20, height: -20 }, elbow, { mode: "cross" }),
    ).toEqual(["arrow"]);
    expect(
      strokeCrossesRect(
        [
          { x: -10, y: 5 },
          { x: 20, y: 5 },
        ],
        { x: 0, y: 0, width: 10, height: 10 },
      ),
    ).toBe(true);
  });

  it("does not confuse an elbow's empty bounding box with its stroke", () => {
    expect(
      selectInRect(new Map(), { x: 40, y: 40, width: 10, height: 10 }, elbow, { mode: "cross" }),
    ).toEqual([]);
  });

  it("crosses a sampled curve without selecting the empty centre of its bounds", () => {
    const curve = Array.from({ length: 41 }, (_, index) => {
      const angle = (Math.PI * index) / 40;
      return { x: 50 + 50 * Math.cos(angle), y: 50 - 50 * Math.sin(angle) };
    });
    const lines = new Map([["curve", curve]]);
    expect(
      selectInRect(new Map(), { x: 45, y: -2, width: 10, height: 8 }, lines, { mode: "cross" }),
    ).toEqual(["curve"]);
    expect(
      selectInRect(new Map(), { x: 45, y: 35, width: 10, height: 8 }, lines, { mode: "cross" }),
    ).toEqual([]);
  });

  it("uses visible pieces rather than bridging a protected title gap", () => {
    const full = new Map([
      [
        "arrow",
        [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      ],
    ]);
    const strokes = new Map([
      [
        "arrow",
        [
          [
            { x: 50, y: 0 },
            { x: 50, y: 40 },
          ],
          [
            { x: 50, y: 60 },
            { x: 50, y: 100 },
          ],
        ],
      ],
    ]);
    expect(
      selectInRect(new Map(), { x: 45, y: 45, width: 10, height: 10 }, full, {
        mode: "cross",
        strokes,
      }),
    ).toEqual([]);
    expect(
      selectInRect(new Map(), { x: 45, y: 30, width: 10, height: 10 }, full, {
        mode: "cross",
        strokes,
      }),
    ).toEqual(["arrow"]);
  });

  it("selects crossed nongroup shapes without selecting their enclosing group", () => {
    const boxes = new Map([
      ["account", { x: 0, y: 0, width: 1000, height: 1000 }],
      ["box", { x: 100, y: 100, width: 100, height: 100 }],
    ]);
    expect(
      selectInRect(boxes, { x: 90, y: 140, width: 20, height: 20 }, new Map(), {
        mode: "cross",
        groups: new Set(["account"]),
      }),
    ).toEqual(["box"]);
  });

  it("does not fall back to an invisible route when its visible pieces are empty", () => {
    expect(
      selectInRect(new Map(), { x: 90, y: 40, width: 20, height: 20 }, elbow, {
        mode: "cross",
        strokes: new Map([["arrow", []]]),
      }),
    ).toEqual([]);
  });

  it("rejects the empty corner of a diamond and accepts its actual edge", () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    const boxes = new Map([["diamond", box]]);
    const shapes = new Map([["diamond", { id: "diamond", shape: "diamond" as const, box }]]);
    expect(
      selectInRect(boxes, { x: 0, y: 0, width: 8, height: 8 }, new Map(), {
        mode: "cross",
        shapes,
      }),
    ).toEqual([]);
    expect(
      selectInRect(boxes, { x: 45, y: -5, width: 10, height: 10 }, new Map(), {
        mode: "cross",
        shapes,
      }),
    ).toEqual(["diamond"]);
  });

  it("handles a rectangle wholly inside a shape and a rotated silhouette", () => {
    const box = { x: 0, y: 0, width: 100, height: 20 };
    const shapes = new Map([
      ["box", { id: "box", shape: "rectangle" as const, rotation: 90, box }],
    ]);
    expect(
      selectInRect(
        new Map([["box", { x: 40, y: -40, width: 20, height: 100 }]]),
        { x: 45, y: -10, width: 5, height: 5 },
        new Map(),
        { mode: "cross", shapes },
      ),
    ).toEqual(["box"]);
    expect(
      selectInRect(new Map([["box", box]]), { x: 0, y: 0, width: 5, height: 5 }, new Map(), {
        mode: "cross",
        shapes,
      }),
    ).toEqual([]);
  });

  it("includes an icon's external label, and uses a free stroke rather than its bounds", () => {
    const boxes = new Map([
      ["icon", { x: 0, y: 0, width: 100, height: 130 }],
      ["pen", { x: 200, y: 0, width: 100, height: 100 }],
    ]);
    const shapes = new Map([
      [
        "icon",
        {
          id: "icon",
          shape: "rectangle" as const,
          box: { x: 20, y: 0, width: 60, height: 60 },
          labelBox: { x: 0, y: 100, width: 100, height: 30 },
        },
      ],
    ]);
    const strokes = new Map([
      [
        "pen",
        [
          [
            { x: 200, y: 0 },
            { x: 300, y: 0 },
            { x: 300, y: 100 },
          ],
        ],
      ],
    ]);
    expect(
      selectInRect(boxes, { x: 20, y: 110, width: 10, height: 10 }, new Map(), {
        mode: "cross",
        shapes,
        strokes,
      }),
    ).toEqual(["icon"]);
    expect(
      selectInRect(boxes, { x: 240, y: 40, width: 10, height: 10 }, new Map(), {
        mode: "cross",
        shapes,
        strokes,
      }),
    ).toEqual([]);
  });

  it("includes a touching endpoint or dot and ignores an empty stroke", () => {
    const area = { x: 0, y: 0, width: 10, height: 10 };
    expect(
      strokeCrossesRect(
        [
          { x: -10, y: 0 },
          { x: 0, y: 0 },
        ],
        area,
      ),
    ).toBe(true);
    expect(strokeCrossesRect([{ x: 5, y: 5 }], area)).toBe(true);
    expect(strokeCrossesRect([], area)).toBe(false);
  });
});
