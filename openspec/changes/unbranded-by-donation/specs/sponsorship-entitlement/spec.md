# Spec Delta

## Purpose
Receiving GitHub Sponsors' deliveries for the sponsored account, keeping the sponsorships, and granting the permission to export without the Meltemi branding to the account that linked the sponsor's GitHub sign-in.

## ADDED Requirements

### Requirement: Sponsorship deliveries
When `SPONSORS_ACCOUNT` is set, `POST /_sponsors/github` SHALL verify `X-Hub-Signature-256`
(`sha256=` and the HMAC-SHA-256 hex of the exact body with `SPONSORS_WEBHOOK_SECRET`, compared
in constant time) before reading the body, refuse a missing or wrong signature with `401` and a
body over 64 KiB or that is not JSON with `400`, and SHALL handle each `X-GitHub-Delivery` id
once. Without the variable the path SHALL answer `404`.

#### Scenario: A signed delivery
- **WHEN** GitHub posts a `sponsorship` `created` event with a valid signature
- **THEN** the answer is `200` and a row is kept for it

#### Scenario: A wrong signature
- **WHEN** the body is changed after it was signed
- **THEN** the answer is `401`, no row is kept and the body is not parsed

#### Scenario: A repeated delivery
- **WHEN** the same delivery id is posted twice
- **THEN** the second answer is `200 { "repeated": true }` and one row exists

### Requirement: What a sponsorship keeps
A `created` event for the configured sponsorable SHALL keep the sponsor's login, id and type,
whether the tier is one-time, its amount in cents, the privacy level and the creation time, as
an unclaimed sponsorship; the other `sponsorship` actions SHALL update the row's status by the
sponsor's login and change no entitlement; another sponsorable, a `ping` or another event SHALL
be answered `200 { "ignored": true }` and change nothing; a body missing a field SHALL be `400`.

#### Scenario: One-time and monthly alike
- **WHEN** a one-time sponsorship of 500 cents and a monthly one of 1000 cents are created
- **THEN** both rows are unclaimed, the first with `one_time` set

#### Scenario: Another sponsorable
- **WHEN** the event's `sponsorable.login` is not `SPONSORS_ACCOUNT`
- **THEN** the answer is `200 { "ignored": true }` and no row exists

#### Scenario: A field missing
- **WHEN** the event has no `sponsorship.sponsor.login`
- **THEN** the answer is `400` and nothing changes

### Requirement: The claim
When a signed-in person's sign-ins are read through the Worker and one is a GitHub identity
whose login equals an unclaimed sponsorship's, ignoring case, the Worker SHALL grant
`unbranded-exports` to that account with the grantor `github-sponsors` and the login in the
log's detail, and claim the row with the account and the time, in one atomic step; a claimed row
SHALL never be claimed again, a cancelled sponsorship SHALL keep its grant, and `user.deleted`
SHALL clear the account's claims.

#### Scenario: A sponsor opens Profile
- **WHEN** Ana, whose GitHub sign-in is `ana`, opens the account panel after a sponsorship by `ana`
  was created
- **THEN** her next session answer says `"unbranded": true`, the row is claimed by her, and the
  log holds a `grant` by `github-sponsors` with the detail `unbranded-exports (ana)`

#### Scenario: Already claimed
- **WHEN** Ben links the GitHub account `ana` after Ana claimed it
- **THEN** nothing is granted to Ben and the row still names Ana

#### Scenario: Cancelled, still granted
- **WHEN** `ana`'s monthly sponsorship is cancelled after the claim
- **THEN** the row's status is `cancelled` and Ana's entitlement is unchanged

#### Scenario: A deleted account
- **WHEN** Ana's account is deleted
- **THEN** the row is unclaimed again and a new account that links `ana` is granted on its next
  Profile
