import { describe, expect, it } from "vitest";
import {
  TextPlace,
  lineStarts,
  visible,
  type TextMetrics,
} from "../src/cloud/presence-geometry.js";

// A pane whose characters are 10 pixels wide and lines 20 high, with 12 and 8 pixels of padding.
const METRICS: TextMetrics = { char: 10, line: 20, left: 12, top: 8, tab: 2 };
const NOT_SCROLLED = { left: 0, top: 0 };

const place = (text: string, scroll = NOT_SCROLLED) => new TextPlace(text, METRICS, scroll);

describe("the lines of a text", () => {
  it("start after each line break", () => {
    expect(lineStarts("")).toEqual([0]);
    expect(lineStarts("ab")).toEqual([0]);
    expect(lineStarts("ab\ncd\n\nef")).toEqual([0, 3, 6, 7]);
    expect(lineStarts("a\n")).toEqual([0, 2]);
  });
});

describe("where an offset is", () => {
  it("is a line and a column, each counted from 0", () => {
    const text = "ab\ncde\n\nf";
    expect(place(text).point(0)).toEqual({ line: 0, column: 0 });
    expect(place(text).point(2)).toEqual({ line: 0, column: 2 });
    expect(place(text).point(3)).toEqual({ line: 1, column: 0 });
    expect(place(text).point(6)).toEqual({ line: 1, column: 3 });
    expect(place(text).point(7)).toEqual({ line: 2, column: 0 });
    expect(place(text).point(8)).toEqual({ line: 3, column: 0 });
    expect(place(text).point(9)).toEqual({ line: 3, column: 1 });
  });

  it("is kept inside the text", () => {
    expect(place("abc").point(-4)).toEqual({ line: 0, column: 0 });
    expect(place("abc").point(99)).toEqual({ line: 0, column: 3 });
  });

  it("moves to the next tab stop at a tab, as the pane's tab size does", () => {
    // Two columns to a stop: "a" is at 1, the tab takes it to 2; the next tab to 4.
    expect(place("a\tb").point(2)).toEqual({ line: 0, column: 2 });
    expect(place("\t\tb").point(2)).toEqual({ line: 0, column: 4 });
    expect(place("ab\tc").point(3)).toEqual({ line: 0, column: 4 });
  });

  it("is a pixel position: the padding, then columns and lines times the pane's measures", () => {
    expect(place("ab\ncde").at(0)).toEqual({ x: 12, y: 8 });
    expect(place("ab\ncde").at(5)).toEqual({ x: 12 + 2 * 10, y: 8 + 20 });
  });

  it("is moved by the scroll", () => {
    expect(place("ab\ncde", { left: 5, top: 30 }).at(5)).toEqual({
      x: 12 + 20 - 5,
      y: 8 + 20 - 30,
    });
  });

  it("is a bar as tall as a line", () => {
    expect(place("ab\ncde").caret(4, 2)).toEqual({ x: 22, y: 28, width: 2, height: 20 });
  });
});

describe("a selection", () => {
  it("on one line is one band from its start to its end", () => {
    expect(place("hello world").band(6, 11)).toEqual([{ x: 12 + 60, y: 8, width: 50, height: 20 }]);
  });

  it("is the same whichever way it was made", () => {
    expect(place("hello world").band(11, 6)).toEqual(place("hello world").band(6, 11));
  });

  it("is nothing when it is empty", () => {
    expect(place("hello").band(2, 2)).toEqual([]);
  });

  it("over several lines is a band for each, the line breaks included", () => {
    // "b\ncd\ne": from the "b" to the "e".
    const bands = place("ab\ncd\nef").band(1, 7);
    expect(bands).toEqual([
      // "b" and its line break
      { x: 12 + 10, y: 8, width: 20, height: 20 },
      // "cd" and its line break
      { x: 12, y: 28, width: 30, height: 20 },
      // "e"
      { x: 12, y: 48, width: 10, height: 20 },
    ]);
  });

  it("gives an empty line inside it the width of its line break", () => {
    const bands = place("a\n\nb").band(0, 4);
    expect(bands.map((band) => band.width)).toEqual([20, 10, 10]);
  });

  it("does not paint a line it only reaches the start of", () => {
    expect(place("ab\ncd").band(0, 3)).toHaveLength(1);
  });

  it("counts tabs in the width", () => {
    // "\tab": the tab is two columns.
    expect(place("\tab").band(0, 3)).toEqual([{ x: 12, y: 8, width: 40, height: 20 }]);
  });

  it("is kept inside the text and follows the scroll", () => {
    const bands = place("abc", { left: 4, top: 2 }).band(1, 400);
    expect(bands).toEqual([{ x: 12 + 10 - 4, y: 8 - 2, width: 20, height: 20 }]);
  });

  it("costs the lines in view when the height of the text area is given, whatever it spans", () => {
    // 100 000 lines selected from the start to the end: the whole of a large file (Ctrl+A).
    const text = Array.from({ length: 100_000 }, (_, i) => `line ${i}`).join("\n");
    const height = 200;
    for (const top of [0, 7, 20 * 5000 + 3, 20 * 99_990]) {
      const scroll = { left: 0, top };
      const everything = place(text, scroll)
        .band(0, text.length)
        .filter((box) => visible(box, 400, height));
      const windowed = place(text, scroll).band(0, text.length, height);
      // The bands that are on screen are the same ones, and nothing else was worked out.
      expect(windowed.filter((box) => visible(box, 400, height))).toEqual(everything);
      expect(windowed.length).toBeLessThanOrEqual(everything.length + 2);
      expect(windowed.length).toBeLessThan(20);
    }
  });

  it("keeps the line break of the last line in view that the selection runs past", () => {
    const text = "aa\nbb\ncc\ndd";
    // The area shows the first two lines only; the selection goes on to the end.
    const bands = place(text).band(0, text.length, 36);
    expect(bands.map((box) => box.width)).toEqual([30, 30]);
  });

  it("is as before without a height, and for a selection wholly in view", () => {
    const text = "ab\ncde\n\nf";
    expect(place(text).band(1, 8, 1000)).toEqual(place(text).band(1, 8));
  });

  it("uses line starts that were found already", () => {
    const text = "ab\ncde\n\nf";
    const starts = lineStarts(text);
    expect(new TextPlace(text, METRICS, NOT_SCROLLED, starts).band(0, 9)).toEqual(
      place(text).band(0, 9),
    );
  });
});

describe("what is in view", () => {
  it("is what is at least partly inside the text area", () => {
    const area = { w: 200, h: 100 };
    expect(visible({ x: 10, y: 10, width: 5, height: 20 }, area.w, area.h)).toBe(true);
    expect(visible({ x: -30, y: 10, width: 20, height: 20 }, area.w, area.h)).toBe(false);
    expect(visible({ x: -10, y: 10, width: 20, height: 20 }, area.w, area.h)).toBe(true);
    expect(visible({ x: 10, y: 140, width: 5, height: 20 }, area.w, area.h)).toBe(false);
    expect(visible({ x: 10, y: -25, width: 5, height: 20 }, area.w, area.h)).toBe(false);
    expect(visible({ x: 210, y: 10, width: 5, height: 20 }, area.w, area.h)).toBe(false);
  });
});
