// The audit of the change cloud-accounts. Two kinds of test live here:
//
// - the scenarios of its three specifications whose THEN no other Node test asserts (the browser
//   suites assert some of them against a real Worker and a real browser);
// - the properties the security review rests on, written so that a later change cannot lose them
//   without a test saying so: which routes the `Origin` rule covers, what every family of answer
//   carries in its headers, where a token or a code may appear, which credential is which, and where
//   the development tools are read.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_STATUS } from "../src/errors.js";
import { ROUTES } from "../src/handler.js";
import { MAX_JSON_BYTES } from "../src/http.js";
import { MAX_FORM_BYTES } from "../src/routes/cli-auth.js";
import {
  approved,
  csrfOf,
  exchange,
  failTimes,
  fillTokens,
  queryOf,
  STATE,
} from "./support/cli-auth.js";
import { harness, jsonOf, type Harness } from "./support/index.js";
import { addToken, bearer, devVariant } from "./support/who.js";

const PACKAGE = fileURLToPath(new URL("../", import.meta.url));
const REPOSITORY = join(PACKAGE, "..", "..");
const ORIGIN = "https://diagrams.meltemi.dev";
const ISSUER = "https://id.meltemi.dev";
const JSON_TYPE = { "Content-Type": "application/json" };
const PROJECT = "01h2x5z8kq3m7n9p2r4t";

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("node:fs");
  vi.resetModules();
});

// ---------------------------------------------------------------------------------------------
// GET /api/session: the three shapes (cloud-accounts, "Users and the session answer")

interface SessionBody {
  user: { sub: string; name: string; picture: string; handle: string | null } | null;
  account?: string;
  signOut?: string;
  signIn?: string;
  token?: { id: string; name: string };
}

/** The sign-in link the Worker gives for a page address. */
const signInTo = (returnTo: string): string =>
  `${ISSUER}/login?return_to=${encodeURIComponent(returnTo)}`;

async function sessionOf(
  h: Harness,
  init: RequestInit = {},
): Promise<{ response: Response; body: SessionBody }> {
  const response = await h.request("/api/session", init);
  return { response, body: await jsonOf<SessionBody>(response.clone()) };
}

describe("GET /api/session", () => {
  it("tells a cookie principal who they are, where their account is and where to sign out", async () => {
    const h = await harness();
    const picture = "https://avatars.githubusercontent.com/u/1";
    const ana = await h.signedIn({ sub: "u-ana", name: "Ana", picture, email: "ana@example.com" });

    const { response, body } = await sessionOf(h, { headers: { Cookie: ana.cookie } });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(body).toEqual({
      user: { sub: "u-ana", name: "Ana", picture, handle: null },
      account: `${ISSUER}/account`,
      signOut: `${ISSUER}/logout`,
    });
    // The page is told nothing else of the token: not the email, not the session id.
    expect(JSON.stringify(body)).not.toContain("ana@example.com");
    expect(JSON.stringify(body)).not.toContain(ana.sid);
  });

  it("tells a bearer principal who they are and which token they hold, and no more", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana", name: "Ana" });
    const made = await h.request(
      "/api/tokens",
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: JSON_TYPE,
        body: JSON.stringify({ name: "laptop" }),
      }),
    );
    const token = await jsonOf<{ id: string; token: string }>(made);

    const { response, body } = await sessionOf(h, bearer(token.token));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual(["token", "user"]);
    expect(body).toEqual({
      user: { sub: "u-ana", name: "Ana", picture: "", handle: null },
      token: { id: token.id, name: "laptop" },
    });
  });

  it("tells anybody else to sign in, and never answers an error", async () => {
    const h = await harness();

    const { response, body } = await sessionOf(h);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ user: null, signIn: signInTo(`${ORIGIN}/`) });
  });

  const EXACTLY_2048 = `${ORIGIN}/${"a".repeat(2048 - ORIGIN.length - 1)}`;
  const PAGES: [string, string | undefined, string][] = [
    ["no Referer", undefined, `${ORIGIN}/`],
    ["the page's root", `${ORIGIN}/`, `${ORIGIN}/`],
    ["a project and its invitation", `${ORIGIN}/?project=${PROJECT}&invite=t`, ""],
    ["a path of the service", `${ORIGIN}/p/x?a=1`, ""],
    [
      "a fragment, which a Referer never holds but which would not travel on",
      `${ORIGIN}/#a`,
      `${ORIGIN}/`,
    ],
    [
      "credentials, which are dropped",
      `https://u:p@diagrams.meltemi.dev/path?q=1`,
      `${ORIGIN}/path?q=1`,
    ],
    ["another site", "https://example.com/elsewhere?x=1", `${ORIGIN}/`],
    ["the same host over http", "http://diagrams.meltemi.dev/x", `${ORIGIN}/`],
    ["the same host on another port", "https://diagrams.meltemi.dev:8443/x", `${ORIGIN}/`],
    ["a host that merely starts with the origin", `${ORIGIN}.evil.example/x`, `${ORIGIN}/`],
    ["text that is not an address", "not an address", `${ORIGIN}/`],
    [
      "an address of exactly 2048 characters, the longest the identity service takes",
      EXACTLY_2048,
      "",
    ],
    ["an address of 2049 characters, which it would refuse", `${EXACTLY_2048}a`, `${ORIGIN}/`],
  ];

  it.each(PAGES)(
    "builds the sign-in link of the page's own address from %s",
    async (_name, referer, expected) => {
      const h = await harness();

      const { body } = await sessionOf(
        h,
        referer === undefined ? {} : { headers: { Referer: referer } },
      );

      // An empty expectation means the Referer itself, which is under the origin.
      const returnTo = expected === "" ? (referer as string) : expected;
      expect(body).toEqual({ user: null, signIn: signInTo(returnTo) });
    },
  );

  it("sends a person to the local identity service and back to the local Worker in development", async () => {
    const h = await harness();
    const local = devVariant(h, {
      IDENTITY_ISSUER: "http://localhost:8787",
      IDENTITY_JWKS_URL: "http://localhost:8787/.well-known/jwks.json",
    });

    const response = await local.request("http://localhost:8788/api/session", {
      headers: { Referer: "http://localhost:8788/?x=1" },
    });

    expect(await jsonOf(response)).toEqual({
      user: null,
      signIn: `http://localhost:8787/login?return_to=${encodeURIComponent("http://localhost:8788/?x=1")}`,
    });
  });

  it("answers a renamed person with the new name, and the user row takes it", async () => {
    const h = await harness();
    const before = await h.signedIn({ sub: "u-ana", sid: "sid-ana", name: "Ana" });
    expect((await sessionOf(h, { headers: { Cookie: before.cookie } })).body.user?.name).toBe(
      "Ana",
    );
    expect((await h.store.user("u-ana"))?.name).toBe("Ana");

    // The same person signs in again with another name: the token differs from the cached one.
    h.clock.advance(2 * 60 * 60 * 1000);
    const after = await h.signedIn({ sub: "u-ana", sid: "sid-ana", name: "Ana María" });
    const { body } = await sessionOf(h, { headers: { Cookie: after.cookie } });

    expect(body.user?.name).toBe("Ana María");
    expect((await h.store.user("u-ana"))?.name).toBe("Ana María");
  });
});

// ---------------------------------------------------------------------------------------------
// An unexpected failure (cloud-service, "Errors as JSON with stable codes")

describe("an unexpected failure", () => {
  it("is answered without detail and logged without the request's headers", async () => {
    const h = await harness();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.deps.assets.fetch = async () => {
      throw new Error("the assets binding is down");
    };

    const response = await h.request("/", {
      headers: {
        Cookie: "meltemi_session=a-cookie-value",
        Authorization: "Bearer mdg_a-bearer-value",
        "X-Request-Secret": "a-header-value",
      },
    });

    expect(response.status).toBe(500);
    expect(await jsonOf(response)).toEqual({ code: "internal", message: "Something went wrong." });
    // The failure is logged, once, with its message and with nothing of the request.
    expect(logged).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(logged.mock.calls);
    expect(text).toContain("the assets binding is down");
    for (const secret of ["a-cookie-value", "a-bearer-value", "a-header-value"]) {
      expect(text, secret).not.toContain(secret);
    }
    for (const name of ["cookie", "authorization", "x-request-secret"]) {
      expect(text.toLowerCase(), name).not.toContain(name);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The Origin rule covers every route that changes state

/** A route path as a person reads it: the anchors and the escapes of its pattern removed. */
const plain = (path: RegExp): string =>
  path.source.replace(/^\^/, "").replace(/\$$/, "").replace(/\\\//g, "/");

const BAD_ORIGINS: [string, string | undefined][] = [
  ["no Origin", undefined],
  ["an empty Origin", ""],
  ["a null Origin", "null"],
  ["the identity service", ISSUER],
  ["another site", "https://evil.example"],
  ["the page over http", "http://diagrams.meltemi.dev"],
  ["the page on another port", "https://diagrams.meltemi.dev:8443"],
  ["a host that merely starts with the page's", "https://diagrams.meltemi.dev.evil.example"],
  ["the page's name as credentials", "https://diagrams.meltemi.dev@evil.example"],
  ["a host with no scheme", "diagrams.meltemi.dev"],
];

describe("the Origin rule", () => {
  it("is applied to every route that knows who is asking, and left out of exactly two that do not", () => {
    // A route that changes state: not a read (`HEAD` is one, as `GET` is: the development route that
    // serves a publication answers both and has no principal).
    const changing = ROUTES.filter((route) => route.method !== "GET" && route.method !== "HEAD");
    const listed = (principal: boolean) =>
      changing
        .filter((route) => route.principal === principal)
        .map((route) => `${route.method} ${plain(route.path)}`)
        .sort();

    // The two that read no cookie: the identity service's event (a signature) and the command
    // line's exchange (a one-time code). Any other route that changes state must resolve who is
    // asking, which is what applies the rule; a new one that does not fails here, to be looked at.
    expect(listed(false)).toEqual(["POST /_identity/events", "POST /cli-auth/token"]);
    // The three the next test goes through; a route a later change adds to them goes through it too.
    // The routes of publishing resolve who is asking as well: a handle is chosen with the cookie or a token, a
    // page is published with the cookie or a token, and the administrators' takedown is the cookie's.
    expect(listed(true)).toEqual(
      expect.arrayContaining([
        "DELETE /api/tokens/([^/]+)",
        "POST /api/tokens",
        "POST /cli-auth",
        "PATCH /api/account",
        "PUT /api/projects/([^/]+)/publish",
        "DELETE /api/projects/([^/]+)/publish/([^/]+)",
        "DELETE /api/admin/publications/([^/]+)/([^/]+)",
      ]),
    );
  });

  it("refuses a change made with the cookie from anywhere but the page, before any route runs", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana", sid: "sid-ana" });
    const kept = await addToken(h.store, { sub: "u-ana" });
    const spies = [
      vi.spyOn(h.store, "createToken"),
      vi.spyOn(h.store, "deleteToken"),
      vi.spyOn(h.store, "createCliCode"),
    ];
    const csrf = csrfOf("sid-ana");
    const changes: [string, string, string, BodyInit | undefined, Record<string, string>][] = [
      ["POST", "/api/tokens", "create a token", JSON.stringify({ name: "x" }), JSON_TYPE],
      ["DELETE", `/api/tokens/${kept.row.id}`, "revoke a token", undefined, {}],
      [
        "POST",
        "/cli-auth",
        "approve the command line",
        new URLSearchParams({ port: "43123", state: STATE, csrf }),
        {},
      ],
    ];

    for (const [name, origin] of BAD_ORIGINS) {
      for (const [method, path, what, body, type] of changes) {
        const headers: Record<string, string> = { Cookie: ana.cookie, ...type };
        if (origin !== undefined) headers["Origin"] = origin;
        const response = await h.request(path, { method, headers, body });
        const label = `${what} from ${name}`;
        expect(response.status, label).toBe(403);
        expect((await jsonOf<{ code: string }>(response)).code, label).toBe("request.forbidden");
      }
    }

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await h.store.tokensOf("u-ana")).toHaveLength(1);
  });

  it("does the same for a method no route handles: nothing changes and nothing answers", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana" });
    const spies = [vi.spyOn(h.store, "createToken"), vi.spyOn(h.store, "deleteToken")];

    for (const method of ["PUT", "PATCH", "DELETE", "POST"]) {
      for (const path of [
        "/api/session",
        "/api/tokens/x/y",
        "/cli-auth/other",
        "/p/x",
        "/rooms/x",
      ]) {
        const response = await h.request(path, { method, headers: { Cookie: ana.cookie } });
        expect(response.status, `${method} ${path}`).toBe(404);
      }
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("lets the page's own Origin through to all three, so the rule refuses by Origin and by nothing else", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana", sid: "sid-ana" });
    const kept = await addToken(h.store, { sub: "u-ana" });
    const csrf = csrfOf("sid-ana");

    const created = await h.request(
      "/api/tokens",
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: JSON_TYPE,
        body: JSON.stringify({ name: "x" }),
      }),
    );
    const revoked = await h.request(
      `/api/tokens/${kept.row.id}`,
      h.fromPage(ana.cookie, { method: "DELETE" }),
    );
    const approval = await h.request(
      "/cli-auth",
      h.fromPage(ana.cookie, {
        method: "POST",
        body: new URLSearchParams({ port: "43123", state: STATE, csrf }),
      }),
    );

    expect([created.status, revoked.status, approval.status]).toEqual([201, 204, 303]);
  });
});

// ---------------------------------------------------------------------------------------------
// The paths the Worker answers itself (cloud-service, "One Worker, one origin")

describe("the paths the Worker answers itself", () => {
  it.each([
    "/%61pi/session",
    "/api%2Fsession",
    "/%61pi/nothing",
    "/%5Fidentity/events",
    "/%5Fpublished/abc/page/",
    "/_published/abc/page",
    "/cli%2Dauth/style.css",
    "/%70/x",
    "/%72ooms/x",
    "/%zz",
  ])(
    "answer %s with the Worker's JSON 404, whatever the spelling, and never from the assets",
    async (path) => {
      const h = await harness();
      // A static file of the same name as the real one: if it were served, the test would see it.
      h.assets.files.set("/api/session", { body: '{"user":null}', type: "application/json" });

      const response = await h.request(path);

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
      expect(h.assets.calls).toEqual([]);
    },
  );

  it("leave every other path to the assets, in any spelling", async () => {
    const h = await harness();
    for (const path of ["/pricing.html", "/%70ricing.html", "/page%20one.html", "/apiary.js"]) {
      h.assets.files.set(path, { body: "x", type: "text/plain" });
      const response = await h.request(path);
      expect(response.status, path).toBe(200);
    }
    expect(h.assets.calls).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------------------------
// Bodies are read through a cap, by everyone

/** A body that never ends, 4 KiB at a time, and what became of it. */
function endlessBody(): {
  stream: ReadableStream<Uint8Array>;
  state: { pulled: number; released: boolean };
} {
  const state = { pulled: 0, released: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.pulled += 1;
      controller.enqueue(new Uint8Array(4096).fill(97));
    },
    cancel() {
      state.released = true;
    },
  });
  return { stream, state };
}

/** A urlencoded form of the fields, padded with one more field to exactly `bytes` bytes. */
function paddedForm(fields: Record<string, string>, bytes: number): string {
  const base = `${new URLSearchParams(fields)}&pad=`;
  return base + "a".repeat(bytes - base.length);
}

describe("a body that is too long", () => {
  const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

  it("has caps of a few KiB: a form, a token's name and an event are small, and a cap is only one while it stays so", () => {
    expect(MAX_FORM_BYTES).toBe(8 * 1024);
    expect(MAX_JSON_BYTES).toBe(8 * 1024);
  });

  it("is the only kind of body the service reads: no route reads a request's body but through the cap", () => {
    // `request.json()`, `.formData()`, `.text()` and the rest buffer whatever they are given.
    const reads = /\brequest\.(?:json|formData|text|arrayBuffer|blob|bytes|body)\b/;
    const readers = sourcesUnder(join(PACKAGE, "src"))
      .filter((file) => reads.test(code(file)))
      .map((file) => relative(PACKAGE, file));

    expect(readers).toEqual([join("src", "http.ts")]);
  });

  it("is not read past the cap when someone not signed in posts the approval form", async () => {
    const h = await harness();
    const { stream, state } = endlessBody();

    const response = await h.request("/cli-auth", {
      method: "POST",
      headers: FORM,
      body: stream,
      duplex: "half",
    } as RequestInit);

    // It is a body that is not a form: the person is sent to sign in, and no more is pulled.
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain(`${ISSUER}/login?return_to=`);
    expect(state.pulled * 4096).toBeLessThanOrEqual(MAX_FORM_BYTES + 3 * 4096);
    expect(state.released).toBe(true);
  });

  it("is refused at once, unread, when it says it is longer than the cap", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana", sid: "sid-ana" });
    const form = paddedForm({ port: "43123", state: STATE, csrf: csrfOf("sid-ana") }, 300);

    // The same small, good form: the declared length alone is what is too much.
    const response = await h.request(
      "/cli-auth",
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: { ...FORM, "Content-Length": String(MAX_FORM_BYTES + 1) },
        body: form,
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("<code>request.forbidden</code>");
    expect(response.headers.get("Location")).toBeNull();
  });

  it("is read to the byte at the cap: the approval form with a field to pad it goes through, one byte more does not", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana", sid: "sid-ana" });
    const fields = { port: "43123", state: STATE, csrf: csrfOf("sid-ana") };
    const post = (body: string) =>
      h.request("/cli-auth", h.fromPage(ana.cookie, { method: "POST", headers: FORM, body }));

    expect((await post(paddedForm(fields, MAX_FORM_BYTES))).status).toBe(303);
    expect((await post(paddedForm(fields, MAX_FORM_BYTES + 1))).status).toBe(403);
  });

  it("is not read past the cap when a person makes a token, and is a 400 that makes none", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana" });
    const { stream, state } = endlessBody();

    const response = await h.request(
      "/api/tokens",
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: JSON_TYPE,
        body: stream,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(400);
    expect((await jsonOf<{ code: string }>(response)).code).toBe("request.invalid");
    expect(state.pulled * 4096).toBeLessThanOrEqual(MAX_JSON_BYTES + 3 * 4096);
    expect(state.released).toBe(true);
    expect(await h.store.tokensOf("u-ana")).toEqual([]);
  });

  it("is read to the byte at the cap for a token's name, and one byte more is refused", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana" });
    const body = (bytes: number) => `{"name":"ci"}${" ".repeat(bytes - 13)}`;
    const post = (text: string) =>
      h.request(
        "/api/tokens",
        h.fromPage(ana.cookie, { method: "POST", headers: JSON_TYPE, body: text }),
      );

    expect((await post(body(MAX_JSON_BYTES))).status).toBe(201);
    const refused = await post(body(MAX_JSON_BYTES + 1));
    expect(refused.status).toBe(400);
    expect(await h.store.tokensOf("u-ana")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// A bearer token and a cookie are different credentials

describe("a bearer token and the cookie", () => {
  it("are not taken for each other", async () => {
    const h = await harness();
    await h.signedIn({ sub: "u-ana" });
    const stored = await addToken(h.store, { sub: "u-ana" });

    // An API token in the session cookie's place is no session.
    const asCookie = await h.request("/api/tokens", {
      headers: { Cookie: `meltemi_session=${stored.token}` },
    });
    expect(asCookie.status).toBe(401);
    expect((await jsonOf<{ code: string }>(asCookie)).code).toBe("auth.required");

    // An API token in the address or in a form field is no credential either.
    for (const request of [
      h.request(`/api/tokens?access_token=${stored.token}&token=${stored.token}`),
      h.request("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
        body: new URLSearchParams({ token: stored.token, name: "x" }),
      }),
    ]) {
      expect((await request).status).toBe(401);
    }
  });

  it("never lets a token do what only the page may: make a token, or approve the command line", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana", sid: "sid-ana" });
    const stored = await addToken(h.store, { sub: "u-ana" });

    // Even with a good cookie beside it and the page's own Origin: the token is who is asking.
    const alongside = {
      Authorization: `Bearer ${stored.token}`,
      Cookie: ana.cookie,
      Origin: ORIGIN,
    };
    const make = await h.request("/api/tokens", {
      method: "POST",
      headers: { ...alongside, ...JSON_TYPE },
      body: JSON.stringify({ name: "copy" }),
    });
    expect(make.status).toBe(403);
    expect(await h.store.tokensOf("u-ana")).toHaveLength(1);

    const approve = await h.request("/cli-auth", {
      method: "POST",
      headers: alongside,
      body: new URLSearchParams({ port: "43123", state: STATE, csrf: csrfOf("sid-ana") }),
    });
    expect(approve.status).toBe(302);
    expect(approve.headers.get("Location")).toContain(`${ISSUER}/login?return_to=`);
  });
});

// ---------------------------------------------------------------------------------------------
// One answer of every family, to look at their headers and at where the secrets went

type Family = "json" | "empty" | "redirect" | "html" | "css";

interface Answer {
  readonly label: string;
  readonly family: Family;
  readonly response: Response;
  /** Status, headers and body as one text: where a secret may not appear. */
  readonly text: string;
}

interface Collected {
  readonly answers: Answer[];
  readonly secrets: {
    readonly cookie: string;
    readonly csrf: string;
    readonly token: string;
    readonly code: string;
    readonly cliToken: string;
  };
}

/** Drives the whole service once and keeps every answer it gives. */
async function collect(h: Harness): Promise<Collected> {
  const answers: Answer[] = [];
  const add = async (label: string, family: Family, response: Response): Promise<void> => {
    const copy = response.clone();
    const headers = [...copy.headers].map(([name, value]) => `${name}: ${value}`);
    const text = [String(copy.status), ...headers, await copy.text()].join("\n");
    answers.push({ label, family, response, text });
  };

  const ana = await h.signedIn({ sub: "u-ana", sid: "sid-ana" });
  const own = (init: RequestInit = {}): RequestInit => h.fromPage(ana.cookie, init);
  const post = (body: string): RequestInit => own({ method: "POST", headers: JSON_TYPE, body });
  const page = `/cli-auth?${queryOf("43123", STATE)}`;

  // JSON, successes
  await add("the session of nobody", "json", await h.request("/api/session"));
  await add("the session of a person", "json", await h.request("/api/session", own()));
  const created = await h.request("/api/tokens", post(JSON.stringify({ name: "ci" })));
  await add("a token made", "json", created);
  const made = await jsonOf<{ id: string; token: string }>(created.clone());
  await add("the session of a token", "json", await h.request("/api/session", bearer(made.token)));
  await add("the list of tokens", "json", await h.request("/api/tokens", own()));

  // JSON, refusals of every status the service gives
  await add("an unknown route", "json", await h.request("/api/nothing"));
  await add("a token nobody holds", "json", await h.request("/api/session", bearer("mdg_unknown")));
  await add("nobody asking", "json", await h.request("/api/tokens"));
  await add(
    "another page",
    "json",
    await h.request("/api/tokens", {
      method: "POST",
      headers: { Cookie: ana.cookie, Origin: ISSUER, ...JSON_TYPE },
      body: JSON.stringify({ name: "x" }),
    }),
  );
  await add("a body that is no JSON", "json", await h.request("/api/tokens", post("nope")));
  await add("a project that cannot be", "json", await h.request("/p/nope"));
  await add("another host", "json", await h.request("https://meltemi.page/playground.js"));
  await add(
    "an event nobody signed",
    "json",
    await h.request("/_identity/events", { method: "POST", body: "{}" }),
  );
  await add("a code nobody made", "json", await exchange(h, { code: "x", state: STATE }));
  const full = await h.signedIn({ sub: "u-full", sid: "sid-full" });
  await fillTokens(h, "u-full", 20);
  await add(
    "a person at the limit",
    "json",
    await h.request(
      "/api/tokens",
      h.fromPage(full.cookie, {
        method: "POST",
        headers: JSON_TYPE,
        body: JSON.stringify({ name: "21st" }),
      }),
    ),
  );
  await failTimes(h, 10, "203.0.113.99");
  await add(
    "a caller that failed too often",
    "json",
    await exchange(h, { code: "x", state: STATE }, { ip: "203.0.113.99" }),
  );

  // Nothing to say
  await add(
    "a token revoked",
    "empty",
    await h.request(`/api/tokens/${made.id}`, own({ method: "DELETE" })),
  );

  // Redirects, pages and the style sheet
  await add("a project link", "redirect", await h.request(`/p/${PROJECT}?invite=t`));
  await add("the way to sign in first", "redirect", await h.request(page));
  const approval = await approved(h, ana);
  await add("the listener of the command line", "redirect", approval.response);
  const approvalPage = await h.request(page, own());
  const csrf = /name="csrf" value="([0-9a-f]+)"/.exec(await approvalPage.clone().text())?.[1] ?? "";
  await add("the approval page", "html", approvalPage);
  await add("a request that cannot be used", "html", await h.request("/cli-auth?port=80&state=x"));
  await add("the style sheet", "css", await h.request("/cli-auth/style.css"));

  // The command line's exchange
  const exchanged = await exchange(h, { code: approval.code, state: STATE });
  await add("the exchange", "json", exchanged);
  const cliToken = (await jsonOf<{ token: string }>(exchanged.clone())).token;

  // An unexpected failure, last: the assets stop answering.
  h.deps.assets.fetch = async () => {
    throw new Error("the assets binding is down");
  };
  await add("an unexpected failure", "json", await h.request("/"));

  return {
    answers,
    secrets: {
      cookie: ana.cookie.slice("meltemi_session=".length),
      csrf,
      token: made.token,
      code: approval.code,
      cliToken,
    },
  };
}

describe("the headers of every family of answer", () => {
  it("give every JSON answer, an error included, one content type, no cache and no sniffing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { answers } = await collect(await harness());
    const json = answers.filter((answer) => answer.family === "json");

    for (const { label, response } of json) {
      expect(response.headers.get("Content-Type"), label).toBe("application/json; charset=utf-8");
      expect(response.headers.get("Cache-Control"), label).toBe("no-store");
      expect(response.headers.get("X-Content-Type-Options"), label).toBe("nosniff");
    }
    // Every status of the specification that this change can give.
    expect([...new Set(json.map((answer) => answer.response.status))].sort()).toEqual([
      200, 201, 400, 401, 403, 404, 413, 429, 500,
    ]);
    const limited = json.find((answer) => answer.response.status === 429);
    expect(limited?.response.headers.get("Retry-After")).toBe("60");
  });

  it("give a redirect its address and no cache, and an answer with nothing to say no cache either", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { answers } = await collect(await harness());

    const redirects = answers.filter((answer) => answer.family === "redirect");
    expect(redirects.map((answer) => answer.response.status).sort()).toEqual([302, 302, 303]);
    for (const { label, response } of redirects) {
      expect(response.headers.get("Location"), label).toBeTruthy();
      expect(response.headers.get("Cache-Control"), label).toBe("no-store");
      expect(response.body, label).toBeNull();
    }
    for (const { label, response } of answers.filter((answer) => answer.family === "empty")) {
      expect(response.status, label).toBe(204);
      expect(response.headers.get("Cache-Control"), label).toBe("no-store");
      expect(response.body, label).toBeNull();
    }
  });

  it("give every page a policy that allows nothing but its own style, no framing and no base, and a same-origin referrer policy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { answers } = await collect(await harness());
    const pages = answers.filter((answer) => answer.family === "html");
    expect(pages.length).toBe(2);

    for (const { label, response } of pages) {
      const policy = response.headers.get("Content-Security-Policy") ?? "";
      expect(response.headers.get("Content-Type"), label).toBe("text/html; charset=utf-8");
      expect(policy.startsWith("default-src 'none'"), label).toBe(true);
      expect(policy, label).toContain("frame-ancestors 'none'");
      expect(policy, label).toContain("base-uri 'none'");
      expect(policy, label).toContain("form-action 'self' http://127.0.0.1:*");
      // No script, no inline style, no wildcard source but the loopback port.
      expect(policy, label).not.toMatch(
        /script-src|unsafe-inline|unsafe-eval|\*\.|https?:\/\/(?!127\.0\.0\.1)/,
      );
      expect(response.headers.get("Referrer-Policy"), label).toBe("same-origin");
      expect(response.headers.get("X-Content-Type-Options"), label).toBe("nosniff");
      expect(response.headers.get("Cache-Control"), label).toBe("no-store");
    }
  });

  it("serve the style sheet as CSS that nothing sniffs into anything else", async () => {
    const { answers } = await collect(await harness());
    const sheet = answers.find((answer) => answer.family === "css");

    expect(sheet?.response.status).toBe(200);
    expect(sheet?.response.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(sheet?.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("never set a cookie, open the answer to another origin, or name the software behind it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { answers } = await collect(await harness());

    for (const { label, response } of answers) {
      const names = [...response.headers.keys()];
      expect(response.headers.get("Set-Cookie"), label).toBeNull();
      expect(
        names.filter((name) => name.startsWith("access-control-")),
        label,
      ).toEqual([]);
      expect(response.headers.get("Server"), label).toBeNull();
      expect(response.headers.get("X-Powered-By"), label).toBeNull();
    }
  });
});

describe("where a secret may be seen", () => {
  it("shows a token once, in the answer that makes it, and a code once, in the redirect to the listener", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { answers, secrets } = await collect(await harness());
    const owners = (secret: string): string[] =>
      answers.filter((answer) => answer.text.includes(secret)).map((answer) => answer.label);

    expect(owners(secrets.token)).toEqual(["a token made"]);
    expect(owners(secrets.cliToken)).toEqual(["the exchange"]);
    expect(owners(secrets.code)).toEqual(["the listener of the command line"]);
    // The csrf token belongs to the page it was written into; the cookie is never echoed.
    expect(owners(secrets.csrf)).toEqual(["the approval page"]);
    expect(owners(secrets.cookie)).toEqual([]);
  });

  it("is not logged: nothing is written to the console but the one unexpected failure, and not its secrets", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const others = (["log", "info", "warn", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );

    const { secrets } = await collect(await harness());

    expect(error).toHaveBeenCalledTimes(1);
    for (const spy of others) expect(spy).not.toHaveBeenCalled();
    const text = JSON.stringify([error.mock.calls, ...others.map((spy) => spy.mock.calls)]);
    for (const [name, secret] of Object.entries(secrets)) {
      expect(text, name).not.toContain(secret);
    }
  });

  it("is stored as a hash: the tokens and the codes of a whole run hold only SHA-256 digests", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = await harness();
    const { secrets } = await collect(h);

    // (u-full holds twenty tokens with made-up hashes, put there only to reach the limit.)
    const rows = await h.store.tokensOf("u-ana");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(secrets.token);
    expect(JSON.stringify(rows)).not.toContain(secrets.cliToken);
    // The code was taken by its exchange; a second try finds nothing, as the specification says.
    expect((await exchange(h, { code: secrets.code, state: STATE })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// No network in the tests (cloud-service, "A handler of plain functions")

/** A source file without its comments (a `//` counts only after a space, so addresses survive). */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/** The `.ts` files under a folder, `skip` deciding which paths to leave out. */
function sourcesUnder(folder: string, skip: (path: string) => boolean = () => false): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    if (skip(path)) return [];
    if (statSync(path).isDirectory()) return sourcesUnder(path, skip);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("no test reaches the network", () => {
  it("runs the whole service, every route and every refusal, without one call to fetch", async () => {
    const fetched = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("no test reaches the network"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await collect(await harness());

    expect(fetched).not.toHaveBeenCalled();
  });

  it("imports nothing that opens a socket, in the service or in a test of it", () => {
    const sockets =
      /\bfrom\s+["'](?:node:)?(?:net|tls|http|https|http2|dgram|dns|child_process|cluster)["']|\bfrom\s+["'](?:undici|ws|node-fetch|playwright-core|wrangler)["']/;
    // The browser suite is another command (`pnpm cloud:test-browser`): it starts a Worker, a
    // listener and a browser, on purpose.
    const browser = `${sep}test${sep}browser`;
    const files = [
      ...sourcesUnder(join(PACKAGE, "src")),
      ...sourcesUnder(join(PACKAGE, "test"), (path) => path.endsWith(browser)),
    ];

    expect(files.length).toBeGreaterThan(25);
    const offenders = files
      .filter((file) => sockets.test(readFileSync(file, "utf8")))
      .map((file) => relative(PACKAGE, file));
    expect(offenders).toEqual([]);
  });

  it("calls the global fetch in the Cloudflare entry alone", () => {
    // A call, not a declaration such as `fetch(request: Request)` or a method `.fetch(`.
    const callers = sourcesUnder(join(PACKAGE, "src"))
      .filter((file) => /(^|[^.\w])fetch\((?!\w+\??:)/.test(code(file)))
      .map((file) => relative(PACKAGE, file));

    expect(callers).toEqual([join("src", "worker-handler.ts")]);
  });
});

// ---------------------------------------------------------------------------------------------
// The development tools (cloud-service, "Request authentication")

describe("the development tools", () => {
  it("are decided in config.ts alone, by comparing DEV with the text true, once", () => {
    const files = sourcesUnder(join(PACKAGE, "src"));
    const reading = (pattern: RegExp) =>
      files
        .filter((file) => pattern.test(code(file)))
        .map((file) => relative(PACKAGE, file))
        .sort();
    const config = join("src", "config.ts");
    const entry = join("src", "worker-handler.ts");

    // The environment's two development names are read in the configuration, and keyed (to renew
    // the verifier built from them) in the Cloudflare entry; nothing else asks for them. A new
    // reader of either is a new way to turn development on: look at it before adding it here.
    expect(reading(/env\.DEV\b/), "files that read DEV").toEqual([config, entry]);
    expect(reading(/env\.IDENTITY_JWKS\b/), "files that read IDENTITY_JWKS").toEqual([
      config,
      entry,
    ]);
    // The one comparison that makes development: the exact text, nowhere else.
    expect(reading(/"true"/), "files that compare with the text true").toEqual([config]);
    expect(code(join(PACKAGE, "src", "config.ts")).match(/"true"/g)).toHaveLength(1);
    // Everything else follows the flag that comes from there: the verifier, the two development
    // routes of the rooms (the counters and the cut), the one of the collection (it runs the
    // weekly collection now) and the one that serves a publication from the Worker's own origin
    // (`/_published/`); each of those answers 404 unless the flag is on. The address a publication
    // is given (`routes/publish.ts`) is the one place the flag changes an answer instead of
    // refusing: development has no publish host, so it names that route.
    expect(reading(/\.dev\b/), "files that follow the flag").toEqual([
      config,
      join("src", "routes", "dev.ts"),
      join("src", "routes", "publish.ts"),
      join("src", "routes", "published.ts"),
      join("src", "routes", "rooms.ts"),
      join("src", "verifier.ts"),
    ]);
    // The publish Worker is a second entry and holds no flag at all: it has no development mode,
    // so it cannot be turned into one by a variable it does not read. Neither does it read the
    // environment: its two bindings arrive as its argument.
    for (const file of ["publish.ts", "publish-worker.ts"]) {
      const text = code(join(PACKAGE, "src", file));
      expect(text, file).not.toMatch(/\bDEV\b|\.dev\b|\bconfig\b|\bprocess\.env\b/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The documents and the commands the specifications name

describe("the documents and the commands", () => {
  const rowsOf = (page: string): [string, number][] =>
    [
      ...readFileSync(join(REPOSITORY, page), "utf8").matchAll(
        /^\| `([a-z]+(?:[.-][a-z]+)*)` +\| (\d{3}) +\|/gm,
      ),
    ]
      .map((row): [string, number] => [row[1] as string, Number(row[2])])
      .sort();

  // The codes the pages do not list yet. A change adds the codes it introduces here until its own
  // documentation task gives them rows (the cloud-projects change did that in its task 5.1, the
  // sharing-and-permissions change in its task 5.2 and the live-collaboration change, which added
  // `awareness.rate`, in its task 3.3), so the set is empty when the documentation is complete and
  // the tables must list every code.
  const DOCUMENTED_LATER = new Set<string>();

  it.each(["docs/cloud.md", "docs/es/cloud.md"])(
    "%s lists every error code of the service with its status, and no other",
    (page) => {
      const documented = Object.entries(ERROR_STATUS).filter(
        ([code]) => !DOCUMENTED_LATER.has(code),
      );
      expect(rowsOf(page)).toEqual(documented.sort());
    },
  );

  it("waits for documentation only for codes that exist", () => {
    for (const code of DOCUMENTED_LATER) expect(ERROR_STATUS, code).toHaveProperty(code);
  });

  it("name the commands of the specification", () => {
    const root = JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const own = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    // `pnpm cloud:dev` builds the page, then runs the Worker (port 8788 is wrangler.jsonc's).
    expect(root.scripts["cloud:dev"]).toMatch(/^pnpm playground:build && .*run dev$/);
    expect(own.scripts["dev"]).toBe("wrangler dev");
    expect(root.scripts["cloud:migrate"]).toContain("@meltemi/diagrams-cloud run migrate");
    expect(own.scripts["migrate"]).toBe("wrangler d1 migrations apply DB");
    expect(root.scripts["cloud:test"]).toBe("vitest run packages/cloud");
    expect(root.scripts["cloud:test-browser"]).toContain("packages/cloud/test/browser/run.ts");
  });

  it("make the browser suite look for Edge or Chrome before it builds or starts anything", async () => {
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:fs")>()),
      existsSync: () => false,
    }));
    const { browserPath } = await import("../../vscode/scripts/browser.mjs");
    expect(() => browserPath()).toThrow(/Edge or Chrome/);

    const suite = readFileSync(join(PACKAGE, "test", "browser", "run.ts"), "utf8");
    expect(suite).toContain("Cannot run the browser suite: ${(error as Error).message}");
    const main = suite.slice(suite.indexOf("async function main()"));
    const order = ["findBrowser()", "startFakeIdentity()", "buildPage()", "startWorker()"].map(
      (call) => main.indexOf(call),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
