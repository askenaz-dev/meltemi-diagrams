import { catalog, type Locale } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

export type { CutBy, LabelObstacle } from "./en.js";

/**
 * The layout's words. Without a locale, the interface language: diagnostics and their hints are
 * written in it when they are made, so read them at report time, never at module load.
 */
export const messages = catalog(en, es);

/** The layout's words in one language. */
export type LayoutWords = typeof en;

/**
 * The words the layout adds to drawings (the type lines of C4 entities). Drawings are content:
 * callers always pass the content language (the project's `locale` or an export's), so the same
 * sources draw the same text on every machine, whatever the interface language.
 */
export function drawingWords(locale: Locale): LayoutWords["drawing"] {
  return messages(locale).drawing;
}
