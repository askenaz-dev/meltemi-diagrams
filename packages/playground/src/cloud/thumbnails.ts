// The project's thumbnail, sent from the page (`cloud-projects`, "Thumbnails"): five seconds after the
// analysis of a drawable file settles, and at most once a minute for a project, the page renders the
// static SVG of the open diagram and sends it when it is not the one it sent last. Nothing here touches
// the DOM, a clock or the network: the timers, the time, the renderer, the hash and the call are handed
// in, so a test turns a fake clock by hand.
//
// What is never sent: the picture of a file that draws nothing (a file that holds only a `model` block,
// a text that is not a diagram), one over 200 KiB, one that is what the service already has, and
// anything at all while no cloud project is open. A refusal for too many thumbnails is not an error
// for the person: the page tries once more a minute later and says nothing.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { Timers } from "./binding.js";
import { hasCode, type ApiFailure, type Outcome } from "./client.js";
import type { KeyValueStore } from "./persistence.js";

/** The page waits this long after the analysis of a drawable file settles. */
export const THUMBNAIL_SETTLE_MS = 5_000;

/** A project's thumbnail is rendered at most this often. */
export const THUMBNAIL_EVERY_MS = 60_000;

/** What rendering the open file gives: its picture, or nothing to send. */
export type ThumbnailRender =
  { readonly kind: "svg"; readonly svg: string } | { readonly kind: "none" };

/** Where the hash of the last thumbnail sent for a project is kept between visits. */
export interface ThumbnailMemory {
  get(project: string): string | undefined;
  set(project: string, hash: string): void;
}

export interface ThumbnailDeps {
  readonly timers: Timers;
  /** The time, in milliseconds. */
  readonly now: () => number;
  /** Renders the open diagram: the same SVG the export makes. */
  readonly render: () => Promise<ThumbnailRender>;
  /** A hash of the picture, to tell whether it changed. */
  readonly hash: (svg: string) => Promise<string>;
  /** `PUT`s the picture as the project's thumbnail. */
  readonly send: (project: string, svg: string) => Promise<Outcome<null>>;
  readonly memory?: ThumbnailMemory;
  /** The service took a thumbnail of the project. */
  readonly sent?: (project: string) => void;
}

const encoder = new TextEncoder();

/** The bytes a picture takes once written. */
export function byteLength(svg: string): number {
  return encoder.encode(svg).byteLength;
}

export class Thumbnails {
  private project_: string | undefined;
  /** Changes with the project that is open: work that began under another is dropped. */
  private generation = 0;
  private timer: unknown;
  /** After a refusal that will not change (signed out, project gone): nothing more until the next project. */
  private blocked = false;
  /** Whether the refusal for too many thumbnails has had its one retry since the last settle. */
  private retried = false;
  /** When a project's thumbnail was last rendered, by project: a minute apart whatever happens between. */
  private readonly lastRun = new Map<string, number>();
  /** The hash of the last thumbnail the service took, by project. */
  private readonly lastHash = new Map<string, string>();

  constructor(private readonly deps: ThumbnailDeps) {}

  /** The project whose thumbnail is being kept, or undefined. */
  get project(): string | undefined {
    return this.project_;
  }

  /** Whether work is waiting for its time. */
  get waiting(): boolean {
    return this.timer !== undefined;
  }

  /**
   * A cloud project was opened (its id), or left (undefined). What was waiting for the one before is
   * dropped, and so is a render or a call that was under way: nothing of it is sent.
   */
  open(project: string | undefined): void {
    if (project === this.project_) return;
    this.cancel();
    this.project_ = project;
    this.blocked = false;
    this.retried = false;
  }

  /** Leaves the project: nothing is sent until another one is opened. */
  close(): void {
    this.open(undefined);
  }

  /**
   * The analysis of the open file settled. A drawable file starts the wait of five seconds again (and
   * a minute since the last picture of this project, if that is later); a file that draws nothing
   * starts nothing.
   */
  analysed(drawable: boolean): void {
    if (this.project_ === undefined || this.blocked || !drawable) return;
    this.retried = false;
    this.arm(this.deps.now() + THUMBNAIL_SETTLE_MS);
  }

  private cancel(): void {
    this.generation++;
    this.deps.timers.clear(this.timer);
    this.timer = undefined;
  }

  /** Waits until `readyAt`, but not less than a minute after this project's last picture. */
  private arm(readyAt: number): void {
    const project = this.project_;
    if (project === undefined) return;
    const last = this.lastRun.get(project);
    const due = Math.max(readyAt, last === undefined ? readyAt : last + THUMBNAIL_EVERY_MS);
    const generation = this.generation;
    this.deps.timers.clear(this.timer);
    this.timer = this.deps.timers.set(
      () => {
        if (generation !== this.generation) return;
        this.timer = undefined;
        void this.run(generation);
      },
      Math.max(0, due - this.deps.now()),
    );
  }

  private async run(generation: number): Promise<void> {
    const project = this.project_;
    if (project === undefined) return;
    // Counted from the start, so that a picture is never rendered twice within a minute.
    this.lastRun.set(project, this.deps.now());
    let rendered: ThumbnailRender;
    try {
      rendered = await this.deps.render();
    } catch {
      // A picture that cannot be made is a picture that is not sent: the next settle tries again.
      return;
    }
    if (generation !== this.generation || rendered.kind !== "svg") return;
    if (byteLength(rendered.svg) > CLOUD_LIMITS.thumbnailBytes) return;
    const hash = await this.deps.hash(rendered.svg);
    if (generation !== this.generation) return;
    if (hash === (this.lastHash.get(project) ?? this.deps.memory?.get(project))) return;
    const outcome = await this.deps.send(project, rendered.svg);
    if (outcome.ok) {
      this.lastHash.set(project, hash);
      this.deps.memory?.set(project, hash);
      this.deps.sent?.(project);
      return;
    }
    this.failed(generation, outcome.failure);
  }

  /** What a refused or unanswered call does to the work that follows. */
  private failed(generation: number, failure: ApiFailure): void {
    if (generation !== this.generation) return;
    if (failure.status === 401 || hasCode(failure, "auth.required")) {
      // Signed out elsewhere: no more pictures from this page.
      this.blocked = true;
    } else if (failure.status === 404 || hasCode(failure, "project.not-found")) {
      // The project is gone.
      this.blocked = true;
    } else if (hasCode(failure, "thumbnail.rate")) {
      // Another device sent one a moment ago: not an error, and not said. One more try, a minute on.
      if (!this.retried) {
        this.retried = true;
        this.arm(this.deps.now());
      }
    }
    // Anything else (no connection, a service that fails) waits for the next settle.
  }
}

// What the page keeps between visits --------------------------------------------------------------

export const THUMBNAIL_HASH_KEY = "meltemi-playground:cloud-thumbnail:v1";

/** How many projects' last thumbnail hash are remembered. */
export const REMEMBERED_THUMBNAILS = 100;

function readHashes(storage: KeyValueStore): Record<string, string> {
  try {
    const text = storage.getItem(THUMBNAIL_HASH_KEY);
    const value: unknown = text ? JSON.parse(text) : {};
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

/**
 * The hash of the last thumbnail this browser sent for a project, kept in `storage`, so that opening
 * a project again does not send the same picture again. Without storage (or when it refuses) the page
 * simply sends one picture per visit.
 */
export function thumbnailMemory(storage: KeyValueStore | undefined): ThumbnailMemory | undefined {
  if (!storage) return undefined;
  return {
    get: (project) => {
      const all = readHashes(storage);
      return Object.hasOwn(all, project) ? all[project] : undefined;
    },
    set: (project, hash) => {
      try {
        const all = readHashes(storage);
        delete all[project];
        all[project] = hash;
        // The latest last: the oldest go first when there are too many.
        const ids = Object.keys(all);
        for (const old of ids.slice(0, Math.max(0, ids.length - REMEMBERED_THUMBNAILS))) {
          delete all[old];
        }
        storage.setItem(THUMBNAIL_HASH_KEY, JSON.stringify(all));
      } catch {
        // A convenience: without it a picture is sent once more.
      }
    },
  };
}

// The address a thumbnail is shown from -----------------------------------------------------------

/**
 * Which projects this page has sent a thumbnail for, and when. The service answers a thumbnail at one
 * address however often it changes, and the browser may keep what it fetched before: an address the
 * list gave gets a stamp (`t`) once this page has sent a newer picture, so that the drawer shows it.
 */
export class ThumbnailStamps {
  private readonly stamps = new Map<string, number>();
  private readonly listeners = new Set<(project: string) => void>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** The service took a thumbnail of the project just now. */
  sent(project: string): void {
    this.stamps.set(project, this.now());
    for (const listener of [...this.listeners]) listener(project);
  }

  /** Hears every thumbnail the page sends; returns how to stop. */
  listen(listener: (project: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The address to show: the list's own, with a stamp when this page sent a picture since. */
  address(project: string, address: string | undefined): string | undefined {
    const stamp = this.stamps.get(project);
    if (address === undefined || stamp === undefined) return address;
    try {
      const url = new URL(address);
      url.searchParams.set("t", String(stamp));
      return url.href;
    } catch {
      return address;
    }
  }
}
