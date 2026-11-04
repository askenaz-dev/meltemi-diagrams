import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { syntheticFont } from "../../../test-support/synthetic-font.js";
import { fontFormat, restrictsEmbedding } from "../src/index.js";
import { createNodeFontLibrary } from "../src/node.js";

describe("project fonts", () => {
  it("registers a font under the family, weight and style it declares", () => {
    const library = createNodeFontLibrary();
    const result = library.addFont(syntheticFont({ family: "Corpus Sans", weight: 700 }), "a.ttf");
    expect(result).toEqual({
      ok: true,
      font: {
        family: "Corpus Sans",
        weight: 700,
        style: "normal",
        format: "truetype",
        restricted: false,
        source: "a.ttf",
      },
    });
    expect(library.projectFonts()).toHaveLength(1);
  });

  it("measures, embeds and outlines with the project font", () => {
    const library = createNodeFontLibrary();
    const data = syntheticFont({ family: "Corpus Sans" });
    library.addFont(data, "a.ttf");
    expect(library.family('"Corpus Sans", "Inter", sans-serif')).toBe("Corpus Sans");
    expect(library.knows("'corpus sans'")).toBe(true);
    // Ten 600-unit glyphs and one 300-unit space at 10 px.
    expect(library.width("Hello world", "Corpus Sans", 400, 10)).toBeCloseTo(63, 5);
    expect(library.capHeight("Corpus Sans", 400)).toBe(0.7);
    expect(library.faces("Corpus Sans", 400, "Hi")).toEqual([
      {
        family: "Corpus Sans",
        weight: 400,
        subset: "a.ttf",
        format: "truetype",
        data,
        unicodeRange: "",
      },
    ]);
    expect(library.outline("H", "Corpus Sans", 400, 10)).toEqual({
      d: "M0.5 0L5.5 0L5.5 -7L0.5 -7Z",
      width: 6,
    });
  });

  it("falls back to bundled families for characters the font lacks", () => {
    const library = createNodeFontLibrary();
    library.addFont(syntheticFont({ family: "Corpus Sans" }), "a.ttf");
    expect(library.uncovered("Hé→", "Corpus Sans")).toEqual([]);
    expect(library.width("é", "Corpus Sans", 400, 10)).toBeGreaterThan(0);
  });

  it("keeps restricted fonts for measurement only", () => {
    const library = createNodeFontLibrary();
    const result = library.addFont(syntheticFont({ family: "Locked", fsType: 2 }), "l.ttf");
    expect(result.ok && result.font.restricted).toBe(true);
    expect(library.embeddable("Locked")).toBe(false);
    expect(library.faces("Locked", 400, "A")).toEqual([]);
    expect(library.width("AA", "Locked", 400, 10)).toBeCloseTo(12, 5);
    expect(restrictsEmbedding(0x0002)).toBe(true);
    expect(restrictsEmbedding(0x0008)).toBe(false);
    expect(restrictsEmbedding(0)).toBe(false);
  });

  it("refuses files that are not fonts and keeps the first copy of a face", () => {
    const library = createNodeFontLibrary();
    expect(library.addFont(new Uint8Array([1, 2, 3, 4]), "x.ttf")).toEqual({
      ok: false,
      message: "The file is not a WOFF2, WOFF, TrueType or OpenType font.",
    });
    library.addFont(syntheticFont({ family: "Twice" }), "first.ttf");
    library.addFont(syntheticFont({ family: "Twice" }), "second.ttf");
    expect(library.projectFonts().map((f) => f.source)).toEqual(["first.ttf"]);
    expect(fontFormat(new TextEncoder().encode("wOF2...."))).toBe("woff2");
    expect(fontFormat(new TextEncoder().encode("OTTO...."))).toBe("opentype");
  });

  it("keeps the corpus fonts equal to the generator's output", () => {
    const corpus = (path: string) =>
      new Uint8Array(readFileSync(join(REPO_ROOT, "corpus", "projects", path)));
    expect(corpus("valid/assets/assets/fonts/CorpusSans-Regular.ttf")).toEqual(
      syntheticFont({ family: "Corpus Sans" }),
    );
    expect(corpus("invalid/asset.font-restricted/assets/fonts/LockedSans-Regular.ttf")).toEqual(
      syntheticFont({ family: "Locked Sans", fsType: 2 }),
    );
  });
});
