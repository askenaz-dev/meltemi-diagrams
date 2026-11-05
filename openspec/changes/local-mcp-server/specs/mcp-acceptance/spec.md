## ADDED Requirements

### Requirement: The suite through the local server
`pnpm acceptance:mcp --local` SHALL run the suite's steps through two `mdg mcp` processes on free
loopback ports, one per test account with its token in its own environment only, its agents
connected to the printed addresses with no bearer. The OAuth steps SHALL be skipped with their
reason, every other step SHALL hold as it does against the endpoint, and the processes SHALL be
stopped when the run ends.

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
