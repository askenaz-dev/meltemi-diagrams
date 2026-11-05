// Connected apps (`cloud-accounts`, "The account's connected apps"; `mcp-authorization`, "Connected
// apps"): the OAuth grants a person approved on the consent page, which the account panel lists and
// revokes. The grants are the authorization server's (`oauth/provider.ts`, in `OAUTH_KV`); this
// service adds the name of the client a grant was approved for (its metadata) and when its token was
// last used (`app_uses`). Both routes are for a person signed in on the page: a token, an API token
// or an OAuth one, never manages apps (`403 request.forbidden`), nobody is `401 auth.required`, and
// the router holds the `DELETE` to the `Origin` rule. Nothing here lists a token or a code.
//
//   GET    /api/account/apps        { grants: [{ id, client: { name, uri }, scopes, createdAt, lastUsedAt }] }
//   DELETE /api/account/apps/<id>   204; the grant's tokens are refused from then on

import type { GrantSummary, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Ctx, Route } from "../context.js";
import { fail } from "../errors.js";
import { json } from "../http.js";
import { userIdOf } from "../oauth/settings.js";
import type { Iso } from "../store/types.js";
import { pagePerson } from "./account.js";
import type { GrantClient } from "./oauth.js";

/** A grant's id as the library makes it (16 base64url characters), with room to spare. */
const GRANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Grants read in one listing of the library, and the most listings of one account. */
const GRANTS_PER_PAGE = 100;
const MAX_PAGES = 10;

/** A connected app as the panel shows it. */
export interface AppView {
  readonly id: string;
  readonly client: GrantClient;
  readonly scopes: readonly string[];
  readonly createdAt: string;
  /** When its token last reached the endpoint (written at most hourly); null while never. */
  readonly lastUsedAt: string | null;
}

/** Every grant of the person, the library's listings followed to their end (a thousand at most). */
async function grantsOf(oauth: OAuthHelpers, sub: string): Promise<GrantSummary[]> {
  const found: GrantSummary[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const listed = await oauth.listUserGrants(userIdOf(sub), {
      limit: GRANTS_PER_PAGE,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    found.push(...listed.items);
    if (!listed.cursor) break;
    cursor = listed.cursor;
  }
  return found;
}

/** The text of a field of a grant's metadata, or undefined. */
function textOf(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field !== "" ? field : undefined;
}

/** The client of a grant: the name and address the consent kept, else its id and where it signed in. */
function clientOf(grant: GrantSummary): GrantClient {
  const kept = (grant.metadata as { client?: unknown } | null | undefined)?.client;
  let fallback = grant.clientId;
  if (grant.redirectUri) {
    try {
      fallback = new URL(grant.redirectUri).origin;
    } catch {
      // Not an address: the client's id stands for it.
    }
  }
  return {
    name: textOf(kept, "name") ?? grant.clientId,
    uri: textOf(kept, "uri") ?? fallback,
  };
}

/** A time of the library (seconds since 1970) as the API writes times. */
function isoOf(seconds: number): string {
  const time = new Date(seconds * 1000);
  return Number.isNaN(time.getTime()) ? "" : time.toISOString();
}

/** The helpers of the authorization server, imported with the library when an app route is asked. */
async function helpers(ctx: Ctx): Promise<OAuthHelpers> {
  const { oauthApi } = await import("../oauth/provider.js");
  return oauthApi(ctx);
}

/**
 * `GET /api/account/apps`: the person's grants, the latest first. A last use recorded for a grant
 * that is gone (replaced by the client's next authorization, or expired) is forgotten as it is seen.
 */
export const listAppsRoute: Route = async (ctx) => {
  const person = pagePerson(ctx);
  const grants = await grantsOf(await helpers(ctx), person.sub);
  const uses = await ctx.deps.store.appUses(person.sub);
  const held = new Set(grants.map((grant) => grant.id));
  const gone = [...uses.keys()].filter((id) => !held.has(id));
  if (gone.length > 0) await ctx.deps.store.forgetApps(person.sub, gone);
  const apps: AppView[] = grants
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((grant) => ({
      id: grant.id,
      client: clientOf(grant),
      scopes: [...grant.scope],
      createdAt: isoOf(grant.createdAt),
      lastUsedAt: uses.get(grant.id) ?? null,
    }));
  return json({ grants: apps });
};

/** `DELETE /api/account/apps/<id>`: `204`, or `404 not-found` for a grant that is not the person's. */
export const revokeAppRoute: Route = async (ctx) => {
  const person = pagePerson(ctx);
  const id = ctx.params["id"] ?? "";
  const missing = () => fail("not-found", "There is no such connected app.");
  if (!GRANT_ID.test(id)) throw missing();
  const oauth = await helpers(ctx);
  if (!(await grantsOf(oauth, person.sub)).some((grant) => grant.id === id)) throw missing();
  await oauth.revokeGrant(id, userIdOf(person.sub));
  await ctx.deps.store.forgetApps(person.sub, [id]);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};

/**
 * Revokes the grants a person approved before `before` (`user.deleted`): an agent connected to the
 * account loses its access at once, not when its token expires. A grant approved later belongs to a
 * person who signed in again with the same `sub`, and a late repeat of the event leaves it. Safe to
 * repeat; answers how many grants were revoked.
 */
export async function revokeAppsOf(
  ctx: Pick<Ctx, "env" | "config">,
  sub: string,
  before: Iso,
): Promise<number> {
  const { oauthApi } = await import("../oauth/provider.js");
  const oauth = oauthApi(ctx);
  const until = Date.parse(before);
  let revoked = 0;
  for (const grant of await grantsOf(oauth, sub)) {
    if (grant.createdAt * 1000 > until) continue;
    await oauth.revokeGrant(grant.id, userIdOf(sub));
    revoked++;
  }
  return revoked;
}
