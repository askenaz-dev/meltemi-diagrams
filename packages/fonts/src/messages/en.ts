/**
 * The words of fonts in English: why a font file of a project cannot be used. They are written in
 * the interface language when a font is added, so they are read at that moment, never at module
 * load.
 */
export const en = {
  /** Why `addFont` refuses a file. */
  fonts: {
    format: "The file is not a WOFF2, WOFF, TrueType or OpenType font.",
    /** The font parser's own words, which end the sentence. */
    unreadable: (reason: string) => `The font cannot be read: ${reason}`,
    noFamily: "The font has no family name.",
  },
};
