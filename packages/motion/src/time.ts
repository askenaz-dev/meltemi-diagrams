/** Reads a time such as `1200ms`, `1.5s` or `800` (milliseconds); `null` when it is not one. */
export function parseTime(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s)?\s*$/.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  return m[2] === "s" ? Math.round(value * 1000 * 1000) / 1000 : value;
}
