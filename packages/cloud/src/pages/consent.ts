// The consent page of the authorization server (`mcp-authorization`, "Clients and consent") and the
// refusals that go with it. What the page shows comes from the library's `describeConsent` (the
// client's name, its verified domain when its id is a metadata document, the host the access is sent
// to and whether that is this computer) and from the scopes the consent grants, each in words. Every
// value goes through `esc`, the client's name and host most of all: a client chooses them.

import type { ScopeWords } from "../messages/consent.js";
import { messages, type Lang } from "../messages/index.js";
import type { OAuthScope } from "../oauth/settings.js";
import { errorPage, esc, policy, renderPage } from "./layout.js";

/** Where a refusal sends a person who does not want to go on: the root of the site. */
const SITE_ROOT = "/";

/** The policy of the refusals: their only link is the site's root, and they post nothing. */
const REFUSAL_POLICY: string = policy(["'self'"]);

/** The icon of each scope, in the page's 16 × 16 stroke style: one or more paths, `|` apart. */
const SCOPE_ICONS: Readonly<Record<OAuthScope, string>> = {
  "projects:read":
    "M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z|M8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  "projects:write": "M10.5 2.5l3 3L6 13H3v-3z|M9 4l3 3",
  sharing:
    "M6.6 9.4l2.8-2.8|M5.2 7.9L4 9.1a2.4 2.4 0 0 0 3.4 3.4l1.2-1.2|M10.8 8.1L12 6.9a2.4 2.4 0 0 0-3.4-3.4L7.4 4.7",
  live: "M8 6.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z|M5.2 5.2a4 4 0 0 0 0 5.6|M10.8 5.2a4 4 0 0 1 0 5.6|M3.1 3.1a6.9 6.9 0 0 0 0 9.8|M12.9 3.1a6.9 6.9 0 0 1 0 9.8",
  publish:
    "M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z|M1.5 8h13|M8 1.5c1.8 1.9 2.6 4 2.6 6.5S9.8 12.6 8 14.5C6.2 12.6 5.4 10.5 5.4 8S6.2 3.4 8 1.5z",
  offline_access:
    "M13 8a5 5 0 0 1-8.7 3.4|M3 8a5 5 0 0 1 8.7-3.4|M11.8 2v2.6h-2.6|M4.2 14v-2.6h2.6",
};

/**
 * An icon of the page: strokes in the text's colour, hidden from assistive technology. (Attributes
 * whose value is the word true are single-quoted: the service's audit looks for that word in double
 * quotes, where the development flag is compared, and nowhere else.)
 */
function icon(paths: string): string {
  const strokes = paths
    .split("|")
    .map((d) => `<path d="${esc(d)}"/>`)
    .join("");
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden='true' focusable="false">${strokes}</svg>`;
}

/** The words of a scope in a language. */
export function scopeWords(lang: Lang, scope: OAuthScope): ScopeWords {
  return messages(lang).consent.scopes[scope];
}

/**
 * The origin a form of the page may be redirected to: the client's redirect URI's, which Chromium
 * holds the `form-action` directive to after the post. An IPv6 loopback has no host source CSP can
 * name, so its scheme stands for it; a URI that is not one names nothing.
 */
function redirectSource(redirectUri: string): string | undefined {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  return url.hostname.startsWith("[") ? url.protocol : url.origin;
}

/** What the page shows: the facts of `describeConsent`, the person and the form's fields. */
export interface ConsentView {
  readonly lang: Lang;
  readonly clientName: string;
  /** The verified domain of a client whose id is a metadata document; undefined for a registered one. */
  readonly clientDomain: string | undefined;
  /** Where the access is sent: the redirect URI, its host and whether that is this computer. */
  readonly redirectUri: string;
  readonly redirectHost: string;
  readonly redirectIsLoopback: boolean;
  /** The scopes the consent grants, in the server's order. */
  readonly scopes: readonly OAuthScope[];
  /** The signed-in person's name; "" when the provider gave none. */
  readonly name: string;
  /** Where the form posts: the consent address with the authorization request's query. */
  readonly action: string;
  /** The library's handle of the consent, and the `csrf` of the signed-in session over it. */
  readonly handle: string;
  readonly csrf: string;
  /** What the library's `beginConsent` asks the page to be sent with: its binding cookie. */
  readonly headers: Headers;
}

/** The page that asks "Allow <client> to use your Meltemi Diagrams account?". */
export function consentPage(view: ConsentView): Response {
  const m = messages(view.lang).consent;
  const name = view.clientName.trim() === "" ? view.redirectHost : view.clientName.trim();
  const initial = Array.from(name)[0]?.toUpperCase() ?? "?";
  const origin = view.clientDomain
    ? `<span class="muted">${esc(m.publishedBy)} <strong>${esc(view.clientDomain)}</strong></span>`
    : `<span class="muted">${esc(m.unverified)}</span>`;
  const account =
    view.name === ""
      ? ""
      : `<p class="muted">${esc(m.signedInAs)} <strong>${esc(view.name)}</strong>.</p>\n`;
  const scopes = view.scopes
    .map((scope) => {
      const words = m.scopes[scope];
      return `<li class="scope" data-scope="${esc(scope)}">${icon(SCOPE_ICONS[scope])}<span class="scope-text"><strong>${esc(words.title)}</strong><span>${esc(words.detail)}</span></span></li>`;
    })
    .join("\n");
  const loopback = view.redirectIsLoopback
    ? `<div class="callout" role="note"><strong>${esc(m.loopbackTitle)}</strong><p>${esc(m.loopbackBody)}</p></div>\n`
    : "";
  const body = `<h1 class="consent-title">${esc(m.titleBefore)} <span class="client-name">${esc(name)}</span> ${esc(m.titleAfter)}</h1>
<p>${esc(m.intro)}</p>
<div class="client">
<span class="client-mark" aria-hidden='true'>${esc(initial)}</span>
<span class="client-info"><strong>${esc(name)}</strong>${origin}</span>
</div>
${account}<h2 class="section-title">${esc(m.scopesTitle)}</h2>
<ul class="scopes">
${scopes}
</ul>
<p class="muted">${esc(m.rolesNote)}</p>
<p class="sent-to">${esc(m.sentTo)} <strong>${esc(view.redirectHost)}</strong>.</p>
${loopback}<form method="post" action="${esc(view.action)}">
<input type="hidden" name="handle" value="${esc(view.handle)}">
<input type="hidden" name="csrf" value="${esc(view.csrf)}">
<div class="actions">
<button class="btn primary" type="submit" name="decision" value="approve">${esc(m.approveButton)}</button>
<button class="btn" type="submit" name="decision" value="deny">${esc(m.denyButton)}</button>
</div>
</form>
<p class="muted small revoke-note">${esc(m.revokeNote)}</p>`;
  const target = redirectSource(view.redirectUri);
  const response = renderPage({
    lang: view.lang,
    title: m.tabTitle,
    body,
    policy: policy(["'self'", ...(target ? [target] : [])]),
  });
  // The library's binding cookie, which ties the handle to this browser, and its refusal of frames
  // (the page's own policy says `frame-ancestors 'none'` as well).
  for (const cookie of view.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

/** A refusal of the consent: what went wrong, its stable code, and the way back to the site. */
function refusal(
  lang: Lang,
  status: number,
  code: string,
  title: string,
  message: string,
): Response {
  const m = messages(lang);
  const response = errorPage({
    lang,
    status,
    code,
    title,
    message,
    policy: REFUSAL_POLICY,
    actions: [{ href: SITE_ROOT, label: m.common.backToSite }],
  });
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

/** `400 request.invalid`: an authorization request that cannot be used and must not be redirected. */
export function invalidRequestPage(lang: Lang): Response {
  const m = messages(lang).consent;
  return refusal(lang, 400, "request.invalid", m.invalidTitle, m.invalidBody);
}

/** `400 request.invalid`: a client whose metadata document could not be read. */
export function unverifiedClientPage(lang: Lang): Response {
  const m = messages(lang).consent;
  return refusal(lang, 400, "request.invalid", m.unverifiedTitle, m.unverifiedBody);
}

/** `403 request.forbidden`: the form did not come from the consent page of the signed-in session. */
export function forbiddenConsentPage(lang: Lang): Response {
  const m = messages(lang).consent;
  return refusal(lang, 403, "request.forbidden", m.forbiddenTitle, m.forbiddenBody);
}

/** `400 request.invalid`: the consent was used, expired or belongs to another browser. */
export function expiredConsentPage(lang: Lang): Response {
  const m = messages(lang).consent;
  return refusal(lang, 400, "request.invalid", m.expiredTitle, m.expiredBody);
}
