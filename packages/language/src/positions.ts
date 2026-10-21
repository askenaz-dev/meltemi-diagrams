/** Half-open span of UTF-16 code unit offsets: `start` inclusive, `end` exclusive. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** A point in a text: offset plus 1-based line and column (columns count UTF-16 code units). */
export interface Location {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

/** A span resolved to line and column positions. */
export interface Range {
  readonly start: Location;
  readonly end: Location;
}

/**
 * Converts between offsets and 1-based line/column positions.
 * Lines are separated by `\n`; in CRLF files the `\r` belongs to the end of its line.
 */
export class LineIndex {
  /** Offset of the first character of each line. */
  readonly lineStarts: readonly number[];

  constructor(readonly text: string) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) starts.push(i + 1);
    }
    this.lineStarts = starts;
  }

  get lineCount(): number {
    return this.lineStarts.length;
  }

  location(offset: number): Location {
    const o = Math.max(0, Math.min(offset, this.text.length));
    const starts = this.lineStarts;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= o) lo = mid;
      else hi = mid - 1;
    }
    return { offset: o, line: lo + 1, column: o - starts[lo]! + 1 };
  }

  range(span: Span): Range {
    return { start: this.location(span.start), end: this.location(span.end) };
  }

  /** Offset of a 1-based line and column, clamped to the text. */
  offsetAt(line: number, column: number): number {
    const l = Math.max(1, Math.min(line, this.lineCount));
    const start = this.lineStarts[l - 1]!;
    return Math.max(0, Math.min(start + column - 1, this.lineEndOffset(l)));
  }

  /** Offset where a 1-based line starts. */
  lineStartOffset(line: number): number {
    return this.lineStarts[Math.max(1, Math.min(line, this.lineCount)) - 1]!;
  }

  /** Offset of the line break that ends a 1-based line (excluding `\r\n`), or the text length. */
  lineEndOffset(line: number): number {
    const l = Math.max(1, Math.min(line, this.lineCount));
    if (l === this.lineCount) return this.text.length;
    const next = this.lineStarts[l]!;
    const nl = next - 1;
    return nl > 0 && this.text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
  }
}
