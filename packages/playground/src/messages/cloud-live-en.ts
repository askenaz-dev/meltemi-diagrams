import { plural } from "@meltemi/diagrams-i18n";

/**
 * The words of live sessions (`live-sessions`): what joining by a session's link says, the guest bar
 * of a person without an account, what a guest cannot do without one, the owner's section of the
 * share dialog and the header's "Live" chip. The `cloud` catalog holds it as `live`;
 * `cloud-live-es.ts` has the same entries in Spanish.
 */
export const live = {
  /** The name of a person without an account who gave none: NN is two digits from their browser's id. */
  guestName: (n: number) => `Guest ${n}`,
  /** The badge beside a guest in the header, on carets and on the canvas. */
  guestBadge: "Guest",
  guestBadgeTitle: "Joined without an account",

  /** What opening says. */
  joined: (name: string, editing: boolean) =>
    editing
      ? `You joined the live session of ${name}: edit it together with the others.`
      : `You joined the live session of ${name}: watch it as the others edit.`,
  ended: "The live session ended.",
  endedViewing: (name: string) =>
    `The live session ended. You keep following ${name} live, without editing.`,
  endedFrozen:
    "The live session ended. What you see stays here, read-only: make a copy to keep working on it.",
  limited:
    "Too many people without an account are connected from this network. Close another tab of this project, or sign in, and open the link again.",
  /** An anonymous visitor the room did not answer in time reads a copy of the files instead. */
  snapshot: (name: string) =>
    `${name} opened from a copy, because the project did not answer in time. It may be old: reload to see changes.`,

  /** The bar under the header, for a person without an account in a project. */
  bar: {
    label: "Live session",
    guest: (project: string) => `You are in the live session of ${project} as`,
    visitor: (project: string) => `You are following ${project} live as`,
    nameLabel: "Your name",
    nameHint: "Others see this name beside your cursor.",
    rename: "Change name",
    renamed: (name: string) => `Others see you as ${name} now.`,
    nameInvalid: "A name has 1 to 40 characters, with no control characters.",
    copy: "Make a copy",
    copyTitle: "Copy this project's files into this browser as a project of your own",
    signIn: "Sign in",
    signInTitle: "Sign in to keep a copy in your projects, add images and keep versions",
    ends: (left: string) => `Ends in ${left}`,
  },

  /** What a person without an account cannot do, with the way to it. */
  needsAccount: {
    images: "Adding images and fonts needs an account. Sign in to add them.",
    versions: "Versions need an account. Sign in to keep versions of your own copy.",
    share: "Sharing needs an account. Sign in to share a copy of your own.",
    publish: "Publishing needs an account. Sign in to publish a copy of your own.",
  },

  /** The owner's section of the share dialog. */
  section: {
    title: "Live session",
    off: "Let anyone with a link join this project and edit it with you as you type, with or without an account, for up to 24 hours.",
    start: "Start a live session",
    starting: "Starting the live session…",
    started: "The live session is on. Pass its link on to whoever should join.",
    guestsEdit: "Guests can edit",
    guestsEditHint: "Turn it off to let guests only watch.",
    linkLabel: "Live session link",
    linkHint: "Anyone with this link joins while the session lasts. It stops working when it ends.",
    copy: "Copy link",
    copyLabel: "Copy the live session's link",
    copied: "Live session link copied.",
    guestsNow: (count: number) =>
      `${count} ${plural("en", count, { one: "guest", other: "guests" })} now`,
    ends: (left: string) => `Ends in ${left}`,
    end: "End session",
    endTitle: "End the live session?",
    endMessage:
      "Everyone who joined by its link leaves the project now, and the link stops working. Members keep their access.",
    endConfirm: "End session",
    ending: "Ending the live session…",
    endedDone: "The live session ended.",
    changing: "Changing what guests can do…",
    nowEdit: "Guests can edit now.",
    nowView: "Guests can only watch now.",
    loading: "Reading the live session…",
  },

  /** How long is left, in words: hours and minutes. */
  left: (hours: number, minutes: number) =>
    hours > 0 ? `${hours} h ${minutes} min` : minutes > 0 ? `${minutes} min` : "less than a minute",

  /** The header's chip while a live session is on, for the owner. */
  chip: (guests: number) =>
    `Live · ${guests} ${plural("en", guests, { one: "guest", other: "guests" })}`,
  chipTitle: "A live session is on. Open the share dialog to see its link or end it.",

  /** The anonymous project's `#p=` dialog. */
  anonymous: {
    text: "A live session, where others edit with you as you type, needs the project in an account.",
    save: "Save to my projects",
    signIn: "Sign in to start one",
  },
};
