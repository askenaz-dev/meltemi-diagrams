// Who may open a project, and as what: ONE place, so that every route that reaches a project (the
// socket, the files, the metadata, the binaries, the versions, the thumbnail, sharing and the
// development tools) asks the same question and gets the same answer (`project-sharing`, "Link
// access and members" and "The role each route needs").
//
// What a person is to a project follows the matrix:
//
//   | link      | anonymous | signed in, not a member | member                              |
//   | private   | nothing   | nothing                 | viewer or editor, as given          |
//   | view      | viewer    | viewer                  | as given, never less than viewer    |
//   | edit      | viewer    | editor                  | as given, never less than editor    |
//
// and the owner is always the owner. A route says the role it needs (`read` is a viewer, `write` an
// editor, `manage` the owner) and `requireAccess` refuses, in this order: `404 project.not-found` when
// the person has no access at all (a private project does not reveal that it exists), `401
// auth.required` when they are anonymous and the link would give a signed-in person enough, so that
// the page can offer sign-in, and `403 access.denied` for any other role that falls short.

import type { Ctx } from "./context.js";
import { fail, type ApiError } from "./errors.js";
import { PROJECT_ID } from "./ids.js";
import type { LiveGrant } from "./rooms.js";
import type { LinkAccess, MemberRole, Project } from "./store/types.js";
import type { Principal } from "./types.js";

/** What a person is to a project. It is also what the room is told (`RoomRole`). */
export type Role = "owner" | "editor" | "viewer";

/** What a route needs: `read` is a viewer, `write` an editor and `manage` the owner. */
export type Need = "read" | "write" | "manage";

const RANK: Readonly<Record<Role, number>> = { viewer: 1, editor: 2, owner: 3 };
const NEEDS: Readonly<Record<Need, number>> = { read: 1, write: 2, manage: 3 };

/** The higher of two roles; either may be missing. */
function higher(a: Role | undefined, b: Role | undefined): Role | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * What the project's link gives to a person who is not its owner nor a member: nothing while it is
 * `private`, reading with `view`, and with `edit` writing for a signed-in person (editing costs
 * quota, so it needs an account) and reading for an anonymous one.
 */
export function linkRole(linkAccess: LinkAccess, signedIn: boolean): Role | undefined {
  if (linkAccess === "edit") return signedIn ? "editor" : "viewer";
  if (linkAccess === "view") return "viewer";
  return undefined;
}

/**
 * What the person is to the project, or undefined for nothing at all. `principal` is who asks, or
 * undefined for an anonymous caller (a cookie and a bearer token are the same here: both are a
 * signed-in person); `member` is the role they were given in the project, when they were given one.
 * A pure function of what it is given: it reads nothing, so every cell of the matrix is a test.
 */
export function access(
  project: Pick<Project, "ownerSub" | "linkAccess">,
  principal: Pick<Principal, "sub"> | undefined,
  member?: MemberRole,
): Role | undefined {
  if (principal !== undefined && principal.sub === project.ownerSub) return "owner";
  const given = principal === undefined ? undefined : member;
  return higher(given, linkRole(project.linkAccess, principal !== undefined));
}

/** What a person is to a project, and the project's row. */
export interface Access {
  readonly role: Role;
  readonly project: Project;
}

/**
 * The person's access to the project, or undefined: an id that cannot be a project's, a project
 * that does not exist and a project the person may not open all look the same, so that nobody
 * learns which projects exist. Anonymous callers are resolved too: a link may admit them.
 */
export async function resolveAccess(ctx: Ctx, projectId: string): Promise<Access | undefined> {
  if (!PROJECT_ID.test(projectId)) return undefined;
  const { store } = ctx.deps;
  const project = await store.projectById(projectId);
  if (!project) return undefined;
  const principal = ctx.principal;
  // Only a signed-in person who is not the owner can be a member.
  const member =
    principal !== undefined && principal.sub !== project.ownerSub
      ? await store.memberRole(projectId, principal.sub)
      : undefined;
  const role = access(project, principal, member);
  return role === undefined ? undefined : { role, project };
}

/** Who is asking, for a route that needs a person: `401 auth.required` for nobody. */
export function requirePrincipal(ctx: Ctx): Principal {
  if (!ctx.principal) throw fail("auth.required");
  return ctx.principal;
}

/** Whether a role is enough for what a route needs. */
export function suffices(role: Role, need: Need): boolean {
  return RANK[role] >= NEEDS[need];
}

/** The refusal of a person whose access is not enough, for the order the specification gives. */
function insufficient(project: Project, principal: Principal | undefined, need: Need): ApiError {
  // Signing in would help: the link would give a signed-in person enough (a `write` route on an
  // `edit` link). It never helps for `manage`, which the link cannot give.
  if (principal === undefined) {
    const signedIn = linkRole(project.linkAccess, true);
    if (signedIn !== undefined && suffices(signedIn, need)) return fail("auth.required");
  }
  return fail(
    "access.denied",
    need === "write"
      ? "You may only read this project."
      : "Only the owner of this project can do this.",
  );
}

/** What `requireAccess` answers: who asks, the project's id from the path and what they are to it. */
export interface Resolved<P> {
  readonly principal: P;
  readonly projectId: string;
  readonly access: Access;
}

/**
 * The access of the person asking to the project the path names (`:id`), for a route that needs the
 * role `need`; the refusals are the specification's, in its order. A route that needs `write` or
 * `manage` has a person (an anonymous caller is never more than a viewer), one that needs `read` may
 * have none when the link admits them.
 */
export function requireAccess(ctx: Ctx, need: "read"): Promise<Resolved<Principal | undefined>>;
export function requireAccess(ctx: Ctx, need: "write" | "manage"): Promise<Resolved<Principal>>;
export async function requireAccess(
  ctx: Ctx,
  need: Need,
): Promise<Resolved<Principal | undefined>> {
  const projectId = ctx.params["id"] ?? "";
  const resolved = await resolveAccess(ctx, projectId);
  if (!resolved) throw fail("project.not-found");
  if (!suffices(resolved.role, need)) throw insufficient(resolved.project, ctx.principal, need);
  // A role above `viewer` only comes with a person: this is the guard that keeps it so.
  if (need !== "read" && ctx.principal === undefined) throw fail("auth.required");
  return { principal: ctx.principal, projectId, access: resolved };
}

// A live session's token ----------------------------------------------------------------------------

/** A live session's token, as a query or a header carries it: 32 lowercase hexadecimal characters. */
export const LIVE_TOKEN = /^[0-9a-f]{32}$/;

/** The header a guest's page sends its session's token in, on the two reads that take it. */
export const LIVE_HEADER = "X-Meltemi-Live";

/** The role a live session gives whoever carries its token. */
export function sessionRole(grant: LiveGrant): Role {
  return grant.guestsEdit ? "editor" : "viewer";
}

/** What a read that takes the token resolved: the access as `requireAccess` gives it, and the token's grant. */
export interface LiveRead extends Resolved<Principal | undefined> {
  /**
   * What the token in `X-Meltemi-Live` is worth now: a grant, `null` when it is not current, and
   * undefined when the request carried none or nobody asked the room.
   */
  readonly live: LiveGrant | null | undefined;
}

/**
 * `requireAccess(ctx, "read")` for the two reads a live session's guest needs outside the room
 * (`live-sessions`, "What a guest reaches"): `GET /api/projects/:id` and the blobs. When the caller's
 * own access falls short (nothing at all: every access reads), a current token in `X-Meltemi-Live`
 * gives the session's role, asking the room whether it is current; a token that is not, or none, is
 * `404 project.not-found` as no access is. The room is never asked about a project the store does
 * not hold. With `report`, the room is asked even when the caller's own access suffices, so that the
 * project's answer can say whether the token is still current; a room that cannot answer then
 * leaves that unsaid. Every other route ignores the header.
 */
export async function requireReadWithLive(
  ctx: Ctx,
  options: { readonly report?: boolean } = {},
): Promise<LiveRead> {
  const projectId = ctx.params["id"] ?? "";
  const resolved = await resolveAccess(ctx, projectId);
  const header = ctx.request.headers.get(LIVE_HEADER) ?? undefined;
  if (header === undefined || (resolved && options.report !== true)) {
    if (!resolved) throw fail("project.not-found");
    return { principal: ctx.principal, projectId, access: resolved, live: undefined };
  }
  const project =
    resolved?.project ??
    (PROJECT_ID.test(projectId) ? await ctx.deps.store.projectById(projectId) : undefined);
  if (!project) throw fail("project.not-found");
  let grant: LiveGrant | null | undefined;
  if (!LIVE_TOKEN.test(header)) grant = null;
  else if (resolved) {
    try {
      grant = await ctx.deps.rooms.checkLive(projectId, header);
    } catch {
      grant = undefined;
    }
  } else grant = await ctx.deps.rooms.checkLive(projectId, header);
  if (!resolved) {
    if (!grant) throw fail("project.not-found");
    return {
      principal: ctx.principal,
      projectId,
      access: { role: sessionRole(grant), project },
      live: grant,
    };
  }
  const role = grant ? (higher(resolved.role, sessionRole(grant)) ?? resolved.role) : resolved.role;
  return { principal: ctx.principal, projectId, access: { role, project }, live: grant };
}
