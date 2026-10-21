import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RETURN_TO_LENGTH,
  SESSION_TIMEOUT_MS,
  avatarUrl,
  loadSession,
  parseSession,
  returnAddress,
  signInLink,
  type Session,
} from "../src/cloud/session.js";
import {
  fakeFetch,
  hangsUntilAborted,
  jsonResponse,
  textResponse,
  unreadableResponse,
} from "./support/fake-fetch.js";

const PAGE = "https://diagrams.meltemi.dev/";
const IDENTITY = "https://id.meltemi.dev";
/** The link the page builds itself for `PAGE`. */
const OWN_LINK = `${IDENTITY}/login?return_to=${encodeURIComponent(PAGE)}`;
const NOBODY: Session = { kind: "anonymous", signIn: OWN_LINK };

const PICTURE = "https://avatars.githubusercontent.com/u/1?v=4";
const ANA = { sub: "u1", name: "Ana", picture: PICTURE, handle: null };
/** What the Worker answers a browser with a session cookie. */
const COOKIE = { user: ANA, account: `${IDENTITY}/account`, signOut: `${IDENTITY}/logout` };
/** What it answers a bearer token. */
const BEARER = { user: { ...ANA, picture: "" }, token: { id: "t1", name: "CLI (2026-10-14)" } };

const parse = (body: unknown, page = PAGE) => parseSession(JSON.stringify(body), page, IDENTITY);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Every way an answer can fail to say who is signed in. Each of them is nobody. */
const nobody: [string, () => Response | Promise<Response>][] = [
  ["a network error", () => Promise.reject(new TypeError("Failed to fetch"))],
  ["a rejection that is not an error", () => Promise.reject("offline")],
  [
    "a fetch that throws at once",
    () => {
      throw new Error("boom");
    },
  ],
  ["a 404 with a page", () => textResponse("<h1>Not found</h1>", 404, "text/html")],
  ["a 404 with the Worker's JSON", () => jsonResponse({ code: "not-found", message: "No." }, 404)],
  ["a 500", () => textResponse("Internal Server Error", 500)],
  ["a 502 from a proxy", () => textResponse("<html>Bad gateway</html>", 502, "text/html")],
  ["a 401 that carries a user", () => jsonResponse(COOKIE, 401)],
  ["a 403 that carries a user", () => jsonResponse(COOKIE, 403)],
  ["a 201 that carries a user", () => jsonResponse(COOKIE, 201)],
  ["a 204", () => new Response(null, { status: 204 })],
  ["a redirect that carries a user", () => jsonResponse(COOKIE, 302)],
  [
    "an HTML page with a 200",
    () => textResponse("<!doctype html><title>Hi</title>", 200, "text/html"),
  ],
  [
    "HTML that says it is JSON",
    () => textResponse("<!doctype html><title>Hi</title>", 200, "application/json"),
  ],
  [
    "JSON that is cut short",
    () => textResponse('{"user":{"sub":"u1","na', 200, "application/json"),
  ],
  ["an empty body", () => textResponse("")],
  ["a body of blanks", () => textResponse("  \n ")],
  ["a JSON array", () => jsonResponse([COOKIE])],
  ["an array holding an anonymous answer", () => jsonResponse([{ user: null }])],
  ["null", () => textResponse("null", 200, "application/json")],
  ["a JSON string", () => jsonResponse("Ana")],
  ["a JSON number", () => jsonResponse(1)],
  ["true", () => jsonResponse(true)],
  [
    "an object with no user",
    () => jsonResponse({ account: COOKIE.account, signOut: COOKIE.signOut }),
  ],
  ["a user that is a string", () => jsonResponse({ ...COOKIE, user: "Ana" })],
  ["a user that is a number", () => jsonResponse({ ...COOKIE, user: 7 })],
  ["a user that is an array", () => jsonResponse({ ...COOKIE, user: [ANA] })],
  ["an empty user", () => jsonResponse({ ...COOKIE, user: {} })],
  ["a sub that is a number", () => jsonResponse({ ...COOKIE, user: { ...ANA, sub: 1 } })],
  ["an empty sub", () => jsonResponse({ ...COOKIE, user: { ...ANA, sub: "" } })],
  ["no sub", () => jsonResponse({ ...COOKIE, user: { name: "Ana" } })],
  ["a name that is a number", () => jsonResponse({ ...COOKIE, user: { ...ANA, name: 5 } })],
  ["a name that is null", () => jsonResponse({ ...COOKIE, user: { ...ANA, name: null } })],
  ["no name", () => jsonResponse({ ...COOKIE, user: { sub: "u1" } })],
  ["a user with neither account nor sign-out", () => jsonResponse({ user: ANA })],
  ["a body that fails halfway", () => unreadableResponse()],
];

describe("loadSession", () => {
  it("asks once for api/session, a GET beside the page with the cookie of its own origin", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ user: null }));
    await loadSession(
      fetch,
      { href: "https://diagrams.meltemi.dev/play/index.html?project=abc#share=XYZ" },
      IDENTITY,
    );
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    // Relative to the page's address, without its query or fragment.
    expect(url).toBe("https://diagrams.meltemi.dev/play/api/session");
    expect(init.method ?? "GET").toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("asks the page's own origin at the root of a static server", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ user: null }));
    await loadSession(fetch, { href: "http://127.0.0.1:4173/index.html" }, IDENTITY);
    expect(calls.map((call) => call.url)).toEqual(["http://127.0.0.1:4173/api/session"]);
  });

  it("says who is signed in when the answer is a cookie's", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(COOKIE));
    expect(await loadSession(fetch, { href: PAGE }, IDENTITY)).toEqual({
      kind: "cookie",
      user: { sub: "u1", name: "Ana", picture: PICTURE, handle: null },
      account: "https://id.meltemi.dev/account",
      signOut: "https://id.meltemi.dev/logout",
    });
  });

  it("tells a bearer token's answer apart, and offers the sign-in link of its own", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(BEARER));
    expect(await loadSession(fetch, { href: PAGE }, IDENTITY)).toEqual({
      kind: "token",
      user: { sub: "u1", name: "Ana", picture: undefined, handle: null },
      token: { id: "t1", name: "CLI (2026-10-14)" },
      signIn: OWN_LINK,
    });
  });

  it("takes the sign-in link of an anonymous answer that has one", async () => {
    const signIn = `${IDENTITY}/login?return_to=${encodeURIComponent(`${PAGE}?project=abc`)}`;
    const { fetch } = fakeFetch(() => jsonResponse({ user: null, signIn }));
    expect(await loadSession(fetch, { href: PAGE }, IDENTITY)).toEqual({
      kind: "anonymous",
      signIn,
    });
  });

  it("builds the link from the identity origin when an anonymous answer has none", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ user: null }));
    expect(await loadSession(fetch, { href: PAGE }, IDENTITY)).toEqual(NOBODY);
    // The answer a static server gives: the file the build wrote, with a type of no use.
    const served = fakeFetch(() => textResponse('{"user":null}', 200, "application/octet-stream"));
    expect(
      await loadSession(served.fetch, { href: "http://127.0.0.1:4173/index.html" }, IDENTITY),
    ).toEqual({
      kind: "anonymous",
      signIn: `${IDENTITY}/login?return_to=${encodeURIComponent("http://127.0.0.1:4173/index.html")}`,
    });
  });

  it("reads the body as text, whatever type the server says it has", async () => {
    for (const type of ["application/octet-stream", "text/html", "text/plain", ""]) {
      const { fetch } = fakeFetch(() => textResponse(JSON.stringify(COOKIE), 200, type));
      const session = await loadSession(fetch, { href: PAGE }, IDENTITY);
      expect(session.kind, type).toBe("cookie");
    }
  });

  it.each(nobody)("is nobody for %s, with the sign-in link of its own", async (_label, answer) => {
    const { fetch } = fakeFetch(answer);
    expect(await loadSession(fetch, { href: PAGE }, IDENTITY)).toEqual(NOBODY);
  });

  it("is nobody, and does not ask, for a page whose address cannot be read", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(COOKIE));
    const session = await loadSession(fetch, { href: "not an address" }, IDENTITY);
    expect(session).toEqual({
      kind: "anonymous",
      signIn: `${IDENTITY}/login?return_to=not%20an%20address`,
    });
    expect(calls).toHaveLength(0);
  });

  it("never throws and writes nothing to the console, whatever goes wrong", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    for (const [, answer] of nobody) {
      const { fetch } = fakeFetch(answer);
      await expect(loadSession(fetch, { href: PAGE }, IDENTITY)).resolves.toBeDefined();
    }
    await expect(
      loadSession(fakeFetch(() => jsonResponse(COOKIE)).fetch, { href: "x" }, IDENTITY),
    ).resolves.toBeDefined();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("gives up after the timeout, aborts the request and carries on as nobody", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch(({ init }) => hangsUntilAborted(init.signal));
    const pending = loadSession(fetch, { href: PAGE }, IDENTITY);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS - 1);
    expect(calls[0]!.init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(NOBODY);
    expect(calls[0]!.init.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("takes the timeout it is given", async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch(({ init }) => hangsUntilAborted(init.signal));
    const pending = loadSession(fetch, { href: PAGE }, IDENTITY, 120);
    await vi.advanceTimersByTimeAsync(120);
    expect(await pending).toEqual(NOBODY);
  });

  it("does not wait for the timeout when the answer comes, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch(() => jsonResponse(COOKIE));
    const session = await loadSession(fetch, { href: PAGE }, IDENTITY);
    expect(session.kind).toBe("cookie");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the person's work out of the sign-in link: the fragment never leaves the page", async () => {
    const { fetch } = fakeFetch(() => textResponse("<h1>Not found</h1>", 404, "text/html"));
    const session = await loadSession(
      fetch,
      { href: "https://diagrams.meltemi.dev/?project=abc#share=SECRET-PROJECT" },
      IDENTITY,
    );
    expect(session).toEqual({
      kind: "anonymous",
      signIn: `${IDENTITY}/login?return_to=${encodeURIComponent("https://diagrams.meltemi.dev/?project=abc")}`,
    });
    expect(JSON.stringify(session)).not.toContain("SECRET");
  });
});

describe("parseSession", () => {
  it("reads the three shapes of the answer", () => {
    expect(parse(COOKIE)).toEqual({
      kind: "cookie",
      user: { sub: "u1", name: "Ana", picture: PICTURE, handle: null },
      account: "https://id.meltemi.dev/account",
      signOut: "https://id.meltemi.dev/logout",
    });
    expect(parse(BEARER).kind).toBe("token");
    expect(parse({ user: null, signIn: `${IDENTITY}/login?return_to=x` })).toEqual({
      kind: "anonymous",
      signIn: `${IDENTITY}/login?return_to=x`,
    });
    expect(parse({ user: null })).toEqual(NOBODY);
  });

  it("takes a cookie's answer for a cookie even when it also carries a token or a sign-in link", () => {
    const session = parse({ ...COOKIE, token: BEARER.token, signIn: `${IDENTITY}/login` });
    expect(session.kind).toBe("cookie");
  });

  it("keeps a handle that is a string and a name that is empty", () => {
    expect(parse({ ...COOKIE, user: { ...ANA, name: "", handle: "ana" } })).toMatchObject({
      kind: "cookie",
      user: { name: "", handle: "ana" },
    });
    for (const handle of [5, true, {}, [], undefined]) {
      expect(parse({ ...COOKIE, user: { ...ANA, handle } })).toMatchObject({
        user: { handle: null },
      });
    }
    const { handle: _handle, ...withoutHandle } = ANA;
    expect(parse({ ...COOKIE, user: withoutHandle })).toMatchObject({ user: { handle: null } });
  });

  it("leaves a picture out, and keeps the person, when it is not one the page may draw", () => {
    for (const picture of [
      "",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "/me.png",
      5,
      null,
    ]) {
      expect(parse({ ...COOKIE, user: { ...ANA, picture } })).toEqual({
        kind: "cookie",
        user: { sub: "u1", name: "Ana", picture: undefined, handle: null },
        account: "https://id.meltemi.dev/account",
        signOut: "https://id.meltemi.dev/logout",
      });
    }
  });

  it("ignores the fields it does not know", () => {
    expect(
      parse({ ...COOKIE, extra: { nested: true }, user: { ...ANA, email: "ana@example.org" } }),
    ).toEqual(parse(COOKIE));
  });

  describe("the addresses it takes from the answer", () => {
    /** Addresses that must never reach a link or a form. */
    const refused: readonly unknown[] = [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "blob:https://id.meltemi.dev/5b1f",
      "file:///etc/passwd",
      "ftp://id.meltemi.dev/logout",
      "ws://id.meltemi.dev/logout",
      "about:blank",
      "//id.meltemi.dev/logout",
      "/logout",
      "logout",
      "",
      "   ",
      "https://user:secret@id.meltemi.dev/logout",
      "https://user@id.meltemi.dev/logout",
      "https://:secret@id.meltemi.dev/logout",
      "https://",
      42,
      true,
      null,
      {},
      ["https://id.meltemi.dev/logout"],
    ];

    // Each case is wrapped: a case that is itself an array would otherwise be spread as arguments.
    const cases = refused.map((value) => [value]);

    it.each(cases)("never takes %j as the sign-out address", (signOut) => {
      const session = parse({ ...COOKIE, signOut });
      // Not a cookie's answer, so there is no form for the address to reach.
      expect(session).toEqual(NOBODY);
      expect(JSON.stringify(session)).not.toMatch(/javascript|data:|vbscript/i);
    });

    it.each(cases)("never takes %j as the account address", (account) => {
      expect(parse({ ...COOKIE, account })).toEqual(NOBODY);
    });

    it.each(cases)("never takes %j as the sign-in address", (signIn) => {
      expect(parse({ user: null, signIn })).toEqual(NOBODY);
    });

    it("needs both the account and the sign-out address for a cookie's answer", () => {
      expect(parse({ user: ANA, account: COOKIE.account })).toEqual(NOBODY);
      expect(parse({ user: ANA, signOut: COOKIE.signOut })).toEqual(NOBODY);
    });

    it("takes http: and https: addresses, normalised, for a service that runs locally too", () => {
      expect(
        parse({
          ...COOKIE,
          account: "HTTPS://ID.Meltemi.DEV/account?lang=es",
          signOut: "http://localhost:8787/logout",
        }),
      ).toMatchObject({
        kind: "cookie",
        account: "https://id.meltemi.dev/account?lang=es",
        signOut: "http://localhost:8787/logout",
      });
      expect(parse({ user: null, signIn: "http://localhost:8787/login?return_to=x" })).toEqual({
        kind: "anonymous",
        signIn: "http://localhost:8787/login?return_to=x",
      });
    });
  });

  it("reads a token's answer only with a token that has an id and a name", () => {
    expect(parse({ user: ANA, token: { id: "t1" } })).toEqual(NOBODY);
    expect(parse({ user: ANA, token: { id: 1, name: "x" } })).toEqual(NOBODY);
    expect(parse({ user: ANA, token: "t1" })).toEqual(NOBODY);
    expect(parse({ user: ANA, token: null })).toEqual(NOBODY);
  });

  it("never throws, whatever the text", () => {
    for (const text of ["", "{", "[", "null", "\u0000", "<", '{"user":', "{}".repeat(1000)]) {
      expect(parseSession(text, PAGE, IDENTITY)).toEqual(NOBODY);
    }
  });

  it("builds the link of its own for the page it is given", () => {
    const local = parseSession(
      '{"user":null}',
      "http://localhost:8788/?project=abc",
      "http://localhost:8787",
    );
    expect(local).toEqual({
      kind: "anonymous",
      signIn: `http://localhost:8787/login?return_to=${encodeURIComponent("http://localhost:8788/?project=abc")}`,
    });
  });
});

describe("returnAddress", () => {
  it("is the page without its fragment, and keeps the query", () => {
    expect(returnAddress("https://diagrams.meltemi.dev/")).toBe("https://diagrams.meltemi.dev/");
    expect(returnAddress("https://diagrams.meltemi.dev/?project=abc")).toBe(
      "https://diagrams.meltemi.dev/?project=abc",
    );
    expect(returnAddress("https://diagrams.meltemi.dev/?project=abc#share=XYZ")).toBe(
      "https://diagrams.meltemi.dev/?project=abc",
    );
    expect(returnAddress("https://diagrams.meltemi.dev/index.html#")).toBe(
      "https://diagrams.meltemi.dev/index.html",
    );
    expect(returnAddress("https://diagrams.meltemi.dev/#a#b")).toBe(
      "https://diagrams.meltemi.dev/",
    );
  });

  it("drops a share link's fragment however long it is: that is the usual long address", () => {
    const shared = `https://diagrams.meltemi.dev/#share=${"A".repeat(50_000)}`;
    expect(returnAddress(shared)).toBe("https://diagrams.meltemi.dev/");
  });

  it("keeps an address of exactly 2048 characters and shortens a longer one to its path", () => {
    expect(MAX_RETURN_TO_LENGTH).toBe(2048);
    const start = "https://diagrams.meltemi.dev/play?q=";
    const exact = start + "a".repeat(MAX_RETURN_TO_LENGTH - start.length);
    expect(exact).toHaveLength(MAX_RETURN_TO_LENGTH);
    expect(returnAddress(exact)).toBe(exact);
    expect(returnAddress(`${exact}a`)).toBe("https://diagrams.meltemi.dev/play");
    expect(returnAddress(`${exact}a#fragment`)).toBe("https://diagrams.meltemi.dev/play");
  });

  it("falls back to the root of the origin when the path is too long as well", () => {
    expect(returnAddress(`https://diagrams.meltemi.dev/${"a".repeat(3000)}`)).toBe(
      "https://diagrams.meltemi.dev/",
    );
    expect(returnAddress(`http://localhost:8788/${"a/".repeat(2000)}?q=1`)).toBe(
      "http://localhost:8788/",
    );
  });

  it("never gives more than the identity service accepts, for any address of a page", () => {
    const addresses = [
      `https://diagrams.meltemi.dev/?${"x=1&".repeat(1000)}`,
      `https://diagrams.meltemi.dev/${"seg/".repeat(600)}`,
      `https://diagrams.meltemi.dev/?q=${"é".repeat(1500)}#${"f".repeat(100)}`,
      "https://diagrams.meltemi.dev/",
    ];
    for (const address of addresses) {
      expect(returnAddress(address).length, address.slice(0, 40)).toBeLessThanOrEqual(
        MAX_RETURN_TO_LENGTH,
      );
    }
  });

  it("does not throw for something that is not an address", () => {
    expect(returnAddress("not an address")).toBe("not an address");
    expect(() => returnAddress("x".repeat(5000))).not.toThrow();
  });
});

describe("signInLink", () => {
  it("sends the person to the identity service's login and back to the page", () => {
    expect(signInLink(IDENTITY, PAGE)).toBe(OWN_LINK);
    expect(OWN_LINK).toBe(
      "https://id.meltemi.dev/login?return_to=https%3A%2F%2Fdiagrams.meltemi.dev%2F",
    );
  });

  it("does not care for a slash after the identity origin", () => {
    expect(signInLink(`${IDENTITY}/`, PAGE)).toBe(OWN_LINK);
    expect(signInLink(`${IDENTITY}//`, PAGE)).toBe(OWN_LINK);
  });

  it("follows the identity service the page was built for", () => {
    expect(signInLink("http://localhost:8787", "http://localhost:8788/")).toBe(
      "http://localhost:8787/login?return_to=http%3A%2F%2Flocalhost%3A8788%2F",
    );
  });

  it("carries the page's query and drops its fragment, in a link that reads back as the page", () => {
    const addresses = [
      "https://diagrams.meltemi.dev/?project=abc&invite=i%201#share=XYZ",
      "https://diagrams.meltemi.dev/index.html?a=b&c=d%20e",
      "https://diagrams.meltemi.dev/?q=%E2%9C%93+tick&r=a/b?c",
      "http://127.0.0.1:4173/index.html#share=A",
    ];
    for (const address of addresses) {
      const link = signInLink(IDENTITY, address);
      const url = new URL(link);
      expect(url.origin).toBe(IDENTITY);
      expect(url.pathname).toBe("/login");
      expect([...url.searchParams.keys()]).toEqual(["return_to"]);
      expect(url.searchParams.get("return_to")).toBe(address.replace(/#.*$/, ""));
      expect(link).not.toMatch(/[#\s]/);
      expect(link.split("?")).toHaveLength(2);
    }
  });

  it("asks for no more than 2048 characters of return address for a very long page", () => {
    const longQuery = `https://diagrams.meltemi.dev/p/room?${"a=b&".repeat(800)}#share=x`;
    const url = new URL(signInLink(IDENTITY, longQuery));
    const returnTo = url.searchParams.get("return_to")!;
    expect(returnTo.length).toBeLessThanOrEqual(MAX_RETURN_TO_LENGTH);
    expect(returnTo).toBe("https://diagrams.meltemi.dev/p/room");
  });
});

describe("avatarUrl", () => {
  const OWN_PAGE = "http://localhost:8788/";

  it("accepts an https address, normalised", () => {
    expect(avatarUrl(PICTURE, PAGE)).toBe(PICTURE);
    expect(avatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c", PAGE)).toBe(
      "https://lh3.googleusercontent.com/a/abc=s96-c",
    );
    expect(avatarUrl("HTTPS://Avatars.GitHubUserContent.com/u/1", PAGE)).toBe(
      "https://avatars.githubusercontent.com/u/1",
    );
    // Whatever the page's own scheme: the page's policy decides what loads.
    expect(avatarUrl(PICTURE, OWN_PAGE)).toBe(PICTURE);
  });

  it("accepts an http address only under the page's own origin", () => {
    expect(avatarUrl("http://localhost:8788/avatars/ana.png", OWN_PAGE)).toBe(
      "http://localhost:8788/avatars/ana.png",
    );
    expect(
      avatarUrl("http://localhost:8788/me.png", "http://localhost:8788/index.html?p=1#x"),
    ).toBe("http://localhost:8788/me.png");
    // Another port, another host, another scheme: another origin.
    expect(avatarUrl("http://localhost:8789/me.png", OWN_PAGE)).toBeUndefined();
    expect(avatarUrl("http://localhost/me.png", OWN_PAGE)).toBeUndefined();
    expect(avatarUrl("http://evil.example/me.png", OWN_PAGE)).toBeUndefined();
    expect(avatarUrl("http://avatars.githubusercontent.com/u/1", OWN_PAGE)).toBeUndefined();
    expect(avatarUrl("http://diagrams.meltemi.dev/me.png", PAGE)).toBeUndefined();
    // A page that is not an address has no origin to share.
    expect(avatarUrl("http://localhost:8788/me.png", "not an address")).toBeUndefined();
    expect(avatarUrl(PICTURE, "not an address")).toBe(PICTURE);
  });

  it.each([
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    " javascript:alert(1)",
    "blob:https://diagrams.meltemi.dev/5b1f9c2e",
    "ftp://avatars.example/me.png",
    "file:///C:/me.png",
    "about:blank",
    "ws://localhost:8788/me.png",
    "//avatars.githubusercontent.com/u/1",
    "/avatars/ana.png",
    "avatars/ana.png",
    "./ana.png",
    "?x=1",
    "#x",
    "",
    "   ",
  ])("refuses %j, which is no picture the page may draw", (value) => {
    expect(avatarUrl(value, OWN_PAGE)).toBeUndefined();
    expect(avatarUrl(value, PAGE)).toBeUndefined();
  });

  it.each([
    "https://user:secret@avatars.githubusercontent.com/u/1",
    "https://user@avatars.githubusercontent.com/u/1",
    "https://:secret@avatars.githubusercontent.com/u/1",
    "http://user:secret@localhost:8788/me.png",
    "http://user@localhost:8788/me.png",
  ])("refuses %j, which carries credentials", (value) => {
    expect(avatarUrl(value, OWN_PAGE)).toBeUndefined();
  });

  it("refuses what is not a string", () => {
    const values: [string, unknown][] = [
      ["undefined", undefined],
      ["null", null],
      ["0", 0],
      ["a number", 42],
      ["true", true],
      ["false", false],
      ["an object", { href: PICTURE }],
      ["an empty array", []],
      ["an array holding an address", [PICTURE]],
      ["a function", () => PICTURE],
      ["a symbol", Symbol("picture")],
      ["a URL", new URL(PICTURE)],
    ];
    for (const [label, value] of values) {
      expect(avatarUrl(value, OWN_PAGE), label).toBeUndefined();
      expect(avatarUrl(value, PAGE), label).toBeUndefined();
    }
  });
});
