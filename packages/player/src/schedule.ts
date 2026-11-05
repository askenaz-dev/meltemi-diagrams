// What a card and the panel of the player say of a gantt chart's tasks: the dates the document
// carries as ISO text, written in the player's language. Pure text, so the page's script and the
// tests share it; nothing here touches the page.
import { decimal, type Locale } from "@meltemi/diagrams-i18n";
import type { ElementDetails, ScheduleDetails } from "./format.js";
import { messages } from "./messages/index.js";

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

/** A date or an instant as the player's language writes it: `8 jun 2026`, `8 jun 2026 09:30`. */
export function civilText(iso: string, locale: Locale): string {
  const match = ISO.exec(iso);
  if (!match) return iso;
  const words = messages(locale).details.gantt;
  const month = words.months[Number(match[2]) - 1] ?? match[2]!;
  return words.moment(
    Number(match[3]),
    month,
    match[1]!,
    match[4] === undefined ? null : `${match[4]}:${match[5]}`,
  );
}

/**
 * The span of a task as dates: `8 jun 2026 → 19 jun 2026`, or the one date when it starts and ends
 * on it (a milestone, a marker, a task of one day); null when it has no dates.
 */
export function spanText(schedule: ScheduleDetails, locale: Locale): string | null {
  if (schedule.start === null) return null;
  const start = civilText(schedule.start, locale);
  if (schedule.end === null || schedule.end === schedule.start) return start;
  return messages(locale).details.gantt.span(start, civilText(schedule.end, locale));
}

/**
 * Working time in words: whole days as working days (`10 días hábiles`), days with a fraction as
 * decimal ones, and less than a day in hours, minutes or seconds.
 */
export function workingText(seconds: number, locale: Locale): string {
  const words = messages(locale).details.gantt;
  const days = seconds / 86_400;
  if (days >= 1) return words.days(decimal(locale, days, 2), days);
  if (seconds >= 3600) return words.hours(decimal(locale, seconds / 3600, 2));
  if (seconds >= 60) return words.minutes(decimal(locale, seconds / 60, 2));
  return words.seconds(decimal(locale, seconds, 2));
}

/** The state of a task, milestone or marker in words, or null for one that is only planned. */
function stateWord(schedule: ScheduleDetails, kind: string, locale: Locale): string | null {
  const words = messages(locale).details.gantt;
  return schedule.status === null ? null : words.state(schedule.status, kind);
}

/** What a hover card says of a gantt element besides its label and description. */
export interface ScheduleCard {
  /** The section, the state and "critical", joined: `Tecnología · En curso`. */
  readonly meta: string | null;
  /** The dates and the working time: `8 jun 2026 → 19 jun 2026 · 10 días hábiles`. */
  readonly ends: string | null;
  /** What the task follows: `Después de: Evaluar plataformas de agentes`. */
  readonly note: string | null;
}

/**
 * The lines of a gantt element's card. `label` gives the text people read for an id, as the
 * document's names do.
 */
export function scheduleCard(
  element: ElementDetails,
  schedule: ScheduleDetails,
  label: (id: string) => string,
  locale: Locale,
): ScheduleCard {
  const t = messages(locale);
  const meta = [
    schedule.section === null ? null : label(schedule.section),
    stateWord(schedule, element.kind, locale),
    schedule.critical ? t.details.gantt.critical(element.kind) : null,
  ].filter((part): part is string => part !== null);
  const span = spanText(schedule, locale);
  const ends = [
    span,
    schedule.workingSeconds === null ? null : workingText(schedule.workingSeconds, locale),
  ].filter((part): part is string => part !== null);
  return {
    meta: meta.length > 0 ? meta.join(" · ") : null,
    ends: ends.length > 0 ? ends.join(" · ") : null,
    note:
      schedule.after.length > 0
        ? t.details.gantt.follows(t.story.list(schedule.after.map(label)))
        : null,
  };
}

/** The facts the detail panel lists for a gantt element, as term and value. */
export function schedulePanel(
  element: ElementDetails,
  schedule: ScheduleDetails,
  label: (id: string) => string,
  locale: Locale,
): { readonly term: string; readonly value: string }[] {
  const words = messages(locale).details.gantt;
  const facts: { term: string; value: string }[] = [];
  if (schedule.section !== null) {
    facts.push({ term: words.fields.section, value: label(schedule.section) });
  }
  if (schedule.start !== null) {
    if (schedule.end === null || schedule.end === schedule.start) {
      facts.push({ term: words.fields.date, value: civilText(schedule.start, locale) });
    } else {
      facts.push({ term: words.fields.start, value: civilText(schedule.start, locale) });
      facts.push({ term: words.fields.end, value: civilText(schedule.end, locale) });
    }
  }
  if (schedule.workingSeconds !== null) {
    facts.push({ term: words.fields.working, value: workingText(schedule.workingSeconds, locale) });
  }
  if (element.kind === "task" || element.kind === "milestone") {
    facts.push({
      term: words.fields.status,
      value: words.state(schedule.status ?? "planned", element.kind),
    });
  }
  return facts;
}

/**
 * The subtitle of the panel of a gantt element: its kind, and "critical" when it is:
 * `Tarea · Crítica`.
 */
export function scheduleType(
  element: ElementDetails,
  schedule: ScheduleDetails,
  locale: Locale,
): string {
  const words = messages(locale).details.gantt;
  return [words.kind(element.kind), schedule.critical ? words.critical(element.kind) : null]
    .filter((part): part is string => part !== null)
    .join(" · ");
}
