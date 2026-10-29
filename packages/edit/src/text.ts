import {
  isToken,
  tokensOf,
  type CstElement,
  type Token,
  type Trivia,
} from "@meltemi/diagrams-language";

/** Offset where the line containing `offset` starts. */
export function lineStart(text: string, offset: number): number {
  return text.lastIndexOf("\n", offset - 1) + 1;
}

/** Leading spaces and tabs of the line containing `offset`. */
export function lineIndent(text: string, offset: number): string {
  const start = lineStart(text, offset);
  let end = start;
  while (end < text.length && (text[end] === " " || text[end] === "\t")) end++;
  return text.slice(start, end);
}

export function isBlank(text: string): boolean {
  return /^[ \t]*$/.test(text);
}

export function isCommentTrivia(trivia: Trivia): boolean {
  return trivia.kind === "LineComment" || trivia.kind === "BlockComment";
}

/** True when the leading trivia of a token holds only whitespace. */
export function hasOnlyWhitespaceTrivia(token: Token): boolean {
  return token.leadingTrivia.every((t) => t.kind === "Whitespace");
}

export function firstTokenOf(element: CstElement): Token | undefined {
  if (isToken(element)) return element;
  for (const token of tokensOf(element)) return token;
  return undefined;
}

/** Formats a coordinate: integers as is, other values rounded to two decimals. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Formats a pen coordinate: rounded to a tenth, without a decimal when whole. */
export function formatTenth(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Columns a text takes on a line, a tab counting for four as the formatter counts it. */
export function columnsOf(text: string): number {
  return text.length + (text.split("\t").length - 1) * 3;
}

export function sameNumber(a: number, b: number): boolean {
  return formatNumber(a) === formatNumber(b);
}

/** Quotes a label as an `.meltemi` string. */
export function quoteString(value: string): string {
  const escaped = value
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

export function formatPoint(point: { x: number; y: number }): string {
  return `(${formatNumber(point.x)}, ${formatNumber(point.y)})`;
}

export function formatPoints(points: readonly { x: number; y: number }[]): string {
  return `[${points.map(formatPoint).join(", ")}]`;
}

/** Coordinates the language can write: finite and without exponent notation. */
export function isWritableNumber(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < 1e9;
}
