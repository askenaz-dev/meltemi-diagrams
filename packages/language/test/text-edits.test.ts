import { describe, expect, it } from "vitest";
import {
  applyTextEdits,
  detectIndent,
  detectLineEnding,
  invertTextEdits,
  type TextEdit,
} from "../src/index.js";

describe("text edits", () => {
  const text = "place api at (360, 180) // keep";

  it("applies non-overlapping edits from their original offsets", () => {
    const edits: TextEdit[] = [
      { start: 19, end: 22, newText: "200" },
      { start: 14, end: 17, newText: "400" },
    ];
    expect(applyTextEdits(text, edits)).toBe("place api at (400, 200) // keep");
  });

  it("keeps the given order of insertions at the same offset", () => {
    const edits: TextEdit[] = [
      { start: 0, end: 0, newText: "a" },
      { start: 0, end: 0, newText: "b" },
    ];
    expect(applyTextEdits("x", edits)).toBe("abx");
  });

  it("rejects overlapping and out-of-range edits", () => {
    expect(() =>
      applyTextEdits(text, [
        { start: 0, end: 5, newText: "" },
        { start: 3, end: 6, newText: "" },
      ]),
    ).toThrow(RangeError);
    expect(() => applyTextEdits("abc", [{ start: 2, end: 9, newText: "" }])).toThrow(RangeError);
  });

  it("inverts edits exactly", () => {
    const edits: TextEdit[] = [
      { start: 0, end: 5, newText: "move" },
      { start: 14, end: 17, newText: "4000" },
      { start: text.length, end: text.length, newText: "\nsize api (1, 2)" },
      { start: 24, end: 31, newText: "" },
    ];
    const changed = applyTextEdits(text, edits);
    expect(applyTextEdits(changed, invertTextEdits(text, edits))).toBe(text);
  });

  it("detects line endings", () => {
    expect(detectLineEnding("a\r\nb\nc")).toBe("\r\n");
    expect(detectLineEnding("a\nb\r\n")).toBe("\n");
    expect(detectLineEnding("single line")).toBe("\n");
  });

  it("detects the indentation unit", () => {
    expect(detectIndent("a {\n    b\n}")).toBe("    ");
    expect(detectIndent("a {\n\tb\n}")).toBe("\t");
    expect(detectIndent("a {\n\n   \n  b\n}")).toBe("  ");
    expect(detectIndent("flat")).toBe("  ");
  });
});
