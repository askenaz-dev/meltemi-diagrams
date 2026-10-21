import { describe, expect, it } from "vitest";
import { memoryStore } from "../../src/store/memory.js";
import { runStoreConformance } from "./conformance.js";

runStoreConformance("memoryStore", () => ({ store: memoryStore() }));

describe("memoryStore", () => {
  it("gives every call its own store: two stores share nothing", async () => {
    const a = memoryStore();
    const b = memoryStore();
    await a.upsertUser(
      { sub: "u1", name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
      "2026-10-14T12:00:00.000Z",
    );
    await a.createCliCode({
      hash: "a".repeat(64),
      sub: "u1",
      state: "s".repeat(16),
      expiresAt: "2026-10-14T12:05:00.000Z",
    });
    await a.recordCliFailure("caller", "2026-10-14T12:00:00.000Z");
    expect(await b.user("u1")).toBeUndefined();
    expect(await b.takeCliCode("a".repeat(64))).toBeUndefined();
    expect(await b.cliFailuresSince("caller", "2026-10-14T11:00:00.000Z")).toBe(0);
    expect(await b.applyUserDeleted("evt_1", "u1", "2026-10-14T12:00:00.000Z")).toBe("applied");
    expect(await a.applyUserDeleted("evt_1", "u1", "2026-10-14T12:00:00.000Z")).toBe("applied");
  });

  it("refuses a failure stamped with something that is not a time, as d1Store does", async () => {
    await expect(memoryStore().recordCliFailure("caller", "not a time")).rejects.toThrow(
      RangeError,
    );
  });
});
