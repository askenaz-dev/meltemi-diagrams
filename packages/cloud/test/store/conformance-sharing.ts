// The part of the CloudStore contract that belongs to sharing (change sharing-and-permissions):
// the link level, members, invitations (the limit, thirty days, acceptance, resolution by email),
// handles, publications and takedowns, and what a person's deletion and a project's deletion
// remove of them. Run by `runStoreConformance` (conformance.ts) over every implementation, so the
// in-memory store the handlers' tests use cannot drift from the SQL one the Worker uses.

import { beforeEach, describe, expect, it } from "vitest";
import { INVITATION_LIFETIME_MS } from "../../src/store/retention.js";
import {
  MAX_MEMBERS,
  type CloudStore,
  type Invitation,
  type MemberRole,
  type NewInvitation,
  type Publication,
} from "../../src/store/types.js";
import { DAY, HOUR, MINUTE, SECOND, at, present, sha } from "./fixtures.js";

/** The id of the `n`th project: 20 characters of [0-9a-z], as the address of a project is. */
const pid = (n: number): string => `proj${String(n).padStart(16, "0")}`;

/** The owner of the projects the tests make, and a limit nothing reaches. */
const OWNER = "owner";
const MANY = 1000;

/** The `n`th invitation: its id and token are 32 lowercase hexadecimal characters, its email lower case. */
const aInvitation = (n: number, over: Partial<NewInvitation> = {}): NewInvitation => ({
  id: sha(`invitation-id/${n}`).slice(0, 32),
  projectId: pid(1),
  email: `guest${n}@example.com`,
  role: "viewer",
  token: sha(`invitation-token/${n}`).slice(0, 32),
  createdBy: OWNER,
  createdAt: at(0),
  ...over,
});

/** The `n`th publication of project 1 under the handle `handle-a`. */
const aPublication = (slug: string, over: Partial<Publication> = {}): Publication => ({
  projectId: pid(1),
  handle: "handle-a",
  slug,
  publishedAt: at(HOUR),
  bytes: 1000,
  ...over,
});

export function defineSharingConformance(get: () => CloudStore): void {
  describe("sharing", () => {
    let store: CloudStore;
    let counter: number;

    beforeEach(() => {
      store = get();
      counter = 0;
    });

    /** A person with a row, as one who signed in has. */
    const person = (sub: string, over: { email?: string; emailVerified?: boolean } = {}) =>
      store.upsertUser(
        {
          sub,
          name: `Person ${sub}`,
          picture: `https://img.example/${sub}.png`,
          email: over.email ?? `${sub}@example.com`,
          emailVerified: over.emailVerified ?? true,
        },
        at(0),
      );

    /** Creates the `n`th project, owned by `owner`, created `n` seconds in. */
    const makeProject = async (n: number, owner = OWNER) => {
      expect(
        await store.createProject(
          {
            id: pid(n),
            ownerSub: owner,
            name: `Project ${n}`,
            description: "",
            createdAt: at(n * SECOND),
          },
          MANY,
        ),
      ).toBe("created");
      return pid(n);
    };

    /** Records a fresh pending invitation and answers it. */
    const invite = async (over: Partial<NewInvitation> = {}, limit = MANY): Promise<Invitation> => {
      const invitation = aInvitation(++counter, over);
      expect(await store.createInvitation(invitation, limit)).toBe("created");
      return { ...invitation, acceptedAt: null };
    };

    /** Makes `sub` a member of the project by an invitation they accept (as the routes do). */
    const join = async (
      sub: string,
      role: MemberRole = "viewer",
      projectId = pid(1),
      now = at(MINUTE),
    ) => {
      const invitation = await invite({ projectId, role });
      const accepted = await store.acceptInvitation(invitation.token, sub, now);
      expect(accepted, `${sub} joins ${projectId}`).toEqual({ projectId, role });
    };

    // ---------------------------------------------------------------------------------------

    describe("the link level of a project", () => {
      it("is private for a new project, and projectById reads it with no owner", async () => {
        await makeProject(1);
        expect(await store.projectById(pid(1))).toEqual({
          id: pid(1),
          ownerSub: OWNER,
          name: "Project 1",
          description: "",
          createdAt: at(SECOND),
          updatedAt: at(SECOND),
          revision: 0,
          thumbnailAt: null,
          linkAccess: "private",
        });
        expect(await store.projectById(pid(2))).toBeUndefined();
        for (const lookalike of [
          "",
          "%",
          pid(1).toUpperCase(),
          pid(1).slice(0, 19),
          `${pid(1)}0`,
        ]) {
          expect(await store.projectById(lookalike), lookalike).toBeUndefined();
        }
      });

      it("is changed by the owner to view, edit and back, and the project answers it", async () => {
        await makeProject(1);
        for (const level of ["view", "edit", "private", "edit"] as const) {
          const changed = await store.setLinkAccess(OWNER, pid(1), level);
          expect(changed?.linkAccess, level).toBe(level);
          expect((await store.project(OWNER, pid(1)))?.linkAccess).toBe(level);
          expect((await store.projectById(pid(1)))?.linkAccess).toBe(level);
        }
      });

      it("leaves everything else of the project as it was, the time of its last change included", async () => {
        await makeProject(1);
        await store.claimThumbnail(pid(1), at(MINUTE), at(0));
        const before = present(await store.projectById(pid(1)));
        const after = present(await store.setLinkAccess(OWNER, pid(1), "view"));
        expect(after).toEqual({ ...before, linkAccess: "view" });
      });

      it("is the owner's alone: anyone else, and a project that does not exist, change nothing", async () => {
        await makeProject(1);
        for (const sub of ["other", "", "Owner", "owner ", "owner' OR '1'='1"]) {
          expect(await store.setLinkAccess(sub, pid(1), "edit"), sub).toBeUndefined();
        }
        expect(await store.setLinkAccess(OWNER, pid(2), "edit")).toBeUndefined();
        expect((await store.projectById(pid(1)))?.linkAccess).toBe("private");
      });

      it("does not open the project to the owner-keyed read: project(sub, id) stays the owner's whatever the link", async () => {
        await makeProject(1);
        await store.setLinkAccess(OWNER, pid(1), "edit");
        expect(await store.project("other", pid(1))).toBeUndefined();
        expect(await store.project(OWNER, pid(1))).toBeDefined();
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("members", () => {
      beforeEach(async () => {
        await makeProject(1);
        await makeProject(2);
      });

      it("has no member at first, and the owner is never one", async () => {
        expect(await store.members(pid(1))).toEqual([]);
        expect(await store.memberRole(pid(1), OWNER)).toBeUndefined();
        expect(await store.memberRole(pid(1), "someone")).toBeUndefined();
        expect(await store.memberRole(pid(9), "someone")).toBeUndefined();
      });

      it("lists the members with their role and the profile the service caches, the earliest added first (then by sub)", async () => {
        for (const sub of ["u-b", "u-a", "u-c"]) await person(sub);
        await join("u-b", "editor", pid(1), at(2 * MINUTE));
        await join("u-c", "viewer", pid(1), at(MINUTE));
        await join("u-a", "viewer", pid(1), at(MINUTE));
        expect(await store.members(pid(1))).toEqual([
          {
            sub: "u-a",
            role: "viewer",
            addedAt: at(MINUTE),
            name: "Person u-a",
            picture: "https://img.example/u-a.png",
            email: "u-a@example.com",
          },
          {
            sub: "u-c",
            role: "viewer",
            addedAt: at(MINUTE),
            name: "Person u-c",
            picture: "https://img.example/u-c.png",
            email: "u-c@example.com",
          },
          {
            sub: "u-b",
            role: "editor",
            addedAt: at(2 * MINUTE),
            name: "Person u-b",
            picture: "https://img.example/u-b.png",
            email: "u-b@example.com",
          },
        ]);
        expect(await store.memberRole(pid(1), "u-b")).toBe("editor");
        expect(await store.memberRole(pid(1), "u-a")).toBe("viewer");
      });

      it("keeps the members of each project apart, and the people whose sub merely looks the same", async () => {
        await join("u1", "editor", pid(1));
        await join("u1-and-more", "viewer", pid(2));
        expect(await store.memberRole(pid(1), "u1")).toBe("editor");
        expect(await store.memberRole(pid(2), "u1")).toBeUndefined();
        for (const lookalike of ["U1", "u1 ", "u", "%", "u1%"]) {
          expect(await store.memberRole(pid(1), lookalike), lookalike).toBeUndefined();
        }
        expect((await store.members(pid(1))).map((m) => m.sub)).toEqual(["u1"]);
        expect((await store.members(pid(2))).map((m) => m.sub)).toEqual(["u1-and-more"]);
      });

      it("lists a member whose profile is not cached with empty strings, as the person has not signed in here", async () => {
        await join("ghost", "viewer");
        expect(await store.members(pid(1))).toEqual([
          { sub: "ghost", role: "viewer", addedAt: at(MINUTE), name: "", picture: "", email: "" },
        ]);
      });

      it("changes a member's role, and answers false for a person who is not one, changing nothing", async () => {
        await join("u1", "viewer");
        await join("u2", "viewer", pid(2));
        expect(await store.setMemberRole(pid(1), "u1", "editor")).toBe(true);
        expect(await store.memberRole(pid(1), "u1")).toBe("editor");
        expect(await store.setMemberRole(pid(1), "u1", "viewer")).toBe(true);
        expect(await store.memberRole(pid(1), "u1")).toBe("viewer");
        expect(await store.setMemberRole(pid(1), "u2", "editor")).toBe(false);
        expect(await store.setMemberRole(pid(1), OWNER, "editor")).toBe(false);
        expect(await store.setMemberRole(pid(9), "u1", "editor")).toBe(false);
        expect(await store.memberRole(pid(2), "u2")).toBe("viewer");
        expect(await store.memberRole(pid(1), OWNER)).toBeUndefined();
      });

      it("removes a member, and answers false for a person who is not one", async () => {
        await join("u1", "editor");
        await join("u2", "viewer");
        expect(await store.removeMember(pid(1), "u1")).toBe(true);
        expect(await store.removeMember(pid(1), "u1")).toBe(false);
        expect(await store.removeMember(pid(2), "u2")).toBe(false);
        expect(await store.memberRole(pid(1), "u1")).toBeUndefined();
        expect((await store.members(pid(1))).map((m) => m.sub)).toEqual(["u2"]);
      });

      it("hands out copies: changing a result does not change the store", async () => {
        await person("u1");
        await join("u1", "viewer");
        const [member] = await store.members(pid(1));
        (present(member) as { role: string }).role = "editor";
        expect(await store.memberRole(pid(1), "u1")).toBe("viewer");
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("the list of a person's projects", () => {
      it("holds the projects they own, with the role owner, and the ones they are a member of, with the role they were given", async () => {
        await makeProject(1, "u1");
        await makeProject(2, "u2");
        await makeProject(3, "u2");
        await makeProject(4, "u3");
        await join("u1", "editor", pid(2));
        await join("u1", "viewer", pid(3));
        const listed = await store.listProjects("u1");
        expect(listed.map((p) => [p.id, p.role])).toEqual([
          [pid(3), "viewer"],
          [pid(2), "editor"],
          [pid(1), "owner"],
        ]);
        // Whole rows, as a person who owns them gets them.
        expect(listed[2]).toEqual({ ...present(await store.projectById(pid(1))), role: "owner" });
        expect(listed[1]).toEqual({ ...present(await store.projectById(pid(2))), role: "editor" });
        expect((await store.listProjects("u2")).map((p) => [p.id, p.role])).toEqual([
          [pid(3), "owner"],
          [pid(2), "owner"],
        ]);
      });

      it("orders the owned and the shared together by time of last change, a tie by the project stored later", async () => {
        await makeProject(1, "u1");
        await makeProject(2, "u2");
        await makeProject(3, "u1");
        await makeProject(4, "u2");
        await join("u1", "viewer", pid(2));
        await join("u1", "viewer", pid(4));
        // Created at 1, 2, 3 and 4 seconds: the later first; then project 2 changes.
        await store.updateProject("u2", pid(2), { name: "Changed" }, at(HOUR));
        expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([
          pid(2),
          pid(4),
          pid(3),
          pid(1),
        ]);
      });

      it("shows nothing of a project the person only holds the link of, and nothing once they leave or are removed", async () => {
        await makeProject(1, "u2");
        await store.setLinkAccess("u2", pid(1), "edit");
        expect(await store.listProjects("u1")).toEqual([]);
        await join("u1", "viewer", pid(1));
        expect((await store.listProjects("u1")).map((p) => p.id)).toEqual([pid(1)]);
        await store.removeMember(pid(1), "u1");
        expect(await store.listProjects("u1")).toEqual([]);
      });

      it("shows the role as it is changed, and nothing for a person nobody invited, whatever the sub looks like", async () => {
        await makeProject(1, "u2");
        await join("u1", "viewer", pid(1));
        await store.setMemberRole(pid(1), "u1", "editor");
        expect((await store.listProjects("u1"))[0]?.role).toBe("editor");
        for (const nobody of ["nobody", "", "U1", "u1 ", "u", "%"]) {
          expect(await store.listProjects(nobody), nobody).toEqual([]);
        }
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("invitations", () => {
      beforeEach(async () => {
        await makeProject(1);
        await makeProject(2);
      });

      it("records a pending invitation and reads it back whole, by the project and by its token", async () => {
        const made = await invite({ email: "ana@example.com", role: "editor" });
        expect(made.acceptedAt).toBeNull();
        expect(await store.pendingInvitations(pid(1), at(MINUTE))).toEqual([made]);
        expect(await store.pendingInvitationByToken(made.token, at(MINUTE))).toEqual(made);
        expect(made).toMatchObject({
          email: "ana@example.com",
          role: "editor",
          projectId: pid(1),
          createdBy: OWNER,
          createdAt: at(0),
        });
      });

      it("lists the pending invitations of a project, the earliest first (a tie, in the order they were made), and no other project's", async () => {
        const late = await invite({ createdAt: at(2 * MINUTE) });
        const first = await invite({ createdAt: at(MINUTE) });
        const same = await invite({ createdAt: at(MINUTE) });
        const other = await invite({ projectId: pid(2), createdAt: at(0) });
        expect(await store.pendingInvitations(pid(1), at(3 * MINUTE))).toEqual([first, same, late]);
        expect(await store.pendingInvitations(pid(2), at(3 * MINUTE))).toEqual([other]);
        expect(await store.pendingInvitations(pid(3), at(3 * MINUTE))).toEqual([]);
      });

      it("refuses an invitation for a project that does not exist, and records nothing", async () => {
        const invitation = aInvitation(++counter, { projectId: pid(9) });
        expect(await store.createInvitation(invitation, MANY)).toBe("missing");
        expect(await store.pendingInvitationByToken(invitation.token, at(MINUTE))).toBeUndefined();
        expect(await store.pendingInvitations(pid(9), at(MINUTE))).toEqual([]);
      });

      it("refuses an id or a token that exists, and keeps the first", async () => {
        const first = await invite();
        await expect(
          store.createInvitation(aInvitation(++counter, { id: first.id }), MANY),
        ).rejects.toThrow();
        await expect(
          store.createInvitation(aInvitation(++counter, { token: first.token }), MANY),
        ).rejects.toThrow();
        expect(await store.pendingInvitations(pid(1), at(MINUTE))).toEqual([first]);
      });

      it("keeps text exactly as given: an email with quotes and markup, and an unusual sub", async () => {
        const odd = await invite({
          email: "o'brien+<b>x</b>;drop table invitations;--@example.com",
          createdBy: "Robert'); DROP TABLE invitations;--",
        });
        expect(await store.pendingInvitations(pid(1), at(MINUTE))).toEqual([odd]);
      });

      it("changes the role of a pending invitation of that project and no other, and answers false otherwise", async () => {
        const mine = await invite();
        const theirs = await invite({ projectId: pid(2) });
        expect(await store.setInvitationRole(pid(1), mine.id, "editor")).toBe(true);
        expect((await store.pendingInvitationByToken(mine.token, at(MINUTE)))?.role).toBe("editor");
        expect(await store.setInvitationRole(pid(1), theirs.id, "editor")).toBe(false);
        expect(await store.setInvitationRole(pid(1), "0".repeat(32), "editor")).toBe(false);
        expect((await store.pendingInvitationByToken(theirs.token, at(MINUTE)))?.role).toBe(
          "viewer",
        );
        await store.acceptInvitation(mine.token, "u1", at(MINUTE));
        expect(await store.setInvitationRole(pid(1), mine.id, "viewer")).toBe(false);
      });

      it("revokes a pending invitation of that project, and no other, and one accepted cannot be revoked", async () => {
        const mine = await invite();
        const theirs = await invite({ projectId: pid(2) });
        const used = await invite();
        await store.acceptInvitation(used.token, "u1", at(MINUTE));
        expect(await store.deleteInvitation(pid(1), theirs.id)).toBe(false);
        expect(await store.deleteInvitation(pid(1), used.id)).toBe(false);
        expect(await store.deleteInvitation(pid(1), mine.id)).toBe(true);
        expect(await store.deleteInvitation(pid(1), mine.id)).toBe(false);
        expect(await store.pendingInvitationByToken(mine.token, at(MINUTE))).toBeUndefined();
        expect(await store.pendingInvitationByToken(theirs.token, at(MINUTE))).toBeDefined();
        // The membership the accepted one made is not undone by trying to revoke it.
        expect(await store.memberRole(pid(1), "u1")).toBe("viewer");
      });

      it("finds a token only exactly: not another's, not in another case, not a prefix", async () => {
        const made = await invite();
        for (const token of [
          made.token.toUpperCase(),
          made.token.slice(0, 31),
          `${made.token}0`,
          "",
          "%",
          made.token.replace(/.$/, "%"),
          made.id,
        ]) {
          expect(await store.pendingInvitationByToken(token, at(MINUTE)), token).toBeUndefined();
        }
      });

      describe("the thirty days", () => {
        it("are exactly thirty: valid a millisecond before, expired at the moment", async () => {
          const made = await invite({ createdAt: at(HOUR) });
          const lastValid = at(HOUR + INVITATION_LIFETIME_MS - 1);
          const expired = at(HOUR + INVITATION_LIFETIME_MS);
          expect(await store.pendingInvitationByToken(made.token, lastValid)).toEqual(made);
          expect(await store.pendingInvitations(pid(1), lastValid)).toEqual([made]);
          expect(await store.pendingInvitationByToken(made.token, expired)).toBeUndefined();
          expect(await store.pendingInvitations(pid(1), expired)).toEqual([]);
        });

        it("end an invitation for the person who opens its link, and for the one it is addressed to", async () => {
          const made = await invite({ email: "ana@example.com", createdAt: at(0) });
          const expired = at(INVITATION_LIFETIME_MS);
          expect(await store.acceptInvitation(made.token, "u1", expired)).toBeUndefined();
          expect(await store.acceptInvitationsFor("u1", "ana@example.com", expired)).toEqual([]);
          expect(await store.memberRole(pid(1), "u1")).toBeUndefined();
          // The row is still there for the day before: it is expired, not removed.
          expect(await store.pendingInvitationByToken(made.token, at(DAY))).toEqual(made);
          expect(
            await store.acceptInvitation(made.token, "u1", at(INVITATION_LIFETIME_MS - 1)),
          ).toEqual({
            projectId: pid(1),
            role: "viewer",
          });
        });
      });

      describe("accepting by the link", () => {
        it("makes the person a member with the invitation's role and marks it accepted, as one step", async () => {
          const made = await invite({ role: "editor", email: "ana@example.com" });
          // The link is the proof, whatever the email of the person who opens it.
          expect(await store.acceptInvitation(made.token, "someone-else", at(5 * MINUTE))).toEqual({
            projectId: pid(1),
            role: "editor",
          });
          expect(await store.memberRole(pid(1), "someone-else")).toBe("editor");
          expect((await store.members(pid(1)))[0]).toMatchObject({
            sub: "someone-else",
            role: "editor",
            addedAt: at(5 * MINUTE),
          });
          expect(await store.pendingInvitations(pid(1), at(5 * MINUTE))).toEqual([]);
          expect(await store.pendingInvitationByToken(made.token, at(5 * MINUTE))).toBeUndefined();
        });

        it("works once: the same link again, by anyone, is nothing, and the first keeps their place", async () => {
          const made = await invite();
          expect(await store.acceptInvitation(made.token, "u1", at(MINUTE))).toBeDefined();
          expect(await store.acceptInvitation(made.token, "u2", at(MINUTE))).toBeUndefined();
          expect(await store.acceptInvitation(made.token, "u1", at(MINUTE))).toBeUndefined();
          expect((await store.members(pid(1))).map((m) => m.sub)).toEqual(["u1"]);
        });

        it("answers undefined for a token nobody has, and writes nothing", async () => {
          await invite();
          expect(await store.acceptInvitation("f".repeat(32), "u1", at(MINUTE))).toBeUndefined();
          expect(await store.acceptInvitation("", "u1", at(MINUTE))).toBeUndefined();
          expect(await store.members(pid(1))).toEqual([]);
        });

        it("never makes the owner a member, and leaves the invitation pending for them", async () => {
          const made = await invite();
          expect(await store.acceptInvitation(made.token, OWNER, at(MINUTE))).toBeUndefined();
          expect(await store.memberRole(pid(1), OWNER)).toBeUndefined();
          expect(await store.pendingInvitationByToken(made.token, at(MINUTE))).toEqual(made);
          // Somebody else can still use it.
          expect(await store.acceptInvitation(made.token, "u1", at(MINUTE))).toBeDefined();
        });

        it("gives a person who already is a member the higher of the two roles, and keeps when they were added", async () => {
          await join("u1", "viewer", pid(1), at(MINUTE));
          const up = await invite({ role: "editor" });
          expect(await store.acceptInvitation(up.token, "u1", at(HOUR))).toEqual({
            projectId: pid(1),
            role: "editor",
          });
          expect(await store.memberRole(pid(1), "u1")).toBe("editor");
          const down = await invite({ role: "viewer" });
          expect(await store.acceptInvitation(down.token, "u1", at(2 * HOUR))).toEqual({
            projectId: pid(1),
            role: "editor",
          });
          expect(await store.memberRole(pid(1), "u1")).toBe("editor");
          expect((await store.members(pid(1)))[0]?.addedAt).toBe(at(MINUTE));
          // Both were used up.
          expect(await store.pendingInvitations(pid(1), at(3 * HOUR))).toEqual([]);
          // The owner lowers a role by changing it, which an invitation does not.
          expect(await store.setMemberRole(pid(1), "u1", "viewer")).toBe(true);
          expect(await store.memberRole(pid(1), "u1")).toBe("viewer");
        });

        it("lets one of the people who race for the same link have it", async () => {
          for (let round = 1; round <= 6; round++) {
            const made = await invite();
            const results = await Promise.all(
              ["u1", "u2", "u3", "u4"].map((sub) =>
                store.acceptInvitation(made.token, sub, at(MINUTE)),
              ),
            );
            expect(
              results.filter((r) => r !== undefined),
              `round ${round}`,
            ).toHaveLength(1);
          }
          // Six links, six members (the same four people race for each, so some hold several seats: a person is one member).
          expect((await store.members(pid(1))).length).toBeGreaterThan(0);
          expect((await store.members(pid(1))).length).toBeLessThanOrEqual(4);
        });
      });

      describe("resolving by email", () => {
        it("turns every pending invitation for the email into a membership, and marks them accepted, as one step", async () => {
          const one = await invite({ email: "ana@example.com", role: "editor" });
          const two = await invite({ email: "ana@example.com", role: "viewer", projectId: pid(2) });
          const other = await invite({ email: "beto@example.com" });
          expect(await store.acceptInvitationsFor("u-ana", "ana@example.com", at(MINUTE))).toEqual([
            { projectId: pid(1), role: "editor" },
            { projectId: pid(2), role: "viewer" },
          ]);
          expect(await store.memberRole(pid(1), "u-ana")).toBe("editor");
          expect(await store.memberRole(pid(2), "u-ana")).toBe("viewer");
          expect(await store.pendingInvitationByToken(one.token, at(MINUTE))).toBeUndefined();
          expect(await store.pendingInvitationByToken(two.token, at(MINUTE))).toBeUndefined();
          // Somebody else's invitation is not touched.
          expect(await store.pendingInvitationByToken(other.token, at(MINUTE))).toEqual(other);
          // Done: nothing is left for a second session.
          expect(
            await store.acceptInvitationsFor("u-ana", "ana@example.com", at(2 * MINUTE)),
          ).toEqual([]);
        });

        it("writes nothing for an email nobody invited", async () => {
          const made = await invite({ email: "ana@example.com" });
          expect(await store.acceptInvitationsFor("u-x", "nobody@example.com", at(MINUTE))).toEqual(
            [],
          );
          expect(await store.members(pid(1))).toEqual([]);
          expect(await store.pendingInvitations(pid(1), at(MINUTE))).toEqual([made]);
        });

        it("matches the address exactly: not a longer or a shorter one, not another case, nor a pattern", async () => {
          const made = await invite({ email: "ana@example.com" });
          for (const email of [
            "ana@example.com.evil.example",
            "xana@example.com",
            "ana@example.co",
            "ANA@EXAMPLE.COM",
            "ana@example.com ",
            "%",
            "ana@%",
            "a_a@example.com",
            "",
          ]) {
            expect(await store.acceptInvitationsFor("u-x", email, at(MINUTE)), email).toEqual([]);
          }
          expect(await store.pendingInvitations(pid(1), at(MINUTE))).toEqual([made]);
        });

        it("leaves out the invitations that expired or were used, and the projects the person owns", async () => {
          const old = await invite({ email: "ana@example.com", createdAt: at(0) });
          const used = await invite({
            email: "ana@example.com",
            createdAt: at(INVITATION_LIFETIME_MS),
          });
          await store.acceptInvitation(used.token, "someone", at(INVITATION_LIFETIME_MS + MINUTE));
          const fresh = await invite({
            email: "ana@example.com",
            projectId: pid(2),
            createdAt: at(INVITATION_LIFETIME_MS),
          });
          // The person owns project 1: an invitation to it stays pending for them.
          await makeProject(3, "u-ana");
          const own = await invite({
            email: "ana@example.com",
            projectId: pid(3),
            createdAt: at(INVITATION_LIFETIME_MS),
          });
          const now = at(INVITATION_LIFETIME_MS + 2 * MINUTE);
          expect(await store.acceptInvitationsFor("u-ana", "ana@example.com", now)).toEqual([
            { projectId: pid(2), role: "viewer" },
          ]);
          expect(await store.memberRole(pid(1), "u-ana")).toBeUndefined();
          expect(await store.memberRole(pid(3), "u-ana")).toBeUndefined();
          expect(await store.pendingInvitationByToken(old.token, at(DAY))).toBeDefined();
          expect(await store.pendingInvitationByToken(own.token, now)).toBeDefined();
          expect(await store.pendingInvitationByToken(fresh.token, now)).toBeUndefined();
        });

        it("keeps the higher role of a person who already is a member", async () => {
          await join("u-ana", "editor", pid(1));
          await invite({ email: "ana@example.com", role: "viewer" });
          expect(await store.acceptInvitationsFor("u-ana", "ana@example.com", at(HOUR))).toEqual([
            { projectId: pid(1), role: "editor" },
          ]);
          expect(await store.memberRole(pid(1), "u-ana")).toBe("editor");
        });
      });

      describe("the limit of members and pending invitations", () => {
        it("counts the members and the pending invitations together, and refuses what takes a project past it, writing nothing", async () => {
          await join("u1", "viewer");
          await join("u2", "viewer");
          await invite();
          expect(await store.createInvitation(aInvitation(++counter), 4)).toBe("created");
          const refused = aInvitation(++counter);
          expect(await store.createInvitation(refused, 4)).toBe("quota");
          expect(await store.pendingInvitationByToken(refused.token, at(MINUTE))).toBeUndefined();
          expect(await store.pendingInvitations(pid(1), at(MINUTE))).toHaveLength(2);
          // A refusal does not wear out, and the limit given each time is the one that counts.
          expect(await store.createInvitation(aInvitation(++counter), 4)).toBe("quota");
          expect(await store.createInvitation(aInvitation(++counter), 5)).toBe("created");
        });

        it("allows exactly fifty, the limit of a project, and refuses the fifty-first", async () => {
          for (let n = 1; n <= 30; n++) await join(`member-${n}`, "viewer");
          for (let n = 1; n <= 20; n++) {
            expect(
              await store.createInvitation(aInvitation(++counter), MAX_MEMBERS),
              `pending ${n}`,
            ).toBe("created");
          }
          expect(await store.members(pid(1))).toHaveLength(30);
          expect(await store.pendingInvitations(pid(1), at(HOUR))).toHaveLength(20);
          expect(await store.createInvitation(aInvitation(++counter), MAX_MEMBERS)).toBe("quota");
          expect(await store.pendingInvitations(pid(1), at(HOUR))).toHaveLength(20);
        });

        it("keeps the count when a pending invitation becomes a member, and gives a place back when one is revoked or a member leaves", async () => {
          const first = await invite();
          const second = await invite();
          expect(await store.createInvitation(aInvitation(++counter), 2)).toBe("quota");
          await store.acceptInvitation(first.token, "u1", at(MINUTE));
          expect(await store.createInvitation(aInvitation(++counter), 2)).toBe("quota");
          expect(await store.deleteInvitation(pid(1), second.id)).toBe(true);
          expect(await store.createInvitation(aInvitation(++counter), 2)).toBe("created");
          expect(await store.createInvitation(aInvitation(++counter), 2)).toBe("quota");
          expect(await store.removeMember(pid(1), "u1")).toBe(true);
          expect(await store.createInvitation(aInvitation(++counter), 2)).toBe("created");
        });

        it("does not count the owner, an expired invitation or one that was accepted by the email's person, and counts per project", async () => {
          // An invitation made long ago is no longer pending: it takes no place.
          await invite({ createdAt: at(0) });
          const now = at(INVITATION_LIFETIME_MS + HOUR);
          expect(await store.createInvitation(aInvitation(++counter, { createdAt: now }), 1)).toBe(
            "created",
          );
          expect(await store.createInvitation(aInvitation(++counter, { createdAt: now }), 1)).toBe(
            "quota",
          );
          // Another project has its own count.
          expect(
            await store.createInvitation(
              aInvitation(++counter, { projectId: pid(2), createdAt: now }),
              1,
            ),
          ).toBe("created");
          // Accepted by email: now a member, still one place.
          const mail = aInvitation(++counter, {
            projectId: pid(2),
            email: "ana@example.com",
            createdAt: now,
          });
          expect(await store.createInvitation(mail, 2)).toBe("created");
          await store.acceptInvitationsFor("u-ana", "ana@example.com", now);
          expect(
            await store.createInvitation(
              aInvitation(++counter, { projectId: pid(2), createdAt: now }),
              2,
            ),
          ).toBe("quota");
          expect(await store.members(pid(2))).toHaveLength(1);
          expect(await store.pendingInvitations(pid(2), now)).toHaveLength(1);
        });

        it.each([
          ["zero", "quota", 0],
          ["a negative number", "quota", -1],
          ["not a number", "quota", Number.NaN],
          ["infinity", "created", Number.POSITIVE_INFINITY],
        ] as const)(
          "a limit of %s gives %s to a project with nothing in it",
          async (_label, expected, limit) => {
            expect(await store.createInvitation(aInvitation(++counter), limit)).toBe(expected);
          },
        );

        it("never lets racing invitations take a project past the limit", async () => {
          const results = await Promise.all(
            Array.from({ length: 25 }, () => store.createInvitation(aInvitation(++counter), 10)),
          );
          expect(results.filter((r) => r === "created")).toHaveLength(10);
          expect(results.filter((r) => r === "quota")).toHaveLength(15);
          expect(await store.pendingInvitations(pid(1), at(MINUTE))).toHaveLength(10);
        });

        it("lets exactly one of the invitations that race for the last place have it, members counted", async () => {
          await join("u1", "viewer");
          await join("u2", "viewer");
          for (let n = 0; n < 6; n++) await invite();
          const results = await Promise.all(
            Array.from({ length: 6 }, () => store.createInvitation(aInvitation(++counter), 9)),
          );
          expect(results.filter((r) => r === "created")).toHaveLength(1);
          expect(
            (await store.members(pid(1))).length +
              (await store.pendingInvitations(pid(1), at(HOUR))).length,
          ).toBe(9);
        });

        it("keeps the limit of each project when several race at once", async () => {
          const results = await Promise.all(
            [1, 2].flatMap((n) =>
              Array.from({ length: 8 }, () =>
                store.createInvitation(aInvitation(++counter, { projectId: pid(n) }), 3),
              ),
            ),
          );
          expect(results.filter((r) => r === "created")).toHaveLength(6);
          for (const n of [1, 2]) {
            expect(await store.pendingInvitations(pid(n), at(MINUTE))).toHaveLength(3);
          }
        });
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("handles", () => {
      it("reads null until the person chooses one, and keeps it through the refreshes of their profile", async () => {
        await person("u1");
        expect((await store.user("u1"))?.handle).toBeNull();
        expect(await store.setHandle("u1", "ana-dev")).toBe("set");
        expect((await store.user("u1"))?.handle).toBe("ana-dev");
        const refreshed = await store.upsertUser(
          {
            sub: "u1",
            name: "Renamed",
            picture: "",
            email: "new@example.com",
            emailVerified: false,
          },
          at(DAY),
        );
        expect(refreshed.handle).toBe("ana-dev");
        expect((await store.user("u1"))?.handle).toBe("ana-dev");
      });

      it("is the person's own again without changing anything, and can be changed while no publication is addressed by it", async () => {
        await person("u1");
        expect(await store.setHandle("u1", "ana-dev")).toBe("set");
        expect(await store.setHandle("u1", "ana-dev")).toBe("set");
        expect(await store.setHandle("u1", "ana-two")).toBe("set");
        expect((await store.user("u1"))?.handle).toBe("ana-two");
      });

      it("is taken while another person holds it, and the person who holds it keeps it", async () => {
        await person("u1");
        await person("u2");
        expect(await store.setHandle("u1", "ana-dev")).toBe("set");
        expect(await store.setHandle("u2", "ana-dev")).toBe("taken");
        expect((await store.user("u2"))?.handle).toBeNull();
        expect((await store.user("u1"))?.handle).toBe("ana-dev");
        // Free once the holder moves on.
        expect(await store.setHandle("u1", "ana-other")).toBe("set");
        expect(await store.setHandle("u2", "ana-dev")).toBe("set");
      });

      it("is missing for a person with no row, and gives them none", async () => {
        expect(await store.setHandle("ghost", "ana-dev")).toBe("missing");
        await person("u1");
        expect(await store.setHandle("u1", "ana-dev")).toBe("set");
      });

      it("is locked while a publication is addressed by it, and free again when the publication is gone", async () => {
        await person("u1");
        await makeProject(1, "u1");
        expect(await store.setHandle("u1", "handle-a")).toBe("set");
        expect(await store.putPublication(aPublication("page"))).toBe("put");
        expect(await store.setHandle("u1", "handle-b")).toBe("locked");
        expect((await store.user("u1"))?.handle).toBe("handle-a");
        // The same handle again is not a change.
        expect(await store.setHandle("u1", "handle-a")).toBe("set");
        expect(await store.deletePublication(pid(1), "page")).toBeDefined();
        expect(await store.setHandle("u1", "handle-b")).toBe("set");
      });

      it("says taken before locked: a handle somebody holds is not free for a person who could not move anyway", async () => {
        await person("u1");
        await person("u2");
        await makeProject(1, "u1");
        await store.setHandle("u1", "handle-a");
        await store.setHandle("u2", "handle-z");
        await store.putPublication(aPublication("page"));
        expect(await store.setHandle("u1", "handle-z")).toBe("taken");
      });

      it("lets one of the people who race for a handle have it", async () => {
        const subs = ["u1", "u2", "u3", "u4", "u5"];
        for (const sub of subs) await person(sub);
        const results = await Promise.all(subs.map((sub) => store.setHandle(sub, "same-handle")));
        expect(results.filter((r) => r === "set")).toHaveLength(1);
        expect(results.filter((r) => r === "taken")).toHaveLength(4);
        const holders = (await Promise.all(subs.map((sub) => store.user(sub)))).filter(
          (user) => user?.handle === "same-handle",
        );
        expect(holders).toHaveLength(1);
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("publications", () => {
      beforeEach(async () => {
        await makeProject(1);
        await makeProject(2, "u2");
      });

      it("records a publication and reads it back by the address, by the project and by the owner", async () => {
        const published = aPublication("page");
        expect(await store.putPublication(published)).toBe("put");
        expect(await store.publication("handle-a", "page")).toEqual(published);
        expect(await store.publicationsOf(pid(1))).toEqual([published]);
        expect(await store.publicationsOwnedBy(OWNER)).toEqual([published]);
        expect(await store.publicationsOwnedBy("u2")).toEqual([]);
        expect(await store.publication("handle-a", "other")).toBeUndefined();
        expect(await store.publication("handle-b", "page")).toBeUndefined();
        expect(await store.publication("", "")).toBeUndefined();
      });

      it("replaces the project's publication under a slug, and may hold several, one per slug", async () => {
        await store.putPublication(aPublication("page", { bytes: 10, publishedAt: at(HOUR) }));
        expect(
          await store.putPublication(
            aPublication("page", { bytes: 20, publishedAt: at(2 * HOUR) }),
          ),
        ).toBe("put");
        expect(
          await store.putPublication(aPublication("second", { publishedAt: at(3 * HOUR) })),
        ).toBe("put");
        expect(await store.publicationsOf(pid(1))).toEqual([
          aPublication("page", { bytes: 20, publishedAt: at(2 * HOUR) }),
          aPublication("second", { publishedAt: at(3 * HOUR) }),
        ]);
      });

      it("refuses an address another project holds, and keeps the first", async () => {
        const first = aPublication("page");
        await store.putPublication(first);
        expect(
          await store.putPublication(aPublication("page", { projectId: pid(2), bytes: 5 })),
        ).toBe("taken");
        expect(await store.publication("handle-a", "page")).toEqual(first);
        expect(await store.publicationsOf(pid(2))).toEqual([]);
        // The same slug under another handle is another address.
        expect(
          await store.putPublication(
            aPublication("page", { projectId: pid(2), handle: "handle-b" }),
          ),
        ).toBe("put");
      });

      it("refuses a project that does not exist, and records nothing", async () => {
        expect(await store.putPublication(aPublication("page", { projectId: pid(9) }))).toBe(
          "missing",
        );
        expect(await store.publication("handle-a", "page")).toBeUndefined();
      });

      it("records a publication for an owner who holds the handle, when asked to, and says handle for one who does not", async () => {
        await person(OWNER);
        // The owner has no handle yet.
        expect(await store.putPublication(aPublication("page"), { ownersHandle: true })).toBe(
          "handle",
        );
        expect(await store.publicationsOf(pid(1))).toEqual([]);

        expect(await store.setHandle(OWNER, "handle-a")).toBe("set");
        expect(await store.putPublication(aPublication("page"), { ownersHandle: true })).toBe(
          "put",
        );
        expect(await store.publication("handle-a", "page")).toEqual(aPublication("page"));

        // The handle moved after a request read it: the publication is refused and nothing is
        // left under the old address.
        await store.deletePublication(pid(1), "page");
        expect(await store.setHandle(OWNER, "handle-b")).toBe("set");
        expect(await store.putPublication(aPublication("page"), { ownersHandle: true })).toBe(
          "handle",
        );
        expect(await store.publication("handle-a", "page")).toBeUndefined();
        expect(await store.publicationsOf(pid(1))).toEqual([]);
        // Without the request for it, the store records what it is given, as it always did.
        expect(await store.putPublication(aPublication("page"))).toBe("put");
      });

      it("keeps saying missing for a project that is not there and taken for an address another project holds, whoever holds the handle", async () => {
        await person(OWNER);
        await store.setHandle(OWNER, "handle-b");
        expect(
          await store.putPublication(
            aPublication("page", { projectId: pid(9), handle: "handle-b" }),
            {
              ownersHandle: true,
            },
          ),
        ).toBe("missing");
        await store.putPublication(aPublication("page", { projectId: pid(2), handle: "handle-b" }));
        expect(
          await store.putPublication(aPublication("page", { handle: "handle-b" }), {
            ownersHandle: true,
          }),
        ).toBe("taken");
      });

      it("never leaves a publication under a handle its owner no longer holds, when the handle changes as it is recorded", async () => {
        await person(OWNER);
        await store.setHandle(OWNER, "handle-a");
        const [, recorded] = await Promise.all([
          store.setHandle(OWNER, "handle-b"),
          store.putPublication(aPublication("page"), { ownersHandle: true }),
        ]);
        const owner = await store.user(OWNER);
        for (const held of await store.publicationsOwnedBy(OWNER)) {
          expect(held.handle).toBe(owner?.handle);
        }
        // One of the two won: the page went in and the handle is locked, or the handle moved and
        // the page is refused.
        expect(owner?.handle).toBe(recorded === "put" ? "handle-a" : "handle-b");
      });

      it("removes a publication and answers it, and undefined for one that is not there", async () => {
        const published = aPublication("page");
        await store.putPublication(published);
        await store.putPublication(aPublication("keep"));
        expect(await store.deletePublication(pid(2), "page")).toBeUndefined();
        expect(await store.deletePublication(pid(1), "page")).toEqual(published);
        expect(await store.deletePublication(pid(1), "page")).toBeUndefined();
        expect(await store.publication("handle-a", "page")).toBeUndefined();
        expect((await store.publicationsOf(pid(1))).map((p) => p.slug)).toEqual(["keep"]);
      });

      it("counts the project's publications published at or after a time, for the rate", async () => {
        await store.putPublication(aPublication("a", { publishedAt: at(HOUR) }));
        await store.putPublication(aPublication("b", { publishedAt: at(2 * HOUR) }));
        await store.putPublication(aPublication("c", { publishedAt: at(3 * HOUR) }));
        await store.putPublication(
          aPublication("a", { projectId: pid(2), handle: "handle-b", publishedAt: at(3 * HOUR) }),
        );
        expect(await store.countPublicationsSince(pid(1), at(0))).toBe(3);
        expect(await store.countPublicationsSince(pid(1), at(2 * HOUR))).toBe(2);
        expect(await store.countPublicationsSince(pid(1), at(2 * HOUR + 1))).toBe(1);
        expect(await store.countPublicationsSince(pid(1), at(3 * HOUR + 1))).toBe(0);
        expect(await store.countPublicationsSince(pid(2), at(0))).toBe(1);
        expect(await store.countPublicationsSince(pid(9), at(0))).toBe(0);
      });

      it("lists the earliest published first, then by slug", async () => {
        await store.putPublication(aPublication("z", { publishedAt: at(HOUR) }));
        await store.putPublication(aPublication("b", { publishedAt: at(2 * HOUR) }));
        await store.putPublication(aPublication("a", { publishedAt: at(2 * HOUR) }));
        expect((await store.publicationsOf(pid(1))).map((p) => p.slug)).toEqual(["z", "a", "b"]);
      });

      it("hands out copies: changing a result does not change the store", async () => {
        await store.putPublication(aPublication("page"));
        const found = present(await store.publication("handle-a", "page"));
        (found as { bytes: number }).bytes = 1;
        expect((await store.publication("handle-a", "page"))?.bytes).toBe(1000);
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("publish requests (the rate of publishing)", () => {
      beforeEach(async () => {
        await makeProject(1);
        await makeProject(2, "u2");
      });

      it("records requests up to the limit within the hour and refuses the next, saying when the earliest stops counting", async () => {
        for (let n = 0; n < 3; n++) {
          expect(await store.claimPublish(pid(1), at(n * MINUTE), 3)).toEqual({
            status: "claimed",
          });
        }
        // Refused, with when a place is free: an hour after the earliest of the three.
        expect(await store.claimPublish(pid(1), at(10 * MINUTE), 3)).toEqual({
          status: "rate",
          freeAt: at(HOUR),
        });
        // A refusal records nothing: when the earliest stops counting, one place is free, not two.
        expect(await store.claimPublish(pid(1), at(HOUR + 1), 3)).toEqual({ status: "claimed" });
        expect(await store.claimPublish(pid(1), at(HOUR + 2), 3)).toEqual({
          status: "rate",
          freeAt: at(HOUR + MINUTE),
        });
      });

      it("counts a request made exactly an hour ago and not one a millisecond older", async () => {
        await store.claimPublish(pid(1), at(0), 1);
        expect(await store.claimPublish(pid(1), at(HOUR), 1)).toMatchObject({ status: "rate" });
        expect(await store.claimPublish(pid(1), at(HOUR + 1), 1)).toEqual({ status: "claimed" });
      });

      it("counts the requests of each project apart", async () => {
        expect(await store.claimPublish(pid(1), at(0), 1)).toEqual({ status: "claimed" });
        expect(await store.claimPublish(pid(1), at(1), 1)).toMatchObject({ status: "rate" });
        expect(await store.claimPublish(pid(2), at(1), 1)).toEqual({ status: "claimed" });
      });

      it("counts requests and not publications: publishing one slug again is counted each time", async () => {
        await store.putPublication(aPublication("page", { publishedAt: at(0) }));
        for (let n = 0; n < 3; n++) {
          expect(await store.claimPublish(pid(1), at(n * SECOND), 3)).toEqual({
            status: "claimed",
          });
          // The row of the slug is replaced, and its time moves: it could not have counted them.
          await store.putPublication(aPublication("page", { publishedAt: at(n * SECOND) }));
        }
        expect(await store.countPublicationsSince(pid(1), at(0))).toBe(1);
        expect(await store.claimPublish(pid(1), at(3 * SECOND), 3)).toMatchObject({
          status: "rate",
        });
      });

      it("records nothing for a project that does not exist", async () => {
        expect(await store.claimPublish(pid(9), at(0), 10)).toEqual({ status: "missing" });
        await makeProject(9);
        // Nothing was left behind by the request for the project that was not there.
        expect(await store.claimPublish(pid(9), at(1), 1)).toEqual({ status: "claimed" });
      });

      it("allows nothing under a limit of zero, and nothing under one that is not a number", async () => {
        expect(await store.claimPublish(pid(1), at(0), 0)).toEqual({
          status: "rate",
          freeAt: at(HOUR),
        });
        expect(await store.claimPublish(pid(1), at(0), Number.NaN)).toMatchObject({
          status: "rate",
        });
        expect(await store.claimPublish(pid(1), at(0), 1)).toEqual({ status: "claimed" });
      });

      it("counts two requests of one project in the very same millisecond as two", async () => {
        expect(await store.claimPublish(pid(1), at(0), 2)).toEqual({ status: "claimed" });
        expect(await store.claimPublish(pid(1), at(0), 2)).toEqual({ status: "claimed" });
        expect(await store.claimPublish(pid(1), at(0), 2)).toEqual({
          status: "rate",
          freeAt: at(HOUR),
        });
      });

      it("refuses a time that is not one, and records nothing", async () => {
        await expect(store.claimPublish(pid(1), "not a time", 10)).rejects.toThrow();
        expect(await store.claimPublish(pid(1), at(0), 1)).toEqual({ status: "claimed" });
      });

      it("keeps what still counts when the store sweeps: a request exactly an hour old stays, one a millisecond older goes", async () => {
        await store.claimPublish(pid(1), at(30 * MINUTE), 1);
        await store.sweep(at(HOUR + 30 * MINUTE));
        // Exactly an hour old: the sweep left it, and it still counts.
        expect(await store.claimPublish(pid(1), at(HOUR + 30 * MINUTE), 1)).toMatchObject({
          status: "rate",
        });
        await store.sweep(at(HOUR + 30 * MINUTE + 1));
        expect(await store.claimPublish(pid(1), at(HOUR + 30 * MINUTE + 1), 1)).toEqual({
          status: "claimed",
        });
      });

      it("goes with the project: a deleted project, and an owner who is deleted, leave no request behind", async () => {
        await store.claimPublish(pid(1), at(0), 1);
        await store.claimPublish(pid(2), at(0), 1);
        expect(await store.deleteProject(OWNER, pid(1))).toBe(true);
        await makeProject(1);
        expect(await store.claimPublish(pid(1), at(1), 1)).toEqual({ status: "claimed" });
        expect(await store.applyUserDeleted("evt_1", "u2", at(2 * MINUTE))).toBe("applied");
        await makeProject(2, "u2");
        expect(await store.claimPublish(pid(2), at(3 * MINUTE), 1)).toEqual({ status: "claimed" });
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("takedowns", () => {
      beforeEach(async () => {
        await makeProject(1);
        await store.putPublication(aPublication("page"));
      });

      const takedown = (over: Partial<{ slug: string; at: string; reason: string }> = {}) => ({
        handle: "handle-a",
        slug: "page",
        bySub: "admin",
        reason: "spam",
        at: at(DAY),
        ...over,
      });

      it("removes the publication and records who, why and when, answering what was removed", async () => {
        expect(await store.takeDown(takedown())).toEqual(aPublication("page"));
        expect(await store.publication("handle-a", "page")).toBeUndefined();
        expect(await store.publicationsOf(pid(1))).toEqual([]);
        // The record keeps the project the page was removed from: it is that project's notice.
        expect(await store.takedownsOf("handle-a")).toEqual([{ ...takedown(), projectId: pid(1) }]);
      });

      it("keeps, with each takedown, the project its publication belonged to, whoever holds the handle later", async () => {
        await makeProject(2, "u2");
        await store.putPublication(aPublication("other", { projectId: pid(2) }));
        await store.takeDown(takedown({ at: at(DAY) }));
        await store.takeDown(takedown({ slug: "other", at: at(2 * DAY) }));
        expect((await store.takedownsOf("handle-a")).map((t) => [t.slug, t.projectId])).toEqual([
          ["other", pid(2)],
          ["page", pid(1)],
        ]);
        // The project and the person may go; the record of the removal stays with the same project.
        await store.deleteProject(OWNER, pid(1));
        expect((await store.takedownsOf("handle-a")).map((t) => t.projectId)).toEqual([
          pid(2),
          pid(1),
        ]);
      });

      it("records nothing when there is no publication at the address", async () => {
        expect(await store.takeDown(takedown({ slug: "other" }))).toBeUndefined();
        expect(await store.takeDown({ ...takedown(), handle: "handle-b" })).toBeUndefined();
        expect(await store.takedownsOf("handle-a")).toEqual([]);
        expect(await store.takedownsOf("handle-b")).toEqual([]);
        expect(await store.publication("handle-a", "page")).toBeDefined();
        // Once taken down, a second takedown of the same address has nothing to take.
        await store.takeDown(takedown());
        expect(await store.takeDown(takedown({ at: at(2 * DAY) }))).toBeUndefined();
        expect(await store.takedownsOf("handle-a")).toHaveLength(1);
      });

      it("lists a handle's takedowns, the latest first, and only that handle's", async () => {
        await store.takeDown(takedown());
        await store.putPublication(aPublication("page", { publishedAt: at(2 * DAY) }));
        await store.takeDown(takedown({ at: at(3 * DAY), reason: "again" }));
        await store.putPublication(aPublication("other"));
        await store.takeDown(takedown({ slug: "other", at: at(2 * DAY) }));
        expect((await store.takedownsOf("handle-a")).map((t) => [t.slug, t.reason])).toEqual([
          ["page", "again"],
          ["other", "spam"],
          ["page", "spam"],
        ]);
        expect(await store.takedownsOf("handle-b")).toEqual([]);
      });

      it("keeps the text of the reason as given", async () => {
        const reason = "Robert'); DROP TABLE takedowns;-- <b>bold</b> \n ñ 🌊";
        await store.takeDown(takedown({ reason }));
        expect((await store.takedownsOf("handle-a"))[0]?.reason).toBe(reason);
      });
    });

    // ---------------------------------------------------------------------------------------

    describe("deleting a project, and a person", () => {
      /** Project 1 of `owner`, shared and published, and project 2 of `u2`, shared with `owner`. */
      const shared = async () => {
        await person(OWNER, { email: "Owner@Example.com" });
        await person("u1");
        await person("u2");
        await makeProject(1);
        await makeProject(2, "u2");
        await join("u1", "editor", pid(1));
        await join(OWNER, "viewer", pid(2));
        await invite({ email: "pending@example.com" });
        await invite({ email: "owner@example.com", projectId: pid(2) });
        await invite({ email: "bystander@example.com", projectId: pid(2) });
        await store.setHandle(OWNER, "handle-a");
        await store.putPublication(aPublication("page"));
        await store.putPublication(aPublication("gone"));
        await store.takeDown({
          handle: "handle-a",
          slug: "gone",
          bySub: "admin",
          reason: "x",
          at: at(DAY),
        });
      };

      it("takes the project's members, invitations and publications with it, and only that project's", async () => {
        await shared();
        await store.putPublication(aPublication("page", { projectId: pid(2), handle: "handle-b" }));
        expect(await store.deleteProject("u2", pid(1))).toBe(false);
        expect(await store.deleteProject(OWNER, pid(1))).toBe(true);
        expect(await store.members(pid(1))).toEqual([]);
        expect(await store.memberRole(pid(1), "u1")).toBeUndefined();
        expect(await store.pendingInvitations(pid(1), at(HOUR))).toEqual([]);
        expect(await store.publicationsOf(pid(1))).toEqual([]);
        expect(await store.publication("handle-a", "page")).toBeUndefined();
        expect(await store.listProjects("u1")).toEqual([]);
        // The other project is as it was.
        expect((await store.members(pid(2))).map((m) => m.sub)).toEqual([OWNER]);
        expect(await store.pendingInvitations(pid(2), at(HOUR))).toHaveLength(2);
        expect(await store.publicationsOf(pid(2))).toHaveLength(1);
      });

      it("leaves a project's sharing alone when someone else asks to delete it", async () => {
        await shared();
        expect(await store.deleteProject("u1", pid(1))).toBe(false);
        expect((await store.members(pid(1))).map((m) => m.sub)).toEqual(["u1"]);
        expect(await store.pendingInvitations(pid(1), at(HOUR))).toHaveLength(1);
        expect(await store.publicationsOf(pid(1))).toHaveLength(1);
      });

      it("removes a person's memberships and leaves the projects they were in, as a member's deletion", async () => {
        await shared();
        expect(await store.applyUserDeleted("evt_1", "u1", at(2 * DAY))).toBe("applied");
        expect(await store.projectById(pid(1))).toBeDefined();
        expect(await store.members(pid(1))).toEqual([]);
        expect(await store.memberRole(pid(1), "u1")).toBeUndefined();
        expect(await store.listProjects("u1")).toEqual([]);
        // Nothing else of the project went.
        expect(await store.pendingInvitations(pid(1), at(HOUR))).toHaveLength(1);
        expect(await store.publicationsOf(pid(1))).toHaveLength(1);
      });

      it("removes an owner's projects with their members, invitations and publications, and the members' lists forget them", async () => {
        await shared();
        expect(await store.listProjects("u1")).toHaveLength(1);
        expect(await store.publicationsOwnedBy(OWNER)).toHaveLength(1);
        expect(await store.applyUserDeleted("evt_1", OWNER, at(2 * DAY))).toBe("applied");
        expect(await store.projectById(pid(1))).toBeUndefined();
        expect(await store.listProjects("u1")).toEqual([]);
        expect(await store.members(pid(1))).toEqual([]);
        expect(await store.pendingInvitations(pid(1), at(HOUR))).toEqual([]);
        expect(await store.publicationsOf(pid(1))).toEqual([]);
        expect(await store.publication("handle-a", "page")).toBeUndefined();
        expect(await store.publicationsOwnedBy(OWNER)).toEqual([]);
        // Their own membership of someone else's project went too, and the project stays.
        expect(await store.projectById(pid(2))).toBeDefined();
        expect(await store.members(pid(2))).toEqual([]);
      });

      it("removes the invitations that address the person's verified email, in any case, and leaves everyone else's", async () => {
        await shared();
        await store.applyUserDeleted("evt_1", OWNER, at(2 * DAY));
        // The owner's row said Owner@Example.com, verified: the invitation made for owner@example.com goes.
        expect((await store.pendingInvitations(pid(2), at(HOUR))).map((i) => i.email)).toEqual([
          "bystander@example.com",
        ]);
      });

      it("leaves the invitations for an email that was not verified", async () => {
        await person("u3", { email: "u3@example.com", emailVerified: false });
        await makeProject(1, "u2");
        const made = await invite({ email: "u3@example.com" });
        await store.applyUserDeleted("evt_1", "u3", at(DAY));
        expect(await store.pendingInvitationByToken(made.token, at(HOUR))).toEqual(made);
      });

      it("removes nothing of sharing for a person who has none, or who has no row", async () => {
        await shared();
        expect(await store.applyUserDeleted("evt_1", "ghost", at(DAY))).toBe("applied");
        expect(await store.members(pid(1))).toHaveLength(1);
        expect(await store.pendingInvitations(pid(1), at(HOUR))).toHaveLength(1);
        expect(await store.pendingInvitations(pid(2), at(HOUR))).toHaveLength(2);
        expect(await store.publicationsOf(pid(1))).toHaveLength(1);
      });

      it("keeps the takedowns, which are the service's record, and frees the handle for someone else", async () => {
        await shared();
        await store.applyUserDeleted("evt_1", OWNER, at(2 * DAY));
        expect(await store.takedownsOf("handle-a")).toHaveLength(1);
        await person("u4");
        expect(await store.setHandle("u4", "handle-a")).toBe("set");
      });

      it("treats a repeat of the event as nothing, and leaves a person who came back their sharing", async () => {
        await shared();
        await store.applyUserDeleted("evt_1", "u1", at(DAY));
        await person("u1");
        await join("u1", "viewer", pid(1));
        expect(await store.applyUserDeleted("evt_1", "u1", at(2 * DAY))).toBe("duplicate");
        expect(await store.memberRole(pid(1), "u1")).toBe("viewer");
      });
    });
  });
}
