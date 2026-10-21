/** Replace `[start, end)` of a text with `newText`. Offsets refer to the text before any edit. */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly newText: string;
}

/** Sorts edits by position and checks they are inside the text and do not overlap. */
export function normalizeTextEdits(text: string, edits: readonly TextEdit[]): TextEdit[] {
  const sorted = edits
    .map((edit, index) => ({ edit, index }))
    .sort((a, b) => a.edit.start - b.edit.start || a.edit.end - b.edit.end || a.index - b.index)
    .map((x) => x.edit);
  let previousEnd = 0;
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > text.length) {
      throw new RangeError(
        `Text edit [${edit.start}, ${edit.end}) is outside the text (length ${text.length}).`,
      );
    }
    if (edit.start < previousEnd) {
      throw new RangeError(`Text edits overlap at offset ${edit.start}.`);
    }
    previousEnd = edit.end;
  }
  return sorted;
}

/** Applies non-overlapping edits. Insertions at the same offset keep their given order. */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = normalizeTextEdits(text, edits);
  let out = "";
  let cursor = 0;
  for (const edit of sorted) {
    out += text.slice(cursor, edit.start) + edit.newText;
    cursor = edit.end;
  }
  return out + text.slice(cursor);
}

/**
 * Computes the edits that undo `edits`. The result applies to the text produced by
 * `applyTextEdits(text, edits)` and gives back `text` exactly.
 */
export function invertTextEdits(text: string, edits: readonly TextEdit[]): TextEdit[] {
  const sorted = normalizeTextEdits(text, edits);
  const inverse: TextEdit[] = [];
  let delta = 0;
  for (const edit of sorted) {
    const start = edit.start + delta;
    inverse.push({
      start,
      end: start + edit.newText.length,
      newText: text.slice(edit.start, edit.end),
    });
    delta += edit.newText.length - (edit.end - edit.start);
  }
  return inverse;
}

/** Line ending used by the first line break of the text; LF when there is none. */
export function detectLineEnding(text: string): "\n" | "\r\n" {
  const lf = text.indexOf("\n");
  return lf > 0 && text.charCodeAt(lf - 1) === 13 ? "\r\n" : "\n";
}

/** Indentation unit taken from the first indented non-blank line; two spaces when there is none. */
export function detectIndent(text: string): string {
  for (const line of text.split("\n")) {
    const match = /^([ \t]+)\S/.exec(line);
    if (!match) continue;
    const indent = match[1]!;
    return indent.startsWith("\t") ? "\t" : indent;
  }
  return "  ";
}
