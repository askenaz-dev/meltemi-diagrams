import type { GroupItem, LinearGradient } from "./scene.js";

/**
 * The Meltemi V2 mark: a continuous-line lowercase m whose two arches read as sails, over a
 * minimal hull, with the right end rising as prow and gust. Geometry in a 256-unit square, taken
 * from the Meltemi identity assets; the mark belongs to the Meltemi project and is drawn as is.
 */
export const MELTEMI_MARK = {
  size: 256,
  sails:
    "M43 178C43 125 57 100 78 100C99 100 109 127 109 176C109 105 132 67 158 67C185 67 199 97 196 132C194 154 185 169 172 177C189 176 205 166 217 152C224 144 230 133 234 122",
  sailsWidth: 25,
  hull: "M45 199C87 211 145 215 202 189C195 204 177 216 151 220C106 226 67 215 45 199Z",
  gradient: { x1: 38, y1: 222, x2: 219, y2: 54 },
} as const;

export const MARK_GRADIENT_ID = "meltemi-wind";

/** The gradient of the mark, from `accent` at the lower left to `accentEnd` at the upper right. */
export function markGradient(accent: string, accentEnd: string): LinearGradient {
  return {
    kind: "linear",
    id: MARK_GRADIENT_ID,
    units: "userSpaceOnUse",
    ...MELTEMI_MARK.gradient,
    stops: [
      { offset: 0, color: accent },
      { offset: 1, color: accentEnd },
    ],
  };
}

/** The mark placed with its top-left corner at (x, y) and the given side length. */
export function markGroup(x: number, y: number, size: number): GroupItem {
  const scale = Math.round((size / MELTEMI_MARK.size) * 10000) / 10000;
  const paint = `url(#${MARK_GRADIENT_ID})`;
  return {
    kind: "group",
    id: "mark",
    role: "frame",
    transform: `translate(${round(x)} ${round(y)}) scale(${scale})`,
    items: [
      {
        kind: "path",
        d: MELTEMI_MARK.sails,
        fill: "none",
        stroke: paint,
        strokeWidth: MELTEMI_MARK.sailsWidth,
        dashed: false,
        rounded: true,
      },
      {
        kind: "path",
        d: MELTEMI_MARK.hull,
        fill: paint,
        stroke: "none",
        strokeWidth: 0,
        dashed: false,
      },
    ],
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
