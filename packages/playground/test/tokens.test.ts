import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NAME_MAX,
  TOKEN_LIMIT,
  checkName,
  explain,
  nameProblem,
  tokenApi,
  whenText,
  type ApiFailure,
} from "../src/cloud/tokens.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { fakeFetch, jsonResponse, textResponse } from "./support/fake-fetch.js";

const PAGE = "https://diagrams.meltemi.dev/";
const LAPTOP = {
  id: "t1",
  name: "laptop",
  created_at: "2026-10-01T10:00:00.000Z",
  last_used_at: "2026-10-12T08:30:00.000Z",
};
const CI = { id: "t2", name: "CI", created_at: "2026-10-05T09:00:00.000Z", last_used_at: null };

describe("tokenApi.list", () => {
  it("reads GET api/tokens beside the page, with the person's cookie", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ tokens: [LAPTOP, CI] }));
    const api = tokenApi(fetch, {
      href: "https://diagrams.meltemi.dev/index.html?project=a#share=Z",
    });
    expect(await api.list()).toEqual({
      ok: true,
      value: [
        {
          id: "t1",
          name: "laptop",
          createdAt: "2026-10-01T10:00:00.000Z",
          lastUsedAt: "2026-10-12T08:30:00.000Z",
        },
        { id: "t2", name: "CI", createdAt: "2026-10-05T09:00:00.000Z", lastUsedAt: null },
      ],
    });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://diagrams.meltemi.dev/api/tokens");
    expect(init.method ?? "GET").toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("reads an empty list", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ tokens: [] }));
    expect(await tokenApi(fetch, { href: PAGE }).list()).toEqual({ ok: true, value: [] });
  });

  it("leaves out a row that has no id or no name, and fills what a row may lack", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        tokens: [
          { id: "t1" },
          { name: "no id" },
          { id: 5, name: "id is a number" },
          { id: "t2", name: 7 },
          null,
          5,
          "t3",
          [],
          { id: "t4", name: "bare" },
          { id: "t5", name: "odd", created_at: 17, last_used_at: 18 },
          { id: "t6", name: "kept", created_at: "2026-10-01T10:00:00.000Z", last_used_at: null },
        ],
      }),
    );
    expect(await tokenApi(fetch, { href: PAGE }).list()).toEqual({
      ok: true,
      value: [
        { id: "t4", name: "bare", createdAt: "", lastUsedAt: null },
        { id: "t5", name: "odd", createdAt: "", lastUsedAt: null },
        { id: "t6", name: "kept", createdAt: "2026-10-01T10:00:00.000Z", lastUsedAt: null },
      ],
    });
  });

  it("does not take an answer for a list unless it is one", async () => {
    const answers: [string, () => Response][] = [
      ["a page", () => textResponse("<!doctype html><title>Hi</title>", 200, "text/html")],
      ["cut short", () => textResponse('{"tokens":[{"id":"t1"', 200, "application/json")],
      ["an empty body", () => textResponse("")],
      ["no content", () => new Response(null, { status: 204 })],
      ["a bare array", () => jsonResponse([LAPTOP])],
      ["an empty object", () => jsonResponse({})],
      ["tokens as a string", () => jsonResponse({ tokens: "t1" })],
      ["tokens as null", () => jsonResponse({ tokens: null })],
      ["tokens as an object", () => jsonResponse({ tokens: { t1: LAPTOP } })],
      ["null", () => textResponse("null")],
    ];
    for (const [label, answer] of answers) {
      const { fetch } = fakeFetch(answer);
      const outcome = await tokenApi(fetch, { href: PAGE }).list();
      expect(outcome.ok, label).toBe(false);
      if (!outcome.ok) expect(outcome.failure.kind, label).toBe("unexpected");
    }
  });

  it("says why the service refused, with its code and message", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ code: "auth.required", message: "Sign in first." }, 401),
    );
    expect(await tokenApi(fetch, { href: PAGE }).list()).toEqual({
      ok: false,
      failure: { kind: "refused", status: 401, code: "auth.required", message: "Sign in first." },
    });
  });

  it("keeps only the status of a refusal that is not the service's own", async () => {
    for (const answer of [
      () => textResponse("<h1>Bad gateway</h1>", 502, "text/html"),
      () => textResponse("", 500),
      () => jsonResponse(["nope"], 500),
      () => jsonResponse({ code: 5, message: { text: "x" } }, 500),
      () => jsonResponse({ code: "", message: "" }, 500),
    ]) {
      const { fetch } = fakeFetch(answer);
      const outcome = await tokenApi(fetch, { href: PAGE }).list();
      expect(outcome).toMatchObject({ ok: false, failure: { kind: "refused" } });
      if (!outcome.ok) {
        expect(outcome.failure).not.toHaveProperty("code");
        expect(outcome.failure).not.toHaveProperty("message");
      }
    }
  });

  it("shortens a code and a message that are too long to show", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ code: "c".repeat(500), message: "m".repeat(5000) }, 400),
    );
    const outcome = await tokenApi(fetch, { href: PAGE }).list();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.code).toHaveLength(80);
      expect(outcome.failure.message).toHaveLength(300);
    }
  });

  it("treats a redirect as a refusal and a failure to connect as unreachable", async () => {
    const redirect = fakeFetch(() => new Response(null, { status: 302 }));
    expect(await tokenApi(redirect.fetch, { href: PAGE }).list()).toEqual({
      ok: false,
      failure: { kind: "refused", status: 302 },
    });
    const offline = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await tokenApi(offline.fetch, { href: PAGE }).list()).toEqual({
      ok: false,
      failure: { kind: "unreachable", status: 0 },
    });
  });
});

describe("tokenApi.create", () => {
  it("posts the name as JSON to api/tokens and gives the token it gets back", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({ id: "t9", name: "laptop", token: "mdg_FAKE-TOKEN" }, 201),
    );
    const outcome = await tokenApi(fetch, { href: `${PAGE}?project=a#share=Z` }).create("laptop");
    expect(outcome).toEqual({
      ok: true,
      value: { id: "t9", name: "laptop", token: "mdg_FAKE-TOKEN" },
    });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://diagrams.meltemi.dev/api/tokens");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe('{"name":"laptop"}');
  });

  it("sends a name as JSON, whatever characters it holds", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({ id: "t9", name: "x", token: "mdg_FAKE-TOKEN" }, 201),
    );
    const name = 'a "quoted" name, 100% \\ <b>héllo</b> ✓';
    await tokenApi(fetch, { href: PAGE }).create(name);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ name });
  });

  it("does not take an answer for a token unless it has an id, a name and the token", async () => {
    const answers: [string, () => Response][] = [
      ["no token", () => jsonResponse({ id: "t9", name: "x" }, 201)],
      ["an empty token", () => jsonResponse({ id: "t9", name: "x", token: "" }, 201)],
      ["a token that is a number", () => jsonResponse({ id: "t9", name: "x", token: 7 }, 201)],
      ["no id", () => jsonResponse({ name: "x", token: "mdg_a" }, 201)],
      ["an id that is a number", () => jsonResponse({ id: 9, name: "x", token: "mdg_a" }, 201)],
      ["no name", () => jsonResponse({ id: "t9", token: "mdg_a" }, 201)],
      ["an array", () => jsonResponse([{ id: "t9", name: "x", token: "mdg_a" }], 201)],
      ["a page", () => textResponse("<!doctype html>", 201, "text/html")],
      ["nothing", () => new Response(null, { status: 201 })],
    ];
    for (const [label, answer] of answers) {
      const { fetch } = fakeFetch(answer);
      expect(await tokenApi(fetch, { href: PAGE }).create("x"), label).toEqual({
        ok: false,
        failure: { kind: "unexpected", status: 201 },
      });
    }
  });

  it("gives the quota's refusal with its code", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ code: "quota.tokens", message: "You hold the most tokens." }, 413),
    );
    expect(await tokenApi(fetch, { href: PAGE }).create("x")).toEqual({
      ok: false,
      failure: {
        kind: "refused",
        status: 413,
        code: "quota.tokens",
        message: "You hold the most tokens.",
      },
    });
  });

  it("never keeps the token anywhere but in the outcome it gives", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({ id: "t9", name: "x", token: "mdg_FAKE-TOKEN" }, 201),
    );
    const api = tokenApi(fetch, { href: PAGE });
    await api.create("x");
    // Nothing the api object holds, and nothing it asked, carries the token.
    expect(JSON.stringify(Object.keys(api))).not.toContain("mdg_");
    expect(JSON.stringify(calls)).not.toContain("mdg_FAKE-TOKEN");
  });
});

describe("tokenApi.revoke", () => {
  it("sends DELETE to the token's address and is done at a 204", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await tokenApi(fetch, { href: PAGE }).revoke("t1")).toEqual({ ok: true, value: null });
    const { url, init } = calls[0]!;
    expect(url).toBe("https://diagrams.meltemi.dev/api/tokens/t1");
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBeUndefined();
  });

  it("puts nothing but the id in the path, however odd the id is", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    await tokenApi(fetch, { href: PAGE }).revoke("a/b c?d#e%f");
    expect(calls[0]!.url).toBe("https://diagrams.meltemi.dev/api/tokens/a%2Fb%20c%3Fd%23e%25f");
    await tokenApi(fetch, { href: PAGE }).revoke("../../logout");
    expect(new URL(calls[1]!.url).pathname).toBe("/api/tokens/..%2F..%2Flogout");
  });

  it("is done at any 2xx, whatever the body", async () => {
    for (const answer of [
      () => jsonResponse({ ok: true }),
      () => textResponse("<html></html>", 200, "text/html"),
      () => textResponse("", 202),
    ]) {
      const { fetch } = fakeFetch(answer);
      expect(await tokenApi(fetch, { href: PAGE }).revoke("t1")).toEqual({ ok: true, value: null });
    }
  });

  it("says a token that is not there is refused with a 404, and a 401 with its code", async () => {
    const gone = fakeFetch(() =>
      jsonResponse({ code: "not-found", message: "No such token." }, 404),
    );
    expect(await tokenApi(gone.fetch, { href: PAGE }).revoke("t1")).toEqual({
      ok: false,
      failure: { kind: "refused", status: 404, code: "not-found", message: "No such token." },
    });
    const out = fakeFetch(() => jsonResponse({ code: "auth.required", message: "Sign in." }, 401));
    expect(await tokenApi(out.fetch, { href: PAGE }).revoke("t1")).toMatchObject({
      ok: false,
      failure: { status: 401, code: "auth.required" },
    });
  });
});

describe("checkName", () => {
  it("trims the name and takes it", () => {
    expect(checkName("laptop")).toEqual({ ok: true, name: "laptop" });
    expect(checkName("  laptop  ")).toEqual({ ok: true, name: "laptop" });
    expect(checkName("\t laptop  ")).toEqual({ ok: true, name: "laptop" });
    expect(checkName("my laptop (work)")).toEqual({ ok: true, name: "my laptop (work)" });
    expect(checkName("<b>x</b> & ñ ✓")).toEqual({ ok: true, name: "<b>x</b> & ñ ✓" });
  });

  it("refuses no name at all", () => {
    for (const text of ["", " ", "   ", "\t", "\n", " ", " "]) {
      expect(checkName(text), JSON.stringify(text)).toEqual({ ok: false, reason: "empty" });
    }
  });

  it("allows as many characters as the service does, counting a character, not a UTF-16 unit", () => {
    expect(NAME_MAX).toBe(60);
    expect(checkName("a".repeat(60))).toEqual({ ok: true, name: "a".repeat(60) });
    expect(checkName("a".repeat(61))).toEqual({ ok: false, reason: "long" });
    // 60 emoji are 120 UTF-16 units: still 60 characters.
    expect(checkName("😀".repeat(60)).ok).toBe(true);
    expect(checkName("😀".repeat(61))).toEqual({ ok: false, reason: "long" });
    // Spaces around a name do not count: the name is trimmed first.
    expect(checkName(` ${"a".repeat(60)} `).ok).toBe(true);
  });

  it("refuses control characters, line and paragraph separators and lone surrogates", () => {
    for (const bad of [
      "a\tb",
      "a\nb",
      "a\rb",
      "a\u0000b",
      "a\u0007b",
      "a\u001bb",
      "a\u007fb",
      "a\u0085b",
      "a b",
      "a b",
      "a\ud800b",
      "a\udfffb",
      "\u0000",
    ]) {
      expect(checkName(bad), JSON.stringify(bad)).toEqual({ ok: false, reason: "control" });
    }
  });

  it("checks the length before the characters, as the service does", () => {
    expect(checkName(`${"a".repeat(61)}\u0000`)).toEqual({ ok: false, reason: "long" });
  });
});

describe("the service's limits", () => {
  const read = (file: string) =>
    readFileSync(new URL(`../../cloud/src/${file}`, import.meta.url), "utf8");

  it("are the page's: the most tokens an account holds and the longest name", () => {
    const quota = /MAX_TOKENS\s*=\s*(\d+)/.exec(read("store/types.ts"));
    const longest = /MAX_NAME_LENGTH\s*=\s*(\d+)/.exec(read("routes/tokens.ts"));
    expect(quota?.[1], "MAX_TOKENS in the service").toBeDefined();
    expect(longest?.[1], "MAX_NAME_LENGTH in the service").toBeDefined();
    expect(TOKEN_LIMIT).toBe(Number(quota![1]));
    expect(NAME_MAX).toBe(Number(longest![1]));
  });

  it("refuse the same characters in a name", () => {
    const rule = /FORBIDDEN_IN_NAME\s*=\s*(\/.+\/[a-z]*);/.exec(read("routes/tokens.ts"));
    expect(rule?.[1], "FORBIDDEN_IN_NAME in the service").toBeDefined();
    const [, source, flags] = /^\/(.+)\/([a-z]*)$/.exec(rule![1]!)!;
    const service = new RegExp(source!, flags);
    for (const text of ["a", "a b", "😀", "ñ", "a\tb", "a\u0000b", "a b", "a b", "a\ud800b"]) {
      expect(checkName(text).ok, JSON.stringify(text)).toBe(!service.test(text.trim()));
    }
  });
});

describe("nameProblem and explain", () => {
  const refused = (status: number, code?: string, message?: string): ApiFailure => ({
    kind: "refused",
    status,
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
  });

  it("puts a refused name in words", () => {
    expect(nameProblem("empty", en.tokens)).toBe("Give the token a name.");
    expect(nameProblem("long", en.tokens)).toBe("The name takes at most 60 characters.");
    expect(nameProblem("control", en.tokens)).toBe("The name cannot hold control characters.");
    expect(nameProblem("empty", es.tokens)).toBe("Escribe un nombre para el token.");
    expect(nameProblem("long", es.tokens)).toBe("El nombre admite como máximo 60 caracteres.");
    expect(nameProblem("control", es.tokens)).toBe(
      "El nombre no puede contener caracteres de control.",
    );
  });

  it("explains a service that cannot be reached or answers something unreadable", () => {
    expect(explain({ kind: "unreachable", status: 0 }, en.tokens)).toBe(en.tokens.unreachable);
    expect(explain({ kind: "unexpected", status: 200 }, en.tokens)).toBe(en.tokens.unexpected);
    expect(explain({ kind: "unreachable", status: 0 }, es.tokens)).toBe(es.tokens.unreachable);
    expect(explain({ kind: "unexpected", status: 201 }, es.tokens)).toBe(es.tokens.unexpected);
  });

  it("explains the quota in the page's language, by its code or by its status", () => {
    const english =
      "An account holds at most 20 tokens. Revoke one you no longer use, then create this one.";
    const spanish =
      "Una cuenta admite como máximo 20 tokens. Revoca alguno que ya no uses y crea este.";
    expect(TOKEN_LIMIT).toBe(20);
    for (const failure of [
      refused(413, "quota.tokens", "You hold the most tokens."),
      refused(413, "quota.tokens"),
      refused(413),
      refused(400, "quota.tokens", "Quota."),
    ]) {
      expect(explain(failure, en.tokens)).toBe(english);
      expect(explain(failure, es.tokens)).toBe(spanish);
    }
  });

  it("explains a signed-out page, by its code or by its status", () => {
    for (const failure of [
      refused(401, "auth.required", "Sign in."),
      refused(401),
      refused(403, "auth.required", "Sign in."),
    ]) {
      expect(explain(failure, en.tokens)).toBe(
        "You are signed out. Reload the page and sign in again.",
      );
      expect(explain(failure, es.tokens)).toBe(
        "La sesión ya no está iniciada. Vuelve a cargar la página e inicia sesión de nuevo.",
      );
    }
  });

  it("shows the service's own message and code for any other refusal", () => {
    expect(explain(refused(403, "request.forbidden", "Not from this page."), en.tokens)).toBe(
      "Not from this page. (request.forbidden)",
    );
    expect(explain(refused(400, "request.invalid", "The token needs a name."), es.tokens)).toBe(
      "The token needs a name. (request.invalid)",
    );
  });

  it("falls back to the status when the refusal has no message and code to show", () => {
    for (const failure of [
      refused(500),
      refused(502, "gateway"),
      refused(500, undefined, "Oops"),
    ]) {
      expect(explain(failure, en.tokens)).toBe(
        `The service answered with status ${failure.status}.`,
      );
      expect(explain(failure, es.tokens)).toBe(
        `El servicio respondió con el estado ${failure.status}.`,
      );
    }
  });
});

describe("whenText", () => {
  // The spaces ICU writes before AM and PM are not always plain ones.
  const flat = (text: string) => text.replace(/\s/g, " ");

  it("writes a time for the person, in the language and the time zone", () => {
    expect(flat(whenText("2026-10-14T12:30:00.000Z", "en", "UTC"))).toBe("Oct 14, 2026, 12:30 PM");
    expect(flat(whenText("2026-10-14T12:30:00.000Z", "es", "UTC"))).toMatch(
      /^14 oct\.? 2026,? 12:30$/,
    );
    expect(flat(whenText("2026-10-14T23:30:00.000Z", "en", "Asia/Tokyo"))).toBe(
      "Oct 15, 2026, 8:30 AM",
    );
    // Buenos Aires keeps the same offset all year.
    expect(
      flat(whenText("2026-10-14T23:30:00.000Z", "es", "America/Argentina/Buenos_Aires")),
    ).toMatch(/^14 oct\.? 2026,? 20:30$/);
  });

  it("uses the time zone of the browser when none is given", () => {
    // Midday in Greenwich is the 14th or the 15th wherever the browser is.
    expect(whenText("2026-10-14T12:30:00.000Z", "en")).toMatch(/^Oct 1[45], 2026, /);
  });

  it("shows a time it cannot read as it is, as text", () => {
    expect(whenText("yesterday", "en")).toBe("yesterday");
    expect(whenText("<b>soon</b>", "es")).toBe("<b>soon</b>");
    expect(whenText("", "en")).toBe("");
  });
});
