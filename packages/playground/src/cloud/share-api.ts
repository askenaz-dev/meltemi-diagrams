// The page's calls to a project's sharing (`project-sharing`): the link level, the members and the
// invitations. Typed answers, and every way a call can go wrong as a value (`calls.ts`): the page
// works without a service, so nothing here throws. What the service answers depends on who asks:
// the owner gets the whole state, a member the people's names and pictures (never emails), anyone else
// the link admits only the level and their own role. The shapes below keep that difference: a field the
// person is not given is `undefined`, never an empty list, so a dialog cannot show an empty member
// list where it should show none.

import { inPage, isObject, parseObject, type Fetch } from "./http.js";
import { call, nothing, segment, timeOf, type Reader } from "./calls.js";
import { avatarUrl } from "./session.js";
import type { Outcome } from "./tokens.js";

/** What opening a project's link gives: nothing, view, or edit (signed in). */
export type LinkLevel = "private" | "view" | "edit";
export const LINK_LEVELS: readonly LinkLevel[] = ["private", "view", "edit"];

/** What an owner gives a person by name. */
export type MemberRole = "viewer" | "editor";
export const MEMBER_ROLES: readonly MemberRole[] = ["viewer", "editor"];

/** What a person is to a project. */
export type ProjectRole = "owner" | MemberRole;

/** The most members and pending invitations together a project holds: the service's `MAX_MEMBERS`. */
export const MAX_MEMBERS = 50;

/** A person the owner added (or accepted an invitation). Only the owner's answer carries `email`. */
export interface Member {
  readonly sub: string;
  /** May be empty. */
  readonly name: string;
  /** An address the picture may be drawn from (`avatarUrl`), or undefined. */
  readonly picture: string | undefined;
  /** Only the owner sees it. */
  readonly email: string | undefined;
  readonly role: MemberRole;
  /** An ISO time; empty for a person who is not the owner's to see it. */
  readonly addedAt: string;
}

/** An invitation that is pending, as the owner sees it, with the link that carries its token. */
export interface Invitation {
  readonly id: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** `<origin>/p/<id>?invite=<token>`: the owner passes it on. No mail is sent. */
  readonly link: string;
}

/** A project's sharing as the person who asked is allowed to see it. */
export interface SharingState {
  readonly linkAccess: LinkLevel;
  /** What the person is to the project. */
  readonly role: ProjectRole;
  /** The people (the owner and the members see them); undefined for anyone else. */
  readonly members: readonly Member[] | undefined;
  /** The pending invitations; the owner's alone. */
  readonly invitations: readonly Invitation[] | undefined;
}

/** What `POST …/members` answers: the invitation, and whether it is a new one. */
export interface Invited {
  readonly invitation: Invitation;
  /** False when the email already had a pending invitation, whose role was set again. */
  readonly created: boolean;
}

/** The calls. None throws: a failure is an `Outcome` like any other. */
export interface SharingApi {
  get(id: string): Promise<Outcome<SharingState>>;
  /** The owner's: answers the whole state. */
  setLink(id: string, level: LinkLevel): Promise<Outcome<SharingState>>;
  invite(id: string, email: string, role: MemberRole): Promise<Outcome<Invited>>;
  setRole(id: string, sub: string, role: MemberRole): Promise<Outcome<Member>>;
  removeMember(id: string, sub: string): Promise<Outcome<null>>;
  /** A member leaves; the owner cannot. */
  leave(id: string): Promise<Outcome<null>>;
  invitations(id: string): Promise<Outcome<Invitation[]>>;
  revoke(id: string, invitation: string): Promise<Outcome<null>>;
}

// Reading answers --------------------------------------------------------------------------------

const text = (value: unknown): value is string => typeof value === "string";

const isLevel = (value: unknown): value is LinkLevel => LINK_LEVELS.some((l) => l === value);
const isMemberRole = (value: unknown): value is MemberRole => MEMBER_ROLES.some((r) => r === value);
const isRole = (value: unknown): value is ProjectRole => value === "owner" || isMemberRole(value);

/** The longest name or email the page keeps of what the service sent. */
const LONGEST = 320;

function memberOf(value: unknown, page: string): Member | undefined {
  if (!isObject(value)) return undefined;
  const { sub, name, picture, email, role } = value;
  if (!text(sub) || sub === "" || !isMemberRole(role)) return undefined;
  return {
    sub,
    name: text(name) ? name.slice(0, LONGEST) : "",
    picture: avatarUrl(picture, page),
    email: text(email) && email !== "" ? email.slice(0, LONGEST) : undefined,
    role,
    addedAt: timeOf(value["added_at"]),
  };
}

function invitationOf(value: unknown): Invitation | undefined {
  if (!isObject(value)) return undefined;
  const { id, email, role, link } = value;
  if (!text(id) || id === "" || !text(email) || !isMemberRole(role)) return undefined;
  if (!text(link) || link === "") return undefined;
  return {
    id,
    email: email.slice(0, LONGEST),
    role,
    createdAt: timeOf(value["created_at"]),
    expiresAt: timeOf(value["expires_at"]),
    link,
  };
}

function listOf<T>(value: unknown, read: (row: unknown) => T | undefined): T[] | undefined {
  return Array.isArray(value) ? value.flatMap((row) => read(row) ?? []) : undefined;
}

/** `{ linkAccess, role, members?, invitations? }`; a field the person is not given stays undefined. */
const readState =
  (page: string): Reader<SharingState> =>
  (answer) => {
    const body = parseObject(answer.text);
    if (!body || !isLevel(body["linkAccess"]) || !isRole(body["role"])) return undefined;
    return {
      value: {
        linkAccess: body["linkAccess"],
        role: body["role"],
        members: listOf(body["members"], (row) => memberOf(row, page)),
        invitations: listOf(body["invitations"], invitationOf),
      },
    };
  };

const readInvited: Reader<Invited> = (answer) => {
  const invitation = invitationOf(parseObject(answer.text));
  return invitation ? { value: { invitation, created: answer.status === 201 } } : undefined;
};

const readMember =
  (page: string): Reader<Member> =>
  (answer) => {
    const member = memberOf(parseObject(answer.text), page);
    return member ? { value: member } : undefined;
  };

const readInvitations: Reader<Invitation[]> = (answer) => {
  const rows = listOf(parseObject(answer.text)?.["invitations"], invitationOf);
  return rows ? { value: rows } : undefined;
};

// The calls --------------------------------------------------------------------------------------

/** The calls of the page to `…/sharing`, `…/members` and `…/invitations`, relative to the page. */
export function sharingApi(fetchFn: Fetch, location: Pick<Location, "href">): SharingApi {
  const page = location.href.replace(/#.*$/, "");
  const accept = { Accept: "application/json" };
  const asJson = { ...accept, "Content-Type": "application/json" };
  const at = (id: string, rest: string) => inPage(page, `api/projects/${segment(id)}/${rest}`);
  const withBody = (method: string, body: unknown): RequestInit => ({
    method,
    headers: asJson,
    body: JSON.stringify(body),
  });
  const deleting: RequestInit = { method: "DELETE", headers: accept };
  return {
    get: (id) => call(fetchFn, at(id, "sharing"), { headers: accept }, readState(page)),
    setLink: (id, level) =>
      call(fetchFn, at(id, "sharing"), withBody("PATCH", { linkAccess: level }), readState(page)),
    invite: (id, email, role) =>
      call(fetchFn, at(id, "members"), withBody("POST", { email, role }), readInvited),
    setRole: (id, sub, role) =>
      call(
        fetchFn,
        at(id, `members/${segment(sub)}`),
        withBody("PATCH", { role }),
        readMember(page),
      ),
    removeMember: (id, sub) => call(fetchFn, at(id, `members/${segment(sub)}`), deleting, nothing),
    leave: (id) => call(fetchFn, at(id, "members/me"), deleting, nothing),
    invitations: (id) => call(fetchFn, at(id, "invitations"), { headers: accept }, readInvitations),
    revoke: (id, invitation) =>
      call(fetchFn, at(id, `invitations/${segment(invitation)}`), deleting, nothing),
  };
}
