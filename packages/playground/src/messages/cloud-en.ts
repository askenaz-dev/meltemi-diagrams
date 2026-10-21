import { list, plural } from "@meltemi/diagrams-i18n";
import { publishing, sharing } from "./cloud-share-en.js";

/**
 * The words of the cloud projects (`cloud-projects`): the drawer, the versions panel, the
 * connection's status line, what the service and the room refuse, and what opening a project says.
 * The page's `en` catalog holds it as `cloud`; `cloud-es.ts` has the same entries in Spanish.
 */
export const cloud = {
  /** The header's "Projects" entry and the drawer it opens. */
  projects: {
    button: "Projects",
    buttonTitle: "Your projects in the cloud",
    title: "Projects",
    intro:
      "Your cloud projects belong to your account: they open on every device, and what you edit offline merges when you are back.",
    loading: "Loading your projects…",
    listLabel: "Your projects",
    none: "You have no cloud projects yet. Create one, or save the project you have open.",
    count: (held: number, most: number) => `${held} of ${most} projects`,
    updated: (when: string) => `Changed ${when}`,
    neverChanged: "Not changed yet",
    open: (name: string) => `Open ${name}`,
    openNow: "Open now",
    tryAgain: "Try again",
    close: "Close",

    newTitle: "New project",
    newName: "Name",
    newNameHint: "From 1 to 100 characters.",
    newTemplate: "Start from",
    newCreate: "Create the project",
    defaultName: "Untitled",
    nameEmpty: "Give the project a name.",
    nameLong: (most: number) => `The name takes at most ${most} characters.`,
    nameControl: "The name cannot hold control characters.",
    creating: (name: string) => `Creating ${name}…`,
    created: (name: string) => `Created ${name}.`,

    saveButton: "Save this project to the cloud",
    saveHint:
      "Copies the project you have open into your account and opens the copy. The project in this browser stays as it is.",
    saveTitle: "Save to the cloud",
    saveLabel: "Name of the cloud project",
    saveName: "Local project",
    saving: (name: string) => `Saving ${name} to the cloud…`,
    uploading: (path: string, done: number, total: number) =>
      `Uploading ${path} (${done} of ${total})…`,
    saved: (name: string) => `Saved ${name} to the cloud.`,
    notSaved: (name: string) =>
      `${name} could not be saved completely, so it was not kept in the cloud. The project in this browser is as it was.`,

    localButton: "Open the local project",
    localHint:
      "Goes back to the project this browser keeps. The cloud project stays in your account.",
    openedLocal: "Opened the project this browser keeps.",

    rename: (name: string) => `Rename ${name}`,
    renameTitle: "Rename the project",
    renameLabel: "New name",
    renamed: (name: string) => `Renamed the project to ${name}.`,
    duplicate: (name: string) => `Duplicate ${name}`,
    duplicated: (name: string) => `Made a copy: ${name}.`,
    delete: (name: string) => `Delete ${name}`,
    deleteTitle: "Delete the project?",
    deleteMessage: (name: string) =>
      `${name} is removed from your account with its versions. This cannot be undone.`,
    deleteConfirm: "Delete the project",
    deleted: (name: string) => `Deleted ${name}.`,
    copyLink: (name: string) => `Copy the link to ${name}`,
    linkTitle: "Link to the project",
    linkLabel: "Link",
    linkHint: "Only you can open it for now. It opens the project in this page.",
    linkCopied: "The link to the project was copied.",
    linkSelect: "Select the link and copy it.",
    thumbnailOf: (name: string) => `Preview of ${name}`,
  },

  /**
   * The account menu's usage: what the account holds against its limits. The projects line is
   * `projects.count`; the sizes are written by the page (`formatBytes`) in the page's language.
   */
  usage: {
    label: "Usage",
    storage: (used: string, most: string) => `${used} of ${most} used`,
  },

  /** The versions panel: a project's versions, naming the current state, and restoring one. */
  versions: {
    button: "Versions",
    buttonTitle: "Versions of this project",
    title: "Versions",
    intro:
      "A version keeps the project's files as they are now. Name one before a risky change. Restoring a version keeps the state you leave as an automatic version.",
    close: "Close",
    loading: "Loading the versions…",
    listLabel: "Versions of this project",
    none: "No versions yet. Name this version to keep the project as it is.",
    tryAgain: "Try again",
    count: (held: number, most: number) => `${held} of ${most} versions`,

    nameTitle: "Name this version",
    nameLabel: "Name",
    nameHint: (most: number) =>
      `Up to ${most} characters. Leave it empty to keep a version with no name.`,
    nameButton: "Name this version",
    nameLong: (most: number) => `The name takes at most ${most} characters.`,
    nameControl: "The name cannot hold control characters.",
    creating: "Saving the version…",
    created: (number: number, label: string | null) =>
      label === null ? `Saved version ${number}.` : `Saved version ${number}: ${label}.`,

    number: (number: number) => `Version ${number}`,
    automatic: "Automatic",
    unnamed: "No name",
    changed: (count: number) =>
      count === 0
        ? "No files changed"
        : `${count} ${plural("en", count, { one: "file", other: "files" })} changed`,
    changedMore: (count: number) => `and ${count} more`,

    restore: "Restore",
    restoreLabel: (number: number) => `Restore version ${number}`,
    restoreTitle: "Restore this version?",
    restoreMessage: (number: number, when: string) =>
      `The project's files become those of version ${number}, from ${when}. The state you have now is kept as an automatic version, so you can come back to it.`,
    restoreConfirm: "Restore the version",
    restoring: (number: number) => `Restoring version ${number}…`,
    restored: (number: number) =>
      `Restored version ${number}. The state before it is in the list as an automatic version.`,
  },

  /** The share dialog and the publish dialog (`cloud-share-en.ts`). */
  sharing,
  publishing,

  /** The connection of the open project, in the status line. */
  status: {
    label: "Cloud project",
    connecting: "Connecting to the cloud…",
    connected: "Saved to the cloud",
    saving: "Saving…",
    reconnecting: (kept: boolean): string =>
      kept
        ? "Reconnecting… your changes are kept in this browser"
        : "Reconnecting… keep this page open so your changes are not lost",
    offline: (kept: boolean): string =>
      kept
        ? "Offline: your changes are kept in this browser and sync when you are back"
        : "Offline: this browser cannot keep your changes, so keep this page open until you are back",
    notKept: "This browser will not keep the project offline.",
    notKeptShort: "Not kept offline in this browser.",
    synced: "Back online: your changes are saved.",
    dropped: "The connection was lost. Reconnecting…",
    gone: "Deleted from the cloud",
    full: (most: number) => `Room full: ${most} people are in this project. Trying again…`,
    retry: "Try again",
  },

  /** What the service and the room refuse, in words; the same words serve both. */
  errors: {
    unreachable: "The service could not be reached. Check the connection and try again.",
    unexpected: "The service answered something the page cannot read.",
    signedOut: "You are signed out. Reload the page and sign in again.",
    notFound: "The project was not found.",
    versionNotFound: "That version was not found.",
    quotaProjects: (most: number) =>
      `Your account holds at most ${most} projects. Delete one you no longer use, then try again.`,
    quotaStorage: (mebibytes: number) =>
      `Your account has used its ${mebibytes} MiB of storage. Delete a project or a file, then try again.`,
    quotaFiles: (most: number) => `A project holds at most ${most} files.`,
    quotaBinary: (mebibytes: number) => `An image or a font takes at most ${mebibytes} MiB.`,
    quotaVersions: (most: number) =>
      `A project keeps at most ${most} versions, and this one is full. Versions with no name are thinned out by themselves; named ones are kept.`,
    docTooLarge: (mebibytes: number, characters: string) =>
      `The project is over its size limit: ${mebibytes} MiB in all, and ${characters} characters in one file.`,
    messageTooLarge: (kibibytes: number) =>
      `A single change is over ${kibibytes} KiB. Make it in smaller steps.`,
    pathInvalid:
      "A file name is not allowed in a cloud project: use a relative path with no .., no segment starting with a dot, and no backslash or colon.",
    blobUnknown: "A file the project mentions has not been uploaded.",
    docInvalid: "The change does not fit the shape of a project.",
    binaryInvalid:
      "That file is not an image or a font the service takes (PNG, JPEG, GIF, WebP, SVG, WOFF2, TTF or OTF).",
    versionsRate: "Versions are made too quickly. Wait a minute and try again.",
    thumbnailRate: "Previews are updated too quickly.",
    accessDenied: "You cannot change this project.",
    roomFull: (most: number) =>
      `${most} people are connected to this project already. The page keeps trying.`,
    failed: (message: string, code: string) => `${message} (${code})`,
    failedStatus: (status: number) => `The service answered with status ${status}.`,
    other: (code: string) => `The room refused the change (${code}).`,
  },

  /** A change the room refused: what it says, and what the page did about it. */
  refusal: {
    undone: (reason: string) =>
      `${reason} Your last change was not kept: the project is back as the room has it.`,
  },

  /** Opening a project, from the drawer or from the address. */
  open: {
    opening: "Opening the project…",
    opened: (name: string) => `Opened ${name}.`,
    openedOffline: "Opened the project from this browser. You are offline.",
    notFound:
      "The project was not found, or it is not yours to open. The project of this browser is open instead.",
    failed: "The project could not be opened. Check the connection and try again.",
    signInToOpen: "This link opens a project in the cloud. Sign in to open it.",
    unavailable: "The project could not be loaded from the cloud.",
    full: (most: number) =>
      `This project's room is full: ${most} people are in it already. Open the project again in a moment to join.`,
  },

  /** Things the open project reports. */
  project: {
    // The smaller file id keeps the name, which nobody sees: the words say that one of them does.
    collisions: (shown: readonly string[]) =>
      shown.length === 1
        ? `Two files had the same name: one keeps it and the other is shown as ${list("en", shown)}.`
        : `Some files had the same name: for each name one file keeps it and the others are shown as ${list("en", shown)}.`,
    binaryUnsupported: (path: string) => `${path} cannot be stored in this project.`,
    binaryUpload: (path: string, reason: string) => `${path} was not uploaded: ${reason}`,
    binaryFetch: (path: string) => `${path} could not be downloaded from the cloud.`,
    gone: "This project was deleted from your account, or it is no longer shared with you. The page stops reconnecting and keeps what it has: download the project to keep a copy, because it can no longer be saved to the cloud.",
    pathInvalid: (path: string) => `${path} is not a file name a cloud project accepts.`,
    internal:
      "Something went wrong while keeping your changes in step. Reload the page if the project looks wrong.",
    savedShortcut: "Saved to the cloud. Download the project to keep a copy elsewhere.",
    templateSubject: (name: string) => `The ${name} template`,
    replaceConfirm: (what: string) =>
      `${what} replaces the files of this project in the cloud. Download the project first if you want a copy.`,
  },
};
