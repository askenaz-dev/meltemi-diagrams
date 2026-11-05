// Who calls the MCP endpoint (`mcp-authorization`): a principal, for the roles each project gives it,
// and the scopes its token was granted, for the tools it may call. Two different questions, asked
// apart: a scope says which kind of tool a token may use (reads, writes, sharing, live sessions,
// publishing), a role what the account may do in a project (`access.ts`); a wide scope never adds a
// role, and every tool asks both.
//
// A `mdg_` API token opens the endpoint as the account it belongs to, with every scope: it is the
// account's own key, made on the page, and it opens the HTTP API with every right already. The
// cookie is never taken here (a browser on another host of the family would attach it). An OAuth
// access token of the service's authorization server is the next stage's (change agent-mcp, tasks
// 2.x): it resolves in `authenticate` to its account and the scopes it was granted, and the tools
// need nothing else, since each checks its scope through `requireScope`.

import { fail } from "../errors.js";
import { TOKEN_PREFIX, bearerOf, tokenPrincipal } from "../principal.js";
import type { Deps, Principal } from "../types.js";

/** The scopes of the endpoint: what kinds of tool a token may call. */
export const SCOPES = ["projects:read", "projects:write", "sharing", "live", "publish"] as const;

export type Scope = (typeof SCOPES)[number];

/** Who calls: the account (as a principal, for the roles) and the scopes the token was granted. */
export interface Caller {
  readonly principal: Principal;
  readonly scopes: ReadonlySet<Scope>;
  /** The client the token was issued to: `mdg` for an API token (an OAuth client's id later). */
  readonly clientId: string;
}

/**
 * The caller of a request, from its bearer token alone: `401 auth.required` without one, `401
 * token.invalid` for one the service does not hold (a JWT of the identity service included). A
 * cookie the request carries is never read.
 */
export async function authenticate(request: Request, deps: Deps): Promise<Caller> {
  const bearer = bearerOf(request);
  if (bearer === undefined) throw fail("auth.required");
  if (bearer.startsWith(TOKEN_PREFIX)) {
    return {
      principal: await tokenPrincipal(bearer, deps),
      scopes: new Set(SCOPES),
      clientId: "mdg",
    };
  }
  // The authorization server's access tokens resolve here, with their own scopes (tasks 2.x).
  throw fail("token.invalid");
}

/** Refuses a call whose token was not granted `scope`: `scope.insufficient`, naming the scope. */
export function requireScope(caller: Caller, scope: Scope): void {
  if (!caller.scopes.has(scope)) {
    throw fail("scope.insufficient", `The token was not granted the ${scope} scope.`, { scope });
  }
}
