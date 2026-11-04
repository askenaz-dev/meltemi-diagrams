// The pages of the command line's approval: what they say in each language, that every value in
// them is escaped, the headers and policy they answer with, and the stylesheet they link.

import { describe, expect, it } from "vitest";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { messages, resolveLang, type Lang } from "../src/messages/index.js";
import {
  CLI_AUTH_POLICY,
  approvalPage,
  forbiddenPage,
  invalidPage,
  type ApprovalView,
} from "../src/pages/cli-auth.js";
import { CLI_AUTH_CSS, CLI_AUTH_CSS_PATH } from "../src/pages/css.js";
import { errorPage, esc, policy, renderPage } from "../src/pages/layout.js";
import {
  STATE,
  checkOf,
  csrfOf,
  exchange,
  fieldOf,
  postForm,
  queryOf,
} from "./support/cli-auth.js";
import { harness, jsonOf, type Harness } from "./support/index.js";

const POLICY =
  "default-src 'none'; style-src 'self'; img-src 'self'; " +
  "form-action 'self' http://127.0.0.1:*; base-uri 'none'; frame-ancestors 'none'";

const ORIGIN = "https://diagrams.meltemi.dev";

/** The directive of a policy, as written. */
function directive(policyText: string, name: string): string | undefined {
  return policyText.split("; ").find((part) => part === name || part.startsWith(`${name} `));
}

/** A tiny matcher of `form-action` for the simple sources this policy uses. */
function formActionAllows(policyText: string, target: string, self: string): boolean {
  const sources = (directive(policyText, "form-action") ?? "").split(" ").slice(1);
  const url = new URL(target, self);
  return sources.some((source) => {
    if (source === "'self'") return url.origin === new URL(self).origin;
    const parts = /^(https?):\/\/([^:/]+)(?::(\d+|\*))?$/.exec(source);
    if (!parts) return false;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return (
      `${parts[1]}:` === url.protocol &&
      parts[2] === url.hostname &&
      (parts[3] === "*" || parts[3] === port)
    );
  });
}

/** The values of every `href`, `src` and `action` attribute of a page. */
function addressesOf(html: string): string[] {
  return [...html.matchAll(/\s(?:href|src|action)="([^"]*)"/g)].map((m) => m[1] ?? "");
}

function view(overrides: Partial<ApprovalView> = {}): ApprovalView {
  return {
    lang: "en",
    port: "43123",
    state: STATE,
    check: checkOf(STATE),
    csrf: csrfOf("sid-ana"),
    name: "Ana",
    ...overrides,
  };
}

/** Ana signed in, and a way to ask for the approval page as she would. */
async function ana(options: Parameters<typeof harness>[0] = {}) {
  const h = await harness(options);
  const person = await h.signedIn({ sub: "ana", name: "Ana" });
  const page = (query = queryOf("43123", STATE), headers: Record<string, string> = {}) =>
    h.request(`/cli-auth?${query}`, h.fromPage(person.cookie, { headers }));
  return { h, person, page };
}

// ---------------------------------------------------------------------------------------------
// Escaping

describe("esc", () => {
  it("escapes every character that can start markup or leave an attribute", () => {
    expect(esc("<b>x</b>")).toBe("&lt;b&gt;x&lt;/b&gt;");
    expect(esc(`"quoted" and 'single'`)).toBe("&quot;quoted&quot; and &#39;single&#39;");
    expect(esc("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes the ampersand first, so an entity in the text stays visible text", () => {
    expect(esc("&lt;")).toBe("&amp;lt;");
    expect(esc("&#39;")).toBe("&amp;#39;");
  });

  it("keeps a value from leaving its attribute", () => {
    const html = `<a href="${esc(`" onmouseover="alert(1)`)}">x</a>`;
    expect(html).toBe(`<a href="&quot; onmouseover=&quot;alert(1)">x</a>`);
    expect(html.match(/"/g)).toHaveLength(2);
  });

  it("turns other values into their text and leaves plain text alone", () => {
    expect(esc(42)).toBe("42");
    expect(esc("")).toBe("");
    expect(esc("plain text, with ñ and ¿?")).toBe("plain text, with ñ and ¿?");
    expect(esc(undefined)).toBe("undefined");
  });
});

// ---------------------------------------------------------------------------------------------
// The language

describe("the language of a page", () => {
  const lang = (query: string, acceptLanguage: string | null) =>
    resolveLang(new URL(`${ORIGIN}/cli-auth${query}`), acceptLanguage);

  it("is English without any hint", () => {
    expect(lang("", null)).toBe("en");
    expect(lang("", "")).toBe("en");
  });

  it("follows ?lang before the Accept-Language header", () => {
    expect(lang("?lang=es", "en-US,en;q=0.9")).toBe("es");
    expect(lang("?lang=en", "es-CL,es;q=0.9")).toBe("en");
  });

  it("takes Spanish from Accept-Language, regional variants included", () => {
    expect(lang("", "es-CL,es;q=0.9,en;q=0.8")).toBe("es");
    expect(lang("", "es")).toBe("es");
    expect(lang("", "ES-mx")).toBe("es");
    expect(lang("", "en-GB")).toBe("en");
  });

  it("takes the first of the two that is listed when no weight says otherwise", () => {
    expect(lang("", "fr, es, en")).toBe("es");
    expect(lang("", "fr, en, es")).toBe("en");
    expect(lang("", "es,en")).toBe("es");
    expect(lang("", "en,es")).toBe("en");
  });

  it("honours weights: the best of English and Spanish wins, not the first listed", () => {
    expect(lang("", "en;q=0.5,es;q=0.9")).toBe("es");
    expect(lang("", "es;q=0.2, en;q=0.8")).toBe("en");
    expect(lang("", "fr,es;q=0.1,en;q=0.05")).toBe("es");
  });

  it("ignores a language the person refuses or weighs with something that is not a number", () => {
    expect(lang("", "es;q=0,en;q=0.1")).toBe("en");
    expect(lang("", "es;q=0")).toBe("en");
    expect(lang("", "es;q=high,en;q=0.1")).toBe("en");
    expect(lang("", "es;q=1.2.3")).toBe("en");
  });

  it("falls back to English for languages the service does not speak", () => {
    expect(lang("?lang=fr", null)).toBe("en");
    expect(lang("", "fr-FR,de;q=0.8")).toBe("en");
    expect(lang("", "*")).toBe("en");
    expect(lang("?lang=", null)).toBe("en");
  });

  it("falls through an unsupported ?lang to the header, and reads ?lang strictly", () => {
    expect(lang("?lang=fr", "es")).toBe("es");
    expect(lang("?lang=ES", null)).toBe("en");
    expect(lang("?lang=es%20", "en")).toBe("en");
    expect(lang("?lang=<script>", "es")).toBe("es");
  });

  it("is chosen per request: one language never leaks into the next", async () => {
    const { page } = await ana();
    const spanish = await (await page(queryOf("43123", STATE, { lang: "es" }))).text();
    const english = await (await page(queryOf("43123", STATE, { lang: "en" }))).text();
    const spanishAgain = await (await page(queryOf("43123", STATE, { lang: "es" }))).text();
    expect(english).toContain(en.cliAuth.title);
    expect(english).not.toContain(es.cliAuth.title);
    expect(spanishAgain).toBe(spanish);
  });
});

// ---------------------------------------------------------------------------------------------
// The policy and the headers

describe("the policy", () => {
  it("is exactly the approval page's", () => {
    expect(CLI_AUTH_POLICY).toBe(POLICY);
  });

  it("builds the same directives around the form-action it is given", () => {
    expect(policy(["'self'"])).toBe(
      "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; " +
        "base-uri 'none'; frame-ancestors 'none'",
    );
  });

  it("allows nothing it does not need", () => {
    for (const forbidden of [
      "unsafe-inline",
      "unsafe-eval",
      "script-src",
      "connect-src",
      "frame-src",
      "font-src",
      "https:",
      "data:",
      "blob:",
    ]) {
      expect(CLI_AUTH_POLICY, forbidden).not.toContain(forbidden);
    }
    expect(directive(CLI_AUTH_POLICY, "default-src")).toBe("default-src 'none'");
    expect(directive(CLI_AUTH_POLICY, "base-uri")).toBe("base-uri 'none'");
    expect(directive(CLI_AUTH_POLICY, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(CLI_AUTH_POLICY, "style-src")).toBe("style-src 'self'");
    expect(directive(CLI_AUTH_POLICY, "img-src")).toBe("img-src 'self'");
  });

  it("lets a form post to the page's own origin and the redirect land on the loopback, and nowhere else", () => {
    const allowed = (target: string) => formActionAllows(CLI_AUTH_POLICY, target, ORIGIN);
    expect(allowed(`${ORIGIN}/cli-auth?lang=en`)).toBe(true);
    expect(allowed("http://127.0.0.1:43123/?code=c&state=s")).toBe(true);
    expect(allowed("http://127.0.0.1:1024/")).toBe(true);
    expect(allowed("http://127.0.0.1:65535/")).toBe(true);
    for (const target of [
      "https://127.0.0.1:43123/",
      "http://localhost:43123/",
      "http://127.0.0.2:43123/",
      "http://127.0.0.1.evil.example:43123/",
      "http://[::1]:43123/",
      "https://evil.example/",
      "https://id.meltemi.dev/",
      "http://diagrams.meltemi.dev/cli-auth",
    ]) {
      expect(allowed(target), target).toBe(false);
    }
  });
});

describe("the headers of every page", () => {
  /** One of each page the route answers, with the status it answers with. */
  async function pages(): Promise<[string, Response, number][]> {
    const { h, person, page } = await ana();
    const refused = await postForm(h, person.cookie, { port: "43123", state: STATE }, "/cli-auth");
    return [
      ["the approval page", await page(), 200],
      ["the approval page in Spanish", await page(queryOf("43123", STATE, { lang: "es" })), 200],
      ["a request that cannot be used", await h.request("/cli-auth?port=80"), 400],
      ["a request that cannot be used, signed in", await page(queryOf("80", STATE)), 400],
      ["a form that is not the page's", refused, 403],
    ];
  }

  it("carry the policy, a same-origin referrer policy, nosniff and no cache", async () => {
    for (const [name, response, status] of await pages()) {
      expect(response.status, name).toBe(status);
      expect(response.headers.get("Content-Type"), name).toBe("text/html; charset=utf-8");
      expect(response.headers.get("Content-Security-Policy"), name).toBe(POLICY);
      expect(response.headers.get("Referrer-Policy"), name).toBe("same-origin");
      expect(response.headers.get("X-Content-Type-Options"), name).toBe("nosniff");
      expect(response.headers.get("Cache-Control"), name).toBe("no-store");
    }
  });

  it("never use no-referrer: the form's post must carry an Origin, not null", async () => {
    for (const [name, response] of await pages()) {
      expect(response.headers.get("Referrer-Policy"), name).not.toMatch(/no-referrer/);
    }
  });

  it("set no cookie", async () => {
    for (const [name, response] of await pages()) {
      expect(response.headers.get("Set-Cookie"), name).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The layout

describe("a page", () => {
  const lang = "en";
  const render = (overrides: Partial<Parameters<typeof renderPage>[0]> = {}) =>
    renderPage({ lang, title: "T", body: "<p>x</p>", policy: POLICY, ...overrides });

  it("answers with the status and policy it is given and is never cached", () => {
    const response = render({ status: 418, policy: "default-src 'none'" });
    expect(response.status).toBe(418);
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(render().status).toBe(200);
  });

  it("escapes its title and its language, and the brand follows the language", async () => {
    const html = await render({ title: "<script>alert(1)</script>", lang: "es" }).text();
    expect(html).toContain(
      "<title>&lt;script&gt;alert(1)&lt;/script&gt; · Meltemi Diagrams</title>",
    );
    expect(html).toContain('<html lang="es">');
    expect(html).not.toContain("<script>");
    const hostile = await render({ lang: `"><script>` as unknown as Lang }).text();
    expect(hostile).toContain('<html lang="&quot;&gt;&lt;script&gt;">');
    expect(hostile).not.toContain("<script>");
  });

  it("links the stylesheet and the icon from its own origin and uses no inline style, script or form of its own", async () => {
    const html = await render().text();
    expect(html).toContain(`<link rel="stylesheet" href="${CLI_AUTH_CSS_PATH}">`);
    // Without an icon a browser asks for /favicon.ico, which the site does not have.
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).not.toMatch(/<script|<style|style=|<form|<base|<iframe|<img/i);
    expect(addressesOf(html)).toEqual([CLI_AUTH_CSS_PATH, "/favicon.svg"]);
  });

  it("sets the viewport and the colour scheme and states its character set", async () => {
    const html = await render().text();
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
  });

  it("an error page escapes its code, words and links, and shows the code", async () => {
    const html = await errorPage({
      lang,
      code: "<code>",
      status: 400,
      title: "<h1>t</h1>",
      message: `"><img src=x>`,
      policy: POLICY,
      actions: [{ href: `/x?a=1&b="2"`, label: "<b>go</b>", primary: true }],
    }).text();
    expect(html).toContain("<code>&lt;code&gt;</code>");
    expect(html).toContain("&lt;h1&gt;t&lt;/h1&gt;");
    expect(html).toContain("&quot;&gt;&lt;img src=x&gt;");
    expect(html).toContain('href="/x?a=1&amp;b=&quot;2&quot;"');
    expect(html).toContain("&lt;b&gt;go&lt;/b&gt;");
    expect(html).not.toMatch(/<img|<b>go/);
    expect(html).toContain('class="btn primary"');
  });

  it("an error page without actions has no empty action row", async () => {
    const html = await errorPage({
      lang,
      code: "x.y",
      status: 400,
      title: "t",
      message: "m",
      policy: POLICY,
    }).text();
    expect(html).not.toContain('class="actions"');
  });
});

// ---------------------------------------------------------------------------------------------
// The approval page

describe("the approval page", () => {
  it("asks, in English, 'Allow the command line on this computer?' and offers Approve and Cancel", async () => {
    const html = await approvalPage(view()).text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<h1>Allow the command line on this computer?</h1>");
    expect(html).toContain(
      "<title>Allow the command line on this computer? · Meltemi Diagrams</title>",
    );
    expect(html).toContain('<button class="btn primary" type="submit">Approve</button>');
    expect(html).toContain('<a class="btn" href="/">Cancel</a>');
  });

  it("asks the same in Spanish", async () => {
    const html = await approvalPage(view({ lang: "es" })).text();
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("<h1>¿Permitir la línea de comandos en este equipo?</h1>");
    expect(html).toContain('<button class="btn primary" type="submit">Aprobar</button>');
    expect(html).toContain('<a class="btn" href="/">Cancelar</a>');
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Allow the command line");
  });

  it.each(["en", "es"] as const)("names the port and the check, in %s", async (lang) => {
    const m = messages(lang).cliAuth;
    const html = await approvalPage(view({ lang, port: "48765", check: "ABC234" })).text();
    expect(html).toContain(`${m.portBefore} <strong>48765</strong> ${m.portAfter}`);
    expect(html).toContain(`${m.checkLabel}: <code class="check">ABC234</code>`);
    expect(html).toContain(m.checkNote);
    expect(html).toContain(m.grantNote);
  });

  it("holds the check alone in a code element", async () => {
    const html = await approvalPage(view()).text();
    expect([...html.matchAll(/<code[^>]*>([^<]*)<\/code>/g)].map((m) => m[1])).toEqual([
      checkOf(STATE),
    ]);
  });

  it("has one form that posts to the page itself, with the port, the state and the csrf token", async () => {
    const html = await approvalPage(view({ lang: "es" })).text();
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).toContain('<form method="post" action="/cli-auth?lang=es">');
    const hidden = [...html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)];
    expect(hidden.map((m) => [m[1], m[2]])).toEqual([
      ["port", "43123"],
      ["state", STATE],
      ["csrf", csrfOf("sid-ana")],
    ]);
    expect(html.match(/<input/g)).toHaveLength(3);
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("links only the stylesheet, the icon, its own form action and the site root", async () => {
    const html = await approvalPage(view()).text();
    expect(addressesOf(html).sort()).toEqual([
      "/",
      "/cli-auth/style.css",
      "/cli-auth?lang=en",
      "/favicon.svg",
    ]);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("uses nothing the policy forbids: no script, style, handler, frame, image or base", async () => {
    for (const lang of ["en", "es"] as const) {
      const html = await approvalPage(view({ lang })).text();
      expect(html, lang).not.toMatch(/<script|<style|<iframe|<img|<base|<object|<embed|<svg/i);
      expect(html, lang).not.toMatch(/\sstyle=|\son[a-z]+=|javascript:/i);
      expect(html.match(/<link/g), lang).toHaveLength(2);
    }
  });

  it("shows who is signed in, and leaves the line out when the provider gave no name", async () => {
    const named = await approvalPage(view({ name: "Ana" })).text();
    expect(named).toContain(`${en.cliAuth.signedInAs} <strong>Ana</strong>.`);
    const nameless = await approvalPage(view({ name: "" })).text();
    expect(nameless).not.toContain(en.cliAuth.signedInAs);
  });

  it("escapes every value it is given", async () => {
    const html = await approvalPage(
      view({
        port: `"><script>alert(1)</script>`,
        state: `' onfocus='alert(2)`,
        check: "<b>x</b>",
        csrf: `"&amp;<`,
        name: "<img src=x onerror=alert(3)>",
      }),
    ).text();
    expect(html).toContain("<strong>&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</strong>");
    expect(html).toContain('name="port" value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).toContain(`name="state" value="&#39; onfocus=&#39;alert(2)"`);
    expect(html).toContain('<code class="check">&lt;b&gt;x&lt;/b&gt;</code>');
    expect(html).toContain('name="csrf" value="&quot;&amp;amp;&lt;"');
    expect(html).toContain("<strong>&lt;img src=x onerror=alert(3)&gt;</strong>");
    expect(html).not.toMatch(/<script|<img|<b>x/);
    expect(html.match(/<input/g)).toHaveLength(3);
  });

  it("is not served from the cache of a shared proxy", () => {
    expect(approvalPage(view()).headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("the refusals", () => {
  it.each(["en", "es"] as const)(
    "400 cli.invalid in %s shows the stable code and a way out",
    async (lang) => {
      const m = messages(lang);
      const response = invalidPage(lang);
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).toContain(`<h1>${m.cliAuth.invalidTitle}</h1>`);
      expect(html).toContain(m.cliAuth.invalidBody);
      expect(html).toContain(`${m.common.codeLabel}: <code>cli.invalid</code>`);
      expect(html).toContain(`<a class="btn" href="/">${m.common.backToSite}</a>`);
      expect(html).not.toContain("<form");
    },
  );

  it.each(["en", "es"] as const)(
    "403 request.forbidden in %s shows the stable code and a way out",
    async (lang) => {
      const m = messages(lang);
      const response = forbiddenPage(lang);
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain(`<h1>${m.cliAuth.forbiddenTitle}</h1>`);
      expect(html).toContain(m.cliAuth.forbiddenBody);
      expect(html).toContain(`${m.common.codeLabel}: <code>request.forbidden</code>`);
      expect(html).toContain(`<a class="btn" href="/">${m.common.backToSite}</a>`);
      expect(html).not.toContain("<form");
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The pages as the Worker serves them

describe("the pages through the Worker", () => {
  it("shows the approval page in the language the address asks for, whatever the browser prefers", async () => {
    const { page } = await ana();
    const spanish = await (
      await page(queryOf("43123", STATE, { lang: "es" }), { "Accept-Language": "en-US,en;q=0.9" })
    ).text();
    expect(spanish).toContain('<html lang="es">');
    expect(spanish).toContain(es.cliAuth.title);
    expect(fieldOf(spanish, "csrf")).toBeDefined();
    const english = await (
      await page(queryOf("43123", STATE, { lang: "en" }), { "Accept-Language": "es-CL,es" })
    ).text();
    expect(english).toContain('<html lang="en">');
    expect(english).toContain(en.cliAuth.title);
  });

  it.each([
    ["es-CL,es;q=0.9,en;q=0.8", "es"],
    ["es", "es"],
    ["en-US,en;q=0.9,es;q=0.8", "en"],
    ["en;q=0.4,es;q=0.9", "es"],
    ["fr-FR,de;q=0.8", "en"],
    ["", "en"],
  ])("follows Accept-Language %j to %s", async (acceptLanguage, expected) => {
    const { page } = await ana();
    const html = await (await page(undefined, { "Accept-Language": acceptLanguage })).text();
    expect(html).toContain(`<html lang="${expected}">`);
    expect(html).toContain(messages(expected as Lang).cliAuth.title);
  });

  it("is in English without a language hint", async () => {
    const { page } = await ana();
    const html = await (await page()).text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<h1>Allow the command line on this computer?</h1>");
  });

  it("keeps the language in the form, so the refusal after the post speaks it too", async () => {
    const { page } = await ana();
    for (const lang of ["en", "es"] as const) {
      const html = await (await page(queryOf("43123", STATE, { lang }))).text();
      expect(html).toContain(`action="/cli-auth?lang=${lang}"`);
    }
  });

  it("answers the refusals of the request in the language of the request", async () => {
    const { h } = await ana();
    const spanish = await (
      await h.request(`/cli-auth?${queryOf("80", STATE, { lang: "es" })}`)
    ).text();
    expect(spanish).toContain('<html lang="es">');
    expect(spanish).toContain(es.cliAuth.invalidTitle);
    const byHeader = await (
      await h.request(`/cli-auth?${queryOf("80", STATE)}`, { headers: { "Accept-Language": "es" } })
    ).text();
    expect(byHeader).toContain(es.cliAuth.invalidTitle);
    const english = await (await h.request(`/cli-auth?${queryOf("80", STATE)}`)).text();
    expect(english).toContain(en.cliAuth.invalidTitle);
  });

  it("answers the refusal of a post in the language of the post", async () => {
    const { h, person } = await ana();
    const response = await postForm(
      h,
      person.cookie,
      { port: "43123", state: STATE, csrf: "wrong" },
      "/cli-auth",
      { headers: { "Accept-Language": "es-CL,es;q=0.9" } },
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toContain(es.cliAuth.forbiddenTitle);
  });

  it("reads a hostile ?lang as no language at all", async () => {
    const { page } = await ana();
    for (const lang of [
      `<script>alert(1)</script>`,
      `"><img src=x>`,
      "es' onload='x",
      "ES",
      "%00",
    ]) {
      const response = await page(queryOf("43123", STATE, { lang }));
      const html = await response.text();
      expect(html, lang).toContain('<html lang="en">');
      expect(html, lang).not.toMatch(/<script|<img/);
    }
  });

  it("shows nothing of a request that cannot be used, not even escaped", async () => {
    const { h, page } = await ana();
    const hostilePort = `<img src=x onerror=alert(1)>`;
    const hostileState = `<script>alert(2)</script>`;
    const requests = [
      h.request(`/cli-auth?${queryOf(hostilePort, hostileState)}`),
      page(queryOf(hostilePort, hostileState)),
      page(queryOf("43123", hostileState)),
      page(queryOf(hostilePort, STATE)),
    ];
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).not.toMatch(/<img|<script|onerror|alert\(/);
      expect(html).not.toContain("script");
      expect(html).not.toContain(STATE);
      expect(html).toContain("<code>cli.invalid</code>");
    }
  });

  it("shows a name as text, never as markup", async () => {
    const { h } = await ana();
    const person = await h.signedIn({ sub: "mallory", name: "<img src=x onerror=alert(1)>" });
    const response = await h.request(
      `/cli-auth?${queryOf("43123", STATE)}`,
      h.fromPage(person.cookie),
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<strong>&lt;img src=x onerror=alert(1)&gt;</strong>");
    // The words stay as text: no tag of the name is a tag of the page.
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<img src=x");
    expect(response.headers.get("Content-Security-Policy")).toBe(POLICY);
  });

  it("shows the person's name and nothing else of the session", async () => {
    const { h } = await ana();
    const person = await h.signedIn({
      sub: "user-7f3a9c",
      sid: "sid-5e1d44",
      name: "Ana",
      email: "private.address@example.com",
      picture: "https://avatars.githubusercontent.com/u/12345",
    });
    const html = await (
      await h.request(`/cli-auth?${queryOf("43123", STATE)}`, h.fromPage(person.cookie))
    ).text();
    expect(html).toContain("<strong>Ana</strong>");
    for (const secret of [
      person.cookie.slice("meltemi_session=".length),
      "user-7f3a9c",
      "sid-5e1d44",
      "private.address@example.com",
      "avatars.githubusercontent.com",
    ]) {
      expect(html, secret).not.toContain(secret);
    }
  });

  it("makes the form's action and the redirect that follows both allowed by the policy of the page", async () => {
    const { h, person, page } = await ana();
    const html = await (await page()).text();
    const policyText = (await page()).headers.get("Content-Security-Policy")!;
    const action = /<form method="post" action="([^"]*)">/.exec(html)![1]!;
    expect(formActionAllows(policyText, action, ORIGIN)).toBe(true);
    const posted = await postForm(
      h,
      person.cookie,
      {
        port: fieldOf(html, "port")!,
        state: fieldOf(html, "state")!,
        csrf: fieldOf(html, "csrf")!,
      },
      action,
    );
    expect(posted.status).toBe(303);
    expect(formActionAllows(policyText, posted.headers.get("Location")!, ORIGIN)).toBe(true);
  });

  it("is the exact page the exchange's callers expect: the check printed by the terminal is in it", async () => {
    // `mdg login` prints the first six characters of the base32 of SHA-256(state).
    const { page } = await ana();
    const state = "q8WmZc3Xv0Lk_pTn5RbYdJh2-AeUo7Gs"; // 32 characters
    const html = await (await page(queryOf("43123", state))).text();
    expect(html).toContain(`<code class="check">${checkOf(state)}</code>`);
    expect(checkOf(state)).toMatch(/^[A-Z2-7]{6}$/);
  });
});

// ---------------------------------------------------------------------------------------------
// The stylesheet

describe("GET /cli-auth/style.css", () => {
  it("serves the stylesheet as CSS, public, for an hour", async () => {
    const h = await harness();
    const response = await h.request("/cli-auth/style.css");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe(CLI_AUTH_CSS);
  });

  it("is the address the pages link", async () => {
    const { h, page } = await ana();
    const href = /<link rel="stylesheet" href="([^"]*)">/.exec(await (await page()).text())?.[1];
    expect(href).toBe("/cli-auth/style.css");
    expect(CLI_AUTH_CSS_PATH).toBe(href);
    expect((await h.request(href!)).status).toBe(200);
  });

  it("needs no session, asks nobody who is calling, and sets no cookie", async () => {
    const { h, person } = await ana();
    const anonymous = await h.request("/cli-auth/style.css");
    const signedIn = await h.request("/cli-auth/style.css", h.fromPage(person.cookie));
    // A bearer token that does not exist would be 401 on a route that asked.
    const bogus = await h.request("/cli-auth/style.css", {
      headers: { Authorization: "Bearer mdg_nonsense" },
    });
    for (const response of [anonymous, signedIn, bogus]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }
    expect(await signedIn.text()).toBe(await anonymous.text());
    // Only the signed-in request had a cookie to verify: the anonymous and bogus ones did not.
    expect(h.identity.calls.length).toBeLessThanOrEqual(2);
  });

  it("is a route of its own: other methods and other paths under /cli-auth are not found", async () => {
    const h = await harness();
    const post = await h.request("/cli-auth/style.css", { method: "POST" });
    expect(post.status).toBe(404);
    expect((await jsonOf<{ code: string }>(post)).code).toBe("not-found");
    for (const path of ["/cli-auth/style.css/", "/cli-auth/style.css.map", "/cli-auth/other.css"]) {
      expect((await h.request(path)).status, path).toBe(404);
    }
    expect(h.assets.calls).toEqual([]);
  });

  it("is served on the Worker's own host only", async () => {
    const h = await harness();
    expect((await h.request("https://meltemi.page/cli-auth/style.css")).status).toBe(404);
  });

  it("names no other address: the policy lets a page load styles from its own origin only", () => {
    expect(CLI_AUTH_CSS).not.toMatch(/@import|url\(|https?:|\/\/|@font-face/);
  });

  it("uses the family's tokens, in light and in dark", () => {
    expect(CLI_AUTH_CSS).toContain("--accent: #2563eb;");
    expect(CLI_AUTH_CSS).toContain("--accent: #60a5fa;");
    expect(CLI_AUTH_CSS).toContain("@media (prefers-color-scheme: dark)");
    expect(CLI_AUTH_CSS).toContain("color-scheme: light dark;");
  });

  it("defines every variable it uses", () => {
    const defined = new Set([...CLI_AUTH_CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...CLI_AUTH_CSS.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(10);
    for (const name of used) expect(defined.has(name), name).toBe(true);
  });

  it("keeps the dark values of the variables it redefines, and no more than it defines", () => {
    // Every variable the dark scheme redefines is one the light scheme defines.
    const dark = /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/g;
    const light = CLI_AUTH_CSS.split("@media")[0] ?? "";
    for (const block of CLI_AUTH_CSS.matchAll(dark)) {
      for (const name of (block[1] ?? "").matchAll(/(--[a-z0-9-]+)\s*:/g)) {
        expect(CLI_AUTH_CSS.indexOf(`${name[1]}:`), name[1]).toBeGreaterThanOrEqual(0);
        expect(light.length).toBeGreaterThan(0);
      }
    }
  });

  it("is small", () => {
    expect(CLI_AUTH_CSS.length).toBeLessThan(6000);
  });
});

// ---------------------------------------------------------------------------------------------
// The catalogs

/** Every leaf of a catalog, by its path. */
function leaves(value: unknown, path = ""): Map<string, unknown> {
  const found = new Map<string, unknown>();
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      for (const [p, v] of leaves(child, path ? `${path}.${key}` : key)) found.set(p, v);
    }
  } else {
    found.set(path, value);
  }
  return found;
}

describe("the catalogs", () => {
  // Names are the same in every language; the rest are words.
  const SAME = new Set(["common.brand"]);

  it("have the same words in both languages: same paths, same kinds", () => {
    const english = leaves(en);
    const spanish = leaves(es);
    expect([...spanish.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [path, leaf] of english) expect(typeof spanish.get(path), path).toBe(typeof leaf);
  });

  it("have no word that is empty, and every Spanish word is its own", () => {
    const english = leaves(en);
    const spanish = leaves(es);
    for (const [path, leaf] of english) {
      const inEnglish = String(leaf);
      const inSpanish = String(spanish.get(path));
      expect(inEnglish.length, path).toBeGreaterThan(0);
      expect(inSpanish.length, path).toBeGreaterThan(0);
      if (!SAME.has(path)) expect(inSpanish, path).not.toBe(inEnglish);
    }
  });

  it("hold plain text: no markup and no placeholder left in a word", () => {
    for (const [path, leaf] of [...leaves(en), ...leaves(es)]) {
      expect(String(leaf), path).not.toMatch(/[<>&]|\$\{|\{\}/);
    }
  });

  it("are chosen by language", () => {
    expect(messages("en")).toBe(en);
    expect(messages("es")).toBe(es);
  });

  it("put the question in the title and the instruction to refuse in the note", () => {
    expect(en.cliAuth.title).toBe("Allow the command line on this computer?");
    expect(en.cliAuth.title.endsWith("?")).toBe(true);
    expect(es.cliAuth.title.startsWith("¿") && es.cliAuth.title.endsWith("?")).toBe(true);
    for (const note of [en.cliAuth.checkNote, es.cliAuth.checkNote])
      expect(note).toMatch(/mdg login/);
  });
});

// ---------------------------------------------------------------------------------------------
// The request is the only thing the pages react to

describe("the exchange does not answer with a page", () => {
  it("answers JSON, never HTML, whatever the language asked", async () => {
    const h: Harness = await harness();
    const response = await exchange(h, "not json", { headers: { "Accept-Language": "es" } });
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });
});
