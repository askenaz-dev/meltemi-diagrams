// What the share dialog knows and does, without a DOM: a project's link level, its people and its
// invitations as the person who opened the dialog is allowed to see them, the invitation just made,
// what is going on and what went wrong, and the actions that change the sharing (the level, an
// invitation, a role, removing a person, revoking, leaving, copying a link). The dialog draws what
// `shareView` says and calls these methods; a test drives them with a fake host.
//
// `shareView` decides what each person is shown, and is the only place that does: the owner gets the
// level, the people with their emails, the invitations with their links, the invitation form and the
// publish entry; a member gets their role, the people (names and pictures) and "Leave"; anyone else the
// link admits gets the link and their role. A control the person may not use is not in the view, so
// the dialog cannot draw it. The service enforces the same (`GET …/sharing` answers each of them only
// what they may see); this keeps the page from asking for, or showing, what is not theirs.

import { explainFailure, type CloudWords } from "./explain.js";
import {
  MAX_MEMBERS,
  MEMBER_ROLES,
  type Invitation,
  type LinkLevel,
  type Member,
  type MemberRole,
  type ProjectRole,
  type SharingApi,
  type SharingState,
} from "./share-api.js";
import { whenText, type ApiFailure } from "./tokens.js";

/** The longest email address (RFC 5321), as the service reads it. */
export const EMAIL_MAX = 254;

/** An address with something before the `@` and a dotted name after it: the service's own rule. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL = /\p{Cc}/u;

export type EmailCheck =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly reason: "empty" | "invalid" };

/**
 * The email a person typed, as the service reads it: trimmed and in lower case. Nothing is sent
 * for one that is empty, too long, without a dotted domain, or holding a space or a control character.
 */
export function checkEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  if (email === "") return { ok: false, reason: "empty" };
  if (email.length > EMAIL_MAX || !EMAIL.test(email) || CONTROL.test(email)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, email };
}

/** Why an email was refused, in words. */
export function emailText(reason: "empty" | "invalid", words: CloudWords): string {
  return reason === "empty" ? words.sharing.emailEmpty : words.sharing.emailInvalid;
}

/** A failed call in words: what sharing adds to what every cloud call says (`explainFailure`). */
export function explainSharing(failure: ApiFailure, words: CloudWords): string {
  const m = words.sharing.errors;
  if (failure.kind === "refused") {
    if (failure.code === "quota.members") return m.quotaMembers(MAX_MEMBERS);
    if (failure.code === "request.invalid") return m.requestInvalid;
    if (failure.code === "invite.invalid") return m.inviteInvalid;
    if (failure.code === "access.denied" || failure.status === 403) return m.accessDenied;
  }
  return explainFailure(failure, words.errors);
}

/** Whether a refusal says the person or the invitation the page named is not there (any more). */
function isGone(failure: ApiFailure): boolean {
  return failure.kind === "refused" && failure.status === 404 && failure.code === "not-found";
}

/** The project a share dialog is about. */
export interface SharedProject {
  readonly id: string;
  readonly name: string;
}

/**
 * The project the header's Share button is about, or undefined when the anonymous project is open
 * (its dialog is the `#p=` one, which carries the files in the link). A cloud project the person
 * has open has the sharing dialog, and so has a project the page only shows to view by its link,
 * nobody signed in included: it has no place in anyone's account, but it has a link to give and a
 * role to tell.
 */
export function shareTarget(
  open: SharedProject | undefined,
  viewed: SharedProject | undefined,
): SharedProject | undefined {
  return open ?? viewed;
}

/** What the page asks of the page: the calls, and the parts only the page can do. */
export interface ShareHost {
  readonly api: SharingApi;
  /** Writes text to the clipboard; false when it cannot (a page that is not secure, a refusal). */
  copy(text: string): Promise<boolean>;
  /** Says something in the status line. */
  report(message: string): void;
  /** The person left the project: the page lets go of it. */
  left(): void;
}

export interface ShareState {
  /** The project the dialog is about. */
  readonly project: string;
  /** Whether the sharing has been read: nothing is known of it until `ready`. */
  readonly list: "loading" | "ready" | "failed";
  /** What the person may see of it; undefined until it is read. */
  readonly sharing: SharingState | undefined;
  /** An action is on its way: the controls wait. */
  readonly busy: boolean;
  /** Something going on or done, in words. */
  readonly status: string;
  /** Something that went wrong, in words; empty when nothing did. */
  readonly problem: string;
  /** What is wrong with the email in the invitation form, in words; empty when nothing is. */
  readonly emailProblem: string;
  /** The invitation just made, shown with its link until the next one or the dialog's end. */
  readonly invited: Invitation | undefined;
  /** The person left the project: nothing more is shown of it. */
  readonly left: boolean;
}

/** What `copy` copies: the project's link, or an invitation's. */
export type CopyTarget = "link" | { readonly invitation: string };

const byCreation = (a: Invitation, b: Invitation): number =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;

/** The invitations with this one in: replacing the one with its id, or after the others. */
function withInvitation(held: readonly Invitation[], one: Invitation): Invitation[] {
  const rest = held.filter((invitation) => invitation.id !== one.id);
  return [...rest, one].sort(byCreation);
}

/** The name a person is shown by: their name, their email when the owner sees one, or nothing known. */
export function displayName(member: Pick<Member, "name" | "email">, words: CloudWords): string {
  const name = member.name.trim();
  if (name !== "") return name;
  return member.email ?? words.sharing.unnamed;
}

export class ShareModel {
  private current: ShareState;
  private disposed = false;

  constructor(
    private readonly host: ShareHost,
    readonly project: string,
    private readonly link: string,
    private readonly words: () => CloudWords,
    private readonly changed: (state: ShareState) => void,
  ) {
    this.current = {
      project,
      list: "loading",
      sharing: undefined,
      busy: false,
      status: "",
      problem: "",
      emailProblem: "",
      invited: undefined,
      left: false,
    };
  }

  get state(): ShareState {
    return this.current;
  }

  /** The dialog was closed: what a call in the air brings is nobody's now. */
  dispose(): void {
    this.disposed = true;
  }

  private update(patch: Partial<ShareState>): void {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    this.changed(this.current);
  }

  private get role(): ProjectRole | undefined {
    return this.current.sharing?.role;
  }

  /** The owner's actions: nothing else changes the sharing, and nothing is sent for anyone else. */
  private get managing(): boolean {
    return this.role === "owner";
  }

  /** What went wrong in words, in the dialog and in the status line. */
  private refuse(failure: ApiFailure): string {
    const problem = explainSharing(failure, this.words());
    this.update({ busy: false, status: "", problem });
    this.host.report(problem);
    return problem;
  }

  /** The action went through: said in the dialog and in the status line. */
  private done(patch: Partial<ShareState>, status: string): void {
    this.update({ ...patch, busy: false, status, problem: "" });
    this.host.report(status);
  }

  /**
   * After a refusal that says the page's picture of the sharing is out of date (the person or the
   * invitation is gone, the person is not the owner any more), reads it again and keeps what was said.
   */
  private async refresh(): Promise<void> {
    const read = await this.host.api.get(this.project);
    if (read.ok) this.update({ sharing: read.value });
  }

  /** Reads the sharing. */
  async load(): Promise<void> {
    this.update({ list: "loading", status: this.words().sharing.loading, problem: "" });
    const read = await this.host.api.get(this.project);
    if (!read.ok) {
      const problem = explainSharing(read.failure, this.words());
      this.update({ list: "failed", status: "", problem });
      this.host.report(problem);
      return;
    }
    this.update({ list: "ready", sharing: read.value, status: "", problem: "" });
  }

  /** The owner changes who the link admits. True when the service accepted it. */
  async setLink(level: LinkLevel): Promise<boolean> {
    if (this.current.busy || !this.managing) return false;
    const m = this.words().sharing;
    this.update({ busy: true, status: m.changingLevel, problem: "" });
    const answer = await this.host.api.setLink(this.project, level);
    if (!answer.ok) {
      this.refuse(answer.failure);
      await this.refresh();
      return false;
    }
    this.done({ sharing: answer.value }, m.levels[answer.value.linkAccess].done);
    return true;
  }

  /**
   * The owner invites a person by email with a role. An email that is not one never reaches the
   * service. The invitation comes back with its link, shown at once: no mail is sent. True when the
   * invitation was made, or an invitation that was pending for that email now gives this role.
   */
  async invite(typed: string, role: MemberRole): Promise<boolean> {
    if (this.current.busy || !this.managing) return false;
    const checked = checkEmail(typed);
    if (!checked.ok) {
      this.update({
        status: "",
        problem: "",
        emailProblem: emailText(checked.reason, this.words()),
      });
      return false;
    }
    if (!MEMBER_ROLES.includes(role)) return false;
    const m = this.words().sharing;
    this.update({ busy: true, status: m.inviting, problem: "", emailProblem: "" });
    const made = await this.host.api.invite(this.project, checked.email, role);
    if (!made.ok) {
      this.refuse(made.failure);
      return false;
    }
    const { invitation, created } = made.value;
    const sharing = this.current.sharing;
    this.done(
      {
        invited: invitation,
        ...(sharing
          ? {
              sharing: {
                ...sharing,
                invitations: withInvitation(sharing.invitations ?? [], invitation),
              },
            }
          : {}),
      },
      created
        ? m.invited(invitation.email)
        : m.invitedAgain(invitation.email, m.roles[invitation.role]),
    );
    return true;
  }

  /** The owner changes a member's role. True when the service accepted it. */
  async setRole(sub: string, role: MemberRole): Promise<boolean> {
    if (this.current.busy || !this.managing) return false;
    const held = this.current.sharing?.members?.find((member) => member.sub === sub);
    if (!held) return false;
    if (held.role === role) return true;
    const m = this.words().sharing;
    this.update({ busy: true, status: m.changingRole, problem: "" });
    const answer = await this.host.api.setRole(this.project, sub, role);
    if (!answer.ok) {
      this.refuse(answer.failure);
      await this.refresh();
      return false;
    }
    const sharing = this.current.sharing;
    const named = { ...held, ...answer.value, email: answer.value.email ?? held.email };
    this.done(
      sharing
        ? {
            sharing: {
              ...sharing,
              members: (sharing.members ?? []).map((member) =>
                member.sub === sub ? named : member,
              ),
            },
          }
        : {},
      m.roleChanged(displayName(named, this.words()), m.roles[role]),
    );
    return true;
  }

  /** The owner removes a person (the dialog asked first). True when they are no longer a member. */
  async remove(sub: string): Promise<boolean> {
    if (this.current.busy || !this.managing) return false;
    const held = this.current.sharing?.members?.find((member) => member.sub === sub);
    if (!held) return false;
    const m = this.words().sharing;
    this.update({ busy: true, status: m.removing, problem: "" });
    const answer = await this.host.api.removeMember(this.project, sub);
    if (!answer.ok && !isGone(answer.failure)) {
      this.refuse(answer.failure);
      await this.refresh();
      return false;
    }
    const sharing = this.current.sharing;
    const name = displayName(held, this.words());
    this.done(
      sharing
        ? {
            sharing: {
              ...sharing,
              members: (sharing.members ?? []).filter((member) => member.sub !== sub),
            },
          }
        : {},
      answer.ok ? m.removed(name) : m.gone,
    );
    return true;
  }

  /** The owner revokes a pending invitation. True when it is no longer pending. */
  async revoke(id: string): Promise<boolean> {
    if (this.current.busy || !this.managing) return false;
    const held = this.current.sharing?.invitations?.find((invitation) => invitation.id === id);
    if (!held) return false;
    const m = this.words().sharing;
    this.update({ busy: true, status: m.revoking, problem: "" });
    const answer = await this.host.api.revoke(this.project, id);
    if (!answer.ok && !isGone(answer.failure)) {
      this.refuse(answer.failure);
      await this.refresh();
      return false;
    }
    const sharing = this.current.sharing;
    this.done(
      {
        invited: this.current.invited?.id === id ? undefined : this.current.invited,
        ...(sharing
          ? {
              sharing: {
                ...sharing,
                invitations: (sharing.invitations ?? []).filter(
                  (invitation) => invitation.id !== id,
                ),
              },
            }
          : {}),
      },
      answer.ok ? m.revoked(held.email) : m.gone,
    );
    return true;
  }

  /**
   * A member leaves (the dialog asked first); the owner cannot. The page then lets go of the
   * project. True when the person is no longer a member.
   */
  async leave(): Promise<boolean> {
    if (this.current.busy || this.role === undefined || this.role === "owner") return false;
    const m = this.words().sharing;
    this.update({ busy: true, status: m.leaving, problem: "" });
    const answer = await this.host.api.leave(this.project);
    if (!answer.ok) {
      this.refuse(answer.failure);
      return false;
    }
    this.done({ left: true }, m.left);
    this.host.left();
    return true;
  }

  /** Copies the project's link or an invitation's. False when the clipboard refused: select it by hand. */
  async copy(target: CopyTarget): Promise<boolean> {
    const m = this.words().sharing;
    const text =
      target === "link"
        ? this.link
        : [this.current.invited, ...(this.current.sharing?.invitations ?? [])].find(
            (invitation) => invitation?.id === target.invitation,
          )?.link;
    if (text === undefined) return false;
    const copied = await this.host.copy(text);
    const status = copied ? (target === "link" ? m.linkCopied : m.invitationCopied) : m.selectIt;
    this.update({ status, problem: "" });
    this.host.report(status);
    return copied;
  }
}

// What each person is shown --------------------------------------------------------------------

/** One of the three ways the link can admit people. */
export interface LevelChoice {
  readonly value: LinkLevel;
  readonly label: string;
  /** One sentence on what it means. */
  readonly text: string;
  readonly checked: boolean;
}

/** A person with a role, as a row of the list. */
export interface PersonRow {
  readonly key: string;
  /** The name to show: their name, their email (the owner sees it) or "Someone". */
  readonly name: string;
  /** The email, for the owner only. */
  readonly email: string | undefined;
  readonly picture: string | undefined;
  readonly role: MemberRole;
  readonly roleText: string;
  /** This is the person looking at the dialog. */
  readonly you: boolean;
  /** The owner may change the role and remove the person. */
  readonly editable: boolean;
}

/** A pending invitation, as a row of the owner's list. */
export interface InvitationRow {
  readonly key: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly roleText: string;
  /** "Expires 14 Nov 2026", or empty without a date. */
  readonly expires: string;
  readonly link: string;
}

/** What the dialog shows, for the person who opened it and what the service told of the sharing. */
export interface ShareView {
  /** The project's link, `<origin>/p/<id>`: everyone sees it, copying is always offered. */
  readonly link: string;
  /** The owner's three ways to open the link; undefined for anyone else (no control changes it). */
  readonly level: readonly LevelChoice[] | undefined;
  /** What the person is to the project, as a sentence; undefined until it is read. */
  readonly role: ProjectRole | undefined;
  readonly roleText: string;
  /** The people: for the owner and for members; undefined for anyone else. */
  readonly people: readonly PersonRow[] | undefined;
  /** The pending invitations: the owner's alone. */
  readonly invitations: readonly InvitationRow[] | undefined;
  /** "3 of 50 people and invitations": the owner's. */
  readonly count: string;
  /** The invitation form: the owner's. */
  readonly invite: boolean;
  /** The invitation just made. */
  readonly revealed: InvitationRow | undefined;
  /** "Leave": a member's (never the owner's, never a person only the link admits). */
  readonly leave: boolean;
  /** The entry that opens the publish dialog: the owner's, when the page can publish. */
  readonly publish: boolean;
  /** The sharing could not be read: offer to try again. */
  readonly retry: boolean;
}

export interface ViewContext {
  readonly words: CloudWords;
  /** The project's link. */
  readonly link: string;
  /** The `sub` of the person looking, when the page knows it. */
  readonly me: string | undefined;
  /** The language times are written in. */
  readonly locale: string;
  /** Whether the page can publish (a cloud project with the catalog build). */
  readonly canPublish: boolean;
}

function invitationRow(invitation: Invitation, context: ViewContext): InvitationRow {
  const m = context.words.sharing;
  return {
    key: invitation.id,
    email: invitation.email,
    role: invitation.role,
    roleText: m.roles[invitation.role],
    expires:
      invitation.expiresAt === "" ? "" : m.expires(whenText(invitation.expiresAt, context.locale)),
    link: invitation.link,
  };
}

/** What the dialog shows now. Pure: the same state and context give the same view. */
export function shareView(state: ShareState, context: ViewContext): ShareView {
  const m = context.words.sharing;
  const sharing = state.left ? undefined : state.sharing;
  const owner = sharing?.role === "owner";
  const invitations = owner ? (sharing.invitations ?? []) : undefined;
  const members = sharing?.members;
  return {
    link: context.link,
    level: owner
      ? (["private", "view", "edit"] as const).map((value) => ({
          value,
          label: m.levels[value].label,
          text: m.levels[value].text,
          checked: sharing.linkAccess === value,
        }))
      : undefined,
    role: sharing?.role,
    roleText: sharing ? m.youAre[sharing.role] : "",
    people: members?.map((member) => ({
      key: member.sub,
      name: displayName(member, context.words),
      email: owner ? member.email : undefined,
      picture: member.picture,
      role: member.role,
      roleText: m.roles[member.role],
      you: context.me !== undefined && member.sub === context.me,
      editable: owner,
    })),
    invitations: invitations?.map((invitation) => invitationRow(invitation, context)),
    count: owner ? m.count((members?.length ?? 0) + (invitations?.length ?? 0), MAX_MEMBERS) : "",
    invite: owner,
    revealed: owner && state.invited ? invitationRow(state.invited, context) : undefined,
    leave: sharing !== undefined && sharing.role !== "owner" && members !== undefined,
    publish: owner && context.canPublish,
    retry: state.list === "failed",
  };
}
