import { DEFAULT_LOCALE } from "@meltemi/diagrams-i18n";
import type { Diagnostic, Range } from "@meltemi/diagrams-language";
import {
  SECONDS_PER_DAY,
  dayNumber,
  isWorkingDay,
  parseDate,
  startOfDay,
  workingCalendar,
  type Compilation,
  type Element,
  type FlowDiagram,
  type Point,
} from "@meltemi/diagrams-model";
import { brandFrame, round2, textItem } from "./frame.js";
import { diamondPath, unionBoxes, type Box } from "./geometry.js";
import {
  formatGranularity,
  formatTime,
  parseTicks,
  defaultFormat,
  ticksCovering,
  tickNext,
  tickSeconds,
  TICK_LADDER,
  type TickSpec,
} from "./gantt-time.js";
import { CORNER_RADIUS, markerItems, relationEnds, roundCorners, shiftMarker } from "./markers.js";
import {
  DOCUMENT_MAX_WIDTH,
  PATTERN_SIZE,
  SLIDE_SIZE,
  canvasSize,
  frameMinWidth,
  tagPill,
  tagPillWidth,
  type ConnectorGeometry,
  type LayoutOptions,
  type LayoutResult,
  type TypeScale,
} from "./layout.js";
import type { TextMetrics } from "./measure.js";
import { markGradient } from "./mark.js";
import { drawingWords, messages } from "./messages/index.js";
import {
  strokeDash,
  type GroupItem,
  type SceneBounds,
  type SceneGradient,
  type SceneItem,
  type ScenePattern,
  type StrokeDash,
  type TextItem,
} from "./scene.js";
import { StyleResolver, type PatternKind } from "./styles.js";
import { wrapLines } from "./text.js";
import type { Theme } from "./theme.js";

export interface GanttInput {
  readonly compilation: Compilation;
  readonly diagram: FlowDiagram;
  readonly options: LayoutOptions;
  readonly theme: Theme;
  readonly scale: TypeScale;
  readonly metrics: TextMetrics;
  readonly diagnostics: Diagnostic[];
}

/** The room above and below the rows of a section, which is also the gap between two rows. */
const ROW_GAP = 8;
/** The room between a label and the edge of the bar it is drawn inside, on each side. */
const LABEL_INSIDE = 8;
/** The room between a bar and the label drawn beside it. */
const LABEL_BESIDE = 6;
/** The first leg of an arrow, right of the end it leaves. */
const STUB = 8;
/** The room between the widest tick label and the next one. */
const TICK_GAP = 12;
/** Section titles wrap at this width. */
const TITLE_WRAP = 280;
const COLUMN_MIN = 120;
/** The opacity of a section's band, so that the grid under it shows through. */
const BAND_OPACITY = 0.6;
const EXCLUDED_OPACITY = 0.6;
/** The most ticks an axis draws: a written interval that asks for more is widened. */
const MAX_TICKS = 4000;
const EMPTY_WEEKS = 4;
const MIN_BAR = 2;
const TIMELINE_MIN = 240;
const BOARD_TIMELINE = 960;
/** A day this narrow or narrower is not shaded: its column would be a hairline. */
const MIN_SHADED_DAY = 2;
/** The gap between two markers' pills in a lane. */
const PILL_GAP = 4;

type BarKind = "task" | "milestone" | "marker";

/** A task, milestone or marker that has dates: what the chart draws. */
interface Entry {
  readonly element: Element;
  readonly kind: BarKind;
  readonly start: number;
  readonly finish: number;
  readonly section: string | null;
  /** The bar's horizontal extent, or the diamond's, or the marker's line. */
  x0: number;
  x1: number;
  /** The row of the group, then the top of the row's bar once the groups are placed. */
  row: number;
  y: number;
  labelWidth: number;
}

/** Where an entry's label goes. */
type Place = "inside" | "after" | "before" | "column";

interface LabelPlan {
  readonly place: Place;
  readonly box: Box;
  readonly anchor: TextItem["anchor"];
  readonly x: number;
  /** Whether the label is drawn in the colour of text on a bar. */
  readonly onBar: boolean;
}

interface Group {
  readonly section: Element | null;
  readonly entries: Entry[];
  rows: number;
  top: number;
  height: number;
  banded: boolean;
  titleLines: readonly string[];
}

/** Lays out a gantt chart (decision 0066): a time axis, rows of bars, and no engine. */
export function layoutGantt(input: GanttInput): LayoutResult {
  const { compilation, diagram, options, theme, scale, metrics, diagnostics } = input;
  const chart = diagram.gantt!;
  const words = drawingWords(options.locale ?? DEFAULT_LOCALE).gantt;
  const styles = new StyleResolver(theme, diagram);
  const margin = theme.margin;
  const { preset, canvas: written } = diagram.properties;

  // ---------------------------------------------------------------- measures
  const barHeight = Math.round((24 * scale.relationLabel) / 11);
  const pitch = barHeight + ROW_GAP;
  const labelSize = scale.relationLabel;
  const labelHeight = scale.relationLabelHeight;
  const measure = (text: string) => metrics.width(text, "body", 500, labelSize);
  const titleLine = Math.round(scale.groupTitle * 1.3);
  const diamond = barHeight * 0.8;
  const labelsColumn = chart.labels === "column";

  const calendar = workingCalendar(
    chart.calendar.excludedWeekdays,
    chart.calendar.excludedDates,
    chart.calendar.includedDates,
  );
  const dayOf = (text: string | null | undefined): number | null => {
    if (!text) return null;
    const parsed = parseDate(text);
    return parsed.ok ? startOfDay(parsed.time) : null;
  };
  const hostToday = dayOf(options.today);
  const todayTime = chart.today ? (chart.today.date ? dayOf(chart.today.date) : hostToday) : null;

  // ---------------------------------------------------------------- what is drawn
  const dated: Entry[] = [];
  for (const element of diagram.elements) {
    if (element.kind !== "task" && element.kind !== "milestone" && element.kind !== "marker")
      continue;
    const task = element.task;
    if (!task || task.start === null || task.finish === null) continue;
    dated.push({
      element,
      kind: element.kind,
      start: task.start,
      finish: task.finish,
      section: element.groupPath[0] ?? null,
      x0: 0,
      x1: 0,
      row: 0,
      y: 0,
      labelWidth: measure(element.label),
    });
  }
  const bars = dated.filter((entry) => entry.kind !== "marker");
  const markers = dated.filter((entry) => entry.kind === "marker");
  const sections = diagram.elements.filter((element) => element.kind === "section");

  // ---------------------------------------------------------------- the section column
  const titleLines = new Map<string, string[]>();
  for (const section of sections) {
    titleLines.set(
      section.id,
      wrapLines(section.label, TITLE_WRAP, (line) =>
        metrics.width(line, "body", scale.labelWeight, scale.groupTitle),
      ),
    );
  }
  const widest = Math.max(
    0,
    ...[...titleLines.values()]
      .flat()
      .map((line) => metrics.width(line, "body", scale.labelWeight, scale.groupTitle)),
    ...(labelsColumn ? bars.map((entry) => entry.labelWidth) : []),
  );
  const hasColumn = sections.length > 0 || (labelsColumn && bars.length > 0);
  const columnWidth = hasColumn ? Math.max(COLUMN_MIN, Math.ceil(widest + 2 * theme.padding)) : 0;

  // ---------------------------------------------------------------- the time scale
  let spanStart = Infinity;
  let spanEnd = -Infinity;
  for (const entry of dated) {
    spanStart = Math.min(spanStart, entry.start);
    spanEnd = Math.max(spanEnd, entry.finish);
  }
  const weekStart = chart.calendar.weekStart;
  if (dated.length === 0) {
    // Nothing is dated: four weeks, from the start of the week of today.
    const anchor = hostToday ?? todayTime ?? 4 * 86_400;
    const week: TickSpec = { n: 1, unit: "w" };
    spanStart = ticksCovering(anchor, anchor, week, weekStart)[0]!;
    spanEnd = spanStart + EMPTY_WEEKS * 7 * SECONDS_PER_DAY;
  }
  const board = preset === "board" && !written;
  const total = written
    ? written.width
    : preset === "slide"
      ? SLIDE_SIZE.width
      : DOCUMENT_MAX_WIDTH;
  const fill = Math.max(TIMELINE_MIN, board ? BOARD_TIMELINE : total - 2 * margin - columnWidth);
  const dayWidth = chart.dayWidth;
  const format = (interval: TickSpec) => chart.axisFormat ?? defaultFormat(interval);
  const labelOf = (interval: TickSpec, time: number) => formatTime(format(interval), time, words);

  /** Ticks over the span for an interval, and the room each label has. */
  const plan = (interval: TickSpec) => {
    const ticks = ticksCovering(spanStart, spanEnd, interval, weekStart);
    if (ticks.length < 2) ticks.push(tickNext(ticks[0]!, interval));
    const seconds = ticks[ticks.length - 1]! - ticks[0]!;
    const perSecond = dayWidth !== null ? dayWidth / SECONDS_PER_DAY : fill / seconds;
    let gap = Infinity;
    for (let i = 1; i < ticks.length; i++)
      gap = Math.min(gap, (ticks[i]! - ticks[i - 1]!) * perSecond);
    const widestLabel = Math.max(
      0,
      ...ticks.map((tick) => metrics.width(labelOf(interval, tick), "body", 400, labelSize)),
    );
    return { interval, ticks, gap, widest: widestLabel };
  };
  const estimatedTicks = (interval: TickSpec) => (spanEnd - spanStart) / tickSeconds(interval);
  const writtenInterval = chart.ticks === null ? null : parseTicks(chart.ticks);
  let chosen: ReturnType<typeof plan> | undefined;
  let every = 1;
  if (writtenInterval) {
    // A written interval is kept; one that would draw more than the axis can is widened.
    let interval = writtenInterval;
    while (estimatedTicks(interval) > MAX_TICKS)
      interval = { n: interval.n * 2, unit: interval.unit };
    chosen = plan(interval);
    if (chosen.gap < chosen.widest + TICK_GAP) {
      every = Math.ceil((chosen.widest + TICK_GAP) / chosen.gap);
    }
    every = Math.max(every, Math.ceil(chosen.interval.n / writtenInterval.n));
  } else {
    // A written format tells some ticks apart and not others: ticks closer than it can name would
    // repeat a label (`%b` over fortnights reads Jan, Jan, Feb, Feb).
    const finest = chart.axisFormat === null ? 0 : formatGranularity(chart.axisFormat);
    for (const interval of TICK_LADDER) {
      if (estimatedTicks(interval) > MAX_TICKS) continue;
      if (tickSeconds(interval) < finest && interval !== TICK_LADDER[TICK_LADDER.length - 1])
        continue;
      const candidate = plan(interval);
      chosen = candidate;
      if (candidate.gap >= candidate.widest + TICK_GAP) break;
    }
    chosen ??= plan(TICK_LADDER[TICK_LADDER.length - 1]!);
  }
  const ticks = chosen.ticks;
  const tickInterval = chosen.interval;
  const timeStart = ticks[0]!;
  const timeEnd = ticks[ticks.length - 1]!;
  const spanSeconds = timeEnd - timeStart;
  const timelineWidth =
    dayWidth !== null ? Math.max(1, (dayWidth * spanSeconds) / SECONDS_PER_DAY) : fill;
  const timelineLeft = columnWidth;
  const timelineRight = columnWidth + timelineWidth;
  const X = (time: number) => timelineLeft + ((time - timeStart) / spanSeconds) * timelineWidth;
  const perDay = (timelineWidth / spanSeconds) * SECONDS_PER_DAY;

  if (writtenInterval && every > 1) {
    const lines = compilation.parse.lines;
    const statement = diagram.block?.statements.find(
      (s) => s.kind === "KeywordStatement" && s.keyword.text === "ticks",
    );
    const range: Range = statement
      ? lines.range({ start: statement.start, end: statement.end })
      : diagram.idRange;
    const text = messages();
    diagnostics.push({
      code: "layout.ticks-crowded",
      severity: "warning",
      message: text.diagnostics.ticksCrowded(chart.ticks!, every),
      range,
      hints: [text.hints.ticksCrowded],
      data: { candidates: [] },
    });
  }

  for (const entry of dated) {
    entry.x0 = X(entry.start);
    entry.x1 =
      entry.kind === "task"
        ? X(entry.start) + Math.max(X(entry.finish) - X(entry.start), MIN_BAR)
        : X(entry.start);
  }

  // ---------------------------------------------------------------- label places, first guess
  /** Where a label goes if nothing else is in the way: inside, else beside, else before. */
  const guess = (entry: Entry): Place => {
    if (labelsColumn) return "column";
    const width = entry.x1 - entry.x0;
    if (entry.kind === "task" && entry.labelWidth + 2 * LABEL_INSIDE <= width) return "inside";
    const room = STUB + LABEL_BESIDE;
    if (entry.x1 + room + entry.labelWidth <= timelineRight) return "after";
    if (entry.x0 - room - entry.labelWidth >= timelineLeft) return "before";
    return "after";
  };
  const reach = (entry: Entry): [number, number] => {
    const left = entry.kind === "milestone" ? entry.x0 - diamond / 2 : entry.x0;
    const right = entry.kind === "milestone" ? entry.x0 + diamond / 2 : entry.x1;
    const place = guess(entry);
    const room = STUB + LABEL_BESIDE;
    if (place === "after") return [left, right + room + entry.labelWidth];
    if (place === "before") return [left - room - entry.labelWidth, right];
    return [left, right];
  };

  // ---------------------------------------------------------------- groups and rows
  const groups: Group[] = [];
  const leading = bars.filter((entry) => entry.section === null);
  if (leading.length > 0) {
    groups.push({
      section: null,
      entries: leading,
      rows: 0,
      top: 0,
      height: 0,
      banded: false,
      titleLines: [],
    });
  }
  sections.forEach((section, index) => {
    groups.push({
      section,
      entries: bars.filter((entry) => entry.section === section.id),
      rows: 0,
      top: 0,
      height: 0,
      banded: index % 2 === 0,
      titleLines: titleLines.get(section.id) ?? [],
    });
  });
  for (const group of groups) {
    if (chart.display === "compact") {
      const placed: [number, number][][] = [];
      for (const entry of group.entries) {
        const [left, right] = reach(entry);
        let row = placed.findIndex((list) =>
          list.every(([a, b]) => right + ROW_GAP <= a || left - ROW_GAP >= b),
        );
        if (row < 0) {
          row = placed.length;
          placed.push([]);
        }
        placed[row]!.push([left, right]);
        entry.row = row;
      }
      group.rows = placed.length;
    } else {
      group.entries.forEach((entry, index) => (entry.row = index));
      group.rows = group.entries.length;
    }
  }

  // ---------------------------------------------------------------- vertical layout
  const axisBand = labelHeight + 8;
  const showTop = chart.axis === "top" || chart.axis === "both";
  const showBottom = chart.axis === "bottom" || chart.axis === "both";
  let y = 0;
  const topAxisY = y;
  if (showTop) y += axisBand;
  // The markers' pills stand over the rows, in lanes so that none touches another.
  const pillHeight = scale.tagHeight;
  const pills = markers.map((entry) => ({
    entry,
    width: tagPillWidth(metrics, scale, entry.element.label),
  }));
  const lanes: { left: number; right: number }[][] = [];
  const pillBoxes = new Map<string, Box>();
  const lanePlan: { entry: Entry; lane: number; x: number; width: number }[] = [];
  for (const { entry, width } of pills) {
    const x = entry.x0 - width / 2;
    let lane = lanes.findIndex((list) =>
      list.every((p) => x + width + PILL_GAP <= p.left || x >= p.right + PILL_GAP),
    );
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane]!.push({ left: x, right: x + width });
    lanePlan.push({ entry, lane, x, width });
  }
  const pillTop = y;
  if (lanes.length > 0) y += lanes.length * (pillHeight + PILL_GAP) + PILL_GAP;
  const todayInside = todayTime !== null && todayTime >= timeStart && todayTime < timeEnd;
  const todayTop = y;
  if (todayInside) y += labelHeight + 2;
  for (const { entry, lane, x, width } of lanePlan) {
    pillBoxes.set(entry.element.id, {
      x,
      y: pillTop + PILL_GAP + lane * (pillHeight + PILL_GAP),
      width,
      height: pillHeight,
    });
  }
  const rowsTop = y;
  for (const group of groups) {
    const header =
      labelsColumn && group.section ? group.titleLines.length * titleLine + 12 : ROW_GAP;
    const body = header + group.rows * pitch;
    group.top = y;
    group.height = group.section
      ? Math.max(body, group.titleLines.length * titleLine + 2 * ROW_GAP)
      : body;
    for (const entry of group.entries) entry.y = group.top + header + entry.row * pitch;
    y += group.height;
  }
  const rowsBottom = y;
  const bottomAxisY = y;
  if (showBottom) y += axisBand;
  const contentHeight = y;

  // ---------------------------------------------------------------- dependency routes
  const byId = new Map(dated.map((entry) => [entry.element.id, entry]));
  const centerY = (entry: Entry) => entry.y + barHeight / 2;
  const endX = (entry: Entry) => (entry.kind === "milestone" ? entry.x0 + diamond / 2 : entry.x1);
  const startX = (entry: Entry) => (entry.kind === "milestone" ? entry.x0 - diamond / 2 : entry.x0);
  interface Route {
    readonly key: string;
    readonly from: Entry;
    readonly to: Entry;
    readonly points: Point[];
    readonly vertical: number;
  }
  const routes: Route[] = [];
  if (chart.dependencies === "shown") {
    for (const relation of diagram.relations) {
      const from = byId.get(relation.from);
      const to = byId.get(relation.to);
      if (!from || !to || to.kind === "marker" || from.kind === "marker") continue;
      const xe = endX(from);
      const xs = startX(to);
      const ye = centerY(from);
      const ys = centerY(to);
      const points: Point[] = [{ x: xe, y: ye }];
      let vertical = xe + STUB;
      if (Math.abs(ys - ye) < 0.5 && xs >= xe + STUB) {
        points.push({ x: xs, y: ys });
        vertical = xs;
      } else if (xs >= xe + 2 * STUB && Math.abs(ys - ye) >= 0.5) {
        points.push({ x: xe + STUB, y: ye }, { x: xe + STUB, y: ys }, { x: xs, y: ys });
      } else {
        // Too close to turn in the gap before the successor: down (or up) between the rows,
        // back to the start's side, and in.
        const below = ys >= ye;
        const gap = below ? ye + barHeight / 2 + ROW_GAP / 2 : ye - barHeight / 2 - ROW_GAP / 2;
        points.push(
          { x: xe + STUB, y: ye },
          { x: xe + STUB, y: gap },
          { x: xs - STUB, y: gap },
          { x: xs - STUB, y: ys },
          { x: xs, y: ys },
        );
        vertical = Math.min(xe + STUB, xs - STUB);
      }
      routes.push({ key: relation.key, from, to, points, vertical });
    }
  }
  const segments = routes.flatMap((route) =>
    route.points.slice(1).map((point, i) => [route.points[i]!, point] as const),
  );
  const outgoing = new Set(routes.map((route) => route.from.element.id));
  const incoming = new Map<string, number>();
  for (const route of routes) {
    const id = route.to.element.id;
    incoming.set(id, Math.min(incoming.get(id) ?? Infinity, route.vertical));
  }

  // ---------------------------------------------------------------- the labels, placed
  const crosses = (box: Box, a: Point, b: Point): boolean => {
    const x0 = box.x + 0.75;
    const y0 = box.y + 0.75;
    const x1 = box.x + box.width - 0.75;
    const y1 = box.y + box.height - 0.75;
    if (x1 <= x0 || y1 <= y0) return false;
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const [p, q] of [
      [-dx, a.x - x0],
      [dx, x1 - a.x],
      [-dy, a.y - y0],
      [dy, y1 - a.y],
    ] as const) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
    return t1 - t0 > 1e-6;
  };
  const overlaps = (a: Box, b: Box) =>
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.75 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.75;
  const barBox = (entry: Entry): Box =>
    entry.kind === "milestone"
      ? {
          x: entry.x0 - diamond / 2,
          y: entry.y + (barHeight - diamond) / 2,
          width: diamond,
          height: diamond,
        }
      : { x: entry.x0, y: entry.y, width: entry.x1 - entry.x0, height: barHeight };
  const placed: Box[] = [];
  const plans = new Map<string, LabelPlan>();
  const labelBox = (entry: Entry, left: number): Box => ({
    x: left,
    y: entry.y + barHeight / 2 - labelHeight / 2,
    width: entry.labelWidth,
    height: labelHeight,
  });
  /** A label keeps this far from an arrow, a marker's line or the today line. */
  const CLEARANCE = 4;
  // The vertical lines a label avoids besides the arrows: markers, and the day.
  const guides: (readonly [Point, Point])[] = markers.map((entry) => [
    { x: entry.x0, y: rowsTop },
    { x: entry.x0, y: rowsBottom },
  ]);
  if (todayInside) {
    const x = X(todayTime!);
    guides.push([
      { x, y: todayTop },
      { x, y: rowsBottom },
    ]);
  }
  /**
   * What a label at `box` runs into: an arrow three, a marker's line or the today line one,
   * another label or a bar ten. A label inside its own bar runs into the bar by definition, so only
   * the lines and the other labels count.
   */
  const cost = (box: Box, own: Entry, inside = false): number => {
    const wide: Box = { ...box, x: box.x - CLEARANCE, width: box.width + 2 * CLEARANCE };
    let score = 0;
    for (const [a, b] of segments) if (crosses(wide, a, b)) score += 3;
    for (const [a, b] of guides) if (crosses(wide, a, b)) score++;
    for (const other of placed) if (overlaps(other, box)) score += 10;
    if (!inside) {
      for (const other of bars) if (other !== own && overlaps(barBox(other), box)) score += 10;
    }
    return score;
  };
  for (const entry of bars) {
    const bar = barBox(entry);
    const id = entry.element.id;
    if (labelsColumn) {
      const box = labelBox(entry, theme.padding);
      plans.set(id, { place: "column", box, anchor: "start", x: box.x, onBar: false });
      placed.push(box);
      continue;
    }
    const leftOfBar = bar.x;
    const rightOfBar = bar.x + bar.width;
    const candidates: LabelPlan[] = [];
    if (entry.kind === "task" && entry.labelWidth + 2 * LABEL_INSIDE <= bar.width) {
      // Centred first; an arrow that crosses the bar leaves room at one end, or beside the bar.
      const left = bar.x + (bar.width - entry.labelWidth) / 2;
      candidates.push({
        place: "inside",
        box: labelBox(entry, left),
        anchor: "middle",
        x: bar.x + bar.width / 2,
        onBar: true,
      });
      if (bar.width - entry.labelWidth > 4 * LABEL_INSIDE) {
        candidates.push(
          {
            place: "inside",
            box: labelBox(entry, bar.x + LABEL_INSIDE),
            anchor: "start",
            x: bar.x + LABEL_INSIDE,
            onBar: true,
          },
          {
            place: "inside",
            box: labelBox(entry, bar.x + bar.width - LABEL_INSIDE - entry.labelWidth),
            anchor: "end",
            x: bar.x + bar.width - LABEL_INSIDE,
            onBar: true,
          },
        );
      }
    }
    const afterGaps = outgoing.has(id)
      ? [LABEL_BESIDE + STUB, LABEL_BESIDE]
      : [LABEL_BESIDE, LABEL_BESIDE + STUB];
    const after = (gap: number): LabelPlan => ({
      place: "after",
      box: labelBox(entry, rightOfBar + gap),
      anchor: "start",
      x: rightOfBar + gap,
      onBar: false,
    });
    const verticalIn = incoming.get(id);
    const beforeGaps = [LABEL_BESIDE, LABEL_BESIDE + STUB];
    if (verticalIn !== undefined) beforeGaps.push(leftOfBar - verticalIn + LABEL_BESIDE);
    const before = (gap: number): LabelPlan => ({
      place: "before",
      box: labelBox(entry, leftOfBar - gap - entry.labelWidth),
      anchor: "end",
      x: leftOfBar - gap,
      onBar: false,
    });
    const orderedAfter = afterGaps
      .map(after)
      .filter((plan) => plan.box.x + plan.box.width <= timelineRight);
    const orderedBefore = beforeGaps.map(before).filter((plan) => plan.box.x >= timelineLeft);
    // The last place before the bar stands beyond the arrow that enters it.
    const far = verticalIn !== undefined ? orderedBefore[orderedBefore.length - 1] : undefined;
    candidates.push(...orderedAfter, ...orderedBefore);
    /** The first candidate that runs into nothing, else the one that runs into least. */
    const choose = (list: readonly LabelPlan[]): { plan: LabelPlan; score: number } | undefined => {
      let best: { plan: LabelPlan; score: number } | undefined;
      for (const plan of list) {
        // A label far from its bar, beyond an arrow, costs more than a line across a near one.
        const score = cost(plan.box, entry, plan.place === "inside") + (plan === far ? 2 : 0);
        if (!best || score < best.score) best = { plan, score };
        if (score === 0) break;
      }
      return best;
    };
    let best = choose(candidates);
    // The chart grows to hold a label that fits neither beside nor before the bar, or that every
    // place in the timeline gives an arrow, another label or a bar to run into.
    if (!best || best.score >= 3) {
      const grown = choose(afterGaps.map(after));
      if (grown && (!best || grown.score < best.score)) best = grown;
    }
    const pick = best!.plan;
    plans.set(id, pick);
    placed.push(pick.box);
  }

  // ---------------------------------------------------------------- canvas
  const columnBox: Box = {
    x: 0,
    y: rowsTop,
    width: columnWidth + timelineWidth,
    height: rowsBottom - rowsTop,
  };
  const extent: Box[] = [
    { x: 0, y: 0, width: columnWidth + timelineWidth, height: contentHeight },
    ...[...plans.values()].map((plan) => plan.box),
    ...pillBoxes.values(),
  ];
  const todayWord = words.today;
  const todayWidth = metrics.width(todayWord, "body", 600, labelSize);
  if (todayInside) {
    const x = X(todayTime!);
    extent.push({ x: x - todayWidth / 2, y: todayTop, width: todayWidth, height: labelHeight });
  }
  void columnBox;
  const bounds = unionBoxes(extent)!;
  const contentWidth = Math.ceil(bounds.width + 2 * margin);
  const framedHeight = Math.ceil(bounds.height + 2 * margin);
  const framed = theme.frame !== "none";
  const frameHeight = framed ? scale.frameHeight : 0;
  const title = diagram.properties.title;
  const naturalWidth = framed
    ? Math.max(contentWidth, frameMinWidth(theme, scale, title, metrics))
    : contentWidth;
  const sheet = canvasSize(
    diagram,
    naturalWidth,
    framedHeight + frameHeight,
    compilation.parse.lines,
    diagnostics,
  );
  const frameTop = theme.frame === "header" ? frameHeight : 0;
  const dx = margin - bounds.x + Math.floor((sheet.width - contentWidth) / 2);
  const dy =
    margin - bounds.y + frameTop + Math.floor((sheet.height - frameHeight - framedHeight) / 2);

  // ---------------------------------------------------------------- scene
  const px = (value: number) => round2(value + dx);
  const py = (value: number) => round2(value + dy);
  const P = (point: Point): Point => ({ x: px(point.x), y: py(point.y) });
  const B = (box: Box): Box => ({
    x: px(box.x),
    y: py(box.y),
    width: round2(box.width),
    height: round2(box.height),
  });
  const bounded = (box: Box, radius: number, label?: Box): SceneBounds => ({
    ...B(box),
    radius,
    ...(label ? { label: B(label) } : {}),
  });
  const rect = (
    box: Box,
    radius: number,
    fill: string,
    stroke: string,
    strokeWidth: number,
    dashed: StrokeDash = false,
    opacity?: number,
  ): SceneItem => ({
    kind: "rect",
    ...B(box),
    radius,
    fill,
    stroke,
    strokeWidth,
    dashed,
    ...(opacity !== undefined ? { opacity } : {}),
  });
  const line = (
    points: readonly Point[],
    stroke: string,
    strokeWidth: number,
    dashed: StrokeDash = false,
    dash?: readonly number[],
    opacity?: number,
  ): SceneItem => ({
    kind: "polyline",
    points: points.map(P),
    stroke,
    strokeWidth,
    dashed,
    ...(dash ? { dash: { array: dash, offset: 0 } } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
  });
  const text = (
    x: number,
    cy: number,
    content: string,
    size: number,
    weight: number,
    fill: string,
    anchor: TextItem["anchor"] = "middle",
  ): TextItem => textItem(metrics, x + dx, cy + dy, content, size, weight, fill, anchor);

  const items: SceneItem[] = [];

  // The axis: excluded days, the grid, the tick labels and the today line, behind the rows.
  const axis: SceneItem[] = [];
  if (perDay > MIN_SHADED_DAY) {
    const first = dayNumber(timeStart);
    const last = dayNumber(timeEnd - 1);
    let runStart: number | null = null;
    const closeRun = (endDay: number) => {
      if (runStart === null) return;
      axis.push(
        rect(
          {
            x: X(runStart * SECONDS_PER_DAY),
            y: rowsTop,
            width: X(endDay * SECONDS_PER_DAY) - X(runStart * SECONDS_PER_DAY),
            height: rowsBottom - rowsTop,
          },
          0,
          theme.band,
          "none",
          0,
          false,
          EXCLUDED_OPACITY,
        ),
      );
      runStart = null;
    };
    for (let day = first; day <= last; day++) {
      if (!isWorkingDay(day, calendar)) runStart ??= day;
      else closeRun(day);
    }
    closeRun(last + 1);
  }
  for (const tick of ticks) {
    const x = X(tick);
    axis.push(
      line(
        [
          { x, y: rowsTop },
          { x, y: rowsBottom },
        ],
        theme.line,
        1,
      ),
    );
  }
  axis.push(
    line(
      [
        { x: 0, y: rowsBottom },
        { x: columnWidth + timelineWidth, y: rowsBottom },
      ],
      theme.line,
      1,
    ),
  );
  ticks.forEach((tick, index) => {
    if (index % every !== 0) return;
    const label = labelOf(tickInterval, tick);
    // A label at an end of the axis stays inside the canvas: it moves in by what would hang out.
    const half = metrics.width(label, "body", 400, labelSize) / 2;
    const at = Math.min(Math.max(X(tick), 2 + half - dx), sheet.width - dx - 2 - half);
    if (showTop) {
      axis.push(text(at, topAxisY + 4 + labelHeight / 2, label, labelSize, 400, theme.muted));
    }
    if (showBottom) {
      axis.push(text(at, bottomAxisY + 4 + labelHeight / 2, label, labelSize, 400, theme.muted));
    }
  });
  if (todayInside) {
    const x = X(todayTime!);
    axis.push(
      line(
        [
          { x, y: todayTop + labelHeight },
          { x, y: rowsBottom },
        ],
        theme.danger,
        2,
      ),
      text(x, todayTop + labelHeight / 2, todayWord, labelSize, 600, theme.danger),
    );
  }
  items.push({ kind: "group", id: "axis", role: "axis", items: axis });

  // Markers: a dashed line down the rows, and a pill over them. They are drawn before the bars,
  // so that a bar hides the line it crosses.
  for (const entry of markers) {
    const element = entry.element;
    const style = styles.element(element);
    const pill = pillBoxes.get(element.id)!;
    const stroke = style.stroke ?? theme.ink;
    const { outline, label } = tagPill(metrics, scale, B(pill), element.label, {
      fill: style.fill ?? theme.tag,
      stroke: style.stroke ?? theme.tag,
      strokeWidth: style.width ?? theme.strokeWidth,
      dashed: strokeDash(style.line),
      color: style.color ?? theme.tagText,
    });
    items.push({
      kind: "group",
      id: element.id,
      role: "element",
      items: [
        line(
          [
            { x: entry.x0, y: pill.y + pill.height },
            { x: entry.x0, y: rowsBottom },
          ],
          stroke,
          1.5,
          true,
          [4, 4],
        ),
        outline,
        label,
      ],
      bounds: bounded(pill, pill.height / 2),
      ...(element.url ? { href: element.url } : {}),
    });
  }

  // The tilings the bars with a `pattern` are overlaid with, declared on first use.
  const patterns: ScenePattern[] = [];
  const patternRef = (kind: PatternKind, color: string): string => {
    let found = patterns.find((p) => p.kind === kind && p.color === color);
    if (!found) {
      found = { id: `pattern-${patterns.length + 1}`, kind, color, size: PATTERN_SIZE };
      patterns.push(found);
    }
    return `url(#${found.id})`;
  };

  // Bars, diamonds and their labels, in the groups of their sections.
  const paint = (entry: Entry) => {
    const element = entry.element;
    const task = element.task!;
    const style = styles.element(element);
    let fill =
      task.status === "done" ? theme.muted : task.status === "active" ? theme.info : theme.accent;
    let stroke = fill;
    let strokeWidth = theme.strokeWidth;
    if (task.critical) {
      stroke = theme.danger;
      strokeWidth = 2;
      if (task.status === null) fill = theme.danger;
    }
    return {
      style,
      fill: style.fill ?? fill,
      stroke: style.stroke ?? stroke,
      strokeWidth: style.width ?? strokeWidth,
      dashed: strokeDash(style.line),
    };
  };
  const barGroup = (entry: Entry): GroupItem => {
    const element = entry.element;
    const painted = paint(entry);
    const plan = plans.get(element.id);
    const out: SceneItem[] = [];
    const box = barBox(entry);
    let radius = 0;
    if (entry.kind === "milestone") {
      out.push({
        kind: "path",
        d: diamondPath(B(box)),
        fill: painted.fill,
        stroke: painted.stroke,
        strokeWidth: painted.strokeWidth,
        dashed: painted.dashed,
      });
    } else {
      radius = Math.min(painted.style.radius ?? theme.radius, barHeight / 4);
      out.push(
        rect(box, radius, painted.fill, painted.stroke, painted.strokeWidth, painted.dashed),
      );
    }
    // A pattern is the same outline again, filled with the tiling in the stroke's colour.
    const outline = out[0]!;
    if (painted.style.pattern && (outline.kind === "rect" || outline.kind === "path")) {
      out.push({
        ...outline,
        fill: patternRef(painted.style.pattern, painted.style.stroke ?? theme.muted),
        stroke: "none",
        strokeWidth: 0,
      });
    }
    if (plan && element.label !== "") {
      const color = plan.onBar
        ? (painted.style.color ?? theme.tagText)
        : (painted.style.color ?? theme.ink);
      out.push(
        text(
          plan.x,
          plan.box.y + plan.box.height / 2,
          element.label,
          labelSize,
          500,
          plan.place === "column" ? (painted.style.color ?? theme.ink) : color,
          plan.anchor,
        ),
      );
    }
    return {
      kind: "group",
      id: element.id,
      role: "element",
      items: out,
      bounds: bounded(box, radius, plan?.box),
      ...(element.url ? { href: element.url } : {}),
    };
  };
  for (const group of groups) {
    const band: Box = {
      x: 0,
      y: group.top,
      width: columnWidth + timelineWidth,
      height: group.height,
    };
    const children = group.entries.map(barGroup);
    if (!group.section) {
      items.push(...children);
      continue;
    }
    const style = styles.element(group.section);
    const own: SceneItem[] = [];
    if (group.banded) {
      own.push(
        rect(
          band,
          0,
          style.fill ?? theme.band,
          style.stroke ?? "none",
          style.stroke ? (style.width ?? theme.strokeWidth) : 0,
          strokeDash(style.line),
          BAND_OPACITY,
        ),
      );
    }
    if (group !== groups[0]) {
      own.push(
        line(
          [
            { x: 0, y: group.top },
            { x: columnWidth + timelineWidth, y: group.top },
          ],
          theme.bandLine,
          1,
        ),
      );
    }
    const titleColor = style.color ?? theme.ink;
    const block = group.titleLines.length * titleLine;
    const titleTop = labelsColumn ? group.top + ROW_GAP : group.top + (group.height - block) / 2;
    group.titleLines.forEach((lineText, i) => {
      own.push(
        text(
          theme.padding,
          titleTop + titleLine / 2 + i * titleLine,
          lineText,
          scale.groupTitle,
          scale.labelWeight,
          titleColor,
          "start",
        ),
      );
    });
    items.push({
      kind: "group",
      id: group.section.id,
      role: "element",
      items: [...own, ...children],
      bounds: bounded(band, 0),
      ...(group.section.url ? { href: group.section.url } : {}),
    });
  }

  // Dependencies, over the bars.
  const connectors = new Map<string, ConnectorGeometry>();
  for (const route of routes) {
    const relation = diagram.relationsByKey.get(route.key)!;
    const style = styles.relation(relation);
    const stroke = style.stroke ?? theme.connector;
    const strokeWidth = style.width ?? theme.connectorWidth;
    const head = style.arrowhead ?? theme.arrowhead;
    const rounded = (style.corners ?? theme.corners) === "rounded";
    const track = rounded ? roundCorners(route.points, CORNER_RADIUS) : route.points;
    const arrow = relationEnds(track, "none", head, theme.arrowSize, (theme.arrowSize * 7) / 8);
    const local = (parts: Parameters<typeof shiftMarker>[0]) => shiftMarker(parts, P);
    items.push({
      kind: "group",
      id: route.key,
      role: "relation",
      items: [
        line(arrow.line, stroke, strokeWidth, strokeDash(style.line ?? relation.line)),
        ...markerItems(local(arrow.end), stroke, strokeWidth),
      ],
      track: arrow.line.map(P),
    });
    connectors.set(route.key, {
      points: route.points,
      line: arrow.line,
      fromSide: "east",
      toSide: "west",
      via: [],
    });
  }

  const gradients: SceneGradient[] = [];
  if (framed) {
    const stripTop = theme.frame === "header" ? 0 : sheet.height - frameHeight;
    items.push(brandFrame(theme, scale, metrics, sheet.width, stripTop, title));
    if (theme.mark === "meltemi") gradients.push(markGradient(theme.accent, theme.accentEnd));
  }

  // ---------------------------------------------------------------- what editors read
  const boxes = new Map<string, Box>();
  const labels = new Map<string, Box>();
  const rows = new Map<string, { y: number; height: number; section: string | null }>();
  for (const group of groups) {
    if (group.section) {
      boxes.set(group.section.id, {
        x: 0,
        y: group.top,
        width: columnWidth + timelineWidth,
        height: group.height,
      });
    }
  }
  for (const entry of bars) {
    boxes.set(entry.element.id, barBox(entry));
    const plan = plans.get(entry.element.id);
    if (plan) labels.set(entry.element.id, plan.box);
    rows.set(entry.element.id, {
      y: entry.y - ROW_GAP / 2,
      height: pitch,
      section: entry.section,
    });
  }
  for (const entry of markers) {
    boxes.set(entry.element.id, {
      x: entry.x0 - 2,
      y: rowsTop,
      width: 4,
      height: rowsBottom - rowsTop,
    });
    const pill = pillBoxes.get(entry.element.id);
    if (pill) labels.set(entry.element.id, pill);
  }

  return {
    scene: {
      width: sheet.width,
      height: sheet.height,
      background: theme.background,
      title,
      description: diagram.properties.description,
      fonts: { body: theme.font, mono: theme.mono },
      gradients,
      patterns,
      items,
      ...(theme.sketch !== "none" ? { sketch: theme.sketch } : {}),
    },
    diagnostics,
    boxes,
    offset: { x: dx, y: dy },
    labels,
    connectors,
    origins: new Map(),
    theme,
    shapes: new Map(),
    radii: new Map(),
    gantt: {
      timeline: {
        x: timelineLeft,
        width: timelineWidth,
        start: timeStart,
        end: timeEnd,
        dayWidth: perDay,
      },
      rows,
    },
  };
}
