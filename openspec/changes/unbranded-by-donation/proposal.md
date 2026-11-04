# Exports without the branding, by donation

## Why

On 2026-11-04 the owner asked that the Meltemi branding be removable from an export by an
administrator or by anyone who paid a donation, and said he did not see it implemented. The first
half exists and is in production: version 1.11.0 at diagrams.meltemi.dev carries **Export
without the Meltemi branding** under the Theme field of the export dialog for a signed-in owner,
administrator or granted account (decision 0061, change `unbranded-exports`, archived
2026-10-28), administrators grant it from the account panel's Administration section (decision
0068), and VS Code and the command line never offer it because the engine is MIT and `frame none`
does the same for anyone. What does not exist is the second half: a donation grants nothing, there
is nowhere to donate, and a person who is not entitled is not told how to become so. This change
adds the donation path through GitHub Sponsors, where the owner's sponsors profile, its tiers and
its payouts already have a home, and matches a sponsorship to the account that linked the same
GitHub sign-in.

This is a post-1.0 change outside `docs/roadmap-1.0.md`.

## What changes

- **Sponsorships received.** `POST /_sponsors/github` receives GitHub Sponsors' `sponsorship`
  webhook deliveries for the configured sponsored account (`SPONSORS_ACCOUNT`): the body is
  verified with `X-Hub-Signature-256` and the secret `SPONSORS_WEBHOOK_SECRET` before it is read,
  a delivery is handled once by its `X-GitHub-Delivery` id, and a `created` sponsorship, one-time
  or monthly, of any amount, is kept in a new table `sponsorships` (migration 0007) with the
  sponsor's GitHub login and id, the tier's amount and kind, the date and its privacy level;
  later actions update the row's status and change no entitlement. Without the variable the route
  does not exist.
- **The claim.** When a signed-in person's sign-ins are read through the Worker (the account
  panel's Profile and Sign-ins), a GitHub identity whose login is an unclaimed sponsorship's
  grants `unbranded-exports` to that account, recorded as granted by GitHub Sponsors with the
  login, logged like an administrator's grant, and claimed by that account; a sponsorship stays
  granted when the monthly sponsorship ends (it was a donation), and an administrator may still
  revoke or grant by hand, as for an organisation sponsor or a person signed in with Google only.
  Deleting the account clears the claim.
- **Being told.** `GET /api/session` adds `support: { url }` (the sponsors page) when
  configured; the export dialog shows a signed-in person who is not entitled one line under the
  Theme field, "Donate to export without the Meltemi branding", with the link and the words that
  a donation made with the GitHub account linked to this one is recognised when the account panel
  is opened; Profile shows the same to a person not entitled, and tells an entitled sponsor that
  the entitlement came from their donation; the Administration section's Permissions part names
  GitHub Sponsors as the grantor of such holders and lists the sponsorships received, claimed or
  not, with **Grant** beside an unclaimed one.
- **Configuration and the site.** The secret and the variable reach the Worker through the
  family's Terraform (a received secret, as `ADMIN_SUBS`); the sponsors profile, its tiers and the
  webhook are the owner's steps on GitHub, written down in `docs/cloud.md`; the family site's
  Diagrams page gains "Support the project" to the sponsors page, in a pull request of
  `meltemi-web`.
- **Words and guides.** English and Spanish catalogues; `docs/cloud.md`, `docs/playground.md`
  (and their Spanish twins); the changelog's open section; decision note 0071.

## Capabilities

### New Capabilities

- `sponsorship-entitlement`: receiving GitHub Sponsors' deliveries, keeping sponsorships, and
  matching one to the account that linked the same GitHub sign-in, which grants the permission.

### Modified Capabilities

- `cloud-accounts`: the session answer's `support`; the entitlement's grantor may be GitHub
  Sponsors; a deleted account's claim.
- `service-administration`: the log and the holders name GitHub Sponsors as a grantor; the
  administration answer lists the sponsorships.
- `account-panel`: Profile's support section and the Administration section's sponsorships.
- `playground-exports`: the line under the Theme field for a person not entitled.

## Impact

`packages/cloud` (the webhook route, migration 0007, the store's sponsorships in D1 and memory,
the claim in the account route, the session and admin answers, `wrangler.jsonc`'s
`run_worker_first` and the two bindings), `packages/playground` (the export dialog, the account
panel's Profile and Administration, the catalogues), the docs in both languages, CHANGELOG and one
decision note; in `meltemi-web`, `packages/infra/secrets.tf` and `variables.tf` for the received
secret and the variable, and the Diagrams page's link. No change to the identity contract, to
exports' pictures or to the command line.

## Non-goals

Any payment taken by this service: GitHub Sponsors takes the money, issues the receipts and pays
out, and the service only learns that a sponsorship exists. Matching by the GitHub user's numeric
id, which needs the identity service to expose it (a change of `meltemi-web`'s `identity-account`
contract); the login is matched. The owner's enrolment in GitHub Sponsors, the tiers' texts and
the webhook's creation, which only the owner can do on GitHub and the `delivery` change's owner
steps list. The documentation portal (`docs-portal`, in `meltemi-web`).
