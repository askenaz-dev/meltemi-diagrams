// Awareness in the room (`live-collaboration`, "Awareness state"; `cloud-document`, "Awareness relayed
// by the room"): the pure parts, so that `room-core.ts` stays about the room and every rule here is
// tested alone. Nothing of awareness is ever stored in the room's database: a client's last state
// lives in its socket's attachment, and everything else is relayed.
//
// The wire format (kind 2, after the kind byte, UTF-8 JSON):
//
//   client to room   { "<any key>": <state> | null }
//   room to client   { "<connection id>": <peer> | null, ... }
//
// `<state>` is `{ file?, caret?, canvas? }` (`parseAwareness`), `<peer>` is the same with the room's
// `user` on it. From a client the map holds exactly ONE entry, which is the client's own state; the
// key the client gives it is ignored, because the room keys what it relays by the sender's
// connection id (`hello.you.id`), so that no client can speak for another's entry. `null` is "I have
// no state any more". From the room, `null` is "that connection has no state any more" (it left, or
// was silent for thirty seconds).

import { presenceColour } from "@meltemi/diagrams-project";
import { FILE_ID } from "./document.js";
import type { RoomIdentity } from "./rooms.js";

/** A kind 2 message over this many bytes (the kind byte included) closes its sender. */
export const AWARENESS_MESSAGE_BYTES = 16 * 1024;
/** A state nobody refreshed for this long is dropped, and the others are told. */
export const AWARENESS_TIMEOUT_MS = 30_000;
/** Kind 2 messages beyond this many within `AWARENESS_WINDOW_MS` from one client are dropped. */
export const AWARENESS_DROP_ABOVE = 20;
/** Kind 2 messages beyond this many within `AWARENESS_WINDOW_MS` from one client close it. */
export const AWARENESS_CLOSE_ABOVE = 100;
export const AWARENESS_WINDOW_MS = 1_000;
/** What a socket's attachment may hold, as the platform caps it (2 KiB serialised). */
export const ATTACHMENT_BYTES = 2 * 1024;

/** The longest encoded relative position of a caret (the page's own encoding, opaque to the room). */
const MAX_POSITION = 256;
/** The longest element id of a canvas selection. */
const MAX_ELEMENT = 256;

/** The two ends of a selection in the code pane: encoded Yjs relative positions. */
export interface AwarenessCaret {
  readonly anchor: string;
  readonly head: string;
}

/** What a client publishes. Every part is optional: a client with no file open publishes `{}`. */
export interface AwarenessState {
  /** The id of the file the person has open (`FILE_ID`), so that presence survives a rename. */
  readonly file?: string;
  readonly caret?: AwarenessCaret;
  /** The ids of the elements selected on the canvas. Never kept by the room, only relayed. */
  readonly canvas?: { readonly selection: readonly string[] };
}

/** Who a state is of: what the room knows, never what the client says. */
export interface AwarenessUser {
  readonly sub: string;
  readonly name: string;
  readonly picture: string;
  readonly colour: string;
}

/** A state as the room relays it. */
export interface PeerState extends AwarenessState {
  readonly user: AwarenessUser;
}

/** What the room sends: states by connection id, `null` for one that is gone. */
export type PeerMap = Record<string, PeerState | null>;

/**
 * What the room keeps of a client's last state in the socket's attachment, beside the identity (`sub`,
 * `name` and `picture` are in the attachment already): the colour, the file, the caret and when the
 * client last sent a state. The canvas selection is not kept; it arrives with the next state.
 */
export interface AwarenessRecord {
  readonly colour: string;
  readonly file?: string;
  readonly caret?: AwarenessCaret;
  /** Milliseconds since the epoch of the last kind 2 message the room accepted from the client. */
  readonly seen: number;
}

export type ParsedAwareness = { readonly state: AwarenessState } | { readonly remove: true };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A string of 1 to `max` characters, or undefined. */
function bounded(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length >= 1 && value.length <= max ? value : undefined;
}

const decoder = new TextDecoder();

/**
 * The payload of a client's kind 2 message, or `undefined` for anything that is not one (the room drops
 * it and counts it; it never takes the connection down). It is a JSON object with exactly one entry;
 * the key is ignored; the value is `null` (the client has no state now) or an object of which only
 * `file`, `caret` and `canvas` are read, so a `user` the client sends, or any other field, is never
 * relayed. A part that is absent or `null` is not set; a part of the wrong shape makes the whole message
 * invalid.
 */
export function parseAwareness(payload: Uint8Array): ParsedAwareness | undefined {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(payload));
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const entries = Object.values(value);
  if (entries.length !== 1) return undefined;
  const entry = entries[0];
  if (entry === null) return { remove: true };
  if (!isRecord(entry)) return undefined;

  const state: { file?: string; caret?: AwarenessCaret; canvas?: { selection: string[] } } = {};
  const file = entry["file"];
  if (file !== undefined && file !== null) {
    if (typeof file !== "string" || !FILE_ID.test(file)) return undefined;
    state.file = file;
  }
  const caret = entry["caret"];
  if (caret !== undefined && caret !== null) {
    if (!isRecord(caret)) return undefined;
    const anchor = bounded(caret["anchor"], MAX_POSITION);
    const head = bounded(caret["head"], MAX_POSITION);
    if (anchor === undefined || head === undefined) return undefined;
    state.caret = { anchor, head };
  }
  const canvas = entry["canvas"];
  if (canvas !== undefined && canvas !== null) {
    if (!isRecord(canvas) || !Array.isArray(canvas["selection"])) return undefined;
    const selection: string[] = [];
    for (const element of canvas["selection"] as unknown[]) {
      const id = bounded(element, MAX_ELEMENT);
      if (id === undefined) return undefined;
      selection.push(id);
    }
    state.canvas = { selection };
  }
  return { state };
}

/** The identity of a person as the room attaches it to what it relays. */
export function userOf(
  info: RoomIdentity,
  colour: string = presenceColour(info.sub),
): AwarenessUser {
  return { sub: info.sub, name: info.name, picture: info.picture, colour };
}

/** The room's view of a client's state: the identity the room knows, then the client's parts. */
export function peerOf(
  info: RoomIdentity,
  state: AwarenessState,
  colour: string = presenceColour(info.sub),
): PeerState {
  return { user: userOf(info, colour), ...state };
}

/**
 * An upper bound of what the platform's serialisation of a value takes: its JSON in UTF-16 code units,
 * counted twice when any of them is not Latin-1 (V8 stores a string either way), and a margin for the
 * tags. It never says a value fits that does not.
 */
export function attachmentBytes(value: unknown): number {
  const json = JSON.stringify(value);
  let wide = false;
  for (let i = 0; i < json.length; i++) {
    if (json.charCodeAt(i) > 0xff) {
      wide = true;
      break;
    }
  }
  return json.length * (wide ? 2 : 1) + 64;
}

/**
 * The record to keep in an attachment that already holds `identity`: the whole of it when it fits in
 * `limit` bytes, else without the caret, else without the file too. The bare record (colour and last
 * seen) is always kept: the identity is capped by the Worker's headers so that it always leaves room.
 */
export function fitRecord(
  identity: object,
  record: AwarenessRecord,
  limit: number = ATTACHMENT_BYTES,
): AwarenessRecord {
  const fits = (candidate: AwarenessRecord): boolean =>
    attachmentBytes({ ...identity, aw: candidate }) <= limit;
  if (fits(record)) return record;
  const { caret: _caret, ...withoutCaret } = record;
  if (fits(withoutCaret)) return withoutCaret;
  const { file: _file, ...bare } = withoutCaret;
  return bare;
}

/**
 * How many kind 2 messages a client sent within the last second, to decide each one's fate: the
 * window slides (a message counts for exactly `AWARENESS_WINDOW_MS`), and every message counts, the
 * ones that were dropped too, so that a flood is what closes the socket.
 */
export class AwarenessRate {
  private readonly times: number[] = [];

  /** Records a message at `now`: `ok` up to 20 in the window, `drop` from the 21st, `close` from the 101st. */
  hit(now: number): "ok" | "drop" | "close" {
    const from = now - AWARENESS_WINDOW_MS;
    let old = 0;
    while (old < this.times.length && (this.times[old] as number) <= from) old++;
    if (old > 0) this.times.splice(0, old);
    this.times.push(now);
    if (this.times.length > AWARENESS_CLOSE_ABOVE) return "close";
    return this.times.length > AWARENESS_DROP_ABOVE ? "drop" : "ok";
  }
}
