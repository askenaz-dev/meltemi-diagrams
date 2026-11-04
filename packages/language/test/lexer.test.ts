import { describe, expect, it } from "vitest";
import { LineIndex, tokenize, type Token } from "../src/index.js";

const kinds = (tokens: readonly Token[]) => tokens.map((t) => t.kind);
const significant = (text: string) => tokenize(text).tokens.filter((t) => t.kind !== "EOF");

describe("lexer: token classes", () => {
  it("tokenizes a statement with every token class", () => {
    const text = "route create from api.east to orders.west via [(520, -16.5)] // bend";
    const { tokens, diagnostics } = tokenize(text);
    expect(diagnostics).toEqual([]);
    expect(kinds(tokens)).toEqual([
      "Identifier",
      "Identifier",
      "Identifier",
      "Identifier",
      "Dot",
      "Identifier",
      "Identifier",
      "Identifier",
      "Dot",
      "Identifier",
      "Identifier",
      "LBracket",
      "LParen",
      "Number",
      "Comma",
      "Number",
      "RParen",
      "RBracket",
      "EOF",
    ]);
    const numbers = tokens.filter((t) => t.kind === "Number");
    expect(numbers.map((t) => t.value)).toEqual([520, -16.5]);
    const eof = tokens.at(-1)!;
    expect(eof.leadingTrivia.map((t) => [t.kind, t.text])).toEqual([
      ["Whitespace", " "],
      ["LineComment", "// bend"],
    ]);
  });

  it("reads unit suffixes on numbers", () => {
    const tokens = significant("duration 1200ms; hold 2.5s; label r at 50%");
    const numbers = tokens.filter((t) => t.kind === "Number");
    expect(numbers.map((t) => [t.value, t.unit])).toEqual([
      [1200, "ms"],
      [2.5, "s"],
      [50, "%"],
    ]);
    expect(tokens.filter((t) => t.kind === "Semicolon")).toHaveLength(2);
  });

  it("keeps unknown unit suffixes for validation by the model", () => {
    const [token] = significant("12px");
    expect([token!.kind, token!.value, token!.unit]).toEqual(["Number", 12, "px"]);
  });

  it("distinguishes arrows from negative numbers", () => {
    expect(kinds(significant("a->b"))).toEqual(["Identifier", "Arrow", "Identifier"]);
    expect(kinds(significant("a-->b"))).toEqual(["Identifier", "DashedArrow", "Identifier"]);
    expect(significant("(0,-16)").map((t) => t.text)).toEqual(["(", "0", ",", "-16", ")"]);
  });

  it("decodes string escapes", () => {
    const [token] = significant('"a \\"quoted\\" \\\\ path\\nline\\ttab"');
    expect(token!.value).toBe('a "quoted" \\ path\nline\ttab');
    expect(token!.malformed).toBeFalsy();
  });

  it("emits line breaks as tokens and keeps CRLF together", () => {
    const tokens = significant("a\r\nb\nc");
    expect(tokens.map((t) => t.text)).toEqual(["a", "\r\n", "b", "\n", "c"]);
  });

  it("attaches comments and whitespace to the next token", () => {
    const [first, , second] = significant("/* lead */ a\n  // own line\n  b");
    expect(first!.leadingTrivia.map((t) => t.kind)).toEqual(["BlockComment", "Whitespace"]);
    expect(first!.fullStart).toBe(0);
    expect(first!.start).toBe(11);
    const newlineAfterComment = tokenize("/* lead */ a\n  // own line\n  b").tokens[2]!;
    expect(newlineAfterComment.leadingTrivia.map((t) => t.text)).toEqual(["  ", "// own line"]);
    expect(second!.text).toBe("\n");
  });

  it("treats block comments spanning lines as trivia", () => {
    const tokens = significant("a /* one\ntwo */ b");
    expect(kinds(tokens)).toEqual(["Identifier", "Identifier"]);
  });
});

describe("lexer: diagnostics", () => {
  it("reports an unterminated string up to the end of the line and continues", () => {
    const text = 'api["API\nnext';
    const { tokens, diagnostics } = tokenize(text);
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0]!;
    expect(d.code).toBe("syntax.unterminated-string");
    expect(d.range.start.offset).toBe(4);
    expect(d.range.end.offset).toBe(8);
    const str = tokens.find((t) => t.kind === "String")!;
    expect(str.malformed).toBe(true);
    expect(tokens.map((t) => t.text)).toContain("next");
  });

  it("reports an unsupported arrow with a hint", () => {
    const { tokens, diagnostics } = tokenize("a => b");
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0]!;
    expect(d.code).toBe("syntax.unexpected-character");
    expect(d.range.start.column).toBe(3);
    expect(d.hints).toContain(
      "The relation tokens are `->`, `-->`, `--`, `---`, `<->` and `<-->`.",
    );
    expect(kinds(tokens)).toEqual(["Identifier", "Unknown", "Identifier", "EOF"]);
  });

  it("reads the two-way arrows and refuses a lone reverse arrow", () => {
    expect(kinds(tokenize("a <-> b").tokens)).toEqual([
      "Identifier",
      "BothArrow",
      "Identifier",
      "EOF",
    ]);
    expect(kinds(tokenize("a <--> b").tokens)).toEqual([
      "Identifier",
      "DashedBothArrow",
      "Identifier",
      "EOF",
    ]);
    const reverse = tokenize("a <- b");
    expect(reverse.diagnostics.map((d) => d.code)).toEqual(["syntax.unexpected-character"]);
  });

  it("reads the line tokens, taking the longest match", () => {
    expect(kinds(tokenize("a -- b").tokens)).toEqual(["Identifier", "Line", "Identifier", "EOF"]);
    expect(kinds(tokenize("c --- d").tokens)).toEqual([
      "Identifier",
      "DashedLine",
      "Identifier",
      "EOF",
    ]);
    expect(kinds(tokenize("a --> b").tokens)).toEqual([
      "Identifier",
      "DashedArrow",
      "Identifier",
      "EOF",
    ]);
    // `--->` is `---` and an unexpected `>`, with the six tokens in the hint.
    const long = tokenize("a ---> b");
    expect(kinds(long.tokens)).toEqual([
      "Identifier",
      "DashedLine",
      "Unknown",
      "Identifier",
      "EOF",
    ]);
    expect(long.diagnostics.map((d) => d.code)).toEqual(["syntax.unexpected-character"]);
    expect(long.diagnostics[0]!.range.start.column).toBe(6);
    expect(long.diagnostics[0]!.hints).toContain(
      "The relation tokens are `->`, `-->`, `--`, `---`, `<->` and `<-->`.",
    );
    // `--5` is the line token and a number; `--b` recovers at the token.
    const number = tokenize("a --5").tokens;
    expect(kinds(number)).toEqual(["Identifier", "Line", "Number", "EOF"]);
    expect(number[2]!.value).toBe(5);
    expect(kinds(tokenize("a --b").tokens)).toEqual(["Identifier", "Line", "Identifier", "EOF"]);
  });

  it("says what a minus sign is followed by", () => {
    const { diagnostics } = tokenize("a -x b");
    expect(diagnostics.map((d) => d.code)).toEqual(["syntax.unexpected-character"]);
    expect(diagnostics[0]!.range.start.column).toBe(3);
    expect(diagnostics[0]!.hints).toContain(
      "A minus sign must be followed by a digit, `-` or `>`.",
    );
  });

  it("reports one diagnostic per run of unexpected characters", () => {
    const { diagnostics } = tokenize("a ## b ñ c");
    expect(diagnostics.map((d) => d.code)).toEqual([
      "syntax.unexpected-character",
      "syntax.unexpected-character",
    ]);
    expect(diagnostics[1]!.hints?.[0]).toMatch(/ASCII/);
  });

  it("reports unknown escapes", () => {
    const { diagnostics } = tokenize('"C:\\icons"');
    expect(diagnostics.map((d) => d.code)).toEqual(["syntax.invalid-escape"]);
    expect(diagnostics[0]!.range.start.offset).toBe(3);
  });

  it("reports an unterminated block comment", () => {
    const { tokens, diagnostics } = tokenize("a /* never closed\nb");
    expect(diagnostics.map((d) => d.code)).toEqual(["syntax.unterminated-comment"]);
    expect(kinds(tokens)).toEqual(["Identifier", "EOF"]);
  });

  it("accepts a byte order mark as trivia with an info diagnostic", () => {
    const { tokens, diagnostics } = tokenize("\uFEFFa");
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([["syntax.bom", "info"]]);
    expect(tokens[0]!.leadingTrivia[0]!.kind).toBe("ByteOrderMark");
  });

  it("accepts CRLF files without diagnostics", () => {
    expect(tokenize("a -> b\r\nc -> d\r\n").diagnostics).toEqual([]);
  });

  it("warns once on the first line break that differs from the first one", () => {
    const { diagnostics } = tokenize("a\r\nb\nc\nd\r\n");
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0]!;
    expect(d.code).toBe("syntax.mixed-line-endings");
    expect(d.severity).toBe("warning");
    expect(d.range.start.line).toBe(2);
  });
});

describe("LineIndex", () => {
  const text = "ab\r\ncd\n\nef";
  const lines = new LineIndex(text);

  it("converts offsets to 1-based lines and columns", () => {
    expect(lines.lineCount).toBe(4);
    expect(lines.location(0)).toEqual({ offset: 0, line: 1, column: 1 });
    expect(lines.location(4)).toEqual({ offset: 4, line: 2, column: 1 });
    expect(lines.location(5)).toEqual({ offset: 5, line: 2, column: 2 });
    expect(lines.location(8)).toEqual({ offset: 8, line: 4, column: 1 });
    expect(lines.location(999).offset).toBe(text.length);
  });

  it("converts positions back to offsets", () => {
    expect(lines.offsetAt(2, 2)).toBe(5);
    expect(lines.offsetAt(4, 3)).toBe(10);
    expect(lines.offsetAt(1, 99)).toBe(2);
  });

  it("finds line ends without the line break", () => {
    expect(lines.lineEndOffset(1)).toBe(2);
    expect(lines.lineEndOffset(2)).toBe(6);
    expect(lines.lineEndOffset(3)).toBe(7);
    expect(lines.lineEndOffset(4)).toBe(10);
  });

  it("counts columns in UTF-16 code units", () => {
    const index = new LineIndex('"😀" x');
    expect(index.location(5).column).toBe(6);
  });
});
