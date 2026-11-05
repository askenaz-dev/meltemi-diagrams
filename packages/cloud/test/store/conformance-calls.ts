// The part of the CloudStore contract that belongs to the idempotency keys, the call windows and the
// last uses of OAuth grants (change agent-mcp): a key claimed once, answered once and repeated, an
// abandoned claim taken over, a day's keys kept and older ones swept (the account's by its next
// claim, everyone's by the cron), the count of a window, a grant's use written at most once in a
// span, and what a deletion clears. Run by `runStoreConformance` over every implementation.

import { describe, expect, it } from "vitest";
import type { CloudStore, KeyClaim } from "../../src/store/types.js";
import { DAY, MINUTE, SECOND, at, sha } from "./fixtures.js";

const claim = (over: Partial<KeyClaim> = {}): KeyClaim => ({
  sub: "u1",
  key: "k1",
  route: "POST /api/projects",
  hash: sha("body"),
  at: at(0),
  ...over,
});

/** Claims with the windows a request at `when` uses: a day kept, a minute for a claim. */
const claimAt = (store: CloudStore, when: number, over: Partial<KeyClaim> = {}) =>
  store.claimKey(claim({ at: at(when), ...over }), at(when - DAY), at(when - MINUTE));

export function defineCallsConformance(get: () => CloudStore): void {
  describe("idempotency keys", () => {
    it("claims a key once; a second claim finds it unanswered, then answered", async () => {
      const store = get();
      expect(await claimAt(store, 0)).toEqual({ status: "claimed" });
      expect(await claimAt(store, SECOND)).toEqual({
        status: "kept",
        route: "POST /api/projects",
        hash: sha("body"),
        answer: null,
      });
      await store.keepAnswer("u1", "k1", { status: 201, body: '{"id":"p1"}' });
      expect(await claimAt(store, 2 * SECOND, { hash: sha("other") })).toEqual({
        status: "kept",
        route: "POST /api/projects",
        hash: sha("body"),
        answer: { status: 201, body: '{"id":"p1"}' },
      });
    });

    it("keeps the first answer: a second keepAnswer changes nothing", async () => {
      const store = get();
      await claimAt(store, 0);
      await store.keepAnswer("u1", "k1", { status: 201, body: "first" });
      await store.keepAnswer("u1", "k1", { status: 500, body: "second" });
      const found = await claimAt(store, SECOND);
      expect(found.status === "kept" && found.answer).toEqual({ status: 201, body: "first" });
    });

    it("is per account: another account's same key is its own", async () => {
      const store = get();
      await claimAt(store, 0);
      expect(await claimAt(store, SECOND, { sub: "u2" })).toEqual({ status: "claimed" });
    });

    it("lets go of an unanswered claim, and never of an answered one", async () => {
      const store = get();
      await claimAt(store, 0);
      await store.releaseKey("u1", "k1");
      expect(await claimAt(store, SECOND)).toEqual({ status: "claimed" });
      await store.keepAnswer("u1", "k1", { status: 200, body: "{}" });
      await store.releaseKey("u1", "k1");
      expect((await claimAt(store, 2 * SECOND)).status).toBe("kept");
    });

    it("takes over a claim nobody answered for a minute, and not one a minute old", async () => {
      const store = get();
      await claimAt(store, 0);
      expect((await claimAt(store, MINUTE)).status).toBe("kept");
      expect(await claimAt(store, MINUTE + 1, { hash: sha("retry") })).toEqual({
        status: "claimed",
      });
    });

    it("keeps a key a day; the account's next claim sweeps its older ones", async () => {
      const store = get();
      await claimAt(store, 0);
      await store.keepAnswer("u1", "k1", { status: 201, body: "{}" });
      await claimAt(store, 0, { sub: "u2" });
      expect((await claimAt(store, DAY)).status).toBe("kept");
      // A day and a millisecond later the key is free again, and u1's other keys went with it.
      await claimAt(store, DAY - SECOND, { key: "k2" });
      expect(await claimAt(store, DAY + 1, { key: "k3" })).toEqual({ status: "claimed" });
      expect(await claimAt(store, DAY + 2)).toEqual({ status: "claimed" });
      // u2's key is not u1's to sweep.
      expect((await claimAt(store, SECOND, { sub: "u2" })).status).toBe("kept");
    });

    it("sweeps everyone's keys older than the cron's bound", async () => {
      const store = get();
      await claimAt(store, 0);
      await claimAt(store, 0, { sub: "u2" });
      await claimAt(store, DAY, { sub: "u3" });
      await store.sweepKeys(at(1));
      expect(await claimAt(store, SECOND)).toEqual({ status: "claimed" });
      expect(await claimAt(store, SECOND, { sub: "u2" })).toEqual({ status: "claimed" });
      expect((await claimAt(store, DAY, { sub: "u3" })).status).toBe("kept");
    });

    it("are cleared with the person who made them", async () => {
      const store = get();
      await store.upsertUser(
        { sub: "u1", name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
        at(0),
      );
      await claimAt(store, 0);
      await store.countCall("u1", "call", "2026-10-14T12:00");
      expect(await store.applyUserDeleted("evt-calls", "u1", at(SECOND))).toBe("applied");
      expect(await claimAt(store, 2 * SECOND)).toEqual({ status: "claimed" });
      expect(await store.countCall("u1", "call", "2026-10-14T12:00")).toBe(1);
    });
  });

  describe("call windows", () => {
    it("count a window's calls by account and kind, and start again in the next window", async () => {
      const store = get();
      expect(await store.countCall("u1", "call", "2026-10-14T12:00")).toBe(1);
      expect(await store.countCall("u1", "call", "2026-10-14T12:00")).toBe(2);
      expect(await store.countCall("u1", "preview", "2026-10-14T12:00")).toBe(1);
      expect(await store.countCall("u2", "call", "2026-10-14T12:00")).toBe(1);
      expect(await store.countCall("u1", "call", "2026-10-14T12:01")).toBe(1);
      expect(await store.countCall("u1", "call", "2026-10-14T12:01")).toBe(2);
    });

    it("count calls that race without losing one", async () => {
      const store = get();
      const counts = await Promise.all(
        Array.from({ length: 20 }, () => store.countCall("u1", "call", "2026-10-14T12:00")),
      );
      expect([...counts].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
    });
  });

  describe("the last uses of grants", () => {
    const HOUR = 60 * MINUTE;

    it("record a grant's use, written again only once the last is older than the span", async () => {
      const store = get();
      expect(await store.appUses("u1")).toEqual(new Map());
      await store.touchApp("u1", "g1", at(0), at(-HOUR));
      await store.touchApp("u1", "g1", at(MINUTE), at(MINUTE - HOUR));
      expect(await store.appUses("u1")).toEqual(new Map([["g1", at(0)]]));
      await store.touchApp("u1", "g1", at(HOUR + SECOND), at(SECOND));
      await store.touchApp("u1", "g2", at(HOUR + SECOND), at(SECOND));
      await store.touchApp("u2", "g1", at(5 * SECOND), at(5 * SECOND - HOUR));
      expect(await store.appUses("u1")).toEqual(
        new Map([
          ["g1", at(HOUR + SECOND)],
          ["g2", at(HOUR + SECOND)],
        ]),
      );
      expect(await store.appUses("u2")).toEqual(new Map([["g1", at(5 * SECOND)]]));
    });

    it("forget the grants named, of the account named, and nothing else", async () => {
      const store = get();
      await store.touchApp("u1", "g1", at(0), at(-HOUR));
      await store.touchApp("u1", "g2", at(0), at(-HOUR));
      await store.touchApp("u2", "g1", at(0), at(-HOUR));
      await store.forgetApps("u1", ["g1", "g9"]);
      await store.forgetApps("u1", []);
      expect(await store.appUses("u1")).toEqual(new Map([["g2", at(0)]]));
      expect(await store.appUses("u2")).toEqual(new Map([["g1", at(0)]]));
    });

    it("are cleared with the person whose grants they were", async () => {
      const store = get();
      await store.upsertUser(
        { sub: "u1", name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
        at(0),
      );
      await store.touchApp("u1", "g1", at(0), at(-HOUR));
      await store.touchApp("u2", "g1", at(0), at(-HOUR));
      expect(await store.applyUserDeleted("evt-apps", "u1", at(SECOND))).toBe("applied");
      expect(await store.appUses("u1")).toEqual(new Map());
      expect(await store.appUses("u2")).toEqual(new Map([["g1", at(0)]]));
    });
  });
}
