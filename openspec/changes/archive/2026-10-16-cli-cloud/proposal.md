## Why

For developers the repository is the truth: diagrams are reviewed in pull requests and built in
CI. The cloud should be their mirror, not a second place to edit: a push on merge keeps the
project people share and publish in step with `main`, a pull brings a project someone drew in
the browser into a folder, and a publish makes the catalog public from the command line. The
same API the page uses, driven with an API token ([decision 0041](../../../docs/decisions/0041-hosted-service.md)).
Post-1.0 change, outside the roadmap; it applies after `sharing-and-permissions`.

## What Changes

- **`mdg login`**: a listener on the loopback interface, the browser opened at the service's
  `/cli-auth` page (the six-character check printed first, so the person recognises the
  request), a one-time code received on the listener and exchanged at `POST /cli-auth/token`,
  the token kept with its id in the user's configuration folder
  (`%APPDATA%\meltemi-diagrams\credentials.json` or `$XDG_CONFIG_HOME/meltemi-diagrams/credentials.json`,
  owner-only permissions where the system has them), per host; `--no-browser` prints the
  address; `--token` reads a token from standard input and learns its id from `GET /api/session`;
  `MELTEMI_TOKEN` in the environment wins (CI). A token goes only to the resolved host
  (`--host`, else `MELTEMI_HOST`, else `https://diagrams.meltemi.dev`) and never over `http:`
  except to the loopback. **`mdg logout`** revokes and forgets; **`mdg whoami`** prints the
  name and handle.
- **`mdg push [folder] [--create [--name]] [--project <id>] [--force] [--check] [--strict]`**:
  the folder's project (sources, manifest, themes, assets; text by content, images and fonts by
  hash) becomes the cloud project's files in one transaction; every path that differs in the
  cloud (text by content, binaries by hash) is listed beside the review by id and asked about
  on a terminal, refused without `--force` otherwise; the push carries the fetched revision and
  compares again on `revision.mismatch`; `--check` only reports; validation diagnostics are
  printed and `--strict` makes errors fail the push. A new project records `cloud: { host,
  project }` in `project.json`; a manifest naming another host than the resolved one fails with
  `cloud.host-mismatch`.
- **`mdg pull [<id>] [folder] [--version <n>] [--force]`**: the cloud project's files written
  into the folder, refusing any path that does not resolve inside it and refusing to overwrite
  files that differ unless `--force`.
- **`mdg publish [folder] [--slug] [--handle] [--unpublish]`**: the catalog built as
  `build catalog` does and published through the service; the address printed.
- **`mdg projects`**: the person's cloud projects with id, name, role and last change.
- **`mdg review --base cloud[:<n>]`**: the folder compared with the cloud project's current
  files or one of its versions, with the existing review by id.
- **`mdg init --ci github|gitlab --cloud`**: the workflow gains a job that pushes on the
  default branch with `MELTEMI_TOKEN` from the CI's secrets.
- Tokens are secrets: `mdg_…` is redacted from every output and error, like provider keys.
- Documentation: `docs/cli.md` (the commands, CI), `docs/cloud.md` (tokens), decision 0041.

## Capabilities

### New Capabilities

- `cli-cloud`: login, logout, whoami, push, pull, publish, projects, their options, exit codes
  and messages.

### Modified Capabilities

- `project-manifest`: the optional `cloud` field (`host`, `project`).
- `change-review`: `--base cloud[:<n>]`.
- `cli-binary`: the new command names.
- `safety-limits`: API tokens are redacted like provider keys.
- `ci-workflows`: `--cloud` adds the push job.

## Non-goals

- The approval page, tokens and routes of the service (`cloud-accounts`, `cloud-projects`,
  `sharing-and-permissions`); this change only drives them.

## Impact

- `packages/cli`: `src/cloud-command.ts` (the commands), `src/credentials.ts`, `src/cloud-client.ts`
  (the API over Node's `fetch`), `src/cloud-host.ts` (a `ProjectHost` over the API, filled by
  one prefetch; `reviewCommand` becomes async), the CI templates' `--cloud` job, messages in
  both languages; `redactSecrets` covers `mdg_…`.
- `packages/project`: `cloud` in `MANIFEST_FIELDS` and `schemas/project.schema.json`; the CLI
  imports `isTextPath`, `isImagePath` and `cleanPath` from `src/files.ts`.
- `packages/editor`: `setJsonObjectField` in `src/json-edit.ts`, beside `setJsonField`.
- `packages/cloud`: nothing; `cloud-projects` accepts fonts and answers `HEAD …/blobs/<hash>`.
- No new dependency.
