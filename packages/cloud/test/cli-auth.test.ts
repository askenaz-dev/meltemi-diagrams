// The command line's sign-in: the approval page's request, the form that stores a one-time code,
// and the exchange of that code for a token (`cloud-accounts`, "The command line's approval page").

import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto.js";
import { issueToken } from "../src/tokens.js";
import {
  FORMS_SECRET,
  IP,
  STATE,
  approved,
  callerOf,
  checkOf,
  csrfOf,
  exchange,
  failTimes,
  fieldOf,
  fillTokens,
  hmacOf,
  postForm,
  queryOf,
  recordingStore,
  stateOf,
  taped,
} from "./support/cli-auth.js";
import { harness, jsonOf, type Harness } from "./support/index.js";

const ORIGIN = "https://diagrams.meltemi.dev";
const SIGN_IN = "https://id.meltemi.dev/login";

/** A harness over a store that remembers, with Ana signed in. */
async function setup(options: Parameters<typeof harness>[0] = {}) {
  const { store, log } = recordingStore();
  const h = await harness({ store, ...options });
  const ana = await h.signedIn({ sub: "ana", name: "Ana" });
  return { h, log, ana };
}

/** Where a redirect to the sign-in says it returns to. */
function returnTo(response: Response): string | null {
  const location = response.headers.get("Location");
  if (!location?.startsWith(`${SIGN_IN}?`)) return null;
  return new URL(location).searchParams.get("return_to");
}

/** An exchange of what an approval gave. */
function exchangeOf(h: Harness, approval: { code: string; state: string }, ip: string | null = IP) {
  return exchange(h, { code: approval.code, state: approval.state }, { ip });
}

/** What every refusal of the exchange looks like: `400 cli.invalid`, as JSON, never cached. */
async function expectInvalid(response: Response): Promise<void> {
  expect(response.status).toBe(400);
  expect(response.headers.get("Content-Type")).toContain("application/json");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await jsonOf(response)).toEqual({ code: "cli.invalid", message: expect.any(String) });
}

// ---------------------------------------------------------------------------------------------
// GET /cli-auth

describe("GET /cli-auth: who is asking", () => {
  it("sends a signed-out person to sign in and back to this very address", async () => {
    const { h, log } = await setup();
    const address = `/cli-auth?${queryOf("43123", STATE)}`;
    const response = await h.request(address);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `${SIGN_IN}?return_to=${encodeURIComponent(`${ORIGIN}${address}`)}`,
    );
    expect(returnTo(response)).toBe(`${ORIGIN}/cli-auth?port=43123&state=${STATE}`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(log.codes).toEqual([]);
  });

  it("keeps the whole query in the return address, the language included", async () => {
    const { h } = await setup();
    const address = `/cli-auth?${queryOf("43123", STATE, { lang: "es" })}`;
    expect(returnTo(await h.request(address))).toBe(`${ORIGIN}${address}`);
  });

  it("returns to the Worker's own origin, https, even when the request came over http", async () => {
    const { h } = await setup();
    const address = `/cli-auth?${queryOf("43123", STATE)}`;
    const response = await h.request(`http://diagrams.meltemi.dev${address}`);
    expect(returnTo(response)).toBe(`${ORIGIN}${address}`);
  });

  it("returns to the request's own origin, and the local identity service, in development", async () => {
    const { h } = await setup({
      env: {
        DEV: "true",
        IDENTITY_ISSUER: "http://localhost:8787",
        IDENTITY_JWKS_URL: "http://localhost:8787/.well-known/jwks.json",
      },
    });
    const address = `/cli-auth?${queryOf("43123", STATE)}`;
    const response = await h.request(`http://localhost:8788${address}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `http://localhost:8787/login?return_to=${encodeURIComponent(`http://localhost:8788${address}`)}`,
    );
  });

  it("does not let a bearer token approve: it goes to sign in like anyone without a cookie", async () => {
    const { h, log } = await setup();
    const { token } = await issueToken(h.deps, "ana", "CLI test");
    const address = `/cli-auth?${queryOf("43123", STATE)}`;
    const response = await h.request(address, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(302);
    expect(returnTo(response)).toBe(`${ORIGIN}${address}`);
    expect(log.codes).toEqual([]);
  });

  it("counts a cookie that does not verify as signed out", async () => {
    const { h } = await setup();
    const response = await h.request(`/cli-auth?${queryOf("43123", STATE)}`, {
      headers: { Cookie: "meltemi_session=not.a.token" },
    });
    expect(response.status).toBe(302);
    expect(returnTo(response)).not.toBeNull();
  });

  it("answers an unknown bearer token as the router does, with no page", async () => {
    const { h } = await setup();
    const response = await h.request(`/cli-auth?${queryOf("43123", STATE)}`, {
      headers: { Authorization: "Bearer mdg_unknown" },
    });
    expect(response.status).toBe(401);
    expect((await jsonOf<{ code: string }>(response)).code).toBe("token.invalid");
  });
});

describe("GET /cli-auth: the request is checked first", () => {
  const BAD_PORTS = [
    "80",
    "localhost:4000",
    "1023",
    "65536",
    "0x1F90",
    "8080abc",
    "",
    "0",
    "-1",
    "+8080",
    "8080.0",
    " 8080",
    "8080 ",
    "08080",
    "01024",
    "1e4",
    "99999",
    "100000",
    "4000@evil.example",
    "43123.evil.example",
    "43123/",
    "43123#x",
    "４３１２３",
    "٤٣١٢٣",
  ];

  const BAD_STATES = [
    "",
    stateOf(1),
    stateOf(8),
    stateOf(15),
    stateOf(129),
    stateOf(500),
    `${stateOf(15)}+`,
    `${stateOf(15)}/`,
    `${stateOf(15)}=`,
    `${stateOf(15)}.`,
    `${stateOf(15)} `,
    `${stateOf(15)}~`,
    `${stateOf(15)}ñ`,
    `${stateOf(15)}\n`,
    `${stateOf(15)}\0`,
    `${stateOf(15)}%`,
    "<script>alert(1)</script>",
  ];

  async function expectRefusedPage(h: Harness, response: Response): Promise<void> {
    expect(response.status).toBe(400);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("<code>cli.invalid</code>");
    expect(h.identity.calls).toEqual([]);
  }

  it.each(BAD_PORTS)("refuses the port %j with a 400 page, never a redirect", async (port) => {
    const { h, ana, log } = await setup();
    // Signed out: the request is refused before anyone is sent to sign in.
    await expectRefusedPage(h, await h.request(`/cli-auth?${queryOf(port, STATE)}`));
    // Signed in: the same.
    const signedIn = await h.request(`/cli-auth?${queryOf(port, STATE)}`, h.fromPage(ana.cookie));
    expect(signedIn.status).toBe(400);
    expect(signedIn.headers.get("Location")).toBeNull();
    expect(await signedIn.text()).toContain("<code>cli.invalid</code>");
    expect(log.codes).toEqual([]);
    expect(log.tokens).toEqual([]);
  });

  it.each(BAD_STATES)("refuses the state %j with a 400 page, never a redirect", async (state) => {
    const { h, ana, log } = await setup();
    await expectRefusedPage(h, await h.request(`/cli-auth?${queryOf("43123", state)}`));
    const signedIn = await h.request(
      `/cli-auth?${queryOf("43123", state)}`,
      h.fromPage(ana.cookie),
    );
    expect(signedIn.status).toBe(400);
    expect(await signedIn.text()).toContain("<code>cli.invalid</code>");
    expect(log.codes).toEqual([]);
  });

  it.each([
    ["no query at all", ""],
    ["no state", `?port=43123`],
    ["no port", `?state=${STATE}`],
    ["a repeated port", `?port=43123&port=43124&state=${STATE}`],
    ["a repeated port whose first is good and second is not", `?port=43123&port=80&state=${STATE}`],
    ["a repeated state", `?port=43123&state=${STATE}&state=${STATE}`],
    ["a port and state that swapped places", `?port=${STATE}&state=43123`],
  ])("refuses %s", async (_name, query) => {
    const { h, ana } = await setup();
    await expectRefusedPage(h, await h.request(`/cli-auth${query}`));
    expect((await h.request(`/cli-auth${query}`, h.fromPage(ana.cookie))).status).toBe(400);
  });

  it.each(["1024", "1025", "8080", "9999", "10000", "43123", "49152", "65534", "65535"])(
    "accepts the port %s",
    async (port) => {
      const { h, ana } = await setup();
      const response = await h.request(`/cli-auth?${queryOf(port, STATE)}`, h.fromPage(ana.cookie));
      expect(response.status).toBe(200);
      expect(fieldOf(await response.text(), "port")).toBe(port);
    },
  );

  it.each([16, 17, 43, 64, 127, 128])("accepts a state of %i characters", async (length) => {
    const { h, ana } = await setup();
    const state = stateOf(length);
    const response = await h.request(
      `/cli-auth?${queryOf("43123", state)}`,
      h.fromPage(ana.cookie),
    );
    expect(response.status).toBe(200);
    expect(fieldOf(await response.text(), "state")).toBe(state);
  });

  it("accepts every character of base64url, the dash and the underscore at the edges", async () => {
    const { h, ana } = await setup();
    for (const state of ["-".repeat(16), "_".repeat(16), `-${stateOf(14)}_`, "09azAZ-_09azAZ-_"]) {
      const response = await h.request(
        `/cli-auth?${queryOf("43123", state)}`,
        h.fromPage(ana.cookie),
      );
      expect(response.status, state).toBe(200);
    }
  });

  it("ignores parameters it does not know", async () => {
    const { h, ana } = await setup();
    const query = queryOf("43123", STATE, {
      host: "evil.example",
      redirect: "https://evil.example",
    });
    const response = await h.request(`/cli-auth?${query}`, h.fromPage(ana.cookie));
    expect(response.status).toBe(200);
  });
});

describe("GET /cli-auth: the page for a signed-in person", () => {
  it("holds the port, the state and a csrf token of the session, and a check of the state", async () => {
    const { h, ana, log } = await setup();
    const response = await h.request(
      `/cli-auth?${queryOf("43123", STATE)}`,
      h.fromPage(ana.cookie),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(fieldOf(html, "port")).toBe("43123");
    expect(fieldOf(html, "state")).toBe(STATE);
    expect(fieldOf(html, "csrf")).toBe(csrfOf(ana.sid));
    expect(html).toContain(`<code class="check">${checkOf(STATE)}</code>`);
    // Looking at the page stores nothing.
    expect(log.codes).toEqual([]);
    expect(log.tokens).toEqual([]);
    expect(log.failures).toEqual([]);
  });

  // Worked out with Python's hashlib and base64.b32encode, which share nothing with the Worker.
  it.each([
    ["ABCDEFGHIJKLMNOP", "47ULRH"],
    ["abcdefghijklmnop", "6OO2Y3"],
    ["AAAAAAAAAAAAAAAA", "TEJAJ6"],
    ["a-b_c-d_e-f_g-h_", "UUT6ZH"],
    ["0123456789abcdefABCDEF-_", "WN4BMO"],
    ["A".repeat(128), "W2WDZQ"],
  ])("shows the check of %s as %s", async (state, expected) => {
    const { h, ana } = await setup();
    expect(checkOf(state)).toBe(expected);
    const response = await h.request(
      `/cli-auth?${queryOf("43123", state)}`,
      h.fromPage(ana.cookie),
    );
    expect(await response.text()).toContain(`<code class="check">${expected}</code>`);
  });

  it("shows six characters of the base32 alphabet for any state", async () => {
    const { h, ana } = await setup();
    for (let offset = 0; offset < 12; offset++) {
      const state = stateOf(43, offset);
      const html = await (
        await h.request(`/cli-auth?${queryOf("43123", state)}`, h.fromPage(ana.cookie))
      ).text();
      expect(/<code class="check">([A-Z2-7]{6})<\/code>/.exec(html)?.[1]).toBe(checkOf(state));
    }
  });

  it("gives each session its own csrf token, the same every time for one session", async () => {
    const { h, ana } = await setup();
    const phone = await h.signedIn({ sub: "ana", sid: "sid-ana-phone" });
    const tokenOf = async (cookie: string) =>
      fieldOf(
        await (await h.request(`/cli-auth?${queryOf("43123", STATE)}`, h.fromPage(cookie))).text(),
        "csrf",
      );
    const first = await tokenOf(ana.cookie);
    expect(first).toBe(csrfOf(ana.sid));
    expect(await tokenOf(ana.cookie)).toBe(first);
    expect(await tokenOf(phone.cookie)).toBe(csrfOf("sid-ana-phone"));
    expect(await tokenOf(phone.cookie)).not.toBe(first);
  });

  it("keys the csrf token with FORMS_SECRET", async () => {
    const { h, ana } = await setup({ env: { FORMS_SECRET: "another-forms-secret" } });
    const html = await (
      await h.request(`/cli-auth?${queryOf("43123", STATE)}`, h.fromPage(ana.cookie))
    ).text();
    expect(fieldOf(html, "csrf")).toBe(csrfOf(ana.sid, "another-forms-secret"));
    expect(fieldOf(html, "csrf")).not.toBe(csrfOf(ana.sid, FORMS_SECRET));
  });
});

// ---------------------------------------------------------------------------------------------
// POST /cli-auth

describe("POST /cli-auth: approving", () => {
  it("stores a one-time code for five minutes, bound to the person and the state", async () => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    expect(approval.response.status).toBe(303);
    expect(approval.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(log.codes).toEqual([
      {
        hash: await sha256Hex(approval.code),
        sub: "ana",
        state: STATE,
        expiresAt: "2026-10-14T12:05:00.000Z",
      },
    ]);
    // Only the hash of the code is stored, never the code.
    expect(JSON.stringify(log.codes)).not.toContain(approval.code);
  });

  it("redirects to the loopback interface with the code and the state, and nothing else", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana, { port: "43123" });
    expect(approval.response.status).toBe(303);
    expect(approval.location).toBe(`http://127.0.0.1:43123/?code=${approval.code}&state=${STATE}`);
    const target = new URL(approval.location);
    expect(target.protocol).toBe("http:");
    expect(target.hostname).toBe("127.0.0.1");
    expect(target.port).toBe("43123");
    expect(target.pathname).toBe("/");
    expect(target.username + target.password + target.hash).toBe("");
    expect([...target.searchParams.keys()]).toEqual(["code", "state"]);
    expect(approval.response.headers.get("Cache-Control")).toBe("no-store");
    expect(await approval.response.text()).toBe("");
  });

  it("creates no token yet, and no token value is in the address", async () => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    expect(log.tokens).toEqual([]);
    expect(await h.store.tokensOf("ana")).toEqual([]);
    expect(approval.location).not.toContain("mdg_");
    expect(approval.location.toLowerCase()).not.toContain("token");
  });

  it.each(["1024", "65535", "8080"])("redirects to port %s", async (port) => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana, { port });
    expect(new URL(approval.location).port).toBe(port);
  });

  it("makes a new code for every approval, each good for one exchange", async () => {
    const { h, ana, log } = await setup();
    const first = await approved(h, ana);
    const second = await approved(h, ana);
    expect(first.code).not.toBe(second.code);
    expect(log.codes.map((c) => c.hash)).toEqual([
      await sha256Hex(first.code),
      await sha256Hex(second.code),
    ]);
    expect((await exchangeOf(h, first)).status).toBe(200);
    expect((await exchangeOf(h, second)).status).toBe(200);
    expect(await h.store.tokensOf("ana")).toHaveLength(2);
  });

  it("takes the port and the state from the form, not from the address it was posted to", async () => {
    const { h, ana, log } = await setup();
    const other = stateOf(43, 5);
    const page = await h.request(`/cli-auth?${queryOf("43123", STATE)}`, h.fromPage(ana.cookie));
    const csrf = fieldOf(await page.text(), "csrf")!;
    const response = await postForm(
      h,
      ana.cookie,
      { port: "43123", state: STATE, csrf },
      `/cli-auth?${queryOf("2222", other)}`,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toMatch(
      new RegExp(`^http://127\\.0\\.0\\.1:43123/\\?code=[A-Za-z0-9_-]{43}&state=${STATE}$`),
    );
    expect(log.codes[0]?.state).toBe(STATE);
  });

  it("accepts the form as multipart too", async () => {
    const { h, ana, log } = await setup();
    const form = new FormData();
    form.set("port", "43123");
    form.set("state", STATE);
    form.set("csrf", csrfOf(ana.sid));
    const response = await h.request(
      "/cli-auth",
      h.fromPage(ana.cookie, { method: "POST", body: form }),
    );
    expect(response.status).toBe(303);
    expect(log.codes).toHaveLength(1);
  });

  it("never lets the request change where the redirect goes", async () => {
    const { h, ana } = await setup();
    const csrf = csrfOf(ana.sid);
    const response = await postForm(
      h,
      ana.cookie,
      {
        port: "43123",
        state: STATE,
        csrf,
        host: "evil.example",
        hostname: "evil.example",
        redirect: "https://evil.example/",
        redirect_uri: "https://evil.example/",
        return_to: "https://evil.example/",
        url: "https://evil.example/",
      },
      "/cli-auth?host=evil.example&redirect=https://evil.example/",
      { headers: { Host: "evil.example", "X-Forwarded-Host": "evil.example" } },
    );
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get("Location")!);
    expect(target.origin).toBe("http://127.0.0.1:43123");
    expect(response.headers.get("Location")).not.toContain("evil");
  });

  it.each([
    "43123@evil.example",
    "43123.evil.example",
    "evil.example:43123",
    "43123/../x",
    "43123?x=1",
    "43123#x",
    "43123\r\nSet-Cookie: a=b",
    "80",
    "65536",
  ])(
    "refuses the port %j in the form: nothing is stored and nobody is redirected",
    async (port) => {
      const { h, ana, log } = await setup();
      const response = await postForm(h, ana.cookie, { port, state: STATE, csrf: csrfOf(ana.sid) });
      expect(response.status).toBe(400);
      expect(response.headers.get("Location")).toBeNull();
      expect(await response.text()).toContain("<code>cli.invalid</code>");
      expect(log.codes).toEqual([]);
    },
  );

  it.each([
    ["8 characters", stateOf(8)],
    ["15 characters", stateOf(15)],
    ["129 characters", stateOf(129)],
    ["a character outside base64url", `${stateOf(20)}+/=`],
    ["a state that tries to add a parameter", `${stateOf(20)}&code=evil`],
    ["a state that tries to end the address", `${stateOf(20)}#`],
    ["nothing", ""],
  ])("refuses a state of %s in the form: nothing is stored", async (_name, state) => {
    const { h, ana, log } = await setup();
    const response = await postForm(h, ana.cookie, { port: "43123", state, csrf: csrfOf(ana.sid) });
    expect(response.status).toBe(400);
    expect(response.headers.get("Location")).toBeNull();
    expect(log.codes).toEqual([]);
  });

  it("refuses a form without a port or without a state, or with either twice", async () => {
    const { h, ana, log } = await setup();
    const csrf = csrfOf(ana.sid);
    const bodies = [
      new URLSearchParams({ state: STATE, csrf }),
      new URLSearchParams({ port: "43123", csrf }),
      new URLSearchParams(`port=43123&port=43124&state=${STATE}&csrf=${csrf}`),
      new URLSearchParams(`port=43123&state=${STATE}&state=${STATE}&csrf=${csrf}`),
    ];
    for (const body of bodies) {
      const response = await h.request(
        "/cli-auth",
        h.fromPage(ana.cookie, { method: "POST", body }),
      );
      expect(response.status, body.toString()).toBe(400);
    }
    expect(log.codes).toEqual([]);
  });
});

describe("POST /cli-auth: the form must be the page's own", () => {
  /** Posts the given fields (an undefined one is left out) as Ana from the page. */
  async function refusedWith(fields: Record<string, string | undefined>) {
    const { h, ana, log } = await setup();
    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) {
      if (value !== undefined) body.set(name, value);
    }
    const response = await h.request("/cli-auth", h.fromPage(ana.cookie, { method: "POST", body }));
    return { response, log };
  }

  async function expectForbiddenPage(response: Response): Promise<void> {
    expect(response.status).toBe(403);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("<code>request.forbidden</code>");
  }

  const sid = "sid-ana";
  const good = csrfOf(sid);

  it.each([
    ["no csrf field", undefined],
    ["an empty csrf", ""],
    ["a csrf that is not hexadecimal", "z".repeat(64)],
    ["a csrf one digit short", good.slice(0, 63)],
    ["a csrf two digits short", good.slice(0, 62)],
    ["a csrf one byte long", `${good}00`],
    ["a csrf with a space before it", ` ${good}`],
    ["a csrf with its last digit changed", `${good.slice(0, 63)}${good.endsWith("0") ? "1" : "0"}`],
    ["the csrf of the identity service's form (the session id alone)", hmacOf(sid)],
    ["the csrf made with another secret", csrfOf(sid, "not-the-forms-secret")],
    ["the csrf of another session of the same person", csrfOf("sid-ana-phone")],
    ["the csrf of another person's session", csrfOf("sid-bea")],
  ])("answers 403 for %s, and stores nothing", async (_name, csrf) => {
    const { response, log } = await refusedWith({ port: "43123", state: STATE, csrf });
    await expectForbiddenPage(response);
    expect(log.codes).toEqual([]);
  });

  it("does not take the csrf token from the address", async () => {
    const { h, ana, log } = await setup();
    const response = await postForm(
      h,
      ana.cookie,
      { port: "43123", state: STATE },
      `/cli-auth?csrf=${csrfOf(ana.sid)}`,
    );
    await expectForbiddenPage(response);
    expect(log.codes).toEqual([]);
  });

  it("refuses a csrf that is a file and not text", async () => {
    const { h, ana, log } = await setup();
    const form = new FormData();
    form.set("port", "43123");
    form.set("state", STATE);
    form.set("csrf", new File([csrfOf(ana.sid)], "csrf.txt"));
    const response = await h.request(
      "/cli-auth",
      h.fromPage(ana.cookie, { method: "POST", body: form }),
    );
    await expectForbiddenPage(response);
    expect(log.codes).toEqual([]);
  });

  it.each([
    ["JSON", "application/json", () => JSON.stringify({ port: "43123", state: STATE })],
    ["plain text", "text/plain", () => `port=43123&state=${STATE}`],
    ["a multipart body that is broken", "multipart/form-data; boundary=x", () => "garbage"],
  ])("answers 403 for a body that is %s and not a form", async (_name, type, body) => {
    const { h, ana, log } = await setup();
    const response = await h.request(
      "/cli-auth",
      h.fromPage(ana.cookie, { method: "POST", headers: { "Content-Type": type }, body: body() }),
    );
    await expectForbiddenPage(response);
    expect(log.codes).toEqual([]);
  });

  it("answers 403 for a post with no body at all", async () => {
    const { h, ana, log } = await setup();
    const response = await h.request("/cli-auth", h.fromPage(ana.cookie, { method: "POST" }));
    await expectForbiddenPage(response);
    expect(log.codes).toEqual([]);
  });

  it("checks the csrf before the port and state: a wrong token is 403 whatever else is wrong", async () => {
    const { response, log } = await refusedWith({ port: "80", state: "short", csrf: "nope" });
    await expectForbiddenPage(response);
    expect(log.codes).toEqual([]);
  });

  it("answers in Spanish when the address asks for it", async () => {
    const { h, ana } = await setup();
    const response = await postForm(
      h,
      ana.cookie,
      { port: "43123", state: STATE },
      "/cli-auth?lang=es",
    );
    expect(response.status).toBe(403);
    const html = await response.text();
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("Se rechazó esta solicitud");
    expect(html).toContain("<code>request.forbidden</code>");
  });
});

describe("POST /cli-auth: who is posting", () => {
  it("sends a post without a session to sign in, back to the approval page, and stores nothing", async () => {
    const { h, log } = await setup();
    const response = await h.request("/cli-auth", {
      method: "POST",
      body: new URLSearchParams({ port: "43123", state: STATE, csrf: "whatever" }),
    });
    expect(response.status).toBe(302);
    expect(returnTo(response)).toBe(`${ORIGIN}/cli-auth?port=43123&state=${STATE}`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(log.codes).toEqual([]);
  });

  it("keeps the language of the post in the address it returns to", async () => {
    const { h } = await setup();
    const response = await h.request("/cli-auth?lang=es", {
      method: "POST",
      body: new URLSearchParams({ port: "43123", state: STATE }),
    });
    expect(returnTo(response)).toBe(`${ORIGIN}/cli-auth?port=43123&state=${STATE}&lang=es`);
  });

  it.each([
    ["a form without a port", new URLSearchParams({ state: STATE })],
    ["a form whose port is not one", new URLSearchParams({ port: "80", state: STATE })],
    ["a form whose state is not one", new URLSearchParams({ port: "43123", state: "short" })],
    ["no body", undefined],
  ])("sends %s to sign in with the address of the post itself", async (_name, body) => {
    const { h, log } = await setup();
    const response = await h.request("/cli-auth?lang=es", {
      method: "POST",
      ...(body ? { body } : {}),
    });
    expect(response.status).toBe(302);
    expect(returnTo(response)).toBe(`${ORIGIN}/cli-auth?lang=es`);
    expect(log.codes).toEqual([]);
  });

  it("sends a body that is not a form to sign in too", async () => {
    const { h, log } = await setup();
    const response = await h.request("/cli-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: "43123", state: STATE }),
    });
    expect(response.status).toBe(302);
    expect(returnTo(response)).toBe(`${ORIGIN}/cli-auth`);
    expect(log.codes).toEqual([]);
  });

  it("sends a cross-site post to sign in: the browser leaves the cookie out of it", async () => {
    const { h, log } = await setup();
    const response = await h.request("/cli-auth", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: new URLSearchParams({ port: "43123", state: STATE, csrf: "guess" }),
    });
    expect(response.status).toBe(302);
    expect(returnTo(response)).not.toBeNull();
    expect(log.codes).toEqual([]);
  });

  it("does not let a bearer token approve either", async () => {
    const { h, log } = await setup();
    const { token } = await issueToken(h.deps, "ana", "CLI test");
    const response = await h.request("/cli-auth", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: new URLSearchParams({ port: "43123", state: STATE, csrf: csrfOf("any") }),
    });
    expect(response.status).toBe(302);
    expect(returnTo(response)).toBe(`${ORIGIN}/cli-auth?port=43123&state=${STATE}`);
    expect(log.codes).toEqual([]);
  });

  it.each([
    ["another host of the family", "https://id.meltemi.dev"],
    ["the site", "https://meltemi.dev"],
    ["a stranger", "https://evil.example"],
    ["the origin over plain http", "http://diagrams.meltemi.dev"],
    ["the null origin", "null"],
    ["no origin", null],
  ])(
    "refuses a post with the session cookie from %s before the route runs",
    async (_name, origin) => {
      const { h, ana, log } = await setup();
      const headers = new Headers({ Cookie: ana.cookie });
      if (origin !== null) headers.set("Origin", origin);
      const response = await h.request("/cli-auth", {
        method: "POST",
        headers,
        body: new URLSearchParams({ port: "43123", state: STATE, csrf: csrfOf(ana.sid) }),
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("Content-Type")).toContain("application/json");
      expect((await jsonOf<{ code: string }>(response)).code).toBe("request.forbidden");
      expect(log.codes).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// POST /cli-auth/token

describe("POST /cli-auth/token: exchanging a code", () => {
  it("answers { id, name, token } once: the token's hash is stored, and the token authenticates", async () => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    const response = await exchangeOf(h, approval);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await jsonOf<{ id: string; name: string; token: string }>(response);
    expect(Object.keys(body).sort()).toEqual(["id", "name", "token"]);
    expect(body.name).toBe("CLI (2026-10-14)");
    expect(body.id).toMatch(/^[0-9a-f]{32}$/);
    expect(body.token).toMatch(/^mdg_[A-Za-z0-9_-]{43}$/);

    // Only the SHA-256 of the token is stored, and the row belongs to the person who approved.
    const rows = await h.store.tokensOf("ana");
    expect(rows).toEqual([
      {
        id: body.id,
        sub: "ana",
        name: "CLI (2026-10-14)",
        hash: await sha256Hex(body.token),
        createdAt: "2026-10-14T12:00:00.000Z",
        lastUsedAt: null,
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(body.token);
    expect(log.tokens).toHaveLength(1);

    // The token is that person's on the API.
    const session = await h.request("/api/session", {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(session.status).toBe(200);
    expect(await jsonOf(session)).toMatchObject({
      user: { sub: "ana", name: "Ana" },
      token: { id: body.id, name: "CLI (2026-10-14)" },
    });
  });

  it("sets no cookie and shows the token nowhere but in the body", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    const response = await exchangeOf(h, approval);
    const { token } = await jsonOf<{ token: string }>(response.clone());
    expect(response.headers.get("Set-Cookie")).toBeNull();
    for (const [name, value] of response.headers) {
      expect(`${name}: ${value}`, name).not.toContain(token);
    }
  });

  it("names the token with the date of the exchange in UTC", async () => {
    const cases = [
      ["2026-10-14T23:59:59.999Z", "CLI (2026-10-14)"],
      ["2026-10-15T00:00:00.000Z", "CLI (2026-10-15)"],
      ["2026-10-15T00:00:59.999Z", "CLI (2026-10-15)"],
    ] as const;
    for (const [when, name] of cases) {
      const { h, ana } = await setup({ start: "2026-10-14T23:56:00.000Z" });
      const approval = await approved(h, ana);
      h.clock.set(when);
      const body = await jsonOf<{ name: string }>(await exchangeOf(h, approval));
      expect(body.name, when).toBe(name);
    }
  });

  it("makes the token for the person the code is bound to, whatever cookie, origin or header comes with it", async () => {
    const { h, ana } = await setup();
    const bea = await h.signedIn({ sub: "bea", name: "Bea" });
    const approval = await approved(h, ana);
    const response = await exchange(
      h,
      { code: approval.code, state: approval.state },
      {
        headers: {
          Cookie: bea.cookie,
          Origin: "https://evil.example",
          Authorization: "Bearer mdg_not-a-token",
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await h.store.tokensOf("ana")).toHaveLength(1);
    expect(await h.store.tokensOf("bea")).toEqual([]);
  });

  it("keeps two people's codes apart", async () => {
    const { h, ana } = await setup();
    const bea = await h.signedIn({ sub: "bea", name: "Bea" });
    const forAna = await approved(h, ana, { state: stateOf(43, 1) });
    const forBea = await approved(h, bea, { state: stateOf(43, 2) });
    // Bea's code with Ana's state is nobody's.
    await expectInvalid(await exchange(h, { code: forBea.code, state: forAna.state }));
    expect((await exchangeOf(h, forAna)).status).toBe(200);
    expect(await h.store.tokensOf("ana")).toHaveLength(1);
    expect(await h.store.tokensOf("bea")).toEqual([]);
  });

  it("refuses the same code a second time and hands out no second token", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    expect((await exchangeOf(h, approval)).status).toBe(200);
    await expectInvalid(await exchangeOf(h, approval));
    expect(await h.store.tokensOf("ana")).toHaveLength(1);
  });

  it("refuses a state that does not match: no token, the failure counted, the code gone", async () => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    await expectInvalid(await exchange(h, { code: approval.code, state: stateOf(43, 9) }));
    expect(await h.store.tokensOf("ana")).toEqual([]);
    expect(log.failures).toEqual([{ key: callerOf(IP), at: "2026-10-14T12:00:00.000Z" }]);
    // The code was taken: even with the right state it is no more.
    await expectInvalid(await exchangeOf(h, approval));
    expect(await h.store.tokensOf("ana")).toEqual([]);
    expect(log.failures).toHaveLength(2);
  });

  it.each([
    [
      "a state that differs in its last character",
      (s: string) => `${s.slice(0, -1)}${s.endsWith("A") ? "B" : "A"}`,
    ],
    ["a state with something added", (s: string) => `${s}A`],
    ["a state with something missing", (s: string) => s.slice(0, -1)],
    ["an empty state", () => ""],
    [
      "the same state in another case",
      (s: string) => (s.toLowerCase() === s ? s.toUpperCase() : s.toLowerCase()),
    ],
  ])("refuses %s", async (_name, change) => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    await expectInvalid(await exchange(h, { code: approval.code, state: change(approval.state) }));
    expect(await h.store.tokensOf("ana")).toEqual([]);
  });

  it("refuses a code nobody made, and counts it", async () => {
    const { h, log } = await setup();
    await expectInvalid(await exchange(h, { code: "A".repeat(43), state: STATE }));
    expect(log.failures).toHaveLength(1);
    expect(log.tokens).toEqual([]);
  });

  it("refuses a code that is the hash of a code, or a token in its place", async () => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    await expectInvalid(
      await exchange(h, { code: await sha256Hex(approval.code), state: approval.state }),
    );
    await expectInvalid(await exchange(h, { code: `mdg_${approval.code}`, state: approval.state }));
    expect(log.tokens).toEqual([]);
    // Neither attempt used the real code up.
    expect((await exchangeOf(h, approval)).status).toBe(200);
  });

  it("refuses the codes of a person who was deleted after approving", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    await h.store.applyUserDeleted("evt_1", "ana", h.clock.now().toISOString());
    await expectInvalid(await exchangeOf(h, approval));
    expect(await h.store.tokensOf("ana")).toEqual([]);
  });

  it("answers GET and other methods on the token route as an unknown route", async () => {
    const { h } = await setup();
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await h.request("/cli-auth/token", { method });
      expect(response.status, method).toBe(404);
      expect((await jsonOf<{ code: string }>(response)).code).toBe("not-found");
    }
  });
});

describe("POST /cli-auth/token: five minutes", () => {
  const cases = [
    ["a second short of the end", "2026-10-14T12:04:59.000Z", 200],
    ["a millisecond short of the end", "2026-10-14T12:04:59.999Z", 200],
    ["exactly five minutes: expired at the boundary", "2026-10-14T12:05:00.000Z", 400],
    ["a millisecond past five minutes", "2026-10-14T12:05:00.001Z", 400],
    ["an hour later", "2026-10-14T13:00:00.000Z", 400],
  ] as const;

  it.each(cases)("%s", async (_name, when, status) => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    h.clock.set(when);
    const response = await exchangeOf(h, approval);
    expect(response.status).toBe(status);
    expect(await h.store.tokensOf("ana")).toHaveLength(status === 200 ? 1 : 0);
    // An expired code is a failed exchange; a code taken in time is not.
    expect(log.failures).toHaveLength(status === 200 ? 0 : 1);
    // Either way the code is gone.
    h.clock.set("2026-10-14T12:00:01.000Z");
    await expectInvalid(await exchangeOf(h, approval));
  });

  it("counts from the approval, not from the page being shown", async () => {
    const { h, ana } = await setup();
    const page = await h.request(`/cli-auth?${queryOf("43123", STATE)}`, h.fromPage(ana.cookie));
    const csrf = fieldOf(await page.text(), "csrf")!;
    h.clock.advance(4 * 60 * 1000);
    const response = await postForm(h, ana.cookie, { port: "43123", state: STATE, csrf });
    const code = new URL(response.headers.get("Location")!).searchParams.get("code")!;
    h.clock.advance(4 * 60 * 1000);
    // Eight minutes after the page, four after the approval.
    expect((await exchange(h, { code, state: STATE })).status).toBe(200);
  });

  it("refuses a code whose stored time cannot be read", async () => {
    const { h } = await setup();
    await h.store.createCliCode({
      hash: await sha256Hex("odd-code"),
      sub: "ana",
      state: STATE,
      expiresAt: "not a time",
    });
    await expectInvalid(await exchange(h, { code: "odd-code", state: STATE }));
    expect(await h.store.tokensOf("ana")).toEqual([]);
  });
});

describe("POST /cli-auth/token: at the quota", () => {
  it("answers 413 quota.tokens, takes the code and creates nothing", async () => {
    const { h, ana, log } = await setup();
    await fillTokens(h, "ana", 20);
    const approval = await approved(h, ana);
    expect(approval.response.status).toBe(303);
    const response = await exchangeOf(h, approval);
    expect(response.status).toBe(413);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await jsonOf(response)).toEqual({ code: "quota.tokens", message: expect.any(String) });
    expect(await h.store.tokensOf("ana")).toHaveLength(20);
    // The code was consumed, and the person's quota was not a failed guess.
    await expectInvalid(await exchangeOf(h, approval));
    expect(log.failures).toHaveLength(1);
  });

  it("lets the 20th token through and refuses the 21st", async () => {
    const { h, ana } = await setup();
    await fillTokens(h, "ana", 19);
    expect((await exchangeOf(h, await approved(h, ana))).status).toBe(200);
    expect(await h.store.tokensOf("ana")).toHaveLength(20);
    expect((await exchangeOf(h, await approved(h, ana))).status).toBe(413);
    expect(await h.store.tokensOf("ana")).toHaveLength(20);
  });

  it("counts the person's tokens, not other people's", async () => {
    const { h, ana } = await setup();
    await fillTokens(h, "bea", 20);
    expect((await exchangeOf(h, await approved(h, ana))).status).toBe(200);
  });

  it("works again after the person revokes a token and logs in again", async () => {
    const { h, ana } = await setup();
    await fillTokens(h, "ana", 20);
    expect((await exchangeOf(h, await approved(h, ana))).status).toBe(413);
    expect(await h.store.deleteToken("ana", "existing-ana-0")).toBe(true);
    const again = await exchangeOf(h, await approved(h, ana));
    expect(again.status).toBe(200);
    expect(await h.store.tokensOf("ana")).toHaveLength(20);
  });
});

describe("POST /cli-auth/token: a body that cannot be used", () => {
  const BODIES: [string, string | Uint8Array][] = [
    ["an empty body", ""],
    ["text that is not JSON", "not json"],
    ["JSON that stops short", '{"code": "a"'],
    ["a JSON array", "[]"],
    ["a JSON array of the two strings", `["${"A".repeat(43)}","${STATE}"]`],
    ["null", "null"],
    ["a JSON string", '"text"'],
    ["a JSON number", "42"],
    ["true", "true"],
    ["an object without a state", `{"code":"${"A".repeat(43)}"}`],
    ["an object without a code", `{"state":"${STATE}"}`],
    ["an empty object", "{}"],
    ["a numeric code", `{"code":1234,"state":"${STATE}"}`],
    ["a numeric state", `{"code":"${"A".repeat(43)}","state":1234}`],
    ["null for both", '{"code":null,"state":null}'],
    ["an array for the code", `{"code":["${"A".repeat(43)}"],"state":"${STATE}"}`],
    ["objects for both", '{"code":{},"state":{}}'],
    ["bytes that are not UTF-8", new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])],
  ];

  it.each(BODIES)(
    "answers 400 cli.invalid for %s, and counts it as a failure",
    async (_name, body) => {
      const { h, log } = await setup();
      await expectInvalid(await exchange(h, body));
      expect(log.failures).toEqual([{ key: callerOf(IP), at: "2026-10-14T12:00:00.000Z" }]);
      expect(log.tokens).toEqual([]);
      // A body that was never read as an exchange did not even ask for a code.
      expect(log.taken).toEqual([]);
    },
  );

  it("does not use up a good code: a bad body in between changes nothing", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    await expectInvalid(await exchange(h, "not json"));
    await expectInvalid(await exchange(h, { code: approval.code }));
    expect((await exchangeOf(h, approval)).status).toBe(200);
  });

  it("reads the body as JSON whatever its content type says, and ignores keys it does not know", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    const body = `{"code":"${approval.code}","state":"${approval.state}","extra":1,"__proto__":{"x":1}}`;
    const response = await exchange(h, body, { headers: { "Content-Type": "text/plain" } });
    expect(response.status).toBe(200);
  });

  /** A JSON body of exactly `bytes` bytes, padded with an extra key. */
  function padded(code: string, state: string, bytes: number): string {
    const base = JSON.stringify({ code, state, pad: "" });
    return JSON.stringify({ code, state, pad: "x".repeat(bytes - base.length) });
  }

  it("reads up to 4096 bytes and no more", async () => {
    const { h, ana, log } = await setup();
    const exact = await approved(h, ana, { state: stateOf(43, 3) });
    const long = await approved(h, ana, { state: stateOf(43, 4) });
    expect(padded(exact.code, exact.state, 4096)).toHaveLength(4096);
    expect((await exchange(h, padded(exact.code, exact.state, 4096))).status).toBe(200);

    const response = await exchange(h, padded(long.code, long.state, 4097));
    await expectInvalid(response);
    expect(log.failures).toHaveLength(1);
    // The oversize body was refused unread: its code is still good.
    expect((await exchangeOf(h, long)).status).toBe(200);
  });

  it("refuses at once a request that says it is longer than that", async () => {
    const { h, log } = await setup();
    await expectInvalid(
      await exchange(h, `{"code":"a","state":"b"}`, { headers: { "Content-Length": "5000" } }),
    );
    expect(log.failures).toHaveLength(1);
    expect(log.taken).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The rate limit

describe("POST /cli-auth/token: too many failures", () => {
  it("answers 429 cli.rate to the eleventh request of a minute, even with a valid code, and leaves the code alone", async () => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    // Ten failures are answered as failures...
    expect(await failTimes(h, 10)).toEqual(Array(10).fill(400));
    const taken = log.taken.length;
    // ...the eleventh request is limited, valid or not.
    const response = await exchangeOf(h, approval);
    expect(response.status).toBe(429);
    expect(await jsonOf(response)).toEqual({ code: "cli.rate", message: expect.any(String) });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(log.taken).toHaveLength(taken);
    expect(await h.store.tokensOf("ana")).toEqual([]);
  });

  it("lets nine failures be followed by a valid exchange", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    expect(await failTimes(h, 9)).toEqual(Array(9).fill(400));
    expect((await exchangeOf(h, approval)).status).toBe(200);
  });

  it("counts the tenth failure, so the request after it is the one that is limited", async () => {
    const { h } = await setup();
    expect(await failTimes(h, 9)).toEqual(Array(9).fill(400));
    expect(await failTimes(h, 1)).toEqual([400]);
    expect(await failTimes(h, 1)).toEqual([429]);
  });

  it("succeeds again once the minute has passed: a failure exactly a minute old still counts, a millisecond more does not", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    await failTimes(h, 10);

    h.clock.advance(59_999);
    expect((await exchangeOf(h, approval)).status).toBe(429);
    h.clock.advance(1);
    expect((await exchangeOf(h, approval)).status).toBe(429);
    h.clock.advance(1);
    expect((await exchangeOf(h, approval)).status).toBe(200);
  });

  it("does not extend the wait when a limited caller keeps trying", async () => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    await failTimes(h, 10);
    for (let i = 0; i < 5; i++) {
      h.clock.advance(10_000);
      expect((await failTimes(h, 1))[0]).toBe(429);
    }
    expect(log.failures).toHaveLength(10);
    h.clock.advance(10_001);
    expect((await exchangeOf(h, approval)).status).toBe(200);
  });

  it("slides: failures leave the count one by one as they pass the minute", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    await failTimes(h, 6);
    h.clock.advance(30_000);
    await failTimes(h, 4);
    // Ten within the last minute.
    expect((await failTimes(h, 1))[0]).toBe(429);
    // Thirty seconds later the first six are more than a minute old; four remain.
    h.clock.advance(30_001);
    expect((await exchangeOf(h, approval)).status).toBe(200);
  });

  it("limits before it reads: a limited request is not counted again, whatever its body", async () => {
    const { h, log } = await setup();
    await failTimes(h, 10);
    const taken = log.taken.length;
    for (const body of ["", "not json", "{}", { code: "x", state: STATE }]) {
      expect((await exchange(h, body)).status).toBe(429);
    }
    expect(log.failures).toHaveLength(10);
    expect(log.taken).toHaveLength(taken);
  });

  it("does not count a success, and does not forget failures because of one", async () => {
    const { h, ana, log } = await setup();
    const approval = await approved(h, ana);
    await failTimes(h, 9);
    expect((await exchangeOf(h, approval)).status).toBe(200);
    expect(log.failures).toHaveLength(9);
    expect(await failTimes(h, 1)).toEqual([400]);
    expect(await failTimes(h, 1)).toEqual([429]);
  });

  it("counts a body that cannot be used as a failure toward the limit", async () => {
    const { h } = await setup();
    for (let i = 0; i < 10; i++) await expectInvalid(await exchange(h, "not json"));
    expect((await failTimes(h, 1))[0]).toBe(429);
  });

  it("counts an expired code and a wrong state toward the limit too", async () => {
    const { h, ana } = await setup();
    // Five codes approved now, which will be five minutes old when they are sent...
    const old = [];
    for (let i = 0; i < 5; i++) old.push(await approved(h, ana, { state: stateOf(43, i) }));
    h.clock.advance(5 * 60 * 1000);
    // ...and five fresh ones sent with the wrong state, all within the same minute.
    for (let i = 0; i < 5; i++) {
      const fresh = await approved(h, ana, { state: stateOf(43, 10 + i) });
      await expectInvalid(await exchange(h, { code: fresh.code, state: stateOf(43, 30 + i) }));
    }
    for (const approval of old) await expectInvalid(await exchangeOf(h, approval));
    expect((await failTimes(h, 1))[0]).toBe(429);
  });

  it("limits each caller on its own: another address is not held back", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    await failTimes(h, 10, "198.51.100.1");
    expect((await failTimes(h, 1, "198.51.100.1"))[0]).toBe(429);
    // The same moment, the same code, another caller.
    expect((await exchangeOf(h, approval, "198.51.100.2")).status).toBe(200);
  });

  it("tells IPv6 addresses apart from each other and from IPv4 ones", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    await failTimes(h, 10, "2001:db8::1");
    expect((await failTimes(h, 1, "2001:db8::1"))[0]).toBe(429);
    expect((await failTimes(h, 1, "2001:db8::2"))[0]).toBe(400);
    expect((await failTimes(h, 1, "192.0.2.1"))[0]).toBe(400);
    expect((await exchangeOf(h, approval, "2001:db8::3")).status).toBe(200);
  });

  it("puts callers with no address together, apart from every named one", async () => {
    const { h, ana } = await setup();
    const approval = await approved(h, ana);
    await failTimes(h, 10, null);
    expect((await failTimes(h, 1, null))[0]).toBe(429);
    expect((await exchangeOf(h, approval, null)).status).toBe(429);
    expect((await exchangeOf(h, approval, IP)).status).toBe(200);
  });

  it("keys the count with a hash of the address and FORMS_SECRET, never the address", async () => {
    const { h, log } = await setup();
    await failTimes(h, 2, "203.0.113.99");
    expect(log.failures.map((f) => f.key)).toEqual([
      callerOf("203.0.113.99"),
      callerOf("203.0.113.99"),
    ]);
    expect(log.failures[0]?.key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(log.failures)).not.toContain("203.0.113.99");

    const other = await setup({ env: { FORMS_SECRET: "another-forms-secret" } });
    await failTimes(other.h, 1, "203.0.113.99");
    expect(other.log.failures[0]?.key).toBe(callerOf("203.0.113.99", "another-forms-secret"));
    expect(other.log.failures[0]?.key).not.toBe(log.failures[0]?.key);
  });

  it("keys the callers without an address under 'unknown'", async () => {
    const { h, log } = await setup();
    await failTimes(h, 1, null);
    expect(log.failures[0]?.key).toBe(callerOf("unknown"));
  });

  it("keeps the caller's key apart from the csrf token that the same secret makes", async () => {
    const { h, log } = await setup();
    await failTimes(h, 1, IP);
    // Whatever text a session id or an address could be, the two keys cannot meet.
    expect(callerOf(IP)).not.toBe(csrfOf(IP));
    expect(log.failures[0]?.key).toBe(callerOf(IP));
    expect(log.failures[0]?.key).not.toBe(hmacOf(IP));
  });

  it("does not trust any header but CF-Connecting-IP for who is calling", async () => {
    const { h } = await setup();
    const from = (address: string) =>
      exchange(
        h,
        { code: "unknown-code", state: STATE },
        {
          ip: null,
          headers: { "X-Forwarded-For": address, "X-Real-IP": address, Forwarded: address },
        },
      );
    // Ten failures that claim, by other headers, to come from ten different addresses are one
    // caller with no address, and the eleventh is limited whatever address it claims.
    for (let i = 0; i < 10; i++) expect((await from(`192.0.2.${i}`)).status).toBe(400);
    expect((await from("192.0.2.200")).status).toBe(429);
  });
});

// ---------------------------------------------------------------------------------------------
// The whole way

describe("the whole way, from the page to the API", () => {
  it("never shows the token in an address, a page, a header or a redirect before the exchange", async () => {
    const { h: plain, ana } = await setup();
    const { h, seen } = taped(plain);

    const approval = await approved(h, ana);
    const beforeExchange = seen.length;
    const response = await exchangeOf(h, approval);
    const { token } = await jsonOf<{ token: string }>(response);
    expect(token).toMatch(/^mdg_/);

    // Everything the Worker said until the exchange: the page, the redirect.
    expect(seen).toHaveLength(beforeExchange + 1);
    for (const entry of seen.slice(0, beforeExchange)) {
      expect(entry).not.toContain(token);
      expect(entry).not.toContain("mdg_");
    }
    // The code is in the redirect and nowhere in the exchange's answer.
    const answer = seen[beforeExchange]!;
    expect(answer).not.toContain(approval.code);
    expect(answer).not.toContain(approval.state);
  });

  it("is the same person from the sign-in to the token's use", async () => {
    const { h, ana } = await setup();
    // A person signs in only after the command line asked.
    const asked = await h.request(`/cli-auth?${queryOf("43123", STATE)}`);
    expect(asked.status).toBe(302);
    const approval = await approved(h, ana);
    const { token, id } = await jsonOf<{ token: string; id: string }>(
      await exchangeOf(h, approval),
    );
    const session = await h.request("/api/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(await jsonOf(session)).toMatchObject({ user: { sub: "ana" }, token: { id } });
    // Revoking the token (as its owner) ends its use.
    expect(await h.store.deleteToken("ana", id)).toBe(true);
    const revoked = await h.request("/api/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revoked.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------
// What nobody comes back for

describe("what nobody comes back for", () => {
  const FAR_BACK = "1970-01-01T00:00:00.000Z";
  const HOUR_MS = 60 * 60 * 1000;

  it("removes the codes that expired, whoever's they were, as the next approval is made", async () => {
    const { h, ana } = await setup();
    const now = h.clock.now().getTime();
    const code = async (label: string, expiresAt: number) => ({
      hash: await sha256Hex(label),
      sub: "somebody-else",
      state: STATE,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    const old = await code("old", now - HOUR_MS);
    const exactly = await code("exactly", now);
    const live = await code("live", now + 1);
    for (const stored of [old, exactly, live]) await h.store.createCliCode(stored);

    const approval = await approved(h, ana);

    expect(approval.response.status).toBe(303);
    expect(await h.store.takeCliCode(old.hash)).toBeUndefined();
    expect(await h.store.takeCliCode(exactly.hash)).toBeUndefined();
    expect(await h.store.takeCliCode(live.hash)).toEqual(live);
    // The new code is there, to be exchanged.
    expect((await exchangeOf(h, approval)).status).toBe(200);
  });

  it("does not sweep when the approval is refused, for nothing is made", async () => {
    const { h, ana } = await setup();
    const stale = {
      hash: await sha256Hex("stale"),
      sub: "somebody-else",
      state: STATE,
      expiresAt: new Date(h.clock.now().getTime() - HOUR_MS).toISOString(),
    };
    await h.store.createCliCode(stale);

    // A form without its csrf is refused before anything is stored or removed.
    const refused = await postForm(h, ana.cookie, { port: "43123", state: STATE });

    expect(refused.status).toBe(403);
    expect(await h.store.takeCliCode(stale.hash)).toEqual(stale);
  });

  it("removes the failures of callers who never came back, as the next failure is recorded", async () => {
    const { h } = await setup();
    const key = (address: string) => callerOf(address);
    await failTimes(h, 3, "198.51.100.1");

    // An hour later exactly nothing is old enough; a millisecond more and it is.
    h.clock.advance(HOUR_MS);
    await failTimes(h, 1, "198.51.100.2");
    expect(await h.store.cliFailuresSince(key("198.51.100.1"), FAR_BACK)).toBe(3);

    h.clock.advance(1);
    await failTimes(h, 1, "198.51.100.3");
    expect(await h.store.cliFailuresSince(key("198.51.100.1"), FAR_BACK)).toBe(0);
    // The ones that are not old stay, and still count for the limit.
    expect(await h.store.cliFailuresSince(key("198.51.100.2"), FAR_BACK)).toBe(1);
    expect(await h.store.cliFailuresSince(key("198.51.100.3"), FAR_BACK)).toBe(1);
  });

  it("does not sweep for a caller that is limited, nor for an exchange that works", async () => {
    const { h, ana } = await setup();
    const key = callerOf(IP);
    const approval = await approved(h, ana);
    await failTimes(h, 10);
    await failTimes(h, 1, "198.51.100.9");
    // Long after, a limited caller is answered 429 and a stale row is not removed by it.
    h.clock.advance(61 * 1000);
    expect(await h.store.cliFailuresSince(key, FAR_BACK)).toBe(10);
    h.clock.advance(HOUR_MS);
    expect((await exchangeOf(h, approval)).status).toBe(400);
    // (The approval expired, so this exchange failed: that failure swept the old rows.)
    expect(await h.store.cliFailuresSince(key, FAR_BACK)).toBe(1);
  });
});
