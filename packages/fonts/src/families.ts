/** The groups of bundled families, in the order pickers and listings show them. */
export const FONT_GROUPS = ["sans", "serif", "mono", "hand"] as const;
export type FontGroup = (typeof FONT_GROUPS)[number];

/** A family with a static Fontsource package, its script subsets and the given weights. */
function fontsource(
  family: string,
  name: string,
  group: FontGroup,
  weights: readonly number[],
): BundledFamily {
  return {
    family,
    group,
    license: "OFL-1.1",
    subsets: { package: `@fontsource/${name}`, prefix: name },
    complete: null,
    weights,
  };
}

const FOUR_WEIGHTS = [400, 500, 600, 700] as const;

/**
 * A bundled font family. Text is measured and outlined with the complete font files when the
 * family has them (every glyph, kerning across scripts). It is embedded with the small Fontsource
 * script subsets, so exported files stay light.
 */
export interface BundledFamily {
  readonly family: string;
  /** The kind of face, for pickers and listings: `sans`, `serif`, `mono` or `hand`. */
  readonly group: FontGroup;
  /** The licence the font package records (SPDX), such as `OFL-1.1`. */
  readonly license: string;
  /** Fontsource package with script subsets (`files/<prefix>-<subset>-<weight>-normal.woff2`). */
  readonly subsets: { readonly package: string; readonly prefix: string };
  /** Complete font files by weight, as package-relative paths. */
  readonly complete: Readonly<Record<number, string>> | null;
  readonly weights: readonly number[];
}

export const BUNDLED_FAMILIES: readonly BundledFamily[] = [
  {
    family: "Inter",
    group: "sans",
    license: "OFL-1.1",
    subsets: { package: "@fontsource/inter", prefix: "inter" },
    complete: {
      400: "inter-ui/web/Inter-Regular.woff2",
      500: "inter-ui/web/Inter-Medium.woff2",
      600: "inter-ui/web/Inter-SemiBold.woff2",
      700: "inter-ui/web/Inter-Bold.woff2",
    },
    weights: [400, 500, 600, 700],
  },
  {
    family: "IBM Plex Sans",
    group: "sans",
    license: "OFL-1.1",
    subsets: { package: "@fontsource/ibm-plex-sans", prefix: "ibm-plex-sans" },
    complete: {
      400: "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2",
      500: "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2",
      600: "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2",
      700: "@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Bold.woff2",
    },
    weights: [400, 500, 600, 700],
  },
  {
    family: "Cascadia Mono",
    group: "mono",
    license: "OFL-1.1",
    subsets: { package: "@fontsource/cascadia-mono", prefix: "cascadia-mono" },
    complete: null,
    weights: [400, 500, 600, 700],
  },
  {
    // The hand of the sketch themes: one weight, so every weight is measured and embedded with 400.
    family: "Patrick Hand",
    group: "hand",
    license: "OFL-1.1",
    subsets: { package: "@fontsource/patrick-hand", prefix: "patrick-hand" },
    complete: null,
    weights: [400],
  },
  // Popular families (decision 0067): static Fontsource packages, measured, embedded and outlined
  // from their script subsets. Lato and Comic Neue publish 400 and 700 only.
  fontsource("Roboto", "roboto", "sans", FOUR_WEIGHTS),
  fontsource("Open Sans", "open-sans", "sans", FOUR_WEIGHTS),
  fontsource("Lato", "lato", "sans", [400, 700]),
  fontsource("Montserrat", "montserrat", "sans", FOUR_WEIGHTS),
  fontsource("Poppins", "poppins", "sans", FOUR_WEIGHTS),
  fontsource("Nunito", "nunito", "sans", FOUR_WEIGHTS),
  fontsource("Merriweather", "merriweather", "serif", FOUR_WEIGHTS),
  fontsource("Lora", "lora", "serif", FOUR_WEIGHTS),
  fontsource("Playfair Display", "playfair-display", "serif", FOUR_WEIGHTS),
  // Monospace families without contextual ligatures, so a measured width is the drawn width.
  fontsource("Roboto Mono", "roboto-mono", "mono", FOUR_WEIGHTS),
  fontsource("Source Code Pro", "source-code-pro", "mono", FOUR_WEIGHTS),
  fontsource("Caveat", "caveat", "hand", FOUR_WEIGHTS),
  fontsource("Comic Neue", "comic-neue", "hand", [400, 700]),
];

/** Families tried, in order, for characters the requested family does not have. */
export const FALLBACK_FAMILIES = ["Inter", "IBM Plex Sans"] as const;

/** Packages whose files a font reader must provide. */
export const FONT_PACKAGES = [
  "@fontsource/inter",
  "@fontsource/ibm-plex-sans",
  "@fontsource/cascadia-mono",
  "@fontsource/patrick-hand",
  "@fontsource/roboto",
  "@fontsource/open-sans",
  "@fontsource/lato",
  "@fontsource/montserrat",
  "@fontsource/poppins",
  "@fontsource/nunito",
  "@fontsource/merriweather",
  "@fontsource/lora",
  "@fontsource/playfair-display",
  "@fontsource/roboto-mono",
  "@fontsource/source-code-pro",
  "@fontsource/caveat",
  "@fontsource/comic-neue",
  "inter-ui",
  "@ibm/plex-sans",
] as const;

/** The first family of a CSS font stack that is bundled, matched without quotes or case. */
export function resolveFontStack(stack: string): string | undefined {
  for (const part of stack.split(",")) {
    const name = part
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase();
    const family = BUNDLED_FAMILIES.find((f) => f.family.toLowerCase() === name);
    if (family) return family.family;
  }
  return undefined;
}

export function bundledFamily(family: string): BundledFamily | undefined {
  return BUNDLED_FAMILIES.find((f) => f.family === family);
}

/** The bundled weight closest to `weight`; ties go to the heavier one. */
export function nearestWeight(family: BundledFamily, weight: number): number {
  let best = family.weights[0]!;
  for (const candidate of family.weights) {
    const distance = Math.abs(candidate - weight);
    const bestDistance = Math.abs(best - weight);
    if (distance < bestDistance || (distance === bestDistance && candidate > best))
      best = candidate;
  }
  return best;
}

/** Parses a CSS `unicode-range` value such as `U+0000-00FF,U+0131` into inclusive ranges. */
export function parseUnicodeRange(value: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const part of value.split(",")) {
    const match = /^\s*U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?\s*$/.exec(part);
    if (!match) continue;
    if (match[1]!.includes("?")) {
      ranges.push([
        parseInt(match[1]!.replace(/\?/g, "0"), 16),
        parseInt(match[1]!.replace(/\?/g, "F"), 16),
      ]);
    } else {
      const start = parseInt(match[1]!, 16);
      ranges.push([start, match[2] ? parseInt(match[2], 16) : start]);
    }
  }
  return ranges;
}

/** Formats code points as a compact CSS `unicode-range` (`U+41-43,U+61`). */
export function formatUnicodeRange(codePoints: Iterable<number>): string {
  const sorted = [...new Set(codePoints)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    const hex = (n: number) => n.toString(16).toUpperCase();
    parts.push(i === j ? `U+${hex(sorted[i]!)}` : `U+${hex(sorted[i]!)}-${hex(sorted[j]!)}`);
    i = j + 1;
  }
  return parts.join(",");
}
