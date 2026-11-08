## MODIFIED Requirements

### Requirement: Usage and storage quota

`GET /api/account/usage` SHALL answer the number of projects and the bytes of the distinct
blobs the account's projects and versions reference, refreshed at materialisation, version
creation and binary upload; a binary upload that would take the account over 200 MiB SHALL
answer `413 quota.storage` (text and versions count in the usage but are never refused for it).
A twice-monthly hosted run SHALL delete blobs referenced by nothing and older than seven days.

#### Scenario: Shared bytes count once

- **WHEN** two projects of one account hold the same image
- **THEN** usage counts its bytes once

#### Scenario: Over quota

- **WHEN** an account at 199 MiB uploads a 2 MiB image
- **THEN** the answer is `413 quota.storage` and nothing is stored

#### Scenario: Collection eligibility stays unchanged

- **WHEN** a scheduled run sees referenced blobs, unreferenced blobs no older than seven days,
  and unreferenced blobs older than seven days
- **THEN** it keeps the first two groups and collects only the last group

## ADDED Requirements

### Requirement: Hosted maintenance schedule

Production and staging SHALL schedule hosted maintenance at 03:00 UTC on the first and fifteenth
of each month, using `0 3 1,15 * *`. This is a twice-monthly calendar schedule with 14–17 days
between runs.

#### Scenario: Hosted calendar schedule

- **WHEN** the Worker configuration is prepared for production or staging
- **THEN** its only hosted maintenance cron is `0 3 1,15 * *`
