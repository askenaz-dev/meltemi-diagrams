// What every HTML page of the service is made of: the escaping function, the policy builder and
// the document around a page's body. Every value shown goes through `esc`; every word comes from
// the catalog of the page's language, looked up when the page is made.

import { messages, type Lang } from "../messages/index.js";
import { CLI_AUTH_CSS_PATH } from "./css.js";

/**
 * The site's icon, a file of the playground's build that the assets serve. A page that declares no
 * icon makes the browser ask for `/favicon.ico`, which the site does not have: a 404 in the console.
 */
const ICON_PATH = "/favicon.svg";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes a value for HTML text and for double- or single-quoted attributes. Use it on every value. */
export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * The Content-Security-Policy of a page: nothing is allowed but styles and images from the page's
 * own origin, no `<base>` and no framing. `formAction` is the one directive that differs; it lists
 * where a form may post and where the redirect that follows may go (Chromium applies it to both).
 */
export function policy(formAction: readonly string[]): string {
  return [
    "default-src 'none'",
    "style-src 'self'",
    "img-src 'self'",
    `form-action ${formAction.join(" ")}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export interface PageOptions {
  readonly lang: Lang;
  readonly title: string;
  /** Trusted HTML: every value inside it went through `esc`. */
  readonly body: string;
  readonly status?: number;
  /** The Content-Security-Policy the page answers with. */
  readonly policy: string;
}

/**
 * An HTML page with the headers every page carries. `Referrer-Policy: same-origin` and not
 * `no-referrer`: with `no-referrer` a browser posts a form with `Origin: null`, which the
 * `Origin` rule refuses. A page is never cached: it is the answer to one person's request.
 */
export function renderPage(options: PageOptions): Response {
  const brand = messages(options.lang).common.brand;
  const html = `<!doctype html>
<html lang="${esc(options.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(options.title)} · ${esc(brand)}</title>
<link rel="stylesheet" href="${esc(CLI_AUTH_CSS_PATH)}">
<link rel="icon" href="${esc(ICON_PATH)}" type="image/svg+xml">
</head>
<body>
<main class="card">
<p class="brand">${esc(brand)}</p>
${options.body}
</main>
</body>
</html>
`;
  return new Response(html, {
    status: options.status ?? 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": options.policy,
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

export interface PageAction {
  readonly href: string;
  readonly label: string;
  readonly primary?: boolean;
}

/** A page that says what went wrong, shows its stable code and offers where to go next. */
export function errorPage(options: {
  readonly lang: Lang;
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly policy: string;
  readonly actions?: readonly PageAction[];
}): Response {
  const common = messages(options.lang).common;
  const actions = (options.actions ?? [])
    .map(
      (a) =>
        `<a class="btn${a.primary ? " primary" : ""}" href="${esc(a.href)}">${esc(a.label)}</a>`,
    )
    .join("\n");
  const body = `<h1>${esc(options.title)}</h1>
<p>${esc(options.message)}</p>
<p class="code">${esc(common.codeLabel)}: <code>${esc(options.code)}</code></p>
${actions ? `<p class="actions">${actions}</p>` : ""}`;
  return renderPage({
    lang: options.lang,
    title: options.title,
    body,
    status: options.status,
    policy: options.policy,
  });
}
