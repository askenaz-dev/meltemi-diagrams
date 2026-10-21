import type { TextPlace } from "@meltemi/diagrams-editor/canvas";
import { describe, expect, it } from "vitest";
import { boxPlace, inlineFrame, inlineValue } from "../src/inline.js";

/** A centred label on the middle of a 160-wide box, with 12 units of padding on each side. */
const centred: TextPlace = {
  anchor: { x: 100, y: 50 },
  area: { x: 32, y: 42, width: 136, height: 16 },
  align: "center",
  font: "Inter, sans-serif",
  size: 13,
  weight: 600,
  color: "#0f172a",
  line: 16,
  lines: true,
};

describe("the editor in place", () => {
  it("covers the text's room at the zoom, centred on the anchor, one line tall", () => {
    const frame = inlineFrame(centred, 1.5, { x: 300, y: 200 }, { width: 20, lines: 1 });
    expect(frame).toEqual({
      left: 300 - 102,
      top: 200 - 12,
      width: 204,
      height: 24,
      fontSize: 19.5,
      lineHeight: 24,
    });
  });

  it("grows around its alignment point as the text needs, and with its lines", () => {
    const wide = inlineFrame(centred, 1, { x: 100, y: 50 }, { width: 300, lines: 3 });
    expect(wide.width).toBe(302);
    expect(wide.left).toBe(100 - 151);
    expect(wide.height).toBe(48);
    // Still centred on the middle of the drawn lines.
    expect(wide.top + wide.height / 2).toBe(50);
    const left = inlineFrame(
      { ...centred, align: "left", anchor: { x: 40, y: 50 } },
      1,
      { x: 40, y: 50 },
      { width: 300, lines: 1 },
    );
    expect(left.left).toBe(40);
    expect(left.width).toBe(302);
    // Without much text, a left-aligned editor reaches the right of the room.
    const short = inlineFrame(
      { ...centred, align: "left", anchor: { x: 40, y: 50 } },
      1,
      { x: 40, y: 50 },
      { width: 10, lines: 1 },
    );
    expect(short.width).toBe(128);
    const right = inlineFrame(
      { ...centred, align: "right", anchor: { x: 160, y: 50 } },
      2,
      { x: 320, y: 100 },
      { width: 10, lines: 1 },
    );
    expect(right.left + right.width).toBe(320);
    expect(right.width).toBe(2 * 128);
  });

  it("keeps the room centred on an anchor that is not in the middle of an uneven area", () => {
    // A triangle's row: more room on the left of the anchor than on its right.
    const uneven = { ...centred, area: { x: 0, y: 42, width: 150, height: 16 } };
    const frame = inlineFrame(uneven, 1, { x: 100, y: 50 }, { width: 0, lines: 1 });
    expect(frame.width).toBe(100);
    expect(frame.left).toBe(50);
  });

  it("shows where typing goes on a relation without a label: one character wide", () => {
    const point = { ...centred, area: { x: 100, y: 50, width: 0, height: 0 } };
    const frame = inlineFrame(point, 1, { x: 100, y: 50 }, { width: 0, lines: 1 });
    expect(frame.width).toBe(6.5);
  });

  it("writes line breaks of labels with lines, but trailing ones, and none on one line", () => {
    expect(inlineValue("Planner\nagent", true)).toBe("Planner\nagent");
    expect(inlineValue("Planner\r\nagent\n\n", true)).toBe("Planner\nagent");
    expect(inlineValue("Planner\nagent", false)).toBe("Planner agent");
    expect(inlineValue("", true)).toBe("");
  });

  it("places a text the scene does not draw on the middle of its box", () => {
    const place = boxPlace({ x: 10, y: 20, width: 100, height: 40 }, "serif");
    expect(place.anchor).toEqual({ x: 60, y: 40 });
    expect(place).toMatchObject({ align: "center", font: "serif", lines: false });
  });
});
