// What a viewer can do with the project in front of them (`project-sharing`, "Viewing by link"): make
// a copy of it as the project of this browser, save a copy to their own projects when signed in,
// and read the snapshot again. Each is one step the header's buttons call; what the page itself
// does (replacing its project, leaving the viewed one) is handed in, so a test plays it all.

import type { Studio } from "../studio.js";
import type { CloudProject, Outcome } from "./client.js";
import { explainFailure, type CloudWords } from "./explain.js";
import type { OpenOutcome } from "./projects-model.js";
import type { SnapshotViewer } from "./snapshot.js";
import type { ViewMode, ViewState } from "./view-mode.js";
import type { ViewWords } from "./view-model.js";

type Files = ReadonlyMap<string, string | Uint8Array>;

/** The anonymous project this browser keeps. */
export interface KeptWork {
  readonly files: Files;
  readonly open: string;
}

/** What saving a copy to the person's projects needs of the cloud controller. */
export interface CopyCloud {
  duplicate(id: string): Promise<Outcome<CloudProject>>;
  open(id: string): Promise<OpenOutcome>;
}

export interface ActionsHost {
  readonly mode: ViewMode;
  readonly studio: Pick<Studio, "open">;
  /** Set when a person is signed in: only they have projects to save a copy to. */
  readonly cloud: CopyCloud | undefined;
  readonly snapshot: SnapshotViewer;
  readonly words: () => { readonly viewing: ViewWords; readonly cloud: CloudWords };
  /** Says something in the status line. */
  readonly report: (message: string) => void;
  /** The files shown: the viewed project's. */
  readonly files: () => Map<string, string | Uint8Array>;
  /** The anonymous project this browser keeps, if it keeps one. */
  readonly keptWork: () => KeptWork | undefined;
  /** Whether files are one of the templates (nothing of the person's to lose). */
  readonly isTemplate: (files: Files) => boolean;
  readonly confirm: (title: string, message: string, action: string) => Promise<boolean>;
  /** Leaves the viewed project: view mode ends and the anonymous project of this browser shows. */
  readonly leave: () => void;
  /** Replaces the anonymous project with these files, keeping what it replaces as the previous project. */
  readonly replaceProject: (files: Files, open: string | undefined) => void;
}

/** Whether two sets of files hold the same paths with the same text or bytes. */
export function sameFiles(a: Files, b: Files): boolean {
  if (a.size !== b.size) return false;
  for (const [path, content] of a) {
    const other = b.get(path);
    if (other === undefined) return false;
    if (typeof content === "string" || typeof other === "string") {
      if (content !== other) return false;
    } else if (
      content.byteLength !== other.byteLength ||
      content.some((byte, i) => byte !== other[i])
    ) {
      return false;
    }
  }
  return true;
}

export class ViewActions {
  private busy = false;

  constructor(private readonly host: ActionsHost) {}

  /** Whether a copy to the person's projects can be made: a person is signed in. */
  get canSave(): boolean {
    return this.host.cloud !== undefined;
  }

  /**
   * Whether the Studio shows the viewed project's files: a followed room is bound before the
   * header offers anything, a snapshot is read after view mode begins.
   */
  private loaded(state: ViewState): boolean {
    return state.live || this.host.snapshot.id === state.id;
  }

  /**
   * "Make a copy": the viewed files become the anonymous project of this browser, kept as usual,
   * after asking when that replaces work that is not a template; the work it replaces stays as the
   * previous project. True when the copy was made.
   */
  async makeCopy(): Promise<boolean> {
    const state = this.host.mode.state;
    if (!state || this.busy) return false;
    this.busy = true;
    try {
      const w = this.host.words().viewing;
      // A snapshot still on its way shows an empty Studio, and a copy of that is no copy.
      if (!this.loaded(state)) {
        this.host.report(w.copyLoading);
        return false;
      }
      const kept = this.host.keptWork();
      // Work that is a template, or already is this very project, is not work to lose.
      if (
        kept &&
        kept.files.size > 0 &&
        !this.host.isTemplate(kept.files) &&
        !sameFiles(kept.files, this.host.files())
      ) {
        const yes = await this.host.confirm(
          w.copyConfirmTitle,
          w.copyConfirmMessage,
          w.copyConfirm,
        );
        if (!yes) return false;
      }
      // The page may have left the project, or been given another, while the person decided.
      const now = this.host.mode.state;
      if (!now || now.id !== state.id) return false;
      if (!this.loaded(now)) {
        this.host.report(w.copyLoading);
        return false;
      }
      const files = this.host.files();
      const open = this.host.studio.open;
      // The anonymous project comes back first, so that what the copy replaces is what is kept.
      this.host.leave();
      this.host.replaceProject(files, open === "" ? undefined : open);
      this.host.report(w.copied(state.name));
      return true;
    } finally {
      this.busy = false;
    }
  }

  /**
   * "Save a copy to my projects": the service copies the project into the person's account (it
   * counts against their quota, which is said as in the drawer) and the page opens the copy. True
   * when the copy is open.
   */
  async saveCopy(): Promise<boolean> {
    const state = this.host.mode.state;
    const cloud = this.host.cloud;
    if (!state || !cloud || this.busy) return false;
    this.busy = true;
    try {
      const words = this.host.words();
      this.host.report(words.viewing.savingCopy(state.name));
      const made = await cloud.duplicate(state.id);
      if (!made.ok) {
        this.host.report(explainFailure(made.failure, words.cloud.errors));
        return false;
      }
      const opened = await cloud.open(made.value.id);
      if (opened !== "opened" && opened !== "already") return false;
      this.host.report(words.viewing.savedCopy(made.value.name));
      return true;
    } finally {
      this.busy = false;
    }
  }

  /** Reads the snapshot again (the reload hint's button). True when the project was read. */
  async reload(): Promise<boolean> {
    const state = this.host.mode.state;
    if (!state || state.live) return false;
    const words = this.host.words();
    const result = await this.host.snapshot.reload();
    if (!result.ok) {
      this.host.report(explainFailure(result.failure, words.cloud.errors));
      return false;
    }
    if (result.value.cancelled) return false;
    const missing = result.value.missing;
    this.host.report(
      missing.length > 0 ? words.cloud.project.binaryFetch(missing[0]!) : words.viewing.reloaded,
    );
    return true;
  }
}
