// Where other people's carets and selections go on the code pane, as numbers: the pane's text is
// monospace, so a position is a line and a column times the width of one character, with tabs
// advancing to the next stop. No DOM and no measuring here: the pane's measures are handed in, so a
// test plays them with a width of its own.

/** The pane's measures: what one character, one line and the text's padding come to. */
export interface TextMetrics {
  /** The width of one character, in pixels. */
  readonly char: number;
  /** The height of one line. */
  readonly line: number;
  /** The text's left padding in the pane. */
  readonly left: number;
  /** The text's top padding in the pane. */
  readonly top: number;
  /** The tab size, in columns. */
  readonly tab: number;
}

/** How far the text area is scrolled. */
export interface Scroll {
  readonly left: number;
  readonly top: number;
}

/** A rectangle of the pane, in pixels. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The start offset of each line of a text: line `n` starts at `starts[n]`. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) starts.push(at + 1);
  return starts;
}

/** The line holding an offset, by binary search over the starts. */
function lineOf(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((starts[middle] as number) <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** The visual column of an offset in its line: a tab advances to the next multiple of `tab`. */
function columnOf(text: string, from: number, offset: number, tab: number): number {
  let column = 0;
  for (let i = from; i < offset; i++) {
    column = text.charCodeAt(i) === 9 ? (Math.floor(column / tab) + 1) * tab : column + 1;
  }
  return column;
}

/**
 * A text prepared to place offsets in: its line starts are found once, or handed in when the
 * caller has them from an earlier look at the same text.
 */
export class TextPlace {
  private readonly starts: readonly number[];

  constructor(
    private readonly text: string,
    private readonly metrics: TextMetrics,
    private readonly scroll: Scroll,
    starts?: readonly number[],
  ) {
    this.starts = starts ?? lineStarts(text);
  }

  /** The line (from 0) and visual column of an offset, which is kept inside the text. */
  point(offset: number): { line: number; column: number } {
    const at = Math.max(0, Math.min(offset, this.text.length));
    const line = lineOf(this.starts, at);
    return { line, column: columnOf(this.text, this.starts[line] as number, at, this.metrics.tab) };
  }

  /** The left and top of the character at an offset, in the pane, scroll included. */
  at(offset: number): { x: number; y: number } {
    const { line, column } = this.point(offset);
    return {
      x: this.metrics.left + column * this.metrics.char - this.scroll.left,
      y: this.metrics.top + line * this.metrics.line - this.scroll.top,
    };
  }

  /** The thin bar of a caret at an offset. */
  caret(offset: number, width: number): Box {
    const { x, y } = this.at(offset);
    return { x, y, width, height: this.metrics.line };
  }

  /**
   * The bands of a selection, one for each line it touches. A line the selection runs past the end
   * of gets one character more, which is the line break that is selected too; an empty line inside
   * a selection is that one character. With the `height` of the text area shown, only the lines
   * that are at least partly in it get a band (a selection of the whole of a large file costs
   * the lines on screen, not the lines it spans); the others are not worked out.
   */
  band(start: number, end: number, height?: number): Box[] {
    const from = Math.max(0, Math.min(start, end, this.text.length));
    const to = Math.min(this.text.length, Math.max(start, end));
    if (to <= from) return [];
    const first = lineOf(this.starts, from);
    const last = lineOf(this.starts, to);
    let shownFrom = first;
    let shownTo = last;
    const row = this.metrics.line;
    if (height !== undefined && row > 0) {
      // A line shows when its box overlaps 0..height, as `visible` says of the box.
      const offset = this.scroll.top - this.metrics.top;
      shownFrom = Math.max(first, Math.ceil(offset / row) - 1);
      shownTo = Math.min(last, Math.floor((offset + height) / row));
    }
    const boxes: Box[] = [];
    for (let line = shownFrom; line <= shownTo; line++) {
      const lineStart = this.starts[line] as number;
      const lineEnd =
        line + 1 < this.starts.length ? (this.starts[line + 1] as number) - 1 : this.text.length;
      const a = Math.max(from, lineStart);
      const b = Math.min(to, lineEnd);
      const left = this.at(a);
      const right = columnOf(this.text, lineStart, b, this.metrics.tab);
      const columns = right - columnOf(this.text, lineStart, a, this.metrics.tab);
      // Past the end of this line into the next: the line break is selected.
      const breaks = to > lineEnd && line < last ? 1 : 0;
      const width = (columns + breaks) * this.metrics.char;
      if (width > 0) boxes.push({ x: left.x, y: left.y, width, height: this.metrics.line });
    }
    return boxes;
  }
}

/** Whether a box is at least partly inside a viewport that starts at 0, 0. */
export function visible(box: Box, width: number, height: number): boolean {
  return box.x + box.width >= 0 && box.x <= width && box.y + box.height >= 0 && box.y <= height;
}
