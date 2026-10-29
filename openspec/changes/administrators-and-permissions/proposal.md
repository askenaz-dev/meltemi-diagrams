## Why

The owner asked on 2026-10-29 for an administration module in the account panel: a place where an
administrator configures the other administrators and the permissions of accounts, without a page
that lists every user, with administrators added by invitation ("I invite you to be an
administrator") and one administrator by default, the owner's own account
(`guillmarortiz@gmail.com`). Today the hosted service has administrators but no module: they are the
account ids of the `ADMIN_SUBS` secret (`packages/cloud/src/config.ts:72-79`, `92`), read from the
Secrets Store (`packages/cloud/wrangler.jsonc:48-50`), so adding or removing one means editing a
secret and deploying. Their powers are three routes the page never links, the takedown of a
publication (`packages/cloud/src/routes/admin.ts:51-75`) and the grant, revocation and listing of
exports without the Meltemi branding (`admin.ts:132-173`), which the docs teach as `fetch` calls
typed into the browser's console (`docs/cloud.md`, "Entitlements"; decision 0061). The person who
receives a permission learns their account id from Profile and hands it over by some other means
(`packages/playground/src/cloud/account-panel.ts`, "Account id"). The session answer says what a
person may do (`user.entitlements.unbranded`, `packages/cloud/src/routes/session.ts:36-50`) but not
whether they administer the service, so the page can offer nothing to an administrator. The project
invitations already show the shape the owner asks for: an email, no mail sent, resolved when a
person signs in with that verified email (`docs/cloud.md`, "Invitations";
`routes/session.ts:57-71`).

This change gives the service two roles, **owner** (configured, the one administrator by default)
and **administrator** (invited by an owner, accepted by the invitee), an **Administration** section
in the account panel that only they see, and a catalog of permissions granted to named accounts,
the branding one first. Post-1.0 change, outside the roadmap (`docs/roadmap-1.0.md`); it builds on
`cloud-accounts`, `account-panel`, `publishing`, `sharing-and-permissions` and `unbranded-exports`.

## What Changes

- **Owners and administrators.** The accounts listed in `ADMIN_SUBS` are the **owners**: always
  administrators, never removable from the page, and the only ones who invite or remove
  administrators. The owner's account id, the one `guillmarortiz@gmail.com` signs in with, is the
  value the secret already holds, so the owner is the administrator by default with no data change.
  Invited **administrators** are rows of a new `administrators` table (migration 0006); they grant
  and revoke permissions, take publications down, see the administrators and the log, and may leave.
  Every check that read `ADMIN_SUBS` reads owners and administrators together.
- **Invitations by email, accepted by the invitee.** An owner invites an email; the invitation
  records who invited and when, expires after seven days, works once and sends no mail. It becomes
  an administrator only when the person signs in with that verified email and chooses **Accept** in
  the Administration section (or **Decline**); signing in alone makes nobody an administrator. An
  owner revokes a pending invitation and removes an administrator; an administrator leaves. At most
  twenty administrators and ten pending invitations.
- **No list of users.** The section lists only the owners, the administrators, the pending
  invitations, and, per permission, the accounts that hold it. Every other account is reached by
  exact lookup only: an account id, `@<handle>` or an email that exactly one account signed in with.
  There is no search, no browsing and no count of accounts.
- **Permissions as a catalog.** A permission is an entry of a catalog in code with its id, name and
  description in both languages; the first and only one is **Export without the Meltemi branding**
  (`unbranded-exports`), kept in the columns migration 0005 added. Owners and administrators hold
  every permission implicitly, as today. The section grants a permission to an account found by
  lookup and revokes it from the list, through routes by permission id
  (`GET /api/admin/permissions/<id>`, `GET` and `PUT /api/admin/accounts/<account>/permissions/<id>`)
  that replace the three `…/entitlements` routes of `unbranded-exports`; `<account>` also takes an
  email. The session answer keeps `user.entitlements.unbranded`, which the export dialog reads.
- **A log of administration.** Every invitation, acceptance, decline, revocation, removal, leave,
  grant, revocation of a permission and takedown is appended to `admin_log` (who, when, what, to
  whom); the section shows the latest fifty. Takedowns keep their own table as well.
- **The session and the page.** `GET /api/session` answers, for a cookie principal,
  `user.administration`: `{ "role": "owner" | "administrator" }`, or `null`, and
  `user.administrationInvitation`: the pending invitation for the session's verified email (who
  invited, when it expires) or `null`. The account panel gains **Administration** after Usage, shown
  to owners, administrators and a person with a pending invitation (who sees only the invitation),
  and to nobody else; `?account=administration` opens it. The section has **Administrators**,
  **Invitations**, **Permissions**, **Take down a publication** and **Recent changes**. Every other
  signed-in person sees exactly the panel of today.
- **Routes.** `GET /api/admin` loads the section in one answer; `POST /api/admin/invitations`,
  `DELETE /api/admin/invitations/<id>` and `DELETE /api/admin/administrators/<sub>` are an owner's
  (an administrator may delete their own row: leaving); `POST /api/admin/invitations/<id>/accept` and
  `…/decline` are the invitee's. All keep the takedown's rules: the session cookie on the page's
  origin, the `Origin` rule first, `404 not-found` to everybody else and to API tokens.
- **Documentation.** `docs/cloud.md` (roles, routes, the section's data, the log, "Entitlements"
  rewritten around the section), `docs/playground.md` (the Administration section),
  `docs/security.md` (who can do what, why there is no list of users) and their Spanish copies; the
  changelog; decision 0065, linked from decisions 0042 and 0061.

## Non-goals

- Sending invitation mail: the service has no mail delivery, and the project invitations send none
  either; a mail service would be its own change of the hosted service.
- Roles or claims in the identity contract (`id.meltemi.dev`, Meltemi Web's `identity-service`): who
  administers Diagrams stays in Diagrams.
- Applying migration 0006 and setting `ADMIN_SUBS` in production belong to the `delivery` change's
  pipelines, which apply every migration and already declare the secret.
- The whiteboard belongs to `whiteboard-tools`; the sequence spacing to
  `sequence-spacing-and-nested-calls`; neither is touched.

## Capabilities

### New Capabilities

- `service-administration`: owners and administrators, invitations by email accepted by the
  invitee, removal and leaving, the limits, the lookup of one account without a list of users, the
  permissions catalog, the administration log, and the routes that serve the section.

### Modified Capabilities

- `cloud-accounts`: MODIFIED "Users and the session answer" (`user.administration` and
  `user.administrationInvitation` in the cookie shape), "Entitlements of an account" (owners and
  administrators instead of `ADMIN_SUBS` alone, the routes by permission id, `<account>` may be an
  email, each change logged) and
  "Deletion events" (a deleted person's administrator row, invitations and pending invitations go).
- `account-panel`: MODIFIED "The account panel" (the Administration tab, who sees it,
  `?account=administration`) and ADDED "Administration section" (its five parts, the invitee's view,
  the refusals and states).
- `publishing`: MODIFIED "Takedown" (owners and administrators, the log, the section's form).

## Impact

- `packages/cloud`: `migrations/0006_administrators.sql` (new: `administrators`,
  `admin_invitations`, `admin_log`), `src/config.ts` (`admins` becomes `owners`), `src/store/types.ts`
  and `src/store/d1.ts`, `src/store/memory.ts` (administrators, invitations, the log, `userByEmail`),
  `src/routes/admin.ts` (one `administrator(ctx)` gate for both roles, the new routes, logging),
  `src/routes/session.ts`, `src/routes/events.ts` (deletion), `src/handler.ts`, `src/permissions.ts`
  (new: the catalog); `test/store/conformance.ts`, `test/administration.test.ts` (new),
  `test/entitlements.test.ts`, `test/publish-routes.test.ts`, `test/events.test.ts`,
  `test/migration-administrators.test.ts` (new), `test/migration-sharing.test.ts` (the sixth file),
  `test/audit.test.ts`, `test/browser/scenarios-administration.ts` (new), `test/browser/run.ts`.
- `packages/playground`: `src/cloud/session.ts` (`SessionUser.administration`,
  `administrationInvitation`), `src/cloud/account-panel-model.ts` (the section, its loading and
  actions), `src/cloud/administration-section.ts` (new), `src/cloud/account-panel.ts`,
  `src/messages/account-panel-en.ts`, `account-panel-es.ts`; `test/session.test.ts`,
  `test/account-panel-model.test.ts`, `test/account-messages.test.ts`, `test/browser/run.ts`.
- `docs/cloud.md`, `docs/es/cloud.md`, `docs/playground.md`, `docs/es/playground.md`,
  `docs/security.md`, `docs/es/security.md`, `CHANGELOG.md`,
  `docs/decisions/0065-administrators-and-permissions.md`.
