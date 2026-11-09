# Tasks

## 1. Shared starter vertical slice

- [x] 1.1 Define the seven starter identities and descriptor order, with registry tests proving all entries and no duplicates.
- [x] 1.2 Implement atomic starter planning for the four existing empty profiles and C4 model plus context; verify compile/layout, id collisions, invalid starter/source, line endings, comment preservation and exact inverse with focused edit tests.
- [x] 1.3 Add the whiteboard and Kanban generators with generic English/Spanish content; verify zero diagnostics, list structure, board preset, bundled theme and no imports/assets in generator tests.

## 2. Explorer creation

- [x] 2.1 Replace the four-kind dialog with the seven-entry responsive catalogue and localized descriptions; verify keyboard, focus, cancel and narrow-screen behavior in focused explorer/browser tests.
- [x] 2.2 Use the shared source planner for one-file creation in the selected folder; verify every choice, path/name refusal, concurrent file collision, unchanged existing files/manifest and read-only mode.
- [x] 2.3 Clarify initial-template wording and document creation from any project in `docs/editor.md` and `docs/es/editor.md`; verify the template matrix has the same catalogue and run the documentation checks.

## 3. Shared canvas creation

- [x] 3.1 Share the starter catalogue and validated creation action through the editor protocol/session; verify unknown ids, stale revisions, permission changes and pending-view selection in protocol/session tests.
- [x] 3.2 Wire the same choices to the toolbar menu and empty-file state in browser and VS Code; verify all seven choices through the shared webview, including C4 model/view creation and exact undo of appending to existing source.
- [x] 3.3 Verify creation while another diagram or story is active, repeated C4 starters, read-only views and language changes; document the shared-canvas behavior in the editor guide pair alongside these regressions.

## 4. Integration verification

- [x] 4.1 Run `pnpm typecheck`, `pnpm lint` and `pnpm test`; record results and preserve unrelated working changes.
- [x] 4.2 Run `pnpm vscode:test-webview`, `pnpm vscode:test`, `pnpm vscode:package` and `pnpm playground:test-browser`; inspect light/dark English/Spanish creation UI and a narrow viewport, recording actual outcomes.
- [x] 4.3 Run `openspec validate unified-diagram-creation --strict` and review the diff to ensure no project configuration, permission or existing content was changed by creation.

## Workflow follow-up

- Review the proposal before application, as requested by the owner.
- After implementation and its required checks, sync and archive with the OpenSpec CLI.
- Release, deployment and production verification use the separate delivery workflow.

## Combined integration result

Completed against the combined implementation; results, retries and hosted-only limits are recorded in `docs/quality/2026-11-09-authoring-usability.md`. No commits or deployment were made.
