import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The catalog's words in a language. A catalog is content: callers pass the language of the page
 * explicitly, so the same project reads the same on every machine.
 */
export const messages = catalog(en, es);
