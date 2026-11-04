import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The words of assets for people: why an SVG file, an icon or an image cannot be used, and what
 * changed since the asset lock was written. They are in the interface language (`getLocale()`),
 * looked up when a problem is found, never when a module loads; the reasons of problems
 * (`unsafe`, `invalid`, `too-large`) do not depend on it.
 */
export const messages = catalog(en, es);

/** The catalog of one language, as `messages()` returns it. */
export type AssetMessages = typeof en;
