import { STICKY_COLOURS, type StickyColourName } from "@meltemi/diagrams-editor/canvas";
import { messages } from "./messages/index.js";

/**
 * The colour of the sticky notes the sticky note button and S add: one of the six colours of paper
 * (`STICKY_COLOURS`, as its `#rrggbb`), written as `style <id> { fill "#…" }`, or null for the
 * theme's `sticky`, which writes nothing.
 */
export type StickyFill = string | null;

/** The colour the theme's `sticky` stands for when the render carries no swatches. */
export const THEME_STICKY = "#fff59d";

/** The colour of paper a value is, compared without case (`#F8BBD0` is pink), if it is one. */
export function stickyColour(
  value: string,
): { readonly name: StickyColourName; readonly hex: string } | undefined {
  const hex = value.toLowerCase();
  return STICKY_COLOURS.find((colour) => colour.hex === hex);
}

/**
 * The name of a colour of paper in the interface language ("Pink", "Rosa"), or undefined for any
 * other value: a token or a colour of one's own keeps its own name.
 */
export function stickyColourName(value: string): string | undefined {
  const colour = stickyColour(value);
  return colour ? messages().sticky.colours[colour.name] : undefined;
}

/**
 * The colour kept with the canvas's state (`PersistedState.sticky`), or the theme's (null) when it
 * is absent or not one of the six (a state written by another version, or by hand).
 */
export function readStickyFill(kept: unknown): StickyFill {
  const fill =
    typeof kept === "object" && kept !== null ? (kept as { fill?: unknown }).fill : undefined;
  return typeof fill === "string" ? (stickyColour(fill)?.hex ?? null) : null;
}
