import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { setLocale } from "@meltemi/diagrams-i18n";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  CanvasSession,
  type CanvasAction,
  type HostMessage,
  type InspectorField,
  type InspectorModel,
} from "../src/index.js";
import {
  parseDayList,
  dayListText,
  toggleWeekday,
  toggleWeekends,
  withDates,
} from "../src/canvas/timeline.js";

const ROADMAP = readFileSync(join(CORPUS_ROOT, "valid/gantt/roadmap.meltemi"), "utf8");
const TODAY = "2026-10-29";

afterEach(() => setLocale("en"));

/**
 * A session on a text as a host runs it: each plan is applied and analysed as the next revision,
 * and the messages of the last answer or update are kept, the inspector among them.
 */
function open(text: string, selection: readonly string[] = []) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  const analyze = () => analyzeDocument({ text: current, revision: rev, layout: { today: TODAY } });
  let messages: readonly HostMessage[] = session.update(analyze());
  const select = (ids: readonly string[]) => {
    messages = session.receive({ type: "select", ids: [...ids] }).messages;
  };
  if (selection.length > 0) select(selection);
  const act = (action: CanvasAction) => session.receive({ type: "action", revision: rev, action });
  /** Writes a field of the selection: the text it leaves, or the reason it was refused. */
  const write = (
    ids: readonly string[],
    field: string,
    value: string | number | null,
  ): { readonly text: string } | { readonly refused: string } => {
    const result = act({ kind: "setField", ids: [...ids], field, value });
    if (!result.plan) {
      const rejected = result.messages.find(
        (m): m is HostMessage & { type: "rejected" } => m.type === "rejected",
      );
      return { refused: rejected?.reason ?? "nothing was planned" };
    }
    current = applyTextEdits(current, result.plan.edits);
    rev++;
    messages = session.update(analyze());
    return { text: current };
  };
  return {
    select,
    write,
    text: () => current,
    inspector: (): InspectorModel =>
      messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model,
  };
}

const field = (model: InspectorModel, name: string): InspectorField => {
  const found = model.fields.find((f) => f.name === name);
  if (!found) throw new Error(`No field ${name}: ${model.fields.map((f) => f.name).join(", ")}`);
  return found;
};

const names = (model: InspectorModel) => model.fields.map((f) => f.name);
const strip = (model: InspectorModel) =>
  model.fields.filter((f) => f.section === "strip").map((f) => f.name);

const lineOf = (text: string, id: string): string =>
  text
    .split("\n")
    .find((line) => new RegExp(`^\\s*(task|milestone|marker|section) ${id}\\b`).test(line)) ?? "";

const chart = (...lines: string[]) =>
  ['language "0.2"', "", "diagram plan: gantt {", ...lines.map((l) => `  ${l}`), "}", ""].join(
    "\n",
  );

describe("the properties of a task", () => {
  it("start with its schedule, under a heading, then the usual fields and the strip", () => {
    const model = open(ROADMAP, ["tec1"]).inspector();
    expect(model.title).toBe("task tec1");
    expect(names(model).filter((n) => !n.startsWith("style.") && !n.startsWith("effect."))).toEqual(
      [
        "from",
        "after",
        "end",
        "duration",
        "status",
        "critical",
        "starts",
        "ends",
        "working",
        "id",
        "label",
        "description",
        "classes",
        "link",
        "url",
      ],
    );
    expect(field(model, "from")).toMatchObject({
      type: "date",
      label: "Start date",
      // Written nowhere: the date the bar starts at shows, greyed.
      value: null,
      placeholder: "2026-06-08",
      heading: "Schedule",
    });
    expect(field(model, "after")).toMatchObject({ type: "tasks", value: "tec0" });
    expect(field(model, "end")).toMatchObject({
      type: "enum",
      value: "for",
      placeholder: "one day",
      options: ["for", "to", "until"],
    });
    expect(field(model, "duration")).toMatchObject({
      type: "duration",
      value: "10d",
      options: ["s", "min", "h", "d", "w"],
    });
    expect(field(model, "status")).toMatchObject({ value: null, placeholder: "planned" });
    expect(field(model, "critical")).toMatchObject({ type: "boolean", value: "off" });
    // Where the schedule puts it, read-only.
    expect(field(model, "starts")).toMatchObject({ value: "8 June 2026", readonly: true });
    expect(field(model, "ends")).toMatchObject({ value: "19 June 2026", readonly: true });
    expect(field(model, "working")).toMatchObject({ value: "10 working days", readonly: true });
    expect(field(model, "id").value).toBe("tec1");
  });

  it("offers the tasks it may follow: not itself and not what comes after it", () => {
    const model = open(ROADMAP, ["tec1"]).inspector();
    const options = field(model, "after").options!;
    expect(options).not.toContain("tec1");
    // tec2 comes after tec1: following it would close a loop.
    expect(options).not.toContain("tec2");
    expect(options).toEqual(["tec0", "flu0", "flu1", "flu2", "flu3", "sdlc0", "sdlc1", "sdlc2"]);
    // The label of a task is the title of its chip.
    expect(field(model, "after").titles!["tec0"]).toBe("Evaluar plataformas de agentes");
  });

  it("makes two weeks of a duration of ten working days, and says where it ends", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    const result = canvas.write(["tec1"], "duration", "2w");
    expect(lineOf((result as { text: string }).text, "tec1")).toContain("after tec0 for 2w");
    expect(field(canvas.inspector(), "ends").value).toBe("19 June 2026");
    expect(field(canvas.inspector(), "duration").value).toBe("2w");
  });

  it("writes the length in hours and clears it to the default of one day", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    expect(canvas.write(["tec1"], "duration", "36h")).toMatchObject({
      text: expect.stringContaining("after tec0 for 36h"),
    });
    expect(field(canvas.inspector(), "working").value).toBe("36 working hours");
    const cleared = canvas.write(["tec1"], "duration", null) as { text: string };
    expect(lineOf(cleared.text, "tec1")).toBe(
      '    task tec1 "Prueba de concepto con el equipo de Arquitectura" after tec0',
    );
    // Nothing written: the default shows, greyed.
    expect(field(canvas.inspector(), "end")).toMatchObject({ value: null });
    expect(field(canvas.inspector(), "duration")).toMatchObject({ value: null, placeholder: "1d" });
  });

  it("turns the end into another of the same length, or of the next task", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    // `to` is the last day it covers.
    const to = canvas.write(["tec1"], "end", "to") as { text: string };
    expect(lineOf(to.text, "tec1")).toContain("after tec0 to 2026-06-19");
    expect(field(canvas.inspector(), "endDate")).toMatchObject({
      value: "2026-06-19",
      type: "date",
    });
    expect(names(canvas.inspector())).not.toContain("duration");
    // Back to a duration: as many working days as it covers.
    const back = canvas.write(["tec1"], "end", "for") as { text: string };
    expect(lineOf(back.text, "tec1")).toContain("after tec0 for 10d");
    // `until` ends before the task written next that may come after it (tec2 follows tec1).
    const until = canvas.write(["tec1"], "end", "until") as { text: string };
    expect(lineOf(until.text, "tec1")).toContain("after tec0 until flu0");
    expect(field(canvas.inspector(), "until")).toMatchObject({ type: "tasks", value: "flu0" });
    expect(field(canvas.inspector(), "end").value).toBe("until");
    // The last task taken away leaves it as long as it is.
    const kept = canvas.write(["tec1"], "until", null) as { text: string };
    expect(lineOf(kept.text, "tec1")).toContain("after tec0 for ");
  });

  it("refuses `until` for the last task, which has none to end before", () => {
    const canvas = open(ROADMAP, ["sdlc2"]);
    expect(canvas.write(["sdlc2"], "end", "until")).toEqual({
      refused: "`sdlc2` has no task to end before: add one after it, then choose Until.",
    });
    expect(lineOf(canvas.text(), "sdlc2")).toContain("for 15d");
  });

  it("writes a start date, and takes it away from a task that follows another", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    const set = canvas.write(["tec1"], "from", "2026-06-15") as { text: string };
    expect(lineOf(set.text, "tec1")).toContain("after tec0 from 2026-06-15 for 10d");
    expect(field(canvas.inspector(), "from")).toMatchObject({ value: "2026-06-15" });
    const cleared = canvas.write(["tec1"], "from", null) as { text: string };
    expect(lineOf(cleared.text, "tec1")).toContain("after tec0 for 10d");
  });

  it("refuses a date that does not exist with the model's reason, and writes nothing", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    const before = canvas.text();
    for (const [name, value, reason] of [
      ["from", "2026-02-30", "`2026-02-30`: February 2026 has 28 days."],
      ["from", "2026-13-01", "`2026-13-01` has no month 13; months run from 01 to 12."],
      [
        "from",
        "soon",
        "`soon` is not a date; write 2026-06-15, or 2026-06-15T09:30 with a time of day.",
      ],
    ] as const) {
      expect(canvas.write(["tec1"], name, value), value).toEqual({ refused: reason });
    }
    // The end date of a task that ends `to` a date.
    const to = canvas.write(["tec1"], "end", "to") as { text: string };
    expect(canvas.write(["tec1"], "endDate", "2026-02-30")).toEqual({
      refused: "`2026-02-30`: February 2026 has 28 days.",
    });
    expect(canvas.text()).toBe(to.text);
    expect(to.text).not.toBe(before);
  });

  it("says the refusal in Spanish when the interface is", () => {
    setLocale("es");
    const canvas = open(ROADMAP, ["tec1"]);
    expect(canvas.write(["tec1"], "from", "2026-02-30")).toEqual({
      refused: "`2026-02-30`: Febrero de 2026 tiene 28 días.",
    });
    const model = canvas.inspector();
    expect(field(model, "from")).toMatchObject({
      label: "Fecha de inicio",
      heading: "Planificación",
    });
    expect(field(model, "after").label).toBe("Después de");
    expect(field(model, "end")).toMatchObject({ label: "Fin", placeholder: "un día" });
    expect(field(model, "end").titles).toEqual({
      for: "durante un tiempo",
      to: "hasta una fecha",
      until: "hasta que empiecen otras tareas",
    });
    expect(field(model, "starts")).toMatchObject({ label: "Empieza", value: "8 de junio de 2026" });
    expect(field(model, "ends")).toMatchObject({ label: "Termina", value: "19 de junio de 2026" });
    expect(field(model, "working")).toMatchObject({
      label: "Tiempo hábil",
      value: "10 días hábiles",
    });
    expect(field(model, "critical").label).toBe("Crítica");
  });

  it("adds and removes the tasks it follows, and is refused one that would close a loop", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    const added = canvas.write(["tec1"], "after", "tec0, flu0") as { text: string };
    expect(lineOf(added.text, "tec1")).toContain("after tec0, flu0 for 10d");
    // Taking the last of them away would leave the task with no start: it keeps the one it has
    // (flu0 ends on the 17th, so it started on the 18th).
    const kept = canvas.write(["tec1"], "after", null) as { text: string };
    expect(lineOf(kept.text, "tec1")).toContain(
      'task tec1 "Prueba de concepto con el equipo de Arquitectura" from 2026-06-18 for 10d',
    );
    expect(field(canvas.inspector(), "starts").value).toBe("18 June 2026");
    // A loop: tec0 after tec2, which follows tec1, which follows tec0.
    const loop = open(ROADMAP, ["tec0"]).write(["tec0"], "after", "tec2");
    expect(loop).toMatchObject({ refused: expect.stringContaining("tec") });
    expect("refused" in loop).toBe(true);
  });

  it("writes the status and whether it is critical, one keeping the other", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    const active = canvas.write(["tec1"], "status", "active") as { text: string };
    expect(lineOf(active.text, "tec1")).toMatch(/for 10d active$/);
    const critical = canvas.write(["tec1"], "critical", "on") as { text: string };
    expect(lineOf(critical.text, "tec1")).toMatch(/for 10d active critical$/);
    expect(field(canvas.inspector(), "status").value).toBe("active");
    expect(field(canvas.inspector(), "critical").value).toBe("on");
    const done = canvas.write(["tec1"], "status", "done") as { text: string };
    expect(lineOf(done.text, "tec1")).toMatch(/for 10d done critical$/);
    // Planned is no word at all.
    const planned = canvas.write(["tec1"], "status", "planned") as { text: string };
    expect(lineOf(planned.text, "tec1")).toMatch(/for 10d critical$/);
    const calm = canvas.write(["tec1"], "critical", "off") as { text: string };
    expect(lineOf(calm.text, "tec1")).toMatch(/for 10d$/);
  });

  it("writes the id, the label, a description and classes as any element's", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    const label = canvas.write(["tec1"], "label", "PoC") as { text: string };
    expect(lineOf(label.text, "tec1")).toContain('task tec1 "PoC" after tec0');
    const described = canvas.write(["tec1"], "description", "Con Arquitectura") as { text: string };
    expect(described.text).toContain("Con Arquitectura");
    const renamed = canvas.write(["tec1"], "id", "poc") as { text: string };
    expect(renamed.text).toContain('task poc "PoC" after tec0');
    // The task that came after it follows the new id.
    expect(lineOf(renamed.text, "tec2")).toContain("after poc");
  });
});

describe("the properties of a milestone, a marker and a section", () => {
  const SHEET = chart(
    "section build {",
    "  task a from 2026-06-01 for 3d",
    "  milestone m after a",
    "}",
    "marker release at 2026-06-10",
  );

  it("show what applies to a milestone: a date, what it follows and its status", () => {
    const model = open(SHEET, ["m"]).inspector();
    expect(model.title).toBe("milestone m");
    expect(field(model, "at")).toMatchObject({
      type: "date",
      label: "Date",
      value: null,
      placeholder: "2026-06-04",
      heading: "Schedule",
    });
    expect(field(model, "after")).toMatchObject({ type: "tasks", value: "a" });
    expect(names(model)).toEqual(expect.arrayContaining(["status", "critical"]));
    // A diamond has no end, no length and no read-only lines.
    for (const name of [
      "end",
      "duration",
      "endDate",
      "until",
      "starts",
      "ends",
      "working",
      "from",
    ]) {
      expect(names(model), name).not.toContain(name);
    }
  });

  it("write a milestone's date in place of what it follows", () => {
    const canvas = open(SHEET, ["m"]);
    const moved = canvas.write(["m"], "at", "2026-06-12") as { text: string };
    expect(lineOf(moved.text, "m")).toContain("milestone m after a at 2026-06-12");
    const status = canvas.write(["m"], "status", "done") as { text: string };
    expect(lineOf(status.text, "m")).toMatch(/at 2026-06-12 done$/);
  });

  it("show a marker's date and what it follows, and no status", () => {
    const model = open(SHEET, ["release"]).inspector();
    expect(model.title).toBe("marker release");
    expect(field(model, "at")).toMatchObject({ value: "2026-06-10", label: "Date" });
    expect(names(model)).toContain("after");
    for (const name of ["status", "critical", "end", "duration", "starts"]) {
      expect(names(model), name).not.toContain(name);
    }
  });

  it("show a section its title and the usual fields, with no schedule", () => {
    const model = open(SHEET, ["build"]).inspector();
    expect(model.title).toBe("section build");
    expect(names(model).filter((n) => !n.startsWith("style.") && !n.startsWith("effect."))).toEqual(
      ["id", "label", "description", "classes", "link", "url"],
    );
    expect(field(model, "label").value).toBe("build");
  });
});

describe("the properties of an arrow", () => {
  it("say where it runs, read-only, and where to change it, with nothing to style", () => {
    const canvas = open(ROADMAP);
    canvas.select(["tec0->tec1#1"]);
    const arrow = canvas.inspector();
    expect(arrow.target.kind).toBe("relation");
    expect(arrow.fields.map((f) => f.name)).toEqual(["from", "to"]);
    expect(field(arrow, "from")).toMatchObject({ value: "tec0", readonly: true });
    expect(field(arrow, "to")).toMatchObject({
      value: "tec1",
      readonly: true,
      note: "A dependency is the After of the task it points to: change it there, or delete the arrow.",
    });
  });

  it("share no style with the tasks selected beside it", () => {
    const canvas = open(ROADMAP);
    canvas.select(["tec1", "tec0->tec1#1"]);
    expect(strip(canvas.inspector())).toContain("style.fill");
    expect(canvas.inspector().title).toBe("2 selected");
  });
});

describe("the properties of the chart", () => {
  it("show its title and theme, then the look of its axis and its calendar", () => {
    const model = open(ROADMAP).inspector();
    expect(model.title).toBe("Diagram hoja_de_ruta_genai");
    expect(names(model)).toEqual([
      "theme",
      "title",
      "description",
      "axisFormat",
      "ticks",
      "weekStart",
      "axis",
      "labels",
      "display",
      "dependencies",
      "dayWidth",
      "exclude",
      "include",
      "today",
      "canvas",
    ]);
    expect(field(model, "axisFormat")).toMatchObject({
      type: "text",
      value: "%d %b",
      heading: "Axis and look",
      quick: [
        { label: "%d %b", value: "%d %b" },
        { label: "%b %Y", value: "%b %Y" },
        { label: "%Y-%m-%d", value: "%Y-%m-%d" },
        { label: "%H:%M", value: "%H:%M" },
      ],
    });
    expect(field(model, "ticks")).toMatchObject({ value: null, placeholder: "auto" });
    expect(field(model, "weekStart")).toMatchObject({
      value: null,
      placeholder: "monday",
      options: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    });
    expect(field(model, "axis")).toMatchObject({
      value: null,
      placeholder: "bottom",
      options: ["top", "bottom", "both"],
    });
    expect(field(model, "labels")).toMatchObject({
      placeholder: "bar",
      options: ["bar", "column"],
    });
    expect(field(model, "display")).toMatchObject({
      placeholder: "normal",
      options: ["normal", "compact"],
    });
    expect(field(model, "dependencies")).toMatchObject({
      placeholder: "shown",
      options: ["shown", "hidden"],
    });
    expect(field(model, "dayWidth")).toMatchObject({
      type: "number",
      value: null,
      placeholder: "auto",
      quick: [{ label: "Auto", value: "" }],
    });
    expect(field(model, "exclude")).toMatchObject({
      type: "weekdays",
      value: "weekends",
      heading: "Calendar",
    });
    expect(field(model, "include")).toMatchObject({ type: "text", value: null });
    // The bare `today` is the word.
    expect(field(model, "today")).toMatchObject({
      type: "date",
      value: "today",
      quick: [
        { label: "Today", value: "today" },
        { label: "Off", value: "" },
      ],
    });
  });

  it("writes a statement of the look, and takes it away when it is emptied", () => {
    const canvas = open(ROADMAP);
    expect((canvas.write([], "axisFormat", "%b %Y") as { text: string }).text).toContain(
      'axisFormat "%b %Y"',
    );
    expect((canvas.write([], "ticks", "1w") as { text: string }).text).toContain("\n  ticks 1w\n");
    expect((canvas.write([], "weekStart", "sunday") as { text: string }).text).toContain(
      "weekStart sunday",
    );
    expect((canvas.write([], "axis", "both") as { text: string }).text).toContain("axis both");
    expect((canvas.write([], "labels", "column") as { text: string }).text).toContain(
      "labels column",
    );
    expect((canvas.write([], "display", "compact") as { text: string }).text).toContain(
      "display compact",
    );
    expect((canvas.write([], "dependencies", "hidden") as { text: string }).text).toContain(
      "dependencies hidden",
    );
    expect((canvas.write([], "dayWidth", 24) as { text: string }).text).toContain("dayWidth 24");
    const model = canvas.inspector();
    expect(field(model, "ticks").value).toBe("1w");
    expect(field(model, "axis").value).toBe("both");
    expect(field(model, "dayWidth").value).toBe(24);
    const cleared = canvas.write([], "ticks", null) as { text: string };
    expect(cleared.text).not.toContain("ticks 1w");
    expect((canvas.write([], "dayWidth", null) as { text: string }).text).not.toContain("dayWidth");
  });

  it("refuses a value the chart would not read, with what it takes", () => {
    const canvas = open(ROADMAP);
    expect(canvas.write([], "ticks", "7")).toMatchObject({
      refused: expect.stringContaining("`7`"),
    });
    expect(canvas.write([], "dayWidth", 0)).toMatchObject({
      refused: expect.stringContaining("1 to 100000"),
    });
    expect(canvas.write([], "axisFormat", "%d %Q")).toMatchObject({
      refused: expect.stringContaining("%Q"),
    });
    expect(canvas.write([], "today", "2026-02-30")).toEqual({
      refused: "`2026-02-30`: February 2026 has 28 days.",
    });
  });

  it("writes Today as the word, a date, or nothing", () => {
    const canvas = open(ROADMAP);
    const date = canvas.write([], "today", "2026-06-15") as { text: string };
    expect(date.text).toContain("\n  today 2026-06-15\n");
    expect(field(canvas.inspector(), "today").value).toBe("2026-06-15");
    const word = canvas.write([], "today", "today") as { text: string };
    expect(word.text).toMatch(/\n {2}today\n/);
    expect(field(canvas.inspector(), "today").value).toBe("today");
    const off = canvas.write([], "today", null) as { text: string };
    expect(off.text).not.toMatch(/\n {2}today/);
    expect(field(canvas.inspector(), "today")).toMatchObject({ value: null, placeholder: "off" });
  });

  it("toggles Friday on the excluded days, keeping the word for the weekend", () => {
    const canvas = open(ROADMAP);
    const toggled = toggleWeekday(
      parseDayList(String(field(canvas.inspector(), "exclude").value)),
      4,
    );
    expect(dayListText(toggled)).toBe("weekends, friday");
    const result = canvas.write([], "exclude", dayListText(toggled)) as { text: string };
    expect(result.text).toContain("\n  exclude weekends, friday\n");
    expect(field(canvas.inspector(), "exclude").value).toBe("weekends, friday");
    // Weekends turned off leaves Friday, spelled out where Saturday and Sunday were.
    const without = toggleWeekends(parseDayList("weekends, friday"));
    expect(dayListText(without)).toBe("friday");
    // Weekend days written one by one stay so when another day is added.
    const spelled = open(ROADMAP.replace("exclude weekends", "exclude saturday, sunday"));
    const next = toggleWeekday(
      parseDayList(String(field(spelled.inspector(), "exclude").value)),
      4,
    );
    expect(dayListText(next)).toBe("friday, saturday, sunday");
    const written = spelled.write([], "exclude", dayListText(next)) as { text: string };
    expect(written.text).toContain("\n  exclude friday, saturday, sunday\n");
    // Every bar is drawn again: tec0 starts Monday and its five working days now end on Monday.
    expect(field(open(written.text, ["tec0"]).inspector(), "ends").value).not.toBe(
      field(open(ROADMAP, ["tec0"]).inspector(), "ends").value,
    );
  });

  it("writes the excluded dates and the included ones, each list keeping the other", () => {
    const canvas = open(ROADMAP);
    const dates = withDates(parseDayList("weekends"), "2026-06-29, 2026-07-01");
    const excluded = canvas.write([], "exclude", dayListText(dates)) as { text: string };
    expect(excluded.text).toContain("exclude weekends, 2026-06-29, 2026-07-01");
    const included = canvas.write([], "include", "2026-06-06") as { text: string };
    expect(included.text).toContain("exclude weekends, 2026-06-29, 2026-07-01");
    expect(included.text).toContain("include 2026-06-06");
    expect(field(canvas.inspector(), "include").value).toBe("2026-06-06");
    // A date that does not exist is refused with the reason.
    expect(canvas.write([], "include", "2026-02-30")).toEqual({
      refused: "`2026-02-30`: February 2026 has 28 days.",
    });
    // Nothing excluded any more: the date worked despite it would be a working day already.
    expect(canvas.write([], "exclude", "")).toEqual({
      refused:
        "`2026-06-06` is a working day already; `include` is for dates that an exclusion covers.",
    });
    expect(canvas.text()).toContain("exclude weekends, 2026-06-29, 2026-07-01");
  });

  it("says its words in Spanish", () => {
    setLocale("es");
    const model = open(ROADMAP).inspector();
    expect(field(model, "axisFormat")).toMatchObject({
      label: "Formato del eje",
      heading: "Eje y aspecto",
    });
    expect(field(model, "exclude")).toMatchObject({
      label: "Días excluidos",
      heading: "Calendario",
    });
    expect(field(model, "weekStart").titles).toMatchObject({ monday: "lunes", sunday: "domingo" });
    expect(field(model, "labels").titles).toEqual({
      bar: "dentro de las barras",
      column: "en una columna",
    });
    expect(field(model, "dayWidth").quick).toEqual([{ label: "Automático", value: "" }]);
    expect(field(model, "today").quick).toEqual([
      { label: "Hoy", value: "today" },
      { label: "No", value: "" },
    ]);
  });
});
