## ADDED Requirements

### Requirement: The suite through the local server
`pnpm acceptance:mcp --local` SHALL run the suite's steps through two `mdg mcp` processes over
stdio, one per test account, each with its token in its own environment only and `MELTEMI_HOST`
set to the origin of `MELTEMI_MCP_URL`. The steps that prove the OAuth server SHALL be skipped
with their reason, every other step SHALL hold as it does against the endpoint, and the run
SHALL fail when a request reached `/mcp`.

#### Scenario: A green local run
- **WHEN** the suite runs with `--local` against a host where every criterion holds
- **THEN** every step that does not prove the OAuth server passes, and the exit code is 0

#### Scenario: The OAuth steps skipped
- **WHEN** the suite runs with `--local`
- **THEN** discovery, the challenge, the foreign code and refresh token, and the audience and scope refusals of criteria 27 and 28 are skipped, each with its reason in `results.json`

#### Scenario: Isolation through the local server
- **WHEN** the second account's process asks `read_files` and `preview` for the first account's project by its id
- **THEN** the step passes only if both are `project.not-found`

#### Scenario: The command line is missing
- **WHEN** `--local` is given and the built command line cannot be started
- **THEN** the suite exits 1 naming the command before any step
