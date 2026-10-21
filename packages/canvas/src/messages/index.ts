import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

export type { CanvasMessages } from "./en.js";

/**
 * The canvas's own words in the interface language, which the host sets with `setLocale` before it
 * creates the canvas. Look them up while the interface is built, never when a module loads.
 * Words that come from the host (field labels, titles, statuses) arrive in its language already.
 */
export const messages = catalog(en, es);
