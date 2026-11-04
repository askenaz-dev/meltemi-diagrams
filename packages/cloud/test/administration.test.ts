// The administration of the service (`service-administration`): owners and administrators, the
// invitations to administer, removal and leaving, the lookup of an account by email, the log, the
// answer of `GET /api/admin`, and what the session answer says of it (`cloud-accounts`).

import { describe, expect, it } from "vitest";
import { jsonOf } from "./support/index.js";
import { JSON_TYPE, projects, type Projects } from "./support/projects.js";
import { addToken, bearer } from "./support/who.js";

const OWNER = "bf8b255d-9228-4088-bbd1-6d9d42d41a94";
const ANA = "u-ana";
const BETO = "u-beto";
const CARLA = "u-carla";

interface Invitation {
  id: string;
  email: string;
  invitedBy: { sub: string; name: string };
  createdAt: string;
  expiresAt: string;
}

interface Administration {
  role: "owner" | "administrator";
  owners: { sub: string; name: string; email: string }[];
  administrators: { sub: string; invitedBy: { sub: string }; since: string }[];
  invitations: Invitation[];
  permissions: { id: string; holders: { sub: string }[] }[];
  log: {
    at: string;
    by: { sub: string; name: string; deleted?: true };
    action: string;
    target: { sub?: string; email?: string; deleted?: true } | null;
    detail: string;
  }[];
}

interface Session {
  user: {
    administration: { role: string } | null;
    administrationInvitation: { id: string; invitedBy: { name: string }; expiresAt: string } | null;
    entitlements: { unbranded: boolean };
  } | null;
}

/** The service with the owner, and people with a verified email `<name>@example.com` who have each asked once. */
async function service(...people: string[]): Promise<Projects> {
  const p = await projects({ env: { ADMIN_SUBS: OWNER } });
  p.profile(OWNER, {
    email: "guillmarortiz@gmail.com",
    emailVerified: true,
    name: "Guillmar Ortiz",
  });
  await p.send(OWNER, "GET", "/api/session");
  for (const sub of people) {
    p.profile(sub, { email: emailOf(sub), emailVerified: true });
    await p.send(sub, "GET", "/api/session");
  }
  return p;
}

const emailOf = (sub: string) => `${sub.replace(/^u-/, "")}@example.com`;
const body = (value: unknown) => JSON.stringify(value);
const ask = (p: Projects, who: string, method: string, path: string, value?: unknown) =>
  value === undefined
    ? p.send(who, method, path)
    : p.send(who, method, path, body(value), JSON_TYPE);
const codeOf = async (response: Response) =>
  (await jsonOf<{ code?: string }>(response.clone())).code;
const administration = async (p: Projects, who = OWNER) =>
  jsonOf<Administration>(await ask(p, who, "GET", "/api/admin"));
const sessionOf = async (p: Projects, sub: string) =>
  (await jsonOf<Session>(await ask(p, sub, "GET", "/api/session"))).user;
const invite = (p: Projects, email: string, who = OWNER) =>
  ask(p, who, "POST", "/api/admin/invitations", { email });
const accept = (p: Projects, who: string, id: string) =>
  ask(p, who, "POST", `/api/admin/invitations/${id}/accept`);

/** Invites the person and has them accept: they are an administrator afterwards. */
async function admit(p: Projects, sub: string): Promise<void> {
  const invitation = await jsonOf<Invitation>(await invite(p, emailOf(sub)));
  expect((await accept(p, sub, invitation.id)).status).toBe(204);
}

describe("owners and administrators", () => {
  it("makes the owner the administrator by default", async () => {
    const p = await service();
    const answer = await administration(p);
    expect(answer.role).toBe("owner");
    expect(answer.owners).toEqual([
      { sub: OWNER, name: "Guillmar Ortiz", handle: null, email: "guillmarortiz@gmail.com" },
    ]);
    expect([answer.administrators, answer.invitations, answer.log]).toEqual([[], [], []]);
    expect(answer.permissions.map((permission) => permission.id)).toEqual(["unbranded-exports"]);
  });

  it("answers an invited administrator as one", async () => {
    const p = await service(ANA);
    await admit(p, ANA);
    expect((await administration(p, ANA)).role).toBe("administrator");
  });

  it("answers 404 to everybody else, and to the owner's API token", async () => {
    const p = await service(ANA);
    const unknown = await jsonOf(await ask(p, OWNER, "GET", "/api/admin/nothing"));
    for (const response of [
      await ask(p, ANA, "GET", "/api/admin"),
      await p.anonymous("GET", "/api/admin"),
    ]) {
      expect(response.status).toBe(404);
      expect(await jsonOf(response)).toEqual(unknown);
    }
    const { token } = await addToken(p.h.store, { sub: OWNER });
    expect((await p.h.request("/api/admin", bearer(token))).status).toBe(404);
  });

  it("has no administrator at all without ADMIN_SUBS", async () => {
    const p = await projects();
    expect((await p.send(OWNER, "GET", "/api/admin")).status).toBe(404);
  });
});

describe("invitations to administer", () => {
  it("invites an email for seven days, and the invitee accepts", async () => {
    const p = await service(ANA);
    const response = await invite(p, " Ana@Example.com ");
    expect(response.status).toBe(201);
    const invitation = await jsonOf<Invitation>(response);
    const now = p.h.clock.now().getTime();
    expect(invitation).toMatchObject({
      email: "ana@example.com",
      invitedBy: { sub: OWNER, name: "Guillmar Ortiz" },
      expiresAt: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
    });
    expect((await administration(p)).invitations.map((i) => i.id)).toEqual([invitation.id]);
    expect((await accept(p, ANA, invitation.id)).status).toBe(204);
    expect((await administration(p, ANA)).role).toBe("administrator");
    expect((await administration(p)).invitations).toEqual([]);
  });

  it("makes nobody an administrator at sign-in, and shows the invitation in the session answer", async () => {
    const p = await service(ANA);
    const invitation = await jsonOf<Invitation>(await invite(p, emailOf(ANA)));
    const user = await sessionOf(p, ANA);
    expect(user?.administration).toBeNull();
    expect(user?.administrationInvitation).toEqual({
      id: invitation.id,
      invitedBy: { name: "Guillmar Ortiz" },
      expiresAt: invitation.expiresAt,
    });
    expect((await ask(p, ANA, "GET", "/api/admin")).status).toBe(404);
  });

  it("is answered by its addressee only: another email or an unverified one is 404", async () => {
    const p = await service(ANA, BETO);
    const invitation = await jsonOf<Invitation>(await invite(p, emailOf(ANA)));
    expect((await accept(p, BETO, invitation.id)).status).toBe(404);
    p.profile(ANA, { email: emailOf(ANA), emailVerified: false });
    expect((await accept(p, ANA, invitation.id)).status).toBe(404);
    expect((await sessionOf(p, ANA))?.administrationInvitation).toBeNull();
    p.profile(ANA, { email: emailOf(ANA), emailVerified: true });
    expect((await accept(p, ANA, invitation.id)).status).toBe(204);
  });

  it("works once, not after seven days, not declined and not revoked", async () => {
    const p = await service(ANA, BETO, CARLA);
    const ana = await jsonOf<Invitation>(await invite(p, emailOf(ANA)));
    const beto = await jsonOf<Invitation>(await invite(p, emailOf(BETO)));
    const carla = await jsonOf<Invitation>(await invite(p, emailOf(CARLA)));
    expect((await ask(p, BETO, "POST", `/api/admin/invitations/${beto.id}/decline`)).status).toBe(
      204,
    );
    expect((await accept(p, BETO, beto.id)).status).toBe(404);
    expect((await ask(p, OWNER, "DELETE", `/api/admin/invitations/${carla.id}`)).status).toBe(204);
    expect((await accept(p, CARLA, carla.id)).status).toBe(404);
    p.h.clock.advance(8 * 24 * 3600 * 1000);
    expect((await accept(p, ANA, ana.id)).status).toBe(404);
  });

  it("answers a repeated email with the same invitation", async () => {
    const p = await service();
    const first = await jsonOf<Invitation>(await invite(p, "ana@example.com"));
    const again = await invite(p, "ana@example.com");
    expect(again.status).toBe(200);
    expect((await jsonOf<Invitation>(again)).id).toBe(first.id);
    expect((await administration(p)).invitations).toHaveLength(1);
  });

  it.each([["ana"], ["ana@localhost"], [`${"a".repeat(300)}@example.com`]])(
    "refuses %s as request.invalid",
    async (email) => {
      const p = await service();
      const response = await invite(p, email);
      expect([response.status, await codeOf(response)]).toEqual([400, "request.invalid"]);
      expect((await administration(p)).invitations).toEqual([]);
    },
  );

  it("refuses the email of an administrator, or the owner's own, as admin.already", async () => {
    const p = await service(ANA);
    await admit(p, ANA);
    for (const email of [emailOf(ANA), "guillmarortiz@gmail.com"]) {
      const response = await invite(p, email);
      expect([response.status, await codeOf(response)]).toEqual([409, "admin.already"]);
    }
  });

  it("is an owner's: an administrator gets 404", async () => {
    const p = await service(ANA);
    await admit(p, ANA);
    const response = await invite(p, "beto@example.com", ANA);
    expect(response.status).toBe(404);
    expect((await administration(p)).invitations).toEqual([]);
  });

  it("refuses an eleventh pending invitation as admin.limit, logging nothing", async () => {
    const p = await service();
    for (let n = 1; n <= 10; n++)
      expect((await invite(p, `guest${n}@example.com`)).status).toBe(201);
    const response = await invite(p, "guest11@example.com");
    expect([response.status, await codeOf(response)]).toEqual([409, "admin.limit"]);
    expect((await administration(p)).log).toHaveLength(10);
  });

  it("applies the Origin rule", async () => {
    const p = await service();
    const { cookie } = await p.h.signedIn({ sub: OWNER });
    const response = await p.h.request("/api/admin/invitations", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example", ...JSON_TYPE },
      body: body({ email: "ana@example.com" }),
    });
    expect([response.status, await codeOf(response)]).toEqual([403, "request.forbidden"]);
  });
});

describe("removing and leaving", () => {
  it("lets the owner remove an administrator, and an administrator leave", async () => {
    const p = await service(ANA, BETO);
    await admit(p, ANA);
    await admit(p, BETO);
    expect((await ask(p, OWNER, "DELETE", `/api/admin/administrators/${ANA}`)).status).toBe(204);
    expect((await ask(p, ANA, "GET", "/api/admin")).status).toBe(404);
    expect((await ask(p, BETO, "DELETE", `/api/admin/administrators/${BETO}`)).status).toBe(204);
    expect((await administration(p)).administrators).toEqual([]);
    expect((await administration(p)).log.slice(0, 2).map((e) => e.action)).toEqual([
      "leave",
      "remove",
    ]);
  });

  it("refuses another administrator's row to an administrator, and an owner's to everybody", async () => {
    const p = await service(ANA, BETO);
    await admit(p, ANA);
    await admit(p, BETO);
    expect((await ask(p, ANA, "DELETE", `/api/admin/administrators/${BETO}`)).status).toBe(404);
    expect((await ask(p, OWNER, "DELETE", `/api/admin/administrators/${OWNER}`)).status).toBe(404);
    expect((await administration(p)).administrators.map((a) => a.sub)).toEqual([ANA, BETO]);
  });
});

describe("an account by email", () => {
  const permission = (account: string) =>
    `/api/admin/accounts/${encodeURIComponent(account)}/permissions/unbranded-exports`;

  it("grants by the one verified email, and logs the grant", async () => {
    const p = await service(ANA);
    const response = await ask(p, OWNER, "PUT", permission(emailOf(ANA)), { granted: true });
    expect(response.status).toBe(200);
    expect((await sessionOf(p, ANA))?.entitlements).toEqual({ unbranded: true });
    const [entry] = (await administration(p)).log;
    expect(entry).toMatchObject({
      by: { sub: OWNER },
      action: "grant",
      target: { sub: ANA },
      detail: "unbranded-exports",
    });
  });

  it("is 404 for an email nobody signed in with verified, and 409 for one of two accounts", async () => {
    const p = await service(ANA);
    p.profile(BETO, { email: "shared@example.com", emailVerified: true });
    p.profile(CARLA, { email: "shared@example.com", emailVerified: true });
    await p.send(BETO, "GET", "/api/session");
    await p.send(CARLA, "GET", "/api/session");
    const unknown = await ask(p, OWNER, "PUT", permission("nobody@example.com"), { granted: true });
    expect(unknown.status).toBe(404);
    const shared = await ask(p, OWNER, "PUT", permission("shared@example.com"), { granted: true });
    expect([shared.status, await codeOf(shared)]).toEqual([409, "account.ambiguous"]);
  });
});

describe("the log", () => {
  it("shows a deleted account by its id", async () => {
    const p = await service(ANA);
    await ask(p, OWNER, "PUT", `/api/admin/accounts/${ANA}/permissions/unbranded-exports`, {
      granted: true,
    });
    await p.h.store.applyUserDeleted("evt_ana", ANA, p.h.clock.now().toISOString());
    const [entry] = (await administration(p)).log;
    expect(entry?.target).toEqual({ sub: ANA, name: "", deleted: true });
  });

  it("shows an administrator no invitations, and the session answer their role", async () => {
    const p = await service(ANA);
    await admit(p, ANA);
    await invite(p, "beto@example.com");
    expect((await administration(p, ANA)).invitations).toEqual([]);
    expect((await sessionOf(p, ANA))?.administration).toEqual({ role: "administrator" });
    expect((await sessionOf(p, OWNER))?.administration).toEqual({ role: "owner" });
    expect((await sessionOf(p, ANA))?.entitlements).toEqual({ unbranded: true });
  });
});
