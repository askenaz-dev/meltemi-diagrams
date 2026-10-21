import { sessionVerifier, type SessionVerifier } from "@meltemi/identity";
import { readIdentity } from "./config.js";
import type { Env } from "./env.js";

/** How long the verifier waits for the identity service in development before it gives up. */
const DEV_CHECK_MS = 500;

/**
 * The session check of development: the identity service's answer when there is one, and a pass
 * when the service cannot be reached at all, so a cookie minted with test keys works with no
 * identity service running.
 *
 * A service that answers is not absent: `204` is a live session and `404` a gone one, and
 * anything else means the service is unwell. That throws, which the verifier counts as an invalid
 * session and (as outside development) does not keep, so the next request asks again instead of
 * living with one bad answer for an hour.
 */
async function devSessionCheck(
  issuer: string,
  sid: string,
  doFetch: typeof fetch,
): Promise<boolean> {
  let response: Response;
  try {
    response = await doFetch(`${issuer}/sessions/${encodeURIComponent(sid)}`, {
      signal: AbortSignal.timeout(DEV_CHECK_MS),
    });
  } catch {
    // The identity service is not running: a minted cookie is enough to develop with.
    return true;
  }
  // The body is not needed: release the connection.
  void response.body?.cancel().catch(() => {});
  if (response.status === 204) return true;
  if (response.status === 404) return false;
  throw new Error(`The identity service answered ${response.status}`);
}

/**
 * The verifier of the family's session for this Worker's settings. The keys come from
 * `IDENTITY_JWKS_URL`; the inline `IDENTITY_JWKS`, and a session check that passes when the
 * identity service cannot be reached, are development tools honoured only when `DEV` is `"true"`
 * (readIdentity reads neither otherwise). Build it once per isolate: its caches belong to it.
 */
export function createVerifier(env: Env, doFetch: typeof fetch): SessionVerifier {
  const settings = readIdentity(env);
  return sessionVerifier({
    issuer: settings.issuer,
    jwks: settings.inlineJwks ?? settings.jwksUrl,
    fetch: doFetch,
    checkSession: settings.dev ? (sid) => devSessionCheck(settings.issuer, sid, doFetch) : true,
  });
}
