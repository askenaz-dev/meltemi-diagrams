// Idempotent creation and pushes (`cloud-projects`, "Idempotent creation and pushes"): a request that
// carries an idempotency key is answered once, and a repeat with the same key and the same body is
// answered with that first answer for a day, so a client that retries after a lost answer never
// creates a second project or pushes twice. `POST /api/projects` and `PUT /api/projects/:id/files`
// read the key from the `Idempotency-Key` header; the MCP tools `create_project` and `write_files`
// take it as `idempotencyKey` and come through here with the same route and the same body, so a key
// is the same key by either door.
//
// The key is claimed (a row with no answer) before the change is made and answered after it: a push
// is a transaction of the room, not of D1, so one batch cannot hold the change and its answer. Of two
// requests that race with one key, one claims it and the other is `409 idempotency.pending`; a claim
// whose request died is taken over after a minute. An answer is kept when it is the request's to
// repeat: a success, or a refusal of the request itself (4xx); a failure of the service (5xx) and a
// rate (429) let go of the key, so that a retry runs again.

import { requirePrincipal } from "./access.js";
import type { Ctx, OpCtx } from "./context.js";
import { ApiError, fail } from "./errors.js";
import { json } from "./http.js";
import { sha256OfBytes } from "./materialise.js";

/** The header that carries the key. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
/** The header of a repeated answer. */
export const REPLAYED_HEADER = "Idempotent-Replayed";
/** A key: 1 to 64 visible ASCII characters. */
export const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,64}$/;
/** How long a key's answer is kept: a day. */
export const KEPT_MS = 24 * 60 * 60 * 1000;
/** How long a claim nobody answered holds its key: a minute, longer than any request runs. */
export const CLAIM_MS = 60 * 1000;

/** An answer: the status and the JSON body. */
export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/** An answer, and whether it is a repeat of the first. */
export interface IdempotentAnswer extends Answer {
  readonly replayed: boolean;
}

/** The key as a request gave it, checked: `400 request.invalid` for anything else. */
export function readKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw fail("request.invalid", "An idempotency key is 1 to 64 visible ASCII characters.");
  }
  return value;
}

/** Whether an answer of this status is kept for the key: the request's own, not the service's. */
function kept(status: number): boolean {
  return status < 500 && status !== 429;
}

/** The JSON of an error, as `errorResponse` writes it. */
function errorBody(error: ApiError): Record<string, unknown> {
  return { ...error.details, code: error.code, message: error.message };
}

/**
 * Runs `run` once for the key: the first request with it runs and its answer is kept; a repeat with
 * the same route and body answers the kept answer (`replayed`); the same key with another route or
 * body is `409 idempotency.mismatch`, and one whose first request is still running is `409
 * idempotency.pending`. A first request's refusal is thrown as it is (and kept), a repeat's is
 * answered with its status and body. `body` is the request's body exactly as it came.
 */
export async function idempotent(
  ctx: OpCtx,
  key: string,
  route: string,
  body: Uint8Array,
  run: () => Promise<Answer>,
): Promise<IdempotentAnswer> {
  const { sub } = requirePrincipal(ctx);
  const { store, now } = ctx.deps;
  const at = now();
  const hash = await sha256OfBytes(new Uint8Array(body));
  const outcome = await store.claimKey(
    { sub, key, route, hash, at: at.toISOString() },
    new Date(at.getTime() - KEPT_MS).toISOString(),
    new Date(at.getTime() - CLAIM_MS).toISOString(),
  );
  if (outcome.status === "kept") {
    if (outcome.route !== route || outcome.hash !== hash) throw fail("idempotency.mismatch");
    if (outcome.answer === null) throw fail("idempotency.pending");
    return {
      status: outcome.answer.status,
      body: JSON.parse(outcome.answer.body) as unknown,
      replayed: true,
    };
  }
  let answer: Answer;
  try {
    answer = await run();
  } catch (error) {
    if (error instanceof ApiError && kept(error.status)) {
      await store.keepAnswer(sub, key, {
        status: error.status,
        body: JSON.stringify(errorBody(error)),
      });
    } else {
      await store.releaseKey(sub, key).catch(() => undefined);
    }
    throw error;
  }
  if (kept(answer.status)) {
    await store.keepAnswer(sub, key, { status: answer.status, body: JSON.stringify(answer.body) });
  } else {
    await store.releaseKey(sub, key).catch(() => undefined);
  }
  return { ...answer, replayed: false };
}

/**
 * The answer of a route that honours `Idempotency-Key`: without the header, `run`'s answer as JSON;
 * with it, `idempotent`'s, a repeat with `Idempotent-Replayed: true`. A key of another shape is `400
 * request.invalid` and nothing runs.
 */
export async function answerOnce(
  ctx: Ctx,
  route: string,
  body: Uint8Array,
  run: () => Promise<Answer>,
): Promise<Response> {
  const header = ctx.request.headers.get(IDEMPOTENCY_HEADER);
  if (header === null) {
    const answer = await run();
    return json(answer.body, answer.status);
  }
  const answer = await idempotent(ctx, readKey(header), route, body, run);
  return json(answer.body, answer.status, answer.replayed ? { [REPLAYED_HEADER]: "true" } : {});
}
