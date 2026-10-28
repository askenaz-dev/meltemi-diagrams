// The routes of the administrators of the service: the takedown of a publication (`publishing`,
// "Takedown") and the entitlement of an account to export without the Meltemi branding
// (`cloud-accounts`, "Entitlements"). They are not the page's and no page links to them; the person
// who runs the service calls them with the session cookie on the page's own origin (the `Origin`
// rule applies), from the browser's console or a development tool. Everybody else, signed in or
// not, gets the answer an unknown route gets.

import type { Ctx, Route } from "../context.js";
import { fail } from "../errors.js";
import { json, MAX_JSON_BYTES } from "../http.js";
import { HANDLE, SLUG } from "../ids.js";
import { publishedKey } from "../keys.js";
import type { User } from "../store/types.js";
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

/** The administrator of a request, by their `sub`; anybody else is answered as by an unknown route. */
function administrator(ctx: Ctx): string {
  const { principal, config } = ctx;
  if (principal?.via !== "cookie" || !config.admins.has(principal.sub)) throw fail("not-found");
  return principal.sub;
}

/** The longest account id the routes take; ids are short, random identifiers. */
const MAX_SUB_LENGTH = 200;

/** What an account id may not hold: control characters. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * The account a path names: `@<handle>` for the person who holds the handle, or the account id
 * (the `sub`, which Profile shows its owner) taken as given. An account with no row, a handle nobody
 * holds and anything that is neither is `404 not-found`, and nothing is created.
 */
async function accountOf(ctx: Ctx): Promise<User> {
  const account = ctx.params["account"] ?? "";
  const none = () => fail("not-found", "There is no such account.");
  let user: User | undefined;
  if (account.startsWith("@")) {
    const handle = account.slice(1);
    if (!HANDLE.test(handle)) throw none();
    user = await ctx.deps.store.userByHandle(handle);
  } else {
    if (account === "" || account.length > MAX_SUB_LENGTH || CONTROL.test(account)) throw none();
    user = await ctx.deps.store.user(account);
  }
  if (!user) throw none();
  return user;
}

/** An account and its entitlement, as the administrators' routes answer it. */
function entitlementOf(user: User) {
  return {
    sub: user.sub,
    handle: user.handle,
    name: user.name,
    entitlements: {
      unbranded: user.unbrandedExports,
      by: user.unbrandedExportsBy,
      at: user.unbrandedExportsAt,
    },
  };
}

/**
 * `GET /api/admin/accounts/<account>/entitlements` (an administrator, with the session cookie): the
 * account's entitlement to export without the branding, who last set it and when. `<account>` is
 * the `sub` or `@<handle>`. The row says what was set: an administrator's own row says `false`
 * until somebody grants it, although the session answer entitles every administrator.
 */
export const entitlementsRoute: Route = async (ctx) => {
  administrator(ctx);
  return json(entitlementOf(await accountOf(ctx)));
};

/**
 * `PUT /api/admin/accounts/<account>/entitlements` with `{ "unbranded": boolean }` (an
 * administrator, with the session cookie): entitles the account, or revokes it, recording the
 * administrator and the time, and answers as the `GET` does. Another body is `400
 * request.invalid`, and nothing is written. The person sees it at the next load of the page.
 */
export const setEntitlementsRoute: Route = async (ctx) => {
  const by = administrator(ctx);
  const user = await accountOf(ctx);
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  const unbranded = body["unbranded"];
  if (typeof unbranded !== "boolean" || Object.keys(body).length !== 1) {
    throw fail("request.invalid", 'The body is { "unbranded": true } or { "unbranded": false }.');
  }
  const at = ctx.deps.now().toISOString();
  if ((await ctx.deps.store.setUnbrandedExports(user.sub, unbranded, by, at)) === "missing") {
    throw fail("not-found", "There is no such account.");
  }
  return json(
    entitlementOf({
      ...user,
      unbrandedExports: unbranded,
      unbrandedExportsBy: by,
      unbrandedExportsAt: at,
    }),
  );
};

/**
 * `GET /api/admin/entitlements` (an administrator, with the session cookie): the accounts entitled
 * to export without the branding, the earliest grant first, as `{ "accounts": [...] }`.
 */
export const entitlementsListRoute: Route = async (ctx) => {
  administrator(ctx);
  const users = await ctx.deps.store.entitledUsers();
  return json({ accounts: users.map(entitlementOf) });
};
