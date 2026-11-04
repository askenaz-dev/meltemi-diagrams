import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The assistance's words in a language, by default the interface's (`messages()`): errors,
 * problems and reasons take it when they are made, the list of what a request sends when it is
 * described. Nothing sent to a model comes from here.
 */
export const messages = catalog(en, es);
