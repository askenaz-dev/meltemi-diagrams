// Creating an API token: the one place where a token is made, shared by `POST /api/tokens` and by
// the exchange of the command line's code (`POST /cli-auth/token`), so both hand out the same
// kind of token and honour the same quota.

import { randomId, randomToken } from "./crypto.js";
import { fail } from "./errors.js";
import { hashToken, TOKEN_PREFIX } from "./principal.js";
import { MAX_TOKENS } from "./store/types.js";
import type { Deps } from "./types.js";

/** A token as it is shown once, when it is made. */
export interface IssuedToken {
  readonly id: string;
  readonly name: string;
  /** `mdg_` plus 32 random bytes in base64url. Only its SHA-256 is stored; this is the one time it exists in clear. */
  readonly token: string;
}

/**
 * Makes a token named `name` for the person `sub` and stores its SHA-256 (hex), never the token.
 * Throws `quota.tokens` (413) when the person already holds `MAX_TOKENS`; the store checks the
 * count and adds the row in one atomic step, so two requests at the limit cannot both succeed.
 */
export async function issueToken(deps: Deps, sub: string, name: string): Promise<IssuedToken> {
  const token = `${TOKEN_PREFIX}${randomToken(deps.randomBytes, 32)}`;
  const id = randomId(deps.randomBytes);
  const outcome = await deps.store.createToken(
    {
      id,
      sub,
      name,
      hash: await hashToken(token),
      createdAt: deps.now().toISOString(),
      lastUsedAt: null,
    },
    MAX_TOKENS,
  );
  if (outcome === "quota") throw fail("quota.tokens");
  return { id, name, token };
}
