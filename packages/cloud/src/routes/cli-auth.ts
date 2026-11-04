// The command line's sign-in (`mdg login`): the approval page, the one-time code it hands to the
// listener on the loopback interface, and the exchange of that code for an API token.
//
//   GET  /cli-auth?port=<n>&state=<s>   the page that asks (or the way to sign in first)
//   POST /cli-auth                      the form: stores a one-time code, redirects to 127.0.0.1
//   POST /cli-auth/token                { code, state } -> { id, name, token }, once
//   GET  /cli-auth/style.css            the stylesheet of the page
//
// No token exists until the exchange, and none is ever in an address: only its SHA-256 is stored.

import type { Config } from "../config.js";
import type { Ctx, Route } from "../context.js";
import { base32, hmacHex, randomToken, sha256, sha256Hex, utf8, verifyHmacHex } from "../crypto.js";
import type { Env } from "../env.js";
import { errorResponse, fail } from "../errors.js";
import { json, readCappedBytes, redirect } from "../http.js";
import { resolveLang, type Lang } from "../messages/index.js";
import { approvalPage, forbiddenPage, invalidPage } from "../pages/cli-auth.js";
import { CLI_AUTH_CSS } from "../pages/css.js";
import { issueToken } from "../tokens.js";

/** Where the page lives; the sign-in returns to it. */
const CLI_AUTH_PATH = "/cli-auth";

/** How long an approved code can be exchanged. A code is expired from the very instant it is five minutes old. */
export const CODE_TTL_MS = 5 * 60 * 1000;

/** Failed exchanges one caller may make within `FAILURE_WINDOW_MS`; the next request is `429 cli.rate`. */
export const MAX_FAILURES = 10;

/** A failure counts until it is more than this old. */
export const FAILURE_WINDOW_MS = 60 * 1000;

/** The most the exchange reads of a request: a code, a state and a little JSON. */
const MAX_EXCHANGE_BYTES = 4096;

/** The most the approval form is read to: a port, a state and a csrf token, in any encoding. */
export const MAX_FORM_BYTES = 8 * 1024;

/** Plain decimal digits without a leading zero: the way a program prints a port. */
const PORT = /^[1-9][0-9]{3,4}$/;
const STATE = /^[A-Za-z0-9_-]{16,128}$/;

// ---------------------------------------------------------------------------------------------
// What the three routes share

/**
 * The loopback port as the command line prints it, or undefined: plain decimal digits and an
 * integer from 1024 to 65535 (so `80`, `localhost:4000`, `0x1F90`, `8080abc` and `08080` are not
 * ports). The string is returned as it came, so what a person sees is what the redirect uses.
 */
export function parsePort(value: unknown): string | undefined {
  if (typeof value !== "string" || !PORT.test(value)) return undefined;
  const port = Number(value);
  return port >= 1024 && port <= 65535 ? value : undefined;
}

/** The request's `state`: 16 to 128 characters of base64url, or undefined. */
export function parseState(value: unknown): string | undefined {
  return typeof value === "string" && STATE.test(value) ? value : undefined;
}

/**
 * The six characters a person compares with their terminal: the first six of the RFC 4648 base32
 * (upper case, no padding) of the SHA-256 of the `state`'s UTF-8 bytes. `mdg login` prints the same.
 */
export async function verificationCheck(state: string): Promise<string> {
  return base32(await sha256(state)).slice(0, 6);
}

/**
 * The `csrf` token of the approval form: the hex HMAC-SHA256 of `cli-auth:` and the session id,
 * keyed with `FORMS_SECRET`. It belongs to one session, so another session's token never verifies.
 */
export function csrfToken(env: Pick<Env, "FORMS_SECRET">, sid: string): Promise<string> {
  return hmacHex(env.FORMS_SECRET, `cli-auth:${sid}`);
}

/** The only value of a parameter or field; undefined when it is absent or repeated. */
function only(values: readonly unknown[]): unknown {
  return values.length === 1 ? values[0] : undefined;
}

function langOf(ctx: Ctx): Lang {
  return resolveLang(ctx.url, ctx.request.headers.get("Accept-Language"));
}

/** The language a person asked for with `?lang=`, if they did. */
function askedLang(url: URL): Lang | undefined {
  const asked = url.searchParams.get("lang");
  return asked === "en" || asked === "es" ? asked : undefined;
}

/** To the identity service's sign-in, returning to `address` (an address of this service). */
function signIn(config: Config, address: string): Response {
  return redirect(`${config.issuer}/login?return_to=${encodeURIComponent(address)}`);
}

/**
 * The form a request carries (urlencoded or multipart), or undefined when it is not one or is
 * longer than `MAX_FORM_BYTES`. The approval form is posted by people who are not signed in as
 * well, so the body is read through the cap and only then parsed: nobody makes the Worker hold a
 * form it did not ask for.
 */
async function readForm(request: Request): Promise<FormData | undefined> {
  const bytes = await readCappedBytes(request, MAX_FORM_BYTES);
  if (bytes === undefined) return undefined;
  try {
    // The platform's own parser, over the bytes that were let in.
    const type = request.headers.get("Content-Type") ?? "";
    return await new Response(bytes, { headers: { "Content-Type": type } }).formData();
  } catch {
    return undefined;
  }
}

/** Compares two texts without stopping at the first difference. */
function sameText(a: string, b: string): boolean {
  const x = utf8(a);
  const y = utf8(b);
  let difference = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    difference |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return difference === 0;
}

// ---------------------------------------------------------------------------------------------
// GET /cli-auth

/**
 * The page that asks "Allow the command line on this computer?". The request is checked first,
 * whoever asks: a port or state that cannot be used is a `400` page and never a redirect. Without
 * a session cookie (anonymous, or only a bearer token: a token does not approve another) the
 * person goes to sign in and comes back to this very address.
 */
export const cliAuthPage: Route = async (ctx) => {
  const lang = langOf(ctx);
  const port = parsePort(only(ctx.url.searchParams.getAll("port")));
  const state = parseState(only(ctx.url.searchParams.getAll("state")));
  if (port === undefined || state === undefined) return invalidPage(lang);

  const { principal } = ctx;
  if (principal?.via !== "cookie") {
    return signIn(ctx.config, `${ctx.config.origin}${CLI_AUTH_PATH}${ctx.url.search}`);
  }
  return approvalPage({
    lang,
    port,
    state,
    check: await verificationCheck(state),
    csrf: await csrfToken(ctx.env, principal.sid),
    name: principal.profile.name,
  });
};

// ---------------------------------------------------------------------------------------------
// POST /cli-auth

/**
 * Where a person who posted the approval form without a session should land after signing in:
 * the approval page for the form's port and state when they can be used, else this request's own
 * address.
 */
function addressAfterSignIn(ctx: Ctx, form: FormData | undefined): string {
  const port = form && parsePort(only(form.getAll("port")));
  const state = form && parseState(only(form.getAll("state")));
  if (port === undefined || state === undefined) {
    return `${ctx.config.origin}${CLI_AUTH_PATH}${ctx.url.search}`;
  }
  const query = new URLSearchParams({ port, state });
  const lang = askedLang(ctx.url);
  if (lang) query.set("lang", lang);
  return `${ctx.config.origin}${CLI_AUTH_PATH}?${query}`;
}

/**
 * The approval form. The router has already refused a session cookie that comes with another
 * `Origin`; here come, in this order: the session (without one the person goes to sign in and
 * nothing is stored), the form and its `csrf` (`403`), the port and state (`400`), and only then
 * the one-time code. The code is bound to the person and the state; the redirect always goes to
 * the loopback interface (`127.0.0.1`), whatever the request says, and carries no token.
 */
export const cliAuthApprove: Route = async (ctx) => {
  const { principal, deps } = ctx;
  const lang = langOf(ctx);
  const form = await readForm(ctx.request);
  if (principal?.via !== "cookie") return signIn(ctx.config, addressAfterSignIn(ctx, form));

  const sent = form?.get("csrf");
  const genuine =
    typeof sent === "string" &&
    (await verifyHmacHex(ctx.env.FORMS_SECRET, `cli-auth:${principal.sid}`, sent));
  if (!form || !genuine) return forbiddenPage(lang);

  const port = parsePort(only(form.getAll("port")));
  const state = parseState(only(form.getAll("state")));
  if (port === undefined || state === undefined) return invalidPage(lang);

  const now = deps.now();
  // A code nobody exchanged is removed as the next one is made: the table holds a few minutes.
  await deps.store.sweep(now.toISOString());
  const code = randomToken(deps.randomBytes, 32);
  await deps.store.createCliCode({
    hash: await sha256Hex(code),
    sub: principal.sub,
    state,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
  });
  return redirect(`http://127.0.0.1:${port}/?code=${code}&state=${state}`, 303);
};

// ---------------------------------------------------------------------------------------------
// POST /cli-auth/token

/** The body of a request as text, or undefined when it is longer than `limit` bytes or not UTF-8. */
async function readText(request: Request, limit: number): Promise<string | undefined> {
  const bytes = await readCappedBytes(request, limit);
  if (bytes === undefined) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** `{ code, state }` of the request, or undefined when it is not JSON of that shape. */
async function readExchange(
  request: Request,
): Promise<{ readonly code: string; readonly state: string } | undefined> {
  const text = await readText(request, MAX_EXCHANGE_BYTES);
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { code, state } = value as Record<string, unknown>;
  return typeof code === "string" && typeof state === "string" ? { code, state } : undefined;
}

/**
 * The exchange of an approved code for a token, which the command line makes from a terminal: no
 * cookie, no `Origin`, no principal. In this order:
 *
 * 1. The rate limit, before anything is read: a caller (the hash of its IP, never the IP) with
 *    `MAX_FAILURES` failures in the last `FAILURE_WINDOW_MS` gets `429 cli.rate`, and the code it
 *    sent, valid or not, is left alone.
 * 2. The body, `{ code, state }` of two strings, or `400 cli.invalid` and a failure.
 * 3. The code is taken (deleted) whatever follows. Unknown, expired (from the instant it is
 *    `CODE_TTL_MS` old) or another `state` is `400 cli.invalid` and a failure; the code stays gone.
 * 4. The token, named `CLI (<date>)`, for the person the code is bound to: `200 { id, name, token }`,
 *    or `413 quota.tokens` at the limit, which is not a failure, and the code stays gone too.
 */
export const cliAuthToken: Route = async (ctx) => {
  const { deps, request } = ctx;
  const now = deps.now();
  // The same secret keys the csrf token (`cli-auth:<sid>`): a prefix of its own keeps the two apart.
  const caller = await hmacHex(
    ctx.env.FORMS_SECRET,
    `cli-caller:${request.headers.get("CF-Connecting-IP") || "unknown"}`,
  );

  const since = new Date(now.getTime() - FAILURE_WINDOW_MS).toISOString();
  if ((await deps.store.cliFailuresSince(caller, since)) >= MAX_FAILURES) {
    const limited = errorResponse(fail("cli.rate"));
    limited.headers.set("Retry-After", String(FAILURE_WINDOW_MS / 1000));
    return limited;
  }

  const refuse = async (): Promise<Response> => {
    // The failures of callers who never come back are removed as the next one is recorded: the
    // table holds the last hour, however many callers there were.
    await deps.store.sweep(now.toISOString());
    await deps.store.recordCliFailure(caller, now.toISOString());
    return errorResponse(fail("cli.invalid"));
  };

  const exchange = await readExchange(request);
  if (!exchange) return refuse();
  const stored = await deps.store.takeCliCode(await sha256Hex(exchange.code));
  // Anything that is not clearly in the future is expired, an unreadable time included.
  const live = stored !== undefined && Date.parse(stored.expiresAt) > now.getTime();
  if (!stored || !live || !sameText(stored.state, exchange.state)) return refuse();

  const issued = await issueToken(deps, stored.sub, `CLI (${now.toISOString().slice(0, 10)})`);
  return json({ id: issued.id, name: issued.name, token: issued.token });
};

// ---------------------------------------------------------------------------------------------
// GET /cli-auth/style.css

/** The stylesheet of the page: public, and cached for an hour. */
export const cliAuthStyle: Route = async () =>
  new Response(CLI_AUTH_CSS, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
