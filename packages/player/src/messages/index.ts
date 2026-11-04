import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The player's words in a language. Pages and players are content: callers pass the language of
 * the page explicitly, so the same document reads the same on every machine.
 */
export const messages = catalog(en, es);
