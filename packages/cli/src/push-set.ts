/**
 * The push set and its comparison (`cli-cloud`, "Push"): what a folder offers the cloud project, and
 * how it differs from what the cloud holds.
 *
 * The set is the folder's project as `validate` reads it, widened to every file the cloud keeps:
 * `project.json`, the `.meltemi` sources, themes, and the other text files (`isTextPath`) travel by
 * content; images and fonts travel by hash (`png`, `jpg`, `jpeg`, `gif`, `webp`, `woff2`, `ttf`,
 * `otf`, at most 10 MiB each). Never part of it: dotfiles and dot folders (`.git`), `node_modules`,
 * what the manifest's `exclude` names, the catalog's output (`catalog.out`), links (never followed)
 * and files of a kind the cloud does not keep (listed as `ignored`).
 *
 * A file the folder has but cannot send (its path breaks the cloud's path rule, it is not UTF-8,
 * it cannot be read) is reported in `notSent`, never sent, and never leads to the deletion of the
 * cloud's file of that name. The same goes for anything the folder deliberately leaves out.
 *
 * `compareWithCloud` compares every path against the cloud's files, fetched once: text by content,
 * binaries by hash, cloud paths absent from the folder as deletions.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ALWAYS_EXCLUDED,
  CLOUD_LIMITS,
  DEFAULT_CATALOG,
  isCleanPath,
  isTextPath,
  type ProjectManifest,
} from "@meltemi/diagrams-project";
import { sha256Hex } from "./cloud-client.js";
import { CloudError } from "./cloud-errors.js";
import { collisionLosers } from "./cloud-paths.js";

export type FileKind = "text" | "binary";

/** Extensions of the images and fonts the cloud keeps by hash (SVG is a text file in a cloud project). */
const BINARY_EXTENSIONS: readonly string[] = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "woff2",
  "ttf",
  "otf",
];

/** What the cloud keeps a path as: text, an image or a font, or nothing (undefined). */
export function kindOfPath(path: string): FileKind | undefined {
  if (isTextPath(path)) return "text";
  const dot = path.lastIndexOf(".");
  const extension = dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
  return BINARY_EXTENSIONS.includes(extension) ? "binary" : undefined;
}

/** A text of 2 Mi characters takes at most four bytes each: a file over this is too large unread. */
const MAX_TEXT_BYTES = CLOUD_LIMITS.textCharacters * 4;

const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** An image or a font of the folder: its hash, its size and where it is. */
export interface LocalBinary {
  readonly hash: string;
  readonly size: number;
  /** The file, as a native absolute path, read again when it is uploaded. */
  readonly file: string;
}

export type NotSentReason = "path" | "encoding" | "unreadable";

/** A file or folder of the project that is not sent, and why. */
export interface NotSent {
  /** The project path; a folder ends with `/`. */
  readonly path: string;
  readonly reason: NotSentReason;
  /** The system's reason, for `unreadable`. */
  readonly detail?: string;
}

/** A file over a limit of the cloud: refused before anything is sent, with the service's code. */
export interface OverLimit {
  readonly path: string;
  readonly code: "doc.too-large" | "quota.binary";
}

export interface PushSet {
  /** The folder, as a native absolute path. */
  readonly folder: string;
  /** Path to text, `project.json` included. */
  readonly texts: Map<string, string>;
  /** Path to the image or font. */
  readonly binaries: Map<string, LocalBinary>;
  readonly notSent: NotSent[];
  /** Files of a kind the cloud does not keep, and links. */
  readonly ignored: string[];
  readonly overLimit: OverLimit[];
  /** Whether the folder holds more files than the cloud keeps (the walk stopped reading). */
  readonly truncated: boolean;
  /** Whether a path is one the folder leaves out on purpose or could not send. */
  holds(path: string): boolean;
}

/**
 * Whether a project path is left out of the push set by rule: a hidden name, `node_modules`, a
 * path the manifest excludes or the catalog's output.
 */
export function leftOutRule(manifest: ProjectManifest | null): (path: string) => boolean {
  const excluded = [...(manifest?.exclude ?? []), manifest?.catalog.out ?? DEFAULT_CATALOG.out];
  return (path) =>
    path
      .split("/")
      .some(
        (name) => name.startsWith(".") || (ALWAYS_EXCLUDED as readonly string[]).includes(name),
      ) ||
    excluded.some((entry) => entry === "." || path === entry || path.startsWith(`${entry}/`));
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * Reads the push set of a folder. `manifest` is its `project.json` as read (null when there is
 * none): its `exclude` and `catalog.out` shape the set. Never follows a link, never reads past what
 * a limit refuses, and never throws for a file: each is either part of the set or listed.
 */
export function readPushSet(folder: string, manifest: ProjectManifest | null): PushSet {
  const leftOut = leftOutRule(manifest);
  const texts = new Map<string, string>();
  const binaries = new Map<string, LocalBinary>();
  const notSent: NotSent[] = [];
  const ignored: string[] = [];
  const overLimit: OverLimit[] = [];
  let kept = 0;
  let truncated = false;

  const readFile = (path: string, kind: FileKind, file: string): void => {
    let size: number;
    try {
      size = statSync(file).size;
    } catch (error) {
      notSent.push({ path, reason: "unreadable", detail: (error as Error).message });
      return;
    }
    if (kind === "binary" && size > CLOUD_LIMITS.binaryBytes) {
      overLimit.push({ path, code: "quota.binary" });
      return;
    }
    if (kind === "text" && size > MAX_TEXT_BYTES) {
      overLimit.push({ path, code: "doc.too-large" });
      return;
    }
    let raw: Buffer;
    try {
      raw = readFileSync(file);
    } catch (error) {
      notSent.push({ path, reason: "unreadable", detail: (error as Error).message });
      return;
    }
    if (kind === "binary") {
      binaries.set(path, { hash: sha256Hex(raw), size: raw.byteLength, file });
      return;
    }
    let text: string;
    try {
      text = DECODER.decode(raw);
    } catch {
      notSent.push({ path, reason: "encoding" });
      return;
    }
    if (text.length > CLOUD_LIMITS.textCharacters) overLimit.push({ path, code: "doc.too-large" });
    else texts.set(path, text);
  };

  const visit = (absolute: string, prefix: string): void => {
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch (error) {
      notSent.push({ path: `${prefix}/`, reason: "unreadable", detail: (error as Error).message });
      return;
    }
    for (const entry of entries.sort(byName)) {
      if (truncated) return;
      const name = entry.name;
      if (name.startsWith(".")) continue;
      const path = prefix === "" ? name : `${prefix}/${name}`;
      if (leftOut(path)) continue;
      if (entry.isSymbolicLink()) {
        ignored.push(path);
        continue;
      }
      if (entry.isDirectory()) {
        if (isCleanPath(name)) visit(join(absolute, name), path);
        else notSent.push({ path: `${path}/`, reason: "path" });
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = kindOfPath(path);
      if (kind === undefined) {
        ignored.push(path);
        continue;
      }
      if (!isCleanPath(path)) {
        notSent.push({ path, reason: "path" });
        continue;
      }
      // One file past the limit is enough to refuse the push; there is no point in reading the rest.
      if (kept > CLOUD_LIMITS.files) {
        truncated = true;
        return;
      }
      kept++;
      readFile(path, kind, join(absolute, name));
    }
  };
  visit(folder, "");

  const set: PushSet = {
    folder,
    texts,
    binaries,
    notSent,
    ignored,
    overLimit,
    truncated,
    holds: (path) =>
      leftOut(path) ||
      notSent.some(
        (item) => item.path === path || (item.path.endsWith("/") && path.startsWith(item.path)),
      ) ||
      // A link to a folder holds everything under it: the folder is left out, never deleted.
      ignored.some((link) => link === path || path.startsWith(`${link}/`)) ||
      // A root that could not be read holds the whole folder.
      notSent.some((item) => item.path === "/") ||
      overLimit.some((item) => item.path === path),
  };
  return set;
}

/**
 * The refusal the limits of the cloud call for, before anything is sent, with the service's own
 * code: a file over its limit (`doc.too-large`, `quota.binary`, naming the path), more than 2000
 * files (`quota.files`), texts over the 16 MiB a project's document holds (`doc.too-large`).
 */
export function limitError(set: PushSet): CloudError | undefined {
  const first = set.overLimit[0];
  if (first) {
    return new CloudError(
      first.code,
      first.code === "quota.binary"
        ? `${first.path} is larger than the 10 MiB an image or font may be.`
        : `${first.path} is larger than the 2 Mi characters a text file may have.`,
      { details: { path: first.path } },
    );
  }
  if (set.truncated || set.texts.size + set.binaries.size > CLOUD_LIMITS.files) {
    return new CloudError(
      "quota.files",
      `The folder holds more than the ${CLOUD_LIMITS.files} files a project may.`,
    );
  }
  let bytes = 0;
  for (const text of set.texts.values()) bytes += Buffer.byteLength(text);
  if (bytes > CLOUD_LIMITS.documentBytes) {
    return new CloudError(
      "doc.too-large",
      "The texts of the folder are larger than a project's 16 MiB.",
    );
  }
  return undefined;
}

// --------------------------------------------------------------------------------- comparison

/** One path whose cloud state differs from the folder's. */
export interface Difference {
  readonly path: string;
  /** What the folder holds there; what the cloud holds for a deletion. */
  readonly kind: FileKind;
  /** `added`: not in the cloud yet. `changed`: both have it and it differs. `deleted`: only in the cloud. */
  readonly change: "added" | "changed" | "deleted";
}

/** A cloud path the push leaves alone, and why. */
export interface LeftAlone {
  readonly path: string;
  readonly why: "collision" | "kept-out";
}

export interface Comparison {
  /** Every path that differs, by path. */
  readonly differences: readonly Difference[];
  readonly left: readonly LeftAlone[];
}

/** The cloud's files as `GET …/files` answers them. */
export interface CloudState {
  readonly files: Readonly<Record<string, string>>;
  readonly binaries: Readonly<Record<string, string>>;
  readonly collisions: readonly unknown[];
}

/**
 * Compares every path of the push set with the cloud's: text files by content, binaries by hash and
 * cloud paths the folder lacks as deletions. A cloud path left alone: the loser of a name collision
 * (`<path>~<id>`, which the path rule refuses to send), and one the folder keeps out on purpose or
 * could not send (excluded, unreadable, not UTF-8).
 */
export function compareWithCloud(set: PushSet, cloud: CloudState): Comparison {
  const differences: Difference[] = [];
  const left: LeftAlone[] = [];
  const cloudTexts = new Map(Object.entries(cloud.files));
  const cloudBinaries = new Map(Object.entries(cloud.binaries));
  const losers = collisionLosers([...cloudTexts.keys(), ...cloudBinaries.keys()], cloud.collisions);

  for (const [path, text] of set.texts) {
    const held = cloudTexts.get(path);
    if (held === undefined) {
      differences.push({
        path,
        kind: "text",
        change: cloudBinaries.has(path) ? "changed" : "added",
      });
    } else if (held !== text) differences.push({ path, kind: "text", change: "changed" });
  }
  for (const [path, binary] of set.binaries) {
    const held = cloudBinaries.get(path);
    if (held === undefined) {
      differences.push({
        path,
        kind: "binary",
        change: cloudTexts.has(path) ? "changed" : "added",
      });
    } else if (held !== binary.hash) differences.push({ path, kind: "binary", change: "changed" });
  }
  const cloudOnly = (path: string, kind: FileKind): void => {
    if (set.texts.has(path) || set.binaries.has(path)) return;
    if (losers.has(path)) left.push({ path, why: "collision" });
    else if (!isCleanPath(path) || set.holds(path)) left.push({ path, why: "kept-out" });
    else differences.push({ path, kind, change: "deleted" });
  };
  for (const path of cloudTexts.keys()) cloudOnly(path, "text");
  for (const path of cloudBinaries.keys()) cloudOnly(path, "binary");

  const byPath = (a: { path: string }, b: { path: string }) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  return { differences: differences.sort(byPath), left: left.sort(byPath) };
}

/** What a push sends, as `PUT …/files` takes it, and the binaries to put in the cloud first. */
export interface PushPlan {
  /** Path to text, or `null` to delete the path. Only what differs. */
  readonly texts: Record<string, string | null>;
  /** Path to the hash of an image or font, or `null` to delete the path. Only what differs. */
  readonly binaries: Record<string, string | null>;
  /** The images and fonts that differ and so need their bytes in the cloud before the push. */
  readonly uploads: readonly { readonly path: string; readonly binary: LocalBinary }[];
}

/**
 * What it takes to make the cloud equal to the set, given the comparison: the texts that differ, the
 * hashes that differ, the deletions, and a deletion of the other kind of a path whose kind changed.
 */
export function planPush(set: PushSet, comparison: Comparison, cloud: CloudState): PushPlan {
  const texts: Record<string, string | null> = {};
  const binaries: Record<string, string | null> = {};
  const uploads: { path: string; binary: LocalBinary }[] = [];
  for (const { path, kind, change } of comparison.differences) {
    if (change === "deleted") {
      if (kind === "text") texts[path] = null;
      else binaries[path] = null;
    } else if (kind === "text") {
      texts[path] = set.texts.get(path)!;
      if (Object.hasOwn(cloud.binaries, path)) binaries[path] = null;
    } else {
      const binary = set.binaries.get(path)!;
      binaries[path] = binary.hash;
      uploads.push({ path, binary });
      if (Object.hasOwn(cloud.files, path)) texts[path] = null;
    }
  }
  return { texts, binaries, uploads };
}
