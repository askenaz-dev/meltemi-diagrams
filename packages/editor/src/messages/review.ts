import { catalog } from "@meltemi/diagrams-i18n";

/**
 * The words of reviews in English: why the version before cannot be read from Git. They are made
 * in the interface language, for the terminal or a dialog; the review report takes its own words
 * in the language of the files a command writes.
 */
const en = {
  git: {
    notARepository:
      "the path is not in a Git repository; give the version before with --before <path>.",
    /** A revision that names no commit. */
    unknownRevision: (revision: string) =>
      `"${revision}" is not a commit, branch or tag of the repository.`,
    /** Git's own message when the files of a revision cannot be listed. */
    cannotList: (revision: string, error: string) => `cannot list ${revision}: ${error}`,
  },
};

const es: typeof en = {
  git: {
    notARepository:
      "la ruta no está en un repositorio de Git; indica la versión anterior con --before <ruta>.",
    unknownRevision: (revision) =>
      `"${revision}" no es un commit, una rama ni una etiqueta del repositorio.`,
    cannotList: (revision, error) => `no se pueden listar los archivos de ${revision}: ${error}`,
  },
};

/** The words of reviews in a language, by default the interface's. */
export const reviewMessages = catalog(en, es);
