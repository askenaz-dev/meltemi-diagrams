// The Worker's answers to the sharing tools (`mcp-server`, "Sharing through the tools"): the link
// level, the members and the invitations of a project, over the operations of `operations/sharing.ts`.
// Each needs the role its route needs (sharing is the owner's, reading the state anybody's the link
// admits) and the `sharing` scope. An invitation sends no email: its answer says so, and carries the
// link the person passes on.

import { TOOLS, projectLink } from "@meltemi/diagrams-mcp";
import {
  getSharing,
  invite,
  listInvitations,
  removeMember,
  revokeInvitation,
  setLinkAccess,
  setMemberRole,
} from "../operations/sharing.js";
import { implement, type AnyImplementation } from "./tool.js";

const getSharingTool = implement(TOOLS.get_sharing, async (session, { project }) => {
  return { structured: await getSharing(session.op, project) };
});

const setLinkAccessTool = implement(TOOLS.set_link_access, async (session, { project, level }) => {
  const state = await setLinkAccess(session.op, project, { linkAccess: level });
  return { structured: { ...state, link: projectLink(session.op.config.origin, project) } };
});

const inviteTool = implement(TOOLS.invite, async (session, { project, email, role }) => {
  const { invitation, created } = await invite(session.op, project, { email, role });
  const { link, ...rest } = invitation;
  return { structured: { invitation: rest, link, emailSent: false as const, created } };
});

const listInvitationsTool = implement(TOOLS.list_invitations, async (session, { project }) => {
  return { structured: await listInvitations(session.op, project) };
});

const revokeInvitationTool = implement(
  TOOLS.revoke_invitation,
  async (session, { project, invitation }) => {
    await revokeInvitation(session.op, project, invitation);
    return { structured: { revoked: true as const } };
  },
);

const setMemberRoleTool = implement(
  TOOLS.set_member_role,
  async (session, { project, member, role }) => {
    return { structured: await setMemberRole(session.op, project, member, { role }) };
  },
);

const removeMemberTool = implement(TOOLS.remove_member, async (session, { project, member }) => {
  await removeMember(session.op, project, member);
  return { structured: { removed: true as const } };
});

export const SHARING_TOOLS: readonly AnyImplementation[] = [
  getSharingTool,
  setLinkAccessTool,
  inviteTool,
  listInvitationsTool,
  revokeInvitationTool,
  setMemberRoleTool,
  removeMemberTool,
];
