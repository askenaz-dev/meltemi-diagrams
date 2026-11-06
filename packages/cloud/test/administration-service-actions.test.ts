import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdministrationContext } from "../src/administration-service.js";
import { publishedKey } from "../src/keys.js";
import { administrationHarness, BRIDGE_OWNER } from "./support/administration.js";
import { jsonOf } from "./support/index.js";

type Bridge = Awaited<ReturnType<typeof administrationHarness>>;
type Invitation = { id: string; expiresAt: string };
const permission = "/api/admin/accounts/target/permissions/unbranded-exports";

afterEach(() => vi.restoreAllMocks());

async function invite(b: Bridge, sub: string): Promise<Invitation> {
  const response = await b.send(b.owner.token, "POST", "/api/admin/invitations", {
    email: `${sub}@example.com`,
  });
  expect(response.status).toBe(201);
  return jsonOf<Invitation>(response);
}

async function admit(b: Bridge, sub: string) {
  const invitation = await invite(b, sub);
  const person = await b.credentials(sub);
  expect(
    (await b.send(person.token, "POST", `/api/admin/invitations/${invitation.id}/accept`)).status,
  ).toBe(204);
  return person;
}

describe("the private adapter delegates all administration operations", () => {
  it("reads the existing answer and grants, lists, looks up and revokes permissions with the real actor audit", async () => {
    const b = await administrationHarness();
    const admin = await admit(b, "admin-one");
    const target = await b.credentials("target");
    await b.send(target.token, "GET", "/context");
    const response = await b.send(b.owner.token, "GET", "/api/admin");
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({
      role: "owner",
      owners: [{ sub: BRIDGE_OWNER }],
      administrators: [{ sub: "admin-one" }],
      invitations: [],
      permissions: [{ id: "unbranded-exports" }],
      log: expect.any(Array),
      publishHost: null,
      sponsorships: [],
    });
    expect(await (await b.send(admin.token, "GET", "/context")).json()).toEqual({
      role: "admin",
      invitation: null,
    });
    expect(await (await b.send(admin.token, "GET", "/api/admin")).json()).toMatchObject({
      role: "administrator",
      invitations: [],
    });
    expect(await (await b.send(admin.token, "GET", permission)).json()).toMatchObject({
      sub: "target",
      permission: { id: "unbranded-exports", granted: false },
    });
    const granted = await b.send(admin.token, "PUT", permission, { granted: true });
    expect(granted.status).toBe(200);
    expect(await granted.json()).toMatchObject({ permission: { granted: true, by: "admin-one" } });
    expect(
      await (await b.send(admin.token, "GET", "/api/admin/permissions/unbranded-exports")).json(),
    ).toMatchObject({
      id: "unbranded-exports",
      holders: [{ sub: "target", by: { sub: "admin-one" } }],
    });
    expect((await b.send(admin.token, "PUT", permission, { granted: false })).status).toBe(200);
    const log = await b.h.store.adminLog(100);
    expect(log.filter((entry) => entry.targetSub === "target")).toMatchObject([
      { action: "revoke", bySub: "admin-one", detail: "unbranded-exports" },
      { action: "grant", bySub: "admin-one", detail: "unbranded-exports" },
    ]);
  });

  it("discovers an invitee without disclosing profile/email and accepts only that verified invitee", async () => {
    const b = await administrationHarness();
    const invitation = await invite(b, "invitee");
    const person = await b.credentials("invitee");
    const response = await b.send(person.token, "GET", "/context");
    const context = await jsonOf<AdministrationContext>(response);
    expect(context).toEqual({
      role: "invitee",
      invitation: {
        id: invitation.id,
        invitedBy: { name: BRIDGE_OWNER },
        expiresAt: invitation.expiresAt,
      },
    });
    const serialized = JSON.stringify(context);
    for (const field of [
      "email",
      "picture",
      "entitlements",
      "usage",
      "signIn",
      "signOut",
      "sid",
      "token",
    ])
      expect(serialized).not.toContain(`"${field}"`);
    expect((await b.send(person.token, "GET", "/api/admin")).status).toBe(404);
    const unverified = await b.credentials("invitee", false);
    expect(await (await b.send(unverified.token, "GET", "/context")).json()).toEqual({
      role: "none",
      invitation: null,
    });
    expect(
      (await b.send(unverified.token, "POST", `/api/admin/invitations/${invitation.id}/accept`))
        .status,
    ).toBe(404);
    expect(
      (await b.send(person.token, "POST", `/api/admin/invitations/${invitation.id}/accept`)).status,
    ).toBe(204);
    expect(
      (await b.send(person.token, "POST", `/api/admin/invitations/${invitation.id}/accept`)).status,
    ).toBe(404);
    expect(await (await b.send(person.token, "GET", "/context")).json()).toEqual({
      role: "admin",
      invitation: null,
    });
  });

  it("declines and revokes invitations without sending mail or leaving them eligible", async () => {
    const b = await administrationHarness();
    const declined = await invite(b, "declines");
    const person = await b.credentials("declines");
    expect(
      (await b.send(person.token, "POST", `/api/admin/invitations/${declined.id}/decline`)).status,
    ).toBe(204);
    expect(await (await b.send(person.token, "GET", "/context")).json()).toEqual({
      role: "none",
      invitation: null,
    });
    const revoked = await invite(b, "revoked");
    expect(
      (await b.send(b.owner.token, "DELETE", `/api/admin/invitations/${revoked.id}`)).status,
    ).toBe(204);
    const revokedPerson = await b.credentials("revoked");
    expect(
      (await b.send(revokedPerson.token, "POST", `/api/admin/invitations/${revoked.id}/accept`))
        .status,
    ).toBe(404);
    expect(
      b.h.identity.calls.every((call) => /\/(?:sessions\/|\.well-known\/jwks\.json)/.test(call)),
    ).toBe(true);
  });

  it("removes an invited administrator or lets them leave, never removes an owner", async () => {
    const b = await administrationHarness();
    const removed = await admit(b, "removed");
    expect(
      (await b.send(b.owner.token, "DELETE", "/api/admin/administrators/removed")).status,
    ).toBe(204);
    expect(await (await b.send(removed.token, "GET", "/context")).json()).toEqual({
      role: "none",
      invitation: null,
    });
    const leaving = await admit(b, "leaving");
    expect(
      (await b.send(leaving.token, "DELETE", "/api/admin/administrators/leaving")).status,
    ).toBe(204);
    expect(
      (await b.send(b.owner.token, "DELETE", `/api/admin/administrators/${BRIDGE_OWNER}`)).status,
    ).toBe(404);
    expect(await b.h.store.administrator("leaving")).toBeUndefined();
  });

  it("takes down a real publication and records the existing reason and actor", async () => {
    const b = await administrationHarness();
    const admin = await admit(b, "moderator");
    const projectId = "proj0000000000000001";
    const at = b.h.clock.now().toISOString();
    expect(
      await b.h.store.createProject(
        {
          id: projectId,
          ownerSub: BRIDGE_OWNER,
          name: "Published",
          description: "",
          createdAt: at,
        },
        100,
      ),
    ).toBe("created");
    expect(
      await b.h.store.putPublication({
        projectId,
        handle: "owner",
        slug: "demo",
        publishedAt: at,
        bytes: 10,
      }),
    ).toBe("put");
    await b.h.blobs.put(publishedKey("owner", "demo"), "a published page");
    const response = await b.send(admin.token, "DELETE", "/api/admin/publications/owner/demo", {
      reason: "Policy review",
    });
    expect(response.status).toBe(204);
    expect(await b.h.store.publication("owner", "demo")).toBeUndefined();
    expect(await b.h.blobs.get(publishedKey("owner", "demo"))).toBeNull();
    expect((await b.h.store.adminLog(1))[0]).toMatchObject({
      bySub: "moderator",
      action: "takedown",
      detail: "owner/demo: Policy review",
    });
  });

  it("keeps every non-context operation inaccessible to a person without its role or invitation", async () => {
    const b = await administrationHarness();
    const admin = await admit(b, "admin-one");
    const another = await admit(b, "admin-two");
    const invitation = await invite(b, "actual-invitee");
    const ordinary = await b.credentials("ordinary");
    await b.send(ordinary.token, "GET", "/context");
    const baseline = await b.h.store.adminLog(100);
    for (const [method, path, body] of [
      ["GET", "/api/admin"],
      ["GET", "/api/admin/permissions/unbranded-exports"],
      ["GET", "/api/admin/accounts/ordinary/permissions/unbranded-exports"],
      ["POST", "/account-permission", { account: "ordinary", permission: "unbranded-exports" }],
      ["POST", "/api/admin/invitations", { email: "x@example.com" }],
      ["POST", `/api/admin/invitations/${invitation.id}/accept`],
      ["POST", `/api/admin/invitations/${invitation.id}/decline`],
      ["DELETE", `/api/admin/invitations/${invitation.id}`],
      ["DELETE", "/api/admin/administrators/admin-one"],
      ["DELETE", "/api/admin/publications/owner/demo"],
      ["PUT", "/api/admin/accounts/ordinary/permissions/unbranded-exports", { granted: true }],
    ] as const)
      expect((await b.send(ordinary.token, method, path, body)).status, `${method} ${path}`).toBe(
        404,
      );
    expect(
      (await b.send(admin.token, "POST", "/api/admin/invitations", { email: "x@example.com" }))
        .status,
    ).toBe(404);
    expect(
      (await b.send(admin.token, "DELETE", `/api/admin/invitations/${invitation.id}`)).status,
    ).toBe(404);
    expect(
      (await b.send(admin.token, "DELETE", "/api/admin/administrators/admin-two")).status,
    ).toBe(404);
    expect(await b.h.store.adminLog(100)).toEqual(baseline);
    expect((await b.send(another.token, "GET", "/context")).status).toBe(200);
  });

  it("retains existing field validation, ambiguous lookups and invitation quota", async () => {
    const b = await administrationHarness();
    expect(
      (await b.send(b.owner.token, "POST", "/api/admin/invitations", { email: "bad" })).status,
    ).toBe(400);
    expect((await b.send(b.owner.token, "PUT", permission, { granted: "yes" })).status).toBe(404);
    const target = await b.credentials("target");
    await b.send(target.token, "GET", "/context");
    expect((await b.send(b.owner.token, "PUT", permission, { granted: "yes" })).status).toBe(400);
    expect((await b.send(b.owner.token, "GET", "/api/admin/permissions/unknown")).status).toBe(404);
    for (const sub of ["shared-a", "shared-b"])
      await b.h.store.upsertUser(
        { sub, name: sub, picture: "", email: "shared@example.com", emailVerified: true },
        b.h.clock.now().toISOString(),
      );
    expect(
      (
        await b.send(
          b.owner.token,
          "GET",
          "/api/admin/accounts/shared%40example.com/permissions/unbranded-exports",
        )
      ).status,
    ).toBe(409);
    for (let i = 0; i < 10; i++) await invite(b, `invite-${i}`);
    expect(
      (
        await b.send(b.owner.token, "POST", "/api/admin/invitations", {
          email: "eleventh@example.com",
        })
      ).status,
    ).toBe(409);
    expect(
      (await b.h.store.adminLog(100)).filter((entry) => entry.action === "invite"),
    ).toHaveLength(10);
  });

  it("looks up accounts through a constant private POST and the existing permission rules", async () => {
    const b = await administrationHarness();
    const target = await b.credentials("target");
    await b.send(target.token, "GET", "/context");
    const response = await b.send(b.owner.token, "POST", "/account-permission", {
      account: "target@example.com",
      permission: "unbranded-exports",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sub: "target",
      permission: { id: "unbranded-exports", granted: false },
    });
    expect(
      (
        await b.send(b.owner.token, "POST", "/account-permission", {
          account: "target",
          permission: "unknown",
        })
      ).status,
    ).toBe(404);
    expect(await b.h.store.adminLog(100)).toEqual([]);
  });

  it("preserves existing exact-email lookup with legal URL punctuation in its POST body", async () => {
    const b = await administrationHarness();
    const email = "first/last+tag%id?x#part@example.com";
    await b.h.store.upsertUser(
      { sub: "punctuation", name: "Account", picture: "", email, emailVerified: true },
      b.h.deps.now().toISOString(),
    );
    const response = await b.send(b.owner.token, "POST", "/account-permission", {
      account: email,
      permission: "unbranded-exports",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sub: "punctuation",
      email,
      permission: { granted: false },
    });
    expect(await b.h.store.adminLog(100)).toEqual([]);
  });

  it.each([
    undefined,
    {},
    { account: "target" },
    { account: "target", permission: 1 },
    { account: "", permission: "unbranded-exports" },
    { account: "target", permission: "unbranded-exports", granted: true },
    { account: "a/b", permission: "unbranded-exports" },
    { account: "..", permission: "unbranded-exports" },
  ])("refuses an invalid or unsafe private lookup body %j", async (body) => {
    const b = await administrationHarness();
    expect((await b.send(b.owner.token, "POST", "/account-permission", body)).status).toBe(400);
    expect(await b.h.store.adminLog(100)).toEqual([]);
  });
});
