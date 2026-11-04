import { plural } from "@meltemi/diagrams-i18n";

/**
 * The words of the share dialog (`project-sharing`): the link level, the project's link, the people,
 * the invitations and leaving. The page's `en` catalog holds it as `cloud.sharing`;
 * `cloud-share-es.ts` has the same entries in Spanish.
 */
export const sharing = {
  title: "Share",
  loading: "Loading who has access…",
  tryAgain: "Try again",

  /** The project's link: everybody sees it and may copy it. */
  linkLabel: "Link to the project",
  linkHint: "Opens the project in the playground.",
  copy: "Copy",
  copyLinkLabel: "Copy the link to the project",
  linkCopied: "The link to the project was copied.",
  selectIt: "Select the link and copy it.",

  /** The owner's choice of who the link admits: three options, one sentence each. */
  levelLegend: "Who can open the link",
  changingLevel: "Changing who can open the link…",
  levels: {
    private: {
      label: "Only the people listed",
      text: "Only the people listed below can open the project.",
      done: "Only the people listed can open the project now.",
    },
    view: {
      label: "Anyone with the link can view",
      text: "Anyone with the link can see and play the diagrams, signed in or not, but not change them.",
      done: "Anyone with the link can view the project now.",
    },
    edit: {
      label: "Anyone signed in with the link can edit",
      text: "Anyone who opens the link signed in can edit the project; anyone else can view it.",
      done: "Anyone signed in with the link can edit the project now.",
    },
  },

  /** What a person is to the project. */
  roles: { owner: "Owner", editor: "Can edit", viewer: "Can view" },
  youAre: {
    owner: "You own this project.",
    editor: "You can edit this project.",
    viewer: "You can view this project but not change it.",
  },

  /** The people the owner added by name. */
  peopleTitle: "People",
  noPeople: "No one else has been added yet.",
  count: (held: number, most: number) => `${held} of ${most} people and invitations`,
  you: "you",
  unnamed: "Someone",
  roleOf: (name: string) => `Role of ${name}`,
  changingRole: "Changing the role…",
  roleChanged: (name: string, role: string) => `Changed the role of ${name} to “${role}”.`,
  remove: "Remove",
  removeLabel: (name: string) => `Remove ${name}`,
  removeTitle: "Remove this person?",
  removeMessage: (name: string) =>
    `${name} loses the access they were given by name. If the link admits them, they keep what it gives.`,
  removeConfirm: "Remove",
  removing: "Removing…",
  removed: (name: string) => `Removed ${name}.`,
  gone: "That person or invitation was already gone. The list is up to date.",

  /** Inviting by email: no mail is sent, the owner passes the link on. */
  inviteTitle: "Invite someone",
  emailLabel: "Email address",
  emailEmpty: "Enter the person's email address.",
  emailInvalid: "That is not an email address.",
  roleLabel: "Role",
  inviteButton: "Invite",
  inviteHint:
    "No email is sent. You get a link to pass on; the person gets this access when they open it signed in, or when they sign in with this address.",
  inviting: "Creating the invitation…",
  invited: (email: string) =>
    `Invitation created for ${email}. No email was sent: copy its link and send it yourself.`,
  invitedAgain: (email: string, role: string) =>
    `${email} already had an invitation. It now gives “${role}”; its link is below.`,
  revealLabel: (email: string) => `Invitation for ${email}`,
  revealNote: "No email was sent. Copy this link and send it yourself.",

  /** The invitations that wait. */
  pendingTitle: "Pending invitations",
  noPending: "No pending invitations.",
  expires: (when: string) => `Expires ${when}`,
  copyInvitation: "Copy link",
  copyInvitationLabel: (email: string) => `Copy the link of the invitation for ${email}`,
  invitationCopied: "The invitation link was copied.",
  revoke: "Revoke",
  revokeLabel: (email: string) => `Revoke the invitation for ${email}`,
  revoking: "Revoking…",
  revoked: (email: string) => `Revoked the invitation for ${email}.`,

  /** A member leaves. */
  leaveTitle: "Leave this project",
  leaveHint:
    "You lose the access you were given by name. If the link admits you, you keep what it gives.",
  leave: "Leave",
  leaveConfirmTitle: "Leave the project?",
  leaveMessage: (name: string) =>
    `${name} goes from your projects. You can open it again only if the owner invites you or its link admits you.`,
  leaveConfirm: "Leave the project",
  leaving: "Leaving…",
  left: "You left the project.",

  /** The entry that opens the publish dialog. */
  publishTitle: "Publish",
  publishText:
    "Publish the project's diagrams as a web page anyone can open: the same page as the HTML catalog.",
  publishButton: "Publish…",

  /** What the service refuses in sharing, beyond what every cloud call says. */
  errors: {
    quotaMembers: (most: number) =>
      `A project holds at most ${most} people and pending invitations together. Remove someone or revoke an invitation first.`,
    requestInvalid: "The service did not accept that. Check the email address and the role.",
    inviteInvalid: "That invitation is not valid any more.",
    accessDenied: "Only the owner of the project can change who has access.",
  },
};

/** The words of the publish dialog (`publishing`): the handle, the page's name, the address and what is published. */
export const publishing = {
  title: "Publish",
  intro:
    "Publishes the project's diagrams as a web page anyone can open: the same page as the HTML catalog download. Publish again to update it.",
  loading: "Loading what is published…",
  tryAgain: "Try again",
  close: "Close",
  defaultSlug: "project",

  /** Your handle: part of every address you publish, chosen the first time. */
  handleLabel: "Handle",
  handleHint:
    "Part of the address of every page you publish: 3 to 30 lowercase letters, digits or hyphens. It cannot change while you have a published page.",
  handleEmpty: "Choose a handle.",
  handleShort: (least: number) => `The handle takes at least ${least} characters.`,
  handleLong: (most: number) => `The handle takes at most ${most} characters.`,
  handleChars: "Use only lowercase letters, digits and hyphens.",
  handleTaken: "That handle is already taken. Try another.",
  handleInvalid: "The service did not accept that handle.",
  handleLocked: "Your handle cannot change while you have published pages.",
  /** Under the address, for a person who already has a handle: where it changes. */
  handleInAccount: (handle: string) => `Your handle is ${handle}; change it in Account.`,
  choosingHandle: "Choosing your handle…",

  /** The page's name: the last part of its address. */
  slugLabel: "Page name",
  slugHint: "The last part of the address: lowercase letters, digits and hyphens, up to 60.",
  slugEmpty: "Give the page a name.",
  slugLong: (most: number) => `The name takes at most ${most} characters.`,
  slugChars: "Use only lowercase letters, digits and hyphens.",
  addressEnd: (handle: string, slug: string) => `The address ends in /${handle}/${slug}/`,

  /** Publishing. */
  publishButton: "Publish",
  building: "Building the page…",
  uploading: "Publishing…",
  published: (slug: string) => `Published ${slug}.`,
  skipped: (count: number) =>
    `${count} ${plural("en", count, { one: "diagram", other: "diagrams" })} could not be drawn and ${plural("en", count, { one: "is", other: "are" })} left out.`,
  addressLabel: (slug: string) => `Address of ${slug}`,
  copy: "Copy",
  copyLabel: (slug: string) => `Copy the address of ${slug}`,
  copied: "The address was copied.",
  selectIt: "Select the address and copy it.",
  open: "Open",
  openLabel: (slug: string) => `Open ${slug} in a new tab`,

  /** What the project has published. */
  listTitle: "Published pages",
  listLabel: "Pages published from this project",
  none: "Nothing is published from this project yet.",
  publishedAt: (when: string) => `Published ${when}`,
  republish: "Publish again",
  republishLabel: (slug: string) => `Publish ${slug} again`,
  unpublish: "Unpublish",
  unpublishLabel: (slug: string) => `Unpublish ${slug}`,
  unpublishTitle: "Unpublish this page?",
  unpublishMessage: (slug: string) =>
    `${slug} stops being available at its address. You can publish it again later.`,
  unpublishConfirm: "Unpublish",
  unpublishing: "Unpublishing…",
  unpublished: (slug: string) => `Unpublished ${slug}.`,
  gone: (slug: string) => `${slug} was not published any more.`,

  /** A publication the service took down. */
  removedTitle: "Removed by the service",
  removedByService: (slug: string, when: string) =>
    when === ""
      ? `${slug}: removed by the service.`
      : `${slug}: removed by the service on ${when}.`,
  removedReason: (reason: string) => `Reason: ${reason}`,

  /** What the service refuses in publishing, and what stops the page before it asks. */
  errors: {
    tooLarge: (mebibytes: number) =>
      `The page is over ${mebibytes} MiB, the most the service takes. Remove some images or diagrams and try again.`,
    rate: "This project was published too many times in the last hour. Try again later.",
    taken: "Another of your projects already publishes a page with that name. Choose another name.",
    invalid: "The service did not accept the page.",
    accessDenied: "Only the owner of the project can publish it.",
    handleRequired: "Choose a handle first.",
    nothing: "The project has no diagrams to publish.",
    buildFailed: "The page could not be built.",
  },
};
