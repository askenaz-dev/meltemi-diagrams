// What the page decides when it opens a project by its link (`project-sharing`, "Viewing by link";
// `playground-cloud`, "Opening a project by address"), without a DOM or a call, so that a test walks
// every case: which mode a role gives, and what the status line says about the invitation and
// about a project that was not found.

import type { en } from "../messages/en.js";
import type { StatusWords } from "./status.js";

/** The words of viewing a project by its link, in a language. */
export type ViewWords = (typeof en)["viewing"];

/**
 * The status line's words for a viewer's connection, in the shape the connection's status draws
 * with (`statusText`, `announcement`): a viewer follows the room and keeps nothing, so none of
 * them speaks of saving or of this browser keeping the project.
 */
export function viewerStatusWords(words: ViewWords["status"]): StatusWords {
  return {
    label: words.label,
    connecting: words.connecting,
    connected: words.connected,
    saving: words.connected,
    reconnecting: () => words.reconnecting,
    offline: () => words.offline,
    notKept: "",
    notKeptShort: "",
    synced: words.synced,
    dropped: words.dropped,
    gone: words.gone,
    full: words.full,
    retry: words.retry,
  };
}

/** What a person is to a project. The service says it (`GET /api/projects/:id`, the room's hello). */
export type Role = "owner" | "editor" | "viewer";

/** The role a text names, or undefined for anything else. */
export function roleOf(value: unknown): Role | undefined {
  return value === "owner" || value === "editor" || value === "viewer" ? value : undefined;
}

/**
 * How a project opens:
 * - `edit`: the normal page, bound to the room; an `editor` works as the owner does, minus the
 *   actions only the owner has (rename, delete, share), which the projects drawer leaves out.
 * - `view-live`: view mode, connected to the room as a viewer (a signed-in person's quota is theirs
 *   to spend, and a room is cheap to follow).
 * - `view-snapshot`: view mode on the files as they were when the page opened, with no socket and
 *   nothing kept in this browser (nobody is signed in; the reload hint tells when to look again).
 */
export type Opening = "edit" | "view-live" | "view-snapshot";

/** The mode a person gets for a role: nobody signed in can only look, whatever the role says. */
export function openingFor(signedIn: boolean, role: Role): Opening {
  if (!signedIn) return "view-snapshot";
  return role === "viewer" ? "view-live" : "edit";
}

/** Whether an opening is view mode. */
export function viewsOnly(opening: Opening): boolean {
  return opening !== "edit";
}

/** A snapshot is offered a reload once the page has been open this long. */
export const STALE_AFTER_MS = 5 * 60_000;

/** What came of accepting the invitation the address carries. */
export type Acceptance =
  /** Nothing to accept: no invitation, or nobody signed in to accept it. */
  | "none"
  | "accepted"
  /** `404 invite.invalid`: unknown, expired or used. */
  | "invalid"
  /** `401`: the cookie is gone. */
  | "signed-out"
  /** The service could not be reached or refused for another reason: said as any failure is. */
  | "failed";

/** How opening the project ended. */
export type LinkOutcome = "opened" | "not-found" | "failed";

/** A sentence of the status line about an address; `ViewWords` has the words. */
export type LinkNotice =
  "inviteAccepted" | "inviteInvalid" | "signInToAccept" | "notFound" | "notFoundSignIn";

export interface LinkFacts {
  /** Whether a person is signed in on the page. */
  readonly signedIn: boolean;
  /** The `invite` the address carries, if any. */
  readonly invite: string | undefined;
  readonly acceptance: Acceptance;
  readonly outcome: LinkOutcome;
}

/**
 * What the status line says after an address was opened, in order. The invitation is the person's
 * business and said first when it is not valid; a project that was not found offers sign-in when
 * nobody is signed in; an anonymous person holding an invitation is told to sign in whether or
 * not the link shows them anything (that is what the invitation is for, and saying so reveals
 * nothing the address did not). A failure of the service is worded by the caller, so it has none.
 */
export function linkNotices(facts: LinkFacts): LinkNotice[] {
  const { signedIn, invite, acceptance, outcome } = facts;
  if (outcome === "failed") return [];
  if (!signedIn) {
    if (invite !== undefined) return ["signInToAccept"];
    return outcome === "not-found" ? ["notFoundSignIn"] : [];
  }
  const notices: LinkNotice[] = [];
  if (invite !== undefined) {
    if (acceptance === "signed-out") return ["signInToAccept"];
    if (acceptance === "invalid") notices.push("inviteInvalid");
    else if (acceptance === "accepted" && outcome === "opened") notices.push("inviteAccepted");
  }
  if (outcome === "not-found") notices.push("notFound");
  return notices;
}

/** The notices as one text, in the language of `words`. `name` and `role` word an accepted invitation. */
export function noticeText(
  notices: readonly LinkNotice[],
  words: ViewWords,
  accepted: { readonly name: string; readonly role: string },
): string {
  return notices
    .map((notice) =>
      notice === "inviteAccepted"
        ? words.inviteAccepted(accepted.name, accepted.role)
        : words[notice],
    )
    .join(" ");
}
