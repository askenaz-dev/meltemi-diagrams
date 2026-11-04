import type { Point } from "@meltemi/diagrams-editor/canvas";

/*
 * The trail the Pointer tool leaves (`diagram-canvas`, "Pointer tool"): the points of a stroke, kept
 * in diagram units with the moment each was made, and what to draw of them at a moment. This file
 * is the logic with no DOM; `presence-layer.ts` strokes what `trailSegments` returns on its canvas.
 */

/** How long a point lives, from its own moment: the trail fades out in this time. */
export const TRAIL_FADE_MS = 800;
/** The width of the newest segment, and of the oldest ones, in screen pixels. */
export const TRAIL_WIDTH = 3;
export const TRAIL_MIN_WIDTH = 1;
/** The most points a trail keeps: a long stroke drops its oldest. */
export const TRAIL_MAX_POINTS = 256;
/** How many of the newest points the width tapers over. */
export const TRAIL_TAPER_POINTS = 16;
/** A point closer than this, in diagram units, to the last one is not added. */
const TRAIL_MIN_STEP = 0.5;

/** A point of a trail: where, in diagram units, and when (`performance.now()`, in milliseconds). */
export interface TrailPoint {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

/** One stretch of a trail to stroke: its ends in diagram units, how opaque and how wide. */
export interface TrailSegment {
  readonly from: Point;
  readonly to: Point;
  /** 0 to 1. */
  readonly opacity: number;
  /** In screen pixels. */
  readonly width: number;
}

/** The points of one person's stroke, in the colour they are drawn in. */
export class Trail {
  private list: TrailPoint[] = [];

  constructor(public colour: string) {}

  get points(): readonly TrailPoint[] {
    return this.list;
  }

  /** Whether any point is left. */
  get alive(): boolean {
    return this.list.length > 0;
  }

  /**
   * Adds a point made at `now`. A point within half a diagram unit of the last one adds nothing;
   * past `TRAIL_MAX_POINTS` the oldest go. Returns whether the point was kept.
   */
  add(point: Point, now: number): boolean {
    const last = this.list[this.list.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < TRAIL_MIN_STEP) return false;
    this.list.push({ x: point.x, y: point.y, t: now });
    if (this.list.length > TRAIL_MAX_POINTS)
      this.list.splice(0, this.list.length - TRAIL_MAX_POINTS);
    return true;
  }

  /**
   * Drops the points that have lived `fade` milliseconds. A `fade` of 0 keeps every point whole:
   * under reduced motion the trail is the stroke drawn so far, cleared by `clear` when it ends.
   */
  prune(now: number, fade = TRAIL_FADE_MS): void {
    if (fade <= 0) return;
    let dead = 0;
    while (dead < this.list.length && now - this.list[dead]!.t >= fade) dead++;
    if (dead > 0) this.list.splice(0, dead);
  }

  clear(): void {
    this.list = [];
  }
}

/**
 * At most `max` of `items`, evenly spread over the list and always keeping the first and the last:
 * a long stroke's points shared with a room in a batch that fits.
 */
export function thin<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  if (max <= 1) return items.length > 0 ? [items[items.length - 1]!] : [];
  const kept: T[] = [];
  for (let i = 0; i < max; i++) {
    kept.push(items[Math.round((i * (items.length - 1)) / (max - 1))]!);
  }
  return kept;
}

/**
 * What to stroke of a trail at `now`, oldest first. A point lives `fade` milliseconds from its own
 * moment: a segment's opacity is `1 - age / fade` of its older point, and a segment whose older
 * point has lived `fade` is left out. A point whose moment has not come (a batch from a room
 * replays at its own pace) draws nothing yet, nor the segment that ends at it. The width tapers
 * from `TRAIL_WIDTH` at the newest segment to `TRAIL_MIN_WIDTH` `TRAIL_TAPER_POINTS` points back,
 * and stays there for the older ones. A `fade` of 0 draws every segment whole.
 */
export function trailSegments(
  points: readonly TrailPoint[],
  now: number,
  fade = TRAIL_FADE_MS,
): TrailSegment[] {
  const segments: TrailSegment[] = [];
  let shown = points.length;
  while (shown > 0 && points[shown - 1]!.t > now) shown--;
  const last = shown - 2;
  for (let i = 0; i <= last; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const opacity = fade <= 0 ? 1 : 1 - (now - from.t) / fade;
    if (opacity <= 0) continue;
    const behind = Math.min(last - i, TRAIL_TAPER_POINTS - 1);
    const width =
      TRAIL_WIDTH - ((TRAIL_WIDTH - TRAIL_MIN_WIDTH) * behind) / (TRAIL_TAPER_POINTS - 1);
    segments.push({
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      opacity: Math.min(1, opacity),
      width,
    });
  }
  return segments;
}
