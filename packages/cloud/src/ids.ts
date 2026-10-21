/**
 * The shape of a project id in an address: 20 lowercase letters and digits. The projects change
 * generates the ids (base32 of random bytes) and may narrow this; the shape is checked before
 * anything is looked up, so an address that cannot be an id never reaches a store.
 */
export const PROJECT_ID = /^[0-9a-z]{20}$/;

/**
 * The shape of a handle, the first segment of a publication's address: 3 to 30 lowercase letters,
 * digits and hyphens. The database refuses anything else (`users.handle`), and the publish host
 * checks it before it looks anything up.
 */
export const HANDLE = /^[a-z0-9-]{3,30}$/;

/** The shape of a slug, the second segment of a publication's address: 1 to 60 of the same characters. */
export const SLUG = /^[a-z0-9-]{1,60}$/;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Random bytes behind a project id: 96 bits, which are 20 base32 characters (the last holds 1 bit). */
const PROJECT_ID_BYTES = 12;

/** A new project id: 20 lowercase base32 characters (`[a-z2-7]`) from 12 random bytes. */
export function newProjectId(random: (length: number) => Uint8Array): string {
  let id = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of random(PROJECT_ID_BYTES)) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      id += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  // 12 bytes are 19 characters and 1 bit left over: that bit starts the 20th.
  if (bits > 0) id += ALPHABET[(buffer << (5 - bits)) & 31];
  return id;
}
