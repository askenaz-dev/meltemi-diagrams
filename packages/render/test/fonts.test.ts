import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { embeddableFaces, fontFaceRule, fontFaceRules, renderSvg } from "../src/index.js";

const library = createNodeFontLibrary();

function scene(source: string) {
  const compilation = compile(source);
  return layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer: library })
    .scene!;
}

const SMALL = scene(
  'theme plain { extends "technical.light"; frame none }\ndiagram d: flow {\n  layout manual\n  theme "plain"\n  api["API Gateway"]\n  tag pci "PCI"\n  placement {\n    place api at (100, 60)\n    place pci at (100, 20)\n  }\n}\n',
);

describe("font policies", () => {
  it("embeds the bundled subsets the text uses", () => {
    const svg = renderSvg(SMALL, { fonts: "embedded", provider: library });
    expect(svg.match(/<style>/g)).toHaveLength(1);
    expect(svg).toContain(
      '@font-face{font-family:"Inter";font-weight:600;src:url(data:font/woff2;base64,',
    );
    expect(svg).toContain('@font-face{font-family:"Cascadia Mono";font-weight:500;');
    expect(svg).toContain("unicode-range:U+20,U+41,U+47,U+49,U+50,U+61,U+65,U+74,U+77,U+79}");
    expect(svg).toContain(">API Gateway</text>");
  });

  it("lists the faces of several scenes once, covering the text of all", () => {
    const other = scene(
      'diagram e: flow {\n  layout manual\n  db["Zona"]\n  placement {\n    place db at (80, 40)\n  }\n}\n',
    );
    const faces = embeddableFaces([SMALL, other], library);
    const keys = faces.map((f) => `${f.family}|${f.weight}|${f.subset}`);
    expect(new Set(keys).size).toBe(keys.length);
    const inter = faces.find((f) => f.family === "Inter" && f.weight === 600)!;
    expect(inter.unicodeRange).toContain("U+5A");
    expect(inter.unicodeRange).toContain("U+47");
    expect(fontFaceRules(SMALL, library)).toEqual(
      embeddableFaces([SMALL], library).map(fontFaceRule),
    );
  });

  it("outlines text as paths with accessible labels", () => {
    const svg = renderSvg(SMALL, { fonts: "outlined", provider: library });
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("<style");
    expect(svg).toContain('aria-label="API Gateway"');
    expect(svg).toContain('aria-label="PCI"');
  });

  it("centres outlined text on its anchor", () => {
    const svg = renderSvg(SMALL, { fonts: "outlined", provider: library });
    const width = library.outline("API Gateway", "Inter", 600, 13).width;
    const match =
      /<path transform="translate\(([\d.]+) [\d.]+\)" d="[^"]*" fill="[^"]*" aria-label="API Gateway"/.exec(
        svg,
      );
    expect(match).not.toBeNull();
    const api = SMALL.items.find((i) => i.kind === "group" && i.id === "api");
    const text = api && api.kind === "group" ? api.items.find((i) => i.kind === "text") : undefined;
    expect(Number(match![1])).toBeCloseTo((text as { x: number }).x - width / 2, 1);
  });

  it("needs a provider for embedded and outlined fonts", () => {
    expect(() => renderSvg(SMALL, { fonts: "embedded" })).toThrow(/"embedded"/);
    expect(() => renderSvg(SMALL, { fonts: "outlined" })).toThrow(/"outlined"/);
  });

  it("keeps the system policy free of font data", () => {
    const svg = renderSvg(SMALL);
    expect(svg).not.toContain("<style");
    expect(svg).toContain(">API Gateway</text>");
  });

  it("is deterministic", () => {
    const annotations = scene(
      readFileSync(join(CORPUS_ROOT, "valid", "edge", "annotations.meltemi"), "utf8"),
    );
    const first = renderSvg(annotations, { fonts: "embedded", provider: library });
    expect(renderSvg(annotations, { fonts: "embedded", provider: library })).toBe(first);
    const outlined = renderSvg(annotations, { fonts: "outlined", provider: library });
    expect(renderSvg(annotations, { fonts: "outlined", provider: library })).toBe(outlined);
  });
});

describe("a hand font for sketch themes", () => {
  const HAND = scene(
    'diagram d: free {\n  layout manual\n  theme "sketch.light"\n  box a "Pay"\n  box b "Ledger"\n  a -> b: "charge" as pay\n  placement {\n    place a at (100, 60)\n    place b at (400, 60)\n  }\n}\n',
  );

  it("measures with it and reports no unmeasured font", () => {
    expect(HAND.fonts.body.startsWith('"Patrick Hand"')).toBe(true);
    expect(library.unmeasured()).not.toContain("Patrick Hand");
  });

  it("embeds one rule for the family, covering 400 to 700, limited to the characters used", () => {
    const svg = renderSvg(HAND, { fonts: "embedded", provider: library });
    const rules = svg.match(/@font-face\{font-family:"Patrick Hand"[^}]*\}/g) ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain("font-weight:400 700;src:url(data:font/woff2;base64,");
    expect(rules[0]).toMatch(/unicode-range:(U\+[0-9A-F-]+,?)+\}$/);
    // Labels of 600 and descriptions of 400 are one file, and Inter's own weights are untouched.
    expect(svg).toContain('font-weight="600"');
    expect(svg.match(/font-family:"Inter"[^}]*font-weight:(\d+)/g) ?? []).toEqual([]);
  });

  it("outlines every label as a path as wide as it is measured", () => {
    const svg = renderSvg(HAND, { fonts: "outlined", provider: library });
    expect(svg).not.toContain("<text");
    expect(svg).toContain('aria-label="Ledger"');
    const measured = library.outline("Ledger", "Patrick Hand", 600, 13).width;
    expect(measured).toBeCloseTo(library.width("Ledger", HAND.fonts.body, 600, 13), 0);
  });
});
