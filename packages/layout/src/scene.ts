import type { Point } from "@meltemi/diagrams-model";

export type FontRole = "body" | "mono";
export type SceneRole =
  "element" | "relation" | "label" | "frame" | "icon" | "lifeline" | "event" | "motion" | "tag";
export type TextAnchor = "start" | "middle" | "end";

/** How a stroke is drawn: solid (`false`), dashed (`true`) or with round dots. */
export type StrokeDash = boolean | "dotted";

/** The stroke of a `line` style value: `dashed`, `dotted` or solid. */
export function strokeDash(line: string | undefined): StrokeDash {
  return line === "dashed" ? true : line === "dotted" ? "dotted" : false;
}

/** Fields every primitive may carry for the animated SVG profile. */
interface Classed {
  /** CSS classes written as the element's `class`, styled by `Scene.styleSheet`. */
  readonly className?: string;
}

export interface RectItem extends Classed {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly dashed: StrokeDash;
  /** An explicit dash pattern and offset, used by motion frames; overrides `dashed`. */
  readonly dash?: { readonly array: readonly number[]; readonly offset: number };
  readonly opacity?: number;
}

/** `fill` and `stroke` may reference a scene gradient or pattern as `url(#id)`. */
export interface PathItem extends Classed {
  readonly kind: "path";
  readonly d: string;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly dashed: StrokeDash;
  /** Round caps and joins, used by the brand mark and icons. */
  readonly rounded?: boolean;
  /** An SVG transform of the path, used inside icons. */
  readonly transform?: string;
  readonly opacity?: number;
  readonly fillOpacity?: number;
  readonly strokeOpacity?: number;
  readonly fillRule?: "nonzero" | "evenodd";
  /** An explicit dash pattern and offset, used by motion frames; overrides `dashed`. */
  readonly dash?: { readonly array: readonly number[]; readonly offset: number };
}

export interface PolylineItem extends Classed {
  readonly kind: "polyline";
  readonly points: readonly Point[];
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly dashed: StrokeDash;
  /** An explicit dash pattern and offset, used by motion frames; overrides `dashed`. */
  readonly dash?: { readonly array: readonly number[]; readonly offset: number };
  readonly opacity?: number;
}

/**
 * `x`/`y` is the anchor point at the vertical centre of the text; `baseline` is where renderers
 * place the glyphs, computed from the measured font's cap height.
 */
export interface TextItem {
  readonly kind: "text";
  readonly x: number;
  readonly y: number;
  readonly baseline: number;
  readonly text: string;
  readonly size: number;
  readonly weight: number;
  readonly font: FontRole;
  /**
   * The stack a style writes for this text (`font "Roboto"`): it is measured with it alone and
   * drawn with it before the scene's stack of `font`. Absent for text in the theme's fonts.
   */
  readonly stack?: string;
  readonly anchor: TextAnchor;
  readonly fill: string;
}

/** The box of an element or event as drawn, for motion effects. */
export interface SceneBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  /**
   * Elements drawn with a shape other than a box: the inscribed rectangle their text lies in, for
   * the label audit. Halos and marks keep the box.
   */
  readonly inner?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /**
   * Elements whose label lies outside their box (`shape icon`): the box the label covers. The
   * label audit holds the label to it; the element's box stays the icon's.
   */
  readonly label?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/**
 * A rounded rectangle that texts are clipped to, in the coordinates of the group that carries it.
 * Its `id` is unique in the scene and the same for every layout of the same source.
 */
export interface SceneClip {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

/** Wraps the primitives of one element, relation, label or frame and carries its identity. */
export interface GroupItem extends Classed {
  readonly kind: "group";
  readonly id: string;
  readonly role: SceneRole;
  readonly items: readonly SceneItem[];
  /** An SVG transform applied to the children, used to place the 256-unit brand mark. */
  readonly transform?: string;
  /** Relations: the drawn line, Bézier samples included, without the arrowhead. */
  readonly track?: readonly Point[];
  /** Elements and events: the box as drawn. */
  readonly bounds?: SceneBounds;
  /**
   * Tags of sequence messages and participants (role `tag`): the index of the pill among its
   * owner's tags, in source order. The group's id is its owner's id or key, and it is drawn inside
   * the owner's group, so whatever shows, hides or highlights the owner takes its tags with it.
   */
  readonly tag?: number;
  /** Stories: how visible the group is, from 0 to 1. */
  readonly opacity?: number;
  /**
   * Free diagrams: the `opacity` the element's, group's, line's or pen's style gives it, below 1.
   * Kept apart from `opacity`, which stories set per frame: renderers draw the group at the
   * product of the two.
   */
  readonly styleOpacity?: number;
  /**
   * Pen strokes: the group draws a freehand stroke, already drawn by hand. Sketch passes leave it
   * as it is, and the label audit takes no part of it.
   */
  readonly freehand?: boolean;
  /**
   * Stickies whose text does not fit their card: the card the group's own text items are clipped
   * to. Renderers write it once (SVG: a `<clipPath>` with its `id`) and clip those texts with it;
   * the card, its shadow and its icon are drawn whole.
   */
  readonly textClip?: SceneClip;
  /** Elements and relations: their layer, when it is not `main`. */
  readonly layer?: string;
  /** Elements with a `url`: the drawing links there. */
  readonly href?: string;
}

/**
 * An embedded image filling its box with its ratio kept (`xMidYMid meet`). `href` is a `data:` URI,
 * so the scene stays portable; `title` is the alternative text.
 */
export interface ImageItem {
  readonly kind: "image";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly href: string;
  readonly title: string | null;
}

export type SceneItem = RectItem | PathItem | PolylineItem | TextItem | ImageItem | GroupItem;

export interface GradientStop {
  readonly offset: number;
  readonly color: string;
  /** Stop opacity; 1 when absent. */
  readonly opacity?: number;
}

/** Units, transform and spread shared by gradients; SVG defaults apply when absent. */
interface GradientBase {
  readonly id: string;
  readonly units?: "userSpaceOnUse" | "objectBoundingBox";
  readonly transform?: string;
  readonly spread?: "pad" | "reflect" | "repeat";
  readonly stops: readonly GradientStop[];
}

/**
 * A linear gradient. Coordinates are numbers, or numbers and percentages as written in an icon,
 * in the units of the gradient (the brand mark uses user space).
 */
export interface LinearGradient extends GradientBase {
  readonly kind: "linear";
  readonly x1: number | string;
  readonly y1: number | string;
  readonly x2: number | string;
  readonly y2: number | string;
}

/** A radial gradient, from icons. Absent coordinates take their SVG defaults. */
export interface RadialGradient extends GradientBase {
  readonly kind: "radial";
  readonly cx?: number | string;
  readonly cy?: number | string;
  readonly r?: number | string;
  readonly fx?: number | string;
  readonly fy?: number | string;
}

export type SceneGradient = LinearGradient | RadialGradient;

/**
 * A tiling pattern in user-space units, drawn in `color` at 35 % opacity. Overlay shapes reference
 * it as `url(#id)` so meaning does not depend on colour alone.
 */
export interface ScenePattern {
  readonly id: string;
  readonly kind: "hatch" | "dots" | "cross";
  readonly color: string;
  /** Size of one tile in pixels. */
  readonly size: number;
}

/**
 * A resolved, z-ordered vector scene in pixel units with the origin at the top-left corner.
 * Renderers (SVG today; PNG and the editor canvas later) consume it without touching the model.
 */
export interface Scene {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly fonts: { readonly body: string; readonly mono: string };
  readonly gradients: readonly SceneGradient[];
  readonly patterns: readonly ScenePattern[];
  readonly items: readonly SceneItem[];
  /**
   * The theme's sketch level when it paints strokes by hand: the renderer draws each stroke of the
   * diagram's groups in two jittered passes. The items stay the clean geometry; absent for `none`.
   */
  readonly sketch?: "light" | "rough";
  /** CSS of the animated profile, written in one `<style>` element; absent for static scenes. */
  readonly styleSheet?: string;
  /** A URL the whole picture links to, such as a story's player. */
  readonly link?: string;
  /** Stories: the part of the scene the camera frames; the whole scene when absent. */
  readonly viewBox?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
