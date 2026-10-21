// The weekly collection of blobs (`cloud-projects`, "Usage and storage quota"): what no project, no
// upload and no version references is removed once it is more than seven days old. Plain functions over
// the store and the bucket, with the clock injected, so that every rule runs in Node.
//
// Two kinds of garbage, collected in this order:
//
//   1. Blob rows that nothing references. The ROW goes first (the store removes it only while it is
//      still unreferenced and still old, so a blob registered or referenced since the list was read
//      stays) and the bytes second, so a failure in between leaves an object that no row names and
//      never a row without bytes. Between the two a writer may put the same bytes again (an upload,
//      a materialisation) and register them after the row went: its put renews the object's upload
//      time, so an object written since the cutoff is not deleted, and is left for its writer's row
//      (or, if there is none, for the run that finds it an orphan).
//   2. Objects under `blobs/` that no row names and that are more than seven days old: what a
//      materialisation put to R2 before its batch failed, and what step 1 could not delete. They are
//      found by listing the bucket, the only way to find an object nobody has a row for.
//
// Each run is bounded (a few thousand blobs and objects), so a Worker invocation never runs long;
// what is left is collected by the next run, a week on.

import type { R2Like } from "./env.js";
import { BLOB_HASH } from "./document.js";
import { blobKey } from "./keys.js";
import type { CloudStore } from "./store/types.js";

/** A blob nothing references stays this long before it is collected: seven days. */
export const COLLECT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** The keys of the blobs: `blobKey(hash)` is this and the hash. */
const BLOB_PREFIX = blobKey("");

/** How many blob rows one round of step 1 takes. */
const ROUND_ROWS = 500;
/** How many rounds one run makes at most. */
const ROUNDS = 20;
/** How many objects a page of the listing holds. */
const PAGE_OBJECTS = 1000;
/** How many pages of the listing one run reads at most. */
const PAGES = 20;
/** How many objects are deleted at the same time. */
const DELETES_AT_ONCE = 8;

export interface CollectContext {
  readonly store: CloudStore;
  readonly blobs: R2Like;
  now(): Date;
}

export interface CollectOptions {
  /** How old a blob must be to be collected; seven days by default (a test and the development route narrow it). */
  readonly olderThanMs?: number;
}

export interface CollectResult {
  /** Blob rows removed. */
  readonly rows: number;
  /** Objects deleted for those rows. */
  readonly objects: number;
  /** Objects that no row named, deleted. */
  readonly orphans: number;
  /** Deletes of an object that failed: the object is found as an orphan next time. */
  readonly failures: number;
  /** A bound was reached with work left for the next run. */
  readonly truncated: boolean;
}

/**
 * Collects what nothing references and is older than seven days. A failure of the store is thrown (the
 * run did not finish and the next one does); a failure to delete an object is counted, because the row
 * is already gone and the object is collected as an orphan next time.
 */
export async function collectBlobs(
  context: CollectContext,
  options: CollectOptions = {},
): Promise<CollectResult> {
  const { store, blobs } = context;
  const olderThanMs = options.olderThanMs ?? COLLECT_AFTER_MS;
  const cutoffMs = context.now().getTime() - olderThanMs;
  const cutoff = new Date(cutoffMs).toISOString();

  let rows = 0;
  let objects = 0;
  let orphans = 0;
  let failures = 0;
  let truncated = false;

  /** The objects this run could not delete: it does not try them again as orphans. */
  const stuck = new Set<string>();

  /**
   * Deletes the objects of these hashes; answers how many went. With `rewritten` an object whose
   * upload time is after the cutoff is not deleted: its bytes were put again since its row went.
   */
  const deleteObjects = async (hashes: readonly string[], rewritten = false): Promise<number> => {
    let deleted = 0;
    const remove = async (hash: string): Promise<boolean> => {
      if (rewritten) {
        const object = await blobs.head(blobKey(hash));
        if (object?.uploaded && object.uploaded.getTime() >= cutoffMs) return false;
      }
      await blobs.delete(blobKey(hash));
      return true;
    };
    for (let at = 0; at < hashes.length; at += DELETES_AT_ONCE) {
      const batch = hashes.slice(at, at + DELETES_AT_ONCE);
      const results = await Promise.allSettled(batch.map(remove));
      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          if (result.value) deleted += 1;
        } else {
          failures += 1;
          stuck.add(batch[i] as string);
        }
      });
    }
    return deleted;
  };

  for (let round = 0; round < ROUNDS; round++) {
    const hashes = await store.unreferencedBlobs(cutoff, ROUND_ROWS);
    if (hashes.length === 0) break;
    const removed = await store.deleteBlobs(hashes, cutoff);
    rows += removed.length;
    objects += await deleteObjects(removed, true);
    // Nothing went: what was listed is referenced again, and the list would be the same next round.
    if (removed.length === 0) break;
    if (round === ROUNDS - 1 && hashes.length === ROUND_ROWS) truncated = true;
  }

  let cursor: string | undefined;
  for (let page = 0; page < PAGES; page++) {
    const listed = await blobs.list({
      prefix: BLOB_PREFIX,
      limit: PAGE_OBJECTS,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const old: string[] = [];
    for (const object of listed.objects) {
      if (!object.key.startsWith(BLOB_PREFIX)) continue;
      const hash = object.key.slice(BLOB_PREFIX.length);
      // A key that is not a hash is not ours to judge; an object younger than the cutoff may still be
      // waiting for its row (a materialisation puts the bytes first).
      if (BLOB_HASH.test(hash) && object.uploaded.getTime() < cutoffMs && !stuck.has(hash)) {
        old.push(hash);
      }
    }
    if (old.length > 0) {
      const named = await store.blobsPresent(old);
      orphans += await deleteObjects(old.filter((hash) => !named.has(hash)));
    }
    if (!listed.truncated || listed.cursor === undefined) break;
    cursor = listed.cursor;
    if (page === PAGES - 1) truncated = true;
  }

  return { rows, objects, orphans, failures, truncated };
}
