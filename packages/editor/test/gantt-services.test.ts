import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, untranslated, type Locale } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  codeActions,
  completions,
  definition,
  documentSymbols,
  highlights,
  hover,
  prepareRename,
  references,
  rename,
  selectionAt,
  semanticTokens,
} from "../src/index.js";
import { serviceMessages } from "../src/messages/services.js";
import { GANTT_DOCS, ganttDoc, keywordDoc } from "../src/services/docs.js";

/** The owner's chart: three sections, ten tasks, the weekends excluded. */
const roadmap = readFileSync(join(CORPUS_ROOT, "valid", "gantt", "roadmap.meltemi"), "utf8");

/** The day the host says it is: quick fixes and snippets write it. */
const TODAY = "2026-10-29";

/** Analysis of a text with the cursor at `|`, and the offset of the cursor. */
function at(source: string, today: string | undefined = TODAY) {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  const layout = today === undefined ? undefined : { today };
  return { analysis: analyzeDocument({ text, ...(layout ? { layout } : {}) }), offset, text };
}

/** A chart with the given statements. */
const chart = (body: string): string => `language "0.2"\ndiagram plan: gantt {\n${body}\n}\n`;

const labels = (source: string) => {
  const { analysis, offset } = at(source);
  return completions(analysis, offset).map((i) => i.label);
};
const details = (source: string) => {
  const { analysis, offset } = at(source);
  return new Map(completions(analysis, offset).map((i) => [i.label, i.detail]));
};
const hovered = (source: string) => {
  const { analysis, offset } = at(source);
  return hover(analysis, offset)?.markdown ?? "";
};

/** The fixes offered for the first diagnostic with `code`, and the text each one leaves. */
function fixesFor(text: string, code: string) {
  const analysis = analyzeDocument({ text, layout: { today: TODAY } });
  const diagnostic = analysis.diagnostics.find((d) => d.code === code);
  if (!diagnostic) throw new Error(`no ${code} in the text`);
  const offset = diagnostic.range.start.offset;
  return codeActions(analysis, { start: offset, end: offset })
    .filter((a) => a.diagnostic === diagnostic)
    .map((a) => ({ ...a, after: applyTextEdits(text, a.edits) }));
}

/** The diagnostics of the language that a text gives, other than information, by code. */
const reported = (text: string) =>
  compile(text)
    .diagnostics.filter((d) => d.severity !== "info")
    .map((d) => d.code);

/** The statements a chart's lines write. */
const plan = chart(`  exclude weekends
  section build "Build" {
    task design "Design" from 2026-06-01 for 5d
    task code "Code" after design for 10d
    milestone beta "Beta" after code
    marker freeze "Code freeze" at 2026-06-26
  }
  task ship "Ship" after beta for 2d
  task review "Review" after code, ship for 1d
`);

describe("gantt completion: the chart and its sections", () => {
  it("lists gantt among the types of a diagram, with what it is", () => {
    expect(labels("diagram p: |\n")).toEqual(["flow", "sequence", "c4", "free", "gantt"]);
    expect(details("diagram p: |\n").get("gantt")).toMatch(/^A gantt chart: sections of tasks/);
  });

  it("offers a chart to start from, with the host's day as its first start", () => {
    const { analysis, offset } = at("|");
    const snippet = completions(analysis, offset).find((i) => i.label === "diagram (gantt)")!;
    expect(snippet).toMatchObject({ kind: "snippet", snippet: true });
    expect(snippet.insertText).toContain(`from \${7:${TODAY}} for \${8:5d}`);
    // Typed over with its placeholders, it is a chart without a diagnostic.
    const written = snippet.insertText!.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace("$0", "");
    expect(compile(`language "0.2"\n${written}\n`).diagnostics).toEqual([]);
    // The day is the host's: another day, another snippet.
    const other = at("|", "2027-01-04");
    const item = completions(other.analysis, other.offset).find(
      (i) => i.label === "diagram (gantt)",
    );
    expect(item!.insertText).toContain("from ${7:2027-01-04}");
  });

  it("offers the statements of a chart: its rows, its settings and its blocks, and no ids", () => {
    const items = details(plan.replace("  task review", "  |\n  task review"));
    expect([...items.keys()]).toEqual([
      "section",
      "task",
      "milestone",
      "marker",
      "exclude",
      "include",
      "weekStart",
      "axisFormat",
      "ticks",
      "axis",
      "labels",
      "display",
      "dependencies",
      "dayWidth",
      "today",
      "theme",
      "title",
      "description",
      "preset",
      "canvas",
      "style",
      "animate",
      "class",
      "rule",
    ]);
    expect(items.get("task")).toMatch(/^A bar from a start to an end: `task <id>/);
    expect(items.get("milestone")).toMatch(/^A diamond at one instant/);
    expect(items.get("exclude")).toMatch(/^Days that do not work/);
    expect(items.get("axisFormat")).toMatch(/^The format of the axis labels/);
    // Words of a title or a block are documented as everywhere.
    expect(items.get("title")).toBe(keywordDoc("title"));
  });

  it("completes a statement being typed", () => {
    expect(labels(chart("  ta|"))).toContain("task");
    expect(labels(chart("  task|"))).toContain("task");
    expect(labels(chart("  a: |"))).toEqual([]);
    // The statements of a chart are not the ones of the other profiles.
    const names = labels(chart("  |"));
    for (const other of ["participant", "node", "box", "place", "group", "pen"]) {
      expect(names).not.toContain(other);
    }
  });

  it("offers a section the bars it holds and the properties of a group, nothing else", () => {
    const items = details(chart('  section s "S" {\n    |\n  }'));
    expect([...items.keys()]).toEqual([
      "task",
      "milestone",
      "marker",
      "description",
      "class",
      "link",
      "url",
    ]);
    expect(items.get("marker")).toMatch(/^A dashed line across the chart/);
    // No section inside a section, and the chart's settings stay out of it.
    for (const refused of ["section", "exclude", "today", "style"]) {
      expect(items.has(refused)).toBe(false);
    }
    // Typing a word of the block, with the section still open.
    expect(labels('language "0.2"\ndiagram p: gantt {\n  section s "S" {\n    mi|')).toContain(
      "milestone",
    );
    // On the line of the section, after its brace.
    expect(labels(chart('  section s "S" { ta|'))).toContain("task");
    expect(labels(chart('  section s "S" |'))).toEqual([]);
  });

  it("completes the block of a section and of a task", () => {
    expect(labels(chart('  section s "S" {\n    class |\n  }'))).toEqual(
      expect.arrayContaining(["critical", "highlight"]),
    );
    expect(labels(chart("  task a from 2026-06-01 { | }"))).toEqual([
      "description",
      "class",
      "link",
      "url",
    ]);
    expect(labels(chart("  milestone m at 2026-06-01 { | }"))).toContain("description");
    expect(labels(chart("  marker k at 2026-06-01 { | }"))).toContain("url");
  });
});

describe("gantt completion: clause and status words", () => {
  const TASK = ["from", "after", "for", "to", "until", "done", "active", "critical"];

  it("offers the clauses and the status words after an id or a label", () => {
    expect(labels(chart('  task a "A" |'))).toEqual(TASK);
    expect(labels(chart("  task a |"))).toEqual(TASK);
    expect(labels(chart('  task a "A" fr|'))).toEqual(TASK);
    expect(labels(chart('  milestone m "M" |'))).toEqual([
      "at",
      "after",
      "done",
      "active",
      "critical",
    ]);
    expect(labels(chart('  marker k "K" |'))).toEqual(["at", "after"]);
    // What each word means, in a chart: not what `from` and `after` mean in a route or a message.
    const words = details(chart('  task a "A" |'));
    expect(words.get("from")).toMatch(/^The start of a task/);
    expect(words.get("after")).toMatch(/^What a task, milestone or marker waits for/);
    expect(words.get("for")).toMatch(/^How long a task lasts/);
    expect(words.get("critical")).toMatch(/^On the critical path/);
  });

  it("leaves out what is written already", () => {
    const rest = (written: string) => labels(chart(`  task a "A" ${written} |`));
    expect(rest("from 2026-06-01")).toEqual(TASK.filter((w) => w !== "from"));
    expect(rest("after b")).toEqual(TASK.filter((w) => w !== "after"));
    // One end clause only: `for`, `to` and `until` go together.
    for (const end of ["for 3d", "to 2026-06-09", "until b"]) {
      expect(rest(end), end).toEqual(["from", "after", "done", "active", "critical"]);
    }
    // One status: `done` and `active` go together, `critical` stands on its own.
    expect(rest("done")).toEqual(["from", "after", "for", "to", "until", "critical"]);
    expect(rest("active critical")).toEqual(["from", "after", "for", "to", "until"]);
    expect(rest("from 2026-06-01 after b for 3d done critical")).toEqual([]);
  });

  it("offers a milestone its two clauses, and a marker one place", () => {
    expect(labels(chart('  milestone m "M" at 2026-06-01 done |'))).toEqual(["after", "critical"]);
    expect(labels(chart('  marker k "K" at 2026-06-01 |'))).toEqual([]);
    expect(labels(chart('  marker k "K" after a |'))).toEqual([]);
  });

  it("starts again after a semicolon", () => {
    expect(labels(chart('  task a from 2026-06-01; task b "B" |'))).toEqual(TASK);
  });

  it("offers nothing where a date, a duration or an id is being written", () => {
    for (const written of ["from", "to", "for"]) {
      expect(labels(chart(`  task a "A" ${written} |`)), written).toEqual([]);
    }
    // A date being typed, or typed.
    for (const written of [
      "from 2026-06",
      "from 2026-06-0",
      "from 2026-06-01",
      "to 2026-06-01T09",
    ]) {
      expect(labels(chart(`  task a "A" ${written}|`)), written).toEqual([]);
    }
    expect(labels(chart('  milestone m "M" at |'))).toEqual([]);
    expect(labels(chart('  marker k "K" at |'))).toEqual([]);
    expect(labels(chart("  task |"))).toEqual([]);
    expect(labels(chart("  task a|"))).toEqual([]);
    expect(labels(chart("  milestone |"))).toEqual([]);
  });
});

describe("gantt completion: tasks after `after` and `until`", () => {
  it("offers the tasks and milestones of the owner's chart, and no section", () => {
    const { analysis, offset } = at(
      roadmap.replace('task flu0 "Propuesta', 'task tec3 "Demo" after |\n    task flu0 "Propuesta'),
    );
    const items = completions(analysis, offset);
    expect(items.map((i) => i.label)).toEqual([
      "tec0",
      "tec1",
      "tec2",
      "flu0",
      "flu1",
      "flu2",
      "flu3",
      "sdlc0",
      "sdlc1",
      "sdlc2",
    ]);
    expect(items.map((i) => i.label)).not.toContain("tecnologia");
    expect(items[1]).toMatchObject({
      kind: "element",
      detail: "task · Prueba de concepto con el equipo de Arquitectura",
    });
  });

  it("offers milestones, but neither sections nor markers", () => {
    // `build` is a section and `freeze` a marker: neither can be waited for.
    const text = plan.replace("  task review", '  task wait "Wait" after |\n  task review');
    expect(labels(text)).toEqual(["design", "code", "beta", "ship", "review"]);
    expect(
      labels(plan.replace("  task review", '  milestone launch "Launch" after |\n  task review')),
    ).toEqual(["design", "code", "beta", "ship", "review"]);
  });

  it("offers the same after `until`", () => {
    expect(
      labels(plan.replace("  task review", '  task wait "Wait" until |\n  task review')),
    ).toEqual(["design", "code", "beta", "ship", "review"]);
  });

  it("leaves out the statement's own id, the ids listed and the tasks that wait for it", () => {
    // `ship` waits for `beta`, which waits for `code`: after `code`, none of them could be named.
    const code = plan.replace('task code "Code" after design', 'task code "Code" after |');
    expect(labels(code)).toEqual(["design"]);
    // Listed ids go, and a comma starts the next one.
    const listed = plan.replace(
      'task review "Review" after code, ship',
      'task review "Review" after code, |',
    );
    expect(labels(listed)).toEqual(["design", "beta", "ship"]);
    expect(
      labels(
        plan.replace('task review "Review" after code, ship', 'task review "Review" until ship, |'),
      ),
    ).toEqual(["design", "code", "beta"]);
    // Nothing waits for `review`, and it is not offered to itself.
    expect(
      labels(plan.replace('task review "Review" after code, ship', 'task review "Review" after |')),
    ).toEqual(["design", "code", "beta", "ship"]);
  });

  it("offers the clause words after an id with no comma, and ids after one", () => {
    const sheet = chart('  task a from 2026-06-01\n  task b "B" after a |');
    expect(labels(sheet)).toEqual(["from", "for", "to", "until", "done", "active", "critical"]);
    expect(
      labels(chart('  task a from 2026-06-01\n  task c from 2026-06-01\n  task b "B" after a, |')),
    ).toEqual(["c"]);
  });
});

describe("gantt completion: units, days and the values of the chart statements", () => {
  it("offers the units of a duration after its number, replacing the letters typed", () => {
    const items = details(chart("  task a from 2026-06-01 for 5|"));
    expect([...items.keys()]).toEqual(["s", "min", "h", "d", "w"]);
    expect(items.get("d")).toBe("days; working days under `exclude`");
    expect(items.get("w")).toBe("weeks; the working days of a week under `exclude`");
    const { analysis, offset } = at(chart("  task a from 2026-06-01 for 5mi|"));
    const [first] = completions(analysis, offset);
    expect(analysis.text.slice(first!.range.start, first!.range.end)).toBe("mi");
    // A decimal, and a duration that is not the one being written.
    expect(labels(chart("  task a from 2026-06-01 for 1.5|"))).toContain("h");
    expect(labels(chart("  task a from 2026-06-01 5|"))).toEqual([]);
    expect(labels(chart("  dayWidth 5|"))).toEqual([]);
  });

  it("offers months and years for the ticks of the axis too", () => {
    expect(labels(chart("  ticks 2|"))).toEqual(["s", "min", "h", "d", "w", "mo", "y"]);
    expect(details(chart("  ticks 2|")).get("mo")).toBe("months; for `ticks` only");
    expect(labels(chart("  ticks |"))).toEqual([]);
  });

  it("offers `weekends` and the weekdays after `exclude`, but not the ones listed", () => {
    expect(labels(chart("  exclude |"))).toEqual([
      "weekends",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
    expect(labels(chart("  exclude weekends, |"))).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
    expect(labels(chart("  exclude monday, 2026-12-25, |"))).not.toContain("monday");
    expect(labels(chart("  exclude fri|"))).toContain("friday");
    expect(details(chart("  exclude |")).get("weekends")).toBe(
      "Saturday and Sunday: `exclude weekends`.",
    );
    expect(details(chart("  exclude |")).get("friday")).toBe(
      "A day of the week: `exclude friday` leaves it out of working time, and `weekStart friday` starts the weeks of the axis on it.",
    );
    // After a day with no comma the list is over; `include` takes dates only.
    expect(labels(chart("  exclude weekends |"))).toEqual([]);
    expect(labels(chart("  include |"))).toEqual([]);
  });

  it("offers the weekdays after `weekStart`, and no `weekends`", () => {
    expect(labels(chart("  weekStart |"))).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
    expect(labels(chart("  weekStart monday |"))).toEqual([]);
  });

  it("offers the values of the axis, labels, display and dependencies", () => {
    expect(labels(chart("  axis |"))).toEqual(["top", "bottom", "both"]);
    expect(labels(chart("  labels |"))).toEqual(["bar", "column"]);
    expect(labels(chart("  display |"))).toEqual(["normal", "compact"]);
    expect(labels(chart("  dependencies |"))).toEqual(["shown", "hidden"]);
    // `column` and `bar` mean something else in placements and arrowheads.
    expect(details(chart("  labels |")).get("column")).toBe(
      "In the left column, under the title of the task's section.",
    );
    expect(details(chart("  labels |")).get("bar")).toMatch(/^On the bar when the label fits/);
    // The ones of a diagram property of every profile are still offered.
    expect(labels(chart("  preset |"))).toEqual(["document", "slide", "board"]);
    // Nothing is offered where a date, a number or a string goes.
    expect(labels(chart("  today |"))).toEqual([]);
    expect(labels(chart("  axis top |"))).toEqual([]);
  });

  it("offers the directives of an axis format inside its string", () => {
    const items = details(chart('  axisFormat "%d |"'));
    expect([...items.keys()]).toEqual([
      "%a",
      "%A",
      "%b",
      "%B",
      "%d",
      "%e",
      "%H",
      "%I",
      "%j",
      "%m",
      "%M",
      "%p",
      "%q",
      "%S",
      "%U",
      "%V",
      "%w",
      "%W",
      "%y",
      "%Y",
      "%%",
    ]);
    expect(items.get("%d")).toBe("The day of the month, 01 to 31.");
    expect(items.get("%V")).toBe("The ISO 8601 week of the year, 01 to 53.");
    // The directive being typed is replaced; after the flag, every directive has it.
    const { analysis, offset } = at(chart('  axisFormat "%d %|"'));
    const [first] = completions(analysis, offset);
    expect(analysis.text.slice(first!.range.start, first!.range.end)).toBe("%");
    expect(labels(chart('  axisFormat "%-|"'))).toEqual(
      expect.arrayContaining(["%-d", "%-m", "%-Y"]),
    );
    expect(labels(chart('  axisFormat "%-|"'))).not.toContain("%-%");
    // Only in a chart, only in this statement.
    expect(labels('diagram f: flow {\n  title "%d |"\n}\n')).toEqual([]);
    expect(labels(chart('  title "%d |"'))).toEqual([]);
  });
});

describe("gantt completion: styles, rules and stories", () => {
  it("offers the kinds of a chart to `rule`, and its rows to `style`", () => {
    expect(labels(chart("  rule |"))).toEqual([
      "section",
      "task",
      "milestone",
      "marker",
      "relation",
    ]);
    expect(labels(chart("  task a from 2026-06-01\n  style |"))).toEqual(["a"]);
    // Sections and markers are styled too; the arrows have no names to style by.
    const sheet = chart(
      '  section s "S" {\n    task a from 2026-06-01\n    task b after a\n    marker k at 2026-06-09\n  }\n  style a, |',
    );
    expect(labels(sheet)).toEqual(["s", "a", "b", "k"]);
  });

  it("offers the style properties a chart takes, and none it refuses", () => {
    const names = labels(chart("  task a from 2026-06-01\n  style a { | }"));
    expect(names).toEqual(
      expect.arrayContaining([
        "fill",
        "stroke",
        "color",
        "line",
        "width",
        "pattern",
        "radius",
        "icon",
      ]),
    );
    for (const refused of [
      "iconPosition",
      "labelPosition",
      "iconSize",
      "routing",
      "shape",
      "rotation",
      "opacity",
    ]) {
      expect(names, refused).not.toContain(refused);
    }
    expect(labels(chart("  rule task { | }"))).not.toContain("iconPosition");
    expect(labels(chart("  task a from 2026-06-01\n  style a { fill | }"))).toContain("accent");
  });

  it("offers `draw` the tasks of the view, and `trace` the ones with arrows", () => {
    const story = (action: string) =>
      `${plan}story tour for plan {\n  scene one {\n    ${action}\n  }\n}\n`;
    const draw = labels(story("draw |"));
    expect(draw).toEqual(["design", "code", "ship", "review"].filter((id) => draw.includes(id)));
    expect(draw).toEqual(expect.arrayContaining(["design", "code", "ship", "review"]));
    expect(draw).not.toContain("build");
    expect(draw).not.toContain("freeze");
    // `design` follows nothing: there is no chain to draw into it.
    expect(labels(story("trace |"))).toEqual(["code", "beta", "ship", "review"]);
    expect(details(story("trace |")).get("code")).toBe("task · Code");
    expect(labels(story("reveal |"))).toEqual(
      expect.arrayContaining(["build", "design", "beta", "freeze"]),
    );
  });
});

describe("gantt hover", () => {
  it("shows a task's dates, working days and dependencies", () => {
    const markdown = hovered(roadmap.replace("task tec1 ", "task |tec1 "));
    expect(markdown).toBe(
      [
        "**task** `tec1` — Prueba de concepto con el equipo de Arquitectura",
        "",
        "Monday 2026-06-08 → Friday 2026-06-19 · 10 working days",
        "",
        "follows `tec0` · precedes `tec2` · in `tecnologia`",
      ].join("\n"),
    );
    // The same from where another task names it, and from a story that does.
    expect(hovered(roadmap.replace("after tec1 for 1d", "after te|c1 for 1d"))).toBe(markdown);
  });

  it("says what a task with no start follows, and where an `until` ends it", () => {
    const sheet = chart("  task a from 2026-06-01 for 1d\n  task |b for 2d");
    expect(hovered(sheet)).toBe(
      [
        "**task** `b` — b",
        "",
        "Tuesday 2026-06-02 → Wednesday 2026-06-03 · 2 working days",
        "",
        "follows `a` (it has no start of its own)",
      ].join("\n"),
    );
    const until = hovered(chart("  task c from 2026-06-10\n  task |b from 2026-06-01 until c"));
    expect(until).toContain("Monday 2026-06-01 → Tuesday 2026-06-09 · 9 working days");
    expect(until).toContain("ends when `c` starts");
    expect(
      hovered(
        chart(
          "  task d from 2026-06-10\n  task c from 2026-06-12\n  task |b from 2026-06-01 until c d",
        ),
      ),
    ).toContain("ends when the first of `c`, `d` starts");
  });

  it("shows a milestone with its status, a marker with its day and a task a loop leaves", () => {
    expect(
      hovered(
        chart('  task a from 2026-06-01 for 2d\n  milestone |m "Done" after a done critical'),
      ),
    ).toBe(
      [
        "**milestone** `m` — Done",
        "",
        "Wednesday 2026-06-03",
        "",
        "`done` · `critical` · follows `a`",
      ].join("\n"),
    );
    expect(hovered(chart('  marker |k "K" at 2026-06-06'))).toBe(
      ["**marker** `k` — K", "", "Saturday 2026-06-06"].join("\n"),
    );
    expect(hovered(chart("  task |a after b for 1d\n  task b after a for 1d"))).toContain(
      "not scheduled",
    );
    expect(hovered(chart('  task |a "A" for 2d'))).toContain("not scheduled");
  });

  it("shows hours as hours, with the days they fall on", () => {
    const sheet = chart("  exclude weekends\n  task |a from 2026-06-05T18:00 for 12h");
    expect(hovered(sheet)).toContain(
      "Friday 2026-06-05 18:00 → Monday 2026-06-08 06:00 · 12 working hours",
    );
  });

  it("shows a section with the days its rows cover and what it holds", () => {
    expect(hovered(roadmap.replace("section tecnologia", "section |tecnologia"))).toBe(
      [
        "**section** `tecnologia` — Tecnología",
        "",
        "Monday 2026-06-01 → Monday 2026-06-22 · 3 tasks",
      ].join("\n"),
    );
    const mixed = hovered(
      plan
        .replace('section build "Build"', 'section |build "Build"')
        .replace("  task review", "  task review"),
    );
    expect(mixed).toContain("2 tasks · 1 milestone · 1 marker");
    expect(hovered(chart('  section |empty "Empty" { description "Nothing yet" }'))).toBe(
      "**section** `empty` — Empty\n\nNothing yet",
    );
  });

  it("shows a date's weekday, and whether the chart excludes it", () => {
    const weekend = chart("  exclude weekends\n  task a from |2026-06-06 for 1d");
    expect(hovered(weekend)).toBe("**date** `2026-06-06` — Saturday, excluded");
    expect(hovered(chart("  exclude weekends\n  task a from |2026-06-08 for 1d"))).toBe(
      "**date** `2026-06-08` — Monday",
    );
    expect(hovered(chart("  task a from |2026-06-06 for 1d"))).toBe(
      "**date** `2026-06-06` — Saturday",
    );
    // A date with a time, one the chart works despite its exclusions, and one it excludes by date.
    expect(hovered(chart("  exclude weekends\n  task a from 2026-06-05T|09:30 for 1d"))).toBe(
      "**date** `2026-06-05T09:30` — Friday 09:30",
    );
    expect(
      hovered(chart("  exclude weekends\n  include 2026-06-|06\n  task a from 2026-06-01")),
    ).toBe("**date** `2026-06-06` — Saturday, a working day despite the exclusions");
    expect(hovered(chart("  exclude 2026-12-|25\n  task a from 2026-12-01"))).toBe(
      "**date** `2026-12-25` — Friday, excluded",
    );
    expect(hovered(chart("  exclude weekends\n  task a to |2026-06-06 from 2026-06-01"))).toContain(
      "Saturday, excluded",
    );
  });

  it("says nothing of a date that does not exist, and of dates outside a chart", () => {
    expect(hovered(chart("  task a from |2026-02-30 for 1d"))).toBe("");
    expect(hovered('diagram f: flow {\n  title "2026-06-|06"\n}\n')).toBe("");
  });

  it("shows where a duration ends the task, in working days when the chart excludes some", () => {
    expect(hovered(chart("  exclude weekends\n  task a from 2026-06-01 for |5d"))).toBe(
      "**duration** `5d` — 5 working days · ends Friday 2026-06-05",
    );
    expect(hovered(chart("  exclude weekends\n  task a from 2026-06-01 for |2w"))).toBe(
      "**duration** `2w` — 2 weeks · 10 working days · ends Friday 2026-06-12",
    );
    expect(hovered(chart("  task a from 2026-06-01 for |5d"))).toBe(
      "**duration** `5d` — 5 days · ends Friday 2026-06-05",
    );
    expect(hovered(chart("  task a from 2026-06-01T09:00 for |4h"))).toBe(
      "**duration** `4h` — 4 hours · ends Monday 2026-06-01 13:00",
    );
    expect(hovered(chart("  task a from 2026-06-01T09:00 for |1h"))).toContain("1 hour ·");
    expect(hovered(chart("  task a for |3d"))).toBe("**duration** `3d` — 3 days");
    // The milestones and the other numbers of a chart.
    expect(hovered(chart("  dayWidth |12"))).toBe("");
  });

  it("describes the words of a chart as a chart means them", () => {
    const word = (source: string, name: string) => {
      expect(hovered(source)).toBe(`**${name}** — ${GANTT_DOCS[name]}`);
    };
    word(chart("  ta|sk a from 2026-06-01"), "task");
    word(chart("  task a fr|om 2026-06-01"), "from");
    word(chart("  task a from 2026-06-01 fo|r 3d"), "for");
    word(chart("  task a from 2026-06-01 t|o 2026-06-09"), "to");
    word(chart("  task a from 2026-06-01\n  task b after| a"), "after");
    word(chart("  task a from 2026-06-01\n  task b until| a"), "until");
    word(chart("  milestone m a|t 2026-06-01"), "at");
    word(chart("  task a from 2026-06-01 don|e"), "done");
    word(chart("  task a from 2026-06-01 acti|ve"), "active");
    word(chart("  task a from 2026-06-01 critic|al"), "critical");
    word(chart("  exclu|de weekends"), "exclude");
    word(chart("  exclude week|ends"), "weekends");
    word(chart("  weekSt|art monday"), "weekStart");
    word(chart("  today|"), "today");
    word(chart("  ticks| 1w"), "ticks");
    word(chart("  dependencies hid|den"), "hidden");
    expect(hovered(chart("  exclude mon|day"))).toBe(
      "**monday** — A day of the week: `exclude monday` leaves it out of working time, and `weekStart monday` starts the weeks of the axis on it.",
    );
    expect(hovered(chart("  weekStart mon|day"))).toContain("**monday** — A day of the week");
    // The type, and the words that mean the same everywhere.
    expect(hovered("diagram p: gan|tt {\n}\n")).toBe(`**gantt** — ${keywordDoc("gantt")}`);
    expect(hovered(chart('  tit|le "Plan"'))).toBe(`**title** — ${keywordDoc("title")}`);
  });

  it("keeps the other meanings of `from`, `bar`, `column` and `after`", () => {
    // In a flow diagram's route, an arrowhead and a placement, as before.
    const route =
      'diagram d: flow {\n  layout manual\n  a["A"]\n  b["B"]\n  a -> b as r\n  placement {\n    place a at (0, 0)\n    place b at (200, 0)\n    route r fr|om a.east to b.west\n  }\n}\n';
    expect(hovered(route)).toBe("**from** — The source end of a route.");
    // Inside a chart, a word of another statement is that statement's.
    expect(hovered(chart("  rule relation { arrowhead ba|r }"))).toBe(
      "**bar** — A bar across the line.",
    );
    expect(hovered(chart("  labels ba|r"))).toBe(`**bar** — ${GANTT_DOCS["bar"]}`);
    expect(hovered(chart("  labels colu|mn"))).toBe(`**column** — ${GANTT_DOCS["column"]}`);
    expect(ganttDoc("title")).toBeUndefined();
  });

  it("describes the directive under the pointer in an axis format", () => {
    expect(hovered(chart('  axisFormat "%d |%b"'))).toBe("**%b** — The month's short name.");
    expect(hovered(chart('  axisFormat "%d%|b %Y"'))).toBe("**%b** — The month's short name.");
    expect(hovered(chart('  axisFormat "%-|d"'))).toBe("**%-d** — The day of the month, 01 to 31.");
    expect(hovered(chart('  axisFormat "%d |"'))).toBe(
      `**axisFormat** — ${GANTT_DOCS["axisFormat"]}`,
    );
    expect(hovered(chart('  title "%d |%b"'))).toBe("");
  });
});

describe("gantt quick fixes", () => {
  it("writes `from` the host's day for a task nothing starts", () => {
    const sheet = chart('  task a "Kick-off" for 2d');
    const [fix, ...others] = fixesFor(sheet, "gantt.unscheduled");
    expect(others).toEqual([]);
    expect(fix!.title).toBe("Write `from 2026-10-29` (today)");
    expect(fix!.kind).toBe("quickfix");
    expect(fix!.preferred).toBe(true);
    expect(fix!.after).toContain('  task a "Kick-off" from 2026-10-29 for 2d\n');
    expect(reported(fix!.after)).toEqual([]);
    // Without a label, after the id; another day, another date.
    const bare = fixesFor(chart("  task a for 2d"), "gantt.unscheduled")[0]!;
    expect(bare.after).toContain("  task a from 2026-10-29 for 2d\n");
  });

  it("writes `at` for a milestone, and the day the host gives", () => {
    const [fix] = fixesFor(chart('  milestone m "Done"'), "gantt.unscheduled");
    expect(fix!.title).toBe("Write `at 2026-10-29` (today)");
    expect(fix!.after).toContain('  milestone m "Done" at 2026-10-29\n');
    expect(reported(fix!.after)).toEqual([]);
    const other = analyzeDocument({
      text: chart("  task a for 2d"),
      layout: { today: "2027-01-04" },
    });
    const diagnostic = other.diagnostics.find((d) => d.code === "gantt.unscheduled")!;
    const [action] = codeActions(other, {
      start: diagnostic.range.start.offset,
      end: diagnostic.range.start.offset,
    });
    expect(action!.title).toBe("Write `from 2027-01-04` (today)");
  });

  it("writes the machine's day when the host gives none", () => {
    const text = chart("  task a for 2d");
    const analysis = analyzeDocument({ text });
    const diagnostic = analysis.diagnostics.find((d) => d.code === "gantt.unscheduled")!;
    const [action] = codeActions(analysis, {
      start: diagnostic.range.start.offset,
      end: diagnostic.range.start.offset,
    });
    expect(action!.title).toMatch(/^Write `from \d{4}-\d{2}-\d{2}` \(today\)$/);
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(action!.title).toBe(`Write \`from ${day}\` (today)`);
  });

  it("writes `after a` on `b` for a relation, and takes the relation away", () => {
    const text = roadmap.replace(
      "  section nuevo_flujo",
      "  tec2 -> flu3\n\n  section nuevo_flujo",
    );
    const [fix, ...others] = fixesFor(text, "gantt.relation");
    expect(others).toEqual([]);
    expect(fix!.title).toBe("Write `after tec2` on `flu3` and remove the relation");
    expect(fix!.preferred).toBe(true);
    expect(fix!.after).toContain(
      '    task flu3 "Marcha Blanca primeros casos de uso" after flu2, tec2 for 10d\n',
    );
    expect(fix!.after).not.toContain("->");
    expect(reported(fix!.after)).toEqual([]);
    // Everything else is as it was.
    expect(fix!.after.split("\n").filter((l) => l.trim() !== "")).toEqual(
      roadmap
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => l.replace("after flu2 for 10d", "after flu2, tec2 for 10d")),
    );
  });

  it("writes `after` after the start clauses written, as the editor does", () => {
    const withFrom = chart(
      "  task a from 2026-06-01 for 1d\n  task b from 2026-06-05 for 1d\n  a -> b",
    );
    expect(fixesFor(withFrom, "gantt.relation")[0]!.after).toContain(
      "  task b from 2026-06-05 after a for 1d\n",
    );
    const bare = chart('  task a from 2026-06-01 for 1d\n  task b "B" for 1d\n  a -> b');
    expect(fixesFor(bare, "gantt.relation")[0]!.after).toContain('  task b "B" after a for 1d\n');
    const milestone = chart(
      '  task a from 2026-06-01 for 1d\n  milestone m "M" at 2026-06-09 done\n  a -> m',
    );
    const fixed = fixesFor(milestone, "gantt.relation")[0]!.after;
    expect(fixed).toContain('  milestone m "M" at 2026-06-09 after a done\n');
    expect(reported(fixed)).toEqual([]);
    // A relation inside a section, a marker with no place, and a relation to the last id of a list.
    const inSection = chart(
      '  section s "S" {\n    task a from 2026-06-01 for 1d\n    task b for 1d\n    a -> b\n  }',
    );
    const after = fixesFor(inSection, "gantt.relation")[0]!.after;
    expect(after).toContain("    task b after a for 1d\n");
    expect(after).not.toContain("->");
    const marker = chart('  task a from 2026-06-01 for 1d\n  marker k "K"\n  a -> k');
    expect(fixesFor(marker, "gantt.relation")[0]!.after).toContain('  marker k "K" after a\n');
  });

  it("only takes away a relation that says what a task already says", () => {
    const text = chart("  task a from 2026-06-01 for 1d\n  task b after a for 1d\n  a -> b");
    const [fix] = fixesFor(text, "gantt.relation");
    expect(fix!.title).toBe("Remove the relation (`b` already follows `a`)");
    expect(fix!.after).toBe(text.replace("  a -> b\n", ""));
  });

  it("offers nothing for a relation `after` would turn into a loop, or that names no task", () => {
    expect(
      fixesFor(
        chart("  task a from 2026-06-01 for 1d\n  task b after a for 1d\n  b -> a"),
        "gantt.relation",
      ),
    ).toEqual([]);
    expect(
      fixesFor(
        chart(
          "  task a from 2026-06-01 for 1d\n  task b after a for 1d\n  task c after b\n  c -> a",
        ),
        "gantt.relation",
      ),
    ).toEqual([]);
    expect(
      fixesFor(chart("  task a from 2026-06-01 for 1d\n  a -> ghost"), "gantt.relation"),
    ).toEqual([]);
    expect(
      fixesFor(
        chart('  task a from 2026-06-01 for 1d\n  marker k "K" at 2026-06-09\n  a -> k'),
        "gantt.relation",
      ),
    ).toEqual([]);
    expect(
      fixesFor(
        chart('  marker k "K" at 2026-06-09\n  task a from 2026-06-01 for 1d\n  k -> a'),
        "gantt.relation",
      ),
    ).toEqual([]);
  });

  it("moves a date on an excluded day to the next working day", () => {
    const start = chart("  exclude weekends\n  task a from 2026-06-06 for 1d");
    const [fix, ...others] = fixesFor(start, "gantt.excluded-day");
    expect(others).toEqual([]);
    expect(fix!.title).toBe("Move to the next working day, `2026-06-08`");
    expect(fix!.preferred).toBe(true);
    expect(fix!.after).toContain("  task a from 2026-06-08 for 1d\n");
    expect(reported(fix!.after)).toEqual([]);
    // A time stays, a milestone's date moves too, and a holiday is skipped.
    const timed = chart("  exclude weekends\n  task a from 2026-06-06T09:30 for 1d");
    expect(fixesFor(timed, "gantt.excluded-day")[0]!.after).toContain(
      "from 2026-06-08T09:30 for 1d",
    );
    const milestone = chart('  exclude weekends\n  milestone m "M" at 2026-06-07');
    expect(fixesFor(milestone, "gantt.excluded-day")[0]!.after).toContain(
      'milestone m "M" at 2026-06-08',
    );
    const holiday = chart("  exclude weekends, 2026-06-08\n  task a from 2026-06-06 for 1d");
    expect(fixesFor(holiday, "gantt.excluded-day")[0]!.title).toBe(
      "Move to the next working day, `2026-06-09`",
    );
  });

  it("moves an end date to the next working day, or to the previous one the chart draws", () => {
    const end = chart("  exclude weekends\n  task a from 2026-06-01 to 2026-06-06");
    const fixes = fixesFor(end, "gantt.excluded-day");
    expect(fixes.map((f) => f.title)).toEqual([
      "Move to the next working day, `2026-06-08`",
      "Move to the previous working day, `2026-06-05`",
    ]);
    expect(fixes.map((f) => f.preferred)).toEqual([true, false]);
    expect(fixes[0]!.after).toContain("task a from 2026-06-01 to 2026-06-08\n");
    // The previous day is where the chart already drew the end: nothing else moves.
    expect(fixes[1]!.after).toContain("task a from 2026-06-01 to 2026-06-05\n");
    expect(reported(fixes[1]!.after)).toEqual([]);
    expect(reported(fixes[0]!.after)).toEqual([]);
  });

  it("removes the reference that closes a loop, and its clause when it is the only one", () => {
    const loop = chart("  task a after b for 1d\n  task b after a for 1d");
    const [fix, ...others] = fixesFor(loop, "gantt.cycle");
    expect(others).toEqual([]);
    expect(fix!.title).toBe("Remove `b` from `after`");
    expect(fix!.preferred).toBe(true);
    expect(fix!.after).toContain("  task a for 1d\n  task b after a for 1d\n");
    expect(reported(fix!.after)).toContain("gantt.unscheduled");
    expect(reported(fix!.after)).not.toContain("gantt.cycle");
    // With a label, and with other clauses around it.
    const labelled = chart('  task a "A" from 2026-06-01 after b for 1d\n  task b after a for 1d');
    expect(fixesFor(labelled, "gantt.cycle")[0]!.after).toContain(
      '  task a "A" from 2026-06-01 for 1d\n',
    );
  });

  it("removes one id from a list of several, and one of an `until`", () => {
    const list = chart(
      "  task c from 2026-06-01\n  task a after c, b for 1d\n  task b after a for 1d",
    );
    const [first] = fixesFor(list, "gantt.cycle");
    expect(first!.title).toBe("Remove `b` from `after`");
    expect(first!.after).toContain("  task a after c for 1d\n");
    const last = chart(
      "  task c from 2026-06-01\n  task a after b, c for 1d\n  task b after a for 1d",
    );
    expect(fixesFor(last, "gantt.cycle")[0]!.after).toContain("  task a after c for 1d\n");
    expect(reported(fixesFor(last, "gantt.cycle")[0]!.after)).not.toContain("gantt.cycle");
    const until = chart("  task a from 2026-06-01 until b\n  task b after a for 1d");
    const [fix] = fixesFor(until, "gantt.cycle");
    expect(fix!.title).toBe("Remove `b` from `until`");
    expect(fix!.after).toContain("  task a from 2026-06-01\n  task b after a for 1d\n");
    expect(reported(fix!.after)).toEqual([]);
  });

  it("offers a loop's fix at each of its references", () => {
    const loop = chart("  task a after b for 1d\n  task b after a for 1d");
    const analysis = analyzeDocument({ text: loop });
    const cycles = analysis.diagnostics.filter((d) => d.code === "gantt.cycle");
    expect(cycles).toHaveLength(2);
    const titles = cycles.map((d) =>
      codeActions(analysis, { start: d.range.start.offset, end: d.range.start.offset })
        .filter((a) => a.diagnostic === d)
        .map((a) => a.title),
    );
    expect(titles).toEqual([["Remove `b` from `after`"], ["Remove `a` from `after`"]]);
  });

  it("reads what it needs from the diagnostic's data, whatever its words", () => {
    const text = chart("  task a from 2026-06-01 for 1d\n  task b for 1d\n  a -> b");
    const analysis = analyzeDocument({ text });
    const reworded = analysis.diagnostics.map((d) => ({
      ...d,
      message: "§",
      hints: d.hints?.map(() => "§"),
    }));
    const diagnostic = reworded.find((d) => d.code === "gantt.relation")!;
    const [action] = codeActions(
      { ...analysis, diagnostics: reworded },
      { start: diagnostic.range.start.offset, end: diagnostic.range.start.offset },
    );
    expect(action!.title).toBe("Write `after a` on `b` and remove the relation");
  });

  it("suggests the close tasks for a mistyped one, and never declares a node", () => {
    const text = chart(
      "  task design from 2026-06-01 for 1d\n  task desert from 2026-06-01 for 1d\n  task b after desing for 1d",
    );
    const fixes = fixesFor(text, "ref.unknown-element");
    expect(fixes.map((f) => f.title)).toEqual(["Change to `design`", "Change to `desert`"]);
    expect(fixes[0]!.preferred).toBe(true);
    expect(fixes[0]!.after).toContain("  task b after design for 1d\n");
    // A name far from every task has no fix, and the task's own id is no candidate.
    const far = chart("  task design from 2026-06-01 for 1d\n  task b after zzzzzzzz for 1d");
    expect(fixesFor(far, "ref.unknown-element")).toEqual([]);
    const own = chart("  task bb from 2026-06-01 for 1d\n  task b after bc for 1d");
    expect(fixesFor(own, "ref.unknown-element").map((f) => f.title)).toEqual(["Change to `bb`"]);
  });

  it("offers neither to name an arrow nor to arrange the chart", () => {
    const { analysis, offset } = at(roadmap.replace("task tec1 ", "task |tec1 "));
    expect(codeActions(analysis, { start: offset, end: offset })).toEqual([]);
  });
});

describe("gantt outline and highlighting", () => {
  it("lists the sections with their tasks, milestones and markers nested as written", () => {
    const [diagram] = documentSymbols(analyzeDocument({ text: plan }));
    expect(diagram!.children.map((c) => [c.name, c.kind, c.children.length])).toEqual([
      ["build", "group", 4],
      ["ship", "element", 0],
      ["review", "element", 0],
    ]);
    const [build] = diagram!.children;
    expect(build!.detail).toBe("section · Build");
    expect(build!.children.map((c) => [c.name, c.kind, c.detail])).toEqual([
      ["design", "element", "task · Design"],
      ["code", "element", "task · Code"],
      ["beta", "element", "milestone · Beta"],
      ["freeze", "element", "marker · Code freeze"],
    ]);
    // Each is selected by its id, and holds the statement it is written in.
    const design = build!.children[0]!;
    expect(plan.slice(design.selectionRange.start.offset, design.selectionRange.end.offset)).toBe(
      "design",
    );
    expect(plan.slice(design.range.start.offset, design.range.end.offset)).toBe(
      'task design "Design" from 2026-06-01 for 5d',
    );
    expect(build!.range.start.offset).toBeLessThan(design.range.start.offset);
    expect(build!.range.end.offset).toBeGreaterThan(build!.children[3]!.range.end.offset);
  });

  it("lists the owner's chart as three sections of three, four and three tasks", () => {
    const [diagram] = documentSymbols(analyzeDocument({ text: roadmap }));
    expect(diagram!.name).toBe("hoja_de_ruta_genai");
    expect(diagram!.detail).toBe("Hoja de ruta GenAI");
    expect(diagram!.children.map((c) => [c.name, c.children.map((t) => t.name)])).toEqual([
      ["tecnologia", ["tec0", "tec1", "tec2"]],
      ["nuevo_flujo_genai_hub", ["flu0", "flu1", "flu2", "flu3"]],
      ["i_d", ["sdlc0", "sdlc1", "sdlc2"]],
    ]);
  });

  it("lists no arrows: the dependencies are written in the tasks", () => {
    const [diagram] = documentSymbols(analyzeDocument({ text: roadmap }));
    expect(diagram!.children.filter((c) => c.kind === "relation")).toEqual([]);
  });

  it("marks a section as a namespace and a task as a variable", () => {
    const { analysis, text } = at(roadmap);
    const tokens = semanticTokens(analysis);
    const typeOf = (word: string, declaration: boolean) =>
      tokens.find(
        (t) => text.slice(t.start, t.start + t.length) === word && t.declaration === declaration,
      )?.type;
    expect(typeOf("tecnologia", true)).toBe("namespace");
    expect(typeOf("tec1", true)).toBe("variable");
    // The task named by another: a use of the task, not of the section.
    expect(typeOf("tec0", false)).toBe("variable");
  });

  it("follows `after` to the task, lists its uses and renames it through them", () => {
    const { analysis, offset, text } = at(roadmap.replace("after tec0 for", "after te|c0 for"));
    const declaration = definition(analysis, offset)!;
    expect(text.slice(declaration.start.offset, declaration.end.offset)).toBe("tec0");
    expect(text.slice(declaration.start.offset - 5, declaration.start.offset)).toBe("task ");
    // The declaration and the `after` of tec1.
    expect(references(analysis, offset)).toHaveLength(2);
    expect(highlights(analysis, offset).map((h) => h.kind)).toEqual(["write", "read"]);
    expect(selectionAt(analysis, offset)).toMatchObject({ id: "tec0", kind: "element" });
    expect(prepareRename(analysis, offset)).toMatchObject({ ok: true, placeholder: "tec0" });
    const renamed = rename(analysis, offset, "tec00");
    if (!renamed.ok) throw new Error(renamed.rejection.reason);
    const after = applyTextEdits(text, renamed.plan.edits);
    expect(after).toContain('task tec00 "Evaluar plataformas de agentes" from 2026-06-01 for 5d');
    expect(after).toContain("after tec00 for 10d");
    expect(reported(after)).toEqual([]);
  });
});

describe("gantt services on text in pieces", () => {
  /** Every service, asked at every offset of a text: none throws, whatever the text says. */
  function askEverywhere(text: string): void {
    const analysis = analyzeDocument({ text, layout: { today: TODAY } });
    for (let offset = 0; offset <= text.length; offset++) {
      completions(analysis, offset);
      hover(analysis, offset);
      codeActions(analysis, { start: offset, end: offset });
    }
    documentSymbols(analysis);
    semanticTokens(analysis);
  }

  it("answer at every offset of the owner's chart", () => {
    expect(() => askEverywhere(roadmap)).not.toThrow();
  });

  it("answer at every offset of charts that are not finished or not right", () => {
    for (const body of [
      "task",
      "task a from",
      "task a from 2026-06-01 for",
      "task a after after after",
      "task a after , ,",
      "task a until b c d,",
      'task a "A" for 5 5d 5days to',
      "section { }",
      'section s "S" { section t { } }',
      'section s "S" { task',
      "exclude",
      "exclude 2026-02-30, nothing",
      "include",
      "milestone m at 2026-13-45",
      'milestone m "M" at 2026-06-01T25:00',
      "marker",
      "a -> ",
      "a -> b -> c",
      'axisFormat "%',
      'axisFormat "%-',
      "ticks",
      "ticks 1.5w",
      "weekStart",
      "task a from 2026-06-01\n  task b after a\n  task a after b",
      'task a from 2026-06-01\n  a -> b\n  b -> a\n  b["B"]',
    ]) {
      expect(() => askEverywhere(chart(`  ${body}`)), body).not.toThrow();
    }
    expect(() => askEverywhere("diagram p: gantt {")).not.toThrow();
    expect(() => askEverywhere("diagram p: gantt { task a after ")).not.toThrow();
    expect(() =>
      askEverywhere("diagram p: gantt { section s { task a from 2026-06-01 for "),
    ).not.toThrow();
  });
});

describe("the words of gantt charts in both languages", () => {
  it("are all translated", () => {
    expect(untranslated(serviceMessages("en"), serviceMessages("es"))).toEqual([]);
  });

  it("keep every code sample of their documentation as written", () => {
    const code = (text: string) => (text.match(/`[^`]*`/g) ?? []).sort();
    for (const group of ["ganttWords"] as const) {
      const english: Readonly<Record<string, string>> = serviceMessages("en")[group];
      const spanish: Readonly<Record<string, string>> = serviceMessages("es")[group];
      expect(Object.keys(spanish)).toEqual(Object.keys(english));
      for (const [word, doc] of Object.entries(english)) {
        expect(code(spanish[word]!), `${group}.${word}`).toEqual(code(doc));
      }
    }
    for (const group of ["directives", "units"] as const) {
      const english: Readonly<Record<string, string>> = serviceMessages("en").gantt[group];
      const spanish: Readonly<Record<string, string>> = serviceMessages("es").gantt[group];
      expect(Object.keys(spanish)).toEqual(Object.keys(english));
      for (const [word, doc] of Object.entries(english)) {
        expect(code(spanish[word]!), `${group}.${word}`).toEqual(code(doc));
      }
    }
    const english = serviceMessages("en");
    const spanish = serviceMessages("es");
    expect(spanish.gantt.weekdays).toHaveLength(7);
    expect(english.gantt.weekdays).toHaveLength(7);
    for (const day of ["monday", "friday"]) {
      expect(code(spanish.gantt.weekday(day))).toEqual(code(english.gantt.weekday(day)));
    }
  });

  it("document a word of the chart that the table of keywords documents otherwise", () => {
    for (const word of ["from", "to", "at", "after", "column", "bar"]) {
      expect(ganttDoc(word), word).toBeDefined();
      expect(ganttDoc(word), word).not.toBe(keywordDoc(word));
    }
    // The language's own tables stay English, whatever the interface.
    setLocale("es");
    try {
      expect(GANTT_DOCS["task"]).toMatch(/^A bar from a start to an end/);
      expect(ganttDoc("task")).toMatch(/^Una barra de un inicio a un fin/);
      expect(ganttDoc("task", "en")).toMatch(/^A bar from a start to an end/);
    } finally {
      setLocale("en");
    }
  });
});

describe("gantt services in a Spanish interface", () => {
  beforeEach(() => setLocale("es"));
  afterEach(() => setLocale("en"));

  it("describe a task, a milestone, a marker and a section in Spanish", () => {
    expect(hovered(roadmap.replace("task tec1 ", "task |tec1 "))).toBe(
      [
        "**tarea** `tec1` — Prueba de concepto con el equipo de Arquitectura",
        "",
        "lunes 2026-06-08 → viernes 2026-06-19 · 10 días hábiles",
        "",
        "sigue a `tec0` · precede a `tec2` · en `tecnologia`",
      ].join("\n"),
    );
    expect(
      hovered(
        chart('  task a from 2026-06-01 for 2d\n  milestone |m "Hecho" after a done critical'),
      ),
    ).toBe(
      [
        "**hito** `m` — Hecho",
        "",
        "miércoles 2026-06-03",
        "",
        "`done` · `critical` · sigue a `a`",
      ].join("\n"),
    );
    expect(hovered(chart('  marker |k "K" at 2026-06-06'))).toContain("**marca** `k` — K");
    expect(hovered(roadmap.replace("section tecnologia", "section |tecnologia"))).toBe(
      [
        "**sección** `tecnologia` — Tecnología",
        "",
        "lunes 2026-06-01 → lunes 2026-06-22 · 3 tareas",
      ].join("\n"),
    );
    expect(hovered(chart("  task a from 2026-06-01 for 1d\n  task |b for 2d"))).toContain(
      "sigue a `a` (no tiene un inicio propio)",
    );
    expect(hovered(chart("  task |a for 2d"))).toContain("sin programar");
    expect(
      hovered(
        chart(
          "  task d from 2026-06-10\n  task c from 2026-06-12\n  task |b from 2026-06-01 until c d",
        ),
      ),
    ).toContain("termina cuando empieza el primero de `c`, `d`");
    expect(
      hovered(chart('  task a from 2026-06-01 for 1d\n  milestone |m "M" after a')),
    ).not.toContain("hábil");
    expect(
      hovered(
        chart(
          '  section |s "S" {\n    task a from 2026-06-01 for 1d\n    milestone m at 2026-06-02\n    marker k at 2026-06-03\n  }',
        ),
      ),
    ).toContain("1 tarea · 1 hito · 1 marca");
  });

  it("describe a date and a duration in Spanish", () => {
    expect(hovered(chart("  exclude weekends\n  task a from |2026-06-06 for 1d"))).toBe(
      "**fecha** `2026-06-06` — sábado, excluido",
    );
    expect(
      hovered(chart("  exclude weekends\n  include 2026-06-|06\n  task a from 2026-06-01")),
    ).toBe("**fecha** `2026-06-06` — sábado, día hábil pese a las exclusiones");
    expect(hovered(chart("  exclude weekends\n  task a from 2026-06-01 for |2w"))).toBe(
      "**duración** `2w` — 2 semanas · 10 días hábiles · termina el viernes 2026-06-12",
    );
    expect(hovered(chart("  task a from 2026-06-01T09:00 for |1h"))).toBe(
      "**duración** `1h` — 1 hora · termina el lunes 2026-06-01 10:00",
    );
    expect(hovered(chart("  task a from 2026-06-01T09:00 for |1.5h"))).toContain("1,5 horas");
  });

  it("describe the words of a chart in Spanish, and keep their samples as written", () => {
    expect(hovered(chart("  task a fr|om 2026-06-01"))).toBe(
      "**from** — El inicio de una tarea: `from 2026-06-01`, o con hora `from 2026-06-01T09:30`. Junto a `after` cuenta lo que ocurra más tarde.",
    );
    expect(hovered(chart("  exclude mon|day"))).toContain(
      "**monday** — Un día de la semana: `exclude monday`",
    );
    expect(hovered("diagram p: gan|tt {\n}\n")).toMatch(/^\*\*gantt\*\* — Un diagrama de Gantt/);
    expect(hovered(chart('  axisFormat "%d |%b"'))).toBe("**%b** — El nombre corto del mes.");
  });

  it("detail completion items in Spanish", () => {
    expect(details(chart('  task a "A" |')).get("until")).toMatch(
      /^Termina una tarea cuando empieza/,
    );
    expect(details(chart("  task a from 2026-06-01 for 5|")).get("d")).toBe(
      "días; días hábiles con `exclude`",
    );
    expect(details(chart("  labels |")).get("column")).toBe(
      "En la columna izquierda, bajo el título de la sección de la tarea.",
    );
    expect(details(chart("  exclude |")).get("weekends")).toBe(
      "Sábado y domingo: `exclude weekends`.",
    );
    expect(details(chart('  axisFormat "|"')).get("%Y")).toBe("El año, como 2026.");
    const owners = roadmap.replace(
      'task flu0 "Propuesta',
      'task tec3 "Demo" after |\n    task flu0 "Propuesta',
    );
    expect(details(owners).get("tec0")).toBe("tarea · Evaluar plataformas de agentes");
    const snippet = at("|");
    const written = completions(snippet.analysis, snippet.offset).find(
      (i) => i.label === "diagram (gantt)",
    )!.insertText!;
    expect(written).toContain('"${4:Construcción}"');
    expect(written).toContain('"${6:Diseño}"');
  });

  it("detail the outline in Spanish", () => {
    const [diagram] = documentSymbols(analyzeDocument({ text: plan }));
    expect(diagram!.children[0]!.detail).toBe("sección · Build");
    expect(diagram!.children[0]!.children.map((c) => c.detail)).toEqual([
      "tarea · Design",
      "tarea · Code",
      "hito · Beta",
      "marca · Code freeze",
    ]);
  });

  it("title every fix as a command, with the same edits as in English", () => {
    const scenarios: Record<string, readonly [string, string]> = {
      unscheduled: [chart('  task a "Kick-off" for 2d'), "gantt.unscheduled"],
      "unscheduled milestone": [chart('  milestone m "M"'), "gantt.unscheduled"],
      relation: [
        chart("  task a from 2026-06-01 for 1d\n  task b for 1d\n  a -> b"),
        "gantt.relation",
      ],
      "redundant relation": [
        chart("  task a from 2026-06-01 for 1d\n  task b after a for 1d\n  a -> b"),
        "gantt.relation",
      ],
      "excluded start": [
        chart("  exclude weekends\n  task a from 2026-06-06 for 1d"),
        "gantt.excluded-day",
      ],
      "excluded end": [
        chart("  exclude weekends\n  task a from 2026-06-01 to 2026-06-06"),
        "gantt.excluded-day",
      ],
      loop: [chart("  task a after b for 1d\n  task b after a for 1d"), "gantt.cycle"],
      "mistyped task": [
        chart("  task design from 2026-06-01 for 1d\n  task b after desing for 1d"),
        "ref.unknown-element",
      ],
    };
    const code = (text: string) => (text.match(/`[^`]*`/g) ?? []).sort();
    const offered = (locale: Locale, name: string) => {
      const previous = getLocale();
      setLocale(locale);
      try {
        const [text, diagnostic] = scenarios[name]!;
        return fixesFor(text, diagnostic);
      } finally {
        setLocale(previous);
      }
    };
    for (const name of Object.keys(scenarios)) {
      const english = offered("en", name);
      const spanish = offered("es", name);
      expect(english.length, `${name}: offered in English`).toBeGreaterThan(0);
      expect(
        spanish.map((a) => [a.kind, a.preferred, a.diagnostic?.code, a.edits]),
        name,
      ).toEqual(english.map((a) => [a.kind, a.preferred, a.diagnostic?.code, a.edits]));
      for (const [i, action] of spanish.entries()) {
        const title = english[i]!.title;
        expect(action.title, `${name}: ${title}`).not.toBe(title);
        expect(code(action.title), `${name}: ${title}`).toEqual(
          expect.arrayContaining(code(title)),
        );
      }
    }
    const titles = (name: string) => offered("es", name).map((a) => a.title);
    expect(titles("unscheduled")).toEqual(["Escribir `from 2026-10-29` (hoy)"]);
    expect(titles("unscheduled milestone")).toEqual(["Escribir `at 2026-10-29` (hoy)"]);
    expect(titles("relation")).toEqual(["Escribir `after a` en `b` y quitar la relación"]);
    expect(titles("redundant relation")).toEqual(["Quitar la relación (`b` ya sigue a `a`)"]);
    expect(titles("excluded end")).toEqual([
      "Mover al siguiente día hábil, `2026-06-08`",
      "Mover al día hábil anterior, `2026-06-05`",
    ]);
    expect(titles("loop")).toEqual(["Quitar `b` de `after`"]);
    expect(titles("mistyped task")).toEqual(["Cambiar a `design`"]);
  });

  it("name the kinds of a chart in the details of the tasks a list offers", () => {
    const sheet = chart('  section s "S" {\n    task a from 2026-06-01\n  }\n  task b after |');
    expect(details(sheet).get("a")).toBe("tarea · a");
  });
});
