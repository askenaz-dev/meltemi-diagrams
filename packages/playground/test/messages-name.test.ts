import { describe, expect, it } from "vitest";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const MARKER = "@@one@@";

/**
 * The arguments a sentence is tried with: markers as strings, as lists (`paths.join(", ")`), as
 * counts (`plural(...)`) and as counted kinds (`templates.contents`), six of each so that every
 * parameter is given.
 */
const ARGUMENTS: readonly (readonly unknown[])[] = [
  Array.from({ length: 6 }, () => MARKER),
  Array.from({ length: 6 }, () => [MARKER]),
  Array.from({ length: 6 }, () => 2),
  Array.from({ length: 6 }, () => [["diagrams", 2]]),
];

/** Everything a sentence says with each kind of argument it accepts. */
function sayings(path: string, entry: (...args: unknown[]) => unknown): string[] {
  const said: string[] = [];
  for (const args of ARGUMENTS) {
    try {
      const text = entry(...args);
      if (typeof text === "string") said.push(text);
    } catch {
      // This kind of argument is not the sentence's; another one is.
    }
  }
  if (said.length === 0) throw new Error(`${path} could not be said with any argument`);
  return said;
}

/** Every entry of a catalogue as what it says, by its path. */
function texts(words: object): [string, string][] {
  const found: [string, string][] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") found.push([path, value]);
    else if (typeof value === "function") {
      for (const text of sayings(path, value as (...args: unknown[]) => unknown)) {
        found.push([path, text]);
      }
    } else if (value !== null && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        walk(inner, path === "" ? key : `${path}.${key}`);
      }
    }
  };
  walk(words, "");
  return found;
}

const CATALOGUES = { en, es } as const;

describe("the page's name", () => {
  it("is said by no entry as a playground, in either language", () => {
    const found: string[] = [];
    for (const [language, words] of Object.entries(CATALOGUES)) {
      for (const [path, text] of texts(words)) {
        if (/playground/i.test(text)) found.push(`${path} (${language})`);
      }
    }
    expect([...new Set(found)]).toEqual([]);
  });

  it("walks every catalogue of the page, the explorer's, the share dialog's and the account panel's", () => {
    for (const words of Object.values(CATALOGUES)) {
      const paths = texts(words).map(([path]) => path);
      for (const part of [
        "page.",
        "header.",
        "about.",
        "explorer.",
        "cloud.sharing.",
        "accountPanel.",
      ]) {
        expect(
          paths.some((path) => path.startsWith(part)),
          part,
        ).toBe(true);
      }
    }
  });

  it("is Meltemi Diagrams in English", () => {
    expect(en.page.title).toBe("Meltemi Diagrams");
    expect(en.page.loading).toBe("Loading Meltemi Diagrams…");
    expect(en.header.tag).toBe("Web");
    expect(en.header.actions).toBe("Meltemi Diagrams");
    expect(en.header.about).toBe("About Meltemi Diagrams");
    expect(en.about.title).toBe("About Meltemi Diagrams");
  });

  it("is Meltemi Diagrams in Spanish", () => {
    expect(es.page.title).toBe("Meltemi Diagrams");
    expect(es.page.loading).toBe("Cargando Meltemi Diagrams…");
    expect(es.header.tag).toBe("Web");
    expect(es.header.actions).toBe("Meltemi Diagrams");
    expect(es.header.about).toBe("Acerca de Meltemi Diagrams");
    expect(es.about.title).toBe("Acerca de Meltemi Diagrams");
  });

  it("is told truthfully in About: nothing is sent without an account, the cloud with one", () => {
    const [, english] = en.about.text("1.0.0").split("\n\n");
    expect(english).toBe(
      "Meltemi Diagrams runs in your browser. Without an account, nothing you write is sent anywhere and your work stays in this browser until you download it. With an account, your projects can be kept in the cloud and shared.",
    );
    const [, spanish] = es.about.text("1.0.0").split("\n\n");
    expect(spanish).toBe(
      "Meltemi Diagrams funciona en tu navegador. Sin una cuenta, nada de lo que escribes se envía a ningún sitio y tu trabajo se queda en este navegador hasta que lo descargas. Con una cuenta, tus proyectos pueden guardarse en la nube y compartirse.",
    );
  });
});
