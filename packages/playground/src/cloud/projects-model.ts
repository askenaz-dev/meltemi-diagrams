// What the projects drawer knows and does, without a DOM: the person's projects, what is going on and
// what went wrong, and the actions that change them. The drawer draws it and calls these methods; a
// test drives it with a fake host. A refusal (the quota above all) is said in the status line and
// in the drawer, and never changes the list.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { CloudApi, CloudProject, Outcome } from "./client.js";
import { explainFailure, type CloudWords } from "./explain.js";

/** The longest name a project may have, in characters. */
export const PROJECT_NAME_MAX = 100;

/** What the service refuses in a name: control characters, line and paragraph separators, lone surrogates. */
const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

export type NameCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: "empty" | "long" | "control" };

/** The name a person typed, as the service reads it: trimmed, 1 to 100 characters, nothing unshowable. */
export function checkProjectName(raw: string): NameCheck {
  const name = raw.trim();
  const length = Array.from(name).length;
  if (length === 0) return { ok: false, reason: "empty" };
  if (length > PROJECT_NAME_MAX) return { ok: false, reason: "long" };
  if (FORBIDDEN_IN_NAME.test(name)) return { ok: false, reason: "control" };
  return { ok: true, name };
}

/** Why a name was refused, in words. */
export function nameProblem(reason: "empty" | "long" | "control", words: CloudWords): string {
  const m = words.projects;
  if (reason === "empty") return m.nameEmpty;
  return reason === "long" ? m.nameLong(PROJECT_NAME_MAX) : m.nameControl;
}

/** How opening a project ended. */
export type OpenOutcome = "opened" | "already" | "not-found" | "failed";

/** What the drawer needs from the page: the cloud calls, and the parts only the page can do. */
export interface ProjectsHost {
  readonly api: CloudApi;
  /** The id of the cloud project that is open, if one is. */
  current(): string | undefined;
  /** Whether the project in the page is the anonymous one and has files: it can be saved to the cloud. */
  canSaveLocal(): boolean;
  /** Opens a project; it says in the status line what went wrong. */
  open(id: string): Promise<OpenOutcome>;
  /** Makes a project from a template by name; nothing is opened. */
  createFrom(name: string, template: string): Promise<Outcome<CloudProject>>;
  /** Makes a project from the anonymous one's files and uploads its images; nothing is opened. */
  saveLocal(
    name: string,
    progress: (path: string, done: number, total: number) => void,
  ): Promise<Outcome<CloudProject>>;
  /**
   * Makes a project from files of the person's (an archive's) and uploads its images and fonts;
   * nothing is opened.
   */
  uploadProject(
    name: string,
    files: ReadonlyMap<string, string | Uint8Array>,
    progress: (path: string, done: number, total: number) => void,
  ): Promise<Outcome<CloudProject>>;
  /** A project was renamed: the page's words about the open one follow. */
  renamed(id: string, name: string): void;
  /** Goes back to the anonymous project. */
  leaveToLocal(): void;
  /** A project was deleted: its copy in this browser goes, and so does the page's hold on it. */
  deleted(id: string): void;
  /** Says something in the status line. */
  report(message: string): void;
  /** Hears what the page says in the status line while the drawer is open; returns how to stop. */
  watch(listener: (message: string) => void): () => void;
}

export interface ProjectsState {
  /** Whether the list has been read: it is empty and unknown until `ready`. */
  readonly list: "loading" | "ready" | "failed";
  readonly projects: readonly CloudProject[];
  /** An action is on its way: the buttons wait. */
  readonly busy: boolean;
  /** Something going on or done, in words. */
  readonly status: string;
  /** Something that went wrong, in words; empty when nothing did. */
  readonly problem: string;
  /** The cloud project that is open. */
  readonly current: string | undefined;
  /** The anonymous project can be saved to the cloud. */
  readonly canSave: boolean;
  /** The most projects an account may hold. */
  readonly limit: number;
}

export class ProjectsModel {
  private current_: ProjectsState = {
    list: "loading",
    projects: [],
    busy: false,
    status: "",
    problem: "",
    current: undefined,
    canSave: false,
    limit: CLOUD_LIMITS.projects,
  };

  /** The last thing the page said in the status line: why an open failed, say. */
  private lastReport = "";
  private readonly stopWatching: () => void;

  constructor(
    private readonly host: ProjectsHost,
    private readonly words: () => CloudWords,
    private readonly changed: (state: ProjectsState) => void,
  ) {
    this.current_ = { ...this.current_, ...this.flags() };
    this.stopWatching = host.watch((message) => (this.lastReport = message));
  }

  get state(): ProjectsState {
    return this.current_;
  }

  /** Stops listening to the status line; the drawer is closed. */
  dispose(): void {
    this.stopWatching();
  }

  private flags(): Pick<ProjectsState, "current" | "canSave"> {
    return { current: this.host.current(), canSave: this.host.canSaveLocal() };
  }

  private update(patch: Partial<ProjectsState>): void {
    this.current_ = { ...this.current_, ...this.flags(), ...patch };
    this.changed(this.current_);
  }

  /** What went wrong in words, in the drawer and in the status line. */
  private refuse(outcome: Extract<Outcome<unknown>, { ok: false }>): void {
    const problem = explainFailure(outcome.failure, this.words().errors);
    this.update({ busy: false, status: "", problem });
    this.host.report(problem);
  }

  /** Reads the person's projects. */
  async load(): Promise<void> {
    this.update({ list: "loading", status: this.words().projects.loading, problem: "" });
    const listed = await this.host.api.list();
    if (listed.ok) {
      this.update({ list: "ready", projects: listed.value, status: "" });
    } else {
      this.update({
        list: "failed",
        status: "",
        problem: explainFailure(listed.failure, this.words().errors),
      });
    }
  }

  /** Brings the flags (which project is open, whether the local one can be saved) up to date. */
  refreshFlags(): void {
    this.update({});
  }

  /**
   * Opens a project. True when it is open now (or already was): the drawer may close. A project
   * that is gone is dropped from the list.
   */
  async open(project: CloudProject): Promise<boolean> {
    if (this.current_.busy) return false;
    this.update({ busy: true, status: this.words().open.opening, problem: "" });
    const outcome = await this.opening(project.id);
    if (outcome === "not-found") {
      this.update({
        busy: false,
        status: "",
        projects: this.current_.projects.filter((held) => held.id !== project.id),
        problem: this.words().errors.notFound,
      });
      return false;
    }
    this.update({ busy: false, status: "", problem: this.problemOf(outcome) });
    return outcome === "opened" || outcome === "already";
  }

  /** Opens a project, remembering what the page said about it. */
  private async opening(id: string): Promise<OpenOutcome> {
    this.lastReport = "";
    return this.host.open(id);
  }

  /** The problem to show for an open that did not happen: what the page said, or a general one. */
  private problemOf(outcome: OpenOutcome): string {
    if (outcome !== "failed") return "";
    return this.lastReport || this.words().open.failed;
  }

  /** Makes a project from a template and opens it. True when it is open. */
  async create(rawName: string, template: string): Promise<boolean> {
    if (this.current_.busy) return false;
    const checked = checkProjectName(rawName);
    if (!checked.ok) {
      this.update({ status: "", problem: nameProblem(checked.reason, this.words()) });
      return false;
    }
    const m = this.words().projects;
    this.update({ busy: true, status: m.creating(checked.name), problem: "" });
    const made = await this.host.createFrom(checked.name, template);
    if (!made.ok) {
      this.refuse(made);
      return false;
    }
    this.update({ projects: [made.value, ...this.current_.projects] });
    const opened = await this.opening(made.value.id);
    this.update({
      busy: false,
      status: opened === "opened" ? m.created(made.value.name) : "",
      problem: this.problemOf(opened),
    });
    return opened === "opened";
  }

  /** Saves the anonymous project to the cloud and opens the copy. True when it is open. */
  async saveLocal(rawName: string): Promise<boolean> {
    if (this.current_.busy) return false;
    const checked = checkProjectName(rawName);
    if (!checked.ok) {
      this.update({ status: "", problem: nameProblem(checked.reason, this.words()) });
      return false;
    }
    const m = this.words().projects;
    this.update({ busy: true, status: m.saving(checked.name), problem: "" });
    const saved = await this.host.saveLocal(checked.name, (path, done, total) =>
      this.update({ status: m.uploading(path, done, total) }),
    );
    if (!saved.ok) {
      this.refuse(saved);
      return false;
    }
    this.update({ projects: [saved.value, ...this.current_.projects] });
    const opened = await this.opening(saved.value.id);
    this.update({
      busy: false,
      status: opened === "opened" ? m.saved(saved.value.name) : "",
      problem: this.problemOf(opened),
    });
    return opened === "opened";
  }

  /**
   * Makes a project from files (an archive's) and opens it, saying how the upload goes. True when
   * it is open.
   */
  async createFromFiles(
    rawName: string,
    files: ReadonlyMap<string, string | Uint8Array>,
    progress?: (done: number, total: number) => void,
  ): Promise<boolean> {
    if (this.current_.busy) return false;
    const checked = checkProjectName(rawName);
    if (!checked.ok) {
      this.update({ status: "", problem: nameProblem(checked.reason, this.words()) });
      return false;
    }
    const m = this.words().projects;
    this.update({ busy: true, status: m.creating(checked.name), problem: "" });
    const made = await this.host.uploadProject(checked.name, files, (path, done, total) => {
      progress?.(done, total);
      this.update({ status: m.uploading(path, done, total) });
    });
    if (!made.ok) {
      this.refuse(made);
      return false;
    }
    this.update({ projects: [made.value, ...this.current_.projects] });
    const opened = await this.opening(made.value.id);
    this.update({
      busy: false,
      status: opened === "opened" ? m.created(made.value.name) : "",
      problem: this.problemOf(opened),
    });
    return opened === "opened";
  }

  /** Renames a project. True when it is renamed. */
  async rename(project: CloudProject, rawName: string): Promise<boolean> {
    if (this.current_.busy) return false;
    const checked = checkProjectName(rawName);
    if (!checked.ok) {
      this.update({ status: "", problem: nameProblem(checked.reason, this.words()) });
      return false;
    }
    if (checked.name === project.name) return true;
    this.update({ busy: true, status: "", problem: "" });
    const done = await this.host.api.update(project.id, { name: checked.name });
    if (!done.ok) {
      this.refuse(done);
      return false;
    }
    this.host.renamed(project.id, done.value.name);
    const status = this.words().projects.renamed(done.value.name);
    this.update({
      busy: false,
      status,
      projects: this.current_.projects.map((held) => (held.id === project.id ? done.value : held)),
    });
    this.host.report(status);
    return true;
  }

  /** Makes a copy of a project. True when it was made. */
  async duplicate(project: CloudProject): Promise<boolean> {
    if (this.current_.busy) return false;
    this.update({ busy: true, status: "", problem: "" });
    const made = await this.host.api.duplicate(project.id);
    if (!made.ok) {
      this.refuse(made);
      return false;
    }
    const status = this.words().projects.duplicated(made.value.name);
    this.update({ busy: false, status, projects: [made.value, ...this.current_.projects] });
    this.host.report(status);
    return true;
  }

  /** Deletes a project (the drawer asked first). True when it is gone: deleted now, or already gone. */
  async remove(project: CloudProject): Promise<boolean> {
    if (this.current_.busy) return false;
    this.update({ busy: true, status: "", problem: "" });
    const gone = await this.host.api.remove(project.id);
    // A project that is not there any more is what was asked.
    if (!gone.ok && gone.failure.status !== 404) {
      this.refuse(gone);
      return false;
    }
    this.host.deleted(project.id);
    const status = this.words().projects.deleted(project.name);
    this.update({
      busy: false,
      status,
      projects: this.current_.projects.filter((held) => held.id !== project.id),
    });
    this.host.report(status);
    return true;
  }

  /** Says something in the drawer and in the status line (a link copied, say). */
  say(message: string): void {
    this.update({ status: message, problem: "" });
    this.host.report(message);
  }

  /** Goes back to the anonymous project. */
  leaveToLocal(): void {
    this.host.leaveToLocal();
    this.update({ status: this.words().projects.openedLocal, problem: "" });
  }
}
