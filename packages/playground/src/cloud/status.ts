// The status line's view of an open cloud project: connected and saved, saving, offline, or
// reconnecting (and "connecting" until the room has answered once). Pure functions: the open
// project feeds them what it knows, the page draws the text.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { en } from "../messages/en.js";

/** The words of the connection's status, in a language. */
export type StatusWords = (typeof en)["cloud"]["status"];

export type ConnectionState =
  | "connecting"
  | "connected"
  | "saving"
  | "reconnecting"
  | "offline"
  | "full"
  | "gone"
  /** The live session that let this page in ended (`live-sessions`): it does not reconnect with it. */
  | "ended"
  /** This network holds as many connections without an account as a room takes: no retry by itself. */
  | "limited";

export interface ConnectionStatus {
  readonly state: ConnectionState;
  /** Whether this browser keeps the project (IndexedDB works); false says it will not be kept offline. */
  readonly kept: boolean;
}

/** What the open project knows about its connection. */
export interface ConnectionInputs {
  /** The socket: opening, open (the room said hello), or closed and waiting for its next try. */
  readonly socket: "connecting" | "open" | "waiting";
  /** Whether the room has said hello at least once since the project was opened. */
  readonly everOpen: boolean;
  /** Whether the browser says it is online. */
  readonly online: boolean;
  /** Whether the person's last changes are on their way (sent a moment ago, or not yet). */
  readonly saving: boolean;
  readonly kept: boolean;
  /** The project was deleted (the room closed with 4404): the connection stopped for good. */
  readonly gone?: boolean;
  /** The room refused the last socket because it holds as many people as it may (`room.full`). */
  readonly full?: boolean;
  /** The room stopped the connection for good: the session ended, or the network is full. */
  readonly stopped?: "session.ended" | "connections.limit";
}

/**
 * The state a project's connection is in. A socket the room has answered shows saved or saving;
 * one that is not open shows offline when the browser says so, else reconnecting, or full when the
 * room turned it away for holding as many people as it may; before the room has answered once the
 * page says it is connecting; and a project that was deleted says so, for nothing will connect
 * again.
 */
export function connectionStatus(input: ConnectionInputs): ConnectionStatus {
  const { socket, everOpen, online, saving, kept } = input;
  if (input.gone) return { state: "gone", kept };
  if (input.stopped === "session.ended") return { state: "ended", kept };
  if (input.stopped === "connections.limit") return { state: "limited", kept };
  let state: ConnectionState;
  if (socket === "open") state = saving ? "saving" : "connected";
  else if (!online) state = "offline";
  else if (input.full) state = "full";
  else state = socket === "waiting" || everOpen ? "reconnecting" : "connecting";
  return { state, kept };
}

/** The status line's text for a status. */
export function statusText(status: ConnectionStatus, words: StatusWords): string {
  const { state, kept } = status;
  if (state === "gone") return words.gone;
  if (state === "ended") return words.ended;
  if (state === "limited") return words.limited;
  if (state === "full") return words.full(CLOUD_LIMITS.clients);
  if (state === "reconnecting") return words.reconnecting(kept);
  if (state === "offline") return words.offline(kept);
  const text = words[state];
  // Where nothing can be kept, even a saved project says so: closing the page while offline loses
  // what the room has not got.
  return kept ? text : `${text} ${words.notKeptShort}`;
}

/** Whether two statuses are the same, to draw only what changed. */
export function sameStatus(
  a: ConnectionStatus | undefined,
  b: ConnectionStatus | undefined,
): boolean {
  return a?.state === b?.state && a?.kept === b?.kept;
}

const down = (state: ConnectionState) => state === "reconnecting" || state === "offline";

/**
 * What to tell a screen reader when a status changes, or undefined: only the moments that matter,
 * the connection dropping and coming back, and never the flicker between saving and saved.
 */
export function announcement(
  before: ConnectionStatus | undefined,
  after: ConnectionStatus,
  words: StatusWords,
): string | undefined {
  if (!before) return undefined;
  // A deleted project never comes back: that is said once, whatever it was doing before; and so
  // are a live session's end and a network that holds as many connections as it may.
  if (after.state === "gone") return before.state === "gone" ? undefined : words.gone;
  if (after.state === "ended") return before.state === "ended" ? undefined : words.ended;
  if (after.state === "limited") return before.state === "limited" ? undefined : words.limited;
  // A room that is full is said when it refuses (the refusal's own sentence): not said twice.
  if (after.state === "full") return undefined;
  if (!down(before.state) && down(after.state)) return statusText(after, words);
  if (down(before.state) && !down(after.state) && after.state !== "connecting") return words.synced;
  // Let in after being turned away: the person is told they are in.
  if (before.state === "full" && after.state !== "connecting") return words.synced;
  return undefined;
}
