// The routes of the administration of the service (`service-administration`): the owners (the
// `sub`s of `ADMIN_SUBS`) and the administrators they invited read the Administration section of the
// account panel (`GET /api/admin`), grant and revoke permissions, and take publications down
// (`publishing`, "Takedown"); the owners invite and remove administrators; an invitee accepts or
// declines; an administrator leaves. A cookie on the page's own origin is the only way in (the
// `Origin` rule applies); everybody else, an API token of an owner included, gets the answer an
// unknown route gets. No route lists or searches the accounts of the service: an account is named
// by its id, `@<handle>` or an email exactly one account signed in with.

import type { Config } from "../config.js";
import type { Ctx, Route } from "../context.js";
import { randomId } from "../crypto.js";
import { readEmail } from "../email.js";
import { fail } from "../errors.js";
import { json, MAX_JSON_BYTES } from "../http.js";
import { HANDLE, SLUG } from "../ids.js";
import { publishedKey } from "../keys.js";
import { PERMISSIONS, permissionOf, type Permission } from "../permissions.js";
import { adminInvitationExpiresAt } from "../store/retention.js";
import {
  MAX_ADMIN_INVITATIONS,
  MAX_ADMINISTRATORS,
  type AdminAction,
  type AdminInvitation,
  type AdminLogEntry,
  type CloudStore,
  type Iso,
  type User,
} from "../store/types.js";
import { readObject } from "./projects.js";

/** What a person is to the administration of the service. */
export type AdminRole = "owner" | "administrator";

/** How many entries of the log the section shows. */
const LOG_SHOWN = 50;

/** The longest reason, in characters (code points) after trimming. */
const MAX_REASON_LENGTH = 500;

/** What a reason may not hold: control characters but the line break and the tab, separators, lone surrogates. */
const FORBIDDEN_IN_REASON = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

/** The shape of an invitation's id: 32 lowercase hexadecimal characters. */
const INVITATION_ID = /^[0-9a-f]{32}$/;

/** The longest account id the routes take; ids are short, random identifiers. */
const MAX_SUB_LENGTH = 200;

/** What an account id may not hold: control characters. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** An answer with no body. */
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * The role of a person: an owner when `ADMIN_SUBS` lists them (which wins over a row), an
 * administrator when they have a row, else none. Read on every request, so a removal counts at once.
 */
export async function roleOf(
  sub: string,
  config: Config,
  store: CloudStore,
): Promise<AdminRole | null> {
  if (config.owners.has(sub)) return "owner";
  return (await store.administrator(sub)) ? "administrator" : null;
}

/** The owner or administrator of a request, with the cookie; anybody else is an unknown route. */
async function administration(ctx: Ctx): Promise<{ sub: string; role: AdminRole }> {
  const { principal, config, deps } = ctx;
  if (principal?.via !== "cookie") throw fail("not-found");
  const role = await roleOf(principal.sub, config, deps.store);
  if (role === null) throw fail("not-found");
  return { sub: principal.sub, role };
}

/** An owner of the service, with the cookie; an administrator too is answered as by an unknown route. */
async function ownerOf(ctx: Ctx): Promise<string> {
  const { sub, role } = await administration(ctx);
  if (role !== "owner") throw fail("not-found");
  return sub;
}

/** A log entry of an act by `by` at `at`. */
function logEntry(
  ctx: Ctx,
  at: Iso,
  by: string,
  action: AdminAction,
  target: { readonly sub?: string; readonly email?: string },
  detail = "",
): AdminLogEntry {
  return {
    id: randomId(ctx.deps.randomBytes),
    at,
    bySub: by,
    action,
    targetSub: target.sub ?? null,
    targetEmail: target.email ?? null,
    detail,
  };
}

/** The reason an administrator gives: text of at most 500 characters, or none. */
function readReason(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw fail("request.invalid", "The reason is text.");
  const reason = value.trim();
  if (Array.from(reason).length > MAX_REASON_LENGTH) {
    throw fail("request.invalid", `The reason has at most ${MAX_REASON_LENGTH} characters.`);
  }
  if (FORBIDDEN_IN_REASON.test(reason.replace(/[\n\t]/g, ""))) {
    throw fail("request.invalid", "The reason cannot hold control characters.");
  }
  return reason;
}

/**
 * The account a path names: `@<handle>` for the person who holds the handle, an email (an `@` after
 * its first character) for the one account whose verified email it is, or the account id taken as
 * given. No account, a handle nobody holds, an email nobody signed in with verified and anything
 * that is none of these is `404 not-found`; an email of several accounts is `409
 * account.ambiguous`. Nothing is created.
 */
async function accountOf(ctx: Ctx): Promise<User> {
  const account = ctx.params["account"] ?? "";
  const none = () => fail("not-found", "There is no such account.");
  const { store } = ctx.deps;
  let user: User | undefined;
  if (account.startsWith("@")) {
    const handle = account.slice(1);
    if (!HANDLE.test(handle)) throw none();
    user = await store.userByHandle(handle);
  } else if (account.indexOf("@") > 0) {
    let email: string;
    try {
      email = readEmail(account);
    } catch {
      throw none();
    }
    const found = await store.usersByEmail(email);
    if (found.length > 1) {
      throw fail(
        "account.ambiguous",
        "Several accounts signed in with this email: name the account by its id, which Profile shows.",
      );
    }
    user = found[0];
  } else {
    if (account === "" || account.length > MAX_SUB_LENGTH || CONTROL.test(account)) throw none();
    user = await store.user(account);
  }
  if (!user) throw none();
  return user;
}

/** A person named in passing: their name, or `deleted` when their account is gone. */
type PersonRef = { sub: string; name: string; deleted?: true };

/** People as the section shows them, each read once. */
function people(store: CloudStore) {
  const known = new Map<string, Promise<User | undefined>>();
  const find = (sub: string) => {
    let found = known.get(sub);
    if (!found) {
      found = store.user(sub);
      known.set(sub, found);
    }
    return found;
  };
  return {
    /** A person in full: an owner who never made a request has empty strings. */
    async person(sub: string) {
      const user = await find(sub);
      return {
        sub,
        name: user?.name ?? "",
        handle: user?.handle ?? null,
        email: user?.email ?? "",
      };
    },
    async ref(sub: string): Promise<PersonRef> {
      const user = await find(sub);
      return user ? { sub, name: user.name } : { sub, name: "", deleted: true };
    },
  };
}

/** An invitation as the owners see it. */
async function invitationJson(
  invitation: AdminInvitation,
  ref: (sub: string) => Promise<PersonRef>,
) {
  return {
    id: invitation.id,
    email: invitation.email,
    invitedBy: await ref(invitation.invitedBy),
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  };
}

/** The holders of a permission, with who granted it and when. */
async function holdersOf(permission: Permission, store: CloudStore) {
  const { person, ref } = people(store);
  const users = await permission.holders(store);
  return Promise.all(
    users.map(async (user) => {
      const { by, at } = permission.read(user);
      return { ...(await person(user.sub)), by: by === null ? null : await ref(by), at };
    }),
  );
}

/**
 * `GET /api/admin` (an owner or an administrator, with the cookie): everything the Administration
 * section shows in one answer: the role, the owners, the administrators, the pending invitations
 * (owners only; `[]` for an administrator), every permission with its holders, the latest
 * fifty entries of the log, the newest first, and the publish host (null when unset).
 */
export const administrationRoute: Route = async (ctx) => {
  const { role } = await administration(ctx);
  const { store } = ctx.deps;
  const now = ctx.deps.now().toISOString();
  const { person, ref } = people(store);
  const [administrators, invitations, log] = await Promise.all([
    store.administrators(),
    role === "owner" ? store.adminInvitations(now) : Promise.resolve([]),
    store.adminLog(LOG_SHOWN),
  ]);
  return json({
    role,
    owners: await Promise.all([...ctx.config.owners].map((sub) => person(sub))),
    administrators: await Promise.all(
      administrators.map(async (administrator) => ({
        ...(await person(administrator.sub)),
        invitedBy: await ref(administrator.invitedBy),
        since: administrator.since,
      })),
    ),
    invitations: await Promise.all(invitations.map((i) => invitationJson(i, ref))),
    permissions: await Promise.all(
      PERMISSIONS.map(async (permission) => ({
        id: permission.id,
        holders: await holdersOf(permission, store),
      })),
    ),
    log: await Promise.all(
      log.map(async (entry) => ({
        at: entry.at,
        by: await ref(entry.bySub),
        action: entry.action,
        target:
          entry.targetSub !== null
            ? await ref(entry.targetSub)
            : entry.targetEmail !== null
              ? { email: entry.targetEmail }
              : null,
        detail: entry.detail,
      })),
    ),
    // Where publications are served, so that the section checks the address of a takedown.
    publishHost: ctx.config.publishHost ?? null,
  });
};

// ---- Invitations ---------------------------------------------------------------------------

/**
 * `POST /api/admin/invitations { "email" }` (an owner): invites the email to administer the
 * service for seven days. The email of an owner or an administrator is `409 admin.already`; an
 * email with a pending invitation answers that one with `200`; an eleventh pending invitation is
 * `409 admin.limit`; otherwise `201`. No mail is sent: the invitee signs in with the email.
 */
export const inviteAdministratorRoute: Route = async (ctx) => {
  const by = await ownerOf(ctx);
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  const email = readEmail(body["email"]);
  const { store } = ctx.deps;
  const { ref } = people(store);

  const own = ctx.principal?.via === "cookie" ? ctx.principal.profile.email.toLowerCase() : "";
  const roles = await Promise.all(
    (await store.usersByEmail(email)).map((user) => roleOf(user.sub, ctx.config, store)),
  );
  if (email === own || roles.some((role) => role !== null)) {
    throw fail("admin.already", "That email is of somebody who administers the service already.");
  }

  const at = ctx.deps.now().toISOString();
  const waiting = await store.adminInvitationFor(email, at);
  if (waiting) return json(await invitationJson(waiting, ref));

  const invitation: AdminInvitation = {
    id: randomId(ctx.deps.randomBytes),
    email,
    invitedBy: by,
    createdAt: at,
    expiresAt: adminInvitationExpiresAt(at),
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
  };
  const outcome = await store.createAdminInvitation(
    invitation,
    MAX_ADMIN_INVITATIONS,
    logEntry(ctx, at, by, "invite", { email }),
  );
  if (outcome === "limit") {
    throw fail(
      "admin.limit",
      `${MAX_ADMIN_INVITATIONS} invitations are pending already: revoke one first.`,
    );
  }
  return json(await invitationJson(invitation, ref), 201);
};

/** `DELETE /api/admin/invitations/<id>` (an owner): revokes a pending invitation. `204`. */
export const revokeAdminInvitationRoute: Route = async (ctx) => {
  const by = await ownerOf(ctx);
  const id = ctx.params["id"] ?? "";
  const none = () => fail("not-found", "There is no such invitation.");
  if (!INVITATION_ID.test(id)) throw none();
  const { store } = ctx.deps;
  const at = ctx.deps.now().toISOString();
  const invitation = (await store.adminInvitations(at)).find((i) => i.id === id);
  if (!invitation) throw none();
  const log = logEntry(ctx, at, by, "revoke-invitation", { email: invitation.email });
  if (!(await store.revokeAdminInvitation(id, at, log))) throw none();
  return done();
};

/**
 * The verified email of the session's own token, lower-cased, or nothing: an invitation is answered
 * only by its addressee, and an unverified email proves nothing.
 */
function verifiedEmail(ctx: Ctx): string | undefined {
  const { principal } = ctx;
  if (principal?.via !== "cookie" || !principal.profile.emailVerified) return undefined;
  const email = principal.profile.email.toLowerCase();
  return email === "" ? undefined : email;
}

/**
 * `POST /api/admin/invitations/<id>/accept` (the invitee, with the cookie): becomes an
 * administrator, unless twenty exist (`409 admin.limit`). Anything but the pending, unexpired
 * invitation addressed to the session's verified email is `404 not-found`. `204`.
 */
export const acceptAdminInvitationRoute: Route = async (ctx) => {
  const email = verifiedEmail(ctx);
  const id = ctx.params["id"] ?? "";
  const none = () => fail("not-found", "There is no such invitation.");
  if (email === undefined || ctx.principal === undefined || !INVITATION_ID.test(id)) throw none();
  const sub = ctx.principal.sub;
  const at = ctx.deps.now().toISOString();
  const outcome = await ctx.deps.store.acceptAdminInvitation(
    id,
    sub,
    email,
    at,
    MAX_ADMINISTRATORS,
    logEntry(ctx, at, sub, "accept", { sub, email }),
  );
  if (outcome === "limit") {
    throw fail(
      "admin.limit",
      `The service has ${MAX_ADMINISTRATORS} administrators already: ask an owner to remove one.`,
    );
  }
  if (outcome === "none") throw none();
  return done();
};

/** `POST /api/admin/invitations/<id>/decline` (the invitee, with the cookie): as accept, declining. `204`. */
export const declineAdminInvitationRoute: Route = async (ctx) => {
  const email = verifiedEmail(ctx);
  const id = ctx.params["id"] ?? "";
  const none = () => fail("not-found", "There is no such invitation.");
  if (email === undefined || ctx.principal === undefined || !INVITATION_ID.test(id)) throw none();
  const sub = ctx.principal.sub;
  const at = ctx.deps.now().toISOString();
  const log = logEntry(ctx, at, sub, "decline", { sub, email });
  if (!(await ctx.deps.store.declineAdminInvitation(id, email, at, log))) throw none();
  return done();
};

/**
 * `DELETE /api/admin/administrators/<sub>`: an owner removes any administrator, an administrator
 * removes themselves (leaving). An owner's `sub`, a `sub` with no row and another administrator's
 * `sub` for an administrator are `404 not-found`. `204`.
 */
export const removeAdministratorRoute: Route = async (ctx) => {
  const { sub: by, role } = await administration(ctx);
  const target = ctx.params["sub"] ?? "";
  const none = () => fail("not-found", "There is no such administrator.");
  if (ctx.config.owners.has(target)) throw none();
  if (role === "administrator" && target !== by) throw none();
  const at = ctx.deps.now().toISOString();
  const log = logEntry(ctx, at, by, target === by ? "leave" : "remove", { sub: target });
  if (!(await ctx.deps.store.removeAdministrator(target, log))) throw none();
  return done();
};

// ---- Permissions ---------------------------------------------------------------------------

/** The permission a path names; an unknown id is `404 not-found`. */
function permissionIn(ctx: Ctx): Permission {
  const permission = permissionOf(ctx.params["permission"] ?? "");
  if (!permission) throw fail("not-found", "There is no such permission.");
  return permission;
}

/** An account and one permission of it, as the routes answer. */
function grantJson(user: User, permission: Permission) {
  const { granted, by, at } = permission.read(user);
  return {
    sub: user.sub,
    handle: user.handle,
    name: user.name,
    email: user.email,
    permission: { id: permission.id, granted, by, at },
  };
}

/**
 * `GET /api/admin/permissions/<id>` (an owner or an administrator): the accounts whose row holds the
 * permission, the earliest grant first, as `{ "id", "holders" }`.
 */
export const permissionHoldersRoute: Route = async (ctx) => {
  await administration(ctx);
  const permission = permissionIn(ctx);
  return json({ id: permission.id, holders: await holdersOf(permission, ctx.deps.store) });
};

/**
 * `GET /api/admin/accounts/<account>/permissions/<id>` (an owner or an administrator): the
 * account's row for the permission, who last set it and when; an owner's or an administrator's own
 * row says what was set on it, not what they hold implicitly.
 */
export const accountPermissionRoute: Route = async (ctx) => {
  await administration(ctx);
  const permission = permissionIn(ctx);
  return json(grantJson(await accountOf(ctx), permission));
};

/**
 * `PUT /api/admin/accounts/<account>/permissions/<id>` with `{ "granted": boolean }` (an owner or an
 * administrator): grants or revokes it, recording who and when, logged; answers as the `GET`.
 * Another body is `400 request.invalid`, and nothing is written.
 */
export const setAccountPermissionRoute: Route = async (ctx) => {
  const { sub: by } = await administration(ctx);
  const permission = permissionIn(ctx);
  const user = await accountOf(ctx);
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  const granted = body["granted"];
  if (typeof granted !== "boolean" || Object.keys(body).length !== 1) {
    throw fail("request.invalid", 'The body is { "granted": true } or { "granted": false }.');
  }
  const at = ctx.deps.now().toISOString();
  const log = logEntry(ctx, at, by, granted ? "grant" : "revoke", { sub: user.sub }, permission.id);
  if ((await permission.set(ctx.deps.store, user.sub, granted, by, at, log)) === "missing") {
    throw fail("not-found", "There is no such account.");
  }
  const updated = await ctx.deps.store.user(user.sub);
  if (!updated) throw fail("not-found", "There is no such account.");
  return json(grantJson(updated, permission));
};

// ---- Takedown ------------------------------------------------------------------------------

/**
 * `DELETE /api/admin/publications/<handle>/<slug>` with an optional `{ reason }` (an owner or an
 * administrator, with the cookie): removes the page and the row and records the takedown
 * (`takedowns (handle, slug, by_sub, reason, at)`) and its log entry, after which the address
 * answers 404 and the owner's dialog says the service removed it. `204`.
 *
 * Anybody else is `404 not-found`, the answer of a route that does not exist, and not `403`: a `403`
 * would tell a stranger that the route is there. The page is deleted first and the records written
 * second, so that a failure of the bucket leaves everything as it was and the administrator tries
 * again, while a failure after it leaves a row with no page, which the publish host does not serve
 * and a second try completes.
 */
export const takedownRoute: Route = async (ctx) => {
  const { sub: by } = await administration(ctx);
  const { deps, env } = ctx;

  const handle = ctx.params["handle"] ?? "";
  const slug = ctx.params["slug"] ?? "";
  const none = () => fail("not-found", "There is no such publication.");
  if (!HANDLE.test(handle) || !SLUG.test(slug)) throw none();
  const reason = readReason(
    (await readObject(ctx, MAX_JSON_BYTES, "request.invalid", true))["reason"],
  );
  if (!(await deps.store.publication(handle, slug))) throw none();

  await env.BLOBS.delete(publishedKey(handle, slug));
  const at = deps.now().toISOString();
  const address = `${handle}/${slug}`;
  const removed = await deps.store.takeDown(
    { handle, slug, bySub: by, reason, at },
    logEntry(ctx, at, by, "takedown", {}, reason === "" ? address : `${address}: ${reason}`),
  );
  // Somebody (the owner) took it down between the two: there is nothing left to record.
  if (!removed) throw none();
  return done();
};
