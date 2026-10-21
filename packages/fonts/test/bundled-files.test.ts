import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLED_FAMILIES, FontLibrary } from "../src/index.js";
import { bundledFontFiles, createNodeFontLibrary } from "../src/node.js";

const files = bundledFontFiles();
const paths = new Set(files.map((f) => f.path));

/** A library that can read only the listed files, as a host that ships them. */
function shippedLibrary(): FontLibrary {
  const bytes = new Map(files.map((f) => [f.path, new Uint8Array(readFileSync(f.source))]));
  return new FontLibrary((path) => bytes.get(path));
}

const SAMPLES = ["Checkout API", "Ünïcödé → ∑ 42 ms", "Заказ", "Ελλάδα", "Tiếng Việt", "x"];

describe("bundled font files", () => {
  it("lists the complete files, every subset of the bundled weights and the subset tables", () => {
    for (const family of BUNDLED_FAMILIES) {
      for (const path of Object.values(family.complete ?? {})) expect(paths).toContain(path);
      expect(paths).toContain(`${family.subsets.package}/unicode.json`);
      for (const weight of family.weights) {
        expect(paths).toContain(
          `${family.subsets.package}/files/${family.subsets.prefix}-latin-${weight}-normal.woff2`,
        );
      }
    }
    expect(paths).not.toContain("@fontsource/inter/files/inter-latin-300-normal.woff2");
    expect(files.map((f) => f.path)).toEqual([...paths].sort());
  });

  it("measures and embeds with only those files as with the installed packages", () => {
    const shipped = shippedLibrary();
    const installed = createNodeFontLibrary();
    for (const family of BUNDLED_FAMILIES) {
      for (const weight of family.weights) {
        for (const text of SAMPLES) {
          expect(shipped.width(text, family.family, weight, 14)).toBe(
            installed.width(text, family.family, weight, 14),
          );
          const faces = (library: FontLibrary) =>
            library
              .faces(family.family, weight, text)
              .map((f) => `${f.subset}:${f.unicodeRange}:${f.data.length}`);
          expect(faces(shipped)).toEqual(faces(installed));
        }
      }
    }
    expect(shipped.unmeasured()).toEqual(installed.unmeasured());
  });
});
