// The sharing routes (`project-sharing`: "Link access and members", "Invitations", "The cascade";
// `cloud-accounts`: "Invitations resolved at sign-in"), through the handler with the in-memory store,
// rooms and bucket: the state of a project's sharing as each kind of person sees it, the link level,
// invitations and their links, accepting, members, leaving, the limit, the thirty days, the email
// resolved at sign-in, and the cascade of a deleted account. Who may reach a route at all, at every
// link level, is sharing-access.test.ts.

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_MEMBERS } from "../src/store/types.js";
import { publishedKey } from "../src/keys.js";
import { jsonOf, type Harness } from "./support/index.js";
import {
  EDITOR,
  NOBODY,
  OWNER,
  STRANGER,
  VIEWER,
  emailOf,
  tokenOf,
  world,
  type InvitationBody,
  type World,
} from "./support/sharing.js";
import { DAY, HOUR } from "./support/projects.js";
import { addToken, bearer } from "./support/who.js";

const T = "2026-10-14T12:00:00.000Z";
const ORIGIN = "https://diagrams.meltemi.dev";
const JSON_TYPE = { "Content-Type": "application/json" };

afterEach(() => {
  vi.restoreAllMocks();
});

async function codeOf(response: Response): Promise<string | undefined> {
  return (await jsonOf<{ code?: string }>(response.clone())).code;
}

/** What the owner sees of a project's sharing. */
interface OwnersState {
  linkAccess: string;
  role: string;
  members: {
    sub: string;
    name: string;
    picture: string;
    email: string;
    role: string;
    added_at: string;
  }[];
  invitations: InvitationBody[];
}

const stateOf = async (w: World, who = OWNER): Promise<OwnersState> =>
  jsonOf<OwnersState>(await w.ask(who, "GET", w.url("/sharing")));

/** The pending invitations the owner lists. */
const pendingOf = async (w: World, id = w.id): Promise<InvitationBody[]> =>
  (
    await jsonOf<{ invitations: InvitationBody[] }>(
      await w.ask(OWNER, "GET", w.url("/invitations", id)),
    )
  ).invitations;

const accept = (w: World, who: string, link: string) =>
  w.ask(who, "POST", `/api/invitations/${tokenOf(link)}/accept`);

/** Every string value of a JSON answer, flattened: what a person who reads it could copy. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

// ---------------------------------------------------------------------------------------------

describe("GET /api/projects/:id/sharing", () => {
  it("gives the owner the whole state: the link level, the members with their emails and the pending invitations with their links", async () => {
    const w = await world("view");
    const pending = await w.invite("ana@example.com", "editor");

    const response = await w.ask(OWNER, "GET", w.url("/sharing"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({
      linkAccess: "view",
      role: "owner",
      members: [
        {
          sub: EDITOR,
          name: EDITOR,
          picture: "",
          email: emailOf(EDITOR),
          role: "editor",
          added_at: expect.any(String),
        },
        {
          sub: VIEWER,
          name: VIEWER,
          picture: "",
          email: emailOf(VIEWER),
          role: "viewer",
          added_at: expect.any(String),
        },
      ],
      invitations: [pending],
    });
  });

  it("gives a member the link level, their role and the members with names and pictures, and never an email, an invitation or a token", async () => {
    const w = await world("private");
    const pending = await w.invite("ana@example.com", "editor");

    for (const [sub, role] of [
      [EDITOR, "editor"],
      [VIEWER, "viewer"],
    ] as const) {
      const response = await w.ask(sub, "GET", w.url("/sharing"));
      expect(response.status, sub).toBe(200);
      const body = await jsonOf<Record<string, unknown>>(response);
      expect(body, sub).toEqual({
        linkAccess: "private",
        role,
        members: [
          { sub: EDITOR, name: EDITOR, picture: "", role: "editor" },
          { sub: VIEWER, name: VIEWER, picture: "", role: "viewer" },
        ],
      });
      const text = JSON.stringify(body);
      for (const secret of [
        emailOf(EDITOR),
        emailOf(VIEWER),
        "ana@example.com",
        tokenOf(pending.link),
        pending.id,
        "@",
      ]) {
        expect(text, `${sub} must not see ${secret}`).not.toContain(secret);
      }
    }
  });

  it("gives anyone else the link admits only the link level and their role, anonymous or not, with nothing of the people", async () => {
    for (const link of ["view", "edit"] as const) {
      const w = await world(link);
      await w.invite("ana@example.com", "viewer");
      const stranger = await w.ask(STRANGER, "GET", w.url("/sharing"));
      expect(await jsonOf(stranger)).toEqual({
        linkAccess: link,
        role: link === "edit" ? "editor" : "viewer",
      });
      const nobody = await w.ask(NOBODY, "GET", w.url("/sharing"));
      expect(await jsonOf(nobody)).toEqual({ linkAccess: link, role: "viewer" });
    }
  });

  it("keeps a viewer's answer to the link level and the role, even as the viewer holds the link of an invitation they cannot see", async () => {
    // A `view` link never yields an invitation from which an editor could be made.
    const w = await world("view");
    const pending = await w.invite("friend@example.com", "editor");
    for (const who of [VIEWER, STRANGER, NOBODY]) {
      const sharing = await w.ask(who, "GET", w.url("/sharing"));
      expect(strings(await jsonOf(sharing)).join(" "), who).not.toContain(tokenOf(pending.link));
      const invitations = await w.ask(who, "GET", w.url("/invitations"));
      expect([invitations.status, await codeOf(invitations)], who).toEqual([403, "access.denied"]);
      expect(await invitations.clone().text(), who).not.toContain(tokenOf(pending.link));
    }
  });
});

describe("PATCH /api/projects/:id/sharing", () => {
  it("sets the link level, answers the whole state, and leaves the project's own time as it was", async () => {
    const w = await world("private");
    const before = (await w.h.store.projectById(w.id))?.updatedAt;
    for (const level of ["view", "edit", "private"]) {
      const response = await w.ask(OWNER, "PATCH", w.url("/sharing"), { linkAccess: level });
      expect(response.status, level).toBe(200);
      expect(await jsonOf(response), level).toMatchObject({
        linkAccess: level,
        role: "owner",
        members: expect.any(Array),
        invitations: [],
      });
      expect((await w.h.store.projectById(w.id))?.linkAccess).toBe(level);
    }
    expect((await w.h.store.projectById(w.id))?.updatedAt).toBe(before);
  });

  it("refuses a level that is not one, a body that is not an object and one with no level, changing nothing", async () => {
    const w = await world("view");
    for (const body of [
      { linkAccess: "public" },
      { linkAccess: "View" },
      { linkAccess: 1 },
      { linkAccess: null },
      {},
      [],
      "view",
      { link: "edit" },
    ]) {
      const response = await w.ask(OWNER, "PATCH", w.url("/sharing"), body);
      expect([response.status, await codeOf(response)], JSON.stringify(body)).toEqual([
        400,
        "request.invalid",
      ]);
    }
    const broken = await w.ask(OWNER, "PATCH", w.url("/sharing"), "{not json", JSON_TYPE);
    expect(broken.status).toBe(400);
    expect((await w.h.store.projectById(w.id))?.linkAccess).toBe("view");
  });

  it("is the owner's: an editor and a viewer get 403, and nothing changes", async () => {
    const w = await world("view");
    for (const sub of [EDITOR, VIEWER]) {
      const response = await w.ask(sub, "PATCH", w.url("/sharing"), { linkAccess: "edit" });
      expect([response.status, await codeOf(response)], sub).toEqual([403, "access.denied"]);
    }
    expect((await w.h.store.projectById(w.id))?.linkAccess).toBe("view");
  });

  it("takes effect at once for the people who hold the link", async () => {
    const w = await world("private");
    expect((await w.ask(STRANGER, "GET", w.url("/files"))).status).toBe(404);
    await w.setLink("edit");
    expect((await w.ask(STRANGER, "PUT", w.url("/files"), { files: { "s.md": "x" } })).status).toBe(
      200,
    );
    await w.setLink("view");
    expect((await w.ask(STRANGER, "PUT", w.url("/files"), { files: { "s.md": "y" } })).status).toBe(
      403,
    );
    expect((await w.ask(STRANGER, "GET", w.url("/files"))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------

describe("POST /api/projects/:id/members", () => {
  it("records an invitation and answers it with its link, which carries the token, and sends no mail", async () => {
    const w = await world("private");
    const fetched = vi.spyOn(globalThis, "fetch");
    const calls = w.h.identity.calls.length;

    const response = await w.ask(OWNER, "POST", w.url("/members"), {
      email: "ana@example.com",
      role: "editor",
    });

    expect(response.status).toBe(201);
    const invitation = await jsonOf<InvitationBody>(response);
    expect(invitation).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{32}$/),
      email: "ana@example.com",
      role: "editor",
      created_at: T,
      expires_at: "2026-11-13T12:00:00.000Z",
      link: expect.stringMatching(new RegExp(`^${ORIGIN}/p/${w.id}\\?invite=[0-9a-f]{32}$`)),
    });
    expect(tokenOf(invitation.link)).not.toBe(invitation.id);
    // No mail: nothing left the service.
    expect(fetched).not.toHaveBeenCalled();
    expect(w.h.identity.calls.length).toBe(calls);
    // The row is pending, with the token as the link has it.
    expect((await w.h.store.pendingInvitations(w.id, T))[0]).toMatchObject({
      email: "ana@example.com",
      role: "editor",
      createdBy: OWNER,
      token: tokenOf(invitation.link),
    });
  });

  it("lists the invitation again, with the same link: the owner copies it from the list", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    expect(await pendingOf(w)).toEqual([made]);
    expect((await stateOf(w)).invitations).toEqual([made]);
  });

  it("normalises the address: trimmed, and in lower case, the case invitations are matched in", async () => {
    const w = await world("private");
    const made = await w.invite("  Ana.Garcia+Plan@Example.COM \n", "viewer");
    expect(made.email).toBe("ana.garcia+plan@example.com");
  });

  it.each([
    ["no email", { role: "viewer" }],
    ["an email that is not text", { email: 5, role: "viewer" }],
    ["an empty email", { email: "", role: "viewer" }],
    ["an email with nothing after the @", { email: "ana@", role: "viewer" }],
    ["an email with nothing before the @", { email: "@example.com", role: "viewer" }],
    ["no @", { email: "ana", role: "viewer" }],
    ["no domain dot", { email: "ana@example", role: "viewer" }],
    ["two @", { email: "a@b@example.com", role: "viewer" }],
    ["a space inside", { email: "an a@example.com", role: "viewer" }],
    ["a control character", { email: "ana\u0007@example.com", role: "viewer" }],
    ["an address of 255 characters", { email: `${"a".repeat(245)}@example.com`, role: "viewer" }],
    ["no role", { email: "ana@example.com" }],
    ["a role that is not one", { email: "ana@example.com", role: "owner" }],
    ["a role in another case", { email: "ana@example.com", role: "Editor" }],
    ["a role that is not text", { email: "ana@example.com", role: 1 }],
  ])("refuses %s with 400 request.invalid and records nothing", async (_label, body) => {
    const w = await world("private");
    const response = await w.ask(OWNER, "POST", w.url("/members"), body);
    expect([response.status, await codeOf(response)]).toEqual([400, "request.invalid"]);
    expect(await pendingOf(w)).toEqual([]);
  });

  it("refuses a body that is not an object, not JSON or too long, and records nothing", async () => {
    const w = await world("private");
    for (const body of [[], "text", 5, null]) {
      const response = await w.ask(
        OWNER,
        "POST",
        w.url("/members"),
        JSON.stringify(body),
        JSON_TYPE,
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect((await w.ask(OWNER, "POST", w.url("/members"), "{nope", JSON_TYPE)).status).toBe(400);
    const long = JSON.stringify({
      email: "ana@example.com",
      role: "viewer",
      pad: "x".repeat(9000),
    });
    expect((await w.ask(OWNER, "POST", w.url("/members"), long, JSON_TYPE)).status).toBe(400);
    expect(await pendingOf(w)).toEqual([]);
  });

  it("does not let the owner invite themselves, by any spelling of their address", async () => {
    const w = await world("private");
    for (const email of [emailOf(OWNER), emailOf(OWNER).toUpperCase(), ` ${emailOf(OWNER)} `]) {
      const response = await w.ask(OWNER, "POST", w.url("/members"), { email, role: "editor" });
      expect([response.status, await codeOf(response)], email).toEqual([400, "request.invalid"]);
    }
    expect(await pendingOf(w)).toEqual([]);
  });

  it("answers the same invitation, with its role changed, when the email already has a pending one", async () => {
    const w = await world("private");
    const first = await w.invite("ana@example.com", "viewer");
    const again = await w.ask(OWNER, "POST", w.url("/members"), {
      email: "ANA@example.com",
      role: "editor",
    });
    expect(again.status).toBe(200);
    expect(await jsonOf(again)).toEqual({ ...first, role: "editor" });
    expect(await pendingOf(w)).toEqual([{ ...first, role: "editor" }]);
    // The role that was asked for the second time is what it is when the person arrives.
    await w.ask(OWNER, "POST", w.url("/members"), { email: "ana@example.com", role: "viewer" });
    expect((await pendingOf(w))[0]?.role).toBe("viewer");
  });

  it("lets the owner invite the email of someone who is already a member: the invitation never lowers them, and raises them", async () => {
    const w = await world("private");
    // The editor invited again as a viewer: still an editor once the invitation is resolved.
    await w.invite(emailOf(EDITOR), "viewer");
    await w.ask(EDITOR, "GET", "/api/session");
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");
    // The viewer invited as an editor: raised.
    await w.invite(emailOf(VIEWER), "editor");
    await w.ask(VIEWER, "GET", "/api/session");
    expect(await w.h.store.memberRole(w.id, VIEWER)).toBe("editor");
    expect(await pendingOf(w)).toEqual([]);
  });

  it("is the owner's alone: an editor, a viewer, a stranger on an edit link and nobody are refused, and nothing is recorded", async () => {
    const w = await world("edit");
    for (const who of [EDITOR, VIEWER, STRANGER, NOBODY]) {
      const response = await w.ask(who, "POST", w.url("/members"), {
        email: "ana@example.com",
        role: "editor",
      });
      expect([response.status, await codeOf(response)], who).toEqual([403, "access.denied"]);
    }
    expect(await pendingOf(w)).toEqual([]);
  });

  it("is refused for a cookie from another page, before the route runs", async () => {
    const w = await world("private");
    const { cookie } = await w.h.signedIn({ sub: OWNER });
    const response = await w.h.request(w.url("/members"), {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example", ...JSON_TYPE },
      body: JSON.stringify({ email: "ana@example.com", role: "editor" }),
    });
    expect([response.status, await codeOf(response)]).toEqual([403, "request.forbidden"]);
    expect(await pendingOf(w)).toEqual([]);
  });

  describe("the limit of fifty members and pending invitations", () => {
    it("allows exactly fifty, members counted, and answers 413 quota.members to the fifty-first, recording nothing", async () => {
      const w = await world("private");
      // Two members already: forty-eight invitations fill the project.
      for (let n = 1; n <= MAX_MEMBERS - 2; n++) {
        const response = await w.ask(OWNER, "POST", w.url("/members"), {
          email: `guest${n}@example.com`,
          role: "viewer",
        });
        expect(response.status, `invitation ${n}`).toBe(201);
      }
      expect(await pendingOf(w)).toHaveLength(MAX_MEMBERS - 2);

      const fifty1 = await w.ask(OWNER, "POST", w.url("/members"), {
        email: "one-too-many@example.com",
        role: "viewer",
      });

      expect([fifty1.status, await codeOf(fifty1)]).toEqual([413, "quota.members"]);
      expect(await pendingOf(w)).toHaveLength(MAX_MEMBERS - 2);
      expect((await w.h.store.members(w.id)).length + (await pendingOf(w)).length).toBe(
        MAX_MEMBERS,
      );
      expect((await pendingOf(w)).some((i) => i.email === "one-too-many@example.com")).toBe(false);
    });

    it("gives a place back when an invitation is revoked or a member leaves, and not when one is accepted", async () => {
      const w = await world("private");
      // Two members already: forty-eight invitations fill the project.
      const made: InvitationBody[] = [];
      for (let n = 1; n <= MAX_MEMBERS - 2; n++)
        made.push(await w.invite(`guest${n}@example.com`, "viewer"));
      const full = () =>
        w.ask(OWNER, "POST", w.url("/members"), { email: "late@example.com", role: "viewer" });
      expect((await full()).status).toBe(413);
      // Accepting turns a pending invitation into a member: the count does not change.
      expect((await accept(w, STRANGER, made[0]!.link)).status).toBe(200);
      expect((await full()).status).toBe(413);
      // Revoking frees one place.
      expect((await w.ask(OWNER, "DELETE", w.url(`/invitations/${made[1]!.id}`))).status).toBe(204);
      expect((await full()).status).toBe(201);
      expect((await full()).status).toBe(200); // the same address again: its own invitation, not a second place
      // A member who leaves frees one more.
      expect(
        (
          await w.ask(OWNER, "POST", w.url("/members"), {
            email: "another@example.com",
            role: "viewer",
          })
        ).status,
      ).toBe(413);
      expect((await w.ask(STRANGER, "DELETE", w.url("/members/me"))).status).toBe(204);
      expect(
        (
          await w.ask(OWNER, "POST", w.url("/members"), {
            email: "another@example.com",
            role: "viewer",
          })
        ).status,
      ).toBe(201);
    });
  });

  describe("the thirty days", () => {
    it("end an invitation: not listed, not counted against the limit and not accepted, a millisecond or a day on", async () => {
      const w = await world("private");
      const made = await w.invite("ana@example.com", "editor");
      // The last moment it is valid.
      w.h.clock.advance(30 * DAY - 1);
      expect(await pendingOf(w)).toEqual([made]);
      expect((await accept(w, STRANGER, made.link)).status).toBe(200);
      expect(await w.h.store.memberRole(w.id, STRANGER)).toBe("editor");

      const late = await w.invite("late@example.com", "viewer");
      w.h.clock.advance(30 * DAY);
      expect(await pendingOf(w)).toEqual([]);
      const expired = await accept(w, EDITOR, late.link);
      expect([expired.status, await codeOf(expired)]).toEqual([404, "invite.invalid"]);
      // And the sign-in of that address resolves nothing either.
      w.profile("u-late", { email: "late@example.com", emailVerified: true });
      await w.ask("u-late", "GET", "/api/session");
      expect(await w.h.store.memberRole(w.id, "u-late")).toBeUndefined();
    });

    it("do not count in the limit once over: an expired invitation takes no place", async () => {
      const w = await world("private");
      for (let n = 1; n <= MAX_MEMBERS - 2; n++) await w.invite(`guest${n}@example.com`, "viewer");
      expect(
        (
          await w.ask(OWNER, "POST", w.url("/members"), {
            email: "late@example.com",
            role: "viewer",
          })
        ).status,
      ).toBe(413);
      w.h.clock.advance(30 * DAY);
      expect(
        (
          await w.ask(OWNER, "POST", w.url("/members"), {
            email: "late@example.com",
            role: "viewer",
          })
        ).status,
      ).toBe(201);
    });
  });
});

// ---------------------------------------------------------------------------------------------

describe("GET /api/projects/:id/invitations", () => {
  it("lists the pending invitations of the owner with their links, the earliest first", async () => {
    const w = await world("private");
    const one = await w.invite("one@example.com", "viewer");
    w.h.clock.advance(HOUR);
    const two = await w.invite("two@example.com", "editor");
    const response = await w.ask(OWNER, "GET", w.url("/invitations"));
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ invitations: [one, two] });
  });

  it("does not list an invitation that was accepted or revoked", async () => {
    const w = await world("private");
    const accepted = await w.invite("a@example.com", "viewer");
    const revoked = await w.invite("b@example.com", "viewer");
    const kept = await w.invite("c@example.com", "viewer");
    await accept(w, STRANGER, accepted.link);
    await w.ask(OWNER, "DELETE", w.url(`/invitations/${revoked.id}`));
    expect(await pendingOf(w)).toEqual([kept]);
  });

  it("answers 403 access.denied to a viewer, an editor, a stranger and nobody, with nothing of an invitation in the body", async () => {
    const w = await world("edit");
    const made = await w.invite("ana@example.com", "editor");
    for (const who of [VIEWER, EDITOR, STRANGER, NOBODY]) {
      const response = await w.ask(who, "GET", w.url("/invitations"));
      expect([response.status, await codeOf(response)], who).toEqual([403, "access.denied"]);
      const text = await response.text();
      for (const secret of [tokenOf(made.link), made.id, "ana@example.com", "invite="]) {
        expect(text, `${who} must not see ${secret}`).not.toContain(secret);
      }
    }
  });
});

describe("DELETE /api/projects/:id/invitations/:id", () => {
  it("revokes a pending invitation: its link stops working at once, and 204 is the answer", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    const response = await w.ask(OWNER, "DELETE", w.url(`/invitations/${made.id}`));
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const used = await accept(w, STRANGER, made.link);
    expect([used.status, await codeOf(used)]).toEqual([404, "invite.invalid"]);
    expect(await pendingOf(w)).toEqual([]);
  });

  it("answers 404 not-found for an invitation that is not there, was accepted or belongs to another project", async () => {
    const w = await world("private");
    const other = await w.create(OWNER, { name: "Other" });
    const theirs = await w.invite("them@example.com", "viewer", other);
    const used = await w.invite("used@example.com", "viewer");
    await accept(w, STRANGER, used.link);
    for (const id of ["0".repeat(32), "nonsense", used.id, theirs.id]) {
      const response = await w.ask(OWNER, "DELETE", w.url(`/invitations/${id}`));
      expect([response.status, await codeOf(response)], id).toEqual([404, "not-found"]);
    }
    expect(await pendingOf(w, other)).toEqual([theirs]);
  });

  it("is the owner's alone: refused to everybody else, and the invitation stays", async () => {
    const w = await world("edit");
    const made = await w.invite("ana@example.com", "viewer");
    for (const who of [EDITOR, VIEWER, STRANGER, NOBODY]) {
      const response = await w.ask(who, "DELETE", w.url(`/invitations/${made.id}`));
      expect([response.status, await codeOf(response)], who).toEqual([403, "access.denied"]);
    }
    expect(await pendingOf(w)).toEqual([made]);
  });
});

// ---------------------------------------------------------------------------------------------

describe("POST /api/invitations/:token/accept", () => {
  it("makes the person a member with the invited role, whatever their email, and answers the project with the role they have", async () => {
    const w = await world("private");
    const made = await w.invite("somebody.else@example.com", "editor");

    const response = await accept(w, STRANGER, made.link);

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({ id: w.id, name: "Shared", role: "editor" });
    expect(await w.h.store.memberRole(w.id, STRANGER)).toBe("editor");
    // The invitation is used, and what the role allows is allowed.
    expect(await pendingOf(w)).toEqual([]);
    expect(
      (await w.ask(STRANGER, "PUT", w.url("/files"), { files: { "joined.md": "x" } })).status,
    ).toBe(200);
    const list = await jsonOf<{ projects: { id: string; role: string }[] }>(
      await w.ask(STRANGER, "GET", "/api/projects"),
    );
    expect(list.projects).toEqual([expect.objectContaining({ id: w.id, role: "editor" })]);
  });

  it("makes a viewer who cannot write and sees the member list but no email", async () => {
    const w = await world("private");
    const made = await w.invite("any@example.com", "viewer");
    await accept(w, STRANGER, made.link);
    expect(
      (await w.ask(STRANGER, "PUT", w.url("/files"), { files: { "no.md": "x" } })).status,
    ).toBe(403);
    const sharing = await jsonOf<{ role: string; members: { sub: string }[] }>(
      await w.ask(STRANGER, "GET", w.url("/sharing")),
    );
    expect(sharing.role).toBe("viewer");
    expect(sharing.members.map((m) => m.sub)).toContain(STRANGER);
  });

  it("works once: the same link used again, by the same person or another, is 404 invite.invalid", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    expect((await accept(w, STRANGER, made.link)).status).toBe(200);
    for (const who of [STRANGER, "u-other"]) {
      const response = await accept(w, who, made.link);
      expect([response.status, await codeOf(response)], who).toEqual([404, "invite.invalid"]);
    }
    expect(await w.h.store.memberRole(w.id, "u-other")).toBeUndefined();
  });

  it("answers the same 404 invite.invalid for a token nobody has, one of the wrong shape and one that expired, saying nothing more", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    w.h.clock.advance(31 * DAY);
    const answers: unknown[] = [];
    for (const token of [
      tokenOf(made.link),
      "f".repeat(32),
      "F".repeat(32),
      "short",
      "0".repeat(33),
      "%00",
      "..%2f..",
      made.id.toUpperCase(),
    ]) {
      const response = await w.ask(
        STRANGER,
        "POST",
        `/api/invitations/${encodeURIComponent(token)}/accept`,
      );
      expect([response.status, await codeOf(response)], token).toEqual([404, "invite.invalid"]);
      answers.push(await jsonOf(response));
    }
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(await w.h.store.memberRole(w.id, STRANGER)).toBeUndefined();
  });

  it("is 401 auth.required for nobody, and the invitation stays pending for the person who signs in", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    const response = await w.ask(NOBODY, "POST", `/api/invitations/${tokenOf(made.link)}/accept`);
    expect([response.status, await codeOf(response)]).toEqual([401, "auth.required"]);
    expect(await pendingOf(w)).toEqual([made]);
  });

  it("answers the owner opening their own link with their project, and leaves the invitation pending", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "editor");
    const response = await accept(w, OWNER, made.link);
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({ id: w.id, role: "owner" });
    expect(await w.h.store.memberRole(w.id, OWNER)).toBeUndefined();
    expect(await pendingOf(w)).toEqual([made]);
  });

  it("gives a member who opens another link the higher of the two roles", async () => {
    const w = await world("private");
    const up = await w.invite("up@example.com", "editor");
    const down = await w.invite("down@example.com", "viewer");
    expect(await jsonOf(await accept(w, VIEWER, up.link))).toMatchObject({ role: "editor" });
    expect(await jsonOf(await accept(w, VIEWER, down.link))).toMatchObject({ role: "editor" });
    expect(await w.h.store.memberRole(w.id, VIEWER)).toBe("editor");
  });

  it("raises the role the answer says by the project's link, as access does", async () => {
    const w = await world("edit");
    const made = await w.invite("ana@example.com", "viewer");
    expect(await jsonOf(await accept(w, STRANGER, made.link))).toMatchObject({ role: "editor" });
    expect(await w.h.store.memberRole(w.id, STRANGER)).toBe("viewer");
  });

  it("is refused for a cookie from another page, before the route runs, and the invitation stays", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    const { cookie } = await w.h.signedIn({ sub: STRANGER });
    const response = await w.h.request(`/api/invitations/${tokenOf(made.link)}/accept`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example" },
    });
    expect([response.status, await codeOf(response)]).toEqual([403, "request.forbidden"]);
    expect(await pendingOf(w)).toEqual([made]);
  });

  it("is a GET nobody can use to join: only a POST accepts", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    const { cookie } = await w.h.signedIn({ sub: STRANGER });
    const response = await w.h.request(`/api/invitations/${tokenOf(made.link)}/accept`, {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(404);
    expect(await w.h.store.memberRole(w.id, STRANGER)).toBeUndefined();
  });

  it("takes a bearer token, which needs no Origin", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    const { token } = await addToken(w.h.store, { sub: STRANGER });
    const response = await w.h.request(
      `/api/invitations/${tokenOf(made.link)}/accept`,
      bearer(token, { method: "POST" }),
    );
    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------

describe("resolving invitations at GET /api/session", () => {
  const session = (w: World, sub: string, profile: { email: string; emailVerified: boolean }) =>
    w.h
      .signedIn({ sub, email: profile.email, emailVerified: profile.emailVerified })
      .then(({ cookie }) => w.h.request("/api/session", { headers: { Cookie: cookie } }));

  it("turns a pending invitation for the verified email into a membership, and the invitation is accepted", async () => {
    const w = await world("private");
    await w.invite("ana@example.com", "editor");

    const response = await session(w, "u-ana", { email: "ana@example.com", emailVerified: true });

    expect(response.status).toBe(200);
    expect(await w.h.store.memberRole(w.id, "u-ana")).toBe("editor");
    expect(await pendingOf(w)).toEqual([]);
    expect((await stateOf(w)).members.map((m) => [m.sub, m.role])).toContainEqual([
      "u-ana",
      "editor",
    ]);
    // The person reads the project, and is an editor in it.
    const mine = await w.ask("u-ana", "GET", w.url());
    expect(await jsonOf(mine)).toMatchObject({ id: w.id, role: "editor" });
  });

  it("turns every pending invitation for the email into a membership, in every project", async () => {
    const w = await world("private");
    const second = await w.create(OWNER, { name: "Second" });
    await w.invite("ana@example.com", "editor");
    await w.invite("ana@example.com", "viewer", second);
    await w.invite("beto@example.com", "viewer", second);

    await session(w, "u-ana", { email: "ana@example.com", emailVerified: true });

    expect(await w.h.store.memberRole(w.id, "u-ana")).toBe("editor");
    expect(await w.h.store.memberRole(second, "u-ana")).toBe("viewer");
    expect(await pendingOf(w)).toEqual([]);
    // Somebody else's invitation is not touched.
    expect((await pendingOf(w, second)).map((i) => i.email)).toEqual(["beto@example.com"]);
  });

  it("matches the address in any case, as the invitation was made in lower case", async () => {
    const w = await world("private");
    await w.invite("ana@example.com", "viewer");
    await session(w, "u-ana", { email: "Ana@Example.COM", emailVerified: true });
    expect(await w.h.store.memberRole(w.id, "u-ana")).toBe("viewer");
  });

  it("resolves nothing for an email the provider did not verify, and everything the day it does", async () => {
    const w = await world("private");
    await w.invite("ana@example.com", "editor");

    await session(w, "u-ana", { email: "ana@example.com", emailVerified: false });
    expect(await w.h.store.memberRole(w.id, "u-ana")).toBeUndefined();
    expect((await pendingOf(w)).map((i) => i.email)).toEqual(["ana@example.com"]);

    await session(w, "u-ana", { email: "ana@example.com", emailVerified: true });
    expect(await w.h.store.memberRole(w.id, "u-ana")).toBe("editor");
  });

  it("resolves nothing for another address, however alike", async () => {
    const w = await world("private");
    await w.invite("ana@example.com", "editor");
    for (const email of [
      "ana@example.com.evil.example",
      "xana@example.com",
      "ana@example.co",
      "ana+tag@example.com",
    ]) {
      await session(w, "u-x", { email, emailVerified: true });
    }
    expect(await w.h.store.memberRole(w.id, "u-x")).toBeUndefined();
    expect(await pendingOf(w)).toHaveLength(1);
  });

  it("is done once: a second session changes nothing, and writes nothing", async () => {
    const w = await world("private");
    await w.invite("ana@example.com", "viewer");
    await session(w, "u-ana", { email: "ana@example.com", emailVerified: true });
    const members = await w.h.store.members(w.id);
    const spy = vi.spyOn(w.h.store, "acceptInvitationsFor");
    await session(w, "u-ana", { email: "ana@example.com", emailVerified: true });
    expect(await w.h.store.members(w.id)).toEqual(members);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not make the owner a member of their own project through an address of theirs", async () => {
    const w = await world("private");
    // An invitation for the owner's own address cannot be made through the API; put one in by hand.
    await w.h.store.createInvitation(
      {
        id: "a".repeat(32),
        projectId: w.id,
        email: emailOf(OWNER),
        role: "viewer",
        token: "b".repeat(32),
        createdBy: OWNER,
        createdAt: T,
      },
      50,
    );
    await session(w, OWNER, { email: emailOf(OWNER), emailVerified: true });
    expect(await w.h.store.memberRole(w.id, OWNER)).toBeUndefined();
  });

  it("does not resolve for a bearer token, which carries no verified email, and does not for nobody", async () => {
    const w = await world("private");
    await w.invite(emailOf(STRANGER), "editor");
    const { token } = await addToken(w.h.store, { sub: STRANGER });
    await w.h.request("/api/session", bearer(token));
    await w.h.request("/api/session");
    expect(await w.h.store.memberRole(w.id, STRANGER)).toBeUndefined();
  });

  it("tells the page nothing of it: the session answer is the person's, and holds no email, id or token", async () => {
    const w = await world("private");
    const made = await w.invite("ana@example.com", "viewer");
    const response = await session(w, "u-ana", { email: "ana@example.com", emailVerified: true });
    const text = await response.text();
    for (const secret of ["ana@example.com", tokenOf(made.link), made.id, w.id]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("GET /api/session and the handle", () => {
  it("says null until the person has a handle, and the handle after, for a cookie and for a token", async () => {
    const w = await world("private");
    const asCookie = async () =>
      (await jsonOf<{ user: { handle: string | null } }>(await w.ask(OWNER, "GET", "/api/session")))
        .user.handle;
    const { token } = await addToken(w.h.store, { sub: OWNER });
    const asToken = async () =>
      (
        await jsonOf<{ user: { handle: string | null } }>(
          await w.h.request("/api/session", bearer(token)),
        )
      ).user.handle;

    expect(await asCookie()).toBeNull();
    expect(await asToken()).toBeNull();
    expect(await w.h.store.setHandle(OWNER, "handle-a")).toBe("set");
    expect(await asCookie()).toBe("handle-a");
    expect(await asToken()).toBe("handle-a");
  });
});

// ---------------------------------------------------------------------------------------------

describe("PATCH /api/projects/:id/members/:sub", () => {
  it("changes a member's role, which takes effect at once", async () => {
    const w = await world("private");
    expect((await w.ask(VIEWER, "PUT", w.url("/files"), { files: { "v.md": "x" } })).status).toBe(
      403,
    );

    const response = await w.ask(OWNER, "PATCH", w.url(`/members/${VIEWER}`), { role: "editor" });

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({
      sub: VIEWER,
      role: "editor",
      email: emailOf(VIEWER),
    });
    expect((await w.ask(VIEWER, "PUT", w.url("/files"), { files: { "v.md": "x" } })).status).toBe(
      200,
    );
    // And back: a role is lowered by this, as an invitation does not.
    await w.ask(OWNER, "PATCH", w.url(`/members/${VIEWER}`), { role: "viewer" });
    expect((await w.ask(VIEWER, "PUT", w.url("/files"), { files: { "v.md": "y" } })).status).toBe(
      403,
    );
  });

  it("answers 404 not-found for someone who is not a member: the owner, a stranger, a member of another project", async () => {
    const w = await world("private");
    const other = await w.create(OWNER, { name: "Other" });
    await w.join("u-theirs", "viewer", other);
    for (const sub of [OWNER, STRANGER, "u-theirs", "nobody"]) {
      const response = await w.ask(OWNER, "PATCH", w.url(`/members/${encodeURIComponent(sub)}`), {
        role: "editor",
      });
      expect([response.status, await codeOf(response)], sub).toEqual([404, "not-found"]);
    }
    expect(await w.h.store.memberRole(other, "u-theirs")).toBe("viewer");
  });

  it("refuses a role that is not one, changing nothing", async () => {
    const w = await world("private");
    for (const body of [{ role: "owner" }, { role: "Editor" }, {}, { role: 1 }]) {
      const response = await w.ask(OWNER, "PATCH", w.url(`/members/${EDITOR}`), body);
      expect([response.status, await codeOf(response)], JSON.stringify(body)).toEqual([
        400,
        "request.invalid",
      ]);
    }
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");
  });

  it("is the owner's alone: an editor cannot raise themselves or anyone", async () => {
    const w = await world("private");
    for (const [who, target] of [
      [EDITOR, VIEWER],
      [VIEWER, VIEWER],
      [STRANGER, VIEWER],
    ] as const) {
      const response = await w.ask(who, "PATCH", w.url(`/members/${target}`), { role: "editor" });
      expect([response.status, await codeOf(response)], who).toEqual([
        who === STRANGER ? 404 : 403,
        who === STRANGER ? "project.not-found" : "access.denied",
      ]);
    }
    expect(await w.h.store.memberRole(w.id, VIEWER)).toBe("viewer");
  });
});

describe("DELETE /api/projects/:id/members/:sub", () => {
  it("removes a member, who loses the project at once", async () => {
    const w = await world("private");
    expect((await w.ask(EDITOR, "GET", w.url())).status).toBe(200);

    const response = await w.ask(OWNER, "DELETE", w.url(`/members/${EDITOR}`));

    expect(response.status).toBe(204);
    expect((await w.ask(EDITOR, "GET", w.url())).status).toBe(404);
    expect((await w.ask(EDITOR, "PUT", w.url("/files"), { files: { "e.md": "x" } })).status).toBe(
      404,
    );
    const list = await jsonOf<{ projects: unknown[] }>(await w.ask(EDITOR, "GET", "/api/projects"));
    expect(list.projects).toEqual([]);
    expect((await stateOf(w)).members.map((m) => m.sub)).toEqual([VIEWER]);
  });

  it("answers 404 not-found for someone who is not a member, and 403 for everyone but the owner", async () => {
    const w = await world("private");
    const missing = await w.ask(OWNER, "DELETE", w.url(`/members/${STRANGER}`));
    expect([missing.status, await codeOf(missing)]).toEqual([404, "not-found"]);
    for (const who of [EDITOR, VIEWER]) {
      const response = await w.ask(who, "DELETE", w.url(`/members/${EDITOR}`));
      expect([response.status, await codeOf(response)], who).toEqual([403, "access.denied"]);
    }
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");
  });

  it("is refused for a cookie from another page", async () => {
    const w = await world("private");
    const { cookie } = await w.h.signedIn({ sub: OWNER });
    const response = await w.h.request(w.url(`/members/${EDITOR}`), {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: "https://evil.example" },
    });
    expect([response.status, await codeOf(response)]).toEqual([403, "request.forbidden"]);
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");
  });
});

describe("DELETE /api/projects/:id/members/me", () => {
  it("lets a member leave: 204, and the project is gone from their view", async () => {
    const w = await world("private");

    const response = await w.ask(EDITOR, "DELETE", w.url("/members/me"));

    expect(response.status).toBe(204);
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBeUndefined();
    expect((await w.ask(EDITOR, "GET", w.url())).status).toBe(404);
    // The others stay.
    expect(await w.h.store.memberRole(w.id, VIEWER)).toBe("viewer");
  });

  it("lets a viewer leave a project whose link still admits them, who then holds the link's role", async () => {
    const w = await world("view");
    expect((await w.ask(VIEWER, "DELETE", w.url("/members/me"))).status).toBe(204);
    const still = await jsonOf(await w.ask(VIEWER, "GET", w.url()));
    expect(still).toMatchObject({ role: "viewer" });
    // A second time there is nothing to leave.
    const again = await w.ask(VIEWER, "DELETE", w.url("/members/me"));
    expect([again.status, await codeOf(again)]).toEqual([404, "not-found"]);
  });

  it("is refused to the owner, who deletes the project instead", async () => {
    const w = await world("private");
    const response = await w.ask(OWNER, "DELETE", w.url("/members/me"));
    expect([response.status, await codeOf(response)]).toEqual([403, "access.denied"]);
    expect(await w.h.store.projectById(w.id)).toBeDefined();
  });

  it("needs a membership: a signed-in person who only holds the link has none to leave, and nobody is asked to sign in", async () => {
    const w = await world("edit");
    const stranger = await w.ask(STRANGER, "DELETE", w.url("/members/me"));
    expect([stranger.status, await codeOf(stranger)]).toEqual([404, "not-found"]);
    const nobody = await w.ask(NOBODY, "DELETE", w.url("/members/me"));
    expect([nobody.status, await codeOf(nobody)]).toEqual([401, "auth.required"]);
    const hidden = await world("private");
    const none = await hidden.ask(STRANGER, "DELETE", hidden.url("/members/me"));
    expect([none.status, await codeOf(none)]).toEqual([404, "project.not-found"]);
  });

  it("is not a way to remove somebody else: me is the caller, whatever the project", async () => {
    const w = await world("private");
    await w.ask(VIEWER, "DELETE", w.url("/members/me"));
    expect(await w.h.store.memberRole(w.id, VIEWER)).toBeUndefined();
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");
  });
});

// ---------------------------------------------------------------------------------------------

describe("the cascade of a deleted account", () => {
  const sign = (body: string, secret: string): string =>
    `v1=${createHmac("sha256", secret).update(body).digest("hex")}`;

  /** Delivers `user.deleted` for `sub` as the identity service does. */
  function delete_(h: Harness, sub: string, id = "evt_1") {
    const body = JSON.stringify({ id, type: "user.deleted", sub, at: "2999-01-01T00:00:00.000Z" });
    return h.request("/_identity/events", {
      method: "POST",
      headers: { ...JSON_TYPE, "Meltemi-Signature": sign(body, h.env.IDENTITY_EVENTS_SECRET) },
      body,
    });
  }

  it("removes the project of a deleted owner with its members, invitations and publication, and the members' lists forget it", async () => {
    const w = await world("view");
    await w.invite("pending@example.com", "viewer");
    await w.h.store.setHandle(OWNER, "handle-a");
    await w.h.store.putPublication({
      projectId: w.id,
      handle: "handle-a",
      slug: "page",
      publishedAt: T,
      bytes: 4,
    });
    await w.h.env.BLOBS.put(publishedKey("handle-a", "page"), "page");
    const list = async (sub: string) =>
      (await jsonOf<{ projects: unknown[] }>(await w.ask(sub, "GET", "/api/projects"))).projects;
    expect(await list(EDITOR)).toHaveLength(1);

    const response = await delete_(w.h, OWNER);

    expect(response.status).toBe(200);
    expect(await w.h.store.projectById(w.id)).toBeUndefined();
    expect(await w.h.store.members(w.id)).toEqual([]);
    expect(await w.h.store.pendingInvitations(w.id, T)).toEqual([]);
    expect(await w.h.store.publication("handle-a", "page")).toBeUndefined();
    expect(w.h.blobs.objects.has(publishedKey("handle-a", "page"))).toBe(false);
    expect(await list(EDITOR)).toEqual([]);
    expect(await list(VIEWER)).toEqual([]);
    // For anyone who held the link, it was never there.
    expect((await w.ask(NOBODY, "GET", w.url("/files"))).status).toBe(404);
  });

  it("removes a deleted member's membership and leaves the project, which no longer lists them", async () => {
    const w = await world("private");
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");

    expect((await delete_(w.h, EDITOR)).status).toBe(200);

    expect(await w.h.store.projectById(w.id)).toBeDefined();
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBeUndefined();
    expect((await stateOf(w)).members.map((m) => m.sub)).toEqual([VIEWER]);
    expect((await w.ask(OWNER, "GET", w.url("/files"))).status).toBe(200);
  });

  it("removes the invitations that address the deleted person's verified email, and the others stay", async () => {
    const w = await world("private");
    await w.invite(emailOf(STRANGER), "viewer");
    await w.invite("someone@example.com", "viewer");
    expect(await pendingOf(w)).toHaveLength(2);

    await delete_(w.h, STRANGER);

    expect((await pendingOf(w)).map((i) => i.email)).toEqual(["someone@example.com"]);
  });
});
