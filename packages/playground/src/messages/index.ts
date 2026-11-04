import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The playground's words in a language, by default the interface's. Call sites read them when they
 * draw (`messages().header.export`), never when a module loads, so that the language chosen at
 * startup applies everywhere.
 */
export const messages = catalog(en, es);
