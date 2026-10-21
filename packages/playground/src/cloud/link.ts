// Opening a project by its link, for whoever is on the page (`project-sharing`, "Viewing by link";
// `playground-cloud`, "Opening a project by address"). The address names the project (`?project=`)
// and may carry an invitation (`?invite=`): a person signed in accepts it first, and opens the
// project in the mode their role gives; nobody signed in is shown what the link admits, read once
// (view mode on a snapshot), and told to sign in to accept an invitation. A project that is not
// found says so and nothing more: whether it exists, or is private, is not for the page to say.
// The address is never changed here except to drop an invitation that was accepted.

import { addressFor, withoutInvite, type OpenPlan } from "./address.js";
import { hasCode, type CloudApi } from "./client.js";
import { explainFailure, type CloudWords } from "./explain.js";
import type { OpenOutcome } from "./projects-model.js";
import type { SnapshotViewer } from "./snapshot.js";
import type { InvitationApi } from "./view-api.js";
import type { ViewMode } from "./view-mode.js";
import {
  linkNotices,
  noticeText,
  type Acceptance,
  type LinkOutcome,
  type Role,
  type ViewWords,
} from "./view-model.js";

/** What opening by link needs of the signed-in person's projects (the cloud controller). */
export interface LinkCloud {
  /** Opens the project the address names (a plan of the `open` or `missing` kind); what to say when it did not open. */
  openAddress(plan: OpenPlan): Promise<string | undefined>;
  /** As `openAddress` for a project that may be there, with how it ended. */
  openLink(
    id: string,
  ): Promise<{ readonly outcome: OpenOutcome; readonly notice: string | undefined }>;
  /** What the person is to the project that is open. */
  readonly role: Role | undefined;
  readonly openProject: { readonly id: string; readonly name: string } | undefined;
}

export interface LinkDeps {
  /** Set when a person is signed in with a cookie: only they have projects to open. */
  readonly cloud: LinkCloud | undefined;
  /** `list` is asked only of a person signed in whose invitation turned out to be spent (see `isMember`). */
  readonly api: Pick<CloudApi, "get" | "list">;
  readonly invitations: InvitationApi;
  readonly snapshot: SnapshotViewer;
  readonly mode: ViewMode;
  /** The page's address bar. */
  readonly address: { href(): string; replace(url: string): void };
  readonly words: () => { readonly viewing: ViewWords; readonly cloud: CloudWords };
  /** Says something in the status line. */
  readonly report: (message: string) => void;
}

export class LinkOpener {
  constructor(private readonly deps: LinkDeps) {}

  /**
   * Opens what the address asks. Returns what to say once the anonymous project opens instead, or
   * undefined when the project opened (the status line has been told). The address stays as it is,
   * but for an invitation that was accepted.
   */
  async open(plan: OpenPlan): Promise<string | undefined> {
    if (plan.kind === "none") return undefined;
    const { cloud } = this.deps;
    if (plan.kind === "missing") {
      if (cloud) return cloud.openAddress(plan);
      return this.say(
        noticeText(linkNotices(facts(false, plan.invite, "none", "not-found")), this.words(), none),
      );
    }
    if (!cloud) return this.openAnonymously(plan.id, plan.invite);
    return this.openSignedIn(cloud, plan.id, plan.invite);
  }

  private words(): ViewWords {
    return this.deps.words().viewing;
  }

  private say(text: string): string {
    this.deps.report(text);
    return text;
  }

  // A person signed in ---------------------------------------------------------------------------

  private async openSignedIn(
    cloud: LinkCloud,
    named: string,
    invite: string | undefined,
  ): Promise<string | undefined> {
    let id = named;
    const words = this.words();
    let acceptance: Acceptance = "none";
    let failure: string | undefined;
    if (invite !== undefined) {
      // First: the role the person has when the project opens is the one the invitation gives.
      const accepted = await this.deps.invitations.accept(invite);
      if (accepted.ok) {
        acceptance = "accepted";
        const { address } = this.deps;
        // The invitation names its project (the token is the proof): an address that says another
        // one follows the invitation, and then names the project the person was invited to.
        if (accepted.value.id !== id) {
          id = accepted.value.id;
          address.replace(addressFor(address.href(), id));
        } else address.replace(withoutInvite(address.href()));
      } else if (accepted.failure.status === 401) acceptance = "signed-out";
      else if (accepted.failure.status === 404 || hasCode(accepted.failure, "project.not-found")) {
        // An invitation sent to the email the person signed in with is turned into a membership by
        // the session itself, before this page asks to accept it: the link they were sent is then
        // spent while the project is theirs, which is the invitation having done its work.
        if (await this.isMember(id)) {
          acceptance = "accepted";
          this.deps.address.replace(withoutInvite(this.deps.address.href()));
        } else acceptance = "invalid";
      } else {
        acceptance = "failed";
        failure = explainFailure(accepted.failure, this.deps.words().cloud.errors);
      }
    }
    const opened = await cloud.openLink(id);
    const outcome = linkOutcome(opened.outcome);
    const notices = linkNotices(facts(true, invite, acceptance, outcome));
    if (outcome === "opened") {
      const project = cloud.openProject;
      const name = project?.name ?? id;
      const role = cloud.role ?? "owner";
      const said = noticeText(notices, words, { name, role });
      if (said !== "") this.deps.report(said);
      else if (failure !== undefined) this.deps.report(failure);
      else if (role === "viewer") this.deps.report(words.openedLive(name));
      return undefined;
    }
    // Not opened: the controller said why; the invitation is said first, and the anonymous project opens.
    const lead = noticeText(
      notices.filter((notice) => notice !== "notFound"),
      words,
      none,
    );
    return [lead, failure, opened.notice]
      .filter((part) => part !== undefined && part !== "")
      .join(" ");
  }

  /** Whether the project is in the person's own list: they own it or were given a place in it. */
  private async isMember(id: string): Promise<boolean> {
    const listed = await this.deps.api.list();
    return listed.ok && listed.value.some((project) => project.id === id);
  }

  // Nobody signed in -------------------------------------------------------------------------------

  private async openAnonymously(
    id: string,
    invite: string | undefined,
  ): Promise<string | undefined> {
    const { api, snapshot, mode } = this.deps;
    const words = this.words();
    const cloudWords = this.deps.words().cloud;
    const described = await api.get(id);
    if (!described.ok) {
      const missing =
        described.failure.status === 404 || hasCode(described.failure, "project.not-found");
      if (missing) {
        return this.say(
          noticeText(linkNotices(facts(false, invite, "none", "not-found")), words, none),
        );
      }
      return this.say(explainFailure(described.failure, cloudWords.errors));
    }
    // Whatever role the service names, a person nobody signed in as can only look.
    const { name } = described.value;
    mode.enter({ id, name, live: false, signedIn: false });
    const loaded = await snapshot.load(id);
    if (!loaded.ok) {
      mode.leave();
      return this.say(explainFailure(loaded.failure, cloudWords.errors));
    }
    if (loaded.value.cancelled) return undefined;
    const lead = linkNotices(facts(false, invite, "none", "opened"));
    const missingFiles = loaded.value.missing;
    this.deps.report(
      lead.length > 0
        ? noticeText(lead, words, none)
        : missingFiles.length > 0
          ? cloudWords.project.binaryFetch(missingFiles[0]!)
          : words.opened(name),
    );
    return undefined;
  }
}

const none = { name: "", role: "" } as const;

function facts(
  signedIn: boolean,
  invite: string | undefined,
  acceptance: Acceptance,
  outcome: LinkOutcome,
) {
  return { signedIn, invite, acceptance, outcome } as const;
}

/** How a controller's outcome counts for the status line. */
function linkOutcome(outcome: OpenOutcome): LinkOutcome {
  if (outcome === "opened" || outcome === "already") return "opened";
  return outcome === "not-found" ? "not-found" : "failed";
}
