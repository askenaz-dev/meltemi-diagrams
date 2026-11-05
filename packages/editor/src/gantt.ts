/**
 * What the canvas and the session know of gantt charts (decision 0066): the timeline and the
 * schedule of each bar as the canvas receives them, and the plans of the gestures: a bar given other
 * dates, rows moved between sections, a dependency written or removed, a task, milestone, marker or
 * section created, rows put in a new section.
 */
import { defaultLabel, type EditOperation, type TaskEnd } from "@meltemi/diagrams-edit";
import {
  DURATION_UNITS,
  GANTT_AXIS_PLACES,
  GANTT_DEPENDENCIES,
  GANTT_DISPLAYS,
  GANTT_LABEL_PLACES,
  SECONDS_PER_DAY,
  WEEKDAYS,
  addWorking,
  dayNumber,
  dayOfDate,
  formatDate,
  formatDay,
  nextWorking,
  workingBetween,
  workingCalendar,
  workingDaysPerWeek,
  type Element,
  type FlowDiagram,
  type GanttEnd,
  type WorkingCalendar,
} from "@meltemi/diagrams-model";
import type { DiagramView, DocumentAnalysis } from "./analysis.js";
import type {
  CanvasAction,
  InspectorField,
  MoveAction,
  ScheduleAction,
  TaskEndInfo,
  TaskInfo,
  TextPlace,
} from "./canvas/protocol.js";
import { dayItems, parseDayList, type TimelineInfo } from "./canvas/timeline.js";
import { messages } from "./messages/index.js";

/** The kinds of statement a chart is made of, which sit in rows or between them. */
const ITEMS: ReadonlySet<string> = new Set(["section", "task", "milestone", "marker"]);

/** The kinds that stand for a bar, a diamond or a line: the ones that have a schedule. */
const BARS: ReadonlySet<string> = new Set(["task", "milestone", "marker"]);

/** The kinds a task can come after, or end before: the ones with an end. */
const LEADS: ReadonlySet<string> = new Set(["task", "milestone"]);

/** The outcome of planning a gesture: operations to write, or why not. */
export type GanttPlan =
  | {
      readonly ok: true;
      readonly operations: readonly EditOperation[];
      /** The selection after the edit, when it is not the one before. */
      readonly select?: readonly string[];
      /** The element whose label the canvas opens an editor on once it is drawn. */
      readonly edit?: string;
      /** What the status line says once the edit is drawn. */
      readonly status?: string;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      /** The elements the refusal is about, which the canvas flashes. */
      readonly flash?: readonly string[];
    };

const refuse = (reason: string, flash?: readonly string[]): GanttPlan => ({
  ok: false,
  reason,
  ...(flash ? { flash } : {}),
});

/** The calendar of a chart in the model's form, which its working time is counted in. */
export function calendarOf(diagram: FlowDiagram): WorkingCalendar {
  const calendar = diagram.gantt!.calendar;
  return workingCalendar(calendar.excludedWeekdays, calendar.excludedDates, calendar.includedDates);
}

/** The block an element is declared in: its section, or null at the top level of the chart. */
const parentOf = (element: Element): string | null =>
  element.groupPath[element.groupPath.length - 1] ?? null;

/** The ids of the statements of a block, bars, markers and sections, in source order. */
export function blockItems(diagram: FlowDiagram, parent: string | null): string[] {
  return diagram.elements
    .filter((element) => ITEMS.has(element.kind) && parentOf(element) === parent)
    .map((element) => element.id);
}

/** A date as the language writes it: the day alone at midnight, else with the time. */
const dateText = (time: number): string => formatDate(time, time % SECONDS_PER_DAY !== 0);

// ---------------------------------------------------------------------- what the canvas gets

/**
 * Where the timeline is and the calendar its instants are counted in, from the layout; undefined
 * when the chart is not drawn.
 */
export function timelineInfo(view: DiagramView): TimelineInfo | undefined {
  const chart = view.diagram.gantt;
  const geometry = view.layout?.gantt;
  if (!chart || !geometry) return undefined;
  const days = (dates: readonly string[]) =>
    dates.flatMap((date) => {
      const day = dayOfDate(date);
      return day === undefined ? [] : [day];
    });
  return {
    x: geometry.timeline.x,
    start: geometry.timeline.start,
    end: geometry.timeline.end,
    dayWidth: geometry.timeline.dayWidth,
    weekStart: chart.calendar.weekStart,
    calendar: {
      weekdays: Array.from({ length: 7 }, (_, i) => chart.calendar.excludedWeekdays.includes(i)),
      excluded: days(chart.calendar.excludedDates),
      included: days(chart.calendar.includedDates),
    },
  };
}

/**
 * Where the title of a section is typed over: the column it is drawn in, not the whole band, which
 * stretches across the timeline. Other elements keep the place the scene gives them.
 */
export function sectionText(
  view: DiagramView,
  element: Element,
  place: TextPlace | undefined,
): TextPlace | undefined {
  const timeline = view.layout?.gantt?.timeline;
  if (!place || element.kind !== "section" || !timeline) return place;
  const left = place.anchor.x;
  const width = Math.max(timeline.x - 2 * left, 40);
  return { ...place, area: { ...place.area, x: left, width } };
}

/** The earliest start of a task that follows others: the latest of their ends, in working time. */
function floorOf(diagram: FlowDiagram, element: Element, calendar: WorkingCalendar): number | null {
  const task = element.task;
  if (!task || element.kind === "marker" || task.after.length === 0) return null;
  let latest = -Infinity;
  for (const { id } of task.after) {
    const before = diagram.elementsById.get(id)?.task;
    if (!before || before.finish === null) return null;
    latest = Math.max(latest, before.finish);
  }
  return nextWorking(latest, calendar);
}

const endInfo = (end: GanttEnd | null): TaskEndInfo | null =>
  end === null
    ? null
    : end.kind === "for"
      ? { kind: "for", amount: end.amount, unit: end.unit }
      : end.kind === "to"
        ? { kind: "to", date: end.date }
        : { kind: "until", ids: end.ids.map((reference) => reference.id) };

/** The schedule of every bar, diamond and line that has dates, by id. */
export function taskInfos(view: DiagramView): Map<string, TaskInfo> {
  const infos = new Map<string, TaskInfo>();
  const diagram = view.diagram;
  const geometry = view.layout?.gantt;
  if (!diagram.gantt || !geometry) return infos;
  const calendar = calendarOf(diagram);
  const tops = [...new Set([...geometry.rows.values()].map((row) => row.y))].sort((a, b) => a - b);
  for (const element of diagram.elements) {
    const task = element.task;
    if (!task || task.start === null || task.finish === null) continue;
    const row = geometry.rows.get(element.id);
    infos.set(element.id, {
      start: task.start,
      end: task.finish,
      clauses: {
        from: task.from?.date ?? null,
        after: task.after.map((reference) => reference.id),
        end: endInfo(task.end),
        status: task.status,
        critical: task.critical,
      },
      ...(row ? { row: { index: tops.indexOf(row.y), y: row.y, height: row.height } } : {}),
      floor: floorOf(diagram, element, calendar),
    });
  }
  return infos;
}

// ------------------------------------------------------------------------------ schedules

/** A length of working time in the largest unit that holds it whole: `10d`, `36h`, `90min`. */
function durationText(seconds: number, old: GanttEnd | null, calendar: WorkingCalendar): string {
  if (seconds % SECONDS_PER_DAY === 0) {
    const week = workingDaysPerWeek(calendar) * SECONDS_PER_DAY;
    // A task counted in weeks stays in weeks while the length is whole weeks.
    if (old?.kind === "for" && old.unit === "w" && seconds % week === 0) {
      return `${seconds / week}w`;
    }
    return `${seconds / SECONDS_PER_DAY}d`;
  }
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}min`;
  return `${seconds}s`;
}

/** The `to` that ends a task at `finish`: the last day, or the instant when it is off midnight. */
const toText = (finish: number): string =>
  finish % SECONDS_PER_DAY === 0 ? formatDay(dayNumber(finish - 1)) : formatDate(finish, true);

/**
 * Gives bars other dates: the start as `from` (`at` on a milestone or marker), removed when it is
 * where the bar's dependencies end, so that a bar dragged back onto its predecessor sticks to it;
 * the end as `for` in working days (weeks when the clause was in weeks and the length is whole
 * weeks, hours or minutes when it is not whole days), as the `to` date when the task has one, and
 * as `for` instead of `until`. A bar moved by its start keeps its length: its `for` stays, and its
 * `to` moves with it. The bars of `also` are given theirs in the same plan; one that follows only
 * bars moved with it keeps following them, so no `from` is written to hold it where it was.
 */
export function scheduleOperations(view: DiagramView, action: ScheduleAction): GanttPlan {
  const bars = [
    { task: action.task, start: action.start, end: action.end },
    ...(action.also ?? []),
  ];
  const moved = new Set(bars.map((bar) => bar.task));
  const operations: EditOperation[] = [];
  let status: string | undefined;
  for (const bar of bars) {
    const one = scheduleBar(view, bar, moved);
    if (!one.ok) return one;
    operations.push(...one.operations);
    status ??= one.status;
  }
  return { ok: true, operations, ...(status ? { status } : {}) };
}

/** The plan of one bar of `scheduleOperations`; `moved` holds every bar given dates with it. */
function scheduleBar(
  view: DiagramView,
  bar: {
    readonly task: string;
    readonly start?: number | undefined;
    readonly end?: number | undefined;
  },
  moved: ReadonlySet<string>,
): GanttPlan {
  const words = messages().gantt;
  const diagram = view.diagram;
  const element = diagram.elementsById.get(bar.task);
  const task = element?.task ?? null;
  if (!element || !task || task.start === null || task.finish === null) {
    return refuse(words.notBar(bar.task));
  }
  const calendar = calendarOf(diagram);
  const id = element.id;
  const point = element.kind !== "task";
  if (point && bar.end !== undefined && bar.start === undefined) {
    return refuse(words.noEnd(id, element.kind));
  }

  // A marker may mark any instant; everything else starts on working time.
  const start =
    bar.start === undefined
      ? undefined
      : element.kind === "marker"
        ? bar.start
        : (nextWorking(bar.start, calendar) ?? bar.start);

  let from: string | null | undefined;
  if (start !== undefined && start !== task.start) {
    const floor = floorOf(diagram, element, calendar);
    const follows = task.after.length > 0 && task.after.every((other) => moved.has(other.id));
    if (follows && (task.from === null || task.start === floor)) from = undefined;
    else from = floor !== null && start <= floor ? null : dateText(start);
  }

  let end: TaskEnd | undefined;
  let status: string | undefined;
  if (!point) {
    const before = start ?? task.start;
    if (bar.end !== undefined) {
      let finish = bar.end;
      if (workingBetween(before, finish, calendar) <= 0) {
        // An end that is not after the start leaves the bar one day long.
        finish = addWorking(before, SECONDS_PER_DAY, calendar) ?? before + SECONDS_PER_DAY;
      }
      if (task.end?.kind === "to") {
        end = { to: toText(finish) };
      } else {
        const length = durationText(workingBetween(before, finish, calendar), task.end, calendar);
        end = { for: length };
        if (task.end?.kind === "until") status = words.untilReplaced(id, length);
      }
    } else if (start !== undefined && task.end?.kind === "to" && start !== task.start) {
      // A bar moved with its `to` moves its end by as much.
      end = { to: toText(task.finish + (start - task.start)) };
    }
  }

  if (from === undefined && end === undefined) return { ok: true, operations: [] };
  return {
    ok: true,
    operations: [
      {
        kind: "setTaskSchedule",
        diagram: view.id,
        task: id,
        ...(from !== undefined ? { from } : {}),
        // A marker is at a date or after tasks: a date replaces the tasks it followed.
        ...(element.kind === "marker" && from !== undefined ? { after: null } : {}),
        ...(end ? { end } : {}),
      },
    ],
    ...(status ? { status } : {}),
  };
}

// ---------------------------------------------------------------------------------- rows

/**
 * Moves rows, bars and sections to a place among the statements of a section, or of the top level of
 * the chart: before the statement at `index` of the destination as it is (after the last when it is
 * past the end), several one after another in the order they are written. A delta of `y` -1 or +1
 * (Alt+Up and Alt+Down) moves them one place instead: up or down their section, into the section
 * above or below at its edge, and sections among sections.
 */
export function moveOperations(view: DiagramView, action: MoveAction): GanttPlan {
  const words = messages().gantt;
  const diagram = view.diagram;
  const ids = diagram.elements
    .filter((element) => ITEMS.has(element.kind) && action.ids.includes(element.id))
    .map((element) => element.id);
  if (ids.length === 0) return { ok: true, operations: [] };
  if (action.index === undefined || action.parent === undefined) {
    const y = action.delta?.y ?? 0;
    if (action.delta?.x === 0 && Math.abs(y) === 1)
      return stepOperations(view, ids, y < 0 ? -1 : 1);
    return refuse(words.dragRows);
  }
  return placeOperations(view, ids, action.parent, action.index);
}

/** The operations that put `ids` before the item at `index` of the block `parent`. */
function placeOperations(
  view: DiagramView,
  ids: readonly string[],
  parent: string | null,
  index: number,
): GanttPlan {
  const diagram = view.diagram;
  const lists = new Map<string | null, string[]>();
  const list = (block: string | null): string[] => {
    let items = lists.get(block);
    if (!items) lists.set(block, (items = blockItems(diagram, block)));
    return items;
  };
  const moved = new Set(ids);
  // The statement the rows go before: the one at the index, or the next that does not move too.
  const destination = list(parent);
  let at = Math.min(index, destination.length);
  while (at < destination.length && moved.has(destination[at]!)) at++;
  const anchor = destination[at];
  const operations: EditOperation[] = [];
  for (const id of ids) {
    const own = diagram.elementsById.get(id)!;
    const inside = list(parent);
    const where = anchor === undefined ? undefined : inside.indexOf(anchor);
    operations.push({
      kind: "moveElement",
      diagram: view.id,
      element: id,
      parent,
      ...(where !== undefined ? { index: where } : {}),
    });
    const source = list(parentOf(own));
    source.splice(source.indexOf(id), 1);
    const after = list(parent);
    after.splice(anchor === undefined ? after.length : after.indexOf(anchor), 0, id);
  }
  return { ok: true, operations };
}

/** One place up or down for rows, or for sections among sections (Alt+Up and Alt+Down). */
function stepOperations(view: DiagramView, ids: readonly string[], direction: -1 | 1): GanttPlan {
  const words = messages().gantt;
  const diagram = view.diagram;
  const elements = ids.map((id) => diagram.elementsById.get(id)!);
  // Markers take no row: there is nothing to move them past.
  const rows = elements.filter((element) => element.kind !== "marker");
  if (rows.length === 0) return refuse(words.noRows);
  const sections = rows.every((element) => element.kind === "section");
  if (!sections && rows.some((element) => element.kind === "section"))
    return refuse(words.mixedRows);
  const operations: EditOperation[] = [];
  const lists = new Map<string | null, string[]>();
  const list = (block: string | null): string[] => {
    let items = lists.get(block);
    if (!items) lists.set(block, (items = blockItems(diagram, block)));
    return items;
  };
  const sectionIds = diagram.elements.filter((e) => e.kind === "section").map((e) => e.id);
  // Up moves the first row first, down the last, so that each one has its place when it moves.
  const order = direction < 0 ? rows : [...rows].reverse();
  for (const element of order) {
    const block = parentOf(element);
    const inside = list(block);
    const own = inside.indexOf(element.id);
    // Rows only count the rows: a marker between two of them is stepped over.
    const step = (from: number, by: -1 | 1): number => {
      for (let i = from + by; i >= 0 && i < inside.length; i += by) {
        if (diagram.elementsById.get(inside[i]!)?.kind !== "marker") return i;
      }
      return -1;
    };
    const neighbour = step(own, direction);
    let parent: string | null = block;
    let index: number | undefined;
    if (neighbour >= 0) {
      // Past the neighbour: before it going up, before the item after it going down.
      index = direction < 0 ? neighbour : neighbour + 1;
    } else if (!sections && block !== null) {
      // At the edge of its section: into the section next to it, at the end or at the start.
      const next = sectionIds[sectionIds.indexOf(block) + direction];
      if (next === undefined)
        return refuse(direction < 0 ? words.firstRow(element.id) : words.lastRow(element.id));
      parent = next;
      index = direction < 0 ? list(next).length : 0;
    } else if (!sections && block === null && direction > 0) {
      // The last of the rows outside every section goes into the first section.
      const first = sectionIds[0];
      if (first === undefined) return refuse(words.lastRow(element.id));
      parent = first;
      index = 0;
    } else {
      return refuse(direction < 0 ? words.firstRow(element.id) : words.lastRow(element.id));
    }
    const target = list(parent);
    const anchor = index === undefined || index >= target.length ? undefined : target[index];
    operations.push({
      kind: "moveElement",
      diagram: view.id,
      element: element.id,
      parent,
      ...(anchor !== undefined ? { index: target.indexOf(anchor) } : {}),
    });
    inside.splice(inside.indexOf(element.id), 1);
    const landing = list(parent);
    landing.splice(anchor === undefined ? landing.length : landing.indexOf(anchor), 0, element.id);
  }
  return { ok: true, operations };
}

// -------------------------------------------------------------------------- dependencies

/** The chain of tasks from `from` to `to` following `after` forwards, or undefined when none. */
function leadsTo(diagram: FlowDiagram, from: string, to: string): string[] | undefined {
  const seen = new Set<string>([from]);
  const queue: string[][] = [[from]];
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1]!;
    if (last === to) return path;
    for (const relation of diagram.relations) {
      if (relation.from !== last || seen.has(relation.to)) continue;
      seen.add(relation.to);
      queue.push([...path, relation.to]);
    }
  }
  return undefined;
}

/**
 * A dependency: `from` ends before `to` starts, written as `from` added to the `after` of `to`. A
 * link that is already written, or that would close a loop, is refused, naming the elements to
 * flash.
 */
export function connectOperations(
  view: DiagramView,
  action: { readonly from: string; readonly to: string },
): GanttPlan {
  const words = messages().gantt;
  const diagram = view.diagram;
  const from = diagram.elementsById.get(action.from);
  const to = diagram.elementsById.get(action.to);
  if (!from || !to) return refuse(words.notBar(from ? action.to : action.from));
  if (!LEADS.has(from.kind)) return refuse(words.cannotLead(from.id, from.kind), [to.id]);
  if (!BARS.has(to.kind)) return refuse(words.cannotFollow(to.id, to.kind), [to.id]);
  if (from.id === to.id) return refuse(words.itself(from.id), [to.id]);
  const after = to.task?.after.map((reference) => reference.id) ?? [];
  if (after.includes(from.id)) return refuse(words.alreadyAfter(to.id, from.id), [to.id]);
  const loop = leadsTo(diagram, to.id, from.id);
  if (loop) return refuse(words.loop(to.id, from.id, loop), [to.id]);
  return {
    ok: true,
    operations: [
      { kind: "setTaskSchedule", diagram: view.id, task: to.id, after: [...after, from.id] },
    ],
  };
}

/**
 * Removes dependencies, the arrows `<task>-><task>#<n>`: each id goes from the `after` of its
 * successor, which gets `from` its current start when that was its last start clause, so that it
 * keeps its dates.
 */
export function removeArrowOperations(view: DiagramView, keys: readonly string[]): EditOperation[] {
  const diagram = view.diagram;
  const gone = new Map<string, Set<string>>();
  for (const key of keys) {
    const relation = diagram.relationsByKey.get(key);
    if (!relation) continue;
    gone.set(relation.to, (gone.get(relation.to) ?? new Set()).add(relation.from));
  }
  const operations: EditOperation[] = [];
  for (const [id, leads] of gone) {
    const task = diagram.elementsById.get(id)?.task;
    if (!task) continue;
    const rest = task.after.map((reference) => reference.id).filter((other) => !leads.has(other));
    const pin = rest.length === 0 && task.from === null && task.start !== null;
    operations.push({
      kind: "setTaskSchedule",
      diagram: view.id,
      task: id,
      after: rest.length > 0 ? rest : null,
      ...(pin ? { from: dateText(task.start!) } : {}),
    });
  }
  return operations;
}

// ---------------------------------------------------------------------------------- create

/** The day the host draws the chart's `today` line on: the layout's, else the machine's. */
export function hostDay(analysis: DocumentAnalysis): string {
  const given = analysis.layoutOptions.today;
  if (given !== undefined && dayOfDate(given) !== undefined) return given;
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear()).padStart(4, "0")}-${month}-${day}`;
}

/** A fresh id `<kind><n>` that nothing in the file uses, as `createTask` would choose. */
export function freeItemId(analysis: DocumentAnalysis, diagram: FlowDiagram, kind: string): string {
  const used = new Set<string>([
    ...diagram.elementsById.keys(),
    ...diagram.relations.flatMap((relation) => (relation.id === null ? [] : [relation.id])),
    ...analysis.compilation.document.diagrams.map((d) => d.id),
    ...analysis.compilation.document.themes.map((t) => t.id),
  ]);
  for (let n = 1; ; n++) if (!used.has(`${kind}${n}`)) return `${kind}${n}`;
}

/**
 * Where a press at the diagram's height `y` puts a new statement: the section whose band holds it
 * and the statement before which it goes, the row under the press (the end of the section when it
 * is under none), or the top level above the first section.
 */
export function placeAt(
  view: DiagramView,
  y: number,
): { readonly parent: string | null; readonly index?: number } {
  const diagram = view.diagram;
  const boxes = view.layout?.boxes;
  const rows = view.layout?.gantt?.rows;
  const section = diagram.elements.find((element) => {
    const box = element.kind === "section" ? boxes?.get(element.id) : undefined;
    return box !== undefined && y >= box.y && y < box.y + box.height;
  });
  const parent = section?.id ?? null;
  if (!section) {
    // Above the first section: among the rows outside every section; below the last: its end.
    const last = diagram.elements.filter((element) => element.kind === "section").pop();
    const bottom = last ? boxes?.get(last.id) : undefined;
    if (last && bottom && y >= bottom.y + bottom.height) return { parent: last.id };
    const loose = blockItems(diagram, null).filter((id) => rows?.has(id));
    const under = loose.find((id) => {
      const row = rows?.get(id);
      return row !== undefined && y < row.y + row.height;
    });
    return under !== undefined
      ? { parent, index: blockItems(diagram, null).indexOf(under) }
      : { parent };
  }
  const items = blockItems(diagram, parent);
  const under = items.find((id) => {
    const row = rows?.get(id);
    return row !== undefined && y >= row.y && y < row.y + row.height;
  });
  return under !== undefined ? { parent, index: items.indexOf(under) } : { parent };
}

/**
 * Creates a task, milestone, marker or section (T, M, V and G, the palette). A task or milestone goes
 * after the selected task or milestone, and a task is written `after` it `for 1d`; with nothing of
 * the kind selected it goes at the end of the last section after the last task, or `from` the host's
 * day in a chart without tasks. A marker is `at` the date given (the pointer's), else the start of
 * the selection, else the host's day. A section goes after the selected row's section. With
 * `schedule` the dates are the drawn ones, and the row under `at` the place: a bar dragged out with
 * T armed is written `from` its start `for` its length.
 */
export function createOperations(
  view: DiagramView,
  analysis: DocumentAnalysis,
  action: CanvasAction & { readonly kind: "create" },
  selection: readonly string[],
): GanttPlan {
  const words = messages().gantt;
  const diagram = view.diagram;
  const kind = action.elementKind;
  if (kind !== "task" && kind !== "milestone" && kind !== "marker" && kind !== "section") {
    return refuse(words.notHere(kind));
  }
  const calendar = calendarOf(diagram);
  const label = action.label ?? defaultLabel(kind);
  const selected = [...selection]
    .reverse()
    .map((id) => diagram.elementsById.get(id))
    .find((element) => element !== undefined && ITEMS.has(element.kind));
  const base = { kind: "createTask" as const, diagram: view.id, elementKind: kind };
  const named = { ...(label !== undefined ? { label } : {}) };

  if (kind === "section") {
    // After the section of the selected row, or after the selected section; at the end otherwise.
    const top = selected && (selected.kind === "section" ? selected : sectionOf(diagram, selected));
    const sections = blockItems(diagram, null);
    const index = top ? sections.indexOf(top.id) + 1 : undefined;
    const id = freeItemId(analysis, diagram, "section");
    return {
      ok: true,
      operations: [{ ...base, id, ...named, ...(index !== undefined ? { index } : {}) }],
      select: [id],
      edit: id,
    };
  }

  const id = freeItemId(analysis, diagram, kind);
  const schedule = action.schedule;
  if (schedule) {
    // Drawn or dropped at a date: on the row under the press.
    const place = placeAt(view, action.at.y);
    const where = {
      ...(place.parent !== null ? { parent: place.parent } : {}),
      ...(place.index !== undefined ? { index: place.index } : {}),
    };
    if (kind === "marker") {
      return {
        ok: true,
        operations: [{ ...base, id, ...named, from: dateText(schedule.start) }],
        select: [id],
        edit: id,
      };
    }
    const start = nextWorking(schedule.start, calendar) ?? schedule.start;
    if (kind === "milestone") {
      return {
        ok: true,
        operations: [{ ...base, id, ...named, ...where, from: dateText(start) }],
        select: [id],
        edit: id,
      };
    }
    const length = workingBetween(start, schedule.end ?? start, calendar);
    return {
      ok: true,
      operations: [
        {
          ...base,
          id,
          ...named,
          ...where,
          from: dateText(start),
          end: { for: durationText(length > 0 ? length : SECONDS_PER_DAY, null, calendar) },
        },
      ],
      select: [id],
      edit: id,
    };
  }

  if (kind === "marker") {
    // At the start of the selected bar, else the host's day, at the end of the chart.
    const at = selected?.task?.start;
    return {
      ok: true,
      operations: [
        {
          ...base,
          id,
          ...named,
          from: at !== undefined && at !== null ? dateText(at) : hostDay(analysis),
        },
      ],
      select: [id],
      edit: id,
    };
  }

  // A task or milestone, after the selected one, else at the end of the last section.
  const lead = selected && LEADS.has(selected.kind) ? selected : undefined;
  const bars = diagram.elements.filter((element) => LEADS.has(element.kind));
  const last = lead ?? bars[bars.length - 1];
  const sections = diagram.elements.filter((element) => element.kind === "section");
  const parent = lead ? parentOf(lead) : (sections[sections.length - 1]?.id ?? null);
  const index = lead ? blockItems(diagram, parent).indexOf(lead.id) + 1 : undefined;
  const after = last ? { after: [last.id] } : { from: hostDay(analysis) };
  return {
    ok: true,
    operations: [
      {
        ...base,
        id,
        ...named,
        ...(parent !== null ? { parent } : {}),
        ...(index !== undefined ? { index } : {}),
        ...after,
        ...(kind === "task" ? { end: { for: "1d" } } : {}),
      },
    ],
    select: [id],
    edit: id,
  };
}

/** The section a row is in, if it is in one. */
function sectionOf(diagram: FlowDiagram, element: Element): Element | undefined {
  const id = parentOf(element);
  return id === null ? undefined : diagram.elementsById.get(id);
}

/**
 * Puts the selected rows in a new section (Alt+G): written where the first of them is, after its
 * section, with the rows moved into it in the order they are written.
 */
export function groupOperations(
  view: DiagramView,
  analysis: DocumentAnalysis,
  ids: readonly string[],
): GanttPlan {
  const words = messages().gantt;
  const diagram = view.diagram;
  const rows = diagram.elements.filter(
    (element) => BARS.has(element.kind) && ids.includes(element.id),
  );
  if (rows.length === 0) return refuse(words.selectRows);
  const first = rows[0]!;
  const home = sectionOf(diagram, first);
  const top = blockItems(diagram, null);
  const index = home ? top.indexOf(home.id) + 1 : top.length;
  const id = freeItemId(analysis, diagram, "section");
  const label = defaultLabel("section");
  const operations: EditOperation[] = [
    {
      kind: "createTask",
      diagram: view.id,
      elementKind: "section",
      id,
      ...(label !== undefined ? { label } : {}),
      index,
    },
    ...rows.map((element, i): EditOperation => ({
      kind: "moveElement",
      diagram: view.id,
      element: element.id,
      parent: id,
      index: i,
    })),
  ];
  return { ok: true, operations, select: rows.map((element) => element.id) };
}

// ------------------------------------------------------------------------------ inspector

/**
 * The result of writing a field of a chart or of one of its bars: the operations, or why not, as
 * the inspector's own results are.
 */
export type GanttFieldResult =
  | { readonly ok: true; readonly operations: readonly EditOperation[] }
  | { readonly ok: false; readonly reason: string };

const accepted = (...operations: EditOperation[]): GanttFieldResult => ({ ok: true, operations });
const refused = (reason: string): GanttFieldResult => ({ ok: false, reason });

const offMidnight = (time: number): boolean => time % SECONDS_PER_DAY !== 0;

/** Whether the chart writes times of day: some bar starts or ends off midnight. */
function usesTimes(diagram: FlowDiagram): boolean {
  return diagram.elements.some((element) => {
    const task = element.task;
    if (!task) return false;
    return (
      (task.start !== null && offMidnight(task.start)) ||
      (task.finish !== null && offMidnight(task.finish))
    );
  });
}

/** A date in a read-only line: `19 June 2026`, with the time after it when it is wanted. */
function dateLine(time: number, withClock: boolean): string {
  const words = messages().gantt;
  const [year, month, day] = formatDay(dayNumber(time)).split("-").map(Number);
  const clock = withClock ? formatDate(time, true).slice(11) : null;
  return words.date(day!, words.months[month! - 1]!, year!, clock);
}

/**
 * Where a bar ends, in a read-only line: the last day it covers when it ends at midnight, else the
 * instant it ends at.
 */
function endLine(start: number, finish: number): string {
  return finish > start && !offMidnight(finish)
    ? dateLine(finish - 1, false)
    : dateLine(finish, offMidnight(finish));
}

/** A length of working time in a read-only line: whole days, or hours. */
function workingLine(seconds: number): string {
  const words = messages().gantt;
  if (seconds % SECONDS_PER_DAY === 0) return words.workingDays(seconds / SECONDS_PER_DAY);
  return words.workingHours(String(Math.round((seconds / 3600) * 10) / 10));
}

/** The ids of the bars that come after `id`, or end before it starts, however far. */
function dependents(diagram: FlowDiagram, id: string): Set<string> {
  const found = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const element of diagram.elements) {
      const task = element.task;
      if (!task || found.has(element.id)) continue;
      const leads = [
        ...task.after.map((reference) => reference.id),
        ...(task.end?.kind === "until" ? task.end.ids.map((reference) => reference.id) : []),
      ];
      if (leads.includes(current)) {
        found.add(element.id);
        queue.push(element.id);
      }
    }
  }
  return found;
}

/**
 * The tasks and milestones a bar may come after or end before, in the order they are written:
 * every one but itself and those that depend on it, which would close a loop.
 */
function leadsOf(diagram: FlowDiagram, element: Element): string[] {
  const later = dependents(diagram, element.id);
  return diagram.elements
    .filter((other) => LEADS.has(other.kind) && other.id !== element.id && !later.has(other.id))
    .map((other) => other.id);
}

/** The ids of a list field's text: separated by commas or spaces. */
const idList = (text: string | null): string[] =>
  text === null ? [] : text.split(/[\s,]+/).filter((id) => id !== "");

/** The words the inspector shows for some choices, in the interface language: `titles` of a field. */
function named(choices: readonly string[]): Readonly<Record<string, string>> {
  const words = messages().gantt.options;
  return Object.fromEntries(choices.map((choice) => [choice, words[choice] ?? choice]));
}

/** A `tasks` field: the ids written and the ones that may be added, with the labels as titles. */
function tasksField(
  diagram: FlowDiagram,
  name: string,
  label: string,
  written: readonly string[],
  candidates: readonly string[],
): InspectorField {
  const options = [...new Set([...written, ...candidates])];
  const titles: Record<string, string> = {};
  for (const id of options) {
    const text = diagram.elementsById.get(id)?.label;
    if (text !== undefined && text !== "" && text !== id) titles[id] = text;
  }
  return {
    name,
    label,
    type: "tasks",
    value: written.length > 0 ? written.join(", ") : null,
    options,
    ...(Object.keys(titles).length > 0 ? { titles } : {}),
  };
}

/**
 * The **Schedule** of a task, a milestone or a marker: its start date (the `from` of a task, the
 * `at` of the others), the tasks it comes after, how a task ends (for a duration, to a date or
 * until other tasks, with the field of the kind it has), its status and whether it is critical, and
 * read-only lines with where the schedule puts it. Without a written date the field shows the date
 * the bar starts at; a task that ends by default shows one day. A section has no schedule.
 */
export function ganttScheduleFields(view: DiagramView, element: Element): InspectorField[] {
  const task = element.task;
  if (!task || !BARS.has(element.kind)) return [];
  const diagram = view.diagram;
  const words = messages().gantt;
  const point = element.kind !== "task";
  const timed = usesTimes(diagram);
  const end = task.end;
  const leads = leadsOf(diagram, element);
  const fields: InspectorField[] = [
    {
      name: point ? "at" : "from",
      label: point ? words.fields.date : words.fields.start,
      type: "date",
      value: task.from?.date ?? null,
      ...(task.start !== null
        ? { placeholder: formatDate(task.start, timed || offMidnight(task.start)) }
        : {}),
      ...(timed ? { time: true } : {}),
      heading: words.headings.schedule,
    },
    tasksField(
      diagram,
      "after",
      words.fields.after,
      task.after.map((reference) => reference.id),
      leads,
    ),
  ];
  if (!point) {
    fields.push({
      name: "end",
      label: words.fields.end,
      type: "enum",
      value: end?.kind ?? null,
      placeholder: words.placeholders.oneDay,
      options: ["for", "to", "until"],
      titles: named(["for", "to", "until"]),
    });
    if (end === null || end.kind === "for") {
      fields.push({
        name: "duration",
        label: words.fields.duration,
        type: "duration",
        value: end?.kind === "for" ? `${end.amount}${end.unit}` : null,
        placeholder: "1d",
        options: DURATION_UNITS,
        titles: named(DURATION_UNITS),
      });
    }
    if (end?.kind === "to") {
      fields.push({
        name: "endDate",
        label: words.fields.endDate,
        type: "date",
        value: end.date,
        ...(task.finish !== null ? { placeholder: toText(task.finish) } : {}),
        ...(timed ? { time: true } : {}),
      });
    }
    if (end?.kind === "until") {
      fields.push(
        tasksField(
          diagram,
          "until",
          words.fields.until,
          end.ids.map((reference) => reference.id),
          leads,
        ),
      );
    }
  }
  if (element.kind !== "marker") {
    fields.push(
      {
        name: "status",
        label: words.fields.status,
        type: "enum",
        value: task.status,
        placeholder: "planned",
        options: ["active", "done"],
        titles: named(["planned", "active", "done"]),
      },
      {
        name: "critical",
        label: words.fields.critical,
        type: "boolean",
        value: task.critical ? "on" : "off",
      },
    );
  }
  if (!point && task.start !== null && task.finish !== null && task.working !== null) {
    fields.push(
      {
        name: "starts",
        label: words.fields.starts,
        type: "text",
        value: dateLine(task.start, offMidnight(task.start)),
        readonly: true,
      },
      {
        name: "ends",
        label: words.fields.ends,
        type: "text",
        value: endLine(task.start, task.finish),
        readonly: true,
      },
      {
        name: "working",
        label: words.fields.working,
        type: "text",
        value: workingLine(task.working),
        readonly: true,
      },
    );
  }
  return fields;
}

/**
 * The fields of an arrow: where it runs from and to, read-only, and where it is changed. An arrow
 * is the `after` of the task it points to, which takes no style and no effect of its own.
 */
export function ganttArrowFields(from: string, to: string): InspectorField[] {
  const labels = messages().fields;
  return [
    { name: "from", label: labels.from, type: "text", value: from, readonly: true },
    {
      name: "to",
      label: labels.to,
      type: "text",
      value: to,
      readonly: true,
      note: messages().gantt.arrowNote,
    },
  ];
}

/** The ways a chart's axis may be written, offered beside Axis format in one click. */
const AXIS_FORMATS = ["%d %b", "%b %Y", "%Y-%m-%d", "%H:%M"] as const;

/** Whether the chart writes a statement of the given word. */
function writes(diagram: FlowDiagram, word: string): boolean {
  return (diagram.block?.statements ?? []).some(
    (statement) => statement.kind === "KeywordStatement" && statement.keyword.text === word,
  );
}

/** The items written after a calendar statement's word, in order, from every statement of it. */
function writtenItems(diagram: FlowDiagram, word: "exclude" | "include"): string[] {
  const items: string[] = [];
  for (const statement of diagram.block?.statements ?? []) {
    if (statement.kind !== "KeywordStatement" || statement.keyword.text !== word) continue;
    for (const arg of statement.args) {
      if (arg.kind === "QualifiedRef" || arg.kind === "DateLiteral") items.push(arg.text);
    }
  }
  return items;
}

/**
 * The fields of the chart itself, under its title and theme: the look of its axis (format, ticks,
 * week start, where the axis and the labels go, display, dependencies, the width of a day), then the
 * calendar (the days excluded, the dates worked despite them) and **Today**, a line on the chart. A
 * statement that is not written shows what applies.
 */
export function ganttChartFields(view: DiagramView): InspectorField[] {
  const diagram = view.diagram;
  const chart = diagram.gantt;
  if (!chart) return [];
  const words = messages().gantt;
  const choice = (
    name: "axis" | "labels" | "display" | "dependencies",
    label: string,
    options: readonly string[],
    value: string,
    placeholder: string,
  ): InspectorField => ({
    name,
    label,
    type: "enum",
    value: writes(diagram, name) ? value : null,
    placeholder,
    options,
    titles: named(options),
  });
  const excluded = writtenItems(diagram, "exclude");
  const included = writtenItems(diagram, "include");
  const today = chart.today;
  return [
    {
      name: "axisFormat",
      label: words.fields.axisFormat,
      type: "text",
      value: chart.axisFormat,
      placeholder: words.placeholders.auto,
      quick: AXIS_FORMATS.map((format) => ({ label: format, value: format })),
      heading: words.headings.look,
    },
    {
      name: "ticks",
      label: words.fields.ticks,
      type: "text",
      value: chart.ticks,
      placeholder: words.placeholders.auto,
    },
    {
      name: "weekStart",
      label: words.fields.weekStart,
      type: "enum",
      value: writes(diagram, "weekStart") ? (WEEKDAYS[chart.calendar.weekStart] ?? null) : null,
      placeholder: WEEKDAYS[0],
      options: WEEKDAYS,
      titles: named(WEEKDAYS),
    },
    choice("axis", words.fields.axis, GANTT_AXIS_PLACES, chart.axis, "bottom"),
    choice("labels", words.fields.labels, GANTT_LABEL_PLACES, chart.labels, "bar"),
    choice("display", words.fields.display, GANTT_DISPLAYS, chart.display, "normal"),
    choice(
      "dependencies",
      words.fields.dependencies,
      GANTT_DEPENDENCIES,
      chart.dependencies,
      "shown",
    ),
    {
      name: "dayWidth",
      label: words.fields.dayWidth,
      type: "number",
      value: chart.dayWidth,
      placeholder: words.placeholders.auto,
      quick: [{ label: words.quick.auto, value: "" }],
    },
    {
      name: "exclude",
      label: words.fields.excluded,
      type: "weekdays",
      value: excluded.length > 0 ? excluded.join(", ") : null,
      heading: words.headings.calendar,
    },
    {
      name: "include",
      label: words.fields.included,
      type: "text",
      value: included.length > 0 ? included.join(", ") : null,
      placeholder: "2026-06-29, 2026-07-04",
    },
    {
      name: "today",
      label: words.fields.today,
      type: "date",
      value: today === null ? null : (today.date ?? "today"),
      placeholder: words.placeholders.off,
      quick: [
        { label: words.quick.today, value: "today" },
        { label: words.quick.off, value: "" },
      ],
    },
  ];
}

/**
 * The operations that write a field of the chart. The look's statements go through
 * `setChartStatement`, an empty value removing the statement; Excluded days and Included dates
 * through `setCalendar`, which keeps the other list as it is written; Today writes the bare `today`
 * for the word and the date otherwise. Undefined for a field that is not one of these.
 */
export function ganttChartOperations(
  view: DiagramView,
  field: string,
  value: string | number | null,
): GanttFieldResult | undefined {
  const diagram = view.diagram;
  if (!diagram.gantt) return undefined;
  const d = view.id;
  const text = value === null ? null : String(value).trim();
  const empty = text === null || text === "";
  const statement = (
    name:
      | "axisFormat"
      | "ticks"
      | "weekStart"
      | "axis"
      | "labels"
      | "display"
      | "dependencies"
      | "dayWidth"
      | "today",
    written: string | null,
  ) => accepted({ kind: "setChartStatement", diagram: d, statement: name, value: written });
  /** The list as written, its words in lower case as the language reads them. */
  const current = (word: "exclude" | "include") => [
    ...new Set(
      writtenItems(diagram, word).map((item) => (/^\d/.test(item) ? item : item.toLowerCase())),
    ),
  ];
  switch (field) {
    case "axisFormat":
      // The format is written as it is typed, spaces and all.
      return statement(field, value === null || String(value) === "" ? null : String(value));
    case "ticks":
    case "weekStart":
    case "axis":
    case "labels":
    case "display":
    case "dependencies":
    case "dayWidth":
      return statement(field, empty ? null : text);
    case "today":
      return statement(field, empty || text === "off" ? null : text === "today" ? "" : text);
    case "exclude":
      return accepted({
        kind: "setCalendar",
        diagram: d,
        exclude: dayItems(parseDayList(text ?? "")),
        include: current("include"),
      });
    case "include":
      return accepted({
        kind: "setCalendar",
        diagram: d,
        exclude: current("exclude"),
        include: [...new Set(idList(text))],
      });
    default:
      return undefined;
  }
}

/**
 * The operations that write a field of a task, a milestone or a marker: its dates, the tasks it
 * follows, how it ends and its status, through `setTaskSchedule` and `setTaskStatus`. The End field
 * turns the end into another kind of the same length (`for` its working time, `to` its last day),
 * and `until` into the end before the task that comes next, since an end before nothing has no
 * meaning; the other fields write their clause, replacing the end when it is of another kind. A
 * value the language refuses is refused, with its message, and nothing is written. Undefined for a
 * field that is not one of these, which the inspector's general fields write.
 */
export function ganttFieldOperations(
  view: DiagramView,
  id: string,
  field: string,
  value: string | number | null,
): GanttFieldResult | undefined {
  const diagram = view.diagram;
  const element = diagram.elementsById.get(id);
  const task = element?.task;
  if (!element || !task || !BARS.has(element.kind)) return undefined;
  const words = messages().gantt;
  const d = view.id;
  const text = value === null ? null : String(value).trim();
  const empty = text === null || text === "";
  const schedule = (change: {
    from?: string | null;
    after?: readonly string[] | null;
    end?: TaskEnd | null;
  }) => accepted({ kind: "setTaskSchedule", diagram: d, task: id, ...change });
  const calendar = calendarOf(diagram);
  /** The task's own length, as an end that keeps it. */
  const keeping = (): TaskEnd => ({
    for: task.working !== null ? durationText(task.working, task.end, calendar) : "1d",
  });
  switch (field) {
    case "from":
    case "at":
      return schedule({ from: empty ? null : text });
    case "after": {
      const list = idList(text);
      if (list.length > 0) return schedule({ after: list });
      // Without the last of them a bar with no date of its own would have no start: it keeps the
      // one it has.
      const keeps = task.from === null && task.start !== null;
      return schedule({ after: null, ...(keeps ? { from: dateText(task.start!) } : {}) });
    }
    case "end": {
      const kind = task.end?.kind ?? null;
      const wanted = empty ? null : text;
      if (wanted === kind) return accepted();
      if (wanted === null) return schedule({ end: null });
      if (wanted === "until") {
        // The task that is written next, if it can come after this one, ends it: the end of a task
        // that runs until the next one starts.
        const leads = new Set(leadsOf(diagram, element));
        const written = diagram.elements.map((other) => other.id);
        const next = written.slice(written.indexOf(id) + 1).find((other) => leads.has(other));
        return next === undefined
          ? refused(words.endNeedsTasks(id))
          : schedule({ end: { until: [next] } });
      }
      if (task.start === null || task.finish === null) return refused(words.unresolved(id));
      if (wanted === "for") return schedule({ end: keeping() });
      if (wanted === "to") return schedule({ end: { to: toText(task.finish) } });
      return refused(words.notEnd(wanted));
    }
    case "duration":
      return schedule({ end: empty ? null : { for: text } });
    case "endDate":
      return schedule({ end: empty ? null : { to: text } });
    case "until": {
      const list = idList(text);
      if (list.length > 0) return schedule({ end: { until: list } });
      // The last task taken away leaves the bar as long as it is.
      return task.end?.kind === "until" ? schedule({ end: keeping() }) : accepted();
    }
    case "status":
      return accepted({
        kind: "setTaskStatus",
        diagram: d,
        task: id,
        status: empty || text === "planned" ? null : (text as "done" | "active"),
        critical: task.critical,
      });
    case "critical":
      return accepted({
        kind: "setTaskStatus",
        diagram: d,
        task: id,
        status: task.status,
        critical: text === "on",
      });
    default:
      return undefined;
  }
}

/**
 * The style fields the strip offers for each kind of statement of a chart: the colours, the outline
 * and the text colour of all; a task also takes a pattern and a corner radius. A chart's bars,
 * diamonds, lines and sections have no icon, rotation, shape or alignment, and its arrows take no
 * style.
 */
const STRIP_OF: Readonly<Record<string, readonly string[]>> = {
  task: ["fill", "stroke", "color", "line", "width", "pattern", "radius"],
  milestone: ["fill", "stroke", "color", "line", "width"],
  marker: ["fill", "stroke", "color", "line", "width"],
  section: ["fill", "stroke", "color", "line", "width"],
};

/** Whether the inspector offers a style property for an element of a chart. */
export function ganttTakesStyle(kind: string, property: string): boolean {
  return STRIP_OF[kind]?.includes(property) ?? false;
}

/**
 * What the chart draws a bar, a diamond, a marker or a section with when nothing written says
 * otherwise, as the style fields show it: the colour of its status (planned, `active`, `done`, or
 * `critical`), the outline of the same, a marker's tag colours and a section's band. A value is
 * given only when every element shares it.
 */
export function ganttStyleDefaults(
  elements: readonly Element[],
  strokeWidth: number,
): Readonly<Record<string, string | undefined>> {
  const shared = (values: readonly (string | undefined)[]) =>
    values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined;
  const fill = (element: Element): string => {
    if (element.kind === "marker") return "tag";
    if (element.kind === "section") return "band";
    const task = element.task;
    if (task?.status === "done") return "muted";
    if (task?.status === "active") return "info";
    return task?.critical ? "danger" : "accent";
  };
  return {
    "style.fill": shared(elements.map(fill)),
    "style.stroke": shared(
      elements.map((element) =>
        element.kind === "section" ? undefined : element.task?.critical ? "danger" : fill(element),
      ),
    ),
    "style.color": shared(
      elements.map((element) =>
        element.kind === "marker" ? "tagText" : element.kind === "section" ? "ink" : undefined,
      ),
    ),
    "style.width": shared(
      elements.map((element) =>
        element.kind === "section" ? undefined : String(element.task?.critical ? 2 : strokeWidth),
      ),
    ),
  };
}
