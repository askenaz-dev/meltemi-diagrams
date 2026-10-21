import { describe, expect, it } from "vitest";
import * as fontkit from "fontkit";
import { formatUnicodeRange, parseUnicodeRange, resolveFontStack } from "../src/index.js";
import { createNodeFontLibrary } from "../src/node.js";

const library = createNodeFontLibrary();
const INTER = '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", Menlo, monospace';

describe("font stacks", () => {
  it("resolves the first bundled family", () => {
    expect(resolveFontStack(INTER)).toBe("Inter");
    expect(resolveFontStack(MONO)).toBe("Cascadia Mono");
    expect(resolveFontStack("'ibm plex sans', sans-serif")).toBe("IBM Plex Sans");
    expect(resolveFontStack('"Comic Sans MS", cursive')).toBeUndefined();
  });

  it("parses and formats unicode ranges", () => {
    expect(parseUnicodeRange("U+0000-00FF,U+0131, U+02??")).toEqual([
      [0, 0xff],
      [0x131, 0x131],
      [0x200, 0x2ff],
    ]);
    expect(formatUnicodeRange([0x61, 0x41, 0x42, 0x43, 0x61])).toBe("U+41-43,U+61");
  });
});

describe("measured widths", () => {
  it("applies kerning", () => {
    const av = library.width("AV", INTER, 600, 13);
    const avav = library.width("AVAV", INTER, 600, 13);
    expect(avav).toBeLessThan(2 * av);
  });

  it("matches the font's own layout", () => {
    expect(library.width("API Gateway", INTER, 600, 13)).toBeCloseTo(79.66, 1);
  });

  it("uses several script subsets and is stable", () => {
    const first = library.width("Diseño Ωmega", INTER, 400, 13);
    expect(first).toBeGreaterThan(0);
    expect(library.width("Diseño Ωmega", INTER, 400, 13)).toBe(first);
    expect(library.uncovered("Diseño Ωmega", INTER)).toEqual([]);
  });

  it("measures uncovered characters with the average advance and records them", () => {
    const withRocket = library.width("API 🚀", INTER, 400, 13);
    expect(withRocket).toBeGreaterThan(library.width("API ", INTER, 400, 13));
    expect(library.uncovered("API 🚀", INTER)).toEqual(["🚀"]);
    expect(library.unmeasured()).toContain("🚀");
  });

  it("measures arrows with the complete fonts and mono text through the fallback", () => {
    expect(library.uncovered("Client → API", INTER)).toEqual([]);
    expect(library.uncovered("a → b", MONO)).toEqual([]);
    expect(library.width("→", INTER, 400, 13)).toBeGreaterThan(5);
  });

  it("measures monospace text with a constant advance", () => {
    expect(library.width("abcd", MONO, 500, 10)).toBeCloseTo(
      2 * library.width("ab", MONO, 500, 10),
    );
  });

  it("knows only bundled stacks", () => {
    expect(library.knows(INTER)).toBe(true);
    expect(library.knows('"Comic Sans MS"')).toBe(false);
  });
});

describe("vertical metrics", () => {
  it("gives Inter's cap height", () => {
    expect(library.capHeight(INTER, 600)).toBe(Math.round((1490 / 2048) * 10000) / 10000);
  });

  it("falls back to 0.7 for unknown stacks", () => {
    expect(library.capHeight("whatever", 400)).toBe(0.7);
  });
});

describe("subsets and outlines", () => {
  it("embeds the subset files that cover the text, limited to the characters used", () => {
    const faces = library.faces("Inter", 600, "API Ω");
    expect(faces.map((f) => [f.subset, f.format, f.unicodeRange])).toEqual([
      ["greek", "woff2", "U+3A9"],
      ["latin", "woff2", "U+20,U+41,U+49,U+50"],
    ]);
    expect(new TextDecoder().decode(faces[1]!.data.slice(0, 4))).toBe("wOF2");
    const latin = fontkit.create(faces[1]!.data);
    for (const cp of [0x41, 0x49, 0x50]) expect(latin.hasGlyphForCodePoint(cp)).toBe(true);
  });

  it("outlines text as wide as it measures", () => {
    const outline = library.outline("API Gateway", "Inter", 600, 13);
    expect(outline.d.startsWith("M")).toBe(true);
    expect(outline.width).toBeCloseTo(library.width("API Gateway", INTER, 600, 13), 1);
  });
});
