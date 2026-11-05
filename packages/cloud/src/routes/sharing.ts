// Sharing a project (`project-sharing`): the link level, the members and the invitations. Who may do
// what is `access.ts`'s (a route states the role it needs); what is kept is the store's. This file is
// the requests and the shape of the answers, which are decided by who asks:
//
//   - the owner (`manage`) sees everything and changes it: `GET`/`PATCH …/sharing`, `POST …/members`
//     (an invitation), `PATCH`/`DELETE …/members/:sub`, `GET …/invitations`, `DELETE …/invitations/:id`;
//   - a member sees `{ linkAccess, role, members }`, the members with their names and pictures and
//     never an email, and may leave (`DELETE …/members/me`);
//   - anyone else the link admits (a viewer, anonymous or not) sees `{ linkAccess, role }` and nothing
//     of the people: no member, no invitation, so that a `view` link never yields an invitation from
//     which an editor could be made.
//
// An invitation is made by the owner for an email and a role. It does not send mail: it answers its
// link, `<origin>/p/<id>?invite=<token>`, which the owner passes on; and it becomes a membership when
// that email signs in verified (`GET /api/session`) or when a signed-in person opens the link
// (`POST /api/invitations/:token/accept`). The token is kept in clear and shown to the owner alone,
// whenever they list the pending invitations (see `migrations/0003_sharing.sql`).

import { access as accessOf, requireAccess, requirePrincipal } from "../access.js";
import type { Route } from "../context.js";
import { fail } from "../errors.js";
import { MAX_JSON_BYTES, json } from "../http.js";
import {
  getSharing,
  invite,
  listInvitations,
  removeMember,
  revokeInvitation,
  resolveAgain,
  setLinkAccess,
  setMemberRole,
} from "../operations/sharing.js";
import { projectJson, readObject } from "./projects.js";

export { resolveAgain } from "../operations/sharing.js";

/** The shape of an invitation's token: 128 bits as 32 lowercase hexadecimal characters. */
const INVITATION_TOKEN = /^[0-9a-f]{32}$/;

/** The answer of a route that changed something and has nothing to say. */
const done = (): Response =>
  new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * `GET /api/projects/:id/sharing` (`read`: anyone the project's link admits, anonymous included):
 * `{ linkAccess, role }` for anyone; for a member also `members` (names, pictures, roles); for the
 * owner the full state, `{ linkAccess, role: "owner", members, invitations }`, the members with
 * their emails and the pending invitations with their links.
 */
export const getSharingRoute: Route = async (ctx) =>
  json(await getSharing(ctx, ctx.params["id"] ?? ""));

/**
 * `PATCH /api/projects/:id/sharing { linkAccess }` (the owner's: `manage`): `private`, `view` or
 * `edit`. Answers the whole state, as `GET` does for the owner.
 */
export const patchSharingRoute: Route = async (ctx) => {
  await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  return json(await setLinkAccess(ctx, ctx.params["id"] ?? "", body));
};

/**
 * `POST /api/projects/:id/members { email, role }` (the owner's: `manage`): records an invitation for
 * that email as `viewer` or `editor` and answers it, with its link: `201`. No mail is sent. Asking
 * again for an email whose invitation is still pending changes its role and answers the same
 * invitation (`200`); asking for the email of someone who is already a member is an invitation like
 * any other, which accepted never lowers their role (the owner lowers a role with `PATCH
 * …/members/:sub`). The owner cannot invite themselves (`400`), a malformed email or role is `400
 * request.invalid`, and the 51st member or pending invitation is `413 quota.members`.
 */
export const inviteRoute: Route = async (ctx) => {
  await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  const { invitation, created } = await invite(ctx, ctx.params["id"] ?? "", body);
  return json(invitation, created ? 201 : 200);
};

/** `PATCH /api/projects/:id/members/:sub { role }` (the owner's): changes a member's role. `404` for a person who is not a member. */
export const patchMemberRoute: Route = async (ctx) => {
  await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  return json(await setMemberRole(ctx, ctx.params["id"] ?? "", ctx.params["sub"] ?? "", body));
};

/** `DELETE /api/projects/:id/members/:sub` (the owner's): removes a member. `204`; `404` for a person who is not one. */
export const removeMemberRoute: Route = async (ctx) => {
  await removeMember(ctx, ctx.params["id"] ?? "", ctx.params["sub"] ?? "");
  return done();
};

/**
 * `DELETE /api/projects/:id/members/me`: the caller leaves the project. It needs a membership: `404`
 * when the project is not theirs to see, `401` for an anonymous caller the link admits, `403` for the
 * owner (who deletes the project instead) and `404 not-found` for someone who is not a member (a link
 * gives a role, not a membership). `204`.
 */
export const leaveRoute: Route = async (ctx) => {
  const { principal, projectId, access } = await requireAccess(ctx, "read");
  if (!principal) throw fail("auth.required");
  if (access.role === "owner") {
    throw fail("access.denied", "The owner cannot leave the project; delete it instead.");
  }
  if (!(await ctx.deps.store.removeMember(projectId, principal.sub))) {
    throw fail("not-found", "You are not a member of this project.");
  }
  await resolveAgain(ctx, projectId, { sub: principal.sub });
  return done();
};

/**
 * `GET /api/projects/:id/invitations` (the owner's: `manage`, so `403 access.denied` for anyone else,
 * a link-only viewer included): `{ invitations }`, the pending ones with their links and the day they
 * expire, the earliest first. Expired and accepted invitations are not listed.
 */
export const listInvitationsRoute: Route = async (ctx) =>
  json(await listInvitations(ctx, ctx.params["id"] ?? ""));

/** `DELETE /api/projects/:id/invitations/:invitation` (the owner's): revokes a pending invitation. `204`; `404` when there is none. */
export const revokeInvitationRoute: Route = async (ctx) => {
  await revokeInvitation(ctx, ctx.params["id"] ?? "", ctx.params["invitation"] ?? "");
  return done();
};

/**
 * `POST /api/invitations/:token/accept`: the signed-in person opens an invitation link and becomes a
 * member with its role, whatever their email (the link is the proof). Answers the project as `GET
 * /api/projects/:id` does, with the role the person now has. `404 invite.invalid` for a token that
 * is unknown, already used or older than thirty days, and `401` for nobody. The project's owner
 * opening their own link is answered with their project and leaves the invitation pending. A person
 * who already is a member keeps the higher of the two roles: an invitation raises, never lowers.
 */
export const acceptInvitationRoute: Route = async (ctx) => {
  const principal = requirePrincipal(ctx);
  const token = ctx.params["token"] ?? "";
  if (!INVITATION_TOKEN.test(token)) throw fail("invite.invalid");

  const { store, now } = ctx.deps;
  const at = now().toISOString();
  const invitation = await store.pendingInvitationByToken(token, at);
  if (!invitation) throw fail("invite.invalid");
  const project = await store.projectById(invitation.projectId);
  if (!project) throw fail("invite.invalid");
  if (project.ownerSub === principal.sub) return json(projectJson(project, "owner"));

  const accepted = await store.acceptInvitation(token, principal.sub, at);
  // Another person used the link between the read and the write.
  if (!accepted) throw fail("invite.invalid");
  const role = accessOf(project, principal, accepted.role) ?? accepted.role;
  return json(projectJson(project, role));
};
