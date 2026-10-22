// What an account holds and may hold (`cloud-projects`, "Usage and storage quota"): `GET
// /api/account/usage`; the one thing a person sets about themselves (`publishing`, "Handles"):
// `PATCH /api/account { handle }`; and what only the identity service holds about them, its
// sign-ins and its sessions (`cloud-accounts`, "The identity data through the Worker"), which this
// Worker reads and changes on the person's behalf so that the page talks to its own origin only.

import { signProductRequest } from "@meltemi/identity";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { requirePrincipal } from "../access.js";
import type { Ctx, Route } from "../context.js";
import { fail, type ErrorCode } from "../errors.js";
import { json, readJsonObject } from "../http.js";
import { HANDLE } from "../ids.js";
import type { Principal } from "../types.js";

/** This product's name in the identity service's `PRODUCTS`: what its calls are signed as. */
export const PRODUCT_NAME = "diagrams";

/** How long a call to the identity service may take before the panel says it is unavailable. */
export const IDENTITY_TIMEOUT_MS = 5_000;

/** The refusals of the identity service the page acts on, passed through as this service's own. */
const PASSED_THROUGH: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "identity.last",
  "provider.unknown",
  "session.current",
  "session.not-found",
  "rate.limited",
]);

/** A session id as the page may send one: the identity service checks it exactly. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The person, signed in on the page with the cookie: the account is managed from the page, never
 * with an API token (`403 request.forbidden`), and never by nobody (`401 auth.required`).
 */
function pagePerson(ctx: Ctx): Extract<Principal, { via: "cookie" }> {
  const principal = requirePrincipal(ctx);
  if (principal.via !== "cookie") {
    throw fail("request.forbidden", "The account is managed from the page, not with an API token.");
  }
  return principal;
}

/** The answer of a request, or undefined when it does not come within the time allowed. */
async function withinTime(
  request: () => Promise<Response>,
  ms: number,
): Promise<Response | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((done) => {
    timer = setTimeout(() => done(undefined), ms);
  });
  const work = request();
  // If the timeout wins nobody else observes this promise: its failure is not news.
  work.catch(() => {});
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** An account view as the identity service sends it: an object with its lists. */
function isAccountView(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const view = value as Record<string, unknown>;
  return (
    typeof view["user"] === "object" &&
    view["user"] !== null &&
    Array.isArray(view["identities"]) &&
    Array.isArray(view["sessions"]) &&
    typeof view["canUnlink"] === "boolean"
  );
}

/**
 * One call of the identity service's account API for the person of the page: signed as this
 * product with the secret it shares with the identity service (the one that signs the deletion
 * events), carrying the person's session token, within five seconds. The account view comes back
 * as it is; a refusal the page acts on becomes this service's own code; a session that ended is
 * `401 auth.required`; anything else (no answer, an answer that is not JSON, a refusal of the
 * signature, which is a configuration problem) is `502 identity.unavailable`, logged with the
 * route and the status, never a body.
 */
async function identityCall(
  ctx: Ctx,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const person = pagePerson(ctx);
  const url = `${ctx.config.issuer}${path}`;
  const text = body === undefined ? undefined : JSON.stringify(body);
  const headers = new Headers(
    await signProductRequest({
      product: PRODUCT_NAME,
      secret: ctx.env.IDENTITY_EVENTS_SECRET,
      method,
      url,
      ...(text !== undefined ? { body: text } : {}),
      now: ctx.deps.now(),
    }),
  );
  headers.set("Authorization", `Bearer ${person.token}`);
  headers.set("Accept", "application/json");
  if (text !== undefined) headers.set("Content-Type", "application/json");

  const unavailable = (status: number | string) => {
    console.error(`cloud: the identity service's ${method} ${path} answered ${status}`);
    return fail("identity.unavailable");
  };
  let answer: Response | undefined;
  try {
    answer = await withinTime(
      () =>
        ctx.deps.fetch(url, {
          method,
          headers,
          ...(text !== undefined ? { body: text } : {}),
          redirect: "manual",
        }),
      IDENTITY_TIMEOUT_MS,
    );
  } catch {
    throw unavailable("nothing (unreachable)");
  }
  if (!answer) throw unavailable("nothing in time");
  let value: unknown;
  try {
    value = JSON.parse(await answer.text());
  } catch {
    throw unavailable(answer.status);
  }
  if (answer.status === 200 && isAccountView(value)) return json(value);
  const code =
    value !== null && typeof value === "object" ? (value as Record<string, unknown>)["error"] : "";
  if (answer.status === 401 && code === "session.invalid") throw fail("auth.required");
  if (typeof code === "string" && PASSED_THROUGH.has(code as ErrorCode)) {
    throw fail(code as ErrorCode);
  }
  throw unavailable(answer.status);
}

/** `GET /api/account/identity`: the person's sign-ins and sessions, as the identity service has them. */
export const identityAccountRoute: Route = (ctx) => identityCall(ctx, "GET", "/api/account");

/** `POST /api/account/identity/unlink { provider }`: one way of signing in removed. */
export const identityUnlinkRoute: Route = async (ctx) => {
  pagePerson(ctx);
  const provider = (await readJsonObject(ctx.request))["provider"];
  if (typeof provider !== "string") throw fail("provider.unknown");
  return identityCall(ctx, "POST", "/api/account/unlink", { provider });
};

/** `POST /api/account/identity/sessions/revoke-others`: every other device signed out. */
export const identityRevokeOthersRoute: Route = (ctx) =>
  identityCall(ctx, "POST", "/api/account/sessions/revoke-others", {});

/** `POST /api/account/identity/sessions/:sid/revoke`: one other device signed out. */
export const identityRevokeOneRoute: Route = async (ctx) => {
  pagePerson(ctx);
  const sid = ctx.params["sid"] ?? "";
  if (!SESSION_ID.test(sid)) throw fail("session.not-found");
  return identityCall(ctx, "POST", `/api/account/sessions/${sid}/revoke`, {});
};

/**
 * `GET /api/account/usage`: `{ projects, storageBytes, limits }`. `projects` is the number of the
 * person's projects; `storageBytes` is the sum of the sizes of the distinct blobs their projects and
 * versions reference (a blob two projects share, or a project and its versions share, counts once), as
 * of the last materialisation, version, upload or deletion, which each refresh it; `limits` is what an
 * account and a project may hold, so that the page shows a quota without knowing its numbers.
 */
export const usageRoute: Route = async (ctx) => {
  const principal = requirePrincipal(ctx);
  const usage = await ctx.deps.store.usage(principal.sub);
  return json({
    projects: usage.projects,
    storageBytes: usage.storageBytes,
    limits: {
      projects: CLOUD_LIMITS.projects,
      storageBytes: CLOUD_LIMITS.storageBytes,
      files: CLOUD_LIMITS.files,
      documentBytes: CLOUD_LIMITS.documentBytes,
      binaryBytes: CLOUD_LIMITS.binaryBytes,
      versions: CLOUD_LIMITS.versions,
    },
  });
};

/**
 * `PATCH /api/account { handle }`: the name of the person's publications, the first segment of their
 * public addresses (`[a-z0-9-]{3,30}`, exactly: nothing is trimmed or lower-cased for them). `200
 * { handle }` when it is theirs now; `400 handle.invalid` for another shape; `409 handle.taken` while
 * another account holds it; `409 handle.locked` while a publication is addressed by the handle they
 * have, because it would move from under its address (the same handle again is always fine). A
 * person signed in on the page may choose one (the router has applied the `Origin` rule to the
 * cookie) and so may their API token: the command line publishes with a token and a first
 * publication needs a handle. It is the only thing a token may set about the account, and what it
 * names is public only once a page is published under it.
 */
export const patchAccountRoute: Route = async (ctx) => {
  const principal = requirePrincipal(ctx);
  const handle = (await readJsonObject(ctx.request))["handle"];
  if (typeof handle !== "string" || !HANDLE.test(handle)) throw fail("handle.invalid");
  const outcome = await ctx.deps.store.setHandle(principal.sub, handle);
  if (outcome === "taken") throw fail("handle.taken");
  if (outcome === "locked") throw fail("handle.locked");
  // No row: the account was deleted since the session was checked. The session is no use any more.
  if (outcome === "missing") throw fail("auth.required");
  return json({ handle });
};
