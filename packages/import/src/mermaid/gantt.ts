import type { Span } from "@meltemi/diagrams-language";
import {
  WEEKDAYS,
  dayOfDate,
  isSafeUrl,
  isWorkingDay,
  nextWorking,
  weekdayOfDay,
  workingCalendar,
  type FlowDiagram,
  type WorkingCalendar,
} from "@meltemi/diagrams-model";
import type { FrontContext } from "../front.js";
import { IdMap, sanitizeId, slugId } from "../ids.js";
import { messages } from "../messages/index.js";
import { trimmedSpan, type SourceLine } from "../report.js";
import { emptyGanttSheet, type GanttItem, type GanttSection, type GanttSheet } from "../writer.js";
import { cleanLabel, partSpan, type Statement } from "./common.js";
import {
  MS_PER_DAY,
  MS_PER_SECOND,
  addDuration,
  dayText,
  formatUsesNow,
  isoText,
  midnight,
  parseDateText,
  readEnd,
  readStart,
  readToday,
  replaySchedule,
  type EndSpec,
  type Ms,
  type ParsedDate,
  type Replayed,
  type ReplaySettings,
  type StartSpec,
  type Today,
} from "./dates.js";

/** What the front matter of a gantt chart says: its title and the settings Mermaid reads there. */
export interface GanttFront {
  readonly title?: string;
  /** `compact` from `displayMode` or `config.gantt.displayMode`. */
  readonly displayMode?: string;
  /** `config.gantt.topAxis`. */
  readonly topAxis?: boolean;
}

/** The statements of a gantt chart: one per line, `%%` lines as the comments of the next one. */
export function ganttStatements(lines: readonly SourceLine[]): {
  statements: Statement[];
  trailing: string[];
} {
  const statements: Statement[] = [];
  let comments: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.text.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("%%")) {
      if (!trimmed.startsWith("%%{")) comments.push(trimmed.slice(2).trim());
      continue;
    }
    let text = trimmed;
    let span = trimmedSpan(line);
    let offset = line.generated ? -1 : span.start;
    // `accDescr {` runs over lines up to the first `}`.
    if (/^accDescr\s*\{/i.test(trimmed) && !trimmed.includes("}")) {
      let last = i;
      for (let j = i + 1; j < lines.length; j++) {
        text += `\n${lines[j]!.text}`;
        last = j;
        if (lines[j]!.text.includes("}")) break;
      }
      text = text.trim();
      span = { start: span.start, end: lines[last]!.span.end };
      offset = -1;
      i = last;
    }
    statements.push({ text, span, offset, comments });
    comments = [];
  }
  return { statements, trailing: comments };
}

const TAGS = ["active", "done", "crit", "milestone", "vert"] as const;
type Tag = (typeof TAGS)[number];

/** Words a task cannot be named: they end a list of ids in a chart. */
const RESERVED_IDS = ["from", "after", "for", "to", "until", "at", "done", "active", "critical"];

/** Tick intervals: Mermaid's word, and the unit of `ticks`. */
const TICK_UNITS: Readonly<Record<string, string>> = {
  second: "s",
  minute: "min",
  hour: "h",
  day: "d",
  week: "w",
  month: "mo",
};

/** The longest a duration may be, in days: the language refuses a longer one. */
const MAX_DAYS = 36_600;

/** What a field of a task line says, with where it stands in the source. */
interface Field {
  readonly text: string;
  readonly span: Span;
}

interface RawSection {
  readonly name: string;
  readonly comments: string[];
  sheetId: string;
}

interface RawTask {
  readonly st: Statement;
  readonly name: string;
  readonly nameSpan: Span;
  /** Mermaid's id: the one written, or `task<n>`. */
  readonly id: string;
  readonly explicitId: boolean;
  readonly idSpan: Span;
  readonly tags: Readonly<Record<Tag, boolean>>;
  /** The start field; null when the line has no start, so the task follows the one before. */
  readonly start: Field | null;
  readonly end: Field;
  readonly section: RawSection | null;
  readonly comments: string[];
  /** The task declared before this one, which a task without a start follows. */
  readonly prev: RawTask | null;
  sheetId: string;
  url: string | null;
  /** What the start and the end say, read with the chart's date format once it is known. */
  startSpec: StartSpec;
  endSpec: EndSpec;
  /** The ids a loop made it drop from `after` and `until`. */
  readonly cut: Set<string>;
}

interface RawClick {
  readonly st: Statement;
  readonly ids: string[];
  readonly href: string | null;
  readonly call: boolean;
}

/** What a written item is compared with once the sheet is compiled. */
interface Expectation {
  readonly id: string;
  readonly kind: GanttItem["kind"];
  readonly span: Span;
  /** The start Mermaid draws a task from, or the instant it draws a milestone or a marker at. */
  readonly start: Ms;
  /** The end Mermaid draws a task to. */
  readonly end: Ms;
}

/** What was written for an item, which a repair may change. */
interface Written {
  readonly item: GanttItem;
  /** The sheet ids of what it waits for: what it follows, and what it ends at. */
  readonly waits: string[];
  /** Where its end stands in the source. */
  readonly endSpan: Span;
}

/** The calendar the sheet is written with. */
interface Calendar {
  /** What `exclude` lists. */
  readonly exclude: string[];
  /** What `include` lists. */
  readonly include: string[];
  /** How many weekdays are excluded. */
  readonly weekdays: number;
  readonly working: WorkingCalendar;
}

/** What building one item reads, shared by all of them. */
interface Build {
  readonly settings: ReplaySettings;
  readonly calendar: Calendar;
  readonly today: Today;
  readonly byMermaidId: ReadonlyMap<string, RawTask>;
  readonly bySheetId: ReadonlyMap<string, RawTask>;
  readonly replayOf: ReadonlyMap<RawTask, Replayed>;
}

/** Where a start comes from, once the task has been read. */
type StartPlan =
  | { readonly kind: "after"; readonly ids: string[] }
  | { readonly kind: "date"; readonly ms: Ms }
  | { readonly kind: "chain" }
  | { readonly kind: "today" };

/** Splits the data of a task by commas, keeping where each part stands in the line. */
function splitFields(text: string, from: number): { text: string; index: number }[] {
  const out: { text: string; index: number }[] = [];
  let at = from;
  for (const part of text.slice(from).split(",")) {
    out.push({ text: part, index: at });
    at += part.length + 1;
  }
  return out;
}

/** The tokens of a list such as `excludes`: lower case, split on blanks and commas, added to the old. */
function mergeTokens(existing: readonly string[], text: string): string[] {
  const merged = [...existing];
  for (const token of text.toLowerCase().split(/[\s,]+/)) {
    if (token !== "" && !merged.includes(token)) merged.push(token);
  }
  return merged;
}

/** The value of a keyword line: what follows it, up to the `#` or `;` Mermaid's lexer stops at. */
function valueOf(rest: string, hash = true): string {
  const cut = rest.search(hash ? /[#;]/ : /;/);
  return (cut < 0 ? rest : rest.slice(0, cut)).trim();
}

const escapeRegExp = (text: string): string => text.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&");

/** The strongly connected components of a graph, by Tarjan's algorithm without recursion. */
function stronglyConnected(graph: readonly (readonly number[])[]): number[][] {
  const count = graph.length;
  const index = new Array<number>(count).fill(-1);
  const low = new Array<number>(count).fill(0);
  const onStack = new Array<boolean>(count).fill(false);
  const stack: number[] = [];
  const components: number[][] = [];
  let counter = 0;
  for (let root = 0; root < count; root++) {
    if (index[root] !== -1) continue;
    const work: { node: number; next: number }[] = [{ node: root, next: 0 }];
    index[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = true;
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const targets = graph[frame.node]!;
      if (frame.next < targets.length) {
        const to = targets[frame.next++]!;
        if (index[to] === -1) {
          index[to] = low[to] = counter++;
          stack.push(to);
          onStack[to] = true;
          work.push({ node: to, next: 0 });
        } else if (onStack[to]) {
          low[frame.node] = Math.min(low[frame.node]!, index[to]!);
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low[parent.node] = Math.min(low[parent.node]!, low[frame.node]!);
      if (low[frame.node] === index[frame.node]) {
        const component: number[] = [];
        let member: number;
        do {
          member = stack.pop()!;
          onStack[member] = false;
          component.push(member);
        } while (member !== frame.node);
        components.push(component);
      }
    }
  }
  return components;
}

/** A number as a duration writes it: no float noise. */
const num = (n: number): string => String(Math.round(n * 1_000_000) / 1_000_000);

/**
 * An axis format in d3's directives, as Meltemi writes it: `%c`, `%x` and `%X` in their d3 forms,
 * the `_` and `0` flags where they have an equivalent, and the directives that have none dropped.
 * A directive d3 does not know is written as its letter, as d3 does.
 */
export function axisFormatOf(source: string): { format: string; dropped: string[] } {
  const kept = "aAbBdeHIjmMpqSUVwWyY";
  const dropped: string[] = [];
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch !== "%") {
      out += ch;
      continue;
    }
    let j = i + 1;
    let flag = "";
    if (j < source.length && "-_0".includes(source[j]!)) {
      flag = source[j]!;
      j++;
    }
    const c = source[j];
    // A lone `%` at the end writes nothing.
    if (c === undefined) break;
    i = j;
    const written = `%${flag}${c}`;
    if (c === "%") out += "%%";
    else if (c === "c") out += "%-m/%-d/%Y, %-I:%M:%S %p";
    else if (c === "x") out += "%-m/%-d/%Y";
    else if (c === "X") out += "%-I:%M:%S %p";
    else if (kept.includes(c)) {
      if (flag === "-") out += `%-${c}`;
      else if (flag === "0") out += c === "e" ? "%d" : `%${c}`;
      else if (flag === "_") {
        if (c === "d" || c === "e") out += "%e";
        else {
          out += `%${c}`;
          dropped.push(written);
        }
      } else out += `%${c}`;
    } else if ("fgGLQsuZ".includes(c)) dropped.push(written);
    else out += c;
  }
  return { format: out, dropped };
}

/** The setting a `config:` key of a gantt chart's front matter stands for, if it is one. */
export function ganttConfigValue(path: string, value: string): GanttFront | null {
  if (path === "gantt.displayMode") return { displayMode: value };
  if (path === "gantt.topAxis") return { topAxis: /^true$/i.test(value) };
  return null;
}

/** Builds the gantt chart of a Mermaid `gantt`. */
export class GanttReader {
  private readonly ids: IdMap;
  private readonly sections: RawSection[] = [];
  private readonly tasks: RawTask[] = [];
  private readonly clicks: RawClick[] = [];
  private readonly trailing: string[] = [];
  /** Comments waiting for the next statement that is written. */
  private pending: string[] = [];
  private current: RawSection | null = null;
  private autoIds = 0;

  private dateFormat: { text: string; span: Span } | null = null;
  private axisFormat: { text: string; span: Span } | null = null;
  private tickInterval: { text: string; span: Span } | null = null;
  private todayMarker: { text: string; span: Span } | null = null;
  private weekday: string | null = null;
  private weekend: "friday" | "saturday" = "saturday";
  private excludes: { tokens: string[]; span: Span } | null = null;
  private includes: { tokens: string[]; span: Span } | null = null;
  private inclusiveEndDates = false;
  private topAxis: boolean;
  private readonly compact: boolean;
  private title: string | undefined;
  private accTitle: string | undefined;
  private description: string | undefined;
  private readonly frontTitle: string | undefined;

  private zoneReported = false;
  private fractionReported = false;
  private readonly expectations: Expectation[] = [];
  private readonly written = new Map<string, Written>();
  /** The chart's id: its title as words, once the sheet is finished; empty without a title. */
  private id = "";

  constructor(
    private readonly ctx: FrontContext,
    private readonly key: string,
    front: GanttFront,
  ) {
    this.ids = new IdMap(ctx.reporter, RESERVED_IDS);
    this.topAxis = front.topAxis === true;
    this.compact = front.displayMode === "compact";
    this.frontTitle = front.title;
  }

  private get reporter() {
    return this.ctx.reporter;
  }

  /**
   * The id the chart's title gives, as words (`GenAI` is `genai`); empty when it has no title.
   * Meaningful once `finish` has run.
   */
  get name(): string {
    return this.id;
  }

  /** Reads the statement that follows `gantt` on its own line, which Mermaid allows. */
  header(header: Statement): void {
    const rest = header.text.replace(/^gantt\b/, "").trim();
    if (rest !== "") this.statement({ ...header, text: rest, offset: -1, comments: [] });
  }

  statement(st: Statement): void {
    const t = st.text;
    this.pending.push(...st.comments);
    let m: RegExpExecArray | null;
    if ((m = /^accTitle\s*:\s*([^\n]*)$/i.exec(t))) {
      this.accTitle = m[1]!.trim();
      this.reporter.mapped("mermaid.accTitle");
      return;
    }
    if ((m = /^accDescr\s*:\s*([^\n]*)$/i.exec(t)) || (m = /^accDescr\s*\{([\s\S]*)$/i.exec(t))) {
      this.description = m[1]!
        .replace(/\}\s*$/, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .join("\n");
      this.reporter.mapped("mermaid.accDescr");
      return;
    }
    if ((m = /^click\s+(.*)$/i.exec(t))) return this.click(st, m[1]!);
    if ((m = /^dateFormat\s+(.*)$/i.exec(t))) {
      const text = valueOf(m[1]!);
      if (text !== "") this.dateFormat = { text, span: st.span };
      return;
    }
    if (/^inclusiveEndDates$/i.test(t)) {
      this.inclusiveEndDates = true;
      this.reporter.mapped("gantt.inclusiveEndDates");
      return;
    }
    if (/^topAxis$/i.test(t)) {
      this.topAxis = true;
      this.reporter.mapped("gantt.topAxis");
      return;
    }
    if ((m = /^axisFormat\s+(.*)$/i.exec(t))) {
      const text = valueOf(m[1]!);
      if (text !== "") this.axisFormat = { text, span: st.span };
      return;
    }
    if ((m = /^tickInterval\s+(.*)$/i.exec(t))) {
      const text = valueOf(m[1]!);
      if (text !== "") this.tickInterval = { text, span: st.span };
      return;
    }
    if ((m = /^includes\s+(.*)$/i.exec(t))) {
      this.includes = {
        tokens: mergeTokens(this.includes?.tokens ?? [], valueOf(m[1]!)),
        span: this.includes?.span ?? st.span,
      };
      return;
    }
    if ((m = /^excludes\s+(.*)$/i.exec(t))) {
      this.excludes = {
        tokens: mergeTokens(this.excludes?.tokens ?? [], valueOf(m[1]!)),
        span: this.excludes?.span ?? st.span,
      };
      return;
    }
    if ((m = /^todayMarker\s+(.*)$/i.exec(t))) {
      const text = valueOf(m[1]!, false);
      if (text !== "") this.todayMarker = { text, span: st.span };
      return;
    }
    if ((m = /^weekday\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.exec(t))) {
      this.weekday = m[1]!.toLowerCase();
      this.reporter.mapped("gantt.weekday");
      return;
    }
    if ((m = /^weekend\s+(friday|saturday)$/i.exec(t))) {
      this.weekend = m[1]!.toLowerCase() as "friday" | "saturday";
      this.reporter.mapped("gantt.weekend");
      return;
    }
    if ((m = /^title\s+(.+)$/i.exec(t))) {
      this.title = cleanLabel(m[1]!, this.reporter, st.span);
      this.reporter.mapped("gantt.title");
      return;
    }
    if ((m = /^section\s+(.+)$/i.exec(t))) {
      const name = cleanLabel(m[1]!, this.reporter, st.span);
      const section: RawSection = { name, comments: this.take(), sheetId: "" };
      this.sections.push(section);
      this.current = section;
      this.reporter.mapped("gantt.section");
      return;
    }
    if (this.task(st)) return;
    this.reporter.syntax("gantt.statement", st.span, messages().common.cannotRead(t));
    this.trailing.push(messages(this.ctx.locale).content.notImported(t));
  }

  /** The comments waiting for a statement, which now takes them. */
  private take(): string[] {
    const comments = this.pending;
    this.pending = [];
    return comments;
  }

  // -------------------------------------------------------------------------------------------
  // Reading tasks

  /** `name : [tags,] [id,] [start,] end`; false when the line is not one. */
  private task(st: Statement): boolean {
    const t = st.text;
    const colon = t.indexOf(":");
    if (colon <= 0 || t.slice(0, colon).trim() === "" || t.slice(colon + 1).trim() === "") {
      return false;
    }
    const fields = splitFields(t, colon + 1);
    const tags: Record<Tag, boolean> = {
      active: false,
      done: false,
      crit: false,
      milestone: false,
      vert: false,
    };
    // Tags stand first, in any order.
    for (;;) {
      const first = fields[0];
      const tag = first ? TAGS.find((name) => name === first.text.trim()) : undefined;
      if (!tag) break;
      tags[tag] = true;
      fields.shift();
    }
    if (fields.length < 1 || fields.length > 3) {
      this.reporter.syntax(
        "gantt.statement",
        st.span,
        messages().common.expected("name : [tags,] [id,] [start,] end"),
      );
      this.trailing.push(messages(this.ctx.locale).content.notImported(t));
      return true;
    }
    const parts = fields.map((f): Field => {
      const lead = f.text.length - f.text.trimStart().length;
      const text = f.text.trim();
      return { text, span: partSpan(st, f.index + lead, Math.max(text.length, 1)) };
    });
    const written = parts.length === 3 ? parts[0]! : null;
    const explicitId = written !== null && written.text !== "";
    const name = t.slice(0, colon).trim();
    this.tasks.push({
      st,
      name,
      nameSpan: partSpan(st, 0, name.length),
      id: explicitId ? written.text : `task${++this.autoIds}`,
      explicitId,
      idSpan: written ? written.span : st.span,
      tags,
      start: parts.length >= 2 ? parts[parts.length - 2]! : null,
      end: parts[parts.length - 1]!,
      section: this.current,
      comments: this.take(),
      prev: this.tasks[this.tasks.length - 1] ?? null,
      sheetId: "",
      url: null,
      startSpec: { kind: "previous" },
      endSpec: { kind: "unreadable", text: "" },
      cut: new Set(),
    });
    return true;
  }

  private click(st: Statement, rest: string): void {
    const m = /^(\S+)\s+(.*)$/.exec(rest.trim());
    const href = m ? /\bhref\s+"([^"]*)"/i.exec(m[2]!) : null;
    // A callback is the word `call` outside the link.
    const call = m ? /\bcall\s/i.test(m[2]!.replace(/\bhref\s+"[^"]*"/i, "")) : false;
    if (!m || (!href && !call)) {
      this.reporter.syntax("gantt.statement", st.span, messages().common.cannotRead(st.text));
      this.trailing.push(messages(this.ctx.locale).content.notImported(st.text));
      return;
    }
    this.clicks.push({
      st,
      ids: m[1]!.split(",").filter((id) => id !== ""),
      href: href ? href[1]! : null,
      call,
    });
  }

  // -------------------------------------------------------------------------------------------
  // The sheet

  finish(): GanttSheet {
    const r = this.reporter;
    const m = messages();
    const sheet = emptyGanttSheet(this.key);
    const today = readToday(this.ctx.today)!;
    const format = this.dateFormat?.text ?? "YYYY-MM-DD";
    const settings: ReplaySettings = {
      format,
      excludes: this.excludes?.tokens ?? [],
      includes: this.includes?.tokens ?? [],
      weekend: this.weekend,
      inclusiveEndDates: this.inclusiveEndDates,
      today,
    };

    if (this.dateFormat) {
      r.mapped("gantt.dateFormat");
      if (formatUsesNow(format)) {
        r.approximated(
          "gantt.dateFormat.noYear",
          this.dateFormat.span,
          m.gantt.noYear(this.ctx.today),
        );
      }
    }
    // The calendar first: dates are written on the days that work.
    const calendar = this.calendar(settings, format, today);
    // Ids: the tasks first, so that a section named like one yields.
    this.assignIds();
    const byMermaidId = new Map<string, RawTask>();
    for (const task of this.tasks) byMermaidId.set(task.id, task);
    for (const click of this.clicks) this.applyClick(click, byMermaidId);

    // What every task says, and what Mermaid computes from it.
    for (const task of this.tasks) {
      task.startSpec = task.start ? readStart(task.start.text, settings) : { kind: "previous" };
      task.endSpec = readEnd(task.end.text, settings);
    }
    const replayed = replaySchedule(
      this.tasks.map((task) => ({
        id: task.id,
        prevId: task.prev?.id,
        start: task.startSpec,
        end: task.endSpec,
      })),
      settings,
    );
    this.cutLoops(byMermaidId);
    const replayOf = new Map<RawTask, Replayed>();
    this.tasks.forEach((task, i) => replayOf.set(task, replayed[i]!));

    const built = new Map<RawSection, GanttSection>();
    for (const section of this.sections) {
      const target: GanttSection = {
        id: section.sheetId,
        label: section.name === section.sheetId ? null : section.name,
        items: [],
        comments: section.comments,
      };
      built.set(section, target);
      sheet.sections.push(target);
    }
    const bySheetId = new Map<string, RawTask>();
    for (const task of this.tasks) bySheetId.set(task.sheetId, task);
    const build: Build = { settings, calendar, today, byMermaidId, bySheetId, replayOf };
    let before: RawTask | null = null;
    for (const task of this.tasks) {
      const item = this.build(task, build, before);
      if (item.kind !== "marker") before = task;
      (task.section ? built.get(task.section)!.items : sheet.items).push(item);
    }

    // The statements of the chart itself.
    const title = this.title ?? this.frontTitle ?? this.accTitle;
    if (title !== undefined) {
      sheet.title = title;
      this.id = slugId(title, "", false);
    }
    if (this.description !== undefined) sheet.description = this.description;
    this.axis(sheet);
    if (this.topAxis) sheet.axis = "both";
    if (this.compact) sheet.display = "compact";
    sheet.exclude = calendar.exclude;
    sheet.include = calendar.include;
    this.today(sheet);
    sheet.trailing.push(...this.trailing, ...this.take());
    return sheet;
  }

  /**
   * Drops the `to` or `until` of a task that the compiler leaves without dates because it would end
   * before it starts: the dates of what it follows are not the ones Mermaid computes once other
   * clauses were written differently. A task that waits for one that failed is not the cause.
   */
  repair(diagram: FlowDiagram): boolean {
    const r = this.reporter;
    let changed = false;
    const resolved = (id: string) => (diagram.elementsById.get(id)?.task?.finish ?? null) !== null;
    for (const [id, { item, waits, endSpan }] of this.written) {
      if (item.end === undefined || item.end.word === "for") continue;
      const task = diagram.elementsById.get(id)?.task;
      if (!task || task.start !== null || !waits.every(resolved)) continue;
      r.approximated("gantt.duration", endSpan, messages().gantt.endBeforeStart);
      delete item.end;
      const at = this.expectations.findIndex((e) => e.id === id);
      if (at >= 0) this.expectations.splice(at, 1);
      changed = true;
    }
    return changed;
  }

  /** Compares the dates the compiled sheet resolves to with the ones Mermaid draws. */
  verify(diagram: FlowDiagram): void {
    const r = this.reporter;
    const m = messages();
    /** The last day of an end drawn at midnight, or the instant. */
    const endText = (ms: Ms) => (ms % MS_PER_DAY === 0 ? dayText(ms - 1) : isoText(ms));
    const seconds = (ms: Ms) => Math.floor(ms / MS_PER_SECOND) * MS_PER_SECOND;
    for (const e of this.expectations) {
      const task = diagram.elementsById.get(e.id)?.task;
      if (!task || task.start === null || task.finish === null) continue;
      const start = task.start * MS_PER_SECOND;
      const finish = task.finish * MS_PER_SECOND;
      if (e.kind === "task") {
        if (start === seconds(e.start) && finish === seconds(e.end)) continue;
        r.approximated(
          "gantt.schedule",
          e.span,
          m.gantt.schedule(e.id, isoText(e.start), endText(e.end), isoText(start), endText(finish)),
          [m.gantt.scheduleHint],
        );
      } else {
        if (start === seconds(e.start)) continue;
        r.approximated(
          "gantt.schedule",
          e.span,
          m.gantt.scheduleAt(e.id, isoText(e.start), isoText(start)),
          [m.gantt.scheduleHint],
        );
      }
    }
  }

  /** Writes `weekStart`, `ticks` and `axisFormat`. */
  private axis(sheet: GanttSheet): void {
    const r = this.reporter;
    const m = messages();
    let weeks = false;
    if (this.tickInterval) {
      const match = /^([1-9][0-9]*)(millisecond|second|minute|hour|day|week|month)$/.exec(
        this.tickInterval.text,
      );
      if (!match) {
        r.dropped(
          "gantt.tickInterval.invalid",
          this.tickInterval.span,
          m.gantt.tickInterval(this.tickInterval.text),
        );
      } else if (match[2] === "millisecond") {
        sheet.ticks = "1s";
        r.approximated(
          "gantt.tickInterval.millisecond",
          this.tickInterval.span,
          m.gantt.tickMillisecond,
        );
      } else {
        sheet.ticks = `${match[1]}${TICK_UNITS[match[2]!]}`;
        weeks = match[2] === "week";
        r.mapped("gantt.tickInterval");
      }
    }
    if (this.weekday) sheet.weekStart = this.weekday;
    else if (weeks) sheet.weekStart = "sunday";
    if (this.axisFormat) {
      const { format, dropped } = axisFormatOf(this.axisFormat.text);
      if (dropped.length > 0) {
        r.approximated(
          "gantt.axisFormat.directive",
          this.axisFormat.span,
          m.gantt.axisDirective(dropped),
        );
      } else r.mapped("gantt.axisFormat");
      if (format.trim() === "") {
        r.approximated("gantt.axisFormat.directive", this.axisFormat.span, m.gantt.axisEmpty);
      } else sheet.axisFormat = format;
    }
  }

  /** Writes `today`: Mermaid draws the line unless `todayMarker off`. */
  private today(sheet: GanttSheet): void {
    const r = this.reporter;
    const marker = this.todayMarker;
    if (marker && marker.text.toLowerCase() === "off") {
      r.mapped("gantt.todayMarker.off");
      return;
    }
    sheet.today = true;
    if (marker) r.approximated("gantt.todayMarker", marker.span, messages().gantt.todayMarker);
    else r.mapped("gantt.today");
  }

  /** The calendar the sheet is written with: what `excludes` and `includes` say, and what works. */
  private calendar(settings: ReplaySettings, format: string, today: Today): Calendar {
    const r = this.reporter;
    const m = messages();
    const exclude: string[] = [];
    const weekdays = new Set<number>();
    const dates = new Set<string>();
    const add = (item: string) => {
      if (!exclude.includes(item)) exclude.push(item);
    };
    /** A date of a list as `YYYY-MM-DD`: written so, or in the chart's date format. */
    const dateOf = (token: string): string | null => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return dayOfDate(token) === undefined ? null : token;
      const parsed = parseDateText(token, format, today, false);
      return parsed ? dayText(parsed.ms) : null;
    };
    if (this.excludes) {
      for (const token of this.excludes.tokens) {
        if (token === "weekends") {
          if (settings.weekend === "friday") {
            add("friday");
            add("saturday");
            weekdays.add(4).add(5);
          } else {
            add("weekends");
            weekdays.add(5).add(6);
          }
          r.mapped("gantt.exclude");
          continue;
        }
        const weekday = (WEEKDAYS as readonly string[]).indexOf(token);
        if (weekday >= 0) {
          add(token);
          weekdays.add(weekday);
          r.mapped("gantt.exclude");
          continue;
        }
        const date = dateOf(token);
        if (date === null) {
          r.dropped("gantt.excludes", this.excludes.span, m.gantt.excludes(token));
          continue;
        }
        add(date);
        dates.add(date);
        r.mapped("gantt.exclude");
      }
      if (weekdays.size === 7) {
        // A week without a working day cannot be scheduled.
        r.dropped("gantt.excludes", this.excludes.span, m.gantt.everyDay);
        weekdays.clear();
        exclude.splice(0, exclude.length, ...exclude.filter((item) => /^\d/.test(item)));
      }
    }
    const include: string[] = [];
    if (this.includes) {
      for (const token of this.includes.tokens) {
        const date = dateOf(token);
        if (date === null) {
          r.dropped("gantt.includes", this.includes.span, m.gantt.includes(token));
          continue;
        }
        // A date that nothing excludes works already, and the language refuses to include it.
        if (!weekdays.has(weekdayOfDay(dayOfDate(date)!)) && !dates.has(date)) continue;
        if (!include.includes(date)) include.push(date);
        r.mapped("gantt.include");
      }
    }
    return {
      exclude,
      include,
      weekdays: weekdays.size,
      working: workingCalendar([...weekdays], [...dates], include),
    };
  }

  private assignIds(): void {
    const taken = new Set<string>();
    for (const task of this.tasks) {
      if (!task.explicitId) {
        task.sheetId = this.ids.unique(task.id);
      } else if (taken.has(task.id)) {
        // Mermaid keeps the last of two tasks with one id; the sheet needs both ids apart.
        task.sheetId = this.ids.unique(sanitizeId(task.id));
        this.reporter.add({
          code: "import.renamed-id",
          severity: "info",
          message: messages().import.renamedId(task.id, task.sheetId),
          span: task.idSpan,
          construct: "id",
          status: null,
          essential: false,
        });
      } else task.sheetId = this.ids.id(task.id, task.idSpan);
      taken.add(task.id);
    }
    // A section's name is text, not an identifier: `GenAI` is one word.
    for (const section of this.sections) {
      section.sheetId = this.ids.unique(slugId(section.name, "section", false));
    }
  }

  /**
   * Mermaid cannot date tasks that wait for each other, and a sheet cannot hold them. In every loop
   * of `after`, `until` and following the task before, the references that point at a later task
   * are dropped: each loop has one, and the others point back, so it opens.
   */
  private cutLoops(byMermaidId: ReadonlyMap<string, RawTask>): void {
    const index = new Map<RawTask, number>();
    this.tasks.forEach((task, i) => index.set(task, i));
    /** The ids a task still names in `after` and `until`, that are tasks the sheet can follow. */
    const named = (task: RawTask, from: "after" | "until"): RawTask[] => {
      const spec = from === "after" ? task.startSpec : task.endSpec;
      if (spec.kind !== from) return [];
      return spec.ids
        .filter((id) => !task.cut.has(id))
        .map((id) => byMermaidId.get(id))
        .filter((t): t is RawTask => t !== undefined && t !== task && !t.tags.vert);
    };
    /** The task before each one that is not a marker: what a task without a start follows. */
    const before: (RawTask | null)[] = [];
    let last: RawTask | null = null;
    for (const task of this.tasks) {
      before.push(last);
      if (!task.tags.vert) last = task;
    }
    const edges = (task: RawTask): number[] => {
      // A marker is waited for by nothing, so no loop passes through it.
      if (task.tags.vert) return [];
      const after = named(task, "after");
      const out = [...after, ...named(task, "until")].map((t) => index.get(t)!);
      // Without a start of its own a task follows the one before it that is not a marker; after a
      // marker, a task that follows the task before it is dated instead.
      const spec = task.startSpec;
      const own =
        spec.kind === "after" ? after.length > 0 : spec.kind === "date" && spec.parsed !== null;
      const follows = before[index.get(task)!] ?? null;
      if (!own && follows !== null && !(spec.kind === "previous" && task.prev!.tags.vert)) {
        out.push(index.get(follows)!);
      }
      return out;
    };
    for (let round = 0; round <= this.tasks.length; round++) {
      let cut = false;
      for (const component of stronglyConnected(this.tasks.map(edges))) {
        if (component.length < 2) continue;
        const members = new Set(component);
        for (const i of component) {
          const task = this.tasks[i]!;
          for (const from of ["after", "until"] as const) {
            for (const target of named(task, from)) {
              if (!members.has(index.get(target)!) || index.get(target)! < i) continue;
              task.cut.add(target.id);
              cut = true;
            }
          }
        }
      }
      if (!cut) break;
    }
  }

  private applyClick(click: RawClick, byMermaidId: ReadonlyMap<string, RawTask>): void {
    const r = this.reporter;
    const m = messages();
    if (click.call) r.dropped("gantt.click", click.st.span, m.gantt.click);
    if (click.href === null) return;
    for (const id of click.ids) {
      const task = byMermaidId.get(id);
      if (!task) r.dropped("gantt.click", click.st.span, m.gantt.clickTask(id));
      else if (!isSafeUrl(click.href)) {
        r.dropped("gantt.click", click.st.span, m.gantt.clickUrl(click.href));
      } else {
        task.url = click.href;
        r.mapped("gantt.click.href");
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // One task, milestone or marker

  private build(task: RawTask, ctx: Build, before: RawTask | null): GanttItem {
    const r = this.reporter;
    const m = messages();
    const rep = ctx.replayOf.get(task)!;
    const kind: GanttItem["kind"] = task.tags.vert
      ? "marker"
      : task.tags.milestone
        ? "milestone"
        : "task";
    const label = cleanLabel(task.name, r, task.nameSpan);
    const item: GanttItem = {
      kind,
      id: task.sheetId,
      label: label === task.sheetId ? null : label,
      after: [],
      critical: false,
      comments: task.comments,
    };
    if (task.url !== null) item.url = task.url;
    r.mapped(`gantt.${kind === "marker" ? "vert" : kind}`);

    if (kind === "marker") {
      if (task.tags.active || task.tags.done || task.tags.crit) {
        r.approximated("gantt.vert.status", task.nameSpan, m.gantt.markerStatus);
      }
    } else {
      // Mermaid draws a task that is active and done as active.
      if (task.tags.active) item.status = "active";
      else if (task.tags.done) item.status = "done";
      if (task.tags.crit) item.critical = true;
      for (const tag of ["active", "done", "crit"] as const) {
        if (task.tags[tag]) r.mapped("gantt.tag");
      }
    }

    const start = this.plan(task, rep, ctx, before, kind);
    let explained = start.explained;
    let plan = start.plan;
    // Nothing to follow and nothing written: the task starts on the import's day.
    if (plan.kind === "chain" && (before === null || kind === "marker")) plan = { kind: "today" };
    if (plan.kind === "today") {
      r.approximated(
        "gantt.start",
        task.start?.span ?? task.st.span,
        m.gantt.start(this.ctx.today),
      );
      explained = true;
    }
    if (kind === "task") explained = this.taskClauses(task, item, plan, rep, ctx) || explained;
    else if (kind === "milestone") {
      explained = this.milestoneClauses(task, item, plan, rep, ctx) || explained;
    } else this.markerClauses(item, plan, rep, ctx);
    const waits = [...item.after];
    if (item.end?.word === "until") waits.push(...item.end.value.split(", "));
    if (plan.kind === "chain" && before !== null) waits.push(before.sheetId);
    this.written.set(task.sheetId, { item, waits, endSpan: task.end.span });

    if (!explained && rep.start !== null && rep.end !== null) {
      this.expectations.push({
        id: task.sheetId,
        kind,
        span: task.st.span,
        start: kind === "milestone" ? rep.start + Math.floor((rep.end - rep.start) / 2) : rep.start,
        end: rep.renderEnd ?? rep.end,
      });
    }
    return item;
  }

  /** Where the start of a task comes from: what it says, and what Mermaid makes of it. */
  private plan(
    task: RawTask,
    rep: Replayed,
    ctx: Build,
    before: RawTask | null,
    kind: GanttItem["kind"],
  ): { plan: StartPlan; explained: boolean } {
    const r = this.reporter;
    const m = messages();
    const spec = task.startSpec;
    switch (spec.kind) {
      case "after": {
        const named = this.names(task, spec.ids, "after", task.start!, ctx);
        if (named.ids.length > 0) {
          r.mapped("gantt.task.after");
          return { plan: { kind: "after", ids: named.ids }, explained: named.markers };
        }
        // A marker cannot be followed: the start is the date Mermaid computes.
        if (named.markers && rep.start !== null) {
          return { plan: { kind: "date", ms: rep.start }, explained: false };
        }
        return { plan: { kind: before === null ? "today" : "chain" }, explained: true };
      }
      case "date": {
        if (spec.parsed === null) {
          const field = task.start!;
          r.syntax("gantt.date", field.span, m.gantt.date(spec.text, ctx.settings.format));
          return { plan: { kind: before === null ? "today" : "chain" }, explained: true };
        }
        this.flag(spec.parsed, task.start!.span, ctx.settings.format);
        r.mapped("gantt.task.start");
        return { plan: { kind: "date", ms: spec.parsed.ms }, explained: false };
      }
      case "previous": {
        if (task.prev === null) return { plan: { kind: "today" }, explained: true };
        if (task.prev.tags.vert || kind === "marker") {
          // A task cannot follow a marker, and a marker needs a place of its own.
          return rep.start === null
            ? { plan: { kind: "today" }, explained: true }
            : { plan: { kind: "date", ms: rep.start }, explained: false };
        }
        return { plan: { kind: "chain" }, explained: false };
      }
    }
  }

  /**
   * The ids of an `after` or `until` list that name an item of the chart. An id the chart does
   * not declare is dropped, and so is a marker, which nothing can follow.
   */
  private names(
    task: RawTask,
    ids: readonly string[],
    word: "after" | "until",
    field: Field,
    ctx: Build,
  ): { ids: string[]; markers: boolean } {
    const r = this.reporter;
    const m = messages();
    const out: string[] = [];
    let markers = false;
    for (const id of ids) {
      const at = field.text.search(new RegExp(`(?<![\\w-])${escapeRegExp(id)}(?![\\w-])`));
      const span =
        at < 0
          ? field.span
          : { start: field.span.start + at, end: field.span.start + at + id.length };
      const target = ctx.byMermaidId.get(id);
      if (!target || target === task) {
        r.dropped("gantt.after", span, m.gantt.unknownTask(word, id));
      } else if (task.cut.has(id)) {
        r.dropped("gantt.after", span, m.gantt.loop(word, id));
      } else if (target.tags.vert) {
        r.approximated("gantt.after.marker", span, m.gantt.markerTask(word, id));
        markers = true;
      } else if (!out.includes(target.sheetId)) out.push(target.sheetId);
    }
    return { ids: out, markers };
  }

  /** What the parse of a date drops: a zone or a fraction of a second, each reported once. */
  private flag(parsed: ParsedDate, span: Span, format: string): void {
    const m = messages();
    if (parsed.zone && !this.zoneReported) {
      this.zoneReported = true;
      const timestamp = /^[xX]$/.test(format.trim());
      this.reporter.approximated(
        "gantt.dateFormat.zone",
        span,
        timestamp ? m.gantt.timestamp : m.gantt.zone,
      );
    }
    if (parsed.fraction && !this.fractionReported) {
      this.fractionReported = true;
      this.reporter.approximated("gantt.dateFormat.milliseconds", span, m.gantt.fraction);
    }
  }

  /** The instant, or the start of the next day that works. */
  private working(ms: Ms, ctx: Build): Ms {
    const moved = nextWorking(Math.floor(ms / MS_PER_SECOND), ctx.calendar.working);
    return moved === null ? ms : moved * MS_PER_SECOND;
  }

  /** A task: `from` or `after`, and `for`, `to` or `until`. */
  private taskClauses(
    task: RawTask,
    item: GanttItem,
    plan: StartPlan,
    rep: Replayed,
    ctx: Build,
  ): boolean {
    const r = this.reporter;
    const m = messages();
    switch (plan.kind) {
      case "after":
        item.after = plan.ids;
        break;
      case "date":
        item.from = isoText(this.working(plan.ms, ctx));
        break;
      case "today":
        item.from = isoText(this.working(midnight(ctx.today), ctx));
        break;
      case "chain":
        break;
    }
    const spec = task.endSpec;
    const field = task.end;
    const start = rep.start === null ? null : this.working(rep.start, ctx);
    switch (spec.kind) {
      case "until": {
        const named = this.names(task, spec.ids, "until", field, ctx);
        if (named.ids.length === 0) return true;
        // A task cannot end before it starts: the sheet refuses it, and Mermaid draws nothing.
        const first = Math.min(
          ...named.ids.map((id) => {
            const at = ctx.replayOf.get(ctx.bySheetId.get(id)!)!.start;
            return at === null ? Infinity : this.working(at, ctx);
          }),
        );
        if (start !== null && first <= start) {
          r.approximated("gantt.duration", field.span, m.gantt.endBeforeStart);
          return true;
        }
        item.end = { word: "until", value: named.ids.join(", ") };
        r.mapped("gantt.task.until");
        return named.markers;
      }
      case "date": {
        this.flag(spec.parsed, field.span, ctx.settings.format);
        // What Mermaid draws, which is the written end unless it pushes the end past excluded days.
        const drawn =
          rep.renderEnd ??
          rep.end ??
          spec.parsed.ms + (ctx.settings.inclusiveEndDates ? MS_PER_DAY : 0);
        const to = this.last(drawn, start, ctx);
        if (to === null) {
          r.approximated("gantt.duration", field.span, m.gantt.endBeforeStart);
          return true;
        }
        item.end = { word: "to", value: to };
        r.mapped("gantt.task.end");
        return false;
      }
      case "duration": {
        const written = this.duration(spec, rep, ctx, field);
        if (written === null) return true;
        item.end = { word: "for", value: written.value };
        return written.explained;
      }
      case "unreadable":
        r.approximated("gantt.duration", field.span, m.gantt.duration(spec.text));
        return true;
    }
  }

  /**
   * `to` for an end Mermaid draws at `end`: the last day when it falls at midnight, which a day that
   * works replaces when it does not, or the instant. Null when the end is not after the start.
   */
  private last(end: Ms, start: Ms | null, ctx: Build): string | null {
    let text: string;
    let finish: Ms;
    if (end % MS_PER_DAY === 0) {
      let day = Math.floor(end / MS_PER_DAY) - 1;
      for (let i = 0; i < 400 && !isWorkingDay(day, ctx.calendar.working); i++) day--;
      if (!isWorkingDay(day, ctx.calendar.working)) return null;
      text = dayText(day * MS_PER_DAY);
      finish = (day + 1) * MS_PER_DAY;
    } else {
      text = isoText(end);
      finish = end;
    }
    return start !== null && finish <= start ? null : text;
  }

  /** `for`'s value for a duration: Mermaid's unit in Meltemi's, and what it costs to write. */
  private duration(
    spec: Extract<EndSpec, { kind: "duration" }>,
    rep: Replayed,
    ctx: Build,
    field: Field,
  ): { value: string; explained: boolean } | null {
    const r = this.reporter;
    const m = messages();
    const { amount, unit } = spec;
    const zero = () => {
      r.approximated("gantt.duration", field.span, m.gantt.zeroDuration(spec.text));
      return null;
    };
    const tooLong = () => {
      r.approximated("gantt.duration", field.span, m.gantt.durationLong(spec.text));
      return null;
    };
    const days = {
      ms: 1 / 86_400_000,
      s: 1 / 86_400,
      m: 1 / 1_440,
      h: 1 / 24,
      d: 1,
      w: 7,
      M: 31,
      y: 366,
    }[unit];
    if (amount === 0) return zero();
    if (amount * days > MAX_DAYS) return tooLong();
    switch (unit) {
      case "ms": {
        const seconds = Math.ceil(amount / 1000);
        if (amount % 1000 !== 0) {
          r.approximated(
            "gantt.duration.ms",
            field.span,
            m.gantt.durationMilliseconds(spec.text, `${seconds}s`),
          );
        } else r.mapped("gantt.task.duration");
        // A task that Mermaid draws half a second long is written a second long.
        return { value: `${seconds}s`, explained: amount % 1000 !== 0 };
      }
      case "s":
      case "h":
      case "d":
        r.mapped("gantt.task.duration");
        return { value: `${num(amount)}${unit}`, explained: false };
      case "m":
        r.mapped("gantt.task.duration");
        return { value: `${num(amount)}min`, explained: false };
      case "w":
        r.mapped("gantt.task.duration");
        // Under excluded weekdays Mermaid's week is seven days that work.
        return {
          value: ctx.calendar.weekdays > 0 ? `${num(amount * 7)}d` : `${num(amount)}w`,
          explained: false,
        };
      case "M":
      case "y": {
        const from = rep.start ?? midnight(ctx.today);
        const covered = Math.round((addDuration(from, spec) - from) / MS_PER_DAY);
        if (covered <= 0) return zero();
        if (covered > MAX_DAYS) return tooLong();
        r.approximated(
          "gantt.duration.month",
          field.span,
          m.gantt.durationMonths(spec.text, `${covered}d`),
        );
        return { value: `${covered}d`, explained: false };
      }
    }
  }

  /** A milestone: at the middle of what Mermaid draws, or after what it follows. */
  private milestoneClauses(
    task: RawTask,
    item: GanttItem,
    plan: StartPlan,
    rep: Replayed,
    ctx: Build,
  ): boolean {
    const r = this.reporter;
    const m = messages();
    const lasts = rep.start !== null && rep.end !== null && rep.end !== rep.start;
    if (plan.kind === "after") {
      item.after = plan.ids;
      if (lasts) {
        r.approximated("gantt.milestone.duration", task.end.span, m.gantt.milestoneDuration);
        return true;
      }
      return false;
    }
    if (plan.kind === "chain" && !lasts) return false;
    const middle =
      plan.kind === "today"
        ? midnight(ctx.today)
        : rep.start !== null && rep.end !== null
          ? rep.start + Math.floor((rep.end - rep.start) / 2)
          : plan.kind === "date"
            ? plan.ms
            : midnight(ctx.today);
    item.at = isoText(this.working(middle, ctx));
    return false;
  }

  /** A marker: at its date, or after what it follows when that is the same instant. */
  private markerClauses(item: GanttItem, plan: StartPlan, rep: Replayed, ctx: Build): void {
    if (plan.kind === "after") {
      // A marker stays where it is put, while a task moves to the next day that works: they
      // agree only after a task whose end Mermaid does not push.
      const plain = plan.ids.every((id) => {
        const target = ctx.bySheetId.get(id)!;
        const replayed = ctx.replayOf.get(target)!;
        return (
          !target.tags.milestone &&
          (replayed.renderEnd === null || replayed.renderEnd === replayed.end)
        );
      });
      if (plain || rep.start === null) {
        item.after = plan.ids;
        return;
      }
      item.at = isoText(rep.start);
      return;
    }
    item.at = isoText(
      plan.kind === "date" ? plan.ms : rep.start !== null ? rep.start : midnight(ctx.today),
    );
  }
}
