import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { TEMPLATES } from "@meltemi/diagrams-project";
import { LANGUAGE_NAMES, interfaceLocale, languageChoice } from "../src/language.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { messages } from "../src/messages/index.js";
import { decodeShare } from "../src/share.js";
import {
  templateContents,
  templateDescription,
  templateTitle,
  type Template,
} from "../src/templates.js";

/** A template as the build writes it, by name. */
function template(name: keyof typeof TEMPLATES): Template {
  const info = TEMPLATES[name];
  return {
    name,
    title: info.title,
    description: info.description,
    contents: info.contents,
    files: {},
    thumbnails: { light: `templates/${name}.light.svg`, dark: `templates/${name}.dark.svg` },
  };
}
import { readZip } from "../src/zip.js";

afterEach(() => setLocale("en"));

describe("the playground's catalog", () => {
  it("has every entry in Spanish", () => {
    // Words that are rightly the same in both languages: formats, the playground's name and the
    // sign-in providers' names.
    expect(
      untranslated(en, es, [
        "SVG",
        "PNG",
        "GIF",
        "MP4",
        "WebM",
        "playground",
        "Playground",
        "GitHub",
        "Google",
        // Keys that read the same in Spanish.
        "Ctrl+Z",
        "Ctrl+B",
        "Ctrl+J",
        "Ctrl+Alt+B",
      ]),
    ).toEqual([]);
  });

  it("describes the templates as `init` does in English, and each of them in Spanish", () => {
    const names = Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[];
    expect(en.templates.descriptions).toEqual(
      Object.fromEntries(names.map((name) => [name, TEMPLATES[name].description])),
    );
    expect(en.templates.titles).toEqual(
      Object.fromEntries(names.map((name) => [name, TEMPLATES[name].title])),
    );
    expect(Object.keys(es.templates.descriptions)).toEqual(names);
    expect(Object.keys(es.templates.titles)).toEqual(names);
    expect(es.templates.descriptions.flow).toBe("Un diagrama de flujo para empezar");
    expect(
      es.templates.contents([
        ["models", 1],
        ["views", 2],
      ]),
    ).toBe("1 modelo · 2 vistas");
    expect(
      en.templates.contents([
        ["diagrams", 2],
        ["stories", 1],
      ]),
    ).toBe("2 diagrams · 1 story");
  });

  it("formats counts, lists and decimals for each language", () => {
    expect(en.problems.summary(1, 0)).toBe("Problems: 1 error, 0 warnings");
    expect(es.problems.summary(1, 0)).toBe("Problemas: 1 error, 0 advertencias");
    expect(es.problems.counts(2, 1)).toBe("2 errores, 1 advertencia");
    expect(es.project.added(["diagrams/a.meltemi", "logo.png"])).toBe(
      "Se agregaron diagrams/a.meltemi y logo.png.",
    );
    expect(es.project.replaceMessage(["a.meltemi"])).toBe("Se reemplazará a.meltemi.");
    expect(es.share.holds(1, 1536)).toMatch(/^El enlace contiene 1 archivo de texto .*\(1,5 KB\)/);
    expect(en.share.holds(2, 1536)).toMatch(/project's 2 text files \(1\.5 KB\)/);
    expect(es.download.catalogDownloaded("c.html", 1, 2)).toBe(
      "Se descargó c.html: 1 entrada. 2 no se pudieron dibujar y quedaron fuera.",
    );
  });
});

describe("the interface language", () => {
  it("follows the browser with `auto` or no choice, and the choice otherwise", () => {
    expect(interfaceLocale("auto", "es-CL")).toBe("es");
    expect(interfaceLocale(undefined, "es-419")).toBe("es");
    expect(interfaceLocale("auto", "fr-FR")).toBe("en");
    expect(interfaceLocale("auto", undefined)).toBe("en");
    expect(interfaceLocale("en", "es-CL")).toBe("en");
    expect(interfaceLocale("es", "en-US")).toBe("es");
    // A kept value that is not a choice counts as `auto`.
    expect(interfaceLocale("de", "es-MX")).toBe("es");
    expect(languageChoice("de")).toBe("auto");
    expect(languageChoice("es")).toBe("es");
    expect(LANGUAGE_NAMES).toEqual({ en: "English", es: "Español" });
  });

  it("gives the interface's words, errors of links and archives included", async () => {
    expect(getLocale()).toBe("en");
    expect(messages().header.export).toBe("Export");
    setLocale("es");
    expect(messages().header.export).toBe("Exportar");
    await expect(decodeShare("not base64!")).rejects.toThrow("El enlace está dañado.");
    await expect(readZip(new Uint8Array(100))).rejects.toThrow("El archivo no es un ZIP.");
    expect(templateDescription(template("c4"))).toBe(es.templates.descriptions.c4);
    expect(templateTitle(template("c4"))).toBe("Modelo C4");
    expect(templateContents(template("c4"))).toBe("1 modelo · 2 vistas");
    // A template the catalog does not know keeps its own words.
    const mine = { ...template("flow"), name: "mine", title: "Mine", description: "My own" };
    expect(templateDescription(mine)).toBe("My own");
    expect(templateTitle(mine)).toBe("Mine");
    setLocale("en");
    expect(templateDescription(template("c4"))).toBe(TEMPLATES.c4.description);
    expect(templateContents(template("purchase"))).toBe("1 model · 2 views · 2 diagrams · 1 story");
  });
});
