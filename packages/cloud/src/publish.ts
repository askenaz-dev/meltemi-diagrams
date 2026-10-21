// The publish host (`publishing`, "The publish host serves publications only"): the second, minimal
// Worker that serves what people published, from a registrable domain of its own, so that HTML a
// person wrote never meets the session cookie, which every host under `meltemi.dev` receives
// (decision 0042). It holds two bindings and nothing else (the bucket and the database, in
// `wrangler.publish.jsonc`): no assets, no secret, no Durable Object, no variable.
//
// It answers `GET` and `HEAD` of `/<handle>/<slug>/` and `/<handle>/<slug>/index.html`, for a
// publication whose ROW exists (a removed publication answers 404 even if its object lingers in the
// bucket), with the page and four headers; and 404 to everything else: `/`, `/playground.js`,
// `/api/…`, a handle or a slug the patterns refuse, a path with a different shape, every other
// method, `/<handle>/<slug>` without the slash (a redirect would be an answer other than 404, and
// the address a person is given always has the slash). It never reads a cookie, never sets one and
// never answers an API route: nothing here looks at a header of the request.
//
// The same page and headers are what the main Worker serves under `/_published/…` in development
// (`routes/published.ts`), through `publishedPage`, so the browser suite sees what a visitor would.

import type { R2Like } from "./env.js";
import { HANDLE, SLUG } from "./ids.js";
import { publishedKey } from "./keys.js";
import type { PublicationReader } from "./store/types.js";

/** What the publish Worker reads of its bucket: the stored page, and its size for a `HEAD`. */
export type PublishedBlobs = Pick<R2Like, "get" | "head">;

/** What the publish host is given by its bindings (the bucket; the database is in `PublishDeps`). */
export interface PublishEnv {
  readonly BLOBS: PublishedBlobs;
}

/** What the publish host asks of the database: whether a publication exists at an address. */
export interface PublishDeps {
  readonly store: PublicationReader;
}

/**
 * The headers a publication is served with, the same on the publish host and on the development
 * route. The page's own policy is the `meta` tag the catalog build wrote; no header adds to it, and
 * none names an origin that may read the page.
 */
export const PUBLISHED_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;

/** An address a publication is served at: the handle and the slug, both of the shapes the service makes. */
export interface PublishedAddress {
  readonly handle: string;
  readonly slug: string;
}

/**
 * The address a path names: `/<handle>/<slug>/` or `/<handle>/<slug>/index.html`, with the handle and
 * the slug checked by the patterns that made them (`HANDLE`, `SLUG`) before anything is looked up.
 * The path is read as it came, with no percent-escape decoded: an address has one spelling, and
 * `/%61bc/page/` is not it. Anything else, a missing slash included, is undefined.
 */
export function addressOf(pathname: string): PublishedAddress | undefined {
  const parts = pathname.split("/");
  if (parts.length !== 4 || parts[0] !== "") return undefined;
  const [, handle, slug, file] = parts;
  if (file !== "" && file !== "index.html") return undefined;
  if (handle === undefined || slug === undefined) return undefined;
  if (!HANDLE.test(handle) || !SLUG.test(slug)) return undefined;
  return { handle, slug };
}

/**
 * The page of a publication as a response, or undefined when there is nothing to serve: no row at the
 * address (the row decides: an object with no row is not served), or a row whose object is gone.
 * `HEAD` answers the headers alone, from the object's size. The bytes are streamed from the bucket,
 * never held whole.
 */
export async function publishedPage(
  address: PublishedAddress,
  method: "GET" | "HEAD",
  store: PublicationReader,
  blobs: PublishedBlobs,
): Promise<Response | undefined> {
  const { handle, slug } = address;
  if (!(await store.publication(handle, slug))) return undefined;
  const key = publishedKey(handle, slug);
  const headersOf = (size: number) => ({ ...PUBLISHED_HEADERS, "Content-Length": String(size) });
  const missing = (): undefined => {
    // A row without its object: nothing to serve and nobody to tell but the log (an address is public).
    console.error(`publish: the page of ${handle}/${slug} is missing from the bucket`);
    return undefined;
  };
  if (method === "HEAD") {
    const head = await blobs.head(key);
    return head ? new Response(null, { status: 200, headers: headersOf(head.size) }) : missing();
  }
  const object = await blobs.get(key);
  return object
    ? new Response(object.body, { status: 200, headers: headersOf(object.size) })
    : missing();
}

/** What the publish host answers to everything it does not serve: a 404 that says nothing of why. */
function notFound(method: string): Response {
  return new Response(method === "HEAD" ? null : "Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // A page published a moment later must not be hidden behind a cached 404.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** A failure of the bucket or the database: the page is not served and nothing says why. */
function failed(method: string): Response {
  return new Response(method === "HEAD" ? null : "Something went wrong", {
    status: 500,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/**
 * The publish host: a request in, a response out, with the bucket and the database it was given
 * (the Worker's entry, `publish-worker.ts`, builds them from the bindings; the tests give fakes).
 */
export async function publishHost(
  request: Request,
  env: PublishEnv,
  deps: PublishDeps,
): Promise<Response> {
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") return notFound(method);
  const address = addressOf(new URL(request.url).pathname);
  if (!address) return notFound(method);
  try {
    return (await publishedPage(address, method, deps.store, env.BLOBS)) ?? notFound(method);
  } catch (error) {
    console.error(
      "publish: a page could not be read:",
      error instanceof Error ? error.message : "unknown",
    );
    return failed(method);
  }
}
