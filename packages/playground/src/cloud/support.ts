// The donation path (`playground-exports`, "Exports without the branding"; `account-panel`,
// "Profile and the handle"): a person signed in who is not entitled to export without the Meltemi
// branding, on a service with a sponsored account (the session answer's `support`), is told where to
// donate. The link opens the sponsors page in a new tab and says so to a screen reader; the address
// is the session's, which `supportOf` has made an `https:` one.

import { messages } from "../messages/index.js";
import { h, icon } from "../ui.js";
import type { Session, Support } from "./session.js";

/** A heart, in the canvas's 16 × 16 style. */
const HEART =
  "M8 13.2S2.8 10.2 2.8 6.4A2.6 2.6 0 0 1 8 5.1a2.6 2.6 0 0 1 5.2 1.3c0 3.8-5.2 6.8-5.2 6.8z";

/** An arrow out of a box: the link leaves the page. */
const OUT = "M9.5 3h3.5v3.5|M13 3L8 8|M11.5 9.5v3.5H3V4.5h3.5";

/** The heart of the donation path, drawn with the current colour. */
export function heart(): SVGSVGElement {
  return icon(HEART);
}

/** A link to the sponsors page, in a new tab: its words, a heart before and the way out after. */
export function donationLink(support: Support, label: string, newTab: string): HTMLAnchorElement {
  return h(
    "a",
    {
      class: "donation-link",
      href: support.url,
      target: "_blank",
      rel: "noopener",
      "data-action": "donate",
    },
    heart(),
    h("span", {}, label),
    icon(OUT),
    h("span", { class: "sr-only" }, ` ${newTab}`),
  );
}

/** The support of a session that may donate: signed in on the page, not entitled, and supported. */
export function supportFor(session: Session): Support | undefined {
  if (session.kind !== "cookie" || session.user.entitlements.unbranded) return undefined;
  return session.support;
}

/**
 * The export dialog's line under the Theme field, in the place of the box an entitled person has:
 * the link and the words that a donation made with the GitHub account linked to this one is
 * recognised when the account panel is opened. Nothing for anybody else.
 */
export function donationLine(session: Session): HTMLElement[] {
  const support = supportFor(session);
  if (!support) return [];
  const m = messages().exports;
  const hint = h("span", { class: "field-hint", id: "export-donation-hint" }, m.donateHint);
  const link = donationLink(support, m.donate, m.newTab);
  link.setAttribute("aria-describedby", hint.id);
  return [h("div", { class: "donation-line", "data-donation": "" }, link, hint)];
}
