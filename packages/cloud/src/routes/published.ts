// A development tool, and only that: `GET` and `HEAD /_published/<handle>/<slug>/` (and `index.html`
// under it), which serves a publication from the Worker's OWN origin, with the page and the headers
// the publish host gives it (`publish.ts`), so that the browser suite and a person running `pnpm
// cloud:dev` can see what a visitor would, with no second Worker and no second domain.
//
// In production this must never serve anything: the page a person wrote would be on the origin that
// holds the session cookie and the API, which is the very thing the publish host exists to prevent
// (decision 0042). Like the other development tools it answers `404` unless `DEV` is `"true"`
// (`config.ts` decides, from `.dev.vars` alone), before it looks at anything else. In production
// the prefix is reserved, so every other path under it is the Worker's JSON `404` too.

import type { Route } from "../context.js";
import { fail } from "../errors.js";
import { addressOf, publishedPage } from "../publish.js";

const PREFIX = "/_published";

export const devPublished: Route = async (ctx) => {
  if (!ctx.config.dev) throw fail("not-found");
  // The path as it came, not as the router decoded it: an address has one spelling.
  const address = addressOf(ctx.url.pathname.slice(PREFIX.length));
  const method = ctx.request.method === "HEAD" ? "HEAD" : "GET";
  const page = address
    ? await publishedPage(address, method, ctx.deps.store, ctx.env.BLOBS)
    : undefined;
  if (!page) throw fail("not-found", "There is no such publication.");
  return page;
};
