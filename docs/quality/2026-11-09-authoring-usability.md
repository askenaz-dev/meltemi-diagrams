# Authoring usability verification — 9 November 2026

Implemented on `codex/authoring-usability-proposals`, based on `origin/main` at `819e669`.
The existing checkout's agent-setup work and workshop diagrams remain separate.

## Delivered behavior

- One ordered creation catalogue in the explorer, canvas menu and empty-file state: flow,
  sequence, C4, Gantt, whiteboard, Kanban and free composition. The eight initial project
  templates offer the same choices. C4 creates its model and context view together; the boards
  are prepared free compositions. Creation preserves existing files and manifest bytes.
- Opening another diagram, notes or invalid source leaves story playback directly. Late frames
  are checked against document identity and revision, including destinations without a render.
  Story deletion is reversible and confirms dependent exports; both confirmation stages reject
  intervening edits. Numeric scene totals adjust the final hold without rescaling actions.
- Connector bodies have continuous canvas-only hit targets with six screen pixels of reach,
  including animated dashed strokes. Rectangle selection distinguishes containment and crossing,
  respects hidden layers and protected title gaps, and preserves the Gantt task primary selection
  for keyboard traversal. The targets do not enter exports.
- The canonical agent skill teaches safe story authoring and boundary previews. MCP
  `inspect_story` reports the compiled timeline, nested action intervals, transitions, active
  views, still instants and snapshot revision in hosted, local-account and folder modes.
  Folder previews expose the same content-derived revision. The hosted catalogue has 28 tools;
  the complete hosted acceptance gate now requires 35 steps.

## Verification

The final complete shared-webview run passed **345 of 345** scenarios. The initial run's
three failures led to excluding canvas hit targets from a visual measurement helper, updating
the presence test for crossing selection, and preserving the task as the primary Gantt selection.
The final run verifies those cases without weakening geometry tolerances or skipping tests.

| Check                                           | Recorded result                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                | Passed across the workspace                                                                         |
| `pnpm lint`                                     | Passed; final changed TypeScript files also checked separately                                      |
| `pnpm test`                                     | 393 files passed; 11,470 tests passed and one existing test skipped                                 |
| `pnpm build`                                    | Passed; final canvas delta rebuilt separately                                                       |
| `pnpm vscode:test`                              | 26 passed                                                                                           |
| `pnpm vscode:package`                           | 416-file VSIX created and checked                                                                   |
| `pnpm playground:test-browser`                  | 145 passed on the complete 146-case run; the remaining case passed in the six-case catalogue repeat |
| `pnpm acceptance:visual`                        | 41 passed; zero differing pixels, without updating references                                       |
| `CLOUD_TEST_FILTER=mcp pnpm cloud:test-browser` | Three passed against the real local Worker, including renderer RPC inspection and boundary previews |
| `pnpm licenses:inventory --check`               | Current, 47 packages                                                                                |

The initial full playground run overlapped an asset rebuild, causing transient font/resource
404s in the flow-project catalogue case. With builds completed before browser execution, the
entire six-case catalogue group passed, covering all seven starters in flow and C4 projects,
all eight template catalogues, keyboard/cancel/focus, narrow English/Spanish light/dark views,
invalid paths, a concurrent file collision and lost write permission. No errors were suppressed.

The MCP lifecycle journey also passes through the SDK against an in-memory Worker fixture:
creation, timing edits, parallel/transition totals, stale-write refusal, human comment preservation,
scene reordering, frame boundaries and deletion with dependent export profiles. All data is generic.

Creation screenshots were inspected at wide and 390 px viewports. Local evidence is retained under
`C:/meltemi/artifacts/diagrams-authoring-usability/review/`; connector screenshots are under
`C:/meltemi/artifacts/diagrams-authoring-proposals/connector-selection/`.

## Limits and delivery

Release preparation found and fixed a further data-loss case: a story with a missing closing
brace could be removed through a parser recovery range that included a later diagram. Removal now
refuses parser errors before building edits. LF/CRLF and both cascade modes preserve the source
exactly; syntactically valid source with semantic errors remains repairable. The follow-up's
166 focused edit/corpus/message tests, edit typecheck and lint passed, and it has its own OpenSpec
change, `safe-story-removal`.

All four change proposals passed strict validation and were synchronized/archived through the
OpenSpec CLI with complete task lists. An additional repository-wide strict spec check returns
21 passed / 112 failed solely because strict mode treats 437 long-requirement warnings as failures;
there are zero errors. Validation of an isolated `HEAD` baseline returns the identical totals
and warning findings, so this change adds no strict-spec finding. The archive-wide audit also
identifies four older incomplete task lists dated 10 October, 4 November and 5 November; none
belongs to these four completed changes. Those historical records were preserved.

Hosted staging/production acceptance and the Docker Compose acceptance run were not executed.
The 35-step hosted gate and Compose story journey are implemented, not claims of a hosted run.
No real cloud project, account permissions, credentials or infrastructure resources were changed.
At the implementation-verification checkpoint, nothing had been committed, pushed, merged,
released or deployed. Delivery verification is a separate subsequent step.
