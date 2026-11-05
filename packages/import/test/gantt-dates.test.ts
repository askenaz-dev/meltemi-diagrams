import { describe, expect, it } from "vitest";
import { axisFormatOf } from "../src/mermaid/gantt.js";
import {
  addDuration,
  formatByFormat,
  isoText,
  parseDateText,
  parseDuration,
  readEnd,
  readStart,
  replaySchedule,
  type Ms,
  type ReplaySettings,
  type ReplayTask,
  type Today,
} from "../src/mermaid/dates.js";

const today: Today = { year: 2026, month0: 9, day: 29 };
const iso = (ms: Ms | null): string | null => (ms === null ? null : isoText(ms));
const at = (text: string, format = "YYYY-MM-DD"): Ms => {
  const parsed = parseDateText(text, format, today, false);
  expect(parsed, `${text} in ${format}`).not.toBeNull();
  return parsed!.ms;
};

function settingsOf(options: Partial<ReplaySettings> = {}): ReplaySettings {
  return {
    format: "YYYY-MM-DD",
    excludes: [],
    includes: [],
    weekend: "saturday",
    inclusiveEndDates: false,
    today,
    ...options,
  };
}

const TAGS = ["active", "done", "crit", "milestone", "vert"];

/** Tasks from the data strings of Mermaid's `addTask`: `[tags,] [id,] [start,] end`. */
function tasksOf(settings: ReplaySettings, data: string[]): ReplayTask[] {
  let autos = 0;
  let prev: string | undefined;
  return data.map((row) => {
    const fields = row.split(",");
    while (fields.length > 0 && TAGS.includes(fields[0]!.trim())) fields.shift();
    const parts = fields.map((f) => f.trim());
    const id = parts.length === 3 ? parts[0]! : `task${++autos}`;
    const start = parts.length >= 2 ? parts[parts.length - 2]! : null;
    const task: ReplayTask = {
      id,
      prevId: prev,
      start: start === null ? { kind: "previous" } : readStart(start, settings),
      end: readEnd(parts[parts.length - 1]!, settings),
    };
    prev = id;
    return task;
  });
}

/** The start, the end and the end Mermaid draws of each row, as dates. */
function replayed(settings: ReplaySettings, data: string[]) {
  return replaySchedule(tasksOf(settings, data), settings).map((r) => [
    iso(r.start),
    iso(r.end),
    iso(r.renderEnd),
  ]);
}

describe("dates in the formats of dayjs", () => {
  it.each([
    ["2026-06-01", "YYYY-MM-DD", "2026-06-01"],
    ["01/06/2026", "DD/MM/YYYY", "2026-06-01"],
    ["1/6/2026", "D/M/YYYY", "2026-06-01"],
    ["06-01-26", "MM-DD-YY", "2026-06-01"],
    ["Jun 1, 2026", "MMM D, YYYY", "2026-06-01"],
    ["June 1st, 2026", "MMMM Do, YYYY", "2026-06-01"],
    ["22nd June 2026", "Do MMMM YYYY", "2026-06-22"],
    ["2026-06-01 09:30", "YYYY-MM-DD HH:mm", "2026-06-01T09:30"],
    ["2026-06-01T21:05:09", "YYYY-MM-DD[T]HH:mm:ss", "2026-06-01T21:05:09"],
    ["1 Jun 2026 9:30 pm", "D MMM YYYY h:mm a", "2026-06-01T21:30"],
    ["12:00 AM 2026-06-01", "hh:mm A YYYY-MM-DD", "2026-06-01"],
    ["2026-Q3", "YYYY-[Q]Q", "2026-07-01"],
    ["2026-06", "YYYY-MM", "2026-06-01"],
    ["2026", "YYYY", "2026-01-01"],
    ["20260601", "YYYYMMDD", "2026-06-01"],
    ["2026-152", "YYYY-DDD", "2026-06-01"],
    ["2026-152", "YYYY-DDDD", "2026-06-01"],
  ])("reads %s with %s", (text, format, expected) => {
    expect(isoText(at(text, format))).toBe(expected);
  });

  it("fills in what a format leaves out from the day of the import", () => {
    expect(isoText(at("14:30", "HH:mm"))).toBe("2026-10-29T14:30");
    expect(isoText(at("06-15", "MM-DD"))).toBe("2026-06-15");
    expect(isoText(at("15", "D"))).toBe("2026-10-15");
  });

  it.each([
    ["2026-13-45", "YYYY-MM-DD"],
    ["2026-02-30", "YYYY-MM-DD"],
    ["31/04/2026", "DD/MM/YYYY"],
    ["2026-6-1", "YYYY-MM-DD"],
    ["01/06/2026", "YYYY-MM-DD"],
    ["Jun 1 2026", "MMM D, YYYY"],
    ["1th", "Do"],
    ["25:00", "HH:mm"],
    ["13 pm", "h a"],
    ["tomorrow", "YYYY-MM-DD"],
    ["", "YYYY-MM-DD"],
  ])("refuses %s in %s, as strict mode does", (text, format) => {
    expect(parseDateText(text, format, today, false)).toBeNull();
  });

  it("falls back to ISO 8601 for a start, as new Date does, dropping the zone", () => {
    const parsed = parseDateText("2026-06-01T10:00:00Z", "DD/MM/YYYY", today, true);
    expect(parsed).toMatchObject({ zone: true, fraction: false });
    expect(isoText(parsed!.ms)).toBe("2026-06-01T10:00");
    expect(parseDateText("2026-06-01", "DD/MM/YYYY", today, false)).toBeNull();
    expect(parseDateText("2026-02-30", "DD/MM/YYYY", today, true)).toBeNull();
  });

  it("reads a zone and a fraction of a second, and says so", () => {
    const zoned = parseDateText("2026-06-01 10:00 +02:00", "YYYY-MM-DD HH:mm Z", today, false);
    expect(zoned).toMatchObject({ zone: true, fraction: false });
    expect(isoText(zoned!.ms)).toBe("2026-06-01T10:00");
    const fraction = parseDateText("10:00:01.250", "HH:mm:ss.SSS", today, false);
    expect(fraction).toMatchObject({ zone: false, fraction: true });
  });

  it("reads Unix timestamps", () => {
    expect(parseDateText("0", "x", today, false)).toMatchObject({ ms: 0, zone: true });
    expect(parseDateText("1780000000", "X", today, false)!.ms).toBe(1_780_000_000_000);
    expect(parseDateText("1.5", "x", today, false)).toBeNull();
    expect(parseDateText("99999999999999999999", "x", today, false)).toBeNull();
  });

  it("formats an instant back with the same tokens", () => {
    const ms = at("2026-06-01 21:05:09.007".replace(".007", ""), "YYYY-MM-DD HH:mm:ss");
    expect(formatByFormat(ms, "D/M/YY h:mm:ss A")).toBe("1/6/26 9:05:09 PM");
    expect(formatByFormat(ms, "dddd, [the] Do of MMMM")).toBe("dddd, the 1st of June");
    expect(formatByFormat(at("2026-06-22"), "Do")).toBe("22nd");
    expect(formatByFormat(at("2026-06-23"), "Do")).toBe("23rd");
    expect(formatByFormat(at("2026-06-11"), "Do")).toBe("11th");
  });
});

describe("durations as dayjs adds them", () => {
  it("reads a number and a unit, `M` being months and `m` minutes", () => {
    expect(parseDuration("10d")).toEqual({ amount: 10, unit: "d" });
    expect(parseDuration(" 1.5h ")).toEqual({ amount: 1.5, unit: "h" });
    expect(parseDuration("500ms")).toEqual({ amount: 500, unit: "ms" });
    expect(parseDuration("2M")).toEqual({ amount: 2, unit: "M" });
    expect(parseDuration("2m")).toEqual({ amount: 2, unit: "m" });
    for (const bad of ["", "d", "5 d", "5D", "-5d", "1.d", "5days", "2026-06-01"]) {
      expect(parseDuration(bad), bad).toBeNull();
    }
  });

  it("rounds days and weeks, truncates months and years, and keeps the rest exact", () => {
    const start = at("2026-01-31");
    expect(isoText(addDuration(start, { amount: 1.5, unit: "d" }))).toBe("2026-02-02");
    expect(isoText(addDuration(start, { amount: 1.5, unit: "w" }))).toBe("2026-02-11");
    expect(isoText(addDuration(start, { amount: 1, unit: "M" }))).toBe("2026-02-28");
    expect(isoText(addDuration(start, { amount: 1.9, unit: "M" }))).toBe("2026-02-28");
    expect(isoText(addDuration(start, { amount: 0.5, unit: "M" }))).toBe("2026-01-31");
    expect(isoText(addDuration(at("2024-02-29"), { amount: 1, unit: "y" }))).toBe("2025-02-28");
    expect(isoText(addDuration(start, { amount: 36, unit: "h" }))).toBe("2026-02-01T12:00");
    expect(isoText(addDuration(start, { amount: 90, unit: "m" }))).toBe("2026-01-31T01:30");
    expect(addDuration(0, { amount: 0.005, unit: "s" })).toBe(5);
  });
});

describe("Mermaid's schedule", () => {
  it("is the one of the owner's roadmap", () => {
    const settings = settingsOf({ excludes: ["weekends"] });
    expect(
      replayed(settings, [
        "tec0, 2026-06-01, 5d",
        "tec1, after tec0, 10d",
        "tec2, after tec1, 1d",
        "flu0, 2026-06-15, 3d",
        "flu1, after flu0, 10d",
        "flu2, after flu1, 10d",
        "flu3, after flu2, 10d",
        "sdlc0, 2026-07-01, 30d",
        "sdlc1, 2026-08-03, 5d",
        "sdlc2, after sdlc1, 15d",
      ]),
    ).toEqual([
      ["2026-06-01", "2026-06-08", "2026-06-06"],
      ["2026-06-08", "2026-06-22", "2026-06-20"],
      ["2026-06-22", "2026-06-23", "2026-06-23"],
      ["2026-06-15", "2026-06-18", "2026-06-18"],
      ["2026-06-18", "2026-07-02", "2026-07-02"],
      ["2026-07-02", "2026-07-16", "2026-07-16"],
      ["2026-07-16", "2026-07-30", "2026-07-30"],
      ["2026-07-01", "2026-08-12", "2026-08-12"],
      ["2026-08-03", "2026-08-10", "2026-08-08"],
      ["2026-08-10", "2026-08-31", "2026-08-29"],
    ]);
  });

  it("ignores weekends, a date and Fridays as Mermaid's own tests say", () => {
    const settings = settingsOf({ excludes: ["weekends", "2019-02-06", "friday"] });
    expect(
      replayed(settings, [
        "id1,2019-02-01,1d",
        "id2,after id1,2d",
        "id3,after id2,7d",
        "id4,2019-02-01,2019-02-20",
        "id5,after id4,1d",
        "id6,2019-02-13,2d",
        "id7,after id6,1d",
      ]).map(([start, end, render]) => [start, end, render]),
    ).toEqual([
      ["2019-02-01", "2019-02-04", "2019-02-02"],
      ["2019-02-04", "2019-02-07", "2019-02-06"],
      ["2019-02-07", "2019-02-20", "2019-02-20"],
      ["2019-02-01", "2019-02-20", null],
      ["2019-02-20", "2019-02-21", "2019-02-21"],
      ["2019-02-13", "2019-02-18", "2019-02-15"],
      ["2019-02-18", "2019-02-19", "2019-02-19"],
    ]);
  });

  it("starts the weekend on Friday when told to", () => {
    const settings = settingsOf({ excludes: ["weekends"], weekend: "friday" });
    expect(replayed(settings, ["id1,2024-02-28, 3d"])[0]![1]).toBe("2024-03-04");
  });

  it("includes a date that an exclusion covers, whichever the format", () => {
    const settings = settingsOf({ excludes: ["weekends"], includes: ["2026-06-06"] });
    // Saturday 6 June works, Sunday does not: two days from Friday 5 June are Friday and Saturday,
    // and the next task starts on Monday.
    expect(replayed(settings, ["a,2026-06-05,2d"])[0]).toEqual([
      "2026-06-05",
      "2026-06-08",
      "2026-06-07",
    ]);
    const formatted = settingsOf({
      format: "DD/MM/YYYY",
      excludes: ["weekends", "25/12/2026"],
      includes: [],
    });
    // Friday 25 December 2026 is excluded by its date, in the format of the chart: two days from
    // Wednesday 23 December are Wednesday and Thursday, and the next task starts on Monday 28th.
    expect(replayed(formatted, ["a,23/12/2026,2d"])[0]).toEqual([
      "2026-12-23",
      "2026-12-28",
      "2026-12-25",
    ]);
  });

  it("ends an inclusive end date a day later", () => {
    const settings = settingsOf({ inclusiveEndDates: true });
    expect(replayed(settings, ["id1,2019-02-01,1d", "id2,2019-02-01,2019-02-03"])).toEqual([
      ["2019-02-01", "2019-02-02", null],
      ["2019-02-01", "2019-02-04", null],
    ]);
  });

  it("follows the end of one task or the latest of several, wherever they are", () => {
    const settings = settingsOf();
    expect(
      replayed(settings, [
        "id1,2013-01-01,2w",
        "id2,after id3,1d",
        "id3,after id1,2d",
        "id4,after id1 id3 id2,1d",
        "id5,after nobody,1d",
      ]).map(([start, end]) => [start, end]),
    ).toEqual([
      ["2013-01-01", "2013-01-15"],
      ["2013-01-17", "2013-01-18"],
      ["2013-01-15", "2013-01-17"],
      ["2013-01-18", "2013-01-19"],
      ["2026-10-29", "2026-10-30"],
    ]);
  });

  it("takes a task without a start from the end of the one before, and a date as its end", () => {
    const settings = settingsOf();
    expect(
      replayed(settings, ["id1,2013-01-01,2w", "2013-01-26", "2d", "after id1,1d"]).map(
        ([start, end]) => [start, end],
      ),
    ).toEqual([
      ["2013-01-01", "2013-01-15"],
      ["2013-01-15", "2013-01-26"],
      ["2013-01-26", "2013-01-28"],
      ["2013-01-15", "2013-01-16"],
    ]);
  });

  it("ends at the earliest start of what it is until", () => {
    const settings = settingsOf();
    expect(
      replayed(settings, [
        "id1,2013-01-01,until id3",
        "id2,2013-01-10,until id3",
        "id3,2013-02-01,2d",
        "id4,2013-01-01,until id5 id6 id7",
        "id5,2013-01-11,1d",
        "id6,2013-02-10,1d",
        "id7,2013-02-12,1d",
      ]).map(([start, end]) => [start, end]),
    ).toEqual([
      ["2013-01-01", "2013-02-01"],
      ["2013-01-10", "2013-02-01"],
      ["2013-02-01", "2013-02-03"],
      ["2013-01-01", "2013-01-11"],
      ["2013-01-11", "2013-01-12"],
      ["2013-02-10", "2013-02-11"],
      ["2013-02-12", "2013-02-13"],
    ]);
  });

  it("counts milliseconds in the format x", () => {
    const settings = settingsOf({ format: "x" });
    const rows = replaySchedule(
      tasksOf(settings, ["id1,0,20ms", "id2,after id1,5ms", "id3,20,10ms", "id4,after id3,0.005s"]),
      settings,
    );
    expect(rows.map((r) => [r.start, r.end])).toEqual([
      [0, 20],
      [20, 25],
      [20, 30],
      [30, 35],
    ]);
  });

  it("keeps the hours of a task, which excluded days do not split", () => {
    const settings = settingsOf();
    expect(
      replayed(settings, [
        "done, des1, 2014-01-06,2014-01-08",
        "active, des2, 2014-01-09, 3d",
        "des3, after des2, 5d",
        "crit, done, 2014-01-06,24h",
        "crit, done, after des1, 2d",
        "active, a1, after des1, 3d",
        "after a1  , 20h",
        "doc1, after a1  , 48h",
        "after doc1, 3d",
        "20h",
        "48h",
      ]).map(([start, end]) => [start, end]),
    ).toEqual([
      ["2014-01-06", "2014-01-08"],
      ["2014-01-09", "2014-01-12"],
      ["2014-01-12", "2014-01-17"],
      ["2014-01-06", "2014-01-07"],
      ["2014-01-08", "2014-01-10"],
      ["2014-01-08", "2014-01-11"],
      ["2014-01-11", "2014-01-11T20:00"],
      ["2014-01-11", "2014-01-13"],
      ["2014-01-13", "2014-01-16"],
      ["2014-01-16", "2014-01-16T20:00"],
      ["2014-01-16T20:00", "2014-01-18T20:00"],
    ]);
  });

  it("gives a task it cannot read no end, and a zero end to a duration it cannot read", () => {
    const settings = settingsOf();
    const rows = replaySchedule(
      tasksOf(settings, [
        "a,2026-13-45,2d",
        "b,after a,1d",
        "c,2026-06-01,soon",
        "d,2026-06-01,0d",
      ]),
      settings,
    );
    expect(rows[0]).toEqual({ start: null, end: null, renderEnd: null });
    expect(rows[1]).toEqual({ start: null, end: null, renderEnd: null });
    expect(rows[2]!.start).toBe(rows[2]!.end);
    expect(rows[3]!.start).toBe(rows[3]!.end);
  });

  it("dates nothing that follows itself, or that follows nothing", () => {
    const settings = settingsOf();
    const loop = replaySchedule(
      tasksOf(settings, ["a,after b,1d", "b,after a,1d", "c,2026-06-01,1d"]),
      settings,
    );
    expect(loop.map((r) => r.start)).toEqual([null, null, at("2026-06-01")]);
    // The first task without a start has no task before it: Mermaid throws.
    expect(replaySchedule(tasksOf(settings, ["3d"]), settings)[0]!.start).toBeNull();
  });

  it("never settles an end when every day is excluded", () => {
    const settings = settingsOf({
      excludes: ["weekends", "monday", "tuesday", "wednesday", "thursday", "friday"],
    });
    expect(replayed(settings, ["id1,2019-02-01,7d"])[0]).toEqual(["2019-02-01", null, null]);
    const spared = settingsOf({
      excludes: ["weekends", "monday", "tuesday", "wednesday", "thursday"],
    });
    expect(replayed(spared, ["id1,2019-02-01,7d"])[0]![1]).not.toBeNull();
  });

  it("does not walk a task of centuries", () => {
    const settings = settingsOf({ excludes: ["weekends"] });
    const rows = replaySchedule(tasksOf(settings, ["a,2026-06-01,9999y"]), settings);
    expect(rows[0]!.end).toBeNull();
  });
});

describe("the axis format", () => {
  it.each([
    ["%d %b", "%d %b", []],
    ["%Y-%m-%d", "%Y-%m-%d", []],
    ["%-d %B %Y", "%-d %B %Y", []],
    ["%c", "%-m/%-d/%Y, %-I:%M:%S %p", []],
    ["%x", "%-m/%-d/%Y", []],
    ["%X", "%-I:%M:%S %p", []],
    ["%H:%M:%S.%L", "%H:%M:%S.", ["%L"]],
    ["%d %b %Z", "%d %b ", ["%Z"]],
    ["%u %g %G %s %Q %f", "     ", ["%u", "%g", "%G", "%s", "%Q", "%f"]],
    ["%_d/%0e/%_m", "%e/%d/%m", ["%_m"]],
    ["%E and %h", "E and h", []],
    ["100%%", "100%%", []],
    ["%d%", "%d", []],
  ])("writes %s as %s", (source, expected, dropped) => {
    expect(axisFormatOf(source)).toEqual({ format: expected, dropped });
  });
});
