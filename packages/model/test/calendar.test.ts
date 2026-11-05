import { describe, expect, it } from "vitest";
import {
  EVERY_DAY,
  addWorking,
  civilFromDays,
  dayOfDate,
  daysFromCivil,
  endOfDay,
  formatDate,
  formatDay,
  isWorkingDay,
  nextWorking,
  parseDate,
  startOfDay,
  unitSeconds,
  weekday,
  workingBetween,
  workingCalendar,
  workingDaysPerWeek,
} from "../src/calendar.js";

const at = (text: string): number => {
  const parsed = parseDate(text);
  if (!parsed.ok) throw new Error(`not a date: ${text}`);
  return parsed.time;
};

/** Saturdays and Sundays (the weekdays are counted from Monday). */
const weekends = workingCalendar([5, 6], [], []);

describe("civil dates", () => {
  it("counts days from 1970-01-01 and back", () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(1969, 12, 31)).toBe(-1);
    expect(daysFromCivil(2000, 3, 1)).toBe(11_017);
    for (let days = -800_000; days <= 800_000; days += 997) {
      const { year, month, day } = civilFromDays(days);
      expect(daysFromCivil(year, month, day)).toBe(days);
    }
  });

  it("reads a day and an instant", () => {
    const day = parseDate("2026-06-01");
    expect(day).toMatchObject({ ok: true, hasTime: false });
    expect(formatDate(at("2026-06-01T09:30"))).toBe("2026-06-01T09:30");
    expect(formatDate(at("2026-06-01T09:30:15"))).toBe("2026-06-01T09:30:15");
    expect(formatDate(at("2026-06-01"))).toBe("2026-06-01T00:00");
    expect(formatDate(at("2026-06-01T09:30"), false)).toBe("2026-06-01");
    expect(at("2026-06-01T09:30") - at("2026-06-01")).toBe(9.5 * 3600);
    expect(formatDay(dayOfDate("2028-02-29")!)).toBe("2028-02-29");
  });

  it("says why a date does not exist", () => {
    expect(parseDate("2026-02-30")).toEqual({
      ok: false,
      problem: { kind: "day", year: 2026, month: 2, day: 30, daysInMonth: 28 },
    });
    expect(parseDate("2028-02-30")).toMatchObject({ problem: { daysInMonth: 29 } });
    expect(parseDate("2026-13-01")).toEqual({ ok: false, problem: { kind: "month", month: 13 } });
    expect(parseDate("2026-00-10")).toEqual({ ok: false, problem: { kind: "month", month: 0 } });
    expect(parseDate("2026-06-00")).toMatchObject({ problem: { kind: "day", daysInMonth: 30 } });
    expect(parseDate("2026-06-01T24:00")).toEqual({
      ok: false,
      problem: { kind: "hour", hour: 24 },
    });
    expect(parseDate("2026-06-01T09:60")).toEqual({
      ok: false,
      problem: { kind: "minute", minute: 60 },
    });
    expect(parseDate("2026-06-01T09:30:60")).toEqual({
      ok: false,
      problem: { kind: "second", second: 60 },
    });
    expect(parseDate("2026-6-1")).toEqual({ ok: false, problem: { kind: "format" } });
  });

  it("numbers the weekdays from Monday", () => {
    expect(weekday(at("2026-06-01"))).toBe(0);
    expect(weekday(at("2026-06-06"))).toBe(5);
    expect(weekday(at("2026-06-07T23:59"))).toBe(6);
    expect(weekday(at("1970-01-01"))).toBe(3);
    expect(weekday(at("2000-01-01"))).toBe(5);
    expect(weekday(at("1969-12-31"))).toBe(2);
  });

  it("finds the start and the end of a day", () => {
    expect(formatDate(startOfDay(at("2026-06-01T09:30")))).toBe("2026-06-01T00:00");
    expect(formatDate(endOfDay(at("2026-06-01T09:30")))).toBe("2026-06-02T00:00");
    expect(formatDate(endOfDay(at("2026-06-01")))).toBe("2026-06-02T00:00");
  });
});

describe("durations and working time", () => {
  it("adds a leap day", () => {
    expect(formatDate(addWorking(at("2028-02-28"), 2 * 86_400, EVERY_DAY)!)).toBe(
      "2028-03-01T00:00",
    );
    expect(formatDate(addWorking(at("2026-02-28"), 2 * 86_400, EVERY_DAY)!)).toBe(
      "2026-03-02T00:00",
    );
  });

  it("adds hours and minutes with no exclusions", () => {
    expect(formatDate(addWorking(at("2026-06-01T09:00"), 1.5 * 3600, EVERY_DAY)!)).toBe(
      "2026-06-01T10:30",
    );
  });

  it("takes ten working days from a Monday", () => {
    const end = addWorking(at("2026-06-08"), 10 * 86_400, weekends)!;
    expect(formatDate(end)).toBe("2026-06-20T00:00");
    expect(workingBetween(at("2026-06-08"), end, weekends)).toBe(10 * 86_400);
  });

  it("takes two weeks as ten working days", () => {
    expect(workingDaysPerWeek(weekends)).toBe(5);
    expect(unitSeconds("w", weekends)).toBe(5 * 86_400);
    expect(unitSeconds("w", EVERY_DAY)).toBe(7 * 86_400);
    expect(
      formatDate(addWorking(at("2026-06-01"), 2 * unitSeconds("w", weekends), weekends)!),
    ).toBe("2026-06-13T00:00");
  });

  it("keeps a week of seven days when only dates are excluded", () => {
    const holidays = workingCalendar([], ["2026-06-03"], []);
    expect(unitSeconds("w", holidays)).toBe(7 * 86_400);
  });

  it("skips a holiday and works an included Saturday", () => {
    const calendar = workingCalendar([5, 6], ["2026-06-03"], ["2026-06-06"]);
    expect(isWorkingDay(dayOfDate("2026-06-03")!, calendar)).toBe(false);
    expect(isWorkingDay(dayOfDate("2026-06-06")!, calendar)).toBe(true);
    expect(isWorkingDay(dayOfDate("2026-06-07")!, calendar)).toBe(false);
    const end = addWorking(at("2026-06-01"), 5 * 86_400, calendar)!;
    expect(formatDate(end)).toBe("2026-06-07T00:00");
    expect(workingBetween(at("2026-06-01"), end, calendar)).toBe(5 * 86_400);
  });

  it("lets an included date win over the same excluded date", () => {
    const calendar = workingCalendar([], ["2026-06-03"], ["2026-06-03"]);
    expect(isWorkingDay(dayOfDate("2026-06-03")!, calendar)).toBe(true);
  });

  it("carries hours across a weekend", () => {
    expect(formatDate(addWorking(at("2026-06-05T18:00"), 12 * 3600, weekends)!)).toBe(
      "2026-06-08T06:00",
    );
  });

  it("moves a start on a weekend to Monday", () => {
    expect(formatDate(nextWorking(at("2026-06-06T12:00"), weekends)!)).toBe("2026-06-08T00:00");
    expect(formatDate(nextWorking(at("2026-06-05T12:00"), weekends)!)).toBe("2026-06-05T12:00");
    expect(formatDate(addWorking(at("2026-06-06"), 86_400, weekends)!)).toBe("2026-06-09T00:00");
  });

  it("counts the working time between two instants", () => {
    expect(workingBetween(at("2026-06-05T12:00"), at("2026-06-08T12:00"), weekends)).toBe(86_400);
    expect(workingBetween(at("2026-06-06"), at("2026-06-08"), weekends)).toBe(0);
    expect(workingBetween(at("2026-06-08"), at("2026-06-01"), weekends)).toBe(0);
  });

  it("finds no working time in a calendar that excludes every day", () => {
    const never = workingCalendar([0, 1, 2, 3, 4, 5, 6], [], []);
    expect(nextWorking(at("2026-06-01"), never)).toBeNull();
    expect(addWorking(at("2026-06-01"), 86_400, never)).toBeNull();
  });
});

describe("the owner's roadmap", () => {
  // Mermaid draws these dates (decision 0066, "The owner's source"); the chain below is the
  // schedule rules of "Schedule" written with the calendar functions alone.
  const days = (n: number) => n * 86_400;
  const schedule = (from: number, length: number): { start: string; last: string } => {
    const start = nextWorking(from, weekends)!;
    const end = addWorking(start, days(length), weekends)!;
    return {
      start: formatDay(Math.floor(start / 86_400)),
      last: formatDay(Math.floor((end - 1) / 86_400)),
    };
  };
  const after = (...ends: number[]) => Math.max(...ends);

  it("dates the ten tasks as Mermaid does", () => {
    const tec0 = at("2026-06-01");
    expect(schedule(tec0, 5)).toEqual({ start: "2026-06-01", last: "2026-06-05" });
    const tec0End = addWorking(tec0, days(5), weekends)!;
    expect(schedule(tec0End, 10)).toEqual({ start: "2026-06-08", last: "2026-06-19" });
    const tec1End = addWorking(nextWorking(tec0End, weekends)!, days(10), weekends)!;
    expect(schedule(tec1End, 1)).toEqual({ start: "2026-06-22", last: "2026-06-22" });

    const flu0 = at("2026-06-15");
    expect(schedule(flu0, 3)).toEqual({ start: "2026-06-15", last: "2026-06-17" });
    let end = addWorking(flu0, days(3), weekends)!;
    const flu1 = schedule(end, 10);
    expect(flu1).toEqual({ start: "2026-06-18", last: "2026-07-01" });
    end = addWorking(nextWorking(end, weekends)!, days(10), weekends)!;
    expect(schedule(end, 10)).toEqual({ start: "2026-07-02", last: "2026-07-15" });
    end = addWorking(nextWorking(end, weekends)!, days(10), weekends)!;
    expect(schedule(end, 10)).toEqual({ start: "2026-07-16", last: "2026-07-29" });

    expect(schedule(at("2026-07-01"), 30)).toEqual({ start: "2026-07-01", last: "2026-08-11" });
    const sdlc1 = at("2026-08-03");
    expect(schedule(sdlc1, 5)).toEqual({ start: "2026-08-03", last: "2026-08-07" });
    const sdlc1End = addWorking(sdlc1, days(5), weekends)!;
    expect(schedule(after(sdlc1End), 15)).toEqual({ start: "2026-08-10", last: "2026-08-28" });
  });
});
