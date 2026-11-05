import {
  type Arg,
  type DateLiteral,
  type DiagnosticBag,
  type DiagramBlock,
  type KeywordStatement,
  type LineIndex,
  type Range,
  type RelationStatement,
  type ShorthandDeclaration,
  type Statement,
  type Token,
} from "@meltemi/diagrams-language";
import {
  SECONDS_PER_DAY,
  addWorking,
  dayNumber,
  dayOfDate,
  endOfDay,
  formatDate,
  formatDay,
  nextWorking,
  parseDate,
  unitSeconds,
  weekdayOfDay,
  workingBetween,
  workingCalendar,
  type DateProblem,
  type WorkingCalendar,
} from "./calendar.js";
import { FlowAnalyzer, type Classified, type Mutable } from "./flow.js";
import { messages } from "./messages/index.js";
import {
  AXIS_DIRECTIVES,
  DURATION_UNITS,
  GANTT_AXIS_PLACES,
  GANTT_CHART_STATEMENTS,
  GANTT_CLAUSES,
  GANTT_DAY_WIDTH_RANGE,
  GANTT_DEPENDENCIES,
  GANTT_DISPLAYS,
  GANTT_ELEMENT_KINDS,
  GANTT_LABEL_PLACES,
  GANTT_PROFILE,
  GANTT_RESERVED_IDS,
  GANTT_STATUS_WORDS,
  TICK_UNITS,
  WEEKDAYS,
} from "./schema.js";
import { describeArg, headerHasError, singleIdent } from "./style-values.js";
import type {
  DurationUnit,
  Element,
  ElementKind,
  FlowDiagram,
  GanttCalendar,
  GanttChart,
  GanttEnd,
  GanttReference,
  GanttTask,
  Relation,
} from "./types.js";

/** Analyzes one `diagram <id>: gantt { }` block. */
export function analyzeGanttDiagram(
  node: DiagramBlock,
  id: Token,
  lines: LineIndex,
  bag: DiagnosticBag,
): { diagram: FlowDiagram; errors: number } {
  const analyzer = new GanttAnalyzer(node, id, lines, bag, GANTT_PROFILE);
  return { diagram: analyzer.run(), errors: analyzer.errors };
}

type ItemKind = "section" | "task" | "milestone" | "marker";
type BarKind = "task" | "milestone" | "marker";

const KINDS: ReadonlySet<string> = new Set(GANTT_ELEMENT_KINDS);
const CHART_STATEMENTS: ReadonlySet<string> = new Set(GANTT_CHART_STATEMENTS);
const STATUS_WORDS: readonly string[] = GANTT_STATUS_WORDS;

/** The forms of the statements, as messages write them. */
const FORMS: Readonly<Record<ItemKind, string>> = {
  section: '`section <id> ["Label"] { ... }`',
  task: '`task <id> ["Label"] [from <date>] [after <ids>] [for <duration> | to <date> | until <ids>] [done | active] [critical]`',
  milestone: '`milestone <id> ["Label"] [at <date>] [after <ids>] [done | active] [critical]`',
  marker: '`marker <id> ["Label"] (at <date> | after <ids>)`',
};

const EXAMPLES: Readonly<Record<ItemKind, string>> = {
  section: 'section build "Build" { }',
  task: 'task design "Design" from 2026-06-01 for 5d',
  milestone: 'milestone launch "Launch" after build',
  marker: 'marker freeze "Code freeze" at 2026-07-01',
};

/** The statements of a chart, as the hints of an unknown statement list them. */
const CHART_WORDS: readonly string[] = [
  ...GANTT_ELEMENT_KINDS,
  ...GANTT_CHART_STATEMENTS,
  "title",
  "description",
  "theme",
  "preset",
  "canvas",
  "style",
  "animate",
  "class",
  "rule",
];

/** The longest a duration may be: a century of days, which no chart needs. */
const MAX_DURATION_SECONDS = 36_600 * SECONDS_PER_DAY;

/** A statement of the chart: its kind, and the section that holds it. */
interface Item {
  readonly stmt: KeywordStatement;
  readonly kind: ItemKind;
  readonly section: KeywordStatement | null;
}

/** A written date that was read: where, and the instant it stands for. */
interface WrittenDate {
  readonly arg: DateLiteral;
  readonly text: string;
  readonly time: number;
  readonly hasTime: boolean;
}

/** An id of an `after` or `until` list, with the token that writes it. */
interface Written {
  readonly id: string;
  readonly token: Token;
}

/** An item of `exclude` or `include`: a weekday (0 is Monday) or a date with its literal. */
type DayItem = { readonly weekday: number } | { readonly date: string; readonly arg: DateLiteral };

/** A task, milestone or marker, read and waiting for its schedule. */
interface Node {
  readonly kind: BarKind;
  readonly stmt: KeywordStatement;
  readonly element: Element;
  readonly task: Mutable<GanttTask>;
  readonly from: WrittenDate | null;
  /** `to`: the date written, as its end clause. */
  readonly to: WrittenDate | null;
  /** `for`: the working time, in seconds. */
  readonly forSeconds: number | null;
  readonly after: Written[];
  readonly until: Written[];
  /** Whether a `from`, `at` or `after` clause is written, right or wrong: the start is stated. */
  readonly startWritten: boolean;
  /** The edges of the dependencies that resolved, once references are checked. */
  edges: Edge[];
}

interface Edge {
  readonly to: number;
  readonly via: "after" | "until" | "previous";
  /** The reference that writes it; null for following the previous task. */
  readonly token: Token | null;
}

const blockOf = (stmt: KeywordStatement) => stmt.block;

class GanttAnalyzer extends FlowAnalyzer {
  private readonly items: Item[] = [];
  private readonly chartStatements: KeywordStatement[] = [];
  private nodes: Node[] = [];
  private calendar: WorkingCalendar = workingCalendar([], [], []);
  private chart: GanttChart = {
    calendar: { excludedWeekdays: [], excludedDates: [], includedDates: [], weekStart: 0 },
    axisFormat: null,
    ticks: null,
    axis: "bottom",
    labels: "bar",
    display: "normal",
    dependencies: "shown",
    dayWidth: null,
    today: null,
    span: null,
  };

  override run(): FlowDiagram {
    const diagram = super.run();
    return { ...diagram, gantt: this.chart };
  }

  // ---------------------------------------------------------------- classification

  protected override classifyEvent(
    stmt: Statement,
    _context: "diagram" | "group",
    _out: Classified,
  ): boolean {
    if (stmt.kind === "RelationStatement") {
      this.relationStatement(stmt);
      return true;
    }
    if (stmt.kind === "ShorthandDeclaration") {
      this.shorthand(stmt);
      return true;
    }
    if (stmt.kind !== "KeywordStatement") return false;
    const keyword = stmt.keyword.text;
    if (KINDS.has(keyword)) {
      this.collect(stmt, null);
      return true;
    }
    if (CHART_STATEMENTS.has(keyword)) {
      this.chartStatements.push(stmt);
      return true;
    }
    return false;
  }

  /** `a -> b` in a chart: dependencies are written with `after`. */
  private relationStatement(stmt: RelationStatement): void {
    const m = messages();
    const target = stmt.target.kind === "QualifiedRef" ? stmt.target.text : null;
    this.error("gantt.relation", m.diagnostics.gantt.relation, stmt, {
      hints: [m.hints.gantt.relation(stmt.source.text, target)],
      data: { ids: target === null ? [stmt.source.text] : [stmt.source.text, target] },
    });
  }

  /** `a["Label"]` in a chart: a chart declares tasks, milestones, markers and sections. */
  private shorthand(stmt: ShorthandDeclaration): void {
    const m = messages();
    this.error("prop.unknown", m.diagnostics.gantt.shorthand(stmt.id.text), stmt.id, {
      hints: [m.hints.gantt.statements],
      data: { candidates: GANTT_ELEMENT_KINDS },
    });
  }

  /** Collects a section, task, milestone or marker, and what a section's block holds. */
  private collect(stmt: KeywordStatement, section: KeywordStatement | null): void {
    const kind = stmt.keyword.text as ItemKind;
    this.items.push({ stmt, kind, section });
    if (kind !== "section" || !stmt.block) return;
    for (const inner of stmt.block.statements) {
      if (inner.kind === "Error" || headerHasError(inner)) continue;
      this.collectInSection(inner, stmt);
    }
  }

  private collectInSection(inner: Statement, section: KeywordStatement): void {
    const m = messages();
    if (inner.kind === "RelationStatement") {
      this.relationStatement(inner);
      return;
    }
    if (inner.kind === "ShorthandDeclaration") {
      this.error("prop.unknown", m.diagnostics.gantt.shorthand(inner.id.text), inner.id, {
        hints: [m.hints.gantt.sectionContents],
        data: { candidates: ["task", "milestone", "marker"] },
      });
      return;
    }
    if (inner.kind !== "KeywordStatement") return;
    const keyword = inner.keyword.text;
    if (keyword === "section") {
      this.error("prop.unknown", m.diagnostics.gantt.sectionInSection, inner.keyword, {
        hints: [m.hints.gantt.sectionContents],
        data: { candidates: ["task", "milestone", "marker"] },
      });
      return;
    }
    if (keyword === "task" || keyword === "milestone" || keyword === "marker") {
      this.items.push({ stmt: inner, kind: keyword, section });
      return;
    }
    // `description`, `url`, `class` and `link` are read with the section's own block.
    if (
      keyword === "description" ||
      keyword === "url" ||
      keyword === "link" ||
      (keyword === "class" && !inner.block)
    ) {
      return;
    }
    const chartLevel = CHART_WORDS.includes(keyword);
    this.error("prop.unknown", m.diagnostics.gantt.unknownInSection(keyword), inner.keyword, {
      hints: [chartLevel ? m.hints.flow.diagramLevel(keyword) : m.hints.gantt.sectionContents],
      data: { candidates: chartLevel ? [] : ["task", "milestone", "marker"] },
    });
  }

  protected override otherProfileKind(): string | undefined {
    return undefined;
  }

  protected override declarationWords(): readonly string[] {
    return GANTT_ELEMENT_KINDS;
  }

  protected override statementCandidates(): readonly string[] {
    return CHART_WORDS;
  }

  protected override statementHints(): string[] {
    return [messages().hints.gantt.statements];
  }

  // ---------------------------------------------------------------- the chart

  protected override afterRelations(_classified: Classified): void {
    this.readChart();
    this.readItems();
    this.checkDependencies();
    this.schedule();
    this.buildRelations();
    this.measure();
  }

  /** What the chart statements write: the calendar first, which durations are counted in. */
  private readChart(): void {
    const m = messages();
    const seen = new Map<string, Token>();
    const excludedWeekdays = new Set<number>();
    const excludedDates = new Set<string>();
    const included: { date: string; arg: DateLiteral }[] = [];
    let weekStart = 0;
    let axisFormat: string | null = null;
    let ticks: string | null = null;
    let axis: GanttChart["axis"] = "bottom";
    let labels: GanttChart["labels"] = "bar";
    let display: GanttChart["display"] = "normal";
    let dependencies: GanttChart["dependencies"] = "shown";
    let dayWidth: number | null = null;
    let today: GanttChart["today"] = null;

    for (const stmt of this.chartStatements) {
      const name = stmt.keyword.text;
      if (name === "exclude" || name === "include") {
        const items = this.dayList(stmt, name);
        if (name === "exclude") {
          const before = new Set(excludedWeekdays);
          for (const item of items) {
            if ("weekday" in item) excludedWeekdays.add(item.weekday);
            else excludedDates.add(item.date);
          }
          if (excludedWeekdays.size === 7) {
            this.invalid(m.diagnostics.gantt.everyDayExcluded, stmt, [
              m.hints.gantt.everyDayExcluded,
            ]);
            excludedWeekdays.clear();
            for (const weekday of before) excludedWeekdays.add(weekday);
          }
        } else {
          for (const item of items) if ("date" in item) included.push(item);
        }
        continue;
      }
      const first = seen.get(name);
      if (first) {
        this.error(
          "prop.duplicate",
          m.diagnostics.flow.setMoreThanOnceInDiagram(name),
          stmt.keyword,
          {
            related: [{ message: m.related.firstSet, at: first }],
          },
        );
        continue;
      }
      seen.set(name, stmt.keyword);
      switch (name) {
        case "weekStart": {
          const value = this.readValue(stmt, { kind: "enum", values: WEEKDAYS }, name);
          if (typeof value === "string")
            weekStart = WEEKDAYS.indexOf(value as (typeof WEEKDAYS)[number]);
          break;
        }
        case "axisFormat": {
          const value = this.readValue(stmt, { kind: "string" }, name);
          if (typeof value !== "string") break;
          const bad = badDirective(value);
          if (bad !== null) {
            this.invalid(
              m.diagnostics.gantt.badDirective(
                bad,
                AXIS_DIRECTIVES.map((d) => `%${d}`),
              ),
              stmt.args[0]!,
              [m.hints.gantt.axisFormat],
            );
            break;
          }
          axisFormat = value;
          break;
        }
        case "ticks":
          ticks = this.readTicks(stmt);
          break;
        case "axis": {
          const value = this.readValue(stmt, { kind: "enum", values: GANTT_AXIS_PLACES }, name);
          if (typeof value === "string") axis = value as typeof axis;
          break;
        }
        case "labels": {
          const value = this.readValue(stmt, { kind: "enum", values: GANTT_LABEL_PLACES }, name);
          if (typeof value === "string") labels = value as typeof labels;
          break;
        }
        case "display": {
          const value = this.readValue(stmt, { kind: "enum", values: GANTT_DISPLAYS }, name);
          if (typeof value === "string") display = value as typeof display;
          break;
        }
        case "dependencies": {
          const value = this.readValue(stmt, { kind: "enum", values: GANTT_DEPENDENCIES }, name);
          if (typeof value === "string") dependencies = value as typeof dependencies;
          break;
        }
        case "dayWidth": {
          const value = this.readValue(stmt, { kind: "number", ...GANTT_DAY_WIDTH_RANGE }, name);
          if (typeof value === "number") dayWidth = value;
          break;
        }
        case "today":
          today = this.readToday(stmt);
          break;
      }
    }

    // A date in `include` that nothing excludes is a working day already.
    const excluded = workingCalendar([...excludedWeekdays], [...excludedDates], []);
    const includedDates = new Set<string>();
    for (const { date, arg } of included) {
      const day = dayOfDate(date)!;
      const covered = excluded.excludedDays.has(day) || excluded.weekdayExcluded[weekdayOfDay(day)];
      if (!covered) {
        this.invalid(m.diagnostics.gantt.alreadyWorking(date), arg, [m.hints.gantt.alreadyWorking]);
        continue;
      }
      includedDates.add(date);
    }
    const calendar: GanttCalendar = {
      excludedWeekdays: [...excludedWeekdays].sort((a, b) => a - b),
      excludedDates: [...excludedDates].sort(),
      includedDates: [...includedDates].sort(),
      weekStart,
    };
    this.calendar = workingCalendar(
      calendar.excludedWeekdays,
      calendar.excludedDates,
      calendar.includedDates,
    );
    this.chart = {
      calendar,
      axisFormat,
      ticks,
      axis,
      labels,
      display,
      dependencies,
      dayWidth,
      today,
      span: null,
    };
  }

  /** The items of `exclude` and `include`: weekdays (`weekends` is two of them) and dates. */
  private dayList(stmt: KeywordStatement, name: "exclude" | "include"): DayItem[] {
    const m = messages();
    const out: DayItem[] = [];
    if (stmt.block || stmt.chain) {
      this.invalid(m.diagnostics.common.doesNotTakeBlock(name), stmt.block ?? stmt.chain!);
      return out;
    }
    if (stmt.args.length === 0) {
      this.invalid(m.diagnostics.gantt.needsDays(name), stmt.keyword, [
        m.hints.example(name === "exclude" ? "exclude weekends, 2026-12-25" : "include 2026-06-06"),
      ]);
      return out;
    }
    for (const arg of stmt.args) {
      const word = singleIdent(arg);
      if (name === "exclude" && word?.text === "weekends") {
        out.push({ weekday: 5 }, { weekday: 6 });
        continue;
      }
      if (name === "exclude" && word && (WEEKDAYS as readonly string[]).includes(word.text)) {
        out.push({ weekday: WEEKDAYS.indexOf(word.text as (typeof WEEKDAYS)[number]) });
        continue;
      }
      if (arg.kind === "DateLiteral") {
        const read = this.checkDate(arg);
        if (!read) continue;
        if (read.hasTime) {
          this.invalid(m.diagnostics.gantt.dayNotInstant(name, arg.text), arg, [
            m.hints.gantt.dateForm,
          ]);
          continue;
        }
        out.push({ date: read.text, arg });
        continue;
      }
      this.invalid(m.diagnostics.gantt.notADay(describeArg(arg), name), arg, [
        name === "exclude" ? m.hints.gantt.excludeItems(WEEKDAYS) : m.hints.gantt.includeItems,
      ]);
    }
    return out;
  }

  /** `ticks <n><unit>`: a whole number with a duration unit, `mo` or `y`. */
  private readTicks(stmt: KeywordStatement): string | null {
    const m = messages();
    if (stmt.block || stmt.chain) {
      this.invalid(m.diagnostics.common.doesNotTakeBlock("ticks"), stmt.block ?? stmt.chain!);
      return null;
    }
    const [arg, extra] = stmt.args;
    if (!arg) {
      this.invalid(m.diagnostics.gantt.needsTicks, stmt.keyword, [m.hints.gantt.ticks(TICK_UNITS)]);
      return null;
    }
    if (extra) {
      this.invalid(m.diagnostics.values.oneValue("ticks"), extra);
      return null;
    }
    const ok =
      arg.kind === "NumberLiteral" &&
      arg.unit !== null &&
      (TICK_UNITS as readonly string[]).includes(arg.unit) &&
      Number.isInteger(arg.value) &&
      arg.value > 0;
    if (!ok) {
      this.invalid(m.diagnostics.gantt.badTicks(describeArg(arg)), arg, [
        m.hints.gantt.ticks(TICK_UNITS),
      ]);
      return null;
    }
    return (arg as { token: Token }).token.text;
  }

  /** `today` or `today <date>`. */
  private readToday(stmt: KeywordStatement): GanttChart["today"] {
    const m = messages();
    const range = this.range(stmt);
    if (stmt.block || stmt.chain) {
      this.invalid(m.diagnostics.common.doesNotTakeBlock("today"), stmt.block ?? stmt.chain!);
      return null;
    }
    const [arg, extra] = stmt.args;
    if (!arg) return { date: null, range };
    if (extra) {
      this.invalid(m.diagnostics.values.oneValue("today"), extra);
      return null;
    }
    if (arg.kind !== "DateLiteral") {
      this.invalid(m.diagnostics.gantt.notDate("today", describeArg(arg)), arg, [
        m.hints.gantt.dateForm,
      ]);
      return null;
    }
    const read = this.checkDate(arg);
    if (!read) return null;
    if (read.hasTime) {
      this.invalid(m.diagnostics.gantt.dayNotInstant("today", arg.text), arg, [
        m.hints.gantt.dateForm,
      ]);
      return null;
    }
    return { date: read.text, range };
  }

  // ---------------------------------------------------------------- dates and durations

  /** A date literal checked against the calendar: it names a day that exists. */
  private checkDate(arg: DateLiteral): WrittenDate | undefined {
    const parsed = parseDate(arg.text);
    if (parsed.ok) return { arg, text: arg.text, time: parsed.time, hasTime: parsed.hasTime };
    const m = messages();
    this.invalid(m.diagnostics.gantt.dateProblem(arg.text, describeProblem(parsed.problem)), arg, [
      m.hints.gantt.dateForm,
    ]);
    return undefined;
  }

  /** The date after a `from`, `at` or `to`: a literal that exists. */
  private dateAfter(word: Token, value: Arg | undefined): WrittenDate | undefined {
    const m = messages();
    if (!value || this.endsList(value)) {
      this.invalid(m.diagnostics.gantt.needsDate(word.text), word, [m.hints.gantt.dateForm]);
      return undefined;
    }
    if (value.kind === "StringLiteral") {
      this.invalid(m.diagnostics.gantt.quotedDate(word.text, value.value), value, [
        m.hints.gantt.unquotedDate(value.value),
      ]);
      return undefined;
    }
    if (value.kind !== "DateLiteral") {
      this.invalid(m.diagnostics.gantt.notDate(word.text, describeArg(value)), value, [
        m.hints.gantt.dateForm,
      ]);
      return undefined;
    }
    return this.checkDate(value);
  }

  /** Whether an argument is a word that ends a value: a clause word or a status word. */
  private endsList(arg: Arg): boolean {
    const word = singleIdent(arg);
    return word !== undefined && GANTT_RESERVED_IDS.includes(word.text);
  }

  /** The duration after a `for`: a number above 0 with a unit. */
  private durationAfter(
    word: Token,
    value: Arg | undefined,
  ): { amount: number; unit: DurationUnit; arg: Arg } | undefined {
    const m = messages();
    const units = DURATION_UNITS as readonly string[];
    if (!value || this.endsList(value)) {
      this.invalid(m.diagnostics.gantt.needsDuration(word.text), word, [
        m.hints.gantt.durationForm(DURATION_UNITS),
      ]);
      return undefined;
    }
    if (value.kind !== "NumberLiteral") {
      this.invalid(m.diagnostics.gantt.notDuration(describeArg(value)), value, [
        m.hints.gantt.durationForm(DURATION_UNITS),
      ]);
      return undefined;
    }
    const text = value.token.text;
    if (value.unit === null || !units.includes(value.unit)) {
      this.invalid(m.diagnostics.gantt.durationUnit(text, value.unit, DURATION_UNITS), value, [
        m.hints.gantt.durationForm(DURATION_UNITS),
      ]);
      return undefined;
    }
    if (value.value <= 0) {
      this.invalid(m.diagnostics.gantt.durationAboveZero(text), value, [
        value.value === 0 ? m.hints.gantt.zeroDuration : m.hints.gantt.durationForm(DURATION_UNITS),
      ]);
      return undefined;
    }
    const seconds = value.value * unitSeconds(value.unit as DurationUnit, this.calendar);
    if (seconds > MAX_DURATION_SECONDS) {
      this.invalid(m.diagnostics.gantt.durationTooLong(text), value);
      return undefined;
    }
    return { amount: value.value, unit: value.unit as DurationUnit, arg: value };
  }

  // ---------------------------------------------------------------- sections, tasks, markers

  private readItems(): void {
    const nodes: Node[] = [];
    for (const item of this.items) {
      if (item.kind === "section") this.readSection(item);
      else {
        const node = this.readBar(item, item.kind);
        if (node) nodes.push(node);
      }
    }
    this.nodes = nodes;
  }

  private readSection(item: Item): void {
    const stmt = item.stmt;
    const m = messages();
    const form = FORMS.section;
    if (stmt.chain) {
      this.invalid(m.diagnostics.common.singleBlock("section"), stmt.chain.clauses[1]!.keyword);
      return;
    }
    const [idArg, labelArg, ...extra] = stmt.args;
    const idToken = singleIdent(idArg);
    if (!idToken) {
      this.invalid(m.diagnostics.common.expected(form), idArg ?? stmt.keyword, [
        m.hints.example(EXAMPLES.section),
      ]);
      return;
    }
    this.checkReservedId(idToken);
    let label = idToken.text;
    if (labelArg) {
      if (labelArg.kind !== "StringLiteral") {
        this.invalid(m.diagnostics.flow.quotedSource("label", idToken.text), labelArg);
        return;
      }
      label = labelArg.value;
    }
    if (extra.length > 0) {
      this.invalid(m.diagnostics.flow.valueAfter("label", form), extra[0]!);
      return;
    }
    const block = this.groupBlock(blockOf(stmt), idToken);
    this.addElement(
      this.element({
        id: idToken.text,
        kind: "section",
        label,
        labelWritten: labelArg !== undefined,
        description: block.description,
        url: block.url,
        classes: block.classes,
        link: block.link,
        task: null,
        groupPath: [],
        stmt,
        idToken,
      }),
    );
  }

  /** A task, milestone or marker: the label, the clauses, the status and the block. */
  private readBar(item: Item, kind: BarKind): Node | undefined {
    const stmt = item.stmt;
    const m = messages();
    const form = FORMS[kind];
    if (stmt.chain) {
      this.invalid(m.diagnostics.common.singleBlock(kind), stmt.chain.clauses[1]!.keyword);
      return undefined;
    }
    const [idArg, ...rest] = stmt.args;
    const idToken = singleIdent(idArg);
    if (!idToken) {
      this.invalid(m.diagnostics.common.expected(form), idArg ?? stmt.keyword, [
        m.hints.example(EXAMPLES[kind]),
      ]);
      return undefined;
    }
    this.checkReservedId(idToken);
    let label = idToken.text;
    let labelWritten = false;
    if (rest[0]?.kind === "StringLiteral") {
      label = rest[0].value;
      labelWritten = true;
      rest.shift();
    }

    const clauses = GANTT_CLAUSES[kind];
    const statuses = kind === "marker" ? [] : STATUS_WORDS;
    const seen = new Map<string, Token>();
    /** Records a word, or reports it as written twice and returns true. */
    const claimed = (word: Token): boolean => {
      const first = seen.get(word.text);
      if (first) {
        this.error("prop.duplicate", m.diagnostics.gantt.clauseTwice(word.text), word, {
          related: [{ message: m.related.firstWritten, at: first }],
        });
        return true;
      }
      seen.set(word.text, word);
      return false;
    };
    let from: WrittenDate | null = null;
    let fromClause: { range: Range; valueRange: Range } | null = null;
    let to: WrittenDate | null = null;
    let forClause: { amount: number; unit: DurationUnit; arg: Arg } | null = null;
    let end: GanttEnd | null = null;
    const after: Written[] = [];
    let afterRange: Range | null = null;
    const until: Written[] = [];
    let status: "done" | "active" | null = null;
    let critical = false;

    let i = 0;
    while (i < rest.length) {
      const arg = rest[i]!;
      const word = singleIdent(arg);
      if (!word) {
        this.invalid(m.diagnostics.gantt.strayValue(describeArg(arg), form), arg, [
          m.hints.gantt.clauses(clauses, statuses),
        ]);
        i++;
        continue;
      }
      const text = word.text;
      if (clauses.includes(text)) {
        // One end clause: a second names the first, however it is written.
        const other =
          text === "for" || text === "to" || text === "until"
            ? ["for", "to", "until"].find((name) => name !== text && seen.has(name))
            : undefined;
        if (other) {
          this.error("prop.duplicate", m.diagnostics.gantt.endTwice(text, other), word, {
            related: [{ message: m.related.firstWritten, at: seen.get(other)! }],
          });
          i = this.skipClause(rest, i + 1);
          continue;
        }
        if (claimed(word)) {
          i = this.skipClause(rest, i + 1);
          continue;
        }
        if (text === "from" || text === "at" || text === "to") {
          const value = this.dateAfter(word, rest[i + 1]);
          const valueArg = value ? rest[i + 1]! : undefined;
          const consumed = rest[i + 1] && !this.endsList(rest[i + 1]!) ? 2 : 1;
          if (value && valueArg) {
            const range = this.lines.range({ start: word.start, end: valueArg.end });
            const valueRange = this.range(valueArg);
            if (text === "to") {
              to = value;
              end = { kind: "to", date: value.text, range, valueRange };
            } else {
              from = value;
              fromClause = { range, valueRange };
            }
          }
          i += consumed;
          continue;
        }
        if (text === "for") {
          const duration = this.durationAfter(word, rest[i + 1]);
          const consumed = rest[i + 1] && !this.endsList(rest[i + 1]!) ? 2 : 1;
          if (duration) {
            forClause = duration;
            end = {
              kind: "for",
              amount: duration.amount,
              unit: duration.unit,
              range: this.lines.range({ start: word.start, end: duration.arg.end }),
              valueRange: this.range(duration.arg),
            };
          }
          i += consumed;
          continue;
        }
        // `after` and `until`: ids up to the next clause word or status word.
        const ids: Written[] = [];
        let j = i + 1;
        while (j < rest.length) {
          const next = rest[j]!;
          if (this.endsList(next)) break;
          const token = singleIdent(next);
          if (!token) {
            this.invalid(m.diagnostics.gantt.notAnId(text, describeArg(next)), next, [
              m.hints.gantt.idList(text),
            ]);
          } else if (ids.some((entry) => entry.id === token.text)) {
            this.error("prop.duplicate", m.diagnostics.gantt.idTwice(token.text, text), token, {
              related: [
                {
                  message: m.related.firstWritten,
                  at: ids.find((e) => e.id === token.text)!.token,
                },
              ],
            });
          } else {
            ids.push({ id: token.text, token });
          }
          j++;
        }
        if (ids.length === 0 && j === i + 1) {
          this.invalid(m.diagnostics.gantt.needsIds(text), word, [m.hints.gantt.idList(text)]);
        }
        const last = rest[j - 1];
        const clauseRange = this.lines.range({ start: word.start, end: (last ?? word).end });
        if (text === "after") {
          after.push(...ids);
          afterRange = clauseRange;
        } else {
          until.push(...ids);
          end = {
            kind: "until",
            ids: ids.map((e) => ({ id: e.id, range: this.range(e.token) })),
            range: clauseRange,
          };
        }
        i = j;
        continue;
      }
      if (statuses.includes(text)) {
        if (text === "critical") {
          if (!claimed(word)) critical = true;
        } else {
          const other = text === "done" ? "active" : "done";
          if (seen.has(other)) {
            this.error("prop.duplicate", m.diagnostics.gantt.statusTwice(text, other), word, {
              related: [{ message: m.related.firstWritten, at: seen.get(other)! }],
            });
          } else if (!claimed(word)) {
            status = text as "done" | "active";
          }
        }
        i++;
        continue;
      }
      // Not a word of this statement: the clauses it has, and what the other statements use.
      const elsewhere: "task" | "milestone" | null = ["from", "for", "to", "until"].includes(text)
        ? "task"
        : text === "at"
          ? "milestone"
          : null;
      this.error("prop.unknown", m.diagnostics.gantt.unknownWord(text, kind), word, {
        hints: [
          m.hints.gantt.clauses(clauses, statuses),
          ...(elsewhere ? [m.hints.gantt.otherKind(text, elsewhere)] : []),
        ],
        data: { candidates: [...clauses, ...statuses] },
      });
      i = this.skipClause(rest, i + 1);
    }

    if (kind === "marker" && !from && after.length === 0 && !seen.has("at") && !seen.has("after")) {
      this.invalid(m.diagnostics.gantt.markerNeedsPlace(idToken.text), idToken, [
        m.hints.example(EXAMPLES.marker),
      ]);
    }
    if (kind === "marker" && seen.has("at") && seen.has("after")) {
      this.error(
        "prop.duplicate",
        m.diagnostics.gantt.markerOnePlace(idToken.text),
        seen.get("after")!,
        {
          related: [{ message: m.related.firstWritten, at: seen.get("at")! }],
        },
      );
    }

    const block = this.elementBlock(
      blockOf(stmt),
      this.profile.elementProperties,
      "Element",
      idToken,
    );
    const task: Mutable<GanttTask> = {
      from: from && fromClause ? { date: from.text, ...fromClause } : null,
      after: [],
      afterRange,
      end,
      status,
      critical,
      start: null,
      finish: null,
      working: null,
    };
    const element = this.element({
      id: idToken.text,
      kind,
      label,
      labelWritten,
      description: block.description,
      url: block.url,
      classes: block.classes,
      link: block.link,
      task,
      groupPath: this.sectionPath(item.section),
      stmt,
      idToken,
    });
    if (!this.addElement(element)) return undefined;

    // A written date on a day that does not work moves to the next one that does.
    if (from && kind !== "marker") this.warnExcludedStart(from);
    if (to) this.warnExcludedEnd(to);
    return {
      kind,
      stmt,
      element,
      task,
      from,
      to,
      forSeconds: forClause
        ? Math.max(1, Math.round(forClause.amount * unitSeconds(forClause.unit, this.calendar)))
        : null,
      after,
      until,
      startWritten: seen.has("from") || seen.has("at") || seen.has("after"),
      edges: [],
    };
  }

  /** The arguments to skip after an unknown word: the values written for it. */
  private skipClause(rest: readonly Arg[], from: number): number {
    let i = from;
    while (i < rest.length && singleIdent(rest[i]) === undefined) i++;
    return i;
  }

  private checkReservedId(token: Token): void {
    if (!GANTT_RESERVED_IDS.includes(token.text)) return;
    const m = messages();
    this.invalid(m.diagnostics.gantt.reservedId(token.text), token, [m.hints.gantt.reservedId]);
  }

  private sectionPath(section: KeywordStatement | null): string[] {
    const id = section ? singleIdent(section.args[0]) : undefined;
    return id ? [id.text] : [];
  }

  /** An element of the chart: the fields the other profiles leave empty. */
  private element(fields: {
    id: string;
    kind: ItemKind;
    label: string;
    labelWritten: boolean;
    description: string | null;
    url: string | null;
    classes: Element["classes"];
    link: Element["link"];
    task: GanttTask | null;
    groupPath: string[];
    stmt: KeywordStatement;
    idToken: Token;
  }): Element {
    return {
      id: fields.id,
      kind: fields.kind as ElementKind,
      label: fields.label,
      implicit: false,
      description: fields.description,
      classes: fields.classes,
      tags: [],
      ports: [],
      layer: null,
      layerRange: null,
      link: fields.link,
      url: fields.url,
      source: null,
      sourceRange: null,
      labelWritten: fields.labelWritten,
      entity: null,
      technology: null,
      external: false,
      shape: null,
      line: null,
      pen: null,
      list: null,
      task: fields.task,
      attachedTo: null,
      attachedToRange: null,
      typeKind: null,
      data: {},
      groupPath: fields.groupPath,
      range: this.range(fields.stmt),
      idRange: this.range(fields.idToken),
      idToken: fields.idToken,
      node: fields.stmt,
    };
  }

  /** `gantt.excluded-day` for a start written on a day that does not work. */
  private warnExcludedStart(written: WrittenDate): void {
    const moved = nextWorking(written.time, this.calendar);
    if (moved === null || moved === written.time) return;
    this.warnExcluded(written, moved, "starts");
  }

  /** `gantt.excluded-day` for an end written on a day that does not work. */
  private warnExcludedEnd(written: WrittenDate): void {
    const day = dayNumber(written.time);
    if (nextWorking(day * SECONDS_PER_DAY, this.calendar) === day * SECONDS_PER_DAY) return;
    this.warnExcluded(written, this.lastWorkingBefore(written.time), "ends");
  }

  private warnExcluded(written: WrittenDate, to: number | null, what: "starts" | "ends"): void {
    const m = messages();
    const day = dayNumber(written.time);
    const target = to === null ? null : dayNumber(what === "ends" ? to - 1 : to);
    this.bag.add({
      code: "gantt.excluded-day",
      severity: "warning",
      message: m.diagnostics.gantt.excludedDay(
        written.text,
        weekdayOfDay(day),
        target === null ? null : { date: formatDay(target), weekday: weekdayOfDay(target) },
        what,
      ),
      span: { start: written.arg.start, end: written.arg.end },
      hints: [m.hints.gantt.excludedDay],
    });
  }

  /** The end of the last working day on or before the day of an instant; null when none. */
  private lastWorkingBefore(time: number): number | null {
    let day = dayNumber(time);
    for (let i = 0; i < 400; i++, day--) {
      if (nextWorking(day * SECONDS_PER_DAY, this.calendar) === day * SECONDS_PER_DAY) {
        return (day + 1) * SECONDS_PER_DAY;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- dependencies

  /** The ids `after` and `until` may name, for the candidates of an unknown one. */
  private dependable(): string[] {
    return this.nodes.filter((n) => n.kind !== "marker").map((n) => n.element.id);
  }

  private checkDependencies(): void {
    const m = messages();
    const index = new Map<string, number>();
    this.nodes.forEach((node, i) => index.set(node.element.id, i));
    // The previous task or milestone in source order, which a task without a start follows.
    let previous: number | null = null;
    const previousOf: (number | null)[] = [];
    this.nodes.forEach((node, i) => {
      previousOf.push(previous);
      if (node.kind !== "marker") previous = i;
    });

    this.nodes.forEach((node, i) => {
      const edges: Edge[] = [];
      const resolved: GanttReference[] = [];
      for (const [via, list] of [
        ["after", node.after],
        ["until", node.until],
      ] as const) {
        for (const written of list) {
          const target = this.elementsById.get(written.id);
          if (!target) {
            this.error(
              "ref.unknown-element",
              m.diagnostics.common.unknownElement(written.id),
              written.token,
              {
                hints: [m.hints.gantt.unknownTask(written.id)],
                data: { ids: [written.id], candidates: this.dependable() },
              },
            );
            continue;
          }
          if (target.kind === "section" || target.kind === "marker") {
            this.invalid(
              m.diagnostics.gantt.dependencyKind(via, written.id, target.kind),
              written.token,
              [m.hints.gantt.idList(via)],
            );
            continue;
          }
          const to = index.get(written.id);
          if (to === undefined) continue;
          this.reference(written.token, written.id, "element", "dependency", node.stmt);
          edges.push({ to, via, token: written.token });
          if (via === "after") resolved.push({ id: written.id, range: this.range(written.token) });
        }
      }
      node.task.after = resolved;
      const follows = !node.startWritten;
      const before = previousOf[i];
      if (node.kind !== "marker" && follows && before !== null && before !== undefined) {
        edges.push({ to: before, via: "previous", token: null });
      }
      node.edges = edges;
    });
  }

  // ---------------------------------------------------------------- the schedule

  /** Resolves every start and end in dependency order, and reports what cannot be resolved. */
  private schedule(): void {
    const m = messages();
    const count = this.nodes.length;
    const dependents: number[][] = Array.from({ length: count }, () => []);
    const pending = new Array<number>(count).fill(0);
    this.nodes.forEach((node, i) => {
      for (const to of new Set(node.edges.map((e) => e.to))) {
        dependents[to]!.push(i);
        pending[i]!++;
      }
    });
    const done = new Array<boolean>(count).fill(false);
    const failed = new Array<boolean>(count).fill(false);
    const queue: number[] = [];
    for (let i = 0; i < count; i++) if (pending[i] === 0) queue.push(i);

    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      done[i] = true;
      if (!this.resolveNode(i, failed)) failed[i] = true;
      for (const next of dependents[i]!) {
        pending[next]!--;
        if (pending[next] === 0) queue.push(next);
      }
    }

    // What is left waits on a loop, or on something that does.
    const leftover = done.map((d) => !d);
    if (!leftover.some(Boolean)) return;
    const components = stronglyConnected(
      count,
      (n) => this.nodes[n]!.edges.map((e) => e.to),
      leftover,
    );
    for (const component of components) {
      const members = new Set(component);
      const selfLoop =
        component.length === 1 &&
        this.nodes[component[0]!]!.edges.some((e) => e.to === component[0]);
      if (component.length < 2 && !selfLoop) continue;
      const ids = [...members].sort((a, b) => a - b).map((n) => this.nodes[n]!.element.id);
      const references = component
        .flatMap((n) =>
          this.nodes[n]!.edges.filter((e) => e.token !== null && members.has(e.to)).map(
            (e) => e.token!,
          ),
        )
        .sort((a, b) => a.start - b.start);
      for (const token of references) {
        this.error("gantt.cycle", m.diagnostics.gantt.cycle(ids), token, {
          related: references
            .filter((other) => other !== token)
            .map((other) => ({ message: m.related.inTheLoop, at: other })),
          hints: [m.hints.gantt.cycle],
          data: { ids },
        });
      }
    }
  }

  /** The start and the end of one node, its dependencies being resolved; false when it has none. */
  private resolveNode(i: number, failed: readonly boolean[]): boolean {
    const m = messages();
    const node = this.nodes[i]!;
    if (node.edges.some((e) => failed[e.to])) return false;
    const finishOf = (n: number): number => this.nodes[n]!.task.finish!;
    const startOf = (n: number): number => this.nodes[n]!.task.start!;

    // The start: the later of the written date and the ends of what it waits for.
    const starts: number[] = [];
    if (node.from) starts.push(node.from.time);
    for (const e of node.edges) if (e.via !== "until") starts.push(finishOf(e.to));
    if (starts.length === 0) {
      // A start that was written wrong, and a marker without a place, are reported already.
      if (!node.startWritten && node.kind !== "marker") {
        this.error(
          "gantt.unscheduled",
          m.diagnostics.gantt.unscheduled(node.element.id),
          node.element.idToken,
          { hints: [m.hints.gantt.unscheduled] },
        );
      }
      return false;
    }
    let start = Math.max(...starts);
    // A marker stays where it is put; a task or milestone moves to the next working time.
    if (node.kind !== "marker") {
      const moved = nextWorking(start, this.calendar);
      if (moved === null) return this.noWorkingTime(node);
      start = moved;
    }

    let finish = start;
    if (node.kind === "task") {
      const end = node.task.end;
      if (node.forSeconds !== null) {
        const added = addWorking(start, node.forSeconds, this.calendar);
        if (added === null) return this.noWorkingTime(node);
        finish = added;
      } else if (node.to) {
        finish = node.to.hasTime ? node.to.time : endOfDay(node.to.time);
        if (!node.to.hasTime) {
          const before = this.lastWorkingBefore(node.to.time);
          if (before !== null && before < finish) finish = before;
        }
      } else {
        // `until` ends at the earliest start of what it names; with none that resolved (they are
        // reported), and without an end clause, a task lasts a day.
        const targets =
          end?.kind === "until"
            ? node.edges.filter((e) => e.via === "until").map((e) => startOf(e.to))
            : [];
        if (targets.length > 0) {
          finish = Math.min(...targets);
        } else {
          const added = addWorking(start, SECONDS_PER_DAY, this.calendar);
          if (added === null) return this.noWorkingTime(node);
          finish = added;
        }
      }
      if (finish <= start) {
        this.error(
          "gantt.schedule",
          m.diagnostics.gantt.endsBeforeStart(
            node.element.id,
            formatDate(start),
            formatDate(finish),
            finish === start,
          ),
          this.endToken(node) ?? node.element.idToken,
          { hints: [m.hints.gantt.endsBeforeStart] },
        );
        return false;
      }
    }
    node.task.start = start;
    node.task.finish = finish;
    node.task.working = workingBetween(start, finish, this.calendar);
    return true;
  }

  /** The token to report an end that is not after the start on: the end clause's word. */
  private endToken(node: Node): Token | null {
    const words = node.stmt.args
      .map((arg) => singleIdent(arg))
      .filter((t): t is Token => t !== undefined);
    return words.find((t) => t.text === "to" || t.text === "until" || t.text === "for") ?? null;
  }

  private noWorkingTime(node: Node): false {
    const m = messages();
    this.error(
      "gantt.schedule",
      m.diagnostics.gantt.noWorkingTime(node.element.id),
      node.element.idToken,
      {
        hints: [m.hints.gantt.noWorkingTime],
      },
    );
    return false;
  }

  // ---------------------------------------------------------------- relations and span

  /** Each `after` id is an arrow from that task to the one that waits, derived from the clause. */
  private buildRelations(): void {
    const counts = new Map<string, number>();
    for (const node of this.nodes) {
      for (const reference of node.task.after) {
        const pair = `${reference.id}->${node.element.id}`;
        const n = (counts.get(pair) ?? 0) + 1;
        counts.set(pair, n);
        const relation: Mutable<Relation> = {
          key: `${pair}#${n}`,
          id: null,
          from: reference.id,
          to: node.element.id,
          line: "solid",
          heads: "end",
          twoWay: false,
          async: false,
          returns: null,
          technology: null,
          sources: [],
          derived: true,
          label: null,
          description: null,
          assumption: null,
          data: {},
          classes: [],
          tags: [],
          layer: null,
          layerRange: null,
          groupPath: [],
          range: reference.range,
          idRange: null,
          node: node.stmt,
        };
        this.relations.push(relation);
        this.relationsByKey.set(relation.key, relation);
      }
    }
  }

  /** The chart's span: the earliest start to the latest end of what is scheduled. */
  private measure(): void {
    let start = Infinity;
    let end = -Infinity;
    for (const node of this.nodes) {
      const { start: s, finish: f } = node.task;
      if (s === null || f === null) continue;
      start = Math.min(start, s);
      end = Math.max(end, f);
    }
    this.chart = {
      ...this.chart,
      span: start <= end ? { start, end } : null,
    };
  }
}

// -------------------------------------------------------------------------- helpers

/** What is wrong with a date that has the form but no day: the pieces a message names. */
function describeProblem(problem: DateProblem): {
  kind: DateProblem["kind"];
  month?: number;
  year?: number;
  day?: number;
  daysInMonth?: number;
  value?: number;
} {
  switch (problem.kind) {
    case "month":
      return { kind: "month", month: problem.month };
    case "day":
      return {
        kind: "day",
        year: problem.year,
        month: problem.month,
        day: problem.day,
        daysInMonth: problem.daysInMonth,
      };
    case "hour":
      return { kind: "hour", value: problem.hour };
    case "minute":
      return { kind: "minute", value: problem.minute };
    case "second":
      return { kind: "second", value: problem.second };
    case "format":
      return { kind: "format" };
  }
}

/**
 * The first directive of an `axisFormat` that is not one of `AXIS_DIRECTIVES`, as written (`%Q`),
 * or a lone `%` at the end; null when every directive is known.
 */
export function badDirective(format: string): string | null {
  for (let i = 0; i < format.length; i++) {
    if (format[i] !== "%") continue;
    let j = i + 1;
    const flag = format[j] === "-";
    if (flag) j++;
    const directive = format[j];
    if (directive === undefined) return format.slice(i);
    if (
      !(AXIS_DIRECTIVES as readonly string[]).includes(directive) ||
      (flag && directive === "%")
    ) {
      return format.slice(i, j + 1);
    }
    i = j;
  }
  return null;
}

/**
 * The strongly connected components of the nodes `among`, by Tarjan's algorithm, with the nodes
 * a component's members depend on as its edges.
 */
function stronglyConnected(
  count: number,
  edges: (node: number) => number[],
  among: readonly boolean[],
): number[][] {
  const index = new Array<number>(count).fill(-1);
  const low = new Array<number>(count).fill(0);
  const onStack = new Array<boolean>(count).fill(false);
  const stack: number[] = [];
  const components: number[][] = [];
  let counter = 0;
  for (let root = 0; root < count; root++) {
    if (!among[root] || index[root] !== -1) continue;
    const work: { node: number; next: number }[] = [{ node: root, next: 0 }];
    index[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = true;
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const targets = edges(frame.node);
      if (frame.next < targets.length) {
        const to = targets[frame.next++]!;
        if (!among[to]) continue;
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
