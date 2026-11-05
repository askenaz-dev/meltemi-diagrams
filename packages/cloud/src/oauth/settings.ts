// The authorization server's settings (`mcp-authorization`): its addresses, the scopes it grants and
// the lifetimes of what it issues. Plain constants and functions, so that the handler, the consent
// page and Connected apps read them without the library, which `provider.ts` brings in only when an
// address of the authorization server, or the endpoint, is asked for.

import { SCOPES, type Scope } from "../mcp/caller.js";

/** The protected resource: the MCP endpoint, the one audience of every access token. */
export const MCP_PATH = "/mcp";
/** The consent page (`routes/oauth.ts`): this service's, not the library's. */
export const AUTHORIZE_PATH = "/oauth/authorize";
/** The token endpoint: codes, refresh tokens and revocation (RFC 7009), the library's. */
export const TOKEN_PATH = "/oauth/token";
/** Dynamic client registration (RFC 7591), the library's behind the rate of `routes/oauth.ts`. */
export const REGISTER_PATH = "/oauth/register";
/** The authorization server's metadata (RFC 8414). */
export const SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";
/**
 * The protected resource's metadata (RFC 9728) at the origin, which the `401` challenge names. The
 * resource `/mcp` has its document at this path followed by `/mcp` too (the path RFC 9728 inserts,
 * where the library answers it), for a client that builds the address itself.
 */
export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

/** The scope that asks for a refresh token. */
export const OFFLINE_ACCESS = "offline_access";

/** Everything the authorization server grants: the endpoint's scopes and `offline_access`. */
export const OAUTH_SCOPES = [...SCOPES, OFFLINE_ACCESS] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number];

/** An access token lives an hour. */
export const ACCESS_TOKEN_TTL_S = 60 * 60;

/** A grant with `offline_access` can be refreshed for thirty days from the code's exchange. */
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;

/** Clients one address may register in an hour; the next registration is `429`. */
export const REGISTRATIONS_PER_HOUR = 10;

/** The window of the registrations' rate. */
export const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;

/** The endpoint's address: the resource every token is bound to. */
export function resourceOf(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

/** Where the library answers the endpoint's metadata (RFC 9728, the resource's path inserted). */
export function resourceMetadataOf(origin: string): string {
  return `${origin}${RESOURCE_METADATA_PATH}${MCP_PATH}`;
}

/** The address of the endpoint's metadata the `401` challenge names: the origin's. */
export function challengeMetadataOf(origin: string): string {
  return `${origin}${RESOURCE_METADATA_PATH}`;
}

/**
 * A person's id as the library keeps it: its tokens are `<user>:<grant>:<secret>`, so it refuses a
 * `:` in a user id, which the identity service's `sub` may one day hold. The encoding is undone
 * nowhere: the grant's props carry the `sub` itself.
 */
export function userIdOf(sub: string): string {
  return encodeURIComponent(sub);
}

/** Whether a value is one of the endpoint's scopes. */
export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

/**
 * The scopes a consent grants: those the client asked for that the server knows, in the server's
 * order, or, when it asked for none of the endpoint's, the endpoint's five (and `offline_access`
 * if it asked for that), which the page names one by one before anything is approved.
 */
export function grantedScopes(asked: readonly string[]): OAuthScope[] {
  const wanted = new Set(asked);
  const known = OAUTH_SCOPES.filter((scope) => wanted.has(scope));
  if (known.some((scope) => scope !== OFFLINE_ACCESS)) return known;
  const refresh: OAuthScope[] = wanted.has(OFFLINE_ACCESS) ? [OFFLINE_ACCESS] : [];
  return [...SCOPES, ...refresh];
}
