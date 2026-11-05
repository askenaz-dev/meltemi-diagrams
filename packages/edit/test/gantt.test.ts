import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile, formatDate } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { planEdit, type EditOperation, type PlanResult } from "../src/index.js";

function plan(operation: EditOperation, text: string): PlanResult {
  return planEdit(compile(text), operation);
}

/** Plans, applies and checks that the inverse restores and that no error is left. */
function apply(operation: EditOperation, text: string): string {
  const result = plan(operation, text);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  const after = applyTextEdits(text, result.plan.edits);
  expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return after;
}

function refused(operation: EditOperation, text: string) {
  const result = plan(operation, text);
  if (result.ok) throw new Error("expected a rejection");
  return result.rejection;
}

/** The owner's chart, as the corpus writes it. */
const roadmap = readFileSync(
  join(CORPUS_ROOT, "valid", "gantt", "roadmap.meltemi"),
  "utf8",
).replace(/\r\n/g, "\n");
const ROADMAP = "hoja_de_ruta_genai";

/** The resolved start and end of every task of the first chart, as dates. */
function schedule(text: string): Record<string, string> {
  const chart = compile(text).document.diagrams[0]!;
  return Object.fromEntries(
    chart.elements
      .filter((e) => e.task?.start != null)
      .map((e) => [e.id, `${formatDate(e.task!.start!)} → ${formatDate(e.task!.finish!)}`]),
  );
}

const chart = (...lines: string[]) =>
  ['language "0.2"', "", "diagram plan: gantt {", ...lines.map((l) => `  ${l}`), "}", ""].join(
    "\n",
  );

describe("Schedule operations", () => {
  const base = chart(
    'task tec0 "Evaluar" from 2026-06-01 for 5d',
    'task tec1 "Prueba" after tec0 for 10d // PoC',
  );

  it("writes a start beside a dependency, after the start clauses written", () => {
    const after = apply(
      { kind: "setTaskSchedule", diagram: "plan", task: "tec1", from: "2026-06-15" },
      base,
    );
    expect(after).toContain('  task tec1 "Prueba" after tec0 from 2026-06-15 for 10d // PoC\n');
  });

  it("replaces a duration where it stands", () => {
    const after = apply(
      { kind: "setTaskSchedule", diagram: "plan", task: "tec1", end: { for: "12d" } },
      base,
    );
    expect(after).toBe(base.replace("for 10d", "for 12d"));
  });

  it("replaces a whole end clause when the kind changes", () => {
    const text = chart(
      'task a "A" from 2026-06-01 for 2d',
      'task b "B" from 2026-06-01 until c',
      'task c "C" from 2026-06-05 for 1d',
    );
    const after = apply(
      { kind: "setTaskSchedule", diagram: "plan", task: "b", end: { for: "3d" } },
      text,
    );
    expect(after).toContain('  task b "B" from 2026-06-01 for 3d\n');
    const to = apply(
      { kind: "setTaskSchedule", diagram: "plan", task: "b", end: { to: "2026-06-05" } },
      text,
    );
    expect(to).toContain('  task b "B" from 2026-06-01 to 2026-06-05\n');
    const until = apply(
      { kind: "setTaskSchedule", diagram: "plan", task: "a", end: { until: ["c"] } },
      text,
    );
    expect(until).toContain('  task a "A" from 2026-06-01 until c\n');
    const many = apply(
      { kind: "setTaskSchedule", diagram: "plan", task: "a", end: { until: ["c", "b"] } },
      chart(
        'task a "A" from 2026-06-01 until c',
        'task b "B" from 2026-06-04 for 1d',
        'task c "C" from 2026-06-05 for 1d',
      ),
    );
    expect(many).toContain('  task a "A" from 2026-06-01 until c, b\n');
  });

  it("deletes a clause with the space before it, and keeps what follows", () => {
    const text = chart(
      'task z "Z" from 2026-05-25 for 2d',
      'task a "A" from 2026-06-01 for 2d done { class x } // late',
      "class x { }",
    );
    const after = apply({ kind: "setTaskSchedule", diagram: "plan", task: "a", from: null }, text);
    expect(after).toContain('task a "A" for 2d done { class x } // late');
    const ended = apply({ kind: "setTaskSchedule", diagram: "plan", task: "a", end: null }, text);
    expect(ended).toContain('task a "A" from 2026-06-01 done { class x } // late');
  });

  it("writes a new end clause after the label when no start clause is written", () => {
    const text = chart('task a "A" from 2026-06-01', 'task b "B" done');
    const after = apply(
      { kind: "setTaskSchedule", diagram: "plan", task: "b", end: { for: "5d" } },
      text,
    );
    expect(after).toContain('task b "B" for 5d done\n');
    const both = apply(
      {
        kind: "setTaskSchedule",
        diagram: "plan",
        task: "b",
        from: "2026-06-08",
        after: ["a"],
        end: { for: "5d" },
      },
      text,
    );
    expect(both).toContain('task b "B" from 2026-06-08 after a for 5d done\n');
  });

  it("rewrites the list of an after clause in place", () => {
    const text = chart(
      'task a "A" from 2026-06-01 for 2d',
      'task b "B" from 2026-06-01 for 2d',
      'task c "C" after a for 1d',
    );
    expect(
      apply({ kind: "setTaskSchedule", diagram: "plan", task: "c", after: ["a", "b"] }, text),
    ).toContain('task c "C" after a, b for 1d');
    expect(
      apply(
        { kind: "setTaskSchedule", diagram: "plan", task: "c", after: [] },
        chart('task a "A" from 2026-06-01 for 2d', 'task c "C" from 2026-06-05 after a for 1d'),
      ),
    ).toContain('task c "C" from 2026-06-05 for 1d');
  });

  it("writes at on milestones and markers, and refuses an end on them", () => {
    const text = chart(
      'task a "A" from 2026-06-01 for 2d',
      'milestone m "M" after a',
      'marker freeze "Freeze" at 2026-06-10',
    );
    expect(
      apply({ kind: "setTaskSchedule", diagram: "plan", task: "m", from: "2026-06-09" }, text),
    ).toContain('milestone m "M" after a at 2026-06-09\n');
    expect(
      apply({ kind: "setTaskSchedule", diagram: "plan", task: "freeze", from: "2026-06-11" }, text),
    ).toContain('marker freeze "Freeze" at 2026-06-11\n');
    const end = refused(
      { kind: "setTaskSchedule", diagram: "plan", task: "m", end: { for: "2d" } },
      text,
    );
    expect(end.code).toBe("edit.invalid-value");
  });

  it("changes nothing when the clauses are as asked", () => {
    const result = plan(
      {
        kind: "setTaskSchedule",
        diagram: "plan",
        task: "tec1",
        after: ["tec0"],
        end: { for: "10d" },
      },
      base,
    );
    expect(result.ok && result.plan.edits).toEqual([]);
  });

  it("refuses a loop, naming the model's diagnostic, and leaves the text alone", () => {
    const text = chart(
      'task tec0 "A" from 2026-06-01 for 5d',
      'task tec1 "B" after tec0 for 10d',
      'task tec2 "C" after tec1 for 1d',
    );
    const rejection = refused(
      { kind: "setTaskSchedule", diagram: "plan", task: "tec0", after: ["tec2"] },
      text,
    );
    expect(rejection.code).toBe("edit.invalid-value");
    expect(rejection.diagnostic).toBe("gantt.cycle");
  });

  it("refuses an id that is not a task, a clause word and a malformed value", () => {
    expect(
      refused({ kind: "setTaskSchedule", diagram: "plan", task: "tec1", after: ["nope"] }, base)
        .diagnostic,
    ).toBe("ref.unknown-element");
    for (const operation of [
      { from: "2026-02-30" },
      { from: "tomorrow" },
      { from: "2026-06-01 for 3d" },
      { end: { for: "0d" } },
      { end: { for: "3 weeks" } },
      { end: { for: "5x" } },
      { end: { to: "June" } },
      { end: { until: [] } },
      { end: { for: "3d", to: "2026-06-05" } as never },
      { after: ["done"] },
      { after: ["a b"] },
    ]) {
      const rejection = refused(
        { kind: "setTaskSchedule", diagram: "plan", task: "tec1", ...operation },
        base,
      );
      expect(rejection.code, JSON.stringify(operation)).toBe("edit.invalid-value");
    }
  });

  it("refuses a date that names no day with the reason the model gives", () => {
    // The form of a date but no 30th in February: the model says why, and its code comes with it.
    for (const operation of [
      { from: "2026-02-30" },
      { end: { to: "2026-02-30" } },
      { from: "2026-13-01" },
      { end: { to: "2026-06-15T25:00" } },
    ]) {
      const rejection = refused(
        { kind: "setTaskSchedule", diagram: "plan", task: "tec1", ...operation },
        base,
      );
      expect(rejection.code, JSON.stringify(operation)).toBe("edit.invalid-value");
      expect(rejection.diagnostic, JSON.stringify(operation)).toBeDefined();
    }
    const thirtieth = refused(
      { kind: "setTaskSchedule", diagram: "plan", task: "tec1", end: { to: "2026-02-30" } },
      base,
    );
    expect(thirtieth.reason).toBe("`2026-02-30`: February 2026 has 28 days.");
    expect(
      refused({ kind: "setTaskSchedule", diagram: "plan", task: "tec1", from: "2026-13-01" }, base)
        .reason,
    ).toBe("`2026-13-01` has no month 13; months run from 01 to 12.");
    // Said in Spanish when the interface is.
    setLocale("es");
    try {
      expect(
        refused(
          { kind: "setTaskSchedule", diagram: "plan", task: "tec1", end: { to: "2026-02-30" } },
          base,
        ).reason,
      ).toBe("`2026-02-30`: Febrero de 2026 tiene 28 días.");
    } finally {
      setLocale("en");
    }
  });

  it("refuses a section, an unknown id and a diagram that is no chart", () => {
    const sectioned = chart(
      'section tecnologia "Tecnología" {',
      '  task a "A" from 2026-06-01',
      "}",
    );
    expect(
      refused(
        { kind: "setTaskSchedule", diagram: "plan", task: "tecnologia", from: "2026-06-01" },
        sectioned,
      ).code,
    ).toBe("edit.unsafe-target");
    expect(
      refused({ kind: "setTaskSchedule", diagram: "plan", task: "nope", from: "2026-06-01" }, base)
        .code,
    ).toBe("edit.unsafe-target");
    expect(
      refused(
        { kind: "setTaskSchedule", diagram: "d", task: "a", from: "2026-06-01" },
        "diagram d: flow { a -> b }\n",
      ).code,
    ).toBe("edit.unsafe-target");
  });
});

describe("Status operations", () => {
  const base = chart('task tec0 "Evaluar" from 2026-06-01 for 5d');

  it("writes done and critical after the clauses", () => {
    const after = apply(
      { kind: "setTaskStatus", diagram: "plan", task: "tec0", status: "done", critical: true },
      base,
    );
    expect(after).toContain('task tec0 "Evaluar" from 2026-06-01 for 5d done critical\n');
  });

  it("replaces the words written, before the block and the comment", () => {
    const text = chart('task a "A" from 2026-06-01 for 2d done critical { class x } // late');
    expect(
      apply(
        { kind: "setTaskStatus", diagram: "plan", task: "a", status: "active", critical: true },
        text,
      ),
    ).toContain("for 2d active critical { class x } // late");
    expect(
      apply(
        { kind: "setTaskStatus", diagram: "plan", task: "a", status: null, critical: false },
        text,
      ),
    ).toContain('task a "A" from 2026-06-01 for 2d { class x } // late');
    expect(
      apply(
        { kind: "setTaskStatus", diagram: "plan", task: "a", status: "done", critical: false },
        text,
      ),
    ).toContain("for 2d done { class x } // late");
    const bare = chart('task a "A" from 2026-06-01 for 2d { class x }');
    expect(
      apply(
        { kind: "setTaskStatus", diagram: "plan", task: "a", status: "active", critical: false },
        bare,
      ),
    ).toContain("for 2d active { class x }");
  });

  it("works on a milestone, and changes nothing when the words are as asked", () => {
    const text = chart('task a "A" from 2026-06-01 for 2d', 'milestone m "M" after a critical');
    expect(
      apply(
        { kind: "setTaskStatus", diagram: "plan", task: "m", status: "done", critical: true },
        text,
      ),
    ).toContain('milestone m "M" after a done critical\n');
    const result = plan(
      { kind: "setTaskStatus", diagram: "plan", task: "m", status: null, critical: true },
      text,
    );
    expect(result.ok && result.plan.edits).toEqual([]);
  });

  it("refuses a marker and a section", () => {
    const text = chart(
      'marker freeze "Freeze" at 2026-06-10',
      'section s "S" {',
      '  task a "A" from 2026-06-01 for 2d',
      "}",
    );
    for (const task of ["freeze", "s"]) {
      expect(
        refused(
          { kind: "setTaskStatus", diagram: "plan", task, status: "done", critical: false },
          text,
        ).code,
      ).toBe("edit.unsafe-target");
    }
  });
});

describe("Creating tasks, milestones, markers and sections", () => {
  it("inserts a task between two with their indentation", () => {
    const after = apply(
      {
        kind: "createTask",
        diagram: ROADMAP,
        elementKind: "task",
        parent: "tecnologia",
        index: 2,
        after: ["tec1"],
        end: { for: "1d" },
      },
      roadmap,
    );
    expect(after).toContain(
      '    task tec1 "Prueba de concepto con el equipo de Arquitectura" after tec0 for 10d\n' +
        "    task task1 after tec1 for 1d\n" +
        '    task tec2 "Presentar resultados al comité Arq" after tec1 for 1d\n',
    );
  });

  it("inserts a section between two, with the blank lines the sections have", () => {
    const after = apply(
      {
        kind: "createTask",
        diagram: ROADMAP,
        elementKind: "section",
        label: "Operación",
        index: 1,
      },
      roadmap,
    );
    expect(after).toContain(
      '    task tec2 "Presentar resultados al comité Arq" after tec1 for 1d\n' +
        "  }\n" +
        "\n" +
        '  section section1 "Operación" {\n' +
        "  }\n" +
        "\n" +
        '  section nuevo_flujo_genai_hub "Nuevo Flujo GenAI Hub" {\n',
    );
  });

  it("appends a section after the last, and a task after the last of its section", () => {
    const section = apply(
      { kind: "createTask", diagram: ROADMAP, elementKind: "section", id: "ops", label: "Ops" },
      roadmap,
    );
    expect(section.endsWith('  }\n\n  section ops "Ops" {\n  }\n}\n')).toBe(true);
    const task = apply(
      {
        kind: "createTask",
        diagram: ROADMAP,
        elementKind: "milestone",
        parent: "i_d",
        id: "done_all",
        label: "Done",
        after: ["sdlc2"],
      },
      roadmap,
    );
    expect(task).toContain(
      '    task sdlc2 "Desarrollo de Skills y Agentes (AI-SDLC)." after sdlc1 for 15d\n' +
        '    milestone done_all "Done" after sdlc2\n' +
        "  }\n",
    );
  });

  it("numbers the ids from the first free one of each kind", () => {
    const text = chart('task task1 "A" from 2026-06-01 for 2d', "marker marker1 at 2026-06-03");
    const after = apply({ kind: "createTask", diagram: "plan", elementKind: "task" }, text);
    expect(after).toContain("  task task2\n");
    const marker = apply(
      { kind: "createTask", diagram: "plan", elementKind: "marker", from: "2026-06-04" },
      text,
    );
    expect(marker).toContain("  marker marker2 at 2026-06-04\n");
    const milestone = apply(
      { kind: "createTask", diagram: "plan", elementKind: "milestone", after: ["task1"] },
      text,
    );
    expect(milestone).toContain("  milestone milestone1 after task1\n");
  });

  it("writes into an empty chart, an empty section and a section without braces", () => {
    const empty = 'language "0.2"\n\ndiagram plan: gantt {\n  title "Plan"\n}\n';
    expect(
      apply(
        {
          kind: "createTask",
          diagram: "plan",
          elementKind: "task",
          from: "2026-06-01",
          end: { for: "3d" },
        },
        empty,
      ),
    ).toBe(
      'language "0.2"\n\ndiagram plan: gantt {\n  title "Plan"\n  task task1 from 2026-06-01 for 3d\n}\n',
    );
    const open = chart("section s {", "}");
    expect(
      apply(
        {
          kind: "createTask",
          diagram: "plan",
          elementKind: "task",
          parent: "s",
          from: "2026-06-01",
        },
        open,
      ),
    ).toContain("section s {\n    task task1 from 2026-06-01\n  }");
    const bare = chart('section s "S"');
    expect(
      apply(
        {
          kind: "createTask",
          diagram: "plan",
          elementKind: "task",
          parent: "s",
          from: "2026-06-01",
        },
        bare,
      ),
    ).toContain('section s "S" { task task1 from 2026-06-01 }');
  });

  it("refuses a section in a section, a parent that is no section and used or reserved ids", () => {
    const nested = refused(
      { kind: "createTask", diagram: ROADMAP, elementKind: "section", parent: "tecnologia" },
      roadmap,
    );
    expect(nested.code).toBe("edit.invalid-value");
    for (const operation of [
      { elementKind: "task", parent: "tec0" },
      { elementKind: "task", id: "tec0", from: "2026-06-01" },
      { elementKind: "task", id: "for", from: "2026-06-01" },
      { elementKind: "task", id: "tecnologia", from: "2026-06-01" },
      { elementKind: "section", from: "2026-06-01" },
      { elementKind: "milestone", end: { for: "2d" } },
      { elementKind: "marker" },
      { elementKind: "task", after: ["nope"] },
      { elementKind: "box" },
    ] as const) {
      const rejection = refused(
        { kind: "createTask", diagram: ROADMAP, ...operation } as EditOperation,
        roadmap,
      );
      expect(rejection.code, JSON.stringify(operation)).toBe("edit.invalid-value");
    }
    expect(
      refused(
        { kind: "createTask", diagram: "d", elementKind: "task" },
        "diagram d: flow { a -> b }\n",
      ).code,
    ).toBe("edit.invalid-value");
    expect(
      refused(
        {
          kind: "createTask",
          diagram: ROADMAP,
          elementKind: "task",
          id: "2nd",
          from: "2026-06-01",
        },
        roadmap,
      ).code,
    ).toBe("edit.invalid-id");
    expect(
      refused(
        { kind: "createTask", diagram: ROADMAP, elementKind: "task", parent: "nope" },
        roadmap,
      ).code,
    ).toBe("edit.unsafe-target");
  });
});

describe("Calendar operation", () => {
  it("writes a holiday into the exclude statement, and the dates follow", () => {
    const before = schedule(roadmap);
    const after = apply(
      {
        kind: "setCalendar",
        diagram: ROADMAP,
        exclude: ["weekends", "2026-06-29"],
        include: [],
      },
      roadmap,
    );
    expect(after).toContain("  exclude weekends, 2026-06-29\n");
    expect(schedule(after).flu1).not.toBe(before.flu1);
    expect(schedule(after).flu1).toBe("2026-06-18T00:00 → 2026-07-03T00:00");
    expect(before.flu1).toBe("2026-06-18T00:00 → 2026-07-02T00:00");
  });

  it("writes new statements after the chart's own and before its first row", () => {
    const text = chart('title "Plan"', 'axisFormat "%d %b"', 'task a "A" from 2026-06-01 for 2d');
    const after = apply(
      {
        kind: "setCalendar",
        diagram: "plan",
        exclude: ["saturday", "sunday"],
        include: ["2026-06-06"],
      },
      text,
    );
    expect(after).toContain(
      'axisFormat "%d %b"\n  exclude saturday, sunday\n  include 2026-06-06\n  task a',
    );
    const first = chart('task a "A" from 2026-06-01 for 2d');
    expect(
      apply({ kind: "setCalendar", diagram: "plan", exclude: ["weekends"], include: [] }, first),
    ).toContain("diagram plan: gantt {\n  exclude weekends\n  task a");
    const none = 'language "0.2"\n\ndiagram plan: gantt {\n}\n';
    expect(
      apply({ kind: "setCalendar", diagram: "plan", exclude: ["monday"], include: [] }, none),
    ).toContain("diagram plan: gantt {\n  exclude monday\n}");
  });

  it("deletes the statements of a list that is empty, and merges many into one", () => {
    const text = chart(
      "exclude weekends",
      "exclude 2026-06-03",
      "include 2026-06-06",
      'task a "A" from 2026-06-01 for 2d',
    );
    const after = apply(
      { kind: "setCalendar", diagram: "plan", exclude: ["weekends", "2026-06-03"], include: [] },
      text,
    );
    expect(after).toBe(chart("exclude weekends, 2026-06-03", 'task a "A" from 2026-06-01 for 2d'));
    // The deleted statement is the anchor of the one that is new.
    const moved = apply(
      { kind: "setCalendar", diagram: "plan", exclude: ["friday"], include: [] },
      chart("include 2026-06-06", 'task a "A" from 2026-06-01 for 2d'),
    );
    expect(moved).toBe(chart("exclude friday", 'task a "A" from 2026-06-01 for 2d'));
  });

  it("changes nothing when the lists are as written", () => {
    const result = plan(
      { kind: "setCalendar", diagram: ROADMAP, exclude: ["weekends"], include: [] },
      roadmap,
    );
    expect(result.ok && result.plan.edits).toEqual([]);
  });

  it("refuses a word that is no day, and a diagram that is no chart", () => {
    expect(
      refused(
        { kind: "setCalendar", diagram: ROADMAP, exclude: ["holidays"], include: [] },
        roadmap,
      ).code,
    ).toBe("edit.invalid-value");
    expect(
      refused(
        { kind: "setCalendar", diagram: ROADMAP, exclude: [], include: ["2026-02-30"] },
        roadmap,
      ).code,
    ).toBe("edit.invalid-value");
    expect(
      refused(
        { kind: "setCalendar", diagram: "d", exclude: ["weekends"], include: [] },
        "diagram d: flow { a -> b }\n",
      ).code,
    ).toBe("edit.invalid-value");
  });
});

describe("Rows between sections", () => {
  it("moves a task into another section, indented as the one it goes before", () => {
    const after = apply(
      { kind: "moveElement", diagram: ROADMAP, element: "flu0", parent: "tecnologia", index: 0 },
      roadmap,
    );
    expect(after).toContain(
      '  section tecnologia "Tecnología" {\n' +
        '    task flu0 "Propuesta de flujo ágil de evaluación" from 2026-06-15 for 3d\n' +
        '    task tec0 "Evaluar plataformas de agentes" from 2026-06-01 for 5d\n',
    );
    expect(after.match(/task flu0/g)).toHaveLength(1);
    expect(after).toContain(
      '  section nuevo_flujo_genai_hub "Nuevo Flujo GenAI Hub" {\n' + '    task flu1 "Interfaz',
    );
  });

  it("moves a task to the top of the chart, and to the end of a section, with its comment", () => {
    const text = chart(
      'section a "A" {',
      '  task t1 "One" from 2026-06-01 for 2d // first',
      "  // two",
      '  task t2 "Two" after t1 for 2d',
      "}",
      'section b "B" {',
      '  task t3 "Three" from 2026-06-10 for 2d',
      "}",
    );
    const end = apply({ kind: "moveElement", diagram: "plan", element: "t1", parent: "b" }, text);
    expect(end).toContain('section a "A" {\n    // two\n    task t2 "Two" after t1 for 2d\n  }');
    expect(end).toContain(
      'task t3 "Three" from 2026-06-10 for 2d\n    task t1 "One" from 2026-06-01 for 2d // first\n  }',
    );
    const top = apply(
      { kind: "moveElement", diagram: "plan", element: "t2", parent: null, index: 0 },
      text,
    );
    expect(top).toBe(
      chart(
        "// two",
        'task t2 "Two" after t1 for 2d',
        'section a "A" {',
        '  task t1 "One" from 2026-06-01 for 2d // first',
        "}",
        'section b "B" {',
        '  task t3 "Three" from 2026-06-10 for 2d',
        "}",
      ),
    );
    expect(compile(top).document.diagrams[0]!.elementsById.get("t2")!.groupPath).toEqual([]);
  });

  it("moves a section among the sections, with the blank lines between them", () => {
    const after = apply(
      { kind: "moveElement", diagram: ROADMAP, element: "i_d", parent: null, index: 0 },
      roadmap,
    );
    const [head, tec, flu, last] = roadmap.split(/\n\n(?= {2}section )/) as [
      string,
      string,
      string,
      string,
    ];
    const iD = last.replace(/\n}\n$/, "");
    expect(after).toBe(`${head}\n\n${iD}\n\n${tec}\n\n${flu}\n}\n`);
    // And the first one to the end: the blank lines stay between the sections.
    const back = apply(
      { kind: "moveElement", diagram: ROADMAP, element: "tecnologia", parent: null },
      roadmap,
    );
    expect(back).toBe(`${head}\n\n${flu}\n\n${iD}\n\n${tec}\n}\n`);
  });

  it("changes nothing for a move to where the statement already is", () => {
    for (const index of [0, 1]) {
      const result = plan(
        { kind: "moveElement", diagram: ROADMAP, element: "tec0", parent: "tecnologia", index },
        roadmap,
      );
      expect(result.ok && result.plan.edits, `index ${index}`).toEqual([]);
    }
  });

  it("refuses a section in a section, a task in a task and an index past the end", () => {
    const nested = refused(
      { kind: "moveElement", diagram: ROADMAP, element: "i_d", parent: "tecnologia" },
      roadmap,
    );
    expect(nested.code).toBe("edit.invalid-value");
    for (const operation of [
      { element: "flu0", parent: "tec0" },
      { element: "flu0", parent: "tecnologia", index: 9 },
      { element: "flu0", parent: "tecnologia", index: -1 },
      { element: "flu0", parent: "tecnologia", at: { x: 1, y: 2 } },
    ] as const) {
      expect(
        refused({ kind: "moveElement", diagram: ROADMAP, ...operation }, roadmap).code,
        JSON.stringify(operation),
      ).toBe("edit.invalid-value");
    }
    expect(
      refused({ kind: "moveElement", diagram: ROADMAP, element: "nope", parent: null }, roadmap)
        .code,
    ).toBe("edit.unsafe-target");
  });
});

describe("Removing and renaming in charts", () => {
  it("removes a predecessor and writes the start its successor had", () => {
    const before = schedule(roadmap);
    const after = apply(
      { kind: "removeElement", diagram: ROADMAP, element: "tec0", cascade: true },
      roadmap,
    );
    expect(after).toContain(
      '    task tec1 "Prueba de concepto con el equipo de Arquitectura" from 2026-06-08 for 10d\n',
    );
    expect(after).not.toContain("tec0");
    const { tec0: _removed, ...kept } = before;
    expect(schedule(after)).toEqual(kept);
  });

  it("removes it without a cascade: dependencies are not dependents", () => {
    const result = plan(
      { kind: "removeElement", diagram: ROADMAP, element: "tec1", cascade: false },
      roadmap,
    );
    expect(result.ok).toBe(true);
  });

  it("drops the id from a list and keeps the others", () => {
    const text = chart(
      'task a "A" from 2026-06-01 for 2d',
      'task b "B" from 2026-06-01 for 4d',
      'task c "C" after a, b for 1d',
      'task d "D" after b, a for 1d',
    );
    const before = schedule(text);
    const withoutB = apply(
      { kind: "removeElement", diagram: "plan", element: "b", cascade: true },
      text,
    );
    expect(withoutB).toContain('task c "C" after a for 1d');
    expect(withoutB).toContain('task d "D" after a for 1d');
    // c and d waited for b, the later of the two: they now start after a, and nothing is written.
    expect(schedule(withoutB).c).not.toBe(before.c);
    const withoutA = apply(
      { kind: "removeElement", diagram: "plan", element: "a", cascade: true },
      text,
    );
    expect(withoutA).toContain('task c "C" after b for 1d');
    expect(schedule(withoutA).c).toBe(before.c);
  });

  it("keeps the start of a task that followed the removed one in source order", () => {
    const text = chart(
      'task a "A" from 2026-06-01 for 2d',
      'task b "B" for 3d',
      'task c "C" for 2d',
      "marker m at 2026-06-02",
    );
    const before = schedule(text);
    const after = apply(
      { kind: "removeElement", diagram: "plan", element: "b", cascade: true },
      text,
    );
    expect(after).toContain('task c "C" from 2026-06-06 for 2d');
    const { b: _b, ...kept } = before;
    expect(schedule(after)).toEqual(kept);
  });

  it("writes the length a task had when what it ended at goes", () => {
    const text = chart('task a "A" from 2026-06-01 until c', 'task c "C" from 2026-06-05 for 2d');
    const before = schedule(text);
    const after = apply(
      { kind: "removeElement", diagram: "plan", element: "c", cascade: true },
      text,
    );
    expect(after).toContain('task a "A" from 2026-06-01 for 4d');
    expect(schedule(after).a).toBe(before.a);
  });

  it("removes a section with its tasks and keeps every other date", () => {
    const before = schedule(roadmap);
    const after = apply(
      { kind: "removeElement", diagram: ROADMAP, element: "nuevo_flujo_genai_hub", cascade: true },
      roadmap,
    );
    for (const id of ["flu0", "flu1", "flu2", "flu3"]) expect(after).not.toContain(id);
    const kept = Object.fromEntries(Object.entries(before).filter(([id]) => !id.startsWith("flu")));
    expect(schedule(after)).toEqual(kept);
    // A section with tasks needs the cascade, as a group with children does.
    expect(
      refused({ kind: "removeElement", diagram: ROADMAP, element: "i_d", cascade: false }, roadmap)
        .code,
    ).toBe("edit.has-dependents");
  });

  it("notes the starts it wrote", () => {
    const result = plan(
      { kind: "removeElement", diagram: ROADMAP, element: "tec0", cascade: true },
      roadmap,
    );
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(result.plan.notes).toEqual(["`tec1` kept its start: it now reads `from 2026-06-08`."]);
  });

  it("removes the styles and animations of a task", () => {
    const text = chart(
      'task a "A" from 2026-06-01 for 2d',
      'task b "B" after a for 2d',
      "style a { stroke danger }",
    );
    const after = apply(
      { kind: "removeElement", diagram: "plan", element: "a", cascade: true },
      text,
    );
    expect(after).not.toContain("style a");
    expect(after).toContain('task b "B" from 2026-06-03 for 2d');
  });

  it("renames an id through every after and until", () => {
    const after = apply(
      { kind: "renameElement", diagram: ROADMAP, element: "sdlc1", newId: "workshops" },
      roadmap,
    );
    expect(after).toContain('task workshops "Workshops AI-SDLC" from 2026-08-03 for 5d');
    expect(after).toContain("after workshops for 15d");
    expect(compile(after).diagnostics).toEqual([]);
    const until = chart('task a "A" from 2026-06-01 until c', 'task c "C" from 2026-06-05 for 2d');
    expect(
      apply({ kind: "renameElement", diagram: "plan", element: "c", newId: "end" }, until),
    ).toContain('task a "A" from 2026-06-01 until end');
    expect(
      refused({ kind: "renameElement", diagram: "plan", element: "c", newId: "after" }, until).code,
    ).toBe("edit.invalid-id");
  });

  it("refuses an id that is not in the chart", () => {
    expect(
      refused({ kind: "removeElement", diagram: ROADMAP, element: "tec9", cascade: true }, roadmap)
        .code,
    ).toBe("edit.unsafe-target");
  });
});

describe("A gantt chart is created and edited as a chart", () => {
  afterEach(() => setLocale("en"));

  it("creates a gantt chart", () => {
    const text = apply({ kind: "createDiagram", type: "gantt", title: "Roadmap" }, "");
    expect(text).toBe('language "0.2"\n\ndiagram diagram1: gantt {\n  title "Roadmap"\n}\n');
    expect(compile(text).diagnostics).toEqual([]);
  });

  it("refuses the operations that place or link boxes", () => {
    const text = chart('task a "A" from 2026-06-01 for 2d', 'task b "B" after a for 2d');
    for (const operation of [
      { kind: "setPosition", diagram: "plan", element: "a", x: 1, y: 2 },
      { kind: "setSize", diagram: "plan", element: "a", width: 20, height: 2 },
      { kind: "createElement", diagram: "plan", elementKind: "box" },
      { kind: "createRelation", diagram: "plan", from: "a", to: "b", line: "solid" },
      { kind: "materializeRelationId", diagram: "plan", relationKey: "a->b#1", id: "link" },
      { kind: "setElementKind", diagram: "plan", element: "a", elementKind: "milestone" },
      { kind: "groupElements", diagram: "plan", elements: ["a", "b"], id: "g" },
      {
        kind: "setElementProperty",
        diagram: "plan",
        target: "a",
        targetKind: "element",
        property: "layer",
        value: "x",
      },
    ] as unknown as EditOperation[]) {
      const rejection = refused(operation, text);
      expect(rejection.code, operation.kind).toBe("edit.invalid-value");
      expect(rejection.reason, operation.kind).toContain("gantt");
    }
  });

  it("keeps the edits of labels, descriptions and links", () => {
    const text = chart("task a from 2026-06-01 for 2d", 'task b "B" after a for 2d');
    expect(
      apply({ kind: "setElementLabel", diagram: "plan", element: "a", label: "Alpha" }, text),
    ).toContain('task a "Alpha" from 2026-06-01 for 2d');
    expect(
      apply(
        {
          kind: "setDescription",
          diagram: "plan",
          target: "b",
          targetKind: "element",
          description: "Why",
        },
        text,
      ),
    ).toContain('task b "B" after a for 2d { description "Why" }');
    expect(
      apply(
        {
          kind: "setElementProperty",
          diagram: "plan",
          target: "b",
          targetKind: "element",
          property: "url",
          value: "https://example.com",
        },
        text,
      ),
    ).toContain("url");
  });

  it("explains a refusal in Spanish", () => {
    setLocale("es");
    const text = chart('task a "A" from 2026-06-01 for 2d');
    expect(
      refused({ kind: "setTaskSchedule", diagram: "plan", task: "a", from: "mañana" }, text).reason,
    ).toBe("`mañana` no es una fecha; escribe 2026-06-15, o 2026-06-15T09:30 con hora del día.");
    expect(
      refused({ kind: "setPosition", diagram: "plan", element: "a", x: 1, y: 2 }, text).reason,
    ).toMatch(/no se aplica a los diagramas de Gantt/);
  });
});

describe("Chart statements", () => {
  const set = (
    statement: Extract<EditOperation, { kind: "setChartStatement" }>["statement"],
    value: string | number | null,
    text = roadmap,
  ) => ({ kind: "setChartStatement" as const, diagram: ROADMAP, statement, value, text });
  const run = (op: ReturnType<typeof set>) =>
    apply(
      { kind: "setChartStatement", diagram: op.diagram, statement: op.statement, value: op.value },
      op.text,
    );

  it("changes a statement where it is written", () => {
    const text = run(set("axisFormat", "%b %Y"));
    expect(text).toContain('axisFormat "%b %Y"');
    expect(text.replace('axisFormat "%b %Y"', 'axisFormat "%d %b"')).toBe(roadmap);
  });

  it("writes a new statement after the chart's others and before its rows", () => {
    const text = run(set("weekStart", "sunday"));
    expect(text).toContain("  today\n  weekStart sunday\n\n  section tecnologia");
    for (const [statement, value, written] of [
      ["ticks", "1w", "ticks 1w"],
      ["axis", "both", "axis both"],
      ["labels", "column", "labels column"],
      ["display", "compact", "display compact"],
      ["dependencies", "hidden", "dependencies hidden"],
      ["dayWidth", 12, "dayWidth 12"],
    ] as const) {
      expect(run(set(statement, value))).toContain(`  ${written}\n`);
    }
  });

  it("writes `today` bare or with a day, and takes it away", () => {
    expect(run(set("today", "2026-10-29"))).toContain("  today 2026-10-29\n");
    const pinned = run(set("today", "2026-10-29"));
    expect(run(set("today", "", pinned))).toBe(roadmap);
    expect(run(set("today", null))).not.toMatch(/\n\s+today\n/);
    expect(run(set("today", null, run(set("today", null))))).not.toMatch(/\n\s+today\n/);
  });

  it("removes a statement with null, and nothing when it is not written", () => {
    expect(run(set("axisFormat", null))).not.toContain("axisFormat");
    const result = plan(
      { kind: "setChartStatement", diagram: ROADMAP, statement: "ticks", value: null },
      roadmap,
    );
    expect(result.ok && result.plan.edits).toEqual([]);
  });

  it("refuses a value the chart would not read, and a statement that is not its look", () => {
    const code = (op: ReturnType<typeof set>) =>
      refused(
        {
          kind: "setChartStatement",
          diagram: op.diagram,
          statement: op.statement,
          value: op.value,
        },
        op.text,
      );
    expect(code(set("ticks", "7")).reason).toContain("`7`");
    expect(code(set("ticks", "0w")).code).toBe("edit.invalid-value");
    expect(code(set("axisFormat", "%d %Q")).reason).toContain("%Q");
    expect(code(set("axis", "middle")).reason).toContain("top, bottom, both");
    expect(code(set("dayWidth", 0)).reason).toContain("1 to 100000");
    expect(code(set("weekStart", "someday")).code).toBe("edit.invalid-value");
    expect(code(set("today", "2026-02-30")).reason).toContain("2026-02-30");
    expect(
      refused(
        { kind: "setChartStatement", diagram: ROADMAP, statement: "title" as "axis", value: "x" },
        roadmap,
      ).reason,
    ).toContain("axisFormat");
    expect(
      refused(
        { kind: "setChartStatement", diagram: "plan", statement: "axis", value: "top" },
        "diagram plan: flow {\n  a -> b\n}\n",
      ).code,
    ).toBe("edit.invalid-value");
  });
});
