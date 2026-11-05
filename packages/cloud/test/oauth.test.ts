// The authorization server of the MCP endpoint (`mcp-authorization`), through the Worker in this
// process (`cloud()`) and an in-memory KV namespace: the metadata, the challenge, dynamic
// registration and its rate, the consent page in both languages, PKCE, the tokens and their
// lifetimes, scopes against roles, and the rule that an OAuth token opens `/mcp` only.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { jsonOf } from "./support/index.js";
import { call, mcp, ok, refused, type Mcp } from "./support/mcp.js";
import {
  ALL_SCOPES,
  CALLBACK,
  authorizeQuery,
  callbackOf,
  connectApp,
  consent,
  decide,
  exchange,
  listTools,
  mcpClient,
  pkce,
  register,
  tokenRequest,
  type Tokens,
} from "./support/oauth.js";

const ANA = "u-ana";
const BOB = "u-bob";
const T = "2026-10-14T12:00:00.000Z";
const HOUR = 60 * 60 * 1000;
const ORIGIN = "https://diagrams.meltemi.dev";
const FLOW = readFileSync(
  join(REPO_ROOT, "corpus", "acceptance", "flow", "cycles.meltemi"),
  "utf8",
);

beforeEach(() => {
  // The library tells time by `Date`, the service by the harness's clock: both start at T.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(T) });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Moves both clocks. */
function advance(m: Mcp, ms: number): void {
  m.h.clock.advance(ms);
  vi.setSystemTime(m.h.clock.now());
}

async function signedIn(sub = ANA): Promise<{ m: Mcp; cookie: string }> {
  const m = await mcp();
  const { cookie } = await m.h.signedIn({ sub, name: "Ana" });
  return { m, cookie };
}

/** The OAuth clients the namespace holds. */
const clientsIn = (m: Mcp) =>
  (m.h.env.OAUTH_KV as unknown as { keys(): string[] })
    .keys()
    .filter((k) => k.startsWith("client:"));

describe("discovery", () => {
  it("answers the server's metadata: S256, registration, client-id documents, public clients, codes and refresh tokens", async () => {
    const m = await mcp();
    const response = await m.h.request("/.well-known/oauth-authorization-server");
    expect(response.status).toBe(200);
    const metadata = await jsonOf<Record<string, unknown>>(response);
    expect(metadata).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      response_types_supported: ["code"],
    });
    expect(metadata["token_endpoint_auth_methods_supported"]).toContain("none");
    expect(metadata["grant_types_supported"]).toEqual(
      expect.arrayContaining(["authorization_code", "refresh_token"]),
    );
    expect(metadata["grant_types_supported"]).not.toContain("client_credentials");
    expect(metadata["scopes_supported"]).toEqual([
      "projects:read",
      "projects:write",
      "sharing",
      "live",
      "publish",
      "offline_access",
    ]);
  });

  it("answers the endpoint's metadata at its own path and at the origin's: the resource, the server, the five scopes, the header", async () => {
    const m = await mcp();
    for (const path of [
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-protected-resource",
    ]) {
      const response = await m.h.request(path);
      expect(response.status, path).toBe(200);
      expect(await jsonOf(response), path).toMatchObject({
        resource: `${ORIGIN}/mcp`,
        authorization_servers: [ORIGIN],
        scopes_supported: ["projects:read", "projects:write", "sharing", "live", "publish"],
        bearer_methods_supported: ["header"],
      });
    }
    // Another resource's document is not one this server keeps.
    expect((await m.h.request("/.well-known/oauth-protected-resource/other")).status).toBe(404);
  });
});

describe("the challenge", () => {
  it("answers /mcp without a token, with a malformed one and with a JWT of the identity service 401, naming the metadata", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const jwt = cookie.slice("meltemi_session=".length);
    for (const bearer of [undefined, "not-a-token", jwt, "u-ana:AAAAAAAAAAAAAAAA:xyz"]) {
      const response = await listTools(m.h, bearer);
      expect(response.status, String(bearer)).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain(
        `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`,
      );
    }
  });
});

describe("registration", () => {
  it("registers a public client by dynamic registration, and an address's eleventh within the hour is 429 with nothing registered", async () => {
    const m = await mcp();
    for (let i = 0; i < 10; i++) {
      const { response, clientId } = await register(m.h, { client_name: `Codex ${i}` });
      expect(response.status, String(i)).toBe(201);
      expect(clientId).not.toBe("");
    }
    expect(clientsIn(m)).toHaveLength(10);
    const flooded = await register(m.h);
    expect(flooded.response.status).toBe(429);
    expect(flooded.response.headers.get("Retry-After")).toBe("3600");
    expect((await jsonOf(flooded.response))["code"]).toBe("rate.limited");
    expect(clientsIn(m)).toHaveLength(10);
    // Another address registers; the first does again an hour later.
    expect((await register(m.h, {}, "203.0.113.10")).response.status).toBe(201);
    advance(m, HOUR + 1000);
    expect((await register(m.h)).response.status).toBe(201);
  });
});

describe("the consent", () => {
  it("validates the request first: an unknown client is a page, a wrong resource reaches no consent, and a signed-out person signs in and comes back", async () => {
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h);
    const pair = pkce();

    const unknown = await m.h.request(
      `/oauth/authorize?${authorizeQuery(m.h, "nobody-registered-this", pair.challenge)}`,
      { headers: { Cookie: cookie } },
    );
    expect(unknown.status).toBe(400);
    expect(unknown.headers.get("Location")).toBeNull();
    expect(await unknown.text()).toContain("request.invalid");

    const wrong = await m.h.request(
      `/oauth/authorize?${authorizeQuery(m.h, clientId, pair.challenge, { resource: "https://other.example/mcp" })}`,
      { headers: { Cookie: cookie } },
    );
    expect(wrong.status).not.toBe(200);
    const location = wrong.headers.get("Location");
    if (location !== null) {
      const back = new URL(location).searchParams;
      expect(back.get("error")).toBe("invalid_target");
      expect(back.get("code")).toBeNull();
    }
    expect(wrong.headers.getSetCookie()).toEqual([]);

    const query = authorizeQuery(m.h, clientId, pair.challenge);
    const anonymous = await m.h.request(`/oauth/authorize?${query}`);
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get("Location")).toBe(
      `https://id.meltemi.dev/login?return_to=${encodeURIComponent(`${ORIGIN}/oauth/authorize?${query}`)}`,
    );
  });

  it("refuses PKCE without S256: the client is told invalid_request, and no page is shown", async () => {
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h);
    for (const extra of [
      { code_challenge_method: "plain", code_challenge: "x".repeat(43) },
      { code_challenge_method: "", code_challenge: "" },
    ]) {
      const response = await m.h.request(
        `/oauth/authorize?${authorizeQuery(m.h, clientId, "c", extra)}`,
        { headers: { Cookie: cookie } },
      );
      expect(response.status).toBe(302);
      const back = new URL(response.headers.get("Location") ?? "").searchParams;
      expect(back.get("error")).toBe("invalid_request");
      expect(back.get("code")).toBeNull();
    }
  });

  it("shows the client, its host, each scope in words, and Approve and Deny, in English", async () => {
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h);
    const page = await consent(m.h, cookie, authorizeQuery(m.h, clientId, pkce().challenge));
    expect(page.response.status).toBe(200);
    expect(page.html).toContain('<html lang="en">');
    expect(page.html).toContain('<span class="client-name">Codex</span>');
    expect(page.html).toContain("This app registered itself: its name is not verified.");
    expect(page.html).toContain("If you approve, access is sent to <strong>127.0.0.1</strong>.");
    expect(page.html).toContain("An app on this computer");
    for (const words of [
      "Read your projects",
      "Change your projects",
      "Share your projects",
      "Run live sessions",
      "Publish catalogs",
      "Stay connected",
    ]) {
      expect(page.html, words).toContain(`<strong>${words}</strong>`);
    }
    expect(page.html).toContain('value="approve">Approve</button>');
    expect(page.html).toContain('value="deny">Deny</button>');
    expect(page.handle).not.toBe("");
    expect(page.csrf).toMatch(/^[0-9a-f]{64}$/);
    expect(page.binding).toMatch(/^__Host-oauth-consent-/);
    const policy = page.response.headers.get("Content-Security-Policy") ?? "";
    expect(policy).toContain("form-action 'self' http://127.0.0.1:1455");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(page.response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(page.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("speaks Spanish to a Spanish browser", async () => {
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h);
    const page = await consent(m.h, cookie, authorizeQuery(m.h, clientId, pkce().challenge), {
      "Accept-Language": "es-CL,es;q=0.9",
    });
    expect(page.html).toContain('<html lang="es">');
    expect(page.html).toContain('¿Permitir que <span class="client-name">Codex</span>');
    expect(page.html).toContain("<strong>Leer tus proyectos</strong>");
    expect(page.html).toContain('value="approve">Aprobar</button>');
    expect(page.html).toContain('value="deny">Denegar</button>');
    expect(page.html).toContain("Aplicaciones conectadas");
  });

  it("escapes what the client chose, and names only the scopes the server knows", async () => {
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h, { client_name: '<script>alert("x")</script>' });
    const page = await consent(
      m.h,
      cookie,
      authorizeQuery(m.h, clientId, pkce().challenge, { scope: "projects:read admin:everything" }),
    );
    expect(page.html).not.toContain("<script>");
    expect(page.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(page.html).toContain("Read your projects");
    expect(page.html).not.toContain("Change your projects");
    expect(page.html).not.toContain("admin:everything");
  });

  it("names the domain of a client whose id is its metadata document", async () => {
    const { m, cookie } = await signedIn();
    const document = "https://agent.example/oauth/client.json";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input instanceof Request ? input.url : input) !== document) {
        throw new Error(`no test reaches ${String(input)}`);
      }
      return new Response(
        JSON.stringify({
          client_id: document,
          client_name: "Agent",
          redirect_uris: [CALLBACK],
          token_endpoint_auth_method: "none",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    const page = await consent(m.h, cookie, authorizeQuery(m.h, document, pkce().challenge));
    expect(page.response.status).toBe(200);
    expect(page.html).toContain("Published by <strong>agent.example</strong>");
    expect(page.html).not.toContain("its name is not verified");
  });

  it("refuses a form without its csrf, with another session's, or from another site, and approves nothing", async () => {
    const { m, cookie } = await signedIn();
    const { cookie: other } = await m.h.signedIn({ sub: BOB, sid: "sid-bob" });
    const { clientId } = await register(m.h);
    const page = await consent(m.h, cookie, authorizeQuery(m.h, clientId, pkce().challenge));
    expect((await decide(m.h, cookie, page, "approve", { csrf: "" })).status).toBe(403);
    expect((await decide(m.h, cookie, page, "approve", { csrf: "0".repeat(64) })).status).toBe(403);
    expect((await decide(m.h, other, page, "approve")).status).toBe(403);
    const foreign = await m.h.request(page.action, {
      method: "POST",
      headers: {
        Cookie: `${cookie}; ${page.binding}`,
        Origin: "https://evil.example",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ handle: page.handle, csrf: page.csrf, decision: "approve" }),
    });
    expect(foreign.status).toBe(403);
    // The page still works: nothing above used it.
    const approved = await decide(m.h, cookie, page, "approve");
    expect(approved.status).toBe(303);
    expect(callbackOf(approved).get("code")).toBeTruthy();
  });

  it("denied: the client gets access_denied with its state, and no grant or token exists", async () => {
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h);
    const page = await consent(m.h, cookie, authorizeQuery(m.h, clientId, pkce().challenge));
    const denied = await decide(m.h, cookie, page, "deny");
    expect(denied.status).toBe(303);
    const back = callbackOf(denied);
    expect(back.get("error")).toBe("access_denied");
    expect(back.get("state")).toBe("state-1234567890");
    expect(back.get("iss")).toBe(ORIGIN);
    expect(back.get("code")).toBeNull();
    const apps = await m.h.request("/api/account/apps", { headers: { Cookie: cookie } });
    expect(await jsonOf(apps)).toEqual({ grants: [] });
    const keys = (m.h.env.OAUTH_KV as unknown as { keys(): string[] }).keys();
    expect(keys.filter((k) => k.startsWith("grant:") || k.startsWith("token:"))).toEqual([]);
    // The page works once.
    expect((await decide(m.h, cookie, page, "approve")).status).toBe(400);
  });

  it("works once, for ten minutes, in the browser that opened it", async () => {
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h);
    const query = authorizeQuery(m.h, clientId, pkce().challenge);
    const page = await consent(m.h, cookie, query);
    // Another browser of the same person: the same session, not the page's cookie.
    const elsewhere = await m.h.request(page.action, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ handle: page.handle, csrf: page.csrf, decision: "approve" }),
    });
    expect(elsewhere.status).toBe(400);
    expect(await elsewhere.text()).toContain("This page expired");
    const late = await consent(m.h, cookie, query);
    advance(m, 11 * 60 * 1000);
    const expired = await decide(m.h, cookie, late, "approve");
    expect(expired.status).toBe(400);
  });
});

describe("tokens", () => {
  it("the whole flow: a code for PKCE, an access token of an hour and a refresh token, which opens /mcp as the person", async () => {
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h);
    const pair = pkce();
    const page = await consent(m.h, cookie, authorizeQuery(m.h, clientId, pair.challenge));
    const approved = await decide(m.h, cookie, page, "approve");
    expect(approved.status).toBe(303);
    expect(approved.headers.getSetCookie().join("\n")).toMatch(/__Host-oauth-consent-[^=]+=;/);
    const back = callbackOf(approved);
    expect(back.get("state")).toBe("state-1234567890");
    expect(back.get("iss")).toBe(ORIGIN);
    const code = back.get("code")!;

    // A wrong verifier is refused, and does not spend the code.
    const wrong = await exchange(m.h, clientId, code, pkce().verifier);
    expect(wrong.status).toBe(400);
    expect((await jsonOf(wrong))["error"]).toBe("invalid_grant");

    const response = await exchange(m.h, clientId, code, pair.verifier);
    expect(response.status).toBe(200);
    const tokens = await jsonOf<Tokens>(response);
    expect(tokens).toMatchObject({ token_type: "bearer", expires_in: 3600 });
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope.split(" ").sort()).toEqual(
      `${ALL_SCOPES} offline_access`.split(" ").sort(),
    );

    const client = await mcpClient(m.h, tokens.access_token);
    expect(ok(await call(client, "whoami"))).toMatchObject({
      sub: ANA,
      scopes: ["projects:read", "projects:write", "sharing", "live", "publish"],
    });
    const made = ok<{ id: string }>(
      await call(client, "create_project", { name: "By Codex", files: { "a.meltemi": FLOW } }),
    );
    const listed = await m.sendJson(ANA, "GET", `/api/projects/${made.id}`, undefined);
    expect(listed.status).toBe(200);

    // The code works once. A second exchange is a stolen code being replayed, as OAuth 2.1 says:
    // the grant it made is revoked with it, and the token it gave stops working too.
    const again = await exchange(m.h, clientId, code, pair.verifier);
    expect(again.status).toBe(400);
    expect((await jsonOf(again))["error"]).toBe("invalid_grant");
    expect((await listTools(m.h, tokens.access_token)).status).toBe(401);
  });

  it("rotates refresh tokens: a new pair, and the old one refused once its replacement was used", async () => {
    const { m, cookie } = await signedIn();
    const { clientId, tokens } = await connectApp(m.h, cookie);
    const refresh = (token: string) =>
      tokenRequest(m.h, { grant_type: "refresh_token", refresh_token: token, client_id: clientId });
    const first = await refresh(tokens.refresh_token!);
    expect(first.status).toBe(200);
    const next = await jsonOf<Tokens>(first);
    expect(next.refresh_token).toBeTruthy();
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect(next.access_token).not.toBe(tokens.access_token);
    expect((await listTools(m.h, next.access_token)).status).toBe(200);
    const after = await refresh(next.refresh_token!);
    expect(after.status).toBe(200);
    const stale = await refresh(tokens.refresh_token!);
    expect(stale.status).toBe(400);
    expect((await jsonOf(stale))["error"]).toBe("invalid_grant");
  });

  it("gives no refresh token without offline_access", async () => {
    const { m, cookie } = await signedIn();
    const { tokens } = await connectApp(m.h, cookie, { scope: ALL_SCOPES });
    expect(tokens.refresh_token).toBeUndefined();
    expect(tokens.scope.split(" ")).not.toContain("offline_access");
  });

  it("refuses an access token past its hour with 401", async () => {
    const { m, cookie } = await signedIn();
    const { tokens } = await connectApp(m.h, cookie);
    advance(m, HOUR - 1000);
    expect((await listTools(m.h, tokens.access_token)).status).toBe(200);
    advance(m, 2000);
    const expired = await listTools(m.h, tokens.access_token);
    expect(expired.status).toBe(401);
    expect(expired.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  it("never opens /api/* with an OAuth token: 401 token.invalid", async () => {
    const { m, cookie } = await signedIn();
    const { tokens } = await connectApp(m.h, cookie);
    for (const path of ["/api/projects", "/api/session", "/api/tokens", "/api/account/apps"]) {
      const response = await m.h.request(path, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      expect(response.status, path).toBe(401);
      expect((await jsonOf(response))["code"], path).toBe("token.invalid");
    }
  });

  it("keeps a token, a code and a verifier out of everything the Worker logs", async () => {
    const said: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        said.push(args.map(String).join(" "));
      });
    }
    const { m, cookie } = await signedIn();
    const { clientId } = await register(m.h);
    const pair = pkce();
    const page = await consent(m.h, cookie, authorizeQuery(m.h, clientId, pair.challenge));
    const code = callbackOf(await decide(m.h, cookie, page, "approve")).get("code")!;
    await exchange(m.h, clientId, code, pkce().verifier);
    const tokens = await jsonOf<Tokens>(await exchange(m.h, clientId, code, pair.verifier));
    await listTools(m.h, tokens.access_token);
    await listTools(m.h, `${tokens.access_token}x`);
    const log = said.join("\n");
    for (const secret of [
      code,
      pair.verifier,
      tokens.access_token,
      tokens.refresh_token!,
      page.handle,
    ]) {
      expect(log).not.toContain(secret);
    }
    // What the library keeps is hashed or encrypted: no token in clear in the namespace either.
    const stored = (m.h.env.OAUTH_KV as unknown as { written: string[] }).written.join("\n");
    for (const secret of [code, tokens.access_token, tokens.refresh_token!]) {
      expect(stored).not.toContain(secret);
    }
  });
});

describe("scopes against roles", () => {
  it("refuses write_files to a read-only token with scope.insufficient naming projects:write, and nothing changes", async () => {
    const { m, cookie } = await signedIn();
    const id = await m.create(ANA, { name: "Read only" });
    const { tokens } = await connectApp(m.h, cookie, { scope: "projects:read" });
    expect(tokens.scope).toBe("projects:read");
    const client = await mcpClient(m.h, tokens.access_token);
    expect(ok(await call(client, "whoami"))).toMatchObject({ scopes: ["projects:read"] });
    expect(ok(await call(client, "get_project", { project: id }))).toMatchObject({ id });
    expect(
      refused(
        await call(client, "write_files", {
          project: id,
          files: { "a.meltemi": FLOW },
          ifRevision: 0,
        }),
      ),
    ).toMatchObject({ code: "scope.insufficient", scope: "projects:write" });
    const files = await m.sendJson(ANA, "GET", `/api/projects/${id}/files`, undefined);
    expect((await jsonOf<{ files: Record<string, string> }>(files)).files).toEqual({});
  });

  it("gives an editor with every scope the role's refusal for set_link_access, since sharing is the owner's", async () => {
    const m = await mcp();
    const id = await m.create(ANA, { name: "Shared" });
    const invited = await m.sendJson(ANA, "POST", `/api/projects/${id}/members`, {
      email: "bob@example.com",
      role: "editor",
    });
    const link = (await jsonOf<{ link: string }>(invited)).link;
    const accepted = await m.sendJson(
      BOB,
      "POST",
      `/api/invitations/${new URL(link).searchParams.get("invite")}/accept`,
      {},
    );
    expect(accepted.status).toBe(200);
    const { cookie } = await m.h.signedIn({ sub: BOB });
    const { tokens } = await connectApp(m.h, cookie);
    const bob = await mcpClient(m.h, tokens.access_token);
    expect(
      ok(
        await call(bob, "write_files", { project: id, files: { "b.md": "by bob" }, ifRevision: 0 }),
      ),
    ).toBeDefined();
    expect(
      refused(await call(bob, "set_link_access", { project: id, level: "view" })),
    ).toMatchObject({ code: "access.denied" });
  });

  it("lets a mdg_ token open the endpoint with every scope, as its account", async () => {
    const m = await mcp();
    const client = await m.connect(await m.token(ANA));
    expect(ok(await call(client, "whoami"))).toMatchObject({
      sub: ANA,
      scopes: ["projects:read", "projects:write", "sharing", "live", "publish"],
    });
    // The token endpoint takes nothing the server did not issue.
    const foreign = await tokenRequest(m.h, {
      grant_type: "refresh_token",
      refresh_token: await m.token(ANA, "second"),
      client_id: "nobody",
    });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect(foreign.status).toBeLessThan(500);
  });
});
