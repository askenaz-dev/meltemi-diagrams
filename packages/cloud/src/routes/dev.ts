// A development tool that is not about rooms: `POST /api/dev/collect`. Like the room's own (`routes/
// rooms.ts`) it answers `404` anywhere but in development (`DEV` is `"true"` in `.dev.vars` alone, and
// `config.ts` is the one place that reads it), before anything else is looked at.

import { requirePrincipal } from "../access.js";
import { collectBlobs, COLLECT_AFTER_MS } from "../collect.js";
import type { Route } from "../context.js";
import { fail } from "../errors.js";
import { MAX_JSON_BYTES, json, readCappedBytes } from "../http.js";

/**
 * `POST /api/dev/collect` with an optional `{ olderThanDays? }`: runs the weekly collection now, for
 * the browser suite, which cannot wait a week. Any signed-in person may ask (it touches nothing but
 * what no project references); `olderThanDays` (a number from 0, 7 by default) is how old a blob must be.
 * Answers what the run did: `{ rows, objects, orphans, failures, truncated }`.
 */
export const devCollect: Route = async (ctx) => {
  if (!ctx.config.dev) throw fail("not-found");
  requirePrincipal(ctx);
  const bytes = await readCappedBytes(ctx.request, MAX_JSON_BYTES);
  if (bytes === undefined) throw fail("request.invalid");
  let days = COLLECT_AFTER_MS / (24 * 60 * 60 * 1000);
  if (bytes.length > 0) {
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw fail("request.invalid");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body))
      throw fail("request.invalid");
    const given = (body as { olderThanDays?: unknown }).olderThanDays;
    if (given !== undefined) {
      if (typeof given !== "number" || !Number.isFinite(given) || given < 0) {
        throw fail("request.invalid", "olderThanDays is a number of days from 0.");
      }
      days = given;
    }
  }
  const result = await collectBlobs(
    { store: ctx.deps.store, blobs: ctx.env.BLOBS, now: ctx.deps.now },
    { olderThanMs: days * 24 * 60 * 60 * 1000 },
  );
  return json(result);
};
