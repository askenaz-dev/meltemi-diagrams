import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The words of fonts for people: why a project's font file cannot be used. They are in the
 * interface language (`getLocale()`), looked up when a font is added, never when a module loads.
 */
export const messages = catalog(en, es);
