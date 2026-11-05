import { describe, expect, it } from "vitest";
import {
  daysFromCivil,
  type ElementInfo,
  type TimelineCalendar,
} from "@meltemi/diagrams-editor/canvas";
import { dragSpan, dropsInPlace, rowDrop, spanText } from "../src/gantt.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const DAY = 86_400;
const at = (year: number, month: number, day: number, hours = 0, minutes = 0) =>
  daysFromCivil(year, month, day) * DAY + hours * 3600 + minutes * 60;
const WEEKENDS: TimelineCalendar = {
  weekdays: [false, false, false, false, false, true, true],
  excluded: [],
  included: [],
};

describe("the dates a drag gives a bar", () => {
  const tec1 = {
    part: "body",
    kind: "task",
    start: at(2026, 6, 8),
    end: at(2026, 6, 20),
    floor: at(2026, 6, 8),
  } as const;

  it("moves a bar by whole steps, keeping its working length", () => {
    // A week later, at a day's snap: ten working days from the Monday after.
    const moved = dragSpan(WEEKENDS, DAY, tec1, 7 * DAY + 3_000);
    expect(moved).toEqual({ start: at(2026, 6, 15), end: at(2026, 6, 27), stuck: false });
    // Over a weekend the bar lands on the Monday and its end follows in working time.
    const over = dragSpan(WEEKENDS, DAY, tec1, 5 * DAY);
    expect(over.start).toBe(at(2026, 6, 15));
  });

  it("sticks to what it follows when dragged back past it", () => {
    const back = dragSpan(WEEKENDS, DAY, tec1, -9 * DAY);
    expect(back).toEqual({ start: at(2026, 6, 8), end: at(2026, 6, 20), stuck: true });
    // Without a dependency it goes where it is taken, landing on working time: Saturday is Monday.
    expect(dragSpan(WEEKENDS, DAY, { ...tec1, floor: null }, -9 * DAY).start).toBe(at(2026, 6, 1));
  });

  it("keeps the phase of a bar that starts in the middle of a day", () => {
    const timed = {
      part: "body",
      kind: "task",
      start: at(2026, 6, 1, 9, 30),
      end: at(2026, 6, 1, 17, 30),
      floor: null,
    } as const;
    const moved = dragSpan(WEEKENDS, 3600, timed, 2 * 3600 + 700);
    expect(moved.start).toBe(at(2026, 6, 1, 11, 30));
    expect(moved.end - moved.start).toBe(8 * 3600);
  });

  it("moves the right end alone and stops one step after the start", () => {
    const tec0 = {
      part: "end",
      kind: "task",
      start: at(2026, 6, 1),
      end: at(2026, 6, 6),
      floor: null,
    } as const;
    expect(dragSpan(WEEKENDS, DAY, tec0, 4 * DAY + 100).end).toBe(at(2026, 6, 10));
    // Past the start: one snap after it, one day.
    expect(dragSpan(WEEKENDS, DAY, tec0, -30 * DAY)).toEqual({
      start: at(2026, 6, 1),
      end: at(2026, 6, 2),
      stuck: false,
    });
  });

  it("moves the left end with the end where it is, and not before what it follows", () => {
    const grip = {
      part: "start",
      kind: "task",
      start: at(2026, 6, 8),
      end: at(2026, 6, 20),
      floor: at(2026, 6, 8),
    } as const;
    expect(dragSpan(WEEKENDS, DAY, grip, 3 * DAY)).toEqual({
      start: at(2026, 6, 11),
      end: at(2026, 6, 20),
      stuck: false,
    });
    expect(dragSpan(WEEKENDS, DAY, grip, -5 * DAY).stuck).toBe(true);
    // Never past its own end.
    expect(dragSpan(WEEKENDS, DAY, grip, 30 * DAY).start).toBeLessThan(at(2026, 6, 20));
  });

  it("moves a diamond and a marker by their date alone; a marker may stand on a weekend", () => {
    const diamond = {
      part: "body",
      kind: "milestone",
      start: at(2026, 6, 19),
      end: at(2026, 6, 19),
      floor: null,
    } as const;
    expect(dragSpan(WEEKENDS, DAY, diamond, DAY + 5)).toEqual({
      start: at(2026, 6, 22),
      end: at(2026, 6, 22),
      stuck: false,
    });
    const marker = { ...diamond, kind: "marker" } as const;
    expect(dragSpan(WEEKENDS, DAY, marker, DAY).start).toBe(at(2026, 6, 20));
  });
});

describe("the tooltip of a bar", () => {
  it("says the first and the last day and the working days, in both languages", () => {
    const span = { start: at(2026, 6, 1), end: at(2026, 6, 10) };
    const grip = { kind: "task" } as const;
    expect(spanText(en.gantt, WEEKENDS, grip, span)).toBe("1 Jun → 9 Jun · 7 working days");
    expect(spanText(es.gantt, WEEKENDS, grip, span)).toBe("1 jun → 9 jun · 7 días hábiles");
  });

  it("says hours and times for a bar that does not run from midnight to midnight", () => {
    const span = { start: at(2026, 6, 1, 9, 30), end: at(2026, 6, 1, 13, 30) };
    expect(spanText(en.gantt, WEEKENDS, { kind: "task" }, span)).toBe(
      "1 Jun 09:30 → 1 Jun 13:30 · 4 working hours",
    );
  });

  it("says the day of a diamond or a line alone", () => {
    const point = { start: at(2026, 6, 19), end: at(2026, 6, 19) };
    expect(spanText(en.gantt, WEEKENDS, { kind: "milestone" }, point)).toBe("19 Jun");
  });
});

/** A chart of two sections and a row before them, as the session sends it. */
function chart(): ElementInfo[] {
  const bar = (id: string, parent: string | null, y: number, kind: ElementInfo["kind"] = "task") =>
    ({
      id,
      kind,
      parent,
      box: { x: 100, y: y + 4, width: 40, height: 24 },
      task: {
        start: 0,
        end: 1,
        clauses: { from: null, after: [], end: null, status: null, critical: false },
        row: { index: 0, y, height: 32 },
        floor: null,
      },
    }) as unknown as ElementInfo;
  const section = (id: string, y: number, height: number) =>
    ({
      id,
      kind: "section",
      parent: null,
      box: { x: 0, y, width: 600, height },
    }) as unknown as ElementInfo;
  return [
    section("one", 0, 80),
    bar("a", "one", 4),
    bar("b", "one", 36),
    section("two", 80, 48),
    bar("c", "two", 84),
  ];
}

describe("where a row is dropped", () => {
  const across = { from: 6, to: 594 };

  it("takes the gap between rows nearest to the pointer", () => {
    const elements = chart();
    expect(rowDrop(elements, 36, false, across)).toMatchObject({ parent: "one", index: 1, y: 36 });
    expect(rowDrop(elements, 5, false, across)).toMatchObject({ parent: "one", index: 0, y: 4 });
    expect(rowDrop(elements, 90, false, across)).toMatchObject({ parent: "two", index: 0 });
  });

  it("goes to the end of a section at its last row's foot, and into another section", () => {
    const elements = chart();
    expect(rowDrop(elements, 68, false, across)).toMatchObject({ parent: "one", index: 2, y: 68 });
    expect(rowDrop(elements, 118, false, across)).toMatchObject({ parent: "two", index: 1 });
  });

  it("drops nowhere when the pointer is not over the rows", () => {
    const elements = chart();
    expect(rowDrop(elements, -40, false, across)).toBeUndefined();
    expect(rowDrop(elements, 200, false, across)).toBeUndefined();
  });

  it("takes a section to the gaps between sections", () => {
    const elements = chart();
    const drop = rowDrop(elements, 90, true, across)!;
    expect(drop).toMatchObject({ parent: null, index: 1, y: 80 });
    expect(rowDrop(elements, 130, true, across)).toMatchObject({ parent: null, index: 2 });
  });

  it("knows a row dropped beside itself leaves things as they are", () => {
    const elements = chart();
    expect(dropsInPlace(elements, ["b"], { parent: "one", index: 1, y: 36, from: 0, to: 0 })).toBe(
      true,
    );
    expect(dropsInPlace(elements, ["b"], { parent: "one", index: 2, y: 68, from: 0, to: 0 })).toBe(
      true,
    );
    expect(dropsInPlace(elements, ["b"], { parent: "one", index: 0, y: 4, from: 0, to: 0 })).toBe(
      false,
    );
    expect(dropsInPlace(elements, ["b"], { parent: "two", index: 0, y: 84, from: 0, to: 0 })).toBe(
      false,
    );
  });
});
