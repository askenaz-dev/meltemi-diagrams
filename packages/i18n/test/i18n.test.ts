import { afterEach, describe, expect, it } from "vitest";
import {
  catalog,
  decimal,
  getLocale,
  list,
  localeFromEnv,
  percent,
  plural,
  resolveLocale,
  seconds,
  setLocale,
  untranslated,
} from "../src/index.js";

afterEach(() => setLocale("en"));

describe("locales", () => {
  it("resolves language tags and POSIX locales", () => {
    expect(resolveLocale("es-419")).toBe("es");
    expect(resolveLocale("es_MX.UTF-8")).toBe("es");
    expect(resolveLocale("ES")).toBe("es");
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale("")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("reads the environment as command-line tools do", () => {
    expect(localeFromEnv({ MELTEMI_LANG: "es", LANG: "en_US.UTF-8" })).toBe("es");
    expect(localeFromEnv({ LC_ALL: "es_CL.UTF-8" })).toBe("es");
    expect(localeFromEnv({ LANG: "C.UTF-8" })).toBeUndefined();
    expect(localeFromEnv({ LANG: "POSIX", LC_MESSAGES: "es_ES" })).toBe("es");
    expect(localeFromEnv({})).toBeUndefined();
  });

  it("keeps the interface language of the process", () => {
    expect(getLocale()).toBe("en");
    setLocale("es");
    expect(getLocale()).toBe("es");
  });
});

describe("catalogs", () => {
  const en = { hello: "Hello", count: (n: number) => `${n} files` };
  const es: typeof en = { hello: "Hola", count: (n: number) => `${n} archivos` };
  const t = catalog(en, es);

  it("gives the catalog of a locale, by default the interface's", () => {
    expect(t().hello).toBe("Hello");
    expect(t("es").count(2)).toBe("2 archivos");
    setLocale("es");
    expect(t().hello).toBe("Hola");
    expect(t("en").hello).toBe("Hello");
  });

  it("finds the strings a Spanish catalog leaves in English", () => {
    const english = { menu: { undo: "Undo", svg: "SVG", zoom: "Zoom" }, ok: "OK" };
    const spanish: typeof english = {
      menu: { undo: "Undo", svg: "SVG", zoom: "Zoom" },
      ok: "Aceptar",
    };
    expect(untranslated(english, spanish)).toEqual(["menu.undo", "menu.svg", "menu.zoom"]);
    expect(untranslated(english, spanish, ["SVG", "menu.zoom"])).toEqual(["menu.undo"]);
  });
});

describe("formatting", () => {
  it("picks plural forms", () => {
    const forms = { one: "problem", other: "problems" };
    expect(plural("en", 1, forms)).toBe("problem");
    expect(plural("en", 2, forms)).toBe("problems");
    expect(plural("es", 1, { one: "problema", other: "problemas" })).toBe("problema");
    expect(plural("es", 0, { one: "problema", other: "problemas" })).toBe("problemas");
  });

  it("joins lists and writes numbers as each language does", () => {
    expect(list("en", ["A", "B", "C"])).toBe("A, B, and C");
    expect(list("es", ["A", "B", "C"])).toBe("A, B y C");
    expect(list("es", ["A", "B"], "disjunction")).toBe("A o B");
    expect(decimal("en", 1.25)).toBe("1.3");
    expect(decimal("es", 1.2)).toBe("1,2");
    expect(decimal("es", 12000)).toBe("12000");
    expect(seconds("es", 1200)).toBe("1,2 s");
    expect(seconds("en", 800)).toBe("0.8 s");
    expect(percent("en", 0.55)).toBe("55%");
    // A no-break space before the sign, as Spanish typography asks.
    expect(percent("es", 0.55)).toBe("55\u00a0%");
  });
});
