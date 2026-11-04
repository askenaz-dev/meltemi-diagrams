// The identity data through the Worker (`cloud-accounts`, "The identity data through the Worker"):
// the page asks its own origin; the Worker calls the identity service's account API on the person's
// behalf, signed as this product and carrying the person's session token, and answers in this
// service's own shape.

import { verifyProductRequest } from "@meltemi/identity";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IDENTITY_TIMEOUT_MS } from "../src/routes/account.js";
import { harness, jsonOf, type Harness } from "./support/index.js";
import { codeOf } from "./support/projects.js";
import { addToken, bearer } from "./support/who.js";

const ISSUER = "https://id.meltemi.dev";
const SECRET = "test-events-secret";
const SID = "s".repeat(43);

const VIEW = {
  user: { id: "u1", name: "Ana", picture: "" },
  identities: [
    {
      provider: "github",
      email: "ana@example.com",
      emailVerified: true,
      handle: "ana-dev",
      linkedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  sessions: [
    {
      sid: "sid-u1",
      label: "Edge on Windows",
      createdAt: "2026-10-01T00:00:00.000Z",
      lastSeen: "2026-10-14T12:00:00.000Z",
      expiresAt: "2026-10-31T00:00:00.000Z",
      current: true,
    },
  ],
  canUnlink: false,
};

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | null;
  readonly product: string | undefined;
  readonly body: string;
}

const answer = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

/** The identity service's account API, answering `respond` and recording what it was sent. */
function account(
  h: Harness,
  respond: (seen: Seen) => Response | Promise<Response> = () => answer(VIEW),
) {
  const seen: Seen[] = [];
  h.identity.api = async (request, body) => {
    const signed = await verifyProductRequest(
      request,
      body,
      (name) => (name === "diagrams" ? SECRET : undefined),
      h.clock.now(),
    );
    const call: Seen = {
      method: request.method,
      url: request.url,
      authorization: request.headers.get("Authorization"),
      product: signed?.product,
      body,
    };
    seen.push(call);
    return respond(call);
  };
  return seen;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GET /api/account/identity", () => {
  it("calls the identity service as this product, with the person's token, and answers its view", async () => {
    const h = await harness();
    const seen = account(h);
    const { cookie } = await h.signedIn({ sub: "u1" });

    const response = await h.request("/api/account/identity", { headers: { Cookie: cookie } });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual(VIEW);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: "GET",
      url: `${ISSUER}/api/account`,
      authorization: `Bearer ${cookie.slice("meltemi_session=".length)}`,
      product: "diagrams",
      body: "",
    });
  });

  it("answers nothing to nobody", async () => {
    const h = await harness();
    const seen = account(h);
    const response = await h.request("/api/account/identity");
    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe("auth.required");
    expect(seen).toEqual([]);
  });

  it("refuses an API token: the account is managed from the page", async () => {
    const h = await harness();
    const seen = account(h);
    const { token } = await addToken(h.store, { sub: "u1" });
    const response = await h.request("/api/account/identity", bearer(token));
    expect(response.status).toBe(403);
    expect(await codeOf(response)).toBe("request.forbidden");
    expect(seen).toEqual([]);
  });

  it("says the identity service is unavailable when it cannot be reached, and logs no body", async () => {
    const h = await harness();
    account(h);
    const { cookie } = await h.signedIn({ sub: "u1" });
    // The cookie is verified first (keys and session check), then the service goes away.
    await h.request("/api/session", { headers: { Cookie: cookie } });
    h.identity.down = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await h.request("/api/account/identity", { headers: { Cookie: cookie } });

    expect(response.status).toBe(502);
    expect(await codeOf(response)).toBe("identity.unavailable");
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("GET /api/account");
  });

  it("says it is unavailable when the service does not answer within five seconds", async () => {
    const h = await harness();
    account(h, () => new Promise<Response>(() => {}));
    const { cookie } = await h.signedIn({ sub: "u1" });
    await h.request("/api/session", { headers: { Cookie: cookie } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = h.request("/api/account/identity", { headers: { Cookie: cookie } });
    let settled = false;
    void pending.finally(() => (settled = true));
    // Signing runs in WebCrypto's own time, so the timer may start a little later: let real time
    // move between the fake steps until the answer comes.
    const began = Date.now();
    while (!settled && Date.now() - began < 20_000) {
      await new Promise((resume) => setImmediate(resume));
      await vi.advanceTimersByTimeAsync(IDENTITY_TIMEOUT_MS);
    }
    const response = await pending;

    expect(response.status).toBe(502);
    expect(await codeOf(response)).toBe("identity.unavailable");
  });

  it("says it is unavailable for an answer that is not JSON or not a view, and for a refused signature", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn({ sub: "u1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const reply of [
      () => new Response("<html>", { status: 200 }),
      () => answer({ user: null }),
      () => answer({ error: "product.unauthorized" }, 401),
      () => answer({ error: "internal" }, 500),
    ]) {
      account(h, reply);
      const response = await h.request("/api/account/identity", { headers: { Cookie: cookie } });
      expect(response.status).toBe(502);
      expect(await codeOf(response)).toBe("identity.unavailable");
    }
  });

  it("answers 401 auth.required when the identity service says the session ended", async () => {
    const h = await harness();
    account(h, () => answer({ error: "session.invalid" }, 401));
    const { cookie } = await h.signedIn({ sub: "u1" });
    const response = await h.request("/api/account/identity", { headers: { Cookie: cookie } });
    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe("auth.required");
  });
});

describe("the actions", () => {
  it("unlinks with the provider in a signed body, from the page", async () => {
    const h = await harness();
    const seen = account(h);
    const { cookie } = await h.signedIn({ sub: "u1" });
    const response = await h.request(
      "/api/account/identity/unlink",
      h.fromPage(cookie, { method: "POST", body: JSON.stringify({ provider: "google" }) }),
    );
    expect(response.status).toBe(200);
    expect(seen[0]).toMatchObject({
      method: "POST",
      url: `${ISSUER}/api/account/unlink`,
      product: "diagrams",
      body: '{"provider":"google"}',
    });
  });

  it("passes the refusals the page acts on through as this service's codes", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn({ sub: "u1" });
    for (const [code, status] of [
      ["identity.last", 409],
      ["provider.unknown", 400],
      ["rate.limited", 429],
    ] as const) {
      account(h, () => answer({ error: code }, status));
      const response = await h.request(
        "/api/account/identity/unlink",
        h.fromPage(cookie, { method: "POST", body: JSON.stringify({ provider: "github" }) }),
      );
      expect(response.status, code).toBe(status);
      expect(await codeOf(response)).toBe(code);
    }
  });

  it("refuses an unlink without a provider before calling", async () => {
    const h = await harness();
    const seen = account(h);
    const { cookie } = await h.signedIn({ sub: "u1" });
    const response = await h.request(
      "/api/account/identity/unlink",
      h.fromPage(cookie, { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("provider.unknown");
    expect(seen).toEqual([]);
  });

  it("signs out the other devices, and one device by its id", async () => {
    const h = await harness();
    const seen = account(h);
    const { cookie } = await h.signedIn({ sub: "u1" });
    const others = await h.request(
      "/api/account/identity/sessions/revoke-others",
      h.fromPage(cookie, { method: "POST" }),
    );
    expect(others.status).toBe(200);
    const one = await h.request(
      `/api/account/identity/sessions/${SID}/revoke`,
      h.fromPage(cookie, { method: "POST" }),
    );
    expect(one.status).toBe(200);
    expect(seen.map((call) => [call.method, call.url, call.body])).toEqual([
      ["POST", `${ISSUER}/api/account/sessions/revoke-others`, "{}"],
      ["POST", `${ISSUER}/api/account/sessions/${SID}/revoke`, "{}"],
    ]);
  });

  it("passes session.current and session.not-found through, and refuses an id that cannot be one", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn({ sub: "u1" });
    for (const [code, status] of [
      ["session.current", 409],
      ["session.not-found", 404],
    ] as const) {
      account(h, () => answer({ error: code }, status));
      const response = await h.request(
        `/api/account/identity/sessions/${SID}/revoke`,
        h.fromPage(cookie, { method: "POST" }),
      );
      expect(response.status).toBe(status);
      expect(await codeOf(response)).toBe(code);
    }
    const seen = account(h);
    const bad = await h.request(
      "/api/account/identity/sessions/a.b/revoke",
      h.fromPage(cookie, { method: "POST" }),
    );
    expect(bad.status).toBe(404);
    expect(await codeOf(bad)).toBe("session.not-found");
    expect(seen).toEqual([]);
  });

  it("applies the Origin rule: a post from another page changes nothing", async () => {
    const h = await harness();
    const seen = account(h);
    const { cookie } = await h.signedIn({ sub: "u1" });
    const response = await h.request("/api/account/identity/sessions/revoke-others", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://id.meltemi.dev" },
    });
    expect(response.status).toBe(403);
    expect(await codeOf(response)).toBe("request.forbidden");
    expect(seen).toEqual([]);
  });
});
