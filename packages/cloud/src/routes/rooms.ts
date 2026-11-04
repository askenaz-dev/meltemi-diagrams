import { CLOUD_LIMITS, guestNumber } from "@meltemi/diagrams-project";
import { requireAccess, requirePrincipal, resolveAccess } from "../access.js";
import type { Ctx, Route } from "../context.js";
import { BLOB_HASH } from "../document.js";
import { errorResponse, fail } from "../errors.js";
import { MAX_JSON_BYTES, MAX_PUSH_BYTES, json, originOf, readCappedBytes } from "../http.js";
import { PROJECT_ID } from "../ids.js";
import { resolvePrincipal } from "../principal.js";
import { GUEST_PREFIX, parsePush, type RoomIdentity } from "../rooms.js";
import { resolveAgain } from "./sharing.js";

/** The id a browser without an account made once and keeps: 32 lowercase hexadecimal characters. */
const GUEST_ID = /^[0-9a-f]{32}$/;
/** The longest name a person without an account may give, in characters. */
export const MAX_GUEST_NAME = 40;
/** What a name may not hold: control characters, line and paragraph separators, lone surrogates. */
const UNSHOWABLE = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

/**
 * The name a person without an account gave (`?name=`), trimmed: 1 to 40 characters with nothing
 * unshowable in it, else undefined (the default name is used).
 */
export function guestName(value: string | null): string | undefined {
  if (value === null) return undefined;
  const name = value.trim();
  const length = Array.from(name).length;
  if (length === 0 || length > MAX_GUEST_NAME || UNSHOWABLE.test(name)) return undefined;
  return name;
}

/** The name of a person without an account who gave none: "Guest NN", as the page names them. */
export function defaultGuestName(id: string): string {
  return `Guest ${guestNumber(id)}`;
}

/**
 * `GET /rooms/<id>`: the page's socket to a project's room (`cloud-document`, "The room's protocol";
 * `live-sessions`, "Joining with the link"). It answers only an upgrade (anything else is the
 * Worker's JSON 404, whoever asks), then, in this order: who is asking, from the cookie alone (a
 * bearer token is not taken on the socket); where the upgrade comes from, which must be this
 * service's own page (`403 request.forbidden`: a socket is a `GET`, so the `Origin` rule of the
 * changing routes does not cover it); and what the person is to the project. Nothing and no
 * `?live=` token is `404 project.not-found`; with a token the project must exist (a room is never
 * made for an id the store does not hold) and the room checks the token itself, answering 404 when
 * it is not its current session's. A person with no account connects as a guest: `?guest=` is the id
 * their browser made (`400 request.invalid` for another shape) and `?name=` their name (the default
 * one when it is empty, longer than 40 characters or holds control characters); without a token
 * they are a viewer, as the project's link admits them.
 *
 * The room then gets a request the Worker constructs, with the identity, the role, the token and
 * the client's address in headers only the Worker sets: nothing the browser sent is forwarded.
 */
export const roomSocket: Route = async (ctx) => {
  if (ctx.request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return errorResponse(fail("not-found"));
  }
  // The credentials the socket takes are the cookie's: nothing else of the request is consulted.
  const cookie = ctx.request.headers.get("Cookie");
  const resolved = await resolvePrincipal(
    new Request(ctx.url, { headers: cookie ? { Cookie: cookie } : {} }),
    ctx.deps,
    ctx.config,
  );
  const principal = resolved?.via === "cookie" ? resolved : undefined;
  if (originOf(ctx.request) !== ctx.config.origin) throw fail("request.forbidden");

  const projectId = ctx.params["id"] ?? "";
  const query = ctx.url.searchParams;
  const live = query.get("live") ?? undefined;
  const access = await resolveAccess({ ...ctx, principal }, projectId);
  if (!access) {
    // Nothing of the person's own: only a token can let them in, and only to a project that exists.
    if (live === undefined) throw fail("project.not-found");
    if (!PROJECT_ID.test(projectId) || !(await ctx.deps.store.projectById(projectId))) {
      throw fail("project.not-found");
    }
  }
  // Where the connection comes from: connections without an account are counted by it.
  const address = ctx.request.headers.get("CF-Connecting-IP") ?? "";
  const from = address !== "" ? { address } : {};
  let identity: RoomIdentity;
  if (principal) {
    identity = {
      sub: principal.sub,
      role: access?.role ?? "viewer",
      name: principal.profile.name,
      picture: principal.profile.picture,
      ...from,
    };
  } else {
    const guest = query.get("guest") ?? "";
    if (!GUEST_ID.test(guest)) {
      throw fail("request.invalid", "A connection without an account needs its browser's id.");
    }
    identity = {
      sub: `${GUEST_PREFIX}${guest}`,
      // Whatever the link gives an anonymous person, they only look without a session's token.
      role: "viewer",
      name: guestName(query.get("name")) ?? defaultGuestName(guest),
      picture: "",
      guest: true,
      ...from,
    };
  }
  const response = await ctx.deps.rooms.connect(projectId, ctx.request, identity, live);
  if (!access) return response;
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
  if (role !== access.role && !(await resolveAgain(ctx, projectId, { sub: identity.sub }))) {
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
 * is the snapshot an anonymous viewer of a `view` or `edit` link reads when the room does not answer
 * its socket. A live session's token is not taken here: a guest has the room.
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
