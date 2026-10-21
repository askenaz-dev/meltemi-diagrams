import type { Route } from "../context.js";
import { fail } from "../errors.js";
import { json, readJsonObject } from "../http.js";
import { issueToken } from "../tokens.js";

/** The longest name a token may have, in characters (code points) after trimming. */
const MAX_NAME_LENGTH = 60;

/**
 * What a name may not hold: control characters (tabs and line breaks included), the line and
 * paragraph separators, and lone surrogates (which no database stores faithfully).
 */
const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

/** The name a person gave a token: 1 to 60 characters once trimmed, with nothing unshowable in it. */
function readName(value: unknown): string {
  if (typeof value !== "string") throw fail("request.invalid", "The token needs a name.");
  const name = value.trim();
  const length = Array.from(name).length;
  if (length === 0) throw fail("request.invalid", "The token needs a name.");
  if (length > MAX_NAME_LENGTH) {
    throw fail("request.invalid", `The name can have at most ${MAX_NAME_LENGTH} characters.`);
  }
  if (FORBIDDEN_IN_NAME.test(name)) {
    throw fail("request.invalid", "The name cannot hold control characters.");
  }
  return name;
}

/**
 * `POST /api/tokens { name }`: makes an API token for the person who is signed in on the page and
 * answers `{ id, name, token }`. The token (`mdg_` and 32 random bytes in base64url) is in this
 * answer and nowhere else: only its SHA-256 is stored. Only a cookie principal may ask (the router
 * has already applied the `Origin` rule to it): a token cannot make another token, so a stolen one
 * cannot mint copies that outlive its revocation. A person holds at most 20 tokens.
 */
export const createTokenRoute: Route = async (ctx) => {
  const { principal, deps, request } = ctx;
  if (!principal) throw fail("auth.required");
  if (principal.via !== "cookie") {
    throw fail(
      "request.forbidden",
      "API tokens are created from the page; a token cannot create another one.",
    );
  }
  const name = readName((await readJsonObject(request))["name"]);
  // The one place tokens are made, which the command line's exchange uses too.
  return json(await issueToken(deps, principal.sub, name), 201);
};

/**
 * `GET /api/tokens`: the tokens of the person asking (a page or a token itself), the newest first,
 * as `{ tokens: [{ id, name, created_at, last_used_at }] }`. Neither a token nor its hash is ever
 * part of it.
 */
export const listTokensRoute: Route = async (ctx) => {
  const { principal, deps } = ctx;
  if (!principal) throw fail("auth.required");
  const rows = await deps.store.tokensOf(principal.sub);
  return json({
    tokens: rows.map((row) => ({
      id: row.id,
      name: row.name,
      created_at: row.createdAt,
      last_used_at: row.lastUsedAt,
    })),
  });
};

/**
 * `DELETE /api/tokens/:id`: revokes one of the asking person's tokens, the one making the request
 * included; the token then answers `401 token.invalid`. An id that is not theirs and an id that
 * does not exist answer alike, so no one learns what another person holds.
 */
export const deleteTokenRoute: Route = async (ctx) => {
  const { principal, deps, params } = ctx;
  if (!principal) throw fail("auth.required");
  if (!(await deps.store.deleteToken(principal.sub, params["id"] ?? ""))) {
    throw fail("not-found", "There is no such token.");
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
