import type { Route } from "../context.js";
import { fail } from "../errors.js";
import { errorResponse } from "../errors.js";
import { redirect } from "../http.js";
import { PROJECT_ID } from "../ids.js";

/**
 * `GET /p/<id>`: a project's link. The page is always served at `/`, so its relative asset
 * addresses hold (the page's policy forbids a `<base>`): the link redirects to
 * `/?project=<id>` keeping the rest of the query (`?invite=` included); the page reads both.
 * An id that cannot be a project id is `404 project.not-found`, without a redirect.
 */
export const projectLink: Route = async (ctx) => {
  const id = ctx.params["id"] ?? "";
  if (!PROJECT_ID.test(id)) return errorResponse(fail("project.not-found"));
  const query = new URLSearchParams(ctx.url.search);
  query.delete("project");
  const rest = query.toString();
  return redirect(`/?project=${id}${rest ? `&${rest}` : ""}`);
};
