import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The words of the lexer, the parser and the formatter for people: the messages, hints and related
 * notes of their diagnostics. They are in the interface language (`getLocale()`), looked up when a
 * diagnostic is made, never when a module loads; codes, severities and ranges do not depend on it.
 */
export const messages = catalog(en, es);

/** The catalog of one language, as `messages()` returns it. */
export type LanguageMessages = typeof en;
