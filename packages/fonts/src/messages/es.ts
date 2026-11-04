import type { en } from "./en.js";

/** The words of fonts in Spanish. */
export const es: typeof en = {
  fonts: {
    format: "El archivo no es una fuente WOFF2, WOFF, TrueType u OpenType.",
    unreadable: (reason) => `No se puede leer la fuente: ${reason}`,
    noFamily: "La fuente no tiene nombre de familia.",
  },
};
