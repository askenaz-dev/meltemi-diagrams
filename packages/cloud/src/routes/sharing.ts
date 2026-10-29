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
import type { Ctx, Route } from "../context.js";
import { randomId } from "../crypto.js";
import { readEmail } from "../email.js";
import { fail } from "../errors.js";
import { MAX_JSON_BYTES, json } from "../http.js";
import type { DisconnectTarget } from "../rooms.js";
import { invitationExpiresAt } from "../store/retention.js";
import {
  MAX_MEMBERS,
  type Invitation,
  type LinkAccess,
  type Member,
  type MemberRole,
} from "../store/types.js";
import { projectJson, readObject } from "./projects.js";

const LINK_LEVELS: readonly LinkAccess[] = ["private", "view", "edit"];
const MEMBER_ROLES: readonly MemberRole[] = ["viewer", "editor"];

/** The shape of an invitation's token: 128 bits as 32 lowercase hexadecimal characters. */
const INVITATION_TOKEN = /^[0-9a-f]{32}$/;

/** How many times the cut of the sockets is tried before it is given up: a room that is reset or busy answers the next. */
const CUT_ATTEMPTS = 3;

/**
 * Cuts the sockets a change of access may have outdated. A room resolves what a connection may do once,
 * when it opens, so a person who was removed, demoted or promoted, or whom a narrower link no longer
 * admits, would otherwise keep writing (or watching) as before until their connection happened to end.
 * Cut, their page reconnects at once and the Worker resolves the role again: a removed person is refused,
 * a demoted one is a viewer, a promoted one an editor. The change itself is already made, so a room that
 * cannot be reached is no reason to answer it with an error: the cut is tried again a few times, and
 * after that it is logged. Answers whether the sockets were cut.
 */
export async function resolveAgain(
  ctx: Ctx,
  projectId: string,
  target: DisconnectTarget,
): Promise<boolean> {
  for (let attempt = 1; attempt <= CUT_ATTEMPTS; attempt++) {
    try {
      await ctx.deps.rooms.disconnect(projectId, target);
      return true;
    } catch {
      // Try again: a Durable Object that was reset answers the next call.
    }
  }
  console.warn("cloud: could not cut the sockets of a project whose access changed");
  return false;
}

function readMemberRole(value: unknown): MemberRole {
  const role = MEMBER_ROLES.find((candidate) => candidate === value);
  if (role === undefined) throw fail("request.invalid", "A role is viewer or editor.");
  return role;
}

/** A member as the owner sees them: with the email the person signed in with. */
function ownersMember(member: Member) {
  return {
    sub: member.sub,
    name: member.name,
    picture: member.picture,
    email: member.email,
    role: member.role,
    added_at: member.addedAt,
  };
}

/** A member as another member sees them: a name and a picture, and never an email. */
function peersMember(member: Member) {
  return { sub: member.sub, name: member.name, picture: member.picture, role: member.role };
}

/** An invitation as the owner sees it, with the link that carries its token. */
function invitationJson(ctx: Ctx, invitation: Invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    created_at: invitation.createdAt,
    expires_at: invitationExpiresAt(invitation.createdAt),
    link: `${ctx.config.origin}/p/${invitation.projectId}?invite=${invitation.token}`,
  };
}

/** The whole state of a project's sharing, which is the owner's to see. */
async function ownersState(ctx: Ctx, projectId: string, linkAccess: LinkAccess) {
  const { store, now } = ctx.deps;
  const [members, invitations] = await Promise.all([
    store.members(projectId),
    store.pendingInvitations(projectId, now().toISOString()),
  ]);
  return {
    linkAccess,
    role: "owner" as const,
    members: members.map(ownersMember),
    invitations: invitations.map((invitation) => invitationJson(ctx, invitation)),
  };
}

/**
 * `GET /api/projects/:id/sharing` (`read`: anyone the project's link admits, anonymous included):
 * `{ linkAccess, role }` for anyone; for a member also `members` (names, pictures, roles); for the
 * owner the full state, `{ linkAccess, role: "owner", members, invitations }`, the members with
 * their emails and the pending invitations with their links.
 */
export const getSharingRoute: Route = async (ctx) => {
  const { principal, projectId, access } = await requireAccess(ctx, "read");
  const { project, role } = access;
  if (role === "owner") return json(await ownersState(ctx, projectId, project.linkAccess));

  const seen = { linkAccess: project.linkAccess, role };
  const { store } = ctx.deps;
  // Only a person with a membership sees the others: a link gives a role, not a place among them.
  const member = principal ? await store.memberRole(projectId, principal.sub) : undefined;
  if (member === undefined) return json(seen);
  return json({ ...seen, members: (await store.members(projectId)).map(peersMember) });
};

/**
 * `PATCH /api/projects/:id/sharing { linkAccess }` (the owner's: `manage`): `private`, `view` or
 * `edit`. Answers the whole state, as `GET` does for the owner.
 */
export const patchSharingRoute: Route = async (ctx) => {
  const { projectId, access } = await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  const linkAccess = LINK_LEVELS.find((level) => level === body["linkAccess"]);
  if (linkAccess === undefined) {
    throw fail("request.invalid", "The link level is private, view or edit.");
  }
  const project = await ctx.deps.store.setLinkAccess(
    access.project.ownerSub,
    projectId,
    linkAccess,
  );
  if (!project) throw fail("project.not-found");
  // What the link gives is part of every other person's role: they meet the new level when they reconnect.
  if (project.linkAccess !== access.project.linkAccess) {
    await resolveAgain(ctx, projectId, { except: access.project.ownerSub });
  }
  return json(await ownersState(ctx, projectId, project.linkAccess));
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
  const { principal, projectId, access } = await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  const email = readEmail(body["email"]);
  const role = readMemberRole(body["role"]);

  const { store, now, randomBytes } = ctx.deps;
  const owner = await store.user(access.project.ownerSub);
  const own = [owner?.email, principal.via === "cookie" ? principal.profile.email : undefined];
  if (own.some((address) => address?.toLowerCase() === email)) {
    throw fail("request.invalid", "You are the owner of this project; there is nothing to invite.");
  }

  const at = now().toISOString();
  const waiting = (await store.pendingInvitations(projectId, at)).find((i) => i.email === email);
  if (waiting) {
    if (waiting.role !== role) await store.setInvitationRole(projectId, waiting.id, role);
    return json(invitationJson(ctx, { ...waiting, role }));
  }

  const invitation = {
    id: randomId(randomBytes),
    projectId,
    email,
    role,
    token: randomId(randomBytes),
    createdBy: principal.sub,
    createdAt: at,
  };
  const outcome = await store.createInvitation(invitation, MAX_MEMBERS);
  if (outcome === "quota") throw fail("quota.members");
  if (outcome === "missing") throw fail("project.not-found");
  return json(invitationJson(ctx, { ...invitation, acceptedAt: null }), 201);
};

/** `PATCH /api/projects/:id/members/:sub { role }` (the owner's): changes a member's role. `404` for a person who is not a member. */
export const patchMemberRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  const sub = ctx.params["sub"] ?? "";
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  const role = readMemberRole(body["role"]);
  const { store } = ctx.deps;
  if (!(await store.setMemberRole(projectId, sub, role))) {
    throw fail("not-found", "There is no such member.");
  }
  const member = (await store.members(projectId)).find((held) => held.sub === sub);
  if (!member) throw fail("not-found", "There is no such member.");
  await resolveAgain(ctx, projectId, { sub });
  return json(ownersMember(member));
};

/** `DELETE /api/projects/:id/members/:sub` (the owner's): removes a member. `204`; `404` for a person who is not one. */
export const removeMemberRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  const sub = ctx.params["sub"] ?? "";
  if (!(await ctx.deps.store.removeMember(projectId, sub))) {
    throw fail("not-found", "There is no such member.");
  }
  await resolveAgain(ctx, projectId, { sub });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
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
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};

/**
 * `GET /api/projects/:id/invitations` (the owner's: `manage`, so `403 access.denied` for anyone else,
 * a link-only viewer included): `{ invitations }`, the pending ones with their links and the day they
 * expire, the earliest first. Expired and accepted invitations are not listed.
 */
export const listInvitationsRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  const { store, now } = ctx.deps;
  const invitations = await store.pendingInvitations(projectId, now().toISOString());
  return json({ invitations: invitations.map((invitation) => invitationJson(ctx, invitation)) });
};

/** `DELETE /api/projects/:id/invitations/:invitation` (the owner's): revokes a pending invitation. `204`; `404` when there is none. */
export const revokeInvitationRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  const id = ctx.params["invitation"] ?? "";
  if (!(await ctx.deps.store.deleteInvitation(projectId, id))) {
    throw fail("not-found", "There is no such invitation.");
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
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
