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
