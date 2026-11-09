# Story authoring and presentation — 9 November 2026

Local implementation in `codex/story-clip-dragging`, based on
`ccb070df86aee9bdf82359d08eeab0b391feff49`, on Windows with Node 24.15.0 and pnpm 10.33.2.
The previous action-reordering work remains included. No commit, publication or deployment was made.

## Scope and behavior

- A stable selected-scene id and labelled selector disambiguate empty and concurrent scenes.
  Selected and playing rows have distinct indicators; the clock does not change the editing target.
- The shared story panel resizes by pointer or keyboard, including cancellation and local persistence.
  Add to scene and New scene have consistent labels. End ticks and playhead stay inside the track.
- Lower-panel deletion removes only the selected scene, retaining an empty story after its last scene.
  Story deletion lives above, beside the story selector, and in the explorer. Revision, navigation,
  pending-write and repeated-confirmation guards prevent stale edits.
- Story and scene display titles are editable without changing ids or export references. Explorer
  Rename/F2 supports stories. Undo restores original source, including comments and line endings.
- An optional `overlap <time>` scene header starts actions concurrently with the preceding scene.
  The shared interval is bounded by both durations. Three ten-second scenes with eight-second
  overlaps start at zero, two and four seconds and end at fourteen seconds. Authors can choose
  sequential or overlapping timing and independent cut/fade/morph transitions in seconds.
- Same-scene conflicting actions remain invalid. Concurrent scenes use later-scene precedence on
  shared channels with start-anchored interpolation. Directed scene stills exclude later scenes;
  ordinary playback and MCP inspection use the concurrent global clock.
- Timeline HTML export opens the selected-story chooser. Heading, description, text summary,
  inspection details and controls are independently selectable. Browser defaults show the diagram
  with controls; programmatic defaults remain compatible. Fullscreen focuses the player surface,
  handles native exit/failure, restores focus and also works when playback controls are omitted.
  Visible diagram labels and the data needed to render it remain in the document.

See [decision 0077](../decisions/0077-concurrent-story-authoring.md) and the bilingual
[story reference](../language/stories.md), [editor guide](../editor.md) and [player guide](../player.md).

## Verification

| Check                                     | Result                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Three OpenSpec changes, strict validation | Passed before implementation and on final proposals                            |
| Full build and VSIX packaging             | Passed; 416 packaged files and contents check                                  |
| TypeScript and unit suite                 | Passed; 402 files, 11,653 tests passed, one existing skip                      |
| Lint and formatting                       | Passed on the final combined source                                            |
| Player browser suite                      | 45 passed, including clean/rich fullscreen, failures and EN/ES                 |
| Shared webview                            | 366 passed on the final bundle; 27 focused scenarios passed                    |
| Playground                                | 157 passed on the final bundle; 13 strengthened focused scenarios passed       |
| VS Code integration                       | 26 passed on the final bundle                                                  |
| Complete acceptance                       | 541 cases; all six acceptance criteria passed                                  |
| Visual acceptance                         | 41/41 identical references, zero differing pixels                              |
| Export/browser verification               | 42/42 checks in Edge/Chrome/Firefox, plus 5/5 PDF checks                       |
| Determinism, performance, first export    | Six formats, 12 targets and nine first exports passed                          |
| Conformance                               | 49 model cases, 74 diagnostic cases, five valid and 40 invalid projects passed |
| Prior valid-story compatibility           | 316 SVG frames byte-identical to the previous evaluator                        |
| License inventory                         | Current; 47 packages                                                           |
| Documentation and skill copies            | 114 checks passed after archiving                                              |
| Canonical OpenSpec validation             | Eight affected specs passed; all three changes synchronized and archived       |

The three changes are archived as `2026-11-09-story-workspace-authoring`,
`2026-11-09-overlapping-story-scenes` and `2026-11-09-story-player-presentation`.
The archive command's only incomplete task was the archive step itself; it is now completed.

Browser suites use built bundles without concurrent rebuilds. Final changes after acceptance are
limited to edit validation, cache invalidation, syntax highlighting and the clip-insertion anchor;
they do not change renderer/player output. Generated acceptance reports were preserved as evidence,
then the four tracked report files were restored byte for byte. No existing model, SVG or pixel
reference was updated. Only the two new overlap fixtures add model snapshots and one adds an SVG.

## Regressions resolved

- A morph involving a third concurrent scene could jump by 26.47 pixels. Opt-in composition now
  normalizes rendered bounds consistently; tests measure actual SVG transforms and primitives.
- A cascading diagram edit could delete an action and invalidate an adjacent overlap. Plans now
  reject new diagnostics in documents declaring overlap instead of silently changing the schedule.
- Without a project manifest, canvas and explorer could cache the same file through different
  workspace roots. Writes invalidate every existing reader; rename, undo and redo update the tree.
- A selected clip could expand settings and move the track during pointer drag. Stable settings
  geometry and duration slots preserve the drop target. Concurrent fade scenes now use the actual
  action start, rather than incorrectly adding the sequential transition prefix to insertion slots.
- A second confirmation for dependent story exports could escape the pending/revision guard.
  It now uses the same guarded deletion path. Empty-story deletion and re-creation are covered.

## Evidence and boundaries

Logs, generated reports and EN/ES/narrow/fullscreen screenshots are under
`C:/meltemi/artifacts/story-workspace-20261109/`. Tests use synthetic local projects and loopback
MCP calls. No private DEV/PROD diagram, sharing setting, credential, dependency or project
configuration was changed. The optional HTML controls affect presentation; they do not promise
redaction of diagram content. Arbitrary scene offsets remain outside this adjacent-overlap model.
