import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { requireAccess, requirePrincipal, resolveAccess } from "../access.js";
import type { Ctx, Route } from "../context.js";
import { BLOB_HASH } from "../document.js";
import { errorResponse, fail } from "../errors.js";
import { MAX_JSON_BYTES, MAX_PUSH_BYTES, json, originOf, readCappedBytes } from "../http.js";
import { resolvePrincipal } from "../principal.js";
import { parsePush } from "../rooms.js";
import { resolveAgain } from "./sharing.js";

/**
 * `GET /rooms/<id>`: the page's socket to a project's room. It answers only an upgrade (anything
 * else is the Worker's JSON 404, whoever asks), then, in this order: who is asking, from the
 * cookie alone (a bearer token is not taken on the socket: `401 auth.required`); where the
 * upgrade comes from, which must be this service's own page (`403 request.forbidden`: a socket is
 * a `GET`, so the `Origin` rule of the changing routes does not cover it); and what the person is
 * to the project (`404 project.not-found` for none). The room then gets a request the Worker
 * constructs, with the identity and the role the Worker resolved (`owner`, `editor` or `viewer`: a
 * viewer connects and receives, and the room closes its socket if it writes). The socket asks for a
 * cookie even where a link admits anonymous viewers: they read a snapshot through `GET …/files`.
 */
export const roomSocket: Route = async (ctx) => {
  if (ctx.request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return errorResponse(fail("not-found"));
  }
  // The credentials the socket takes are the cookie's: nothing else of the request is consulted.
  const cookie = ctx.request.headers.get("Cookie");
  const principal = await resolvePrincipal(
    new Request(ctx.url, { headers: cookie ? { Cookie: cookie } : {} }),
    ctx.deps,
    ctx.config,
  );
  if (principal?.via !== "cookie") throw fail("auth.required");
  if (originOf(ctx.request) !== ctx.config.origin) throw fail("request.forbidden");

  const projectId = ctx.params["id"] ?? "";
  const access = await resolveAccess({ ...ctx, principal }, projectId);
  if (!access) throw fail("project.not-found");
  const response = await ctx.deps.rooms.connect(projectId, ctx.request, {
    sub: principal.sub,
    role: access.role,
    name: principal.profile.name,
    picture: principal.profile.picture,
  });
  // A change of access that committed while this upgrade was in flight cut the sockets the room
  // held then, and not this one, which the room accepted after the cut with the role resolved
  // before the change. Resolving again now, with the socket in the room, closes that gap: a change
  // committed after this read finds the socket and cuts it itself.
  let role: string | undefined;
  try {
    role = (await resolveAccess({ ...ctx, principal }, projectId))?.role;
  } catch {
    // Whether the person still has the role is not known: the socket does not stay on a guess.
  }
  if (role !== access.role && !(await resolveAgain(ctx, projectId, { sub: principal.sub }))) {
    throw fail("internal");
  }
  return response;
};

/**
 * The project id of a development route: the caller must be signed in (`401 auth.required` for
 * nobody, as these tools always did) and own the project; else the error of `requireAccess`.
 */
async function owned(ctx: Ctx): Promise<string> {
  requirePrincipal(ctx);
  return (await requireAccess(ctx, "manage")).projectId;
}

/**
 * `GET /api/projects/:id/files`: the latest files, from the room (never from D1). Needs `read`: it
 * is the snapshot an anonymous viewer of a `view` or `edit` link reads.
 */
export const getFiles: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "read");
  return json(await ctx.deps.rooms.read(projectId));
};

/** The JSON a request carries, read through a cap; `undefined` for a body that is not JSON. */
async function readJson(
  ctx: Ctx,
  maxBytes: number,
): Promise<{ tooLong: true } | { value: unknown } | undefined> {
  const bytes = await readCappedBytes(ctx.request, maxBytes);
  if (bytes === undefined) return { tooLong: true };
  if (bytes.length === 0) return { value: undefined };
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return undefined;
  }
}

/**
 * `PUT /api/projects/:id/files`: a push, `{ files: { path: text | null }, binaries: { path: hash |
 * null }, ifRevision? }`, applied by the room as one transaction. A body over a document's size
 * is `413 doc.too-large`; one that is not a push is `400 request.invalid`; the room answers the
 * rest (`400 path.invalid`, `400 blob.unknown`, `409 revision.mismatch` with the revision it is at).
 * Needs `write`: the owner, an editor, or a signed-in person on an `edit` link (an anonymous caller
 * there is `401 auth.required`, and on a private project `404`).
 */
export const putFiles: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "write");
  const body = await readJson(ctx, MAX_PUSH_BYTES);
  if (body === undefined) throw fail("request.invalid");
  if ("tooLong" in body) throw fail("doc.too-large");
  const push = parsePush(body.value);
  if (!push) throw fail("request.invalid");
  for (const hash of Object.values(push.binaries ?? {})) {
    if (hash !== null && !BLOB_HASH.test(hash)) {
      throw fail(
        "request.invalid",
        "A binary is named by the SHA-256 of its bytes, in lowercase hexadecimal.",
      );
    }
  }
  return json(await ctx.deps.rooms.push(projectId, push));
};

/**
 * `GET /api/dev/rooms/:id/stats`: what the room counted (storage writes, materialisations, D1
 * rows written, messages), for the browser suite. Development only: anywhere else it is `404`,
 * before anything is looked at.
 */
export const devRoomStats: Route = async (ctx) => {
  if (!ctx.config.dev) throw fail("not-found");
  const projectId = await owned(ctx);
  return json(await ctx.deps.rooms.stats(projectId));
};

/**
 * `POST /api/dev/rooms/:id/disconnect` with an optional `{ id?, sub? }`: closes the sockets that
 * name, for the suite's reconnection tests. Development only, like the stats.
 */
export const devRoomDisconnect: Route = async (ctx) => {
  if (!ctx.config.dev) throw fail("not-found");
  const projectId = await owned(ctx);
  const body = await readJson(ctx, MAX_JSON_BYTES);
  if (body === undefined || "tooLong" in body) throw fail("request.invalid");
  const value = body.value;
  // No body names no one in particular: every connection is cut.
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw fail("request.invalid");
  }
  const target = (value ?? {}) as { id?: unknown; sub?: unknown };
  return json(
    await ctx.deps.rooms.disconnect(projectId, {
      ...(typeof target.id === "string" ? { id: target.id } : {}),
      ...(typeof target.sub === "string" ? { sub: target.sub } : {}),
    }),
  );
};

/**
 * `POST /api/dev/rooms/:id/limits` with `{ clients? }`: lowers how many clients the room admits from
 * now on (a whole number from 1 to `CLOUD_LIMITS.clients`; omitted or `null`, the real limit), so that
 * the browser suite can see "the twenty-first client is refused" with two browsers. Nobody connected
 * is cut. Answers `{ clients }`, the limit in force. Development only, like the rest.
 */
export const devRoomLimits: Route = async (ctx) => {
  if (!ctx.config.dev) throw fail("not-found");
  const projectId = await owned(ctx);
  const body = await readJson(ctx, MAX_JSON_BYTES);
  if (body === undefined || "tooLong" in body) throw fail("request.invalid");
  const value = body.value;
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw fail("request.invalid");
  }
  const { clients } = (value ?? {}) as { clients?: unknown };
  if (clients !== undefined && clients !== null) {
    if (
      typeof clients !== "number" ||
      !Number.isInteger(clients) ||
      clients < 1 ||
      clients > CLOUD_LIMITS.clients
    ) {
      throw fail("request.invalid", `clients is a whole number from 1 to ${CLOUD_LIMITS.clients}.`);
    }
  }
  return json(
    await ctx.deps.rooms.limits(projectId, typeof clients === "number" ? { clients } : {}),
  );
};
