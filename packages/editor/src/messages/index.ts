import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The editor's words for people: the inspector's fields and titles, the theme panel, the statuses
 * and refusals of the canvas session, and why an export cannot be made. They are in the interface
 * language (`getLocale()`), looked up when a model or a message is built, never when a module
 * loads. Exported files take the words they carry from their own packages, with the content
 * language.
 */
export const messages = catalog(en, es);
