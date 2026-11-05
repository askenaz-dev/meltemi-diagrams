// Connected apps (`cloud-accounts`, "The account's connected apps"; `mcp-authorization`, "Connected
// apps"): the person's OAuth grants listed and revoked from the page, never with a token, and every
// grant revoked when the identity service says the account was deleted.

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOUCH_EVERY_MS } from "../src/oauth/provider.js";
import { jsonOf } from "./support/index.js";
import { mcp, type Mcp } from "./support/mcp.js";
import { ALL_SCOPES, connectApp, listTools } from "./support/oauth.js";

const ANA = "u-ana";
const T = "2026-10-14T12:00:00.000Z";
const ORIGIN = "https://diagrams.meltemi.dev";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(T) });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function advance(m: Mcp, ms: number): void {
  m.h.clock.advance(ms);
  vi.setSystemTime(m.h.clock.now());
}

interface App {
  id: string;
  client: { name: string; uri: string };
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

async function appsOf(m: Mcp, cookie: string): Promise<App[]> {
  const response = await m.h.request("/api/account/apps", { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  return (await jsonOf<{ grants: App[] }>(response)).grants;
}

function revoke(m: Mcp, cookie: string, id: string, origin = ORIGIN): Promise<Response> {
  return m.h.request(`/api/account/apps/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: origin },
  });
}

/** A deletion event as the identity service signs and sends it. */
function deleted(m: Mcp, sub: string, at: string, id = "evt-apps"): Promise<Response> {
  const body = JSON.stringify({ id, type: "user.deleted", sub, at });
  const signature = `v1=${createHmac("sha256", m.h.env.IDENTITY_EVENTS_SECRET).update(body).digest("hex")}`;
  return m.h.request("/_identity/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Meltemi-Signature": signature },
    body,
  });
}

describe("GET /api/account/apps", () => {
  it("lists the person's grant with its client, scopes, approval and last use, which a call records", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    expect(await appsOf(m, cookie)).toEqual([]);
    const { clientId, tokens } = await connectApp(m.h, cookie);
    const [app] = await appsOf(m, cookie);
    expect(app).toEqual({
      id: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/),
      client: { name: "Codex", uri: "http://127.0.0.1:1455" },
      scopes: [...ALL_SCOPES.split(" "), "offline_access"],
      createdAt: T,
      lastUsedAt: null,
    });
    advance(m, 60_000);
    expect((await listTools(m.h, tokens.access_token)).status).toBe(200);
    const used = new Date(Date.parse(T) + 60_000).toISOString();
    expect((await appsOf(m, cookie))[0]?.lastUsedAt).toBe(used);
    // Written at most hourly: a call a minute later leaves it; one after the hour moves it.
    advance(m, 60_000);
    await listTools(m.h, tokens.access_token);
    expect((await appsOf(m, cookie))[0]?.lastUsedAt).toBe(used);
    // The access token lives an hour: the client refreshes it, and its next call moves the time.
    advance(m, TOUCH_EVERY_MS);
    const refreshed = await m.h.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token!,
        client_id: clientId,
      }),
    });
    const next = await jsonOf<{ access_token: string }>(refreshed);
    expect((await listTools(m.h, next.access_token)).status).toBe(200);
    expect((await appsOf(m, cookie))[0]?.lastUsedAt).toBe(m.h.clock.now().toISOString());
    // Nothing that grants access is in the answer.
    const text = await (
      await m.h.request("/api/account/apps", { headers: { Cookie: cookie } })
    ).text();
    expect(text).not.toContain(tokens.access_token);
    expect(text).not.toContain(tokens.refresh_token!);
  });

  it("lists one grant for a client that authorized twice, the latest, and every client the person approved", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    await connectApp(m.h, cookie, { name: "Claude" });
    advance(m, 1000);
    await connectApp(m.h, cookie, { name: "Codex", scope: "projects:read" });
    const names = (await appsOf(m, cookie)).map((app) => [app.client.name, app.scopes]);
    expect(names).toEqual([
      ["Codex", ["projects:read"]],
      ["Claude", [...ALL_SCOPES.split(" "), "offline_access"]],
    ]);
    // Another person sees none of them.
    const { cookie: bob } = await m.h.signedIn({ sub: "u-bob" });
    expect(await appsOf(m, bob)).toEqual([]);
  });

  it("is the page's: a mdg_ token is 403 request.forbidden, nobody is 401 auth.required", async () => {
    const m = await mcp();
    const token = await m.token(ANA);
    const byToken = await m.h.request("/api/account/apps", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(byToken.status).toBe(403);
    expect((await jsonOf(byToken))["code"]).toBe("request.forbidden");
    const nobody = await m.h.request("/api/account/apps");
    expect(nobody.status).toBe(401);
    expect((await jsonOf(nobody))["code"]).toBe("auth.required");
  });
});

describe("DELETE /api/account/apps/<id>", () => {
  it("revokes a grant: 204, its tokens refused at once, and the list no longer holds it", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const { clientId, tokens } = await connectApp(m.h, cookie);
    await listTools(m.h, tokens.access_token);
    const [app] = await appsOf(m, cookie);
    const response = await revoke(m, cookie, app!.id);
    expect(response.status).toBe(204);
    expect(await appsOf(m, cookie)).toEqual([]);
    expect(await m.h.store.appUses(ANA)).toEqual(new Map());
    const refused = await listTools(m.h, tokens.access_token);
    expect(refused.status).toBe(401);
    // The refresh token went with it.
    const refreshed = await m.h.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token!,
        client_id: clientId,
      }),
    });
    expect(refreshed.status).toBe(400);
  });

  it("answers 404 not-found for a grant that is not the person's, or no grant at all, and revokes nothing", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const { cookie: bob } = await m.h.signedIn({ sub: "u-bob" });
    const { tokens } = await connectApp(m.h, cookie);
    const [app] = await appsOf(m, cookie);
    for (const id of ["nope", app!.id, "../grant", "x".repeat(65)]) {
      const response = await revoke(m, bob, id);
      expect(response.status, id).toBe(404);
      expect((await jsonOf(response))["code"], id).toBe("not-found");
    }
    expect((await listTools(m.h, tokens.access_token)).status).toBe(200);
  });

  it("is refused from another site, and with a token", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const { tokens } = await connectApp(m.h, cookie);
    const [app] = await appsOf(m, cookie);
    const foreign = await revoke(m, cookie, app!.id, "https://evil.example");
    expect(foreign.status).toBe(403);
    const byToken = await m.h.request(`/api/account/apps/${app!.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await m.token(ANA)}` },
    });
    expect(byToken.status).toBe(403);
    const byGrant = await m.h.request(`/api/account/apps/${app!.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(byGrant.status).toBe(401);
    expect(await appsOf(m, cookie)).toHaveLength(1);
  });
});

describe("the deletion of the account", () => {
  it("revokes every grant: both apps' tokens are refused from then on, and a later grant is left to a person who came back", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const first = await connectApp(m.h, cookie, { name: "Codex" });
    const second = await connectApp(m.h, cookie, { name: "Claude" });
    advance(m, 1000);
    const at = m.h.clock.now().toISOString();
    advance(m, 1000);
    const response = await deleted(m, ANA, at);
    expect(response.status).toBe(200);
    for (const tokens of [first.tokens, second.tokens]) {
      expect((await listTools(m.h, tokens.access_token)).status).toBe(401);
    }
    const keys = m.h.oauth.keys();
    expect(keys.filter((key) => key.startsWith("grant:") || key.startsWith("token:"))).toEqual([]);

    // The same person signs in again and connects an app: a late repeat of the event leaves it.
    advance(m, 60_000);
    const { cookie: again } = await m.h.signedIn({ sub: ANA });
    const third = await connectApp(m.h, again, { name: "Codex" });
    expect((await deleted(m, ANA, at)).status).toBe(200);
    expect((await listTools(m.h, third.tokens.access_token)).status).toBe(200);
  });

  it("refuses a grant approved before the deletion even while its revocation has not run", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const { tokens } = await connectApp(m.h, cookie);
    advance(m, 1000);
    // The rows say the account was deleted; the grants are still in the namespace.
    await m.h.store.applyUserDeleted("evt-direct", ANA, m.h.clock.now().toISOString());
    expect((await listTools(m.h, tokens.access_token)).status).toBe(401);
  });
});
