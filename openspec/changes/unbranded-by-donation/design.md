# Design

## Context

The entitlement is the permission `unbranded-exports` of the catalogue in
`packages/cloud/src/permissions.ts`, kept in the `unbranded_exports`, `unbranded_exports_by` and
`unbranded_exports_at` columns of `users` (migration 0005), set through
`CloudStore.setUnbrandedExports(sub, granted, by, at, log)` with its `admin_log` row, read by
`GET /api/session` (`routes/session.ts`, `userShape`: the row's flag or any role) and set by
`PUT /api/admin/accounts/<account>/permissions/unbranded-exports` (`routes/admin.ts`) from the
account panel's Administration section (`packages/playground/src/cloud/account-panel.ts`). The
page's export dialog (`exports/dialog.ts`) builds the checkbox from the session's
`entitlements.unbranded`. The Worker already receives one signed webhook, the identity service's
deletion events (`routes/events.ts`: the signature over the exact body before any parsing, a body
cap, a delivery handled once by its id), and reads a person's sign-ins from the identity service
on their behalf (`routes/account.ts`, `GET /api/account/identity`, product-signed; each identity
carries `provider`, `email`, `emailVerified`, `handle` (the GitHub login) and `linkedAt`, never
the provider's numeric id). Secrets reach the Worker as Secrets Store bindings declared in
`wrangler.jsonc` and distributed by `meltemi-web`'s Terraform (`secrets.tf`: generated or
received variables, such as `ADMIN_SUBS`); `run_worker_first` names the paths the Worker answers
before the assets. GitHub Sponsors (checked on 2026-11-04): a sponsored personal account or
organisation in a supported region (Chile is one) creates webhooks only in the Sponsors
dashboard, with a payload URL, a content type, a secret and the `sponsorship` event, whose
actions are `created` ("once the payment is successfully processed", one-time and monthly),
`edited`, `tier_changed`, `pending_tier_change`, `pending_cancellation` and `cancelled` (the last
two never for one-time sponsorships); deliveries carry `X-GitHub-Event`, `X-GitHub-Delivery` and
`X-Hub-Signature-256: sha256=<HMAC hex>` over the body; tiers are one-time or monthly, up to ten
of each, with a text of rewards, and GitHub's Additional Terms define a subscription as a
sponsorship "in exchange for goods, services, or other offers" whose terms, refunds included, the
sponsored account sets. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**

- A donation on GitHub Sponsors becomes the entitlement without anyone's hand, for a person who
  signed in with, or linked, the same GitHub account.
- Every automatic grant is as visible and revocable as a manual one.
- Nothing of the webhook changes anything before its signature is verified, and a delivery
  replayed changes nothing.

**Non-Goals:**

- A paywall: the engine stays MIT, `frame none` stays free, and the tier's text says so.
- Any other payment provider, and any payment handled by this service.
- Removing the entitlement when a monthly sponsorship ends.

## Decisions

1. **The sponsorship is a row, the grant is a claim.** Migration `0007_sponsorships.sql` adds
   `sponsorships (id, delivery_id UNIQUE, sponsor_login COLLATE NOCASE, sponsor_id, sponsor_type,
   one_time, amount_cents, privacy, status, created_at, claimed_by_sub, claimed_at)`, `STRICT`, with
   `sponsor_login` and `claimed_by_sub` indexed; the store gains `recordSponsorship(s)`
   (`"recorded" | "repeated"`), `updateSponsorship(login, oneTime, status, privacy)`,
   `unclaimedSponsorship(login)` (the earliest unclaimed sponsorship of a `User`),
   `claimSponsorship(login, sub, at, log)`, `sponsorships(limit)` and `clearClaims(sub)`, in D1 and
   in memory, the login compared case-insensitively (GitHub logins are). The grant is made when the
   person's sign-ins pass through `GET /api/account/identity` (`routes/account.ts`), while the
   service has a sponsored account: a `github` identity whose `handle` is an unclaimed row's login
   calls `claimSponsorship`, which claims every unclaimed sponsorship of that login, sets the
   permission's columns of migration 0005 with the grantor `github-sponsors` and appends the log
   entry in one D1 batch of three statements tied by the log entry's new id (the entry goes in only
   while a claimable row and the user's row exist; the grant and the claim follow only that entry),
   so a reload, or a second claim in the same instant, claims nothing twice. `UNBRANDED_EXPORTS.set`
   followed by a claim was the first plan; it is two writes, which a failure between them would
   leave half done. Alternatives: matching in the webhook (the Worker holds no GitHub login per
   account; it would need the identity service to resolve a login, a new product route in
   `meltemi-web`); matching in `GET /api/session` (a product-signed call to the identity service
   on every page load); the sponsor's numeric id (the account view does not carry it; recorded in
   the row for the day it does).

2. **The webhook route.** `POST /_sponsors/github` (`routes/sponsors.ts`, `/_sponsors/*` in
   `run_worker_first` and in the handler's reserved prefixes) exists only when `SPONSORS_ACCOUNT` is
   a GitHub login (a `vars` entry of `wrangler.jsonc`, shipped empty: the owner sets the sponsored
   login, `askenaz`, as the last of the steps of decision 8, so that the page links no Sponsors page
   before it exists); it refuses a body not declared `application/json` with `415
   request.unsupported` before reading it, reads at most 64 KiB, computes
   `HMAC-SHA-256(SPONSORS_WEBHOOK_SECRET, body)` and compares it with `X-Hub-Signature-256` in
   constant time before parsing (`401` otherwise, nothing read), answers `400` to a body that is
   not a `sponsorship` event with `sponsorship.sponsor.login`, `sponsorship.sponsor.id`,
   `sponsorship.sponsor.type`, `sponsorship.tier.is_one_time`,
   `sponsorship.tier.monthly_price_in_cents`, `sponsorship.privacy_level` and
   `sponsorship.created_at`, answers `200 { "ignored": true }` to a `sponsorable.login` that is
   not the configured account and to a `ping`, inserts the row on `created` (the delivery id
   makes a repeat a `200 { "repeated": true }`), updates `status` on the other actions on the
   newest sponsorship of the sponsor's login and the tier's kind (`edited`, `tier_changed` and
   `pending_tier_change` make it `active`, `pending_cancellation` `pending-cancellation`, and
   `cancelled` `cancelled`, which no later delivery undoes, since GitHub does not promise their
   order), and never logs the body. A blank secret (the family's Store keeps an unset secret as a
   space) refuses every delivery with `500 internal`, logged by name. No `Origin` rule: the call is GitHub's. The secret is
   `SPONSORS_WEBHOOK_SECRET_STORE`, a received variable of the family's Terraform
   (`var.sponsors_webhook_secret`, the string the owner also types into GitHub's form).
   Alternatives: `application/x-www-form-urlencoded` (the JSON content type is chosen in the form;
   the route refuses the other with `415`); an org-level GitHub webhook (sponsorship events are
   only delivered by Sponsors' own webhooks).

3. **Any donation, once, for good.** A `created` sponsorship of any tier and amount qualifies,
   one-time or monthly; `cancelled` records the status and keeps the entitlement, since the
   person donated; an administrator revokes as today when there is a reason. `SPONSORS_MINIMUM_CENTS`
   was considered and rejected: the tiers on GitHub set the amounts, and a tier the owner
   publishes is the offer. The row keeps `privacy` because a private sponsor's login is shown to
   administrators only, never on a page.

4. **The grantor "github-sponsors".** `unbranded_exports_by` and `admin_log.by_sub` take the
   sentinel `github-sponsors` for an automatic grant, with `detail = "unbranded-exports
   (<login>)"`; the admin answer resolves that sub to the name "GitHub Sponsors" and the panel's
   sentence reads "GitHub Sponsors granted Export without the Meltemi branding to Ana (@ana), 4
   Nov". `userShape` is unchanged: the flag is the flag. Alternative: a fourth column for the
   source (two columns to keep in step for one fact).

5. **What the page learns.** `GET /api/session` adds `support: { "url":
   "https://github.com/sponsors/<SPONSORS_ACCOUNT>" }` to every shape when the variable is set and
   omits it otherwise; the page reads it once at start as it reads `entitlements`. The export
   dialog (`exports/dialog.ts`) shows, for a cookie session whose `entitlements.unbranded` is
   false and whose answer carries `support`, one line under the Theme field with the link and
   the sentence that a donation made with the GitHub account linked to this one is recognised
   when the account panel is opened; anonymous and token sessions see nothing, as today. Profile
   (`account-panel.ts`) shows a person not entitled a **Support Meltemi Diagrams** heading with
   the same link and sentence (and, when no GitHub identity is linked, that linking one in
   Sign-ins is how a donation is recognised), and an entitled sponsor "Granted on <date> for your
   donation. Thank you." in place of the administrator's sentence, from the session answer's new
   `entitlements.unbrandedBy` (`"administrator"`, `"github-sponsors"` or `null`). The thank-you reads "Granted for your
   donation. Thank you." before the entitlement's sentence (the session answer carries no date), and
   the Google-only hint has **Open Sign-ins**. When the sign-ins' answer says `claimed: true`, the
   panel reads the session answer again through the page's `readSession` (`main.ts`), redraws
   Profile, says the thanks in the status line, and hands the new session to the page
   (`Playground.session`), which the export dialog reads when it opens, so the box is there without
   a reload. Alternative: a "Check my donation" button (the claim already runs when Profile loads the
   sign-ins).

6. **The Administration section.** `GET /api/admin` adds `sponsorships`: the latest fifty rows,
   the newest first, each with `login`, `type`, `oneTime`, `amountCents`, `status`, `createdAt`,
   `privacy` and `claimedBy` (a person, or null); the Permissions part's holders show "GitHub
   Sponsors" as the grantor, and a new **Sponsorships** part (only when there are some), after
   Permissions, lists them with **Grant by hand** beside an unclaimed one, an organisation's
   included. The button does not prefill the field, since a GitHub login is not a handle: it puts
   the login in the Grant field's placeholder as a hint, moves the focus there and flashes the form,
   and the administrator types the account id, handle or email the sponsor gives. Amounts read
   "US$10" (cents only when there are some). Rows are personal data of sponsors; they are shown to
   owners and administrators only, and `[]` without a sponsored account.

7. **Deletion.** A `user.deleted` event clears the account's claims in the same batch as the
   user's removal (`applyUserDeleted` runs `clearClaims`'s statement), so a deleted account's claim
   is gone with it, atomically and only for the event's first delivery, and the sponsorship may be
   claimed again by whoever links that GitHub login (the person who donated).

8. **The site and the docs.** `meltemi-web`'s Diagrams page gains **Support the project** to the
   sponsors page in both languages (its spec `product-site` in that repository); `docs/cloud.md`
   gains the route, the rows, the claim and the owner's steps (enrol `askenaz` in GitHub
   Sponsors, publish a one-time tier and monthly tiers whose reward text says "Export without the
   Meltemi branding in the web app; the file's theme can do the same with `frame none`", create
   the webhook with the payload URL, JSON and the secret, give the same secret to the
   infrastructure); `docs/web-app.md` the donation path; both in Spanish too.

9. **The decision note.** `docs/decisions/0071-unbranded-by-donation.md` extends 0061 and 0068:
   the claim through the GitHub login, the sentinel grantor, any donation once and for good,
   GitHub Sponsors as the only payment path and why (the terms allow a reward per tier, payouts
   and receipts are theirs, Chile is a supported region, no money touches this service).

## Risks / Trade-offs

- [A GitHub login renamed between the donation and the claim] → the sponsorship stays unclaimed
  in the Administration section; the administrator grants by hand.
- [A freed login taken by someone else before the sponsor claims] → the claim requires an
  identity GitHub verified at sign-in; the row shows who claimed, and an administrator can revoke
  and grant to the right account; the numeric id is kept for a stricter match when the identity
  service exposes it.
- [A sponsor who signed in with Google only] → Profile says to link GitHub; linking is the
  existing flow, and the next Profile load claims.
- [GitHub retries a delivery the Worker answered slowly] → the delivery id makes the repeat a
  no-op.
- [The secret in GitHub and in Terraform drift] → `401` on every delivery, visible in GitHub's
  dashboard as failed deliveries; the owner re-enters it on both sides.
- [An organisation sponsor] → recorded with `type: "Organization"`, never matched; the
  administrator grants to whom the organisation names.

## Implementation notes (4 November 2026)

What the implementation changed from the first version of this design, all reflected above and in
the spec deltas:

- The claim is one store call, `claimSponsorship(login, sub, at, log)`, writing the permission's
  columns, the log entry and the claim of every unclaimed sponsorship of the login in one batch
  (decision 1), instead of `UNBRANDED_EXPORTS.set` and a separate claim.
- `SPONSORS_ACCOUNT` ships empty in `wrangler.jsonc` (decision 2): the shipped default has no
  donation path until the owner's steps are done; claims and the administration answer's
  `sponsorships` also wait for it.
- A body not declared `application/json` is `415 request.unsupported`, a new error code; a blank
  secret is `500 internal`.
- The statuses are `active`, `pending-cancellation` and `cancelled`, the last for good; a later
  action updates the newest sponsorship of the login and the tier's kind, and its privacy.
- Profile's thanks has no date (decision 5): the session answer has none.
- The deletion clears claims inside `applyUserDeleted`'s batch (decision 7).
- The Worker's binding `SPONSORS_WEBHOOK_SECRET_STORE` names a secret that Meltemi Web's Terraform
  must create (task 4.1) before this Worker deploys.

