import { describe, expect, it } from "vitest";
import { syntheticFont } from "../../../test-support/synthetic-font.js";
import { BUNDLED_FAMILIES, FONT_GROUPS, bundledFamily, resolveFontStack } from "../src/index.js";
import { bundledFontFiles, createNodeFontLibrary } from "../src/node.js";

const library = createNodeFontLibrary();

describe("bundled families", () => {
  it("resolves and measures a popular family", () => {
    expect(resolveFontStack('"Roboto", sans-serif')).toBe("Roboto");
    const width = library.width("Diseño", '"Roboto", sans-serif', 500, 14);
    expect(width).toBeGreaterThan(0);
    expect(library.width("Diseño", '"Roboto", sans-serif', 500, 14)).toBe(width);
    expect(library.unmeasured()).toEqual([]);
  });

  it("measures a family with two weights with its nearest file", () => {
    const at = (weight: number) => library.width("Checkout", "Lato", weight, 14);
    expect(at(500)).toBe(at(400));
    expect(at(600)).toBe(at(700));
    expect(at(700)).not.toBe(at(400));
    const faces = library.faces("Lato", 600, "Checkout");
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(face.weight).toBe(700);
      expect(face.weightTo).toBeUndefined();
    }
  });

  it("has every family's subset table and a latin file per weight", () => {
    const paths = new Set(bundledFontFiles().map((f) => f.path));
    expect(BUNDLED_FAMILIES).toHaveLength(17);
    for (const family of BUNDLED_FAMILIES) {
      const { package: name, prefix } = family.subsets;
      expect(paths).toContain(`${name}/unicode.json`);
      for (const weight of family.weights) {
        expect(paths).toContain(`${name}/files/${prefix}-latin-${weight}-normal.woff2`);
      }
      // No weight the table leaves out is shipped.
      for (const weight of [400, 500, 600, 700].filter((w) => !family.weights.includes(w))) {
        expect(paths).not.toContain(`${name}/files/${prefix}-latin-${weight}-normal.woff2`);
      }
    }
  });
});

describe("family catalogue", () => {
  it("lists the bundled families by group", () => {
    const families = createNodeFontLibrary().families();
    expect(families).toHaveLength(17);
    expect(families.slice(0, 8).every((f) => f.group === "sans")).toBe(true);
    expect(families[0]!.family).toBe("Inter");
    expect(families.map((f) => f.group)).toEqual(
      [...families.map((f) => f.group)].sort(
        (a, b) => FONT_GROUPS.indexOf(a as never) - FONT_GROUPS.indexOf(b as never),
      ),
    );
    const named = (name: string) => families.find((f) => f.family === name)!;
    expect(named("Roboto Mono")).toMatchObject({ group: "mono", weights: [400, 500, 600, 700] });
    expect(named("Comic Neue")).toMatchObject({ group: "hand", weights: [400, 700] });
    expect(named("Merriweather")).toMatchObject({ group: "serif" });
    expect(families.every((f) => f.license === "OFL-1.1" && f.source === "bundled")).toBe(true);
  });

  it("lists a project font last, in its own group", () => {
    const withProject = createNodeFontLibrary();
    withProject.addFont(syntheticFont({ family: "Company Sans", fsType: 2 }), "c.ttf");
    const last = withProject.families().at(-1)!;
    expect(last).toMatchObject({
      family: "Company Sans",
      group: "project",
      source: "project",
      restricted: true,
      weights: [400],
    });
  });

  it("knows nothing of a family that is not bundled", () => {
    expect(bundledFamily("Arial")).toBeUndefined();
    expect(library.knows("Arial, sans-serif")).toBe(false);
  });
});
