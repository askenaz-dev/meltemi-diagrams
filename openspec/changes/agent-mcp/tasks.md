# Tasks

## 1. The endpoint over the existing operations (milestone 1)

- [x] 1.1 Add `@modelcontextprotocol/server` 2.3.1 and `zod` 4.6.7 to `packages/cloud` (pinned)
      and `@modelcontextprotocol/client` 2.3.1 as its dev dependency, after the owner's approval
      (as built: no `agents` package, design decision 1; `@cloudflare/workers-oauth-provider` moves
      to task 2.1; the client of `packages/acceptance` to task 4.1). Verify `pnpm install
      --frozen-lockfile`, the licences in the lockfile and `pnpm typecheck`.
- [x] 1.2 Refactor `routes/projects.ts`, `routes/sharing.ts`, `routes/live.ts` and
      `routes/publish.ts` (and, for the version and file tools, `routes/versions.ts`,
      `routes/rooms.ts` and `routes/binaries.ts`) so each route reads the request and calls an operation taking a
      principal and typed input (`operations/*.ts`), with the existing route tests unchanged.
      Verify `pnpm --filter @meltemi/diagrams-cloud test` is green.
- [x] 1.3 Write `routes/mcp.ts` with `createMcpHandler`, the `initialize` instructions, the
      `Origin` check and the `mdg_` principal, and the project and file tools (`whoami`,
      `list_projects`, `create_project`, `get_project`, `rename_project`, `read_files`,
      `write_files` with the compilation check, `validate`, `upload_image`, `open_url`, and the
      version tools `list_versions`, `create_version` and `restore_version`, which no task named) with
      schemas, annotations and the error mapping; add `/mcp` to `run_worker_first`. Verify
      `test/mcp.test.ts` covers the initialize answer, the foreign origin, the bad version, the
      catalogue's names and annotations, the two-diagram scenario against the in-memory store,
      the push with an error, the conflict, the unknown project and the unknown tool.
- [x] 1.4 Add migration `0008_idempotency.sql`, the store's `idempotent(sub, key, hash, run)` in
      D1 and memory (as built: the store's `claimKey`, `keepAnswer`, `releaseKey` and `sweepKeys`, and
      `idempotent()` of `src/idempotency.ts` over them; the same migration holds the rate windows), the header on the two routes with the sweep, and the tools' `idempotencyKey`.
      Verify the cloud tests cover the replay, the mismatch, the bad key and the sweep, and the
      MCP test the retried `create_project`.
- [x] 1.5 Add the sharing, live and publishing tools with their scopes and the read-back of
      `publish`. Verify `test/mcp.test.ts` covers the read link, the invitation's `emailSent:
      false`, the viewer refused, the published-and-read-back scenario, the rate limit and the
      spying console (in `test/mcp-sharing.test.ts`, beside `test/mcp.test.ts`).

## 2. The authorization server (milestone 1)

- [ ] 2.1 Wrap the Worker in `OAuthProvider` as design decision 4 with `OAUTH_KV`, the metadata
      documents, the `401` challenge and the `global_fetch_strictly_public` flag; add
      `/oauth/*` and `/.well-known/*` to `run_worker_first`. Verify `test/oauth.test.ts` (an
      in-memory KV) covers discovery, the challenge, the wrong resource, the OAuth token refused
      on `/api/*` and the foreign JWT refused on `/mcp`.
- [ ] 2.2 Write the consent page (`pages/consent.ts`, the sign-in redirect, the scopes in
      words, `csrf`, Approve and Deny, both languages) and the registration rate limit. Verify the
      tests cover the whole flow with PKCE and DCR, the denial, the expired and revoked tokens,
      the insufficient scope, the editor with every scope and the flooded registration; and the
      cloud browser suite renders the page in both languages.
- [ ] 2.3 Add `GET` and `DELETE /api/account/apps`, the revocation on `user.deleted`, and the
      account panel's **Connected apps** section with its words. Verify the cloud tests cover
      the list, the revocation, the token refused and the deleted account, and the playground
      suite the section, the empty state and the Spanish words.
- [ ] 2.4 Write `docs/cloud.md`'s endpoint, authorization and Connected apps sections,
      `docs/security.md`'s token rule, and their Spanish twins. Verify the docs link test.

## 3. Previews (milestone 1)

- [x] 3.1 Add `@resvg/resvg-wasm` (after approval), the `ProjectRenderer` Durable Object with
      `elkjs`'s main-thread bundle, the in-memory project file system, the four bundled TTFs as
      data modules and the cache of twenty, with `RENDERERS` and its migration in
      `wrangler.jsonc`. Verify `test/renderer.test.ts` draws the acceptance corpus's flow,
      sequence, C4 and free files to SVG equal to the command line's `--fonts system` output
      and to PNGs of the asked width, and the cache answers byte-equal.
- [x] 3.2 Add the `preview` tool with the report, the fallback fonts, the width and rate
      limits. Verify `test/mcp.test.ts` covers the SVG equality, the PNG and report, the story
      frame, the file with an error, the Fontsource family, the width refused and the rate (in
      `test/mcp-preview.test.ts`).
- [x] 3.3 Measure on `wrangler dev` the renderer's cold start and the CPU of the corpus's largest
      diagram, and record them in `docs/performance.md`. Verify the numbers are in the page and
      under the limits the design names, or the Browser Run fallback is taken and the design
      note updated.

## 4. The suite, staging and the gate (milestones 2 and 3)

- [x] 4.1 Write `packages/acceptance/src/mcp/run.ts` and `pnpm acceptance:mcp` with the steps
      of criteria 2 to 6, 10 to 23 and 24 to 29, `results.json`, the cleanup and the secret scan.
      Verify a run against `wrangler dev` with two test tokens is green and leaves no project.
      (As built: `MELTEMI_ORIGIN` or `MELTEMI_MCP_URL`; `@modelcontextprotocol/client` 2.3.1 pinned
      in `packages/acceptance`; 34 named steps in `src/mcp/steps.ts` over `harness.ts`, `host.ts`
      and `agent.ts`; `--probe` for the workflow; `log.txt` beside `results.json`; criteria 27 and
      28 in part, the rest of them skipped with their reason, since no script approves a consent.)
- [x] 4.2 Add `staging` to `deploy.yml` (the config from the `staging` environment's variables,
      migrations, the two Workers, the suite with the environment's tokens) before production,
      and the production run after, with the artifacts; extend the workflow tests. Verify the
      tests cover the order, the secrets read as secrets only and the failure handling; the
      `meltemi-web` change `diagrams-staging` is applied first. (As built:
      `scripts/deploy-config.mjs --environment staging` writes the same file names in the staging
      job's own checkout, not `wrangler.staging.deploy.json`; a staging host that does not answer
      skips the suite with a notice; the reversal after a red production run is a revert or a
      Cloudflare rollback, since a dispatch only takes a source that is still `main`.)
- [x] 4.3 Write `docs/quality/mcp-acceptance.md` (the procedure for criteria 1, 7, 8, 9 and 16's
      voice half, the Codex configuration, the evidence folder) and the docs test that refuses
      an unrecorded claim. Verify the docs tests.
- [ ] 4.4 Owner's steps, ticked when done: create the two test accounts and their `mdg_` tokens
      on staging and production, store them in the `staging` and `production` environments as
      `MELTEMI_TOKEN` and `MELTEMI_TOKEN_2`, run the procedure with the real Codex and record it.
      Verify the first staging run of the workflow is green and the page has a recorded run.

## 5. Agents told, record and gates

- [x] 5.1 Write `skills/meltemi-diagrams/references/mcp.md`, name it in `SKILL.md`, update
      `docs/agents.md` and its Spanish twin, run `pnpm skills:sync`, and add the skill test that
      compares the reference's tools with the catalogue. Verify the skill tests and the size rule.
      (As built: `reference/mcp.md`, the skill's folder being `reference/`; the test is
      `packages/acceptance/test/mcp-skill.test.ts`, against `CATALOGUE` of `mcp/server.ts`.)
- [x] 5.2 Add the entry to the changelog's open section and write
      `docs/decisions/0072-agent-mcp.md`. Verify the decision links resolve.
- [ ] 5.3 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, the cloud and playground browser suites
      and `openspec validate "agent-mcp" --strict`. Verify all green and record the results in
      the change's `validation.md`.

## Workflow follow-up

- Apply `meltemi-web`'s `diagrams-staging` before task 4.2; the first production deploy applies
  migration 0008 and uploads the renderer's Durable Object migration.
- Archive the change after review; the archive syncs the eight deltas.
