# Design

## Context

See `proposal.md` for the user-facing problems. The supplied screenshot shows the central-entry file selected in the explorer while the canvas picker and timeline still show a story from the other file. This is user-provided UI evidence, not a fresh browser reproduction.

Source inspection establishes the following paths:

- `packages/playground/src/explorer/explorer.ts`, `Explorer.activate`, sends `pickStory: null` only for a diagram child. A file with one diagram is activated as a file, so that branch is skipped.
- `packages/playground/src/studio.ts` keeps one `CanvasSession` per file but uses one visible canvas. Opening a destination file changes the session without necessarily telling that canvas to leave the previous playback.
- `packages/editor/src/session.ts`, `storyMessages`, emits nothing for a file without stories. `packages/canvas/src/app.ts` deliberately keeps drawing story frames while its story panel is active; a normal render alone therefore cannot clear it.
- `packages/canvas/src/story.ts` exposes duration grips on action and transition bars. It has no story-delete control, numerical timing editor or total-scene duration input. Its remove button removes one selected action only.
- Explorer story entries offer Open only. Delete filters out story nodes because it operates on files and folders. `packages/edit/src/types.ts` has no `removeStory` or `setSceneDuration` operation.

A bounded, read-only protocol reproduction was run through `CanvasSession` and `analyzeDocument`: entering a story emitted `render`, `inspector`, and `story(playback)`; switching to a new session for a file without stories emitted only `render` and `inspector`; deleting the active file's last story from its source and updating analysis also emitted no `story(playback: null)`. Both clear-playback checks were false. This confirms the missing protocol state independently of the screenshot, but is not an end-to-end browser test. Browser reproduction and regression tests remain implementation tasks.

The existing language already defines a scene's duration as its transition plus sequential actions, with each parallel block contributing its longest child. A separate scene-length declaration would duplicate that source of truth.

## Goals / Non-Goals

**Goals:**

- Make explicit user navigation win over previous playback state while ordinary recompilation keeps a valid, selected story active.
- Make story deletion reversible, scoped to one named story and safe around export profiles.
- Offer readable numerical timing edits without changing the meaning of camera, visibility, trace or parallel actions.
- Keep document edits in the existing revision-checked operation and history pipeline.

**Non-Goals:**

- Creation catalogue work is owned by `unified-diagram-creation`; connector selection is owned by `reliable-connector-selection`.
- Release and infrastructure activation are owned by `delivery`.

## Decisions

### 1. Send explicit playback state and distinguish navigation from refresh

`CanvasSession.state()` will include a `story` message with `playback: null` and an empty choices list whenever the destination has no stories. A story that disappears must produce this same clear state. Do not infer exit from a changed diagram id: different files can reuse ids, and a story may validly show imported views.

Explorer activation of a file or diagram will explicitly choose edit mode. Activating a story will select that story after opening its source file. It must not depend on the previous explorer `shown.story` cache or on visiting the story's parent first. Ordinary source refreshes retain a selected story while it still exists and is drawable; temporarily invalid story source retains its last valid frame with the existing stale treatment, rather than turning a typing error into navigation.

Alternative: clear the story only in `CanvasApp.applyRender`. Rejected because every story refresh is accompanied by a normal render and would unexpectedly leave playback. An explorer-only fix is also insufficient: remote deletion, undo of creation and other host navigation need a complete state contract.

### 2. Delete a story through a structured operation

Add `removeStory { story, cascade }` to `EditOperation`, routed through `packages/edit/src/plan.ts` and implemented in `packages/edit/src/stories.ts`. It removes the named story block and its internal content through minimal CST edits, with an inverse that restores the exact original bytes. Leading comments that belong to other declarations stay intact.

An export profile of the same file can target a story. With `cascade: false`, such profiles yield `edit.has-dependents`, listing them without changing source. The confirmation names the story and dependent export profiles and offers an explicit deletion including those profiles; confirmation retries with `cascade: true`. Only profiles that target that story are included. Extend the typed dependent metadata for export profiles rather than hiding the problem behind a generic compilation error. A missing story yields `edit.unsafe-target`. Stale revisions are refused by the host's existing revision checks.

Expose the operation in the explorer's story context menu and Delete key and in the shared timeline's Delete story control. The story row is a source symbol, not a file: deleting it must never route to file deletion. Cancel writes nothing. After deletion, playback stops and the story's local base diagram is selected when available; for a story-only file, use the ordinary non-playing empty/file view instead of retaining a ghost frame. Read-only users keep playback and exports but no write controls.

Alternative: delete by replacing the entire source file or treat the story row as a file. Rejected for data-loss risk and loss of comments/history granularity.

### 3. Edit scene length by its final pause

Add `setSceneDuration { story, scene, durationMs }` to the structured edit API. The total includes the scene's transition. Identify the final top-level `hold`, if present, as the adjustable ending pause. Compute the content minimum from the transition and all preceding actions using the compiled timing rules, including parallel maxima.

- A requested total above the minimum inserts or changes that final `hold` to the difference.
- A total equal to the minimum sets an existing final hold to zero, preserving its comments; when none exists, the operation is a no-op.
- A total below the minimum is refused with `edit.invalid-value`, reporting the minimum and explaining that action or transition durations can be changed separately.
- Non-finite, negative and unsupported totals are refused, as are changes requiring a final hold beyond the language's existing ten-minute per-statement limit. A story or scene not present is `edit.unsafe-target`.

For example, two seconds of timed content plus a one-second ending hold produce a three-second scene. Setting it to four seconds changes only the hold to two seconds. Setting it to one second is refused with a two-second minimum and the original source unchanged. Comments, parallel blocks and untargeted actions keep their source bytes.

Alternative: proportionally rescale every action to fit the requested total. Rejected because it silently changes carefully chosen reveal/camera speeds, needs special rules for zero-duration and parallel actions, and makes a small scene-length change affect many lines. Alternative: add scene-duration grammar. Rejected because the existing `hold` expresses the required behavior unambiguously.

### 4. Make all timing controls discoverable and accessible

The timeline will show the current scene and its total duration. Selecting a scene offers its total-duration numeric field and content minimum; selecting an action or transition offers its own duration. UI values use seconds, are labelled in English and Spanish, and submit through the existing millisecond operations. Support Enter or blur to commit once, Escape to cancel a draft, and a validation message that keeps invalid input available for correction. Selecting a bar or scene must not unexpectedly rewrite timing.

Retain bar-end dragging for actions and transitions, with its current 100 ms pointer snap; numerical input may express millisecond precision. A cancelled pointer operation must restore the preview and write nothing. Parallel containers keep their derived duration; timed children are individually editable. Cut transitions stay zero-duration. Read-only mode hides or disables timing writes through the same centralized guard as other story edits.

Alternative: improve only the drag handles. Rejected because precise timing, keyboard use and discovery remain weak, and the requested scene-duration behavior remains absent.

## Packages and Interfaces

| Package/module | Interface affected |
| --- | --- |
| `edit/src/types.ts`, `stories.ts`, `plan.ts` | `removeStory`, `setSceneDuration`, export dependent metadata and exact inverse edits |
| `editor/src/session.ts` | Complete `HostMessage` story state, disappearance handling and canvas-action dispatch |
| `editor/src/canvas/protocol.ts` | Typed story-removal and scene-duration canvas actions and validation |
| `canvas/src/story.ts`, `app.ts` | Current scene/action selection, numerical controls, confirmation handoff, playback cleanup and pointer cancellation |
| `playground/src/explorer/explorer.ts` | Explicit navigation mode and symbol deletion distinct from file deletion |
| `playground` and `canvas` messages | English/Spanish labels, confirmations, minimum-duration and rejection feedback |

No new runtime dependency is required. Neither the language grammar nor deterministic timeline/frame calculation changes. The story guides in `docs/` and `docs/es/` document the same behavior in both languages.

## Risks / Trade-offs

- **A clear message might end a valid story during typing** → distinguish explicit navigation or a missing story from a present but temporarily undrawable story; test those paths separately.
- **A delayed message might revive a previous file's playback** → verify document/session identity and revision at the host boundary, including two files with equal diagram/story ids and equal revision numbers.
- **Deletion can invalidate export profiles** → enumerate dependencies before mutation, require confirmation for cascade, and preserve exact undo/redo for the combined operation.
- **A total-duration input might imply automatic speed changes** → label the minimum and final pause explicitly, and provide separate action/transition fields.
- **A final hold can carry comments or sit after parallel actions** → replace only its value, use minimal insertions, and cover exact inverse restoration and parallel timing in corpus tests.
- **Two changes add explorer behavior** → this delta adds separate story-specific requirements and does not replace the creation catalogue's `Actions on the tree` requirement. Apply canonical spec synchronization sequentially and inspect the merged result.

## Verification

Use the supplied screenshot's navigation sequence as a browser regression: choose a story, then directly choose a different one-diagram file, and verify the file tree, picker, canvas, mode badge and timeline agree without a parent detour or reload. Add the same sequence for an empty/non-diagram destination, a destination with stories and a destination with ids equal to those in the source file. Cover playback running/paused, undo of story creation, remote deletion and invalid source refreshes.

Unit and corpus tests cover dependency rejection/cascade, exact removal and inverse restoration, total and per-action timing edits, invalid input, read-only and stale revision refusal. Shared-canvas webview tests cover keyboard and pointer timing controls, cancel semantics and both host permission states. Playground browser tests cover navigation, explorer deletion, persistence and undo/redo. Run the checks required by `CONTRIBUTING.md` for shared editor/canvas changes, including the VS Code extension suite and package contents check; no production project is edited to reproduce a defect.
