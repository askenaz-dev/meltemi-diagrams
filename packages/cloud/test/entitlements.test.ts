// The entitlement to export without the Meltemi branding (`cloud-accounts`, "Entitlements"), the
// permission `unbranded-exports` of the catalog (`service-administration`, "Permissions"): its
// three routes and what the session answer says of it.

import { describe, expect, it } from "vitest";
import { jsonOf } from "./support/index.js";
import { JSON_TYPE, projects, type Projects } from "./support/projects.js";
import { addToken, bearer } from "./support/who.js";

const ADMIN = "u-admin";
const ANA = "u1";
const BETO = "u2";
const CARLA = "u3";
const NOBODY = "nobody";

interface Entitlement {
  sub: string;
  handle: string | null;
  name: string;
  email: string;
  permission: { id: string; granted: boolean; by: string | null; at: string | null };
}

interface Session {
  user: { sub: string; entitlements: { unbranded: boolean } } | null;
}

/** The service with one administrator, and people who have each made a request (so have a row). */
async function service(...people: string[]): Promise<Projects> {
  const p = await projects({ env: { ADMIN_SUBS: ADMIN } });
  for (const sub of people) await p.send(sub, "GET", "/api/session");
  return p;
}

const ask = (p: Projects, who: string, method: string, path: string, body?: unknown) => {
  const init =
    body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  return who === NOBODY
    ? p.anonymous(method, path, init, init === undefined ? {} : JSON_TYPE)
    : p.send(who, method, path, init, init === undefined ? {} : JSON_TYPE);
};

const accountUrl = (account: string) =>
  `/api/admin/accounts/${encodeURIComponent(account)}/permissions/unbranded-exports`;
const grant = (p: Projects, account: string, unbranded = true, who = ADMIN) =>
  ask(p, who, "PUT", accountUrl(account), { granted: unbranded });
const HOLDERS = "/api/admin/permissions/unbranded-exports";
const list = async (p: Projects) =>
  (await jsonOf<{ holders: { sub: string }[] }>(await ask(p, ADMIN, "GET", HOLDERS))).holders;
const sessionOf = async (p: Projects, sub: string) =>
  (await jsonOf<Session>(await ask(p, sub, "GET", "/api/session"))).user;
const codeOf = async (response: Response) =>
  (await jsonOf<{ code?: string }>(response.clone())).code;

describe("PUT /api/admin/accounts/<account>/permissions/unbranded-exports", () => {
  it("entitles an account, records who and when, and the person's session then says so", async () => {
    const p = await service(ANA);
    expect((await sessionOf(p, ANA))?.entitlements).toEqual({ unbranded: false });
    p.h.clock.advance(60_000);

    const response = await grant(p, ANA);

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({
      sub: ANA,
      handle: null,
      name: ANA,
      email: expect.any(String),
      permission: {
        id: "unbranded-exports",
        granted: true,
        by: ADMIN,
        at: p.h.clock.now().toISOString(),
      },
    });
    expect((await sessionOf(p, ANA))?.entitlements).toEqual({ unbranded: true });
  });

  it("finds a person by their handle and answers their account id", async () => {
    const p = await service(BETO);
    expect((await ask(p, BETO, "PATCH", "/api/account", { handle: "tienda" })).status).toBe(200);

    const response = await grant(p, "@tienda");

    expect(response.status).toBe(200);
    const body = await jsonOf<Entitlement>(response);
    expect([body.sub, body.handle, body.permission.granted]).toEqual([BETO, "tienda", true]);
    // The GET answers the same, by either name.
    expect(await jsonOf(await ask(p, ADMIN, "GET", accountUrl(BETO)))).toEqual(body);
    expect(await jsonOf(await ask(p, ADMIN, "GET", accountUrl("@tienda")))).toEqual(body);
  });

  it("revokes, recording who and when again, and the list drops the person", async () => {
    const p = await service(ANA, BETO, CARLA);
    await grant(p, ANA);
    p.h.clock.advance(60_000);
    await grant(p, BETO);
    p.h.clock.advance(60_000);
    await grant(p, CARLA);
    expect((await list(p)).map((a) => a.sub)).toEqual([ANA, BETO, CARLA]);
    p.h.clock.advance(60_000);

    const revoked = await jsonOf<Entitlement>(await grant(p, CARLA, false));

    expect(revoked.permission).toEqual({
      id: "unbranded-exports",
      granted: false,
      by: ADMIN,
      at: p.h.clock.now().toISOString(),
    });
    expect((await list(p)).map((a) => a.sub)).toEqual([ANA, BETO]);
    expect((await sessionOf(p, CARLA))?.entitlements).toEqual({ unbranded: false });
  });

  it("entitles every administrator in the session with no grant, while their row says what was set", async () => {
    const p = await service(ADMIN);
    expect((await sessionOf(p, ADMIN))?.entitlements).toEqual({ unbranded: true });
    expect(
      (await jsonOf<Entitlement>(await ask(p, ADMIN, "GET", accountUrl(ADMIN)))).permission,
    ).toEqual({ id: "unbranded-exports", granted: false, by: null, at: null });
    expect(await list(p)).toEqual([]);
  });

  it("carries the entitlement in a token's session answer too", async () => {
    const p = await service(ANA);
    await grant(p, ANA);
    const { token } = await addToken(p.h.store, { sub: ANA });
    const response = await p.h.request("/api/session", bearer(token));
    expect((await jsonOf<Session>(response)).user?.entitlements).toEqual({ unbranded: true });
  });

  it("is 404 not-found for everybody who is not an administrator, on the routes", async () => {
    const p = await service(ANA, BETO);
    const unknown = await jsonOf(await ask(p, ADMIN, "GET", "/api/admin/nothing"));
    for (const who of [ANA, NOBODY]) {
      for (const [method, path, body] of [
        ["GET", accountUrl(BETO), undefined],
        ["PUT", accountUrl(BETO), { granted: true }],
        ["GET", HOLDERS, undefined],
        ["GET", "/api/admin", undefined],
      ] as const) {
        const response = await ask(p, who, method, path, body);
        expect(response.status, `${who} ${method} ${path}`).toBe(404);
        expect(await jsonOf(response), `${who} ${method} ${path}`).toEqual(unknown);
      }
    }
    expect((await sessionOf(p, BETO))?.entitlements).toEqual({ unbranded: false });
  });

  it("answers an administrator's API token 404 too: an administrator acts on the page", async () => {
    const p = await service(ADMIN, ANA);
    const { token } = await addToken(p.h.store, { sub: ADMIN });
    const put = await p.h.request(
      accountUrl(ANA),
      bearer(token, {
        method: "PUT",
        headers: JSON_TYPE,
        body: JSON.stringify({ granted: true }),
      }),
    );
    const listed = await p.h.request(HOLDERS, bearer(token));
    expect([put.status, await codeOf(put)]).toEqual([404, "not-found"]);
    expect(listed.status).toBe(404);
    expect((await sessionOf(p, ANA))?.entitlements).toEqual({ unbranded: false });
  });

  it("applies the Origin rule to an administrator's cookie", async () => {
    const p = await service(ANA);
    const { cookie } = await p.h.signedIn({ sub: ADMIN });
    const response = await p.h.request(accountUrl(ANA), {
      method: "PUT",
      headers: { Cookie: cookie, Origin: "https://evil.example", ...JSON_TYPE },
      body: JSON.stringify({ granted: true }),
    });
    expect([response.status, await codeOf(response)]).toEqual([403, "request.forbidden"]);
    expect((await sessionOf(p, ANA))?.entitlements).toEqual({ unbranded: false });
  });

  it.each([
    ["a sub nobody has", "u-nobody"],
    ["a sub of 300 characters", "u".repeat(300)],
    ["a handle nobody holds", "@nobody-here"],
    ["a handle that is not one", "@Tienda"],
    ["a sub with a control character", "u\u00071"],
    ["an email nobody signed in with", "nobody@example.com"],
  ])("is 404 not-found for %s, and creates nothing", async (_name, account) => {
    const p = await service(ANA);
    const response = await grant(p, account);
    expect([response.status, await codeOf(response)]).toEqual([404, "not-found"]);
    expect(await list(p)).toEqual([]);
    if (!account.includes("@")) expect(await p.h.store.user(account)).toBeUndefined();
  });

  it.each([
    ["a flag that is not a boolean", { granted: "yes" }],
    ["no flag", {}],
    ["another field beside it", { granted: true, extra: 1 }],
    ["the former body", { unbranded: true }],
    ["a body that is not JSON", "nope"],
    ["a body that is a list", "[]"],
  ])("is 400 request.invalid for %s, and leaves who and when as they were", async (_name, body) => {
    const p = await service(ANA);
    await grant(p, ANA);
    const before = await jsonOf<Entitlement>(await ask(p, ADMIN, "GET", accountUrl(ANA)));
    p.h.clock.advance(60_000);

    const response = await ask(p, ADMIN, "PUT", accountUrl(ANA), body);

    expect([response.status, await codeOf(response)]).toEqual([400, "request.invalid"]);
    expect(await jsonOf(await ask(p, ADMIN, "GET", accountUrl(ANA)))).toEqual(before);
  });

  it("forgets a deleted person: 404, and gone from the list", async () => {
    const p = await service(ANA, BETO);
    await grant(p, ANA);
    await grant(p, BETO);
    await p.h.store.applyUserDeleted("evt_ana", ANA, p.h.clock.now().toISOString());
    const response = await ask(p, ADMIN, "GET", accountUrl(ANA));
    expect(response.status).toBe(404);
    expect((await list(p)).map((a) => a.sub)).toEqual([BETO]);
  });
});
