## 1. The shared package and the engine

- [ ] 1.1 Create `packages/mcp` as `@meltemi/diagrams-mcp`: MIT, public, a `README.md` naming the
      package, its install and a minimal use, and the exports `.` and `./preview` with the
      `@meltemi/diagrams-source` condition. Its dependencies are `@modelcontextprotocol/server`
      2.3.1, `zod` and `@resvg/resvg-wasm` 2.6.2, pinned as `packages/cloud` pins them. Verify that
      the names test and the publishable-manifest checks pass with the new package.
- [ ] 1.2 Move `renderer-engine.ts`, `renderer-raster.ts`, `renderer-fonts.ts` and
      `renderer-files.ts` from `packages/cloud/src/` to `packages/mcp/src/preview/`, together with
      the PNG bounds of `renderer-protocol.ts`. `renderer-core.ts`, `renderer-runtime.ts` and the
      bundle script import them from `@meltemi/diagrams-mcp/preview`. Verify that
      `pnpm cloud:test` is green and that `wrangler deploy --dry-run` reports the upload size
      within 1% of before.
- [ ] 1.3 Write `packages/cli/src/mcp-engine.ts` (`LocalEngine`, design decision 4). It reads
      resvg's `index_bg.wasm`, the measured fonts and the raster faces from their packages in
      Node, and serialises drawing calls in one queue. Verify with tests:
      - the SVG of the `flow` fixture equals `mdg export --fonts system`'s;
      - the PNG of `flow/thirty` at 1280 is byte-equal to `RendererCore`'s for the same request;
      - a `validate` call loads no rasteriser.

## 2. The folder server, the first vertical slice

- [ ] 2.1 Move the wrapper of `packages/cloud/src/mcp/tool.ts` and the shapes of `mcp/shapes.ts`
      into `packages/mcp/src/` as `serve(server, catalogue, handlers, hooks)`, `errorResult` and
      the argument shapes (design decision 2). Write `FOLDER_CATALOGUE` with `validate` and
      `preview`. Verify with unit tests:
      - a schema refusal answers `request.invalid` naming the field;
      - an unexpected throw answers `internal`;
      - the log line holds the name, the milliseconds and the code only.
- [ ] 2.2 Write `packages/cli/src/mcp-command.ts`: `mdg mcp [--folder <dir>] [--host <url>]` on
      `StdioServerTransport`, listed in `--help` with its English and Spanish lines, an unknown
      option exiting 2 with the usage, and a missing `<dir>` exiting 2 before any message. Verify
      with a test that drives the built command with `StdioClientTransport`:
      - `initialize` names `meltemi-diagrams` and the version;
      - `tools/list` answers two tools;
      - a PNG `preview` of the purchase template arrives with its report;
      - every stdout line is JSON-RPC.
- [ ] 2.3 Write `packages/cli/src/mcp-folder.ts` (design decision 6). Verify with tests:
      - `path: "../secret.meltemi"` answers `path.invalid` and reads nothing;
      - a file edited between two previews is drawn edited;
      - `validate` reports what `mdg validate` reports for the same folder;
      - a recording `fetch` sees no call.

## 3. One catalogue for both servers

- [ ] 3.1 Move the twenty-seven definitions of `tools-projects.ts`, `tools-preview.ts`,
      `tools-sharing.ts` and `tools-live.ts`, without `run`, into `packages/mcp/src/catalogue.ts`
      (`CATALOGUE`), along with the app address function `open_url` uses. Move today's `run` bodies
      into `packages/cloud/src/mcp/handlers.ts`, keyed by name. `server.ts` calls
      `serve(server, CATALOGUE, handlers, { beforeCall })`, with the per-account counting and the
      scope check. Verify that `pnpm cloud:test` and the cloud browser suite's MCP scenarios are
      green with no test changed.
- [ ] 3.2 Write the catalogue test (`mcp-server` "Both servers list the same tools"). It builds the
      Worker's server and `mdg mcp`'s cloud server from the same commit and compares their
      `tools/list` deeply. Verify that it passes, and that it fails naming the tool when one
      description is changed on one side only.

## 4. The cloud backend of the command line

- [ ] 4.1 Add to `CloudClient` the routes the tools need: `renameProject`, `createVersion`,
      `restoreVersion`, `sharing`, `setLinkAccess`, `invite`, `invitations`, `revokeInvitation`,
      `setMemberRole`, `removeMember`, `live`, `startLive`, `endLive`, `unpublish`, and the
      `Idempotency-Key` header on `createProject` and `pushFiles`. Verify each method against
      the stub server's route, including that a `302` is `cloud.redirect` and the token reaches
      no other origin.
- [ ] 4.2 Write `cloudHandlers` in `packages/cli/src/mcp-cloud.ts` for `whoami`, `list_projects`,
      `create_project`, `get_project`, `rename_project`, `read_files` and `open_url`, reading the
      token at each call (design decision 7). Verify with stub-service tests:
      - with no token, `auth.required` names `mdg login`;
      - a `401` answers `token.invalid`, and the token is in no output;
      - `create_project` retried with its key creates one project.
- [ ] 4.3 Write `write_files` from the machine (design decision 5). Verify the three scenarios of
      `mcp-local-server` "Writing from the machine": an error is refused whole with no push
      request; a retry after success answers the same revision; a conflict answers
      `revision.mismatch` with the current revision.
- [ ] 4.4 Write `validate`, `preview` (blobs by hash in the 64 MiB LRU, `estimatedFonts`, the width
      bounds and four megapixels) and `upload_image`. Verify with tests:
      - an image used twice is fetched once;
      - `width: 4096` is `request.invalid`;
      - a file with an error is `diagram.invalid` with diagnostics and no picture.
- [ ] 4.5 Write the version, sharing and live handlers: `list_versions`, `create_version`,
      `restore_version`, the seven sharing tools, `get_live`, `start_live` and `end_live`. Each
      answers the hosted tool's output schema, and `invite` answers `emailSent: false`. Verify
      each against the stub service, with its output parsed by the definition's schema.
- [ ] 4.6 Write `publish` (the catalog built as `mdg publish` builds it), `list_publications` and
      `unpublish`. Verify with tests:
      - the HTML sent equals `mdg publish`'s for the same revision and language;
      - a project with no diagram is refused with the hosted tool's code, and no publish
        request is made.
- [ ] 4.7 Verify the transport and log rules with tests:
      - `--host http://example.com` exits 2 with `cloud.insecure-host` and no request;
      - one stderr line per call, without arguments, tokens or links;
      - two concurrent previews are drawn one after the other;
      - a client that creates, writes, previews and shares through the stub service made
        requests under `/api/` only.

## 5. The endpoint's refusal

- [ ] 5.1 Add `renderer.unavailable` (503, message naming `mdg mcp`) to
      `packages/cloud/src/errors.ts`. Map a throw from a renderer stub call to it in `preview`,
      `validate`, `write_files` and `publish` (design decision 9). Verify with tests over a
      throwing stub:
      - `preview` answers the code;
      - `write_files` leaves the room's revision unchanged and keeps no answer for the key;
      - an unrelated throw stays `internal`.

## 6. Acceptance through the local server

- [ ] 6.1 Add `packages/acceptance/src/mcp/transport.ts` (HTTP or stdio) and `--local` to
      `pnpm acceptance:mcp` (design decision 10). It runs two `mdg mcp` processes with one token
      each, `MELTEMI_HOST` from `MELTEMI_MCP_URL` and an empty configuration folder. The OAuth
      steps are skipped with their reasons. Verify that the suite's unit tests pass, and that
      `--local` with no built command line exits 1 naming it.
- [ ] 6.2 Run `pnpm acceptance:mcp --local` against `pnpm cloud:dev` with two local test accounts.
      Verify that every non-OAuth step passes and that the Worker's log shows no request to
      `/mcp`. Record the run in this change's `validation.md`.
- [ ] 6.3 Owner, after the test tokens of `agent-mcp` task 4.4 exist: run
      `pnpm acceptance:mcp --local` against `https://staging.diagrams.meltemi.dev/mcp`, and record
      the outcome in `docs/quality/mcp-acceptance.md`.

## 7. Speed

- [ ] 7.1 Add `pnpm cli:bench-mcp`. It previews `flow/thirty` at 1280 fifteen times in one
      `mdg mcp --folder` process after a first preview, and times a cold process's first preview.
      It exits 1 when a target of `mcp-local-server` "Speed of local previews" is missed. Verify
      that it passes on the reference machine, and record the table in `docs/performance.md` and
      `docs/es/performance.md`.

## 8. Release

- [ ] 8.1 Change nineteen to twenty in `scripts/preflight-release.mjs`,
      `scripts/publish-npm.mjs` and `RELEASING.md`. Add the release check's `mcp` step:
      `initialize`, `tools/list` and a PNG `preview` through the installed `mcp --folder` on the
      purchase project. Verify that `pnpm release:check` is green and that its manifest lists
      `@meltemi/diagrams-mcp`.
- [ ] 8.2 Name `@modelcontextprotocol/server`, `zod` and `@resvg/resvg-wasm` as dependencies of a
      public package in the licence inventory and `THIRD_PARTY_LICENSES.md`. Verify that
      `pnpm licenses:inventory --check` passes.

## 9. Agents and people told

- [ ] 9.1 Add the local server to `skills/meltemi-diagrams/reference/mcp.md`: the four ways to
      start it, `--folder`, and when to choose it over the URL. Run `pnpm skills:sync`. Verify
      that the skill tests pass, including the new check that the reference and
      `docs/agents.md` contain `npx -y @meltemi/diagrams-cli@latest mcp` and `--folder`.
- [ ] 9.2 Update these docs and their Spanish copies:
      - `docs/agents.md` ("Through the local server");
      - `docs/cli.md` (`mcp`, its options and its help);
      - `docs/cloud.md` (where each tool's work happens, and `renderer.unavailable`).

      Verify that the docs tests, the Spanish twins included, pass.
- [ ] 9.3 On the owner's Windows machine, with the built command line:
      - connect Codex with `codex mcp add` (with and without `cmd /c`) and run one preview
        through `codex exec` in an empty scratch folder;
      - do the same with Claude Code (`claude mcp add` and `claude -p`).

      Verify that both answer a picture. Write the forms that worked in `docs/agents.md` and in
      the reference.
- [ ] 9.4 Write decision note `docs/decisions/0073-local-mcp-server.md` (decisions 1 to 11 with
      their alternatives) and the changelog entries under the open section. Verify that the
      decisions index test passes.

## 10. Gates

- [ ] 10.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm cloud:test-browser`,
      `pnpm playground:test-browser` and `openspec validate local-mcp-server --strict`. Verify
      that all are green, and record the results in `validation.md`.
