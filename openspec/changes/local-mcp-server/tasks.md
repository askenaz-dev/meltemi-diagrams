## 1. The shared package and the engine

- [x] 1.1 Create `packages/mcp` as `@meltemi/diagrams-mcp`: MIT, public, a `README.md` naming the
      package, its install and a minimal use, and the exports `.`, `./preview` and `./node` with
      the `@meltemi/diagrams-source` condition. Its dependencies are `@modelcontextprotocol/server`
      2.3.1, `zod` and `@resvg/resvg-wasm` 2.6.2, pinned as `packages/cloud` pins them, and the
      public packages the engine uses. Verify that the names test and the publishable-manifest
      checks pass with the new package.
- [x] 1.2 Move `renderer-core.ts` (without the SQLite cache), `renderer-engine.ts`,
      `renderer-protocol.ts`, `renderer-raster.ts`, `renderer-fonts.ts` and `MEASURED_FAMILIES`
      from `packages/cloud/src/` to `packages/mcp/src/preview/`. The SQLite cache, the bundle's
      file list, `renderer.ts`, `renderer-runtime.ts` and the bundle script import them from
      `@meltemi/diagrams-mcp/preview`. Verify that `pnpm test` over `packages/cloud` is green and
      that `wrangler deploy --dry-run` reports the upload size within 1% of before.
- [x] 1.3 Write `./node` (`nodeRenderer()`, design decision 4) and `packages/cli/src/mcp-engine.ts`
      (`LocalEngine`, decision 6): fonts, assets and raster faces read from the installed packages,
      one queue serialising drawing calls. Verify with tests:
      - the SVG of the `flow` fixture equals `mdg export --fonts system`'s;
      - the PNG of `flow/thirty` at 1280 is byte-equal to the Worker's core over its bundled files
        for the same request;
      - a `validate` call loads no rasteriser.

## 2. The folder server, the first vertical slice

- [x] 2.1 Move the wrapper of `packages/cloud/src/mcp/tool.ts`, the HTTP handler of
      `mcp/endpoint.ts` and the shapes of `mcp/shapes.ts` into `packages/mcp/src/` as
      `buildServer`, `statelessHandler`, `refusedVersion`, `Refusal`, `errorResult` and the shapes
      (design decision 4). Write `FOLDER_TOOLS` with `validate` and `preview`. Verify with unit
      tests:
      - a schema refusal answers `request.invalid` naming the field;
      - an unexpected throw answers `internal`;
      - a result its output schema refuses answers `internal` when `checkOutput` is on;
      - the log line holds the name, the milliseconds and the code only.
- [x] 2.2 Write `packages/cli/src/mcp-http.ts`, the loopback server (design decisions 2 and 3):
      `node:http` on `127.0.0.1`, the `Host`, `Origin`, key, path, method, version and size
      refusals, the request and response bridged to the stateless handler, the address on the
      first line of standard output, `SIGINT` and `SIGTERM` stopping it with 0, and a port in use
      exiting 2. Verify with tests over a real port:
      - `Host: attacker.example` and `Origin: http://localhost:3000` are `403`;
      - `GET /mcp` is `405` with `Allow: POST`, `/other` is `404`, a 25 MiB body is `413`;
      - with `MELTEMI_MCP_KEY`, no bearer is `401` and the key is served;
      - a second server on a port in use exits 2 with `mcp.port-in-use`.
- [x] 2.3 Write `packages/cli/src/mcp-command.ts` and `mcp-folder.ts` (design decision 9):
      `mdg mcp [--folder <dir>] [--host <url>] [--port <n>]`, listed in `--help` with its
      English and Spanish lines, an unknown option or a bad port exiting 2 with the usage, and a
      missing `<dir>` exiting 2 before anything listens. Verify with a test that starts the built
      command on port 0 and drives it with `StreamableHTTPClientTransport`:
      - `initialize` names `meltemi-diagrams` and the version;
      - `tools/list` answers two tools;
      - a PNG `preview` of the purchase template arrives with its report;
      - `path: "../secret.meltemi"` answers `path.invalid`, and a file edited between two previews
        is drawn edited;
      - `validate` reports what `mdg validate` reports for the same folder;
      - a recording `fetch` sees no call.

## 3. One catalogue for both servers

- [x] 3.1 Move the twenty-seven definitions of `tools-projects.ts`, `tools-preview.ts`,
      `tools-sharing.ts` and `tools-live.ts`, without `run`, into `packages/mcp/src/catalogue/`
      (`TOOLS`, `CATALOGUE`), along with `appUrl`. Each Worker tool keeps its `run`, attached with
      `implement(TOOLS.<name>, run)`. `server.ts` calls `buildServer` with the per-account counting
      and the scope check as hooks, and `endpoint.ts` uses `statelessHandler`. Verify that
      `pnpm test` over `packages/cloud` and the cloud browser suite's MCP scenarios are green with
      no test changed.
- [x] 3.2 Write the catalogue test (`mcp-server` "Both servers list the same tools"). It builds the
      Worker's server and `mdg mcp`'s cloud server from the same commit and compares their
      `tools/list` deeply. Verify that it passes, and that it fails naming the tool when one
      description is changed on one side only.
- [x] 3.3 Add a test that the package's `idempotencyKey` pattern equals the Worker's
      `IDEMPOTENCY_KEY`.

## 4. The HTTP API's two additions

- [x] 4.1 `GET /api/session` with a token answers `user.email`, and `GET /api/account/publications`
      answers the account's publications (design decision 8). Verify with route tests: the
      token's answer has the email and the cookie's answer is unchanged; two published projects
      are listed with their projects; no principal is `401 auth.required`. Document both in
      `docs/cloud.md` and its Spanish copy.

## 5. The cloud backend of the command line

- [x] 5.1 Add `call(method, path, { json?, idempotencyKey? })` to `CloudClient`, with the client's
      existing rules (blobs are read with its existing `blob`, which checks their hash). Verify against a stub server that the
      `Idempotency-Key` header is sent, that a `302` is `cloud.redirect` and that the token reaches
      no other origin.
- [x] 5.2 Write `cloudHandlers` in `packages/cli/src/mcp-cloud.ts` for `whoami`, `list_projects`,
      `create_project`, `get_project`, `rename_project`, `read_files` and `open_url`, reading the
      token at each call (design decision 10). Verify with stub-service tests:
      - with no token, `auth.required` names `mdg login`;
      - a `401` answers `token.invalid`, and the token is in no output;
      - `create_project` retried with its key sends the same key twice.
- [x] 5.3 Write `write_files` from the machine (design decision 7). Verify the three scenarios of
      `mcp-local-server` "Writing from the machine": an error is refused whole with no push
      request; a retry after success answers the same revision; a conflict answers
      `revision.mismatch` with the current revision.
- [x] 5.4 Write `validate`, `preview` (binaries chosen as the endpoint chooses them, fetched by
      hash into the 64 MiB LRU, `estimatedFonts`, the width bounds and four megapixels) and
      `upload_image`. Verify with tests:
      - an image used twice is fetched once;
      - `width: 4096` is `request.invalid`;
      - a file with an error is `diagram.invalid` with diagnostics and no picture.
- [x] 5.5 Write the version, sharing and live handlers: `list_versions`, `create_version`,
      `restore_version`, the seven sharing tools, `get_live`, `start_live` and `end_live`. Each
      answers the hosted tool's output schema, and `invite` answers `emailSent: false`. Verify
      each against the stub service, with its output checked by the definition's schema.
- [x] 5.6 Write `publish` (the catalog built by the renderer's engine with the command line's
      script and generator, the address checked), `list_publications` and `unpublish`. Verify with
      tests:
      - the HTML sent equals what the renderer's core builds for the same files;
      - a project with no diagram is refused with the hosted tool's code, and no publish
        request is made.
- [x] 5.7 Verify the transport and log rules with tests:
      - `--host http://example.com` exits 2 with `cloud.insecure-host` and no request;
      - one stderr line per call, without arguments, tokens, the key or links;
      - two concurrent previews are drawn one after the other;
      - a client that creates, writes, previews and shares through the stub service made
        requests under `/api/` only.

## 6. The endpoint's refusal

- [x] 6.1 Add `renderer.unavailable` (503, message naming `mdg mcp`) to
      `packages/cloud/src/errors.ts`. Map a throw from a renderer stub call to it in `preview`,
      `validate`, `write_files` and `publish` (design decision 11). Verify with tests over a
      throwing stub:
      - `preview` answers the code;
      - `write_files` leaves the room's revision unchanged and keeps no answer for the key;
      - an unrelated throw stays `internal`.

## 7. Acceptance through the local server

- [x] 7.1 Add `--local` to `pnpm acceptance:mcp` (design decision 12): two `mdg mcp --port 0`
      processes with one token each, `MELTEMI_HOST` from the target and an empty configuration
      folder, the agents pointed at the printed addresses with no bearer, the OAuth steps skipped
      with their reasons and the processes stopped at the end. Verify that the suite's unit tests
      pass, and that `--local` with no built command line exits 1 naming it.
- [x] 7.2 Run `pnpm acceptance:mcp --local` against `pnpm cloud:dev` with two local test accounts.
      Verify that every non-OAuth step passes and that the Worker's log shows no request to
      `/mcp`. Record the run in this change's `validation.md`.
- [ ] 7.3 Owner, after the test tokens of `agent-mcp` task 4.4 exist: run
      `pnpm acceptance:mcp --local` against `https://staging.diagrams.meltemi.dev`, and record the
      outcome in `docs/quality/mcp-acceptance.md`.

## 8. Speed

- [x] 8.1 Add `pnpm cli:bench-mcp`. It previews `flow/thirty` at 1280 fifteen times in one
      `mdg mcp --folder` process after a first preview, and times a cold process's first preview.
      It exits 1 when a target of `mcp-local-server` "Speed of local previews" is missed. Verify
      that it passes on the reference machine, and record the table in `docs/performance.md` and
      `docs/es/performance.md`.

## 9. Release

- [x] 9.1 Change nineteen to twenty in `scripts/preflight-release.mjs`,
      `scripts/publish-npm.mjs`, the release workflow and `RELEASING.md`. Add the release check's
      `mcp` step: `initialize`, `tools/list` and a PNG `preview` over Streamable HTTP through the
      installed `mcp --folder --port 0` on the purchase project. Verify that `pnpm release:check`
      is green and that its manifest lists `@meltemi/diagrams-mcp`.
- [x] 9.2 Name `@modelcontextprotocol/server`, `zod` and `@resvg/resvg-wasm` as dependencies of a
      public package in the licence inventory and `THIRD_PARTY_LICENSES.md`. Verify that
      `pnpm licenses:inventory --check` passes.

## 10. Agents and people told

- [x] 10.1 Add the local server to `skills/meltemi-diagrams/reference/mcp.md`: starting it,
      `--folder`, connecting Codex, Claude Code and Cursor to `http://127.0.0.1:7373/mcp`, the key
      for a shared machine, and when to choose it over the hosted URL. Run `pnpm skills:sync`.
      Verify that the skill tests pass, including the new check that the reference and
      `docs/agents.md` contain `npx -y @meltemi/diagrams-cli@latest mcp`,
      `http://127.0.0.1:7373/mcp` and `--folder`.
- [x] 10.2 Update these docs and their Spanish copies:
      - `docs/agents.md` ("Through the local server");
      - `docs/cli.md` (`mcp`, its options and its help);
      - `docs/cloud.md` (where each tool's work happens, and `renderer.unavailable`).

      Verify that the docs tests, the Spanish twins included, pass.
- [x] 10.3 On the owner's Windows machine, with the built command line running on 7373:
      - connect Codex to `http://127.0.0.1:7373/mcp` and run one preview through `codex exec` in an
        empty scratch folder (the URL given for the run with `-c mcp_servers.meltemi.url=…`, the
        form `codex mcp add --url` writes, so that the owner's configuration is not changed);
      - do the same with Claude Code (`claude -p` with `--mcp-config` of type `http`, the form
        `claude mcp add --transport http` writes).

      Verify that both answer a picture. Write the forms that worked in `docs/agents.md` and in
      the reference.
- [x] 10.4 Write decision note `docs/decisions/0073-local-mcp-server.md` (decisions 1 to 13 with
      their alternatives) and the changelog entries under the open section. Verify that the
      decisions index test passes.

## 11. Gates

- [x] 11.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm cloud:test-browser`,
      `pnpm playground:test-browser` and `openspec validate local-mcp-server --strict`. Verify
      that all are green, and record the results in `validation.md`.
