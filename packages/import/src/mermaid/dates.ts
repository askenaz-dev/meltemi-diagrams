import {
  civilFromDays,
  dayOfDate,
  daysFromCivil,
  daysInMonth,
  formatDate,
  weekdayOfDay,
} from "@meltemi/diagrams-model";

/**
 * Dates and schedules as Mermaid's `gantt` has them. Mermaid reads dates with dayjs, adds
 * durations with it and pushes the end of a task past the days a chart excludes (`ganttDb.js`:
 * `getStartDate`, `getEndDate`, `checkTaskDates`, `fixTaskDates`, `isInvalidDate`); this module
 * replays that in civil time, with no zone and no daylight saving, so the importer can write the
 * dates Mermaid draws.
 */

/** Milliseconds since 1970-01-01T00:00:00.000, in civil time. */
export type Ms = number;

export const MS_PER_SECOND = 1000;
export const MS_PER_DAY = 86_400_000;

/** A day, as dayjs's `now` is used to fill in what a date format leaves out. */
export interface Today {
  readonly year: number;
  /** The month from 0, as JavaScript's `Date` counts it. */
  readonly month0: number;
  readonly day: number;
}

/** The import's day, from `YYYY-MM-DD`; undefined when the text is no date. */
export function readToday(text: string): Today | undefined {
  const day = dayOfDate(text);
  if (day === undefined) return undefined;
  const { year, month, day: of } = civilFromDays(day);
  return { year, month0: month - 1, day: of };
}

/** The midnight that starts a day. */
export function midnight(today: Today): Ms {
  return daysFromCivil(today.year, today.month0 + 1, today.day) * MS_PER_DAY;
}

/** `YYYY-MM-DD` of the day an instant falls on. */
export function dayText(ms: Ms): string {
  return formatDate(Math.floor(ms / MS_PER_DAY) * 86_400, false);
}

/**
 * An instant as the sheet writes it: `2026-06-01`, or `2026-06-01T09:30` (with seconds when it has
 * any) when it is not midnight. Fractions of a second are dropped.
 */
export function isoText(ms: Ms): string {
  const seconds = Math.floor(ms / MS_PER_SECOND);
  return formatDate(seconds, seconds % 86_400 !== 0);
}

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// ---------------------------------------------------------------------------------------------
// The date format: dayjs's tokens

type Token =
  | "YYYY"
  | "YY"
  | "Q"
  | "MMMM"
  | "MMM"
  | "MM"
  | "M"
  | "DDDD"
  | "DDD"
  | "DD"
  | "Do"
  | "D"
  | "HH"
  | "H"
  | "hh"
  | "h"
  | "mm"
  | "m"
  | "ss"
  | "s"
  | "SSS"
  | "SS"
  | "S"
  | "ZZ"
  | "Z"
  | "A"
  | "a";

/** The tokens, longest first, so that `MM` is not read as two `M`. */
const TOKENS: readonly Token[] = [
  "YYYY",
  "YY",
  "Q",
  "MMMM",
  "MMM",
  "MM",
  "M",
  "DDDD",
  "DDD",
  "DD",
  "Do",
  "D",
  "HH",
  "H",
  "hh",
  "h",
  "mm",
  "m",
  "ss",
  "s",
  "SSS",
  "SS",
  "S",
  "ZZ",
  "Z",
  "A",
  "a",
];

type Part = { readonly literal: string } | { readonly token: Token };

/** The format as tokens and the text between them; `[text]` is text, and so is any other letter. */
function tokenize(format: string): Part[] {
  const parts: Part[] = [];
  const text = (value: string) => {
    const last = parts[parts.length - 1];
    if (last && "literal" in last) parts[parts.length - 1] = { literal: last.literal + value };
    else parts.push({ literal: value });
  };
  let i = 0;
  while (i < format.length) {
    if (format[i] === "[") {
      const close = format.indexOf("]", i + 1);
      if (close > i) {
        text(format.slice(i + 1, close));
        i = close + 1;
        continue;
      }
    }
    const token = TOKENS.find((t) => format.startsWith(t, i));
    if (token) {
      parts.push({ token });
      i += token.length;
    } else {
      text(format[i]!);
      i++;
    }
  }
  return parts;
}

/** What each token reads from the text it stands for, anchored where the token begins. */
const PATTERNS: Readonly<Record<Token, RegExp>> = {
  YYYY: /^\d{4}/,
  YY: /^\d{2}/,
  Q: /^\d/,
  MMMM: /^[^-_:/,()\s\d]+/,
  MMM: /^[^-_:/,()\s\d]+/,
  MM: /^\d{2}/,
  M: /^\d{1,2}/,
  DDDD: /^\d{3}/,
  DDD: /^\d{1,3}/,
  DD: /^\d{2}/,
  Do: /^\d+[^-_:/,()\s\d]+/,
  D: /^\d{1,2}/,
  HH: /^\d{2}/,
  H: /^\d{1,2}/,
  hh: /^\d{2}/,
  h: /^\d{1,2}/,
  mm: /^\d{2}/,
  m: /^\d{1,2}/,
  ss: /^\d{2}/,
  s: /^\d{1,2}/,
  SSS: /^\d{3}/,
  SS: /^\d{2}/,
  S: /^\d/,
  ZZ: /^(?:[+-]\d{2}(?::?\d{2})?|Z)/,
  Z: /^(?:[+-]\d{2}(?::?\d{2})?|Z)/,
  A: /^[^-_:/,()\s\d]+/,
  a: /^[^-_:/,()\s\d]+/,
};

/** What a date text says, before dayjs fills in the rest. */
interface Fields {
  year?: number;
  month?: number;
  day?: number;
  dayOfYear?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
  afternoon?: boolean;
  zone?: string;
}

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

/** Reads a text token by token; null when it does not follow the format. */
function readFields(text: string, format: string): Fields | null {
  const fields: Fields = {};
  let at = 0;
  for (const part of tokenize(format)) {
    if ("literal" in part) {
      if (!text.startsWith(part.literal, at)) return null;
      at += part.literal.length;
      continue;
    }
    const match = PATTERNS[part.token].exec(text.slice(at));
    if (!match) return null;
    const value = match[0];
    at += value.length;
    const n = Number.parseInt(value, 10);
    switch (part.token) {
      case "YYYY":
        fields.year = n;
        break;
      case "YY":
        fields.year = n + (n > 68 ? 1900 : 2000);
        break;
      case "Q":
        fields.month = (n - 1) * 3 + 1;
        break;
      case "MMMM": {
        const index = MONTHS.indexOf(value as (typeof MONTHS)[number]);
        if (index < 0) return null;
        fields.month = index + 1;
        break;
      }
      case "MMM": {
        const index = MONTHS.findIndex((month) => month.slice(0, 3) === value);
        if (index < 0) return null;
        fields.month = index + 1;
        break;
      }
      case "MM":
      case "M":
        fields.month = n;
        break;
      case "DDDD":
      case "DDD":
        fields.dayOfYear = n;
        break;
      case "DD":
      case "D":
        fields.day = n;
        break;
      case "Do":
        fields.day = n;
        break;
      case "HH":
      case "H":
      case "hh":
      case "h":
        fields.hours = n;
        break;
      case "mm":
      case "m":
        fields.minutes = n;
        break;
      case "ss":
      case "s":
        fields.seconds = n;
        break;
      case "SSS":
        fields.milliseconds = n;
        break;
      case "SS":
        fields.milliseconds = n * 10;
        break;
      case "S":
        fields.milliseconds = n * 100;
        break;
      case "ZZ":
      case "Z":
        fields.zone = value;
        break;
      case "A":
      case "a": {
        const lower = value.toLowerCase();
        if (lower !== "am" && lower !== "pm") return null;
        fields.afternoon = lower === "pm";
        break;
      }
    }
  }
  return at === text.length ? fields : null;
}

/** The instant the fields stand for, with dayjs's defaults taken from `now`; null when none. */
function instantOf(fields: Fields, now: Today): Ms | null {
  let hours = fields.hours ?? 0;
  if (fields.afternoon !== undefined) {
    if (fields.afternoon) {
      if (hours < 12) hours += 12;
    } else if (hours === 12) {
      hours = 0;
    }
  }
  const minutes = fields.minutes ?? 0;
  const seconds = fields.seconds ?? 0;
  const milliseconds = fields.milliseconds ?? 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  // dayjs: a missing year is this year; with a year but no month the month is January, and
  // without both the day is today's.
  const year = fields.year || now.year;
  if (year < 100) return null;
  let month = 0;
  if (!(fields.year && !fields.month)) month = fields.month ? fields.month - 1 : now.month0;
  const day = fields.day || (!fields.year && !fields.month ? now.day : 1);
  let days: number;
  if (fields.dayOfYear !== undefined) {
    const length = daysInMonth(year, 2) === 29 ? 366 : 365;
    if (fields.dayOfYear < 1 || fields.dayOfYear > length) return null;
    days = daysFromCivil(year, 1, 1) + fields.dayOfYear - 1;
  } else {
    if (month < 0 || month > 11) return null;
    if (day < 1 || day > daysInMonth(year, month + 1)) return null;
    days = daysFromCivil(year, month + 1, day);
  }
  return days * MS_PER_DAY + ((hours * 60 + minutes) * 60 + seconds) * MS_PER_SECOND + milliseconds;
}

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** An instant as dayjs formats it with the tokens of a date format. */
export function formatByFormat(ms: Ms, format: string, zone: string | null = null): string {
  const days = Math.floor(ms / MS_PER_DAY);
  const rest = ms - days * MS_PER_DAY;
  const { year, month, day } = civilFromDays(days);
  const hours = Math.floor(rest / 3_600_000);
  const minutes = Math.floor((rest - hours * 3_600_000) / 60_000);
  const seconds = Math.floor((rest - hours * 3_600_000 - minutes * 60_000) / MS_PER_SECOND);
  const milliseconds = rest % MS_PER_SECOND;
  const dayOfYear = days - daysFromCivil(year, 1, 1) + 1;
  return tokenize(format)
    .map((part) => {
      if ("literal" in part) return part.literal;
      switch (part.token) {
        case "YYYY":
          return pad(year, 4);
        case "YY":
          return pad(year % 100, 2);
        case "Q":
          return String(Math.ceil(month / 3));
        case "MMMM":
          return MONTHS[month - 1]!;
        case "MMM":
          return MONTHS[month - 1]!.slice(0, 3);
        case "MM":
          return pad(month, 2);
        case "M":
          return String(month);
        case "DDDD":
          return pad(dayOfYear, 3);
        case "DDD":
          return String(dayOfYear);
        case "DD":
          return pad(day, 2);
        case "Do":
          return ordinal(day);
        case "D":
          return String(day);
        case "HH":
          return pad(hours, 2);
        case "H":
          return String(hours);
        case "hh":
          return pad(hours % 12 || 12, 2);
        case "h":
          return String(hours % 12 || 12);
        case "mm":
          return pad(minutes, 2);
        case "m":
          return String(minutes);
        case "ss":
          return pad(seconds, 2);
        case "s":
          return String(seconds);
        case "SSS":
          return pad(milliseconds, 3);
        case "SS":
          return pad(Math.floor(milliseconds / 10), 2);
        case "S":
          return String(Math.floor(milliseconds / 100));
        case "ZZ":
          return zone ?? "+0000";
        case "Z":
          return zone ?? "+00:00";
        case "A":
          return hours < 12 ? "AM" : "PM";
        case "a":
          return hours < 12 ? "am" : "pm";
      }
    })
    .join("");
}

/** Whether a date format leaves the year out, so dayjs fills dates in from the day it is read. */
export function formatUsesNow(format: string): boolean {
  const f = format.trim();
  if (f === "x" || f === "X") return false;
  return !tokenize(f).some(
    (part) => "token" in part && (part.token === "YYYY" || part.token === "YY"),
  );
}

/** A date text read with a format: the instant, and what had to be dropped to write it. */
export interface ParsedDate {
  readonly ms: Ms;
  /** The text carried a zone (`Z`, `ZZ`) or is a timestamp, which Meltemi dates do not have. */
  readonly zone: boolean;
  /** The instant has a fraction of a second, which Meltemi dates do not have. */
  readonly fraction: boolean;
}

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** What `new Date(text)` reads of an ISO 8601 date, without the zone. */
function readIso(text: string): ParsedDate | null {
  const m = ISO_DATE.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const hours = m[4] === undefined ? 0 : Number(m[4]);
  const minutes = m[5] === undefined ? 0 : Number(m[5]);
  const seconds = m[6] === undefined ? 0 : Number(m[6]);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const milliseconds = m[7] === undefined ? 0 : Number(m[7].padEnd(3, "0"));
  return {
    ms:
      daysFromCivil(year, month, day) * MS_PER_DAY +
      ((hours * 60 + minutes) * 60 + seconds) * MS_PER_SECOND +
      milliseconds,
    zone: m[8] !== undefined,
    fraction: milliseconds !== 0,
  };
}

/**
 * Reads a date text with a format as dayjs does in strict mode (the text must be what the date
 * formats back to). Without `strict`, a text that does not fit falls back to an ISO 8601 date, as
 * Mermaid's `getStartDate` falls back to `new Date(text)`.
 */
export function parseDateText(
  text: string,
  format: string,
  now: Today,
  fallback: boolean,
): ParsedDate | null {
  const f = format.trim();
  const t = text.trim();
  if (f === "x" || f === "X") {
    // A Unix timestamp, in seconds (`X`) or milliseconds (`x`): an instant of the whole world.
    if (!/^\d+(?:\.\d+)?$/.test(t) || (f === "x" && t.includes(".")))
      return fallback ? readIso(t) : null;
    const ms = Math.round(Number(t) * (f === "X" ? 1000 : 1));
    // JavaScript's own limit of a date: beyond it Mermaid has no date either.
    if (!Number.isSafeInteger(ms) || Math.abs(ms) > 8.64e15) return null;
    return { ms, zone: true, fraction: ms % MS_PER_SECOND !== 0 };
  }
  const fields = f === "" ? null : readFields(t, f);
  const ms = fields === null ? null : instantOf(fields, now);
  if (fields !== null && ms !== null && formatByFormat(ms, f, fields.zone ?? null) === t) {
    return { ms, zone: fields.zone !== undefined, fraction: ms % MS_PER_SECOND !== 0 };
  }
  return fallback ? readIso(t) : null;
}

// ---------------------------------------------------------------------------------------------
// Durations

export type DurationUnit = "ms" | "s" | "m" | "h" | "d" | "w" | "M" | "y";

export interface Duration {
  readonly amount: number;
  readonly unit: DurationUnit;
}

/** `10d`, `1.5h`, `500ms`: Mermaid's `parseDuration`, case sensitive (`M` is months, `m` minutes). */
export function parseDuration(text: string): Duration | null {
  const match = /^(\d+(?:\.\d+)?)(ms|[Mdhmswy])$/.exec(text.trim());
  if (!match) return null;
  return { amount: Number.parseFloat(match[1]!), unit: match[2] as DurationUnit };
}

/** Adds months to an instant as dayjs does: the day is kept, or the last day of a shorter month. */
function addMonths(ms: Ms, months: number): Ms {
  const days = Math.floor(ms / MS_PER_DAY);
  const rest = ms - days * MS_PER_DAY;
  const { year, month, day } = civilFromDays(days);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return daysFromCivil(y, m, Math.min(day, daysInMonth(y, m))) * MS_PER_DAY + rest;
}

/**
 * The instant a duration after another reaches, by dayjs's arithmetic: days and weeks round to
 * whole days, months and years drop their fraction, and the rest is exact.
 */
export function addDuration(ms: Ms, duration: Duration): Ms {
  const { amount, unit } = duration;
  switch (unit) {
    case "ms":
      return ms + amount;
    case "s":
      return ms + amount * MS_PER_SECOND;
    case "m":
      return ms + amount * 60_000;
    case "h":
      return ms + amount * 3_600_000;
    case "d":
      return ms + Math.round(amount) * MS_PER_DAY;
    case "w":
      return ms + Math.round(amount * 7) * MS_PER_DAY;
    case "M":
      return addMonths(ms, Math.trunc(amount));
    case "y":
      return addMonths(ms, Math.trunc(amount) * 12);
  }
}

// ---------------------------------------------------------------------------------------------
// What a task says about where it starts and where it ends

export type StartSpec =
  | { readonly kind: "previous" }
  | { readonly kind: "after"; readonly ids: readonly string[] }
  | { readonly kind: "date"; readonly text: string; readonly parsed: ParsedDate | null };

export type EndSpec =
  | { readonly kind: "until"; readonly text: string; readonly ids: readonly string[] }
  | { readonly kind: "date"; readonly text: string; readonly parsed: ParsedDate }
  | ({ readonly kind: "duration"; readonly text: string } & Duration)
  | { readonly kind: "unreadable"; readonly text: string };

/** The ids of an `after` or `until` list, as Mermaid reads them: separated by spaces. */
function idList(text: string, word: "after" | "until"): string[] | null {
  const match = new RegExp(`^${word}\\s+([\\w\\- ]+)`).exec(text);
  if (!match) return null;
  return match[1]!.split(" ").filter((id) => id !== "");
}

/** The settings of a chart that dates are read and scheduled with. */
export interface ReplaySettings {
  /** The date format, trimmed: `YYYY-MM-DD` by default. */
  readonly format: string;
  /** What `excludes` lists, lower case: `weekends`, weekday names and dates. */
  readonly excludes: readonly string[];
  /** What `includes` lists, lower case. */
  readonly includes: readonly string[];
  /** The day the weekend starts on: Friday or Saturday (the default). */
  readonly weekend: "friday" | "saturday";
  readonly inclusiveEndDates: boolean;
  /** The day the import is made, which Mermaid's own `new Date()` stands for. */
  readonly today: Today;
}

/** How a task starts: `after a b`, a date in the chart's format (or ISO 8601), or unreadable. */
export function readStart(text: string, settings: ReplaySettings): StartSpec {
  const t = text.trim();
  const ids = idList(t, "after");
  if (ids) return { kind: "after", ids };
  return { kind: "date", text: t, parsed: parseDateText(t, settings.format, settings.today, true) };
}

/** How a task ends: `until a b`, a date in the chart's format, a duration, or neither. */
export function readEnd(text: string, settings: ReplaySettings): EndSpec {
  const t = text.trim();
  const ids = idList(t, "until");
  if (ids) return { kind: "until", text: t, ids };
  const parsed = parseDateText(t, settings.format, settings.today, false);
  if (parsed) return { kind: "date", text: t, parsed };
  const duration = parseDuration(t);
  if (duration) return { kind: "duration", text: t, ...duration };
  return { kind: "unreadable", text: t };
}

/** Whether a text is a date written `YYYY-MM-DD` that exists: Mermaid then keeps the end as is. */
export function isIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && dayOfDate(text) !== undefined;
}

// ---------------------------------------------------------------------------------------------
// Mermaid's schedule

/** One task as Mermaid's database holds it before it computes dates. */
export interface ReplayTask {
  readonly id: string;
  /** The id of the task declared just before, which a task without a start follows. */
  readonly prevId: string | undefined;
  readonly start: StartSpec;
  readonly end: EndSpec;
}

/** The dates Mermaid computes for a task; null when it cannot compute them. */
export interface Replayed {
  readonly start: Ms | null;
  /** The end the next task follows, after Mermaid pushes it past excluded days. */
  readonly end: Ms | null;
  /**
   * The end Mermaid draws when it differs from `end`: the end as it was when the last run of
   * excluded days began. Null when Mermaid draws `end`.
   */
  readonly renderEnd: Ms | null;
}

/** Whether a day is excluded: Mermaid's `isInvalidDate`. */
function isInvalidDate(ms: Ms, settings: ReplaySettings, formatted: boolean): boolean {
  const iso = dayText(ms);
  const written = formatted ? formatByFormat(ms, settings.format) : iso;
  if (settings.includes.includes(written) || settings.includes.includes(iso)) return false;
  const weekday = weekdayOfDay(Math.floor(ms / MS_PER_DAY)) + 1;
  const weekendStart = settings.weekend === "friday" ? 5 : 6;
  if (
    settings.excludes.includes("weekends") &&
    (weekday === weekendStart || weekday === weekendStart + 1)
  ) {
    return true;
  }
  if (settings.excludes.includes(WEEKDAY_NAMES[weekday - 1]!)) return true;
  return settings.excludes.includes(written) || settings.excludes.includes(iso);
}

/**
 * Mermaid's `fixTaskDates`: from the day after the start to the end, every excluded day pushes
 * the end one day later. Returns the end, and the end as it was when the last run of excluded days
 * began (what Mermaid draws); null when the end never settles.
 */
function fixTaskDates(
  from: Ms,
  to: Ms,
  settings: ReplaySettings,
  formatted: boolean,
): { end: Ms; renderEnd: Ms | null } | null {
  // Mermaid walks every day of the task; one of more than a century is not drawn.
  if ((to - from) / MS_PER_DAY > 40_000) return null;
  let invalid = false;
  let renderEnd: Ms | null = null;
  let day = from;
  let end = to;
  const limit = to + 10_000 * MS_PER_DAY;
  while (day <= end) {
    if (!invalid) renderEnd = end;
    invalid = isInvalidDate(day, settings, formatted);
    if (invalid) {
      end += MS_PER_DAY;
      if (end > limit) return null;
    }
    day += MS_PER_DAY;
  }
  return { end, renderEnd };
}

/** What one pass over the tasks has computed of a task so far. */
interface Slot {
  start: Ms | null;
  end: Ms | null;
  renderEnd: Ms | null;
  processed: boolean;
}

/**
 * Replays Mermaid's `getTasks`: up to eleven passes over the tasks in order, each computing the
 * start of every task from what it follows and then its end, until every task has one. A task
 * that follows itself, or a task that cannot be dated, never gets one.
 */
export function replaySchedule(tasks: readonly ReplayTask[], settings: ReplaySettings): Replayed[] {
  const byId = new Map<string, number>();
  tasks.forEach((task, i) => byId.set(task.id, i));
  const slots: Slot[] = tasks.map(() => ({
    start: null,
    end: null,
    renderEnd: null,
    processed: false,
  }));
  const today = midnight(settings.today);
  // Days are compared with the dates `excludes` lists in the chart's own format.
  const formatted = [...settings.excludes, ...settings.includes].some(
    (token) => token !== "weekends" && !(WEEKDAY_NAMES as readonly string[]).includes(token),
  );

  /** The latest end of the tasks an `after` names; null while one of them has none. */
  const latestEnd = (ids: readonly string[]): Ms | null => {
    let found = false;
    let latest: Ms | null = null;
    for (const id of ids) {
      const at = byId.get(id);
      if (at === undefined) continue;
      const end = slots[at]!.end;
      if (!found) {
        found = true;
        latest = end;
      } else if (end !== null && latest !== null && end > latest) {
        latest = end;
      }
    }
    return found ? latest : today;
  };
  /** The earliest start of the tasks an `until` names; null while one of them has none. */
  const earliestStart = (ids: readonly string[]): Ms | null => {
    let found = false;
    let earliest: Ms | null = null;
    for (const id of ids) {
      const at = byId.get(id);
      if (at === undefined) continue;
      const start = slots[at]!.start;
      if (!found) {
        found = true;
        earliest = start;
      } else if (start !== null && earliest !== null && start < earliest) {
        earliest = start;
      }
    }
    return found ? earliest : today;
  };

  for (let pass = 0; pass < 11; pass++) {
    let all = true;
    tasks.forEach((task, i) => {
      const slot = slots[i]!;
      switch (task.start.kind) {
        case "previous": {
          const at = task.prevId === undefined ? undefined : byId.get(task.prevId);
          slot.start = at === undefined ? null : slots[at]!.end;
          break;
        }
        case "after": {
          const start = latestEnd(task.start.ids);
          if (start !== null) slot.start = start;
          break;
        }
        case "date":
          if (task.start.parsed) slot.start = task.start.parsed.ms;
          break;
      }
      const start = slot.start;
      let end: Ms | null = null;
      if (start !== null) {
        switch (task.end.kind) {
          case "until":
            end = earliestStart(task.end.ids);
            break;
          case "date":
            end = task.end.parsed.ms + (settings.inclusiveEndDates ? MS_PER_DAY : 0);
            break;
          case "duration":
            end = addDuration(start, task.end);
            break;
          case "unreadable":
            end = start;
            break;
        }
      }
      if (start !== null && end !== null) {
        slot.end = end;
        slot.renderEnd = null;
        slot.processed = true;
        // Mermaid leaves an end written `YYYY-MM-DD` as it is, and pushes any other past the days
        // the chart excludes, counting them from the day after the start.
        if (settings.excludes.length > 0 && !isIsoDate(task.end.text)) {
          const fixed = fixTaskDates(start + MS_PER_DAY, end, settings, formatted);
          if (fixed === null) {
            slot.end = null;
            slot.processed = false;
          } else {
            slot.end = fixed.end;
            slot.renderEnd = fixed.renderEnd;
          }
        }
      }
      all = all && slot.processed;
    });
    if (all) break;
  }
  return slots.map(({ start, end, renderEnd }) => ({ start, end, renderEnd }));
}
