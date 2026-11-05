import {
  isIdentifierText,
  type Arg,
  type Block,
  type KeywordStatement,
  type Statement,
  type TextEdit,
} from "@meltemi/diagrams-language";
import {
  DURATION_UNITS,
  GANTT_AXIS_PLACES,
  GANTT_DAY_WIDTH_RANGE,
  GANTT_DEPENDENCIES,
  GANTT_DISPLAYS,
  GANTT_LABEL_PLACES,
  GANTT_RESERVED_IDS,
  SECONDS_PER_DAY,
  TICK_UNITS,
  WEEKDAYS,
  badDirective,
  formatDate,
  singleIdent,
  type Element,
} from "@meltemi/diagrams-model";
import {
  insertStatement,
  reject,
  requireElement,
  requireIndex,
  type EditContext,
} from "./context.js";
import { freeId, usedIds } from "./create.js";
import { deleteStatements } from "./delete.js";
import {
  diagramBody,
  insertAfter,
  insertBeforeStatement,
  insertIntoBlock,
  isKeyword,
  reindent,
  verifyNoNewErrors,
} from "./insert.js";
import { reasons, messages } from "./messages/index.js";
import { removeListItems, type OperationOf } from "./plan.js";
import { cutDeclaration } from "./structure.js";
import { quoteString } from "./text.js";
import type { ChartStatement, TaskEnd } from "./types.js";

/** The statements of a chart that are drawn as rows: bars, diamonds, markers and sections. */
const ITEM_KEYWORDS: ReadonlySet<string> = new Set(["section", "task", "milestone", "marker"]);
const BAR_KINDS = ["task", "milestone", "marker"] as const;
type BarKind = (typeof BAR_KINDS)[number];
const END_WORDS: readonly string[] = ["for", "to", "until"];
const STATUS_WORDS: readonly string[] = ["done", "active", "critical"];

/** The operations a gantt chart takes; the others place or link boxes and are refused. */
const CHART_OPERATIONS: ReadonlySet<string> = new Set([
  "renameElement",
  "removeElement",
  "setElementLabel",
  "setDescription",
  "setClasses",
  "setStyleProperty",
  "setAnimation",
  "removeAnimation",
  "setDiagramProperty",
  "moveElement",
  "setElementProperty",
  "setTaskSchedule",
  "setTaskStatus",
  "createTask",
  "setCalendar",
  "setChartStatement",
]);

/** The properties `setElementProperty` writes on a chart's bars: the ones its blocks have. */
const CHART_PROPERTIES: readonly string[] = ["link", "url"];

/** Refuses an operation that places or links boxes on a gantt chart, which dates place. */
export function refuseInChart(
  ctx: EditContext,
  operation: { readonly kind: string; readonly property?: string },
): void {
  if (ctx.diagram.type !== "gantt") return;
  const applies =
    CHART_OPERATIONS.has(operation.kind) &&
    (operation.kind !== "setElementProperty" ||
      CHART_PROPERTIES.includes(operation.property ?? ""));
  if (!applies) reject("edit.invalid-value", reasons().gantt.notInChart(operation.kind));
}

function requireGantt(ctx: EditContext): void {
  if (ctx.diagram.type !== "gantt") {
    reject("edit.invalid-value", reasons().gantt.notGantt(ctx.diagram.id));
  }
}

const isItem = (statement: Statement): statement is KeywordStatement =>
  statement.kind === "KeywordStatement" && ITEM_KEYWORDS.has(statement.keyword.text);

/** A task, milestone or marker of the chart (`kinds` narrows them), with its statement. */
function requireBar(
  ctx: EditContext,
  id: string,
  kinds: readonly BarKind[] = BAR_KINDS,
): Element & { readonly node: KeywordStatement } {
  const element = requireElement(ctx, id);
  const node = element.node;
  if (
    ctx.diagram.type !== "gantt" ||
    !(kinds as readonly string[]).includes(element.kind) ||
    node?.kind !== "KeywordStatement"
  ) {
    const words = reasons().gantt;
    reject(
      "edit.unsafe-target",
      kinds.length < BAR_KINDS.length ? words.notStatusBar(id) : words.notBar(id),
    );
  }
  return element as Element & { readonly node: KeywordStatement };
}

// ---------------------------------------------------------------------- reading a statement

/** A clause or status word as written: from its word to the end of its last value. */
interface Clause {
  readonly word: string;
  readonly start: number;
  readonly end: number;
  readonly values: readonly Arg[];
}

/**
 * Where the label of a task, milestone or marker ends (the id when it has none) and the clauses
 * and status words after it, read from the arguments as the model reads them: a clause word takes
 * the values up to the next clause or status word.
 */
function readStatement(statement: KeywordStatement): { anchor: number; clauses: Clause[] } {
  const [idArg, ...rest] = statement.args;
  let anchor = idArg?.end ?? statement.keyword.end;
  let i = 0;
  if (rest[0]?.kind === "StringLiteral") {
    anchor = rest[0].end;
    i = 1;
  }
  const clauses: Clause[] = [];
  const reserved = (arg: Arg | undefined) => {
    const word = singleIdent(arg);
    return word !== undefined && GANTT_RESERVED_IDS.includes(word.text) ? word : undefined;
  };
  while (i < rest.length) {
    const word = reserved(rest[i]);
    if (!word) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < rest.length && !reserved(rest[j])) j++;
    const values = rest.slice(i + 1, j);
    clauses.push({
      word: word.text,
      start: word.start,
      end: (values[values.length - 1] ?? rest[i]!).end,
      values,
    });
    i = j;
  }
  return { anchor, clauses };
}

/** The offset where the spaces before `offset` begin: a clause is deleted with them. */
function spacesBefore(text: string, offset: number): number {
  let start = offset;
  while (start > 0 && (text[start - 1] === " " || text[start - 1] === "\t")) start--;
  return start;
}

// ---------------------------------------------------------------------- values

const DATE_FORM = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/;
const DURATION_FORM = new RegExp(`^(\\d+(?:\\.\\d+)?)(${DURATION_UNITS.join("|")})$`);

/**
 * A date as the language writes it. A text that has the form of one but names no day
 * (`2026-02-30`) goes on: the model refuses it when the edit is checked, saying why ("February
 * 2026 has 28 days"), which is the message the person is shown.
 */
function requireDate(text: unknown): string {
  if (typeof text !== "string" || !DATE_FORM.test(text)) {
    reject("edit.invalid-value", reasons().gantt.badDate(String(text)));
  }
  return text;
}

function requireDuration(text: unknown): string {
  const match = typeof text === "string" ? DURATION_FORM.exec(text) : null;
  if (!match || Number(match[1]) <= 0) {
    reject("edit.invalid-value", reasons().gantt.badDuration(String(text), DURATION_UNITS));
  }
  return text as string;
}

/** The ids of an `after` or `until` list, each one an id that can stand there, once. */
function requireIds(ids: readonly string[], clause: "after" | "until"): string[] {
  const words = reasons().gantt;
  const list: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !isIdentifierText(id)) {
      reject("edit.invalid-value", words.badId(String(id), clause));
    }
    if (GANTT_RESERVED_IDS.includes(id)) reject("edit.invalid-value", words.reservedId(id));
    if (!list.includes(id)) list.push(id);
  }
  return list;
}

/** An end clause ready to write: its word and the text after it. */
interface WrittenEnd {
  readonly word: "for" | "to" | "until";
  readonly text: string;
}

function readEnd(end: TaskEnd): WrittenEnd {
  const given = (["for", "to", "until"] as const).filter((word) => word in end);
  if (given.length !== 1) reject("edit.invalid-value", reasons().gantt.endForm);
  const word = given[0]!;
  if (word === "for") return { word, text: requireDuration((end as { for: string }).for) };
  if (word === "to") return { word, text: requireDate((end as { to: string }).to) };
  const ids = requireIds((end as { until: readonly string[] }).until, "until");
  if (ids.length === 0) reject("edit.invalid-value", reasons().gantt.noIds("until"));
  return { word, text: ids.join(", ") };
}

/** An instant as the language writes a date: the day alone at midnight, else with the time. */
function dateText(time: number): string {
  return formatDate(time, time % SECONDS_PER_DAY !== 0);
}

/** A length of working time in the largest unit that holds it whole: `10d`, `36h`, `90min`. */
function durationText(seconds: number): string {
  for (const [unit, size] of [
    ["d", SECONDS_PER_DAY],
    ["h", 3600],
    ["min", 60],
  ] as const) {
    if (seconds % size === 0) return `${seconds / size}${unit}`;
  }
  return `${seconds}s`;
}

// ---------------------------------------------------------------------- schedule and status

/**
 * Rewrites the schedule clauses of a task, milestone or marker. Only the clause tokens change: a
 * value is replaced where it stands, a removed clause goes with the spaces before it, and a new
 * start clause goes after the start clauses written (after the label, or the id without one), a
 * new end clause after the start clauses.
 */
export function setTaskSchedule(ctx: EditContext, op: OperationOf<"setTaskSchedule">): TextEdit[] {
  const element = requireBar(ctx, op.task);
  const kind = element.kind as BarKind;
  const startWord = kind === "task" ? "from" : "at";
  const from = op.from === undefined || op.from === null ? op.from : requireDate(op.from);
  const after =
    op.after === undefined || op.after === null ? op.after : requireIds(op.after, "after");
  let end: WrittenEnd | null | undefined;
  if (op.end !== undefined && op.end !== null) {
    if (kind !== "task") reject("edit.invalid-value", reasons().gantt.endOnPoint(op.task, kind));
    end = readEnd(op.end);
  } else end = op.end;

  const text = ctx.text;
  const { anchor, clauses } = readStatement(element.node);
  const startClause = clauses.find((c) => c.word === startWord);
  const afterClause = clauses.find((c) => c.word === "after");
  const endClause = clauses.find((c) => END_WORDS.includes(c.word));
  const edits: TextEdit[] = [];
  const added: string[] = [];
  /** Where new clauses go: after the label and the start clauses that stay. */
  let at = anchor;
  const drop = (clause: Clause) =>
    edits.push({ start: spacesBefore(text, clause.start), end: clause.end, newText: "" });
  const replace = (arg: Arg | undefined, clause: Clause, value: string) => {
    if (!arg) edits.push({ start: clause.end, end: clause.end, newText: ` ${value}` });
    else if (text.slice(arg.start, arg.end) !== value) {
      edits.push({ start: arg.start, end: arg.end, newText: value });
    }
  };

  if (startClause) {
    if (from === null) drop(startClause);
    else {
      at = Math.max(at, startClause.end);
      if (from !== undefined) replace(startClause.values[0], startClause, from);
    }
  } else if (typeof from === "string") added.push(`${startWord} ${from}`);

  if (afterClause) {
    if (after === null || (after && after.length === 0)) drop(afterClause);
    else {
      at = Math.max(at, afterClause.end);
      const written = afterClause.values.map((arg) => text.slice(arg.start, arg.end));
      if (after && written.join(", ") !== after.join(", ")) {
        edits.push({
          start: afterClause.start,
          end: afterClause.end,
          newText: `after ${after.join(", ")}`,
        });
      }
    }
  } else if (after && after.length > 0) added.push(`after ${after.join(", ")}`);

  if (endClause) {
    if (end === null) drop(endClause);
    else if (end) {
      if (endClause.word !== end.word) {
        edits.push({
          start: endClause.start,
          end: endClause.end,
          newText: `${end.word} ${end.text}`,
        });
      } else if (end.word === "until") {
        const first = endClause.values[0];
        const last = endClause.values[endClause.values.length - 1];
        if (!first || !last)
          edits.push({ start: endClause.end, end: endClause.end, newText: ` ${end.text}` });
        else if (text.slice(first.start, last.end) !== end.text) {
          edits.push({ start: first.start, end: last.end, newText: end.text });
        }
      } else replace(endClause.values[0], endClause, end.text);
    }
  } else if (end) added.push(`${end.word} ${end.text}`);

  if (added.length > 0) edits.push({ start: at, end: at, newText: ` ${added.join(" ")}` });
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/**
 * Writes the status words of a task or milestone after its clauses, replacing the ones written:
 * `done` or `active`, then `critical`. A word that stays is left where it is.
 */
export function setTaskStatus(ctx: EditContext, op: OperationOf<"setTaskStatus">): TextEdit[] {
  const element = requireBar(ctx, op.task, ["task", "milestone"]);
  if (op.status !== null && op.status !== "done" && op.status !== "active") {
    reject("edit.invalid-value", reasons().gantt.badStatus(String(op.status)));
  }
  const text = ctx.text;
  const { anchor, clauses } = readStatement(element.node);
  const written = clauses.filter((c) => STATUS_WORDS.includes(c.word));
  const desired = [
    ...(op.status === null ? [] : [op.status]),
    ...(op.critical ? ["critical"] : []),
  ];
  if (written.map((c) => c.word).join(" ") === desired.join(" ")) return [];
  // The words written go, and the ones asked for are written after the clauses, in one order.
  const edits: TextEdit[] = written.map((clause) => ({
    start: spacesBefore(text, clause.start),
    end: clause.end,
    newText: "",
  }));
  let at = anchor;
  for (const clause of clauses) if (!written.includes(clause)) at = Math.max(at, clause.end);
  if (desired.length > 0) edits.push({ start: at, end: at, newText: ` ${desired.join(" ")}` });
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- creating

/** The block of a section and the statement that holds it, for an item to go into. */
interface Destination {
  readonly block: Block | undefined;
  /** The section's statement; undefined for the chart's body. */
  readonly section: KeywordStatement | undefined;
}

/** Whether the chart's sections are written with a blank line between them. */
function sectionsSeparated(ctx: EditContext): boolean {
  const sections = diagramBody(ctx).statements.filter((s) => isKeyword(s, "section"));
  for (let i = 1; i < sections.length; i++) {
    const gap = ctx.text.slice(sections[i - 1]!.end, sections[i]!.start);
    if (!/\n[ \t]*\r?\n/.test(gap)) return false;
  }
  return true;
}

function sectionDestination(ctx: EditContext, id: string): Destination {
  const parent = requireElement(ctx, id);
  const node = parent.node;
  if (parent.kind !== "section" || node?.kind !== "KeywordStatement") {
    reject("edit.invalid-value", reasons().gantt.notSection(id));
  }
  return { block: node.block, section: node };
}

/**
 * Inserts the text that `render` writes into a destination: before the item at `index`, else after
 * the last item, else as the first thing the block holds. A section brings the blank line that
 * separates the chart's sections.
 */
function insertItem(
  ctx: EditContext,
  destination: Destination,
  index: number | undefined,
  render: (indent: string | null) => string,
  separate: boolean,
): TextEdit {
  const block = destination.block ?? (destination.section ? undefined : diagramBody(ctx));
  if (!block) {
    // A section written without braces opens its block around the item.
    const section = destination.section!;
    return { start: section.end, end: section.end, newText: ` { ${render(null)} }` };
  }
  const items = block.statements.filter(isItem);
  const before = index === undefined ? undefined : items[index];
  const blank = separate && sectionsSeparated(ctx);
  if (before) {
    const edit = insertBeforeStatement(ctx, block, before, render);
    return blank && edit.newText.endsWith(ctx.eol)
      ? { ...edit, newText: edit.newText + ctx.eol }
      : edit;
  }
  const last = items[items.length - 1];
  if (last) {
    const edit = insertAfter(ctx, block, last, render);
    return blank && edit.newText.startsWith(ctx.eol)
      ? { ...edit, newText: ctx.eol + edit.newText }
      : edit;
  }
  if (destination.section)
    return insertIntoBlock(ctx, block, destination.section.start, false, render);
  return insertStatement(ctx, block, ctx.diagram.node.start, render);
}

/**
 * Inserts a `task`, `milestone`, `marker` or `section` into the section `parent` (the top level of
 * the chart without one), before the statement at `index` of that block or after the last, with
 * the clauses given. A section is written with its braces.
 */
export function createTask(ctx: EditContext, op: OperationOf<"createTask">): TextEdit[] {
  requireGantt(ctx);
  const words = reasons().gantt;
  const kind = op.elementKind;
  if (!ITEM_KEYWORDS.has(kind)) reject("edit.invalid-value", words.badKind(String(kind)));
  const destination: Destination =
    op.parent === undefined
      ? { block: undefined, section: undefined }
      : sectionDestination(ctx, op.parent);
  if (kind === "section" && op.parent !== undefined) {
    reject("edit.invalid-value", words.sectionInSection);
  }
  if (op.index !== undefined) requireIndex(op.index);
  const section = kind === "section";
  if (section && (op.from !== undefined || op.after !== undefined || op.end !== undefined)) {
    reject("edit.invalid-value", words.sectionClauses);
  }
  const id = op.id ?? freeId(ctx, kind);
  if (op.id !== undefined) {
    if (!isIdentifierText(id)) reject("edit.invalid-id", reasons().ids.invalid(id));
    if (GANTT_RESERVED_IDS.includes(id)) reject("edit.invalid-value", words.reservedId(id));
    if (usedIds(ctx).has(id)) reject("edit.invalid-value", words.idUsed(id, ctx.diagram.id));
  }
  const parts: string[] = [];
  if (op.from !== undefined)
    parts.push(`${kind === "task" ? "from" : "at"} ${requireDate(op.from)}`);
  if (op.after !== undefined) {
    const ids = requireIds(op.after, "after");
    if (ids.length > 0) parts.push(`after ${ids.join(", ")}`);
  }
  if (op.end !== undefined) {
    if (kind !== "task") reject("edit.invalid-value", words.endOnPoint(id, kind));
    const end = readEnd(op.end);
    parts.push(`${end.word} ${end.text}`);
  }
  const label = op.label !== undefined ? ` ${quoteString(op.label)}` : "";
  const render = (indent: string | null) =>
    section
      ? indent === null
        ? `section ${id}${label} { }`
        : `section ${id}${label} {${ctx.eol}${indent}}`
      : `${kind} ${id}${label}${parts.map((part) => ` ${part}`).join("")}`;
  const edits = [insertItem(ctx, destination, op.index, render, section)];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- calendar

/** Where a new calendar statement goes: after the chart's other statements, before its rows. */
function calendarAnchor(
  ctx: EditContext,
  skip: ReadonlySet<Statement>,
): { after: Statement } | { before: Statement } | null {
  const statements = diagramBody(ctx).statements;
  const firstItem = statements.findIndex(isItem);
  for (let i = (firstItem < 0 ? statements.length : firstItem) - 1; i >= 0; i--) {
    if (!skip.has(statements[i]!)) return { after: statements[i]! };
  }
  return firstItem >= 0 ? { before: statements[firstItem]! } : null;
}

/**
 * The items of a calendar list: weekday names, `weekends` and dates, once each. A date that names
 * no day goes on, for the model to refuse with its reason, as `requireDate` leaves it.
 */
function requireDays(items: readonly string[]): string[] {
  const list: string[] = [];
  for (const item of items) {
    const day = typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item);
    if (!day && !(WEEKDAYS as readonly string[]).includes(item) && item !== "weekends") {
      reject("edit.invalid-value", reasons().gantt.notDay(String(item)));
    }
    if (!list.includes(item)) list.push(item);
  }
  return list;
}

/**
 * Rewrites the chart's `exclude` and `include` statements to the lists given, deleting the one
 * whose list is empty. A list that is not written yet becomes one statement, after the chart's
 * other statements and before its first row.
 */
export function setCalendar(ctx: EditContext, op: OperationOf<"setCalendar">): TextEdit[] {
  requireGantt(ctx);
  const body = diagramBody(ctx);
  const lists = [
    ["exclude", requireDays(op.exclude)],
    ["include", requireDays(op.include)],
  ] as const;
  const edits: TextEdit[] = [];
  const doomed = new Set<Statement>();
  for (const [keyword, items] of lists) {
    const written = body.statements.filter((s): s is KeywordStatement => isKeyword(s, keyword));
    if (items.length === 0) {
      for (const statement of written) doomed.add(statement);
    } else if (written.length > 1) {
      for (const statement of written.slice(1)) doomed.add(statement);
    }
  }
  if (doomed.size > 0)
    edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, [...doomed]));
  for (const [keyword, items] of lists) {
    if (items.length === 0) continue;
    const text = items.join(", ");
    const first = body.statements.find((s): s is KeywordStatement => isKeyword(s, keyword));
    if (first) {
      const args = first.args;
      const last = args[args.length - 1];
      if (!last)
        edits.push({ start: first.keyword.end, end: first.keyword.end, newText: ` ${text}` });
      else if (ctx.text.slice(args[0]!.start, last.end) !== text) {
        edits.push({ start: args[0]!.start, end: last.end, newText: text });
      }
      continue;
    }
    const anchor = calendarAnchor(ctx, doomed);
    const render = () => `${keyword} ${text}`;
    if (!anchor) edits.push(insertStatement(ctx, body, ctx.diagram.node.start, render));
    else if ("after" in anchor) edits.push(insertAfter(ctx, body, anchor.after, render));
    else edits.push(insertBeforeStatement(ctx, body, anchor.before, render));
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- chart statements

/** The statements of a chart's look and axis, in the order a chart writes them. */
export const CHART_STATEMENTS: readonly ChartStatement[] = [
  "axisFormat",
  "ticks",
  "weekStart",
  "axis",
  "labels",
  "display",
  "dependencies",
  "dayWidth",
  "today",
];

/** A value of one of the words a statement takes. */
function oneOf(statement: ChartStatement, value: string, words: readonly string[]): string {
  if (!words.includes(value)) {
    reject(
      "edit.invalid-value",
      reasons().gantt.badStatementValue(statement, value, words.join(", ")),
    );
  }
  return value;
}

/**
 * The text a chart statement is written with for a value, which is checked as the model checks
 * it: `axisFormat` a quoted format of known directives, `ticks` a whole number and a unit,
 * `weekStart`, `axis`, `labels`, `display` and `dependencies` one of their words, `dayWidth` a number
 * in its range, `today` nothing or a day.
 */
function statementText(statement: ChartStatement, value: string | number): string {
  const text = String(value).trim();
  const words = reasons().gantt;
  switch (statement) {
    case "axisFormat": {
      const bad = badDirective(String(value));
      if (bad !== null) {
        reject(
          "edit.invalid-value",
          words.badStatementValue(statement, bad, "the directives of strftime that charts read"),
        );
      }
      return quoteString(String(value));
    }
    case "ticks": {
      const match = new RegExp(`^(\\d+)(${TICK_UNITS.join("|")})$`).exec(text);
      if (!match || Number(match[1]) <= 0) {
        reject(
          "edit.invalid-value",
          words.badStatementValue(
            statement,
            text,
            `a whole number and a unit (${TICK_UNITS.join(", ")}), as 1w`,
          ),
        );
      }
      return text;
    }
    case "weekStart":
      return oneOf(statement, text, WEEKDAYS);
    case "axis":
      return oneOf(statement, text, GANTT_AXIS_PLACES);
    case "labels":
      return oneOf(statement, text, GANTT_LABEL_PLACES);
    case "display":
      return oneOf(statement, text, GANTT_DISPLAYS);
    case "dependencies":
      return oneOf(statement, text, GANTT_DEPENDENCIES);
    case "dayWidth": {
      const number = Number(text);
      const { min, max } = GANTT_DAY_WIDTH_RANGE;
      if (text === "" || !Number.isFinite(number) || number < min || number > max) {
        reject(
          "edit.invalid-value",
          words.badStatementValue(statement, text, `a number from ${min} to ${max}`),
        );
      }
      return String(number);
    }
    case "today": {
      // A day of the calendar, written without a time; one that does not exist is the model's to
      // refuse, saying why.
      if (text === "") return "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) reject("edit.invalid-value", words.badDate(text));
      return text;
    }
  }
}

/**
 * Writes, changes or removes a statement of the chart's axis and look (`null` removes it). A value
 * replaces the one written in place; a new statement goes after the chart's other statements and
 * before its first row, as the calendar's do.
 */
export function setChartStatement(
  ctx: EditContext,
  op: OperationOf<"setChartStatement">,
): TextEdit[] {
  requireGantt(ctx);
  if (!CHART_STATEMENTS.includes(op.statement)) {
    reject(
      "edit.invalid-value",
      reasons().gantt.notStatement(String(op.statement), CHART_STATEMENTS),
    );
  }
  const body = diagramBody(ctx);
  const written = body.statements.find((s): s is KeywordStatement => isKeyword(s, op.statement));
  const edits: TextEdit[] = [];
  if (op.value === null) {
    if (!written) return [];
    edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, [written]));
    verifyNoNewErrors(ctx, edits);
    return edits;
  }
  const text = statementText(op.statement, op.value);
  if (written) {
    const first = written.args[0];
    const last = written.args[written.args.length - 1];
    if (!first || !last) {
      if (text !== "")
        edits.push({ start: written.keyword.end, end: written.keyword.end, newText: ` ${text}` });
    } else if (text === "") {
      edits.push({ start: written.keyword.end, end: last.end, newText: "" });
    } else if (ctx.text.slice(first.start, last.end) !== text) {
      edits.push({ start: first.start, end: last.end, newText: text });
    }
  } else {
    const render = () => (text === "" ? op.statement : `${op.statement} ${text}`);
    const anchor = calendarAnchor(ctx, new Set());
    if (!anchor) edits.push(insertStatement(ctx, body, ctx.diagram.node.start, render));
    else if ("after" in anchor) edits.push(insertAfter(ctx, body, anchor.after, render));
    else edits.push(insertBeforeStatement(ctx, body, anchor.before, render));
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- moving

/**
 * Moves a task, milestone or marker into the section `parent` (the top level with null), or a
 * section among the chart's sections, before the statement at `index` of the destination or after
 * the last; the statement goes whole, with the comments above it, re-indented. The dates follow
 * from the new source order.
 */
export function moveBar(ctx: EditContext, op: OperationOf<"moveElement">): TextEdit[] {
  const words = reasons().gantt;
  const element = requireElement(ctx, op.element);
  const node = element.node;
  if (node?.kind !== "KeywordStatement" || !isItem(node)) {
    reject("edit.unsafe-target", words.notItem(op.element));
  }
  const section = element.kind === "section";
  const destination: Destination =
    op.parent === null
      ? { block: undefined, section: undefined }
      : sectionDestination(ctx, op.parent);
  if (section && op.parent !== null) reject("edit.invalid-value", words.sectionInSection);
  if (op.at) reject("edit.invalid-value", words.noPoint);
  const block = destination.block ?? (destination.section ? undefined : diagramBody(ctx));
  const items = block ? block.statements.filter(isItem) : [];
  if (op.index !== undefined) {
    requireIndex(op.index);
    if (op.index > items.length) {
      reject("edit.invalid-value", words.outOfRange(op.index, items.length));
    }
  }
  const at = Math.min(op.index ?? items.length, items.length);
  const own = items.indexOf(node);
  if (own >= 0 && (at === own || at === own + 1)) return [];

  const parent = element.groupPath[element.groupPath.length - 1];
  const source = parent ? sectionDestination(ctx, parent).block : diagramBody(ctx);
  if (!source) reject("edit.unsafe-target", words.notItem(op.element));
  const cut = cutDeclaration(ctx, source, node);
  const edits = [...(section ? withoutBlankLine(ctx, cut.edits) : cut.edits)];
  const render = (indent: string | null) =>
    indent === null ? cut.statement : reindent(cut.text, cut.indent, indent);
  edits.push(insertItem(ctx, destination, op.index, render, section));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/**
 * Widens the deletion of a section's lines over a blank line, so that taking a section out leaves
 * one blank line between its neighbours, not two, and none before the brace that closes the chart
 * when it was the last: the blank line that follows when one comes before too, else the one before
 * a section that closes the block.
 */
function withoutBlankLine(ctx: EditContext, edits: readonly TextEdit[]): TextEdit[] {
  const text = ctx.text;
  return edits.map((edit) => {
    const before = /\n([ \t]*\r?\n)$/.exec(text.slice(0, edit.start));
    if (!before) return edit;
    const next = /^[ \t]*\r?\n/.exec(text.slice(edit.end));
    if (next) return { ...edit, end: edit.end + next[0].length };
    return /^[ \t]*\}/.test(text.slice(edit.end))
      ? { ...edit, start: edit.start - before[1]!.length }
      : edit;
  });
}

// ---------------------------------------------------------------------- removing

/**
 * What removing `removed` bars changes in the tasks that stay, so that no other date moves: the
 * ids go from every `after` and `until` list; a task whose last start clause goes, and a task
 * that started by following the previous one in source order, is written `from` its current start
 * (`at` on a milestone or marker); an `until` that loses its last id becomes the `for` it lasted.
 */
export function removalFixes(
  ctx: EditContext,
  removed: ReadonlySet<string>,
): { edits: TextEdit[]; notes: string[] } {
  const edits: TextEdit[] = [];
  const notes: string[] = [];
  if (ctx.diagram.type !== "gantt") return { edits, notes };
  const text = ctx.text;
  const words = messages().notes;
  const bars = ctx.diagram.elements.filter(
    (e): e is Element & { readonly node: KeywordStatement } =>
      e.task !== null && e.node?.kind === "KeywordStatement",
  );
  // A task or milestone without a start follows the previous task or milestone, markers aside.
  const previousOf = new Map<string, string | null>();
  let previous: string | null = null;
  for (const bar of bars) {
    previousOf.set(bar.id, previous);
    if (bar.kind !== "marker") previous = bar.id;
  }
  for (const bar of bars) {
    if (removed.has(bar.id)) continue;
    const task = bar.task!;
    const startWord = bar.kind === "task" ? "from" : "at";
    const { anchor, clauses } = readStatement(bar.node);
    const fixes = (clause: Clause) =>
      clause.values.flatMap((arg, i) => {
        const id = singleIdent(arg)?.text;
        return id !== undefined && removed.has(id) ? [i] : [];
      });
    const keeps = (clause: Clause) => fixes(clause).length < clause.values.length;
    /** The clause with the removed ids left out, or null when none is left. */
    const without = (clause: Clause): TextEdit[] | null =>
      keeps(clause) ? removeListItems(clause.values, new Set(fixes(clause))) : null;
    const start = task.start === null ? null : dateText(task.start);
    const hasStart = clauses.some((c) => c.word === startWord || c.word === "after");

    const afterClause = clauses.find((c) => c.word === "after");
    if (afterClause && fixes(afterClause).length > 0) {
      const kept = without(afterClause);
      if (kept) edits.push(...kept);
      else if (!clauses.some((c) => c.word === startWord) && start !== null) {
        edits.push({
          start: afterClause.start,
          end: afterClause.end,
          newText: `${startWord} ${start}`,
        });
        notes.push(words.keptStart(bar.id, startWord, start));
      } else {
        edits.push({
          start: spacesBefore(text, afterClause.start),
          end: afterClause.end,
          newText: "",
        });
      }
    }
    const untilClause = clauses.find((c) => c.word === "until");
    if (untilClause && fixes(untilClause).length > 0) {
      const kept = without(untilClause);
      if (kept) edits.push(...kept);
      else if (task.working !== null && task.finish !== null) {
        const length = durationText(task.working);
        edits.push({ start: untilClause.start, end: untilClause.end, newText: `for ${length}` });
        notes.push(words.keptEnd(bar.id, length));
      } else {
        edits.push({
          start: spacesBefore(text, untilClause.start),
          end: untilClause.end,
          newText: "",
        });
      }
    }
    // No start of its own: it followed the previous one, which goes.
    const follower = previousOf.get(bar.id);
    if (
      !hasStart &&
      bar.kind !== "marker" &&
      follower !== null &&
      follower !== undefined &&
      removed.has(follower) &&
      start !== null
    ) {
      edits.push({ start: anchor, end: anchor, newText: ` ${startWord} ${start}` });
      notes.push(words.keptStart(bar.id, startWord, start));
    }
  }
  return { edits, notes };
}
