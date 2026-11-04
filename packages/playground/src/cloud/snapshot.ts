// A project read once, for a person nobody is signed in as (`project-sharing`, "Viewing by link"): the
// files (`GET …/files`) and the bytes of its images and fonts (`GET …/blobs/<hash>`) go into the
// Studio and that is all. No socket, no IndexedDB, nothing kept in this browser: the Studio is
// loaded as a bound document loads it (`remote`), which is no edit of the person's and moves nothing
// to the browser's storage, and the anonymous project the browser keeps is never touched. After
// five minutes the page offers to read it again.

import type { Studio } from "../studio.js";
import type { Timers } from "./binding.js";
import type { CloudApi, Outcome } from "./client.js";
import { STALE_AFTER_MS } from "./view-model.js";

/** Images and fonts fetched at once. */
const FETCHES_AT_ONCE = 4;

export interface SnapshotDeps {
  readonly studio: Pick<Studio, "load" | "open">;
  readonly api: Pick<CloudApi, "files" | "blob">;
  readonly timers: Timers;
  /** The snapshot became old (true) or was read again (false). */
  readonly stale: (stale: boolean) => void;
}

export interface SnapshotResult {
  /** The files that went into the Studio. */
  readonly files: number;
  /** The images and fonts whose bytes could not be fetched: the project shows without them. */
  readonly missing: readonly string[];
  /** The page was left, or read again, while this was in flight: nothing was loaded. */
  readonly cancelled: boolean;
}

export class SnapshotViewer {
  private generation = 0;
  private timer: unknown;
  private project: string | undefined;

  constructor(private readonly deps: SnapshotDeps) {}

  /** The project the snapshot shows, or undefined when there is none. */
  get id(): string | undefined {
    return this.project;
  }

  /** Reads the project's files and puts them in the Studio, keeping the file open if it is still there. */
  async load(id: string): Promise<Outcome<SnapshotResult>> {
    const generation = ++this.generation;
    this.deps.timers.clear(this.timer);
    this.timer = undefined;
    const fetched = await this.deps.api.files(id);
    if (!fetched.ok) return fetched;
    const { files, binaries } = fetched.value;
    const paths = Object.keys(binaries);
    const bytes = new Map<string, Uint8Array>();
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < paths.length && generation === this.generation) {
        const path = paths[next++]!;
        const blob = await this.deps.api.blob(id, binaries[path]!);
        if (blob.ok) bytes.set(path, blob.value);
      }
    };
    await Promise.all(Array.from({ length: Math.min(FETCHES_AT_ONCE, paths.length) }, worker));
    if (generation !== this.generation) {
      return { ok: true, value: { files: 0, missing: [], cancelled: true } };
    }
    const entries: [string, string | Uint8Array][] = Object.entries(files);
    const missing: string[] = [];
    for (const path of paths) {
      const content = bytes.get(path);
      if (content) entries.push([path, content]);
      else missing.push(path);
    }
    this.project = id;
    const open = this.deps.studio.open;
    this.deps.studio.load(entries, open === "" ? undefined : open, { remote: true });
    this.deps.stale(false);
    this.timer = this.deps.timers.set(() => {
      this.timer = undefined;
      if (generation === this.generation) this.deps.stale(true);
    }, STALE_AFTER_MS);
    return { ok: true, value: { files: entries.length, missing, cancelled: false } };
  }

  /** Reads the same project again (the person asked to see changes). */
  reload(): Promise<Outcome<SnapshotResult>> {
    const id = this.project;
    if (id === undefined) {
      return Promise.resolve({ ok: false, failure: { kind: "unexpected", status: 0 } });
    }
    return this.load(id);
  }

  /** Stops: the hint's timer is dropped and what is still in flight loads nothing. */
  close(): void {
    this.generation++;
    this.deps.timers.clear(this.timer);
    this.timer = undefined;
    this.project = undefined;
  }
}
