import type { TextPlace } from "@meltemi/diagrams-editor/canvas";
import { describe, expect, it } from "vitest";
import {
  MIN_WRAPPED_SIZE,
  boxPlace,
  inlineFrame,
  inlineValue,
  wrappedFrame,
  wrappedLines,
  wrappedSize,
} from "../src/inline.js";

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

/**
 * A sticky note's words: the card at (100, 100), 160 square, its area inside 12 units of padding,
 * two lines of 15.6 drawn about the middle.
 */
const sticky: TextPlace = {
  anchor: { x: 180, y: 180 },
  area: { x: 112, y: 112, width: 136, height: 136 },
  align: "center",
  font: "Inter, sans-serif",
  size: 15.6,
  weight: 400,
  color: "#1f2328",
  line: 19.5,
  lines: true,
};

describe("the size a sticky note's words are typed at", () => {
  /** A card whose long text the layout shrank from 15.6 to 10. */
  const shrunk: TextPlace = { ...sticky, size: 10, line: 12.5, fullSize: 15.6 };

  it("starts from the size the card draws its words at before they shrink", () => {
    // A long text cut down to "Hi": it fits at the full size, and is typed at it.
    const asked: number[] = [];
    expect(wrappedSize(shrunk, (size) => (asked.push(size), true))).toBe(15.6);
    expect(asked).toEqual([15.6]);
  });

  it("shrinks one unit at a time as the text outgrows the card, as the layout does", () => {
    const asked: number[] = [];
    // Lines that fit from 11 down.
    expect(wrappedSize(shrunk, (size) => (asked.push(size), size <= 11))).toBe(10.6);
    expect(asked).toEqual([15.6, 14.6, 13.6, 12.6, 11.6, 10.6]);
  });

  it("stops at the smallest size, asked last at the size it gives", () => {
    const asked: number[] = [];
    expect(wrappedSize(shrunk, (size) => (asked.push(size), false))).toBe(MIN_WRAPPED_SIZE);
    expect(asked.slice(-2)).toEqual([8.6, 8]);
  });

  it("starts from the drawn size when the place knows no other", () => {
    expect(wrappedSize(sticky, () => true)).toBe(15.6);
    expect(wrappedSize({ ...sticky, size: 10 }, () => true)).toBe(10);
  });
});

describe("the editor of a sticky note's words", () => {
  it("is exactly as wide as the card's area at the zoom, about the middle of the lines", () => {
    // The anchor at (360, 360) on the screen at 200 %: the area starts 136 pixels before it.
    const frame = wrappedFrame(sticky, 2, { x: 360, y: 360 }, 78);
    expect(frame).toEqual({ left: 224, top: 321, width: 272, height: 78 });
  });

  it("grows from where its lines are drawn, inside the card while they fit", () => {
    // Lines drawn at the top: their middle is 19.5 below the area's top, so more lines grow down.
    const top = { ...sticky, anchor: { x: 180, y: 112 + 19.5 } };
    expect(wrappedFrame(top, 1, top.anchor, 39).top).toBe(112);
    expect(wrappedFrame(top, 1, top.anchor, 117).top).toBe(112);
    // Lines drawn at the bottom grow up, their last line staying on the area's bottom.
    const bottom = { ...sticky, anchor: { x: 180, y: 248 - 19.5 } };
    const grown = wrappedFrame(bottom, 1, bottom.anchor, 117);
    expect(grown.top + grown.height).toBe(248);
    // Taller than the card, the lines start at the area's top, as the drawing's do.
    expect(wrappedFrame(sticky, 1, sticky.anchor, 200).top).toBe(112);
  });

  it("hides every line a sticky note draws, which the layout wrapped and not the label", () => {
    // Just enough of the SVG's elements for the search: the tests run without a page.
    const node = (
      tag: string,
      attributes: Record<string, string> = {},
      children: unknown[] = [],
      text = "",
    ) => ({
      tagName: tag.toUpperCase(),
      children,
      textContent: text,
      hasAttribute: (name: string) => Object.hasOwn(attributes, name),
      getAttribute: (name: string) => attributes[name] ?? null,
    });
    const groups = [
      node("g", { "data-id": "s1", "data-role": "element" }, [
        node("rect"),
        node("text", {}, [], "Cache the"),
        node("a", {}, [node("text", {}, [], "catalogue")]),
        node("path", { "aria-label": "drawn" }),
        node("path"),
      ]),
      node("g", { "data-id": "s2", "data-role": "element" }, [node("text", {}, [], "Other")]),
    ];
    const svg = {
      querySelectorAll: (selector: string) =>
        groups.filter((g) => selector.includes(`"${g.getAttribute("data-id")}"`)),
    } as unknown as Element;
    const said = (nodes: Element[]) =>
      nodes.map((n) => n.textContent || n.getAttribute("aria-label"));
    expect(said(wrappedLines(svg, "s1"))).toEqual(["Cache the", "catalogue", "drawn"]);
    expect(wrappedLines(svg, "s3")).toEqual([]);
  });
});
