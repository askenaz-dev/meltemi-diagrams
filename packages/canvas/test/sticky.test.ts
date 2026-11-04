import { STICKY_COLOURS } from "@meltemi/diagrams-editor/canvas";
import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { readStickyFill, stickyColour, stickyColourName } from "../src/sticky.js";

afterEach(() => setLocale("en"));

describe("the colours of sticky notes", () => {
  it("keeps one of the six colours of paper, and the theme's for anything else", () => {
    expect(readStickyFill({ fill: "#f8bbd0" })).toBe("#f8bbd0");
    // Compared without case, and kept as the menu writes it.
    expect(readStickyFill({ fill: "#BBDEFB" })).toBe("#bbdefb");
    expect(readStickyFill({ fill: null })).toBeNull();
    expect(readStickyFill(undefined)).toBeNull();
    expect(readStickyFill({})).toBeNull();
    // A colour of one's own or a token is not a colour of the menu: the theme's.
    expect(readStickyFill({ fill: "#123456" })).toBeNull();
    expect(readStickyFill({ fill: "@sticky" })).toBeNull();
    expect(readStickyFill({ fill: 3 })).toBeNull();
    expect(readStickyFill("pink")).toBeNull();
  });

  it("names the six in both languages, and nothing else", () => {
    expect(STICKY_COLOURS.map((c) => stickyColourName(c.hex))).toEqual([
      ...["Yellow", "Pink", "Green", "Blue", "Orange", "Purple"],
    ]);
    expect(stickyColourName("#F8BBD0")).toBe("Pink");
    expect(stickyColour("#e1bee7")).toEqual({ name: "purple", hex: "#e1bee7" });
    expect(stickyColourName("accent")).toBeUndefined();
    expect(stickyColourName("#fff59e")).toBeUndefined();
    setLocale("es");
    expect(STICKY_COLOURS.map((c) => stickyColourName(c.hex))).toEqual([
      ...["Amarillo", "Rosa", "Verde", "Azul", "Naranja", "Morado"],
    ]);
  });
});
