import { describe, expect, it } from "vitest";
import {
  applyCodeEdit,
  breakLine,
  indentLines,
  indentUnit,
  outdentLines,
  type CodeEdit,
} from "../src/inline.js";

/** A value with `|` for the caret, or `[` and `]` around a selection. */
function at(marked: string): { value: string; start: number; end: number } {
  const caret = marked.indexOf("|");
  if (caret >= 0) return { value: marked.replace("|", ""), start: caret, end: caret };
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  return { value: marked.replace("[", "").replace("]", ""), start, end };
}

/** The value after an edit, the caret or the selection marked as `at` reads them. */
function shown(value: string, edit: CodeEdit): string {
  const after = applyCodeEdit(value, edit);
  if (edit.start === edit.end) return `${after.slice(0, edit.start)}|${after.slice(edit.start)}`;
  return `${after.slice(0, edit.start)}[${after.slice(edit.start, edit.end)}]${after.slice(edit.end)}`;
}

describe("the indentation unit of a code note", () => {
  it("is a tab when a line starts with one", () => {
    expect(indentUnit("func f() {\n\treturn\n}")).toBe("\t");
  });

  it("is the fewest spaces an indented line starts with", () => {
    expect(indentUnit("a\n    b\n        c")).toBe("    ");
    expect(indentUnit("a\n  b\n    c")).toBe("  ");
  });

  it("is two spaces when no line is indented, blank lines aside", () => {
    expect(indentUnit("if (a) {")).toBe("  ");
    expect(indentUnit("a\n   \nb")).toBe("  ");
  });
});

describe("Enter in a code note", () => {
  it("keeps the indentation of the caret's line", () => {
    const { value, start, end } = at("if (a) {\n    return;|\n}");
    expect(shown(value, breakLine(value, start, end))).toBe("if (a) {\n    return;\n    |\n}");
  });

  it("keeps tabs, and replaces a selection", () => {
    const { value, start, end } = at("\tone [two] three");
    expect(shown(value, breakLine(value, start, end))).toBe("\tone \n\t| three");
  });

  it("adds no indentation on a line that has none", () => {
    const { value, start, end } = at("if (a) {|");
    expect(shown(value, breakLine(value, start, end))).toBe("if (a) {\n|");
  });
});

describe("Tab and Shift+Tab in a code note", () => {
  it("type the request's example", () => {
    let { value, start, end } = at("if (a) {|");
    const run = (edit: CodeEdit) => {
      value = applyCodeEdit(value, edit);
      start = edit.start;
      end = edit.end;
    };
    const type = (text: string) =>
      run({ from: start, to: end, text, start: start + text.length, end: start + text.length });
    run(breakLine(value, start, end));
    run(indentLines(value, start, end, indentUnit(value)));
    type("return;");
    run(breakLine(value, start, end));
    run(outdentLines(value, start, end, indentUnit(value)));
    type("}");
    expect(value).toBe("if (a) {\n  return;\n}");
  });

  it("insert a unit at the caret", () => {
    const { value, start, end } = at("a|b");
    expect(shown(value, indentLines(value, start, end, "  "))).toBe("a  |b");
  });

  it("indent every line a selection touches, and keep it selected", () => {
    const { value, start, end } = at("x\n    [a\n    b]\ny");
    expect(shown(value, indentLines(value, start, end, "    "))).toBe(
      "x\n        [a\n        b]\ny",
    );
  });

  it("leave empty lines and the line after a selection ending at its start", () => {
    const { value, start, end } = at("[a\n\nb\n]c");
    expect(shown(value, indentLines(value, start, end, "\t"))).toBe("\t[a\n\n\tb\n]c");
  });

  it("outdent by a unit until the line has none", () => {
    const { value, start, end } = at("x\n    [a\n    b]\ny");
    const once = outdentLines(value, start, end, "    ");
    expect(shown(value, once)).toBe("x\n[a\nb]\ny");
    const after = applyCodeEdit(value, once);
    expect(applyCodeEdit(after, outdentLines(after, once.start, once.end, "    "))).toBe(
      "x\na\nb\ny",
    );
  });

  it("outdent a tab, or the spaces a line has", () => {
    const tabbed = at("\t\treturn|");
    expect(shown(tabbed.value, outdentLines(tabbed.value, tabbed.start, tabbed.end, "\t"))).toBe(
      "\treturn|",
    );
    const short = at("  b|");
    expect(shown(short.value, outdentLines(short.value, short.start, short.end, "    "))).toBe(
      "b|",
    );
  });

  it("never move the caret into the line before", () => {
    const { value, start, end } = at("a\n|    b");
    expect(shown(value, outdentLines(value, start, end, "    "))).toBe("a\n|b");
  });
});
