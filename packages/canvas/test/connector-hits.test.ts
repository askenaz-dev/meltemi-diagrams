import { describe, expect, it } from "vitest";
import { connectorHitWidth } from "../src/connector-hits.js";

describe("connector stroke reach", () => {
  it("keeps six screen pixels outside each painted edge at every zoom", () => {
    for (const zoom of [0.1, 0.49, 1, 2, 8]) {
      expect(((connectorHitWidth(2, zoom) - 2) * zoom) / 2).toBeCloseTo(6);
    }
  });

  it("retains the painted width and produces a finite value during zero-zoom initialization", () => {
    expect(connectorHitWidth(20, 1)).toBe(32);
    expect(Number.isFinite(connectorHitWidth(2, 0))).toBe(true);
  });
});
