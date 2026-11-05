/**
 * Civil calendar arithmetic for gantt charts (decision 0066). An instant is the count of seconds
 * since 1970-01-01T00:00 of the proleptic Gregorian calendar, in civil time: no zone and no
 * daylight saving, so a chart reads the same on every machine. All arithmetic is integer.
 *
 * Weekdays are numbered from Monday: 0 is Monday and 6 is Sunday.
 */

/** Seconds since 1970-01-01T00:00, civil. */
export type CivilTime = number;

export const SECONDS_PER_DAY = 86_400;

/** How far working time is searched for before a calendar is taken to have none, in days. */
const HORIZON_DAYS = 36_600;

/** The weekday of 1970-01-01, a Thursday, counted from Monday. */
const EPOCH_WEEKDAY = 3;

const floorDiv = (a: number, b: number): number => Math.floor(a / b);
const mod = (a: number, b: number): number => ((a % b) + b) % b;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** The day number (days since 1970-01-01) of a civil date. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = floorDiv(y, 400);
  const yoe = y - era * 400;
  const doy = floorDiv(153 * (month + (month > 2 ? -3 : 9)) + 2, 5) + day - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** The civil date of a day number. */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = floorDiv(z, 146_097);
  const doe = z - era * 146_097;
  const yoe = floorDiv(
    doe - floorDiv(doe, 1460) + floorDiv(doe, 36_524) - floorDiv(doe, 146_096),
    365,
  );
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const day = doy - floorDiv(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** What is wrong with a date that does not exist, for messages. */
export type DateProblem =
  | { readonly kind: "format" }
  | { readonly kind: "month"; readonly month: number }
  | {
      readonly kind: "day";
      readonly year: number;
      readonly month: number;
      readonly day: number;
      readonly daysInMonth: number;
    }
  | { readonly kind: "hour"; readonly hour: number }
  | { readonly kind: "minute"; readonly minute: number }
  | { readonly kind: "second"; readonly second: number };

export type ParsedDate =
  | { readonly ok: true; readonly time: CivilTime; readonly hasTime: boolean }
  | { readonly ok: false; readonly problem: DateProblem };

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Reads `2026-06-01` (the start of that day) or `2026-06-01T09:30[:15]`. A date that has the form
 * but no day in the calendar says why: `2026-02-30` has no 30th in a February of 28 days.
 */
export function parseDate(text: string): ParsedDate {
  const match = DATE_TEXT.exec(text);
  if (!match) return { ok: false, problem: { kind: "format" } };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return { ok: false, problem: { kind: "month", month } };
  const days = daysInMonth(year, month);
  if (day < 1 || day > days) {
    return { ok: false, problem: { kind: "day", year, month, day, daysInMonth: days } };
  }
  const hasTime = match[4] !== undefined;
  const hour = hasTime ? Number(match[4]) : 0;
  const minute = hasTime ? Number(match[5]) : 0;
  const second = match[6] !== undefined ? Number(match[6]) : 0;
  if (hour > 23) return { ok: false, problem: { kind: "hour", hour } };
  if (minute > 59) return { ok: false, problem: { kind: "minute", minute } };
  if (second > 59) return { ok: false, problem: { kind: "second", second } };
  const time =
    daysFromCivil(year, month, day) * SECONDS_PER_DAY + hour * 3600 + minute * 60 + second;
  return { ok: true, time, hasTime };
}

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** The date of a day number as `2026-06-01`. */
export function formatDay(days: number): string {
  const { year, month, day } = civilFromDays(days);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * An instant as ISO 8601 text without a zone: `2026-06-01T09:30`, with the seconds when it has
 * any, or `2026-06-01` alone with `withTime` false.
 */
export function formatDate(time: CivilTime, withTime = true): string {
  const days = floorDiv(time, SECONDS_PER_DAY);
  const date = formatDay(days);
  if (!withTime) return date;
  const seconds = time - days * SECONDS_PER_DAY;
  const hours = floorDiv(seconds, 3600);
  const minutes = floorDiv(seconds - hours * 3600, 60);
  const rest = seconds - hours * 3600 - minutes * 60;
  return `${date}T${pad(hours, 2)}:${pad(minutes, 2)}${rest === 0 ? "" : `:${pad(rest, 2)}`}`;
}

/** The day number an instant falls on. */
export function dayNumber(time: CivilTime): number {
  return floorDiv(time, SECONDS_PER_DAY);
}

/** The midnight that starts the day of an instant. */
export function startOfDay(time: CivilTime): CivilTime {
  return dayNumber(time) * SECONDS_PER_DAY;
}

/** The midnight that ends the day of an instant: `to 2026-06-05` ends at 2026-06-06T00:00. */
export function endOfDay(time: CivilTime): CivilTime {
  return (dayNumber(time) + 1) * SECONDS_PER_DAY;
}

/** The weekday of a day number, from Monday (0) to Sunday (6). */
export function weekdayOfDay(days: number): number {
  return mod(days + EPOCH_WEEKDAY, 7);
}

/** The weekday of an instant, from Monday (0) to Sunday (6). */
export function weekday(time: CivilTime): number {
  return weekdayOfDay(dayNumber(time));
}

/** The days of the week that do not work, and the dates that do or do not despite them. */
export interface WorkingCalendar {
  /** Index 0 is Monday. */
  readonly weekdayExcluded: readonly boolean[];
  /** Day numbers excluded by date. */
  readonly excludedDays: ReadonlySet<number>;
  /** Day numbers worked despite the exclusions. */
  readonly includedDays: ReadonlySet<number>;
}

/** A calendar where every day works. */
export const EVERY_DAY: WorkingCalendar = {
  weekdayExcluded: [false, false, false, false, false, false, false],
  excludedDays: new Set(),
  includedDays: new Set(),
};

/** The day number of a `YYYY-MM-DD` text, or undefined when it is no date of the calendar. */
export function dayOfDate(text: string): number | undefined {
  const parsed = parseDate(text);
  return parsed.ok ? dayNumber(parsed.time) : undefined;
}

/** A calendar from the weekdays (0 is Monday) and the `YYYY-MM-DD` dates a chart writes. */
export function workingCalendar(
  excludedWeekdays: readonly number[],
  excludedDates: readonly string[],
  includedDates: readonly string[],
): WorkingCalendar {
  const days = (dates: readonly string[]): Set<number> => {
    const set = new Set<number>();
    for (const date of dates) {
      const day = dayOfDate(date);
      if (day !== undefined) set.add(day);
    }
    return set;
  };
  return {
    weekdayExcluded: Array.from({ length: 7 }, (_, i) => excludedWeekdays.includes(i)),
    excludedDays: days(excludedDates),
    includedDays: days(includedDates),
  };
}

/** Whether a day number is a working day: an included date, or one no exclusion covers. */
export function isWorkingDay(day: number, calendar: WorkingCalendar): boolean {
  if (calendar.includedDays.has(day)) return true;
  if (calendar.excludedDays.has(day)) return false;
  return !calendar.weekdayExcluded[weekdayOfDay(day)];
}

/** The working days of a week: seven less the weekdays excluded. */
export function workingDaysPerWeek(calendar: WorkingCalendar): number {
  return calendar.weekdayExcluded.filter((excluded) => !excluded).length;
}

/**
 * The instant itself when it falls on a working day, else the start of the next working day; null
 * when the calendar has no working day within a century.
 */
export function nextWorking(time: CivilTime, calendar: WorkingCalendar): CivilTime | null {
  let day = dayNumber(time);
  if (isWorkingDay(day, calendar)) return time;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    day++;
    if (isWorkingDay(day, calendar)) return day * SECONDS_PER_DAY;
  }
  return null;
}

/**
 * The instant `seconds` of working time after `start`: excluded days contribute nothing, and an
 * end that falls exactly where a working day ends stays there (the end of a Friday is Saturday
 * 00:00). Null when the calendar has too little working time within a century.
 */
export function addWorking(
  start: CivilTime,
  seconds: number,
  calendar: WorkingCalendar,
): CivilTime | null {
  let time = nextWorking(start, calendar);
  if (time === null) return null;
  let remaining = seconds;
  for (let guard = 0; guard < HORIZON_DAYS * 2; guard++) {
    const day = dayNumber(time);
    const dayEnd = (day + 1) * SECONDS_PER_DAY;
    if (isWorkingDay(day, calendar)) {
      const available = dayEnd - time;
      if (remaining <= available) return time + remaining;
      remaining -= available;
    }
    time = dayEnd;
  }
  return null;
}

/** The seconds of working time in `[from, to)`. */
export function workingBetween(from: CivilTime, to: CivilTime, calendar: WorkingCalendar): number {
  if (to <= from) return 0;
  let total = 0;
  const last = dayNumber(to - 1);
  for (let day = dayNumber(from); day <= last; day++) {
    if (!isWorkingDay(day, calendar)) continue;
    const begin = Math.max(from, day * SECONDS_PER_DAY);
    const end = Math.min(to, (day + 1) * SECONDS_PER_DAY);
    total += end - begin;
  }
  return total;
}

/** The seconds a duration unit stands for: a week is the working days of a week under a calendar. */
export function unitSeconds(
  unit: "s" | "min" | "h" | "d" | "w",
  calendar: WorkingCalendar,
): number {
  switch (unit) {
    case "s":
      return 1;
    case "min":
      return 60;
    case "h":
      return 3600;
    case "d":
      return SECONDS_PER_DAY;
    case "w":
      return workingDaysPerWeek(calendar) * SECONDS_PER_DAY;
  }
}
