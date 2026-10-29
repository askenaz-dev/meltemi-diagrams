/**
 * The words of the account panel (`account-panel`): its sections, the identity service's data the
 * Worker reads on the person's behalf, and what each action says. The page's `en` catalog holds it
 * as `accountPanel`; `account-panel-es.ts` has the same entries in Spanish.
 */
export const accountPanel = {
  title: "Account",
  close: "Close",
  /** The names of the sections, as the tabs show them. */
  sections: {
    profile: "Profile",
    signins: "Sign-ins",
    devices: "Devices",
    tokens: "API tokens",
    usage: "Usage",
    administration: "Administration",
    danger: "Danger zone",
  },
  tabsLabel: "Sections of the account",

  // Profile
  profileIntro: "One Meltemi account signs you in to every Meltemi product.",
  emailsLabel: "Emails of your sign-ins",
  noEmail: "No email",
  handleTitle: "Publishing handle",
  handleIntro:
    "The first part of the address of every page you publish, as in meltemi.page/handle/page.",
  handleLabel: "Handle",
  handleHint: "3 to 30 lowercase letters, digits or hyphens.",
  handleSave: "Save",
  handleSaving: "Saving the handle…",
  handleSaved: (handle: string) => `Your handle is ${handle}.`,
  handleNone: "You have not chosen a handle yet: publishing asks for one the first time.",
  signOutTitle: "Sign out",
  signOutIntro: "Ends your session in this browser. Your work stays here.",
  accountIdTitle: "Account id",
  accountIdIntro:
    "What this service knows you by. An administrator may ask you for it to grant something to your account.",
  accountIdCopy: "Copy",
  accountIdCopied: "Copied.",
  accountIdSelect: "Select the id and copy it.",
  unbrandedTitle: "Exports without the Meltemi branding",
  unbrandedOn: "Your account may export without the Meltemi branding: the export dialog offers it.",

  // Sign-ins
  signinsIntro: "The accounts you sign in with. You need at least one.",
  provider: { github: "GitHub", google: "Google" } as Record<string, string>,
  verified: "Verified",
  linkedOn: (when: string) => `Linked ${when}`,
  unlink: "Unlink",
  unlinkLabel: (provider: string) => `Unlink ${provider}`,
  unlinkTitle: "Unlink the sign-in?",
  unlinkMessage: (provider: string) =>
    `You will no longer sign in with ${provider}. You can link it again at any time.`,
  unlinkConfirm: "Unlink",
  unlinked: (provider: string) => `${provider} was unlinked.`,
  onlySignin: "Your only sign-in. Link another before you unlink it.",
  linkTitle: "Link another sign-in",
  link: (provider: string) => `Link ${provider}`,
  linkHint:
    "You go to the provider and come back here. Your work is kept in this browser while you are away.",

  // Devices
  devicesIntro: "Where you are signed in to Meltemi.",
  thisDevice: "This device",
  signedInOn: (when: string) => `Signed in ${when}`,
  lastSeen: (when: string) => `Last seen ${when}`,
  signOutDevice: "Sign out",
  signOutDeviceLabel: (device: string) => `Sign out ${device}`,
  signOutDeviceTitle: "Sign out this device?",
  signOutDeviceMessage: (device: string) =>
    `${device} is signed out of Meltemi. It may keep working on this product for up to an hour.`,
  signOutDeviceConfirm: "Sign out the device",
  signedOutDevice: (device: string) => `${device} was signed out.`,
  signOutOthers: "Sign out of other devices",
  signOutOthersTitle: "Sign out of every other device?",
  signOutOthersMessage:
    "Every other browser where you are signed in is signed out. You stay signed in here.",
  signOutOthersConfirm: "Sign out of other devices",
  signedOutOthers: "You are signed out of every other device.",
  withinTheHour: "Other devices lose their session within the hour.",
  /** Joins the browser and the system of a device: "Edge on Windows". */
  deviceJoin: "on",
  otherBrowser: "Other browser",
  otherSystem: "other system",

  // Usage
  usageIntro: "What your account holds in the cloud, against its limits.",
  limitsTitle: "Limits",
  limits: {
    files: "Files in a project",
    documentBytes: "Size of a project",
    binaryBytes: "Size of an image or a font",
    versions: "Versions of a project",
  } as Record<string, string>,
  usageFailed: "The usage could not be read.",

  // Danger zone
  dangerTitle: "Delete your account",
  dangerBody:
    "Deleting your account removes it, its sign-ins and its sessions at the identity service, and this product deletes your projects, versions, tokens and published pages within seven days. It cannot be undone.",
  dangerHint:
    "You confirm it on the identity service's page, and come back here signed out. Your work in this browser stays.",
  deleteAccount: "Delete account",

  // Administration: owners and administrators, and an invitee
  administration: {
    intro: "Who administers Meltemi Diagrams, what accounts may do, and what was done.",
    owner: "Owner",
    administratorsTitle: "Administrators",
    since: (name: string, when: string) => `Invited by ${name}, administrator since ${when}`,
    remove: "Remove",
    removeLabel: (name: string) => `Remove ${name}`,
    removeTitle: "Remove the administrator?",
    removeMessage: (name: string) => `${name} stops administering the service at once.`,
    removeConfirm: "Remove",
    removed: (name: string) => `${name} no longer administers the service.`,
    leave: "Leave",
    leaveTitle: "Stop administering the service?",
    leaveMessage: "You stop at once. An owner can invite you again.",
    leaveConfirm: "Leave",
    left: "You no longer administer the service.",
    invitationsTitle: "Invitations",
    invitationsIntro:
      "Invite an email: the person signs in with it and chooses Accept. No mail is sent, so tell them.",
    email: "Email",
    invite: "Invite",
    invited: (email: string) => `${email} is invited for seven days.`,
    notEmail: "That is not an email address.",
    already: "That person administers the service already.",
    invitationsLimit: "Ten invitations are pending already: revoke one first.",
    administratorsLimit:
      "The service has twenty administrators already: ask an owner to remove one.",
    pending: (by: string, until: string) => `Invited by ${by}, open until ${until}`,
    noInvitations: "No invitation is pending.",
    revoke: "Revoke",
    revokeLabel: (email: string) => `Revoke the invitation of ${email}`,
    revoked: (email: string) => `The invitation of ${email} was revoked.`,
    permissionsTitle: "Permissions",
    permissions: {
      "unbranded-exports": {
        name: "Export without the Meltemi branding",
        description:
          "The export dialog offers to leave out the strip at the foot of the sheet: the mark, the wordmark and the title.",
      },
    } as Record<string, { name: string; description: string }>,
    implicit: "Owners and administrators hold every permission.",
    holders: "Accounts with it",
    noHolders: "No account has it.",
    grantedBy: (name: string, when: string) => `Granted by ${name}, ${when}`,
    grantTo: "Grant to",
    grantHint: "An account id, @handle or the email the person signs in with.",
    grant: "Grant",
    granted: (who: string, permission: string) => `${who}: ${permission}.`,
    revokePermissionLabel: (who: string) => `Revoke from ${who}`,
    revokedPermission: (who: string, permission: string) => `${who} no longer has ${permission}.`,
    noAccount:
      "No account signed in with this email, handle or id yet: ask the person to sign in once, or for the account id Profile shows.",
    ambiguous: "Several accounts signed in with this email: ask for the account id.",
    takedownTitle: "Take down a publication",
    takedownIntro:
      "Removes a published page at once, with the reason you give; its owner sees that the service removed it.",
    address: "Address",
    addressHint: (host: string) =>
      host === "" ? "handle/page" : `https://${host}/handle/page, or handle/page`,
    reason: "Reason",
    takedown: "Take down",
    notAddress: "That is not the address of a publication of this service.",
    takedownConfirmTitle: "Take down the publication?",
    takedownMessage: (address: string) =>
      `${address} stops answering at once. It cannot be undone; its owner may publish again.`,
    takedownConfirm: "Take down",
    takenDown: (address: string) => `${address} was taken down.`,
    noPublication: "There is no publication at that address.",
    logTitle: "Recent changes",
    noLog: "Nothing yet.",
    /** The entries of the log: who, to whom, and the permission or the publication. */
    log: {
      invite: (by: string, target: string) => `${by} invited ${target}`,
      "revoke-invitation": (by: string, target: string) =>
        `${by} revoked the invitation of ${target}`,
      accept: (by: string) => `${by} became an administrator`,
      decline: (by: string) => `${by} declined to administer`,
      remove: (by: string, target: string) => `${by} removed ${target}`,
      leave: (by: string) => `${by} stopped administering`,
      grant: (by: string, target: string, detail: string) => `${by} granted ${detail} to ${target}`,
      revoke: (by: string, target: string, detail: string) =>
        `${by} revoked ${detail} from ${target}`,
      takedown: (by: string, _target: string, detail: string) => `${by} took down ${detail}`,
    } as Record<string, (by: string, target: string, detail: string) => string>,
    deleted: "a deleted account",
    invitationTitle: "Invitation to administer",
    invitationBody: (name: string) =>
      `${name === "" ? "An owner" : name} invited you to administer Meltemi Diagrams.`,
    invitationPowers:
      "Administrators grant permissions to accounts and can take down any publication.",
    invitationUntil: (when: string) => `The invitation is open until ${when}.`,
    accept: "Accept",
    decline: "Decline",
    accepted: "You administer the service now.",
    declined: "You declined the invitation.",
    gone: "That invitation is no longer open.",
    loadFailed: "The administration could not be read.",
  },

  // The identity service, through this product
  loading: "Loading…",
  unavailable: "The identity service could not be reached.",
  tryAgain: "Try again",
  openPage: "Open the account page",
  identityLast: "This is your only sign-in. Link another before you unlink it.",
  sessionCurrent: "This is the device you are using. Sign out instead.",
  sessionGone: "That device was already signed out.",
  rateLimited: "Too many changes in a minute. Wait a little and try again.",
  unreachable: "The service could not be reached. Check the connection and try again.",
  failed: (message: string, code: string) => `${message} (${code})`,
  failedStatus: (status: number) => `The service answered with status ${status}.`,
};
