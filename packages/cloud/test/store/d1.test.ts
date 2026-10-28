// `d1Store` over the real migration, through the `node:sqlite` adapter of test/support/sqlite.ts:
// the same conformance suite as the in-memory store (twice: on the bare adapter, and with a round
// trip before every statement), then what only SQL can get wrong: statements built from values,
// transactions, the answers D1 gives to a write, the races the single statements close, the
// indexes, how booleans and times are stored, and that no token or code rests in clear.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { D1Like, D1PreparedLike } from "../../src/env.js";
import { sha256Hex } from "../../src/crypto.js";
import { d1Store } from "../../src/store/d1.js";
import {
  MAX_TOKENS,
  type CliCode,
  type CloudStore,
  type NewBlob,
  type NewProject,
  type TokenRow,
  type UserProfile,
} from "../../src/store/types.js";
import {
  barrier,
  dump,
  openDatabase,
  sqliteAvailable,
  withLatency,
  type SqliteDb,
} from "../support/sqlite.js";
import { runStoreConformance } from "./conformance.js";

const T = "2026-10-14T12:00:00.000Z";
const LATER = "2026-10-14T13:00:00.000Z";

/** The SHA-256 in hexadecimal of a label: what a token or a code rests as. */
const sha = (label: string): string => createHash("sha256").update(label).digest("hex");

/** What a person's row says of the branding entitlement until an administrator sets it. */
const NOT_ENTITLED = {
  unbrandedExports: false,
  unbrandedExportsBy: null,
  unbrandedExportsAt: null,
} as const;

const profile: UserProfile = {
  sub: "u1",
  name: "Ana",
  picture: "https://example.com/a.png",
  email: "ana@example.com",
  emailVerified: true,
};

const token = (n = 1, over: Partial<TokenRow> = {}): TokenRow => ({
  id: `t${n}`,
  sub: "u1",
  name: `token ${n}`,
  hash: sha(`mdg_${n}`),
  createdAt: T,
  lastUsedAt: null,
  ...over,
});

const code = (n = 1, over: Partial<CliCode> = {}): CliCode => ({
  hash: sha(`code_${n}`),
  sub: "u1",
  state: "s".repeat(24),
  expiresAt: "2026-10-14T12:05:00.000Z",
  ...over,
});

/** Project ids: 20 characters of [0-9a-z], as the address of a project is. */
const P1 = "proj0000000000000001";
const P2 = "proj0000000000000002";
const pid = (n: number): string => `proj${String(n).padStart(16, "0")}`;

const project = (id = P1, over: Partial<NewProject> = {}): NewProject => ({
  id,
  ownerSub: "u1",
  name: "Project",
  description: "About",
  createdAt: T,
  ...over,
});

/** The hash of a blob called by a label. */
const bh = (label: string): string => sha(`blob/${label}`);

const blobOf = (label: string, size = 10): NewBlob => ({
  hash: bh(label),
  size,
  mediaType: "text/plain",
});

/** How many rows a table holds. */
const rows = (db: SqliteDb, table: string): number =>
  Number(db.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);

/** The rows SQLite has changed since the connection opened: one more per row written. */
const written = (db: SqliteDb): number =>
  Number(db.raw.prepare("SELECT total_changes() AS n").get()?.n);

/** The tables a project's data rests in. */
const PROJECT_TABLES = ["projects", "project_files", "project_blobs", "versions", "version_files"];

/**
 * A database whose answers are scripted, whatever the statement says: it shows what the store
 * takes from the answers and nothing else.
 */
function scripted(script: {
  run?: () => Promise<{ meta?: { changes?: number } }>;
  first?: () => Promise<unknown>;
  batch?: () => Promise<unknown[]>;
}): D1Like {
  const statement: D1PreparedLike = {
    bind: () => statement,
    first: async <R>() => (script.first ? ((await script.first()) as R | null) : null),
    all: async () => ({ results: [] }),
    run: script.run ?? (async () => ({})),
  };
  return { prepare: () => statement, batch: script.batch ?? (async () => []) };
}

/** The plan SQLite gives each statement a store call ran, one string per statement. */
function plansSince(db: SqliteDb, from: number): string[] {
  return db.queries.slice(from).map(({ sql, values }) =>
    db.raw
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...values)
      .map((row) => String(row.detail))
      .join(" | "),
  );
}

describe.skipIf(!sqliteAvailable)("d1Store over node:sqlite", () => {
  runStoreConformance("d1Store", () => {
    const db = openDatabase();
    return { store: d1Store(db), close: () => db.close() };
  });

  runStoreConformance("d1Store with a round trip before every statement", () => {
    const db = openDatabase();
    return { store: d1Store(withLatency(db)), close: () => db.close() };
  });

  describe("the adapter", () => {
    it("runs a batch as one transaction: a failing statement undoes the ones before it", async () => {
      const db = openDatabase();
      const insert = (sub: string, name: string) =>
        db
          .prepare(
            "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES (?, ?, '', '', 0, ?)",
          )
          .bind(sub, name, T);
      // The second statement breaks the primary key, after the first one ran.
      await expect(db.batch([insert("u1", "Ana"), insert("u1", "Duplicate")])).rejects.toThrow();
      expect(db.raw.prepare("SELECT count(*) AS n FROM users").get()).toEqual({ n: 0 });
      // The connection is usable afterwards: the failed transaction was rolled back, not left open.
      await db.batch([insert("u1", "Ana"), insert("u2", "Bo")]);
      expect(db.raw.prepare("SELECT count(*) AS n FROM users").get()).toEqual({ n: 2 });
      db.close();
    });

    it("tells in meta.changes how many rows a write changed, zero included, as D1 does", async () => {
      const db = openDatabase();
      const insert = (sub: string) =>
        db
          .prepare(
            "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES (?, 'Ana', '', '', 0, ?)",
          )
          .bind(sub, T)
          .run();
      expect((await insert("u1")).meta?.changes).toBe(1);
      await insert("u2");
      await insert("u3");
      const remove = (sub: string) =>
        db.prepare("DELETE FROM users WHERE sub <> ?").bind(sub).run();
      expect(
        (await db.prepare("DELETE FROM users WHERE sub = ?").bind("nobody").run()).meta,
      ).toEqual(expect.objectContaining({ changes: 0 }));
      expect((await remove("u1")).meta?.changes).toBe(2);
      // The count belongs to the statement that ran, not to an earlier one.
      expect((await remove("u1")).meta?.changes).toBe(0);
      db.close();
    });

    it("tells 0 for an INSERT ... SELECT whose condition does not hold, and 1 when it does", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      expect(await store.createToken(token(1), 1)).toBe("created");
      const refused = await db
        .prepare(
          "INSERT INTO tokens (id, sub, name, hash, created_at, last_used_at) SELECT ?, ?, ?, ?, ?, NULL WHERE (SELECT COUNT(*) FROM tokens WHERE sub = ?) < ?",
        )
        .bind("t2", "u1", "n", sha("2"), T, "u1", 1)
        .run();
      expect(refused.meta?.changes).toBe(0);
      db.close();
    });

    it("refuses what D1 refuses and what the store must never send: undefined, booleans, objects", () => {
      const db = openDatabase();
      const statement = db.prepare("SELECT ?");
      expect(() => statement.bind(undefined)).toThrow(/D1_TYPE_ERROR/);
      expect(() => statement.bind(true)).toThrow(/D1_TYPE_ERROR/);
      expect(() => statement.bind({})).toThrow(/D1_TYPE_ERROR/);
      expect(() => statement.bind(Number.NaN)).toThrow(/D1_TYPE_ERROR/);
      expect(() => statement.bind(Number.POSITIVE_INFINITY)).toThrow(/D1_TYPE_ERROR/);
      expect(() => statement.bind(null)).not.toThrow();
      expect(() => statement.bind(1, "a")).not.toThrow();
      db.close();
    });

    it("refuses a statement with more than 100 bound parameters, as D1 does, and takes exactly 100", () => {
      const db = openDatabase();
      const marks = (count: number) => Array.from({ length: count }, () => "?").join(", ");
      const bound = (count: number) =>
        db.prepare(`SELECT ${marks(count)}`).bind(...Array.from({ length: count }, (_, i) => i));
      expect(() => bound(100)).not.toThrow();
      expect(() => bound(101)).toThrow(/D1_ERROR: too many SQL variables/);
      expect(() => bound(250)).toThrow(/D1_ERROR: too many SQL variables/);
      db.close();
    });

    it("answers like D1: first() gives null for no row, all() gives results, run() gives changes", async () => {
      const db = openDatabase();
      expect(await db.prepare("SELECT * FROM users WHERE sub = ?").bind("x").first()).toBeNull();
      expect(await db.prepare("SELECT * FROM users").all()).toEqual({ results: [] });
      const ran = (await db
        .prepare(
          "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES (?, ?, '', '', 0, ?)",
        )
        .bind("u1", "Ana", T)
        .run()) as { success: boolean; meta: { changes: number } };
      expect(ran.success).toBe(true);
      expect(ran.meta.changes).toBe(1);
      const row = await db.prepare("SELECT sub, name FROM users").first<{ sub: string }>();
      expect(row).toEqual({ sub: "u1", name: "Ana" });
      // A plain object, as D1 returns, not a null-prototype one.
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
      db.close();
    });

    it("answers a read inside a batch with its rows, as D1 does", async () => {
      const db = openDatabase();
      const [, read] = await db.batch([
        db
          .prepare(
            "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES (?, ?, '', '', 0, ?)",
          )
          .bind("u1", "Ana", T),
        db.prepare("SELECT sub, name FROM users WHERE sub = ?").bind("u1"),
      ]);
      expect((read as { results: unknown[] }).results).toEqual([{ sub: "u1", name: "Ana" }]);
      db.close();
    });

    it("rejects a batch that holds a statement of another database", async () => {
      const db = openDatabase();
      await expect(
        db.batch([
          {
            bind: () => null as never,
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({}),
          },
        ]),
      ).rejects.toThrow(/this database/);
      db.close();
    });

    it("applies only the migrations it is given, and none when asked not to", () => {
      const bare = openDatabase({ migrate: false });
      expect(bare.raw.prepare("SELECT count(*) AS n FROM sqlite_master").get()).toEqual({ n: 0 });
      bare.close();
      const none = openDatabase({ migrations: [] });
      expect(none.raw.prepare("SELECT count(*) AS n FROM sqlite_master").get()).toEqual({ n: 0 });
      none.close();
    });
  });

  describe("the statements", () => {
    /** Calls every method of the store, with values that would break out of pasted-in SQL. */
    async function useEveryMethod(store: CloudStore): Promise<Set<string>> {
      const called = new Set<string>();
      const spy = new Proxy(store, {
        get(target, property, receiver) {
          const member = Reflect.get(target, property, receiver) as unknown;
          if (typeof member !== "function") return member;
          return (...args: unknown[]) => {
            called.add(String(property));
            return (member as (...a: unknown[]) => unknown)(...args);
          };
        },
      });
      const evil = "x'); DROP TABLE users; --";
      await spy.upsertUser(
        { sub: evil, name: evil, picture: evil, email: evil, emailVerified: true },
        T,
      );
      // The refresh path of the upsert, then a read.
      await spy.upsertUser(
        { sub: evil, name: `${evil}2`, picture: evil, email: evil, emailVerified: false },
        T,
      );
      expect((await spy.user(evil))?.name).toBe(`${evil}2`);
      expect(await spy.createToken(token(1, { id: evil, sub: evil, name: evil }), MAX_TOKENS)).toBe(
        "created",
      );
      expect(await spy.createToken(token(2, { id: `${evil}2`, sub: evil }), 1)).toBe("quota");
      expect((await spy.tokenByHash(token(1).hash))?.id).toBe(evil);
      expect(await spy.tokenByHash(evil)).toBeUndefined();
      expect(await spy.tokensOf(evil)).toHaveLength(1);
      await spy.touchToken(evil, T);
      await spy.createCliCode(code(1, { sub: evil, state: evil }));
      expect((await spy.takeCliCode(code(1).hash))?.state).toBe(evil);
      expect(await spy.takeCliCode(evil)).toBeUndefined();
      await spy.recordCliFailure(evil, T);
      expect(await spy.cliFailuresSince(evil, T)).toBe(1);
      await spy.sweep(T);

      // Projects. The ids have the shape of an address (the database checks it); everything
      // else a person writes is the text above.
      const hash = bh("evil");
      expect(
        await spy.createProject(project(P1, { ownerSub: evil, name: evil, description: evil }), 5),
      ).toBe("created");
      expect(await spy.createProject(project(P2, { ownerSub: evil }), 1)).toBe("quota");
      expect(await spy.createProject(project(P2, { ownerSub: evil }), 5)).toBe("created");
      expect((await spy.project(evil, P1))?.name).toBe(evil);
      expect(await spy.listProjects(evil)).toHaveLength(2);
      expect(await spy.countProjects(evil)).toBe(2);
      expect(await spy.projectIdsOf(evil)).toEqual([P1, P2]);
      expect(await spy.ownerOf(P1)).toBe(evil);
      expect(
        (await spy.updateProject(evil, P1, { name: `${evil}2`, description: evil }, T))?.name,
      ).toBe(`${evil}2`);
      expect((await spy.updateProject(evil, P1, {}, T))?.name).toBe(`${evil}2`);
      expect(await spy.claimThumbnail(P1, T, T)).toBe(true);
      await spy.setThumbnailAt(P1, null);
      expect(
        await spy.applyMaterialisation({
          projectId: P1,
          upserts: new Map([[evil, hash]]),
          deletes: [evil, `${evil}2`],
          blobs: [{ hash, size: 3, mediaType: evil }],
          revision: 2,
          now: T,
        }),
      ).toBe(true);
      expect(await spy.projectFiles(P1)).toEqual(new Map([[evil, hash]]));
      expect(await spy.blobsPresent([hash, evil])).toEqual(new Set([hash]));
      await spy.addBlobs([{ hash: bh("evil2"), size: 4, mediaType: evil }], T);
      expect((await spy.blob(hash))?.mediaType).toBe(evil);
      expect(await spy.addProjectBlob(P1, hash)).toBe(true);
      expect(await spy.hasProjectBlob(P1, hash)).toBe(true);
      expect(await spy.projectBlobs(P1)).toEqual([hash]);
      expect(await spy.projectHoldsBlob(P1, hash)).toBe(true);
      expect(await spy.copyProjectBlobs(evil, P1, P2)).toBe(1);
      expect(await spy.removeProjectBlob(P2, hash)).toBe(true);
      const made = await spy.createVersion(
        { projectId: P1, label: evil, auto: true, createdBy: evil, createdAt: T },
        { maxVersions: 5, rate: { max: 5, since: T } },
      );
      expect(made).toMatchObject({ number: 1, label: evil, createdBy: evil });
      const again = { projectId: P1, label: null, auto: false, createdBy: evil, createdAt: T };
      expect(await spy.createVersion(again, { maxVersions: 1 })).toBe("quota");
      expect(await spy.createVersion(again, { maxVersions: 5, rate: { max: 1, since: T } })).toBe(
        "rate",
      );
      expect(await spy.createVersion({ ...again, projectId: pid(9) }, { maxVersions: 5 })).toBe(
        "missing",
      );
      expect(await spy.createVersion(again, { maxVersions: 5 })).toMatchObject({ number: 2 });
      expect(await spy.listVersions(P1)).toHaveLength(2);
      expect((await spy.version(P1, 1))?.label).toBe(evil);
      expect((await spy.latestVersion(P1))?.number).toBe(2);
      expect(await spy.versionFiles(P1, 1)).toEqual(new Map([[evil, hash]]));
      expect(await spy.versionChanges(P1)).toEqual(
        new Map([
          [1, [evil]],
          [2, []],
        ]),
      );
      expect(await spy.countVersions(P1)).toBe(2);
      expect(await spy.countVersionsSince(P1, T)).toBe(2);
      await spy.deleteVersions(P1, [2]);
      expect(await spy.storageBytesOf(evil)).toBe(3);
      expect(await spy.refreshStorageBytes(evil)).toBe(3);
      expect(await spy.usage(evil)).toEqual({ projects: 2, storageBytes: 3 });
      expect(await spy.unreferencedBlobs(LATER, 10)).toEqual([bh("evil2")]);
      expect(await spy.deleteBlobs([bh("evil2"), evil], LATER)).toEqual([bh("evil2"), evil]);

      // Sharing. What a person writes is the text above; the shapes the database checks (an id and
      // a token in hexadecimal, an email in lower case, a handle) are made to fit.
      const mail = "x'); drop table users; --@example.com";
      const invitation = (n: number, email = `n${n}@example.com`) => ({
        id: sha(`invite-${n}`).slice(0, 32),
        projectId: P1,
        email,
        role: "viewer" as const,
        token: sha(`token-${n}`).slice(0, 32),
        createdBy: evil,
        createdAt: T,
      });
      expect(await spy.projectById(P1)).toMatchObject({ linkAccess: "private" });
      expect(await spy.setLinkAccess(evil, P1, "edit")).toMatchObject({ linkAccess: "edit" });
      expect(await spy.createInvitation(invitation(1, mail), 5)).toBe("created");
      expect(await spy.createInvitation(invitation(2), 1)).toBe("quota");
      expect(await spy.createInvitation({ ...invitation(3), projectId: pid(9) }, 5)).toBe(
        "missing",
      );
      expect(await spy.createInvitation(invitation(4), 5)).toBe("created");
      expect(await spy.pendingInvitations(P1, T)).toHaveLength(2);
      expect(await spy.setInvitationRole(P1, invitation(1).id, "editor")).toBe(true);
      expect((await spy.pendingInvitationByToken(invitation(1).token, T))?.role).toBe("editor");
      expect(await spy.acceptInvitation(invitation(1).token, evil + "2", T)).toEqual({
        projectId: P1,
        role: "editor",
      });
      expect(await spy.acceptInvitationsFor(evil + "3", invitation(4).email, T)).toEqual([
        { projectId: P1, role: "viewer" },
      ]);
      expect(await spy.memberRole(P1, evil + "2")).toBe("editor");
      expect((await spy.members(P1)).map((m) => m.sub)).toEqual([evil + "2", evil + "3"]);
      expect(await spy.setMemberRole(P1, evil + "3", "editor")).toBe(true);
      expect(await spy.removeMember(P1, evil + "3")).toBe(true);
      expect(await spy.createInvitation(invitation(5), 5)).toBe("created");
      expect(await spy.deleteInvitation(P1, invitation(5).id)).toBe(true);
      expect(await spy.setHandle(evil, "evil-handle")).toBe("set");
      expect(await spy.setHandle(evil + "9", "evil-handle")).toBe("missing");
      expect((await spy.userByHandle("evil-handle"))?.sub).toBe(evil);
      expect(await spy.setUnbrandedExports(evil, true, evil, T)).toBe("set");
      expect(await spy.setUnbrandedExports(evil + "9", true, evil, T)).toBe("missing");
      expect((await spy.entitledUsers()).map((u) => u.sub)).toEqual([evil]);
      const published = {
        projectId: P1,
        handle: "evil-handle",
        slug: "evil-slug",
        publishedAt: T,
        bytes: 3,
      };
      expect(await spy.putPublication(published)).toBe("put");
      expect(await spy.putPublication({ ...published, projectId: pid(9) })).toBe("missing");
      expect(await spy.setHandle(evil, "evil-other")).toBe("locked");
      expect(await spy.publication("evil-handle", "evil-slug")).toEqual(published);
      expect(await spy.publicationsOf(P1)).toEqual([published]);
      expect(await spy.publicationsOwnedBy(evil)).toEqual([published]);
      expect(await spy.countPublicationsSince(P1, T)).toBe(1);
      expect(await spy.claimPublish(P1, T, 5)).toEqual({ status: "claimed" });
      expect(await spy.claimPublish(P1, T, 1)).toMatchObject({ status: "rate" });
      expect(await spy.claimPublish(pid(9), T, 5)).toEqual({ status: "missing" });
      expect(await spy.deletePublication(P1, "evil-slug")).toEqual(published);
      expect(await spy.putPublication(published)).toBe("put");
      const removal = {
        handle: "evil-handle",
        slug: "evil-slug",
        bySub: evil,
        reason: evil,
        at: T,
      };
      expect(await spy.takeDown(removal)).toEqual(published);
      expect(await spy.takedownsOf("evil-handle")).toEqual([{ ...removal, projectId: P1 }]);

      expect(await spy.deleteProject(evil, P2)).toBe(true);

      expect(await spy.deleteToken(evil, evil)).toBe(true);
      expect(await spy.applyUserDeleted(evil, evil, T)).toBe("applied");
      expect(await spy.deletedSince(evil, T)).toBe(true);
      expect(await spy.deletedSince(evil, LATER)).toBe(false);
      return called;
    }

    it("are constants with placeholders: no value is ever pasted into the SQL", async () => {
      const db = openDatabase();
      const called = await useEveryMethod(d1Store(db));
      // Every method of the interface ran, so every statement of the store was looked at.
      expect([...called].sort()).toEqual(Object.keys(d1Store(db)).sort());
      expect(db.queries.length).toBeGreaterThan(80);
      for (const { sql, values } of db.queries) {
        expect(sql).not.toContain("DROP TABLE");
        expect(sql).not.toContain("x'");
        expect(sql).not.toContain(T);
        expect(sql).not.toMatch(/'/);
        expect(sql.match(/\?/g)?.length ?? 0, sql).toBe(values.length);
        // What D1 takes in a statement.
        expect(values.length, sql).toBeLessThanOrEqual(100);
      }
      // The table the injected text names is still there, and emptied by applyUserDeleted only.
      expect(db.raw.prepare("SELECT count(*) AS n FROM users").get()).toEqual({ n: 0 });
      db.close();
    });

    it("bind booleans as 0 and 1 and a missing time as null, never undefined", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(profile, T);
      await store.upsertUser({ ...profile, emailVerified: false }, T);
      await store.createToken(token(), MAX_TOKENS);
      await store.createToken(token(2, { lastUsedAt: LATER }), MAX_TOKENS);
      for (const { values } of db.queries) {
        for (const value of values) {
          expect(["string", "number"].includes(typeof value) || value === null).toBe(true);
        }
      }
      const upserts = db.queries.filter((q) => q.sql.startsWith("INSERT INTO users"));
      expect(upserts.map((q) => q.values[4])).toEqual([1, 0]);
      const insertions = db.queries.filter((q) => q.sql.startsWith("INSERT INTO tokens"));
      expect(insertions.map((q) => q.values[5])).toEqual([null, LATER]);
      db.close();
    });
  });

  describe("how rows are stored", () => {
    it("keeps booleans as the integers 0 and 1, times as text and a missing time as NULL", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(profile, T);
      await store.upsertUser({ ...profile, sub: "u2", emailVerified: false }, T);
      await store.createToken(token(1), MAX_TOKENS);
      await store.createToken(token(2, { lastUsedAt: LATER }), MAX_TOKENS);
      await store.createCliCode(code());
      await store.recordCliFailure("caller", T);
      expect(
        db.raw
          .prepare(
            "SELECT sub, typeof(email_verified) AS type, email_verified, typeof(created_at) AS t, created_at FROM users ORDER BY sub",
          )
          .all(),
      ).toEqual([
        { sub: "u1", type: "integer", email_verified: 1, t: "text", created_at: T },
        { sub: "u2", type: "integer", email_verified: 0, t: "text", created_at: T },
      ]);
      expect(
        db.raw
          .prepare("SELECT id, typeof(last_used_at) AS t, last_used_at FROM tokens ORDER BY id")
          .all(),
      ).toEqual([
        { id: "t1", t: "null", last_used_at: null },
        { id: "t2", t: "text", last_used_at: LATER },
      ]);
      expect(db.raw.prepare("SELECT typeof(expires_at) AS t FROM cli_codes").get()).toEqual({
        t: "text",
      });
      expect(db.raw.prepare("SELECT typeof(at) AS t FROM cli_failures").get()).toEqual({
        t: "text",
      });
      db.close();
    });

    it("keeps the rows of each table exactly as the store was given them", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(profile, T);
      await store.createToken(token(1, { lastUsedAt: LATER }), MAX_TOKENS);
      await store.createCliCode(code());
      await store.recordCliFailure("caller", T);
      await store.applyUserDeleted("evt_0", "nobody", LATER);
      expect(db.raw.prepare("SELECT * FROM users").all()).toEqual([
        {
          sub: "u1",
          name: "Ana",
          picture: "https://example.com/a.png",
          email: "ana@example.com",
          email_verified: 1,
          created_at: T,
          // Added by 0002_projects.sql: the store writes it only when the usage is refreshed.
          storage_bytes: 0,
          // Added by 0003_sharing.sql: NULL until the person chooses one (`setHandle`).
          handle: null,
          // Added by 0005_unbranded_exports.sql: not entitled, by nobody, until an administrator.
          unbranded_exports: 0,
          unbranded_exports_by: null,
          unbranded_exports_at: null,
        },
      ]);
      expect(db.raw.prepare("SELECT * FROM tokens").all()).toEqual([
        {
          id: "t1",
          sub: "u1",
          name: "token 1",
          hash: sha("mdg_1"),
          created_at: T,
          last_used_at: LATER,
        },
      ]);
      expect(db.raw.prepare("SELECT * FROM cli_codes").all()).toEqual([
        {
          hash: sha("code_1"),
          sub: "u1",
          state: "s".repeat(24),
          expires_at: "2026-10-14T12:05:00.000Z",
        },
      ]);
      expect(db.raw.prepare("SELECT * FROM cli_failures").all()).toEqual([
        { key: "caller", at: T },
      ]);
      expect(db.raw.prepare("SELECT * FROM processed_events").all()).toEqual([
        { id: "evt_0", sub: "nobody", at: LATER },
      ]);
      db.close();
    });
  });

  describe("upsertUser", () => {
    it("is one batch: the INSERT with its conflict clause, then the read", async () => {
      const db = openDatabase();
      await d1Store(db).upsertUser(profile, T);
      expect(db.queries).toHaveLength(2);
      const [write, read] = db.queries;
      expect(write?.sql).toMatch(
        /^INSERT INTO users \(sub, name, picture, email, email_verified, created_at\) VALUES \(\?, \?, \?, \?, \?, \?\) ON CONFLICT \(sub\) DO UPDATE SET .* WHERE /,
      );
      // The handle is read with the rest; it is never written by the upsert (its own statement sets it).
      expect(read?.sql).toBe(
        "SELECT sub, name, picture, email, email_verified, created_at, handle, unbranded_exports, unbranded_exports_by, unbranded_exports_at FROM users WHERE sub = ?",
      );
      expect(write?.values).toEqual([
        "u1",
        "Ana",
        "https://example.com/a.png",
        "ana@example.com",
        1,
        T,
      ]);
      expect(read?.values).toEqual(["u1"]);
      expect(write?.batch).not.toBeNull();
      expect(write?.batch).toBe(read?.batch);
      // A person's first time is set by the insert and never by the update.
      expect(write?.sql.split("DO UPDATE SET")[1]).not.toContain("created_at");
      db.close();
    });

    it("writes nothing when the profile is the same, and one row when a column differs", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const written = () => Number(db.raw.prepare("SELECT total_changes() AS n").get()?.n);
      await store.upsertUser(profile, T);
      const afterInsert = written();
      for (let i = 0; i < 3; i++) await store.upsertUser(profile, LATER);
      expect(written()).toBe(afterInsert);
      await store.upsertUser({ ...profile, name: "Ana B." }, LATER);
      expect(written()).toBe(afterInsert + 1);
      await store.upsertUser({ ...profile, name: "Ana B." }, LATER);
      expect(written()).toBe(afterInsert + 1);
      db.close();
    });

    it("returns the row it wrote even when the person's deletion event lands between two requests", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(profile, T);
      await store.applyUserDeleted("evt_1", "u1", T);
      // The cookie is still good for a while: the next request makes the person again.
      const back = await store.upsertUser(profile, LATER);
      expect(back).toEqual({ ...profile, createdAt: LATER, handle: null, ...NOT_ENTITLED });
      db.close();
    });

    it("refuses to guess when the database does not answer the read of the batch", async () => {
      for (const answers of [[], [{}], [{}, {}], [{}, null], [{}, { results: "no rows" }]]) {
        await expect(
          d1Store(scripted({ batch: async () => answers })).upsertUser(profile, T),
        ).rejects.toThrow(/did not answer the read/);
      }
      await expect(
        d1Store(scripted({ batch: async () => [{}, { results: [] }] })).upsertUser(profile, T),
      ).rejects.toThrow(/did not return the user/);
    });

    it("takes the person from the read, whatever the write says", async () => {
      const row = {
        sub: "u1",
        name: "Ana",
        picture: "",
        email: "",
        email_verified: 1,
        created_at: T,
        handle: null,
        unbranded_exports: 1,
        unbranded_exports_by: "admin",
        unbranded_exports_at: T,
      };
      const user = await d1Store(
        scripted({ batch: async () => [{}, { results: [row] }] }),
      ).upsertUser(profile, LATER);
      expect(user).toEqual({
        sub: "u1",
        name: "Ana",
        picture: "",
        email: "",
        emailVerified: true,
        createdAt: T,
        handle: null,
        unbrandedExports: true,
        unbrandedExportsBy: "admin",
        unbrandedExportsAt: T,
      });
    });
  });

  describe("applyUserDeleted", () => {
    /** A person with a profile, a token and an approval code. */
    async function seeded(db: SqliteDb, sub = "u1") {
      const store = d1Store(db);
      await store.upsertUser({ ...profile, sub }, T);
      await store.createToken(token(1, { id: `${sub}-t`, sub, hash: sha(`${sub}/token`) }), 20);
      await store.createCliCode(code(1, { sub, hash: sha(`${sub}/code`) }));
      return store;
    }

    const REFUSE_USER_DELETE =
      "CREATE TRIGGER refuse_user_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'refused'); END";

    it("is two reads, then one batch: the event, then every table the person is in", async () => {
      const db = openDatabase();
      const store = await seeded(db);
      const before = db.queries.length;
      expect(await store.applyUserDeleted("evt_1", "u1", LATER)).toBe("applied");
      const ran = db.queries.slice(before);
      // The projects' rows first (with their members, invitations and publications), children
      // before parents and found by the owner, which has to be there until the last of them; then
      // the person's memberships and the invitations that address their verified email, then the
      // accounts' own tables. The email is read first, for the batch removes the row that holds it.
      expect(ran.map((q) => q.sql)).toEqual([
        "SELECT 1 AS handled FROM processed_events WHERE id = ?",
        "SELECT email FROM users WHERE sub = ? AND email_verified = 1",
        "INSERT INTO processed_events (id, sub, at) VALUES (?, ?, ?)",
        "DELETE FROM version_files WHERE version_id IN (SELECT v.id FROM versions v JOIN projects p ON p.id = v.project_id WHERE p.owner_sub = ?)",
        "DELETE FROM versions WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
        "DELETE FROM project_files WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
        "DELETE FROM project_blobs WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
        "DELETE FROM members WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
        "DELETE FROM invitations WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
        "DELETE FROM publications WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
        "DELETE FROM publish_log WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
        "DELETE FROM projects WHERE owner_sub = ?",
        "DELETE FROM members WHERE sub = ?",
        "DELETE FROM invitations WHERE email = ?",
        "DELETE FROM tokens WHERE sub = ?",
        "DELETE FROM cli_codes WHERE sub = ?",
        "DELETE FROM users WHERE sub = ?",
      ]);
      expect(ran.map((q) => q.values)).toEqual([
        ["evt_1"],
        ["u1"],
        ["evt_1", "u1", LATER],
        ["u1"],
        ["u1"],
        ["u1"],
        ["u1"],
        ["u1"],
        ["u1"],
        ["u1"],
        ["u1"],
        ["u1"],
        ["u1"],
        ["ana@example.com"],
        ["u1"],
        ["u1"],
        ["u1"],
      ]);
      // The reads ran alone; the fifteen writes ran in one transaction.
      expect(ran[0]?.batch).toBeNull();
      expect(ran[1]?.batch).toBeNull();
      expect(ran[2]?.batch).not.toBeNull();
      expect(new Set(ran.slice(2).map((q) => q.batch)).size).toBe(1);
      expect(db.raw.prepare("SELECT id, sub, at FROM processed_events").all()).toEqual([
        { id: "evt_1", sub: "u1", at: LATER },
      ]);
      db.close();
    });

    it("is only the read when the event was already handled", async () => {
      const db = openDatabase();
      const store = await seeded(db);
      await store.applyUserDeleted("evt_1", "u1", T);
      const before = db.queries.length;
      expect(await store.applyUserDeleted("evt_1", "u1", LATER)).toBe("duplicate");
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "SELECT 1 AS handled FROM processed_events WHERE id = ?",
      ]);
      // The record of the first delivery is not touched by the repeat.
      expect(db.raw.prepare("SELECT id, sub, at FROM processed_events").all()).toEqual([
        { id: "evt_1", sub: "u1", at: T },
      ]);
      db.close();
    });

    it("undoes the whole deletion when one statement fails, and applies it when asked again", async () => {
      const db = openDatabase();
      const store = await seeded(db);
      db.raw.exec(REFUSE_USER_DELETE);

      await expect(store.applyUserDeleted("evt_1", "u1", T)).rejects.toThrow(/refused/);

      // Nothing was deleted and the event was not recorded: it can be delivered again.
      expect(await store.user("u1")).toBeDefined();
      expect(await store.tokensOf("u1")).toHaveLength(1);
      expect(await store.takeCliCode(sha("u1/code"))).toBeDefined();
      expect(db.raw.prepare("SELECT count(*) AS n FROM processed_events").get()).toEqual({ n: 0 });

      db.raw.exec("DROP TRIGGER refuse_user_delete");
      expect(await store.applyUserDeleted("evt_1", "u1", T)).toBe("applied");
      expect(await store.user("u1")).toBeUndefined();
      expect(await store.tokensOf("u1")).toEqual([]);
      expect(await store.takeCliCode(sha("u1/code"))).toBeUndefined();
      db.close();
    });

    it("answers duplicate to the delivery that loses a race for the event id, and deletes once", async () => {
      const db = openDatabase();
      const store = await seeded(db);
      // Both deliveries have found the event unhandled before either one writes.
      const meet = barrier(2);
      const wire = withLatency(db, async (sql) => {
        if (sql.startsWith("INSERT INTO processed_events")) await meet();
      });
      const before = db.queries.length;

      const outcomes = await Promise.all([
        d1Store(wire).applyUserDeleted("evt_1", "u1", T),
        d1Store(wire).applyUserDeleted("evt_1", "u1", LATER),
      ]);

      expect([...outcomes].sort()).toEqual(["applied", "duplicate"]);
      const ran = db.queries.slice(before).map((q) => q.sql);
      const handled = "SELECT 1 AS handled FROM processed_events WHERE id = ?";
      expect(ran.slice(0, 2)).toEqual([handled, handled]);
      // The loser's batch ran and failed on the event id; it looked again and found it recorded.
      expect(ran.at(-2)).toBe("INSERT INTO processed_events (id, sub, at) VALUES (?, ?, ?)");
      expect(ran.at(-1)).toBe(handled);
      expect(db.raw.prepare("SELECT count(*) AS n FROM processed_events").get()).toEqual({ n: 1 });
      expect(await store.user("u1")).toBeUndefined();
      expect(await store.tokensOf("u1")).toEqual([]);
      db.close();
    });

    it("leaves what the loser of the race would have deleted to the winner: a person who came back stays", async () => {
      const db = openDatabase();
      const store = await seeded(db);
      await store.applyUserDeleted("evt_1", "u1", T);
      await seeded(db);
      const wire = withLatency(db);
      expect(await d1Store(wire).applyUserDeleted("evt_1", "u1", LATER)).toBe("duplicate");
      expect(await store.user("u1")).toBeDefined();
      expect(await store.tokensOf("u1")).toHaveLength(1);
      db.close();
    });

    it("takes any failure of the batch for a repeat when the event is on record, whatever its text", async () => {
      let reads = 0;
      // The first look finds the event unhandled, the second finds no verified email to look for
      // (the person's row is not there), the third, after the batch failed, finds it on record.
      const raced = scripted({
        first: async () => (++reads <= 2 ? null : { handled: 1 }),
        batch: async () => {
          throw new Error("something nobody expected");
        },
      });
      expect(await d1Store(raced).applyUserDeleted("evt_1", "u1", T)).toBe("duplicate");
      expect(reads).toBe(3);
    });

    it("lets a failure through when the event is not on record, and the batch's failure when the second look fails", async () => {
      const down = scripted({
        first: async () => null,
        batch: async () => {
          throw new Error("the database is down");
        },
      });
      await expect(d1Store(down).applyUserDeleted("evt_1", "u1", T)).rejects.toThrow(
        "the database is down",
      );

      let reads = 0;
      const broken = scripted({
        first: async () => {
          if (++reads > 2) throw new Error("the read failed too");
          return null;
        },
        batch: async () => {
          throw new Error("the database is down");
        },
      });
      await expect(d1Store(broken).applyUserDeleted("evt_1", "u1", T)).rejects.toThrow(
        "the database is down",
      );
    });

    it("works without foreign keys being enforced, because the schema has none to cascade", async () => {
      const db = openDatabase({ foreignKeys: false });
      const store = await seeded(db);
      await seeded(db, "u2");
      await store.applyUserDeleted("evt_1", "u1", T);
      expect(db.raw.prepare("SELECT sub FROM users").all()).toEqual([{ sub: "u2" }]);
      expect(db.raw.prepare("SELECT sub FROM tokens").all()).toEqual([{ sub: "u2" }]);
      expect(db.raw.prepare("SELECT sub FROM cli_codes").all()).toEqual([{ sub: "u2" }]);
      db.close();
    });

    it("leaves no trace of the person in any table but the event's record: its id, the person's opaque id and the time", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(
        {
          sub: "sub-zed",
          name: "Zed Marker",
          picture: "https://example.com/zed-marker.png",
          email: "zed.marker@example.com",
          emailVerified: true,
        },
        T,
      );
      await store.createToken(
        token(1, { id: "id-zed", sub: "sub-zed", name: "zed laptop", hash: sha("zed-token") }),
        20,
      );
      await store.createCliCode(
        code(1, { sub: "sub-zed", hash: sha("zed-code"), state: "zed-state-0123456789" }),
      );
      expect(dump(db)).toContain("Zed Marker");

      await store.applyUserDeleted("evt_zed", "sub-zed", LATER);

      const everything = dump(db);
      for (const marker of [
        "Zed Marker",
        "zed-marker.png",
        "zed.marker@example.com",
        "id-zed",
        "zed laptop",
        sha("zed-token"),
        sha("zed-code"),
        "zed-state-0123456789",
      ]) {
        expect(everything, marker).not.toContain(marker);
      }
      // The opaque id stays once, in the event's record: that is what refuses an old session.
      expect(everything.split("sub-zed").length - 1).toBe(1);
      expect(db.raw.prepare("SELECT * FROM processed_events").all()).toEqual([
        { id: "evt_zed", sub: "sub-zed", at: LATER },
      ]);
      db.close();
    });
  });

  describe("createToken", () => {
    it("is one conditional INSERT, and nothing else", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      expect(await store.createToken(token(1, { lastUsedAt: LATER }), 20)).toBe("created");
      expect(db.queries).toHaveLength(1);
      expect(db.queries[0]?.sql).toBe(
        "INSERT INTO tokens (id, sub, name, hash, created_at, last_used_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM tokens WHERE sub = ?) < ?",
      );
      expect(db.queries[0]?.values).toEqual([
        "t1",
        "u1",
        "token 1",
        sha("mdg_1"),
        T,
        LATER,
        "u1",
        20,
      ]);
      expect(db.queries[0]?.batch).toBeNull();

      // A refusal is the same one statement: no read before it, no follow-up after it.
      const before = db.queries.length;
      expect(await store.createToken(token(2), 1)).toBe("quota");
      expect(db.queries.length - before).toBe(1);
      db.close();
    });

    it("takes the answer from meta.changes", async () => {
      const created = d1Store(scripted({ run: async () => ({ meta: { changes: 1 } }) }));
      const refused = d1Store(scripted({ run: async () => ({ meta: { changes: 0 } }) }));
      expect(await created.createToken(token(), 20)).toBe("created");
      expect(await refused.createToken(token(), 20)).toBe("quota");
    });

    it("refuses to guess when the database does not say how many rows changed", async () => {
      for (const ran of [{}, { meta: {} }, { meta: { changes: undefined } }]) {
        await expect(
          d1Store(scripted({ run: async () => ran })).createToken(token(), 20),
        ).rejects.toThrow(/did not report the rows changed/);
      }
    });

    it("binds a limit SQLite can compare with a count: never NaN, infinite or negative", async () => {
      const bound = async (limit: number) => {
        const db = openDatabase();
        await d1Store(db).createToken(token(), limit);
        const values = db.queries[0]?.values;
        db.close();
        return values?.at(-1);
      };
      expect(await bound(20)).toBe(20);
      expect(await bound(Number.NaN)).toBe(0);
      expect(await bound(-5)).toBe(0);
      expect(await bound(Number.NEGATIVE_INFINITY)).toBe(0);
      expect(await bound(Number.POSITIVE_INFINITY)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("lets the database's own keys refuse a second token with the same id or hash", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createToken(token(1), 20);
      await expect(store.createToken(token(2, { id: "t1" }), 20)).rejects.toThrow(
        /UNIQUE constraint failed: tokens\.id/,
      );
      await expect(store.createToken(token(3, { hash: sha("mdg_1") }), 20)).rejects.toThrow(
        /UNIQUE constraint failed: tokens\.hash/,
      );
      expect(db.raw.prepare("SELECT count(*) AS n FROM tokens").get()).toEqual({ n: 1 });
      db.close();
    });
  });

  describe("revoking, using and finding tokens", () => {
    it("deleteToken is one DELETE that names the owner as well as the id", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createToken(token(1), 20);
      const before = db.queries.length;
      expect(await store.deleteToken("u2", "t1")).toBe(false);
      expect(await store.deleteToken("u1", "t1")).toBe(true);
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "DELETE FROM tokens WHERE id = ? AND sub = ?",
        "DELETE FROM tokens WHERE id = ? AND sub = ?",
      ]);
      expect(ran.map((q) => q.values)).toEqual([
        ["t1", "u2"],
        ["t1", "u1"],
      ]);
      db.close();
    });

    it("deleteToken takes its answer from meta.changes and refuses to guess", async () => {
      expect(
        await d1Store(scripted({ run: async () => ({ meta: { changes: 1 } }) })).deleteToken(
          "u",
          "t",
        ),
      ).toBe(true);
      expect(
        await d1Store(scripted({ run: async () => ({ meta: { changes: 0 } }) })).deleteToken(
          "u",
          "t",
        ),
      ).toBe(false);
      for (const ran of [{}, { meta: {} }, { meta: { changes: undefined } }]) {
        await expect(
          d1Store(scripted({ run: async () => ran })).deleteToken("u", "t"),
        ).rejects.toThrow(/did not report the rows changed/);
      }
    });

    it("touchToken is one UPDATE of the last-used time by the token's id", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createToken(token(1), 20);
      const before = db.queries.length;
      await store.touchToken("t1", LATER);
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual(["UPDATE tokens SET last_used_at = ? WHERE id = ?"]);
      expect(ran[0]?.values).toEqual([LATER, "t1"]);
      db.close();
    });

    it("tokensOf orders by creation time and then by the order the rows were stored, newest first", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.tokensOf("u1");
      expect(db.queries[0]?.sql).toBe(
        "SELECT id, sub, name, hash, created_at, last_used_at FROM tokens WHERE sub = ? ORDER BY created_at DESC, rowid DESC",
      );
      db.close();
    });

    it("tokenByHash maps a row of the table to a token, null included", async () => {
      const row = {
        id: "t1",
        sub: "u1",
        name: "laptop",
        hash: sha("x"),
        created_at: T,
        last_used_at: null,
      };
      const found = await d1Store(scripted({ first: async () => row })).tokenByHash(sha("x"));
      expect(found).toEqual({
        id: "t1",
        sub: "u1",
        name: "laptop",
        hash: sha("x"),
        createdAt: T,
        lastUsedAt: null,
      });
      expect(
        await d1Store(scripted({ first: async () => null })).tokenByHash(sha("x")),
      ).toBeUndefined();
    });
  });

  describe("approval codes and failures", () => {
    it("takeCliCode is one DELETE ... RETURNING, and the row it returns is gone", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createCliCode(code());
      const before = db.queries.length;
      expect(await store.takeCliCode(code().hash)).toEqual(code());
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "DELETE FROM cli_codes WHERE hash = ? RETURNING hash, sub, state, expires_at",
      ]);
      expect(db.raw.prepare("SELECT count(*) AS n FROM cli_codes").get()).toEqual({ n: 0 });
      // Taking nothing is the same single statement and changes nothing.
      expect(await store.takeCliCode(code().hash)).toBeUndefined();
      expect(db.queries.length - before).toBe(2);
      db.close();
    });

    it("takeCliCode maps the row it gets and answers undefined for none", async () => {
      const row = { hash: sha("c"), sub: "u1", state: "s".repeat(16), expires_at: T };
      expect(await d1Store(scripted({ first: async () => row })).takeCliCode(sha("c"))).toEqual({
        hash: sha("c"),
        sub: "u1",
        state: "s".repeat(16),
        expiresAt: T,
      });
      expect(
        await d1Store(scripted({ first: async () => null })).takeCliCode(sha("c")),
      ).toBeUndefined();
    });

    it("recordCliFailure is one batch: the caller's rows older than an hour, then the new row", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.recordCliFailure("caller", "2026-10-14T12:00:00.000Z");
      const before = db.queries.length;
      await store.recordCliFailure("caller", "2026-10-14T14:00:00.000Z");
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "DELETE FROM cli_failures WHERE key = ? AND at < ?",
        "INSERT INTO cli_failures (key, at) VALUES (?, ?)",
      ]);
      expect(ran.map((q) => q.values)).toEqual([
        ["caller", "2026-10-14T13:00:00.000Z"],
        ["caller", "2026-10-14T14:00:00.000Z"],
      ]);
      expect(ran[0]?.batch).not.toBeNull();
      expect(ran[0]?.batch).toBe(ran[1]?.batch);
      expect(db.raw.prepare("SELECT key, at FROM cli_failures").all()).toEqual([
        { key: "caller", at: "2026-10-14T14:00:00.000Z" },
      ]);
      db.close();
    });

    it("recordCliFailure undoes the pruning when the new row is refused", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.recordCliFailure("caller", "2026-10-14T12:00:00.000Z");
      db.raw.exec(
        "CREATE TRIGGER refuse_failure BEFORE INSERT ON cli_failures BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );
      await expect(store.recordCliFailure("caller", "2026-10-14T14:00:00.000Z")).rejects.toThrow(
        /refused/,
      );
      // The old row is still there: the delete that came before the refused insert was undone.
      expect(db.raw.prepare("SELECT key, at FROM cli_failures").all()).toEqual([
        { key: "caller", at: "2026-10-14T12:00:00.000Z" },
      ]);
      db.close();
    });

    it("recordCliFailure never prunes more than the one caller's rows", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.recordCliFailure("other", "2026-10-14T01:00:00.000Z");
      await store.recordCliFailure("caller", "2026-10-14T01:00:00.000Z");
      await store.recordCliFailure("caller", "2026-10-14T14:00:00.000Z");
      expect(db.raw.prepare("SELECT key, at FROM cli_failures ORDER BY key, at").all()).toEqual([
        { key: "caller", at: "2026-10-14T14:00:00.000Z" },
        { key: "other", at: "2026-10-14T01:00:00.000Z" },
      ]);
      db.close();
    });

    it("sweep is one batch: the codes that expired, the failures more than an hour old, the deletions more than 31 days old and the publish requests more than an hour old", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createCliCode(code(1, { expiresAt: "2026-10-14T11:00:00.000Z" }));
      await store.createCliCode(code(2));
      await store.recordCliFailure("caller", "2026-10-14T10:00:00.000Z");
      await store.recordCliFailure("other", "2026-10-14T12:30:00.000Z");
      await store.applyUserDeleted("evt_old", "u-old", "2026-09-10T00:00:00.000Z");
      await store.applyUserDeleted("evt_new", "u-new", "2026-10-01T00:00:00.000Z");
      await store.createProject(project(P1), 100);
      await store.claimPublish(P1, "2026-10-14T10:00:00.000Z", 10);
      await store.claimPublish(P1, "2026-10-14T11:00:00.000Z", 10);
      await store.claimPublish(P1, "2026-10-14T11:30:00.000Z", 10);
      const before = db.queries.length;

      await store.sweep("2026-10-14T12:00:00.000Z");

      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "DELETE FROM cli_codes WHERE expires_at <= ?",
        "DELETE FROM cli_failures WHERE at < ?",
        "DELETE FROM processed_events WHERE at < ?",
        "DELETE FROM publish_log WHERE at < ?",
      ]);
      expect(ran.map((q) => q.values)).toEqual([
        ["2026-10-14T12:00:00.000Z"],
        ["2026-10-14T11:00:00.000Z"],
        ["2026-09-13T12:00:00.000Z"],
        ["2026-10-14T11:00:00.000Z"],
      ]);
      expect(ran[0]?.batch).not.toBeNull();
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      expect(db.raw.prepare("SELECT hash FROM cli_codes").all()).toEqual([{ hash: code(2).hash }]);
      expect(db.raw.prepare("SELECT key FROM cli_failures").all()).toEqual([{ key: "other" }]);
      expect(db.raw.prepare("SELECT id FROM processed_events").all()).toEqual([{ id: "evt_new" }]);
      // The request exactly an hour old stays (it still counts); the one before it goes.
      expect(db.raw.prepare("SELECT at FROM publish_log ORDER BY at").all()).toEqual([
        { at: "2026-10-14T11:00:00.000Z" },
        { at: "2026-10-14T11:30:00.000Z" },
      ]);
      db.close();
    });

    it("sweep undoes the removal of the codes when the removal of the failures is refused", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createCliCode(code(1, { expiresAt: "2026-10-14T11:00:00.000Z" }));
      await store.recordCliFailure("caller", "2026-10-14T10:00:00.000Z");
      db.raw.exec(
        "CREATE TRIGGER refuse_sweep BEFORE DELETE ON cli_failures BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );

      await expect(store.sweep("2026-10-14T12:00:00.000Z")).rejects.toThrow(/refused/);

      expect(db.raw.prepare("SELECT count(*) AS n FROM cli_codes").get()).toEqual({ n: 1 });
      expect(db.raw.prepare("SELECT count(*) AS n FROM cli_failures").get()).toEqual({ n: 1 });
      db.close();
    });

    it("cliFailuresSince is one COUNT of the caller's rows at or after the time", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      expect(await store.cliFailuresSince("caller", T)).toBe(0);
      expect(db.queries.map((q) => q.sql)).toEqual([
        "SELECT COUNT(*) AS failures FROM cli_failures WHERE key = ? AND at >= ?",
      ]);
      expect(db.queries[0]?.values).toEqual(["caller", T]);
      db.close();
    });

    it("cliFailuresSince reads the count as a number, and a missing row as none", async () => {
      expect(
        await d1Store(scripted({ first: async () => ({ failures: 7 }) })).cliFailuresSince("c", T),
      ).toBe(7);
      expect(await d1Store(scripted({ first: async () => null })).cliFailuresSince("c", T)).toBe(0);
    });
  });

  describe("projects", () => {
    const SELECT_PROJECT_SQL =
      "SELECT id, owner_sub, name, description, created_at, updated_at, revision, thumbnail_at, link_access FROM projects WHERE id = ? AND owner_sub = ?";

    it("createProject is one conditional INSERT, and nothing else", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      expect(await store.createProject(project(P1, { name: "N", description: "D" }), 100)).toBe(
        "created",
      );
      expect(db.queries).toHaveLength(1);
      expect(db.queries[0]?.sql).toBe(
        "INSERT INTO projects (id, owner_sub, name, description, created_at, updated_at, revision, thumbnail_at, deleted_at) SELECT ?, ?, ?, ?, ?, ?, 0, NULL, NULL WHERE (SELECT COUNT(*) FROM projects WHERE owner_sub = ?) < ?",
      );
      expect(db.queries[0]?.values).toEqual([P1, "u1", "N", "D", T, T, "u1", 100]);
      expect(db.queries[0]?.batch).toBeNull();

      // A refusal is the same one statement: no read before it, no follow-up after it.
      const before = db.queries.length;
      expect(await store.createProject(project(P2), 1)).toBe("quota");
      expect(db.queries.length - before).toBe(1);
      db.close();
    });

    it("createProject takes the answer from meta.changes and refuses to guess", async () => {
      const created = d1Store(scripted({ run: async () => ({ meta: { changes: 1 } }) }));
      const refused = d1Store(scripted({ run: async () => ({ meta: { changes: 0 } }) }));
      expect(await created.createProject(project(), 100)).toBe("created");
      expect(await refused.createProject(project(), 100)).toBe("quota");
      for (const ran of [{}, { meta: {} }, { meta: { changes: undefined } }]) {
        await expect(
          d1Store(scripted({ run: async () => ran })).createProject(project(), 100),
        ).rejects.toThrow(/did not report the rows changed/);
      }
    });

    it("createProject binds a limit SQLite can compare with a count: never NaN, infinite or negative", async () => {
      const bound = async (limit: number) => {
        const db = openDatabase();
        await d1Store(db).createProject(project(), limit);
        const values = db.queries[0]?.values;
        db.close();
        return values?.at(-1);
      };
      expect(await bound(100)).toBe(100);
      expect(await bound(Number.NaN)).toBe(0);
      expect(await bound(-5)).toBe(0);
      expect(await bound(Number.POSITIVE_INFINITY)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("lets the database's keys refuse a second project with one id, and an id that is not an address", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      await expect(store.createProject(project(P1, { ownerSub: "u2" }), 100)).rejects.toThrow(
        /UNIQUE constraint failed: projects\.id/,
      );
      for (const bad of [
        "short",
        "",
        "PROJ0000000000000001",
        "proj000000000000000-",
        "proj0000000000000 01",
        `${P1}0`,
        P1.slice(0, 19),
        "../../etc/passwd/....",
      ]) {
        await expect(store.createProject(project(bad), 100), bad).rejects.toThrow(
          /CHECK constraint failed/,
        );
      }
      expect(rows(db, "projects")).toBe(1);
      db.close();
    });

    it("reads, renames and deletes a project by its id AND its owner, in the statement itself", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      const before = db.queries.length;
      expect(await store.project("u2", P1)).toBeUndefined();
      expect(await store.updateProject("u2", P1, { name: "x" }, LATER)).toBeUndefined();
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        SELECT_PROJECT_SQL,
        "UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = ? WHERE id = ? AND owner_sub = ? RETURNING id, owner_sub, name, description, created_at, updated_at, revision, thumbnail_at, link_access",
      ]);
      expect(ran.map((q) => q.values)).toEqual([
        [P1, "u2"],
        ["x", null, LATER, P1, "u2"],
      ]);
      expect((await store.project("u1", P1))?.name).toBe("Project");
      db.close();
    });

    it("updateProject with nothing to change is one read, and writes nothing", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      const before = db.queries.length;
      const changes = written(db);
      expect((await store.updateProject("u1", P1, {}, LATER))?.updatedAt).toBe(T);
      expect(db.queries.slice(before).map((q) => q.sql)).toEqual([SELECT_PROJECT_SQL]);
      expect(written(db)).toBe(changes);
      db.close();
    });

    it("listProjects and projectIdsOf order by time and then by the order the rows were stored", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.listProjects("u1");
      await store.projectIdsOf("u1");
      // One read for the projects a person owns and the ones they are a member of: the role of the
      // first part is bound, and the ties of `updated_at` are broken by the project's rowid.
      expect(db.queries.map((q) => q.sql)).toEqual([
        "SELECT p.id AS id, p.owner_sub AS owner_sub, p.name AS name, p.description AS description, p.created_at AS created_at, p.updated_at AS updated_at, p.revision AS revision, p.thumbnail_at AS thumbnail_at, p.link_access AS link_access, ? AS role, p.rowid AS seq FROM projects p WHERE p.owner_sub = ? UNION ALL SELECT p.id, p.owner_sub, p.name, p.description, p.created_at, p.updated_at, p.revision, p.thumbnail_at, p.link_access, m.role, p.rowid FROM members m JOIN projects p ON p.id = m.project_id WHERE m.sub = ? ORDER BY updated_at DESC, seq DESC",
        "SELECT id FROM projects WHERE owner_sub = ? ORDER BY rowid",
      ]);
      expect(db.queries[0]?.values).toEqual(["owner", "u1", "u1"]);
      db.close();
    });

    it("maps a row to a project, null thumbnail included", async () => {
      const row = {
        id: P1,
        owner_sub: "u1",
        name: "N",
        description: "D",
        created_at: T,
        updated_at: LATER,
        revision: 4,
        thumbnail_at: null,
      };
      expect(await d1Store(scripted({ first: async () => row })).project("u1", P1)).toEqual({
        id: P1,
        ownerSub: "u1",
        name: "N",
        description: "D",
        createdAt: T,
        updatedAt: LATER,
        revision: 4,
        thumbnailAt: null,
      });
      expect(
        await d1Store(scripted({ first: async () => null })).project("u1", P1),
      ).toBeUndefined();
    });

    it("deleteProject is one batch: a read, then the children, then the project, each bound to the owner", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      const before = db.queries.length;
      expect(await store.deleteProject("u1", P1)).toBe(true);
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "SELECT id FROM projects WHERE id = ? AND owner_sub = ?",
        "DELETE FROM version_files WHERE version_id IN (SELECT v.id FROM versions v JOIN projects p ON p.id = v.project_id WHERE p.id = ? AND p.owner_sub = ?)",
        "DELETE FROM versions WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
        "DELETE FROM project_files WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
        "DELETE FROM project_blobs WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
        "DELETE FROM members WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
        "DELETE FROM invitations WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
        "DELETE FROM publications WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
        "DELETE FROM publish_log WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
        "DELETE FROM projects WHERE id = ? AND owner_sub = ?",
      ]);
      expect(
        ran.every((q) => q.values.length === 2 && q.values[0] === P1 && q.values[1] === "u1"),
      ).toBe(true);
      expect(ran[0]?.batch).not.toBeNull();
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      db.close();
    });

    /** A project with files, an upload and two versions, and a second project of another person. */
    async function filled(db: SqliteDb) {
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      await store.createProject(project(P2, { ownerSub: "u2" }), 100);
      for (const id of [P1, P2]) {
        await store.applyMaterialisation({
          projectId: id,
          upserts: new Map([["a.meltemi", bh("a")]]),
          deletes: [],
          blobs: [blobOf("a")],
          revision: 1,
          now: T,
        });
        await store.addProjectBlob(id, bh("logo"));
        for (const createdBy of ["u1", "u2"]) {
          await store.createVersion(
            { projectId: id, label: null, auto: false, createdBy, createdAt: T },
            { maxVersions: 10 },
          );
        }
      }
      return store;
    }

    it("deleteProject of someone else's project runs the same batch and changes no row", async () => {
      const db = openDatabase();
      const store = await filled(db);
      const changes = written(db);
      const counts = PROJECT_TABLES.map((table) => rows(db, table));
      expect(await store.deleteProject("u2", P1)).toBe(false);
      expect(written(db)).toBe(changes);
      expect(PROJECT_TABLES.map((table) => rows(db, table))).toEqual(counts);
      db.close();
    });

    it("deleteProject deletes that project's rows and no other's, in every table", async () => {
      const db = openDatabase();
      const store = await filled(db);
      expect(PROJECT_TABLES.map((table) => rows(db, table))).toEqual([2, 2, 2, 4, 2 * 2]);
      expect(await store.deleteProject("u1", P1)).toBe(true);
      expect(PROJECT_TABLES.map((table) => rows(db, table))).toEqual([1, 1, 1, 2, 2]);
      expect(db.raw.prepare("SELECT id FROM projects").all()).toEqual([{ id: P2 }]);
      expect(db.raw.prepare("SELECT DISTINCT project_id FROM versions").all()).toEqual([
        { project_id: P2 },
      ]);
      // Every file row left belongs to a version that is left.
      expect(
        db.raw
          .prepare(
            "SELECT count(*) AS n FROM version_files WHERE version_id NOT IN (SELECT id FROM versions)",
          )
          .get(),
      ).toEqual({ n: 0 });
      db.close();
    });

    it("deleteProject undoes the whole deletion when one statement is refused, and works when asked again", async () => {
      const db = openDatabase();
      const store = await filled(db);
      const counts = PROJECT_TABLES.map((table) => rows(db, table));
      db.raw.exec(
        "CREATE TRIGGER refuse_project_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );
      await expect(store.deleteProject("u1", P1)).rejects.toThrow(/refused/);
      expect(PROJECT_TABLES.map((table) => rows(db, table))).toEqual(counts);
      db.raw.exec("DROP TRIGGER refuse_project_delete");
      expect(await store.deleteProject("u1", P1)).toBe(true);
      expect(rows(db, "projects")).toBe(1);
      db.close();
    });

    it("deleteProject takes whether the project was there from the read of its batch, and refuses to guess", async () => {
      const there = d1Store(scripted({ batch: async () => [{ results: [{ id: P1 }] }] }));
      const gone = d1Store(scripted({ batch: async () => [{ results: [] }] }));
      expect(await there.deleteProject("u1", P1)).toBe(true);
      expect(await gone.deleteProject("u1", P1)).toBe(false);
      for (const answers of [[], [{}], [null], [{ results: "no rows" }]]) {
        await expect(
          d1Store(scripted({ batch: async () => answers })).deleteProject("u1", P1),
        ).rejects.toThrow(/did not answer the read/);
      }
    });

    it("claimThumbnail is one conditional UPDATE and takes its answer from meta.changes", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      const before = db.queries.length;
      expect(await store.claimThumbnail(P1, LATER, T)).toBe(true);
      expect(await store.claimThumbnail(P1, LATER, T)).toBe(false);
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "UPDATE projects SET thumbnail_at = ? WHERE id = ? AND (thumbnail_at IS NULL OR thumbnail_at <= ?)",
        "UPDATE projects SET thumbnail_at = ? WHERE id = ? AND (thumbnail_at IS NULL OR thumbnail_at <= ?)",
      ]);
      expect(ran[0]?.values).toEqual([LATER, P1, T]);
      expect(db.raw.prepare("SELECT thumbnail_at FROM projects").get()).toEqual({
        thumbnail_at: LATER,
      });
      for (const ranWith of [{}, { meta: {} }]) {
        await expect(
          d1Store(scripted({ run: async () => ranWith })).claimThumbnail(P1, LATER, T),
        ).rejects.toThrow(/did not report the rows changed/);
      }
      db.close();
    });
  });

  describe("applyMaterialisation", () => {
    /** A database with a project, and the statements one call ran. */
    async function setup() {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      return { db, store };
    }

    const entries = (count: number, from = 0): [string, string][] =>
      Array.from({ length: count }, (_, i) => [
        `f/${String(from + i).padStart(4, "0")}`,
        bh(`h${from + i}`),
      ]);

    it("is one batch: the read of the project, the blobs, the deletions, the upserts, then the revision", async () => {
      const { db, store } = await setup();
      const before = db.queries.length;
      const result = await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map([
          ["a.meltemi", bh("a")],
          ["b.json", bh("b")],
        ]),
        deletes: ["old.md"],
        blobs: [blobOf("a", 11), blobOf("b", 22)],
        revision: 3,
        now: LATER,
      });
      expect(result).toBe(true);
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "SELECT 1 AS found FROM projects WHERE id = ?",
        "INSERT INTO blobs (hash, size, media_type, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?) ON CONFLICT (hash) DO UPDATE SET created_at = excluded.created_at WHERE excluded.created_at > blobs.created_at",
        "DELETE FROM project_files WHERE project_id = ? AND path IN (?)",
        "INSERT INTO project_files (project_id, path, hash) SELECT p.id, v.column1, v.column2 FROM projects p, (VALUES (?, ?), (?, ?)) AS v WHERE p.id = ? ON CONFLICT (project_id, path) DO UPDATE SET hash = excluded.hash WHERE project_files.hash <> excluded.hash",
        "UPDATE projects SET revision = ?, updated_at = ? WHERE id = ? AND revision <> ?",
      ]);
      expect(ran.map((q) => q.values)).toEqual([
        [P1],
        [bh("a"), 11, "text/plain", LATER, bh("b"), 22, "text/plain", LATER],
        [P1, "old.md"],
        ["a.meltemi", bh("a"), "b.json", bh("b"), P1],
        [3, LATER, P1, 3],
      ]);
      expect(ran[0]?.batch).not.toBeNull();
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      db.close();
    });

    it("cuts 250 upserts, 250 deletions and 60 blobs into statements of at most 100 parameters, all in one batch", async () => {
      const { db, store } = await setup();
      const before = db.queries.length;
      await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map(entries(250)),
        deletes: entries(250, 1000).map(([path]) => path),
        blobs: Array.from({ length: 60 }, (_, i) => blobOf(`blob-${i}`)),
        revision: 1,
        now: T,
      });
      const ran = db.queries.slice(before);
      for (const { sql, values } of ran) {
        expect(values.length, sql).toBeLessThanOrEqual(100);
        expect(sql.match(/\?/g)?.length ?? 0, sql).toBe(values.length);
      }
      const sizes = (prefix: string) =>
        ran.filter((q) => q.sql.startsWith(prefix)).map((q) => q.values.length);
      expect(sizes("INSERT INTO blobs")).toEqual([100, 100, 40]);
      expect(sizes("DELETE FROM project_files")).toEqual([100, 100, 53]);
      expect(sizes("INSERT INTO project_files")).toEqual([99, 99, 99, 99, 99, 11]);
      // The read, three of blobs, three of deletions, six of upserts, the revision.
      expect(ran).toHaveLength(14);
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      expect(ran[0]?.batch).not.toBeNull();
      expect(rows(db, "project_files")).toBe(250);
      expect(rows(db, "blobs")).toBe(60);
      db.close();
    });

    it.each([
      ["upserts", 49, 1, 99],
      ["upserts", 50, 2, 99],
      ["deletes", 99, 1, 100],
      ["deletes", 100, 2, 100],
      ["blobs", 25, 1, 100],
      ["blobs", 26, 2, 100],
    ] as const)(
      "cuts %s at the limit: %i of them make %i statement(s), the biggest binding %i",
      async (kind, count, statements, biggest) => {
        const { db, store } = await setup();
        const before = db.queries.length;
        await store.applyMaterialisation({
          projectId: P1,
          upserts: new Map(kind === "upserts" ? entries(count) : []),
          deletes: kind === "deletes" ? entries(count).map(([path]) => path) : [],
          blobs: kind === "blobs" ? Array.from({ length: count }, (_, i) => blobOf(`b${i}`)) : [],
          revision: 1,
          now: T,
        });
        const prefix = {
          upserts: "INSERT INTO project_files",
          deletes: "DELETE FROM project_files",
          blobs: "INSERT INTO blobs",
        }[kind];
        const ran = db.queries.slice(before).filter((q) => q.sql.startsWith(prefix));
        expect(ran).toHaveLength(statements);
        expect(Math.max(...ran.map((q) => q.values.length))).toBe(biggest);
        db.close();
      },
    );

    it("writes nothing for a list that is empty, and does not repeat what it is given twice", async () => {
      const { db, store } = await setup();
      const before = db.queries.length;
      await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map(),
        deletes: ["x", "x", "y"],
        blobs: [blobOf("a"), blobOf("a")],
        revision: 1,
        now: T,
      });
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql.split(" (")[0])).toEqual([
        "SELECT 1 AS found FROM projects WHERE id = ?",
        "INSERT INTO blobs",
        "DELETE FROM project_files WHERE project_id = ? AND path IN",
        "UPDATE projects SET revision = ?, updated_at = ? WHERE id = ? AND revision <> ?",
      ]);
      expect(ran[1]?.values).toHaveLength(4);
      expect(ran[2]?.values).toEqual([P1, "x", "y"]);
      db.close();
    });

    it("writes only the rows that change: the same materialisation again rewrites only the project", async () => {
      const { db, store } = await setup();
      const materialisation = {
        projectId: P1,
        upserts: new Map(entries(3)),
        deletes: [],
        blobs: [blobOf("a"), blobOf("b"), blobOf("c")],
        revision: 1,
        now: T,
      };
      const start = written(db);
      await store.applyMaterialisation(materialisation);
      // Three file rows, three blob rows and the project.
      expect(written(db) - start).toBe(7);

      const again = written(db);
      await store.applyMaterialisation({ ...materialisation, revision: 2 });
      // The files are the same, the blobs are as new as they were: only the project's row.
      expect(written(db) - again).toBe(1);

      const third = written(db);
      await store.applyMaterialisation({
        ...materialisation,
        upserts: new Map([...entries(3).slice(0, 1), ["f/0001", bh("changed")]]),
        deletes: ["f/0002"],
        blobs: [blobOf("a")],
        revision: 3,
        now: LATER,
      });
      // One file left alone, one rewritten, one removed, one blob made newer, the project.
      expect(written(db) - third).toBe(4);
      db.close();
    });

    it("undoes the blobs, the deletions and the upserts when one statement is refused", async () => {
      const { db, store } = await setup();
      await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map([["keep", bh("keep")]]),
        deletes: [],
        blobs: [blobOf("keep")],
        revision: 1,
        now: T,
      });
      db.raw.exec(
        "CREATE TRIGGER refuse_file BEFORE INSERT ON project_files WHEN NEW.path = 'boom' BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );
      await expect(
        store.applyMaterialisation({
          projectId: P1,
          upserts: new Map([
            ["ok", bh("ok")],
            ["boom", bh("boom")],
          ]),
          deletes: ["keep"],
          blobs: [blobOf("ok"), blobOf("boom")],
          revision: 9,
          now: LATER,
        }),
      ).rejects.toThrow(/refused/);
      expect(db.raw.prepare("SELECT path FROM project_files").all()).toEqual([{ path: "keep" }]);
      expect(db.raw.prepare("SELECT hash FROM blobs").all()).toEqual([{ hash: bh("keep") }]);
      expect(db.raw.prepare("SELECT revision, updated_at FROM projects").get()).toEqual({
        revision: 1,
        updated_at: T,
      });
      db.close();
    });

    it("writes no file row for a project that is gone, still registers the blobs, and says false", async () => {
      const { db, store } = await setup();
      await store.deleteProject("u1", P1);
      const result = await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map(entries(100)),
        deletes: ["x"],
        blobs: [blobOf("late")],
        revision: 1,
        now: T,
      });
      expect(result).toBe(false);
      expect(rows(db, "project_files")).toBe(0);
      expect(rows(db, "projects")).toBe(0);
      expect(rows(db, "blobs")).toBe(1);
      db.close();
    });

    it("refuses a hash that is not a SHA-256 and a size that is negative, writing nothing of the batch", async () => {
      const { db, store } = await setup();
      const apply = (hash: string, size = 1) =>
        store.applyMaterialisation({
          projectId: P1,
          upserts: new Map([["a", hash]]),
          deletes: [],
          blobs: [{ hash: bh("fine"), size, mediaType: "text/plain" }],
          revision: 5,
          now: T,
        });
      await expect(apply("not-a-hash")).rejects.toThrow(/CHECK constraint failed/);
      await expect(apply(bh("a").toUpperCase())).rejects.toThrow(/CHECK constraint failed/);
      await expect(apply(bh("a"), -1)).rejects.toThrow(/CHECK constraint failed/);
      expect(rows(db, "project_files")).toBe(0);
      expect(rows(db, "blobs")).toBe(0);
      expect((await store.project("u1", P1))?.revision).toBe(0);
      db.close();
    });

    it("takes whether the project is there from the read of the batch, and refuses to guess", async () => {
      const materialisation = {
        projectId: P1,
        upserts: new Map<string, string>(),
        deletes: [],
        blobs: [],
        revision: 1,
        now: T,
      };
      const there = d1Store(scripted({ batch: async () => [{ results: [{ found: 1 }] }, {}] }));
      const gone = d1Store(scripted({ batch: async () => [{ results: [] }, {}] }));
      expect(await there.applyMaterialisation(materialisation)).toBe(true);
      expect(await gone.applyMaterialisation(materialisation)).toBe(false);
      await expect(
        d1Store(scripted({ batch: async () => [] })).applyMaterialisation(materialisation),
      ).rejects.toThrow(/did not answer the read/);
    });
  });

  describe("blobs", () => {
    it("blobsPresent reads 250 hashes in three statements of at most 100 parameters, in one batch", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const hashes = Array.from({ length: 250 }, (_, i) => bh(`b${i}`));
      await store.addBlobs(
        hashes.filter((_, i) => i % 2 === 0).map((hash) => ({ hash, size: 1, mediaType: "t" })),
        T,
      );
      const before = db.queries.length;
      const found = await store.blobsPresent([...hashes, ...hashes.slice(0, 10)]);
      expect(found.size).toBe(125);
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.values.length)).toEqual([100, 100, 50]);
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      expect(ran[0]?.batch).not.toBeNull();
      for (const q of ran)
        expect(q.sql).toMatch(/^SELECT hash FROM blobs WHERE hash IN \(\?(, \?)*\)$/);

      // Nothing to look for is no query.
      const quiet = db.queries.length;
      expect(await store.blobsPresent([])).toEqual(new Set());
      expect(db.queries.length).toBe(quiet);
      db.close();
    });

    it("addBlobs writes 60 blobs in three statements in one batch, and nothing for none", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.addBlobs(
        Array.from({ length: 60 }, (_, i) => blobOf(`b${i}`)),
        T,
      );
      expect(db.queries.map((q) => q.values.length)).toEqual([100, 100, 40]);
      expect(new Set(db.queries.map((q) => q.batch)).size).toBe(1);
      expect(db.queries[0]?.batch).not.toBeNull();
      const quiet = db.queries.length;
      await store.addBlobs([], T);
      expect(db.queries.length).toBe(quiet);
      expect(rows(db, "blobs")).toBe(60);
      db.close();
    });

    it("addBlobs is atomic across its statements: a bad row in the last one undoes the first ones", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const good = Array.from({ length: 30 }, (_, i) => blobOf(`b${i}`));
      await expect(
        store.addBlobs([...good, { hash: "not-a-hash", size: 1, mediaType: "t" }], T),
      ).rejects.toThrow(/CHECK constraint failed/);
      expect(rows(db, "blobs")).toBe(0);
      await expect(store.addBlobs([{ ...blobOf("x"), size: -1 }], T)).rejects.toThrow(
        /CHECK constraint failed/,
      );
      db.close();
    });

    it("keeps a blob's size and type when it is added again, and makes its age only newer", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.addBlobs([{ hash: bh("a"), size: 5, mediaType: "text/plain" }], LATER);
      const changes = written(db);
      await store.addBlobs([{ hash: bh("a"), size: 9, mediaType: "image/png" }], T);
      // Older than what it has: not a row written.
      expect(written(db)).toBe(changes);
      await store.addBlobs(
        [{ hash: bh("a"), size: 9, mediaType: "image/png" }],
        "2026-10-15T00:00:00.000Z",
      );
      expect(written(db)).toBe(changes + 1);
      expect(db.raw.prepare("SELECT size, media_type, created_at FROM blobs").get()).toEqual({
        size: 5,
        media_type: "text/plain",
        created_at: "2026-10-15T00:00:00.000Z",
      });
      db.close();
    });

    it("addProjectBlob is one batch: the read of the project, then an INSERT from the project's own row", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      const before = db.queries.length;
      expect(await store.addProjectBlob(P1, bh("logo"))).toBe(true);
      expect(await store.addProjectBlob(pid(9), bh("logo"))).toBe(false);
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "SELECT 1 AS found FROM projects WHERE id = ?",
        "INSERT INTO project_blobs (project_id, hash) SELECT id, ? FROM projects WHERE id = ? ON CONFLICT (project_id, hash) DO NOTHING",
        "SELECT 1 AS found FROM projects WHERE id = ?",
        "INSERT INTO project_blobs (project_id, hash) SELECT id, ? FROM projects WHERE id = ? ON CONFLICT (project_id, hash) DO NOTHING",
      ]);
      expect(ran.map((q) => q.values)).toEqual([
        [P1],
        [bh("logo"), P1],
        [pid(9)],
        [bh("logo"), pid(9)],
      ]);
      expect(ran[0]?.batch).toBe(ran[1]?.batch);
      expect(rows(db, "project_blobs")).toBe(1);
      // A repeat is no row written.
      const changes = written(db);
      await store.addProjectBlob(P1, bh("logo"));
      expect(written(db)).toBe(changes);
      db.close();
    });

    it("refuses an upload that is not a SHA-256", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      await expect(store.addProjectBlob(P1, "../logo.png")).rejects.toThrow(
        /CHECK constraint failed/,
      );
      expect(rows(db, "project_blobs")).toBe(0);
      db.close();
    });

    it("copyProjectBlobs is one INSERT from the first project's rows, only into a project the person owns", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      await store.createProject(project(P2), 100);
      await store.addProjectBlob(P1, bh("a"));
      const before = db.queries.length;
      expect(await store.copyProjectBlobs("u1", P1, P2)).toBe(1);
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "INSERT INTO project_blobs (project_id, hash) SELECT ?, b.hash FROM project_blobs b WHERE b.project_id = ? AND EXISTS (SELECT 1 FROM projects WHERE id = ?) AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_sub = ?) ON CONFLICT (project_id, hash) DO NOTHING",
      ]);
      expect(ran[0]?.values).toEqual([P2, P1, P1, P2, "u1"]);
      expect(ran[0]?.batch).toBeNull();
      db.close();
    });

    it("copyProjectBlobs takes its count from meta.changes and refuses to guess", async () => {
      expect(
        await d1Store(scripted({ run: async () => ({ meta: { changes: 3 } }) })).copyProjectBlobs(
          "u1",
          P1,
          P2,
        ),
      ).toBe(3);
      await expect(
        d1Store(scripted({ run: async () => ({}) })).copyProjectBlobs("u1", P1, P2),
      ).rejects.toThrow(/did not report the rows changed/);
    });

    it("projectHoldsBlob is one statement: the uploads, then the project's versions", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.projectHoldsBlob(P1, bh("a"));
      expect(db.queries.map((q) => q.sql)).toEqual([
        "SELECT 1 AS found FROM project_blobs WHERE project_id = ? AND hash = ? UNION ALL SELECT 1 FROM versions v JOIN version_files f ON f.version_id = v.id WHERE v.project_id = ? AND f.hash = ? LIMIT 1",
      ]);
      expect(db.queries[0]?.values).toEqual([P1, bh("a"), P1, bh("a")]);
      db.close();
    });
  });

  describe("versions", () => {
    /** A project with two files, ready for versions. */
    async function ready() {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map([
          ["a.meltemi", bh("a")],
          ["b.json", bh("b")],
        ]),
        deletes: [],
        blobs: [blobOf("a"), blobOf("b")],
        revision: 1,
        now: T,
      });
      return { db, store };
    }

    const input = (over = {}) => ({
      projectId: P1,
      label: "first",
      auto: false,
      createdBy: "u1",
      createdAt: LATER,
      ...over,
    });

    it("createVersion is one batch: the INSERT under its conditions, the read of the row, the copy of the files", async () => {
      const { db, store } = await ready();
      const before = db.queries.length;
      const made = await store.createVersion(input(), {
        maxVersions: 200,
        rate: { max: 6, since: T },
      });
      expect(made).toEqual({
        projectId: P1,
        number: 1,
        label: "first",
        auto: false,
        createdBy: "u1",
        createdAt: LATER,
      });
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql)).toEqual([
        "INSERT INTO versions (project_id, number, label, auto, created_by, created_at) SELECT p.id, COALESCE((SELECT MAX(number) FROM versions WHERE project_id = p.id), 0) + 1, ?, ?, ?, ? FROM projects p WHERE p.id = ? AND (SELECT COUNT(*) FROM versions WHERE project_id = p.id) < ? AND (SELECT COUNT(*) FROM versions WHERE project_id = p.id AND created_at >= ?) < ?",
        "SELECT project_id, number, label, auto, created_by, created_at FROM versions WHERE project_id = ? AND number = (SELECT MAX(number) FROM versions WHERE project_id = ?) AND changes() = 1",
        "INSERT INTO version_files (version_id, path, hash) SELECT v.id, f.path, f.hash FROM versions v JOIN project_files f ON f.project_id = v.project_id WHERE v.project_id = ? AND v.number = (SELECT MAX(number) FROM versions WHERE project_id = ?) AND changes() = 1",
      ]);
      expect(ran.map((q) => q.values)).toEqual([
        ["first", 0, "u1", LATER, P1, 200, T, 6],
        [P1, P1],
        [P1, P1],
      ]);
      expect(ran[0]?.batch).not.toBeNull();
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      expect(db.raw.prepare("SELECT path, hash FROM version_files ORDER BY path").all()).toEqual([
        { path: "a.meltemi", hash: bh("a") },
        { path: "b.json", hash: bh("b") },
      ]);
      db.close();
    });

    it("createVersion without a rate binds a window that holds everything and an allowance nobody reaches", async () => {
      const { db, store } = await ready();
      await store.createVersion(input({ auto: true, label: null }), { maxVersions: 200 });
      expect(db.queries.at(-3)?.values).toEqual([
        null,
        1,
        "u1",
        LATER,
        P1,
        200,
        LATER,
        Number.MAX_SAFE_INTEGER,
      ]);
      db.close();
    });

    it("createVersion binds limits SQLite can compare with a count: never NaN, infinite or negative", async () => {
      const { db, store } = await ready();
      const bound = async (guard: Parameters<typeof store.createVersion>[1]) => {
        const from = db.queries.length;
        await store.createVersion(input(), guard);
        return db.queries[from]?.values.slice(5);
      };
      expect(await bound({ maxVersions: Number.NaN, rate: { max: Number.NaN, since: T } })).toEqual(
        [0, T, 0],
      );
      expect(await bound({ maxVersions: -1, rate: { max: -3, since: T } })).toEqual([0, T, 0]);
      expect(
        await bound({
          maxVersions: Number.POSITIVE_INFINITY,
          rate: { max: Number.POSITIVE_INFINITY, since: T },
        }),
      ).toEqual([Number.MAX_SAFE_INTEGER, T, Number.MAX_SAFE_INTEGER]);
      db.close();
    });

    it("a refused version writes nothing: no row, and no file copied into the version before it", async () => {
      const { db, store } = await ready();
      await store.createVersion(input(), { maxVersions: 1 });
      const files = rows(db, "version_files");
      const changes = written(db);
      const before = db.queries.length;
      expect(await store.createVersion(input({ label: "second" }), { maxVersions: 1 })).toBe(
        "quota",
      );
      // The batch of three ran, and then one read to tell why.
      const ran = db.queries.slice(before);
      expect(ran).toHaveLength(4);
      expect(new Set(ran.slice(0, 3).map((q) => q.batch)).size).toBe(1);
      expect(ran[3]?.batch).toBeNull();
      expect(ran[3]?.sql).toBe(
        "SELECT (SELECT COUNT(*) FROM projects WHERE id = ?) AS found, (SELECT COUNT(*) FROM versions WHERE project_id = ?) AS held",
      );
      expect(written(db)).toBe(changes);
      expect(rows(db, "versions")).toBe(1);
      expect(rows(db, "version_files")).toBe(files);
      db.close();
    });

    it("undoes the version when its files cannot be copied", async () => {
      const { db, store } = await ready();
      db.raw.exec(
        "CREATE TRIGGER refuse_version_file BEFORE INSERT ON version_files BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );
      await expect(store.createVersion(input(), { maxVersions: 5 })).rejects.toThrow(/refused/);
      expect(rows(db, "versions")).toBe(0);
      expect(rows(db, "version_files")).toBe(0);
      db.raw.exec("DROP TRIGGER refuse_version_file");
      expect(await store.createVersion(input(), { maxVersions: 5 })).toMatchObject({ number: 1 });
      db.close();
    });

    it("keeps the numbers of a project unique with the database's own key", async () => {
      const { db, store } = await ready();
      await store.createVersion(input(), { maxVersions: 5 });
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO versions (project_id, number, label, auto, created_by, created_at) VALUES (?, 1, NULL, 0, 'u1', ?)",
          )
          .run(P1, T),
      ).toThrow(/UNIQUE constraint failed: versions\.project_id, versions\.number/);
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO versions (project_id, number, label, auto, created_by, created_at) VALUES (?, 0, NULL, 0, 'u1', ?)",
          )
          .run(P1, T),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });

    it("tells why a version was refused from the read made after, and builds the row from the batch's read", async () => {
      const row = {
        project_id: P1,
        number: 4,
        label: null,
        auto: 1,
        created_by: "u1",
        created_at: T,
      };
      const refused = (state: unknown) =>
        d1Store(
          scripted({
            batch: async () => [{}, { results: [] }, {}],
            first: async () => state,
          }),
        );
      const guard = { maxVersions: 3 };
      expect(await refused({ found: 0, held: 0 }).createVersion(input(), guard)).toBe("missing");
      expect(await refused(null).createVersion(input(), guard)).toBe("missing");
      expect(await refused({ found: 1, held: 3 }).createVersion(input(), guard)).toBe("quota");
      expect(await refused({ found: 1, held: 1 }).createVersion(input(), guard)).toBe("rate");
      expect(
        await d1Store(scripted({ batch: async () => [{}, { results: [row] }, {}] })).createVersion(
          input(),
          guard,
        ),
      ).toEqual({
        projectId: P1,
        number: 4,
        label: null,
        auto: true,
        createdBy: "u1",
        createdAt: T,
      });
      for (const answers of [[], [{}], [{}, null], [{}, { results: "no rows" }]]) {
        await expect(
          d1Store(scripted({ batch: async () => answers })).createVersion(input(), guard),
        ).rejects.toThrow(/did not answer the read/);
      }
    });

    it("versionChanges reads the numbers and the changes in one batch of two", async () => {
      const { db, store } = await ready();
      await store.createVersion(input(), { maxVersions: 5 });
      const before = db.queries.length;
      expect(await store.versionChanges(P1)).toEqual(new Map([[1, ["a.meltemi", "b.json"]]]));
      const ran = db.queries.slice(before);
      expect(ran).toHaveLength(2);
      expect(ran[0]?.sql).toBe("SELECT number FROM versions WHERE project_id = ? ORDER BY number");
      expect(ran[1]?.sql).toMatch(/^WITH chain AS \(/);
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      expect(ran[0]?.batch).not.toBeNull();
      db.close();
    });

    it("deleteVersions removes the files of the chunks first, then the versions, in one batch of statements of at most 100 parameters", async () => {
      const { db, store } = await ready();
      for (let i = 0; i < 120; i++) {
        await store.createVersion(input({ label: null }), { maxVersions: 500 });
      }
      const before = db.queries.length;
      await store.deleteVersions(
        P1,
        Array.from({ length: 120 }, (_, i) => i + 1),
      );
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql.split(" (")[0])).toEqual([
        "DELETE FROM version_files WHERE version_id IN",
        "DELETE FROM version_files WHERE version_id IN",
        "DELETE FROM versions WHERE project_id = ? AND number IN",
        "DELETE FROM versions WHERE project_id = ? AND number IN",
      ]);
      expect(ran.map((q) => q.values.length)).toEqual([100, 22, 100, 22]);
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      expect(ran[0]?.batch).not.toBeNull();
      expect(rows(db, "versions")).toBe(0);
      expect(rows(db, "version_files")).toBe(0);
      db.close();
    });

    it("deleteVersions sends nothing for a list with no number that could name a version", async () => {
      const { db, store } = await ready();
      const before = db.queries.length;
      await store.deleteVersions(P1, []);
      await store.deleteVersions(P1, [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -Infinity]);
      expect(db.queries.length).toBe(before);
      db.close();
    });

    it("deleteVersions undoes the files it removed when the versions cannot go", async () => {
      const { db, store } = await ready();
      for (let i = 0; i < 3; i++)
        await store.createVersion(input({ label: null }), { maxVersions: 9 });
      db.raw.exec(
        "CREATE TRIGGER refuse_version_delete BEFORE DELETE ON versions BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );
      await expect(store.deleteVersions(P1, [1, 2])).rejects.toThrow(/refused/);
      expect(rows(db, "versions")).toBe(3);
      expect(rows(db, "version_files")).toBe(6);
      db.close();
    });

    it("versionFiles tells a version without files from no version, by the LEFT JOIN's single row", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      await store.createVersion(input(), { maxVersions: 5 });
      expect(await store.versionFiles(P1, 1)).toEqual(new Map());
      expect(await store.versionFiles(P1, 2)).toBeUndefined();
      db.close();
    });
  });

  describe("usage and collection", () => {
    it("refreshStorageBytes computes and stores the figure in one UPDATE ... RETURNING", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(profile, T);
      await store.createProject(project(P1), 100);
      await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map([["a", bh("a")]]),
        deletes: [],
        blobs: [blobOf("a", 1234)],
        revision: 1,
        now: T,
      });
      const before = db.queries.length;
      expect(await store.refreshStorageBytes("u1")).toBe(1234);
      const ran = db.queries.slice(before);
      expect(ran).toHaveLength(1);
      expect(ran[0]?.sql).toMatch(
        /^UPDATE users SET storage_bytes = \(SELECT COALESCE\(SUM\(size\), 0\) FROM blobs WHERE hash IN \(.*\)\) WHERE sub = \? RETURNING storage_bytes$/,
      );
      expect(ran[0]?.values).toEqual(["u1", "u1", "u1", "u1"]);
      expect(ran[0]?.batch).toBeNull();
      expect(db.raw.prepare("SELECT storage_bytes FROM users").get()).toEqual({
        storage_bytes: 1234,
      });
      expect(await store.refreshStorageBytes("nobody")).toBe(0);
      db.close();
    });

    it("storageBytesOf and usage are one SELECT each", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.storageBytesOf("u1");
      await store.usage("u1");
      expect(db.queries).toHaveLength(2);
      expect(db.queries[0]?.values).toEqual(["u1", "u1", "u1"]);
      expect(db.queries[1]?.sql).toBe(
        "SELECT (SELECT COUNT(*) FROM projects WHERE owner_sub = ?) AS projects, COALESCE((SELECT storage_bytes FROM users WHERE sub = ?), 0) AS storage_bytes",
      );
      expect(db.queries[1]?.values).toEqual(["u1", "u1"]);
      db.close();
    });

    it("usage reads the numbers the database gives, and zero for a missing row", async () => {
      expect(
        await d1Store(scripted({ first: async () => ({ projects: 3, storage_bytes: 77 }) })).usage(
          "u1",
        ),
      ).toEqual({ projects: 3, storageBytes: 77 });
      expect(await d1Store(scripted({ first: async () => null })).usage("u1")).toEqual({
        projects: 0,
        storageBytes: 0,
      });
    });

    it("unreferencedBlobs is one SELECT of the old blobs that no table references, bound to a limit SQLite can use", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const bound = async (limit: number) => {
        const from = db.queries.length;
        await store.unreferencedBlobs(LATER, limit);
        return db.queries[from]?.values;
      };
      expect(await bound(500)).toEqual([LATER, 500]);
      expect(await bound(Number.NaN)).toEqual([LATER, 0]);
      expect(await bound(-1)).toEqual([LATER, 0]);
      expect(await bound(Number.POSITIVE_INFINITY)).toEqual([LATER, Number.MAX_SAFE_INTEGER]);
      expect(db.queries[0]?.sql).toBe(
        "SELECT hash FROM blobs WHERE created_at < ? AND hash NOT IN (SELECT hash FROM project_files UNION SELECT hash FROM project_blobs UNION SELECT hash FROM version_files) ORDER BY created_at, hash LIMIT ?",
      );
      db.close();
    });

    it("deleteBlobs removes 250 blobs in three conditional DELETEs of at most 100 parameters in one batch, then looks once", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const blobs = Array.from({ length: 250 }, (_, i) => blobOf(`b${i}`));
      await store.addBlobs(blobs, T);
      const before = db.queries.length;
      const removed = await store.deleteBlobs(
        blobs.map((b) => b.hash),
        LATER,
      );
      expect(removed).toHaveLength(250);
      const ran = db.queries.slice(before);
      const deletes = ran.filter((q) => q.sql.startsWith("DELETE FROM blobs"));
      expect(deletes.map((q) => q.values.length)).toEqual([100, 100, 53]);
      for (const q of deletes) {
        expect(q.values[0]).toBe(LATER);
        expect(q.sql).toMatch(
          /^DELETE FROM blobs WHERE created_at < \? AND hash IN \(\?(, \?)*\) AND hash NOT IN \(SELECT hash FROM project_files UNION SELECT hash FROM project_blobs UNION SELECT hash FROM version_files\)$/,
        );
      }
      expect(new Set(deletes.map((q) => q.batch)).size).toBe(1);
      expect(deletes[0]?.batch).not.toBeNull();
      expect(rows(db, "blobs")).toBe(0);
      // The look afterwards is another batch of reads.
      const reads = ran.filter((q) => q.sql.startsWith("SELECT hash FROM blobs"));
      expect(reads.map((q) => q.values.length)).toEqual([100, 100, 50]);
      db.close();
    });

    it("deleteBlobs sends nothing for no hashes, and undoes every chunk when one is refused", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const before = db.queries.length;
      expect(await store.deleteBlobs([], LATER)).toEqual([]);
      expect(db.queries.length).toBe(before);

      await store.addBlobs(
        Array.from({ length: 150 }, (_, i) => blobOf(`b${i}`)),
        T,
      );
      await store.addBlobs([blobOf("poison", 999)], T);
      db.raw.exec(
        "CREATE TRIGGER refuse_blob_delete BEFORE DELETE ON blobs WHEN OLD.size = 999 BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );
      const hashes = [...Array.from({ length: 150 }, (_, i) => bh(`b${i}`)), bh("poison")];
      await expect(store.deleteBlobs(hashes, LATER)).rejects.toThrow(/refused/);
      expect(rows(db, "blobs")).toBe(151);
      db.close();
    });
  });

  describe("the person's deletion and the projects", () => {
    /** Two people with a project each, files, an upload and versions. */
    async function twoPeople() {
      const db = openDatabase();
      const store = d1Store(db);
      for (const [n, sub] of [
        [1, "u1"],
        [2, "u2"],
      ] as const) {
        await store.upsertUser({ ...profile, sub }, T);
        await store.createProject(
          project(pid(n), { ownerSub: sub, name: `Secret plans of ${sub}` }),
          100,
        );
        await store.applyMaterialisation({
          projectId: pid(n),
          upserts: new Map([[`${sub}/diagram.meltemi`, bh(`${sub}-a`)]]),
          deletes: [],
          blobs: [blobOf(`${sub}-a`)],
          revision: 1,
          now: T,
        });
        await store.addProjectBlob(pid(n), bh(`${sub}-logo`));
        await store.createVersion(
          {
            projectId: pid(n),
            label: `Label of ${sub}`,
            auto: false,
            createdBy: sub,
            createdAt: T,
          },
          { maxVersions: 10 },
        );
      }
      return { db, store };
    }

    it("removes the person's projects, files, uploads and versions, and leaves the others' rows and every blob", async () => {
      const { db, store } = await twoPeople();
      const blobs = rows(db, "blobs");
      expect(PROJECT_TABLES.map((table) => rows(db, table))).toEqual([2, 2, 2, 2, 2]);
      expect(await store.applyUserDeleted("evt_1", "u1", LATER)).toBe("applied");
      expect(PROJECT_TABLES.map((table) => rows(db, table))).toEqual([1, 1, 1, 1, 1]);
      expect(db.raw.prepare("SELECT id, owner_sub FROM projects").all()).toEqual([
        { id: pid(2), owner_sub: "u2" },
      ]);
      expect(db.raw.prepare("SELECT project_id FROM project_files").all()).toEqual([
        { project_id: pid(2) },
      ]);
      expect(db.raw.prepare("SELECT project_id FROM project_blobs").all()).toEqual([
        { project_id: pid(2) },
      ]);
      expect(db.raw.prepare("SELECT project_id FROM versions").all()).toEqual([
        { project_id: pid(2) },
      ]);
      expect(rows(db, "blobs")).toBe(blobs);
      db.close();
    });

    it("leaves no name, description, label or path of the person in any table", async () => {
      const { db, store } = await twoPeople();
      expect(dump(db)).toContain("Secret plans of u1");
      await store.applyUserDeleted("evt_1", "u1", LATER);
      const everything = dump(db);
      for (const marker of ["Secret plans of u1", "Label of u1", "u1/diagram.meltemi", pid(1)]) {
        expect(everything, marker).not.toContain(marker);
      }
      expect(everything).toContain("Secret plans of u2");
      db.close();
    });

    it("undoes the whole deletion, the projects included, when one statement is refused", async () => {
      const { db, store } = await twoPeople();
      const counts = [...PROJECT_TABLES, "users", "processed_events"].map((table) =>
        rows(db, table),
      );
      db.raw.exec(
        "CREATE TRIGGER refuse_user_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );
      await expect(store.applyUserDeleted("evt_1", "u1", LATER)).rejects.toThrow(/refused/);
      expect(
        [...PROJECT_TABLES, "users", "processed_events"].map((table) => rows(db, table)),
      ).toEqual(counts);
      expect((await store.project("u1", pid(1)))?.name).toBe("Secret plans of u1");

      // The event can be delivered again, and then the projects go too.
      db.raw.exec("DROP TRIGGER refuse_user_delete");
      expect(await store.applyUserDeleted("evt_1", "u1", LATER)).toBe("applied");
      expect(await store.project("u1", pid(1))).toBeUndefined();
      db.close();
    });

    it("undoes the projects too when the one that fails is among them", async () => {
      const { db, store } = await twoPeople();
      db.raw.exec(
        "CREATE TRIGGER refuse_project_gone BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'refused'); END",
      );
      await expect(store.applyUserDeleted("evt_1", "u1", LATER)).rejects.toThrow(/refused/);
      expect(PROJECT_TABLES.map((table) => rows(db, table))).toEqual([2, 2, 2, 2, 2]);
      expect(rows(db, "users")).toBe(2);
      expect(rows(db, "processed_events")).toBe(0);
      db.close();
    });
  });

  describe("how the projects' rows are stored", () => {
    it("keeps integers as integers, text as text, a missing label or thumbnail as NULL, and the rows as given", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(profile, T);
      await store.createProject(project(P1, { name: "N", description: "" }), 100);
      await store.claimThumbnail(P1, LATER, T);
      await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map([["a.meltemi", bh("a")]]),
        deletes: [],
        blobs: [{ hash: bh("a"), size: 42, mediaType: "text/plain" }],
        revision: 6,
        now: LATER,
      });
      await store.addProjectBlob(P1, bh("logo"));
      await store.createVersion(
        { projectId: P1, label: null, auto: true, createdBy: "u1", createdAt: LATER },
        { maxVersions: 5 },
      );
      await store.createVersion(
        { projectId: P1, label: "named", auto: false, createdBy: "u1", createdAt: LATER },
        { maxVersions: 5 },
      );
      await store.refreshStorageBytes("u1");

      expect(db.raw.prepare("SELECT * FROM projects").all()).toEqual([
        {
          id: P1,
          owner_sub: "u1",
          name: "N",
          description: "",
          created_at: T,
          updated_at: LATER,
          revision: 6,
          thumbnail_at: LATER,
          deleted_at: null,
          // Added by 0003_sharing.sql: a new project is private.
          link_access: "private",
        },
      ]);
      expect(db.raw.prepare("SELECT * FROM project_files").all()).toEqual([
        { project_id: P1, path: "a.meltemi", hash: bh("a") },
      ]);
      expect(db.raw.prepare("SELECT * FROM project_blobs").all()).toEqual([
        { project_id: P1, hash: bh("logo") },
      ]);
      expect(db.raw.prepare("SELECT * FROM blobs").all()).toEqual([
        { hash: bh("a"), size: 42, media_type: "text/plain", created_at: LATER },
      ]);
      expect(db.raw.prepare("SELECT * FROM versions ORDER BY number").all()).toEqual([
        {
          id: 1,
          project_id: P1,
          number: 1,
          label: null,
          auto: 1,
          created_by: "u1",
          created_at: LATER,
        },
        {
          id: 2,
          project_id: P1,
          number: 2,
          label: "named",
          auto: 0,
          created_by: "u1",
          created_at: LATER,
        },
      ]);
      expect(db.raw.prepare("SELECT * FROM version_files ORDER BY version_id").all()).toEqual([
        { version_id: 1, path: "a.meltemi", hash: bh("a") },
        { version_id: 2, path: "a.meltemi", hash: bh("a") },
      ]);
      expect(
        db.raw.prepare("SELECT storage_bytes, typeof(storage_bytes) AS t FROM users").get(),
      ).toEqual({
        storage_bytes: 42,
        t: "integer",
      });
      expect(
        db.raw
          .prepare(
            "SELECT typeof(revision) AS r, typeof(thumbnail_at) AS t, typeof(deleted_at) AS d FROM projects",
          )
          .get(),
      ).toEqual({ r: "integer", t: "text", d: "null" });
      db.close();
    });
  });

  describe("two requests over one database", () => {
    const wires = [
      ["on the bare adapter", (db: SqliteDb): D1Like => db],
      ["with a round trip before every statement", withLatency],
    ] as const;

    it.each(wires)(
      "hold the limit when stores over one database create tokens at once, %s",
      async (_wire, wire) => {
        const db = openDatabase();
        for (let round = 0; round < 20; round++) {
          const sub = `u${round}`;
          // Eight requests, each with its own store, started in the same tick.
          const results = await Promise.all(
            Array.from({ length: 8 }, (_, n) =>
              d1Store(wire(db)).createToken(
                token(n, { id: `${sub}-${n}`, sub, hash: sha(`${sub}/${n}`) }),
                3,
              ),
            ),
          );
          expect(
            results.filter((r) => r === "created"),
            `round ${round}`,
          ).toHaveLength(3);
          expect(await d1Store(db).tokensOf(sub), `round ${round}`).toHaveLength(3);
        }
        db.close();
      },
    );

    it.each(wires)(
      "is what the race needs: a count followed by an insert does lose it, %s",
      async (_wire, wire) => {
        // The control for the test above. A store that read the count and then inserted would let
        // requests started together all pass the check. If the database did not let two requests
        // interleave at their awaits, the test above would prove nothing.
        const db = openDatabase();
        const checkThenInsert = async (n: number) => {
          const slow = wire(db);
          const held = await slow
            .prepare("SELECT COUNT(*) AS held FROM tokens WHERE sub = ?")
            .bind("u1")
            .first<{ held: number }>();
          if ((held?.held ?? 0) >= 3) return "quota";
          await slow
            .prepare(
              "INSERT INTO tokens (id, sub, name, hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, NULL)",
            )
            .bind(`t${n}`, "u1", "n", sha(`x${n}`), T)
            .run();
          return "created";
        };

        const results = await Promise.all([0, 1, 2, 3, 4, 5].map(checkThenInsert));

        expect(results.filter((r) => r === "created")).toHaveLength(6);
        expect(db.raw.prepare("SELECT count(*) AS n FROM tokens").get()).toEqual({ n: 6 });
        db.close();
      },
    );

    it.each(wires)(
      "hold the project limit when stores create projects at once, %s",
      async (_wire, wire) => {
        const db = openDatabase();
        for (let round = 0; round < 15; round++) {
          const sub = `u${round}`;
          const results = await Promise.all(
            Array.from({ length: 8 }, (_, n) =>
              d1Store(wire(db)).createProject(
                project(pid(round * 10 + n + 1), { ownerSub: sub }),
                3,
              ),
            ),
          );
          expect(
            results.filter((r) => r === "created"),
            `round ${round}`,
          ).toHaveLength(3);
          expect(await d1Store(db).countProjects(sub), `round ${round}`).toBe(3);
        }
        db.close();
      },
    );

    it.each(wires)(
      "hold the version limit and the rate when stores record versions at once, %s",
      async (_wire, wire) => {
        const db = openDatabase();
        const first = d1Store(db);
        for (const [round, guard, allowed] of [
          [1, { maxVersions: 3 }, 3],
          [2, { maxVersions: 200, rate: { max: 6, since: T } }, 6],
        ] as const) {
          const id = pid(round);
          await first.createProject(project(id), 100);
          await first.applyMaterialisation({
            projectId: id,
            upserts: new Map([["a", bh("a")]]),
            deletes: [],
            blobs: [blobOf("a")],
            revision: 1,
            now: T,
          });
          const results = await Promise.all(
            Array.from({ length: 10 }, () =>
              d1Store(wire(db)).createVersion(
                { projectId: id, label: null, auto: false, createdBy: "u1", createdAt: T },
                guard,
              ),
            ),
          );
          expect(
            results.filter((r) => typeof r !== "string"),
            `round ${round}`,
          ).toHaveLength(allowed);
          expect(await first.listVersions(id), `round ${round}`).toHaveLength(allowed);
          // Each version has the files it was made with, and the refused ones left none behind.
          expect(
            db.raw.prepare("SELECT count(*) AS n FROM version_files").get(),
            `round ${round}`,
          ).toEqual({ n: round === 1 ? allowed : 3 + allowed });
        }
        db.close();
      },
    );

    it.each(wires)(
      "give the thumbnail to one of the stores that claim it at once, %s",
      async (_wire, wire) => {
        const db = openDatabase();
        await d1Store(db).createProject(project(P1), 100);
        const results = await Promise.all(
          [1, 2, 3, 4, 5, 6].map((n) =>
            d1Store(wire(db)).claimThumbnail(P1, `2026-10-14T12:00:0${n}.000Z`, T),
          ),
        );
        expect(results.filter(Boolean)).toHaveLength(1);
        db.close();
      },
    );

    it.each(wires)(
      "leave no row without its project when writes race with its deletion, %s",
      async (_wire, wire) => {
        const db = openDatabase();
        for (let round = 1; round <= 8; round++) {
          const id = pid(round);
          await d1Store(db).createProject(project(id), 100);
          await d1Store(db).applyMaterialisation({
            projectId: id,
            upserts: new Map([["a", bh("a")]]),
            deletes: [],
            blobs: [blobOf("a")],
            revision: 1,
            now: T,
          });
          const requests = [
            () => d1Store(wire(db)).deleteProject("u1", id),
            () =>
              d1Store(wire(db)).applyMaterialisation({
                projectId: id,
                upserts: new Map([["late", bh("late")]]),
                deletes: [],
                blobs: [blobOf("late")],
                revision: 2,
                now: LATER,
              }),
            () =>
              d1Store(wire(db)).createVersion(
                { projectId: id, label: null, auto: false, createdBy: "u1", createdAt: LATER },
                { maxVersions: 10 },
              ),
            () => d1Store(wire(db)).addProjectBlob(id, bh("late-upload")),
          ];
          // Alternate which request starts first, so that both orders happen.
          await Promise.all((round % 2 === 0 ? requests.reverse() : requests).map((run) => run()));
        }
        for (const table of PROJECT_TABLES) expect(rows(db, table), table).toBe(0);
        db.close();
      },
    );

    it.each(wires)(
      "hand a code to one of the stores that take it at once, %s",
      async (_wire, wire) => {
        const db = openDatabase();
        await d1Store(db).createCliCode(code());
        const taken = await Promise.all(
          [1, 2, 3, 4].map(() => d1Store(wire(db)).takeCliCode(code().hash)),
        );
        expect(taken.filter((c) => c !== undefined)).toEqual([code()]);
        db.close();
      },
    );
  });

  describe("the indexes", () => {
    it("serve the lookups the handlers make, with no scan of a table that has an index for them", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(profile, T);
      await store.createToken(token(1), MAX_TOKENS);
      await store.createCliCode(code());
      const plans: Record<string, string> = {};
      const probe = async (name: string, call: () => Promise<unknown>) => {
        const from = db.queries.length;
        await call();
        plans[name] = plansSince(db, from).join(" || ");
      };
      await probe("user", () => store.user("u1"));
      await probe("upsertUser", () => store.upsertUser({ ...profile, name: "Ana B." }, T));
      await probe("tokenByHash", () => store.tokenByHash(sha("mdg_1")));
      await probe("tokensOf", () => store.tokensOf("u1"));
      await probe("createToken", () => store.createToken(token(2), MAX_TOKENS));
      await probe("touchToken", () => store.touchToken("t2", T));
      await probe("deleteToken", () => store.deleteToken("u1", "t2"));
      await probe("takeCliCode", () => store.takeCliCode(code().hash));
      await probe("recordCliFailure", () => store.recordCliFailure("caller", T));
      await probe("cliFailuresSince", () => store.cliFailuresSince("caller", T));
      await probe("sweep", () => store.sweep(LATER));
      await probe("applyUserDeleted", () => store.applyUserDeleted("evt_1", "u1", T));
      await probe("deletedSince", () => store.deletedSince("u1", T));

      expect(plans["user"]).toMatch(
        /SEARCH users USING INDEX sqlite_autoindex_users_\d \(sub=\?\)/,
      );
      expect(plans["upsertUser"]).toMatch(/SEARCH users USING INDEX sqlite_autoindex_users_\d/);
      expect(plans["tokenByHash"]).toMatch(
        /SEARCH tokens USING INDEX sqlite_autoindex_tokens_\d \(hash=\?\)/,
      );
      expect(plans["tokensOf"]).toMatch(/SEARCH tokens USING INDEX tokens_sub \(sub=\?\)/);
      expect(plans["createToken"]).toMatch(
        /SEARCH tokens USING COVERING INDEX tokens_sub \(sub=\?\)/,
      );
      expect(plans["touchToken"]).toMatch(
        /SEARCH tokens USING INDEX sqlite_autoindex_tokens_\d \(id=\?\)/,
      );
      expect(plans["deleteToken"]).toMatch(
        /SEARCH tokens USING INDEX sqlite_autoindex_tokens_\d \(id=\?\)/,
      );
      expect(plans["takeCliCode"]).toMatch(
        /SEARCH cli_codes USING INDEX sqlite_autoindex_cli_codes_\d \(hash=\?\)/,
      );
      expect(plans["recordCliFailure"]).toMatch(
        /SEARCH cli_failures USING INDEX cli_failures_key_at \(key=\? AND at<\?\)/,
      );
      expect(plans["sweep"]).toMatch(
        /SEARCH cli_codes USING (COVERING )?INDEX cli_codes_expires_at \(expires_at<\?\)/,
      );
      expect(plans["sweep"]).toMatch(
        /SEARCH cli_failures USING (COVERING )?INDEX cli_failures_at \(at<\?\)/,
      );
      expect(plans["sweep"]).toMatch(
        /SEARCH processed_events USING (COVERING )?INDEX processed_events_at \(at<\?\)/,
      );
      expect(plans["sweep"]).toMatch(
        /SEARCH publish_log USING (COVERING )?INDEX publish_log_at \(at<\?\)/,
      );
      expect(plans["deletedSince"]).toMatch(
        /SEARCH processed_events USING COVERING INDEX processed_events_sub_at \(sub=\? AND at>\?\)/,
      );
      expect(plans["cliFailuresSince"]).toMatch(
        /SEARCH cli_failures USING COVERING INDEX cli_failures_key_at \(key=\? AND at>\?\)/,
      );
      expect(plans["applyUserDeleted"]).toMatch(/SEARCH processed_events USING (COVERING )?INDEX/);
      expect(plans["applyUserDeleted"]).toMatch(/SEARCH tokens USING INDEX tokens_sub \(sub=\?\)/);
      expect(plans["applyUserDeleted"]).toMatch(
        /SEARCH users USING INDEX sqlite_autoindex_users_\d/,
      );

      // A constant row is not a table scan; any other scan is.
      for (const [name, plan] of Object.entries(plans)) {
        const scans = plan.replace(/SCAN CONSTANT ROW/g, "").match(/\bSCAN \w+/g) ?? [];
        // The deletion of a person looks through the approval codes, which have no index on the
        // person: a short table of codes that live five minutes.
        expect(scans, name).toEqual(name === "applyUserDeleted" ? ["SCAN cli_codes"] : []);
      }
      db.close();
    });
  });

  describe("the indexes of the projects", () => {
    it("serve every lookup, and only the weekly collection and a constant VALUES clause scan", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.upsertUser(profile, T);
      await store.createProject(project(P1), 100);
      await store.createProject(project(P2), 100);
      const plans: Record<string, string> = {};
      const probe = async (name: string, call: () => Promise<unknown>) => {
        const from = db.queries.length;
        await call();
        plans[name] = plansSince(db, from).join(" || ");
      };
      await probe("createProject", () => store.createProject(project(pid(3)), 100));
      await probe("project", () => store.project("u1", P1));
      await probe("projectById", () => store.projectById(P1));
      await probe("setLinkAccess", () => store.setLinkAccess("u1", P1, "view"));
      await probe("listProjects", () => store.listProjects("u1"));
      await probe("countProjects", () => store.countProjects("u1"));
      await probe("projectIdsOf", () => store.projectIdsOf("u1"));
      await probe("ownerOf", () => store.ownerOf(P1));
      await probe("updateProject", () => store.updateProject("u1", P1, { name: "x" }, T));
      await probe("claimThumbnail", () => store.claimThumbnail(P1, T, T));
      await probe("setThumbnailAt", () => store.setThumbnailAt(P1, T));
      await probe("projectFiles", () => store.projectFiles(P1));
      await probe("applyMaterialisation", () =>
        store.applyMaterialisation({
          projectId: P1,
          upserts: new Map([["a", bh("a")]]),
          deletes: ["b"],
          blobs: [blobOf("a")],
          revision: 1,
          now: T,
        }),
      );
      await probe("blobsPresent", () => store.blobsPresent([bh("a")]));
      await probe("blob", () => store.blob(bh("a")));
      await probe("addProjectBlob", () => store.addProjectBlob(P1, bh("a")));
      await probe("removeProjectBlob", () => store.removeProjectBlob(P2, bh("a")));
      await probe("hasProjectBlob", () => store.hasProjectBlob(P1, bh("a")));
      await probe("projectBlobs", () => store.projectBlobs(P1));
      await probe("projectHoldsBlob", () => store.projectHoldsBlob(P1, bh("a")));
      await probe("copyProjectBlobs", () => store.copyProjectBlobs("u1", P1, P2));
      await probe("createVersion", () =>
        store.createVersion(
          { projectId: P1, label: null, auto: false, createdBy: "u1", createdAt: T },
          { maxVersions: 10, rate: { max: 6, since: T } },
        ),
      );
      await probe("listVersions", () => store.listVersions(P1));
      await probe("version", () => store.version(P1, 1));
      await probe("latestVersion", () => store.latestVersion(P1));
      await probe("versionFiles", () => store.versionFiles(P1, 1));
      await probe("versionChanges", () => store.versionChanges(P1));
      await probe("deleteVersions", () => store.deleteVersions(P1, [1, 2]));
      await probe("countVersions", () => store.countVersions(P1));
      await probe("countVersionsSince", () => store.countVersionsSince(P1, T));
      await probe("storageBytesOf", () => store.storageBytesOf("u1"));
      await probe("refreshStorageBytes", () => store.refreshStorageBytes("u1"));
      await probe("usage", () => store.usage("u1"));
      await probe("unreferencedBlobs", () => store.unreferencedBlobs(LATER, 10));
      await probe("deleteBlobs", () => store.deleteBlobs([bh("a")], LATER));
      await probe("deleteProject", () => store.deleteProject("u1", P2));
      await probe("applyUserDeleted", () => store.applyUserDeleted("evt_1", "u1", T));

      const byKey =
        /SEARCH (projects|p) USING (COVERING )?INDEX sqlite_autoindex_projects_\d \(id=\?\)/;
      const byOwner = /SEARCH projects USING (COVERING )?INDEX projects_owner \(owner_sub=\?\)/;
      expect(plans["project"]).toMatch(byKey);
      expect(plans["projectById"]).toMatch(byKey);
      expect(plans["setLinkAccess"]).toMatch(byKey);
      expect(plans["ownerOf"]).toMatch(byKey);
      expect(plans["updateProject"]).toMatch(byKey);
      expect(plans["claimThumbnail"]).toMatch(byKey);
      expect(plans["setThumbnailAt"]).toMatch(byKey);
      expect(plans["createProject"]).toMatch(byOwner);
      // The projects a person owns (by the owner index) and the ones they are a member of (by the
      // members' index on the person, then each project by its key).
      expect(plans["listProjects"]).toMatch(/SEARCH p USING INDEX projects_owner \(owner_sub=\?\)/);
      expect(plans["listProjects"]).toMatch(
        /SEARCH m USING (COVERING )?INDEX members_sub \(sub=\?\)/,
      );
      expect(plans["listProjects"]).toMatch(
        /SEARCH p USING INDEX sqlite_autoindex_projects_\d \(id=\?\)/,
      );
      expect(plans["countProjects"]).toMatch(byOwner);
      expect(plans["projectIdsOf"]).toMatch(byOwner);
      expect(plans["projectFiles"]).toMatch(
        /SEARCH project_files USING PRIMARY KEY \(project_id=\?\)/,
      );
      // The files are found by the project and the path, and the rows by the project's own row.
      expect(plans["applyMaterialisation"]).toMatch(
        /SEARCH project_files USING PRIMARY KEY \(project_id=\? AND path=\?\)/,
      );
      expect(plans["applyMaterialisation"]).toMatch(byKey);
      expect(plans["blobsPresent"]).toMatch(/SEARCH blobs USING PRIMARY KEY \(hash=\?\)/);
      expect(plans["blob"]).toMatch(/SEARCH blobs USING PRIMARY KEY \(hash=\?\)/);
      expect(plans["addProjectBlob"]).toMatch(byKey);
      expect(plans["removeProjectBlob"]).toMatch(
        /SEARCH project_blobs USING PRIMARY KEY \(project_id=\? AND hash=\?\)/,
      );
      expect(plans["hasProjectBlob"]).toMatch(
        /SEARCH project_blobs USING PRIMARY KEY \(project_id=\? AND hash=\?\)/,
      );
      expect(plans["projectBlobs"]).toMatch(
        /SEARCH project_blobs USING PRIMARY KEY \(project_id=\?\)/,
      );
      // The upload table by its key; the versions by the project, then each version's files by its key.
      expect(plans["projectHoldsBlob"]).toMatch(
        /SEARCH project_blobs USING PRIMARY KEY \(project_id=\? AND hash=\?\)/,
      );
      expect(plans["projectHoldsBlob"]).toMatch(
        /SEARCH v USING COVERING INDEX sqlite_autoindex_versions_\d \(project_id=\?\)/,
      );
      expect(plans["projectHoldsBlob"]).toMatch(/SEARCH f USING PRIMARY KEY \(version_id=\?\)/);
      expect(plans["copyProjectBlobs"]).toMatch(/SEARCH b USING PRIMARY KEY \(project_id=\?\)/);
      expect(plans["copyProjectBlobs"]).toMatch(
        /SEARCH projects EXISTS USING INDEX sqlite_autoindex_projects_\d \(id=\?\)/,
      );
      // A version: the project by its key, the numbers by the unique key, the files by the project.
      expect(plans["createVersion"]).toMatch(byKey);
      expect(plans["createVersion"]).toMatch(
        /SEARCH versions USING (COVERING )?INDEX sqlite_autoindex_versions_\d \(project_id=\?\)/,
      );
      expect(plans["createVersion"]).toMatch(
        /SEARCH v USING COVERING INDEX sqlite_autoindex_versions_\d \(project_id=\? AND number=\?\)/,
      );
      expect(plans["createVersion"]).toMatch(/SEARCH f USING PRIMARY KEY \(project_id=\?\)/);
      for (const name of ["listVersions", "latestVersion", "countVersions", "countVersionsSince"]) {
        expect(plans[name], name).toMatch(
          /SEARCH versions USING (COVERING )?INDEX sqlite_autoindex_versions_\d \(project_id=\?\)/,
        );
      }
      expect(plans["version"]).toMatch(
        /SEARCH versions USING INDEX sqlite_autoindex_versions_\d \(project_id=\? AND number=\?\)/,
      );
      expect(plans["versionFiles"]).toMatch(
        /SEARCH f USING PRIMARY KEY \(version_id=\?\) LEFT-JOIN/,
      );
      // The comparison of versions is by the files' keys: every probe is a search.
      expect(plans["versionChanges"]).toMatch(
        /SEARCH g USING PRIMARY KEY \(version_id=\? AND path=\?\)/,
      );
      expect(plans["versionChanges"]).toMatch(
        /SEARCH f USING PRIMARY KEY \(version_id=\? AND path=\?\)/,
      );
      expect(plans["deleteVersions"]).toMatch(
        /SEARCH version_files USING PRIMARY KEY \(version_id=\?\)/,
      );
      // A person's bytes: their projects by the owner index, then the three tables by their keys.
      for (const name of ["storageBytesOf", "refreshStorageBytes"]) {
        expect(plans[name], name).toMatch(/SEARCH p USING INDEX projects_owner \(owner_sub=\?\)/);
        expect(plans[name], name).toMatch(/SEARCH f USING PRIMARY KEY \(project_id=\?\)/);
        expect(plans[name], name).toMatch(/SEARCH b USING PRIMARY KEY \(project_id=\?\)/);
        expect(plans[name], name).toMatch(/SEARCH vf USING PRIMARY KEY \(version_id=\?\)/);
        expect(plans[name], name).toMatch(/SEARCH blobs USING PRIMARY KEY \(hash=\?\)/);
      }
      expect(plans["refreshStorageBytes"]).toMatch(
        /SEARCH users USING INDEX sqlite_autoindex_users_\d \(sub=\?\)/,
      );
      expect(plans["usage"]).toMatch(byOwner);
      expect(plans["usage"]).toMatch(
        /SEARCH users USING INDEX sqlite_autoindex_users_\d \(sub=\?\)/,
      );
      // Deleting a project or a person: the children by the project's key, the project by its key or owner.
      for (const [name, project] of [
        ["deleteProject", byKey],
        ["applyUserDeleted", byOwner],
      ] as const) {
        expect(plans[name], name).toMatch(project);
        for (const table of ["version_files", "project_files", "project_blobs"]) {
          expect(plans[name], `${name} ${table}`).toMatch(
            new RegExp(`SEARCH ${table} USING PRIMARY KEY \\((version|project)_id=\\?\\)`),
          );
        }
        expect(plans[name], name).toMatch(
          /SEARCH versions USING (COVERING )?INDEX sqlite_autoindex_versions_\d \(project_id=\?\)/,
        );
      }

      // Nothing is read whole, except where it cannot be helped: the weekly collection reads the
      // three reference tables once, and `VALUES` is the rows of the statement itself.
      const expected: Record<string, string[]> = {
        applyMaterialisation: ["SCAN v"],
        unreferencedBlobs: [
          "SCAN blobs",
          "SCAN project_blobs",
          "SCAN project_files",
          "SCAN version_files",
        ],
        deleteBlobs: ["SCAN project_blobs", "SCAN project_files", "SCAN version_files"],
        applyUserDeleted: ["SCAN cli_codes"],
      };
      for (const [name, plan] of Object.entries(plans)) {
        const scans = plan.replace(/SCAN CONSTANT ROW/g, "").match(/\bSCAN \w+/g) ?? [];
        expect([...scans].sort(), name).toEqual(expected[name] ?? []);
      }
      db.close();
    });

    it("read the rows of a multi-row upsert from its own VALUES and the project's key, not from a table", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.createProject(project(P1), 100);
      await store.applyMaterialisation({
        projectId: P1,
        upserts: new Map(Array.from({ length: 3 }, (_, i) => [`p${i}`, bh(`h${i}`)])),
        deletes: [],
        blobs: [],
        revision: 1,
        now: T,
      });
      const statement = db.queries.find((q) => q.sql.startsWith("INSERT INTO project_files"));
      expect(statement).toBeDefined();
      const plan = db.raw
        .prepare(`EXPLAIN QUERY PLAN ${statement?.sql}`)
        .all(...(statement?.values ?? []))
        .map((row) => String(row.detail))
        .join(" | ");
      expect(plan).toMatch(
        /SEARCH p USING (COVERING )?INDEX sqlite_autoindex_projects_\d \(id=\?\)/,
      );
      expect(plan).toMatch(/SCAN 3-ROW VALUES CLAUSE/);
      expect(plan).not.toMatch(/SCAN (project_files|projects|blobs)/);
      db.close();
    });
  });

  describe("no token or code in clear", () => {
    it("holds only the SHA-256 of a token: the token itself is nowhere in the database", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const secret = `mdg_${"AbC123_-".repeat(5)}XyZ`;
      const hash = await sha256Hex(secret);
      await store.createToken(token(1, { hash, name: "laptop" }), MAX_TOKENS);
      expect(dump(db)).toContain(hash);
      expect(dump(db)).not.toContain(secret);
      expect(dump(db)).not.toContain("mdg_");
      expect((await store.tokenByHash(await sha256Hex(secret)))?.id).toBe("t1");
      db.close();
    });

    it("refuses a token or a code that is not a SHA-256 in hexadecimal, and stores nothing of it", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const secret = `mdg_${"AbC123_-".repeat(5)}XyZ`;
      await expect(store.createToken(token(1, { hash: secret }), MAX_TOKENS)).rejects.toThrow(
        /CHECK constraint failed/,
      );
      await expect(
        store.createToken(token(2, { hash: sha("x").toUpperCase() }), MAX_TOKENS),
      ).rejects.toThrow(/CHECK constraint failed/);
      await expect(store.createCliCode(code(1, { hash: "a-code-in-clear" }))).rejects.toThrow(
        /CHECK constraint failed/,
      );
      expect(dump(db)).not.toContain(secret);
      expect(dump(db)).not.toContain("a-code-in-clear");
      expect(db.raw.prepare("SELECT count(*) AS n FROM tokens").get()).toEqual({ n: 0 });
      expect(db.raw.prepare("SELECT count(*) AS n FROM cli_codes").get()).toEqual({ n: 0 });
      db.close();
    });

    it("keeps the caller of a failed exchange as the key it was given and nothing about the request", async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.recordCliFailure(sha("a keyed hash of an address"), T);
      expect(db.raw.prepare("SELECT * FROM cli_failures").all()).toEqual([
        { key: sha("a keyed hash of an address"), at: T },
      ]);
      db.close();
    });
  });

  describe("one store per request", () => {
    it("holds no state of its own: two stores over one database see the same rows", async () => {
      const db = openDatabase();
      const first = d1Store(db);
      const second = d1Store(db);
      await first.upsertUser(profile, T);
      await first.createToken(token(), MAX_TOKENS);
      expect(await second.user("u1")).toEqual({
        ...profile,
        createdAt: T,
        handle: null,
        ...NOT_ENTITLED,
      });
      expect(await second.tokensOf("u1")).toEqual([token()]);
      expect(await second.applyUserDeleted("evt_1", "u1", T)).toBe("applied");
      expect(await first.user("u1")).toBeUndefined();
      expect(await first.applyUserDeleted("evt_1", "u1", T)).toBe("duplicate");
      db.close();
    });
  });
});
