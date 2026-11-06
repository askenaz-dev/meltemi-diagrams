import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testJwks } from "@meltemi/identity/testing";
import { administrationFetch } from "../src/administration-service.js";
import { cloud } from "../src/handler.js";
import { MAX_JSON_BYTES } from "../src/http.js";
import type { LocalInstance } from "../src/types.js";
import { createAdministrationVerifier } from "../src/verifier.js";
import worker from "../src/worker-handler.js";
import { administrationHarness, BRIDGE_OWNER } from "./support/administration.js";
import { jsonOf } from "./support/index.js";
import { addToken, bearer, withClaims } from "./support/who.js";

afterEach(() => vi.restoreAllMocks());

describe("private administration authentication and context", () => {
  it("accepts a real live session and returns only the minimal owner context", async () => {
    const b = await administrationHarness();
    const response = await b.send(b.owner.token, "GET", "/context");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ role: "owner", invitation: null });
    expect(b.h.identity.calls.filter((call) => call.includes("/sessions/"))).toHaveLength(2);
  });

  it("gives an ordinary authenticated person no administrative role", async () => {
    const b = await administrationHarness();
    const ordinary = await b.credentials("ordinary");
    const response = await b.send(ordinary.token, "GET", "/context");
    expect(await response.json()).toEqual({ role: "none", invitation: null });
    expect((await b.send(ordinary.token, "GET", "/api/admin")).status).toBe(404);
  });

  it("uses only the bearer, ignoring caller cookie, origin, host and invented actor headers", async () => {
    const b = await administrationHarness();
    const ordinary = await b.credentials("ordinary");
    const headers = {
      Cookie: b.owner.cookie,
      Origin: "https://evil.example",
      Host: "evil.example",
      "X-Admin-Role": "owner",
      "X-Admin-Sub": BRIDGE_OWNER,
    };
    expect(
      await (await b.send(ordinary.token, "GET", "/context", undefined, headers)).json(),
    ).toEqual({
      role: "none",
      invitation: null,
    });
    expect(
      (
        await b.send(
          ordinary.token,
          "POST",
          "/api/admin/invitations",
          { email: "a@example.com" },
          headers,
        )
      ).status,
    ).toBe(404);
    expect(await b.h.store.adminLog(100)).toEqual([]);
  });

  it("does not authenticate cookies, API tokens or forged and oversized session JWTs", async () => {
    const b = await administrationHarness();
    const { token: apiToken } = await addToken(b.h.store, { sub: BRIDGE_OWNER });
    const badAuthorizations = [
      undefined,
      `Bearer ${apiToken}`,
      `Bearer ${withClaims(b.owner.token, { sub: "forged-owner" })}`,
      `Bearer ${"a".repeat(4097)}`,
      "Bearer a.b",
      `Basic ${b.owner.token}`,
    ];
    for (const authorization of badAuthorizations) {
      const headers = new Headers({ Cookie: b.owner.cookie, "X-Admin-Sub": BRIDGE_OWNER });
      if (authorization !== undefined) headers.set("Authorization", authorization);
      const response = await administrationFetch(
        new Request(`${b.h.env.ORIGIN}/context`, { headers }),
        b.h.env,
        b.deps,
      );
      expect(response.status).toBe(401);
      expect(await jsonOf(response)).toMatchObject({ code: "auth.required" });
    }
    expect(await b.h.store.adminLog(100)).toEqual([]);
  });

  it("refuses a revoked session immediately after a successful request", async () => {
    const b = await administrationHarness();
    expect((await b.send(b.owner.token, "GET", "/context")).status).toBe(200);
    b.h.identity.revoked.add(b.owner.sid);
    const response = await b.send(b.owner.token, "POST", "/api/admin/invitations", {
      email: "a@example.com",
    });
    expect(response.status).toBe(401);
    expect(await b.h.store.adminLog(100)).toEqual([]);
  });

  it("refuses an expired session and an unreachable identity service", async () => {
    const b = await administrationHarness();
    b.h.clock.advance(31 * 24 * 60 * 60 * 1000);
    expect((await b.send(b.owner.token, "GET", "/context")).status).toBe(401);
    const current = await b.credentials(BRIDGE_OWNER);
    b.h.identity.down = true;
    expect((await b.send(current.token, "GET", "/context")).status).toBe(401);
  });

  it("never uses development's fail-open session check", async () => {
    const b = await administrationHarness({ env: { DEV: "true" } });
    const env = { ...b.h.env, IDENTITY_JWKS: JSON.stringify(testJwks(b.h.keys)) };
    const deps = { ...b.deps, verifier: createAdministrationVerifier(env, b.h.identity.fetch) };
    b.h.identity.down = true;
    const response = await administrationFetch(
      new Request(`${env.ORIGIN}/context`, bearer(b.owner.token)),
      env,
      deps,
    );
    expect(response.status).toBe(401);
    expect(b.h.identity.calls.some((call) => call.includes("/sessions/"))).toBe(true);
    expect(b.h.identity.calls.some((call) => call.includes("jwks"))).toBe(false);
  });

  it("preserves the deleted-user guard and does not recreate a deleted account", async () => {
    const b = await administrationHarness();
    expect((await b.send(b.owner.token, "GET", "/context")).status).toBe(200);
    b.h.clock.advance(1);
    await b.h.store.applyUserDeleted(
      "event-delete-owner",
      BRIDGE_OWNER,
      b.h.clock.now().toISOString(),
    );
    expect((await b.send(b.owner.token, "GET", "/context")).status).toBe(401);
    expect(await b.h.store.user(BRIDGE_OWNER)).toBeUndefined();
  });
});

describe("private administration request boundary", () => {
  it.each([
    ["GET", "https://evil.example/context"],
    ["GET", "/context?role=owner"],
    ["GET", "/context#owner"],
    ["GET", "https://name:password@diagrams.meltemi.dev/context"],
    ["GET", "/api/session"],
    ["GET", "/api/projects"],
    ["PATCH", "/api/admin"],
    ["constructor", "/api/admin"],
    ["toString", "/api/admin"],
    ["__proto__", "/api/admin"],
    ["POST", "/api/admin"],
    ["GET", "/api/admin/../projects"],
    ["PUT", "/api/admin/accounts/a%2Fb/permissions/unbranded-exports"],
    ["PUT", "/api/admin/accounts/a%5Cb/permissions/unbranded-exports"],
    ["PUT", "/api/admin/accounts/a%00b/permissions/unbranded-exports"],
    ["GET", "/api/admin/permissions/%zz"],
  ])("refuses %s %s without business writes", async (method, path) => {
    const b = await administrationHarness();
    // The Request standard rejects URL credentials before the adapter can see them.
    if (path.includes("name:password@")) {
      expect(() => new Request(path)).toThrow();
      return;
    }
    const response = await b.send(b.owner.token, method, path);
    expect(response.status).toBe(404);
    expect(await b.h.store.adminLog(100)).toEqual([]);
  });

  it.each([
    ["not json", "application/json"],
    ["[]", "application/json"],
    ["null", "application/json"],
    ['{"email":"a@example.com"}', "text/plain"],
    [" ".repeat(MAX_JSON_BYTES + 1), "application/json"],
    ["🌊".repeat(MAX_JSON_BYTES / 4 + 1), "application/json"],
  ])("rejects malformed or oversized bodies with %s/%s", async (body, type) => {
    const b = await administrationHarness();
    const response = await administrationFetch(
      new Request(`${b.h.env.ORIGIN}/api/admin/invitations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${b.owner.token}`, "Content-Type": type },
        body,
      }),
      b.h.env,
      b.deps,
    );
    expect(response.status).toBe(400);
    expect(await jsonOf(response)).toMatchObject({ code: "request.invalid" });
    expect(await b.h.store.adminLog(100)).toEqual([]);
  });

  it("accepts a JSON object at exactly the byte limit and delegates field validation", async () => {
    const b = await administrationHarness();
    const body = JSON.stringify({ email: "a@example.com" });
    const response = await administrationFetch(
      new Request(`${b.h.env.ORIGIN}/api/admin/invitations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${b.owner.token}`,
          "Content-Type": "application/json;charset=utf-8",
        },
        body: body + " ".repeat(MAX_JSON_BYTES - new TextEncoder().encode(body).length),
      }),
      b.h.env,
      b.deps,
    );
    expect(response.status).toBe(201);
  });

  it("rejects an excessive declared body length even if its stream is small", async () => {
    const b = await administrationHarness();
    const response = await administrationFetch(
      new Request(`${b.h.env.ORIGIN}/api/admin/invitations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${b.owner.token}`,
          "Content-Type": "application/json",
          "Content-Length": String(MAX_JSON_BYTES + 1),
        },
        body: "{}",
      }),
      b.h.env,
      b.deps,
    );
    expect(response.status).toBe(400);
  });

  it("binds the destination to staging configuration rather than a caller host", async () => {
    const b = await administrationHarness({
      env: { ORIGIN: "https://staging.diagrams.meltemi.dev", PRODUCT_NAME: "diagrams-staging" },
    });
    expect((await b.send(b.owner.token, "GET", "/context")).status).toBe(200);
    expect(
      (await b.send(b.owner.token, "GET", "https://diagrams.meltemi.dev/context")).status,
    ).toBe(404);
  });
});

describe("private administration platform isolation", () => {
  it("does not expose context through the default public handler or invented proxy headers", async () => {
    const b = await administrationHarness();
    const headers = {
      Authorization: `Bearer ${b.owner.token}`,
      "X-Worker-Entrypoint": "Administration",
      "X-Admin-Bridge": "true",
    };
    const response = await worker.fetch(
      new Request(`${b.h.env.ORIGIN}/context`, { headers }),
      b.h.env,
    );
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('"role"');
    expect((await b.h.request("/api/admin", bearer(b.owner.token))).status).toBe(401);
  });

  it("keeps local requests tokenless and administration unavailable", async () => {
    const b = await administrationHarness({ env: { ORIGIN: "http://127.0.0.1:8788" } });
    const profile = {
      sub: "local-owner",
      name: "Local workspace",
      picture: "",
      email: "",
      emailVerified: false,
    };
    const local: LocalInstance = {
      origin: b.h.env.ORIGIN,
      principal: { via: "local", sub: profile.sub, profile },
      defaultProject: {
        id: "localproject234567ab",
        url: `${b.h.env.ORIGIN}/?project=localproject234567ab`,
      },
    };
    const deps = { ...b.deps, local };
    const response = await cloud(new Request(`${b.h.env.ORIGIN}/api/admin`), b.h.env, deps);
    expect(response.status).toBe(409);
    expect(await jsonOf(response)).toMatchObject({ code: "local.feature-unavailable" });
    expect(
      (await administrationFetch(new Request(`${b.h.env.ORIGIN}/context`), b.h.env, deps)).status,
    ).toBe(409);
    expect(b.h.identity.calls).toEqual([]);
  });

  it("exports Administration only from the hosted platform entry", () => {
    const hosted = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
    const local = readFileSync(new URL("../src/worker-local.ts", import.meta.url), "utf8");
    expect(hosted).toContain('export { Administration } from "./administration-entry.js"');
    expect(local).not.toMatch(/Administration|administration-entry|administration-service/);
  });

  it("does not log a verifier exception that might quote its bearer", async () => {
    const b = await administrationHarness();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = {
      ...b.deps,
      verifier: {
        verifySession: async () => {
          throw new Error(b.owner.token);
        },
      },
    };
    const response = await administrationFetch(
      new Request(`${b.h.env.ORIGIN}/context`, bearer(b.owner.token)),
      b.h.env,
      deps,
    );
    expect(response.status).toBe(500);
    expect(log.mock.calls.flat().join(" ")).not.toContain(b.owner.token);
    expect(await response.text()).not.toContain(b.owner.token);
  });
});
