// The sharing tools (`mcp-server`, "Sharing through the tools"): the link level, the members and the
// invitations of a project. Each needs the role its route needs (sharing is the owner's, reading the
// state anybody's the link admits) and the `sharing` scope. An invitation sends no email: its answer
// says so, and carries the link the person passes on.

import * as z from "zod";
import { define } from "../serve.js";
import { projectArg, roleSchema } from "../shapes.js";

const linkAccessSchema = z.enum(["private", "view", "edit"]);
const memberRoleSchema = z.enum(["viewer", "editor"]);

const memberSchema = z.object({
  sub: z.string(),
  name: z.string(),
  picture: z.string(),
  email: z.string().optional().describe("Shown to the owner only."),
  role: memberRoleSchema,
  added_at: z.string().optional(),
});

const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  created_at: z.string(),
  expires_at: z.string(),
  link: z.string().describe("The link that accepts the invitation: give it to the person invited."),
});

const sharingSchema = z.object({
  linkAccess: linkAccessSchema,
  role: roleSchema,
  members: z.array(memberSchema).optional(),
  invitations: z.array(invitationSchema).optional(),
});

/** The tools of this file, by name, in the catalogue's order. */
export const SHARING_TOOLS = {
  get_sharing: define({
    name: "get_sharing",
    title: "Get sharing",
    description:
      "Who the project is shared with: its link level (private, view or edit), the account's role, and for the owner the members with their emails and the pending invitations with their links.",
    scope: "sharing",
    input: z.object({ project: projectArg }),
    output: sharingSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  set_link_access: define({
    name: "set_link_access",
    title: "Set link access",
    description:
      "What the project's link gives whoever opens it (the owner's): private (only members), view (anybody may read) or edit (a signed-in person may edit, anybody may read). Answers the sharing state and the link.",
    scope: "sharing",
    input: z.object({ project: projectArg, level: linkAccessSchema }),
    output: sharingSchema.extend({ link: z.string().describe("The project's link.") }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  invite: define({
    name: "invite",
    title: "Invite",
    description:
      "Invites an email address to the project as viewer or editor (the owner's). No email is sent: the answer holds the invitation's link, which the person invited opens signed in (or which becomes their membership when they sign in with that email verified). Asking again for a pending invitation changes its role.",
    scope: "sharing",
    input: z.object({
      project: projectArg,
      email: z.string().describe("The address of the person invited."),
      role: memberRoleSchema,
    }),
    output: z.object({
      invitation: invitationSchema.omit({ link: true }),
      link: z.string().describe("The invitation's link, to pass on."),
      emailSent: z.literal(false).describe("Always false: the service sends no email."),
      created: z.boolean().describe("False when a pending invitation of that email was answered."),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  list_invitations: define({
    name: "list_invitations",
    title: "List invitations",
    description:
      "The project's pending invitations, with their links and the day they expire (the owner's).",
    scope: "sharing",
    input: z.object({ project: projectArg }),
    output: z.object({ invitations: z.array(invitationSchema) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  revoke_invitation: define({
    name: "revoke_invitation",
    title: "Revoke an invitation",
    description: "Revokes a pending invitation (the owner's): its link no longer works.",
    scope: "sharing",
    input: z.object({
      project: projectArg,
      invitation: z.string().describe("The invitation's id."),
    }),
    output: z.object({ revoked: z.literal(true) }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  set_member_role: define({
    name: "set_member_role",
    title: "Set a member's role",
    description: "Makes a member of the project a viewer or an editor (the owner's).",
    scope: "sharing",
    input: z.object({
      project: projectArg,
      member: z.string().describe("The member's sub, as get_sharing lists it."),
      role: memberRoleSchema,
    }),
    output: memberSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  remove_member: define({
    name: "remove_member",
    title: "Remove a member",
    description:
      "Removes a member from the project (the owner's); their open pages lose it at once.",
    scope: "sharing",
    input: z.object({ project: projectArg, member: z.string().describe("The member's sub.") }),
    output: z.object({ removed: z.literal(true) }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
} as const;
