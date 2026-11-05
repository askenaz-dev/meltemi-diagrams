// The operations of publishing a project (`publishing`, "Publish and unpublish"). The page builds the
// HTML (the catalog build over the project's files) and sends it, as the command line does; the MCP
// tool `publish` has the renderer object build it (`mcp/tools-live.ts`). These store it and say where
// it is served, by the publish host (`publish.ts`), a second Worker on a domain of its own, from the
// object put under `published/<handle>/<slug>/index.html` and the row recorded. They are the owner's
// (`manage`), with the cookie, an API token or the MCP endpoint.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { requirePrincipal, requireProjectAccess } from "../access.js";
import { publishHostOf } from "../config.js";
import type { OpCtx, Unchecked } from "../context.js";
import { fail } from "../errors.js";
import { SLUG } from "../ids.js";
import { publishedKey } from "../keys.js";
import type { Publication } from "../store/types.js";

/**
 * The public address of a publication: `https://<PUBLISH_HOST>/<handle>/<slug>/`, and in development
 * (where there is no publish host) the Worker's own `/_published/<handle>/<slug>/`. A deployment
 * with no usable `PUBLISH_HOST` has no address to give (`ConfigError`, an internal error that names
 * the variable in the log).
 */
export function publicationUrl(ctx: Pick<OpCtx, "config">, handle: string, slug: string): string {
  if (ctx.config.dev) return `${ctx.config.origin}/_published/${handle}/${slug}/`;
  return `https://${publishHostOf(ctx.config)}/${handle}/${slug}/`;
}

/** A publication as the owner sees it. */
function publicationJson(ctx: OpCtx, publication: Publication) {
  return {
    slug: publication.slug,
    url: publicationUrl(ctx, publication.handle, publication.slug),
    published_at: publication.publishedAt,
    bytes: publication.bytes,
  };
}

/**
 * The project's publications (`manage`): `{ handle, publications, takedowns }`. `handle` is the
 * owner's, or null until they choose one. `publications` are this project's, the earliest first, each
 * with the address it is served at. `takedowns` are the ones the service made of this project's
 * publications, under the owner's handle, the latest first: `{ slug, at, reason }`. A removal is the
 * project's own notice, not the handle's: a person who takes a handle that someone else held, and had
 * a page removed under, is shown nothing of it. One the owner has since published again, with this
 * project, is not listed.
 */
export async function getPublications(ctx: OpCtx, projectId: string) {
  const { principal } = await requireProjectAccess(ctx, projectId, "manage");
  const { store } = ctx.deps;
  const [user, publications] = await Promise.all([
    store.user(principal.sub),
    store.publicationsOf(projectId),
  ]);
  const handle = user?.handle ?? null;
  const takedowns =
    user && handle !== null
      ? (await store.takedownsOf(handle)).filter(
          (taken) =>
            taken.projectId === projectId &&
            !publications.some((p) => p.slug === taken.slug && p.publishedAt > taken.at),
        )
      : [];
  return {
    handle,
    publications: publications.map((publication) => publicationJson(ctx, publication)),
    takedowns: takedowns.map((taken) => ({ slug: taken.slug, at: taken.at, reason: taken.reason })),
  };
}

/** Every publication of the asker's projects, each with its project and address, and the handle. */
export async function accountPublications(ctx: OpCtx) {
  const principal = requirePrincipal(ctx);
  const { store } = ctx.deps;
  const [user, publications] = await Promise.all([
    store.user(principal.sub),
    store.publicationsOwnedBy(principal.sub),
  ]);
  return {
    handle: user?.handle ?? null,
    publications: publications.map((publication) => ({
      project: publication.projectId,
      ...publicationJson(ctx, publication),
    })),
  };
}

/** What the owner is told when the handle changed in the last moment of a publish request. */
const HANDLE_MOVED = "Your handle changed while the page was being published; publish again.";

/** The slug of a request: `[a-z0-9-]{1,60}`, or `400 publish.invalid`. */
export function readSlug(value: unknown): string {
  if (typeof value !== "string" || !SLUG.test(value)) throw fail("publish.invalid");
  return value;
}

/** The HTML of a request: text, and something. A page nobody can read is not a page. */
function readHtml(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw fail("publish.invalid", "A publication needs the HTML of the page, as text.");
  }
  return value;
}

/** Throws `handle.required` unless the asker has a handle; answers it. */
export async function requireHandle(ctx: OpCtx): Promise<string> {
  const principal = requirePrincipal(ctx);
  const handle = (await ctx.deps.store.user(principal.sub))?.handle ?? null;
  if (handle === null) throw fail("handle.required");
  return handle;
}

export interface PublishInput {
  readonly slug: string;
  readonly html: string;
}

export interface Published {
  readonly url: string;
  readonly handle: string;
  readonly slug: string;
  readonly bytes: number;
  readonly published_at: string;
}

/**
 * Stores the page and answers `{ url, handle, slug, bytes, published_at }` (`manage`). Publishing a
 * slug the project already publishes replaces it. The checks run in this order and nothing is written
 * by a request that fails one:
 *
 *   - `handle.required` (409): the owner has no handle (read now, which is the one the page is
 *     published under: a request may have taken its time and a handle that changed is the owner's);
 *   - `publish.invalid` (400): a slug that is not `[a-z0-9-]{1,60}`, or an `html` that is not text, or empty;
 *   - `publish.too-large` (413): HTML over 16 MiB in UTF-8 bytes;
 *   - `publish.taken` (409): the slug is held, under the same handle, by another of the owner's projects;
 *   - `publish.rate` (429, `retryAfter`): the project made ten publish requests in the last hour (the
 *     rate counts requests, in `publish_log`, because publishing a slug again moves the time of its
 *     row and counting rows could not see the repeats).
 *
 * The store checks the handle once more in the statement that records the row (`409 handle.required`
 * when it was changed in the last moment), so a page is never left under an address its owner
 * released. A NEW address is claimed by its row first and then filled (a failure of the bucket takes
 * the row back): of two projects that race for one address, the one that does not get the row never
 * writes the page. A replacement writes the page first and then renews the row: the address is
 * already the project's, so nothing can be taken from it. The publish host serves a page only while
 * its row exists.
 */
export async function publish(
  ctx: OpCtx,
  projectId: string,
  input: Unchecked<PublishInput>,
): Promise<Published> {
  await requireProjectAccess(ctx, projectId, "manage");
  const { store, now } = ctx.deps;
  const handle = await requireHandle(ctx);
  const slug = readSlug(input.slug);
  const page = new TextEncoder().encode(readHtml(input.html));
  if (page.byteLength > CLOUD_LIMITS.publishBytes) throw fail("publish.too-large");
  // Built before anything is written: a deployment with no publish host fails here and not after
  // the page is stored.
  const url = publicationUrl(ctx, handle, slug);

  const existing = await store.publication(handle, slug);
  if (existing && existing.projectId !== projectId) throw fail("publish.taken");

  const at = now().toISOString();
  // This adds to the log, so it first removes what nobody comes back for.
  await store.sweep(at);
  const claim = await store.claimPublish(projectId, at, CLOUD_LIMITS.publishesPerHour);
  if (claim.status === "missing") throw fail("project.not-found");
  if (claim.status === "rate") {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(claim.freeAt) - now().getTime()) / 1000));
    throw fail("publish.rate", undefined, { retryAfter });
  }

  const key = publishedKey(handle, slug);
  const row: Publication = { projectId, handle, slug, publishedAt: at, bytes: page.byteLength };
  if (existing === undefined) {
    const outcome = await store.putPublication(row, { ownersHandle: true });
    if (outcome === "taken") throw fail("publish.taken");
    if (outcome === "missing") throw fail("project.not-found");
    if (outcome === "handle") throw fail("handle.required", HANDLE_MOVED);
    try {
      await ctx.env.BLOBS.put(key, page);
    } catch (error) {
      // Nothing is served from a row without its page, and the address is free again.
      await store.deletePublication(projectId, slug).catch(() => undefined);
      throw error;
    }
  } else {
    await ctx.env.BLOBS.put(key, page);
    const outcome = await store.putPublication(row, { ownersHandle: true });
    if (outcome === "missing") {
      // The project was deleted while the page was being written: the page has no project.
      await ctx.env.BLOBS.delete(key).catch(() => undefined);
      throw fail("project.not-found");
    }
    if (outcome === "taken") throw fail("publish.taken");
    if (outcome === "handle") throw fail("handle.required", HANDLE_MOVED);
  }
  return { url, handle, slug, bytes: page.byteLength, published_at: at };
}

/**
 * Removes the page and then the row (`manage`). The object goes first, so that a failure of the
 * bucket leaves the publication as it was and the owner tries again, and a failure after it leaves a
 * row with no page, which the publish host does not serve. `404 not-found` when the project publishes
 * nothing under the slug.
 */
export async function unpublish(ctx: OpCtx, projectId: string, slug: string): Promise<void> {
  await requireProjectAccess(ctx, projectId, "manage");
  const { store } = ctx.deps;
  const none = () => fail("not-found", "There is no such publication.");
  const found = SLUG.test(slug)
    ? (await store.publicationsOf(projectId)).find((publication) => publication.slug === slug)
    : undefined;
  if (!found) throw none();
  await ctx.env.BLOBS.delete(publishedKey(found.handle, found.slug));
  if (!(await store.deletePublication(projectId, slug))) throw none();
}
