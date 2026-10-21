/** The most bytes a thumbnail may take; the build refuses a larger one. */
export const THUMBNAIL_LIMIT: number;

/** The dark counterpart of a theme: `x.light` gives `x.dark`, and a dark or custom theme itself. */
export function darkCounterpart(theme: string): string;

/**
 * The light and dark thumbnails of a template whose files are given by project path: its first
 * diagram as static SVG without embedded fonts. Throws when the template has no diagram that draws,
 * or when a picture is larger than `THUMBNAIL_LIMIT`.
 */
export function templateThumbnails(
  name: string,
  files: Readonly<Record<string, string>>,
  toolVersion: string,
): { readonly light: string; readonly dark: string };
