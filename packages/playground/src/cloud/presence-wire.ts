// The wire format of presence (`live-collaboration`, "Awareness state"): what a kind 2 message of
// the room holds, and how the page reads it. One small module, so that the day the room's format
// changes this is the only place that has to follow.
//
// A kind 2 payload is UTF-8 JSON: an object keyed by client id, as Yjs's awareness protocol does,
// whose value is that client's state, or `null` when the client is gone.
//
//   page to room   { "<my client id>": { file?, caret?: { anchor, head },
//                                         canvas?: { selection, pointer?: { x, y, diagram? },
//                                                    laser?: { diagram?, points: [{ x, y, t }] } } } }
//   room to page   { "<client id>": { file?, caret?, canvas?,
//                                     user: { sub, name, picture, colour, guest } } }
//                  { "<client id>": null }                     (that client left or fell silent)
//
// `file` is a file id of the document, `anchor` and `head` are base64 of Yjs relative positions
// in that file's text, `selection` the ids selected on the canvas, `pointer` where the person's
// pointer is over the canvas, in diagram units, and over which diagram, and `laser` the points
// of the Pointer tool's trail made since the last message (at most `MAX_LASER_POINTS`, `t` the
// milliseconds since the first, 0 to `MAX_LASER_MS`). `guest` marks a person
// without an account (`live-sessions`), set by the room alone. The identity is the room's: it
// replaces `user` on everything it relays, so the page never sends one and never reads a person's
// identity from anywhere else. Everything read here comes from a peer through the room and is
// untrusted: it is checked, capped, and a payload that does not fit is ignored, never thrown at.

import * as Y from "yjs";
import { FILE_ID } from "./doc.js";
import { avatarUrl } from "./session.js";

/** The most canvas ids one state carries; more are not published. */
export const MAX_SELECTED = 200;
/** The longest canvas id read from a peer. */
export const MAX_ID_LENGTH = 200;
/** The longest name read from a peer, in characters. */
export const MAX_NAME_LENGTH = 100;
/** The most clients one message may speak of. */
const MAX_ENTRIES = 64;
/** How far from the origin a pointer read from a peer may be, in diagram units: the room's bound. */
export const MAX_POINTER = 1_000_000;
/** The most points of a Pointer trail one state carries, and the longest it lasts in milliseconds. */
export const MAX_LASER_POINTS = 64;
export const MAX_LASER_MS = 1000;
/** The longest client id or `sub` read from a message. */
const MAX_KEY_LENGTH = 200;
/** The longest encoded relative position read from a peer. */
const MAX_POSITION_LENGTH = 200;

/** A caret or selection, as encoded relative positions in a file's text. */
export interface EncodedCaret {
  readonly anchor: string;
  readonly head: string;
}

/** Where a person's pointer is over their canvas: integers in diagram units, and the diagram. */
export interface PointerPosition {
  readonly x: number;
  readonly y: number;
  /** The diagram of the file the canvas shows, when the page knows it. */
  readonly diagram?: string;
}

/** One point of a Pointer trail: diagram units, and the milliseconds since the batch's first. */
export interface LaserPoint {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

/** The points a stroke of the Pointer tool made since the last state, and the diagram they are on. */
export interface LaserBatch {
  readonly diagram?: string;
  readonly points: readonly LaserPoint[];
}

/** What the page publishes about the person: where they are, never who they are. */
export interface LocalState {
  /** The id of the file the person has open (ids never change, so a rename keeps presence). */
  readonly file?: string;
  readonly caret?: EncodedCaret;
  readonly canvas?: {
    readonly selection: readonly string[];
    readonly pointer?: PointerPosition;
    readonly laser?: LaserBatch;
  };
}

/** Who a person is, as the room says: never taken from the peer's own payload. */
export interface RemoteUser {
  readonly sub: string;
  /** May be empty. */
  readonly name: string;
  /** An address the avatar may be drawn from (`avatarUrl`), or undefined. */
  readonly picture: string | undefined;
  /** A person without an account: the room's word, never a peer's. */
  readonly guest: boolean;
}

/** A peer's state as the page reads it. */
export interface RemoteState {
  readonly user: RemoteUser;
  readonly file: string | undefined;
  readonly caret: EncodedCaret | undefined;
  /** The canvas ids the person has selected. */
  readonly selection: readonly string[];
  /** Where the person's pointer is over their canvas, while it moves there. */
  readonly pointer: PointerPosition | undefined;
  /** The points of the person's Pointer trail in this message, when it carries a batch. */
  readonly laser: LaserBatch | undefined;
}

/** One client of a message: its id, and its state (`null`: it is gone). */
export interface AwarenessEntry {
  readonly id: string;
  readonly state: unknown;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Messages ---------------------------------------------------------------------------------------

/** The payload of the page's own state, as the room takes it. */
export function encodeLocal(clientId: string, state: LocalState): Uint8Array {
  return encoder.encode(JSON.stringify({ [clientId]: state }));
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The clients a payload speaks of; nothing when it is not a message of the format. Never throws. */
export function decodeAwareness(payload: Uint8Array): AwarenessEntry[] {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(payload));
  } catch {
    return [];
  }
  if (!isObject(value)) return [];
  const entries: AwarenessEntry[] = [];
  for (const [id, state] of Object.entries(value)) {
    if (entries.length >= MAX_ENTRIES) break;
    if (id === "" || id.length > MAX_KEY_LENGTH) continue;
    if (state === null || isObject(state)) entries.push({ id, state });
  }
  return entries;
}

// A peer's state ---------------------------------------------------------------------------------

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Control characters and the line and paragraph separators, which a name has no use for. */
const isUnseen = (code: number): boolean =>
  code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;

/** A name as one line of characters: the ones that cannot be seen become spaces. */
function oneLine(name: string): string {
  let line = "";
  for (const character of name) line += isUnseen(character.codePointAt(0) ?? 0) ? " " : character;
  return line.trim();
}

function readUser(value: unknown, page: string): RemoteUser | undefined {
  if (!isObject(value)) return undefined;
  const sub = value["sub"];
  if (typeof sub !== "string" || sub === "" || sub.length > MAX_KEY_LENGTH) return undefined;
  const name = value["name"];
  return {
    sub,
    // Kept as the characters it is: the page sets it as a text node and never as markup.
    name:
      typeof name === "string" ? Array.from(oneLine(name)).slice(0, MAX_NAME_LENGTH).join("") : "",
    picture: avatarUrl(value["picture"], page),
    guest: value["guest"] === true,
  };
}

function readCaret(value: unknown): EncodedCaret | undefined {
  if (!isObject(value)) return undefined;
  const { anchor, head } = value;
  const fits = (position: unknown): position is string =>
    typeof position === "string" &&
    position.length > 0 &&
    position.length <= MAX_POSITION_LENGTH &&
    BASE64.test(position);
  return fits(anchor) && fits(head) ? { anchor, head } : undefined;
}

/** A coordinate of a peer's pointer: a finite number within the bound, as an integer. */
function coordinate(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_POINTER) {
    return undefined;
  }
  return Math.round(value) || 0;
}

/** A peer's pointer: two finite numbers within the bound and, maybe, a diagram's id; else nothing. */
export function readPointer(value: unknown): PointerPosition | undefined {
  if (!isObject(value)) return undefined;
  const x = coordinate(value["x"]);
  const y = coordinate(value["y"]);
  if (x === undefined || y === undefined) return undefined;
  const diagram = value["diagram"];
  return typeof diagram === "string" && diagram !== "" && diagram.length <= MAX_ID_LENGTH
    ? { x, y, diagram }
    : { x, y };
}

/**
 * A peer's Pointer trail batch: at most `MAX_LASER_POINTS` points, each `x` and `y` finite within
 * the pointer bound and `t` an integer 0 to `MAX_LASER_MS`, and maybe the diagram. A batch that does
 * not fit is no batch at all: the rest of the state is still read.
 */
export function readLaser(value: unknown): LaserBatch | undefined {
  if (!isObject(value) || !Array.isArray(value["points"])) return undefined;
  const given = value["points"] as unknown[];
  if (given.length > MAX_LASER_POINTS) return undefined;
  const points: LaserPoint[] = [];
  for (const entry of given) {
    if (!isObject(entry)) return undefined;
    const { x, y, t } = entry;
    const fits = (n: unknown): n is number =>
      typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= MAX_POINTER;
    if (!fits(x) || !fits(y)) return undefined;
    if (typeof t !== "number" || !Number.isInteger(t) || t < 0 || t > MAX_LASER_MS)
      return undefined;
    points.push({ x, y, t });
  }
  const diagram = value["diagram"];
  return typeof diagram === "string" && diagram !== "" && diagram.length <= MAX_ID_LENGTH
    ? { diagram, points }
    : { points };
}

function readSelection(value: unknown): string[] {
  if (!isObject(value) || !Array.isArray(value["selection"])) return [];
  const ids: string[] = [];
  for (const id of value["selection"] as unknown[]) {
    if (ids.length >= MAX_SELECTED) break;
    if (typeof id === "string" && id !== "" && id.length <= MAX_ID_LENGTH) ids.push(id);
  }
  return ids;
}

/**
 * A peer's state as the room relayed it, or undefined when it names nobody. The person is the
 * room's `user` and nothing else: a `name`, `sub` or `picture` beside it, or inside the caret or
 * the canvas selection, is a peer's claim and never read. Where the state says it is, the caret and
 * the canvas selection are whatever of them fits the format.
 */
export function readState(value: unknown, page: string): RemoteState | undefined {
  if (!isObject(value)) return undefined;
  const user = readUser(value["user"], page);
  if (!user) return undefined;
  const file = value["file"];
  return {
    user,
    file: typeof file === "string" && FILE_ID.test(file) ? file : undefined,
    caret: readCaret(value["caret"]),
    selection: readSelection(value["canvas"]),
    pointer: isObject(value["canvas"]) ? readPointer(value["canvas"]["pointer"]) : undefined,
    laser: isObject(value["canvas"]) ? readLaser(value["canvas"]["laser"]) : undefined,
  };
}

// Relative positions -----------------------------------------------------------------------------

/** Base64 of some bytes. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The bytes of a base64 text, or undefined when it is not one. */
export function fromBase64(text: string): Uint8Array | undefined {
  if (!BASE64.test(text)) return undefined;
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

/**
 * A caret or selection of a text as relative positions, so that it stays on the same characters
 * while others edit. The ends of a forward selection hold to the characters inside it (the start
 * to the first, the end to the last), so text typed at its edges falls outside; a backward one the
 * other way round.
 */
export function encodeCaret(text: Y.Text, anchor: number, head: number): EncodedCaret {
  const at = (offset: number) => Math.max(0, Math.min(Math.trunc(offset), text.length));
  const forward = anchor <= head;
  const collapsed = anchor === head;
  const position = (offset: number, assoc: 0 | -1) =>
    toBase64(
      Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, at(offset), assoc)),
    );
  return {
    anchor: position(anchor, collapsed || forward ? 0 : -1),
    head: position(head, collapsed || !forward ? 0 : -1),
  };
}

/**
 * Where an encoded position is in a text now, or undefined when it names another text, a text that
 * is gone, or is not a position.
 */
export function positionIn(encoded: string, doc: Y.Doc, text: Y.Text): number | undefined {
  const bytes = fromBase64(encoded);
  if (!bytes) return undefined;
  try {
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      Y.decodeRelativePosition(bytes),
      doc,
    );
    return absolute && absolute.type === text ? absolute.index : undefined;
  } catch {
    return undefined;
  }
}
