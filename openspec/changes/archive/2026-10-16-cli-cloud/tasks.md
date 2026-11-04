## 1. Credentials and the client

- [x] 1.1 `src/credentials.ts`: the configuration folder per platform, the entry `{ token, id, user }` per host read and written with `0o600`, `MELTEMI_TOKEN` and `MELTEMI_HOST` precedence, the host resolved from `--host`, `MELTEMI_HOST` or the default only, `cloud.host-mismatch` when the manifest names another host; `redactSecrets` covers `mdg_…`; unit tests with a temporary home
- [x] 1.2 `src/cloud-client.ts`: the API over `fetch` with bearer auth sent only to the resolved host and never over `http:` except to `127.0.0.1`, `localhost` or `[::1]`, JSON errors to typed errors, `token.invalid` to exit code 3; unit tests against a local stub server
- [x] 1.3 `mdg login` (listener, `state`, the six-character check printed, browser or `--no-browser`, the code exchange at `POST /cli-auth/token`, `GET /api/session` for the user, `--token` with `GET /api/session` for the id, five-minute timeout, the done page in both languages), `logout` (`DELETE /api/tokens/:id`, the entry removed also on `401 token.invalid`), `whoami`; `--help` lines; tests with a stub service that redirects to the listener with a code and answers the exchange once

## 2. Push, pull, publish

- [x] 2.1 `packages/project`: `cloud` in `MANIFEST_FIELDS`, validation and hint, `schemas/project.schema.json`; `packages/editor`: `setJsonObjectField` in `src/json-edit.ts` beside `setJsonField` (one-line object, the file's indentation and line endings); tests, among them a CRLF, four-space manifest gaining `cloud` with nothing else changed
- [x] 2.2 The push set and its comparison: the folder's files as `validate` reads them, `isTextPath` and `isImagePath` from `@meltemi/diagrams-project`, the cloud's files and `revision` fetched once, every path compared (text by content, binaries by hash, deletions), the review by id printed beside the differing paths; tests against the stub service, among them a cloud where only `project.json` differs
- [x] 2.3 `mdg push`: binaries by hash with the `HEAD` skip, the single transaction with `ifRevision`, the second comparison on `409 revision.mismatch`, the terminal question, `--force`, `--check`, `--strict`, `--create` with `cloud` written; tests against the stub service covering the three scenarios
- [x] 2.4 `mdg pull` (id or manifest, `--version`, `cleanPath` and the inside-the-folder check before any write with `pull.unsafe-path`, differing files skipped unless `--force`, `cloud` added through `setJsonObjectField`); tests, among them `../x.meltemi`, `.git/hooks/post-checkout` and the CRLF, four-space manifest
- [x] 2.5 `mdg publish` (push when differing, the catalog build, handle on first use, `--unpublish`, refusals); `mdg projects` (`--json`); tests
- [x] 2.6 `src/cloud-host.ts`: `cloudHost` prefetches the files (or the version) and the referenced blobs, applies the path rule and returns a `ProjectHost` (`@meltemi/diagrams-project`) rooted at the local project root as `gitRevisionHost` does; `reviewCommand` returns `Promise<number>`; `review --base cloud[:<n>]`; tests

## 3. CI templates and documentation

- [x] 3.1 `init --ci github|gitlab --cloud`: the push job in both templates, no token in the file; tests
- [x] 3.2 `docs/cli.md` (the commands, the developer's loop, CI with `--force --strict` and why), `docs/cloud.md` (tokens, the code exchange, where a token may travel), `docs/es/` mirrors; the skill's command list; decision 0041 cross-checked
- [x] 3.3 By hand against `pnpm cloud:dev`: login in a browser (the check matches the page), push the purchase template, edit in the page, `review --base cloud`, pull, publish under `/_published/`; `pnpm typecheck`, `pnpm lint`, `pnpm test` green
