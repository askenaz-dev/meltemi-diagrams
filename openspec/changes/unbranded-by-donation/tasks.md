# Tasks

## 1. Sponsorships in the store

- [ ] 1.1 Write `packages/cloud/migrations/0007_sponsorships.sql` and the store's
      `recordSponsorship`, `updateSponsorship`, `unclaimedSponsorship(login)`, `claimSponsorship`,
      `sponsorships()` and `clearClaims(sub)` in `store/types.ts`, `store/memory.ts` and
      `store/d1.ts`, the login compared ignoring case. Verify the store tests (both stores) cover
      a record, a repeated delivery id refused, an update by login, a claim, a second claim refused
      and a cleared claim.
- [ ] 1.2 Write `routes/sponsors.ts` (`POST /_sponsors/github` as design decision 2: the
      signature over the exact body in constant time, the 64 KiB cap, the content type, the
      `sponsorship` fields, `ignored`, `repeated`, the status updates, no logging) and add
      `/_sponsors/*` to `run_worker_first` with the `SPONSORS_WEBHOOK_SECRET_STORE` binding and the
      `SPONSORS_ACCOUNT` var in `wrangler.jsonc`. Verify route tests cover a signed `created`
      (GitHub's documented test vector for the HMAC), a wrong signature, a repeat, another
      sponsorable, a `ping`, a missing field, a `cancelled` update, `404` without the variable and
      a spying `console` that sees no body.

## 2. The claim and the answers

- [ ] 2.1 In `routes/account.ts` make `GET /api/account/identity` claim an unclaimed sponsorship
      whose login a GitHub identity carries, through `UNBRANDED_EXPORTS.set` with the grantor
      `github-sponsors` and the log's detail, in one atomic step, answering `claimed: true` beside
      the view; clear claims in the `user.deleted` handler. Verify route tests cover the claim,
      the already-claimed row, the cancelled-still-granted case and the deletion.
- [ ] 2.2 Add `support` and `entitlements.unbrandedBy` to `routes/session.ts`, "GitHub Sponsors"
      to the resolution of `by` in `routes/admin.ts` (holders and log) and `sponsorships` to
      `GET /api/admin`. Verify the session and admin tests cover the configured and unconfigured
      answers, the holder by sponsorship, the logged claim and the sponsorships listed.
- [ ] 2.3 Update `docs/cloud.md` (the session answer, Entitlements: the claim and the sentinel
      grantor, the administration answer, a "Sponsorships" section with the route and the owner's
      steps on GitHub, Variables and secrets) and `docs/es/cloud.md`. Verify the docs link test
      is green and the JSON examples match the tests' answers.

## 3. The page

- [ ] 3.1 In `packages/playground/src/cloud/session.ts` read `support` (an `https:` URL only) and
      `unbrandedBy`; in `exports/dialog.ts` show the donation line for a person not entitled with
      `support`, in `messages/en.ts` and `es.ts`. Verify `pnpm playground:test-browser` covers the
      line, its link's `target` and `rel`, the hostile address, the Spanish words and that the
      entitled and anonymous cases are unchanged.
- [ ] 3.2 In `cloud/account-panel.ts` add Profile's **Support Meltemi Diagrams** (with the
      Sign-ins hint when no GitHub identity is linked), the thank-you sentence for a sponsor, and
      the session re-read on `claimed: true`; in the Administration section the "GitHub Sponsors"
      grantor, the **Sponsorships** part with **Grant by hand** and the log sentence; words in
      `messages/account-panel-{en,es}.ts`. Verify the panel model tests and the browser suite
      cover the donor's Profile, the Google-only hint, the claim without reload, the unclaimed
      sponsorship row and the placeholder, and no part without sponsorships.
- [ ] 3.3 Update `docs/web-app.md` (the donation path in the export dialog and Profile; the
      Administration section's Sponsorships) and `docs/es/web-app.md`. Verify the docs link
      test is green.

## 4. The family's configuration and site

- [ ] 4.1 In `C:\meltemi\web`, add `var.sponsors_webhook_secret` (received, sensitive, empty by
      default) to `packages/infra/variables.tf` and `SPONSORS_WEBHOOK_SECRET` to the Diagrams
      Worker's secrets in `secrets.tf`, and the **Support the project** link to
      `packages/site/public/diagrams/index.html` and `es/diagrams/index.html` with its check, in
      one pull request of that repository. Verify `pnpm infra:fmt`, `pnpm infra:test` and
      `pnpm test` pass there and the pull request's CI is green.
- [ ] 4.2 Owner's steps, written in `docs/cloud.md` and ticked when done: enrol the sponsored
      account in GitHub Sponsors, publish the tiers with the reward text of design decision 8,
      create the Sponsors webhook (payload URL `https://diagrams.meltemi.dev/_sponsors/github`,
      `application/json`, the secret), and give the same secret to the infrastructure's
      `sponsors_webhook_secret`. Verify GitHub's dashboard shows a `ping` delivery answered `200`
      after the deploy.

## 5. Record and gates

- [ ] 5.1 Add the entry to the changelog's open section and write
      `docs/decisions/0071-unbranded-by-donation.md` (extends 0061 and 0068), adding "Extended by
      0071" to both. Verify the decision links resolve in the docs test.
- [ ] 5.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm playground:test-browser` and the
      cloud browser suite, then `openspec validate "unbranded-by-donation" --strict`. Verify all
      green and record the results in the change's `validation.md`.

## Workflow follow-up

- The deploy applies migration 0007 to the production database before the Worker is uploaded.
- Archive the change after review; the archive syncs the five deltas.
