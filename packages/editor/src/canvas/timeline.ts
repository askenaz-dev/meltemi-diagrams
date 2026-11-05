/**
 * The time arithmetic the canvas does for gantt charts: instants, working time, snapping and the
 * lists of days of a calendar. An instant is a count of seconds since 1970-01-01T00:00 of the
 * proleptic Gregorian calendar, in civil time (no zone, no daylight saving), as the model's
 * `calendar` module counts them. This module mirrors the little of it that the canvas needs, so
 * that the canvas page does not load the model; a test pins the two together.
 */

export const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY;

/** The days of the week, from Monday (0), as a chart writes them. */
export const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

/**
 * The calendar of a chart as the canvas receives it: which weekdays do not work (index 0 is
 * Monday), the days excluded by date and the days worked despite the exclusions, as day numbers
 * (days since 1970-01-01).
 */
export interface TimelineCalendar {
  readonly weekdays: readonly boolean[];
  readonly excluded: readonly number[];
  readonly included: readonly number[];
}

/**
 * Where the timeline of a gantt chart is, in diagram coordinates, and the calendar its instants
 * are counted in: `x` is the left edge, which `start` is at; `end` is at `x` plus `dayWidth` for
 * each day between; `weekStart` is the first day of a week, 0 being Monday.
 */
export interface TimelineInfo {
  readonly x: number;
  readonly start: number;
  readonly end: number;
  readonly dayWidth: number;
  readonly weekStart: number;
  readonly calendar: TimelineCalendar;
}

const floorDiv = (a: number, b: number): number => Math.floor(a / b);
const mod = (a: number, b: number): number => ((a % b) + b) % b;

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

/** The day number an instant falls on. */
export function dayNumber(time: number): number {
  return floorDiv(time, SECONDS_PER_DAY);
}

/** The weekday of a day number, from Monday (0) to Sunday (6); 1970-01-01 was a Thursday. */
export function weekdayOfDay(days: number): number {
  return mod(days + 3, 7);
}

/** The weekday of an instant, from Monday (0) to Sunday (6). */
export function weekdayOf(time: number): number {
  return weekdayOfDay(dayNumber(time));
}

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** The date of a day number as `2026-06-01`. */
export function formatDay(days: number): string {
  const { year, month, day } = civilFromDays(days);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** An instant as the language writes it: the day alone at midnight, else with the time. */
export function formatInstant(time: number): string {
  const days = dayNumber(time);
  const seconds = time - days * SECONDS_PER_DAY;
  if (seconds === 0) return formatDay(days);
  const hours = floorDiv(seconds, 3600);
  const minutes = floorDiv(seconds - hours * 3600, 60);
  const rest = seconds - hours * 3600 - minutes * 60;
  return `${formatDay(days)}T${pad(hours, 2)}:${pad(minutes, 2)}${rest === 0 ? "" : `:${pad(rest, 2)}`}`;
}

/** Whether a day number is a working day: an included date, or one no exclusion covers. */
export function isWorkingDay(day: number, calendar: TimelineCalendar): boolean {
  if (calendar.included.includes(day)) return true;
  if (calendar.excluded.includes(day)) return false;
  return !calendar.weekdays[weekdayOfDay(day)];
}

/** How far working time is searched for before a calendar is taken to have none, in days. */
const HORIZON_DAYS = 36_600;

/**
 * The instant itself when it falls on a working day, else the start of the next working day; the
 * instant itself when the calendar has no working day within a century.
 */
export function nextWorking(time: number, calendar: TimelineCalendar): number {
  let day = dayNumber(time);
  if (isWorkingDay(day, calendar)) return time;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    day++;
    if (isWorkingDay(day, calendar)) return day * SECONDS_PER_DAY;
  }
  return time;
}

/** The working days of a week: seven less the weekdays excluded. */
export function workingDaysPerWeek(calendar: TimelineCalendar): number {
  return calendar.weekdays.filter((excluded) => !excluded).length;
}

/**
 * The instant `seconds` of working time after `start`: excluded days contribute nothing, and an
 * end that falls exactly where a working day ends stays there (the end of a Friday is Saturday
 * 00:00). `start` itself when the calendar has too little working time within a century.
 */
export function addWorking(start: number, seconds: number, calendar: TimelineCalendar): number {
  let time = nextWorking(start, calendar);
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
  return start;
}

/**
 * `time` moved by one day in a direction, over the days that work: a Monday moved back lands on the
 * Friday before it under `exclude weekends`, with the same time of day.
 */
export function shiftWorking(time: number, direction: -1 | 1, calendar: TimelineCalendar): number {
  let moved = time;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    moved += direction * SECONDS_PER_DAY;
    if (isWorkingDay(dayNumber(moved), calendar)) return moved;
  }
  return time;
}

/** The seconds of working time in `[from, to)`. */
export function workingBetween(from: number, to: number, calendar: TimelineCalendar): number {
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

// ------------------------------------------------------------------------------------ snapping

/** The steps a bar snaps to, in seconds: 15 minutes, 1 hour, 1 day and 1 week. */
export const SNAPS: readonly number[] = [900, 3600, SECONDS_PER_DAY, SECONDS_PER_WEEK];

/** The least width, in screen pixels, a snap step must have to be the one in use. */
export const SNAP_PIXELS = 6;

/**
 * The step a drag snaps to at a zoom: the smallest of 15 minutes, 1 hour, 1 day and 1 week that
 * is at least `SNAP_PIXELS` wide on screen, a week when none is. `pixelsPerDay` is the width a day
 * takes on screen (the timeline's `dayWidth` times the zoom).
 */
export function snapStep(pixelsPerDay: number): number {
  const perSecond = pixelsPerDay / SECONDS_PER_DAY;
  return SNAPS.find((step) => step * perSecond >= SNAP_PIXELS) ?? SECONDS_PER_WEEK;
}

/**
 * `raw` rounded to a whole number of steps from `origin`, which keeps the phase of `origin`: a bar
 * that starts at 09:30 and is moved by a day still starts at 09:30.
 */
export function snapFrom(origin: number, raw: number, step: number): number {
  return origin + Math.round((raw - origin) / step) * step;
}

/**
 * An instant rounded to the grid of the step: quarters of an hour, hours, midnights, and for a
 * week the midnight that starts a week (`weekStart`, 0 being Monday) nearest to it.
 */
export function snapAt(raw: number, step: number, weekStart: number): number {
  if (step < SECONDS_PER_WEEK) return Math.round(raw / step) * step;
  const days = raw / SECONDS_PER_DAY;
  const day = Math.floor(days);
  const first = day - mod(weekdayOfDay(day) - weekStart, 7);
  return (days - first <= first + 7 - days ? first : first + 7) * SECONDS_PER_DAY;
}

/** The instant a diagram x is, on the timeline. */
export function instantAt(timeline: TimelineInfo, x: number): number {
  return timeline.start + ((x - timeline.x) / timeline.dayWidth) * SECONDS_PER_DAY;
}

/** The diagram x of an instant, on the timeline. */
export function xOfInstant(timeline: TimelineInfo, time: number): number {
  return timeline.x + ((time - timeline.start) / SECONDS_PER_DAY) * timeline.dayWidth;
}

// -------------------------------------------------------------------------------------- spans

/** What the tooltip of a bar shows of its dates. */
export interface SpanInfo {
  /** The first day the bar covers, as a day number, and the last one (inclusive). */
  readonly firstDay: number;
  readonly lastDay: number;
  /** Whether the start or the end falls off midnight, so that times are worth showing. */
  readonly timed: boolean;
  /** The seconds of working time between the start and the end. */
  readonly working: number;
}

/** The days a bar from `start` to `end` covers and its working time. */
export function spanOf(start: number, end: number, calendar: TimelineCalendar): SpanInfo {
  const timed = start % SECONDS_PER_DAY !== 0 || end % SECONDS_PER_DAY !== 0;
  return {
    firstDay: dayNumber(start),
    lastDay: dayNumber(Math.max(start, end - 1)),
    timed,
    working: workingBetween(start, end, calendar),
  };
}

// ---------------------------------------------------------------------------- lists of days

/**
 * The list of an `exclude` statement as the inspector's Excluded days field shows it: the weekdays
 * excluded (index 0 is Monday), whether Saturday and Sunday are written as the word `weekends`,
 * and the dates. An item that is no weekday and no `weekends` is kept among the dates, whatever it
 * is: the edit refuses what is no date, saying what the statement takes.
 */
export interface DayList {
  readonly weekdays: readonly boolean[];
  readonly weekendsWord: boolean;
  readonly dates: readonly string[];
}

/** Reads `weekends, friday, 2026-06-29`: names, the word `weekends` and dates, in any order. */
export function parseDayList(text: string): DayList {
  const weekdays = [false, false, false, false, false, false, false];
  let weekendsWord = false;
  const dates: string[] = [];
  for (const item of text.split(/[\s,]+/).filter((piece) => piece !== "")) {
    const word = item.toLowerCase();
    const day = (WEEKDAY_NAMES as readonly string[]).indexOf(word);
    if (word === "weekends") {
      weekendsWord = true;
      weekdays[5] = true;
      weekdays[6] = true;
    } else if (day >= 0) weekdays[day] = true;
    else if (!dates.includes(item)) dates.push(item);
  }
  return {
    weekdays,
    weekendsWord: weekendsWord && weekdays[5]! && weekdays[6]!,
    dates: dates.sort(),
  };
}

/**
 * The items of a list in the order a chart writes them: `weekends` (when the list says the word and
 * both days are in), the other weekdays from Monday, then the dates in order.
 */
export function dayItems(list: DayList): string[] {
  const words = list.weekendsWord && list.weekdays[5] === true && list.weekdays[6] === true;
  const items: string[] = [];
  if (words) items.push("weekends");
  WEEKDAY_NAMES.forEach((name, i) => {
    if (list.weekdays[i] && !(words && i >= 5)) items.push(name);
  });
  items.push(...[...list.dates].sort());
  return items;
}

/** The list as text, as the Excluded days field's value holds it. */
export function dayListText(list: DayList): string {
  return dayItems(list).join(", ");
}

/** The list with one weekday turned on or off; taking Saturday or Sunday out spells `weekends` out. */
export function toggleWeekday(list: DayList, weekday: number): DayList {
  const weekdays = list.weekdays.map((on, i) => (i === weekday ? !on : on));
  const word = list.weekendsWord && weekdays[5] === true && weekdays[6] === true;
  return { ...list, weekdays, weekendsWord: word };
}

/** The list with Saturday and Sunday both on, written `weekends`, or both off when they were on. */
export function toggleWeekends(list: DayList): DayList {
  const on = list.weekdays[5] === true && list.weekdays[6] === true;
  const weekdays = list.weekdays.map((value, i) => (i >= 5 ? !on : value));
  return { ...list, weekdays, weekendsWord: !on };
}

/** The list with its dates replaced by the dates written in `text` (the text field under the toggles). */
export function withDates(list: DayList, text: string): DayList {
  return { ...list, dates: parseDayList(text).dates };
}
