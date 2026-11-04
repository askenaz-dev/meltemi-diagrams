// What the account panel knows and does, without a DOM (`account-panel`): the section shown, the
// identity service's data about the person (read through the page's own origin), the publishing
// handle, what is going on and what went wrong, and the actions. The panel draws it and calls these
// methods; a test drives it with a fake host. The two things that leave the page (linking a sign-in,
// deleting the account) are addresses the panel navigates to, built here.

import type { en } from "../messages/en.js";
import type { CloudWords } from "./explain.js";
import type { IdentityApi, IdentityView } from "./identity-api.js";
import { checkHandle, handleText } from "./publish-model.js";
import { MAX_RETURN_TO_LENGTH } from "./session.js";
import type { ApiFailure, Outcome } from "./tokens.js";

/** The sections of the panel, in the order the tabs list them. */
export const ACCOUNT_SECTIONS = [
  "profile",
  "signins",
  "devices",
  "tokens",
  "usage",
  "administration",
  "danger",
] as const;

export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];

/**
 * The sections a person sees: Administration only for an owner, an administrator, or a person with
 * a pending invitation to administer; every other section for everybody.
 */
export function visibleSections(user: {
  readonly administration: unknown;
  readonly administrationInvitation: unknown;
}): AccountSection[] {
  const administers = user.administration !== null || user.administrationInvitation !== null;
  return ACCOUNT_SECTIONS.filter((section) => section !== "administration" || administers);
}

/** The panel's words in a language. */
export type AccountWords = (typeof en)["accountPanel"];

/** The query parameter that opens the panel at a section: `?account=devices`. */
export const ACCOUNT_PARAMETER = "account";

/**
 * The section an address asks for: undefined when it asks for none, Profile when it names one
 * that does not exist.
 */
export function sectionFrom(value: string | null | undefined): AccountSection | undefined {
  if (value === null || value === undefined) return undefined;
  return (ACCOUNT_SECTIONS as readonly string[]).includes(value)
    ? (value as AccountSection)
    : "profile";
}

/** The page's address without the parameter that opened the panel, the rest kept. */
export function withoutAccountParameter(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  url.searchParams.delete(ACCOUNT_PARAMETER);
  return url.href;
}

/**
 * Where the identity service brings the person back to: this page at a section of the panel, its
 * fragment dropped, or the page's root at that section when the address would be too long for the
 * service to accept.
 */
export function returnAddressFor(href: string, section: AccountSection): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  url.hash = "";
  url.searchParams.set(ACCOUNT_PARAMETER, section);
  if (url.href.length <= MAX_RETURN_TO_LENGTH) return url.href;
  return `${url.origin}/?${ACCOUNT_PARAMETER}=${section}`;
}

/** The identity service's link flow for a provider, coming back to `returnTo`. */
export function linkAddress(accountPage: string, provider: string, returnTo: string): string {
  const url = new URL("/login", accountPage);
  url.searchParams.set("provider", provider);
  url.searchParams.set("link", "1");
  url.searchParams.set("return_to", returnTo);
  return url.href;
}

/** The identity service's account page, coming back to `returnTo` (where an account is deleted). */
export function accountPageAddress(accountPage: string, returnTo: string): string {
  const url = new URL(accountPage);
  url.searchParams.set("return_to", returnTo);
  return url.href;
}

/**
 * The coarse label the identity service stores (`Edge on Windows`) in the page's language. A label
 * of another shape is shown as it is.
 */
export function deviceLabel(label: string, words: AccountWords): string {
  const parts = /^(.+?) on (.+)$/.exec(label);
  if (!parts) return label;
  const browser = parts[1] === "Other browser" ? words.otherBrowser : parts[1]!;
  const system = parts[2] === "Other system" ? words.otherSystem : parts[2]!;
  return `${browser} ${words.deviceJoin} ${system}`;
}

/** The name of a provider as the person reads it. */
export function providerName(provider: string, words: AccountWords): string {
  return words.provider[provider] ?? provider;
}

/** What the panel needs from the page. */
export interface AccountPanelHost {
  readonly identity: IdentityApi;
  /** Chooses the account's handle (`PATCH /api/account`). */
  setHandle(handle: string): Promise<Outcome<{ readonly handle: string }>>;
  /** The session ended under the page: the panel closes and the page shows itself signed out. */
  signedOut(): void;
  /** Says something in the status line. */
  report(message: string): void;
}

export interface AccountPanelState {
  readonly section: AccountSection;
  /** Whether the identity data has been read. */
  readonly identity: "loading" | "ready" | "failed";
  readonly view: IdentityView | undefined;
  /** An action is on its way: the buttons wait. */
  readonly busy: boolean;
  /** Something going on or done, in words. */
  readonly status: string;
  /** Something that went wrong, in words; empty when nothing did. */
  readonly problem: string;
  /** The person's handle; null until they chose one. */
  readonly handle: string | null;
  /** What is wrong with the handle typed, in words; empty when nothing is. */
  readonly handleProblem: string;
}

export class AccountPanelModel {
  private current: AccountPanelState;
  private closed = false;

  constructor(
    private readonly host: AccountPanelHost,
    private readonly words: () => AccountWords,
    private readonly cloudWords: () => CloudWords,
    initial: { readonly section: AccountSection; readonly handle: string | null },
    private readonly changed: (state: AccountPanelState) => void,
  ) {
    this.current = {
      section: initial.section,
      identity: "loading",
      view: undefined,
      busy: false,
      status: "",
      problem: "",
      handle: initial.handle,
      handleProblem: "",
    };
  }

  get state(): AccountPanelState {
    return this.current;
  }

  /** The panel closed: answers that arrive later change nothing. */
  dispose(): void {
    this.closed = true;
  }

  private update(patch: Partial<AccountPanelState>): void {
    if (this.closed) return;
    this.current = { ...this.current, ...patch };
    this.changed(this.current);
  }

  /** Shows a section; the status and the problem of the one left go. */
  show(section: AccountSection): void {
    if (section === this.current.section) return;
    this.update({ section, status: "", problem: "" });
  }

  /** Whether a failure means the person is signed out: the page then says so and closes the panel. */
  private signedOutBy(failure: ApiFailure): boolean {
    if (failure.status !== 401 && failure.code !== "auth.required") return false;
    if (!this.closed) this.host.signedOut();
    return true;
  }

  /** A failure in words. */
  private explain(failure: ApiFailure): string {
    const m = this.words();
    if (failure.kind === "unreachable") return m.unreachable;
    switch (failure.code) {
      case "identity.last":
        return m.identityLast;
      case "session.current":
        return m.sessionCurrent;
      case "session.not-found":
        return m.sessionGone;
      case "rate.limited":
        return m.rateLimited;
      case "identity.unavailable":
        return m.unavailable;
    }
    if (failure.status === 502 || failure.kind === "unexpected") return m.unavailable;
    if (failure.message !== undefined && failure.code !== undefined) {
      return m.failed(failure.message, failure.code);
    }
    return m.failedStatus(failure.status);
  }

  /**
   * Reads the identity data: the sign-ins and the devices. `keepProblem` reads it again behind what
   * an action just said went wrong, which stays.
   */
  async load(options: { readonly keepProblem?: boolean } = {}): Promise<void> {
    this.update({ identity: "loading", ...(options.keepProblem ? {} : { problem: "" }) });
    const read = await this.host.identity.read();
    if (read.ok) {
      this.update({ identity: "ready", view: read.value });
      return;
    }
    if (this.signedOutBy(read.failure)) return;
    this.update({ identity: "failed" });
  }

  /** Runs an action that answers the identity data as it is now. True when it went through. */
  private async act(action: () => Promise<Outcome<IdentityView>>, done: string): Promise<boolean> {
    if (this.current.busy) return false;
    this.update({ busy: true, status: "", problem: "" });
    const outcome = await action();
    if (outcome.ok) {
      this.update({ busy: false, identity: "ready", view: outcome.value, status: done });
      this.host.report(done);
      return true;
    }
    if (this.signedOutBy(outcome.failure)) return false;
    this.update({ busy: false, problem: this.explain(outcome.failure) });
    // A device already signed out elsewhere: the list is read again, so that it goes.
    if (outcome.failure.code === "session.not-found") void this.load({ keepProblem: true });
    return false;
  }

  /** Unlinks a sign-in. */
  unlink(provider: string): Promise<boolean> {
    const name = providerName(provider, this.words());
    return this.act(() => this.host.identity.unlink(provider), this.words().unlinked(name));
  }

  /** Signs out every other device. */
  revokeOthers(): Promise<boolean> {
    return this.act(() => this.host.identity.revokeOthers(), this.words().signedOutOthers);
  }

  /** Signs out one other device, named for the words by its label. */
  revokeOne(sid: string, label: string): Promise<boolean> {
    const device = deviceLabel(label, this.words());
    return this.act(() => this.host.identity.revokeOne(sid), this.words().signedOutDevice(device));
  }

  /** Checks a handle as it is typed: what is wrong is said at once; nothing is said of an empty one. */
  typedHandle(typed: string): void {
    const checked = checkHandle(typed);
    this.update({
      handleProblem:
        checked.ok || checked.reason === "empty"
          ? ""
          : handleText(checked.reason, this.cloudWords()),
    });
  }

  /** Saves a handle. Nothing is sent for one that breaks the rule. True when it is the handle now. */
  async saveHandle(typed: string): Promise<boolean> {
    if (this.current.busy) return false;
    const checked = checkHandle(typed);
    if (!checked.ok) {
      this.update({ handleProblem: handleText(checked.reason, this.cloudWords()), status: "" });
      return false;
    }
    // The line under the field says what the handle is: the panel's status line stays for the rest.
    if (checked.value === this.current.handle) {
      this.update({ handleProblem: "", status: "" });
      return true;
    }
    this.update({ busy: true, status: this.words().handleSaving, handleProblem: "" });
    const saved = await this.host.setHandle(checked.value);
    if (saved.ok) {
      this.update({ busy: false, handle: saved.value.handle, status: "" });
      this.host.report(this.words().handleSaved(saved.value.handle));
      return true;
    }
    if (this.signedOutBy(saved.failure)) return false;
    const m = this.cloudWords().publishing;
    const problem =
      saved.failure.code === "handle.taken"
        ? m.handleTaken
        : saved.failure.code === "handle.locked"
          ? m.handleLocked
          : saved.failure.code === "handle.invalid"
            ? m.handleInvalid
            : this.explain(saved.failure);
    this.update({ busy: false, status: "", handleProblem: problem });
    return false;
  }
}
