// A person without an account in a cloud project (`live-sessions`, "Guest identity" and "The page as
// a guest"): the id this browser made once and keeps, so that a reload and a second tab are the same
// person with the same colour; the name they chose, or "Guest NN" from the id; and the room's address
// with the live session's token, the id and the name, which is all the Worker needs to name them.
// Nothing of a project is kept in this browser for a guest; the id and the name are, as the person's.
// Pure functions over a key-value store and a source of random bytes, so that a test plays them.

import { guestNumber } from "@meltemi/diagrams-project";
import type { KeyValueStore } from "./persistence.js";

/** Where this browser keeps the id it made for its person without an account. */
export const GUEST_ID_KEY = "meltemi-playground:guest-id:v1";
/** Where it keeps the name that person chose. */
export const GUEST_NAME_KEY = "meltemi-playground:guest-name:v1";
/** A guest id: 32 lowercase hexadecimal characters, as the Worker takes it. */
export const GUEST_ID = /^[0-9a-f]{32}$/;
/** The longest name a guest may give, in characters: the Worker's own bound. */
export const MAX_GUEST_NAME = 40;

/** What a name may not hold: control characters, line and paragraph separators, lone surrogates. */
const UNSHOWABLE = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

/** Bytes as lowercase hexadecimal. */
function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The id this browser keeps for its person without an account, made (128 random bits) and kept the
 * first time it is asked for. Where the browser keeps nothing, an id made now serves this page.
 */
export function guestId(
  storage: KeyValueStore | undefined,
  random: (length: number) => Uint8Array,
): string {
  let kept: string | null = null;
  try {
    kept = storage?.getItem(GUEST_ID_KEY) ?? null;
  } catch {
    // A store that refuses is no store: the id is this page's.
  }
  if (kept !== null && GUEST_ID.test(kept)) return kept;
  const made = hex(random(16));
  try {
    storage?.setItem(GUEST_ID_KEY, made);
  } catch {
    // Not kept: a reload is another guest, which is all a browser that keeps nothing allows.
  }
  return made;
}

/**
 * A name as a guest may have it: trimmed, 1 to 40 characters, nothing unshowable in it; undefined
 * for anything else (the default name is used). The Worker reads the same rule.
 */
export function cleanGuestName(raw: string): string | undefined {
  const name = raw.trim();
  const length = Array.from(name).length;
  if (length === 0 || length > MAX_GUEST_NAME || UNSHOWABLE.test(name)) return undefined;
  return name;
}

/** The name a guest goes by when they gave none: "Guest NN" in the page's words, NN from the id. */
export function defaultGuestName(id: string, words: { guestName(n: number): string }): string {
  return words.guestName(guestNumber(id));
}

/** The name this browser's guest chose, if they chose one that will do. */
export function keptGuestName(storage: KeyValueStore | undefined): string | undefined {
  try {
    const kept = storage?.getItem(GUEST_NAME_KEY);
    return kept === null || kept === undefined ? undefined : cleanGuestName(kept);
  } catch {
    return undefined;
  }
}

/** Keeps the guest's name for the next time; false when the browser keeps nothing. */
export function keepGuestName(storage: KeyValueStore | undefined, name: string): boolean {
  try {
    if (!storage) return false;
    storage.setItem(GUEST_NAME_KEY, name);
    return true;
  } catch {
    return false;
  }
}

/** Who a connection without an account says it is: the id and the name. */
export interface GuestPerson {
  readonly id: string;
  readonly name: string;
}

/**
 * The room's address for this page: `?live=<token>` when a live session's token is held, and
 * `?guest=<id>&name=<name>` for a person without an account. A person signed in sends their cookie,
 * so nothing of a guest goes with them.
 */
export function roomAddress(
  base: string,
  options: { readonly live?: string | undefined; readonly guest?: GuestPerson | undefined },
): string {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return base;
  }
  if (options.live !== undefined) url.searchParams.set("live", options.live);
  if (options.guest) {
    url.searchParams.set("guest", options.guest.id);
    url.searchParams.set("name", options.guest.name);
  }
  return url.href;
}
