// The colour of a person in a shared project (`live-collaboration`, "Awareness state"). The room
// and every page compute it from the person's `sub`, so all of them show the same colour without
// anyone sending one.

/** Twelve colours that read on a light and on a dark page, in the order they are handed out. */
export const PRESENCE_COLOURS = [
  "#e03131",
  "#f08c00",
  "#2f9e44",
  "#1c7ed6",
  "#7048e8",
  "#c2255c",
  "#0c8599",
  "#d9480f",
  "#5f3dc4",
  "#099268",
  "#364fc7",
  "#a61e4d",
] as const;

/** FNV-1a (32 bits) over the UTF-16 code units of the text: stable, tiny, no dependency. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/** The index in `PRESENCE_COLOURS` of a person. */
export function presenceColourIndex(sub: string): number {
  return hash(sub) % PRESENCE_COLOURS.length;
}

/** The colour of a person: the same wherever it is computed. */
export function presenceColour(sub: string): string {
  return PRESENCE_COLOURS[presenceColourIndex(sub)] as string;
}
