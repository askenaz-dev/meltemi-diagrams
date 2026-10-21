import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

export type { CoverageNote } from "./en.js";

/**
 * The importers' words in a language. Findings take the interface language when they are made
 * (`messages()`); words written into a sheet take the language the import asks for
 * (`messages(locale)`).
 */
export const messages = catalog(en, es);
