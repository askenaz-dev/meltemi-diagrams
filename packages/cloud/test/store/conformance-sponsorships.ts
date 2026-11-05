// The part of the CloudStore contract that belongs to sponsorships (change unbranded-by-donation):
// a delivery kept once, the status of the newest sponsorship of a login and kind, the claim that
// grants `unbranded-exports` with its log entry in one atomic step and only once, the list, and what
// a deletion clears. Run by `runStoreConformance` (conformance.ts) over every implementation.

import { beforeEach, describe, expect, it } from "vitest";
import {
  GITHUB_SPONSORS,
  type AdminLogEntry,
  type CloudStore,
  type NewSponsorship,
} from "../../src/store/types.js";
import { DAY, HOUR, MINUTE, at, present, sha } from "./fixtures.js";

/** The `n`th sponsorship, by `ana` unless it says otherwise, created `n` minutes in. */
const aSponsorship = (n: number, over: Partial<NewSponsorship> = {}): NewSponsorship => ({
  id: sha(`sponsorship/${n}`).slice(0, 32),
  deliveryId: `delivery-${n}`,
  login: "ana",
  sponsorId: 1000 + n,
  sponsorType: "User",
  oneTime: false,
  amountCents: 500,
  privacy: "public",
  createdAt: at(n * MINUTE),
  ...over,
});

let logged = 0;
/** The log entry of a claim by the login `login` for `sub` at `when`. */
const claimEntry = (sub: string, when: string, login = "ana"): AdminLogEntry => ({
  id: sha(`sponsorship-log/${logged++}`).slice(0, 32),
  at: when,
  bySub: GITHUB_SPONSORS,
  action: "grant",
  targetSub: sub,
  targetEmail: null,
  detail: `unbranded-exports (${login})`,
});

export function defineSponsorshipConformance(get: () => CloudStore): void {
  describe("sponsorships", () => {
    let store: CloudStore;

    beforeEach(() => {
      store = get();
    });

    const person = async (sub: string) =>
      store.upsertUser(
        { sub, name: sub, picture: "", email: `${sub}@example.com`, emailVerified: true },
        at(0),
      );

    it("keeps a sponsorship unclaimed and active, and refuses a repeated delivery id", async () => {
      expect(await store.recordSponsorship(aSponsorship(1, { oneTime: true }))).toBe("recorded");
      expect(
        await store.recordSponsorship(aSponsorship(2, { deliveryId: "delivery-1", login: "ben" })),
      ).toBe("repeated");
      expect(await store.sponsorships(50)).toEqual([
        {
          ...aSponsorship(1, { oneTime: true }),
          status: "active",
          claimedBy: null,
          claimedAt: null,
        },
      ]);
    });

    it("lists the newest first, as many as asked", async () => {
      await store.recordSponsorship(aSponsorship(1));
      await store.recordSponsorship(aSponsorship(3, { login: "ben" }));
      await store.recordSponsorship(aSponsorship(2, { login: "carla" }));
      expect((await store.sponsorships(50)).map((s) => s.login)).toEqual(["ben", "carla", "ana"]);
      expect((await store.sponsorships(2)).map((s) => s.login)).toEqual(["ben", "carla"]);
    });

    it("updates the newest sponsorship of the login and kind, ignoring case, and keeps a cancelled one cancelled", async () => {
      await store.recordSponsorship(aSponsorship(1, { oneTime: true }));
      await store.recordSponsorship(aSponsorship(2));
      await store.recordSponsorship(aSponsorship(3));

      expect(await store.updateSponsorship("ANA", false, "pending-cancellation", "private")).toBe(
        true,
      );
      const status = async () =>
        Object.fromEntries((await store.sponsorships(50)).map((s) => [s.id, s.status]));
      expect(await status()).toEqual({
        [aSponsorship(1).id]: "active",
        [aSponsorship(2).id]: "active",
        [aSponsorship(3).id]: "pending-cancellation",
      });
      expect((await store.sponsorships(1))[0]?.privacy).toBe("private");

      expect(await store.updateSponsorship("ana", false, "cancelled", "private")).toBe(true);
      // Out of order, or after the end: a cancelled sponsorship stays cancelled.
      expect(await store.updateSponsorship("ana", false, "active", "public")).toBe(false);
      expect((await status())[aSponsorship(3).id]).toBe("cancelled");
      expect(await store.updateSponsorship("nobody", false, "cancelled", "public")).toBe(false);
    });

    it("finds the earliest unclaimed sponsorship of a person by login, ignoring case, and never an organisation's", async () => {
      await store.recordSponsorship(aSponsorship(2, { login: "Ana" }));
      await store.recordSponsorship(aSponsorship(1, { login: "ana" }));
      await store.recordSponsorship(
        aSponsorship(3, { login: "acme", sponsorType: "Organization" }),
      );
      expect((await store.unclaimedSponsorship("ANA"))?.id).toBe(aSponsorship(1).id);
      expect(await store.unclaimedSponsorship("acme")).toBeUndefined();
      expect(await store.unclaimedSponsorship("an")).toBeUndefined();
    });

    it("claims every unclaimed sponsorship of the login, grants the permission and logs it, in one step", async () => {
      await person("u1");
      await store.recordSponsorship(aSponsorship(1));
      await store.recordSponsorship(aSponsorship(2, { login: "ANA", oneTime: true }));
      await store.recordSponsorship(aSponsorship(3, { login: "ben" }));
      const entry = claimEntry("u1", at(HOUR));

      expect(await store.claimSponsorship("Ana", "u1", at(HOUR), entry)).toBe(true);

      const user = present(await store.user("u1"));
      expect([user.unbrandedExports, user.unbrandedExportsBy, user.unbrandedExportsAt]).toEqual([
        true,
        GITHUB_SPONSORS,
        at(HOUR),
      ]);
      const claimed = Object.fromEntries(
        (await store.sponsorships(50)).map((s) => [s.login, [s.claimedBy, s.claimedAt]]),
      );
      expect(claimed).toEqual({
        ana: ["u1", at(HOUR)],
        ANA: ["u1", at(HOUR)],
        ben: [null, null],
      });
      expect(await store.adminLog(50)).toEqual([entry]);
      expect(await store.unclaimedSponsorship("ana")).toBeUndefined();
      expect((await store.entitledUsers()).map((u) => u.sub)).toEqual(["u1"]);
    });

    it("never claims a claimed sponsorship again: a second claim writes nothing, even at the same instant", async () => {
      await person("u1");
      await person("u2");
      await store.recordSponsorship(aSponsorship(1));
      expect(await store.claimSponsorship("ana", "u1", at(HOUR), claimEntry("u1", at(HOUR)))).toBe(
        true,
      );

      expect(await store.claimSponsorship("ana", "u2", at(HOUR), claimEntry("u2", at(HOUR)))).toBe(
        false,
      );
      expect(await store.claimSponsorship("ana", "u1", at(HOUR), claimEntry("u1", at(HOUR)))).toBe(
        false,
      );

      expect(present(await store.user("u2")).unbrandedExports).toBe(false);
      expect((await store.sponsorships(50))[0]?.claimedBy).toBe("u1");
      expect(await store.adminLog(50)).toHaveLength(1);
    });

    it("lets one of two claims racing for the same sponsorship win", async () => {
      await person("u1");
      await person("u2");
      await store.recordSponsorship(aSponsorship(1));
      const results = await Promise.all([
        store.claimSponsorship("ana", "u1", at(HOUR), claimEntry("u1", at(HOUR))),
        store.claimSponsorship("ana", "u2", at(HOUR), claimEntry("u2", at(HOUR))),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await store.adminLog(50)).toHaveLength(1);
      expect((await store.entitledUsers()).map((u) => u.sub)).toHaveLength(1);
    });

    it("claims nothing for a person with no row, nor without a sponsorship", async () => {
      await store.recordSponsorship(aSponsorship(1));
      expect(
        await store.claimSponsorship("ana", "nobody", at(HOUR), claimEntry("nobody", at(HOUR))),
      ).toBe(false);
      await person("u1");
      expect(
        await store.claimSponsorship("ben", "u1", at(HOUR), claimEntry("u1", at(HOUR), "ben")),
      ).toBe(false);
      expect(await store.adminLog(50)).toEqual([]);
      expect((await store.sponsorships(50))[0]?.claimedBy).toBeNull();
      expect(present(await store.user("u1")).unbrandedExports).toBe(false);
    });

    it("claims a cancelled sponsorship too: the person donated", async () => {
      await person("u1");
      await store.recordSponsorship(aSponsorship(1));
      await store.updateSponsorship("ana", false, "cancelled", "public");
      expect(await store.claimSponsorship("ana", "u1", at(HOUR), claimEntry("u1", at(HOUR)))).toBe(
        true,
      );
      expect((await store.sponsorships(50))[0]).toMatchObject({
        status: "cancelled",
        claimedBy: "u1",
      });
    });

    it("keeps the grant when the sponsorship is cancelled after the claim", async () => {
      await person("u1");
      await store.recordSponsorship(aSponsorship(1));
      await store.claimSponsorship("ana", "u1", at(HOUR), claimEntry("u1", at(HOUR)));
      expect(await store.updateSponsorship("ana", false, "cancelled", "public")).toBe(true);
      expect(present(await store.user("u1")).unbrandedExports).toBe(true);
    });

    it("clears the claims of an account, by itself or with the account's deletion, so another account may claim", async () => {
      await person("u1");
      await person("u2");
      await store.recordSponsorship(aSponsorship(1));
      await store.recordSponsorship(aSponsorship(2, { login: "ben" }));
      await store.claimSponsorship("ana", "u1", at(HOUR), claimEntry("u1", at(HOUR)));
      await store.claimSponsorship("ben", "u2", at(HOUR), claimEntry("u2", at(HOUR), "ben"));

      await store.clearClaims("u2");
      expect((await store.unclaimedSponsorship("ben"))?.id).toBe(aSponsorship(2).id);

      expect(await store.applyUserDeleted("evt_sponsor", "u1", at(DAY))).toBe("applied");
      const left = await store.sponsorships(50);
      expect(left.map((s) => [s.login, s.claimedBy, s.claimedAt])).toEqual([
        ["ben", null, null],
        ["ana", null, null],
      ]);
      // The log of the claim stays: it is the service's record.
      expect(await store.adminLog(50)).toHaveLength(2);
      await person("u3");
      expect(
        await store.claimSponsorship("ana", "u3", at(2 * DAY), claimEntry("u3", at(2 * DAY))),
      ).toBe(true);
    });
  });
}
