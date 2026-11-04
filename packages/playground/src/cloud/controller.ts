// The page's hold on its cloud projects: the calls to the service, this browser's database, the
// project that is open and the steps that change it (open, make, save the local project, go back
// to it, delete). It is what the projects drawer talks to, and what the shell asks on load. Nothing
// here touches a global: the environment hands in `fetch`, the socket, IndexedDB, storage, the
// address and the clock, so a test plays all of them.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { isCleanPath, isTextContent } from "../files.js";
import type { Selection } from "../history.js";
import type { Studio } from "../studio.js";
import type { Template } from "../templates.js";
import { addressFor, projectLink, withoutLive, type OpenPlan } from "./address.js";
import type { Timers } from "./binding.js";
import {
  cloudApi,
  type CloudApi,
  type CloudProject as ProjectRow,
  type Outcome,
} from "./client.js";
import { explainFailure, type CloudWords } from "./explain.js";
import { roomAddress } from "./guest.js";
import type { Fetch } from "./http.js";
import {
  openDatabase,
  rememberFile,
  rememberedFile,
  type CloudDatabase,
  type IdbFactoryLike,
  type KeyValueStore,
} from "./persistence.js";
import type { Presence } from "./presence.js";
import { CloudProject } from "./project.js";
import type { OpenOutcome, ProjectsHost } from "./projects-model.js";
import { roomUrl, type RoomHello, type SocketFactory, type Stop } from "./room.js";
import type { ConnectionStatus } from "./status.js";
import { ThumbnailStamps } from "./thumbnails.js";
import { AccountUsage } from "./usage.js";
import { roleOf, type Role } from "./view-model.js";

/** What the page offers its cloud projects: the browser's parts, handed in. */
export interface CloudEnvironment {
  readonly fetch: Fetch;
  readonly socket: SocketFactory;
  /** IndexedDB's factory; undefined where there is none. */
  readonly indexedDB: IdbFactoryLike | undefined;
  /** `localStorage`, where it works. */
  readonly storage: KeyValueStore | undefined;
  readonly online: () => boolean;
  readonly timers: Timers;
  /** The page's address bar. */
  readonly location: { href(): string; replace(url: string): void };
}

/** What the controller asks of the page. */
export interface CloudHooks {
  readonly studio: Studio;
  readonly templates: () => readonly Template[];
  readonly selection: () => Selection | undefined;
  readonly words: () => CloudWords;
  /** Says something in the status line. */
  readonly report: (message: string) => void;
  /** The connection's status, or undefined when no cloud project is open. */
  readonly status: (status: ConnectionStatus | undefined) => void;
  /** A cloud project was opened (with its name) or closed. */
  readonly changed: (project: { readonly id: string; readonly name: string } | undefined) => void;
  /** The anonymous project is about to be replaced by a cloud one: keep it in the browser. */
  readonly keepLocal: () => void;
  /** Back to the anonymous project: load it into the Studio. */
  readonly showLocal: () => void;
  /** What the person can undo changed without a change of a file: the header's buttons follow it. */
  readonly undoChanged?: () => void;
  /** The files of the anonymous project, while it is the one open. */
  readonly localFiles: () => ReadonlyMap<string, string | Uint8Array>;
  /**
   * What the person is to the project that is about to bind (before the Studio does, so that a
   * viewer's page is read-only from the first file), or undefined when the project is left (before
   * the anonymous project shows). `reason` is `role` when the service or the room said the person's
   * role changed while the project was open: the project is then opened again in the mode it gives.
   */
  readonly access?: (
    access:
      | {
          readonly role: Role;
          readonly id: string;
          readonly name: string;
          readonly reason: "open" | "role";
          /** The person has no account (`live-sessions`): no copy goes to their projects. */
          readonly guest?: boolean;
        }
      | undefined,
  ) => void;
  /**
   * The live session that let the page in ended and the project's link does not admit the person
   * (`live-sessions`, "When the session ends under a guest"): the project is no longer bound, and the
   * page stays read-only on the files it holds, with "Make a copy".
   */
  readonly frozen?: (project: { readonly id: string; readonly name: string }) => void;
}

/** A person without an account on the page (`live-sessions`, "Guest identity"). */
export interface GuestOptions {
  /** The id this browser keeps for them. */
  readonly id: string;
  /** The name they go by now: the one they chose, or "Guest NN". */
  readonly name: () => string;
}

/** The live session the open project's connection was let in by, as its hello said. */
export interface JoinedSession {
  /** An ISO time. */
  readonly until: string;
  readonly guestsEdit: boolean;
}

/** How opening by address ended, and what to say when it did not open. */
export interface LinkOpened {
  readonly outcome: OpenOutcome;
  readonly notice: string | undefined;
  /**
   * The room did not answer within the usual wait: an anonymous visitor reads the snapshot instead
   * (`project-sharing`, "Viewing by link").
   */
  readonly unanswered?: boolean;
}

/** The files of a project as the cloud keeps them: text in the document, bytes by hash. */
export interface CloudSplit {
  readonly texts: Record<string, string>;
  readonly binaries: [string, Uint8Array][];
}

export type SplitResult =
  | { readonly ok: true; readonly value: CloudSplit }
  | {
      readonly ok: false;
      readonly code: "quota.files" | "quota.binary" | "doc.too-large" | "path.invalid";
      readonly path?: string;
    };

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * Sorts a project's files into what a cloud project holds and checks the limits before anything is
 * sent: at most 2000 files, 10 MiB for an image or a font, 2 Mi characters for a text, 16 MiB in
 * all, and every path passing the path rule.
 */
export function splitForCloud(files: ReadonlyMap<string, string | Uint8Array>): SplitResult {
  if (files.size > CLOUD_LIMITS.files) return { ok: false, code: "quota.files" };
  const texts: Record<string, string> = {};
  const binaries: [string, Uint8Array][] = [];
  let bytes = 0;
  for (const [path, content] of files) {
    if (!isCleanPath(path)) return { ok: false, code: "path.invalid", path };
    if (isTextContent(path, content)) {
      const text = typeof content === "string" ? content : decoder.decode(content);
      if (text.length > CLOUD_LIMITS.textCharacters) {
        return { ok: false, code: "doc.too-large", path };
      }
      bytes += encoder.encode(text).byteLength;
      texts[path] = text;
    } else {
      // Not text: the bytes of an image or a font.
      const data = content as Uint8Array;
      if (data.byteLength > CLOUD_LIMITS.binaryBytes) {
        return { ok: false, code: "quota.binary", path };
      }
      binaries.push([path, data]);
    }
  }
  if (bytes > CLOUD_LIMITS.documentBytes) return { ok: false, code: "doc.too-large" };
  return { ok: true, value: { texts, binaries } };
}

/** The name `project.json` gives a project, when it gives one a project may have. */
export function manifestName(files: ReadonlyMap<string, string | Uint8Array>): string | undefined {
  const manifest = files.get("project.json");
  if (typeof manifest !== "string") return undefined;
  try {
    const name = (JSON.parse(manifest) as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.trim() !== "" && Array.from(name).length <= 100
      ? name.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The calls of the page, telling `changed` after each one that can change what the account holds
 * (a project made, copied or deleted, a version made or restored, an image or a font stored or
 * removed) and that the service accepted. Everything else passes through as it is.
 */
export function watchUsage(api: CloudApi, changed: () => void): CloudApi {
  const after =
    <A extends unknown[], T>(call: (...args: A) => Promise<Outcome<T>>) =>
    async (...args: A): Promise<Outcome<T>> => {
      const outcome = await call(...args);
      if (outcome.ok) changed();
      return outcome;
    };
  return {
    ...api,
    create: after(api.create),
    duplicate: after(api.duplicate),
    remove: after(api.remove),
    uploadBinary: after(api.uploadBinary),
    deleteBinary: after(api.deleteBinary),
    createVersion: after(api.createVersion),
    restoreVersion: after(api.restoreVersion),
  };
}

export class CloudController implements ProjectsHost {
  readonly api: CloudApi;
  /** A person without an account: undefined for a person signed in (`live-sessions`). */
  readonly guest: GuestOptions | undefined;
  /** What the account holds, for the account menu: read when it opens, and after a call that changes it. */
  readonly usage: AccountUsage;
  /** The thumbnails this page sent: the drawer shows a newer picture than the list's address gave. */
  readonly thumbnails = new ThumbnailStamps();
  private project: CloudProject | undefined;
  private name = "";
  /** What the person is to the project that is open (`owner` while it does not say). */
  private role_: Role = "owner";
  private database_: Promise<CloudDatabase> | undefined;
  private busy = false;
  /** The project is being opened again after its role changed. */
  private reopening = false;
  private readonly listeners = new Set<(message: string) => void>();
  private readonly openListeners = new Set<
    (project: { readonly id: string; readonly name: string } | undefined) => void
  >();
  /** The last message said in the status line, for a caller that wants it after the fact. */
  private lastReport = "";
  /**
   * The token of the live session the address carries (`live-sessions`): it goes in the room's
   * address and on the two reads that take it, and is dropped when the session ends.
   */
  private liveToken: string | undefined;
  /** The live session a project's connection was let in by, as the room's hello said. */
  private joined: { readonly id: string; readonly session: JoinedSession } | undefined;
  private readonly sessionListeners = new Set<() => void>();
  /** The room did not answer the last opening in time. */
  private unanswered = false;

  constructor(
    private readonly env: CloudEnvironment,
    private readonly hooks: CloudHooks,
    options: { readonly guest?: GuestOptions } = {},
  ) {
    this.guest = options.guest;
    const api = cloudApi(
      env.fetch,
      { href: env.location.href().replace(/#.*$/, "") },
      { live: () => this.liveToken },
    );
    this.usage = new AccountUsage(() => api.usage());
    this.api = watchUsage(api, () => this.usage.changed());
  }

  /** Whether the person has an account (cookie): a guest has no projects, versions or uploads. */
  get signedIn(): boolean {
    return this.guest === undefined;
  }

  /** The live session the open project was joined by, while it is on (`live-sessions`). */
  get session(): JoinedSession | undefined {
    const joined = this.joined;
    return joined && this.project?.id === joined.id ? joined.session : undefined;
  }

  /** Hears the joined session change (joined, its role changed, ended). Returns how to stop. */
  watchSession(listener: () => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  private sessionChanged(): void {
    for (const listener of [...this.sessionListeners]) listener();
  }

  /** The guest renamed themselves: the room knows people by their connection, so it reconnects. */
  guestRenamed(): void {
    this.project?.rejoin();
  }

  // What the page asks ------------------------------------------------------------------------

  /** The cloud project that is open. */
  get openProject(): { readonly id: string; readonly name: string } | undefined {
    return this.project ? { id: this.project.id, name: this.name } : undefined;
  }

  /** The connection's status, when a project is open. */
  get status(): ConnectionStatus | undefined {
    return this.project?.status;
  }

  /** Who else is in the open project and where (`live-collaboration`); undefined when none is open. */
  get presence(): Presence | undefined {
    return this.project?.presence;
  }

  /** What the person is to the open project; undefined when none is open. A viewer's page edits nothing. */
  get role(): Role | undefined {
    return this.project ? this.role_ : undefined;
  }

  current(): string | undefined {
    return this.project?.id;
  }

  /** The anonymous project can be saved when it is the one open and holds files. */
  canSaveLocal(): boolean {
    return this.project === undefined && this.hooks.localFiles().size > 0;
  }

  /** The name to offer for the anonymous project: the one `project.json` gives, or a general one. */
  localName(): string {
    return manifestName(this.hooks.localFiles()) ?? this.hooks.words().projects.saveName;
  }

  /** The link a person copies for a project. */
  link(id: string): string {
    return projectLink(new URL(this.env.location.href()).origin, id);
  }

  /**
   * Hears a cloud project open (with its id and name) and close (undefined): the way another part of
   * the page, such as the versions panel, follows which project is open. Returns how to stop.
   */
  subscribe(
    listener: (project: { readonly id: string; readonly name: string } | undefined) => void,
  ): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  report(message: string): void {
    this.lastReport = message;
    this.hooks.report(message);
    for (const listener of [...this.listeners]) listener(message);
  }

  watch(listener: (message: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The browser came online or went offline, or the page came back to the front. */
  network(): void {
    this.project?.network();
  }

  /** The page is being left or hidden: send what waits and keep the document in this browser. */
  flush(): void {
    this.project?.flush();
  }

  /**
   * A version was restored: the files were replaced as a whole, so the person's earlier steps are
   * forgotten (undoing one could only turn the restored text into something no version held).
   */
  restored(): void {
    this.project?.clearUndo();
    this.hooks.undoChanged?.();
  }

  /**
   * A project was renamed from this page: when it is the one open, the page's words about it (the
   * explorer's header) follow. Nothing else of the project changes.
   */
  renamed(id: string, name: string): void {
    if (this.project?.id !== id || this.name === name) return;
    this.name = name;
    this.hooks.changed({ id, name });
  }

  /** The person has another file open in the project: remember it for the next time (not for a viewer or a guest, who keep nothing). */
  rememberOpen(path: string): void {
    if (this.project && this.role_ !== "viewer" && this.guest === undefined) {
      rememberFile(this.env.storage, this.project.id, path);
    }
  }

  // Opening -------------------------------------------------------------------------------------

  /**
   * Opens the project the address names. Returns what to say once the anonymous project opens
   * instead, or undefined when the project opened. The address stays as it is.
   */
  async openAddress(plan: OpenPlan): Promise<string | undefined> {
    const words = this.hooks.words();
    if (plan.kind === "missing") {
      this.report(words.open.notFound);
      return words.open.notFound;
    }
    if (plan.kind !== "open") return undefined;
    return (await this.openLink(plan.id, plan.live)).notice;
  }

  /**
   * Opens the project an address names, with how it ended and what to say when it did not open. The
   * address stays as it is, and the mode follows the person's role (a viewer's page is read-only);
   * with a live session's token (`live`) the role is the session's, as a guest when nobody is signed
   * in, and the token is kept for the room and the two reads that take it.
   */
  async openLink(id: string, live?: string): Promise<LinkOpened> {
    this.busy = true;
    try {
      const outcome = await this.openNow(id, false, live);
      const opened = outcome === "opened" || outcome === "already";
      return {
        outcome,
        notice: opened ? undefined : this.lastReport,
        ...(this.unanswered && !opened ? { unanswered: true } : {}),
      };
    } finally {
      this.busy = false;
    }
  }

  /** Opens a project from the drawer; the address then names it, so that a reload reopens it. */
  async open(id: string): Promise<OpenOutcome> {
    if (this.busy) return "failed";
    this.busy = true;
    try {
      return await this.openNow(id, true);
    } finally {
      this.busy = false;
    }
  }

  private async openNow(id: string, setAddress: boolean, live?: string): Promise<OpenOutcome> {
    if (this.project?.id === id && live === this.liveToken) return "already";
    const words = this.hooks.words();
    this.unanswered = false;
    // The token goes with the project's read, which says whether its session is still on.
    const before = this.liveToken;
    this.liveToken = live;
    const described = await this.api.get(id);
    let name = id;
    let reachable = true;
    let ended = false;
    // What the person is to the project decides the mode: a viewer connects as one and edits
    // nothing. With no answer from the service the role is unknown, and only a copy kept in this
    // browser (which only a person who could edit has) opens the project.
    let role: Role = "owner";
    if (described.ok) {
      name = described.value.name;
      role = roleOf(described.value.role) ?? "viewer";
      // A session that is over: its token is dropped, and the person is what their own access says.
      if (live !== undefined && described.value.live === null) {
        ended = true;
        this.liveToken = undefined;
        this.env.location.replace(withoutLive(this.env.location.href()));
      }
    } else if (described.failure.kind === "unreachable") reachable = false;
    else {
      this.liveToken = before;
      const missing =
        described.failure.status === 404 || described.failure.code === "project.not-found";
      this.report(missing ? words.open.notFound : explainFailure(described.failure, words.errors));
      return missing ? "not-found" : "failed";
    }
    // A person without an account only looks unless a session's token says otherwise.
    if (this.guest && this.liveToken === undefined) role = "viewer";
    // A viewer and a guest keep nothing in this browser, so their project is never opened from the
    // database; a guest with no answer from the service has no copy to open either.
    const keepsNothing = role === "viewer" || this.guest !== undefined;
    const database = keepsNothing ? await openDatabase(undefined) : await this.database();
    const prepared = await CloudProject.prepare(id, this.deps(id, database, role), {
      needsCopy: !reachable,
      // A visitor the room cannot reach reads the snapshot instead, without the whole wait.
      quick: this.guest !== undefined && this.liveToken === undefined,
    });
    if (!prepared.ok) {
      this.liveToken = before;
      // A room that is full is not a project that could not be loaded: the person is told, and
      // told that opening the project again is the way to try once more. A network that holds as
      // many guests as a room takes is said, and not tried again by itself.
      this.unanswered = reachable && prepared.full !== true && prepared.stopped === undefined;
      this.report(
        prepared.stopped === "connections.limit"
          ? words.live.limited
          : prepared.stopped === "session.ended"
            ? words.live.ended
            : prepared.full === true
              ? words.open.full(CLOUD_LIMITS.clients)
              : reachable
                ? words.open.unavailable
                : words.open.failed,
      );
      return "failed";
    }
    // Swapping is one step: the Studio is never left bound to nothing, or to two projects.
    if (!this.project) this.hooks.keepLocal();
    this.project?.close();
    this.project = prepared.project;
    this.name = name;
    this.role_ = role;
    // Before the Studio binds: a viewer's page is read-only from the project's first file.
    this.hooks.access?.({ role, id, name, reason: "open", guest: this.guest !== undefined });
    this.hooks.changed({ id, name });
    // Said before the project binds, so that what the project says (it may not be kept here) shows.
    this.report(
      ended
        ? words.live.ended
        : !reachable
          ? words.open.openedOffline
          : this.liveToken !== undefined
            ? words.live.joined(name, role !== "viewer")
            : words.open.opened(name),
    );
    prepared.project.attach();
    this.hooks.status(prepared.project.status);
    if (setAddress) this.env.location.replace(addressFor(this.env.location.href(), id));
    for (const listener of [...this.openListeners]) listener({ id, name });
    this.sessionChanged();
    return "opened";
  }

  /**
   * The room's address for this page: the token of the live session it holds, and who it is when
   * nobody is signed in. Read at every attempt, so that a dropped token or a new name is the next
   * socket's.
   */
  private roomAddressOf(id: string): string {
    return roomAddress(roomUrl(this.env.location.href(), id), {
      live: this.liveToken,
      guest: this.guest ? { id: this.guest.id, name: this.guest.name() } : undefined,
    });
  }

  /** The room said hello to a connection of `id`: the session that let it in, if one did. */
  private helloed(id: string, hello: RoomHello): void {
    const session = this.liveToken !== undefined ? hello.live : undefined;
    const held = this.joined?.id === id ? this.joined.session : undefined;
    if (session?.until === held?.until && session?.guestsEdit === held?.guestsEdit) return;
    if (session) this.joined = { id, session };
    else if (this.joined?.id === id) this.joined = undefined;
    this.sessionChanged();
  }

  private deps(id: string, database: CloudDatabase, role: Role) {
    const hooks = this.hooks;
    const env = this.env;
    return {
      studio: hooks.studio,
      api: this.api,
      database,
      socket: env.socket,
      address: () => this.roomAddressOf(id),
      timers: env.timers,
      online: env.online,
      selection: hooks.selection,
      lastOpen: () => rememberedFile(env.storage, id),
      words: hooks.words,
      report: (message: string) => {
        // A project that is not the open one (still preparing) says nothing.
        if (this.project?.id === id) this.report(message);
      },
      status: (status: ConnectionStatus) => {
        if (this.project?.id === id) hooks.status(status);
      },
      readOnly: role === "viewer",
      keepsNothing: this.guest !== undefined,
      helloed: (hello: RoomHello) => this.helloed(id, hello),
      stopped: (reason: Stop) => void this.stopped(id, reason),
      roleChanged: (said: string) => this.roleChanged(id, said),
      accessDenied: () => void this.refreshRole(id),
    };
  }

  // A live session's end ------------------------------------------------------------------------

  /**
   * The room stopped the connection for good. A network that holds as many guests as a room takes
   * is said (the status line shows it, and nothing retries by itself). A live session that ended
   * drops its token (and the address's `live`), says so, and the page goes on with what the person
   * is without it: the same mode, reconnected; another mode, opened again; or, when the project's
   * link does not admit them, read-only on the files it holds (`live-sessions`, "When the session
   * ends under a guest").
   */
  private async stopped(id: string, reason: Stop): Promise<void> {
    if (this.project?.id !== id) return;
    const words = this.hooks.words();
    if (reason === "connections.limit") {
      this.report(words.live.limited);
      return;
    }
    this.liveToken = undefined;
    this.joined = undefined;
    this.env.location.replace(withoutLive(this.env.location.href()));
    this.sessionChanged();
    this.report(words.live.ended);
    const described = await this.api.get(id);
    if (this.project?.id !== id) return;
    if (!described.ok) {
      this.freeze(id);
      return;
    }
    const role = this.guest !== undefined ? "viewer" : (roleOf(described.value.role) ?? "viewer");
    if (role === "viewer") this.report(words.live.endedViewing(this.name));
    if (role === this.role_) this.project.rejoin();
    else await this.reopen(id, role);
  }

  /**
   * Lets go of the room and keeps what the page shows: the Studio keeps its files, unbound, and the
   * page shows them read-only (`frozen`). Nothing of the project is kept in this browser.
   */
  private freeze(id: string): void {
    const project = this.project;
    if (!project || project.id !== id) return;
    const name = this.name;
    project.close();
    this.project = undefined;
    this.name = "";
    this.role_ = "owner";
    this.liveToken = undefined;
    this.joined = undefined;
    this.hooks.status(undefined);
    this.hooks.changed(undefined);
    for (const listener of [...this.openListeners]) listener(undefined);
    this.sessionChanged();
    this.hooks.frozen?.({ id, name });
    this.report(this.hooks.words().live.endedFrozen);
  }

  // The role changes ----------------------------------------------------------------------------

  /** The room's hello named a role other than the one the project was opened with. */
  private roleChanged(id: string, said: string): void {
    const role = roleOf(said);
    if (role === undefined || this.project?.id !== id || role === this.role_) return;
    void this.reopen(id, role);
  }

  /** The room refused the person's change with `access.denied`: ask the service what they are now. */
  private async refreshRole(id: string): Promise<void> {
    if (this.project?.id !== id) return;
    const described = await this.api.get(id);
    if (!described.ok || this.project?.id !== id) return;
    const role =
      this.guest !== undefined && this.liveToken === undefined
        ? "viewer"
        : (roleOf(described.value.role) ?? "viewer");
    if (role !== this.role_) await this.reopen(id, role);
  }

  /**
   * Opens the project again as `role` says (a viewer promoted, an editor demoted): the Studio is
   * bound to the room's state in the other mode. The person keeps the file they had open.
   */
  private async reopen(id: string, role: Role): Promise<void> {
    if (this.reopening || this.project?.id !== id) return;
    this.reopening = true;
    try {
      const name = this.name;
      const database =
        role === "viewer" || this.guest !== undefined
          ? await openDatabase(undefined)
          : await this.database();
      const deps = {
        ...this.deps(id, database, role),
        lastOpen: () => this.hooks.studio.open || rememberedFile(this.env.storage, id),
      };
      const prepared = await CloudProject.prepare(id, deps, {});
      if (!prepared.ok) return;
      const current = this.project;
      if (current?.id !== id) {
        prepared.project.close();
        return;
      }
      // A demoted editor's changes the room never got are not kept: a viewer keeps nothing here.
      if (role === "viewer") current.forgetCopy();
      current.close();
      this.project = prepared.project;
      this.role_ = role;
      this.hooks.access?.({ role, id, name, reason: "role", guest: this.guest !== undefined });
      prepared.project.attach();
      this.hooks.status(prepared.project.status);
      for (const listener of [...this.openListeners]) listener({ id, name });
    } finally {
      this.reopening = false;
    }
  }

  private database(): Promise<CloudDatabase> {
    this.database_ ??= openDatabase(this.env.indexedDB, { timers: this.env.timers });
    return this.database_;
  }

  // Making ------------------------------------------------------------------------------------

  createFrom(name: string, template: string): Promise<Outcome<ProjectRow>> {
    return this.api.create({ name, template });
  }

  /**
   * Makes a cloud project from the anonymous one's files and uploads its images and fonts. A
   * project that cannot be completed is deleted again, so that trying again leaves no copy behind.
   */
  async saveLocal(
    name: string,
    progress: (path: string, done: number, total: number) => void,
  ): Promise<Outcome<ProjectRow>> {
    return this.uploadProject(name, this.hooks.localFiles(), progress);
  }

  /**
   * Makes a cloud project from files (the anonymous project's, or an archive's): its texts first,
   * then each image and font. The limits of a cloud project are checked before the first call; a
   * project that cannot be completed is deleted again, so that nothing half-made stays in the
   * account. Nothing is opened.
   */
  async uploadProject(
    name: string,
    files: ReadonlyMap<string, string | Uint8Array>,
    progress: (path: string, done: number, total: number) => void,
  ): Promise<Outcome<ProjectRow>> {
    const split = splitForCloud(files);
    if (!split.ok) {
      return {
        ok: false,
        failure: {
          kind: "refused",
          status: split.code === "path.invalid" ? 400 : 413,
          code: split.code,
        },
      };
    }
    const { texts, binaries } = split.value;
    const made = await this.api.create({ name, files: texts });
    if (!made.ok) return made;
    let done = 0;
    for (const [path, bytes] of binaries) {
      progress(path, ++done, binaries.length);
      const uploaded = await this.api.uploadBinary(made.value.id, path, bytes);
      if (!uploaded.ok) {
        await this.api.remove(made.value.id);
        return uploaded;
      }
    }
    return made;
  }

  // Leaving -----------------------------------------------------------------------------------

  /** Closes the cloud project and shows the anonymous one again; the address stops naming a project. */
  leaveToLocal(): void {
    const project = this.project;
    if (!project) return;
    project.close();
    this.project = undefined;
    this.name = "";
    this.role_ = "owner";
    this.liveToken = undefined;
    this.joined = undefined;
    this.sessionChanged();
    this.hooks.status(undefined);
    this.hooks.changed(undefined);
    // Before the anonymous project shows: it is loaded as the person's own, which view mode refuses.
    this.hooks.access?.(undefined);
    for (const listener of [...this.openListeners]) listener(undefined);
    this.env.location.replace(addressFor(this.env.location.href(), undefined));
    this.hooks.showLocal();
  }

  /** A project was deleted: this browser's copy goes, and the page leaves it if it was open. */
  deleted(id: string): void {
    const leaving = this.project?.id === id;
    if (leaving) this.leaveToLocal();
    void this.database().then((database) => database.forget(id));
  }
}
