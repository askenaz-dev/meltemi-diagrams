import type { FontOption } from "@meltemi/diagrams-editor/canvas";
import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { firstFamily, fontRows, fontShown, rowFace, rowFamily } from "../src/font-picker.js";
import { glyphName } from "../src/glyphs.js";

afterEach(() => setLocale("en"));

const family = (name: string, group: FontOption["group"], faces: string[] = []): FontOption => ({
  family: name,
  group,
  weights: [400, 700],
  faces,
});

const FAMILIES: readonly FontOption[] = [
  family("Inter", "sans"),
  family("Roboto", "sans"),
  family("Merriweather", "serif"),
  family("Lora", "serif"),
  family("Roboto Mono", "mono"),
  family("Caveat", "hand"),
  family("Company Sans", "project"),
];

describe("the font picker's rows", () => {
  it("groups the families in the picker's order", () => {
    expect(fontRows(FAMILIES, "").map((g) => [g.group, g.families.map((f) => f.family)])).toEqual([
      ["sans", ["Inter", "Roboto"]],
      ["serif", ["Merriweather", "Lora"]],
      ["mono", ["Roboto Mono"]],
      ["hand", ["Caveat"]],
      ["project", ["Company Sans"]],
    ]);
  });

  it("filters by every word typed, in any case, and leaves empty groups out", () => {
    expect(fontRows(FAMILIES, "mer").map((g) => g.families.map((f) => f.family))).toEqual([
      ["Merriweather"],
    ]);
    expect(fontRows(FAMILIES, "ROBOTO mono")).toEqual([{ group: "mono", families: [FAMILIES[4]] }]);
    expect(fontRows(FAMILIES, "arial")).toEqual([]);
  });
});

describe("the font button", () => {
  const listed = FAMILIES.map((f) => f.family);

  it("shows the written family, the one that applies greyed, custom and mixed", () => {
    expect(fontShown('"Lora", serif', "Inter", false, listed)).toEqual({
      text: "Lora",
      family: "Lora",
      state: "written",
    });
    expect(fontShown(null, "Inter", false, listed)).toEqual({
      text: "Inter",
      family: "Inter",
      state: "inherited",
    });
    expect(fontShown("Georgia, serif", "Inter", false, listed)).toEqual({
      text: "custom",
      state: "custom",
    });
    expect(fontShown(null, undefined, true, listed)).toEqual({ text: "mixed", state: "mixed" });
    // Without a list, a written family is shown as it is.
    expect(fontShown("Georgia", undefined, false, undefined).text).toBe("Georgia");
  });

  it("says custom in Spanish", () => {
    setLocale("es");
    expect(fontShown("Georgia", undefined, false, listed).text).toBe("personalizada");
  });
});

describe("the faces of the rows", () => {
  it("renames a face's family so it never changes the page's other text", () => {
    const rule =
      '@font-face{font-family:"Roboto";font-weight:400;src:url(data:font/woff2;base64,AA) format("woff2")}';
    expect(rowFace(rule)).toBe(
      `@font-face{font-family:"${rowFamily("Roboto")}";font-weight:400;src:url(data:font/woff2;base64,AA) format("woff2")}`,
    );
    expect(firstFamily(" 'Open Sans', sans-serif")).toBe("Open Sans");
  });
});

describe("the weight chips", () => {
  it("are named by weight in both languages", () => {
    expect(["400", "500", "600", "700"].map((w) => glyphName(w, "fontWeight"))).toEqual([
      "Regular",
      "Medium",
      "Semibold",
      "Bold",
    ]);
    setLocale("es");
    expect(["400", "500", "600", "700"].map((w) => glyphName(w, "fontWeight"))).toEqual([
      "Normal",
      "Media",
      "Seminegrita",
      "Negrita",
    ]);
  });
});
