import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import * as model from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  CanvasSession,
  isCanvasMessage,
  type CanvasAction,
  type CanvasRender,
  type HostMessage,
} from "../src/index.js";
import * as mirror from "../src/canvas/timeline.js";

const ROADMAP = readFileSync(join(CORPUS_ROOT, "valid/gantt/roadmap.meltemi"), "utf8");
const TODAY = "2026-10-29";

/** The instant of a date or a date and time, as the model counts them. */
function at(text: string): number {
  const parsed = model.parseDate(text);
  if (!parsed.ok) throw new Error(`Not a date: ${text}`);
  return parsed.time;
}

/**
 * A session on a text as a host runs it: each plan is applied and analysed as the next revision, and
 * the messages of the last answer or update are kept.
 */
function open(text: string, selection: readonly string[] = []) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  const analyze = () => analyzeDocument({ text: current, revision: rev, layout: { today: TODAY } });
  let messages: readonly HostMessage[] = session.update(analyze());
  if (selection.length > 0) session.receive({ type: "select", ids: [...selection] });
  const act = (action: CanvasAction) => session.receive({ type: "action", revision: rev, action });
  const apply = (action: CanvasAction): string => {
    const result = act(action);
    if (!result.plan) {
      const said = result.messages.map((m) => (m.type === "rejected" ? m.reason : m.type));
      throw new Error(`Nothing was planned: ${JSON.stringify(said)}`);
    }
    current = applyTextEdits(current, result.plan.edits);
    rev++;
    messages = session.update(analyze());
    return current;
  };
  return {
    session,
    act,
    apply,
    text: () => current,
    messages: () => messages,
    render: () => messages.find((m): m is HostMessage & { type: "render" } => m.type === "render")!,
  };
}

const lineOf = (text: string, id: string): string =>
  text
    .split("\n")
    .find((line) => new RegExp(`^\\s*(task|milestone|marker|section) ${id}\\b`).test(line)) ?? "";

/** The ids of the statements of a block, in the order they are written. */
const order = (text: string): string[] =>
  [...text.matchAll(/^\s*(?:task|milestone|marker|section) (\w+)/gm)].map((m) => m[1]!);

const rejected = (messages: readonly HostMessage[]) =>
  messages.find((m): m is HostMessage & { type: "rejected" } => m.type === "rejected");

describe("what a chart gives the canvas", () => {
  it("carries the timeline, its calendar and the schedule of every bar", () => {
    const canvas = open(ROADMAP);
    const render: CanvasRender = canvas.render();
    expect(render.profile).toBe("gantt");
    const timeline = render.timeline!;
    expect(timeline.start).toBe(at("2026-06-01"));
    expect(timeline.end).toBe(at("2026-08-31"));
    expect(timeline.weekStart).toBe(0);
    expect(timeline.calendar.weekdays).toEqual([false, false, false, false, false, true, true]);
    expect(timeline.dayWidth).toBeGreaterThan(5);
    const tec1 = render.elements.find((e) => e.id === "tec1")!;
    expect(tec1.kind).toBe("task");
    expect(tec1.task).toMatchObject({
      start: at("2026-06-08"),
      end: at("2026-06-20"),
      clauses: {
        from: null,
        after: ["tec0"],
        end: { kind: "for", amount: 10, unit: "d" },
        status: null,
        critical: false,
      },
      // tec0 ends on the Saturday: tec1 may not start before the next working time.
      floor: at("2026-06-08"),
    });
    expect(tec1.task!.row!.index).toBe(1);
    const tec0 = render.elements.find((e) => e.id === "tec0")!;
    expect(tec0.task!.floor).toBeNull();
    expect(render.elements.find((e) => e.id === "tecnologia")!.task).toBeUndefined();
  });

  it("places a bar on the timeline where its dates say", () => {
    const render = open(ROADMAP).render();
    const { timeline } = render;
    const tec1 = render.elements.find((e) => e.id === "tec1")!;
    const x = mirror.xOfInstant(timeline!, tec1.task!.start);
    expect(x).toBeCloseTo(tec1.box.x, 1);
    expect(mirror.instantAt(timeline!, tec1.box.x + tec1.box.width)).toBeCloseTo(tec1.task!.end, 0);
  });
});

describe("where the inline editor types a label", () => {
  it("lies over the label as it is drawn: beside a bar, inside it, or in a section's column", () => {
    const render = open(ROADMAP).render();
    const timeline = render.timeline!;
    const place = (id: string) => {
      const element = render.elements.find((e) => e.id === id)!;
      return { box: element.box, text: element.text! };
    };
    // A section's title is typed in its column, not across the timeline that its band spans.
    const section = place("tecnologia").text;
    expect(section.area.x).toBe(16);
    expect(section.area.x + section.area.width).toBeLessThanOrEqual(timeline.x);
    expect(section.align).toBe("left");
    // A short bar has its label beside it, to the right of its end...
    const tec0 = place("tec0");
    expect(tec0.text.anchor.x).toBeGreaterThan(tec0.box.x + tec0.box.width);
    expect(tec0.text.align).toBe("left");
    // ... and the last bar of the chart, against the right edge, to the left of its start.
    const last = place("sdlc2");
    expect(last.text.anchor.x).toBeLessThan(last.box.x);
    expect(last.text.align).toBe("right");
    // A label whose bar is long enough sits inside it, centred, in the colour of text on a bar.
    const wide = render.elements
      .filter((e) => e.kind === "task" && e.text !== undefined)
      .find((e) => e.text!.align === "center");
    expect(wide).toBeDefined();
    expect(wide!.text!.anchor.x).toBeGreaterThan(wide!.box.x);
    expect(wide!.text!.anchor.x).toBeLessThan(wide!.box.x + wide!.box.width);
    // The editor types over every one in the font and size of the drawing.
    for (const element of render.elements) {
      if (element.text === undefined) continue;
      expect(element.text.size, element.id).toBeGreaterThan(8);
      expect(element.text.font, element.id).toContain("Inter");
    }
  });
});

describe("the mirror of the model's calendar", () => {
  it("counts days, weekdays and working time as the model does", () => {
    const calendars = [
      model.workingCalendar([5, 6], [], []),
      model.workingCalendar([4, 5, 6], ["2026-06-03", "2026-12-24"], []),
      model.workingCalendar([5, 6], ["2026-06-03"], ["2026-06-06"]),
      model.workingCalendar([], [], []),
    ];
    const toMirror = (c: model.WorkingCalendar): mirror.TimelineCalendar => ({
      weekdays: c.weekdayExcluded,
      excluded: [...c.excludedDays],
      included: [...c.includedDays],
    });
    for (let seed = 0; seed < 400; seed++) {
      const day = -20_000 + seed * 137;
      const time = day * model.SECONDS_PER_DAY + ((seed * 7919) % 86_400);
      expect(mirror.civilFromDays(day)).toEqual(model.civilFromDays(day));
      expect(mirror.weekdayOfDay(day)).toBe(model.weekdayOfDay(day));
      expect(mirror.formatDay(day)).toBe(model.formatDay(day));
      expect(mirror.formatInstant(time)).toBe(model.formatDate(time, time % 86_400 !== 0));
      const { year, month, day: d } = model.civilFromDays(day);
      expect(mirror.daysFromCivil(year, month, d)).toBe(day);
      for (const calendar of calendars) {
        const m = toMirror(calendar);
        expect(mirror.isWorkingDay(day, m)).toBe(model.isWorkingDay(day, calendar));
        expect(mirror.nextWorking(time, m)).toBe(model.nextWorking(time, calendar) ?? time);
        const later = time + ((seed * 104_729) % 3_000_000);
        expect(mirror.workingBetween(time, later, m)).toBe(
          model.workingBetween(time, later, calendar),
        );
      }
    }
  });

  it("snaps to the smallest step that is six pixels wide, and to the week's start", () => {
    // A day 100 px wide: 15 minutes are 1 px, an hour 4 px, a day 100 px.
    expect(mirror.snapStep(100)).toBe(86_400);
    expect(mirror.snapStep(300)).toBe(3_600);
    expect(mirror.snapStep(2_000)).toBe(900);
    expect(mirror.snapStep(10)).toBe(86_400);
    expect(mirror.snapStep(5)).toBe(604_800);
    // Phase kept for a move, the grid for a place.
    const nine = at("2026-06-01T09:30");
    expect(mirror.snapFrom(nine, nine + 90_000, 86_400)).toBe(nine + 86_400);
    expect(mirror.snapAt(at("2026-06-03T15:00"), 86_400, 0)).toBe(at("2026-06-04"));
    expect(mirror.snapAt(at("2026-06-04T15:00"), 604_800, 0)).toBe(at("2026-06-08"));
    expect(mirror.snapAt(at("2026-06-04T15:00"), 604_800, 6)).toBe(at("2026-06-07"));
  });

  it("reads and writes the lists of excluded days", () => {
    const list = mirror.parseDayList("weekends, friday, 2026-06-29, 2026-06-03");
    expect(list.weekendsWord).toBe(true);
    expect(mirror.dayListText(list)).toBe("weekends, friday, 2026-06-03, 2026-06-29");
    expect(mirror.dayListText(mirror.toggleWeekday(list, 4))).toBe(
      "weekends, 2026-06-03, 2026-06-29",
    );
    // Taking Saturday out spells the word `weekends` out.
    expect(mirror.dayListText(mirror.toggleWeekday(list, 5))).toBe(
      "friday, sunday, 2026-06-03, 2026-06-29",
    );
    expect(mirror.dayListText(mirror.toggleWeekends(mirror.parseDayList("saturday")))).toBe(
      "weekends",
    );
    expect(mirror.dayListText(mirror.toggleWeekends(list))).toBe("friday, 2026-06-03, 2026-06-29");
  });
});

describe("bars given other dates", () => {
  it("moves a dependent bar later: from beside after, and what follows moves with it", () => {
    const canvas = open(ROADMAP);
    const text = canvas.apply({ kind: "schedule", task: "tec1", start: at("2026-06-15") });
    expect(lineOf(text, "tec1")).toContain("after tec0 from 2026-06-15 for 10d");
    const tec2 = canvas.render().elements.find((e) => e.id === "tec2")!;
    expect(tec2.task!.start).toBe(at("2026-06-29"));
  });

  it("sticks to the predecessor when dragged back onto it", () => {
    const canvas = open(ROADMAP);
    canvas.apply({ kind: "schedule", task: "tec1", start: at("2026-06-15") });
    const text = canvas.apply({ kind: "schedule", task: "tec1", start: at("2026-06-03") });
    expect(lineOf(text, "tec1")).toMatch(/after tec0 for 10d$/);
    expect(canvas.render().elements.find((e) => e.id === "tec1")!.task!.start).toBe(
      at("2026-06-08"),
    );
  });

  it("lands a start on a weekend on the next working day", () => {
    const text = open(ROADMAP).apply({ kind: "schedule", task: "tec1", start: at("2026-06-13") });
    expect(lineOf(text, "tec1")).toContain("from 2026-06-15");
  });

  it("writes the end as working days, in weeks when the clause was in weeks", () => {
    const canvas = open(ROADMAP);
    // The end of Tuesday 9 June, under `exclude weekends`: seven working days.
    const text = canvas.apply({ kind: "schedule", task: "tec0", end: at("2026-06-10") });
    expect(lineOf(text, "tec0")).toContain("for 7d");
    const weeks = open(
      ROADMAP.replace(
        'tec1 "Prueba de concepto con el equipo de Arquitectura" after tec0 for 10d',
        'tec1 "P" after tec0 for 2w',
      ),
    );
    expect(
      lineOf(weeks.apply({ kind: "schedule", task: "tec1", end: at("2026-06-27") }), "tec1"),
    ).toContain("for 3w");
    // Not whole weeks any more: days.
    expect(
      lineOf(weeks.apply({ kind: "schedule", task: "tec1", end: at("2026-06-24") }), "tec1"),
    ).toContain("for 12d");
  });

  it("writes hours and minutes under a day, and keeps `to` as a date", () => {
    const times = open(
      "diagram p: gantt {\n  task a from 2026-06-01T09:00 for 4h\n  task b from 2026-06-01 to 2026-06-05\n}\n",
    );
    expect(
      lineOf(times.apply({ kind: "schedule", task: "a", end: at("2026-06-01T15:00") }), "a"),
    ).toContain("for 6h");
    expect(
      lineOf(times.apply({ kind: "schedule", task: "a", end: at("2026-06-01T15:45") }), "a"),
    ).toContain("for 405min");
    // `to` is the last day, inclusive: the end of the 9th is `to 2026-06-09`.
    expect(
      lineOf(times.apply({ kind: "schedule", task: "b", end: at("2026-06-10") }), "b"),
    ).toContain("to 2026-06-09");
    // A bar moved with its `to` moves it too.
    expect(
      lineOf(times.apply({ kind: "schedule", task: "b", start: at("2026-06-08") }), "b"),
    ).toContain("from 2026-06-08 to 2026-06-16");
  });

  it("replaces `until` with `for` and says so", () => {
    const canvas = open(
      "diagram p: gantt {\n  task b from 2026-06-01 until c\n  task c from 2026-06-10 for 2d\n}\n",
    );
    const result = canvas.act({ kind: "schedule", task: "b", end: at("2026-06-04") });
    expect(result.plan).toBeDefined();
    const text = applyTextEdits(canvas.text(), result.plan!.edits);
    expect(lineOf(text, "b")).toContain("from 2026-06-01 for 3d");
    // The status line comes with the drawing of the edit.
    const after = open(text);
    expect(after.render().elements.find((e) => e.id === "b")!.task!.clauses.end).toEqual({
      kind: "for",
      amount: 3,
      unit: "d",
    });
  });

  it("leaves a bar one day long when its end is dragged before its start, and writes nothing", () => {
    const canvas = open(ROADMAP);
    const result = canvas.act({ kind: "schedule", task: "tec2", end: at("2026-06-19") });
    expect(result.plan).toBeUndefined();
    expect(result.messages.some((m) => m.type === "render")).toBe(true);
  });

  it("moves a milestone or a marker by its date alone, and refuses an end for them", () => {
    const canvas = open(
      "diagram p: gantt {\n  task a from 2026-06-01 for 5d\n  milestone m after a\n  marker freeze at 2026-06-10\n}\n",
    );
    expect(
      lineOf(canvas.apply({ kind: "schedule", task: "m", start: at("2026-06-15") }), "m"),
    ).toContain("at 2026-06-15");
    // A marker may mark any instant, a weekend included.
    expect(
      lineOf(canvas.apply({ kind: "schedule", task: "freeze", start: at("2026-06-13") }), "freeze"),
    ).toContain("at 2026-06-13");
    const refused = canvas.act({ kind: "schedule", task: "m", end: at("2026-06-20") });
    expect(rejected(refused.messages)?.reason).toMatch(/milestone/);
  });

  it("moves several bars together without pinning the ones that follow each other", () => {
    const canvas = open(ROADMAP);
    const shift = 7 * 86_400;
    const text = canvas.apply({
      kind: "schedule",
      task: "tec0",
      start: at("2026-06-01") + shift,
      also: [
        { task: "tec1", start: at("2026-06-08") + shift },
        { task: "tec2", start: at("2026-06-22") + shift },
      ],
    });
    expect(lineOf(text, "tec0")).toContain("from 2026-06-08");
    expect(lineOf(text, "tec1")).toMatch(/after tec0 for 10d$/);
    expect(lineOf(text, "tec2")).toMatch(/after tec1 for 1d$/);
  });

  it("previews the drawing a drag would give, successors included", () => {
    const canvas = open(ROADMAP);
    const answer = canvas.act({
      kind: "preview",
      token: 5,
      action: { kind: "schedule", task: "tec1", start: at("2026-06-15") },
    });
    const preview = answer.messages[0] as HostMessage & { type: "preview" };
    expect(preview.token).toBe(5);
    expect(preview.svg).toContain("<svg");
    expect(preview.svg).not.toBe(canvas.render().svg);
    // A drop that writes nothing has no drawing.
    const same = canvas.act({
      kind: "preview",
      token: 6,
      action: { kind: "schedule", task: "tec1", start: at("2026-06-08") },
    });
    expect((same.messages[0] as HostMessage & { type: "preview" }).svg).toBeNull();
  });

  it("accepts the new messages and refuses the malformed ones", () => {
    const send = (action: unknown) => isCanvasMessage({ type: "action", revision: 1, action });
    expect(send({ kind: "schedule", task: "a", start: 1_780_000_000 })).toBe(true);
    expect(send({ kind: "schedule", task: "a", end: 1_780_000_000 })).toBe(true);
    expect(send({ kind: "schedule", task: "a" })).toBe(false);
    expect(send({ kind: "schedule", task: "a", start: 1.5 })).toBe(false);
    expect(send({ kind: "schedule", task: "a", start: 1, also: [{ task: "b" }] })).toBe(false);
    expect(send({ kind: "schedule", task: "a", start: 1, also: [{ task: "b", end: 5 }] })).toBe(
      true,
    );
    expect(send({ kind: "createDiagram", type: "gantt" })).toBe(true);
    expect(
      send({
        kind: "create",
        elementKind: "task",
        at: { x: 0, y: 0 },
        schedule: { start: 5, end: 9 },
      }),
    ).toBe(true);
    expect(
      send({
        kind: "create",
        elementKind: "task",
        at: { x: 0, y: 0 },
        schedule: { start: 9, end: 5 },
      }),
    ).toBe(false);
    expect(send({ kind: "move", ids: ["a"], parent: null, index: 2 })).toBe(true);
  });
});

describe("rows and sections", () => {
  it("drags a task into another section, its dates unchanged", () => {
    const canvas = open(ROADMAP);
    const text = canvas.apply({ kind: "move", ids: ["flu0"], parent: "i_d", index: 1 });
    expect(order(text).slice(-5)).toEqual(["i_d", "sdlc0", "flu0", "sdlc1", "sdlc2"]);
    const flu0 = canvas.render().elements.find((e) => e.id === "flu0")!;
    expect(flu0.parent).toBe("i_d");
    expect(flu0.task!.start).toBe(at("2026-06-15"));
  });

  it("moves a row up and down with Alt+Up and Alt+Down, into the next section at its edge", () => {
    const canvas = open(ROADMAP);
    const up = canvas.apply({ kind: "move", ids: ["flu0"], delta: { x: 0, y: -1 } });
    const inTecnologia = up.slice(up.indexOf("section tecnologia"), up.indexOf("section nuevo"));
    expect(order(inTecnologia)).toEqual(["tecnologia", "tec0", "tec1", "tec2", "flu0"]);
    expect(canvas.render().elements.find((e) => e.id === "flu0")!.parent).toBe("tecnologia");
    const down = canvas.apply({ kind: "move", ids: ["flu0"], delta: { x: 0, y: 1 } });
    expect(order(down)).toEqual(order(ROADMAP));
    // Within a section: one place down.
    const within = canvas.apply({ kind: "move", ids: ["tec0"], delta: { x: 0, y: 1 } });
    expect(order(within).slice(0, 4)).toEqual(["tecnologia", "tec1", "tec0", "tec2"]);
  });

  it("refuses to step past the first and the last row", () => {
    const canvas = open(ROADMAP);
    expect(
      rejected(canvas.act({ kind: "move", ids: ["tec0"], delta: { x: 0, y: -1 } }).messages)
        ?.reason,
    ).toMatch(/first row/);
    expect(
      rejected(canvas.act({ kind: "move", ids: ["sdlc2"], delta: { x: 0, y: 1 } }).messages)
        ?.reason,
    ).toMatch(/last row/);
    expect(
      rejected(canvas.act({ kind: "move", ids: ["tec0"], delta: { x: 12, y: 3 } }).messages)
        ?.reason,
    ).toMatch(/Drag a row/);
  });

  it("moves a section among the sections", () => {
    const canvas = open(ROADMAP);
    const text = canvas.apply({ kind: "move", ids: ["i_d"], parent: null, index: 0 });
    expect(
      order(text).filter((id) => ["tecnologia", "nuevo_flujo_genai_hub", "i_d"].includes(id)),
    ).toEqual(["i_d", "tecnologia", "nuevo_flujo_genai_hub"]);
    const down = canvas.apply({ kind: "move", ids: ["i_d"], delta: { x: 0, y: 1 } });
    expect(order(down)).toEqual(order(text).length === order(down).length ? order(down) : []);
  });

  it("refuses a drop that is a move by a delta on a section's position", () => {
    const canvas = open(ROADMAP);
    // `parent` and `index` go together: an index with no parent is not a place.
    const refused = canvas.act({ kind: "move", ids: ["tec0"], delta: { x: 0, y: 40 } });
    expect(rejected(refused.messages)).toBeDefined();
  });
});

describe("dependencies", () => {
  it("links two tasks: the source joins the target's after list", () => {
    const text = open(ROADMAP).apply({ kind: "connect", from: "tec2", to: "flu3", line: "solid" });
    expect(lineOf(text, "flu3")).toContain("after flu2, tec2 for 10d");
  });

  it("refuses a loop, naming the chain and flashing the target", () => {
    const canvas = open(ROADMAP);
    const result = canvas.act({ kind: "connect", from: "tec2", to: "tec0", line: "solid" });
    expect(result.plan).toBeUndefined();
    const message = rejected(result.messages)!;
    expect(message.flash).toEqual(["tec0"]);
    expect(message.reason).toContain("`tec0` already leads to `tec2`");
    expect(message.reason).toContain("`tec1`");
  });

  it("refuses a link that is written, a task after itself and a section", () => {
    const canvas = open(ROADMAP);
    const twice = rejected(
      canvas.act({ kind: "connect", from: "tec0", to: "tec1", line: "solid" }).messages,
    )!;
    expect(twice.reason).toMatch(/already comes after/);
    expect(twice.flash).toEqual(["tec1"]);
    expect(
      rejected(canvas.act({ kind: "connect", from: "tec1", to: "tec1", line: "solid" }).messages)
        ?.reason,
    ).toMatch(/after itself/);
    expect(
      rejected(
        canvas.act({ kind: "connect", from: "tecnologia", to: "flu0", line: "solid" }).messages,
      )?.reason,
    ).toMatch(/section/);
  });

  it("removes an arrow and pins the successor where it was when it was its last start clause", () => {
    const canvas = open(ROADMAP);
    const text = canvas.apply({ kind: "remove", ids: ["sdlc1->sdlc2#1"], cascade: false });
    expect(lineOf(text, "sdlc2")).toContain("from 2026-08-10 for 15d");
    expect(canvas.render().elements.find((e) => e.id === "sdlc2")!.task!.start).toBe(
      at("2026-08-10"),
    );
    // A successor with another start clause just loses the id.
    const several = open(
      "diagram p: gantt {\n  task a from 2026-06-01 for 2d\n  task b from 2026-06-01 for 4d\n  task c after a, b for 1d\n}\n",
    );
    expect(
      lineOf(several.apply({ kind: "remove", ids: ["a->c#1"], cascade: false }), "c"),
    ).toContain("after b for 1d");
  });

  it("removes a task and keeps the dates of what followed it", () => {
    const canvas = open(ROADMAP);
    const text = canvas.apply({ kind: "remove", ids: ["tec0"], cascade: false });
    expect(lineOf(text, "tec1")).toContain("from 2026-06-08 for 10d");
  });
});

describe("creating on a chart", () => {
  it("adds a task after the selected one, with the label of the interface language", () => {
    const canvas = open(ROADMAP, ["tec1"]);
    const text = canvas.apply({ kind: "create", elementKind: "task", at: { x: 0, y: 0 } });
    const lines = text.split("\n");
    const tec1 = lines.findIndex((line) => /task tec1 /.test(line));
    expect(lines[tec1 + 1]).toBe('    task task1 "Task" after tec1 for 1d');
    expect(lines[tec1 + 2]).toMatch(/task tec2 /);
    // The new task is selected and its editor opens once it is drawn.
    const select = canvas.messages().find((m) => m.type === "select");
    expect(select).toMatchObject({ type: "select", ids: ["task1"] });
  });

  it("adds a task at the end of the last section when nothing is selected", () => {
    const text = open(ROADMAP).apply({ kind: "create", elementKind: "task", at: { x: 0, y: 0 } });
    const lines = text.split("\n");
    const last = lines.findIndex((line) => /task sdlc2 /.test(line));
    expect(lines[last + 1]).toBe('    task task1 "Task" after sdlc2 for 1d');
    expect(lines[last + 2]).toBe("  }");
  });

  it("starts an empty chart from the host's day", () => {
    const canvas = open("diagram p: gantt {\n}\n");
    const text = canvas.apply({ kind: "create", elementKind: "task", at: { x: 0, y: 0 } });
    expect(text).toContain('task task1 "Task" from 2026-10-29 for 1d');
  });

  it("draws a task: from the press, for the dragged length, on the row under the press", () => {
    const canvas = open(ROADMAP);
    const sdlc1 = canvas.render().elements.find((e) => e.id === "sdlc1")!;
    const text = canvas.apply({
      kind: "create",
      elementKind: "task",
      at: { x: sdlc1.box.x, y: sdlc1.box.y + sdlc1.box.height / 2 },
      schedule: { start: at("2026-08-03"), end: at("2026-08-08") },
    });
    const lines = text.split("\n");
    const sdlc1Line = lines.findIndex((line) => /task sdlc1 /.test(line));
    expect(lines[sdlc1Line - 1]).toBe('    task task1 "Task" from 2026-08-03 for 5d');
  });

  it("adds a milestone after the selection and a marker at a date", () => {
    const canvas = open(ROADMAP, ["tec2"]);
    const text = canvas.apply({ kind: "create", elementKind: "milestone", at: { x: 0, y: 0 } });
    expect(text).toContain('milestone milestone1 "Milestone" after tec2');
    const marked = canvas.apply({
      kind: "create",
      elementKind: "marker",
      at: { x: 0, y: 0 },
      schedule: { start: at("2026-06-15") },
    });
    expect(marked).toContain('marker marker1 "Marker" at 2026-06-15');
    // Without a date: the start of the selected bar.
    const selected = open(ROADMAP, ["tec1"]).apply({
      kind: "create",
      elementKind: "marker",
      at: { x: 0, y: 0 },
    });
    expect(selected).toContain('marker marker1 "Marker" at 2026-06-08');
  });

  it("adds a section after the section of the selection", () => {
    const text = open(ROADMAP, ["flu1"]).apply({
      kind: "create",
      elementKind: "section",
      at: { x: 0, y: 0 },
    });
    expect(order(text).filter((id) => /section|tecnologia|nuevo|i_d/.test(id))).toEqual([
      "tecnologia",
      "nuevo_flujo_genai_hub",
      "section1",
      "i_d",
    ]);
  });

  it("puts the selected rows in a new section", () => {
    const canvas = open(ROADMAP, ["flu0", "flu1"]);
    const text = canvas.apply({ kind: "group", ids: ["flu0", "flu1"] });
    const section = text.slice(text.indexOf("section section1"), text.indexOf("section i_d"));
    expect(order(section)).toEqual(["section1", "flu0", "flu1"]);
    expect(canvas.render().elements.find((e) => e.id === "flu1")!.parent).toBe("section1");
    expect(canvas.render().selection).toEqual(["flu0", "flu1"]);
  });

  it("refuses to create on a chart with a loop, and to place what a chart does not hold", () => {
    const canvas = open(
      "diagram p: gantt {\n  task a from 2026-06-01 for 1d after b\n  task b after a for 1d\n}\n",
    );
    const refused = canvas.act({ kind: "create", elementKind: "task", at: { x: 0, y: 0 } });
    expect(refused.plan).toBeUndefined();
    expect(rejected(refused.messages)?.reason).toMatch(/Fix the problems/);
    const chart = open(ROADMAP);
    expect(
      rejected(chart.act({ kind: "create", elementKind: "node", at: { x: 0, y: 0 } }).messages)
        ?.reason,
    ).toMatch(/holds tasks, milestones, markers and sections/);
  });

  it("refuses the actions that place boxes, in words of its own", () => {
    const canvas = open(ROADMAP);
    const resize = canvas.act({
      kind: "resize",
      id: "tec0",
      box: { x: 0, y: 0, width: 50, height: 20 },
    });
    expect(rejected(resize.messages)?.reason).toMatch(/dates/);
    expect(rejected(canvas.act({ kind: "paste" }).messages)?.reason).toMatch(/into the editor/);
    expect(
      rejected(canvas.act({ kind: "align", ids: ["tec0", "tec1"], edge: "left" }).messages),
    ).toBeDefined();
  });
});
