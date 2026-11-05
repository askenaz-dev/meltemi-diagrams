# mcp-acceptance Specification

## Purpose
The acceptance of the MCP specification's thirty criteria: the suite that runs the automatable ones against a host, the written procedure for the ones that need Codex and a voice, the staging gate of the deploy and the evidence each run leaves.

## Requirements

### Requirement: The suite
`pnpm acceptance:mcp` SHALL connect as an MCP client to `MELTEMI_MCP_URL` with `MELTEMI_TOKEN`
and `MELTEMI_TOKEN_2` (two accounts) and run criteria 2 to 6, 10 to 23 and 24 to 29 of the
specification's section 13 as named steps, each creating what it needs under names prefixed
`mcp-acceptance-` and removing it at the end, and SHALL exit 1 when a step fails.

#### Scenario: A green run
- **WHEN** the suite runs against a host where every criterion holds
- **THEN** every step passes, no `mcp-acceptance-` project remains, and the exit code is 0

#### Scenario: Criterion 11
- **WHEN** the step pushes with an `ifRevision` older than a change a second client made
- **THEN** the step passes only if the push was refused and the second client's text is intact

#### Scenario: Criterion 26
- **WHEN** the second account asks `read_files` and `preview` for the first account's project by its id
- **THEN** the step passes only if both are `project.not-found`

#### Scenario: A host that cannot be reached
- **WHEN** `MELTEMI_MCP_URL` does not answer
- **THEN** the suite exits 1 naming the host before any step

### Requirement: The evidence of a run
Each run SHALL write `results.json` with the step, the criterion, the outcome, the duration,
the service's version and the protocol version, and SHALL never print or write a token, a code
or a link that grants access; a step whose log holds one SHALL fail the run.

#### Scenario: The file
- **WHEN** a run ends
- **THEN** `results.json` lists every step with its criterion number and outcome, and names the versions

#### Scenario: A leaked secret fails the run
- **WHEN** a step's log line holds `mdg_` or `?live=`
- **THEN** the suite fails naming the step

### Requirement: The procedure for the rest
Criteria 1, 7, 8, 9 and the voice half of 16 SHALL be a written procedure in
`docs/quality/mcp-acceptance.md` naming the Codex version, the configuration used, the steps and
the evidence to record, and each recorded run SHALL add its date, versions and outcome there.

#### Scenario: A recorded run
- **WHEN** the owner runs the procedure with Codex and records it
- **THEN** the page lists the date, the Codex version, the server version and the outcome per criterion, with the evidence folder named

#### Scenario: An unrecorded claim
- **WHEN** the changelog says the voice flow is supported and the page has no recorded run
- **THEN** the docs test fails naming the page

### Requirement: The staging gate
The deploy workflow SHALL deploy the approved source to staging first, run the suite against
`https://staging.diagrams.meltemi.dev/mcp` with the `staging` environment's tokens, and only
then deploy to production; it SHALL run the suite against production afterwards, upload each
`results.json` as an artifact, fail on a red run (production stays as deployed) and never print
a token.

#### Scenario: Staging red
- **WHEN** the staging run fails
- **THEN** production is not deployed and the workflow names the failed step

#### Scenario: Production red
- **WHEN** the production run fails after the deploy
- **THEN** the workflow fails with the artifact uploaded, and the summary says the reversal is a
  revert on main or a rollback of the Workers on Cloudflare, since a dispatch deploys current main only

#### Scenario: Tokens stay secret
- **WHEN** the workflow test reads `deploy.yml`
- **THEN** the suite's tokens are read as `${{ secrets.… }}` only and nowhere echoed
