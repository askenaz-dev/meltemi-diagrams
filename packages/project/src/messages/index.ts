import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

export type { PluginFailure } from "./en.js";

/**
 * The words of projects for people: the messages, hints and related notes of the diagnostics of
 * `project.json`, plugins, imports, references across files, assets and the bounds of a project,
 * and the reasons a reference or a rename is refused. They are in the interface language
 * (`getLocale()`), looked up when a diagnostic or a refusal is made, never when a module loads;
 * codes, severities, ranges and `data` do not depend on it.
 */
export const messages = catalog(en, es);

/** The catalog of one language, as `messages()` returns it. */
export type ProjectMessages = typeof en;
