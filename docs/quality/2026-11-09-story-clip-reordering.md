# Story clip reordering — 9 November 2026

Local verification on Windows with Node 24.15.0 and pnpm 10.33.2, in branch
`codex/story-clip-dragging` based on `ccb070df86aee9bdf82359d08eeab0b391feff49`.
This records local implementation evidence; no commit, publication or deployment was made.

## Scope

The shared timeline inserts a top-level action before/after a sibling within its scene.
Durations and scene/story totals stay fixed. A labelled parallel header moves its complete
block; nested children remain simultaneous and individually resizable. The right handle
continues to resize, while buttons and Alt+Left/Right provide ordered alternatives.

Source edits preserve comments, LF/CRLF, headers, imported diagrams and exact undo. Pointer,
touch, cancellation, source/navigation changes, read-only and acknowledgement guards are
covered. Short actions outside groups have separate body caps; all-instantaneous scenes use ordered
controls because they have no distinct temporal insertion positions. See
[decision 0075](../decisions/0075-story-clip-reordering.md).

## Checks

| Check                                           | Result                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Strict OpenSpec proposal validation             | Passed before implementation                                |
| `pnpm build`                                    | Passed                                                      |
| `pnpm typecheck`                                | Passed                                                      |
| `pnpm lint`                                     | Passed, including final CSS and test corrections            |
| `pnpm licenses:inventory --check`               | Passed; 47 packages                                         |
| `pnpm test`                                     | 396 files; 11,569 passed, one existing skip                 |
| Shared webview                                  | 358 passed on the final CSS bundle                          |
| New webview scenarios plus connector regression | 14 passed on final CSS bundle                               |
| Playground browser                              | 150 passed; final CSS story/lifecycle repetition: 11 passed |
| VS Code integration                             | 26 passed on the final CSS bundle                           |
| `pnpm vscode:package`                           | Passed on final CSS; 416 files and contents check passed    |

The complete build preceded the browser runs. Runners were invoked directly against built
bundles to avoid rebuilding files while another suite read them. After the scoped CSS correction,
both browser bundles and the VSIX were rebuilt; story/lifecycle checks were repeated against the
final CSS. No renderer, language, motion or export implementation changed.

## Findings resolved during verification

The archived change passed strict validation and added three requirements to the canonical
story-editing specification. The existing canonical text is unchanged. Its standalone strict
validation retains two pre-existing style warnings about requirement length (indices 0 and 3),
with no errors; ordinary canonical validation passes. These warnings are recorded in
`spec-final.json` rather than being reported as a strict pass.

- A duration resize followed by Alt+reorder before pointer-up could send a second, obsolete
  write. Reordering now cancels the previous gesture, and resize rechecks pending state at
  completion. A real browser regression holds the host acknowledgement to exercise this race.
- An unchanged same-revision refresh must retain a pending reorder acknowledgement. Further
  story-panel writes are blocked while it is pending, and selection follows the exact verified
  edit to its new path. A separate-story/import regression leaves its original diagram intact.
- Source tests cover fractional milliseconds after a large preceding scene, parallel blocks,
  semicolons and comment attachment. Ambiguous overlapping source boundaries are refused
  before writing; undo restores every original byte.
- Initial full webview run: 357 passed, one existing connector test failed while measuring
  geometry during inspector collapse. Instrumented repetition measured stage widths of
  1138.203125 and 1164 in the same 1200-pixel window. The test now waits for the actual
  transition and following layout frames, then checks that click points are visible. The
  corrected connector regression passed in isolation. The next full run also caught a click
  point outside the visible stage: the fixture now explicitly fits before measuring, so the
  result is independent of inherited viewport pan as well as the closing animation.
- Visual inspection found oversized SVG icons in the new move buttons. They now share the
  timeline's compact button styles; browser assertions check their height. English and Spanish
  screenshots include drag preview, insertion label, selected moved clip and its duration field.

## Evidence and boundaries

Logs and screenshots are under `C:/meltemi/artifacts/story-clips-20261109/`. The first failing
connector run and initial visual captures are retained separately from final results.
The owner's private DEV/PROD project was not used as a test fixture or modified.
No account, sharing settings, project configuration, dependencies or credentials changed.
Free offsets, overlapping clips, cross-scene moves and extracting parallel children remain
outside this insertion-style feature.
