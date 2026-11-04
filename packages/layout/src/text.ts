import type { FontRole } from "./scene.js";

const NARROW = new Set("iljtfrI.,'`:;|!()[]{} ");
const WIDE = new Set("mwMW@%");

/**
 * Estimates the rendered width of a text without a font engine. Boxes with an explicit `size`
 * never depend on it; tags, notes and label pills do. Measurement arrives with the layout engine.
 */
export function estimateTextWidth(text: string, size: number, font: FontRole): number {
  if (font === "mono") return text.length * size * 0.6;
  let width = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) width += 0.32;
    else if (WIDE.has(ch)) width += 0.85;
    else if (ch >= "A" && ch <= "Z") width += 0.68;
    else if (ch >= "0" && ch <= "9") width += 0.58;
    else width += 0.56;
  }
  return width * size;
}

export function splitLines(text: string): string[] {
  return text.split("\n");
}

/** How much wider than the width a line may measure and still fit: rounding, not text. */
const WRAP_TOLERANCE = 1e-9;

/**
 * How many of `characters` from `start` fit on a line, at most all of them: the longest prefix
 * that fits. The search starts at `guess` (the previous piece's length), moves away from it by
 * doubling steps until it passes the boundary, then halves between the two, so it is bounded by
 * what a line holds, not by the length of the word: breaking a long word measures each piece a
 * few times and the whole word never.
 */
function longestFit(
  characters: readonly string[],
  start: number,
  fits: (line: string) => boolean,
  guess = 1,
): number {
  const remaining = characters.length - start;
  const prefix = (count: number) => characters.slice(start, start + count).join("");
  // `fit` characters are known to fit and `miss` known not to.
  let fit = 0;
  let miss = remaining + 1;
  const first = Math.max(1, Math.min(guess, remaining));
  if (fits(prefix(first))) {
    fit = first;
    for (let step = 1; fit < remaining; step *= 2) {
      const count = Math.min(fit + step, remaining);
      if (!fits(prefix(count))) {
        miss = count;
        break;
      }
      fit = count;
    }
    if (fit === remaining) return remaining;
  } else {
    miss = first;
    for (let step = 1; miss > 1; step *= 2) {
      const count = Math.max(1, miss - step);
      if (fits(prefix(count))) {
        fit = count;
        break;
      }
      miss = count;
    }
  }
  let low = fit + 1;
  let high = miss - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (fits(prefix(middle))) {
      fit = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return fit;
}

/** Whether a UTF-16 code unit opens a surrogate pair, which a cut must not split. */
const opensPair = (code: number) => code >= 0xd800 && code <= 0xdbff;

/**
 * Breaks a text into lines no wider than `width`, as `measure` tells the width of a line: at each
 * `\n`, then greedily at spaces, each line taking as many words as fit. A word wider than `width`
 * starts a line of its own and is broken between characters, each piece taking as many as fit and
 * at least one. The spaces at a break are dropped; an empty text is one empty line, as with
 * `splitLines`. Stickies wrap their text with it, and editors that type over one do the same.
 */
export function wrapLines(
  text: string,
  width: number,
  measure: (line: string) => number,
): string[] {
  const within = (line: string) => measure(line) <= width + WRAP_TOLERANCE;
  // The length of the longest line found to fit. A line much longer than it is first tried by
  // its beginnings of doubling length, and does not fit as soon as one of them does not (a text
  // is never narrower than its beginning): a long word is never measured whole.
  let longest = 0;
  const fits = (line: string) => {
    for (let length = 2 * longest + 16; length < line.length; length *= 2) {
      const end = opensPair(line.charCodeAt(length - 1)) ? length - 1 : length;
      if (!within(line.slice(0, end))) return false;
    }
    if (!within(line)) return false;
    longest = Math.max(longest, line.length);
    return true;
  };
  const out: string[] = [];
  for (const paragraph of splitLines(text)) {
    const first = out.length;
    // Null while the line holds nothing yet, so a break leaves no space at the next line's start.
    let line: string | null = null;
    // Whether a break began the line: its leading spaces, and the previous one's trailing, go.
    let broken = false;
    for (const word of paragraph.split(" ")) {
      if (line === null && broken && word === "") continue;
      const joined: string = line === null ? word : `${line} ${word}`;
      if (line === null || fits(joined)) {
        line = joined;
      } else {
        const kept = line.replace(/ +$/, "");
        if (kept !== "") out.push(kept);
        broken = true;
        line = word === "" ? null : word;
      }
      // A word wider than the line, alone on it: the longest piece that fits, again and again.
      // Its characters are split once, and no piece is measured much longer than a line.
      if (line !== null && !fits(line)) {
        const characters = Array.from(line);
        let start = 0;
        let take = 1;
        line = null;
        while (start < characters.length) {
          // The pieces of one word are much alike: the search starts at the last one's length.
          take = longestFit(characters, start, fits, take);
          if (start + take === characters.length) {
            // The rest fits: it is the line, which later words may join.
            line = characters.slice(start).join("");
            break;
          }
          // At least one character a piece, even one wider than the line.
          const count = Math.max(1, take);
          out.push(characters.slice(start, start + count).join(""));
          broken = true;
          start += count;
        }
      }
    }
    // Every paragraph is one line at least, as an empty one is.
    if (line !== null) out.push(line);
    else if (out.length === first) out.push("");
  }
  return out;
}
