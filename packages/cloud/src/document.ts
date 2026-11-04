// The shape of a cloud project's Yjs document as the room keeps it, and everything the room does to
// it that needs no Cloudflare API, so that it runs and is tested in Node (`cloud-projects`, "The
// document"): the three maps, file ids, the path-keyed view (`snapshot`), the path-keyed writes
// (`applyFiles`, `restoreFiles`) and the validation of a transaction.
//
//   files:    Y.Map<fileId, Y.Text>   the text files the page edits
//   paths:    Y.Map<fileId, string>   every file's path, text and binary alike
//   binaries: Y.Map<fileId, string>   sha-256 (lowercase hex) of the bytes of an image or a font
//
// The page's side of the same document is `packages/playground/src/cloud/doc.ts`: the names of the
// maps, the file ids and the collision rule must stay the same in both.

import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import * as Y from "yjs";

/** Map of file id -> the text of each text file. */
export const FILES = "files";
/** Map of file id -> path, for text and binary files alike. */
export const PATHS = "paths";
/** Map of file id -> lowercase hex SHA-256 of the bytes of an image or a font. */
export const BINARIES = "binaries";

/** The only root types a project's document has; a client that creates another is refused. */
const ROOTS: ReadonlySet<string> = new Set([FILES, PATHS, BINARIES]);

/** The origin of a transaction the API makes from a push (`PUT /files`). */
export const PUSH = "push";
/** The origin of a transaction that puts a version back (`POST …/versions/:n/restore`). */
export const RESTORE = "restore";

/** The shape of a file id: 16 characters of lowercase base32 (RFC 4648). */
export const FILE_ID = /^[a-z2-7]{16}$/;

/** The shape of the hash of a binary: 64 lowercase hexadecimal characters (SHA-256). */
export const BLOB_HASH = /^[0-9a-f]{64}$/;

/** The three maps of a project's document. */
export interface CloudDoc {
  readonly doc: Y.Doc;
  readonly files: Y.Map<unknown>;
  readonly paths: Y.Map<unknown>;
  readonly binaries: Y.Map<unknown>;
}

export function cloudDoc(doc: Y.Doc): CloudDoc {
  return {
    doc,
    files: doc.getMap(FILES),
    paths: doc.getMap(PATHS),
    binaries: doc.getMap(BINARIES),
  };
}

// File ids -------------------------------------------------------------------------------------

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Bytes behind a file id: 80 bits, which are exactly 16 base32 characters. */
const ID_BYTES = 10;

/** A new file id: 16 characters of lowercase base32 from 10 random bytes. It never changes for a file. */
export function newFileId(random: (length: number) => Uint8Array): string {
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

const cryptoRandom = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));

// The files by path ----------------------------------------------------------------------------

/** A file of the document: its id, the path it is stored under, the path it is shown under. */
export interface DocFile {
  readonly id: string;
  /** The path in `paths`. */
  readonly path: string;
  /** `path`, or `<path>~<id>` for a file that lost a collision. */
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

/** `true` for the one class a text file's value may be: not an `XmlText`, which extends it. */
function isPlainText(value: unknown): value is Y.Text {
  return value instanceof Y.Text && value.constructor === Y.Text;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The files of a document with the path each is shown under, by shown path, and the collisions.
 * An entry of `paths` with neither a text nor a hash is not a file (not shown yet); a path that
 * is not a string is none either. Two ids with one path: the lexically smaller keeps it.
 */
export function resolveFiles(cloud: CloudDoc): {
  readonly files: readonly DocFile[];
  readonly collisions: readonly Collision[];
} {
  const owners = new Map<string, DocFile[]>();
  cloud.paths.forEach((path, id) => {
    if (typeof path !== "string") return;
    const text = cloud.files.get(id);
    const hash = cloud.binaries.get(id);
    let file: DocFile;
    if (isPlainText(text)) file = { id, path, shown: path, kind: "text", text };
    else if (typeof hash === "string") file = { id, path, shown: path, kind: "binary", hash };
    else return;
    const same = owners.get(path);
    if (same) same.push(file);
    else owners.set(path, [file]);
  });
  const files: DocFile[] = [];
  const collisions: Collision[] = [];
  for (const [path, same] of owners) {
    same.sort((a, b) => compare(a.id, b.id));
    const keeper = same[0] as DocFile;
    files.push(keeper);
    for (const loser of same.slice(1)) {
      const shown = `${path}~${loser.id}`;
      files.push({ ...loser, shown });
      collisions.push({ path, keeper: keeper.id, id: loser.id, shown });
    }
  }
  files.sort((a, b) => compare(a.shown, b.shown));
  collisions.sort((a, b) => compare(a.path, b.path) || compare(a.id, b.id));
  return { files, collisions };
}

/** The collisions of a document: the path, the id that keeps it, the id that is shown elsewhere. */
export function collisionsOf(cloud: CloudDoc): readonly Collision[] {
  return resolveFiles(cloud).collisions;
}

/** A document as paths, the way every reader outside the room sees it. */
export interface Snapshot {
  /** Path to text, by shown path. */
  readonly files: Record<string, string>;
  /** Path to the SHA-256 (hex) of the bytes, by shown path. */
  readonly binaries: Record<string, string>;
  readonly collisions: readonly Collision[];
}

/**
 * The files by path: text files with their text, binary files with their hash, the paths sorted,
 * a collision resolved (the smaller id keeps the path, the other is shown as `<path>~<id>`, both
 * listed in `collisions`). Records are built with own keys, so a file named `__proto__` is a file.
 */
export function snapshot(source: CloudDoc | Y.Doc): Snapshot {
  const cloud = source instanceof Y.Doc ? cloudDoc(source) : source;
  const { files, collisions } = resolveFiles(cloud);
  const texts: [string, string][] = [];
  const hashes: [string, string][] = [];
  for (const file of files) {
    if (file.kind === "text") texts.push([file.shown, (file.text as Y.Text).toString()]);
    else hashes.push([file.shown, file.hash as string]);
  }
  return {
    files: Object.fromEntries(texts),
    binaries: Object.fromEntries(hashes),
    collisions,
  };
}

// Writes by path -------------------------------------------------------------------------------

/** A rule of the document that a change breaks. The names are the codes the room answers with. */
export type DocumentCode =
  "path.invalid" | "blob.unknown" | "doc.invalid" | "doc.too-large" | "quota.files";

export class DocumentError extends Error {
  constructor(readonly code: DocumentCode) {
    super(code);
  }
}

/** A push: files by path, `null` deleting one; images and fonts by path with the hash of their bytes. */
export interface FilesChange {
  readonly files?: Readonly<Record<string, string | null>>;
  readonly binaries?: Readonly<Record<string, string | null>>;
}

export interface WriteOptions {
  /** The origin of the transaction; `PUSH` by default (`RESTORE` for a restore). */
  readonly origin?: unknown;
  /** Random bytes for the ids of new files. */
  readonly random?: (length: number) => Uint8Array;
}

/** The entries of a record, whatever its keys (own keys only, `__proto__` included). */
const entriesOf = <T>(record: Readonly<Record<string, T>> | undefined): [string, T][] =>
  record === undefined ? [] : Object.entries(record);

/**
 * Checks a change before anything is applied: every path passes the path rule (`path.invalid`),
 * a text is a string or `null`, a hash is 64 lowercase hex or `null` (`doc.invalid`), and no path
 * is both a text and a binary in one change (`doc.invalid`).
 */
export function checkChange(
  change: FilesChange,
  options: { deletes: boolean } = { deletes: true },
): void {
  const texts = entriesOf(change.files);
  const hashes = entriesOf(change.binaries);
  for (const [path] of [...texts, ...hashes]) {
    if (!isCleanPath(path)) throw new DocumentError("path.invalid");
  }
  const named = new Set<string>();
  for (const [path, text] of texts) {
    if (text === null ? !options.deletes : typeof text !== "string") {
      throw new DocumentError("doc.invalid");
    }
    if (text !== null) named.add(path);
  }
  for (const [path, hash] of hashes) {
    if (hash === null) {
      if (!options.deletes) throw new DocumentError("doc.invalid");
      continue;
    }
    if (typeof hash !== "string" || !BLOB_HASH.test(hash)) throw new DocumentError("doc.invalid");
    if (named.has(path)) throw new DocumentError("doc.invalid");
  }
}

/** The smallest single edit that turns `before` into `after`: the common start and end are left alone. */
function minimalEdit(
  before: string,
  after: string,
): { index: number; remove: number; insert: string } | undefined {
  const shortest = Math.min(before.length, after.length);
  let start = 0;
  while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  if (start === before.length && start === after.length) return undefined;
  // Never cut between the two halves of a surrogate pair.
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

const isHigh = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** Makes a text equal to `next` with the smallest edit, so that the same `Y.Text` lives on. */
function setText(text: Y.Text, next: string): void {
  const edit = minimalEdit(text.toString(), next);
  if (!edit) return;
  if (edit.remove > 0) text.delete(edit.index, edit.remove);
  if (edit.insert !== "") text.insert(edit.index, edit.insert);
}

function removeFile(cloud: CloudDoc, id: string): void {
  cloud.files.delete(id);
  cloud.binaries.delete(id);
  cloud.paths.delete(id);
}

/** The file each path names: of two ids with one path, the one that keeps it. */
function keepers(cloud: CloudDoc): Map<string, DocFile> {
  const byPath = new Map<string, DocFile>();
  for (const file of resolveFiles(cloud).files) {
    if (file.shown === file.path) byPath.set(file.path, file);
  }
  return byPath;
}

/** Writes the entries of a change into the maps; returns the ids of the files that are in it. */
function write(
  cloud: CloudDoc,
  change: FilesChange,
  random: (length: number) => Uint8Array,
): Set<string> {
  const current = keepers(cloud);
  const kept = new Set<string>();
  /** Replaces whatever is at the path (a file of the other kind) with a new file under a new id. */
  const put = (
    path: string,
    file: DocFile | undefined,
    kind: DocFile["kind"],
    make: (id: string) => void,
  ) => {
    if (file) removeFile(cloud, file.id);
    const id = newFileId(random);
    make(id);
    cloud.paths.set(id, path);
    current.set(path, { id, path, shown: path, kind });
    kept.add(id);
  };
  for (const [path, text] of entriesOf(change.files)) {
    const found = current.get(path);
    if (text === null) {
      if (found?.kind === "text") {
        removeFile(cloud, found.id);
        current.delete(path);
      }
    } else if (found?.kind === "text" && found.text) {
      setText(found.text, text);
      kept.add(found.id);
    } else {
      put(path, found, "text", (id) => {
        const created = new Y.Text();
        cloud.files.set(id, created);
        if (text !== "") created.insert(0, text);
      });
    }
  }
  for (const [path, hash] of entriesOf(change.binaries)) {
    const found = current.get(path);
    if (hash === null) {
      if (found?.kind === "binary") {
        removeFile(cloud, found.id);
        current.delete(path);
      }
    } else if (found?.kind === "binary") {
      if (found.hash !== hash) cloud.binaries.set(found.id, hash);
      kept.add(found.id);
    } else {
      put(path, found, "binary", (id) => cloud.binaries.set(id, hash));
    }
  }
  return kept;
}

/**
 * A path-keyed push as ONE transaction (origin `PUSH` unless told otherwise): a path that exists
 * keeps its id (a text keeps its `Y.Text`, edited by the smallest change), a new path gets a new
 * id, `null` deletes the file at that path. Of two ids with one path the one that keeps it is the
 * one the path names. Nothing is applied when the change is refused (`DocumentError`).
 */
export function applyFiles(cloud: CloudDoc, change: FilesChange, options: WriteOptions = {}): void {
  checkChange(change);
  const random = options.random ?? cryptoRandom;
  cloud.doc.transact(() => {
    write(cloud, change, random);
  }, options.origin ?? PUSH);
}

/**
 * Makes the document hold exactly these files, as ONE transaction (origin `RESTORE` unless told
 * otherwise): a path that is in both keeps its id (a text is edited by the smallest change), a
 * path that is new gets an id, and every other file goes, collision losers included.
 */
export function restoreFiles(
  cloud: CloudDoc,
  files: Readonly<Record<string, string>>,
  binaries: Readonly<Record<string, string>>,
  options: WriteOptions = {},
): void {
  const change: FilesChange = { files, binaries };
  checkChange(change, { deletes: false });
  const random = options.random ?? cryptoRandom;
  cloud.doc.transact(() => {
    const kept = write(cloud, change, random);
    const everyId = new Set<string>([
      ...cloud.paths.keys(),
      ...cloud.files.keys(),
      ...cloud.binaries.keys(),
    ]);
    for (const id of everyId) if (!kept.has(id)) removeFile(cloud, id);
  }, options.origin ?? RESTORE);
}

// Validation -----------------------------------------------------------------------------------

/** What a transaction touched: the ids whose entries changed and the texts that were edited. */
export interface Changes {
  readonly ids: Set<string>;
  readonly texts: Set<Y.Text>;
  /** Something outside the three maps and their texts changed: a document of another shape. */
  foreign: boolean;
}

export function noChanges(): Changes {
  return { ids: new Set(), texts: new Set(), foreign: false };
}

/** What a finished transaction changed, read from `transaction.changed`. */
export function collectChanges(cloud: CloudDoc, transaction: Y.Transaction): Changes {
  const changes = noChanges();
  const roots: ReadonlySet<unknown> = new Set([cloud.files, cloud.paths, cloud.binaries]);
  for (const [type, keys] of transaction.changed) {
    if (roots.has(type)) {
      for (const key of keys) {
        // A key of `null` is an item of the map's list part, which a map never has.
        if (key === null) changes.foreign = true;
        else changes.ids.add(key);
      }
    } else if (type instanceof Y.Text) {
      changes.texts.add(type);
    } else {
      changes.foreign = true;
    }
  }
  return changes;
}

export function mergeChanges(list: readonly Changes[]): Changes {
  const merged = noChanges();
  for (const one of list) {
    for (const id of one.ids) merged.ids.add(id);
    for (const text of one.texts) merged.texts.add(text);
    if (one.foreign) merged.foreign = true;
  }
  return merged;
}

/** Every id and text of a document: what a full validation checks. */
export function allChanges(cloud: CloudDoc): Changes {
  const changes = noChanges();
  for (const map of [cloud.files, cloud.paths, cloud.binaries]) {
    for (const id of map.keys()) changes.ids.add(id);
  }
  cloud.files.forEach((text) => {
    if (text instanceof Y.Text) changes.texts.add(text);
  });
  return changes;
}

/**
 * The most structs (the unit Yjs keeps in memory: an item of a map, a run of characters typed
 * together) a document may hold. The encoded size alone does not bound what the room holds in
 * memory: a struct that cannot be merged with its neighbour costs about 7 bytes encoded and about
 * 200 in the heap, so 16 MiB of such a document is far more than a 128 MB object can decode, and
 * a rollback builds a second copy beside the first. 250 000 structs are about 50 MB, which leaves
 * the room its rollback; a document people wrote is orders of magnitude below it.
 */
export const DOCUMENT_ITEMS = 250_000;

/** The limits of a document; `CLOUD_LIMITS` unless a test narrows them. */
export interface DocumentLimits {
  readonly files: number;
  readonly textCharacters: number;
  readonly documentBytes: number;
  /** Structs in the document; `DOCUMENT_ITEMS` when absent. */
  readonly items?: number;
}

export const DOCUMENT_LIMITS: DocumentLimits = {
  files: CLOUD_LIMITS.files,
  textCharacters: CLOUD_LIMITS.textCharacters,
  documentBytes: CLOUD_LIMITS.documentBytes,
  items: DOCUMENT_ITEMS,
};

/** How many structs the document holds in memory, a cheap sum over its clients. */
export function countItems(doc: Y.Doc): number {
  let count = 0;
  for (const structs of doc.store.clients.values()) count += structs.length;
  return count;
}

/** The names of the root types of a document that are not the three of a project's. */
export function strayRoots(doc: Y.Doc): string[] {
  const names: string[] = [];
  for (const name of doc.share.keys()) if (!ROOTS.has(name)) names.push(name);
  return names;
}

/**
 * Takes off a document what an update left that is not part of it: the updates that wait for what
 * they depend on (the room keeps none: a client that is asked for what is missing sends them
 * again) and the root types that decoding created for such an update or for one that was refused
 * half way, which no struct was integrated into. Answers what it found: whether an update was
 * waiting (`pending`), whether there was a stray root (`stray`), and whether one remains that holds
 * content, which only rebuilding the document can remove (`clean` is false).
 */
export function cleanse(doc: Y.Doc): { pending: boolean; stray: boolean; clean: boolean } {
  const store = doc.store;
  const pending = store.pendingStructs !== null || store.pendingDs !== null;
  store.pendingStructs = null;
  store.pendingDs = null;
  const strays = strayRoots(doc);
  let clean = true;
  for (const name of strays) {
    const root = doc.share.get(name);
    if (root && root._start === null && root._map.size === 0 && root._length === 0) {
      doc.share.delete(name);
    } else {
      clean = false;
    }
  }
  return { pending, stray: strays.length > 0, clean };
}

export interface ValidateOptions {
  /** Whether the project holds a binary with this hash (`project_blobs`). */
  hasBlob(hash: string): Promise<boolean>;
  /**
   * The size of the encoded document, in bytes. Asked once, and only after every other rule held;
   * the room answers it with an estimate when that is enough to know the limit is not reached.
   */
  encodedBytes(): number;
  readonly limits?: DocumentLimits;
}

/**
 * The first rule the changes of a transaction break, or `undefined` when they all hold. The
 * order: another shape (`doc.invalid`), a path (`path.invalid`), too many files (`quota.files`), a
 * text over its limit (`doc.too-large`), a hash the project never uploaded (`blob.unknown`), too
 * many structs in memory (`doc.too-large`) and the encoded document over its limit
 * (`doc.too-large`).
 *
 * Only what changed is looked at, so a keystroke costs a keystroke: the ids whose entries
 * changed, the texts that were edited, the number of entries. Every key of `files` and
 * `binaries` has a path, `files` values are `Y.Text`, `binaries` values are lowercase 64-hex
 * hashes, and an id is not both.
 */
export async function validateChanges(
  cloud: CloudDoc,
  changes: Changes,
  options: ValidateOptions,
): Promise<DocumentCode | undefined> {
  const limits = options.limits ?? DOCUMENT_LIMITS;
  if (changes.foreign) return "doc.invalid";
  if (strayRoots(cloud.doc).length > 0) return "doc.invalid";

  const hashes = new Set<string>();
  const texts = new Set(changes.texts);
  let invalidPath = false;
  for (const id of changes.ids) {
    if (!FILE_ID.test(id)) return "doc.invalid";
    const path = cloud.paths.get(id);
    const text = cloud.files.get(id);
    const hash = cloud.binaries.get(id);
    if (path !== undefined) {
      if (typeof path !== "string") return "doc.invalid";
      if (!isCleanPath(path)) invalidPath = true;
    }
    if (text === undefined && hash === undefined) continue;
    if (path === undefined) return "doc.invalid";
    if (text !== undefined && hash !== undefined) return "doc.invalid";
    if (text !== undefined) {
      if (!isPlainText(text)) return "doc.invalid";
      texts.add(text);
    }
    if (hash !== undefined) {
      if (typeof hash !== "string" || !BLOB_HASH.test(hash)) return "doc.invalid";
      hashes.add(hash);
    }
  }
  if (invalidPath) return "path.invalid";
  if (cloud.paths.size > limits.files) return "quota.files";
  for (const text of texts) if (text.length > limits.textCharacters) return "doc.too-large";
  for (const hash of hashes) if (!(await options.hasBlob(hash))) return "blob.unknown";
  if (countItems(cloud.doc) > (limits.items ?? DOCUMENT_ITEMS)) return "doc.too-large";
  if (options.encodedBytes() > limits.documentBytes) return "doc.too-large";
  return undefined;
}

/** The first rule a whole document breaks (every id, every text), or `undefined`. */
export function validateDocument(
  cloud: CloudDoc,
  options: ValidateOptions,
): Promise<DocumentCode | undefined> {
  return validateChanges(cloud, allChanges(cloud), options);
}
