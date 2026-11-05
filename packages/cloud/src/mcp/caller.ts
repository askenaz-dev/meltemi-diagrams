// Who calls the MCP endpoint (`mcp-authorization`): a principal, for the roles each project gives it,
// and the scopes its token was granted, for the tools it may call. Two different questions, asked
// apart: a scope says which kind of tool a token may use (reads, writes, sharing, live sessions,
// publishing), a role what the account may do in a project (`access.ts`); a wide scope never adds a
// role, and every tool asks both.
//
// Two tokens open the endpoint, both checked by the authorization server's library before the
// endpoint runs (`oauth/provider.ts`): a `mdg_` API token, as the account it belongs to, with every
// scope (it is the account's own key, made on the page, and it opens the HTTP API with every right
// already); and an OAuth access token of the service's authorization server, as the account that
// approved it, with the scopes that were approved. The cookie is never taken here (a browser on
// another host of the family would attach it), and an OAuth token never opens `/api/*`
// (`principal.ts` takes `mdg_` tokens only).

import { fail } from "../errors.js";
import { TOKEN_PREFIX, tokenPrincipal } from "../principal.js";
import type { Deps, Principal } from "../types.js";

/** The scopes of the endpoint: what kinds of tool a token may call. */
export const SCOPES = ["projects:read", "projects:write", "sharing", "live", "publish"] as const;

export type Scope = (typeof SCOPES)[number];

/** Who calls: the account (as a principal, for the roles) and the scopes the token was granted. */
export interface Caller {
  readonly principal: Principal;
  readonly scopes: ReadonlySet<Scope>;
  /** The client the token was issued to: `mdg` for an API token, the OAuth client's id for a grant. */
  readonly clientId: string;
}

/**
 * The caller of an `mdg_` API token: the account it belongs to, every scope. `401 token.invalid` for
 * a token the service does not hold.
 */
export async function apiTokenCaller(bearer: string, deps: Deps): Promise<Caller> {
  if (!bearer.startsWith(TOKEN_PREFIX)) throw fail("token.invalid");
  return {
    principal: await tokenPrincipal(bearer, deps),
    scopes: new Set(SCOPES),
    clientId: "mdg",
  };
}

/**
 * The caller of an OAuth access token the authorization server verified: the account that approved
 * its grant, and the scopes of the token that are the endpoint's (`offline_access` is not one).
 */
export function oauthCaller(grant: {
  readonly sub: string;
  readonly grantId: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
}): Caller {
  const granted = new Set(grant.scopes);
  return {
    principal: { via: "oauth", sub: grant.sub, grantId: grant.grantId, clientId: grant.clientId },
    scopes: new Set(SCOPES.filter((scope) => granted.has(scope))),
    clientId: grant.clientId,
  };
}

/** Refuses a call whose token was not granted `scope`: `scope.insufficient`, naming the scope. */
export function requireScope(caller: Caller, scope: Scope): void {
  if (!caller.scopes.has(scope)) {
    throw fail("scope.insufficient", `The token was not granted the ${scope} scope.`, { scope });
  }
}
