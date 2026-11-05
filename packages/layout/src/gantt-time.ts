import {
  SECONDS_PER_DAY,
  civilFromDays,
  dayNumber,
  daysFromCivil,
  weekdayOfDay,
  type CivilTime,
  type TickUnit,
} from "@meltemi/diagrams-model";

/** An interval of the axis: `n` units, as `ticks 2w` writes it. */
export interface TickSpec {
  readonly n: number;
  readonly unit: TickUnit;
}

/** The words a time format needs, in the content language. Weekdays count from Monday. */
export interface TimeWords {
  readonly months: readonly string[];
  readonly monthsShort: readonly string[];
  readonly weekdays: readonly string[];
  readonly weekdaysShort: readonly string[];
}

const spec = (n: number, unit: TickUnit): TickSpec => ({ n, unit });

/**
 * The intervals an automatic axis chooses from, the smallest whose ticks hold their widest label
 * first (decision 0066, D9).
 */
export const TICK_LADDER: readonly TickSpec[] = [
  spec(1, "s"),
  spec(5, "s"),
  spec(15, "s"),
  spec(30, "s"),
  spec(1, "min"),
  spec(5, "min"),
  spec(15, "min"),
  spec(30, "min"),
  spec(1, "h"),
  spec(3, "h"),
  spec(6, "h"),
  spec(12, "h"),
  spec(1, "d"),
  spec(2, "d"),
  spec(1, "w"),
  spec(2, "w"),
  spec(1, "mo"),
  spec(3, "mo"),
  spec(6, "mo"),
  spec(1, "y"),
  spec(2, "y"),
  spec(5, "y"),
  spec(10, "y"),
];

const TICK_TEXT = /^(\d+)(s|min|h|d|w|mo|y)$/;

/** The interval a `ticks` value writes (`1w`, `2mo`), or null for any other text. */
export function parseTicks(text: string): TickSpec | null {
  const match = TICK_TEXT.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? { n, unit: match[2] as TickUnit } : null;
}

/** The length of an interval in seconds; months and years by their mean length. */
export function tickSeconds(interval: TickSpec): number {
  const unit = {
    s: 1,
    min: 60,
    h: 3600,
    d: SECONDS_PER_DAY,
    w: 7 * SECONDS_PER_DAY,
    mo: 30.4375 * SECONDS_PER_DAY,
    y: 365.25 * SECONDS_PER_DAY,
  }[interval.unit];
  return unit * interval.n;
}

const floorTo = (value: number, step: number): number => Math.floor(value / step) * step;

/**
 * The tick at or before an instant: seconds, minutes, hours and days on multiples of the interval
 * since 1970, weeks on `weekStart` (0 being Monday), months on the 1st of a month whose number is
 * a multiple of the interval, years on 1 January of such a year.
 */
export function tickFloor(time: CivilTime, interval: TickSpec, weekStart: number): CivilTime {
  const { n, unit } = interval;
  switch (unit) {
    case "s":
      return floorTo(time, n);
    case "min":
      return floorTo(time, 60 * n);
    case "h":
      return floorTo(time, 3600 * n);
    case "d":
      return floorTo(dayNumber(time), n) * SECONDS_PER_DAY;
    case "w": {
      const day = dayNumber(time);
      return (day - ((weekdayOfDay(day) - weekStart + 7) % 7)) * SECONDS_PER_DAY;
    }
    case "mo": {
      const { year, month } = civilFromDays(dayNumber(time));
      const index = floorTo(year * 12 + (month - 1), n);
      return daysFromCivil(Math.floor(index / 12), (index % 12) + 1, 1) * SECONDS_PER_DAY;
    }
    case "y": {
      const { year } = civilFromDays(dayNumber(time));
      return daysFromCivil(floorTo(year, n), 1, 1) * SECONDS_PER_DAY;
    }
  }
}

/** The tick after a tick. */
export function tickNext(tick: CivilTime, interval: TickSpec): CivilTime {
  const { n, unit } = interval;
  switch (unit) {
    case "s":
      return tick + n;
    case "min":
      return tick + 60 * n;
    case "h":
      return tick + 3600 * n;
    case "d":
      return tick + n * SECONDS_PER_DAY;
    case "w":
      return tick + n * 7 * SECONDS_PER_DAY;
    case "mo": {
      const { year, month } = civilFromDays(dayNumber(tick));
      const index = year * 12 + (month - 1) + n;
      return daysFromCivil(Math.floor(index / 12), (index % 12) + 1, 1) * SECONDS_PER_DAY;
    }
    case "y": {
      const { year } = civilFromDays(dayNumber(tick));
      return daysFromCivil(year + n, 1, 1) * SECONDS_PER_DAY;
    }
  }
}

/**
 * The ticks that cover `[start, end]`: the first at or before `start` and the last at or after
 * `end`, so the span rounded to whole ticks is the first to the last.
 */
export function ticksCovering(
  start: CivilTime,
  end: CivilTime,
  interval: TickSpec,
  weekStart: number,
): CivilTime[] {
  const ticks = [tickFloor(start, interval, weekStart)];
  while (ticks[ticks.length - 1]! < end) ticks.push(tickNext(ticks[ticks.length - 1]!, interval));
  return ticks;
}

/** The format an axis uses when none is written: it follows the interval. */
export function defaultFormat(interval: TickSpec): string {
  if (interval.unit === "s") return "%H:%M:%S";
  const seconds = tickSeconds(interval);
  if (seconds < SECONDS_PER_DAY) return "%H:%M";
  if (seconds <= 14 * SECONDS_PER_DAY) return "%d %b";
  if (seconds <= 186 * SECONDS_PER_DAY) return "%b %Y";
  return "%Y";
}

/**
 * The finest tick a format tells apart, in seconds: `%b` names months, so ticks closer than a month
 * would repeat the same word. A format of text alone, or of years, tells years apart.
 */
export function formatGranularity(format: string): number {
  let finest = 365 * SECONDS_PER_DAY;
  const note = (seconds: number) => {
    finest = Math.min(finest, seconds);
  };
  for (let i = 0; i < format.length; i++) {
    if (format[i] !== "%") continue;
    let j = i + 1;
    if (format[j] === "-") j++;
    switch (format[j]) {
      case "S":
        note(1);
        break;
      case "M":
        note(60);
        break;
      case "H":
      case "I":
        note(3600);
        break;
      case "a":
      case "A":
      case "d":
      case "e":
      case "j":
      case "w":
        note(SECONDS_PER_DAY);
        break;
      case "U":
      case "V":
      case "W":
        note(7 * SECONDS_PER_DAY);
        break;
      case "b":
      case "B":
      case "m":
      case "q":
        note(28 * SECONDS_PER_DAY);
        break;
      default:
        break;
    }
    i = j;
  }
  return finest;
}

const pad = (value: number, width: number, fill = "0"): string =>
  String(value).padStart(width, fill);

/** The ISO 8601 week number and its year of a day. */
function isoWeek(days: number): number {
  const { year } = civilFromDays(days);
  const ordinal = days - daysFromCivil(year, 1, 1) + 1;
  const weekday = weekdayOfDay(days) + 1;
  const week = Math.floor((ordinal - weekday + 10) / 7);
  const weeksIn = (y: number): number => {
    const jan1 = weekdayOfDay(daysFromCivil(y, 1, 1)) + 1;
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
  };
  if (week < 1) return weeksIn(year - 1);
  if (week > weeksIn(year)) return 1;
  return week;
}

/**
 * An instant by a format of `%a %A %b %B %d %e %H %I %j %m %M %p %q %S %U %V %w %W %y %Y %%`, each
 * with an optional `-` that leaves out the padding (`%-d`), month and weekday names from `words`.
 */
export function formatTime(format: string, time: CivilTime, words: TimeWords): string {
  const days = dayNumber(time);
  const { year, month, day } = civilFromDays(days);
  const seconds = time - days * SECONDS_PER_DAY;
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds - hour * 3600) / 60);
  const second = seconds - hour * 3600 - minute * 60;
  const weekday = weekdayOfDay(days);
  const sunday = (weekday + 1) % 7;
  const yearDay = days - daysFromCivil(year, 1, 1);
  let out = "";
  for (let i = 0; i < format.length; i++) {
    if (format[i] !== "%") {
      out += format[i];
      continue;
    }
    let j = i + 1;
    const bare = format[j] === "-";
    if (bare) j++;
    const directive = format[j];
    if (directive === undefined) {
      out += format.slice(i);
      break;
    }
    const number = (value: number, width: number, fill = "0"): string =>
      bare ? String(value) : pad(value, width, fill);
    switch (directive) {
      case "a":
        out += words.weekdaysShort[weekday];
        break;
      case "A":
        out += words.weekdays[weekday];
        break;
      case "b":
        out += words.monthsShort[month - 1];
        break;
      case "B":
        out += words.months[month - 1];
        break;
      case "d":
        out += number(day, 2);
        break;
      case "e":
        out += number(day, 2, " ");
        break;
      case "H":
        out += number(hour, 2);
        break;
      case "I":
        out += number(hour % 12 === 0 ? 12 : hour % 12, 2);
        break;
      case "j":
        out += number(yearDay + 1, 3);
        break;
      case "m":
        out += number(month, 2);
        break;
      case "M":
        out += number(minute, 2);
        break;
      case "p":
        out += hour < 12 ? "AM" : "PM";
        break;
      case "q":
        out += String(Math.ceil(month / 3));
        break;
      case "S":
        out += number(second, 2);
        break;
      case "U":
        out += number(Math.floor((yearDay + 7 - sunday) / 7), 2);
        break;
      case "V":
        out += number(isoWeek(days), 2);
        break;
      case "w":
        out += String(sunday);
        break;
      case "W":
        out += number(Math.floor((yearDay + 7 - weekday) / 7), 2);
        break;
      case "y":
        out += number(((year % 100) + 100) % 100, 2);
        break;
      case "Y":
        out += pad(year, 4);
        break;
      case "%":
        out += "%";
        break;
      default:
        out += format.slice(i, j + 1);
    }
    i = j;
  }
  return out;
}
