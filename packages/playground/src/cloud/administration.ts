// The page's side of the administration of the service (`account-panel`, "Administration
// section"): the calls to `/api/admin`, the shapes it accepts back, the address of a publication to
// take down, and the log's entries in words. No DOM and no globals: a fake `fetch` drives all of it
// in a test.

import type { AccountWords } from "./account-panel-model.js";
import { inPage, isObject, parseObject, type Fetch } from "./http.js";
import { call, type Outcome, type Reader } from "./tokens.js";

/** What a person is to the administration of the service. */
export type AdminRole = "owner" | "administrator";

/** A person in full, as the section lists owners, administrators and holders. */
export interface AdminPerson {
  readonly sub: string;
  readonly name: string;
  readonly handle: string | null;
  readonly email: string;
}

/** A person named in passing: who invited, granted or acted; `deleted` when the account is gone. */
export interface AdminRef {
  readonly sub: string;
  readonly name: string;
  readonly deleted: boolean;
}

export interface AdminAdministrator extends AdminPerson {
  readonly invitedBy: AdminRef;
  readonly since: string;
}

export interface AdminInvitationView {
  readonly id: string;
  readonly email: string;
  readonly invitedBy: AdminRef;
  readonly expiresAt: string;
}

export interface AdminHolder extends AdminPerson {
  readonly by: AdminRef | null;
  readonly at: string | null;
}

export interface AdminPermissionView {
  readonly id: string;
  readonly holders: readonly AdminHolder[];
}

export interface AdminLogView {
  readonly at: string;
  readonly by: AdminRef;
  readonly action: string;
  /** An account, an invited email, or nothing (a takedown). */
  readonly target: AdminRef | { readonly email: string } | null;
  readonly detail: string;
}

/** A donation GitHub Sponsors told the service of, as the Sponsorships part shows it. */
export interface AdminSponsorshipView {
  /** The sponsor's GitHub login. */
  readonly login: string;
  /** `User` or `Organization`. */
  readonly type: string;
  readonly oneTime: boolean;
  readonly amountCents: number;
  /** `active`, `pending-cancellation` or `cancelled`. */
  readonly status: string;
  readonly createdAt: string;
  readonly privacy: "public" | "private";
  /** The account that claimed it, or null while it is unclaimed. */
  readonly claimedBy: AdminPerson | null;
}

/** Everything the section shows: `GET /api/admin`. */
export interface AdminView {
  readonly role: AdminRole;
  readonly owners: readonly AdminPerson[];
  readonly administrators: readonly AdminAdministrator[];
  readonly invitations: readonly AdminInvitationView[];
  readonly permissions: readonly AdminPermissionView[];
  readonly log: readonly AdminLogView[];
  /** Where publications are served; null when the service has none set. */
  readonly publishHost: string | null;
  /** The latest sponsorships, the newest first; none without a sponsored account. */
  readonly sponsorships: readonly AdminSponsorshipView[];
}

/** The calls. None throws: a failure is an `Outcome` like any other. */
export interface AdminApi {
  load(): Promise<Outcome<AdminView>>;
  invite(email: string): Promise<Outcome<null>>;
  revokeInvitation(id: string): Promise<Outcome<null>>;
  accept(id: string): Promise<Outcome<null>>;
  decline(id: string): Promise<Outcome<null>>;
  removeAdministrator(sub: string): Promise<Outcome<null>>;
  setPermission(account: string, permission: string, granted: boolean): Promise<Outcome<null>>;
  takeDown(handle: string, slug: string, reason: string): Promise<Outcome<null>>;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function personOf(value: unknown): AdminPerson | undefined {
  if (!isObject(value) || typeof value["sub"] !== "string" || value["sub"] === "") return undefined;
  const handle = value["handle"];
  return {
    sub: value["sub"],
    name: text(value["name"]),
    handle: typeof handle === "string" ? handle : null,
    email: text(value["email"]),
  };
}

function refOf(value: unknown): AdminRef | undefined {
  if (!isObject(value) || typeof value["sub"] !== "string") return undefined;
  return { sub: value["sub"], name: text(value["name"]), deleted: value["deleted"] === true };
}

const list = <T>(value: unknown, read: (item: unknown) => T | undefined): T[] =>
  Array.isArray(value) ? value.flatMap((item) => read(item) ?? []) : [];

/** `GET /api/admin`; a row that cannot be read is left out, an answer without a role is none. */
export const readView: Reader<AdminView> = (answer) => {
  const body = parseObject(answer.text);
  const role = body?.["role"];
  if (!body || (role !== "owner" && role !== "administrator")) return undefined;
  return {
    value: {
      role,
      owners: list(body["owners"], personOf),
      administrators: list(body["administrators"], (item) => {
        const person = personOf(item);
        if (!person || !isObject(item)) return undefined;
        return {
          ...person,
          invitedBy: refOf(item["invitedBy"]) ?? { sub: "", name: "", deleted: false },
          since: text(item["since"]),
        };
      }),
      invitations: list(body["invitations"], (item) => {
        if (!isObject(item) || typeof item["id"] !== "string") return undefined;
        return {
          id: item["id"],
          email: text(item["email"]),
          invitedBy: refOf(item["invitedBy"]) ?? { sub: "", name: "", deleted: false },
          expiresAt: text(item["expiresAt"]),
        };
      }),
      permissions: list(body["permissions"], (item) => {
        if (!isObject(item) || typeof item["id"] !== "string") return undefined;
        return {
          id: item["id"],
          holders: list(item["holders"], (holder) => {
            const person = personOf(holder);
            if (!person || !isObject(holder)) return undefined;
            const at = holder["at"];
            return {
              ...person,
              by: refOf(holder["by"]) ?? null,
              at: typeof at === "string" ? at : null,
            };
          }),
        };
      }),
      log: list(body["log"], (item) => {
        if (!isObject(item) || typeof item["action"] !== "string") return undefined;
        const by = refOf(item["by"]);
        if (!by) return undefined;
        const target = item["target"];
        return {
          at: text(item["at"]),
          by,
          action: item["action"],
          target:
            refOf(target) ??
            (isObject(target) && typeof target["email"] === "string"
              ? { email: target["email"] }
              : null),
          detail: text(item["detail"]),
        };
      }),
      publishHost: typeof body["publishHost"] === "string" ? body["publishHost"] : null,
      sponsorships: list(body["sponsorships"], (item) => {
        if (!isObject(item) || typeof item["login"] !== "string" || item["login"] === "") {
          return undefined;
        }
        const cents = item["amountCents"];
        return {
          login: item["login"],
          type: text(item["type"]),
          oneTime: item["oneTime"] === true,
          amountCents: typeof cents === "number" && cents >= 0 ? cents : 0,
          status: text(item["status"]),
          createdAt: text(item["createdAt"]),
          privacy: item["privacy"] === "private" ? "private" : "public",
          claimedBy: personOf(item["claimedBy"]) ?? null,
        };
      }),
    },
  };
};

const nothing: Reader<null> = () => ({ value: null });

/** The calls of the page to `/api/admin`, relative to the page and with its cookie. */
export function adminApi(fetchFn: Fetch, location: Pick<Location, "href">): AdminApi {
  const page = location.href.replace(/#.*$/, "");
  const accept = { Accept: "application/json" };
  const json = { ...accept, "Content-Type": "application/json" };
  const at = (path: string) => inPage(page, path);
  const id = encodeURIComponent;
  return {
    load: () => call(fetchFn, at("api/admin"), { headers: accept }, readView),
    invite: (email) =>
      call(
        fetchFn,
        at("api/admin/invitations"),
        { method: "POST", headers: json, body: JSON.stringify({ email }) },
        nothing,
      ),
    revokeInvitation: (invitation) =>
      call(
        fetchFn,
        at(`api/admin/invitations/${id(invitation)}`),
        { method: "DELETE", headers: accept },
        nothing,
      ),
    accept: (invitation) =>
      call(
        fetchFn,
        at(`api/admin/invitations/${id(invitation)}/accept`),
        { method: "POST", headers: accept },
        nothing,
      ),
    decline: (invitation) =>
      call(
        fetchFn,
        at(`api/admin/invitations/${id(invitation)}/decline`),
        { method: "POST", headers: accept },
        nothing,
      ),
    removeAdministrator: (sub) =>
      call(
        fetchFn,
        at(`api/admin/administrators/${id(sub)}`),
        { method: "DELETE", headers: accept },
        nothing,
      ),
    setPermission: (account, permission, granted) =>
      call(
        fetchFn,
        at(`api/admin/accounts/${id(account)}/permissions/${id(permission)}`),
        { method: "PUT", headers: json, body: JSON.stringify({ granted }) },
        nothing,
      ),
    takeDown: (handle, slug, reason) =>
      call(
        fetchFn,
        at(`api/admin/publications/${id(handle)}/${id(slug)}`),
        { method: "DELETE", headers: json, body: JSON.stringify({ reason }) },
        nothing,
      ),
  };
}

/** An email as the invitation field takes it: what the Worker accepts, checked before it is sent. */
export function isEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const HANDLE = /^[a-z0-9-]{3,30}$/;
const SLUG = /^[a-z0-9-]{1,60}$/;

/**
 * The publication an address names: `<handle>/<slug>`, or `https://<publish host>/<handle>/<slug>/`
 * (the development server's `/_published/<handle>/<slug>/` too); undefined for another host or
 * shape, which is refused before any request.
 */
export function publicationAt(
  typed: string,
  publishHost: string | null,
): { readonly handle: string; readonly slug: string } | undefined {
  const value = typed.trim();
  let path: string;
  if (/^[a-z0-9-]+\/[a-z0-9-]+\/?$/.test(value)) {
    path = value;
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return undefined;
    }
    if (publishHost === null || url.host !== publishHost) return undefined;
    path = url.pathname.replace(/^\/(_published\/)?/, "");
  }
  const [handle = "", slug = "", ...rest] = path.replace(/\/$/, "").split("/");
  if (rest.length > 0 || !HANDLE.test(handle) || !SLUG.test(slug)) return undefined;
  return { handle, slug };
}

/** A person in words: their name, else their email, else their id; a deleted account says so. */
export function whoText(
  ref: AdminRef | AdminPerson | { readonly email: string } | null,
  words: AccountWords,
): string {
  if (ref === null) return "";
  if ("sub" in ref) {
    if ("deleted" in ref && ref.deleted) return words.administration.deleted;
    return ref.name !== "" ? ref.name : "email" in ref && ref.email !== "" ? ref.email : ref.sub;
  }
  return ref.email;
}

/** The name of a permission in the page's language; an unknown id is shown as it is. */
export function permissionName(id: string, words: AccountWords): string {
  return words.administration.permissions[id]?.name ?? id;
}

/** A sponsorship's amount in the page's language: US dollars, cents only when there are some. */
export function amountText(cents: number, locale: string, words: AccountWords): string {
  const dollars = new Intl.NumberFormat(locale, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return words.administration.amount(dollars);
}

/** A grant's detail: the permission, and the sponsor's login when a donation's claim made it. */
const CLAIM_DETAIL = /^(\S+) \((.+)\)$/;

/** An entry of the log as a sentence in the page's language. */
export function logText(entry: AdminLogView, words: AccountWords): string {
  const m = words.administration;
  const by = whoText(entry.by, words);
  let target = whoText(entry.target, words);
  let detail = entry.detail;
  if (entry.action === "grant" || entry.action === "revoke") {
    // "GitHub Sponsors granted Export without the Meltemi branding to Ana (ana)".
    const claim = CLAIM_DETAIL.exec(entry.detail);
    if (claim) target = `${target} (${claim[2]})`;
    detail = permissionName(claim ? claim[1]! : entry.detail, words);
  }
  const say = m.log[entry.action];
  return say ? say(by, target, detail) : `${by}: ${entry.action}`;
}
