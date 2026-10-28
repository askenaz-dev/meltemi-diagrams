import { ConfigError, readConfig, type Config } from "./config.js";
import type { Ctx, Route } from "./context.js";
import type { Env } from "./env.js";
import { ApiError, errorResponse, fail } from "./errors.js";
import { pageResponse } from "./http.js";
import { requireOwnOrigin, resolvePrincipal } from "./principal.js";
import {
  identityAccountRoute,
  identityRevokeOneRoute,
  identityRevokeOthersRoute,
  identityUnlinkRoute,
  patchAccountRoute,
  usageRoute,
} from "./routes/account.js";
import {
  entitlementsListRoute,
  entitlementsRoute,
  setEntitlementsRoute,
  takedownRoute,
} from "./routes/admin.js";
import { cliAuthApprove, cliAuthPage, cliAuthStyle, cliAuthToken } from "./routes/cli-auth.js";
import {
  deleteBinaryRoute,
  getBlobRoute,
  headBlobRoute,
  putBinaryRoute,
} from "./routes/binaries.js";
import { devCollect } from "./routes/dev.js";
import { eventsRoute } from "./routes/events.js";
import { projectLink } from "./routes/links.js";
import { deleteLiveRoute, getLiveRoute, putLiveRoute } from "./routes/live.js";
import {
  createProjectRoute,
  deleteProjectRoute,
  duplicateProjectRoute,
  getProjectRoute,
  listProjectsRoute,
  patchProjectRoute,
} from "./routes/projects.js";
import { devPublished } from "./routes/published.js";
import { deletePublishRoute, getPublishRoute, putPublishRoute } from "./routes/publish.js";
import {
  devRoomDisconnect,
  devRoomLimits,
  devRoomStats,
  getFiles,
  putFiles,
  roomSocket,
} from "./routes/rooms.js";
import { sessionRoute } from "./routes/session.js";
import {
  acceptInvitationRoute,
  getSharingRoute,
  inviteRoute,
  leaveRoute,
  listInvitationsRoute,
  patchMemberRoute,
  patchSharingRoute,
  removeMemberRoute,
  revokeInvitationRoute,
} from "./routes/sharing.js";
import { getThumbnailRoute, putThumbnailRoute } from "./routes/thumbnails.js";
import { createTokenRoute, deleteTokenRoute, listTokensRoute } from "./routes/tokens.js";
import {
  createVersionRoute,
  getVersionRoute,
  listVersionsRoute,
  restoreVersionRoute,
} from "./routes/versions.js";
import type { Deps, Principal } from "./types.js";

export interface RouteEntry {
  readonly method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: RegExp;
  readonly params?: readonly string[];
  /**
   * Whether the route resolves who is asking (and so the `Origin` rule applies to a change made with
   * the cookie). A route that does may still be answered to nobody: a project's link can admit
   * anonymous callers to the `read` routes (`access.ts` decides, and answers 401, 403 or 404).
   */
  readonly principal: boolean;
  readonly route: Route;
}

/** The routes, exported so that a test can audit which of them the `Origin` rule covers. */
export const ROUTES: readonly RouteEntry[] = [
  { method: "GET", path: /^\/api\/session$/, principal: true, route: sessionRoute },
  { method: "POST", path: /^\/api\/tokens$/, principal: true, route: createTokenRoute },
  { method: "GET", path: /^\/api\/tokens$/, principal: true, route: listTokensRoute },
  {
    method: "DELETE",
    path: /^\/api\/tokens\/([^/]+)$/,
    params: ["id"],
    principal: true,
    route: deleteTokenRoute,
  },
  { method: "POST", path: /^\/_identity\/events$/, principal: false, route: eventsRoute },
  { method: "GET", path: /^\/cli-auth$/, principal: true, route: cliAuthPage },
  { method: "POST", path: /^\/cli-auth$/, principal: true, route: cliAuthApprove },
  { method: "POST", path: /^\/cli-auth\/token$/, principal: false, route: cliAuthToken },
  { method: "GET", path: /^\/cli-auth\/style\.css$/, principal: false, route: cliAuthStyle },
  { method: "GET", path: /^\/p\/([^/]*)$/, params: ["id"], principal: false, route: projectLink },
  // The socket decides for itself whether to look at the credentials: a request that is not an
  // upgrade is a 404 for everybody, signed in or not, and a bearer token is not taken on it.
  {
    method: "GET",
    path: /^\/rooms\/([^/]+)$/,
    params: ["id"],
    principal: false,
    route: roomSocket,
  },
  { method: "GET", path: /^\/api\/projects$/, principal: true, route: listProjectsRoute },
  { method: "POST", path: /^\/api\/projects$/, principal: true, route: createProjectRoute },
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)$/,
    params: ["id"],
    principal: true,
    route: getProjectRoute,
  },
  {
    method: "PATCH",
    path: /^\/api\/projects\/([^/]+)$/,
    params: ["id"],
    principal: true,
    route: patchProjectRoute,
  },
  {
    method: "DELETE",
    path: /^\/api\/projects\/([^/]+)$/,
    params: ["id"],
    principal: true,
    route: deleteProjectRoute,
  },
  {
    method: "POST",
    path: /^\/api\/projects\/([^/]+)\/duplicate$/,
    params: ["id"],
    principal: true,
    route: duplicateProjectRoute,
  },
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/files$/,
    params: ["id"],
    principal: true,
    route: getFiles,
  },
  {
    method: "PUT",
    path: /^\/api\/projects\/([^/]+)\/files$/,
    params: ["id"],
    principal: true,
    route: putFiles,
  },
  // The path after `binaries/` is the file's own, slashes included (each segment is encoded).
  {
    method: "PUT",
    path: /^\/api\/projects\/([^/]+)\/binaries\/(.+)$/,
    params: ["id", "path"],
    principal: true,
    route: putBinaryRoute,
  },
  {
    method: "DELETE",
    path: /^\/api\/projects\/([^/]+)\/binaries\/(.+)$/,
    params: ["id", "path"],
    principal: true,
    route: deleteBinaryRoute,
  },
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/blobs\/([^/]+)$/,
    params: ["id", "hash"],
    principal: true,
    route: getBlobRoute,
  },
  {
    method: "HEAD",
    path: /^\/api\/projects\/([^/]+)\/blobs\/([^/]+)$/,
    params: ["id", "hash"],
    principal: true,
    route: headBlobRoute,
  },
  // Versions: the room materialises before one is made; an editor makes and restores them.
  {
    method: "POST",
    path: /^\/api\/projects\/([^/]+)\/versions$/,
    params: ["id"],
    principal: true,
    route: createVersionRoute,
  },
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/versions$/,
    params: ["id"],
    principal: true,
    route: listVersionsRoute,
  },
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/versions\/([^/]+)$/,
    params: ["id", "n"],
    principal: true,
    route: getVersionRoute,
  },
  {
    method: "POST",
    path: /^\/api\/projects\/([^/]+)\/versions\/([^/]+)\/restore$/,
    params: ["id", "n"],
    principal: true,
    route: restoreVersionRoute,
  },
  {
    method: "PUT",
    path: /^\/api\/projects\/([^/]+)\/thumbnail$/,
    params: ["id"],
    principal: true,
    route: putThumbnailRoute,
  },
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/thumbnail$/,
    params: ["id"],
    principal: true,
    route: getThumbnailRoute,
  },
  // Sharing: the link level, the members and the invitations of a project. `…/members/me` is
  // before `…/members/:sub`, which would take `me` for a sub.
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/sharing$/,
    params: ["id"],
    principal: true,
    route: getSharingRoute,
  },
  {
    method: "PATCH",
    path: /^\/api\/projects\/([^/]+)\/sharing$/,
    params: ["id"],
    principal: true,
    route: patchSharingRoute,
  },
  {
    method: "POST",
    path: /^\/api\/projects\/([^/]+)\/members$/,
    params: ["id"],
    principal: true,
    route: inviteRoute,
  },
  {
    method: "DELETE",
    path: /^\/api\/projects\/([^/]+)\/members\/me$/,
    params: ["id"],
    principal: true,
    route: leaveRoute,
  },
  {
    method: "PATCH",
    path: /^\/api\/projects\/([^/]+)\/members\/([^/]+)$/,
    params: ["id", "sub"],
    principal: true,
    route: patchMemberRoute,
  },
  {
    method: "DELETE",
    path: /^\/api\/projects\/([^/]+)\/members\/([^/]+)$/,
    params: ["id", "sub"],
    principal: true,
    route: removeMemberRoute,
  },
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/invitations$/,
    params: ["id"],
    principal: true,
    route: listInvitationsRoute,
  },
  {
    method: "DELETE",
    path: /^\/api\/projects\/([^/]+)\/invitations\/([^/]+)$/,
    params: ["id", "invitation"],
    principal: true,
    route: revokeInvitationRoute,
  },
  {
    method: "POST",
    path: /^\/api\/invitations\/([^/]+)\/accept$/,
    params: ["token"],
    principal: true,
    route: acceptInvitationRoute,
  },
  // A live session: the owner's. The token it holds is checked by the room, where the socket arrives.
  {
    method: "PUT",
    path: /^\/api\/projects\/([^/]+)\/live$/,
    params: ["id"],
    principal: true,
    route: putLiveRoute,
  },
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/live$/,
    params: ["id"],
    principal: true,
    route: getLiveRoute,
  },
  {
    method: "DELETE",
    path: /^\/api\/projects\/([^/]+)\/live$/,
    params: ["id"],
    principal: true,
    route: deleteLiveRoute,
  },
  // Publishing: the owner's, with the cookie or a token. The page is served by the publish host
  // (`publish.ts`), never by this Worker, but for the development route below.
  {
    method: "GET",
    path: /^\/api\/projects\/([^/]+)\/publish$/,
    params: ["id"],
    principal: true,
    route: getPublishRoute,
  },
  {
    method: "PUT",
    path: /^\/api\/projects\/([^/]+)\/publish$/,
    params: ["id"],
    principal: true,
    route: putPublishRoute,
  },
  {
    method: "DELETE",
    path: /^\/api\/projects\/([^/]+)\/publish\/([^/]+)$/,
    params: ["id", "slug"],
    principal: true,
    route: deletePublishRoute,
  },
  { method: "GET", path: /^\/api\/account\/usage$/, principal: true, route: usageRoute },
  // A handle is the page's to choose: the route refuses a token.
  { method: "PATCH", path: /^\/api\/account$/, principal: true, route: patchAccountRoute },
  // The identity service's account data, on the person's behalf: the page's cookie only.
  {
    method: "GET",
    path: /^\/api\/account\/identity$/,
    principal: true,
    route: identityAccountRoute,
  },
  {
    method: "POST",
    path: /^\/api\/account\/identity\/unlink$/,
    principal: true,
    route: identityUnlinkRoute,
  },
  {
    method: "POST",
    path: /^\/api\/account\/identity\/sessions\/revoke-others$/,
    principal: true,
    route: identityRevokeOthersRoute,
  },
  {
    method: "POST",
    path: /^\/api\/account\/identity\/sessions\/([^/]+)\/revoke$/,
    params: ["sid"],
    principal: true,
    route: identityRevokeOneRoute,
  },
  // The administrators' route: it answers 404 to everybody else, and the `Origin` rule covers it.
  {
    method: "DELETE",
    path: /^\/api\/admin\/publications\/([^/]+)\/([^/]+)$/,
    params: ["handle", "slug"],
    principal: true,
    route: takedownRoute,
  },
  // The entitlement to export without the branding: an account's, read and set, and the list.
  {
    method: "GET",
    path: /^\/api\/admin\/accounts\/([^/]+)\/entitlements$/,
    params: ["account"],
    principal: true,
    route: entitlementsRoute,
  },
  {
    method: "PUT",
    path: /^\/api\/admin\/accounts\/([^/]+)\/entitlements$/,
    params: ["account"],
    principal: true,
    route: setEntitlementsRoute,
  },
  {
    method: "GET",
    path: /^\/api\/admin\/entitlements$/,
    principal: true,
    route: entitlementsListRoute,
  },
  // Development only: serves a publication from this origin; the route answers 404 anywhere else.
  {
    method: "GET",
    path: /^\/_published\/([^/]+)\/([^/]+)\/(?:index\.html)?$/,
    params: ["handle", "slug"],
    principal: false,
    route: devPublished,
  },
  {
    method: "HEAD",
    path: /^\/_published\/([^/]+)\/([^/]+)\/(?:index\.html)?$/,
    params: ["handle", "slug"],
    principal: false,
    route: devPublished,
  },
  // Development only: the route itself answers 404 anywhere else.
  { method: "POST", path: /^\/api\/dev\/collect$/, principal: true, route: devCollect },
  {
    method: "GET",
    path: /^\/api\/dev\/rooms\/([^/]+)\/stats$/,
    params: ["id"],
    principal: true,
    route: devRoomStats,
  },
  {
    method: "POST",
    path: /^\/api\/dev\/rooms\/([^/]+)\/disconnect$/,
    params: ["id"],
    principal: true,
    route: devRoomDisconnect,
  },
  {
    method: "POST",
    path: /^\/api\/dev\/rooms\/([^/]+)\/limits$/,
    params: ["id"],
    principal: true,
    route: devRoomLimits,
  },
];

/** The paths the Worker answers itself: an unmatched one under them is a JSON 404, never an asset. */
const RESERVED = /^\/(api|_identity|_published|cli-auth|p|rooms)(\/|$)/;

/**
 * Whether a path is one the Worker answers itself, in any spelling. The assets binding reads a path
 * with its percent-escapes decoded, so `/%61pi/session` would reach the static `api/session` file
 * if only the spelling that came in were checked: the decoded path is checked too. A path that
 * cannot be decoded counts as reserved, for no asset has a name like that.
 */
function isReserved(pathname: string): boolean {
  if (RESERVED.test(pathname)) return true;
  try {
    return RESERVED.test(decodeURIComponent(pathname));
  } catch {
    return true;
  }
}

function match(
  method: string,
  pathname: string,
): { entry: RouteEntry; params: Record<string, string> } | undefined {
  for (const entry of ROUTES) {
    if (entry.method !== method) continue;
    const found = entry.path.exec(pathname);
    if (!found) continue;
    const params: Record<string, string> = {};
    for (const [i, name] of (entry.params ?? []).entries()) {
      try {
        params[name] = decodeURIComponent(found[i + 1] ?? "");
      } catch {
        return undefined;
      }
    }
    return { entry, params };
  }
  return undefined;
}

/**
 * The service: a request in, a response out. Everything with a side effect (the store, the
 * identity service, the assets, the clock, randomness) arrives in `deps`, so the tests run in Node.
 */
export async function cloud(request: Request, env: Env, deps: Deps): Promise<Response> {
  let config: Config;
  try {
    config = readConfig(env, request);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(`cloud: ${error.message}`);
    return errorResponse(fail("internal"));
  }
  const url = new URL(request.url);
  // Only the service's own host is served: another host (the publish host, a stray name) gets
  // no asset and no API.
  if (url.host !== config.host) return errorResponse(fail("not-found"));

  try {
    const found = match(request.method, url.pathname);
    if (!found) {
      if (isReserved(url.pathname)) return errorResponse(fail("not-found"));
      return pageResponse(await deps.assets.fetch(request));
    }
    let principal: Principal | undefined;
    if (found.entry.principal) {
      principal = await resolvePrincipal(request, deps, config);
      // Every host of the family receives the session cookie and is the same site: a change made
      // with the cookie must come from this service's own page, before the route runs.
      requireOwnOrigin(request, principal, config);
    }
    const ctx: Ctx = { request, url, env, deps, config, principal, params: found.params };
    return await found.entry.route(ctx);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    // The message of an error never holds a secret or a person's data: log it and say nothing more.
    console.error("cloud: unexpected error:", error instanceof Error ? error.message : "unknown");
    return errorResponse(fail("internal"));
  }
}
