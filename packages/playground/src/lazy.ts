const decoder = new TextDecoder();

/** Fetches a file of the page's own origin; undefined when it does not exist. */
export type Fetcher = (url: string) => Promise<Uint8Array | undefined>;

export const fetchBytes: Fetcher = async (url) => {
  const response = await fetch(url, { credentials: "same-origin" });
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
};

/**
 * Files the libraries read synchronously (fonts, Tabler data), fetched from the page's own origin
 * on demand. A read of a file not fetched yet returns undefined and starts the fetch; when files
 * arrive, listeners hear it so that the page can analyse again with them. The libraries already
 * degrade on a missing file, so nothing waits for a file except exports, which `settle`.
 */
export class LazyFiles {
  private readonly cache = new Map<string, Uint8Array | null>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  /** True when files arrived since listeners last heard. */
  private fresh = false;
  /** How many fetches have started; a change tells `settle` that a read missed. */
  private started = 0;

  constructor(
    private readonly base: string,
    private readonly fetcher: Fetcher = fetchBytes,
  ) {}

  /** The bytes of a file, or undefined while it is fetched or when it does not exist. */
  readonly read = (path: string): Uint8Array | undefined => {
    const known = this.cache.get(path);
    if (known !== undefined) return known ?? undefined;
    this.request(path);
    return undefined;
  };

  /** The text of a file, as `read`. */
  readonly text = (path: string): string | undefined => {
    const bytes = this.read(path);
    return bytes && decoder.decode(bytes);
  };

  /** Whether a file has been fetched (it may not exist). */
  known(path: string): boolean {
    return this.cache.has(path);
  }

  /** Fetches files and resolves when they are all known. */
  async load(paths: readonly string[]): Promise<void> {
    for (const path of paths) if (!this.cache.has(path)) this.request(path);
    await Promise.all(paths.map((p) => this.pending.get(p)));
  }

  /** Whether files are being fetched. */
  get busy(): boolean {
    return this.pending.size > 0;
  }

  /** The number of fetches started so far. */
  get requests(): number {
    return this.started;
  }

  /** Resolves when nothing is being fetched. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending.values());
  }

  /** Calls `listener` after files arrived (batched); returns a function that stops it. */
  onArrive(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private request(path: string): void {
    if (this.pending.has(path)) return;
    this.started++;
    // `@` stays as written, so the page's own style sheet and this fetch share the cache.
    const url =
      this.base +
      path
        .split("/")
        .map((part) => encodeURIComponent(part).replace(/%40/g, "@"))
        .join("/");
    const job = this.fetcher(url)
      .catch(() => undefined)
      .then((bytes) => {
        this.cache.set(path, bytes ?? null);
        this.pending.delete(path);
        if (bytes) this.fresh = true;
        // Listeners hear once the batch is over, so that one analysis takes every file.
        if (this.pending.size === 0 && this.fresh) {
          this.fresh = false;
          setTimeout(() => {
            for (const listener of this.listeners) listener();
          }, 0);
        }
      });
    this.pending.set(path, job);
  }
}

/**
 * Runs `work` until it reads no file that is still being fetched: after a round that started
 * fetches, it waits for them, lets the caller start afresh (`renew`: libraries cache what they
 * missed) and runs again, at most `rounds` times.
 */
export async function settle<T>(
  files: readonly LazyFiles[],
  work: () => T,
  renew: () => void,
  rounds = 6,
): Promise<T> {
  for (let round = 0; ; round++) {
    const before = files.map((f) => f.requests);
    const result = work();
    const missed = files.some((f, i) => f.requests !== before[i] || f.busy);
    if (!missed || round + 1 >= rounds) return result;
    await Promise.all(files.map((f) => f.idle()));
    renew();
  }
}
