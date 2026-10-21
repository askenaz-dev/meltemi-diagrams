import type { TextEdit } from "./text-edits.js";

/** Splits a text into lines that keep their line terminators, so joining them gives the text. */
export function splitLinesKeepingEnds(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

/**
 * Line-based edits that turn `before` into `after`, from Myers' O(ND) diff. Each edit replaces a
 * run of changed lines; unchanged lines are never touched, so editors keep cursors and folding.
 */
export function diffLines(before: string, after: string): TextEdit[] {
  const a = splitLinesKeepingEnds(before);
  const b = splitLinesKeepingEnds(after);
  const offsets = [0];
  for (const line of a) offsets.push(offsets[offsets.length - 1]! + line.length);

  // Trim the common prefix and suffix: most edits touch a few lines of a long file.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  const script = myers(midA, midB);
  const edits: TextEdit[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  while (k < script.length) {
    if (script[k] === "=") {
      i++;
      j++;
      k++;
      continue;
    }
    const startA = i;
    const startB = j;
    while (k < script.length && script[k] !== "=") {
      if (script[k] === "-") i++;
      else j++;
      k++;
    }
    edits.push({
      start: offsets[prefix + startA]!,
      end: offsets[prefix + i]!,
      newText: midB.slice(startB, j).join(""),
    });
  }
  return edits;
}

/** Shortest edit script between two line arrays: `=` keep, `-` delete from a, `+` insert from b. */
function myers(a: readonly string[], b: readonly string[]): ("=" | "-" | "+")[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Array<number>(2 * max + 2).fill(0);
  const trace: number[][] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  // Walk the trace backwards to recover the script.
  const script: ("=" | "-" | "+")[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d]!;
    const k = x - y;
    const prevK =
      k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : vd[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      script.push("=");
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        script.push("+");
        y--;
      } else {
        script.push("-");
        x--;
      }
    }
  }
  while (x > 0 && y > 0) {
    script.push("=");
    x--;
    y--;
  }
  return script.reverse();
}
