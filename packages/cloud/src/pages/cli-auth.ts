// The pages of the command line's approval: the page that asks, and the two refusals that answer
// a request which cannot be used. Every value goes through `esc`; every word comes from the catalog
// of the page's language.

import { messages, type Lang } from "../messages/index.js";
import { errorPage, esc, policy, renderPage } from "./layout.js";

/**
 * The policy of these pages. `form-action` lists the loopback interface on any port because
 * Chromium applies it to the redirect that follows the form: `POST /cli-auth` answers with a
 * redirect to the listener of the command line on `127.0.0.1`.
 */
export const CLI_AUTH_POLICY: string = policy(["'self'", "http://127.0.0.1:*"]);

/** Where a page sends a person who does not want to go on: the root of the site. */
const SITE_ROOT = "/";

export interface ApprovalView {
  readonly lang: Lang;
  /** The loopback port the command line listens on, already validated. */
  readonly port: string;
  /** The request's `state`, already validated; the form posts it back. */
  readonly state: string;
  /** The six characters the terminal also shows. */
  readonly check: string;
  /** The `csrf` token of the signed-in session. */
  readonly csrf: string;
  /** The signed-in person's name; "" when the provider gave none. */
  readonly name: string;
}

/** The page that asks: "Allow the command line on this computer?" with the port, the check and the form. */
export function approvalPage(view: ApprovalView): Response {
  const m = messages(view.lang).cliAuth;
  const account =
    view.name === ""
      ? ""
      : `<p class="muted">${esc(m.signedInAs)} <strong>${esc(view.name)}</strong>.</p>\n`;
  const body = `<h1>${esc(m.title)}</h1>
<p>${esc(m.intro)}</p>
${account}<p>${esc(m.portBefore)} <strong>${esc(view.port)}</strong> ${esc(m.portAfter)}</p>
<p class="check-line">${esc(m.checkLabel)}: <code class="check">${esc(view.check)}</code></p>
<p class="muted">${esc(m.checkNote)}</p>
<p class="muted">${esc(m.grantNote)}</p>
<form method="post" action="${esc(`/cli-auth?lang=${view.lang}`)}">
<input type="hidden" name="port" value="${esc(view.port)}">
<input type="hidden" name="state" value="${esc(view.state)}">
<input type="hidden" name="csrf" value="${esc(view.csrf)}">
<div class="actions">
<button class="btn primary" type="submit">${esc(m.approveButton)}</button>
<a class="btn" href="${esc(SITE_ROOT)}">${esc(m.cancelLink)}</a>
</div>
</form>`;
  return renderPage({ lang: view.lang, title: m.title, body, policy: CLI_AUTH_POLICY });
}

/** `400 cli.invalid`: the request's port or state cannot be used. Nothing of the input is shown. */
export function invalidPage(lang: Lang): Response {
  const m = messages(lang);
  return errorPage({
    lang,
    status: 400,
    code: "cli.invalid",
    title: m.cliAuth.invalidTitle,
    message: m.cliAuth.invalidBody,
    policy: CLI_AUTH_POLICY,
    actions: [{ href: SITE_ROOT, label: m.common.backToSite }],
  });
}

/** `403 request.forbidden`: the form did not come from the approval page of the signed-in session. */
export function forbiddenPage(lang: Lang): Response {
  const m = messages(lang);
  return errorPage({
    lang,
    status: 403,
    code: "request.forbidden",
    title: m.cliAuth.forbiddenTitle,
    message: m.cliAuth.forbiddenBody,
    policy: CLI_AUTH_POLICY,
    actions: [{ href: SITE_ROOT, label: m.common.backToSite }],
  });
}
