import { parseSessionCookie } from "@meltemi/identity";
import { sha256Hex } from "./crypto.js";
import { fail } from "./errors.js";
import { isSafeMethod, originOf } from "./http.js";
import type { Config } from "./config.js";
import type { Deps, Principal } from "./types.js";

/** A token's last-used time is bumped at most this often. */
const TOUCH_EVERY_MS = 60 * 60 * 1000;

/** The prefix of every API token. */
export const TOKEN_PREFIX = "mdg_";

/** The SHA-256 (hex) of an API token: what is stored and looked up. */
export function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/**
 * Who is asking: a bearer API token (`via: "token"`), else a session cookie the reference
 * verifier accepts (`via: "cookie"`), else nobody. An unknown bearer token is `401 token.invalid`;
 * a cookie that does not verify is simply no cookie. A person's user row is created, or its
 * cached profile refreshed, from the session token.
 */
export async function resolvePrincipal(
  request: Request,
  deps: Deps,
  _config: Config,
): Promise<Principal | undefined> {
  const now = deps.now();
  const authorization = request.headers.get("Authorization");
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim();
  if (bearer !== undefined) {
    if (!bearer.startsWith(TOKEN_PREFIX)) throw fail("token.invalid");
    const row = await deps.store.tokenByHash(await hashToken(bearer));
    if (!row) throw fail("token.invalid");
    const last = row.lastUsedAt ? Date.parse(row.lastUsedAt) : Number.NEGATIVE_INFINITY;
    if (now.getTime() - last >= TOUCH_EVERY_MS) {
      await deps.store.touchToken(row.id, now.toISOString());
    }
    return { via: "token", sub: row.sub, tokenId: row.id, tokenName: row.name };
  }

  const token = parseSessionCookie(request.headers.get("Cookie"));
  if (!token) return undefined;
  const claims = await deps.verifier.verifySession(token, now);
  if (!claims) return undefined;
  // The verifier trusts a live session for up to an hour. A session issued before the person was
  // deleted must not bring them back in that hour (it would create their row again and let them
  // make tokens): it counts as nobody. A person who signed in again has a later session. A moment
  // no date can hold is refused too.
  const issued = new Date(claims.iat * 1000);
  if (Number.isNaN(issued.getTime())) return undefined;
  if (await deps.store.deletedSince(claims.sub, issued.toISOString())) return undefined;
  const profile = {
    sub: claims.sub,
    name: claims.name,
    picture: claims.picture,
    email: claims.email,
    emailVerified: claims.email_verified,
  };
  await deps.store.upsertUser(profile, now.toISOString());
  return { via: "cookie", sub: claims.sub, sid: claims.sid, profile };
}

/**
 * The `Origin` rule. Every host of the family receives the session cookie and is the same site
 * for `SameSite`, so a form on another host posts here with the cookie attached: a change made
 * with the cookie (any method but `GET`, `HEAD` and `OPTIONS`) must come from this service's own
 * page, or it is `403 request.forbidden`. A bearer token is exempt (a browser never adds one on
 * its own). Only `Origin` is consulted: `Referer` can be absent and `Sec-Fetch-Site` is missing
 * from older browsers. An `Origin` that is absent, `null` or not an address is not the page's.
 */
export function requireOwnOrigin(
  request: Request,
  principal: Principal | undefined,
  config: Config,
): void {
  if (principal?.via !== "cookie" || isSafeMethod(request.method)) return;
  if (originOf(request) !== config.origin) throw fail("request.forbidden");
}
