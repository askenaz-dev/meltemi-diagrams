// What the versions panel knows and does, without a DOM: a project's versions, the name of a new one,
// what is going on and what went wrong, and the two actions that change the project's history (name
// the current state, restore a version). The panel draws it and calls these methods; a test drives it
// with a fake host. A refusal of the service (the quota, the rate, a version that is gone) is said in
// the panel and in the status line with the page's words for the code, and never changes the list.
//
// A restore arrives in the page from the room, as a remote change the person did not make: nothing
// here writes a file, and nothing of it enters the person's undo. What this does is ask the service,
// make sure the room has the person's last edit first, and read the list again afterwards.

import type { CloudApi, Outcome, ProjectVersion } from "./client.js";
import { hasCode } from "./client.js";
import { explainFailure, type CloudWords } from "./explain.js";

/** The longest label a version may have, in characters (`cloud-projects`, "Versions"). */
export const LABEL_MAX = 80;

/** What the page refuses in a label, as it does in a project's name: control characters and the like. */
const FORBIDDEN_IN_LABEL = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

export type LabelCheck =
  | { readonly ok: true; readonly label: string | undefined }
  | { readonly ok: false; readonly reason: "long" | "control" };

/**
 * The label a person typed, as the service reads it: trimmed, at most 80 characters, nothing that
 * cannot be shown. Empty is allowed: it asks for a version with no label (`label` is then undefined).
 */
export function checkVersionLabel(raw: string): LabelCheck {
  const label = raw.trim();
  if (label === "") return { ok: true, label: undefined };
  if (Array.from(label).length > LABEL_MAX) return { ok: false, reason: "long" };
  if (FORBIDDEN_IN_LABEL.test(label)) return { ok: false, reason: "control" };
  return { ok: true, label };
}

/** Why a label was refused, in words. */
export function labelProblem(reason: "long" | "control", words: CloudWords): string {
  const m = words.versions;
  return reason === "long" ? m.nameLong(LABEL_MAX) : m.nameControl;
}

/** How many of a version's changed files the panel lists before it says "and N more". */
export const CHANGED_SHOWN = 20;

/** The changed paths a row lists, and how many more there are. */
export function changedPaths(changed: readonly string[]): {
  readonly shown: readonly string[];
  readonly more: number;
} {
  return {
    shown: changed.slice(0, CHANGED_SHOWN),
    more: Math.max(0, changed.length - CHANGED_SHOWN),
  };
}

/** The versions as the panel lists them: the newest first, whatever order the service gave. */
export function newestFirst(versions: readonly ProjectVersion[]): ProjectVersion[] {
  return [...versions].sort((a, b) => b.number - a.number);
}

/** What the panel needs from the page: the cloud calls, and the parts only the page can do. */
export interface VersionsHost {
  readonly api: Pick<CloudApi, "versions" | "createVersion" | "restoreVersion">;
  /** The id of the cloud project that is open, if one is. */
  current(): string | undefined;
  /**
   * Sends the person's last edits to the room now, so that a version, or the state a restore keeps,
   * holds what is on the screen and not what was sent a moment ago.
   */
  flush(): void;
  /** Says something in the status line. */
  report(message: string): void;
  /** A version was restored: the page forgets what the person could undo before it. */
  restored?(): void;
}

export interface VersionsState {
  /** The project the panel is about. */
  readonly project: string;
  /** Whether the list has been read: it is empty and unknown until `ready`. */
  readonly list: "loading" | "ready" | "failed";
  /** Newest first. */
  readonly versions: readonly ProjectVersion[];
  /** An action is on its way: the form and the buttons wait. */
  readonly busy: boolean;
  /** Something going on or done, in words. */
  readonly status: string;
  /** Something that went wrong, in words; empty when nothing did. */
  readonly problem: string;
}

export class VersionsModel {
  private current_: VersionsState;

  constructor(
    private readonly host: VersionsHost,
    readonly project: string,
    private readonly words: () => CloudWords,
    private readonly changed: (state: VersionsState) => void,
  ) {
    this.current_ = {
      project,
      list: "loading",
      versions: [],
      busy: false,
      status: "",
      problem: "",
    };
  }

  get state(): VersionsState {
    return this.current_;
  }

  private update(patch: Partial<VersionsState>): void {
    this.current_ = { ...this.current_, ...patch };
    this.changed(this.current_);
  }

  /** Whether another project is open now: what a call that was in the air brings is not this panel's. */
  private away(): boolean {
    return this.host.current() !== this.project;
  }

  /** What went wrong in words, in the panel and in the status line. */
  private refuse(outcome: Extract<Outcome<unknown>, { ok: false }>): void {
    const problem = explainFailure(outcome.failure, this.words().errors);
    this.update({ busy: false, status: "", problem });
    this.host.report(problem);
  }

  /** Reads the list of versions. */
  async load(): Promise<void> {
    this.update({ list: "loading", status: this.words().versions.loading, problem: "" });
    await this.reload();
    if (!this.away()) this.update({ status: "" });
  }

  /**
   * Reads the list again; the list keeps showing what it has until the answer comes, and what the
   * panel said about the action that came before stays. A list that cannot be read is said, and the
   * panel offers to try again.
   */
  private async reload(): Promise<boolean> {
    const listed = await this.host.api.versions(this.project);
    if (this.away()) return false;
    if (listed.ok) {
      this.update({ list: "ready", versions: newestFirst(listed.value) });
      return true;
    }
    const problem = explainFailure(listed.failure, this.words().errors);
    this.update({ list: "failed", problem });
    this.host.report(problem);
    return false;
  }

  /**
   * Names the project's current state as a version. A label that is too long never reaches the
   * service; an empty one makes a version with no label. True when the version was made.
   */
  async name(typed: string): Promise<boolean> {
    if (this.current_.busy || this.away()) return false;
    const checked = checkVersionLabel(typed);
    if (!checked.ok) {
      this.update({ status: "", problem: labelProblem(checked.reason, this.words()) });
      return false;
    }
    const m = this.words().versions;
    this.update({ busy: true, status: m.creating, problem: "" });
    this.host.flush();
    const made = await this.host.api.createVersion(this.project, checked.label);
    if (this.away()) return false;
    if (!made.ok) {
      this.refuse(made);
      return false;
    }
    const status = m.created(made.value.number, made.value.label);
    this.update({ status });
    this.host.report(status);
    await this.reload();
    if (!this.away()) this.update({ busy: false });
    return true;
  }

  /**
   * Restores a version (the panel asked for a confirmation first). The service keeps the state it
   * replaces as an automatic version, and the files arrive from the room as a remote change. True
   * when it was restored; the list is read again, which then shows the version of the state before.
   */
  async restore(version: ProjectVersion): Promise<boolean> {
    if (this.current_.busy || this.away()) return false;
    const m = this.words().versions;
    this.update({ busy: true, status: m.restoring(version.number), problem: "" });
    this.host.flush();
    const done = await this.host.api.restoreVersion(this.project, version.number);
    if (this.away()) return false;
    if (!done.ok) {
      this.refuse(done);
      // A version that is gone (thinned, say) is not in the list any more.
      if (hasCode(done.failure, "version.not-found")) {
        await this.reload();
        if (!this.away()) this.update({ busy: false });
      }
      return false;
    }
    // The files were replaced as a whole: what the person did before no longer describes them.
    this.host.restored?.();
    const status = m.restored(version.number);
    this.update({ status });
    this.host.report(status);
    await this.reload();
    if (!this.away()) this.update({ busy: false });
    return true;
  }
}
