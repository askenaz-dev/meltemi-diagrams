// The shape of a cloud project's Yjs document, as the page reads and writes it (`cloud-projects`,
// "The document"): `files` (id -> Y.Text), `paths` (id -> path, every file) and `binaries`
// (id -> sha-256 of an image or font). The room validates the same shape.

import * as Y from "yjs";

/** Map of file id -> the text of each text file. */
export const FILES = "files";
/** Map of file id -> path, for text and binary files alike. */
export const PATHS = "paths";
/** Map of file id -> lowercase hex SHA-256 of the bytes of an image or a font. */
export const BINARIES = "binaries";

/** The origin of every transaction the page makes from its own edits. */
export const LOCAL = Symbol("meltemi.local");

/**
 * The origin of a transaction that is the person's own and that no undo brings back: the removal of
 * an image or a font, whose bytes the service is told to drop. An undo that restored the file would
 * name a hash the room no longer knows, and the room would refuse it.
 */
export const LOCAL_FINAL = Symbol("meltemi.local.final");

/** A convenient origin for updates that come from outside: the room, IndexedDB, a push. */
export const REMOTE = Symbol("meltemi.remote");

/**
 * Whether a transaction is the person's own: made from the page's edits (`LOCAL`, or `LOCAL_FINAL`
 * for one that cannot be undone) or by one of the page's undo managers undoing or redoing them.
 * Everything else is remote and never undone.
 */
export function isLocalOrigin(origin: unknown): boolean {
  return origin === LOCAL || origin === LOCAL_FINAL || origin instanceof Y.UndoManager;
}

/** The three maps of a project's document. */
export interface CloudDoc {
  readonly doc: Y.Doc;
  readonly files: Y.Map<Y.Text>;
  readonly paths: Y.Map<string>;
  readonly binaries: Y.Map<string>;
}

export function cloudDoc(doc: Y.Doc): CloudDoc {
  return {
    doc,
    files: doc.getMap<Y.Text>(FILES),
    paths: doc.getMap<string>(PATHS),
    binaries: doc.getMap<string>(BINARIES),
  };
}

// File ids -----------------------------------------------------------------------------------

/** The shape of a file id: 16 characters of lowercase base32 (RFC 4648). */
export const FILE_ID = /^[a-z2-7]{16}$/;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Bytes behind a file id: 80 bits, which are exactly 16 base32 characters. */
const ID_BYTES = 10;

const randomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));

/** A new file id: 16 characters of base32 from 10 random bytes. It never changes for a file. */
export function newFileId(random: (length: number) => Uint8Array = randomBytes): string {
  let id = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of random(ID_BYTES)) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      id += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  return id;
}

// Files by path --------------------------------------------------------------------------------

/** A file of the document: its id, the path it is stored under, the path the page shows. */
export interface DocFile {
  readonly id: string;
  /** The path in `paths`. */
  readonly path: string;
  /** The path the page shows: `path`, or `<path>~<id>` for a file that lost a collision. */
  readonly shown: string;
  readonly kind: "text" | "binary";
  /** The file's text, for a text file. */
  readonly text?: Y.Text;
  /** The hash of the bytes, for a binary file. */
  readonly hash?: string;
}

/** Two ids with one path: the lexically smaller id keeps it, the other is shown elsewhere. */
export interface Collision {
  /** The path both ids carry. */
  readonly path: string;
  /** The id that keeps the path. */
  readonly keeper: string;
  /** The id that is shown as `shown`. */
  readonly id: string;
  /** `<path>~<id>`. */
  readonly shown: string;
}

export interface ResolvedFiles {
  /** Every file by id. */
  readonly files: ReadonlyMap<string, DocFile>;
  /** The files shown under another path, sorted by path and id. */
  readonly collisions: readonly Collision[];
}

/**
 * The files of a document, by id, with the path each is shown under. A path with a text or a
 * hash is a file; an entry of `paths` with neither is not shown yet.
 */
export function resolveFiles(cloud: CloudDoc): ResolvedFiles {
  const owners = new Map<string, string[]>();
  const files = new Map<string, DocFile>();
  cloud.paths.forEach((path, id) => {
    if (typeof path !== "string") return;
    const text = cloud.files.get(id);
    const hash = cloud.binaries.get(id);
    if (text instanceof Y.Text) {
      files.set(id, { id, path, shown: path, kind: "text", text });
    } else if (typeof hash === "string") {
      files.set(id, { id, path, shown: path, kind: "binary", hash });
    } else return;
    const ids = owners.get(path);
    if (ids) ids.push(id);
    else owners.set(path, [id]);
  });
  const collisions: Collision[] = [];
  for (const [path, ids] of owners) {
    if (ids.length < 2) continue;
    ids.sort();
    const keeper = ids[0]!;
    for (const id of ids.slice(1)) {
      const shown = `${path}~${id}`;
      files.set(id, { ...files.get(id)!, shown });
      collisions.push({ path, keeper, id, shown });
    }
  }
  collisions.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.id < b.id ? -1 : 1));
  return { files, collisions };
}

/** The same collisions, to tell whether the list changed. */
export function sameCollisions(a: readonly Collision[], b: readonly Collision[]): boolean {
  return a.length === b.length && a.every((c, i) => c.id === b[i]!.id && c.path === b[i]!.path);
}

/** Adds a text file to a document in one transaction; returns its id. */
export function addTextFile(
  cloud: CloudDoc,
  path: string,
  text: string,
  options: { id?: string; origin?: unknown } = {},
): string {
  const id = options.id ?? newFileId();
  cloud.doc.transact(() => {
    const ytext = new Y.Text();
    cloud.files.set(id, ytext);
    if (text !== "") ytext.insert(0, text);
    cloud.paths.set(id, path);
  }, options.origin ?? LOCAL);
  return id;
}

/** Adds an image or font, by the hash of its bytes, in one transaction; returns its id. */
export function addBinaryFile(
  cloud: CloudDoc,
  path: string,
  hash: string,
  options: { id?: string; origin?: unknown } = {},
): string {
  const id = options.id ?? newFileId();
  cloud.doc.transact(() => {
    cloud.binaries.set(id, hash);
    cloud.paths.set(id, path);
  }, options.origin ?? LOCAL);
  return id;
}

/** The lowercase hex SHA-256 of some bytes, which is how `binaries` names an image or a font. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Text edits -----------------------------------------------------------------------------------

/** A change of a text: delete `remove` characters at `index`, then insert `insert` there. */
export interface MinimalEdit {
  readonly index: number;
  readonly remove: number;
  readonly insert: string;
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * The smallest single edit that turns `before` into `after`: what is left once the common start
 * and the common end are set aside (never between the two halves of a surrogate pair). Undefined
 * when the texts are equal.
 */
export function minimalEdit(before: string, after: string): MinimalEdit | undefined {
  const shortest = Math.min(before.length, after.length);
  let start = 0;
  while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  if (start === before.length && start === after.length) return undefined;
  if (start > 0 && isHigh(before.charCodeAt(start - 1))) start--;
  let end = 0;
  while (
    end < shortest - start &&
    before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)
  ) {
    end++;
  }
  if (end > 0 && isLow(before.charCodeAt(before.length - end))) end--;
  return {
    index: start,
    remove: before.length - start - end,
    insert: after.slice(start, after.length - end),
  };
}
