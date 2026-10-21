/**
 * The words of viewing a project by its link (`project-sharing`, "Viewing by link"): the header's
 * badge and its copies, what opening by link says (not found, an invitation), the reload hint, and
 * the connection of a viewer. The page's `en` catalog holds it as `viewing`; `cloud-view-es.ts`
 * has the same entries in Spanish.
 */
export const viewing = {
  /** The header's group while a shared project is open to view. */
  group: "Shared project",
  badge: "View only",
  badgeTitle: "You can look at this project, play it and export it, but not change it.",
  copy: "Make a copy",
  copyTitle: "Copy this project's files into this browser as a project of your own",
  save: "Save a copy to my projects",
  saveTitle: "Copy this project into your account and open the copy",
  /** In the status bar, once the page has been open for a while on a snapshot. */
  staleHint: "This page has been open for a while, so the project may have changed.",
  reload: "Reload to see changes",
  reloaded: "Reloaded the project.",

  /** What opening says. */
  opened: (name: string) =>
    `Opened ${name} to view: you can look at it, play it and export it, but not change it.`,
  openedLive: (name: string) =>
    `Opened ${name} to view. Changes by other people appear here as they are made.`,
  notFound: "The project was not found.",
  notFoundSignIn:
    "The project was not found. If it was shared with you, sign in and open the link again.",
  signInToAccept: "Sign in to accept the invitation to this project.",
  inviteInvalid: "This invitation is not valid.",
  inviteAccepted: (name: string, role: string): string =>
    role === "viewer"
      ? `Invitation accepted: you can view ${name}.`
      : `Invitation accepted: you can edit ${name}.`,

  /** What a refused edit says (the controls are also off; a key or a stale tab may still try). */
  readOnly: "This project is view-only. Make a copy to change it.",
  nothingToSave:
    "This project is view-only, so there is nothing to save. Make a copy to keep a version of your own.",

  /** Make a copy: replaces the project this browser keeps, after asking when that is work. */
  copyConfirmTitle: "Replace the project in this browser?",
  copyConfirmMessage:
    "The copy replaces the project this browser keeps. That project stays available as the previous one, from the Templates menu.",
  copyConfirm: "Make the copy",
  copied: (name: string) => `Made a copy of ${name} in this browser. You can edit it now.`,
  /** The button was pressed while the project's files were still on their way. */
  copyLoading: "The project is still opening. Make the copy when its files are here.",
  savingCopy: (name: string) => `Saving a copy of ${name} to your projects…`,
  savedCopy: (name: string) => `Saved a copy of ${name} to your projects and opened it.`,

  /** The person's role in the open project changed (it is opened again in the mode it gives). */
  access: {
    nowViewer: "Your access changed: you can view this project but not change it.",
    nowEditor: "Your access changed: you can edit this project now.",
  },

  /** In the projects drawer, on a project somebody else owns. */
  sharedAs: (role: string): string =>
    role === "viewer" ? "Shared with you: view only" : "Shared with you: you can edit",

  /** The connection of a viewer, in the status line: it follows the room and keeps nothing. */
  status: {
    label: "Shared project",
    connecting: "Connecting to the project…",
    connected: "Following live",
    reconnecting: "Reconnecting… you see the last version meanwhile",
    offline: "Offline: you see the last version, and changes appear when you are back",
    synced: "Back online: you see the latest version.",
    dropped: "The connection was lost. Reconnecting…",
    gone: "This project is no longer available to you",
    full: (most: number) => `Room full: ${most} people are in this project. Trying again…`,
    retry: "Try again",
  },
};
