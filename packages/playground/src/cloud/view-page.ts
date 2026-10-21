// Viewing by link, as one thing the page holds (`project-sharing`, "Viewing by link"): the mode, the
// snapshot an anonymous viewer reads, the opening of an address, and what a viewer can do with the
// project (make a copy, save a copy, reload). The page's pieces it needs are handed in, and nothing
// here touches a DOM or a global, so that a test plays all of it.

import type { Studio } from "../studio.js";
import type { Template } from "../templates.js";
import { addressFor, type OpenPlan } from "./address.js";
import type { Timers } from "./binding.js";
import { cloudApi, type CloudApi } from "./client.js";
import type { CloudController } from "./controller.js";
import type { CloudWords } from "./explain.js";
import type { Fetch } from "./http.js";
import { LinkOpener } from "./link.js";
import { SnapshotViewer } from "./snapshot.js";
import { ViewActions, type ActionsHost, type KeptWork } from "./view-actions.js";
import { invitationApi } from "./view-api.js";
import { ViewMode } from "./view-mode.js";
import type { Role, ViewWords } from "./view-model.js";

/** The browser's parts viewing needs, for a person signed in or not: the page's calls, clock and address bar. */
export interface ViewEnvironment {
  readonly fetch: Fetch;
  readonly timers: Timers;
  readonly location: { href(): string; replace(url: string): void };
}

export interface ViewPageDeps {
  readonly studio: Studio;
  /** The signed-in person's projects; undefined for nobody. */
  readonly cloud: CloudController | undefined;
  readonly environment: ViewEnvironment;
  readonly words: () => { readonly viewing: ViewWords; readonly cloud: CloudWords };
  /** Says something in the status line. */
  readonly report: (message: string) => void;
  /** The files shown. */
  readonly files: () => Map<string, string | Uint8Array>;
  /** The anonymous project this browser keeps. */
  readonly keptWork: () => KeptWork | undefined;
  readonly templates: () => readonly Template[];
  readonly isTemplate: (
    files: ReadonlyMap<string, string | Uint8Array>,
    templates: readonly Template[],
  ) => boolean;
  readonly confirm: (title: string, message: string, action: string) => Promise<boolean>;
  /** Opens the anonymous project: the one this browser keeps, or the flow template. */
  readonly showLocal: () => void;
  /** Replaces the anonymous project, keeping what it replaces as the previous project. */
  readonly replaceProject: (
    files: Iterable<readonly [string, string | Uint8Array]>,
    open?: string,
  ) => void;
}

export class ViewPage {
  readonly mode: ViewMode;
  readonly snapshot: SnapshotViewer;
  private readonly opener: LinkOpener;
  private readonly actions: ViewActions;

  constructor(private readonly deps: ViewPageDeps) {
    const { studio, cloud, environment } = deps;
    this.mode = new ViewMode(studio);
    // The same calls for whoever is on the page: a signed-in person's own, watched for usage.
    const api: CloudApi =
      cloud?.api ?? cloudApi(environment.fetch, { href: environment.location.href() });
    this.snapshot = new SnapshotViewer({
      studio,
      api,
      timers: environment.timers,
      stale: (stale) => this.mode.setStale(stale),
    });
    this.opener = new LinkOpener({
      cloud,
      api,
      invitations: invitationApi(environment.fetch, { href: environment.location.href() }),
      snapshot: this.snapshot,
      mode: this.mode,
      address: environment.location,
      words: deps.words,
      report: deps.report,
    });
    const host: ActionsHost = {
      mode: this.mode,
      studio,
      cloud: cloud
        ? { duplicate: (id) => cloud.api.duplicate(id), open: (id) => cloud.open(id) }
        : undefined,
      snapshot: this.snapshot,
      words: deps.words,
      report: deps.report,
      files: deps.files,
      keptWork: deps.keptWork,
      isTemplate: (files) => deps.isTemplate(files, deps.templates()),
      confirm: deps.confirm,
      leave: () => this.leave(),
      replaceProject: (files, open) => deps.replaceProject(files, open),
    };
    this.actions = new ViewActions(host);
  }

  /** Whether a copy can go to the person's projects: a person is signed in. */
  get canSave(): boolean {
    return this.actions.canSave;
  }

  /**
   * Opens what the address asks, in the mode the person's role gives. Returns what to say once the
   * anonymous project opens instead, or undefined when the project opened.
   */
  open(plan: OpenPlan): Promise<string | undefined> {
    return this.opener.open(plan);
  }

  /**
   * What the person is to the project the cloud controller opens or leaves (its `access` hook): a
   * viewer's page goes read-only before the Studio binds, and an editor's (or none) is not.
   */
  access(
    access:
      | {
          readonly role: Role;
          readonly id: string;
          readonly name: string;
          readonly reason: "open" | "role";
        }
      | undefined,
  ): void {
    const words = this.deps.words().viewing;
    if (access?.role === "viewer") {
      this.mode.enter({ id: access.id, name: access.name, live: true, signedIn: true });
      if (access.reason === "role") this.deps.report(words.access.nowViewer);
      return;
    }
    // A snapshot is the page's own, not the cloud controller's: it is not ended by the controller.
    if (this.mode.state?.live) this.mode.leave();
    if (access?.reason === "role") this.deps.report(words.access.nowEditor);
  }

  makeCopy(): Promise<boolean> {
    return this.actions.makeCopy();
  }

  saveCopy(): Promise<boolean> {
    return this.actions.saveCopy();
  }

  reload(): Promise<boolean> {
    return this.actions.reload();
  }

  /**
   * Leaves the project that is being viewed for the anonymous project of this browser (which was
   * never touched): the address stops naming a project, view mode ends and the project shows.
   */
  leave(): void {
    const { cloud, environment } = this.deps;
    if (cloud?.openProject) {
      // The controller ends view mode on its way out (`access`), and shows the anonymous project.
      cloud.leaveToLocal();
      return;
    }
    if (!this.mode.active) return;
    this.snapshot.close();
    this.mode.leave();
    environment.location.replace(addressFor(environment.location.href(), undefined));
    this.deps.showLocal();
  }
}
