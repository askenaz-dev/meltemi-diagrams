// What the account holds, for the account menu: its projects and the bytes it uses, against its
// limits (`GET /api/account/usage`). It is read when the menu opens and again after a call that
// may have changed it (a project made or deleted, a version, an image or a font). Reading never
// blocks the menu and never says anything when the service does not answer: the menu then shows
// what it has, or nothing. Nothing here touches the page.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { Outcome, Usage } from "./client.js";

/** The numbers the menu shows: what the account holds, and the most it may. */
export interface UsageView {
  readonly projects: number;
  readonly maxProjects: number;
  readonly storageBytes: number;
  readonly maxStorageBytes: number;
}

/** The service's numbers, with the page's own limits for any the service left out. */
export function usageView(usage: Usage): UsageView {
  const limit = (given: number | undefined, fallback: number): number =>
    given !== undefined && given > 0 ? given : fallback;
  return {
    projects: usage.projects,
    maxProjects: limit(usage.limits["projects"], CLOUD_LIMITS.projects),
    storageBytes: usage.storageBytes,
    maxStorageBytes: limit(usage.limits["storageBytes"], CLOUD_LIMITS.storageBytes),
  };
}

const KIBIBYTE = 1024;
const MEBIBYTE = 1024 * 1024;

/**
 * A number of bytes in the unit a person reads at a glance, with the page's language's separators:
 * `340 KiB`, `5.2 MiB`. The page's limits are in binary units (200 MiB), so these are too.
 */
export function formatBytes(bytes: number, locale: string): string {
  const write = (value: number, digits: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  // 1 048 000 bytes is 1 023.4 KiB, which reads better as "1 MiB" than as "1,023 KiB" rounded up.
  if (Math.round(bytes / KIBIBYTE) >= KIBIBYTE) return `${write(bytes / MEBIBYTE, 1)} MiB`;
  if (bytes >= KIBIBYTE) return `${write(bytes / KIBIBYTE, 0)} KiB`;
  return `${write(bytes, 0)} B`;
}

/** What the menu needs of the usage: the numbers last read, and the means to read them again. */
export interface UsageSource {
  /**
   * The numbers last read, or undefined when there are none: none read yet, or a call changed what
   * the account holds since and the new numbers are not read yet.
   */
  readonly view: UsageView | undefined;
  /** Reads them again; resolves when that is over, whatever the answer. */
  refresh(): Promise<void>;
  /** Hears when `view` changes. Returns how to stop. */
  listen(listener: () => void): () => void;
}

/**
 * The account's usage as the page knows it. `load` makes the call; the model holds the last good
 * answer, reads at most one at a time (a request that comes while one is on its way is answered
 * by one more read after it), and never offers numbers it knows are out of date: after a call
 * that changed what the account holds there are none until a read confirms them.
 */
export class AccountUsage implements UsageSource {
  private current: UsageView | undefined;
  /** Something that may have changed the numbers went through since the last good read. */
  private stale = false;
  private running: Promise<void> | undefined;
  /** Another read is wanted as soon as the one on its way is over. */
  private again = false;
  /** A change went through while the read on its way was made: its answer may be older than it. */
  private overtaken = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly load: () => Promise<Outcome<Usage>>) {}

  get view(): UsageView | undefined {
    return this.stale ? undefined : this.current;
  }

  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refresh(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const run = (async (): Promise<void> => {
      do {
        this.again = false;
        this.overtaken = false;
        let outcome: Outcome<Usage> | undefined;
        try {
          outcome = await this.load();
        } catch {
          // A call that throws is a call that failed: nothing to say.
        }
        this.read(outcome);
      } while (this.again);
    })();
    this.running = run;
    void run.finally(() => {
      if (this.running === run) this.running = undefined;
    });
    return run;
  }

  /**
   * A call that may have changed the numbers went through (a project made or deleted, a version,
   * an image or a font). They are read again at once when someone is looking, and in any case the
   * ones held are no longer trusted until a read confirms them.
   */
  changed(): void {
    this.stale = true;
    if (this.running) {
      this.overtaken = true;
      this.again = true;
    } else if (this.listeners.size > 0) void this.refresh();
  }

  private read(outcome: Outcome<Usage> | undefined): void {
    if (outcome?.ok) {
      this.current = usageView(outcome.value);
      // A change that came while this was read is read again, and decides.
      this.stale = this.overtaken;
      this.notify();
    } else if (this.stale) {
      // The read failed, and the numbers held are known to be old: whoever shows them stops.
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
