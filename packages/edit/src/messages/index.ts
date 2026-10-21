import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

export type { EntityParent, SyntaxErrorAt } from "./en.js";

/**
 * The edit package's words. The labels of new elements are what the person would have typed, so
 * they follow the interface language unless a locale is given. Reasons of refused edits, the
 * descriptions of dependents and the notes of plans are written in the interface language when
 * they are made: read them at that moment, never at module load.
 */
export const messages = catalog(en, es);

/** The edit package's words in one language. */
export type EditWords = typeof en;

/** The reasons of refused edits in the interface language, read when an edit is refused. */
export function reasons(): EditWords["rejections"] {
  return messages().rejections;
}
