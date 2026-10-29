import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale, untranslated, type Locale } from "@meltemi/diagrams-i18n";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { BUILT_IN_THEMES, compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { gridEngine } from "../../../test-support/grid-engine.js";
import { layoutDiagram, type GroupItem, type LayoutOptions, type SceneItem } from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const measurer = createNodeFontLibrary();

/** Lays out the first diagram of a text with the interface in `locale`. */
function lay(locale: Locale, text: string, options: LayoutOptions = {}) {
  setLocale(locale);
  const compilation = compile(text);
  return layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer, ...options });
}

const sheet = (body: string) => `diagram d: flow {\n  layout manual\n${body}\n}\n`;

/** What a diagnostic says that must not depend on the language. */
const fixed = ({ code, severity, range, data }: Diagnostic) => ({ code, severity, range, data });

/** The diagnostics of a text in English and in Spanish, which differ only in their words. */
function both(text: string, options: LayoutOptions = {}) {
  const english = lay("en", text, options).diagnostics;
  const spanish = lay("es", text, options).diagnostics;
  expect(spanish.map(fixed)).toEqual(english.map(fixed));
  return { english, spanish };
}

function find(list: readonly Diagnostic[], code: string): Diagnostic {
  const found = list.find((d) => d.code === code);
  expect(found, code).toBeDefined();
  return found!;
}

describe("the layout's words", () => {
  afterEach(() => setLocale("en"));

  it("have a Spanish sentence for every English one", () => {
    expect(untranslated(en, es)).toEqual([]);
  });

  it("tell an overflowing text in Spanish, with the size a fix writes", () => {
    const { english, spanish } = both(
      sheet(
        '  api["API Gateway"]\n  placement {\n    place api at (100, 100)\n    size api (80, 56)\n  }',
      ),
    );
    const before = find(english, "layout.text-overflow");
    const after = find(spanish, "layout.text-overflow");
    expect(before.message).toBe('`api` is 80 px wide but its text "API Gateway" needs 112 px.');
    expect(after.message).toBe(
      '`api` mide 80 px de ancho, pero su texto "API Gateway" necesita 112 px.',
    );
    expect(after.hints).toEqual(["Usa `size api (112, 56)` o acorta el texto."]);
    expect(after.data).toEqual({
      ids: ["api"],
      size: { element: "api", width: 112, height: 56 },
    });
  });

  it("tell a sticky whose text is clipped in Spanish, with the size a fix writes", () => {
    const text = Array.from({ length: 400 }, (_, i) => ["move", "the", "cache"][i % 3]).join(" ");
    const { english, spanish } = both(
      `diagram d: free {\n  sticky s "${text}"\n  placement {\n    place s at (100, 100)\n  }\n}\n`,
    );
    const before = find(english, "layout.text-overflow");
    const after = find(spanish, "layout.text-overflow");
    const { width, height } = before.data!.size as { width: number; height: number };
    expect(width).toBe(height);
    expect(before.message).toBe(
      `The text of \`s\` does not fit its 160 × 160 px card even at 8 px, and is clipped: it needs ${width} × ${height} px.`,
    );
    expect(after.message).toBe(
      `El texto de \`s\` no cabe en su tarjeta de 160 × 160 px ni a 8 px, y se recorta: necesita ${width} × ${height} px.`,
    );
    expect(after.hints).toEqual([`Usa \`size s (${width}, ${height})\` o acorta el texto.`]);
  });

  it("tell a place that a list ignores in Spanish, with the ids a fix reads", () => {
    const { english, spanish } = both(
      'diagram d: free {\n  group todo "To do" {\n    layout column\n    sticky a "A"\n  }\n  placement {\n    place todo at (300, 300)\n    place a at (40, 40)\n  }\n}\n',
    );
    const before = find(english, "layout.place-ignored");
    const after = find(spanish, "layout.place-ignored");
    expect(before.severity).toBe("warning");
    expect(after.message).toBe(
      "Se ignora el `place` de `a`: la lista `todo` coloca a sus hijos en orden.",
    );
    expect(after.hints).toEqual([
      "Quita `place a`, o quita `layout` de `todo` para colocar tú a sus hijos.",
    ]);
    expect(after.data).toEqual({ ids: ["a", "todo"] });
  });

  it("tell what a plain group in a list holds without a place in Spanish", () => {
    const { spanish } = both(
      'diagram d: free {\n  group col "Column" {\n    layout column\n    group g "G" {\n      box a "A"\n    }\n  }\n  placement {\n    place col at (300, 300)\n  }\n}\n',
    );
    const missing = find(spanish, "layout.missing-placement");
    expect(missing.message).toBe(
      "`a` no tiene una instrucción `place`; dentro de la lista `col`, el grupo `g` no es una lista y necesita una posición para cada hijo.",
    );
    expect(missing.hints).toEqual(["Agrega `place a at (x, y)` a un bloque `placement`."]);
  });

  it("tell a text that needs a taller shape in Spanish", () => {
    const { english, spanish } = both(
      sheet(
        '  a["A"]\n  b["Payments reconciliation"]\n  style a { shape ellipse }\n  style b { shape diamond }\n  placement {\n    place a at (300, 100)\n    size a (600, 14)\n    place b at (300, 300)\n    size b (40, 14)\n  }',
      ),
    );
    const [tall, grown] = english.filter((d) => d.code === "layout.text-overflow");
    const [alto, crecido] = spanish.filter((d) => d.code === "layout.text-overflow");
    const fit = (d: Diagnostic) => d.data!.size as { width: number; height: number };
    const a = fit(tall!);
    expect(a.width).toBe(600);
    expect(tall!.message).toBe(`\`a\` is 14 px tall but its text "A" needs ${a.height} px.`);
    expect(alto!.message).toBe(
      `\`a\` mide 14 px de alto, pero su texto "A" necesita ${a.height} px.`,
    );
    expect(alto!.hints).toEqual([`Usa \`size a (600, ${a.height})\` o acorta el texto.`]);
    const b = fit(grown!);
    expect(crecido!.message).toBe(
      `\`b\` mide 40 × 14 px, pero su texto "Payments reconciliation" necesita ${b.width} × ${b.height} px.`,
    );
  });

  it("tell a stack declared inner first in Spanish, with the order that fixes it", () => {
    const { english, spanish } = both(
      sheet(
        '  inner[""]\n  outer[""]\n  placement {\n    place inner at (300, 200)\n    size inner (150, 130)\n    place outer at (300, 200)\n    size outer (260, 240)\n  }',
      ),
    );
    expect(find(english, "layout.overlap").hints).toEqual([
      "Declare `outer` before `inner` to draw a stack.",
    ]);
    expect(find(spanish, "layout.overlap").hints).toEqual([
      "Declara `outer` antes de `inner` para dibujar una pila.",
    ]);
  });

  it("tell overlapping boxes in Spanish, with the ids they name", () => {
    const { english, spanish } = both(
      sheet(
        '  a["A"]\n  b["B"]\n  placement {\n    place a at (100, 100)\n    place b at (120, 110)\n  }',
      ),
    );
    expect(find(english, "layout.overlap").message).toBe("`a` and `b` overlap.");
    const overlap = find(spanish, "layout.overlap");
    expect(overlap.message).toBe("`a` y `b` se superponen.");
    expect(overlap.data).toEqual({ ids: ["a", "b"] });
  });

  it("tell an unknown theme in Spanish, with the candidates a fix offers", () => {
    const { english, spanish } = both(
      sheet('  theme "corporate"\n  api["API"]\n  placement { place api at (100, 100) }'),
    );
    expect(find(english, "layout.unknown-theme").message).toMatch(
      /^Unknown theme "corporate"; rendering with /,
    );
    const theme = find(spanish, "layout.unknown-theme");
    expect(theme.message).toMatch(/^Tema desconocido "corporate"; se dibuja con [a-z.]+\.$/);
    expect(theme.hints).toEqual([`Temas integrados: ${BUILT_IN_THEMES.join(", ")}.`]);
    expect(theme.data).toEqual({ candidates: [...BUILT_IN_THEMES] });
  });

  it("keep the words of drawings in the content language, whatever the interface's", () => {
    const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
    const texts = (items: readonly SceneItem[], id: string): string[] => {
      for (const item of items) {
        if (item.kind !== "group") continue;
        if (item.id === id && item.role === "element") {
          return (item as GroupItem).items.flatMap((i) => (i.kind === "text" ? [i.text] : []));
        }
        const inner = texts(item.items, id);
        if (inner.length > 0) return inner;
      }
      return [];
    };
    const view = (locale?: Locale) => {
      setLocale("es");
      const compilation = compile(commerce);
      const diagram = compilation.document.diagrams.find((d) => d.id === "containers")!;
      const options: LayoutOptions = { engine: gridEngine, ...(locale ? { locale } : {}) };
      return layoutDiagram(compilation, diagram, options).scene!;
    };
    expect(texts(view().items, "shop.web")).toEqual(["Web", "[Container: React]"]);
    expect(texts(view("en").items, "shop.web")).toEqual(["Web", "[Container: React]"]);
    expect(texts(view("es").items, "shop.web")).toEqual(["Web", "[Contenedor: React]"]);
  });
});
