// The operations of sharing a project (`project-sharing`): the link level, the members and the
// invitations. Who may do what is `access.ts`'s (an operation states the role it needs); what is kept
// is the store's. The routes (`routes/sharing.ts`) read the request and call these; the MCP tools
// call the same functions. What an answer shows is decided by who asks:
//
//   - the owner (`manage`) sees everything and changes it;
//   - a member sees `{ linkAccess, role, members }`, the members with their names and pictures and
//     never an email;
//   - anyone else the link admits (a viewer, anonymous or not) sees `{ linkAccess, role }` and nothing
//     of the people, so that a `view` link never yields an invitation from which an editor could be made.
//
// An invitation does not send mail: it answers its link, `<origin>/p/<id>?invite=<token>`, which the
// owner passes on. The token is kept in clear and shown to the owner alone.

import { requireProjectAccess } from "../access.js";
import type { OpCtx, Unchecked } from "../context.js";
import { randomId } from "../crypto.js";
import { readEmail } from "../email.js";
import { fail } from "../errors.js";
import type { DisconnectTarget } from "../rooms.js";
import { invitationExpiresAt } from "../store/retention.js";
import {
  MAX_MEMBERS,
  type Invitation,
  type LinkAccess,
  type Member,
  type MemberRole,
} from "../store/types.js";

const LINK_LEVELS: readonly LinkAccess[] = ["private", "view", "edit"];
const MEMBER_ROLES: readonly MemberRole[] = ["viewer", "editor"];

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
  ctx: Pick<OpCtx, "deps">,
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

export function readMemberRole(value: unknown): MemberRole {
  const role = MEMBER_ROLES.find((candidate) => candidate === value);
  if (role === undefined) throw fail("request.invalid", "A role is viewer or editor.");
  return role;
}

/** A member as the owner sees them: with the email the person signed in with. */
export function ownersMember(member: Member) {
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
export function invitationJson(ctx: Pick<OpCtx, "config">, invitation: Invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    created_at: invitation.createdAt,
    expires_at: invitationExpiresAt(invitation.createdAt),
    link: `${ctx.config.origin}/p/${invitation.projectId}?invite=${invitation.token}`,
  };
}

export type InvitationJson = ReturnType<typeof invitationJson>;

/** The whole state of a project's sharing, which is the owner's to see. */
async function ownersState(ctx: OpCtx, projectId: string, linkAccess: LinkAccess) {
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
 * The sharing state (`read`: anyone the project's link admits, anonymous included): `{ linkAccess,
 * role }` for anyone; for a member also `members` (names, pictures, roles); for the owner the full
 * state, `{ linkAccess, role: "owner", members, invitations }`, the members with their emails and the
 * pending invitations with their links.
 */
export async function getSharing(ctx: OpCtx, projectId: string) {
  const { principal, access } = await requireProjectAccess(ctx, projectId, "read");
  const { project, role } = access;
  if (role === "owner") return ownersState(ctx, projectId, project.linkAccess);

  const seen = { linkAccess: project.linkAccess, role };
  const { store } = ctx.deps;
  // Only a person with a membership sees the others: a link gives a role, not a place among them.
  const member = principal ? await store.memberRole(projectId, principal.sub) : undefined;
  if (member === undefined) return seen;
  return { ...seen, members: (await store.members(projectId)).map(peersMember) };
}

/** The level of the project's link (the owner's: `manage`): `private`, `view` or `edit`. Answers the whole state. */
export async function setLinkAccess(
  ctx: OpCtx,
  projectId: string,
  input: Unchecked<{ linkAccess: LinkAccess }>,
) {
  const { access } = await requireProjectAccess(ctx, projectId, "manage");
  const linkAccess = LINK_LEVELS.find((level) => level === input.linkAccess);
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
  return ownersState(ctx, projectId, project.linkAccess);
}

/**
 * Records an invitation for an email as `viewer` or `editor` (the owner's: `manage`) and answers it,
 * with its link; `created` says whether it is new (`201`) or the pending invitation of that email,
 * whose role was changed (`200`). No mail is sent. The owner cannot invite themselves (`400`), a
 * malformed email or role is `400 request.invalid`, and the 51st member or pending invitation is
 * `413 quota.members`.
 */
export async function invite(
  ctx: OpCtx,
  projectId: string,
  input: Unchecked<{ email: string; role: MemberRole }>,
): Promise<{ invitation: InvitationJson; created: boolean }> {
  const { principal, access } = await requireProjectAccess(ctx, projectId, "manage");
  const email = readEmail(input.email);
  const role = readMemberRole(input.role);

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
    return { invitation: invitationJson(ctx, { ...waiting, role }), created: false };
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
  return { invitation: invitationJson(ctx, { ...invitation, acceptedAt: null }), created: true };
}

/** Changes a member's role (the owner's). `404` for a person who is not a member. */
export async function setMemberRole(
  ctx: OpCtx,
  projectId: string,
  sub: string,
  input: Unchecked<{ role: MemberRole }>,
) {
  await requireProjectAccess(ctx, projectId, "manage");
  const role = readMemberRole(input.role);
  const { store } = ctx.deps;
  if (!(await store.setMemberRole(projectId, sub, role))) {
    throw fail("not-found", "There is no such member.");
  }
  const member = (await store.members(projectId)).find((held) => held.sub === sub);
  if (!member) throw fail("not-found", "There is no such member.");
  await resolveAgain(ctx, projectId, { sub });
  return ownersMember(member);
}

/** Removes a member (the owner's). `404` for a person who is not one. */
export async function removeMember(ctx: OpCtx, projectId: string, sub: string): Promise<void> {
  await requireProjectAccess(ctx, projectId, "manage");
  if (!(await ctx.deps.store.removeMember(projectId, sub))) {
    throw fail("not-found", "There is no such member.");
  }
  await resolveAgain(ctx, projectId, { sub });
}

/**
 * The pending invitations (the owner's: `manage`, so `403 access.denied` for anyone else, a link-only
 * viewer included), with their links and the day they expire, the earliest first.
 */
export async function listInvitations(ctx: OpCtx, projectId: string) {
  await requireProjectAccess(ctx, projectId, "manage");
  const { store, now } = ctx.deps;
  const invitations = await store.pendingInvitations(projectId, now().toISOString());
  return { invitations: invitations.map((invitation) => invitationJson(ctx, invitation)) };
}

/** Revokes a pending invitation (the owner's). `404` when there is none. */
export async function revokeInvitation(ctx: OpCtx, projectId: string, id: string): Promise<void> {
  await requireProjectAccess(ctx, projectId, "manage");
  if (!(await ctx.deps.store.deleteInvitation(projectId, id))) {
    throw fail("not-found", "There is no such invitation.");
  }
}
