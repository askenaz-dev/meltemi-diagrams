import type { Point } from "@meltemi/diagrams-editor/canvas";
import { pointToSegment } from "./pen.js";
import type { PeerPen, StrokeLook } from "./presence.js";
import type { TrailPoint } from "./trail.js";

/*
 * Other people's strokes as they draw them (`diagram-canvas`, "Strokes of others"): the points of
 * the laser batches that carry a `pen` part, kept whole in the pen's width, colour and opacity, each
 * showing at its own moment as a trail's points do, and never fading. The batches of one stroke
 * carry its number, so a stroke is never joined to the person's stroke before. A stroke stays until
 * the drawing holds the pen its release wrote, or until a render comes after its last batch, or its
 * cancel batch comes (Escape), or ten seconds pass. This file is the logic with no DOM;
 * `presence-layer.ts` strokes what `drawn` gives.
 */

/** How long a stroke is kept after its last batch at most: a stroke cancelled writes no pen. */
export const STROKE_HOLD_MS = 10_000;
/**
 * A stroke whose last batch came within this time of a render is still being drawn (batches come
 * four times a second): a render that does not hold it, somebody else's edit, leaves it whole.
 */
export const STROKE_ACTIVE_MS = 600;
/**
 * The pens a render brings are a stroke's own when they come at most this long before the stroke
 * began: the room may carry the last batch of a stroke after the drawing that holds its pen.
 */
export const STROKE_TAIL_MS = 2000;
/** The most a stroke's points trail behind their batches' arrival, in milliseconds. */
export const STROKE_LAG_MS = 300;
/** The most points one stroke keeps, and strokes one person: a host cannot flood the page. */
export const MAX_STROKE_POINTS = 4096;
export const MAX_PERSON_STROKES = 16;
/** The most numbers of strokes that went one person's batches are remembered by, oldest let go. */
const MAX_DONE_STROKES = 256;
/** How near a written pen a point lies to be part of it, beyond half the widths, in diagram units. */
export const WRITTEN_REACH = 6;
/** A point closer than this, in diagram units, to the last one is not added. */
const MIN_STEP = 0.5;

/** One stroke of a person: its number, how it looks, its points with the moment each shows. */
interface PeerStroke {
  /** The person's number for it: every batch of the stroke carries it. */
  readonly stroke: number;
  readonly look: StrokeLook;
  readonly points: TrailPoint[];
  /** When its first batch came. */
  readonly since: number;
  /** When its last batch came. */
  last: number;
  /**
   * The pen a render brought that starts where the stroke starts, when the render came before the
   * stroke's end did (a stroke straightened with Shift reaches the others whole at its release): the
   * batch that ends on it ends the stroke, and so does the person's next stroke.
   */
  written?: WrittenPen;
}

/** A person's strokes, and the numbers of the strokes that went, to draw nothing of them again. */
interface PeerPerson {
  strokes: PeerStroke[];
  /** Stroke number to when it went (its pen came, or its cancel). */
  readonly done: Map<number, number>;
}

/** A pen a render brought that the one before did not hold: a stroke just written. */
interface WrittenPen {
  readonly points: readonly Point[];
  readonly width: number;
  /** When the render that brought it came. */
  readonly at: number;
  /** Its points' box, grown by the reach of any stroke over it. */
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A pen of a render, as the canvas knows it: its id, its drawn points and its width. */
export interface RenderedPen {
  readonly id: string;
  readonly points: readonly Point[];
  readonly width: number;
}

/** A stroke to draw: the points shown so far in diagram units, and how it looks. */
export interface ShownStroke {
  readonly points: readonly Point[];
  readonly look: StrokeLook;
}

/** How near a point lies to a written pen to be part of it, for a stroke of `width` over it. */
const reachOf = (pen: WrittenPen, width: number): number =>
  WRITTEN_REACH + Math.max(width, pen.width) / 2;

/** Whether `point` lies on `pen`'s line, within the reach of a stroke of `width` over it. */
function onPen(point: Point, pen: WrittenPen, width: number): boolean {
  const reach = reachOf(pen, width);
  if (
    point.x < pen.left - reach ||
    point.x > pen.right + reach ||
    point.y < pen.top - reach ||
    point.y > pen.bottom + reach
  ) {
    return false;
  }
  const points = pen.points;
  if (points.length === 1) {
    const only = points[0]!;
    return Math.hypot(point.x - only.x, point.y - only.y) <= reach;
  }
  for (let i = 1; i < points.length; i++) {
    if (pointToSegment(point, points[i - 1]!, points[i]!) <= reach) return true;
  }
  return false;
}

/**
 * Whether `pen` is the stroke's own: it starts where the stroke starts (the release keeps the
 * press, simplified or straightened), whatever lies between.
 */
function startsAt(pen: WrittenPen, stroke: PeerStroke): boolean {
  const first = stroke.points[0];
  const start = pen.points[0];
  if (!first || !start) return false;
  return Math.hypot(first.x - start.x, first.y - start.y) <= reachOf(pen, stroke.look.width);
}

/**
 * Every person's strokes, by the key of the person. A batch with the number of one of the
 * person's strokes grows it; one with a new number starts the next stroke, never joined to the one
 * before. A point shows `t` milliseconds after its batch came, and never before the points ahead
 * of it, so the stroke grows at the hand's pace.
 */
export class PeerStrokes {
  private readonly people = new Map<string, PeerPerson>();
  /** The pens of the renders of the last `STROKE_HOLD_MS`, which strokes are written as. */
  private written: WrittenPen[] = [];
  /** The ids of the pens of the last render, so the next one tells which pens are new. */
  private known: Set<string> | undefined;

  /** How many strokes are kept. */
  get size(): number {
    let count = 0;
    for (const person of this.people.values()) count += person.strokes.length;
    return count;
  }

  /**
   * Takes a batch of `key`'s stroke `pen.stroke` that came at `now`, its `t`s from its first point.
   * A batch of a stroke that went (its pen came, or it was cancelled) draws nothing; a cancel batch
   * drops its stroke at once. Under reduced motion every point shows at once. Returns whether what
   * is drawn changed: points to draw, or a stroke gone.
   */
  add(
    key: string,
    pen: PeerPen,
    batch: readonly TrailPoint[],
    now: number,
    reduced = false,
  ): boolean {
    let person = this.people.get(key);
    if (!person) {
      person = { strokes: [], done: new Map() };
      this.people.set(key, person);
    }
    for (const [number, at] of person.done) {
      if (now - at > STROKE_HOLD_MS + STROKE_TAIL_MS || person.done.size > MAX_DONE_STROKES) {
        person.done.delete(number);
      }
    }
    // The end of a stroke the drawing already holds, or one cancelled: nothing of it again.
    if (person.done.has(pen.stroke)) return this.settle(key, person, false);
    const index = person.strokes.findIndex((stroke) => stroke.stroke === pen.stroke);
    if (pen.cancel) {
      person.done.set(pen.stroke, now);
      if (index < 0) return this.settle(key, person, false);
      person.strokes.splice(index, 1);
      return this.settle(key, person, true);
    }
    let stroke = person.strokes[index];
    let gone = false;
    if (!stroke) {
      if (batch.length === 0) return this.settle(key, person, false);
      // A stroke whose pen came is over once the next one starts, though its end never came.
      const before = person.strokes.length;
      person.strokes = person.strokes.filter((old) => {
        if (!old.written) return true;
        person.done.set(old.stroke, now);
        return false;
      });
      gone = person.strokes.length < before;
      stroke = { stroke: pen.stroke, look: pen.look, points: [], since: now, last: now };
      person.strokes.push(stroke);
      if (person.strokes.length > MAX_PERSON_STROKES) {
        person.strokes.splice(0, person.strokes.length - MAX_PERSON_STROKES);
      }
    }
    stroke.last = now;
    const list = stroke.points;
    const tail = list[list.length - 1];
    const first = batch[0]?.t ?? 0;
    // A batch that came before the last one finished showing waits for it, though not for long.
    const base = reduced
      ? now
      : Math.min(now + STROKE_LAG_MS, Math.max(now, (tail?.t ?? now) - first));
    for (const point of batch) {
      const last = list[list.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_STEP) continue;
      // In order: a point never shows before the one ahead of it.
      const at = reduced ? now : base + point.t - first;
      list.push({ x: point.x, y: point.y, t: Math.max(last?.t ?? at, at) });
    }
    if (list.length > MAX_STROKE_POINTS) list.splice(0, list.length - MAX_STROKE_POINTS);
    // Its pen came before its end: the batch that reaches the pen's end ends it.
    const end = list[list.length - 1];
    if (stroke.written && end && onPen(end, stroke.written, stroke.look.width)) {
      person.done.set(stroke.stroke, now);
      person.strokes = person.strokes.filter((kept) => kept !== stroke);
      return this.settle(key, person, true);
    }
    return this.settle(key, person, gone || list.length > 0);
  }

  /** Forgets a person who has no stroke and no stroke that went to remember; returns `changed`. */
  private settle(key: string, person: PeerPerson, changed: boolean): boolean {
    if (person.strokes.length === 0 && person.done.size === 0) this.people.delete(key);
    return changed;
  }

  /**
   * A render came at `now` with these pens. The ones the render before did not hold are strokes
   * just written. A stroke goes when its last batch came `STROKE_ACTIVE_MS` or more before the
   * render (the render came after it), when every point of it lies on pens written since just
   * before it began, or when such a pen starts where it starts and holds its last point (its own
   * pen arrived, straightened with Shift or not). A pen of its own that does not reach its last
   * point yet came before its end: the stroke keeps it, and goes with the batch that reaches it.
   * A stroke still being drawn stays through somebody else's edit. Returns whether a stroke went.
   */
  rendered(pens: readonly RenderedPen[], now: number): boolean {
    const known = this.known;
    this.known = new Set(pens.map((pen) => pen.id));
    this.written = this.written.filter((pen) => now - pen.at <= STROKE_HOLD_MS + STROKE_TAIL_MS);
    if (known) {
      for (const pen of pens) {
        if (known.has(pen.id) || pen.points.length === 0) continue;
        const xs = pen.points.map((p) => p.x);
        const ys = pen.points.map((p) => p.y);
        this.written.push({
          points: pen.points,
          width: pen.width,
          at: now,
          left: Math.min(...xs),
          top: Math.min(...ys),
          right: Math.max(...xs),
          bottom: Math.max(...ys),
        });
      }
    }
    let gone = false;
    for (const [key, person] of this.people) {
      const kept = person.strokes.filter((stroke) => {
        if (this.holds(stroke, now)) {
          person.done.set(stroke.stroke, now);
          return false;
        }
        return true;
      });
      if (kept.length === person.strokes.length) continue;
      gone = true;
      person.strokes = kept;
      this.settle(key, person, true);
    }
    return gone;
  }

  /** Whether a render at `now` holds `stroke`, or came after it; may keep its own pen on it. */
  private holds(stroke: PeerStroke, now: number): boolean {
    if (now - stroke.last >= STROKE_ACTIVE_MS) return true;
    const own = this.written.filter((pen) => pen.at >= stroke.since - STROKE_TAIL_MS);
    if (own.length === 0) return false;
    const width = stroke.look.width;
    if (stroke.points.every((point) => own.some((pen) => onPen(point, pen, width)))) return true;
    const end = stroke.points[stroke.points.length - 1];
    const mine = own.find((pen) => startsAt(pen, stroke));
    if (!mine || !end) return false;
    if (onPen(end, mine, width)) return true;
    stroke.written = mine;
    return false;
  }

  /** Lets go of the strokes of people not in `present`. Returns whether a stroke went. */
  keep(present: ReadonlySet<string>): boolean {
    let gone = false;
    for (const [key, person] of [...this.people]) {
      if (present.has(key)) continue;
      this.people.delete(key);
      if (person.strokes.length > 0) gone = true;
    }
    return gone;
  }

  /** Lets go of the strokes whose last batch came `STROKE_HOLD_MS` or more before `now`. */
  expire(now: number): void {
    for (const [key, person] of this.people) {
      const kept = person.strokes.filter((stroke) => now - stroke.last < STROKE_HOLD_MS);
      if (kept.length === person.strokes.length) continue;
      person.strokes = kept;
      this.settle(key, person, true);
    }
  }

  /** When the next stroke expires, if any is kept. */
  nextExpiry(): number | undefined {
    let next: number | undefined;
    for (const person of this.people.values()) {
      for (const stroke of person.strokes) {
        const at = stroke.last + STROKE_HOLD_MS;
        if (next === undefined || at < next) next = at;
      }
    }
    return next;
  }

  /** Whether a point waits for its moment: the strokes need drawing again until it shows. */
  pending(now: number): boolean {
    for (const person of this.people.values()) {
      for (const stroke of person.strokes) {
        const last = stroke.points[stroke.points.length - 1];
        if (last && last.t > now) return true;
      }
    }
    return false;
  }

  /** What to draw at `now`: of each stroke, the points whose moment has come, in order. */
  drawn(now: number): ShownStroke[] {
    const shown: ShownStroke[] = [];
    for (const person of this.people.values()) {
      for (const stroke of person.strokes) {
        let count = 0;
        while (count < stroke.points.length && stroke.points[count]!.t <= now) count++;
        if (count === 0) continue;
        shown.push({
          points: stroke.points.slice(0, count).map((p) => ({ x: p.x, y: p.y })),
          look: stroke.look,
        });
      }
    }
    return shown;
  }

  /** Lets go of every stroke; `forget` also of the pens known (another diagram). */
  clear(forget = false): void {
    this.people.clear();
    if (!forget) return;
    this.written = [];
    this.known = undefined;
  }
}
