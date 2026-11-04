import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The words of compilation for people: the messages, hints and related notes of the diagnostics of
 * `compile()`, and the problems of declared diagram types. They are in the interface language
 * (`getLocale()`), looked up when a diagnostic is made, never when a module loads; codes,
 * severities, ranges and `data` do not depend on it.
 */
export const messages = catalog(en, es);

/** The catalog of one language, as `messages()` returns it. */
export type ModelMessages = typeof en;
