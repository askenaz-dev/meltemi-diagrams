// The routes of the administrators of the service (`publishing`, "Takedown"): today one, which removes
// a publication. They are not the page's and no page links to them; the person who runs the service
// calls them with the session cookie on the page's own origin (the `Origin` rule applies) or from a
// development tool. Everybody else, signed in or not, gets the answer an unknown route gets.

import type { Route } from "../context.js";
import { fail } from "../errors.js";
import { MAX_JSON_BYTES } from "../http.js";
import { HANDLE, SLUG } from "../ids.js";
import { publishedKey } from "../keys.js";
import { readObject } from "./projects.js";

/** The longest reason, in characters (code points) after trimming. */
const MAX_REASON_LENGTH = 500;

/** What a reason may not hold: control characters but the line break and the tab, separators, lone surrogates. */
const FORBIDDEN_IN_REASON = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

/** The reason an administrator gives: text of at most 500 characters, or none. */
function readReason(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw fail("request.invalid", "The reason is text.");
  const reason = value.trim();
  if (Array.from(reason).length > MAX_REASON_LENGTH) {
    throw fail("request.invalid", `The reason has at most ${MAX_REASON_LENGTH} characters.`);
  }
  if (FORBIDDEN_IN_REASON.test(reason.replace(/[\n\t]/g, ""))) {
    throw fail("request.invalid", "The reason cannot hold control characters.");
  }
  return reason;
}

/**
 * `DELETE /api/admin/publications/<handle>/<slug>` with an optional `{ reason }` (a person listed in
 * `ADMIN_SUBS`, with the session cookie): removes the page and the row and records the takedown
 * (`takedowns (handle, slug, by_sub, reason, at)`), after which the address answers 404 and the
 * owner's dialog says the service removed it. `204`.
 *
 * Anybody else is `404 not-found`, the answer of a route that does not exist, and not `403`: a `403`
 * would tell a stranger that the route is there. That is anonymous callers, people who are not
 * listed, and API tokens even of a listed person (an administrator acts on the page, where the
 * `Origin` rule stands; a token is for programs and is stolen more easily). The `Origin` rule itself
 * comes first, as for every change made with the cookie. The page is deleted first and the record
 * written second, so that a failure of the bucket leaves everything as it was and the administrator
 * tries again, while a failure after it leaves a row with no page, which the publish host does not
 * serve and a second try completes.
 */
export const takedownRoute: Route = async (ctx) => {
  const { principal, config, deps, env } = ctx;
  if (principal?.via !== "cookie" || !config.admins.has(principal.sub)) throw fail("not-found");

  const handle = ctx.params["handle"] ?? "";
  const slug = ctx.params["slug"] ?? "";
  const none = () => fail("not-found", "There is no such publication.");
  if (!HANDLE.test(handle) || !SLUG.test(slug)) throw none();
  const reason = readReason(
    (await readObject(ctx, MAX_JSON_BYTES, "request.invalid", true))["reason"],
  );
  if (!(await deps.store.publication(handle, slug))) throw none();

  await env.BLOBS.delete(publishedKey(handle, slug));
  const removed = await deps.store.takeDown({
    handle,
    slug,
    bySub: principal.sub,
    reason,
    at: deps.now().toISOString(),
  });
  // Somebody (the owner) took it down between the two: there is nothing left to record.
  if (!removed) throw none();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
