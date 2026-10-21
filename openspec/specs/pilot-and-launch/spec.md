# pilot-and-launch Specification

## Purpose
The pilot protocol and its measurement templates and summary, the launch material, and the repository's governance and security policy.
## Requirements
### Requirement: Pilot protocol
`docs/pilot/protocol.md` SHALL describe a pilot with five to eight participants who have repeated
documentation or presentation needs, each with a diagram of their own and a later change; timed
creation, adjustment, export and update; errors and help counted; a ten-case comparison with
reference tools on equivalent content and comparable editing effort, rated for legibility, visual
preference and maintainability separately; the second-delivery usage goal; consent and data
handling; and that the results are qualitative signals.

#### Scenario: Protocol complete
- **WHEN** the owner prepares the pilot
- **THEN** the protocol lists participants, tasks, measures, the comparison, the templates to fill
  and how results are summarised

### Requirement: Measurement templates and summary
`docs/pilot/templates/` SHALL hold `participants.csv`, `sessions.csv`, `comparison.csv` and
`followup.csv` with header rows. `pnpm pilot:summary <folder>` SHALL read filled files and write a
Markdown summary: median and range of each phase's time, errors and help per task, mean rating per
tool and criterion, and the share of participants who made a second delivery. It SHALL name the
file and line of each row it cannot read and exit 1 when a file or column is missing.

#### Scenario: Summary of filled templates
- **WHEN** `pnpm pilot:summary` reads sessions of two participants with creation times of 300 and
  500 seconds
- **THEN** the summary gives a median creation time of 6:40 (400 seconds) and a range of 5:00 to
  8:20

#### Scenario: Missing column
- **WHEN** `sessions.csv` has no `phase` column
- **THEN** the command exits 1 naming the file and the column

### Requirement: Launch material and repository policies
`docs/launch/announcement.md` SHALL present 1.0 with links to the gallery, the demo, the example
and installation; `docs/launch/checklist.md` SHALL list the owner actions (trademark review,
accounts, confirming the repository address, publishing, hosting the playground, the office
applications' table, the pilot). `GOVERNANCE.md` SHALL describe decisions, maintainers,
contributions under the MIT licence with a sign-off and no assignment, and that users' diagrams,
assets and projects remain theirs. `SECURITY.md` SHALL give supported versions and private
reporting.

#### Scenario: Owner actions in one place
- **WHEN** the owner prepares the launch
- **THEN** the checklist links each action to the document that prepares it

