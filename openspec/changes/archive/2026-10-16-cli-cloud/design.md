## Context

The service authenticates bearer tokens `mdg_…` on `/api/*` without the `Origin` rule, hands a
one-time code to a loopback listener from `/cli-auth` and exchanges it for a token at
`POST /cli-auth/token`, reads and pushes files through the room, stores images and fonts by
hash, publishes catalogs and compares nothing itself. The CLI already lists a project's
sources, validates, builds catalogs, reviews a folder against a Git revision through a
revision host (`gitRevisionHost`, a synchronous `ProjectHost` of `@meltemi/diagrams-project`),
opens a browser for `preview --open`, redacts provider keys from errors, and speaks English and
Spanish. `isTextPath`, `isImagePath`, `cleanPath` and `CLOUD_TEXT_EXTENSIONS` live in
`@meltemi/diagrams-project` (`packages/project/src/files.ts`, re-exported by the playground's
`src/files.ts`); the Worker and the CLI import them from there.

## Goals / Non-Goals

**Goals:**

- A developer's loop: `login` once, `push` from a folder or from CI, `pull` what others drew,
  `publish` the catalog, `review` what differs.
- Stateless and honest: nothing hidden in the folder beyond `project.json`'s `cloud` field;
  every overwrite shown or forced explicitly.
- Tokens treated as secrets everywhere.

**Non-Goals:**

- Editing in the cloud from the terminal; device-code sign-in; organisations.

## Decisions

### Credentials

`credentials.json` in the configuration folder (`%APPDATA%\meltemi-diagrams` on Windows,
`$XDG_CONFIG_HOME/meltemi-diagrams` or `~/.config/meltemi-diagrams` elsewhere), `{ "hosts": {
"<host>": { "token": "mdg_…", "id": "<token id>", "user": { "sub", "name" } } } }`, written
with mode `0o600` where the file system honours it (Windows ACLs are left as the user's
profile has them; the documentation says so). Resolution order for a command: `MELTEMI_TOKEN`
in the environment, then the file's entry for the host. The host is `--host`, else
`MELTEMI_HOST`, else `https://diagrams.meltemi.dev`; the development host is
`http://localhost:8788`. The manifest's `cloud.host` never chooses the host: when it differs
from the resolved one the command fails with `cloud.host-mismatch` naming both and `--host`,
before any request. `MELTEMI_TOKEN` and stored tokens are sent only to the resolved host, and
`cloud-client.ts` never sends a bearer token over `http:` except to `127.0.0.1`, `localhost`
or `[::1]` (it refuses with exit code 1 naming the host).

### `login`

1. Start an HTTP listener on `127.0.0.1` and a free port; make a random `state` (32 random
   bytes as base64url, within the 16–128 characters `/cli-auth` accepts); print the
   six-character check the approval page shows, the first six characters of the base32 of
   SHA-256(`state`), so the person recognises their own terminal's request.
2. Open `<host>/cli-auth?port=<port>&state=<state>` in the browser (`openInBrowser` of
   `preview.ts`); with `--no-browser`, print it.
3. Wait up to five minutes for `GET /?code=…&state=…` on the listener; check `state`; answer
   a small page in the interface language saying the terminal can be used again; exchange the
   code at `POST /cli-auth/token` with `{ code, state }`, which answers `{ id, name, token }`
   once (an unknown, used or expired code is `400 cli.invalid`: exit code 1, nothing stored);
   call `GET /api/session` with the token for its `user`; store `{ token, id, user: { sub,
   name } }` under the host and print the name. The token never appears in a URL.
4. `--token` reads a token from standard input instead (for machines without a browser) and
   calls `GET /api/session` with it: the bearer answer's `token.id` and `user` are stored the
   same way.

`logout` calls `DELETE /api/tokens/:id` with the stored id and removes the entry, also when the
service answers `401 token.invalid` (the token is already dead); `whoami` prints name and
handle. An expired or revoked token answers `token.invalid`, which every other command turns
into "Run `mdg login`" with exit code 3.

### `push`

The folder's project is read as `validate` reads it (`project.json`, the sources
`listSources` finds, themes, and the files under the project that the manifest's `exclude`
does not exclude), excluding `.git`, `node_modules`, dotfiles and the manifest's `catalog.out`
folder. Text files (`isTextPath` from `@meltemi/diagrams-project`) travel by content; other
files (images, fonts; at most 10 MiB each) are uploaded by hash first (`PUT …/binaries/<path>`,
skipped when the hash exists: `HEAD …/blobs/<hash>` answers 200). Then `PUT …/files` with the
full set, `null` for every cloud path absent locally and `ifRevision`, in one transaction.

Before pushing, the cloud's current files and `revision` are fetched (`GET …/files`, through
the same prefetched host as `review --base cloud`) and every path of the push set is compared:
text files by content, binaries by hash, cloud paths absent locally as deletions. The review by
id (`reviewProjects` with the cloud files as the base) only sees semantic changes of sources,
so its summary is printed beside the list of differing paths ("project.json differs",
"assets/logo.png differs"). Only an identical set proceeds without asking; otherwise, on a
terminal, "Overwrite these changes in the cloud?" is asked; without a terminal the push is
refused with exit code 1 unless `--force`. `PUT …/files` carries `ifRevision` from the fetched
revision; on `409 revision.mismatch` the files are fetched and compared again (and asked about
again) instead of overwritten. `--check` uses the same comparison, prints it and exits 1 when
anything differs, 0 otherwise. Validation diagnostics are printed as `validate` prints them;
errors do not stop the push (the page shows them too) unless `--strict`.

`--create` makes the project (`--name`, else the manifest's `name`), writes `cloud: { host,
project }` into `project.json` with `setJsonObjectField` of `@meltemi/diagrams-editor`
(`json-edit.ts`, beside `setJsonField`: `setJsonObjectField(text, key, value: Record<string,
string>): TextEdit[]`, a one-line object in the file's indentation and line endings, the rest
of the text untouched), and pushes. `--project <id>` overrides the
manifest's. A manifest without `cloud` and no `--project` or `--create` is an error that names
both options.

Alternative: a local state file with the last pushed revision to detect conflicts without
fetching. It would be per clone, absent in CI, and a thing to explain; fetching the cloud's
files is one request and the review by id already exists.

### `pull`

`mdg pull [<id>] [folder] [--version <n>] [--force]`: the id from the argument or the folder's
`project.json`; every cloud path is checked first with `cleanPath` (`@meltemi/diagrams-project`)
and must resolve inside the folder, else `pull.unsafe-path` names it, the exit code is 1 and
nothing is written; then the cloud's files (or the version's) are written into the folder;
files that exist and differ are listed and not written unless `--force`; files absent in the
cloud are left alone; binaries are fetched by hash; `project.json` gains `cloud` through
`setJsonObjectField` when it lacks it. Exit code 1 when anything was refused.

### `publish`

`mdg publish [folder] [--slug <s>] [--handle <h>] [--unpublish]`: the folder is pushed first
when it differs (with the same confirmation), the catalog is built as `build catalog` builds
it (ELK, fonts, the same `buildCatalog`), and `PUT …/publish` sends it; the first publication
needs a handle (`--handle`, or asked on a terminal); the address is printed. `--unpublish`
calls `DELETE`.

### `projects` and `review --base cloud`

`mdg projects` prints id, name, role, last change (and `--json`). `review --base cloud[:<n>]`
uses `cloudHost(client, root, id, version?)`, which fetches `GET …/files` (or
`GET …/versions/:n`) and the blobs its `binaries` reference once, applies the path rule of
`pull` (`pull.unsafe-path`), and returns a synchronous `ProjectHost` (`@meltemi/diagrams-project`)
rooted at the local project root: `<root>/<path>` answers the fetched text or bytes and
`readDirectory` comes from the path set, as `gitRevisionHost` does for a revision.
`reviewCommand` becomes async and returns `Promise<number>` (`run()` already returns
`number | Promise<number>` for `assist`); the rest of `review` is unchanged (`--out`, `--json`,
`--exit-code`).

### CI

`init --ci github --cloud` adds to the workflow a job on pushes to the default branch:
`meltemi-diagrams push --force --strict` with `MELTEMI_TOKEN: ${{ secrets.MELTEMI_TOKEN }}`
and `MELTEMI_HOST` optional; GitLab likewise with its variables. The documentation explains
why `--force` there: the repository is the truth.

### Secrets

`redactSecrets` also replaces `mdg_[A-Za-z0-9_-]+` with `mdg_…`; the token never appears in
`--json` output, in error pages or in the review folder; the credentials file is the only place
it is written.

### Open decisions

1. **Push with validation errors.** Alternatives: refuse; warn and push. Recommended: warn and
   push, `--strict` refuses; a half-finished diagram in the cloud is better than a stale one,
   and CI uses `--strict`.
2. **Windows permissions.** Alternatives: `icacls` on the file; leave the profile's ACLs.
   Recommended: leave them and document it; the profile folder is already the user's.

## Risks / Trade-offs

- **A code in a URL once.** The redirect from `/cli-auth` to the loopback listener carries a
  one-time code bound to `state`, valid five minutes and exchanged once at
  `POST /cli-auth/token`, as `gh` and `wrangler` do; the token itself never appears in a URL or
  in the browser's history, and the listener closes after the first request.
- **Big pushes.** Each binary is one upload; text goes in one request bounded by the document
  limit; a project over the limits is refused with the quota's code and nothing half-applied.
