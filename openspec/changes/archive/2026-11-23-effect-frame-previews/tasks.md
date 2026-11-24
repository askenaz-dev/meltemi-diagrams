# Tasks

## 1. Skill: effects or a story

- [x] 1.1 Add the rule to the workflow of `SKILL.md` and a short section with the two phrasings, an example of each and how each is checked; keep the size rule.
- [x] 1.2 State the rule in `reference/language.md` (Animate), `reference/stories.md` (its opening) and `reference/mcp.md`; run `pnpm skills:sync`.
- [x] 1.3 Extend the skills tests: the phrases of the rule in `SKILL.md` and the three references, and the two examples compile.

## 2. The state of a plan at an instant

- [x] 2.1 Add `motionStateAt` and its types to `packages/motion`, sharing the particle and trace arithmetic with `sceneAt`; test particles, reversed and several, a trace's head, the window and an empty plan, and that marks equal the circles a frame draws.
- [x] 2.2 Have `produceExport` answer `motion` beside the text of a diagram's frame; test it and that still and animated exports are unchanged.

## 3. Effect frames in `preview`

- [x] 3.1 Carry `motion` through the preview engine and core into `RenderReport`, scaled for a PNG and bounded at fifty effects; add the shape number to the cache key; test the core.
- [x] 3.2 Add `motion` to the report's schema, describe `at` and the tool in the account and folder catalogues and in the instructions, and answer the report through one helper in the Worker and the local server.
- [x] 3.3 Test folder mode with the real `mdg mcp --folder`: a diagram with `animate` and no story, the still picture, two instants, a PNG, an effect outside its window and a diagram without effects.

## 4. Acceptance

- [x] 4.1 Add the shared `effectFramesJourney` and run it against the Worker's test host.
- [x] 4.2 Register the hosted step, raise the strict count to 36 and update the tests that name it, without editing recorded results.

## 5. Guides

- [x] 5.1 Describe effect frames and `motion` in `docs/agents.md`, `docs/cloud.md` and their Spanish pairs; add the changelog entry.

## 6. Integration

- [x] 6.1 Run `pnpm typecheck`, `pnpm lint` and `pnpm test`, and the focused MCP, skill, motion and acceptance tests; record the results.
- [x] 6.2 Validate this change strictly and read the final diff for unintended changes of pictures, permissions or configuration.

## Notes on what was built

- 3.2: the account server's `initialize` instructions keep their three sentences (`mcp.test.ts` and
  `mcp-server` hold them to three); the rule is in the description of `preview` and of `at`, which
  every client lists, and in the folder server's first sentence.
- 3.3: an effect outside its window is tested against the Worker's host (`mcp-preview.test.ts`),
  with every kind of effect, a PNG's pixels, the cache and the bound of fifty; folder mode tests
  the acceptance criterion, a diagram without effects, a story frame and the tool's description.
- The local Compose browser run (`packages/cloud/test/browser/run-local.ts`) was left as it is: it
  shares one project with later assertions, and the journey runs against the Worker's host instead.

## Verification recorded (2026-11-23, Windows, Node 22)

- `pnpm typecheck`: all 25 workspace projects pass.
- `pnpm lint`: ESLint and Prettier pass.
- `pnpm test`: 402 files; 11,671 passed, 1 skipped, 4 failed. The four are the archive tests of
  `packages/acceptance/test/local-operations.test.ts`, which need Windows' `tar` and fail under
  Git Bash's (`tar (child): Cannot connect to C:`); the file passes 8/8 run from PowerShell. They
  do not touch this change.
- Focused run after formatting and `pnpm skills:sync`: 22 files, 416 tests passed (skills, MCP
  reference, Worker previews, folder MCP, local account MCP, renderer, motion, editor exports,
  acceptance suite/runner/workflows, assistance guide).
- The real `mdg mcp --folder` as its own process, driven by the SDK's client over Streamable HTTP:
  a PKCE flow diagram with five animated arrows and no story; the still preview reports no
  `motion`; frames at `300ms` and `900ms` report all five effects at one revision with `along`
  0.25 and 0.75. Evidence outside the repository, in
  `C:/meltemi/artifacts/diagrams-effect-frame-previews/` (`report.json`, three PNGs, the script).
- `openspec validate effect-frame-previews --strict` passes.
- Hosted staging and production were not run: the 36-step gate is implemented, not exercised.

## Integration recorded (2026-11-23)

- PR #36 at `8689ab6`, CI run `45288156232`: 7/7 checks green. Node 22 on windows-latest failed
  the first attempt with `spawnSync powershell.exe ETIMEDOUT` (its 15 s limit) in
  `packages/acceptance/test/oauth-fixtures-private-file.test.ts`, which this change does not touch
  and which passes 3/3 locally; that job alone was re-run on the same commit, with no change of
  code or deadline, and passed (attempt 2, 12 min 23 s). Node 24 on windows-latest passed the
  first time.
- Squash-merged as `3998e2d` at 23:59:26Z with `--match-head-commit`; its tree (`dab4d0a`) equals
  the tested commit's, on base `56b2823`.
- Archived through the OpenSpec CLI after the merge, syncing the deltas into the four specs. At
  archive time the modified requirement "A preview of the current revision" was shortened from 663
  to 489 characters, its detail moved to the scenario "Every host", so strict validation of
  `mcp-previews` stays clean; the other strict warnings of `openspec validate --all` predate it.
- Live hosted acceptance (the 36-step gate) and the release/deployment checks remain within
  `delivery`.
