// A project's live session, as its owner's page holds it (`live-sessions`, "The owner's controls"):
// the calls (`PUT`/`GET`/`DELETE /api/projects/:id/live`), what the page knows of the session now
// (the share dialog's section and the header's "Live · N guests" both read it), and how long it has
// left in words. The calls never throw: a failure is an `Outcome` like any other (`calls.ts`).

import { call, nothing, segment, timeOf, type Reader } from "./calls.js";
import { inPage, isObject, parseObject, type Fetch } from "./http.js";
import type { Outcome } from "./tokens.js";

/** A live session as the owner sees it. */
export interface LiveSession {
  readonly id: string;
  /** `<origin>/p/<id>?live=<token>`: the owner passes it on. */
  readonly link: string;
  readonly guestsEdit: boolean;
  /** ISO times. */
  readonly startedAt: string;
  readonly until: string;
  /** The connections the session admitted when the service answered. */
  readonly guests: number;
}

/** The owner's calls. */
export interface LiveApi {
  /** The session that is on, or null. */
  read(project: string): Promise<Outcome<LiveSession | null>>;
  /** Starts the session, or answers the one that is on applying `guestsEdit` when given. */
  start(project: string, guestsEdit?: boolean): Promise<Outcome<LiveSession>>;
  /** Ends the session; done whether or not one was on. */
  end(project: string): Promise<Outcome<null>>;
}

/** A live session of the service's shape, or undefined for anything that is not one. */
export function liveSessionOf(value: unknown): LiveSession | undefined {
  if (!isObject(value)) return undefined;
  const { id, link, guestsEdit, guests } = value;
  if (typeof id !== "string" || id === "" || typeof link !== "string" || link === "") {
    return undefined;
  }
  if (typeof guestsEdit !== "boolean") return undefined;
  const until = timeOf(value["until"]);
  if (until === "") return undefined;
  return {
    id,
    link,
    guestsEdit,
    startedAt: timeOf(value["startedAt"]),
    until,
    guests: typeof guests === "number" && Number.isSafeInteger(guests) && guests >= 0 ? guests : 0,
  };
}

const readSession: Reader<LiveSession> = (answer) => {
  const session = liveSessionOf(parseObject(answer.text));
  return session ? { value: session } : undefined;
};

/** `null` (no session on), or a session. */
const readMaybe: Reader<LiveSession | null> = (answer) => {
  if (answer.text.trim() === "null") return { value: null };
  return readSession(answer);
};

/** The calls of the page to `…/live`, relative to the page. */
export function liveApi(fetchFn: Fetch, location: Pick<Location, "href">): LiveApi {
  const page = location.href.replace(/#.*$/, "");
  const accept = { Accept: "application/json" };
  const at = (id: string) => inPage(page, `api/projects/${segment(id)}/live`);
  return {
    read: (id) => call(fetchFn, at(id), { headers: accept }, readMaybe),
    start: (id, guestsEdit) =>
      call(
        fetchFn,
        at(id),
        {
          method: "PUT",
          headers: { ...accept, "Content-Type": "application/json" },
          body: JSON.stringify(guestsEdit === undefined ? {} : { guestsEdit }),
        },
        readSession,
      ),
    end: (id) => call(fetchFn, at(id), { method: "DELETE", headers: accept }, nothing),
  };
}

/** How long is left until an ISO time, in whole hours and minutes; undefined once it is past. */
export function timeLeft(
  until: string,
  now: number,
): { readonly hours: number; readonly minutes: number } | undefined {
  const end = Date.parse(until);
  if (Number.isNaN(end) || end <= now) return undefined;
  const minutes = Math.floor((end - now) / 60_000);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** How long is left, in words ("23 h 59 min"); empty once it is past. */
export function leftText(
  until: string,
  now: number,
  words: { left(hours: number, minutes: number): string },
): string {
  const left = timeLeft(until, now);
  return left ? words.left(left.hours, left.minutes) : "";
}

/**
 * What the page knows of the live session of the project open: from the dialog that started,
 * changed or ended it, or from reading it when the owner opened the project. The header's chip and
 * the dialog's section listen to it.
 */
export class LiveSessions {
  private known: { readonly project: string; readonly session: LiveSession | null } | undefined;
  private readonly listeners = new Set<() => void>();

  /** The session of a project as the page last knew it: null for none, undefined for not known. */
  of(project: string | undefined): LiveSession | null | undefined {
    return project !== undefined && this.known?.project === project
      ? this.known.session
      : undefined;
  }

  /** What the page now knows of a project's session. */
  set(project: string, session: LiveSession | null): void {
    const before = this.known;
    if (before?.project === project && JSON.stringify(before.session) === JSON.stringify(session)) {
      return;
    }
    this.known = { project, session };
    this.notify();
  }

  /** The page left the project: nothing is known of any session. */
  forget(): void {
    if (this.known === undefined) return;
    this.known = undefined;
    this.notify();
  }

  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
