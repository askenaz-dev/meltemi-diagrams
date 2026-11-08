import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALIGN_EDGES,
  AXES,
  EXPORT_FORMATS,
  EXPORT_OPTIONS,
  SCENE_STATEMENTS,
  STORY_ACTIONS,
  STORY_STATEMENTS,
  STORY_TRANSITIONS,
  CONSTRAINTS,
  DIAGRAM_TYPES,
  FLOW_PROFILE,
  FREE_PROFILE,
  GANTT_AXIS_PLACES,
  GANTT_CHART_STATEMENTS,
  GANTT_CLAUSES,
  GANTT_DEPENDENCIES,
  GANTT_DISPLAYS,
  GANTT_ELEMENT_KINDS,
  GANTT_LABEL_PLACES,
  GANTT_PROFILE,
  GANTT_STATUS_WORDS,
  LIST_ALIGNS,
  LIST_LAYOUTS,
  MAIN_LAYER,
  PORTS,
  THEME_TOKENS,
  WEEKDAYS,
} from "@meltemi/diagrams-model";
import { KEY_BINDINGS } from "@meltemi/diagrams-editor/canvas";
import { REPO_ROOT } from "../../../../test-support/corpus.js";
import { CanvasOpening, type OpenWithText } from "../../src/extension/remember.js";

const root = join(REPO_ROOT, "packages", "vscode");

interface Rule {
  name?: string;
  match?: string;
  begin?: string;
  end?: string;
  patterns?: { name?: string; match?: string; include?: string }[];
}

interface Grammar {
  patterns: { include: string }[];
  repository: Record<string, Rule>;
}

describe("grammar", () => {
  const grammar = JSON.parse(
    readFileSync(join(root, "syntaxes", "meltemi.tmLanguage.json"), "utf8"),
  ) as Grammar;
  const regexes = Object.values(grammar.repository)
    .flatMap((rule) => [rule.match, ...(rule.patterns ?? []).map((p) => p.match)])
    .filter((m): m is string => !!m)
    .map((m) => new RegExp(m));

  it("covers every keyword of the schema tables", () => {
    const enums = new Set<string>();
    const collect = (
      table: Readonly<Record<string, { kind: string; values?: readonly unknown[] }>>,
    ) => {
      for (const spec of Object.values(table))
        if (spec.kind === "enum") spec.values!.forEach((v) => enums.add(String(v)));
    };
    collect(FLOW_PROFILE.diagramProperties);
    collect(FLOW_PROFILE.styleProperties);
    collect(FLOW_PROFILE.animateProperties);
    collect(FREE_PROFILE.diagramProperties);
    collect(FREE_PROFILE.styleProperties);
    collect(GANTT_PROFILE.diagramProperties);
    collect(THEME_TOKENS);
    const words = [
      "language",
      "import",
      "from",
      "as",
      "diagram",
      "theme",
      "model",
      "story",
      "export",
      "port",
      "at",
      "to",
      "via",
      "offset",
      "forever",
      ...Object.keys(FLOW_PROFILE.diagramProperties),
      ...FLOW_PROFILE.elementKinds,
      ...FLOW_PROFILE.diagramBlocks,
      ...FLOW_PROFILE.placementStatements,
      ...CONSTRAINTS,
      ...Object.keys(FLOW_PROFILE.styleProperties),
      ...Object.keys(FLOW_PROFILE.animateProperties),
      ...Object.keys(FREE_PROFILE.diagramProperties),
      ...FREE_PROFILE.elementKinds,
      ...Object.keys(FREE_PROFILE.elementProperties),
      ...Object.keys(FREE_PROFILE.groupProperties),
      ...Object.keys(FREE_PROFILE.styleProperties),
      MAIN_LAYER,
      ...PORTS,
      ...Object.keys(THEME_TOKENS),
      ...enums,
      ...DIAGRAM_TYPES,
      ...ALIGN_EDGES,
      ...AXES,
      ...STORY_STATEMENTS,
      ...SCENE_STATEMENTS,
      ...STORY_ACTIONS,
      ...STORY_TRANSITIONS,
      ...Object.keys(EXPORT_OPTIONS),
      ...EXPORT_FORMATS,
      // A gantt chart: its statements, the clause and status words after a label, the chart
      // statements and the words they take.
      ...Object.keys(GANTT_PROFILE.diagramProperties),
      ...GANTT_ELEMENT_KINDS,
      ...GANTT_PROFILE.diagramBlocks,
      ...GANTT_CHART_STATEMENTS,
      ...Object.values(GANTT_CLAUSES).flat(),
      ...GANTT_STATUS_WORDS,
      ...GANTT_AXIS_PLACES,
      ...GANTT_LABEL_PLACES,
      ...GANTT_DISPLAYS,
      ...GANTT_DEPENDENCIES,
      ...WEEKDAYS,
      "weekends",
    ];
    const missing = words.filter((word) => !regexes.some((r) => r.test(` ${word} `)));
    expect(missing).toEqual([]);
  });

  describe("gantt charts", () => {
    const patterns = grammar.repository["keywords"]!.patterns ?? [];
    /** The scope of the first keyword pattern that matches the word; the order of the grammar. */
    const scopeOf = (word: string) =>
      patterns.find((p) => p.match !== undefined && new RegExp(p.match).test(` ${word} `))?.name;
    const statement = grammar.repository["gantt-statement"]!;
    /** The scope the words of a task, milestone or marker line get inside the statement's rule. */
    const clauseScopeOf = (word: string) =>
      statement.patterns?.find(
        (p) => p.match !== undefined && new RegExp(p.match).test(` ${word} `),
      )?.name;

    it("names the type in the header of a diagram", () => {
      const header = new RegExp(grammar.repository["diagram-header"]!.match!);
      for (const type of DIAGRAM_TYPES)
        expect(header.test(`diagram plan: ${type} {`), type).toBe(true);
      expect(header.test("diagram plan: gantts {")).toBe(false);
      expect(scopeOf("gantt")).toBe("constant.language.meltemi");
    });

    it("scopes the statements as kinds, and the chart statements as properties", () => {
      for (const word of GANTT_ELEMENT_KINDS) {
        expect(scopeOf(word), word).toBe("storage.type.element.meltemi");
      }
      for (const word of GANTT_CHART_STATEMENTS) {
        // `include` and `exclude` are the profile statements of C4 views too.
        const expected =
          word === "exclude" || word === "include"
            ? "keyword.control.profile.meltemi"
            : "support.type.property-name.diagram.meltemi";
        expect(scopeOf(word), word).toBe(expected);
      }
    });

    it("scopes the values of the chart statements as constants", () => {
      const values = [
        "weekends",
        ...WEEKDAYS,
        ...GANTT_AXIS_PLACES,
        ...GANTT_DISPLAYS,
        ...GANTT_DEPENDENCIES,
      ];
      for (const word of values) expect(scopeOf(word), word).toBe("constant.language.meltemi");
      // `bar` is an arrowhead and `column` a placement constraint elsewhere: after `labels`
      // they are values, and the pattern that says so comes first.
      const labels = patterns.find((p) => p.match?.startsWith("\\b(labels)\\s+"));
      expect(labels).toBeDefined();
      const words = new RegExp(labels!.match!);
      for (const value of GANTT_LABEL_PLACES)
        expect(words.test(`  labels ${value}`), value).toBe(true);
      expect(words.test("  labels beside")).toBe(false);
      const placement = patterns.find((p) => p.match?.startsWith("\\b(place|size|route"));
      expect(patterns.indexOf(labels!)).toBeLessThan(patterns.indexOf(placement!));
    });

    it("scopes the clause and status words of a task, a milestone and a marker as one family", () => {
      const begin = new RegExp(statement.begin!);
      for (const line of [
        'task tec0 "Evaluar" from 2026-06-01 for 5d',
        "milestone launch after a",
        "marker freeze at 2026-07-01",
      ]) {
        expect(begin.test(line), line).toBe(true);
      }
      // A rule for the kind, a longer word and a statement without an id are no statements.
      for (const line of ["rule task { fill accent }", "tasks a", "task { }", "style task1 { }"]) {
        expect(begin.test(line), line).toBe(false);
      }
      // The statement ends where its block or the next statement of the line starts.
      const end = new RegExp(statement.end!);
      const block = ' from 2026-06-01 for 5d { description "x" }';
      expect(end.exec(block)!.index).toBe(block.indexOf("{"));
      const next = " from 2026-06-01; task b";
      expect(end.exec(next)!.index).toBe(next.indexOf(";"));
      const clauses = new Set(Object.values(GANTT_CLAUSES).flat());
      for (const word of clauses) {
        expect(clauseScopeOf(word), word).toBe("keyword.other.clause.gantt.meltemi");
      }
      for (const word of GANTT_STATUS_WORDS) {
        expect(clauseScopeOf(word), word).toBe("constant.language.status.gantt.meltemi");
      }
      // Dates, durations, labels and comments are scoped inside it as outside.
      const inside = (statement.patterns ?? []).map((p) => p.include ?? p.match);
      expect(inside).toEqual(
        expect.arrayContaining(["#comments", "#strings", "#dates", "#numbers"]),
      );
      // It comes before the keywords, which would colour `from` and `after` as other profiles do.
      const order = grammar.patterns.map((p) => p.include);
      expect(order.indexOf("#gantt-statement")).toBeLessThan(order.indexOf("#keywords"));
      expect(order.indexOf("#gantt-statement")).toBeGreaterThan(
        order.indexOf("#declaration-shorthand"),
      );
    });

    it("scopes a date as one token, before the numbers that would split it", () => {
      const dates = new RegExp(grammar.repository["dates"]!.match!, "g");
      expect(grammar.repository["dates"]!.name).toBe("constant.numeric.date.meltemi");
      expect("task a from 2026-06-01 for 5d".match(dates)).toEqual(["2026-06-01"]);
      expect("from 2026-06-01T09:30 to 2026-06-01T17:30:15".match(dates)).toEqual([
        "2026-06-01T09:30",
        "2026-06-01T17:30:15",
      ]);
      expect("exclude 2026-12-24, 2026-12-25".match(dates)).toEqual(["2026-12-24", "2026-12-25"]);
      // What the lexer reads as numbers: no zero padding, a digit more, or part of a name.
      for (const text of ["2026-6-1", "2026-06-011", "20260601", "id2026-06-01", "2026-06"]) {
        expect(text.match(dates), text).toBeNull();
      }
      const order = grammar.patterns.map((p) => p.include);
      expect(order.indexOf("#dates")).toBeLessThan(order.indexOf("#numbers"));
    });

    it("scopes a duration with its unit as a number", () => {
      const numbers = new RegExp(grammar.repository["numbers"]!.match!, "g");
      expect("for 10d, for 2w, for 90min, for 1.5h, for 30s".match(numbers)).toEqual([
        "10d",
        "2w",
        "90min",
        "1.5h",
        "30s",
      ]);
      expect("ticks 1mo, ticks 1y".match(numbers)).toEqual(["1mo", "1y"]);
      // A unit that is not one is no part of the number, and the other units stay.
      expect("for 5days".match(numbers)).toBeNull();
      expect("1200ms 24px".match(numbers)).toEqual(["1200ms", "24px"]);
    });
  });

  it("colours the line tokens as arrows and `line` as a kind only where it declares a line", () => {
    const arrows = new RegExp(grammar.repository["arrows"]!.match!, "g");
    expect("a -- b".match(arrows)).toEqual(["--"]);
    expect("c --- d".match(arrows)).toEqual(["---"]);
    expect("e <--> f -> g".match(arrows)).toEqual(["<-->", "->"]);
    const kind = (grammar.repository["keywords"]!.patterns ?? []).find((p) =>
      p.match?.startsWith("\\b(line)"),
    );
    expect(kind).toBeDefined();
    const declares = new RegExp(kind!.match!);
    expect(declares.test("line l1 from (0, 0) to (100, 0)")).toBe(true);
    expect(declares.test('line l2 "Edge" from (0, 0) to (10, 10)')).toBe(true);
    expect(declares.test("style a { line dashed }")).toBe(false);
  });

  it("colours the whiteboard words: pens, stickies, `draw`, `preset board` and `opacity`", () => {
    const scopeOf = (word: string) =>
      (grammar.repository["keywords"]!.patterns ?? []).find(
        (p) => p.match && new RegExp(p.match).test(` ${word} `),
      ) as { name?: string } | undefined;
    expect(scopeOf("pen")?.name).toBe("storage.type.element.meltemi");
    expect(scopeOf("sticky")?.name).toBe("storage.type.element.meltemi");
    expect(scopeOf("draw")?.name).toBe("keyword.control.profile.meltemi");
    expect(scopeOf("board")?.name).toBe("constant.language.meltemi");
    expect(scopeOf("opacity")?.name).toBe("support.type.property-name.style.meltemi");
    // `spacing` is a list group's property and a sequence diagram's: one scope for both.
    expect(scopeOf("spacing")?.name).toBe("support.type.property-name.diagram.meltemi");
    expect(scopeOf("stickyText")?.name).toBe("support.type.property-name.theme.meltemi");
  });

  it("colours a list group's `layout` and `align` with their values, and leaves the constraint alone", () => {
    const patterns = grammar.repository["keywords"]!.patterns ?? [];
    const layout = patterns.find((p) => p.match?.startsWith("\\b(layout)\\s+"));
    const align = patterns.find((p) => p.match?.startsWith("\\b(align)\\s+"));
    expect(layout).toBeDefined();
    expect(align).toBeDefined();
    const layoutWords = new RegExp(layout!.match!);
    const alignWords = new RegExp(align!.match!);
    for (const value of LIST_LAYOUTS)
      expect(layoutWords.test(`  layout ${value}`), value).toBe(true);
    for (const value of LIST_ALIGNS) expect(alignWords.test(`  align ${value}`), value).toBe(true);
    // The diagram's `layout manual` and the constraint `align a, b top` are not list words.
    expect(layoutWords.test("  layout manual")).toBe(false);
    expect(alignWords.test("    align api, db top")).toBe(false);
    // Each comes before the patterns that would colour `layout` as a diagram property and
    // `column`, `row` or `align` as placement words.
    const index = (p: { match?: string } | undefined) => patterns.indexOf(p!);
    const placement = patterns.find((p) => p.match?.startsWith("\\b(place|size|route"));
    const diagram = patterns.find((p) => p.match?.startsWith("\\b(direction|layout"));
    expect(index(layout)).toBeLessThan(index(placement));
    expect(index(layout)).toBeLessThan(index(diagram));
    expect(index(align)).toBeLessThan(index(placement));
  });

  it("colours `return`, `spacing` and the sides of `space` and `gap`", () => {
    const patterns = grammar.repository["keywords"]!.patterns ?? [];
    const scopeOf = (word: string) =>
      patterns.find((p) => p.match !== undefined && new RegExp(p.match).test(` ${word} `))?.name;
    expect(scopeOf("return")).toBe("keyword.control.sequence.meltemi");
    expect(scopeOf("spacing")).toBe("support.type.property-name.diagram.meltemi");
    expect(scopeOf("before")).toBe("keyword.other.sequence.meltemi");
    expect(scopeOf("after")).toBe("keyword.other.sequence.meltemi");
  });

  it("colours the `on` of a note's attachment as a placement word", () => {
    const placement = (grammar.repository["keywords"]!.patterns ?? []).find((p) =>
      p.match?.startsWith("\\b(place|size|route"),
    );
    expect(placement).toBeDefined();
    const words = new RegExp(placement!.match!);
    expect(words.test(' note n "Text" on api')).toBe(true);
    expect(words.test("only")).toBe(false);
  });

  it("is referenced by the manifest with the language configuration and snippets", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const contributes = manifest.contributes;
    expect(contributes.languages[0].extensions).toEqual([".meltemi"]);
    expect(contributes.grammars[0].scopeName).toBe("source.meltemi");
    expect(contributes.customEditors[0]).toMatchObject({
      viewType: "meltemi.canvas",
      priority: "option",
    });
    expect(manifest.engines.vscode).toBe("^1.95.0");
    const commands = contributes.commands.map((c: { command: string }) => c.command);
    expect(commands).toEqual(
      expect.arrayContaining([
        "meltemi.openCanvasToSide",
        "meltemi.openCanvas",
        "meltemi.exportSvg",
        "meltemi.arrangeUnplaced",
        "meltemi.recomputeLayout",
        "meltemi.numberMessages",
        "meltemi.formatDocument",
      ]),
    );
    expect(contributes.configuration.properties["meltemi.canvas.grid"].default).toBe(14);
    JSON.parse(readFileSync(join(root, "language-configuration.json"), "utf8"));
    JSON.parse(readFileSync(join(root, "snippets", "meltemi.json"), "utf8"));
  });
});

describe("remembered canvas", () => {
  function opening(mode: OpenWithText = "remember", initial = true) {
    let flag = initial;
    return {
      opening: new CanvasOpening({ get: () => flag, set: (v) => void (flag = v) }, () => mode),
      flag: () => flag,
    };
  }

  it("stays closed after the user closes it, until a canvas is opened again", () => {
    const { opening: o, flag } = opening();
    expect(o.shouldOpen("a")).toBe(true);
    o.userClosed("a");
    expect(flag()).toBe(false);
    expect(o.shouldOpen("b")).toBe(false);
    o.userOpened("b");
    expect(flag()).toBe(true);
    expect(o.shouldOpen("b")).toBe(true);
    // The document closed in this session stays closed until its text is reopened.
    expect(o.shouldOpen("a")).toBe(false);
    o.documentClosed("a");
    expect(o.shouldOpen("a")).toBe(true);
  });

  it("follows the setting", () => {
    expect(opening("always", false).opening.shouldOpen("a")).toBe(true);
    expect(opening("never", true).opening.shouldOpen("a")).toBe(false);
    const always = opening("always").opening;
    always.userClosed("a");
    expect(always.shouldOpen("a")).toBe(false);
    expect(always.shouldOpen("b")).toBe(true);
  });
});

describe("keys", () => {
  it("avoid VS Code's global keys", () => {
    const clashes = KEY_BINDINGS.filter(
      (b) =>
        (b.primary &&
          !b.alt &&
          !b.shift &&
          ["g", "k", "p", "s", "w", "z", "y", "o", "n", "b"].includes(b.key)) ||
        (b.primary && b.shift && !b.alt && ["g", "p", "e", "f", "x"].includes(b.key)) ||
        (b.primary && b.alt && b.key.startsWith("Arrow")) ||
        (b.alt && !b.shift && !b.primary && (b.key === "ArrowLeft" || b.key === "ArrowRight")),
    );
    expect(clashes.map((b) => b.command)).toEqual([]);
  });
});
