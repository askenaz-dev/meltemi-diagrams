import { describe, expect, it } from "vitest";
import {
  attachEnd,
  bearing,
  intoFrame,
  magnets,
  outOfFrame,
  stackAt,
  turnedAngle,
  turnedBounds,
} from "../src/canvas/index.js";

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe("turned elements on the canvas", () => {
  const square = { x: 0, y: 0, width: 120, height: 120 };

  it("takes points into an element's frame and back", () => {
    const box = { x: 120, y: 72, width: 160, height: 56 };
    // The east of a node turned a quarter is the diagram's south.
    close(intoFrame({ x: 200, y: 180 }, box, 90), { x: 280, y: 100 });
    close(outOfFrame({ x: 280, y: 100 }, box, 90), { x: 200, y: 180 });
    expect(intoFrame({ x: 1, y: 2 }, box, undefined)).toEqual({ x: 1, y: 2 });
    const bounds = turnedBounds(box, 90);
    close({ x: bounds.x, y: bounds.y }, { x: 172, y: 20 });
    close({ x: bounds.width, y: bounds.height }, { x: 56, y: 160 });
  });

  it("hits a turned element by its turned outline", () => {
    const painted = [{ id: "s", box: square, shape: "square" as const, rotation: 45 }];
    // A corner of the unturned box lies outside the turned square.
    expect(stackAt(painted, { x: 4, y: 4 })).toEqual([]);
    expect(stackAt(painted, { x: 60, y: 2 })).toHaveLength(1);
    expect(stackAt([{ ...painted[0]!, rotation: undefined }], { x: 4, y: 4 })).toHaveLength(1);
  });

  it("hits a rounded polygon by its rounded outline", () => {
    const diamond = { x: 0, y: 0, width: 160, height: 80 };
    const painted = [{ id: "d", box: diamond, shape: "diamond" as const }];
    expect(stackAt(painted, { x: 1, y: 40 })).toHaveLength(1);
    expect(stackAt([{ ...painted[0]!, radius: 16 }], { x: 1, y: 40 })).toEqual([]);
  });

  it("puts a rounded polygon's magnets on its curves and pins ends on them", () => {
    const diamond = { x: 0, y: 0, width: 160, height: 80 };
    const sharp = magnets(diamond, [], "diamond").map((m) => m.point);
    const round = magnets(diamond, [], "diamond", { radius: 16 }).map((m) => m.point);
    expect(sharp.some((p) => p.x === 0 && p.y === 40)).toBe(true);
    expect(round.some((p) => p.x === 0 && p.y === 40)).toBe(false);
    const end = attachEnd(diamond, [], { x: 4, y: 40 }, { border: 12, magnet: 0 }, "diamond", {
      radius: 16,
    });
    expect(end.port).toBe("west");
    expect(end.point.x).toBeGreaterThan(1);
  });

  it("reads the rotation handle's bearing, snapped or free", () => {
    const centre = { x: 100, y: 100 };
    expect(bearing(centre, { x: 100, y: 20 })).toBe(0);
    expect(bearing(centre, { x: 180, y: 100 })).toBe(90);
    expect(bearing(centre, { x: 100, y: 180 })).toBe(180);
    expect(bearing(centre, { x: 20, y: 100 })).toBe(270);
    // 37 degrees east of north, free and snapped to 15.
    const pointer = {
      x: 100 + 80 * Math.sin((37 * Math.PI) / 180),
      y: 100 - 80 * Math.cos((37 * Math.PI) / 180),
    };
    expect(bearing(centre, pointer)).toBe(37);
    expect(bearing(centre, pointer, 15)).toBe(30);
    expect(bearing(centre, { x: 100 - 1, y: 20 }, 15)).toBe(0);
  });

  describe("the angle of a turn from where the handle was grabbed", () => {
    const centre = { x: 100, y: 100 };
    const at = (degrees: number, radius = 80) => ({
      x: centre.x + radius * Math.sin((degrees * Math.PI) / 180),
      y: centre.y - radius * Math.cos((degrees * Math.PI) / 180),
    });
    // The handle of a default node sits about 66 degrees from the centre.
    const grab = at(66);

    it("gives the starting angle back when the pointer has not turned", () => {
      expect(turnedAngle(0, centre, grab, grab, 15)).toBe(0);
      expect(turnedAngle(30, centre, grab, at(68), 15)).toBe(30);
    });

    it("adds a quarter turn clockwise from the grab", () => {
      expect(turnedAngle(0, centre, grab, at(156), 15)).toBe(90);
      expect(turnedAngle(45, centre, grab, at(156), 15)).toBe(135);
    });

    it("snaps to the step, or keeps the whole degree without one", () => {
      expect(turnedAngle(0, centre, grab, at(66 + 37), 15)).toBe(30);
      expect(turnedAngle(0, centre, grab, at(66 + 37))).toBe(37);
    });

    it("wraps past 359 both ways", () => {
      expect(turnedAngle(350, centre, grab, at(66 + 20))).toBe(10);
      expect(turnedAngle(10, centre, grab, at(66 - 20))).toBe(350);
      expect(turnedAngle(0, centre, at(350), at(10))).toBe(20);
    });
  });
});
