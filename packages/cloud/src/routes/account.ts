// What an account holds and may hold (`cloud-projects`, "Usage and storage quota"): `GET
// /api/account/usage`; and the one thing a person sets about themselves (`publishing`, "Handles"):
// `PATCH /api/account { handle }`.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { requirePrincipal } from "../access.js";
import type { Route } from "../context.js";
import { fail } from "../errors.js";
import { json, readJsonObject } from "../http.js";
import { HANDLE } from "../ids.js";

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
