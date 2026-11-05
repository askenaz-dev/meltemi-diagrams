/**
 * What the canvas does on gantt charts that needs no page: the dates a drag gives a bar, the place a
 * row is dropped at, and the words of the tooltip that says them.
 */
import {
  SECONDS_PER_DAY,
  addWorking,
  dayNumber,
  nextWorking,
  snapFrom,
  spanOf,
  workingBetween,
  civilFromDays,
  type Box,
  type ElementInfo,
  type TimelineCalendar,
} from "@meltemi/diagrams-editor/canvas";
import type { CanvasMessages } from "./messages/index.js";

/** The start and end of a bar, as instants. */
export interface BarSpan {
  readonly start: number;
  readonly end: number;
}

/** What a drag holds of a bar: how it moves, and what it started from. */
export interface BarGrip {
  /** The body moves the bar; an end moves that end alone. */
  readonly part: "body" | "start" | "end";
  readonly kind: "task" | "milestone" | "marker";
  readonly start: number;
  readonly end: number;
  /** The earliest the start can be, when the bar follows others. */
  readonly floor: number | null;
}

/**
 * The dates a bar takes while the pointer has dragged it `shift` seconds of the timeline (raw, not
 * yet snapped), with the step the drag snaps to: a bar moved keeps its length in working time and
 * its phase (a bar that starts at 09:30 still does), starts on working time, and never before the
 * end of what it follows; the right end moves alone, never to less than a step after the start; the
 * left end moves with the end where it is. `stuck` says the start is held at `floor`.
 */
export function dragSpan(
  calendar: TimelineCalendar,
  step: number,
  grip: BarGrip,
  shift: number,
): BarSpan & { readonly stuck: boolean } {
  const { start, end, floor } = grip;
  const landed = (time: number): number =>
    grip.kind === "marker" ? time : nextWorking(time, calendar);
  const held = (time: number): { start: number; stuck: boolean } =>
    floor !== null && time <= floor ? { start: floor, stuck: true } : { start: time, stuck: false };
  if (grip.part === "end" && grip.kind === "task") {
    const wanted = snapFrom(start, end + shift, step);
    return { start, end: Math.max(wanted, start + step), stuck: false };
  }
  if (grip.part === "start" && grip.kind === "task") {
    const wanted = end - Math.round((end - (start + shift)) / step) * step;
    const place = held(landed(Math.min(wanted, end - step)));
    return { start: Math.min(place.start, end - step), end, stuck: place.stuck };
  }
  const moved = held(landed(snapFrom(start, start + shift, step)));
  const length = workingBetween(start, end, calendar);
  const finish =
    grip.kind === "task" ? addWorking(moved.start, Math.max(length, 1), calendar) : moved.start;
  return { start: moved.start, end: finish, stuck: moved.stuck };
}

/** `09:30`. */
const clock = (time: number): string => {
  const seconds = ((time % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - hours * 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/** The working time of a span in the words of the interface: days, or hours under a day. */
function workingText(words: CanvasMessages["gantt"], seconds: number): string {
  if (seconds % SECONDS_PER_DAY === 0) return words.workingDays(seconds / SECONDS_PER_DAY);
  const hours = Math.round((seconds / 3600) * 10) / 10;
  return words.workingHours(String(hours));
}

/**
 * What the tooltip of a bar says: its first and its last day (the end is the end of the last day),
 * with the times when it has any, and its working time: `1 Jun → 9 Jun · 7 working days`. A diamond
 * or a line says its day alone.
 */
export function spanText(
  words: CanvasMessages["gantt"],
  calendar: TimelineCalendar,
  grip: { readonly kind: "task" | "milestone" | "marker" },
  span: BarSpan,
): string {
  const day = (time: number, time24: boolean): string => {
    const { day: d, month } = civilFromDays(dayNumber(time));
    return words.day(d, words.months[month - 1] ?? "", time24 ? clock(time) : null);
  };
  const timed = span.start % SECONDS_PER_DAY !== 0 || span.end % SECONDS_PER_DAY !== 0;
  if (grip.kind !== "task") return day(span.start, span.start % SECONDS_PER_DAY !== 0);
  const info = spanOf(span.start, span.end, calendar);
  const first = day(span.start, timed);
  const last = timed ? day(span.end, true) : day(info.lastDay * SECONDS_PER_DAY, false);
  return words.span(first, last, workingText(words, info.working));
}

// ------------------------------------------------------------------------------------- rows

/** Where a row dropped would go: among the statements of a section, or of the top of the chart. */
export interface RowDrop {
  readonly parent: string | null;
  /** The statement it goes before, counted among those of the block; the count to go last. */
  readonly index: number;
  /** The height, in diagram units, where the insertion bar shows. */
  readonly y: number;
  /** Where the bar starts and ends across the chart. */
  readonly from: number;
  readonly to: number;
}

const ITEMS: ReadonlySet<string> = new Set(["section", "task", "milestone", "marker"]);

/** One place a row can be dropped: the gap, the block and the position among its statements. */
interface Gap {
  readonly parent: string | null;
  readonly index: number;
  readonly y: number;
}

/**
 * The place a row (or, when `sections` is true, a section) dropped with the pointer at height `y`
 * goes: the gap between rows nearest to it, among the gaps of every section and of the rows before
 * the first section; undefined when the pointer is not over the rows (over the axis, above the
 * chart), where a drop writes nothing. `across` is the horizontal extent of the insertion bar.
 */
export function rowDrop(
  elements: readonly ElementInfo[],
  y: number,
  sections: boolean,
  across: { readonly from: number; readonly to: number },
): RowDrop | undefined {
  const items = (block: string | null) =>
    elements.filter((element) => ITEMS.has(element.kind) && element.parent === block);
  const gaps: Gap[] = [];
  if (sections) {
    const top = items(null);
    const named = elements.filter((element) => element.kind === "section");
    for (const section of named) {
      gaps.push({
        parent: null,
        index: top.findIndex((e) => e.id === section.id),
        y: section.box.y,
      });
    }
    const last = named[named.length - 1];
    if (last) {
      gaps.push({ parent: null, index: top.length, y: last.box.y + last.box.height });
    }
  } else {
    const blocks: { id: string | null; box?: Box }[] = [
      { id: null },
      ...elements.filter((e) => e.kind === "section").map((e) => ({ id: e.id, box: e.box })),
    ];
    for (const block of blocks) {
      const own = items(block.id);
      // The rows of the block in the order they are drawn: those that share a row go together.
      const rows = new Map<number, { index: number; row: { y: number; height: number } }>();
      own.forEach((element, index) => {
        const row = element.task?.row;
        if (!row) return;
        const found = rows.get(row.y);
        if (!found) rows.set(row.y, { index, row });
      });
      const ordered = [...rows.values()].sort((a, b) => a.row.y - b.row.y);
      if (ordered.length === 0) {
        if (block.box) {
          gaps.push({
            parent: block.id,
            index: own.length,
            y: block.box.y + block.box.height / 2,
          });
        }
        continue;
      }
      for (const { index, row } of ordered) gaps.push({ parent: block.id, index, y: row.y });
      const last = ordered[ordered.length - 1]!;
      gaps.push({ parent: block.id, index: own.length, y: last.row.y + last.row.height });
    }
  }
  if (gaps.length === 0) return undefined;
  const top = Math.min(...gaps.map((gap) => gap.y));
  const bottom = Math.max(...gaps.map((gap) => gap.y));
  if (y < top - ROW_REACH || y > bottom + ROW_REACH) return undefined;
  let best = gaps[0]!;
  for (const gap of gaps) if (Math.abs(gap.y - y) < Math.abs(best.y - y)) best = gap;
  return { ...best, ...across };
}

/** How far above the first gap or below the last the pointer still drops a row, in units. */
const ROW_REACH = 6;

/**
 * Whether dropping `ids` at `drop` leaves every one of them where it is: a single row dropped in
 * the gap right before or after itself, in its own block.
 */
export function dropsInPlace(
  elements: readonly ElementInfo[],
  ids: readonly string[],
  drop: RowDrop,
): boolean {
  if (ids.length !== 1) return false;
  const element = elements.find((e) => e.id === ids[0]);
  if (!element || element.parent !== drop.parent) return false;
  const own = elements
    .filter((e) => ITEMS.has(e.kind) && e.parent === drop.parent)
    .findIndex((e) => e.id === element.id);
  return drop.index === own || drop.index === own + 1;
}
