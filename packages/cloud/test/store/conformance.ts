// The contract of `CloudStore` (src/store/types.ts) as one suite, run over every implementation:
// `memoryStore()` in memory.test.ts and `d1Store()` over node:sqlite in d1.test.ts (on the bare
// adapter, and again with a round trip before every statement so that requests started together
// interleave as they do on D1). A behavior the handlers depend on is pinned here once, so the
// in-memory store their tests use cannot drift from the SQL one the Worker uses.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_TOKENS,
  type CliCode,
  type CloudStore,
  type TokenRow,
  type UserProfile,
} from "../../src/store/types.js";
import { defineProjectConformance } from "./conformance-projects.js";
import { defineSharingConformance } from "./conformance-sharing.js";
import { DAY, HOUR, MINUTE, SECOND, at, present, sha } from "./fixtures.js";

/** A store under test. */
export interface StoreUnderTest {
  readonly store: CloudStore;
  /** Releases what the store holds (a database), after each test. */
  close?(): void | Promise<void>;
}

/** What a person's row says of the branding entitlement until an administrator sets it. */
const NOT_ENTITLED = {
  unbrandedExports: false,
  unbrandedExportsBy: null,
  unbrandedExportsAt: null,
} as const;

const aProfile = (over: Partial<UserProfile> = {}): UserProfile => ({
  sub: "u1",
  name: "Ana Dev",
  picture: "https://avatars.githubusercontent.com/u/4242",
  email: "ana@example.com",
  emailVerified: true,
  ...over,
});

/** The `n`th token of `u1`, created `n` seconds in; every `n` gives a different id and hash. */
const aToken = (n: number, over: Partial<TokenRow> = {}): TokenRow => ({
  id: `t${n}`,
  sub: "u1",
  name: `token ${n}`,
  hash: sha(`mdg_token_${n}`),
  createdAt: at(n * SECOND),
  lastUsedAt: null,
  ...over,
});

/** The `n`th approval code of `u1`, valid for five minutes. */
const aCode = (n: number, over: Partial<CliCode> = {}): CliCode => ({
  hash: sha(`code_${n}`),
  sub: "u1",
  state: `state-${n}`.padEnd(24, "x"),
  expiresAt: at(5 * MINUTE),
  ...over,
});

/** Runs the contract over the store `factory` makes (a fresh, empty one for each test). */
export function runStoreConformance(
  name: string,
  factory: () => StoreUnderTest | Promise<StoreUnderTest>,
): void {
  describe(`${name}: the CloudStore contract`, () => {
    let under: StoreUnderTest;
    let store: CloudStore;

    beforeEach(async () => {
      under = await factory();
      store = under.store;
    });

    afterEach(async () => {
      await under.close?.();
    });

    /** Gives `sub` tokens `sub-1` to `sub-<count>`, created a second apart, with no limit. */
    const hold = async (sub: string, count: number) => {
      for (let n = 1; n <= count; n++) {
        const token = aToken(n, { id: `${sub}-${n}`, sub, hash: sha(`${sub}/${n}`) });
        expect(await store.createToken(token, 1000)).toBe("created");
      }
    };

    /** A token of `sub` that is not among the ones `hold` makes. */
    const extra = (sub: string, n = 0): TokenRow =>
      aToken(100 + n, { id: `${sub}-extra-${n}`, sub, hash: sha(`${sub}/extra/${n}`) });

    /** A person with a profile, two tokens (`<sub>-t1`, `<sub>-t2`) and an approval code. */
    const seed = async (sub: string, ms = 0) => {
      await store.upsertUser(
        aProfile({ sub, name: `Person ${sub}`, email: `${sub}@example.com` }),
        at(ms),
      );
      for (const n of [1, 2]) {
        const token = aToken(n, { id: `${sub}-t${n}`, sub, hash: sha(`${sub}/token/${n}`) });
        expect(await store.createToken(token, MAX_TOKENS)).toBe("created");
      }
      await store.createCliCode(aCode(1, { hash: sha(`${sub}/code`), sub }));
    };

    /** Nothing of the person seeded by `seed` is left. (It takes the code, so use it last.) */
    const expectGone = async (sub: string) => {
      expect(await store.user(sub), `user ${sub}`).toBeUndefined();
      expect(await store.tokensOf(sub), `tokens of ${sub}`).toEqual([]);
      for (const n of [1, 2]) {
        expect(
          await store.tokenByHash(sha(`${sub}/token/${n}`)),
          `token ${n} of ${sub}`,
        ).toBeUndefined();
      }
      expect(await store.takeCliCode(sha(`${sub}/code`)), `code of ${sub}`).toBeUndefined();
    };

    /** Everything `seed` made for the person is there. (It takes the code, so use it last.) */
    const expectWhole = async (sub: string) => {
      expect((await store.user(sub))?.name, `user ${sub}`).toBe(`Person ${sub}`);
      expect((await store.tokensOf(sub)).map((t) => t.id)).toEqual([`${sub}-t2`, `${sub}-t1`]);
      expect((await store.takeCliCode(sha(`${sub}/code`)))?.sub, `code of ${sub}`).toBe(sub);
    };

    describe("users", () => {
      it("answers undefined for a person who has made no request", async () => {
        expect(await store.user("nobody")).toBeUndefined();
        expect(await store.user("")).toBeUndefined();
        await store.upsertUser(aProfile(), at(0));
        expect(await store.user("u2")).toBeUndefined();
      });

      it("creates the person on the first upsert and reads them back whole", async () => {
        const created = await store.upsertUser(aProfile(), at(5 * SECOND));
        expect(created).toEqual({
          ...aProfile(),
          createdAt: at(5 * SECOND),
          handle: null,
          ...NOT_ENTITLED,
        });
        expect(await store.user("u1")).toEqual(created);
      });

      it.each([
        ["name", { name: "Ana B." }],
        ["picture", { picture: "https://example.com/new.png" }],
        ["email", { email: "ana.b@example.com" }],
        ["emailVerified", { emailVerified: false }],
      ] as const)(
        "refreshes the %s when it differs, keeps the rest and keeps createdAt",
        async (_column, change) => {
          await store.upsertUser(aProfile(), at(SECOND));
          const refreshed = await store.upsertUser(aProfile(change), at(DAY));
          expect(refreshed).toEqual({
            ...aProfile(change),
            createdAt: at(SECOND),
            handle: null,
            ...NOT_ENTITLED,
          });
          expect(await store.user("u1")).toEqual(refreshed);
        },
      );

      it("refreshes every cached field at once", async () => {
        await store.upsertUser(aProfile(), at(SECOND));
        const next = aProfile({ name: "Ana B.", picture: "", email: "", emailVerified: false });
        expect(await store.upsertUser(next, at(DAY))).toEqual({
          ...next,
          createdAt: at(SECOND),
          handle: null,
          ...NOT_ENTITLED,
        });
        expect(await store.user("u1")).toEqual({
          ...next,
          createdAt: at(SECOND),
          handle: null,
          ...NOT_ENTITLED,
        });
      });

      it("answers the stored row and changes nothing when the profile is the same", async () => {
        const first = await store.upsertUser(aProfile(), at(SECOND));
        const again = await store.upsertUser(aProfile(), at(DAY));
        expect(again).toEqual(first);
        expect(again.createdAt).toBe(at(SECOND));
        expect(await store.user("u1")).toEqual(first);
      });

      it("keeps the first createdAt through any number of refreshes, and when a name comes back", async () => {
        await store.upsertUser(aProfile({ name: "One" }), at(SECOND));
        for (const [i, name] of ["Two", "Three", "One", "Four"].entries()) {
          const row = await store.upsertUser(aProfile({ name }), at(DAY * (i + 1)));
          expect(row).toEqual({
            ...aProfile({ name }),
            createdAt: at(SECOND),
            handle: null,
            ...NOT_ENTITLED,
          });
        }
        expect((await store.user("u1"))?.createdAt).toBe(at(SECOND));
      });

      it("sees a difference in case, in spaces and in how a letter is written", async () => {
        const names = ["Ana", "ana", "ana ", " ana", "José", "José"];
        for (const [i, name] of names.entries()) {
          const row = await store.upsertUser(aProfile({ name }), at(i * SECOND));
          expect(row.name).toBe(name);
          expect((await store.user("u1"))?.name).toBe(name);
        }
      });

      it("keeps text exactly as given: quotes, markup, SQL, emoji, newlines and empty text", async () => {
        const odd = aProfile({
          sub: "Robert'); DROP TABLE users;--",
          name: "<b>x</b> \"quoted\" 'single' \\ % _ \n second line ñ 🌊",
          picture: "",
          email: "",
          emailVerified: false,
        });
        const created = await store.upsertUser(odd, at(0));
        expect(created).toEqual({ ...odd, createdAt: at(0), handle: null, ...NOT_ENTITLED });
        expect(await store.user(odd.sub)).toEqual({
          ...odd,
          createdAt: at(0),
          handle: null,
          ...NOT_ENTITLED,
        });
        // The statement that would have run if the sub were pasted into SQL did not.
        await store.upsertUser(aProfile(), at(SECOND));
        expect((await store.user("u1"))?.name).toBe("Ana Dev");
      });

      it("tells people apart by sub exactly: case and spaces count, % and _ are plain characters", async () => {
        const subs = ["u1", "U1", "u1 ", "u%", "u_", "%"];
        for (const sub of subs) await store.upsertUser(aProfile({ sub, name: `[${sub}]` }), at(0));
        for (const sub of subs) expect((await store.user(sub))?.name).toBe(`[${sub}]`);
        for (const missing of ["u", "u12", "u__", "%%", "_"]) {
          expect(await store.user(missing), missing).toBeUndefined();
        }
      });

      it("gives each person their own row and refreshes only the one named", async () => {
        await store.upsertUser(aProfile({ sub: "u1" }), at(0));
        await store.upsertUser(aProfile({ sub: "u2", name: "Bo" }), at(SECOND));
        await store.upsertUser(aProfile({ sub: "u1", name: "Changed" }), at(DAY));
        expect(await store.user("u2")).toEqual({
          ...aProfile({ sub: "u2", name: "Bo" }),
          createdAt: at(SECOND),
          handle: null,
          ...NOT_ENTITLED,
        });
        expect((await store.user("u1"))?.name).toBe("Changed");
      });

      it("reads a verified email as true and an unverified one as false", async () => {
        await store.upsertUser(aProfile({ sub: "yes", emailVerified: true }), at(0));
        await store.upsertUser(aProfile({ sub: "no", emailVerified: false }), at(0));
        expect((await store.user("yes"))?.emailVerified).toBe(true);
        expect((await store.user("no"))?.emailVerified).toBe(false);
      });

      it("hands out copies: changing a result does not change the store", async () => {
        const created = await store.upsertUser(aProfile(), at(0));
        (created as { name: string }).name = "changed outside";
        const read = present(await store.user("u1"));
        (read as { name: string }).name = "changed again";
        const refreshed = await store.upsertUser(aProfile(), at(SECOND));
        (refreshed as { name: string }).name = "changed a third time";
        expect((await store.user("u1"))?.name).toBe("Ana Dev");
      });
    });

    describe("the entitlement to export without the branding", () => {
      it("is off for a new person, with nobody and no time recorded", async () => {
        const created = await store.upsertUser(aProfile(), at(0));
        expect(created.unbrandedExports).toBe(false);
        expect([created.unbrandedExportsBy, created.unbrandedExportsAt]).toEqual([null, null]);
        expect(await store.entitledUsers()).toEqual([]);
      });

      it("is set and revoked, recording who did it and when each time", async () => {
        await store.upsertUser(aProfile(), at(0));
        expect(await store.setUnbrandedExports("u1", true, "admin", at(MINUTE))).toBe("set");
        expect(present(await store.user("u1"))).toMatchObject({
          unbrandedExports: true,
          unbrandedExportsBy: "admin",
          unbrandedExportsAt: at(MINUTE),
        });
        expect(await store.setUnbrandedExports("u1", false, "other-admin", at(HOUR))).toBe("set");
        expect(present(await store.user("u1"))).toMatchObject({
          unbrandedExports: false,
          unbrandedExportsBy: "other-admin",
          unbrandedExportsAt: at(HOUR),
        });
      });

      it("answers missing for nobody, and writes no row", async () => {
        expect(await store.setUnbrandedExports("nobody", true, "admin", at(0))).toBe("missing");
        expect(await store.user("nobody")).toBeUndefined();
      });

      it("touches only the person named, a sub that merely starts the same included", async () => {
        await store.upsertUser(aProfile(), at(0));
        await store.upsertUser(aProfile({ sub: "u10" }), at(0));
        await store.upsertUser(aProfile({ sub: "u2" }), at(0));
        await store.setUnbrandedExports("u1", true, "admin", at(MINUTE));
        expect(present(await store.user("u10")).unbrandedExports).toBe(false);
        expect(present(await store.user("u2")).unbrandedExports).toBe(false);
      });

      it("survives a refresh of the profile", async () => {
        await store.upsertUser(aProfile(), at(0));
        await store.setUnbrandedExports("u1", true, "admin", at(MINUTE));
        const refreshed = await store.upsertUser(aProfile({ name: "Ana B." }), at(DAY));
        expect(refreshed.unbrandedExports).toBe(true);
        expect(refreshed.unbrandedExportsBy).toBe("admin");
      });

      it("lists the entitled people, the earliest grant first, and not a revoked or deleted one", async () => {
        for (const sub of ["u1", "u2", "u3"]) await store.upsertUser(aProfile({ sub }), at(0));
        await store.setUnbrandedExports("u2", true, "admin", at(MINUTE));
        await store.setUnbrandedExports("u1", true, "admin", at(HOUR));
        await store.setUnbrandedExports("u3", true, "admin", at(2 * HOUR));
        expect((await store.entitledUsers()).map((u) => u.sub)).toEqual(["u2", "u1", "u3"]);
        await store.setUnbrandedExports("u1", false, "admin", at(DAY));
        expect((await store.entitledUsers()).map((u) => u.sub)).toEqual(["u2", "u3"]);
        await store.applyUserDeleted("evt_entitled", "u3", at(DAY));
        expect((await store.entitledUsers()).map((u) => u.sub)).toEqual(["u2"]);
      });
    });

    describe("a person by their handle", () => {
      it("finds the holder, follows a change of handle, and finds nobody for a free handle", async () => {
        await store.upsertUser(aProfile(), at(0));
        await store.upsertUser(aProfile({ sub: "u2" }), at(0));
        expect(await store.userByHandle("ana-dev")).toBeUndefined();
        expect(await store.setHandle("u1", "ana-dev")).toBe("set");
        expect(present(await store.userByHandle("ana-dev")).sub).toBe("u1");
        expect(await store.setHandle("u1", "ana-b")).toBe("set");
        expect(await store.userByHandle("ana-dev")).toBeUndefined();
        expect(present(await store.userByHandle("ana-b")).sub).toBe("u1");
        expect(await store.userByHandle("nobody-here")).toBeUndefined();
      });
    });

    describe("handling a deletion event", () => {
      it("removes the person, their tokens and their approval codes, and reports it applied", async () => {
        await seed("u1");
        expect(await store.applyUserDeleted("evt_1", "u1", at(MINUTE))).toBe("applied");
        await expectGone("u1");
      });

      it("leaves everyone else's data alone, a sub that merely starts the same included", async () => {
        await seed("u1");
        await seed("u2");
        await seed("u1-and-more");
        expect(await store.applyUserDeleted("evt_1", "u1", at(MINUTE))).toBe("applied");
        await expectGone("u1");
        await expectWhole("u2");
        await expectWhole("u1-and-more");
      });

      it("removes an approval code that has expired too", async () => {
        await store.createCliCode(aCode(1, { expiresAt: at(-HOUR) }));
        expect(await store.applyUserDeleted("evt_1", "u1", at(0))).toBe("applied");
        expect(await store.takeCliCode(aCode(1).hash)).toBeUndefined();
      });

      it("applies the event of a person who has nothing, and remembers it", async () => {
        expect(await store.applyUserDeleted("evt_1", "ghost", at(0))).toBe("applied");
        expect(await store.applyUserDeleted("evt_1", "ghost", at(0))).toBe("duplicate");
      });

      it("answers duplicate for an event already handled and changes nothing, even when the person is back", async () => {
        await seed("u1");
        expect(await store.applyUserDeleted("evt_1", "u1", at(MINUTE))).toBe("applied");
        await expectGone("u1");

        // The person signs in again and starts over; the identity service delivers the event again.
        await seed("u1", DAY);
        expect(await store.applyUserDeleted("evt_1", "u1", at(2 * DAY))).toBe("duplicate");

        expect((await store.user("u1"))?.createdAt).toBe(at(DAY));
        await expectWhole("u1");
      });

      it("goes by the event id alone: a repeat that names another person deletes nothing", async () => {
        await seed("u1");
        await seed("u2");
        expect(await store.applyUserDeleted("evt_1", "u1", at(0))).toBe("applied");
        expect(await store.applyUserDeleted("evt_1", "u2", at(0))).toBe("duplicate");
        await expectWhole("u2");
      });

      it("handles a later event for the same person who came back", async () => {
        await seed("u1");
        expect(await store.applyUserDeleted("evt_1", "u1", at(MINUTE))).toBe("applied");
        await seed("u1", DAY);
        expect(await store.applyUserDeleted("evt_2", "u1", at(2 * DAY))).toBe("applied");
        await expectGone("u1");
        // And the person can come back once more, with a createdAt of their own.
        const again = await store.upsertUser(aProfile({ sub: "u1" }), at(3 * DAY));
        expect(again.createdAt).toBe(at(3 * DAY));
      });

      it("tells event ids apart exactly, case included", async () => {
        await seed("u1");
        await seed("u2");
        expect(await store.applyUserDeleted("evt_a", "u1", at(0))).toBe("applied");
        expect(await store.applyUserDeleted("EVT_A", "u2", at(0))).toBe("applied");
        expect(await store.applyUserDeleted("evt_a ", "u3", at(0))).toBe("applied");
        await expectGone("u1");
        await expectGone("u2");
      });

      it("treats ids that look like SQL as the plain text they are", async () => {
        const evil = "u1' OR '1'='1";
        await seed(evil);
        await seed("u1");
        await seed("u2");
        expect(await store.applyUserDeleted("evt'; DROP TABLE users; --", evil, at(0))).toBe(
          "applied",
        );
        await expectGone(evil);
        await expectWhole("u1");
        await expectWhole("u2");
      });

      it("leaves the failures kept for the rate limit alone", async () => {
        await store.recordCliFailure("caller", at(0));
        await store.applyUserDeleted("evt_1", "caller", at(MINUTE));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(1);
      });
    });

    describe("remembering who was deleted, and when", () => {
      it("knows of nobody before an event", async () => {
        expect(await store.deletedSince("u1", at(-DAY))).toBe(false);
        await seed("u1");
        expect(await store.deletedSince("u1", at(-DAY))).toBe(false);
      });

      it("says a person was deleted at or after a moment, and not before it", async () => {
        await store.applyUserDeleted("evt_1", "u1", at(HOUR));
        expect(await store.deletedSince("u1", at(0))).toBe(true);
        expect(await store.deletedSince("u1", at(HOUR - 1))).toBe(true);
        // The very moment of the event counts: a session issued in that second is from before.
        expect(await store.deletedSince("u1", at(HOUR))).toBe(true);
        expect(await store.deletedSince("u1", at(HOUR + 1))).toBe(false);
      });

      it("answers for each person alone, a sub that merely looks the same included", async () => {
        await store.applyUserDeleted("evt_1", "u1", at(HOUR));
        expect(await store.deletedSince("u2", at(0))).toBe(false);
        expect(await store.deletedSince("u1-and-more", at(0))).toBe(false);
        expect(await store.deletedSince("u", at(0))).toBe(false);
        expect(await store.deletedSince("U1", at(0))).toBe(false);
        expect(await store.deletedSince("u1 ", at(0))).toBe(false);
      });

      it("goes by the latest of several deletions of one person", async () => {
        await store.applyUserDeleted("evt_1", "u1", at(HOUR));
        await seed("u1", 2 * HOUR);
        await store.applyUserDeleted("evt_2", "u1", at(3 * HOUR));
        expect(await store.deletedSince("u1", at(2 * HOUR))).toBe(true);
        expect(await store.deletedSince("u1", at(3 * HOUR))).toBe(true);
        expect(await store.deletedSince("u1", at(3 * HOUR + 1))).toBe(false);
      });

      it("is not changed by a repeat of an event, even one that names another time", async () => {
        await store.applyUserDeleted("evt_1", "u1", at(HOUR));
        expect(await store.applyUserDeleted("evt_1", "u1", at(5 * HOUR))).toBe("duplicate");
        expect(await store.deletedSince("u1", at(HOUR + 1))).toBe(false);
      });

      it("remembers the deletion of a person this service never saw", async () => {
        expect(await store.applyUserDeleted("evt_1", "ghost", at(HOUR))).toBe("applied");
        expect(await store.deletedSince("ghost", at(0))).toBe(true);
      });

      it("treats the person as text, whatever it looks like", async () => {
        const evil = "u1' OR '1'='1";
        await store.applyUserDeleted("evt_1", evil, at(HOUR));
        expect(await store.deletedSince(evil, at(0))).toBe(true);
        expect(await store.deletedSince("u1", at(0))).toBe(false);
        expect(await store.deletedSince("x' OR '1'='1", at(0))).toBe(false);
      });

      it("is not an effect of a person returning: a new row does not cancel the record", async () => {
        await store.applyUserDeleted("evt_1", "u1", at(HOUR));
        await seed("u1", 2 * HOUR);
        expect(await store.deletedSince("u1", at(HOUR))).toBe(true);
      });
    });

    describe("API tokens", () => {
      it("stores a token and reads it back whole by its hash and in the person's list", async () => {
        const token = aToken(1, { createdAt: at(3 * SECOND) });
        expect(await store.createToken(token, MAX_TOKENS)).toBe("created");
        expect(await store.tokenByHash(token.hash)).toEqual(token);
        expect(await store.tokensOf("u1")).toEqual([token]);
      });

      it("keeps a last-used time when it is given one, and null when it is not", async () => {
        await store.createToken(aToken(1, { lastUsedAt: at(MINUTE) }), MAX_TOKENS);
        await store.createToken(aToken(2), MAX_TOKENS);
        expect((await store.tokenByHash(aToken(1).hash))?.lastUsedAt).toBe(at(MINUTE));
        expect((await store.tokenByHash(aToken(2).hash))?.lastUsedAt).toBeNull();
      });

      it("keeps a name exactly as given: quotes, markup, SQL, emoji, newlines and empty text", async () => {
        const named = aToken(1, { name: "<b>x</b> \"q\" 'a'); DROP TABLE tokens;-- \n ñ 🌊" });
        const empty = aToken(2, { name: "" });
        await store.createToken(named, MAX_TOKENS);
        await store.createToken(empty, MAX_TOKENS);
        expect(await store.tokenByHash(named.hash)).toEqual(named);
        expect(await store.tokenByHash(empty.hash)).toEqual(empty);
      });

      it("answers undefined for a hash nobody holds, and matches a hash exactly", async () => {
        const token = aToken(1);
        await store.createToken(token, MAX_TOKENS);
        expect(await store.tokenByHash(sha("other"))).toBeUndefined();
        expect(await store.tokenByHash(token.hash.toUpperCase())).toBeUndefined();
        expect(await store.tokenByHash(token.hash.slice(0, 63))).toBeUndefined();
        expect(await store.tokenByHash(`${token.hash}0`)).toBeUndefined();
        expect(await store.tokenByHash("")).toBeUndefined();
        expect(await store.tokenByHash("%")).toBeUndefined();
        expect(await store.tokenByHash(`${token.hash.slice(0, 8)}%`)).toBeUndefined();
      });

      describe("the quota", () => {
        it("stores tokens up to the limit and refuses the next, storing nothing for it", async () => {
          for (const n of [1, 2, 3]) expect(await store.createToken(aToken(n), 3)).toBe("created");
          expect(await store.createToken(aToken(4), 3)).toBe("quota");
          expect(await store.tokenByHash(aToken(4).hash)).toBeUndefined();
          expect((await store.tokensOf("u1")).map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
          // A refusal does not wear out, and does not fill anything up.
          expect(await store.createToken(aToken(5), 3)).toBe("quota");
          expect(await store.tokensOf("u1")).toHaveLength(3);
        });

        it("allows exactly 20 tokens, the account's limit, and refuses the 21st", async () => {
          expect(MAX_TOKENS).toBe(20);
          for (let n = 1; n <= MAX_TOKENS; n++) {
            expect(await store.createToken(aToken(n), MAX_TOKENS), `token ${n}`).toBe("created");
          }
          expect(await store.createToken(aToken(MAX_TOKENS + 1), MAX_TOKENS)).toBe("quota");
          expect(await store.tokensOf("u1")).toHaveLength(MAX_TOKENS);
        });

        it("counts per person: one at the limit does not stop another", async () => {
          await hold("u1", 3);
          expect(await store.createToken(extra("u1"), 3)).toBe("quota");
          await hold("u2", 2);
          expect(await store.createToken(extra("u2"), 3)).toBe("created");
          expect(await store.createToken(extra("u2", 1), 3)).toBe("quota");
          expect(await store.createToken(extra("u3"), 3)).toBe("created");
          expect(await store.tokensOf("u1")).toHaveLength(3);
          expect(await store.tokensOf("u2")).toHaveLength(3);
        });

        it("counts only the person's own tokens, a sub that merely starts the same included", async () => {
          await hold("u1", 3);
          expect(await store.createToken(extra("u1-and-more"), 3)).toBe("created");
          expect(await store.createToken(extra("u"), 1)).toBe("created");
          expect(await store.createToken(extra("U1"), 3)).toBe("created");
        });

        it("gives a place back when a token is revoked", async () => {
          await hold("u1", 3);
          expect(await store.createToken(extra("u1"), 3)).toBe("quota");
          expect(await store.deleteToken("u1", "u1-2")).toBe(true);
          expect(await store.createToken(extra("u1"), 3)).toBe("created");
          expect(await store.createToken(extra("u1", 1), 3)).toBe("quota");
        });

        it("gives a place back when the person is deleted and comes back", async () => {
          await hold("u1", 3);
          await store.applyUserDeleted("evt_1", "u1", at(0));
          expect(await store.createToken(extra("u1"), 3)).toBe("created");
        });

        it.each([
          ["zero", "quota", 0],
          ["a negative number", "quota", -1],
          ["not a number", "quota", Number.NaN],
          ["infinity", "created", Number.POSITIVE_INFINITY],
        ] as const)(
          "a limit of %s gives %s to a person with no tokens",
          async (_label, expected, limit) => {
            expect(await store.createToken(aToken(1), limit)).toBe(expected);
            expect(await store.tokensOf("u1")).toHaveLength(expected === "created" ? 1 : 0);
          },
        );

        it("uses the limit it is given each time, not one it remembers", async () => {
          await hold("u1", 3);
          expect(await store.createToken(extra("u1"), 3)).toBe("quota");
          expect(await store.createToken(extra("u1"), 4)).toBe("created");
          expect(await store.createToken(extra("u1", 1), 4)).toBe("quota");
        });

        it("refuses a second token with the same id and keeps the first", async () => {
          await store.createToken(aToken(1), MAX_TOKENS);
          await expect(store.createToken(aToken(2, { id: "t1" }), MAX_TOKENS)).rejects.toThrow();
          expect(await store.tokenByHash(aToken(2).hash)).toBeUndefined();
          expect(await store.tokensOf("u1")).toEqual([aToken(1)]);
        });

        it("refuses a second token with the same hash, whoever holds it, and keeps the first", async () => {
          await store.createToken(aToken(1), MAX_TOKENS);
          await expect(
            store.createToken(aToken(2, { sub: "u2", hash: aToken(1).hash }), MAX_TOKENS),
          ).rejects.toThrow();
          await expect(
            store.createToken(aToken(3, { hash: aToken(1).hash }), MAX_TOKENS),
          ).rejects.toThrow();
          expect(await store.tokensOf("u2")).toEqual([]);
          expect(await store.tokensOf("u1")).toEqual([aToken(1)]);
          expect((await store.tokenByHash(aToken(1).hash))?.id).toBe("t1");
        });

        it("answers quota, not an error, to a person at the limit even when the token would collide", async () => {
          await hold("u1", 3);
          expect(await store.createToken(aToken(1, { id: "u1-1" }), 3)).toBe("quota");
          expect(await store.createToken(aToken(2, { hash: sha("u1/1") }), 3)).toBe("quota");
          expect(await store.tokensOf("u1")).toHaveLength(3);
        });
      });

      describe("listing", () => {
        it("lists a person's tokens newest first, by when they were created and not when stored", async () => {
          for (const n of [3, 1, 2]) await store.createToken(aToken(n), MAX_TOKENS);
          expect((await store.tokensOf("u1")).map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
        });

        it("puts the token stored later first when several were created at the same instant", async () => {
          for (const n of [1, 2, 3]) {
            await store.createToken(aToken(n, { createdAt: at(SECOND) }), MAX_TOKENS);
          }
          expect((await store.tokensOf("u1")).map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
        });

        it("applies that rule to a token made after another was revoked", async () => {
          for (const n of [1, 2, 3]) {
            await store.createToken(aToken(n, { createdAt: at(SECOND) }), MAX_TOKENS);
          }
          await store.deleteToken("u1", "t2");
          await store.createToken(aToken(4, { createdAt: at(SECOND) }), MAX_TOKENS);
          expect((await store.tokensOf("u1")).map((t) => t.id)).toEqual(["t4", "t3", "t1"]);
        });

        it("keeps the order when a token is used", async () => {
          for (const n of [1, 2, 3]) {
            await store.createToken(aToken(n, { createdAt: at(SECOND) }), MAX_TOKENS);
          }
          await store.touchToken("t1", at(HOUR));
          await store.touchToken("t3", at(2 * HOUR));
          expect((await store.tokensOf("u1")).map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
        });

        it("lists only the tokens of the person asked for, and nothing for a person with none", async () => {
          await hold("u1", 2);
          await hold("u2", 1);
          expect((await store.tokensOf("u1")).map((t) => t.id)).toEqual(["u1-2", "u1-1"]);
          expect((await store.tokensOf("u2")).map((t) => t.id)).toEqual(["u2-1"]);
          expect(await store.tokensOf("nobody")).toEqual([]);
          expect(await store.tokensOf("")).toEqual([]);
          expect(await store.tokensOf("u")).toEqual([]);
          expect(await store.tokensOf("%")).toEqual([]);
        });

        it("hands out copies: changing a result does not change the store", async () => {
          await store.createToken(aToken(1), MAX_TOKENS);
          const one = present(await store.tokenByHash(aToken(1).hash));
          (one as { name: string }).name = "changed outside";
          const [listed] = await store.tokensOf("u1");
          (present(listed) as { name: string }).name = "changed too";
          expect(await store.tokensOf("u1")).toEqual([aToken(1)]);
        });
      });

      describe("revoking", () => {
        it("removes a token of the person and only that one", async () => {
          await hold("u1", 3);
          expect(await store.deleteToken("u1", "u1-2")).toBe(true);
          expect((await store.tokensOf("u1")).map((t) => t.id)).toEqual(["u1-3", "u1-1"]);
          expect(await store.tokenByHash(sha("u1/2"))).toBeUndefined();
          expect(await store.tokenByHash(sha("u1/3"))).toBeDefined();
        });

        it("refuses a token that is another person's: false, and the token stays", async () => {
          await hold("u1", 1);
          await hold("u2", 1);
          expect(await store.deleteToken("u2", "u1-1")).toBe(false);
          expect(await store.deleteToken("nobody", "u1-1")).toBe(false);
          expect(await store.deleteToken("", "u1-1")).toBe(false);
          expect((await store.tokensOf("u1")).map((t) => t.id)).toEqual(["u1-1"]);
          expect(await store.deleteToken("u1", "u1-1")).toBe(true);
          expect((await store.tokensOf("u2")).map((t) => t.id)).toEqual(["u2-1"]);
        });

        it("answers false for a token that does not exist, and for a second revocation", async () => {
          await hold("u1", 1);
          expect(await store.deleteToken("u1", "nope")).toBe(false);
          expect(await store.deleteToken("u1", "")).toBe(false);
          expect(await store.deleteToken("u1", "u1-%")).toBe(false);
          expect(await store.deleteToken("u1", "u1-1")).toBe(true);
          expect(await store.deleteToken("u1", "u1-1")).toBe(false);
          expect(await store.tokensOf("u1")).toEqual([]);
        });

        it("matches the owner and the id exactly, and treats text that looks like SQL as plain text", async () => {
          await hold("u1", 1);
          expect(await store.deleteToken("U1", "u1-1")).toBe(false);
          expect(await store.deleteToken("u1", "U1-1")).toBe(false);
          expect(await store.deleteToken("u1' OR '1'='1", "u1-1' OR '1'='1")).toBe(false);
          expect(await store.deleteToken("x", "u1-1' OR sub = 'u1")).toBe(false);
          expect(await store.tokensOf("u1")).toHaveLength(1);
        });

        it("stops finding the token by its hash, and lets the id and the hash be used again", async () => {
          const token = aToken(1);
          await store.createToken(token, MAX_TOKENS);
          await store.deleteToken("u1", "t1");
          expect(await store.tokenByHash(token.hash)).toBeUndefined();
          expect(await store.createToken(token, MAX_TOKENS)).toBe("created");
          expect(await store.tokenByHash(token.hash)).toEqual(token);
        });
      });

      describe("using", () => {
        it("sets the last-used time of that token and nothing else", async () => {
          const token = aToken(1, { createdAt: at(SECOND) });
          await store.createToken(token, MAX_TOKENS);
          await store.touchToken("t1", at(HOUR));
          expect(await store.tokenByHash(token.hash)).toEqual({ ...token, lastUsedAt: at(HOUR) });
          await store.touchToken("t1", at(2 * HOUR));
          expect((await store.tokensOf("u1"))[0]?.lastUsedAt).toBe(at(2 * HOUR));
        });

        it("touches only the token it names, and ignores one that does not exist", async () => {
          await hold("u1", 2);
          await store.touchToken("u1-1", at(HOUR));
          await expect(store.touchToken("ghost", at(HOUR))).resolves.toBeUndefined();
          await expect(store.touchToken("", at(HOUR))).resolves.toBeUndefined();
          expect((await store.tokenByHash(sha("u1/1")))?.lastUsedAt).toBe(at(HOUR));
          expect((await store.tokenByHash(sha("u1/2")))?.lastUsedAt).toBeNull();
          expect(await store.tokensOf("ghost")).toEqual([]);
          expect(await store.tokensOf("u1")).toHaveLength(2);
        });
      });
    });

    describe("approval codes of the command line", () => {
      it("stores a code and takes it: it comes back whole and is gone", async () => {
        const code = aCode(1);
        await store.createCliCode(code);
        expect(await store.takeCliCode(code.hash)).toEqual(code);
        expect(await store.takeCliCode(code.hash)).toBeUndefined();
      });

      it("answers undefined for a code nobody stored, and matches a hash exactly", async () => {
        const code = aCode(1);
        await store.createCliCode(code);
        expect(await store.takeCliCode(sha("other"))).toBeUndefined();
        expect(await store.takeCliCode(code.hash.toUpperCase())).toBeUndefined();
        expect(await store.takeCliCode(code.hash.slice(0, 63))).toBeUndefined();
        expect(await store.takeCliCode("")).toBeUndefined();
        expect(await store.takeCliCode("%")).toBeUndefined();
        // None of that took the code.
        expect(await store.takeCliCode(code.hash)).toEqual(code);
      });

      it("returns a code that has expired too: the caller judges the time", async () => {
        const expired = aCode(1, { expiresAt: at(-DAY) });
        await store.createCliCode(expired);
        expect(await store.takeCliCode(expired.hash)).toEqual(expired);
        expect(await store.takeCliCode(expired.hash)).toBeUndefined();
      });

      it("takes only the code it names", async () => {
        await store.createCliCode(aCode(1));
        await store.createCliCode(aCode(2, { sub: "u2" }));
        expect(await store.takeCliCode(aCode(1).hash)).toEqual(aCode(1));
        expect(await store.takeCliCode(aCode(2).hash)).toEqual(aCode(2, { sub: "u2" }));
      });

      it("keeps the person and the state exactly as given", async () => {
        const code = aCode(1, { sub: "u1' OR '1'='1", state: "A-b_C-0123456789abcdefXYZ_" });
        await store.createCliCode(code);
        expect(await store.takeCliCode(code.hash)).toEqual(code);
      });

      it("refuses a second code with the same hash and keeps the first", async () => {
        await store.createCliCode(aCode(1));
        await expect(
          store.createCliCode(aCode(1, { sub: "u2", state: "other-state-0000000" })),
        ).rejects.toThrow();
        expect(await store.takeCliCode(aCode(1).hash)).toEqual(aCode(1));
      });

      it("lets a hash be used again once its code is taken", async () => {
        await store.createCliCode(aCode(1));
        await store.takeCliCode(aCode(1).hash);
        await store.createCliCode(aCode(1, { sub: "u2" }));
        expect((await store.takeCliCode(aCode(1).hash))?.sub).toBe("u2");
      });
    });

    describe("failures of the exchange", () => {
      it("counts a caller's failures and nobody else's", async () => {
        for (const ms of [0, SECOND, 2 * SECOND]) await store.recordCliFailure("caller-a", at(ms));
        await store.recordCliFailure("caller-b", at(0));
        expect(await store.cliFailuresSince("caller-a", at(0))).toBe(3);
        expect(await store.cliFailuresSince("caller-b", at(0))).toBe(1);
        expect(await store.cliFailuresSince("caller-c", at(0))).toBe(0);
        expect(await store.cliFailuresSince("", at(0))).toBe(0);
      });

      it("matches a caller exactly: case, spaces and % are not shared with another", async () => {
        await store.recordCliFailure("Caller", at(0));
        for (const other of ["caller", "Caller ", "Call%", "C_ller", "%"]) {
          expect(await store.cliFailuresSince(other, at(0)), other).toBe(0);
        }
        expect(await store.cliFailuresSince("Caller", at(0))).toBe(1);
      });

      it("counts a failure made exactly at the time asked, and not one made a millisecond before", async () => {
        await store.recordCliFailure("caller", at(MINUTE));
        expect(await store.cliFailuresSince("caller", at(MINUTE - 1))).toBe(1);
        expect(await store.cliFailuresSince("caller", at(MINUTE))).toBe(1);
        expect(await store.cliFailuresSince("caller", at(MINUTE + 1))).toBe(0);
      });

      it("counts the failures from the time asked on, later ones included", async () => {
        for (const ms of [0, 30 * SECOND, MINUTE, 90 * SECOND]) {
          await store.recordCliFailure("caller", at(ms));
        }
        expect(await store.cliFailuresSince("caller", at(0))).toBe(4);
        expect(await store.cliFailuresSince("caller", at(SECOND))).toBe(3);
        expect(await store.cliFailuresSince("caller", at(MINUTE))).toBe(2);
        expect(await store.cliFailuresSince("caller", at(MINUTE + SECOND))).toBe(1);
        expect(await store.cliFailuresSince("caller", at(2 * MINUTE))).toBe(0);
      });

      it("counts failures made at the same instant one by one", async () => {
        for (let i = 0; i < 3; i++) await store.recordCliFailure("caller", at(0));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(3);
      });

      it("counts the ten failures of a minute that the limit looks at", async () => {
        for (let i = 0; i < 10; i++) await store.recordCliFailure("caller", at(i * SECOND));
        expect(await store.cliFailuresSince("caller", at(10 * SECOND - MINUTE))).toBe(10);
        // One second later the first has left the minute.
        expect(await store.cliFailuresSince("caller", at(SECOND))).toBe(9);
      });

      it("keeps a caller's failures of the last hour when it fails again, one exactly an hour old included", async () => {
        await store.recordCliFailure("caller", at(0));
        await store.recordCliFailure("caller", at(30 * MINUTE));
        await store.recordCliFailure("caller", at(HOUR));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(3);
      });

      it("drops a caller's failures older than an hour when it fails again", async () => {
        await store.recordCliFailure("caller", at(0));
        await store.recordCliFailure("caller", at(HOUR));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(2);
        // A millisecond more and the first is older than an hour.
        await store.recordCliFailure("caller", at(HOUR + 1));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(2);
        expect(await store.cliFailuresSince("caller", at(1))).toBe(2);
        await store.recordCliFailure("caller", at(3 * HOUR));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(1);
      });

      it("drops only the failures of the caller that fails again", async () => {
        await store.recordCliFailure("caller-b", at(0));
        await store.recordCliFailure("caller-a", at(0));
        await store.recordCliFailure("caller-a", at(3 * HOUR));
        expect(await store.cliFailuresSince("caller-a", at(0))).toBe(1);
        expect(await store.cliFailuresSince("caller-b", at(0))).toBe(1);
      });

      it("drops failures when one is recorded, not when they are counted", async () => {
        await store.recordCliFailure("caller", at(0));
        await store.recordCliFailure("caller", at(10 * MINUTE));
        // Asking about a time far later shows none, and takes none away.
        expect(await store.cliFailuresSince("caller", at(5 * HOUR))).toBe(0);
        expect(await store.cliFailuresSince("caller", at(-DAY))).toBe(2);
      });

      it("judges a failure's age by its own time, so one recorded late does not drop newer ones", async () => {
        await store.recordCliFailure("caller", at(2 * HOUR));
        // A failure stamped earlier than the one before it (another machine's clock).
        await store.recordCliFailure("caller", at(0));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(2);
      });
    });

    describe("sweep", () => {
      it("removes the approval codes that have expired, of every person, and keeps the others", async () => {
        const gone = aCode(1, { expiresAt: at(-DAY) });
        const exactly = aCode(2, { sub: "u2", expiresAt: at(0) });
        const almost = aCode(3, { expiresAt: at(1) });
        const live = aCode(4, { sub: "u2" });
        for (const code of [gone, exactly, almost, live]) await store.createCliCode(code);

        await store.sweep(at(0));

        // A code that expires at the very instant is expired, as the exchange judges it.
        expect(await store.takeCliCode(gone.hash)).toBeUndefined();
        expect(await store.takeCliCode(exactly.hash)).toBeUndefined();
        expect(await store.takeCliCode(almost.hash)).toEqual(almost);
        expect(await store.takeCliCode(live.hash)).toEqual(live);
      });

      it("removes the failures more than an hour old, of every caller, and keeps one exactly an hour old", async () => {
        await store.recordCliFailure("caller-a", at(0));
        await store.recordCliFailure("caller-b", at(1));
        await store.recordCliFailure("caller-c", at(HOUR));
        await store.recordCliFailure("caller-c", at(HOUR + 1));

        await store.sweep(at(HOUR + 1));

        expect(await store.cliFailuresSince("caller-a", at(-DAY))).toBe(0);
        expect(await store.cliFailuresSince("caller-b", at(-DAY))).toBe(1);
        expect(await store.cliFailuresSince("caller-c", at(-DAY))).toBe(2);
      });

      it("removes the deletion events more than 31 days old and keeps one exactly that old", async () => {
        await store.applyUserDeleted("evt_old", "u-old", at(0));
        await store.applyUserDeleted("evt_edge", "u-edge", at(1));
        await store.applyUserDeleted("evt_new", "u-new", at(31 * DAY));

        await store.sweep(at(31 * DAY + 1));

        expect(await store.deletedSince("u-old", at(-DAY))).toBe(false);
        expect(await store.deletedSince("u-edge", at(-DAY))).toBe(true);
        expect(await store.deletedSince("u-new", at(-DAY))).toBe(true);
        // What the sweep forgot is a new event if it ever came again; what it kept is a repeat.
        expect(await store.applyUserDeleted("evt_old", "u-old", at(31 * DAY + 1))).toBe("applied");
        expect(await store.applyUserDeleted("evt_edge", "u-edge", at(31 * DAY + 1))).toBe(
          "duplicate",
        );
      });

      it("leaves the people, their tokens, the events handled and the failures that count alone", async () => {
        await seed("u1");
        await store.recordCliFailure("caller", at(0));
        expect(await store.applyUserDeleted("evt_1", "u2", at(0))).toBe("applied");

        await store.sweep(at(MINUTE));

        expect((await store.user("u1"))?.name).toBe("Person u1");
        expect((await store.tokensOf("u1")).map((token) => token.id)).toEqual(["u1-t2", "u1-t1"]);
        expect(await store.cliFailuresSince("caller", at(0))).toBe(1);
        expect(await store.applyUserDeleted("evt_1", "u2", at(0))).toBe("duplicate");
        // The person's code has not expired: it is still there to be exchanged.
        expect((await store.takeCliCode(sha("u1/code")))?.sub).toBe("u1");
      });

      it("is harmless on an empty store, and when repeated", async () => {
        await store.sweep(at(0));
        await store.recordCliFailure("caller", at(0));
        await store.createCliCode(aCode(1));
        await store.sweep(at(MINUTE));
        await store.sweep(at(MINUTE));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(1);
        expect(await store.takeCliCode(aCode(1).hash)).toEqual(aCode(1));
      });

      it("does not mind a time before everything, or long after it", async () => {
        await store.recordCliFailure("caller", at(0));
        await store.createCliCode(aCode(1));
        await store.sweep(at(-10 * DAY));
        expect(await store.cliFailuresSince("caller", at(0))).toBe(1);
        expect(await store.takeCliCode(aCode(1).hash)).toEqual(aCode(1));

        await store.recordCliFailure("caller", at(0));
        await store.createCliCode(aCode(2));
        await store.sweep(at(10 * DAY));
        expect(await store.cliFailuresSince("caller", at(-DAY))).toBe(0);
        expect(await store.takeCliCode(aCode(2).hash)).toBeUndefined();
      });

      it("refuses a time that is not one, as the pruning of a failure does", async () => {
        await expect(store.sweep("not a time")).rejects.toThrow();
      });
    });

    // Projects, files, blobs, versions, usage and the collection: conformance-projects.ts.
    defineProjectConformance(() => store);
    // The link level, members, invitations, handles, publications and takedowns: conformance-sharing.ts.
    defineSharingConformance(() => store);

    describe("many operations at once", () => {
      it("never lets racing creates take a person past the limit", async () => {
        const racers = Array.from({ length: 35 }, (_, i) => aToken(i + 1));
        const results = await Promise.all(racers.map((t) => store.createToken(t, MAX_TOKENS)));
        expect(results.filter((r) => r === "created")).toHaveLength(MAX_TOKENS);
        expect(results.filter((r) => r === "quota")).toHaveLength(35 - MAX_TOKENS);
        expect(await store.tokensOf("u1")).toHaveLength(MAX_TOKENS);
      });

      it("keeps the limit of each person when several race at once", async () => {
        const racers = ["u1", "u2", "u3"].flatMap((sub) =>
          Array.from({ length: 8 }, (_, i) =>
            aToken(i + 1, { id: `${sub}-${i}`, sub, hash: sha(`${sub}/${i}`) }),
          ),
        );
        const results = await Promise.all(racers.map((t) => store.createToken(t, 5)));
        expect(results.filter((r) => r === "created")).toHaveLength(15);
        for (const sub of ["u1", "u2", "u3"]) expect(await store.tokensOf(sub)).toHaveLength(5);
      });

      it("lets exactly one of the requests that race for the last place have it", async () => {
        await hold("u1", MAX_TOKENS - 1);
        const results = await Promise.all(
          [0, 1, 2, 3, 4].map((n) => store.createToken(extra("u1", n), MAX_TOKENS)),
        );
        expect(results.filter((r) => r === "created")).toHaveLength(1);
        expect(await store.tokensOf("u1")).toHaveLength(MAX_TOKENS);
      });

      it("revokes a token for one of the requests that ask", async () => {
        await hold("u1", 1);
        const results = await Promise.all([1, 2, 3].map(() => store.deleteToken("u1", "u1-1")));
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await store.tokensOf("u1")).toEqual([]);
      });

      it("hands an approval code to one of the requests that send it", async () => {
        await store.createCliCode(aCode(1));
        const taken = await Promise.all(
          [1, 2, 3, 4, 5].map(() => store.takeCliCode(aCode(1).hash)),
        );
        expect(taken.filter((c) => c !== undefined)).toEqual([aCode(1)]);
      });

      it("applies a deletion event once however many deliveries race", async () => {
        await seed("u1");
        const outcomes = await Promise.all(
          [1, 2, 3, 4, 5].map(() => store.applyUserDeleted("evt_1", "u1", at(MINUTE))),
        );
        expect(outcomes.filter((o) => o === "applied")).toHaveLength(1);
        expect(outcomes.filter((o) => o === "duplicate")).toHaveLength(4);
        await expectGone("u1");
      });

      it("applies each of several events once when they race for different people", async () => {
        const subs = ["u1", "u2", "u3", "u4"];
        for (const sub of subs) await seed(sub);
        const outcomes = await Promise.all(
          subs.flatMap((sub) => [
            store.applyUserDeleted(`evt_${sub}`, sub, at(MINUTE)),
            store.applyUserDeleted(`evt_${sub}`, sub, at(MINUTE)),
          ]),
        );
        expect(outcomes.filter((o) => o === "applied")).toHaveLength(subs.length);
        expect(outcomes.filter((o) => o === "duplicate")).toHaveLength(subs.length);
        for (const sub of subs) await expectGone(sub);
      });

      it("creates one person, and agrees on when, when first requests race", async () => {
        const times = [0, 1, 2, 3].map((i) => at(i * SECOND));
        const rows = await Promise.all(times.map((time) => store.upsertUser(aProfile(), time)));
        expect(new Set(rows.map((row) => row.createdAt)).size).toBe(1);
        expect(times).toContain(rows[0]?.createdAt);
        expect(await store.user("u1")).toEqual(rows[0]);
      });

      it("never mixes the columns of two profiles when refreshes race", async () => {
        await store.upsertUser(aProfile(), at(0));
        const profiles = Array.from({ length: 12 }, (_, i) =>
          aProfile({
            name: `Name ${i}`,
            picture: `https://example.com/${i}.png`,
            email: `n${i}@example.com`,
            emailVerified: i % 2 === 0,
          }),
        );
        await Promise.all(profiles.map((profile, i) => store.upsertUser(profile, at(i * SECOND))));
        const row = present(await store.user("u1"));
        const winner = present(profiles.find((profile) => profile.name === row.name));
        expect(row).toEqual({ ...winner, createdAt: at(0), handle: null, ...NOT_ENTITLED });
      });

      it("counts every failure recorded at once", async () => {
        await Promise.all(
          Array.from({ length: 20 }, (_, i) => store.recordCliFailure("caller", at(i * SECOND))),
        );
        expect(await store.cliFailuresSince("caller", at(0))).toBe(20);
      });
    });
  });
}
