// Materialisation: the room's files written to content-addressed blobs and to `project_files`, by
// diff (`cloud-projects`, "Reads, pushes and materialisation"). The room calls `materialise()` thirty
// seconds after the last change, when the last client leaves and on demand (before a version); it
// never lets a failure reach the document.
//
// The order is the guarantee. R2 first, D1 second: a blob row (and a `project_files` row) is written
// only after the bytes it names are in R2, so a row never points at nothing, and an R2 failure
// throws before D1 is touched. The D1 side is ONE atomic step (`applyMaterialisation`: blob rows,
// deleted paths, changed paths, the project's revision and time), so a failure there leaves the
// project's rows as they were. What was put to R2 in vain waits for the weekly collection (`collect.ts`,
// which also finds an object that never got a row). Once the rows are written, the first
// materialisation of a UTC day that changed the files records the daily version (`versions.ts`).

import { utf8, hex, type Bytes } from "./crypto.js";
import type { R2Like } from "./env.js";
import { blobKey } from "./keys.js";
import type { CloudStore, NewBlob } from "./store/types.js";
import { recordDailyVersion } from "./versions.js";

/** The state of a project the room hands to `materialise()`. */
export interface MaterialiseInput {
  readonly projectId: string;
  /** The room's revision this state is the document at. */
  readonly revision: number;
  /** Path to text, as `snapshot()` gives it (a collision loser appears as `<path>~<id>`). */
  readonly files: Readonly<Record<string, string>>;
  /** Path to the SHA-256 (hex) of the bytes of an image or a font. */
  readonly binaries: Readonly<Record<string, string>>;
}

/** What `materialise()` works with: the store, the R2 bucket (`env.BLOBS`) and the clock. */
export interface MaterialiseContext {
  readonly store: CloudStore;
  readonly blobs: R2Like;
  now(): Date;
}

/** The media type a text file's blob is registered with (the first registration of a hash stands). */
export const TEXT_MEDIA_TYPE = "text/plain";

/** How many blobs are put to R2 at the same time. */
const PUTS_AT_ONCE = 8;

export { blobKey };

/** SHA-256 of bytes, lowercase hexadecimal. */
export async function sha256OfBytes(bytes: Bytes): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

interface TextBlob {
  readonly hash: string;
  readonly bytes: Bytes;
}

/**
 * Writes the state to `blobs` and `project_files` by diff. Answers how many D1 rows it wrote (the
 * development counter: the blob rows, the changed and the deleted paths, the project's row and, when
 * something changed, the person's usage), or `"gone"` when the project no longer exists. A failure
 * is thrown and the room logs it without the content and tries again at its next trigger.
 *
 * The same content has the same hash: two files with the same text, or one text edited back to what
 * it was, share one blob, and a hash that is already a row of `blobs` is not a second row. It is sent
 * with the rest all the same: the store inserts a row that is not there and renews the time of one
 * that is, in the very batch that gives a path the hash. A row left as it was, with its old time,
 * could be taken by the weekly collection between the moment it was found to exist and the moment
 * a path referenced it, which would leave the path naming a hash with no row and no bytes.
 */
export async function materialise(
  context: MaterialiseContext,
  input: MaterialiseInput,
): Promise<{ rowsWritten: number } | "gone"> {
  const { store, blobs, now } = context;
  const { projectId } = input;

  // What the project should hold: every text file by the hash of its UTF-8 bytes, and every image
  // and font by the hash it was uploaded with (their blobs are in R2 and `blobs` already).
  const wanted = new Map<string, string>();
  const texts = new Map<string, TextBlob>();
  for (const [path, text] of Object.entries(input.files)) {
    const bytes = utf8(text);
    const hash = await sha256OfBytes(bytes);
    wanted.set(path, hash);
    texts.set(hash, { hash, bytes });
  }
  for (const [path, hash] of Object.entries(input.binaries)) wanted.set(path, hash);

  // The revision the last materialisation recorded: the same one again is no change to the project's row.
  const stored = await store.projectById(projectId);

  // The diff against what the last materialisation wrote: only the paths whose hash changed are
  // written and only the paths that are gone are deleted.
  const current = await store.projectFiles(projectId);
  const upserts = new Map<string, string>();
  for (const [path, hash] of wanted) if (current.get(path) !== hash) upserts.set(path, hash);
  const deletes = [...current.keys()].filter((path) => !wanted.has(path));

  // The blobs the changed paths bring in. A hash the project already holds under another path was
  // written when that path was; the others may be new to `blobs` (or only to this project).
  const held = new Set(current.values());
  const candidates = new Map<string, TextBlob>();
  for (const hash of upserts.values()) {
    const text = texts.get(hash);
    if (text && !held.has(hash)) candidates.set(hash, text);
  }
  // R2 before any row: the bytes of every candidate are put (a put is idempotent, the key is the
  // hash of the bytes, and it heals an object that went missing, and it renews the object's upload
  // time, which is what keeps the collection from deleting it). A put that fails throws here,
  // before D1 is touched.
  const list = [...candidates.values()];
  for (let at = 0; at < list.length; at += PUTS_AT_ONCE) {
    await Promise.all(
      list.slice(at, at + PUTS_AT_ONCE).map(({ hash, bytes }) => blobs.put(blobKey(hash), bytes)),
    );
  }
  const added: NewBlob[] = list.map(({ hash, bytes }) => ({
    hash,
    size: bytes.length,
    mediaType: TEXT_MEDIA_TYPE,
  }));

  const written = await store.applyMaterialisation({
    projectId,
    upserts,
    deletes,
    blobs: added,
    revision: input.revision,
    now: now().toISOString(),
  });
  if (!written) return "gone";

  // The person's usage follows what the project references; nothing changed, nothing to count.
  let rowsWritten =
    added.length + upserts.size + deletes.length + (stored?.revision === input.revision ? 0 : 1);
  let owner: string | undefined;
  if (upserts.size > 0 || deletes.length > 0) {
    owner = await store.ownerOf(projectId);
    if (owner === undefined) return "gone";
    await store.refreshStorageBytes(owner);
    rowsWritten += 1;
  }

  // The first materialisation of a UTC day that finds the files changed since the latest version
  // records the daily version. It happens after the files are safely written and is never allowed to
  // fail the materialisation: the room would try the same files again, and the rows are already right.
  try {
    rowsWritten += await recordDailyVersion(store, {
      projectId,
      files: wanted,
      now: now(),
      ...(owner === undefined ? {} : { owner }),
    });
  } catch {
    console.warn("cloud: the daily version of a project could not be recorded");
  }
  return { rowsWritten };
}
