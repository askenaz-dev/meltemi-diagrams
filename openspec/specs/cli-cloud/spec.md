# cli-cloud Specification

## Purpose
The command line's cloud commands: login, logout and whoami with the browser approval, push, pull, publish and projects driven with an API token, review against the cloud, the credentials file, exit codes and messages.
## Requirements
### Requirement: Signing in from the command line
`mdg login [--host <url>] [--no-browser] [--token]` SHALL start a listener on `127.0.0.1`, make
a random `state`, print the six-character check the approval page shows (the first six
characters of the base32 of SHA-256 of `state`) before opening
`<host>/cli-auth?port=<port>&state=<state>` in the browser (or printing it with `--no-browser`),
accept the one-time `code` once when the `state` matches, exchange it at `POST /cli-auth/token`
with `{ code, state }`, store the answered token with its `id` and the person's `sub` and name
in the user's configuration folder per host (mode `0o600` where honoured), and print the name;
the token SHALL never appear in a URL. `--token` SHALL read a token from standard input instead
and learn its `id` and user from `GET /api/session`. A mismatched `state`, a refused exchange
(`400 cli.invalid`) or five minutes without a code SHALL fail with exit code 1 and store
nothing. `MELTEMI_TOKEN` in the environment SHALL take precedence over the file. `mdg logout`
SHALL call `DELETE /api/tokens/:id` with the stored id and remove the entry, also when the
service answers `401 token.invalid`; `mdg whoami` SHALL print the name and handle. A command
that needs a token and has none, or whose token the service refuses, SHALL say to run
`mdg login` and exit with code 3.

#### Scenario: Login round trip
- **WHEN** the test's fake service redirects the browser to the listener with a code and the right `state`
- **THEN** the command printed the check before opening the browser, exchanged the code once, the credentials file holds the token and its id under the host, and the command prints the name

#### Scenario: Wrong state
- **WHEN** the redirect carries another `state`
- **THEN** nothing is stored, no exchange is attempted, and the command fails with exit code 1

#### Scenario: A code already used
- **WHEN** the exchange answers `400 cli.invalid`
- **THEN** nothing is stored and the command fails with exit code 1

#### Scenario: Logout of a revoked token
- **WHEN** `mdg logout` runs and `DELETE /api/tokens/:id` answers `401 token.invalid`
- **THEN** the entry is removed from the credentials file and the exit code is 0

#### Scenario: Not signed in
- **WHEN** `mdg push` runs with no token for the host
- **THEN** it prints that `mdg login` is needed and exits with code 3

### Requirement: The host a token goes to
The host of a cloud command SHALL be `--host`, else `MELTEMI_HOST`, else
`https://diagrams.meltemi.dev`; a manifest whose `cloud.host` differs from the resolved host
SHALL fail with `cloud.host-mismatch` naming both hosts and `--host`, before any request;
`MELTEMI_TOKEN` and stored tokens SHALL be sent only to the resolved host, and a bearer token
SHALL never be sent over `http:` except to `127.0.0.1`, `localhost` or `[::1]` (exit code 1
naming the host).

#### Scenario: The development host
- **WHEN** `mdg push --host http://localhost:8788` runs with a token stored for that host
- **THEN** the token is sent to `http://localhost:8788` and nowhere else

#### Scenario: A manifest naming another host
- **WHEN** `project.json` holds `cloud.host` `https://evil.example` and neither `--host` nor `MELTEMI_HOST` names it
- **THEN** the command fails with `cloud.host-mismatch` naming both hosts and `--host`, and no request is made

#### Scenario: Plain http to a remote host
- **WHEN** `--host http://diagrams.example` is given
- **THEN** no token is sent and the command fails with exit code 1 naming the host

### Requirement: Push
`mdg push [folder] [--create [--name <n>]] [--project <id>] [--force] [--check] [--strict]`
SHALL read the folder's project (manifest, sources, themes and other files the manifest does
not exclude, never `.git`, `node_modules`, dotfiles or the catalog's output folder), upload
binaries by hash (skipping those the service has), and push every text file and every deletion
in one transaction to the project named by `--project`, the manifest's `cloud.project`, or the
one `--create` makes (recording `cloud` in `project.json`). It SHALL first fetch the cloud's
files and `revision` and compare every path of the push set (text files by content, binaries by
hash, cloud paths absent locally as deletions), printing the differing paths beside the review
by id; only an identical set SHALL proceed without asking; otherwise it SHALL ask on a terminal,
or refuse with exit code 1 without `--force`. The push SHALL carry `ifRevision` from the fetched
revision and, on `409 revision.mismatch`, fetch and compare again instead of overwriting;
`--check` SHALL use the same comparison and only report (exit 1 when anything differs).
Validation diagnostics SHALL be printed; errors SHALL stop the push only with `--strict`. A
manifest without `cloud` and no `--project` or `--create` SHALL fail naming both options.

#### Scenario: Push a new project
- **WHEN** `mdg push docs/architecture --create` runs on a folder with three sources and an image
- **THEN** the service holds the three texts and the image by hash, `project.json` carries `cloud.project`, and the exit code is 0

#### Scenario: Overwrite refused without a terminal
- **WHEN** the cloud project has a change the folder lacks and `mdg push` runs with no terminal and no `--force`
- **THEN** the summary names the file by id, nothing is pushed, and the exit code is 1

#### Scenario: Only the manifest differs
- **WHEN** the cloud's `project.json` differs from the folder's and every source is identical
- **THEN** `project.json differs` is printed, the review by id reports nothing, and the push asks on a terminal or is refused without `--force`

#### Scenario: A change arrives during the push
- **WHEN** `PUT …/files` answers `409 revision.mismatch`
- **THEN** the files are fetched and compared again and nothing is overwritten without the question or `--force`

#### Scenario: Strict with errors
- **WHEN** a source has an error and `--strict` is given
- **THEN** the diagnostics are printed, nothing is pushed, and the exit code is 1

### Requirement: Pull
`mdg pull [<id>] [folder] [--version <n>] [--force]` SHALL check every cloud path first with
`cleanPath` (`@meltemi/diagrams-project`) and refuse any path that fails the rule or does not
resolve inside the folder with `pull.unsafe-path` naming it, exit code 1 and nothing written;
then it SHALL write the cloud project's files (or the version's) into the folder, fetching
binaries by hash, listing and skipping files that exist and differ unless `--force`, leaving
files absent in the cloud alone, and adding `cloud` to `project.json` when it lacks it; exit
code 1 when anything was skipped; an unknown id or version SHALL fail with exit code 1 naming
it.

#### Scenario: Pull into an empty folder
- **WHEN** `mdg pull <id> ./from-cloud` runs
- **THEN** the folder holds every file of the project and its `project.json` names the cloud project

#### Scenario: A differing file is kept
- **WHEN** the folder's `diagrams/a.meltemi` differs from the cloud's and `--force` is absent
- **THEN** the file is listed, not written, and the exit code is 1

#### Scenario: A path outside the folder
- **WHEN** the cloud holds `../x.meltemi`
- **THEN** `pull.unsafe-path` names it, nothing is written, and the exit code is 1

#### Scenario: A dotfile path
- **WHEN** the cloud holds `.git/hooks/post-checkout`
- **THEN** `pull.unsafe-path` names it, nothing is written, and the exit code is 1

### Requirement: Publish
`mdg publish [folder] [--slug <s>] [--handle <h>] [--unpublish]` SHALL push the folder when it
differs (with the same confirmation as `push`), build the catalog as `build catalog` does, send
it to the service and print the public address; the first publication SHALL need a handle from
`--handle` or a terminal; `--unpublish` SHALL remove it; the service's refusals (`handle.taken`,
`handle.locked`, `publish.too-large`, `access.denied`) SHALL be printed with exit code 1.

#### Scenario: First publication
- **WHEN** `mdg publish --slug purchase --handle ana` runs for a person without a handle
- **THEN** the handle is set, the catalog is published and the address ends with `/ana/purchase/`

#### Scenario: Handle taken
- **WHEN** the service answers `409 handle.taken`
- **THEN** the command prints that the handle is taken and exits with code 1

### Requirement: Projects and review against the cloud
`mdg projects [--json]` SHALL list the person's cloud projects with id, name, role and last
change; `mdg review --base cloud[:<n>]` SHALL compare the folder with the cloud project's
current files or version `n` using the review by id, with `review`'s other options unchanged.

#### Scenario: Review against a version
- **WHEN** `mdg review --base cloud:3` runs
- **THEN** the review lists what changed by id between version 3 and the folder

#### Scenario: No cloud project
- **WHEN** the folder's manifest has no `cloud` and `--project` is absent
- **THEN** the command fails naming `--project` and `mdg push --create`

### Requirement: Tokens never shown
No output, `--json` document, review page or error of the command line SHALL contain a token:
`redactSecrets` SHALL replace `mdg_…` tokens, and the credentials file SHALL be the only place
the token is written.

#### Scenario: A token in an error
- **WHEN** the service's error message echoes a token
- **THEN** the printed message shows `mdg_…`

#### Scenario: whoami
- **WHEN** `mdg whoami` runs
- **THEN** it prints the name and handle and nothing of the token

