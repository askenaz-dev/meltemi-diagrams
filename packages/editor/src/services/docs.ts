import type { Locale } from "@meltemi/diagrams-i18n";
import { WEEKDAYS } from "@meltemi/diagrams-model";
import { entryOf, serviceMessages } from "../messages/services.js";

/**
 * One line of documentation for each keyword, property and value, in English. Completion and
 * hover read `keywordDoc`, in the interface language.
 */
export const KEYWORD_DOCS: Readonly<Record<string, string>> = serviceMessages("en").keywords;

/**
 * The documentation of a keyword, property or value in the interface language (or `locale`), if
 * it has one. Code samples in it are as written in the language.
 */
export function keywordDoc(word: string, locale?: Locale): string | undefined {
  return entryOf(serviceMessages(locale).keywords, word);
}

/**
 * What a word means in the group block of a free diagram, where `layout`, `spacing` and `align`
 * make the group a list and `column`, `row`, `start`… are their values; undefined for the others.
 */
export function listDoc(word: string, locale?: Locale): string | undefined {
  return entryOf(serviceMessages(locale).listWords, word);
}

/** What the words of a gantt chart mean, in English: the statements, clauses and chart settings. */
export const GANTT_DOCS: Readonly<Record<string, string>> = serviceMessages("en").ganttWords;

/**
 * What a word means inside a gantt chart, in the interface language (or `locale`): its statements
 * (`task`, `milestone`…), the clauses after a label (`from`, `after`, `for`, `to`, `until`, `at`),
 * the status words, the chart statements and their values, and the days of the week. Several of
 * them are words of other profiles that mean something else there, so a chart reads this first;
 * undefined for the words that mean the same everywhere (`title`, `style`…).
 */
export function ganttDoc(word: string, locale?: Locale): string | undefined {
  const t = serviceMessages(locale);
  if ((WEEKDAYS as readonly string[]).includes(word)) return t.gantt.weekday(word);
  return entryOf(t.ganttWords, word);
}
