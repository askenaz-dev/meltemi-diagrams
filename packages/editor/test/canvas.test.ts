import { describe, expect, it } from "vitest";
import { BOX_SHAPES } from "@meltemi/diagrams-model";
import {
  alignBoxes,
  attachEnd,
  belowInStack,
  borderDistance,
  carriedChildren,
  changesParent,
  commandFor,
  dropTarget,
  highlightPath,
  KEY_BINDINGS,
  magnets,
  onOutline,
  portPosition,
  SHAPES,
  stackAt,
  distributeBoxes,
  fitViewport,
  isCanvasMessage,
  keepOrigin,
  minimapToViewport,
  minimapViewport,
  nearestInDirection,
  nextInOrder,
  outlineOf,
  resizeBox,
  resolveMove,
  routeHandles,
  selectInRect,
  shapeOutline,
  toDiagram,
  toScreen,
  withBendInserted,
  withBendMoved,
  withBendRemoved,
  zoomAt,
  zoomStep,
  type Box,
  type HostMessage,
  type PresencePerson,
} from "../src/canvas/index.js";

const snap = { grid: 14, snap: true, guides: true, zoom: 1 };

describe("viewport", () => {
  it("zooms around the pointer", () => {
    const viewport = { x: 40, y: 20, zoom: 1 };
    const offset = { x: 20, y: 20 };
    const point = { x: 300, y: 200 };
    const screen = toScreen(viewport, offset, point);
    const zoomed = zoomAt(viewport, 2, screen);
    expect(zoomed.zoom).toBe(2);
    expect(toDiagram(zoomed, offset, screen)).toEqual(point);
    expect(zoomAt(viewport, 100, screen).zoom).toBe(8);
    expect(zoomAt(viewport, 0.01, screen).zoom).toBe(0.1);
  });

  it("steps through presets and fits", () => {
    expect(zoomStep({ x: 0, y: 0, zoom: 1 }, 1, { x: 0, y: 0 }).zoom).toBe(1.25);
    expect(zoomStep({ x: 0, y: 0, zoom: 1 }, -1, { x: 0, y: 0 }).zoom).toBe(0.75);
    const fit = fitViewport({ width: 2000, height: 1000 }, { width: 1048, height: 548 });
    expect(fit.zoom).toBe(0.5);
    expect(fitViewport({ width: 100, height: 50 }, { width: 1000, height: 800 }).zoom).toBe(1);
  });

  it("keeps boxes still when the offset changes", () => {
    const viewport = { x: 10, y: 10, zoom: 2 };
    const point = { x: 100, y: 100 };
    const before = toScreen(viewport, { x: 20, y: 20 }, point);
    const after = toScreen(
      keepOrigin(viewport, { x: 20, y: 20 }, { x: 60, y: 30 }),
      { x: 60, y: 30 },
      point,
    );
    expect(after).toEqual(before);
  });

  it("pans to a point of the minimap", () => {
    const content = { width: 1000, height: 700 };
    const screen = { width: 800, height: 600 };
    const viewport = { x: 0, y: 0, zoom: 1 };
    const map = minimapViewport(content, viewport, screen);
    expect(map.scale).toBeCloseTo(0.2);
    const centred = minimapToViewport(map, { x: 100, y: 70 }, viewport, screen);
    // The centre of the content is now in the middle of the screen.
    expect(centred.x + 500 * centred.zoom).toBeCloseTo(400);
    expect(centred.y + 350 * centred.zoom).toBeCloseTo(300);
  });
});

describe("snapping", () => {
  const box: Box = { x: 20, y: 72, width: 160, height: 56 };

  it("snaps the centre to the grid", () => {
    const { delta, guides } = resolveMove(box, [], { x: 30, y: 9 }, snap);
    expect({ x: 100 + delta.x, y: 100 + delta.y }).toEqual({ x: 126, y: 112 });
    expect(guides).toEqual([]);
  });

  it("prefers a guide to the grid", () => {
    const other: Box = { x: 400, y: 75, width: 160, height: 56 };
    const { delta, guides } = resolveMove(box, [other], { x: 0, y: 0 }, snap);
    expect(delta.y).toBe(3);
    expect(guides).toEqual([expect.objectContaining({ axis: "y", value: 75 })]);
  });

  it("moves freely with Alt", () => {
    expect(resolveMove(box, [], { x: 30.4, y: 9.6 }, { ...snap, free: true }).delta).toEqual({
      x: 30,
      y: 10,
    });
  });

  it("resizes from a handle with the opposite edges fixed", () => {
    expect(resizeBox(box, "e", { x: 30, y: 0 }, snap)).toEqual({
      x: 20,
      y: 72,
      width: 196,
      height: 56,
    });
    expect(resizeBox(box, "nw", { x: 10, y: 10 }, snap)).toEqual({
      x: 26,
      y: 86,
      width: 154,
      height: 42,
    });
    expect(resizeBox(box, "w", { x: 500, y: 0 }, snap).width).toBe(28);
  });
});

describe("selection and arrangement", () => {
  const boxes = new Map<string, Box>([
    ["a", { x: 20, y: 0, width: 160, height: 56 }],
    ["b", { x: 120, y: 200, width: 160, height: 56 }],
    ["c", { x: 420, y: 0, width: 160, height: 56 }],
  ]);

  it("selects boxes fully inside a rectangle", () => {
    expect(selectInRect(boxes, { x: 0, y: -10, width: 300, height: 100 })).toEqual(["a"]);
    expect(selectInRect(boxes, { x: 600, y: 300, width: -600, height: -320 })).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("selects the relations whose drawn line is fully inside the rectangle", () => {
    const lines = new Map([
      [
        "a_b",
        [
          { x: 100, y: 56 },
          { x: 100, y: 120 },
          { x: 200, y: 120 },
          { x: 200, y: 200 },
        ],
      ],
      [
        "b_c",
        [
          { x: 280, y: 228 },
          { x: 500, y: 56 },
        ],
      ],
    ]);
    // The rectangle holds a_b's line and no box; b_c leaves it.
    expect(selectInRect(boxes, { x: 90, y: 50, width: 150, height: 160 }, lines)).toEqual(["a_b"]);
    expect(selectInRect(boxes, { x: 0, y: -10, width: 600, height: 300 }, lines)).toEqual([
      "a",
      "b",
      "c",
      "a_b",
      "b_c",
    ]);
  });

  it("walks the source order and finds neighbours", () => {
    expect(nextInOrder(["a", "b", "c"], "b", 1)).toBe("c");
    expect(nextInOrder(["a", "b", "c"], "c", 1)).toBe("a");
    expect(nextInOrder(["a", "b", "c"], undefined, -1)).toBe("c");
    expect(nearestInDirection(boxes, "a", "right")).toBe("c");
    expect(nearestInDirection(boxes, "a", "down")).toBe("b");
    expect(nearestInDirection(boxes, "a", "left")).toBeUndefined();
  });

  it("prefers the nested shape of a stack as the neighbour", () => {
    // outer, middle and inner share their centre (500, 100), right of a.
    const stack = new Map<string, Box>([
      ["a", { x: 0, y: 72, width: 160, height: 56 }],
      ["outer", { x: 300, y: -100, width: 400, height: 400 }],
      ["middle", { x: 400, y: 0, width: 200, height: 200 }],
      ["inner", { x: 450, y: 50, width: 100, height: 100 }],
    ]);
    expect(nearestInDirection(stack, "a", "right")).toBe("inner");
    const reversed = new Map([...stack].reverse());
    expect(nearestInDirection(reversed, "a", "right")).toBe("inner");
    // A box closer than the stack still wins.
    stack.set("near", { x: 200, y: 72, width: 60, height: 56 });
    expect(nearestInDirection(stack, "a", "right")).toBe("near");
  });

  it("aligns and distributes", () => {
    const left = alignBoxes(boxes, "left");
    expect([...left.values()].map((p) => p.x)).toEqual([100, 100, 100]);
    const spread = distributeBoxes(
      new Map([
        ["p", { x: 20, y: 0, width: 160, height: 56 }],
        ["q", { x: 120, y: 0, width: 160, height: 56 }],
        ["r", { x: 420, y: 0, width: 160, height: 56 }],
      ]),
      "horizontal",
    );
    expect([...spread.values()].map((p) => p.x)).toEqual([100, 300, 500]);
  });
});

describe("routes", () => {
  it("lists ends, bends and segments, and edits bends", () => {
    const handles = routeHandles({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      via: [{ x: 100, y: 0 }],
      fromSide: "east",
      toSide: "north",
    });
    expect(handles.map((h) => h.kind)).toEqual(["end", "end", "bend", "segment", "segment"]);
    const via = [{ x: 1, y: 1 }];
    expect(withBendInserted(via, 0, { x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(withBendMoved(via, 0, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }]);
    expect(withBendRemoved(via, 0)).toEqual([]);
  });

  it("follows the drawn line of a curved connector", () => {
    // A Bézier route: the controls are its ends, the drawn samples bow upwards.
    const curved = routeHandles({
      points: [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
      drawn: [
        { x: 10, y: 100 },
        { x: 50, y: 40 },
        { x: 100, y: 20 },
        { x: 150, y: 40 },
        { x: 190, y: 100 },
      ],
      via: [],
      fromSide: "east",
      toSide: "west",
    });
    const handle = curved.find((h) => h.kind === "segment")!.point;
    expect(handle.y).toBeLessThan(40);
    expect(Math.abs(handle.x - 100)).toBeLessThan(2);
    expect(
      outlineOf({ points: [{ x: 0, y: 1 }], via: [], fromSide: "east", toSide: "west" }),
    ).toEqual([{ x: 0, y: 1 }]);
  });

  it("puts each stretch's handle on the drawn connector, halfway along it", () => {
    // Up out of api, across, down and back into client's east side: no bends written.
    const around = routeHandles({
      points: [
        { x: 70, y: 140 },
        { x: 70, y: 20 },
        { x: 605, y: 20 },
        { x: 605, y: 68 },
        { x: 593, y: 68 },
      ],
      via: [],
      fromSide: "north",
      toSide: "east",
    });
    // 120 + 535 + 48 + 12 = 715 long: the middle is 357.5 along, on the top stretch.
    expect(around.find((h) => h.kind === "segment")!.point).toEqual({ x: 307.5, y: 20 });
    // With a bend, one handle on each side of it.
    const bent = routeHandles({
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 300 },
      ],
      via: [{ x: 200, y: 100 }],
      fromSide: "south",
      toSide: "north",
    });
    expect(bent.filter((h) => h.kind === "segment").map((h) => h.point)).toEqual([
      { x: 50, y: 100 },
      { x: 200, y: 200 },
    ]);
  });
});

describe("the shapes on the canvas", () => {
  // A 160 × 80 diamond centred at (280, 200), and a 160 × 72 ellipse centred at (180, 136).
  const diamond: Box = { x: 200, y: 160, width: 160, height: 80 };
  const ellipse: Box = { x: 100, y: 100, width: 160, height: 72 };
  const reach = { border: 12, magnet: 6 };
  const onEllipse = (p: { x: number; y: number }) =>
    ((p.x - 180) / 80) ** 2 + ((p.y - 136) / 36) ** 2;
  /** Where the layout draws an end written as a side and a percentage of a shaped box. */
  const drawn = (shape: "diamond" | "ellipse", box: Box, side: string, position: number) => {
    const s = side as "north" | "south" | "east" | "west";
    return onOutline(shape, box, portPosition(box, s, position / 100), s);
  };

  it("draws a diamond's magnets on its four points and the middles of its four sides", () => {
    const found = magnets(diamond, [], "diamond");
    expect(found.map((m) => [m.port, m.position, m.point])).toEqual([
      ["north", 50, { x: 280, y: 160 }],
      ["east", 50, { x: 360, y: 200 }],
      ["south", 50, { x: 280, y: 240 }],
      ["west", 50, { x: 200, y: 200 }],
      ["north", 75, { x: 320, y: 180 }],
      ["south", 75, { x: 320, y: 220 }],
      ["south", 25, { x: 240, y: 220 }],
      ["north", 25, { x: 240, y: 180 }],
    ]);
    // None at the corners of the box, and each one is written where the layout draws it.
    const corners = [
      { x: 200, y: 160 },
      { x: 360, y: 160 },
      { x: 360, y: 240 },
      { x: 200, y: 240 },
    ];
    for (const magnet of found) {
      expect(corners).not.toContainEqual(magnet.point);
      const back = drawn("diamond", diamond, magnet.port, magnet.position!);
      expect(back.x).toBeCloseTo(magnet.point.x, 6);
      expect(back.y).toBeCloseTo(magnet.point.y, 6);
    }
    // A box keeps its middles and its four corners.
    expect(magnets(diamond)).toHaveLength(8);
    expect(magnets(diamond).map((m) => m.point)).toContainEqual({ x: 200, y: 160 });
  });

  it("draws an ellipse's magnets on the middles of its sides only, and named ports on it", () => {
    expect(magnets(ellipse, [], "ellipse").map((m) => [m.port, m.position, m.point])).toEqual([
      ["north", 50, { x: 180, y: 100 }],
      ["east", 50, { x: 260, y: 136 }],
      ["south", 50, { x: 180, y: 172 }],
      ["west", 50, { x: 100, y: 136 }],
    ]);
    // A named port on the west side, a quarter down, is drawn on the diamond's upper-left side.
    const ports = [{ name: "in", side: "west" as const, position: 0.25 }];
    expect(magnets(diamond, ports, "diamond").at(-1)).toEqual({
      port: "in",
      point: { x: 240, y: 180 },
    });
  });

  it("writes every magnet of every shape as the side and percentage the layout draws on it", () => {
    for (const shape of SHAPES) {
      for (const [width, height] of [
        [120, 120],
        [160, 80],
        [200, 120],
        [80, 160],
        [24, 24],
      ] as const) {
        const box: Box = { x: 10, y: 20, width, height };
        for (const magnet of magnets(box, [], shape)) {
          const back = onOutline(
            shape,
            box,
            portPosition(box, magnet.port as "north", magnet.position! / 100),
            magnet.port as "north",
          );
          expect(
            Math.hypot(back.x - magnet.point.x, back.y - magnet.point.y),
            `${shape} ${width}×${height} ${magnet.port} ${magnet.position}%`,
          ).toBeLessThan(0.5);
        }
      }
    }
  });

  it("writes the middles of a star's upper edges and of a callout's body on the side that draws them", () => {
    const box: Box = { x: 0, y: 0, width: 120, height: 120 };
    const star = magnets(box, [], "star");
    // The star's upper edges run (all but) level to its side points: a ray from the east or west
    // side along one meets the point first, so their middles are written on the north side.
    const upper = shapeOutline("star", box)
      .points.map((a, i, all) => ({ a, b: all[(i + 1) % all.length]! }))
      .filter(({ a, b }) => Math.abs(a.y - b.y) < 0.01)
      .map(({ a, b }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
    expect(upper).toHaveLength(2);
    for (const middle of upper) {
      const magnet = star.find(
        (m) => Math.hypot(m.point.x - middle.x, m.point.y - middle.y) < 1e-6,
      );
      expect(magnet?.port).toBe("north");
    }
    // No magnet of the callout is written on the east or west side at the body's bottom.
    for (const magnet of magnets(box, [], "callout")) {
      expect(`${magnet.port} ${magnet.position}`).not.toMatch(/^(east|west) 86\.67$/);
    }
  });

  it("measures the border of the shape: a diamond's empty corner is far from it", () => {
    expect(borderDistance(diamond, { x: 205, y: 165 })).toBe(5);
    expect(borderDistance(diamond, { x: 205, y: 165 }, "diamond")).toBeCloseTo(65 / Math.sqrt(5));
    expect(borderDistance(diamond, { x: 240, y: 180 }, "diamond")).toBeCloseTo(0);
    expect(borderDistance(ellipse, { x: 180, y: 90 }, "ellipse")).toBeCloseTo(10, 1);
    // Nothing attaches in the empty corner; deep inside, the layout chooses the end.
    expect(attachEnd(diamond, [], { x: 205, y: 165 }, reach, "diamond")).toEqual({
      port: null,
      point: { x: 205, y: 165 },
    });
    expect(attachEnd(diamond, [], { x: 270, y: 200 }, reach, "diamond")).toEqual({
      port: null,
      point: { x: 280, y: 200 },
    });
  });

  it("attaches an end near a diamond to the nearest point of its outline, written as the layout draws it", () => {
    // Just outside the upper-left side, away from the magnets (Alt), and by a magnet.
    const free = attachEnd(diamond, [], { x: 226, y: 176 }, { ...reach, free: true }, "diamond");
    expect(free).toMatchObject({ port: "north", position: 19 });
    expect(free.point.x).toBeCloseTo(230.4);
    expect(free.point.y).toBeCloseTo(184.8);
    const back = drawn("diamond", diamond, free.port!, free.position!);
    expect(back.x).toBeCloseTo(free.point.x, 6);
    expect(back.y).toBeCloseTo(free.point.y, 6);
    expect(attachEnd(diamond, [], { x: 238, y: 177 }, reach, "diamond")).toEqual({
      port: "north",
      position: 25,
      point: { x: 240, y: 180 },
    });
    // Below the lower-right side the south side is written.
    expect(
      attachEnd(diamond, [], { x: 300, y: 236 }, { ...reach, free: true }, "diamond"),
    ).toMatchObject({
      port: "south",
    });
  });

  it("attaches an end near an ellipse to a point on the ellipse", () => {
    for (const pointer of [
      { x: 120, y: 108 },
      { x: 245, y: 160 },
      { x: 102, y: 140 },
    ]) {
      const end = attachEnd(ellipse, [], pointer, { ...reach, free: true }, "ellipse");
      expect(end.port).not.toBeNull();
      expect(onEllipse(end.point)).toBeCloseTo(1, 2);
      const back = drawn("ellipse", ellipse, end.port!, end.position!);
      expect(back.x).toBeCloseTo(end.point.x, 6);
      expect(back.y).toBeCloseTo(end.point.y, 6);
      // Within a pixel or two of where the pointer meets the outline.
      expect(Math.hypot(end.point.x - pointer.x, end.point.y - pointer.y)).toBeLessThan(6);
    }
    expect(attachEnd(ellipse, [], { x: 104, y: 134 }, reach, "ellipse")).toEqual({
      port: "west",
      position: 50,
      point: { x: 100, y: 136 },
    });
  });

  it("outlines a highlight by the shape, without inner lines", () => {
    expect(highlightPath("diamond", diamond)).toBe("M280 160 L360 200 L280 240 L200 200 Z");
    expect(highlightPath("rounded", diamond)).toBe("M200 160 L360 160 L360 240 L200 240 Z");
    expect(highlightPath("framed", diamond)).toBe(highlightPath("rectangle", diamond));
    // A cylinder's rim is not part of its outline.
    expect(highlightPath("cylinder", diamond).match(/M/g)).toHaveLength(1);
  });

  it("finds the stack under a point front to back, inside the outlines, and cycles below", () => {
    const at = { x: 500, y: 100 };
    const painted = [
      { id: "outer", box: { x: 300, y: -100, width: 400, height: 400 }, shape: "rounded" as const },
      { id: "middle", box: { x: 400, y: 0, width: 200, height: 200 }, shape: "rectangle" as const },
      { id: "inner", box: { x: 450, y: 50, width: 100, height: 100 }, shape: "rounded" as const },
      { id: "kite", box: diamond, shape: "diamond" as const },
    ];
    const stack = stackAt(painted, at).map((e) => e.id);
    expect(stack).toEqual(["inner", "middle", "outer"]);
    expect(belowInStack(stack, undefined)).toBe("middle");
    expect(belowInStack(stack, "inner")).toBe("middle");
    expect(belowInStack(stack, "middle")).toBe("outer");
    expect(belowInStack(stack, "outer")).toBe("inner");
    expect(belowInStack(stack, "kite")).toBe("middle");
    expect(belowInStack(["alone"], undefined)).toBe("alone");
    expect(belowInStack([], "inner")).toBeUndefined();
    // The empty corner of the diamond holds nothing; its middle holds it.
    expect(stackAt(painted, { x: 205, y: 165 })).toEqual([]);
    expect(stackAt(painted, { x: 280, y: 200 }).map((e) => e.id)).toEqual(["kite"]);
  });

  it("drops a selection into the innermost group under its centre, never into itself", () => {
    const elements = [
      { id: "g", kind: "group", parent: null, box: { x: 100, y: 100, width: 400, height: 240 } },
      { id: "h", kind: "group", parent: "g", box: { x: 150, y: 150, width: 200, height: 120 } },
      { id: "c", kind: "box", parent: null, box: { x: 600, y: 100, width: 160, height: 56 } },
      { id: "a", kind: "box", parent: "h", box: { x: 170, y: 180, width: 80, height: 40 } },
    ].map((e) => ({ ...e, shape: "rounded" as const }));
    const parentOf = (id: string) => elements.find((e) => e.id === id)?.parent;
    expect(dropTarget(elements, ["c"], { x: 300, y: 200 }, parentOf)).toBe("h");
    expect(dropTarget(elements, ["c"], { x: 450, y: 300 }, parentOf)).toBe("g");
    expect(dropTarget(elements, ["c"], { x: 50, y: 50 }, parentOf)).toBeNull();
    // A group is never its own target, nor is a group inside a dragged one.
    expect(dropTarget(elements, ["h"], { x: 300, y: 200 }, parentOf)).toBe("g");
    expect(dropTarget(elements, ["g"], { x: 300, y: 200 }, parentOf)).toBeNull();
    // The parent changes for the outermost dragged elements only.
    expect(changesParent(["c"], "g", parentOf)).toBe(true);
    expect(changesParent(["a"], "h", parentOf)).toBe(false);
    expect(changesParent(["c"], null, parentOf)).toBe(false);
    expect(changesParent(["h", "a"], "g", parentOf)).toBe(false);
    expect(changesParent(["h", "a"], null, parentOf)).toBe(true);
  });

  it("keeps a child in its group on a hidden layer while the drop stays in its box", () => {
    // g lies on the hidden layer `back`; a, inside it, on the default layer stays visible.
    const elements = [
      {
        id: "g",
        kind: "group",
        parent: null,
        layer: "back",
        box: { x: 100, y: 80, width: 400, height: 240 },
      },
      {
        id: "h",
        kind: "group",
        parent: null,
        layer: "back",
        box: { x: 600, y: 80, width: 200, height: 200 },
      },
      {
        id: "a",
        kind: "box",
        parent: "g",
        layer: null,
        box: { x: 136, y: 120, width: 160, height: 56 },
      },
      {
        id: "c",
        kind: "box",
        parent: null,
        layer: null,
        box: { x: 900, y: 80, width: 160, height: 56 },
      },
    ].map((e) => ({ ...e, shape: "rounded" as const }));
    const parentOf = (id: string) => elements.find((e) => e.id === id)?.parent;
    const hidden = (e: { layer: string | null }) => e.layer === "back";
    // Nudged 28 px right, a is still in g's box: its group, hidden or not.
    expect(dropTarget(elements, ["a"], { x: 244, y: 148 }, parentOf, hidden)).toBe("g");
    expect(changesParent(["a"], "g", parentOf)).toBe(false);
    // Out of g's box, it leaves it; a hidden group is never a new target.
    expect(dropTarget(elements, ["a"], { x: 560, y: 148 }, parentOf, hidden)).toBeNull();
    expect(dropTarget(elements, ["a"], { x: 700, y: 180 }, parentOf, hidden)).toBeNull();
    expect(dropTarget(elements, ["c"], { x: 244, y: 148 }, parentOf, hidden)).toBeNull();
    // Without hidden layers, both groups take drops.
    expect(dropTarget(elements, ["c"], { x: 700, y: 180 }, parentOf)).toBe("h");
  });

  it("keeps all the children of a group without place in it, which moves with them", () => {
    const elements = [
      { id: "g", kind: "group", parent: null, placed: false },
      { id: "api", kind: "node", parent: "g", placed: true },
      { id: "db", kind: "node", parent: "g", placed: true },
      { id: "h", kind: "group", parent: null, placed: true },
      { id: "web", kind: "node", parent: "h", placed: true },
      { id: "lone", kind: "group", parent: null, placed: false },
      { id: "x", kind: "node", parent: "lone", placed: true },
    ];
    const parentOf = (id: string) => elements.find((e) => e.id === id)?.parent;
    // Every child of g, or the only child of lone: they stay; one of two leaves.
    expect([...carriedChildren(elements, ["api", "db"])]).toEqual(["api", "db"]);
    expect([...carriedChildren(elements, ["x"])]).toEqual(["x"]);
    expect([...carriedChildren(elements, ["api"])]).toEqual([]);
    // A placed group is no group drawn around its children: its last child leaves it.
    expect([...carriedChildren(elements, ["web"])]).toEqual([]);
    const kept = carriedChildren(elements, ["x"]);
    expect(changesParent(["x"], null, parentOf, kept)).toBe(false);
    expect(changesParent(["x"], "h", parentOf, kept)).toBe(false);
    expect(
      changesParent(["x", "web"], null, parentOf, carriedChildren(elements, ["x", "web"])),
    ).toBe(true);
  });
});

describe("keys and messages", () => {
  const key = (
    k: string,
    mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; code: string }> = {},
  ) => ({
    key: k,
    code: mods.code ?? "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it("maps keys to commands", () => {
    expect(commandFor(key("Tab"))).toBe("selectNext");
    expect(commandFor(key("Tab", { shiftKey: true }))).toBe("selectPrevious");
    expect(commandFor(key("ArrowRight", { shiftKey: true }))).toBe("nudgeRightGrid");
    expect(commandFor(key("d", { ctrlKey: true }))).toBe("duplicate");
    expect(commandFor(key("!", { shiftKey: true, code: "Digit1" }))).toBe("zoomFit");
    expect(commandFor(key("s"))).toBe("createData");
    expect(commandFor(key("p", { ctrlKey: true }))).toBeUndefined();
  });

  it("opens the shapes with F on flow and free diagrams; sequence diagrams keep F", () => {
    expect(commandFor(key("f"))).toBe("openShapes");
    expect(commandFor(key("F", { shiftKey: false }), false, "free")).toBe("openShapes");
    expect(commandFor(key("f"), false, "sequence")).toBe("createFragment");
    expect(commandFor(key("f"), false, "c4")).toBeUndefined();
    // Selecting the shape below is Alt+click and the context menu, never a key.
    expect(KEY_BINDINGS.some((b) => b.command === "selectBelow")).toBe(false);
    expect(KEY_BINDINGS.find((b) => b.command === "openShapes")!.description).toBe(
      "Open the shapes: type a name, Enter creates it",
    );
  });

  it("mirrors the language's shapes", () => {
    expect(SHAPES).toEqual(BOX_SHAPES);
  });

  it("accepts a shape, a target group and a two-way arrow, and nothing else", () => {
    const action = (a: unknown) => isCanvasMessage({ type: "action", revision: 1, action: a });
    const at = { x: 1, y: 2 };
    expect(action({ kind: "create", elementKind: "box", at, shape: "hexagon" })).toBe(true);
    expect(action({ kind: "create", elementKind: "node", at, shape: "star" })).toBe(true);
    expect(action({ kind: "create", elementKind: "box", at, shape: "blob" })).toBe(false);
    expect(action({ kind: "create", elementKind: "box", at, shape: 3 })).toBe(false);
    const delta = { x: 1, y: 0 };
    expect(action({ kind: "move", ids: ["a"], delta, parent: "g" })).toBe(true);
    expect(action({ kind: "move", ids: ["a"], delta, parent: null })).toBe(true);
    expect(action({ kind: "move", ids: ["a"], delta, parent: 1 })).toBe(false);
    const line = "dashed";
    expect(action({ kind: "connect", from: "a", to: "b", line, twoWay: true })).toBe(true);
    expect(action({ kind: "connect", from: "a", to: "b", line, twoWay: "yes" })).toBe(false);
  });

  it("maps the creation keys by profile and the order keys", () => {
    expect(commandFor(key("t"))).toBe("createTag");
    expect(commandFor(key("t"), false, "free")).toBe("createText");
    expect(commandFor(key("b"), false, "free")).toBe("createBox");
    expect(commandFor(key("i"), false, "free")).toBe("createIcon");
    expect(commandFor(key("m"), false, "free")).toBe("createImage");
    expect(commandFor(key("n"), false, "free")).toBeUndefined();
    expect(commandFor(key("b"))).toBeUndefined();
    const bracket = (shiftKey: boolean, code: string) =>
      key(shiftKey ? "}" : "]", { ctrlKey: true, shiftKey, code });
    expect(commandFor(bracket(true, "BracketRight"))).toBe("bringToFront");
    expect(commandFor(bracket(false, "BracketRight"))).toBe("bringForward");
    expect(commandFor(bracket(true, "BracketLeft"))).toBe("sendToBack");
    expect(commandFor(bracket(false, "BracketLeft"))).toBe("sendBackward");
  });

  it("accepts each end of a connection pinned on its own, with its port", () => {
    const connect = (pinned: unknown) =>
      isCanvasMessage({
        type: "action",
        revision: 1,
        action: { kind: "connect", from: "api", to: "db", line: "solid", pinned },
      });
    expect(connect({ fromPort: "north", fromPosition: 30 })).toBe(true);
    expect(connect({ toPort: "in" })).toBe(true);
    expect(connect({})).toBe(false);
    expect(connect({ toPosition: 40 })).toBe(false);
    expect(connect({ fromPort: "west", fromPosition: 140 })).toBe(false);
  });

  it("accepts the free actions", () => {
    expect(
      isCanvasMessage({
        type: "action",
        revision: 1,
        action: { kind: "create", elementKind: "icon", at: { x: 1, y: 2 }, source: "tabler:x" },
      }),
    ).toBe(true);
    expect(
      isCanvasMessage({
        type: "action",
        revision: 1,
        action: { kind: "reorder", ids: ["a"], to: "front" },
      }),
    ).toBe(true);
    expect(isCanvasMessage({ type: "action", revision: 1, action: { kind: "convert" } })).toBe(
      true,
    );
    expect(
      isCanvasMessage({
        type: "action",
        revision: 1,
        action: { kind: "reorder", ids: ["a"], to: "top" },
      }),
    ).toBe(false);
  });

  it("accepts a new diagram of the kinds it creates and previews of moves, resizes and rotations", () => {
    const action = (a: unknown) => isCanvasMessage({ type: "action", revision: 1, action: a });
    for (const type of ["flow", "free", "sequence"]) {
      expect(action({ kind: "createDiagram", type }), type).toBe(true);
    }
    expect(action({ kind: "createDiagram", type: "c4" })).toBe(false);
    expect(action({ kind: "createDiagram" })).toBe(false);
    const move = { kind: "move", ids: ["api"], delta: { x: 200, y: 0 } };
    const resize = { kind: "resize", id: "api", box: { x: 0, y: 0, width: 200, height: 80 } };
    expect(action({ kind: "preview", token: 3, action: move })).toBe(true);
    expect(action({ kind: "preview", token: 4, action: { ...move, parent: "g" } })).toBe(true);
    expect(action({ kind: "preview", token: 5, action: resize })).toBe(true);
    const turn = { kind: "setField", ids: ["api"], field: "style.rotation", value: 30 };
    expect(action({ kind: "preview", token: 6, action: turn })).toBe(true);
    expect(action({ kind: "preview", token: 7, action: { ...turn, value: null } })).toBe(true);
    expect(action({ kind: "preview", token: 8, action: { ...turn, field: "style.fill" } })).toBe(
      false,
    );
    expect(action({ kind: "preview", token: 9, action: { ...turn, value: "30" } })).toBe(false);
    // Only moves, resizes and rotations preview, well formed, under a numeric token.
    expect(action({ kind: "preview", action: move })).toBe(false);
    expect(action({ kind: "preview", token: "3", action: move })).toBe(false);
    expect(
      action({ kind: "preview", token: 3, action: { ...move, delta: { x: NaN, y: 0 } } }),
    ).toBe(false);
    expect(
      action({
        kind: "preview",
        token: 3,
        action: { ...resize, box: { ...resize.box, width: 0 } },
      }),
    ).toBe(false);
    expect(
      action({ kind: "preview", token: 3, action: { kind: "setVia", relation: "r", via: [] } }),
    ).toBe(false);
    expect(
      action({ kind: "preview", token: 3, action: { kind: "preview", token: 2, action: move } }),
    ).toBe(false);
  });

  it("validates messages from the webview", () => {
    expect(
      isCanvasMessage({
        type: "action",
        revision: 1,
        action: { kind: "move", ids: ["a"], delta: { x: 1, y: 2 } },
      }),
    ).toBe(true);
    expect(
      isCanvasMessage({
        type: "action",
        revision: 1,
        action: { kind: "move", ids: ["a"], delta: { x: Infinity, y: 2 } },
      }),
    ).toBe(false);
    expect(isCanvasMessage({ type: "action", revision: 1, action: { kind: "explode" } })).toBe(
      false,
    );
    expect(isCanvasMessage({ type: "select", ids: [1] })).toBe(false);
    expect(isCanvasMessage(null)).toBe(false);
  });

  it("carries other people's selections to the canvas, and never accepts them from it", () => {
    const people: readonly PresencePerson[] = [
      { name: "Ben", colour: "#1c7ed6", selection: ["api"] },
      { name: "Ana", colour: "#e03131", selection: [] },
    ];
    // The message is part of what the host may send, typed as the canvas reads it.
    const message: HostMessage = { type: "presence", people };
    expect(message.people.map((p) => p.name)).toEqual(["Ben", "Ana"]);
    // It only goes one way: a webview cannot send presence as if it were another person's.
    expect(isCanvasMessage(message)).toBe(false);
    expect(isCanvasMessage({ type: "presence", people: [] })).toBe(false);
  });
});
