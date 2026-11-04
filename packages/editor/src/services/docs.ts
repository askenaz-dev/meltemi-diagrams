import type { Locale } from "@meltemi/diagrams-i18n";
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
