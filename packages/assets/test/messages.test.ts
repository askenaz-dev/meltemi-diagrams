import { afterEach, describe, expect, it } from "vitest";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import {
  IconifyPack,
  compareLocks,
  parseXml,
  readImage,
  sanitizeSvg,
  type AssetLock,
  type IconifyJson,
} from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

/** What `run` gives with the interface in English, then in Spanish. */
function both<T>(run: () => T): { english: T; spanish: T } {
  setLocale("en");
  const english = run();
  setLocale("es");
  const spanish = run();
  return { english, spanish };
}

const encode = (text: string) => new TextEncoder().encode(text);
const LIMITS = { maxElements: 100, maxDepth: 8 };
const SCRIPT = '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M4 4h16v16H4z"/></svg>';

describe("the words of assets", () => {
  afterEach(() => setLocale("en"));

  it("have a Spanish sentence for every English one", () => {
    expect(untranslated(en, es)).toEqual([]);
  });

  it("tell why an icon cannot be used in Spanish, with the same reason", () => {
    const { english, spanish } = both(() => sanitizeSvg(SCRIPT));
    expect(english).toEqual({
      ok: false,
      problem: { reason: "unsafe", message: "`<script>` is not allowed in icons." },
    });
    expect(spanish).toEqual({
      ok: false,
      problem: { reason: "unsafe", message: "`<script>` no se permite en los iconos." },
    });
    expect(both(() => sanitizeSvg('<svg><path d="M0 0h1"/></svg>')).spanish).toEqual({
      ok: false,
      problem: {
        reason: "invalid",
        message: "El icono no tiene `viewBox`, `width` ni `height` legibles.",
      },
    });
    const json: IconifyJson = {
      prefix: "brand",
      icons: { broken: {} as IconifyJson["icons"][string] },
      aliases: { orphan: { parent: "missing" } },
    };
    const pack = () => new IconifyPack(json, "assets/icons/brand.json");
    expect(both(() => pack().icon("orphan")).spanish).toEqual({
      ok: false,
      problem: { reason: "invalid", message: "El alias `orphan` no tiene un icono padre." },
    });
    expect(both(() => pack().icon("broken")).spanish).toEqual({
      ok: false,
      problem: { reason: "invalid", message: "El icono `broken` no tiene `body`." },
    });
  });

  it("tell why an SVG file cannot be read in Spanish", () => {
    const doctype = both(() => parseXml('<!DOCTYPE svg [<!ENTITY a "x">]><svg/>', LIMITS));
    expect(doctype.english).toMatchObject({ ok: false, reason: "unsafe" });
    expect(doctype.spanish).toEqual({
      ok: false,
      reason: "unsafe",
      message: "No se permiten DTD ni declaraciones de entidades (`<!DOCTYPE`, `<!ENTITY`).",
    });
    expect(both(() => parseXml("<a><b></a>", LIMITS)).spanish).toEqual({
      ok: false,
      reason: "invalid",
      message: "La etiqueta de cierre `</a>` no coincide con su etiqueta de apertura.",
    });
  });

  it("tell why an image cannot be used in Spanish", () => {
    expect(both(() => readImage(encode("hello"))).spanish).toEqual({
      ok: false,
      message: "El archivo no es una imagen PNG, JPEG, GIF, WebP o SVG.",
    });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const broken = both(() => readImage(png));
    expect(broken.english).toEqual({
      ok: false,
      message: "The PNG header is broken or truncated.",
    });
    expect(broken.spanish).toEqual({
      ok: false,
      message: "La cabecera PNG está dañada o incompleta.",
    });
    const svg = both(() => readImage(encode(SCRIPT)));
    expect(svg.english).toEqual({
      ok: false,
      message: "Its SVG cannot be sanitised: `<script>` is not allowed in icons.",
    });
    expect(svg.spanish).toEqual({
      ok: false,
      message: "No se puede sanear su SVG: `<script>` no se permite en los iconos.",
    });
  });

  it("tell what changed since the lock was written in Spanish", () => {
    const written: AssetLock = {
      lockVersion: 1,
      icons: { brand: { version: null, source: "assets/icons/brand.json", license: "MIT" } },
      fonts: { "assets/fonts/a.ttf": { family: "A", license: "OFL-1.1", integrity: "x" } },
      plugins: { erd: { version: "1.0.0", path: "plugins/erd", integrity: "y" } },
    };
    const current: AssetLock = {
      lockVersion: 1,
      icons: { brand: { version: "2.0.0", source: "assets/icons/brand.json", license: "MIT" } },
      fonts: {},
      plugins: { erd: { version: "1.0.0", path: "vendor/erd", integrity: "y" } },
    };
    const { english, spanish } = both(() => compareLocks(written, current));
    expect(english).toEqual([
      "icon pack `brand` changed version from none to 2.0.0",
      "font `assets/fonts/a.ttf` is locked but no longer exists",
      "plugin `erd` moved to vendor/erd",
    ]);
    expect(spanish).toEqual([
      "el paquete de iconos `brand` cambió de versión, de ninguna a 2.0.0",
      "la fuente `assets/fonts/a.ttf` está en el archivo de bloqueo, pero ya no existe",
      "el plugin `erd` se movió a `vendor/erd`",
    ]);
  });
});
