# Tasks

## 1. Shared timeline inspection

- [x] 1.1 Define the bounded inspection request/result schema and derive timeline data through `storyTimeline` and `sceneStills`; test sequential/parallel/transition timing, imported views, unknown targets and invalid source.
- [x] 1.2 Add renderer core/RPC inspection and hosted `inspect_story` with read scope/access checks; verify snapshot revision, no mutation and authorization/refusal behavior through MCP integration tests.
- [x] 1.3 Add local-account and folder inspection using the same engine, path safety and snapshot identity; verify catalogue parity and folder traversal rejection.

## 2. Story authoring guidance

- [x] 2.1 Add a complete safe-edit recipe, timing formula, imported-view example and multi-instant MCP inspection/preview workflow to the canonical skill; run `pnpm skills:sync` and skill consistency tests.
- [x] 2.2 Document inspection in English and Spanish agent/MCP guides with matching examples; verify bilingual documentation checks.

## 3. End-to-end acceptance

- [x] 3.1 Add a run-owned story lifecycle step covering create/edit/reorder, stale revision and preservation, timeline/boundary previews and scoped deletion with export dependencies; execute it through a local MCP integration fixture.
- [x] 3.2 Update suite registration, strict expected counts and acceptance documentation, and verify count/schema consistency tests without editing historical recorded results.

## 4. Integration

- [x] 4.1 Run relevant MCP, renderer, CLI, skill and acceptance tests plus workspace typecheck/lint/build; record actual results and outstanding host-only checks.
- [x] 4.2 Validate this OpenSpec change strictly and inspect the final diff for unintended permissions, configuration or source-format changes.

## Verification recorded

- Focused MCP/renderer/CLI/skill/documentation/acceptance run: 12 test files, 294 tests passed.
- Follow-up story/skill checks after snapshot/warning assertions: 13 tests passed.
- HTTP-door, workflow-count and Worker source-alias regression checks: 82 tests passed.
- Package typechecks for MCP, cloud, CLI and acceptance passed; focused ESLint and formatting passed.
- `pnpm skills:sync` updated repository skill copies and the generated assistance guide.
- `openspec validate agentic-story-authoring --strict` passed.
- Hosted staging/production acceptance was not run. The new 35-step delivery gate and the local Compose browser journey are implemented; passing the local Worker journey does not claim a hosted run.

## Workflow follow-up

- Sync approved deltas and archive through the OpenSpec CLI after implementation and required verification.
- Live hosted acceptance and release/deployment remain within `delivery`.

## Combined integration result

Completed against the combined implementation; results, retries and hosted-only limits are recorded in `docs/quality/2026-11-09-authoring-usability.md`. No commits or deployment were made.
