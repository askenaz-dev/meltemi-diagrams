// What both stores must do the same way, so that `memoryStore()` and `d1Store()` agree.

/**
 * A limit as a number SQLite compares with a count: never `NaN` (nothing is allowed) and never
 * infinite or negative. It changes no answer, it only keeps a value D1 cannot bind out of the
 * statement; `memoryStore()` compares with the raw limit and gets the same answers.
 */
export function capacity(limit: number): number {
  if (Number.isNaN(limit)) return 0;
  return Math.min(Math.max(limit, 0), Number.MAX_SAFE_INTEGER);
}

/**
 * Compares two strings by code point, which is the order of their UTF-8 bytes and so the order
 * SQLite's default collation gives text. `<` and the default sort of JavaScript compare UTF-16
 * code units instead, and disagree for the characters above U+FFFF: both stores sort paths with
 * this, so they list them in the same order.
 */
export function compareBinary(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i) ?? 0;
    const y = b.codePointAt(j) ?? 0;
    if (x !== y) return x < y ? -1 : 1;
    const width = x > 0xffff ? 2 : 1;
    i += width;
    j += width;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}
