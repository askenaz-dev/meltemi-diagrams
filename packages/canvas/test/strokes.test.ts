import { describe, expect, it } from "vitest";
import type { PeerPen, StrokeLook } from "../src/presence.js";
import {
  MAX_PERSON_STROKES,
  MAX_STROKE_POINTS,
  PeerStrokes,
  STROKE_ACTIVE_MS,
  STROKE_HOLD_MS,
  STROKE_LAG_MS,
  STROKE_TAIL_MS,
} from "../src/strokes.js";

const RED = { width: 4, colour: "#e03131", opacity: 1 };
const HIGHLIGHT = { width: 20, colour: "#ffe600", opacity: 0.35 };

/** The pen part of stroke `stroke` in `look`, maybe its cancel batch. */
const pen = (stroke: number, look: StrokeLook = RED, cancel = false): PeerPen => ({
  look,
  stroke,
  cancel,
});

/** Ten points along y = `y` from x = `from`, 10 apart, 20 ms apart. */
const ten = (from: number, y = 80) =>
  Array.from({ length: 10 }, (_, i) => ({ x: from + i * 10, y, t: i * 20 }));

const shown = (strokes: PeerStrokes, now: number) =>
  strokes.drawn(now).map((stroke) => stroke.points.length);

describe("a peer's stroke", () => {
  it("grows point by point at the pace of its batch, and with the next batch of its number", () => {
    const strokes = new PeerStrokes();
    expect(strokes.add("ben", pen(1), ten(120), 1000)).toBe(true);
    expect(shown(strokes, 1000)).toEqual([1]);
    expect(shown(strokes, 1090)).toEqual([5]);
    expect(strokes.pending(1090)).toBe(true);
    expect(shown(strokes, 1180)).toEqual([10]);
    expect(strokes.pending(1180)).toBe(false);
    // The next batch of the same stroke grows it: one stroke of twenty points.
    strokes.add("ben", pen(1), ten(220), 1250);
    expect(shown(strokes, 1250)).toEqual([11]);
    expect(shown(strokes, 1500)).toEqual([20]);
    expect(strokes.drawn(1500)[0]!.look).toEqual(RED);
    expect(strokes.size).toBe(1);
  });

  it("does not fade: it is whole seconds later, and goes ten seconds after its last batch", () => {
    const strokes = new PeerStrokes();
    strokes.add("ben", pen(1), ten(120), 1000);
    strokes.expire(3000);
    expect(shown(strokes, 3000)).toEqual([10]);
    expect(strokes.nextExpiry()).toBe(1000 + STROKE_HOLD_MS);
    strokes.expire(1000 + STROKE_HOLD_MS);
    expect(strokes.drawn(1000 + STROKE_HOLD_MS)).toEqual([]);
    expect(strokes.nextExpiry()).toBeUndefined();
  });

  it("shows a batch that came early after the points ahead of it, though not for long", () => {
    const strokes = new PeerStrokes();
    strokes.add("ben", pen(1), ten(120), 1000);
    // The next batch came 100 ms later, while the first still had 80 ms to show.
    strokes.add("ben", pen(1), ten(220), 1100);
    expect(shown(strokes, 1179)).toEqual([9]);
    // The first batch's last point and the next batch's first show together.
    expect(shown(strokes, 1180)).toEqual([11]);
    // Behind a batch that lasts a second, the next waits for its last point, and starts with it
    // (its own pace begins at most STROKE_LAG_MS after it came).
    const late = new PeerStrokes();
    late.add(
      "ben",
      pen(1),
      [
        { x: 0, y: 0, t: 0 },
        { x: 10, y: 0, t: 1000 },
      ],
      0,
    );
    late.add(
      "ben",
      pen(1),
      [
        { x: 20, y: 0, t: 0 },
        { x: 30, y: 0, t: 100 },
      ],
      10,
    );
    expect(shown(late, 999)).toEqual([1]);
    expect(shown(late, 1000)).toEqual([4]);
    expect(10 + STROKE_LAG_MS + 100).toBeLessThan(1000);
  });

  it("shows every point at once under reduced motion", () => {
    const strokes = new PeerStrokes();
    strokes.add("ben", pen(1), ten(120), 1000, true);
    expect(shown(strokes, 1000)).toEqual([10]);
    expect(strokes.pending(1000)).toBe(false);
  });

  it("starts another stroke with another number, never joined to the one before in the same look", () => {
    const strokes = new PeerStrokes();
    // A bar, then 200 ms later a stroke down from elsewhere, before the bar's pen came.
    strokes.add("ben", pen(1), ten(120), 1000, true);
    strokes.add("ben", pen(2), ten(300, 200), 1200, true);
    const drawn = strokes.drawn(1300);
    expect(drawn).toHaveLength(2);
    expect(drawn.map((stroke) => stroke.points[0])).toEqual([
      { x: 120, y: 80 },
      { x: 300, y: 200 },
    ]);
    expect(drawn.map((stroke) => stroke.points.length)).toEqual([10, 10]);
  });

  it("keeps the strokes of a look and of a person apart", () => {
    const strokes = new PeerStrokes();
    strokes.add("ben", pen(1), ten(120), 1000, true);
    strokes.add("ben", pen(2, HIGHLIGHT), ten(120, 200), 1100, true);
    strokes.add("eve", pen(1), ten(120, 300), 1100, true);
    expect(strokes.drawn(1100).map((s) => s.look)).toEqual([RED, HIGHLIGHT, RED]);
    expect(strokes.keep(new Set(["eve"]))).toBe(true);
    expect(strokes.drawn(1100).map((s) => s.points[0]!.y)).toEqual([300]);
  });

  it("goes at once with its cancel batch, with or without points, and nothing of it comes back", () => {
    const strokes = new PeerStrokes();
    strokes.add("ben", pen(1), ten(120), 1000, true);
    strokes.add("ben", pen(2), ten(120, 200), 1100, true);
    // Escape on the second: its last batch has no points.
    expect(strokes.add("ben", pen(2, RED, true), [], 1200)).toBe(true);
    expect(strokes.drawn(1200).map((s) => s.points[0]!.y)).toEqual([80]);
    // A late batch of the cancelled stroke draws nothing.
    expect(strokes.add("ben", pen(2), ten(300, 200), 1250, true)).toBe(false);
    expect(strokes.size).toBe(1);
    // A cancel that carries the last points goes all the same, and the next stroke is drawn.
    expect(strokes.add("ben", pen(1, RED, true), ten(220), 1300, true)).toBe(true);
    expect(strokes.size).toBe(0);
    expect(strokes.add("ben", pen(3), ten(120, 400), 1400, true)).toBe(true);
    expect(shown(strokes, 1400)).toEqual([10]);
    // A cancel of a stroke never seen changes nothing.
    expect(strokes.add("eve", pen(9, RED, true), [], 1500)).toBe(false);
  });

  it("keeps the points of a stroke, and the strokes of a person, within bounds", () => {
    const strokes = new PeerStrokes();
    for (let i = 0; i < MAX_STROKE_POINTS / 64 + 2; i++) {
      strokes.add(
        "ben",
        pen(1),
        Array.from({ length: 64 }, (_, j) => ({ x: i * 64 + j, y: 0, t: 0 })),
        i,
        true,
      );
    }
    expect(strokes.drawn(1000)[0]!.points).toHaveLength(MAX_STROKE_POINTS);
    const many = new PeerStrokes();
    for (let i = 0; i < MAX_PERSON_STROKES + 4; i++) {
      many.add("ben", pen(i), [{ x: 0, y: 0, t: 0 }], i, true);
    }
    expect(many.size).toBe(MAX_PERSON_STROKES);
  });

  it("is one dot for a press without moving", () => {
    const strokes = new PeerStrokes();
    strokes.add("ben", pen(1), [{ x: 50, y: 60, t: 0 }], 0);
    expect(strokes.drawn(0)).toEqual([{ points: [{ x: 50, y: 60 }], look: RED }]);
  });
});

describe("a peer's stroke and the drawing", () => {
  const written = (id: string, points: { x: number; y: number }[], width = 4) => ({
    id,
    points,
    width,
  });
  const along = (from: number, to: number, y = 80) => [
    { x: from, y },
    { x: (from + to) / 2, y: y + 1 },
    { x: to, y },
  ];

  it("goes at once when a render holds its pen, simplified as it is", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([], 900);
    strokes.add("ben", pen(1), ten(120), 1000);
    expect(strokes.rendered([written("ben1", along(120, 210))], 1100)).toBe(true);
    expect(strokes.drawn(1100)).toEqual([]);
  });

  it("goes with a render that comes after its last batch", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([], 900);
    strokes.add("ben", pen(1), ten(120), 1000);
    expect(strokes.rendered([], 1000 + STROKE_ACTIVE_MS)).toBe(true);
    expect(strokes.size).toBe(0);
  });

  it("stays whole through somebody else's edit while it is drawn", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([written("old", along(0, 50, 400))], 900);
    strokes.add("ben", pen(1), ten(120), 1000);
    // Somebody else wrote a pen elsewhere.
    expect(
      strokes.rendered(
        [written("old", along(0, 50, 400)), written("eve1", along(0, 90, 300))],
        1100,
      ),
    ).toBe(false);
    strokes.add("ben", pen(1), ten(220), 1250);
    expect(shown(strokes, 2000)).toEqual([20]);
  });

  it("draws nothing of the end of a stroke that comes after the render that holds its pen", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([], 900);
    strokes.add("ben", pen(1), ten(120), 1000);
    strokes.rendered([written("ben1", along(120, 310))], 1100);
    expect(strokes.size).toBe(0);
    // The last batch of the stroke, late: its number went with its pen.
    expect(strokes.add("ben", pen(1), ten(220), 1200)).toBe(false);
    expect(strokes.size).toBe(0);
    // The next stroke, which starts on that pen, is drawn whole.
    strokes.add("ben", pen(2), [...ten(300).slice(0, 2), ...ten(300, 160).slice(2)], 1300, true);
    expect(strokes.drawn(1300)[0]!.points[0]).toEqual({ x: 300, y: 80 });
    expect(shown(strokes, 1300)).toEqual([10]);
  });

  /** A wiggle drawn freehand from (100, `y`) to (190, `y` + 30), every other point 30 lower. */
  const wiggle = (y: number) =>
    Array.from({ length: 10 }, (_, i) => ({ x: 100 + i * 10, y: y + (i % 2) * 30, t: i * 15 }));
  /** The straight pen Shift writes from the wiggle's press to (300, `y`). */
  const straight = (y: number) => [
    { x: 100, y },
    { x: 300, y },
  ];

  it("goes with the straight pen Shift wrote, though its freehand part is not on it", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([], 0);
    // A wiggle drawn freehand, then Shift: the release sent the end, and wrote the straight pen.
    strokes.add("ben", pen(1), wiggle(100), 1000, true);
    strokes.add("ben", pen(1), [{ x: 300, y: 100, t: 0 }], 1050, true);
    expect(strokes.rendered([written("pen1", straight(100), 3)], 1250)).toBe(true);
    expect(strokes.size).toBe(0);
    expect(strokes.nextExpiry()).toBeUndefined();
  });

  it("goes with the batch that reaches its straight pen's end, when the pen came first", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([], 0);
    strokes.add("ben", pen(1), wiggle(100), 1000, true);
    // The pen came before the stroke's end: the stroke stays, its end still to come.
    expect(strokes.rendered([written("pen1", straight(100), 3)], 1100)).toBe(false);
    expect(strokes.size).toBe(1);
    expect(strokes.add("ben", pen(1), [{ x: 300, y: 100, t: 0 }], 1150, true)).toBe(true);
    expect(strokes.size).toBe(0);
    // A straight stroke whose end was lost on the way goes when the next stroke starts.
    strokes.add("ben", pen(2), wiggle(300), 2000, true);
    expect(
      strokes.rendered(
        [written("pen1", straight(100), 3), written("pen2", straight(300), 3)],
        2100,
      ),
    ).toBe(false);
    expect(strokes.size).toBe(1);
    expect(strokes.add("ben", pen(3), ten(500, 500), 2200, true)).toBe(true);
    expect(strokes.drawn(2200).map((s) => s.points[0])).toEqual([{ x: 500, y: 500 }]);
  });

  it("is not taken by a pen that does not start where it starts", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([], 0);
    strokes.add("ben", pen(1), ten(120), 1000, true);
    // Somebody's pen that crosses the stroke's last point, from elsewhere.
    const across = [
      { x: 210, y: 0 },
      { x: 210, y: 200 },
    ];
    expect(strokes.rendered([written("eve1", across)], 1100)).toBe(false);
    expect(strokes.add("ben", pen(1), [{ x: 215, y: 80, t: 0 }], 1150, true)).toBe(true);
    expect(strokes.size).toBe(1);
  });

  it("takes the pens of the first render as the drawing, not as strokes written", () => {
    const strokes = new PeerStrokes();
    strokes.add("ben", pen(1), ten(120), 1000);
    expect(strokes.rendered([written("ben1", along(120, 210))], 1100)).toBe(false);
    expect(strokes.size).toBe(1);
  });

  it("forgets the drawing's pens with another diagram, and takes the next render's as its drawing", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([], 900);
    strokes.add("ben", pen(1), ten(120), 1000);
    strokes.clear(true);
    expect(strokes.size).toBe(0);
    strokes.add("ben", pen(2), ten(120), 1100);
    expect(strokes.rendered([written("ben1", along(120, 210))], 1200)).toBe(false);
    // The render of the other diagram, its pens taken as its drawing: the first stroke drawn after
    // it goes with the render that holds its pen.
    const other = new PeerStrokes();
    other.clear(true);
    other.rendered([written("b1", [{ x: 500, y: 500 }])], 4000);
    other.add("ben", pen(3), ten(120), 5000);
    expect(
      other.rendered([written("b1", [{ x: 500, y: 500 }]), written("pen1", along(120, 210))], 5200),
    ).toBe(true);
    expect(other.size).toBe(0);
  });

  it("keeps a stroke whose pens came long before it began as a stroke of its own", () => {
    const strokes = new PeerStrokes();
    strokes.rendered([], 900);
    strokes.rendered([written("ben1", along(120, 210))], 1000);
    const later = 1000 + STROKE_TAIL_MS + 1;
    strokes.add("eve", pen(1), ten(120), later, true);
    expect(strokes.rendered([written("ben1", along(120, 210))], later + 100)).toBe(false);
    expect(shown(strokes, later + 100)).toEqual([10]);
  });
});
