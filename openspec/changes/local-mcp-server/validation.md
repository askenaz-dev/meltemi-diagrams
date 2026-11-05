# Validation

Recorded on 2026-11-05 on the owner's Windows machine (Intel Core i9-11980HK, Node 24.15), in the
worktree `local-mcp-server`.

## The local server against the Worker on this computer (task 7.2)

`packages/cloud/test/browser/mcp-local-run.ts` started the Worker as the browser suite does
(`wrangler dev` on a free port, its migrations, the test keys), signed two people in with the
suite's sessions, made an API token for each, and ran `pnpm acceptance:mcp --local`: two built
`mdg mcp --port 0` processes, each with one token in its own environment, the agents of the suite
connected to `http://127.0.0.1:<port>/mcp` with no bearer.

- **27 passed, 0 failed, 7 skipped.** The seven are the endpoint's own door and OAuth server
  (discovery, the challenge, a foreign token, a wrong resource, invented grants, an expired or
  narrower token, refresh rotation), each with the reason `--local: the run goes through mdg mcp…`.
- The server answered `meltemi-diagrams` 1.11.0, the negotiated protocol `2025-11-25`, the client
  `@modelcontextprotocol/client` 2.3.1.
- **Requests to `/mcp` in the Worker's log: 0.**
- Criterion 29: the local servers' 134 log lines and the Worker's own 246 hold no token, access link
  or code. The platform's request lines carry an invitation's token in two addresses, the known
  finding of decision 0072 (`POST /api/invitations/<token>/accept`), not a line either server
  printed.

## Agents on this machine (task 10.3)

`node packages/cli/dist/bin.js mcp --folder <scratch>` listened on `http://127.0.0.1:7373/mcp`,
over a scratch folder holding the corpus's `flow/parallel.meltemi` as `flow.meltemi`. Each agent
was given the server for one run only, so the owner's configuration was not changed:

- **Codex** 0.156.1 (`codex exec -m gpt-6-sol -c 'mcp_servers.meltemi.url="http://127.0.0.1:7373/mcp"'`,
  the table `codex mcp add --url` writes): it called `meltemi/preview` and answered
  "1280 × 762 pixels; 3 elements; image received: yes."
- **Claude Code** 2.1.312 (`claude -p --strict-mcp-config --mcp-config` with
  `{"type": "http", "url": "http://127.0.0.1:7373/mcp"}`, what `claude mcp add --transport http`
  writes): it answered width 1280, height 762, 3 elements, and described the picture (Order API,
  Orders DB and Cache with six labelled relations).

The server's log held two lines, `mcp: preview 432 ms ok` and `mcp: preview 4 ms ok` (the second
answered from the core's cache). The configured Codex model of the machine, `gpt-6.1-sol`, is not
offered to a ChatGPT account; the run named `gpt-6-sol`.

## Speed (task 8.1)

`pnpm cli:bench-mcp` over the built command line: a process's first PNG 1280 of `flow/thirty`
603.5 ms median, 642.3 ms at most (target 3000); a warm one 67.1 ms median, 112.0 ms p95 (target
1000). Recorded in `docs/performance.md` and `docs/es/performance.md`.

## The Worker's bundle (task 1.2)

`wrangler deploy --dry-run` of `packages/cloud`: 24276.14 KiB (gzip 7795.04) on `origin/main`
(`f346f6f`), 24287.51 KiB (gzip 7797.00) with this change: 11.37 KiB more, 0.05%.

## Equal pictures (task 1.3)

`packages/cloud/test/renderer-node.test.ts`: the package's Node engine and the Worker's core over
its bundled files answer byte-equal PNGs for `flow/thirty` at 1280, `sequence/thirty` at 2048
(fitted) and `c4/cycles` at 800, a byte-equal SVG for `flow/thirty`, and equal reports. A check
loads no rasteriser.

## Tests changed in the Worker's package

Task 3.1 asked for the cloud tests to pass with none changed. Four were changed, each for a reason
of this change:

- `config.test.ts` scans the Worker's own sources for subpath imports too, so that the alias of
  `@meltemi/diagrams-mcp/preview` is required, as the other subpaths' are.
- `audit.test.ts` and `tokens.test.ts` expect the token's session to carry `email`.
- `renderer.test.ts`, `support/renderer.ts`, `support/mcp.ts` and `performance/renderer-worker.ts`
  import the moved modules from `@meltemi/diagrams-mcp/preview`.

## Gates (task 11.1)

- `pnpm typecheck`: green.
- `pnpm lint` (ESLint and Prettier): green.
- `pnpm test`: 10473 passed, 1 skipped (the suite's one skip before this change), 0 failed, in 1885
  suites.
- `openspec validate local-mcp-server --strict`: valid.
- `pnpm licenses:inventory --check`: current (45 packages); the notes of
  `@modelcontextprotocol/server`, `@modelcontextprotocol/core` and `@resvg/resvg-wasm` name the
  public package.
- `pnpm release:check` (task 9.1): green. Twenty tarballs, `@meltemi/diagrams-mcp` among them
  (75 files, 56 KB); the CLI installed from them ran the main journey, and its `mcp --folder`
  answered `initialize` (`meltemi-diagrams` 1.11.0), `tools/list` (`validate`, `preview`) and a PNG
  preview of the purchase project (1280 × 977, 73002 bytes). `release/manifest.json` lists 21
  files. A first run failed after the `mcp` step had passed: the server's process still held the
  scratch folder when it was removed (Windows `EPERM`); the step now waits for the process to end.
- `pnpm playground:test-browser`: 118 passed, 0 failed. A first run, while other suites ran, failed
  two explorer scenarios on timing (`hides to a rail` is the one known to be flaky under load on
  Windows); this change touches no file of the playground.
- `pnpm cloud:test-browser`: the first run failed one scenario, the token's session compared
  without its new `email` (fixed in `test/browser/run.ts`). The second failed another, `mdg publish`,
  whose child process ended with `3221226505` (`0xC0000409`, a native fast-fail of Node on Windows)
  and printed nothing; it had passed in the first run. Two runs after it were cut short from outside
  (exit 127, every scenario they reached green). The last full run: **105 passed, 0 failed**, both
  scenarios included.
