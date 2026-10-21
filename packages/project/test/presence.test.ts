import { describe, expect, it } from "vitest";
import { PRESENCE_COLOURS, presenceColour, presenceColourIndex } from "../src/index.js";

describe("presenceColour", () => {
  it("hands out one of twelve colours, the same one every time", () => {
    expect(PRESENCE_COLOURS).toHaveLength(12);
    expect(new Set(PRESENCE_COLOURS).size).toBe(12);
    for (const sub of ["u1", "u2", "sub-with-a-long-identifier-0123456789", ""]) {
      expect(PRESENCE_COLOURS).toContain(presenceColour(sub));
      expect(presenceColour(sub)).toBe(presenceColour(sub));
      expect(presenceColourIndex(sub)).toBeGreaterThanOrEqual(0);
      expect(presenceColourIndex(sub)).toBeLessThan(12);
    }
  });

  it("is pinned to FNV-1a, so the room and the pages agree across releases", () => {
    expect(presenceColourIndex("")).toBe(0x811c9dc5 % 12);
    expect(presenceColourIndex("a")).toBe(0xe40c292c % 12);
    expect(presenceColourIndex("u1")).toBe(presenceColourIndex("u1"));
  });

  it("spreads people over most of the palette", () => {
    const used = new Set<number>();
    for (let i = 0; i < 200; i++) used.add(presenceColourIndex(`user-${i}`));
    expect(used.size).toBeGreaterThanOrEqual(10);
  });
});
