// The part of the CloudStore contract that belongs to administration (change
// administrators-and-permissions): the administrators, the invitations to become one (the limit,
// seven days, acceptance by the addressed email, decline and revocation), the log appended with each
// act and only with it, the lookup of a person by email, and what a deletion removes. Run by
// `runStoreConformance` (conformance.ts) over every implementation.

import { beforeEach, describe, expect, it } from "vitest";
import { adminInvitationExpiresAt } from "../../src/store/retention.js";
import type {
  AdminAction,
  AdminInvitation,
  AdminLogEntry,
  CloudStore,
} from "../../src/store/types.js";
import { DAY, HOUR, MINUTE, at, present, sha } from "./fixtures.js";

const OWNER = "owner";

/** The `n`th invitation, by the owner, to `guest<n>@example.com`, made `n` minutes in. */
const anInvitation = (n: number, over: Partial<AdminInvitation> = {}): AdminInvitation => {
  const createdAt = over.createdAt ?? at(n * MINUTE);
  return {
    id: sha(`admin-invitation/${n}`).slice(0, 32),
    email: `guest${n}@example.com`,
    invitedBy: OWNER,
    createdAt,
    expiresAt: adminInvitationExpiresAt(createdAt),
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
    ...over,
  };
};

let logged = 0;
/** A new log entry of `action` by `by` at `when`. */
const entry = (action: AdminAction, when: string, by = OWNER, target: string | null = null) =>
  ({
    id: sha(`admin-log/${logged++}`).slice(0, 32),
    at: when,
    bySub: by,
    action,
    targetSub: target,
    targetEmail: null,
    detail: "",
  }) satisfies AdminLogEntry;

export function defineAdministrationConformance(get: () => CloudStore): void {
  describe("administration", () => {
    let store: CloudStore;

    beforeEach(() => {
      store = get();
    });

    const actions = async () => (await store.adminLog(50)).map((e) => e.action);

    /** Invites `guest<n>@example.com` and has `sub` accept it at `when`. */
    const admit = async (n: number, sub: string, when = at(HOUR)) => {
      const invitation = anInvitation(n);
      expect(
        await store.createAdminInvitation(invitation, 10, entry("invite", invitation.createdAt)),
      ).toBe("created");
      expect(
        await store.acceptAdminInvitation(
          invitation.id,
          sub,
          invitation.email,
          when,
          20,
          entry("accept", when, sub),
        ),
      ).toBe("accepted");
      return invitation;
    };

    describe("administrators", () => {
      it("starts with none, and an accepted invitation makes one with its inviter and time", async () => {
        expect(await store.administrators()).toEqual([]);
        expect(await store.administrator("u2")).toBeUndefined();
        await admit(1, "u2");
        expect(await store.administrator("u2")).toEqual({
          sub: "u2",
          invitedBy: OWNER,
          since: at(HOUR),
        });
        expect(await store.administrators()).toEqual([
          { sub: "u2", invitedBy: OWNER, since: at(HOUR) },
        ]);
      });

      it("lists the earliest to accept first", async () => {
        await admit(1, "u3", at(2 * HOUR));
        await admit(2, "u2", at(HOUR));
        expect((await store.administrators()).map((a) => a.sub)).toEqual(["u2", "u3"]);
      });

      it("removes one with its log entry, and logs nothing for nobody", async () => {
        await admit(1, "u2");
        expect(await store.removeAdministrator("u2", entry("remove", at(DAY), OWNER, "u2"))).toBe(
          true,
        );
        expect(await store.administrator("u2")).toBeUndefined();
        expect(await store.removeAdministrator("u2", entry("remove", at(DAY), OWNER, "u2"))).toBe(
          false,
        );
        expect(await actions()).toEqual(["remove", "accept", "invite"]);
      });
    });

    describe("invitations to administer", () => {
      it("records an invitation pending for seven days, and its log entry", async () => {
        const invitation = anInvitation(1);
        expect(
          await store.createAdminInvitation(invitation, 10, entry("invite", invitation.createdAt)),
        ).toBe("created");
        expect(await store.adminInvitations(at(2 * MINUTE))).toEqual([invitation]);
        expect(await store.adminInvitationFor("guest1@example.com", at(2 * MINUTE))).toEqual(
          invitation,
        );
        expect(await store.adminInvitations(invitation.expiresAt)).toEqual([]);
        expect(
          await store.adminInvitationFor("guest1@example.com", invitation.expiresAt),
        ).toBeUndefined();
        expect(await actions()).toEqual(["invite"]);
      });

      it("refuses past the limit of pending ones, logging nothing, and counts no expired one", async () => {
        for (const n of [1, 2]) {
          expect(
            await store.createAdminInvitation(anInvitation(n), 2, entry("invite", at(n * MINUTE))),
          ).toBe("created");
        }
        expect(
          await store.createAdminInvitation(anInvitation(3), 2, entry("invite", at(3 * MINUTE))),
        ).toBe("limit");
        expect(await actions()).toEqual(["invite", "invite"]);
        const later = anInvitation(4, { createdAt: at(8 * DAY) });
        expect(await store.createAdminInvitation(later, 2, entry("invite", later.createdAt))).toBe(
          "created",
        );
      });

      it("lists the pending ones the earliest first, and none revoked, declined or accepted", async () => {
        for (const n of [1, 2, 3, 4]) {
          await store.createAdminInvitation(anInvitation(n), 10, entry("invite", at(n * MINUTE)));
        }
        const now = at(HOUR);
        expect(
          await store.revokeAdminInvitation(
            anInvitation(1).id,
            now,
            entry("revoke-invitation", now),
          ),
        ).toBe(true);
        expect(
          await store.declineAdminInvitation(
            anInvitation(2).id,
            "guest2@example.com",
            now,
            entry("decline", now, "u2"),
          ),
        ).toBe(true);
        expect(
          await store.acceptAdminInvitation(
            anInvitation(3).id,
            "u3",
            "guest3@example.com",
            now,
            20,
            entry("accept", now, "u3"),
          ),
        ).toBe("accepted");
        expect((await store.adminInvitations(now)).map((i) => i.email)).toEqual([
          "guest4@example.com",
        ]);
      });

      it("accepts only for the addressed email, once, and while it has not expired", async () => {
        const invitation = anInvitation(1);
        await store.createAdminInvitation(invitation, 10, entry("invite", invitation.createdAt));
        const now = at(HOUR);
        expect(
          await store.acceptAdminInvitation(
            invitation.id,
            "u9",
            "other@example.com",
            now,
            20,
            entry("accept", now, "u9"),
          ),
        ).toBe("none");
        expect(
          await store.acceptAdminInvitation(
            invitation.id,
            "u2",
            invitation.email,
            invitation.expiresAt,
            20,
            entry("accept", invitation.expiresAt, "u2"),
          ),
        ).toBe("none");
        expect(
          await store.acceptAdminInvitation(
            invitation.id,
            "u2",
            invitation.email,
            now,
            20,
            entry("accept", now, "u2"),
          ),
        ).toBe("accepted");
        expect(
          await store.acceptAdminInvitation(
            invitation.id,
            "u2",
            invitation.email,
            now,
            20,
            entry("accept", now, "u2"),
          ),
        ).toBe("none");
        expect(await actions()).toEqual(["accept", "invite"]);
      });

      it("answers the limit, writing nothing, when the administrators are as many as allowed", async () => {
        await admit(1, "u2");
        const invitation = anInvitation(2);
        await store.createAdminInvitation(invitation, 10, entry("invite", invitation.createdAt));
        const now = at(2 * HOUR);
        expect(
          await store.acceptAdminInvitation(
            invitation.id,
            "u3",
            invitation.email,
            now,
            1,
            entry("accept", now, "u3"),
          ),
        ).toBe("limit");
        expect(await store.administrator("u3")).toBeUndefined();
        expect((await store.adminInvitations(now)).map((i) => i.id)).toEqual([invitation.id]);
      });

      it("declines only for the addressed email, and revokes only a pending one", async () => {
        const invitation = anInvitation(1);
        await store.createAdminInvitation(invitation, 10, entry("invite", invitation.createdAt));
        const now = at(HOUR);
        expect(
          await store.declineAdminInvitation(
            invitation.id,
            "other@example.com",
            now,
            entry("decline", now),
          ),
        ).toBe(false);
        expect(
          await store.declineAdminInvitation(
            invitation.id,
            invitation.email,
            now,
            entry("decline", now),
          ),
        ).toBe(true);
        expect(
          await store.revokeAdminInvitation(invitation.id, now, entry("revoke-invitation", now)),
        ).toBe(false);
        expect(await actions()).toEqual(["decline", "invite"]);
      });
    });

    describe("the log", () => {
      it("is appended with a grant and a takedown only when they happen", async () => {
        await store.upsertUser(
          { sub: "u1", name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
          at(0),
        );
        expect(
          await store.setUnbrandedExports(
            "u1",
            true,
            OWNER,
            at(MINUTE),
            entry("grant", at(MINUTE), OWNER, "u1"),
          ),
        ).toBe("set");
        expect(
          await store.setUnbrandedExports(
            "nobody",
            true,
            OWNER,
            at(MINUTE),
            entry("grant", at(MINUTE), OWNER, "nobody"),
          ),
        ).toBe("missing");
        expect(
          await store.takeDown(
            { handle: "nobody-here", slug: "page", bySub: OWNER, reason: "", at: at(HOUR) },
            entry("takedown", at(HOUR)),
          ),
        ).toBeUndefined();
        const log = await store.adminLog(50);
        expect(log.map((e) => [e.action, e.targetSub])).toEqual([["grant", "u1"]]);
      });

      it("answers the newest first, at most the limit, and keeps a year", async () => {
        for (const n of [1, 2, 3]) {
          await store.createAdminInvitation(anInvitation(n), 10, entry("invite", at(n * DAY)));
        }
        expect((await store.adminLog(2)).map((e) => e.at)).toEqual([at(3 * DAY), at(2 * DAY)]);
        await store.sweep(at(DAY + 365 * DAY));
        expect((await store.adminLog(50)).map((e) => e.at)).toEqual([
          at(3 * DAY),
          at(2 * DAY),
          at(DAY),
        ]);
        await store.sweep(at(2 * DAY + 365 * DAY));
        expect((await store.adminLog(50)).map((e) => e.at)).toEqual([at(3 * DAY), at(2 * DAY)]);
      });
    });

    describe("a person by their email", () => {
      it("finds the verified rows, in any case, and never an unverified one", async () => {
        const profile = (sub: string, email: string, emailVerified = true) => ({
          sub,
          name: sub,
          picture: "",
          email,
          emailVerified,
        });
        await store.upsertUser(profile("u1", "Ana@Example.com"), at(0));
        await store.upsertUser(profile("u2", "shared@example.com"), at(MINUTE));
        await store.upsertUser(profile("u3", "shared@example.com"), at(2 * MINUTE));
        await store.upsertUser(profile("u4", "ben@example.com", false), at(0));
        expect((await store.usersByEmail("ana@example.com")).map((u) => u.sub)).toEqual(["u1"]);
        expect((await store.usersByEmail("shared@example.com")).map((u) => u.sub)).toEqual([
          "u2",
          "u3",
        ]);
        expect(await store.usersByEmail("ben@example.com")).toEqual([]);
        expect(await store.usersByEmail("nobody@example.com")).toEqual([]);
      });
    });

    describe("a deletion", () => {
      it("removes the person's administrator row and the open invitations they made, and keeps the log", async () => {
        await admit(1, "u2");
        await store.createAdminInvitation(
          anInvitation(2, { invitedBy: "u2" }),
          10,
          entry("invite", at(2 * MINUTE), "u2"),
        );
        await store.createAdminInvitation(anInvitation(3), 10, entry("invite", at(3 * MINUTE)));
        expect(await store.applyUserDeleted("evt_admin", "u2", at(DAY))).toBe("applied");
        expect(await store.administrator("u2")).toBeUndefined();
        expect((await store.adminInvitations(at(DAY))).map((i) => i.email)).toEqual([
          "guest3@example.com",
        ]);
        expect(present(await store.adminLog(50)).length).toBe(4);
      });
    });
  });
}
