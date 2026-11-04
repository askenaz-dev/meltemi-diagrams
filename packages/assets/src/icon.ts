import type { Bounds } from "./path.js";

/**
 * A paint: `none`, the icon colour (`currentColor`, black or unset in monochrome icons), a colour
 * as written, or a gradient of the icon.
 */
export type Paint =
  | { readonly kind: "none" }
  | { readonly kind: "current" }
  | { readonly kind: "color"; readonly value: string }
  | { readonly kind: "gradient"; readonly id: string };

/** One drawable path of an icon, in view box units. */
export interface IconPath {
  readonly d: string;
  /** `matrix(a b c d e f)` of the element and its groups, or null. */
  readonly transform: string | null;
  readonly fill: Paint;
  readonly stroke: Paint;
  readonly strokeWidth: number;
  readonly lineCap: "butt" | "round" | "square";
  readonly lineJoin: "miter" | "round" | "bevel";
  readonly fillRule: "nonzero" | "evenodd";
  readonly opacity: number;
  readonly fillOpacity: number;
  readonly strokeOpacity: number;
}

export interface GradientStop {
  readonly offset: number;
  readonly color: string;
  readonly opacity: number;
}

/** A gradient defined inside an icon; coordinates are numbers or percentages as written. */
export interface IconGradient {
  readonly id: string;
  readonly kind: "linear" | "radial";
  readonly units: "objectBoundingBox" | "userSpaceOnUse";
  readonly transform: string | null;
  readonly spread: "pad" | "reflect" | "repeat";
  /** `x1`, `y1`, `x2`, `y2` for linear gradients; `cx`, `cy`, `r`, `fx`, `fy` for radial ones. */
  readonly coordinates: Readonly<Record<string, string>>;
  readonly stops: readonly GradientStop[];
}

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface IconGeometry {
  readonly viewBox: ViewBox;
  readonly paths: readonly IconPath[];
  readonly gradients: readonly IconGradient[];
  /** True when every paint is the icon colour or none, so the icon takes the target's colour. */
  readonly monochrome: boolean;
  /** Bounding box of the drawn paths, strokes included, in view box units. */
  readonly bounds: Bounds | undefined;
}

/** Larger side of the content box over the larger side of the view box. */
export function opticalRatio(icon: IconGeometry): number | undefined {
  if (!icon.bounds) return undefined;
  const content = Math.max(
    icon.bounds.maxX - icon.bounds.minX,
    icon.bounds.maxY - icon.bounds.minY,
  );
  const box = Math.max(icon.viewBox.width, icon.viewBox.height);
  return box > 0 && content > 0 ? content / box : undefined;
}

/** The share of its box an icon's content fills in the reference pack (Tabler: 20 of 24 units). */
export const OPTICAL_TARGET = 20 / 24;

/**
 * Size, relative to the icon square, at which a pack's view boxes are drawn so that its content
 * fills the same share as the reference pack.
 */
export function drawScale(packRatio: number | undefined): number {
  if (packRatio === undefined || packRatio <= 0) return 1;
  return Math.min(1.25, Math.max(0.75, OPTICAL_TARGET / packRatio));
}

/** The median of a list of numbers, or undefined for an empty list. */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
