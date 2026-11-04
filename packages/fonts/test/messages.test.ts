import { afterEach, describe, expect, it } from "vitest";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { syntheticFont } from "../../../test-support/synthetic-font.js";
import { FontLibrary } from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

describe("the words of fonts", () => {
  afterEach(() => setLocale("en"));

  it("have a Spanish sentence for every English one", () => {
    expect(untranslated(en, es)).toEqual([]);
  });

  it("tell why a font file cannot be used in the interface language", () => {
    const library = new FontLibrary(() => undefined);
    const junk = new Uint8Array([1, 2, 3, 4]);
    setLocale("es");
    expect(library.addFont(junk, "x.ttf")).toEqual({
      ok: false,
      message: "El archivo no es una fuente WOFF2, WOFF, TrueType u OpenType.",
    });
    expect(library.addFont(syntheticFont({ family: "" }), "nameless.ttf")).toEqual({
      ok: false,
      message: "La fuente no tiene nombre de familia.",
    });
    setLocale("en");
    expect(library.addFont(syntheticFont({ family: "" }), "nameless.ttf")).toEqual({
      ok: false,
      message: "The font has no family name.",
    });
  });
});
