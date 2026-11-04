// What only SQL can get wrong in the sharing half of `d1Store` (change sharing-and-permissions):
// the shape of each statement, what the database refuses, how rows are stored, the indexes the
// lookups use, the transactions that undo a whole step, and the races the single statements
// close. The behaviour is the conformance suite's (conformance-sharing.ts, run over this store too).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { D1Like, D1PreparedLike } from "../../src/env.js";
import { d1Store } from "../../src/store/d1.js";
import type { NewInvitation, Publication, UserProfile } from "../../src/store/types.js";
import {
  dump,
  openDatabase,
  sqliteAvailable,
  withLatency,
  type SqliteDb,
} from "../support/sqlite.js";

const T = "2026-10-14T12:00:00.000Z";
const LATER = "2026-10-14T13:00:00.000Z";
const P1 = "proj0000000000000001";
const P2 = "proj0000000000000002";
const sha = (label: string): string => createHash("sha256").update(label).digest("hex");

const profile = (sub: string, email = `${sub}@example.com`): UserProfile => ({
  sub,
  name: `Person ${sub}`,
  picture: "",
  email,
  emailVerified: true,
});

const invitation = (n: number, over: Partial<NewInvitation> = {}): NewInvitation => ({
  id: sha(`id/${n}`).slice(0, 32),
  projectId: P1,
  email: `guest${n}@example.com`,
  role: "viewer",
  token: sha(`token/${n}`).slice(0, 32),
  createdBy: "owner",
  createdAt: T,
  ...over,
});

const publication = (slug: string, over: Partial<Publication> = {}): Publication => ({
  projectId: P1,
  handle: "handle-a",
  slug,
  publishedAt: T,
  bytes: 10,
  ...over,
});

/** How many rows a table holds. */
const rows = (db: SqliteDb, table: string): number =>
  Number(db.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);

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

/** A database whose answers are scripted, whatever the statement says. */
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

/** A database with the owner `owner`, two projects of theirs, `u1` and `u2`, and the handle `handle-a`. */
async function world() {
  const db = openDatabase();
  const store = d1Store(db);
  for (const sub of ["owner", "u1", "u2"]) await store.upsertUser(profile(sub), T);
  for (const id of [P1, P2]) {
    await store.createProject(
      { id, ownerSub: "owner", name: "Project", description: "", createdAt: T },
      100,
    );
  }
  return { db, store };
}

describe.skipIf(!sqliteAvailable)("d1Store sharing over node:sqlite", () => {
  describe("the statements", () => {
    it("record an invitation as one conditional INSERT that counts the members and the pending invitations", async () => {
      const { db, store } = await world();
      const before = db.queries.length;
      expect(await store.createInvitation(invitation(1), 50)).toBe("created");
      const ran = db.queries.slice(before);
      expect(ran).toHaveLength(1);
      expect(ran[0]?.sql).toMatch(
        /^INSERT INTO invitations .* SELECT \?, \?, \?, \?, \?, \?, \?, NULL WHERE EXISTS/,
      );
      expect(ran[0]?.sql).toContain("(SELECT COUNT(*) FROM members WHERE project_id = ?)");
      expect(ran[0]?.sql).toContain(
        "(SELECT COUNT(*) FROM invitations WHERE project_id = ? AND accepted_at IS NULL AND created_at > ?)",
      );
      // The cutoff is thirty days before the invitation's own time, and the limit is the last value.
      expect(ran[0]?.values.slice(7)).toEqual([P1, P1, P1, "2026-09-14T12:00:00.000Z", 50]);
      expect(ran[0]?.batch).toBeNull();
      db.close();
    });

    it("tell a refused invitation from the project that is gone with one more read, and only then", async () => {
      const { db, store } = await world();
      for (let n = 1; n <= 2; n++) await store.createInvitation(invitation(n), 50);
      let before = db.queries.length;
      expect(await store.createInvitation(invitation(3), 2)).toBe("quota");
      expect(db.queries.slice(before).map((q) => q.sql.slice(0, 22))).toEqual([
        "INSERT INTO invitation",
        "SELECT 1 AS found FROM",
      ]);
      before = db.queries.length;
      expect(
        await store.createInvitation(invitation(4, { projectId: "proj0000000000000009" }), 50),
      ).toBe("missing");
      expect(db.queries.slice(before)).toHaveLength(2);
      db.close();
    });

    it("accept a link in one batch: the read, the membership, the mark and the role the person has", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1), 50);
      const before = db.queries.length;
      expect(await store.acceptInvitation(invitation(1).token, "u1", LATER)).toEqual({
        projectId: P1,
        role: "viewer",
      });
      const ran = db.queries.slice(before);
      expect(ran.map((q) => q.sql.split(" ").slice(0, 3).join(" "))).toEqual([
        "SELECT i.project_id AS",
        "INSERT INTO members",
        "UPDATE invitations SET",
        "SELECT m.project_id AS",
      ]);
      expect(ran[1]?.sql).toContain(
        "ON CONFLICT (project_id, sub) DO UPDATE SET role = CASE WHEN excluded.role = ? THEN ? ELSE members.role END",
      );
      expect(ran[1]?.sql).toContain("p.owner_sub <> ?");
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      expect(ran[0]?.batch).not.toBeNull();
      db.close();
    });

    it("resolve an email with one read when nobody invited it, and a batch only when someone did", async () => {
      const { db, store } = await world();
      let before = db.queries.length;
      expect(await store.acceptInvitationsFor("u1", "nobody@example.com", T)).toEqual([]);
      expect(db.queries.slice(before)).toHaveLength(1);
      expect(db.queries.slice(before)[0]?.batch).toBeNull();

      await store.createInvitation(invitation(1, { email: "ana@example.com" }), 50);
      before = db.queries.length;
      expect(await store.acceptInvitationsFor("u1", "ana@example.com", LATER)).toEqual([
        { projectId: P1, role: "viewer" },
      ]);
      const ran = db.queries.slice(before);
      expect(ran).toHaveLength(4);
      expect(ran[0]?.batch).toBeNull();
      expect(new Set(ran.slice(1).map((q) => q.batch)).size).toBe(1);
      expect(ran[1]?.batch).not.toBeNull();
      db.close();
    });

    it("write a session that resolves nothing as no row at all", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1, { email: "ana@example.com" }), 50);
      const changes = Number(db.raw.prepare("SELECT total_changes() AS n").get()?.n);
      await store.acceptInvitationsFor("u1", "other@example.com", LATER);
      expect(Number(db.raw.prepare("SELECT total_changes() AS n").get()?.n)).toBe(changes);
      db.close();
    });

    it("set a handle with one statement, and look at why only when it was refused", async () => {
      const { db, store } = await world();
      let before = db.queries.length;
      expect(await store.setHandle("u1", "handle-a")).toBe("set");
      expect(db.queries.slice(before)).toHaveLength(1);
      expect(db.queries[before]?.values).toEqual(["handle-a", "u1", "handle-a", "handle-a", "u1"]);
      before = db.queries.length;
      expect(await store.setHandle("u2", "handle-a")).toBe("taken");
      expect(db.queries.slice(before)).toHaveLength(3);
      db.close();
    });

    it("record a publication in one statement, and take one down in one batch", async () => {
      const { db, store } = await world();
      let before = db.queries.length;
      expect(await store.putPublication(publication("page"))).toBe("put");
      expect(db.queries.slice(before)).toHaveLength(1);
      expect(db.queries[before]?.sql).toContain("ON CONFLICT (project_id, slug) DO UPDATE SET");
      before = db.queries.length;
      await store.takeDown({
        handle: "handle-a",
        slug: "page",
        bySub: "admin",
        reason: "r",
        at: T,
      });
      const ran = db.queries.slice(before);
      expect(ran).toHaveLength(3);
      expect(new Set(ran.map((q) => q.batch)).size).toBe(1);
      expect(ran[0]?.batch).not.toBeNull();
      db.close();
    });

    it("take a count from meta.changes and refuse to guess", async () => {
      expect(
        await d1Store(scripted({ run: async () => ({ meta: { changes: 1 } }) })).setMemberRole(
          P1,
          "u1",
          "editor",
        ),
      ).toBe(true);
      expect(
        await d1Store(scripted({ run: async () => ({ meta: { changes: 0 } }) })).removeMember(
          P1,
          "u1",
        ),
      ).toBe(false);
      for (const call of [
        (store: ReturnType<typeof d1Store>) => store.setMemberRole(P1, "u1", "editor"),
        (store: ReturnType<typeof d1Store>) => store.removeMember(P1, "u1"),
        (store: ReturnType<typeof d1Store>) => store.deleteInvitation(P1, "x"),
        (store: ReturnType<typeof d1Store>) => store.setInvitationRole(P1, "x", "editor"),
        (store: ReturnType<typeof d1Store>) => store.createInvitation(invitation(1), 5),
        (store: ReturnType<typeof d1Store>) => store.putPublication(publication("page")),
      ]) {
        await expect(call(d1Store(scripted({ run: async () => ({}) })))).rejects.toThrow(
          /did not report the rows changed/,
        );
      }
    });

    it("refuse to guess when a batch does not answer the read in it", async () => {
      const silent = d1Store(scripted({ batch: async () => [{}, {}, {}, {}] }));
      await expect(silent.acceptInvitation("a".repeat(32), "u1", T)).rejects.toThrow(
        /did not answer the read of a batch/,
      );
      await expect(
        silent.takeDown({ handle: "handle-a", slug: "page", bySub: "a", reason: "r", at: T }),
      ).rejects.toThrow(/did not answer the read of a batch/);
    });
  });

  describe("what the database refuses", () => {
    it("takes a handle of 3 to 30 characters of a-z, 0-9 and the hyphen, and nothing else", async () => {
      const { db, store } = await world();
      for (const good of ["abc", "a".repeat(30), "a-b-9", "007", "---"]) {
        await store.upsertUser(profile(`holder-${good}`), T);
        expect(await store.setHandle(`holder-${good}`, good), good).toBe("set");
      }
      for (const bad of [
        "",
        "ab",
        "a".repeat(31),
        "ABC",
        "a b",
        "a_b",
        "a/b",
        "ñññ",
        "ab\n",
        "a.b",
        "a🌊b",
      ]) {
        await expect(store.setHandle("u1", bad), JSON.stringify(bad)).rejects.toThrow(
          /CHECK constraint failed/,
        );
      }
      expect((await store.user("u1"))?.handle).toBeNull();
      db.close();
    });

    it("keeps a handle unique among the people who have one, and lets any number have none", async () => {
      const { db } = await world();
      expect(() =>
        db.raw.prepare("UPDATE users SET handle = 'same-one' WHERE sub IN ('u1', 'u2')").run(),
      ).toThrow(/UNIQUE constraint failed: users.handle/);
      db.raw.prepare("UPDATE users SET handle = 'same-one' WHERE sub = 'u1'").run();
      expect(rows(db, "users")).toBe(3);
      expect(db.raw.prepare("SELECT count(*) AS n FROM users WHERE handle IS NULL").get()).toEqual({
        n: 2,
      });
      db.close();
    });

    it("takes a slug of 1 to 60 characters of a-z, 0-9 and the hyphen, unique within its handle", async () => {
      const { db, store } = await world();
      for (const good of ["a", "a".repeat(60), "my-slug-1", "007"]) {
        expect(await store.putPublication(publication(good)), good).toBe("put");
      }
      for (const bad of ["", "a".repeat(61), "Upper", "a b", "a/b", "..", "é", "a\n", "a_b"]) {
        await expect(store.putPublication(publication(bad)), JSON.stringify(bad)).rejects.toThrow(
          /CHECK constraint failed/,
        );
      }
      await expect(store.putPublication(publication("page", { handle: "AB" }))).rejects.toThrow(
        /CHECK constraint failed/,
      );
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO publications (project_id, handle, slug, published_at, bytes) VALUES (?, 'handle-a', 'a', ?, 1)",
          )
          .run(P2, T),
      ).toThrow(/UNIQUE constraint failed: publications.handle, publications.slug/);
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO publications (project_id, handle, slug, published_at, bytes) VALUES (?, 'handle-b', 'a', ?, -1)",
          )
          .run(P2, T),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });

    it("takes an invitation only with an email in lower case, 3 to 254 characters, and an id and a token of 32 lowercase hexadecimal characters", async () => {
      const { db, store } = await world();
      for (const bad of [
        invitation(1, { email: "Ana@example.com" }),
        invitation(2, { email: "ab" }),
        invitation(3, { email: `${"a".repeat(250)}@b.co` }),
        invitation(4, { id: sha("x").slice(0, 32).toUpperCase() }),
        invitation(5, { id: sha("x").slice(0, 31) }),
        invitation(6, { token: sha("x").slice(0, 32).toUpperCase() }),
        invitation(7, { token: `${sha("x").slice(0, 31)}g` }),
        invitation(8, { token: sha("x") }),
        invitation(9, { token: "" }),
      ]) {
        await expect(store.createInvitation(bad, 50), JSON.stringify(bad)).rejects.toThrow(
          /CHECK constraint failed/,
        );
      }
      expect(rows(db, "invitations")).toBe(0);
      expect(await store.createInvitation(invitation(10, { email: "a@b" }), 50)).toBe("created");
      db.close();
    });

    it("takes a role and a link level only from the lists, and a hash of a person's row nowhere", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1), 50);
      expect(() => db.raw.prepare("UPDATE invitations SET role = 'owner'").run()).toThrow(/CHECK/);
      expect(() => db.raw.prepare("UPDATE invitations SET role = 'Editor'").run()).toThrow(/CHECK/);
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO members (project_id, sub, role, added_at) VALUES (?, 'u9', 'owner', ?)",
          )
          .run(P1, T),
      ).toThrow(/CHECK/);
      expect(() => db.raw.prepare("UPDATE projects SET link_access = 'public'").run()).toThrow(
        /CHECK/,
      );
      expect(() => db.raw.prepare("UPDATE projects SET link_access = NULL").run()).toThrow(
        /NOT NULL/,
      );
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO members (project_id, sub, role, added_at) VALUES (?, 'u9', NULL, ?)",
          )
          .run(P1, T),
      ).toThrow(/NOT NULL/);
      db.close();
    });

    it("keeps a member once per project, and an invitation's id and token unique", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1), 50);
      await store.acceptInvitation(invitation(1).token, "u1", T);
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO members (project_id, sub, role, added_at) VALUES (?, 'u1', 'viewer', ?)",
          )
          .run(P1, T),
      ).toThrow(/UNIQUE constraint failed: members.project_id, members.sub/);
      db.raw
        .prepare(
          "INSERT INTO members (project_id, sub, role, added_at) VALUES (?, 'u1', 'viewer', ?)",
        )
        .run(P2, T);
      db.close();
    });
  });

  describe("how rows are stored", () => {
    it("keeps each table exactly as the store was given it, the token in clear and the times as text", async () => {
      const { db, store } = await world();
      await store.setLinkAccess("owner", P1, "edit");
      await store.setHandle("owner", "handle-a");
      await store.createInvitation(invitation(1, { email: "ana@example.com", role: "editor" }), 50);
      await store.createInvitation(invitation(2), 50);
      await store.acceptInvitation(invitation(2).token, "u1", LATER);
      await store.putPublication(publication("page", { bytes: 42 }));
      await store.putPublication(publication("gone"));
      await store.takeDown({
        handle: "handle-a",
        slug: "gone",
        bySub: "admin",
        reason: "spam",
        at: LATER,
      });

      expect(db.raw.prepare("SELECT id, link_access FROM projects ORDER BY id").all()).toEqual([
        { id: P1, link_access: "edit" },
        { id: P2, link_access: "private" },
      ]);
      expect(db.raw.prepare("SELECT sub, handle FROM users ORDER BY sub").all()).toEqual([
        { sub: "owner", handle: "handle-a" },
        { sub: "u1", handle: null },
        { sub: "u2", handle: null },
      ]);
      expect(db.raw.prepare("SELECT * FROM members").all()).toEqual([
        { project_id: P1, sub: "u1", role: "viewer", added_at: LATER },
      ]);
      expect(db.raw.prepare("SELECT * FROM invitations ORDER BY created_at, rowid").all()).toEqual([
        {
          id: invitation(1).id,
          project_id: P1,
          email: "ana@example.com",
          role: "editor",
          token: invitation(1).token,
          created_by: "owner",
          created_at: T,
          accepted_at: null,
        },
        {
          id: invitation(2).id,
          project_id: P1,
          email: "guest2@example.com",
          role: "viewer",
          token: invitation(2).token,
          created_by: "owner",
          created_at: T,
          accepted_at: LATER,
        },
      ]);
      expect(db.raw.prepare("SELECT * FROM publications").all()).toEqual([
        { project_id: P1, handle: "handle-a", slug: "page", published_at: T, bytes: 42 },
      ]);
      expect(db.raw.prepare("SELECT * FROM takedowns").all()).toEqual([
        {
          handle: "handle-a",
          slug: "gone",
          by_sub: "admin",
          reason: "spam",
          at: LATER,
          project_id: P1,
        },
      ]);
      expect(
        db.raw
          .prepare(
            "SELECT typeof(bytes) AS t, typeof(accepted_at) AS a FROM publications, invitations LIMIT 1",
          )
          .get(),
      ).toEqual({
        t: "integer",
        a: "null",
      });
      db.close();
    });

    it("keeps the invitation's token in clear, as the one secret the owner may copy again", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1), 50);
      expect(dump(db)).toContain(invitation(1).token);
      // What is listed to the owner is what is stored: the list is how a link is copied again.
      expect((await store.pendingInvitations(P1, T))[0]?.token).toBe(invitation(1).token);
      db.close();
    });
  });

  describe("the indexes", () => {
    it("serve every lookup of sharing: the keys, members by person, invitations by project, token and email", async () => {
      const { db, store } = await world();
      await store.setHandle("owner", "handle-a");
      await store.createInvitation(invitation(1, { email: "ana@example.com" }), 50);
      await store.createInvitation(invitation(2), 50);
      await store.acceptInvitation(invitation(2).token, "u1", T);
      await store.putPublication(publication("page"));
      const plans: Record<string, string> = {};
      const probe = async (name: string, call: () => Promise<unknown>) => {
        const from = db.queries.length;
        await call();
        plans[name] = plansSince(db, from).join(" || ");
      };
      await probe("memberRole", () => store.memberRole(P1, "u1"));
      await probe("members", () => store.members(P1));
      await probe("setMemberRole", () => store.setMemberRole(P1, "u1", "editor"));
      await probe("removeMember", () => store.removeMember(P1, "u9"));
      await probe("createInvitation", () => store.createInvitation(invitation(3), 50));
      await probe("pendingInvitations", () => store.pendingInvitations(P1, T));
      await probe("setInvitationRole", () =>
        store.setInvitationRole(P1, invitation(3).id, "editor"),
      );
      await probe("deleteInvitation", () => store.deleteInvitation(P1, invitation(3).id));
      await probe("pendingInvitationByToken", () =>
        store.pendingInvitationByToken(invitation(1).token, T),
      );
      await probe("acceptInvitation", () => store.acceptInvitation(invitation(1).token, "u2", T));
      await probe("acceptInvitationsFor", () =>
        store.acceptInvitationsFor("u2", "ana@example.com", T),
      );
      await probe("setHandle", () => store.setHandle("u1", "handle-b"));
      await probe("publicationsOf", () => store.publicationsOf(P1));
      await probe("publicationsOwnedBy", () => store.publicationsOwnedBy("owner"));
      await probe("publication", () => store.publication("handle-a", "page"));
      await probe("putPublication", () => store.putPublication(publication("other")));
      await probe("deletePublication", () => store.deletePublication(P1, "other"));
      await probe("countPublicationsSince", () => store.countPublicationsSince(P1, T));
      await probe("claimPublish", () => store.claimPublish(P1, T, 10));
      await probe("claimPublishRefused", () => store.claimPublish(P1, T, 1));
      await probe("takeDown", () =>
        store.takeDown({ handle: "handle-a", slug: "page", bySub: "a", reason: "r", at: T }),
      );
      await probe("takedownsOf", () => store.takedownsOf("handle-a"));
      await probe("deleteProject", () => store.deleteProject("owner", P2));
      await probe("applyUserDeleted", () => store.applyUserDeleted("evt_1", "u1", T));

      const memberKey = /SEARCH members USING PRIMARY KEY \(project_id=\? AND sub=\?\)/;
      expect(plans["memberRole"]).toMatch(memberKey);
      expect(plans["setMemberRole"]).toMatch(memberKey);
      expect(plans["removeMember"]).toMatch(memberKey);
      expect(plans["members"]).toMatch(/SEARCH m USING PRIMARY KEY \(project_id=\?\)/);
      expect(plans["members"]).toMatch(/SEARCH u USING INDEX sqlite_autoindex_users_\d \(sub=\?\)/);

      // An invitation: the project by its key, the members by the project, the pending ones by the project.
      expect(plans["createInvitation"]).toMatch(
        /SEARCH projects (EXISTS )?USING (COVERING )?INDEX sqlite_autoindex_projects_\d \(id=\?\)/,
      );
      expect(plans["createInvitation"]).toMatch(
        /SEARCH members USING PRIMARY KEY \(project_id=\?\)/,
      );
      expect(plans["createInvitation"]).toMatch(
        /SEARCH invitations USING (COVERING )?INDEX invitations_project \(project_id=\?\)/,
      );
      expect(plans["pendingInvitations"]).toMatch(
        /SEARCH invitations USING INDEX invitations_project \(project_id=\?\)/,
      );
      for (const name of ["setInvitationRole", "deleteInvitation"]) {
        expect(plans[name], name).toMatch(
          /SEARCH invitations USING (COVERING )?INDEX (sqlite_autoindex_invitations_\d \(id=\?\)|invitations_project \(project_id=\?\))/,
        );
      }
      const byToken =
        /SEARCH i USING INDEX sqlite_autoindex_invitations_\d \(token=\?\)|SEARCH invitations USING INDEX sqlite_autoindex_invitations_\d \(token=\?\)/;
      expect(plans["pendingInvitationByToken"]).toMatch(byToken);
      expect(plans["acceptInvitation"]).toMatch(byToken);
      expect(plans["acceptInvitation"]).toMatch(
        /SEARCH p USING INDEX sqlite_autoindex_projects_\d \(id=\?\)/,
      );
      expect(plans["acceptInvitationsFor"]).toMatch(
        /SEARCH i USING INDEX invitations_email \(email=\?\)/,
      );

      // A handle: the person by their key; whether another holds it by the partial unique index;
      // whether a publication is addressed by the current one by the unique key of publications.
      expect(plans["setHandle"]).toMatch(
        /SEARCH users USING INDEX sqlite_autoindex_users_\d \(sub=\?\)/,
      );
      expect(plans["setHandle"]).toMatch(
        /SEARCH other USING (COVERING )?INDEX users_handle \(handle=\?\)/,
      );
      expect(plans["setHandle"]).toMatch(
        /SEARCH publications USING (COVERING )?INDEX sqlite_autoindex_publications_\d \(handle=\?\)/,
      );

      expect(plans["publicationsOf"]).toMatch(
        /SEARCH publications USING PRIMARY KEY \(project_id=\?\)/,
      );
      expect(plans["publicationsOwnedBy"]).toMatch(
        /SEARCH projects USING (COVERING )?INDEX projects_owner \(owner_sub=\?\)/,
      );
      expect(plans["publicationsOwnedBy"]).toMatch(
        /SEARCH publications USING PRIMARY KEY \(project_id=\?\)/,
      );
      expect(plans["publication"]).toMatch(
        /SEARCH publications USING (COVERING )?INDEX sqlite_autoindex_publications_\d \(handle=\? AND slug=\?\)/,
      );
      expect(plans["takeDown"]).toMatch(
        /SEARCH publications USING (COVERING )?INDEX sqlite_autoindex_publications_\d \(handle=\? AND slug=\?\)/,
      );
      expect(plans["putPublication"]).toMatch(
        /SEARCH p USING (COVERING )?INDEX sqlite_autoindex_projects_\d \(id=\?\)/,
      );
      expect(plans["deletePublication"]).toMatch(
        /SEARCH publications USING PRIMARY KEY \(project_id=\? AND slug=\?\)/,
      );
      expect(plans["countPublicationsSince"]).toMatch(
        /SEARCH publications USING PRIMARY KEY \(project_id=\?\)/,
      );
      expect(plans["takedownsOf"]).toMatch(/SEARCH takedowns USING PRIMARY KEY \(handle=\?\)/);
      // The rate of publishing: the project by its key, and its requests of the hour as a range of
      // the key of the log; a refusal reads the earliest of them by the same range.
      expect(plans["claimPublish"]).toMatch(
        /SEARCH p USING (COVERING )?INDEX sqlite_autoindex_projects_\d \(id=\?\)/,
      );
      expect(plans["claimPublish"]).toMatch(
        /SEARCH publish_log USING COVERING INDEX publish_log_project \(project_id=\? AND at>\?\)/,
      );
      expect(plans["claimPublishRefused"]).toMatch(
        /SEARCH publish_log USING COVERING INDEX publish_log_project \(project_id=\? AND at>\?\)/,
      );

      // Deleting a project or a person finds their sharing by keys and indexes.
      expect(plans["deleteProject"]).toMatch(/SEARCH members USING PRIMARY KEY \(project_id=\?\)/);
      expect(plans["deleteProject"]).toMatch(
        /SEARCH invitations USING (COVERING )?INDEX invitations_project \(project_id=\?\)/,
      );
      expect(plans["deleteProject"]).toMatch(
        /SEARCH publications USING PRIMARY KEY \(project_id=\?\)/,
      );
      expect(plans["deleteProject"]).toMatch(
        /SEARCH publish_log USING (COVERING )?INDEX publish_log_project \(project_id=\?\)/,
      );
      expect(plans["applyUserDeleted"]).toMatch(
        /SEARCH members USING (COVERING )?INDEX members_sub \(sub=\?\)/,
      );
      expect(plans["applyUserDeleted"]).toMatch(
        /SEARCH invitations USING INDEX invitations_email \(email=\?\)/,
      );

      // Nothing is read whole, but the approval codes of a person's deletion (a short table of codes
      // that live five minutes) and what a statement's own VALUES clause is.
      for (const [name, plan] of Object.entries(plans)) {
        const scans = plan.replace(/SCAN CONSTANT ROW/g, "").match(/\bSCAN \w+/g) ?? [];
        expect(scans, name).toEqual(name === "applyUserDeleted" ? ["SCAN cli_codes"] : []);
      }
      db.close();
    });
  });

  describe("a step that fails undoes the whole of it", () => {
    const refuse = (table: string, event: string) =>
      `CREATE TRIGGER refuse BEFORE ${event} ON ${table} BEGIN SELECT RAISE(ABORT, 'refused'); END`;

    it("accepts no link when the mark is refused: no membership, the invitation still pending", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1), 50);
      db.raw.exec(refuse("invitations", "UPDATE"));
      await expect(store.acceptInvitation(invitation(1).token, "u1", T)).rejects.toThrow(/refused/);
      expect(rows(db, "members")).toBe(0);
      expect(await store.pendingInvitationByToken(invitation(1).token, T)).toBeDefined();
      db.raw.exec("DROP TRIGGER refuse");
      expect(await store.acceptInvitation(invitation(1).token, "u1", T)).toBeDefined();
      db.close();
    });

    it("resolves no invitation for an email when the mark is refused", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1, { email: "ana@example.com" }), 50);
      await store.createInvitation(invitation(2, { email: "ana@example.com", projectId: P2 }), 50);
      db.raw.exec(refuse("invitations", "UPDATE"));
      await expect(store.acceptInvitationsFor("u1", "ana@example.com", T)).rejects.toThrow(
        /refused/,
      );
      expect(rows(db, "members")).toBe(0);
      expect(await store.pendingInvitations(P1, T)).toHaveLength(1);
      db.close();
    });

    it("takes no publication down when the record is refused", async () => {
      const { db, store } = await world();
      await store.putPublication(publication("page"));
      db.raw.exec(refuse("takedowns", "INSERT"));
      await expect(
        store.takeDown({ handle: "handle-a", slug: "page", bySub: "admin", reason: "r", at: T }),
      ).rejects.toThrow(/refused/);
      expect(await store.publication("handle-a", "page")).toBeDefined();
      db.close();
    });

    it("deletes nothing of a person when the sharing of the projects they own is refused", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1), 50);
      await store.acceptInvitation(invitation(1).token, "u1", T);
      await store.putPublication(publication("page"));
      const counts = ["members", "invitations", "publications", "projects", "users"].map((table) =>
        rows(db, table),
      );
      db.raw.exec(refuse("publications", "DELETE"));
      await expect(store.applyUserDeleted("evt_1", "owner", LATER)).rejects.toThrow(/refused/);
      expect(
        ["members", "invitations", "publications", "projects", "users"].map((table) =>
          rows(db, table),
        ),
      ).toEqual(counts);
      expect(rows(db, "processed_events")).toBe(0);
      db.raw.exec("DROP TRIGGER refuse");
      expect(await store.applyUserDeleted("evt_1", "owner", LATER)).toBe("applied");
      expect(["members", "invitations", "publications"].map((table) => rows(db, table))).toEqual([
        0, 0, 0,
      ]);
      db.close();
    });

    it("deletes nothing of a project when its members cannot be removed", async () => {
      const { db, store } = await world();
      await store.createInvitation(invitation(1), 50);
      await store.acceptInvitation(invitation(1).token, "u1", T);
      db.raw.exec(refuse("members", "DELETE"));
      await expect(store.deleteProject("owner", P1)).rejects.toThrow(/refused/);
      expect(await store.projectById(P1)).toBeDefined();
      expect(rows(db, "members")).toBe(1);
      db.close();
    });
  });

  describe("two requests over one database", () => {
    const wires = [
      ["on the bare adapter", (db: SqliteDb): D1Like => db],
      ["with a round trip before every statement", withLatency],
    ] as const;

    it.each(wires)("hold the limit when stores invite at once, %s", async (_wire, wire) => {
      const { db } = await world();
      let n = 0;
      for (const projectId of [P1, P2]) {
        const results = await Promise.all(
          Array.from({ length: 8 }, () =>
            d1Store(wire(db)).createInvitation(invitation(++n, { projectId }), 3),
          ),
        );
        expect(
          results.filter((r) => r === "created"),
          projectId,
        ).toHaveLength(3);
        expect(rows(db, "invitations")).toBe(projectId === P1 ? 3 : 6);
      }
      db.close();
    });

    it.each(wires)(
      "hand a link to one of the stores that accept it at once, %s",
      async (_wire, wire) => {
        const { db, store } = await world();
        for (let round = 1; round <= 6; round++) {
          const made = invitation(round);
          await store.createInvitation(made, 50);
          // Four people who have not joined before race for the link.
          const results = await Promise.all(
            ["a", "b", "c", "d"].map((who) =>
              d1Store(wire(db)).acceptInvitation(made.token, `${round}-${who}`, T),
            ),
          );
          expect(
            results.filter((r) => r !== undefined),
            `round ${round}`,
          ).toHaveLength(1);
          expect(rows(db, "members"), `round ${round}`).toBe(round);
        }
        db.close();
      },
    );

    it.each(wires)(
      "give a handle to one of the stores that set it at once, %s",
      async (_wire, wire) => {
        const { db } = await world();
        const results = await Promise.all(
          ["owner", "u1", "u2"].map((sub) => d1Store(wire(db)).setHandle(sub, "same-handle")),
        );
        expect(results.filter((r) => r === "set")).toHaveLength(1);
        expect(results.filter((r) => r === "taken")).toHaveLength(2);
        expect(
          db.raw.prepare("SELECT count(*) AS n FROM users WHERE handle = 'same-handle'").get(),
        ).toEqual({ n: 1 });
        db.close();
      },
    );

    it.each(wires)(
      "give an address to one of the projects that publish at it at once, %s",
      async (_wire, wire) => {
        const { db } = await world();
        const results = await Promise.all(
          [P1, P2, P1, P2].map((projectId) =>
            d1Store(wire(db)).putPublication(publication("same", { projectId })),
          ),
        );
        expect(results.filter((r) => r === "taken")).toHaveLength(2);
        expect(rows(db, "publications")).toBe(1);
        db.close();
      },
    );

    it.each(wires)(
      "leave no sharing row without its project when writes race with its deletion, %s",
      async (_wire, wire) => {
        const { db, store } = await world();
        for (let round = 1; round <= 8; round++) {
          const id = `proj${String(round + 10).padStart(16, "0")}`;
          await store.createProject(
            { id, ownerSub: "owner", name: "P", description: "", createdAt: T },
            100,
          );
          const made = invitation(100 + round, { projectId: id });
          await store.createInvitation(made, 50);
          const requests = [
            () => d1Store(wire(db)).deleteProject("owner", id),
            () => d1Store(wire(db)).acceptInvitation(made.token, "u1", T),
            () =>
              d1Store(wire(db)).createInvitation(invitation(200 + round, { projectId: id }), 50),
            () => d1Store(wire(db)).putPublication(publication(`p${round}`, { projectId: id })),
          ];
          await Promise.all((round % 2 === 0 ? requests.reverse() : requests).map((run) => run()));
        }
        for (const table of ["members", "publications"]) {
          expect(
            db.raw
              .prepare(
                `SELECT count(*) AS n FROM ${table} WHERE project_id NOT IN (SELECT id FROM projects)`,
              )
              .get(),
            table,
          ).toEqual({ n: 0 });
        }
        expect(
          db.raw
            .prepare(
              "SELECT count(*) AS n FROM invitations WHERE project_id NOT IN (SELECT id FROM projects)",
            )
            .get(),
        ).toEqual({ n: 0 });
        db.close();
      },
    );
  });
});
