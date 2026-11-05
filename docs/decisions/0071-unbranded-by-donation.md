# 0071. A donation through GitHub Sponsors grants exports without the branding

Status: accepted (unbranded-by-donation change, 4 November 2026). Extends decisions
[0061](0061-unbranded-exports.md) and [0068](0068-administrators-and-permissions.md).

## Context

On 4 November 2026 the owner asked that the Meltemi branding be removable from an export by an
administrator or by anyone who paid a donation. The first half existed: the permission
`unbranded-exports` (decision 0061), granted by owners and administrators from the account panel
(decision 0068), offered in the web app's export dialog, and never in VS Code nor the command line,
where the engine is MIT and `frame none` does the same for anyone. The second half did not: a
donation granted nothing, there was nowhere to donate, and a person who was not entitled was not told
how to become so. The owner's GitHub account can receive sponsorships: GitHub Sponsors is available
in Chile, takes one-time and monthly payments in tiers whose reward the sponsored account writes,
issues the receipts and pays out, and tells a webhook of each sponsorship (`created` once the
payment is processed, then `edited`, `tier_changed`, `pending_tier_change`, `pending_cancellation`
and `cancelled`), signed with `X-Hub-Signature-256`. The Worker already reads a person's sign-ins
from the identity service on their behalf, and a GitHub sign-in carries its login (`handle`) but not
GitHub's numeric id.

## Decision

- **GitHub Sponsors is the only payment path, and no money touches this service.** The sponsored
  account is `SPONSORS_ACCOUNT` (`askenaz`); its Sponsors page is the session answer's `support` and
  the link the page offers. The tiers' reward text says what the donation gives and that `frame none`
  does the same: the donation is a thank-you with a convenience, not a paywall.
- **The sponsorship is a row, the grant is a claim.** `POST /_sponsors/github` verifies the
  signature over the exact bytes of the body in constant time before it parses anything, reads at
  most 64 KiB of JSON only, keeps a `created` sponsorship once per delivery id in `sponsorships`
  (migration 0007) with the sponsor's login, id and type, the tier's kind and amount, the privacy
  level and the date, and records the later actions as a status. When a signed-in person's sign-ins
  pass through `GET /api/account/identity`, a GitHub sign-in whose login is an unclaimed sponsorship's
  of a person, ignoring case, claims every unclaimed sponsorship of that login for the account and
  grants the permission, with its log entry, in one atomic step of the store; the answer says
  `claimed: true` and the page reads the session again, so Profile thanks the sponsor and the export
  dialog offers the box without a reload.
- **The grantor `github-sponsors`.** The claim sets the permission's own columns with the sentinel
  grantor `github-sponsors`, and logs a `grant` by it whose detail adds the login,
  `unbranded-exports (ana)`. The session answer's `entitlements.unbrandedBy` says who set the flag
  (`github-sponsors`, `administrator` or `null`); the administration answer names the grantor
  "GitHub Sponsors" and lists the latest fifty sponsorships, claimed or not, with **Grant by hand**
  beside an unclaimed one.
- **Any donation, once, for good.** A `created` sponsorship of any tier and amount qualifies,
  one-time or monthly. A cancellation records the status and keeps the grant, since the person
  donated; an administrator revokes it as any other grant. A claimed sponsorship is never claimed
  again, and deleting the account clears its claims, so the person who donated may claim it with a
  new account.
- **Shipped off.** `wrangler.jsonc` ships `SPONSORS_ACCOUNT` empty: without it the route answers
  `404`, the session answer carries no `support` and nothing is claimed, until the owner has enrolled
  in GitHub Sponsors, published the tiers, created the webhook and given its secret to the family's
  infrastructure (`SPONSORS_WEBHOOK_SECRET`, a received secret of Meltemi Web's Terraform).

## Alternatives considered

- **Matching in the webhook**: the Worker holds no GitHub login per account, so the identity service
  would have to resolve a login, a new product route in Meltemi Web.
- **Matching in `GET /api/session`**: a product-signed call to the identity service on every page
  load, for what changes once.
- **The sponsor's numeric id**: the sign-ins do not carry it; the row keeps it for the day they do.
- **A "Check my donation" button**: the claim already runs when the panel reads the sign-ins.
- **`UNBRANDED_EXPORTS.set` followed by the claim**: two writes, which a failure between them would
  leave half done; the claim is one store call that writes the permission's columns, the log entry
  and the claim in one batch, tied by the log entry's id.
- **A minimum amount (`SPONSORS_MINIMUM_CENTS`)**: the tiers on GitHub set the amounts, and a tier
  the owner publishes is the offer.
- **Removing the grant when a monthly sponsorship ends**: the person donated, and a lapsed sponsor
  would lose what the reward promised.
- **A fourth column for the source of the grant**: two columns to keep in step for one fact.
- **Form-encoded deliveries**: the webhook's form chooses JSON, and anything else is `415`.
- **Another payment provider, or payments taken here**: receipts, refunds, taxes and payouts are
  GitHub's, and the service only learns that a sponsorship exists.

## Consequences

- New public surface: `POST /_sponsors/github`, `/_sponsors/*` in `run_worker_first`, the error code
  `request.unsupported` (`415`), the session answer's `support` and `entitlements.unbrandedBy`, the
  identity answer's `claimed`, the administration answer's `sponsorships`, the grantor
  `github-sponsors`, migration 0007, the store's `recordSponsorship`, `updateSponsorship`,
  `unclaimedSponsorship`, `claimSponsorship`, `sponsorships` and `clearClaims`, the variable
  `SPONSORS_ACCOUNT` and the secret `SPONSORS_WEBHOOK_SECRET`.
- The deploy applies migration 0007 before the Worker is uploaded, and Meltemi Web's Terraform must
  store `SPONSORS_WEBHOOK_SECRET` (a single space while it is unset, as for `ADMIN_SUBS`) before the
  Worker that binds it deploys.
- A renamed GitHub login, or a freed login taken by someone else, leaves a sponsorship unclaimed or
  claimed by the wrong account; the Administration section shows who claimed each, and an
  administrator revokes and grants by hand.
- Sponsors' logins and private sponsorships are personal data, shown to the people who administer
  the service only, and never logged.
