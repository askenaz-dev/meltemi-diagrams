// The words every page shares. Each section of the catalog lives in its own file with both
// languages side by side; `en.ts` and `es.ts` gather them, and the Spanish object has the English
// one's type, so a missing or different word does not compile.

export const commonEn = {
  brand: "Meltemi Diagrams",
  /** Before the code of an error, as in "Code: cli.invalid". */
  codeLabel: "Code",
  /** The way out of a page: the playground, at the root of the site. */
  backToSite: "Back to the playground",
};

export const commonEs: typeof commonEn = {
  brand: "Meltemi Diagrams",
  codeLabel: "Código",
  backToSite: "Volver al playground",
};
