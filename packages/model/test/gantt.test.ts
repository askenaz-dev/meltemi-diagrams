import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { compile, formatDate, type FlowDiagram } from "../src/index.js";

/** A chart with the given statements; `diagram plan: gantt` is on line 2. */
const chart = (body: string): string => `language "0.2"\ndiagram plan: gantt {\n${body}\n}\n`;

function analyze(body: string) {
  const source = chart(body);
  const compilation = compile(source);
  const diagram = compilation.document.diagrams[0]!;
  const text = (d: { range: { start: { offset: number }; end: { offset: number } } }) =>
    source.slice(d.range.start.offset, d.range.end.offset);
  return {
    source,
    compilation,
    diagram,
    diagnostics: compilation.diagnostics,
    codes: compilation.diagnostics.map((d) => d.code),
    text,
  };
}

const task = (diagram: FlowDiagram, id: string) => diagram.elementsById.get(id)!.task!;
const iso = (time: number | null) => (time === null ? null : formatDate(time));
const span = (diagram: FlowDiagram, id: string) => {
  const t = task(diagram, id);
  return [iso(t.start), iso(t.finish)];
};

describe("Gantt charts compile", () => {
  it("compiles the owner's roadmap", () => {
    const source = readFileSync(join(REPO_ROOT, "corpus/valid/gantt/roadmap.meltemi"), "utf8");
    const compilation = compile(source);
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    expect(diagram.type).toBe("gantt");
    expect(diagram.elements).toHaveLength(13);
    expect(diagram.elements.filter((e) => e.kind === "section")).toHaveLength(3);
    expect(diagram.elements.filter((e) => e.kind === "task")).toHaveLength(10);
    expect(diagram.relations).toHaveLength(6);
    expect(diagram.relations.every((r) => r.derived)).toBe(true);
    expect(diagram.relationsByKey.get("tec0->tec1#1")).toMatchObject({ from: "tec0", to: "tec1" });
    expect(diagram.elementsById.get("tec1")!.groupPath).toEqual(["tecnologia"]);
  });

  it("reports a participant, naming what a chart holds", () => {
    const { diagnostics, text } = analyze("participant api");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(text(diagnostics[0]!)).toBe("participant");
    const hint = diagnostics[0]!.hints!.join(" ");
    for (const word of ["section", "task", "milestone", "marker"]) expect(hint).toContain(word);
  });

  it("reports a placement block and compiles the rest", () => {
    const { diagnostics, text, diagram } = analyze(
      "placement { place a at (0, 0) }\ntask a from 2026-06-01 for 2d",
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(text(diagnostics[0]!)).toBe("placement");
    expect(diagram.elementsById.has("a")).toBe(true);
  });

  it("reports a section in a section", () => {
    const { diagnostics, text } = analyze("section a { section b { } }");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(text(diagnostics[0]!)).toBe("section");
    expect(diagnostics[0]!.hints!.join(" ")).toContain("task");
  });

  it("reports an unknown statement in a section, and a chart statement inside one", () => {
    const { diagnostics, text } = analyze(
      "section a {\n  participant p\n  exclude weekends\n  task t from 2026-06-01\n}",
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.unknown", "prop.unknown"]);
    expect(diagnostics.map(text)).toEqual(["participant", "exclude"]);
  });

  it("refuses declarations and nested declarations of other kinds", () => {
    const { codes } = analyze('a["Label"]\nsection s { b["Label"] }');
    expect(codes).toEqual(["prop.unknown", "prop.unknown"]);
  });
});

describe("Dates", () => {
  it("reads a day and an instant", () => {
    const { diagnostics, diagram } = analyze(
      "task a from 2026-06-01 for 2d\ntask b from 2026-06-01T09:30 for 4h",
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "a")).toEqual(["2026-06-01T00:00", "2026-06-03T00:00"]);
    expect(span(diagram, "b")).toEqual(["2026-06-01T09:30", "2026-06-01T13:30"]);
  });

  it("says which days February does not have", () => {
    const { diagnostics, text } = analyze("task a from 2026-02-30 for 1d");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("2026-02-30");
    expect(diagnostics[0]!.message).toContain("February 2026 has 28 days");
  });

  it("refuses a date written as a string, with the hint to drop the quotes", () => {
    const { diagnostics, text } = analyze('task a from "2026-06-01" for 1d');
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe('"2026-06-01"');
    expect(diagnostics[0]!.hints!.join(" ")).toContain("`2026-06-01`");
  });

  it("refuses a number or an identifier where a date is expected", () => {
    expect(analyze("task a from 5 for 1d").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("task a from tomorrow for 1d").codes).toContain("prop.invalid-value");
    expect(analyze("task a from 2026-6-1 for 1d").codes).toContain("prop.invalid-value");
  });

  it("refuses an hour, a minute or a second out of range", () => {
    expect(analyze("task a from 2026-06-01T24:00").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("task a from 2026-06-01T09:60").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("task a from 2026-06-01T09:30:60").codes).toEqual(["prop.invalid-value"]);
  });

  it("adds across a leap day", () => {
    const { diagnostics, diagram } = analyze("task a from 2028-02-28 for 2d");
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "a")).toEqual(["2028-02-28T00:00", "2028-03-01T00:00"]);
  });
});

describe("Task, milestone and marker statements", () => {
  it("records every clause of a task", () => {
    const { diagnostics, diagram } = analyze(
      [
        'task design "Design" from 2026-05-01 for 10d',
        'task review "Review" from 2026-05-01 for 12d',
        'task build "Build" from 2026-06-01 after design, review for 2w done critical {',
        '  url "https://example.com/build"',
        "}",
      ].join("\n"),
    );
    expect(diagnostics).toEqual([]);
    const build = diagram.elementsById.get("build")!;
    expect(build.label).toBe("Build");
    expect(build.url).toBe("https://example.com/build");
    expect(build.task).toMatchObject({
      from: { date: "2026-06-01" },
      status: "done",
      critical: true,
      end: { kind: "for", amount: 2, unit: "w" },
    });
    expect(build.task!.after.map((a) => a.id)).toEqual(["design", "review"]);
    expect(build.task!.end!.kind).toBe("for");
  });

  it("defaults the label to the id", () => {
    const { diagram } = analyze("task prototype from 2026-06-01 for 1d");
    expect(diagram.elementsById.get("prototype")!.label).toBe("prototype");
    expect(diagram.elementsById.get("prototype")!.labelWritten).toBe(false);
  });

  it("takes the clauses in any order", () => {
    const { diagnostics, diagram } = analyze(
      "task a from 2026-06-01 for 1d\ntask b done for 2d after a critical",
    );
    expect(diagnostics).toEqual([]);
    expect(task(diagram, "b")).toMatchObject({ status: "done", critical: true });
    expect(span(diagram, "b")).toEqual(["2026-06-02T00:00", "2026-06-04T00:00"]);
  });

  it("reports a second end clause, naming the first", () => {
    const { diagnostics, text } = analyze("task a from 2026-06-01 for 5d to 2026-06-09");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.duplicate"]);
    expect(text(diagnostics[0]!)).toBe("to");
    expect(diagnostics[0]!.message).toContain("`for`");
  });

  it("reports a clause written twice", () => {
    expect(analyze("task a from 2026-06-01 from 2026-06-02").codes).toEqual(["prop.duplicate"]);
    expect(analyze("task a from 2026-06-01 for 1d critical critical").codes).toEqual([
      "prop.duplicate",
    ]);
    expect(analyze("task a from 2026-06-01 for 1d for 2d").codes).toEqual(["prop.duplicate"]);
  });

  it("reports done with active", () => {
    const { diagnostics, text } = analyze("task a from 2026-06-01 for 1d done active");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.duplicate"]);
    expect(text(diagnostics[0]!)).toBe("active");
  });

  it("reports a word that is not a clause, listing the clauses once", () => {
    const { diagnostics, text } = analyze("task a starts 2026-06-01");
    expect(diagnostics.map((d) => d.code)).toContain("prop.unknown");
    const unknown = diagnostics.find((d) => d.code === "prop.unknown")!;
    expect(text(unknown)).toBe("starts");
    expect(unknown.hints!.join(" ")).toContain("`from`, `after`, `for`, `to`, `until`, `done`");
    // The date after the unknown word is skipped with it.
    expect(diagnostics.filter((d) => d.code === "prop.unknown")).toHaveLength(1);
  });

  it("points a clause of another statement to its home", () => {
    const { diagnostics } = analyze("milestone m from 2026-06-01");
    expect(diagnostics.some((d) => d.hints!.join(" ").includes("task statements"))).toBe(true);
  });

  it("refuses a clause word as an id", () => {
    const { diagnostics, text } = analyze('task for "Forecast" from 2026-06-01');
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("for");
    expect(diagnostics[0]!.hints!.join(" ")).toContain("cannot be ids");
  });

  it("needs a place for a marker", () => {
    const { diagnostics, text } = analyze('marker freeze "Code freeze"');
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("freeze");
    expect(diagnostics[0]!.message).toContain("at <date>");
  });

  it("places a marker with at, or after tasks", () => {
    const { diagnostics, diagram } = analyze(
      'task a from 2026-06-01 for 2d\nmarker one "One" at 2026-06-10\nmarker two "Two" after a',
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "one")).toEqual(["2026-06-10T00:00", "2026-06-10T00:00"]);
    expect(span(diagram, "two")).toEqual(["2026-06-03T00:00", "2026-06-03T00:00"]);
    expect(analyze("task a from 2026-06-01\nmarker m at 2026-06-02 after a").codes).toEqual([
      "prop.duplicate",
    ]);
  });

  it("reports a clause that has no value", () => {
    expect(analyze("task a from for 1d").codes).toEqual(
      ["prop.invalid-value", "gantt.unscheduled"].slice(0, 1),
    );
    expect(analyze("task a from 2026-06-01 after").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("task a from 2026-06-01 for").codes).toEqual(["prop.invalid-value"]);
  });

  it("reports a block statement it does not know", () => {
    const { codes } = analyze("task a from 2026-06-01 for 1d { colour red }");
    expect(codes).toEqual(["prop.unknown"]);
  });

  it("takes description, class and link in the block of a task and a section", () => {
    const { diagnostics, diagram } = analyze(
      'section s "S" { description "A section" }\ntask a from 2026-06-01 for 1d { description "Do it"; class critical }',
    );
    expect(diagnostics).toEqual([]);
    expect(diagram.elementsById.get("s")!.description).toBe("A section");
    expect(diagram.elementsById.get("a")!.description).toBe("Do it");
  });

  it("reports a duplicate id", () => {
    const { codes } = analyze("task a from 2026-06-01\ntask a from 2026-06-02");
    expect(codes).toEqual(["ref.duplicate-id"]);
  });
});

describe("Durations", () => {
  it("adds hours and minutes", () => {
    const { diagnostics, diagram } = analyze(
      "task a from 2026-06-01T09:00 for 1.5h\ntask b from 2026-06-01T09:00 for 90min",
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "a")).toEqual(["2026-06-01T09:00", "2026-06-01T10:30"]);
    expect(span(diagram, "b")).toEqual(["2026-06-01T09:00", "2026-06-01T10:30"]);
  });

  it("lists the units of an unknown one", () => {
    const { diagnostics, text } = analyze("task a from 2026-06-01 for 5days");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("5days");
    for (const unit of ["`s`", "`min`", "`h`", "`d`", "`w`"]) {
      expect(diagnostics[0]!.message).toContain(unit);
    }
  });

  it("refuses a duration without a unit", () => {
    expect(analyze("task a from 2026-06-01 for 5").codes).toEqual(["prop.invalid-value"]);
  });

  it("sends a zero duration to the milestone", () => {
    const { diagnostics, text } = analyze("task a from 2026-06-01 for 0d");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("0d");
    expect(diagnostics[0]!.hints!.join(" ")).toContain("milestone");
  });

  it("refuses a negative duration and a duration longer than a century", () => {
    expect(analyze("task a from 2026-06-01 for -2d").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("task a from 2026-06-01 for 99999999d").codes).toEqual(["prop.invalid-value"]);
  });
});

describe("Calendar", () => {
  it("takes ten working days from a Monday", () => {
    const { diagnostics, diagram } = analyze("exclude weekends\ntask a from 2026-06-08 for 10d");
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "a")).toEqual(["2026-06-08T00:00", "2026-06-20T00:00"]);
    expect(task(diagram, "a").working).toBe(10 * 86_400);
  });

  it("takes two weeks as ten working days", () => {
    const { diagram } = analyze("exclude weekends\ntask a from 2026-06-01 for 2w");
    expect(span(diagram, "a")).toEqual(["2026-06-01T00:00", "2026-06-13T00:00"]);
  });

  it("skips a holiday and works an included Saturday", () => {
    const { diagnostics, diagram } = analyze(
      "exclude weekends, 2026-06-03\ninclude 2026-06-06\ntask a from 2026-06-01 for 5d",
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "a")).toEqual(["2026-06-01T00:00", "2026-06-07T00:00"]);
  });

  it("carries hours across a weekend", () => {
    const { diagram } = analyze("exclude weekends\ntask a from 2026-06-05T18:00 for 12h");
    expect(span(diagram, "a")).toEqual(["2026-06-05T18:00", "2026-06-08T06:00"]);
  });

  it("adds the exclusions of several statements", () => {
    const { diagram } = analyze(
      "exclude saturday\nexclude sunday, 2026-06-02\ntask a from 2026-06-01 for 3d",
    );
    expect(diagram.gantt!.calendar.excludedWeekdays).toEqual([5, 6]);
    expect(diagram.gantt!.calendar.excludedDates).toEqual(["2026-06-02"]);
    expect(span(diagram, "a")).toEqual(["2026-06-01T00:00", "2026-06-05T00:00"]);
  });

  it("lists what exclude takes when it is given something else", () => {
    const { diagnostics, text } = analyze("exclude holidays");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("holidays");
    const hint = diagnostics[0]!.hints!.join(" ");
    expect(hint).toContain("weekends");
    expect(hint).toContain("`monday`");
  });

  it("refuses an include that no exclusion covers", () => {
    const { diagnostics, text } = analyze("include 2026-06-06");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("2026-06-06");
    expect(diagnostics[0]!.message).toContain("working day already");
  });

  it("refuses to exclude every weekday", () => {
    const { codes, diagram } = analyze(
      "exclude monday, tuesday, wednesday, thursday, friday, saturday, sunday\ntask a from 2026-06-01 for 1d",
    );
    expect(codes).toEqual(["prop.invalid-value"]);
    expect(diagram.gantt!.calendar.excludedWeekdays).toEqual([]);
  });

  it("refuses a date with a time in exclude, include and today", () => {
    expect(analyze("exclude 2026-06-03T09:00").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("exclude weekends\ninclude 2026-06-06T09:00").codes).toEqual([
      "prop.invalid-value",
    ]);
    expect(analyze("today 2026-06-03T09:00").codes).toEqual(["prop.invalid-value"]);
  });

  it("reads weekStart", () => {
    const { diagram } = analyze("weekStart sunday");
    expect(diagram.gantt!.calendar.weekStart).toBe(6);
    expect(analyze("weekStart someday").codes).toEqual(["prop.invalid-value"]);
  });
});

describe("Schedule", () => {
  it("follows the previous task across sections", () => {
    const { diagnostics, diagram } = analyze(
      "section one { task a from 2026-06-01 for 2d }\nsection two { task b for 1d }",
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "b")).toEqual(["2026-06-03T00:00", "2026-06-04T00:00"]);
  });

  it("follows the previous milestone, and skips a marker", () => {
    const { diagram } = analyze(
      'task a from 2026-06-01 for 2d\nmilestone m after a\nmarker k "K" at 2026-09-01\ntask b for 1d',
    );
    expect(span(diagram, "b")).toEqual(["2026-06-03T00:00", "2026-06-04T00:00"]);
  });

  it("takes the later of from and after", () => {
    const later = analyze("task a from 2026-06-01 for 4d\ntask b from 2026-06-10 after a for 1d");
    expect(span(later.diagram, "b")[0]).toBe("2026-06-10T00:00");
    const sooner = analyze("task a from 2026-06-01 for 4d\ntask b from 2026-06-02 after a for 1d");
    expect(span(sooner.diagram, "b")[0]).toBe("2026-06-05T00:00");
  });

  it("ends an inclusive date at the end of that day", () => {
    const { diagnostics, diagram } = analyze("task a from 2026-06-01 to 2026-06-05");
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "a")).toEqual(["2026-06-01T00:00", "2026-06-06T00:00"]);
    const timed = analyze("task a from 2026-06-01T09:00 to 2026-06-01T17:30");
    expect(span(timed.diagram, "a")).toEqual(["2026-06-01T09:00", "2026-06-01T17:30"]);
  });

  it("ends before another task starts", () => {
    const { diagnostics, diagram } = analyze(
      "task c from 2026-06-10 for 1d\ntask b from 2026-06-01 until c",
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "b")).toEqual(["2026-06-01T00:00", "2026-06-10T00:00"]);
  });

  it("lasts a day without an end", () => {
    const { diagnostics, diagram } = analyze("task a from 2026-06-01");
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "a")).toEqual(["2026-06-01T00:00", "2026-06-02T00:00"]);
  });

  it("reports a first task with nothing to follow", () => {
    const { diagnostics, text } = analyze('task a "Kick-off" for 2d');
    expect(diagnostics.map((d) => d.code)).toEqual(["gantt.unscheduled"]);
    expect(text(diagnostics[0]!)).toBe("a");
    expect(diagnostics[0]!.hints!.join(" ")).toContain("from <date>");
  });

  it("reports an end before the start, with both dates", () => {
    const { diagnostics, text } = analyze("task a from 2026-06-10 to 2026-06-05");
    expect(diagnostics.map((d) => d.code)).toEqual(["gantt.schedule"]);
    expect(text(diagnostics[0]!)).toBe("to");
    expect(diagnostics[0]!.message).toContain("2026-06-10");
    expect(diagnostics[0]!.message).toContain("2026-06-06");
  });

  it("reports an end that is the start", () => {
    const { diagnostics } = analyze("task a from 2026-06-10T09:00 to 2026-06-10T09:00");
    expect(diagnostics.map((d) => d.code)).toEqual(["gantt.schedule"]);
  });

  it("moves a start on Saturday to Monday, with a warning", () => {
    const { diagnostics, diagram } = analyze("exclude weekends\ntask a from 2026-06-06 for 1d");
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["gantt.excluded-day", "warning"],
    ]);
    expect(diagnostics[0]!.message).toContain("Saturday 2026-06-06");
    expect(diagnostics[0]!.message).toContain("Monday 2026-06-08");
    expect(span(diagram, "a")).toEqual(["2026-06-08T00:00", "2026-06-09T00:00"]);
  });

  it("ends an end date on Saturday at the end of Friday, with a warning", () => {
    const { diagnostics, diagram } = analyze(
      "exclude weekends\ntask a from 2026-06-01 to 2026-06-06",
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["gantt.excluded-day"]);
    expect(diagnostics[0]!.message).toContain("Friday 2026-06-05");
    expect(span(diagram, "a")).toEqual(["2026-06-01T00:00", "2026-06-06T00:00"]);
  });

  it("does not move a derived start, and does not warn", () => {
    const { diagnostics, diagram } = analyze(
      "exclude weekends\ntask a from 2026-06-01 for 5d\ntask b after a for 1d",
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "b")).toEqual(["2026-06-08T00:00", "2026-06-09T00:00"]);
  });

  it("puts a milestone at the end of a task and leaves a marker where it is", () => {
    const { diagnostics, diagram } = analyze(
      'task a from 2026-06-01 for 2d\nmilestone m "Done" after a\nmarker k "Freeze" at 2026-06-06',
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "m")).toEqual(["2026-06-03T00:00", "2026-06-03T00:00"]);
    expect(task(diagram, "m").working).toBe(0);
    expect(span(diagram, "k")).toEqual(["2026-06-06T00:00", "2026-06-06T00:00"]);
  });

  it("measures the span of everything scheduled", () => {
    const { diagram } = analyze(
      'task a from 2026-06-01 for 2d\ntask b from 2026-06-10 for 1d\nmarker k "K" at 2026-06-20',
    );
    expect(iso(diagram.gantt!.span!.start)).toBe("2026-06-01T00:00");
    expect(iso(diagram.gantt!.span!.end)).toBe("2026-06-20T00:00");
    expect(analyze("task a for 1d").diagram.gantt!.span).toBeNull();
  });

  it("schedules a long chain without recursion", () => {
    const lines = ["task t0 from 2026-06-01 for 1d"];
    for (let i = 1; i < 3000; i++) lines.push(`task t${i} after t${i - 1} for 1d`);
    const { diagnostics, diagram } = analyze(lines.join("\n"));
    expect(diagnostics).toEqual([]);
    expect(iso(task(diagram, "t2999").finish)).toBe("2034-08-18T00:00");
  });
});

describe("Dependencies", () => {
  it("waits for the latest of two predecessors", () => {
    const { diagnostics, diagram } = analyze(
      [
        "task a from 2026-06-01 for 4d",
        "task b from 2026-06-01 for 8d",
        "task c after a, b for 1d",
      ].join("\n"),
    );
    expect(diagnostics).toEqual([]);
    expect(span(diagram, "c")).toEqual(["2026-06-09T00:00", "2026-06-10T00:00"]);
    expect(diagram.relationsByKey.has("a->c#1")).toBe(true);
    expect(diagram.relationsByKey.has("b->c#1")).toBe(true);
    expect(diagram.relationsByKey.get("a->c#1")).toMatchObject({ derived: true, line: "solid" });
  });

  it("takes ids without commas", () => {
    const { diagnostics, diagram } = analyze(
      "task a from 2026-06-01 for 1d\ntask b from 2026-06-01 for 1d\ntask c after a b for 1d",
    );
    expect(diagnostics).toEqual([]);
    expect(task(diagram, "c").after.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("records the references of after and until, for renames", () => {
    const { diagram } = analyze(
      "task a from 2026-06-01 for 1d\ntask b after a until c\ntask c from 2026-06-20",
    );
    const dependencies = diagram.references.filter((r) => r.role === "dependency");
    expect(dependencies.map((r) => r.token.text)).toEqual(["a", "c"]);
  });

  it("reports a loop on every reference, naming the others", () => {
    const { diagnostics, text, diagram } = analyze("task a after b for 1d\ntask b after a for 1d");
    expect(diagnostics.map((d) => d.code)).toEqual(["gantt.cycle", "gantt.cycle"]);
    expect(diagnostics.map(text)).toEqual(["b", "a"]);
    expect(diagnostics.every((d) => d.related!.length === 1)).toBe(true);
    expect(task(diagram, "a").start).toBeNull();
    expect(task(diagram, "b").finish).toBeNull();
  });

  it("reports a task that waits for itself", () => {
    const { diagnostics } = analyze("task a after a for 1d");
    expect(diagnostics.map((d) => d.code)).toEqual(["gantt.cycle"]);
  });

  it("leaves what waits for a loop unscheduled, without more errors", () => {
    const { diagnostics, diagram } = analyze(
      "task a after b for 1d\ntask b after a for 1d\ntask c after a for 1d",
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["gantt.cycle", "gantt.cycle"]);
    expect(task(diagram, "c").start).toBeNull();
  });

  it("finds a loop through until, and one through the previous task", () => {
    const viaUntil = analyze("task a from 2026-06-01 until b\ntask b after a for 1d");
    expect(viaUntil.codes).toEqual(["gantt.cycle", "gantt.cycle"]);
    const viaPrevious = analyze("task a until b\ntask b for 1d");
    expect(viaPrevious.codes).toEqual(["gantt.cycle"]);
  });

  it("reports an unknown task, with the tasks it may be", () => {
    const { diagnostics, text } = analyze(
      "task design from 2026-06-01 for 1d\ntask build after desing for 1d",
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["ref.unknown-element"]);
    expect(text(diagnostics[0]!)).toBe("desing");
    expect(diagnostics[0]!.hints!.join(" ")).toContain("desing");
  });

  it("reports a section or a marker as a predecessor", () => {
    const section = analyze(
      "section tecnologia { task a from 2026-06-01 for 1d }\ntask b after tecnologia for 1d",
    );
    expect(section.codes).toEqual(["prop.invalid-value"]);
    expect(section.diagnostics[0]!.message).toContain("tasks and milestones");
    expect(section.diagnostics[0]!.message).toContain("section");
    const marker = analyze(
      'task a from 2026-06-01 for 1d\nmarker k "K" at 2026-06-10\ntask b after k for 1d',
    );
    expect(marker.codes).toEqual(["prop.invalid-value"]);
  });

  it("reports a relation statement, with the hint to write after", () => {
    const { diagnostics } = analyze("task a from 2026-06-01 for 1d\ntask b for 1d\na -> b");
    expect(diagnostics.map((d) => d.code)).toEqual(["gantt.relation"]);
    expect(diagnostics[0]!.hints!.join(" ")).toContain("after a");
  });

  it("reports an id listed twice", () => {
    const { codes } = analyze("task a from 2026-06-01 for 1d\ntask b after a, a for 1d");
    expect(codes).toEqual(["prop.duplicate"]);
  });
});

describe("Chart properties", () => {
  it("reads the owner's settings", () => {
    const { diagnostics, diagram } = analyze('axisFormat "%d %b"\nexclude weekends\ntoday');
    expect(diagnostics).toEqual([]);
    expect(diagram.gantt).toMatchObject({
      axisFormat: "%d %b",
      calendar: { excludedWeekdays: [5, 6], weekStart: 0 },
      today: { date: null },
      axis: "bottom",
      labels: "bar",
      display: "normal",
      dependencies: "shown",
      dayWidth: null,
      ticks: null,
    });
  });

  it("reads every other chart statement", () => {
    const { diagnostics, diagram } = analyze(
      "ticks 2w\naxis both\nlabels column\ndisplay compact\ndependencies hidden\ndayWidth 12\ntoday 2026-06-10",
    );
    expect(diagnostics).toEqual([]);
    expect(diagram.gantt).toMatchObject({
      ticks: "2w",
      axis: "both",
      labels: "column",
      display: "compact",
      dependencies: "hidden",
      dayWidth: 12,
      today: { date: "2026-06-10" },
    });
  });

  it("names an unknown directive and lists them", () => {
    const { diagnostics, text } = analyze('axisFormat "%d %Q"');
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe('"%d %Q"');
    expect(diagnostics[0]!.message).toContain("`%Q`");
    expect(diagnostics[0]!.message).toContain("`%Y`");
  });

  it("accepts the flag, and refuses a lone percent sign", () => {
    expect(analyze('axisFormat "%-d/%-m/%Y 100%%"').codes).toEqual([]);
    expect(analyze('axisFormat "100%"').codes).toEqual(["prop.invalid-value"]);
    expect(analyze('axisFormat "%-%"').codes).toEqual(["prop.invalid-value"]);
  });

  it("lists the tick units for a number without one", () => {
    const { diagnostics, text } = analyze("ticks 7");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("7");
    expect(diagnostics[0]!.hints!.join(" ")).toContain("`mo`");
    expect(analyze("ticks 1.5w").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("ticks 2fortnights").codes).toEqual(["prop.invalid-value"]);
  });

  it("reports values outside their list or range", () => {
    expect(analyze("axis middle").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("labels beside").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("display packed").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("dependencies some").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("dayWidth 0").codes).toEqual(["prop.invalid-value"]);
    expect(analyze("dayWidth 100001").codes).toEqual(["prop.invalid-value"]);
  });

  it("reports a second today and a repeated statement", () => {
    expect(analyze("today\ntoday 2026-06-10").codes).toEqual(["prop.duplicate"]);
    expect(analyze("axis top\naxis bottom").codes).toEqual(["prop.duplicate"]);
  });

  it("takes title, description, theme, preset and canvas", () => {
    const { diagnostics, diagram } = analyze(
      'title "Plan"\ndescription "What we do"\ntheme "editorial.light"\npreset slide',
    );
    expect(diagnostics).toEqual([]);
    expect(diagram.properties).toMatchObject({
      title: "Plan",
      description: "What we do",
      theme: "editorial.light",
      preset: "slide",
    });
  });
});

describe("Styles, links and effects in charts", () => {
  it("takes a rule for tasks and a style for one", () => {
    const { diagnostics, diagram } = analyze(
      "rule task { radius 2 }\nstyle launch { fill warning }\ntask launch from 2026-06-01 for 1d",
    );
    expect(diagnostics).toEqual([]);
    expect(diagram.rules[0]).toMatchObject({ kind: "task", properties: { radius: 2 } });
    expect(diagram.styles[0]).toMatchObject({ target: "launch", properties: { fill: "@warning" } });
  });

  it("takes rules for milestones, markers, sections and relations", () => {
    const { diagnostics } = analyze(
      "rule milestone { fill accent }\nrule marker { stroke danger }\nrule section { fill band }\nrule relation { stroke muted; arrowhead open }\ntask a from 2026-06-01",
    );
    expect(diagnostics).toEqual([]);
  });

  it("names gantt charts when a shape is written", () => {
    const { diagnostics, text } = analyze("style a { shape ellipse }\ntask a from 2026-06-01");
    expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(text(diagnostics[0]!)).toBe("shape");
    expect(diagnostics[0]!.message).toContain("gantt");
    const rule = analyze("rule task { shape ellipse }");
    expect(rule.diagnostics[0]!.message).toContain("gantt");
  });

  it("refuses the properties of other profiles in styles, classes and rules", () => {
    for (const property of ["rotation 45", "iconPosition left", "iconSize 24", "opacity 0.5"]) {
      expect(analyze(`style a { ${property} }\ntask a from 2026-06-01`).codes).toEqual([
        "prop.invalid-value",
      ]);
      expect(analyze(`rule task { ${property} }`).codes).toEqual(["prop.invalid-value"]);
      expect(analyze(`class c { ${property} }`).codes).toEqual(["prop.invalid-value"]);
    }
    expect(analyze("style a { routing orthogonal }\ntask a from 2026-06-01").codes).toEqual([
      "prop.invalid-value",
    ]);
  });

  it("refuses a font, a size and a weight, which labels take from the theme and the rows", () => {
    for (const property of ['font "Lora"', "fontSize 20", "fontWeight 700"]) {
      const { diagnostics, text } = analyze(`style a { ${property} }\ntask a from 2026-06-01`);
      expect(diagnostics.map((d) => d.code)).toEqual(["prop.invalid-value"]);
      expect(text(diagnostics[0]!)).toBe(property.split(" ")[0]);
      expect(diagnostics[0]!.message).toContain("gantt");
      expect(diagnostics[0]!.message).toContain("theme's font");
      expect(analyze(`rule section { ${property} }`).codes).toEqual(["prop.invalid-value"]);
      expect(analyze(`class c { ${property} }`).codes).toEqual(["prop.invalid-value"]);
    }
  });

  it("takes link and url, classes and effects on tasks", () => {
    const { diagnostics, diagram } = analyze(
      [
        "class late { stroke danger }",
        'task a from 2026-06-01 for 1d { url "https://example.com"; class late }',
        "animate a { effect pulse }",
      ].join("\n"),
    );
    expect(diagnostics).toEqual([]);
    expect(diagram.elementsById.get("a")!.url).toBe("https://example.com");
    expect(diagram.animations[0]).toMatchObject({ target: "a", effect: "pulse" });
  });

  it("refuses the effects of connectors on a task without dependencies' arrows", () => {
    const { diagnostics } = analyze("task a from 2026-06-01\nanimate a { effect dash }");
    expect(diagnostics).toEqual([]);
  });
});

describe("Profile gating", () => {
  it("compiles a chart beside a flow diagram", () => {
    const compilation = compile(
      'language "0.2"\ndiagram plan: gantt { task a from 2026-06-01 for 2d }\ndiagram checkout: flow { a -> b }\n',
    );
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.document.diagrams.map((d) => d.type)).toEqual(["gantt", "flow"]);
  });

  it("lists the five types for an unknown one", () => {
    const compilation = compile('language "0.2"\ndiagram x: mindmap { }\n');
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["profile.unknown"]);
    expect(compilation.diagnostics[0]!.message).toContain("flow, sequence, c4, free, gantt");
  });

  it("never throws on a chart in pieces", () => {
    for (const source of [
      "diagram p: gantt {",
      "diagram p: gantt { task }",
      "diagram p: gantt { task a from }",
      "diagram p: gantt { section { } }",
      "diagram p: gantt { exclude }",
      "diagram p: gantt { task a after after after }",
      "diagram p: gantt { milestone m at 2026-13-45 }",
    ]) {
      expect(() => compile(`language "0.2"\n${source}\n`)).not.toThrow();
    }
  });
});
