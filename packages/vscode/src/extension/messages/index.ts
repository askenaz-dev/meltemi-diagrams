import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

export { en, es };

/**
 * The extension's words at run time. Without a locale, the interface language of the extension
 * host, which `meltemi.language` sets when the extension starts and whenever it changes.
 */
export const messages = catalog(en, es);
