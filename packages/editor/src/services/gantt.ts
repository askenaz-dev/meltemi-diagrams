import { deleteStatements, removeListItems } from "@meltemi/diagrams-edit";
import type {
  Arg,
  Block,
  Diagnostic,
  KeywordStatement,
  Range,
  Statement,
  TextEdit,
  Token,
} from "@meltemi/diagrams-language";
import {
  AXIS_DIRECTIVES,
  DURATION_UNITS,
  GANTT_AXIS_PLACES,
  GANTT_CHART_STATEMENTS,
  GANTT_CLAUSES,
  GANTT_DEPENDENCIES,
  GANTT_DISPLAYS,
  GANTT_ELEMENT_KINDS,
  GANTT_LABEL_PLACES,
  GANTT_PROFILE,
  GANTT_RESERVED_IDS,
  GANTT_STATUS_WORDS,
  SECONDS_PER_DAY,
  TICK_UNITS,
  WEEKDAYS,
  dayNumber,
  formatDate,
  formatDay,
  isWorkingDay,
  parseDate,
  weekdayOfDay,
  workingCalendar,
  type Element,
  type FlowDiagram,
  type GanttChart,
  type GanttTask,
  type WorkingCalendar,
} from "@meltemi/diagrams-model";
import type { DocumentAnalysis } from "../analysis.js";
import { elementDetail, kindWord, serviceMessages } from "../messages/services.js";
import { pathAt } from "../syntax.js";
import type { CompletionItem } from "./completion.js";
import { ganttDoc, keywordDoc } from "./docs.js";

// -------------------------------------------------------------------------------- the day

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/**
 * The host's day as `YYYY-MM-DD`: the one the host gave the layout (`LayoutOptions.today`), else
 * the machine's local day. It is the day a quick fix or a snippet writes into a file.
 */
export function hostDay(analysis: DocumentAnalysis): string {
  const given = analysis.layoutOptions.today;
  if (given !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(given) && parseDate(given).ok) return given;
  const now = new Date();
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

/** The working calendar a chart's `exclude` and `include` statements write. */
function calendarOf(chart: GanttChart): WorkingCalendar {
  const { excludedWeekdays, excludedDates, includedDates } = chart.calendar;
  return workingCalendar(excludedWeekdays, excludedDates, includedDates);
}

// ---------------------------------------------------------------------------- statements

/** The statements that stand for a bar, a diamond or a line. */
type Bar = "task" | "milestone" | "marker";

const isBar = (word: string | undefined): word is Bar =>
  word === "task" || word === "milestone" || word === "marker";

/** The clauses that end a task: only one of them is written. */
const END_CLAUSES: readonly string[] = ["for", "to", "until"];

/** The single identifier an argument is, or undefined. */
function wordOf(arg: Arg | undefined): Token | undefined {
  return arg?.kind === "QualifiedRef" && arg.parts.length === 1 ? arg.parts[0] : undefined;
}

/** The statements of a block and of the blocks inside it, in source order. */
function statementsIn(block: Block | undefined): Statement[] {
  const out: Statement[] = [];
  for (const statement of block?.statements ?? []) {
    out.push(statement);
    if (statement.kind === "KeywordStatement" || statement.kind === "RelationStatement") {
      out.push(...statementsIn(statement.block));
    }
  }
  return out;
}

/** The `after` or `until` clause of a statement: its word and the id arguments that follow. */
function listClause(
  statement: KeywordStatement,
  clause: "after" | "until",
): { readonly word: Arg; readonly ids: readonly Arg[] } | undefined {
  const args = statement.args;
  for (let i = 1; i < args.length; i++) {
    if (wordOf(args[i])?.text !== clause) continue;
    const ids: Arg[] = [];
    for (let j = i + 1; j < args.length; j++) {
      const next = wordOf(args[j]);
      if (next === undefined || GANTT_RESERVED_IDS.includes(next.text)) break;
      ids.push(args[j]!);
    }
    return { word: args[i]!, ids };
  }
  return undefined;
}

/**
 * Where a new start clause goes: after the id, the label and the start clauses written (`from`,
 * `at` and `after`), as the editor's schedule operations write them.
 */
function startClausesEnd(statement: KeywordStatement): number {
  const args = statement.args;
  let end = args[0]?.end ?? statement.keyword.end;
  if (args[1]?.kind === "StringLiteral") end = args[1].end;
  for (let i = 1; i < args.length; i++) {
    const text = wordOf(args[i])?.text;
    if (text !== "from" && text !== "at") continue;
    const value = args[i + 1];
    end = Math.max(end, value?.kind === "DateLiteral" ? value.end : args[i]!.end);
  }
  const after = listClause(statement, "after");
  if (after) end = Math.max(end, after.ids.at(-1)?.end ?? after.word.end);
  return end;
}

/** The ids that wait, directly or not, for `id`: by `after`, or by `until`, which ends at its start. */
function dependentsOf(diagram: FlowDiagram, id: string): Set<string> {
  const waiting = new Map<string, string[]>();
  for (const element of diagram.elements) {
    const task = element.task;
    if (!task) continue;
    const ids = [
      ...task.after.map((reference) => reference.id),
      ...(task.end?.kind === "until" ? task.end.ids.map((reference) => reference.id) : []),
    ];
    for (const waitedFor of ids) {
      const list = waiting.get(waitedFor);
      if (list) list.push(element.id);
      else waiting.set(waitedFor, [element.id]);
    }
  }
  const found = new Set<string>();
  const queue = [id];
  for (let head = 0; head < queue.length; head++) {
    for (const next of waiting.get(queue[head]!) ?? []) {
      if (found.has(next)) continue;
      found.add(next);
      queue.push(next);
    }
  }
  return found;
}

// ------------------------------------------------------------------------------ completion

type Place = { readonly start: number; readonly end: number };

/** Words of the chart as completion items, detailed by what they mean in a chart. */
function words(
  values: readonly string[],
  kind: CompletionItem["kind"],
  range: Place,
): CompletionItem[] {
  return values.map((label) => {
    const detail = ganttDoc(label) ?? keywordDoc(label);
    return detail ? { label, kind, detail, range } : { label, kind, range };
  });
}

/** What the scanner reads in the text of a statement before the cursor. */
interface Piece {
  readonly kind: "word" | "string" | "date" | "number" | "comma" | "other";
  readonly text: string;
}

/**
 * A string, a date (its time may be half typed: `2026-06-01T09:`), a number with its unit, a word,
 * a comma or any other character.
 */
const PIECE =
  /\s*(?:("(?:[^"\\]|\\.)*")|(\d{4}-\d{2}-\d{2}(?:T[\d:]*)?(?!\d))|(-?\d+(?:\.\d+)?(?:[A-Za-z_][A-Za-z0-9_]*)?)|([A-Za-z_][A-Za-z0-9_]*)|(,)|(\S))/;
const PIECE_KINDS = ["string", "date", "number", "word", "comma", "other"] as const;

/**
 * The pieces of a statement before the cursor, and the last one when the cursor touches it: a word
 * or a number being typed, which is not one of the statement's words yet.
 */
function scan(prefix: string): { pieces: Piece[]; tail: Piece | null } {
  const pieces: Piece[] = [];
  const pattern = new RegExp(PIECE, "y");
  let index = 0;
  while (index < prefix.length) {
    pattern.lastIndex = index;
    const found = pattern.exec(prefix);
    if (!found) break;
    index = pattern.lastIndex;
    const group = PIECE_KINDS.findIndex((_, i) => found[i + 1] !== undefined);
    pieces.push({ kind: PIECE_KINDS[group]!, text: found[group + 1]! });
  }
  const last = pieces.at(-1);
  const touching =
    last !== undefined &&
    (last.kind === "word" || last.kind === "number" || last.kind === "date") &&
    /\S$/.test(prefix);
  return touching ? { pieces: pieces.slice(0, -1), tail: last } : { pieces, tail: null };
}

/** Tasks and milestones a statement may wait for, but for itself, its dependents and `listed`. */
function dependable(
  diagram: FlowDiagram,
  self: string,
  listed: ReadonlySet<string>,
  range: Place,
): CompletionItem[] {
  const blocked = dependentsOf(diagram, self);
  return diagram.elements
    .filter(
      (e) =>
        (e.kind === "task" || e.kind === "milestone") &&
        e.id !== self &&
        !listed.has(e.id) &&
        !blocked.has(e.id),
    )
    .map((e) => ({ label: e.id, kind: "element", detail: elementDetail(e), range }));
}

/** The letters of the unit being typed after a number: `m` in `5m`. */
const unitTyped = (number: string) => /[A-Za-z_][A-Za-z0-9_]*$/.exec(number)?.[0] ?? "";

/** The units after a number, replacing the letters typed so far. */
function unitItems(units: readonly string[], typed: string, offset: number): CompletionItem[] {
  const details: Readonly<Record<string, string>> = serviceMessages().gantt.units;
  const range = { start: offset - typed.length, end: offset };
  return units.map((label) => {
    const detail = details[label];
    return detail ? { label, kind: "value", detail, range } : { label, kind: "value", range };
  });
}

/** What follows the label of a task, milestone or marker, from what is written before the cursor. */
function barCompletions(
  diagram: FlowDiagram,
  kind: Bar,
  pieces: readonly Piece[],
  tail: Piece | null,
  range: Place,
  offset: number,
): CompletionItem[] {
  // The id (and the label) come first: an id is new, and nothing completes it.
  const id = pieces[1];
  if (id?.kind !== "word") return [];
  const clauses = GANTT_CLAUSES[kind];
  const statuses: readonly string[] = kind === "marker" ? [] : GANTT_STATUS_WORDS;
  const written = new Set<string>();
  const listed = new Set<string>();
  let waiting: "date" | "duration" | "ids" | null = null;
  let expectId = false;
  for (const piece of pieces.slice(pieces[2]?.kind === "string" ? 3 : 2)) {
    if (piece.kind === "word" && clauses.includes(piece.text)) {
      written.add(piece.text);
      waiting =
        piece.text === "after" || piece.text === "until"
          ? "ids"
          : piece.text === "for"
            ? "duration"
            : "date";
      expectId = waiting === "ids";
    } else if (piece.kind === "word" && statuses.includes(piece.text)) {
      written.add(piece.text);
      waiting = null;
    } else if (piece.kind === "word" && waiting === "ids") {
      listed.add(piece.text);
      expectId = false;
    } else if (piece.kind === "comma" && waiting === "ids") {
      expectId = true;
    } else if (
      (piece.kind === "date" && waiting === "date") ||
      (piece.kind === "number" && waiting === "duration")
    ) {
      waiting = null;
    } else if (piece.kind !== "string") {
      waiting = null;
    }
  }
  if (waiting === "ids" && expectId) return dependable(diagram, id.text, listed, range);
  // A duration's number takes its unit; the letters typed so far are replaced.
  if (tail?.kind === "number") {
    return waiting === "duration" ? unitItems(DURATION_UNITS, unitTyped(tail.text), offset) : [];
  }
  if (tail?.kind === "date" || waiting === "date" || waiting === "duration") return [];
  const ended = END_CLAUSES.some((word) => written.has(word));
  const placed = written.has("at") || written.has("after");
  const offered = [...clauses, ...statuses].filter((word) => {
    if (written.has(word)) return false;
    if (ended && END_CLAUSES.includes(word)) return false;
    if ((word === "done" || word === "active") && (written.has("done") || written.has("active"))) {
      return false;
    }
    // A marker is put by `at` or by `after`, not both.
    return !(kind === "marker" && placed && (word === "at" || word === "after"));
  });
  return words(offered, "keyword", range);
}

/** The values of a chart statement: `axis |`, `exclude weekends, |`, `ticks 2|`. */
function chartCompletions(
  statement: string,
  pieces: readonly Piece[],
  tail: Piece | null,
  range: Place,
  offset: number,
): CompletionItem[] | undefined {
  if (statement === "exclude") {
    // After the word or a comma, the days not listed yet.
    if (pieces.length > 1 && pieces.at(-1)?.kind !== "comma") return [];
    const listed = new Set(pieces.filter((p) => p.kind === "word").map((p) => p.text));
    return words(
      ["weekends", ...WEEKDAYS].filter((word) => !listed.has(word)),
      "value",
      range,
    );
  }
  if (statement === "ticks") {
    return pieces.length === 1 && tail?.kind === "number"
      ? unitItems(TICK_UNITS, unitTyped(tail.text), offset)
      : [];
  }
  const values: Readonly<Record<string, readonly string[]>> = {
    weekStart: WEEKDAYS,
    axis: GANTT_AXIS_PLACES,
    labels: GANTT_LABEL_PLACES,
    display: GANTT_DISPLAYS,
    dependencies: GANTT_DEPENDENCIES,
  };
  const offered = values[statement];
  if (offered) return pieces.length > 1 ? [] : words(offered, "value", range);
  // `include`, `today`, `dayWidth` and `axisFormat` take a date, a number or a string.
  return [];
}

/**
 * Completion in the body of a gantt chart or of one of its sections: the statements, the clause
 * and status words after a label, the tasks after `after` and `until`, the units after a
 * duration's number, the days after `exclude`, the values of the chart statements. Undefined when
 * the text before the cursor is for the shared completion (styles, `preset`, `link`…).
 */
export function ganttCompletions(
  diagram: FlowDiagram,
  scope: "gantt" | "section",
  prefix: string,
  range: Place,
  offset: number,
): CompletionItem[] | undefined {
  const { pieces, tail } = scan(prefix);
  const head = pieces[0];
  if (head === undefined) {
    // The start of a statement: a section holds bars and the properties of a group; the chart
    // holds sections, bars, the chart statements, its properties and its blocks.
    if (tail !== null && tail.kind !== "word") return [];
    const statements =
      scope === "section"
        ? ["task", "milestone", "marker", ...Object.keys(GANTT_PROFILE.groupProperties)]
        : [
            ...GANTT_ELEMENT_KINDS,
            ...GANTT_CHART_STATEMENTS,
            ...Object.keys(GANTT_PROFILE.diagramProperties),
            ...GANTT_PROFILE.diagramBlocks,
          ];
    return words(statements, "keyword", range);
  }
  if (head.kind !== "word") return [];
  if (isBar(head.text)) return barCompletions(diagram, head.text, pieces, tail, range, offset);
  // A section's id and label are not completed.
  if (head.text === "section") return [];
  if (scope === "gantt" && (GANTT_CHART_STATEMENTS as readonly string[]).includes(head.text)) {
    return chartCompletions(head.text, pieces, tail, range, offset);
  }
  return undefined;
}

/** The directives of `axisFormat` inside its string; `typed` is the text of the string so far. */
export function axisFormatCompletions(typed: string, offset: number): CompletionItem[] {
  const partial = /%-?[A-Za-z%]?$/.exec(typed)?.[0] ?? "";
  const flagged = partial.startsWith("%-");
  const range = { start: offset - partial.length, end: offset };
  const details = serviceMessages().gantt.directives;
  return AXIS_DIRECTIVES.filter((directive) => !(flagged && directive === "%")).map(
    (directive) => ({
      label: `${flagged ? "%-" : "%"}${directive}`,
      kind: "value",
      detail: details[directive],
      range,
    }),
  );
}

/** The snippet of a new chart at the top level: a section with two tasks, the second after the first. */
export function ganttSnippet(analysis: DocumentAnalysis, range: Place): CompletionItem {
  const label = serviceMessages().snippets;
  const day = hostDay(analysis);
  return {
    label: "diagram (gantt)",
    kind: "snippet",
    snippet: true,
    insertText: `diagram \${1:plan}: gantt {\n  title "\${2:${label.title}}"\n\n  section \${3:build} "\${4:${label.phase}}" {\n    task \${5:design} "\${6:${label.firstTask}}" from \${7:${day}} for \${8:5d}\n    task \${9:ship} "\${10:${label.secondTask}}" after \${5:design} for \${11:3d}\n  }\n  $0\n}`,
    range,
  };
}

// ------------------------------------------------------------------------------------ hover

/** Whether an instant is the midnight that starts a day. */
const isMidnight = (time: number) => time === dayNumber(time) * SECONDS_PER_DAY;

/** `Monday 2026-06-08`. */
function dayText(day: number): string {
  return `${serviceMessages().gantt.weekdays[weekdayOfDay(day)]!} ${formatDay(day)}`;
}

/** An instant as `Monday 2026-06-08`, or with its time: `Monday 2026-06-08 09:30`. */
function instantText(time: number, withTime: boolean): string {
  return withTime
    ? `${dayText(dayNumber(time))}${formatDate(time).slice(10).replace("T", " ")}`
    : dayText(dayNumber(time));
}

/** The end of a task as a person reads it: its last day, or its instant when it has a time. */
function endText(start: number, finish: number): string {
  return isMidnight(start) && isMidnight(finish)
    ? dayText(dayNumber(finish - 1))
    : instantText(finish, true);
}

/** `10 working days`, `4 working hours`: working time in the largest whole unit. */
function workingText(seconds: number): string {
  const t = serviceMessages().gantt;
  if (seconds % SECONDS_PER_DAY === 0) return t.working(seconds / SECONDS_PER_DAY, "d");
  if (seconds % 3600 === 0) return t.working(seconds / 3600, "h");
  if (seconds % 60 === 0) return t.working(seconds / 60, "min");
  return t.working(seconds, "s");
}

/** The task or milestone written before `element`, which one without a start follows. */
function previousOf(diagram: FlowDiagram, element: Element): Element | undefined {
  for (let i = diagram.elements.indexOf(element) - 1; i >= 0; i--) {
    const before = diagram.elements[i]!;
    if (before.kind === "task" || before.kind === "milestone") return before;
  }
  return undefined;
}

/** Ids as code, separated by commas. */
const codes = (ids: readonly string[]) => ids.map((id) => `\`${id}\``).join(", ");

/** What a hover says about a section: the days its rows cover, and what it holds. */
function sectionFacts(diagram: FlowDiagram, section: Element): string[] {
  const t = serviceMessages().gantt;
  const members = diagram.elements.filter(
    (e) => e.groupPath[e.groupPath.length - 1] === section.id,
  );
  let first: number | null = null;
  let last: number | null = null;
  for (const member of members) {
    const task = member.task;
    if (!task || task.start === null || task.finish === null) continue;
    const from = dayNumber(task.start);
    const to = member.kind === "task" ? dayNumber(task.finish - 1) : from;
    first = first === null ? from : Math.min(first, from);
    last = last === null ? to : Math.max(last, to);
  }
  const facts: string[] = [];
  if (first !== null && last !== null) facts.push(`${dayText(first)} → ${dayText(last)}`);
  for (const [kind, text] of [
    ["task", t.tasks],
    ["milestone", t.milestones],
    ["marker", t.markers],
  ] as const) {
    const count = members.filter((e) => e.kind === kind).length;
    if (count > 0) facts.push(text(count));
  }
  return facts;
}

/** The days, and the working time, a task spans; a milestone or marker has its day alone. */
function whenText(element: Element, task: GanttTask): string {
  const { start, finish, working } = task;
  if (start === null || finish === null) return serviceMessages().gantt.notScheduled;
  if (element.kind !== "task") return instantText(start, !isMidnight(start));
  const days = isMidnight(start) && isMidnight(finish);
  const text = `${instantText(start, !days)} → ${endText(start, finish)}`;
  return working === null ? text : `${text} · ${workingText(working)}`;
}

/**
 * What a hover says about a section, task, milestone or marker: its kind, id and label and its
 * description; its dates and working time; its status, what it follows, where it ends and what it
 * precedes, its section and its link.
 */
export function ganttElementHover(diagram: FlowDiagram, element: Element): string {
  const words = serviceMessages();
  const t = words.gantt;
  const lines = [
    `**${kindWord(element.kind)}** \`${element.id}\` — ${element.label.replace(/\n/g, "  \n")}`,
  ];
  if (element.description) lines.push("", element.description.replace(/\n/g, "  \n"));
  const task = element.task;
  if (element.kind === "section") {
    const section = sectionFacts(diagram, element);
    if (section.length > 0) lines.push("", section.join(" · "));
  } else if (task) {
    lines.push("", whenText(element, task));
  }
  const facts: string[] = [];
  if (task?.status) facts.push(`\`${task.status}\``);
  if (task?.critical) facts.push("`critical`");
  if (task) {
    if (task.after.length > 0) {
      facts.push(t.follows(codes(task.after.map((reference) => reference.id))));
    } else if (element.kind !== "marker" && task.from === null && task.afterRange === null) {
      const previous = previousOf(diagram, element);
      if (previous) facts.push(t.followsPrevious(previous.id));
    }
    if (task.end?.kind === "until") facts.push(t.endsWhen(task.end.ids.map((r) => r.id)));
    const followers = diagram.elements
      .filter((e) => e.task?.after.some((reference) => reference.id === element.id))
      .map((e) => e.id);
    if (followers.length > 0) facts.push(t.precedes(codes(followers)));
  }
  if (element.groupPath.length > 0) {
    facts.push(words.hover.within(element.groupPath.map((g) => `\`${g}\``).join(" › ")));
  }
  if (element.link) facts.push(words.hover.linked(element.link.text));
  if (facts.length > 0) lines.push("", facts.join(" · "));
  return lines.join("\n");
}

/** The statement a value word belongs to: `bar` is an arrowhead elsewhere, `column` a constraint. */
const VALUE_OF: Readonly<Record<string, readonly string[]>> = {
  top: ["axis"],
  bottom: ["axis"],
  both: ["axis"],
  bar: ["labels"],
  column: ["labels"],
  normal: ["display"],
  compact: ["display"],
  shown: ["dependencies"],
  hidden: ["dependencies"],
  weekends: ["exclude"],
};

/**
 * The hover on a token of a gantt chart: a date (its weekday, and whether the calendar excludes
 * it), a duration (what it adds up to and where the task ends), a directive of an axis format and
 * the words of the chart; undefined for the tokens that mean the same as everywhere.
 */
export function ganttTokenHover(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram,
  token: Token,
  offset: number,
): { readonly range: Range; readonly markdown: string } | undefined {
  const lines = analysis.compilation.parse.lines;
  const t = serviceMessages().gantt;
  const chart = diagram.gantt;
  const owner = pathAt(analysis.compilation.parse.root, token.start)
    .reverse()
    .find((node) => node.kind === "KeywordStatement");
  const statement = owner?.kind === "KeywordStatement" ? owner.keyword : undefined;

  if (token.kind === "Date") {
    const parsed = parseDate(token.text);
    if (!chart || !parsed.ok) return undefined;
    const day = dayNumber(parsed.time);
    const included = chart.calendar.includedDates.includes(formatDay(day));
    const excluded = !included && !isWorkingDay(day, calendarOf(chart));
    const weekday = t.weekdays[weekdayOfDay(day)]!;
    const when = parsed.hasTime ? `${weekday} ${token.text.slice(11)}` : weekday;
    const state = included ? t.included : excluded ? t.excluded : null;
    return {
      range: lines.range(token),
      markdown: `${t.date(token.text)} — ${state ? `${when}, ${state}` : when}`,
    };
  }

  if (token.kind === "Number") {
    // A duration written after `for`: what it adds up to, and where the task ends.
    const element = diagram.elements.find(
      (e) =>
        e.task?.end?.kind === "for" &&
        e.task.end.valueRange.start.offset <= token.start &&
        token.end <= e.task.end.valueRange.end.offset,
    );
    const task = element?.task;
    const end = task?.end;
    if (!task || end?.kind !== "for") return undefined;
    // Days count working time when the chart excludes any; a week is as many working days as the
    // calendar has in one.
    const { excludedWeekdays, excludedDates } = chart?.calendar ?? {
      excludedWeekdays: [],
      excludedDates: [],
    };
    const excludes = excludedWeekdays.length > 0 || excludedDates.length > 0;
    const parts: string[] = [];
    if (end.unit === "d" && excludes && task.working !== null) {
      parts.push(workingText(task.working));
    } else {
      parts.push(t.length(end.amount, end.unit));
      if (end.unit === "w" && task.working !== null) parts.push(workingText(task.working));
    }
    if (task.start !== null && task.finish !== null) {
      parts.push(t.ends(endText(task.start, task.finish)));
    }
    return {
      range: lines.range(token),
      markdown: `${t.duration(token.text)} — ${parts.join(" · ")}`,
    };
  }

  if (token.kind === "String") {
    if (statement?.text !== "axisFormat") return undefined;
    // The directive under the pointer, or what the statement does.
    for (const found of token.text.matchAll(/%-?[A-Za-z%]/g)) {
      const from = token.start + (found.index ?? 0);
      if (offset < from || offset > from + found[0].length) continue;
      const doc = t.directives[found[0].slice(-1) as keyof typeof t.directives];
      if (!doc) continue;
      return {
        range: lines.range({ start: from, end: from + found[0].length }),
        markdown: `**${found[0]}** — ${doc}`,
      };
    }
    const doc = ganttDoc("axisFormat");
    return doc ? { range: lines.range(token), markdown: `**axisFormat** — ${doc}` } : undefined;
  }

  if (token.kind !== "Identifier") return undefined;
  const word = token.text;
  let doc: string | undefined;
  if (word in VALUE_OF) {
    const belongs =
      statement !== undefined && statement !== token && VALUE_OF[word]!.includes(statement.text);
    doc = belongs ? ganttDoc(word) : undefined;
  } else if ((WEEKDAYS as readonly string[]).includes(word)) {
    doc =
      statement?.text === "exclude" || statement?.text === "weekStart" ? ganttDoc(word) : undefined;
  } else {
    doc = ganttDoc(word);
  }
  return doc ? { range: lines.range(token), markdown: `**${word}** — ${doc}` } : undefined;
}

// ------------------------------------------------------------------------------ quick fixes

/** A quick fix of a gantt chart: its title and edits, and whether it is the one to apply. */
export interface GanttFix {
  readonly title: string;
  readonly edits: readonly TextEdit[];
  readonly preferred: boolean;
}

/** The bar or section whose statement contains `offset`, the innermost one. */
export function ganttElementAt(diagram: FlowDiagram, offset: number): Element | undefined {
  let found: Element | undefined;
  for (const element of diagram.elements) {
    const node = element.node;
    if (!node || node.start > offset || offset > node.end) continue;
    if (!found || node.end - node.start < found.node!.end - found.node!.start) found = element;
  }
  return found;
}

/** `gantt.unscheduled`: a task or milestone nothing places gets a start, today. */
function unscheduledFixes(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram,
  diagnostic: Diagnostic,
): GanttFix[] {
  const id = analysis.text.slice(diagnostic.range.start.offset, diagnostic.range.end.offset);
  const element = diagram.elementsById.get(id);
  const statement = element?.node;
  if (statement?.kind !== "KeywordStatement") return [];
  if (element?.kind !== "task" && element?.kind !== "milestone") return [];
  const clause = element.kind === "task" ? "from" : "at";
  const day = hostDay(analysis);
  const at = startClausesEnd(statement);
  return [
    {
      title: serviceMessages().fixes.startToday(clause, day),
      edits: [{ start: at, end: at, newText: ` ${clause} ${day}` }],
      preferred: true,
    },
  ];
}

/** `gantt.relation`: `a -> b` becomes `after a` on `b`, and the relation statement goes. */
function relationFixes(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram,
  diagnostic: Diagnostic,
): GanttFix[] {
  const [source, target] = diagnostic.data?.ids ?? [];
  if (source === undefined || target === undefined || source === target) return [];
  const predecessor = diagram.elementsById.get(source);
  const successor = diagram.elementsById.get(target);
  const statement = successor?.node;
  if (statement?.kind !== "KeywordStatement") return [];
  if (predecessor?.kind !== "task" && predecessor?.kind !== "milestone") return [];
  if (successor?.kind === "section") return [];
  const relation = statementsIn(diagram.block).find(
    (s) => s.kind === "RelationStatement" && s.start === diagnostic.range.start.offset,
  );
  if (!relation) return [];
  let removal: readonly TextEdit[];
  try {
    removal = deleteStatements(analysis.text, analysis.compilation.parse.root, [relation]);
  } catch {
    return [];
  }
  const t = serviceMessages().fixes;
  const after = listClause(statement, "after");
  // Already waiting for it: only the relation is redundant.
  if (after?.ids.some((arg) => wordOf(arg)?.text === source)) {
    return [{ title: t.dropRelation(target, source), edits: removal, preferred: true }];
  }
  // `after` would close a loop, or a marker that a date puts already would have two places.
  if (dependentsOf(diagram, target).has(source)) return [];
  if (successor?.kind === "marker" && successor.task?.from) return [];
  const last = after?.ids.at(-1);
  const edit: TextEdit = after
    ? last
      ? { start: last.end, end: last.end, newText: `, ${source}` }
      : { start: after.word.end, end: after.word.end, newText: ` ${source}` }
    : {
        start: startClausesEnd(statement),
        end: startClausesEnd(statement),
        newText: ` after ${source}`,
      };
  return [{ title: t.relationToAfter(source, target), edits: [edit, ...removal], preferred: true }];
}

/** The nearest working day before or after `day`, or undefined when none is within a year. */
function workingDayFrom(day: number, calendar: WorkingCalendar, step: 1 | -1): number | undefined {
  for (let i = 1; i <= 400; i++) if (isWorkingDay(day + i * step, calendar)) return day + i * step;
  return undefined;
}

/**
 * `gantt.excluded-day`: a date on a day that does not work moves to the next working day; an end
 * date may also go to the previous one, where the chart draws the task's end.
 */
function excludedDayFixes(diagram: FlowDiagram, diagnostic: Diagnostic): GanttFix[] {
  const chart = diagram.gantt;
  const statement = ganttElementAt(diagram, diagnostic.range.start.offset)?.node;
  if (!chart || statement?.kind !== "KeywordStatement") return [];
  const index = statement.args.findIndex(
    (arg) => arg.kind === "DateLiteral" && arg.start === diagnostic.range.start.offset,
  );
  const literal = statement.args[index];
  if (literal?.kind !== "DateLiteral") return [];
  const parsed = parseDate(literal.text);
  if (!parsed.ok) return [];
  const calendar = calendarOf(chart);
  const day = dayNumber(parsed.time);
  const time = literal.text.slice(10);
  const t = serviceMessages().fixes;
  const move = (
    title: (date: string) => string,
    target: number | undefined,
    preferred: boolean,
  ): GanttFix[] => {
    if (target === undefined) return [];
    const date = `${formatDay(target)}${time}`;
    return [
      {
        title: title(date),
        edits: [{ start: literal.start, end: literal.end, newText: date }],
        preferred,
      },
    ];
  };
  const ending = wordOf(statement.args[index - 1])?.text === "to";
  return [
    ...move(t.moveToNextWorking, workingDayFrom(day, calendar, 1), true),
    ...(ending ? move(t.moveToPreviousWorking, workingDayFrom(day, calendar, -1), false) : []),
  ];
}

/** `gantt.cycle`: the reference of the loop goes from its `after` or `until` list. */
function cycleFixes(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram,
  diagnostic: Diagnostic,
): GanttFix[] {
  const start = diagnostic.range.start.offset;
  const statement = ganttElementAt(diagram, start)?.node;
  if (statement?.kind !== "KeywordStatement") return [];
  for (const clause of ["after", "until"] as const) {
    const found = listClause(statement, clause);
    const position = found?.ids.findIndex((arg) => arg.start === start) ?? -1;
    if (!found || position < 0) continue;
    const id = analysis.text.slice(start, found.ids[position]!.end);
    // The only id takes its clause with it, and the space before it.
    const before = statement.args[statement.args.indexOf(found.word) - 1]!;
    const edits: readonly TextEdit[] =
      found.ids.length === 1
        ? [{ start: before.end, end: found.ids[0]!.end, newText: "" }]
        : removeListItems(found.ids, new Set([position]));
    return [
      { title: serviceMessages().fixes.removeFromClause(id, clause), edits, preferred: true },
    ];
  }
  return [];
}

/** The quick fixes of a diagnostic of a gantt chart. */
export function ganttFixes(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram,
  diagnostic: Diagnostic,
): GanttFix[] {
  switch (diagnostic.code) {
    case "gantt.unscheduled":
      return unscheduledFixes(analysis, diagram, diagnostic);
    case "gantt.relation":
      return relationFixes(analysis, diagram, diagnostic);
    case "gantt.excluded-day":
      return excludedDayFixes(diagram, diagnostic);
    case "gantt.cycle":
      return cycleFixes(analysis, diagram, diagnostic);
    default:
      return [];
  }
}
