# Tasks

## 1. Consistent story navigation

- [x] 1.1 Make session state emit explicit empty playback when stories are absent or the active story disappears; add `packages/editor/test/stories.test.ts` regressions for a destination without stories, deletion of the last story and preservation of a present invalid story's stale frame.
- [x] 1.2 Apply explicit edit/story navigation intent in the explorer and host boundary; add a playground browser regression matching the supplied screenshot, plus same-id/equal-revision files, and verify tree, picker, canvas and timeline agree without an intermediate selection.
- [x] 1.3 Document navigation out of story mode in the English/Spanish story guides and verify the paired guides and source-refresh tests preserve valid playback and normal history.

## 2. Reversible story deletion

- [x] 2.1 Add `removeStory` and dependent-export metadata in `packages/edit`, with rejection/cascade and exact inverse corpus/unit cases; verify no diagram, unrelated story, formatting or unrelated comment changes.
- [x] 2.2 Expose story deletion from explorer context menu/Delete and the shared timeline with scoped confirmation; verify cancel, dependent profiles, read-only and stale-revision behavior in shared webview and playground browser tests.
- [x] 2.3 Connect deletion to playback cleanup and shared undo/redo, document it in both story guides, and verify deleting or remotely removing the active/last story leaves no ghost playback and undo restores the exact source.

## 3. Explicit scene and action timing

- [x] 3.1 Implement `setSceneDuration` through final-hold edits without rescaling content; add edit/corpus cases for transition time, sequential actions, parallel maxima, existing/no final hold, zero pause, invalid values, the 2 s content/1 s pause example and exact inverse restoration.
- [x] 3.2 Add typed canvas actions and revision/permission handling for scene duration; verify minimum-duration, stale revision and read-only rejection leave source unchanged and explain the correction.
- [x] 3.3 Add English/Spanish numeric duration controls for the selected scene, action and transition, retaining drag handles; verify Enter/blur commit once, Escape and pointer cancel write nothing, invalid drafts remain editable, parallel groups remain derived and cut transitions stay zero.
- [x] 3.4 Document final-pause semantics and action/transition timing in paired guides and verify timeline totals, later-scene starts, undo/redo and exported frame timing agree after edits.

## 4. Integration checks

- [x] 4.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`; resolve failures and record the exact passing commands and scope.
- [x] 4.2 Run `pnpm vscode:test-webview`, `pnpm vscode:test`, `pnpm vscode:package` and `pnpm playground:test-browser`; inspect the navigation/deletion/timing regressions and record browser/package evidence.

## Workflow follow-up

- Review this proposal before implementing product code.
- Synchronize these story-specific deltas alongside the independent creation-catalogue and connector-selection changes without replacing their requirements, then archive with the OpenSpec CLI after the required review and verification.

## Focused verification

- `pnpm.cmd exec vitest run packages/editor/test/session.test.ts packages/editor/test/stories.test.ts packages/edit/test/stories.test.ts packages/edit/test/fixtures.test.ts packages/canvas/test/view-only.test.ts`: 199 passed.
- `pnpm.cmd exec vitest run packages/editor/test/story-exports.test.ts packages/playground/test/view-studio.test.ts packages/playground/test/studio-changes.test.ts`: 54 passed.
- `MDG_WEBVIEW_ONLY='story lifecycle' pnpm.cmd vscode:test-webview`: 5 passed, including stale dependent-export confirmation and playback received after an empty document.
- `PLAYGROUND_TEST_FILTER='story lifecycle' pnpm.cmd playground:test-browser`: 2 passed, covering the screenshot navigation, cached equal-id sessions, a note opened during playback, deletion, cancellation, stale confirmation and exact undo/redo.
- Targeted ESLint and Prettier checks passed. Combined integration checks passed; see the verification report below.

## Combined integration result

Completed against the combined implementation; results, retries and hosted-only limits are recorded in `docs/quality/2026-11-09-authoring-usability.md`. No commits or deployment were made.
