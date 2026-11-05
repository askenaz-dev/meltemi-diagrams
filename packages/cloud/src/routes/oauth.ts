// The authorization server's addresses (`mcp-authorization`):
//
//   GET  /.well-known/oauth-authorization-server      the server's metadata (RFC 8414)
//   GET  /.well-known/oauth-protected-resource/mcp    the endpoint's metadata (RFC 9728), and the
//   GET  /.well-known/oauth-protected-resource        same document at the origin's path
//   POST /oauth/token                                  codes, refresh tokens, revocation
//   POST /oauth/register                               dynamic registration, ten an hour per address
//   GET  /oauth/authorize                              the consent page (or the way to sign in first)
//   POST /oauth/authorize                              Approve or Deny: back to the client
//
// The first four are the library's (`oauth/provider.ts`), behind the registrations' rate; the consent
// is this service's: the request is checked first, whoever asks (a request that cannot be used is a
// page of its own, never a redirect to an address the library did not validate), then the person
// signs in through the identity service, then the page names the client, where the access goes and
// each scope in words. The form carries the library's handle, bound to this browser by its cookie,
// and a `csrf` of the signed-in session over it; Approve stores the grant with the person's `sub`,
// and both buttons end at the client's redirect URI. No token is ever in an address: the code is,
// once, and it is useless without the client's PKCE verifier.

import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Ctx, Route } from "../context.js";
import { hmacHex, verifyHmacHex } from "../crypto.js";
import { errorResponse, fail } from "../errors.js";
import { redirect } from "../http.js";
import { resolveLang, type Lang } from "../messages/index.js";
import {
  AUTHORIZE_PATH,
  REGISTRATIONS_PER_HOUR,
  REGISTRATION_WINDOW_MS,
  grantedScopes,
  resourceMetadataOf,
  userIdOf,
} from "../oauth/settings.js";
import {
  consentPage,
  expiredConsentPage,
  forbiddenConsentPage,
  invalidRequestPage,
  unverifiedClientPage,
} from "../pages/consent.js";
import { readForm, signIn } from "./cli-auth.js";

function langOf(ctx: Ctx): Lang {
  return resolveLang(ctx.url, ctx.request.headers.get("Accept-Language"));
}

/** The library's own answer: the metadata, the token endpoint, and their preflights. */
export const oauthServerRoute: Route = async (ctx) => {
  const { serveProvider } = await import("../oauth/provider.js");
  return serveProvider(ctx);
};

/**
 * `GET /.well-known/oauth-protected-resource`: the endpoint's document, which RFC 9728 puts at the
 * path with `/mcp` after it (the address the challenge names), for a client that looks at the
 * origin's.
 */
export const resourceMetadataRoute: Route = async (ctx) => {
  const { serveProvider } = await import("../oauth/provider.js");
  return serveProvider(ctx, resourceMetadataOf(ctx.config.origin));
};

/**
 * `POST /oauth/register`: an address (the keyed hash of its IP, never the IP) registers at most ten
 * clients an hour, every attempt counted; the eleventh is `429 rate.limited` with `Retry-After`, and
 * nothing reaches the library. The attempts share the table of the command line's failed exchanges,
 * under a prefix of their own, and leave it as it does: an hour per caller, swept as they come.
 */
export const registerRoute: Route = async (ctx) => {
  const { deps, request } = ctx;
  if (request.method === "POST") {
    const now = deps.now();
    const caller = await hmacHex(
      ctx.env.FORMS_SECRET,
      `oauth-register:${request.headers.get("CF-Connecting-IP") || "unknown"}`,
    );
    const since = new Date(now.getTime() - REGISTRATION_WINDOW_MS).toISOString();
    if ((await deps.store.cliFailuresSince(caller, since)) >= REGISTRATIONS_PER_HOUR) {
      return errorResponse(
        fail(
          "rate.limited",
          `An address registers at most ${REGISTRATIONS_PER_HOUR} clients an hour; wait a little.`,
          { retryAfter: REGISTRATION_WINDOW_MS / 1000 },
        ),
      );
    }
    await deps.store.sweep(now.toISOString());
    await deps.store.recordCliFailure(caller, now.toISOString());
  }
  const { serveProvider } = await import("../oauth/provider.js");
  return serveProvider(ctx);
};

/**
 * The `csrf` of the consent form: the hex HMAC-SHA256 of `oauth-consent:`, the session id and the
 * library's handle, keyed with `FORMS_SECRET`. It belongs to one session and one page.
 */
export function consentCsrf(ctx: Pick<Ctx, "env">, sid: string, handle: string): Promise<string> {
  return hmacHex(ctx.env.FORMS_SECRET, `oauth-consent:${sid}:${handle}`);
}

/** This consent address with the authorization request's query: the sign-in comes back to it. */
function hereAgain(ctx: Ctx): string {
  return `${ctx.config.origin}${AUTHORIZE_PATH}${ctx.url.search}`;
}

/** What Connected apps shows of a client: its name and the address it is known by. */
export interface GrantClient {
  readonly name: string;
  readonly uri: string;
}

/** What a grant keeps beside the library's record (`completeAuthorization`'s `metadata`). */
export interface GrantMetadata {
  readonly client: GrantClient;
  readonly approvedAt: string;
}

/** The longest client name a grant keeps: the page shows the rest of a longer one cut. */
const MAX_CLIENT_NAME = 120;

/**
 * `GET /oauth/authorize`: the authorization request is validated by the library (the client, its
 * exact redirect URI, the response type, the `resource`, which must be the endpoint, and PKCE), then
 * this service asks for S256 from every client; a failure the library says is safe to send back goes
 * to the client's redirect URI, any other is a page. A person who is not signed in on the page goes
 * to sign in and comes back to this very address; a signed-in one sees the consent.
 */
export const authorizePage: Route = async (ctx) => {
  const lang = langOf(ctx);
  const { AuthorizationError, CimdFetchError, authorizationErrorRedirect, oauthApi } =
    await import("../oauth/provider.js");
  const oauth = oauthApi(ctx);
  let request: AuthRequest;
  try {
    request = await oauth.parseAuthRequest(ctx.request);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return error.redirectTo ? redirect(error.redirectTo) : invalidRequestPage(lang);
    }
    if (error instanceof CimdFetchError) return unverifiedClientPage(lang);
    throw error;
  }
  if (request.codeChallengeMethod !== "S256" || !request.codeChallenge) {
    return redirect(
      authorizationErrorRedirect(request, "invalid_request", "PKCE with S256 is required."),
    );
  }

  const { principal } = ctx;
  if (principal?.via !== "cookie") return signIn(ctx.config, hereAgain(ctx));

  let details: Awaited<ReturnType<typeof oauth.describeConsent>>;
  try {
    details = await oauth.describeConsent(request);
  } catch (error) {
    if (error instanceof CimdFetchError) return unverifiedClientPage(lang);
    throw error;
  }
  const consent = await oauth.beginConsent(request);
  return consentPage({
    lang,
    clientName: details.clientName,
    clientDomain: details.clientDomain,
    redirectUri: details.redirectUri,
    redirectHost: details.redirectHost,
    redirectIsLoopback: details.redirectIsLoopback,
    scopes: grantedScopes(request.scope),
    name: principal.profile.name,
    action: `${AUTHORIZE_PATH}${ctx.url.search}`,
    handle: consent.handle,
    csrf: await consentCsrf(ctx, principal.sid, consent.handle),
    headers: consent.headers,
  });
};

/**
 * `POST /oauth/authorize`: the router has already refused a session cookie that comes with another
 * `Origin`; here come, in this order, the session (without one the person signs in and comes back to
 * the consent page), the form and its `csrf` (`403`), then the decision. Approve takes the library's
 * consent (its handle works once, for ten minutes, in this browser), grants the scopes the page
 * named and stores the grant with the person's `sub` and the client's name; Deny gives the client
 * `error=access_denied`. Both answer `303` to the client's redirect URI, the one the library
 * validated, never one the form names.
 */
export const authorizeDecision: Route = async (ctx) => {
  const lang = langOf(ctx);
  const form = await readForm(ctx.request);
  const { principal } = ctx;
  if (principal?.via !== "cookie") return signIn(ctx.config, hereAgain(ctx));

  const handle = form?.get("handle");
  const sent = form?.get("csrf");
  const genuine =
    typeof handle === "string" &&
    handle !== "" &&
    typeof sent === "string" &&
    (await verifyHmacHex(ctx.env.FORMS_SECRET, `oauth-consent:${principal.sid}:${handle}`, sent));
  if (!form || !genuine) return forbiddenConsentPage(lang);

  const { AuthorizationError, CimdFetchError, oauthApi } = await import("../oauth/provider.js");
  const oauth = oauthApi(ctx);
  try {
    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(ctx.request, handle);
      return new Response(null, { status: 303, headers: denied.headers });
    }
    const approved = await oauth.approveConsent(ctx.request, handle);
    const details = await oauth.describeConsent(approved.request);
    const at = ctx.deps.now().toISOString();
    const metadata: GrantMetadata = {
      client: {
        name: Array.from(details.clientName.trim()).slice(0, MAX_CLIENT_NAME).join(""),
        // A metadata document's address is the client's verified name; a registered client's own
        // claims are not, so it is known by where its access goes.
        uri: details.clientDomain ? details.clientId : new URL(details.redirectUri).origin,
      },
      approvedAt: at,
    };
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: userIdOf(principal.sub),
      metadata,
      scope: grantedScopes(approved.request.scope),
      props: { kind: "grant", sub: principal.sub, at },
    });
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 303, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError) return expiredConsentPage(lang);
    if (error instanceof CimdFetchError) return unverifiedClientPage(lang);
    throw error;
  }
};
