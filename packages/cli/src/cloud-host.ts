/**
 * A cloud project as a `ProjectHost` (`cli-cloud`, "Projects and review against the cloud"): what
 * `review --base cloud[:<n>]` compares the folder with, as `gitRevisionHost` is what `review
 * --base <revision>` compares it with.
 *
 * A `ProjectHost` is synchronous, so the cloud is read once, up front: the project's files (or a
 * version's) and the images and fonts they reference, each blob once. Every path the service
 * answers then goes through the path rule of the cloud (`isCleanPath`) and must resolve inside the
 * project's root; one that does not is `pull.unsafe-path` and nothing is compared. The only paths
 * left out without a word are the losers of a name collision (`<path>~<id>`, listed in the
 * answer's `collisions`): the service keeps them out of copies and restores for the same reason.
 *
 * The host is rooted at the local project root, like the git host is rooted at the repository:
 * `<root>/<path>` answers the fetched text or bytes and `readDirectory` is made from the path set.
 */

import { createMemoryHost, joinPath, type ProjectHost } from "@meltemi/diagrams-project";
import type { CloudClient } from "./cloud-client.js";
import {
  collisionLosers,
  insideFolder,
  pathProblem,
  printablePath,
  setProblems,
} from "./cloud-paths.js";
import { CloudError, isCloudError } from "./cloud-errors.js";

/** The most blobs fetched at once. */
const BLOB_CONCURRENCY = 4;

/** The files of a cloud project as the service answered them, before any host is made of them. */
export interface CloudSnapshot {
  /** The room's revision of a snapshot of the current files; undefined for a version. */
  readonly revision: number | undefined;
  /** The version the snapshot is of; undefined for the current files. */
  readonly version: number | undefined;
  /** Path to text. */
  readonly files: ReadonlyMap<string, string>;
  /** Path to the hash and the bytes of an image or a font. */
  readonly binaries: ReadonlyMap<string, { readonly hash: string; readonly bytes: Uint8Array }>;
  /** Collision losers (`<path>~<id>`) that were left out. */
  readonly skipped: readonly string[];
}

/**
 * Whether a path the cloud answered is NOT safe to put under `root` by itself, with the checks
 * `pull` makes (`cloud-paths.ts`): it breaks the cloud's path rule, a name of it could not be kept
 * on Windows (a device name such as `con` or `com1.txt`, a name that ends with a dot or a space), or
 * joined to the root it leaves it (or is the root itself). What only a set of paths can show
 * (`setProblems`) is checked by `checkCloudPaths`.
 */
export function unsafeCloudPath(root: string, path: string): boolean {
  return pathProblem(path) !== undefined || insideFolder(root, path) === undefined;
}

/**
 * Fails with `pull.unsafe-path` naming the first of `paths` that is not safe under `root`: one that
 * `unsafeCloudPath` refuses, or that cannot be written beside the others, because it differs from
 * another only in letter case (one overwrites the other on Windows and macOS) or is a file where
 * another path needs a folder. The path is named as `pull` names it, escaped (`printablePath`), as it
 * is the cloud's to choose and the terminal is the person's.
 */
export function checkCloudPaths(root: string, paths: Iterable<string>): void {
  const all = [...paths];
  const together = setProblems(all.filter((path) => pathProblem(path) === undefined));
  for (const path of all) {
    if (!unsafeCloudPath(root, path) && !together.has(path)) continue;
    const shown = printablePath(path);
    throw new CloudError(
      "pull.unsafe-path",
      `The cloud project holds ${JSON.stringify(shown)}, which is not a safe path inside the folder.`,
      { details: { path: shown } },
    );
  }
}

/** Runs `task` over `items`, at most `limit` at a time; the first failure is the one thrown. */
async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: unknown;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await task(items[index]!);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failure;
  return results;
}

/**
 * Reads a cloud project once: its current files, or version `version`'s, and the blobs they
 * reference. `root` is the folder the paths are checked against (`pull.unsafe-path`, before any
 * blob is fetched). An unknown version is `version.not-found` naming it; an unknown project,
 * `project.not-found`.
 */
export async function fetchCloudSnapshot(
  client: CloudClient,
  options: { readonly project: string; readonly root: string; readonly version?: number },
): Promise<CloudSnapshot> {
  const { project, root, version } = options;
  let answer;
  try {
    answer =
      version === undefined
        ? await client.files(project)
        : await client.readVersion(project, version);
  } catch (error) {
    if (isCloudError(error, "version.not-found")) {
      throw new CloudError(error.code, error.message, {
        status: error.status,
        details: { ...error.details, project, version },
      });
    }
    throw error;
  }
  // The losers of a name collision (`<path>~<id>`) are display names: left out, as pull and push do.
  const losers = collisionLosers(
    [...Object.keys(answer.files), ...Object.keys(answer.binaries)],
    "collisions" in answer ? answer.collisions : [],
  );
  const files = new Map(Object.entries(answer.files).filter(([path]) => !losers.has(path)));
  const hashes = new Map(Object.entries(answer.binaries).filter(([path]) => !losers.has(path)));
  checkCloudPaths(root, [...files.keys(), ...hashes.keys()]);

  const wanted = [...new Set(hashes.values())];
  const fetched = await pooled(wanted, BLOB_CONCURRENCY, (hash) => client.blob(project, hash));
  const bytesOf = new Map(wanted.map((hash, index) => [hash, fetched[index]!]));
  return {
    revision: "revision" in answer ? answer.revision : undefined,
    version,
    files,
    binaries: new Map(
      [...hashes].map(([path, hash]) => [path, { hash, bytes: bytesOf.get(hash)! }] as const),
    ),
    skipped: [...new Set([...Object.keys(answer.files), ...Object.keys(answer.binaries)])].filter(
      (path) => losers.has(path),
    ),
  };
}

/** The host of a snapshot, rooted at `root`: `<root>/<path>` is the file the cloud holds there. */
export function cloudSnapshotHost(root: string, snapshot: CloudSnapshot): ProjectHost {
  const contents: Record<string, string | Uint8Array> = {};
  for (const [path, text] of snapshot.files) contents[joinPath(root, path)] = text;
  for (const [path, binary] of snapshot.binaries) contents[joinPath(root, path)] = binary.bytes;
  return createMemoryHost(contents);
}

/**
 * The host of a cloud project (`project`, its current files or those of `version`) rooted at the
 * local project root `root`, filled by one prefetch (`fetchCloudSnapshot`).
 */
export async function cloudHost(
  client: CloudClient,
  options: { readonly project: string; readonly root: string; readonly version?: number },
): Promise<ProjectHost> {
  return cloudSnapshotHost(options.root, await fetchCloudSnapshot(client, options));
}
