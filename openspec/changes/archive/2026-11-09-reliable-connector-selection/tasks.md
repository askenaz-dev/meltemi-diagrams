## 1. Reliable body selection

- [x] 1.1 Add a canvas-only hit surface for all real connector stroke pieces, including curves and segmented routes, and land a shared webview regression that presses a moving-dash body away from labels and endpoints; verify the selected relation and absence of a source edit.
- [x] 1.2 Synchronize six-screen-pixel stroke reach with zoom and transforms; cover 49%, 100% and a high zoom, pan, host scroll, dash gaps and clicks outside the reach in focused geometry/browser tests.
- [x] 1.3 Preserve label/handle priority, hidden layers, structural title gaps, decorative overlay pass-through and read-only inspection; verify these interactions plus reduced motion in the shared browser suite and assert canvas hit primitives are absent from exports.
- [x] 1.4 Document body selection and its tolerance in `docs/editor.md` and `docs/es/editor.md`; verify the documented gesture against the regression fixture and run the bilingual documentation checks.

## 2. Directional rectangle selection

- [x] 2.1 Extend the pure selector with explicit containment/crossing geometry, retaining containment as the default; land unit cases for both drag axes, orthogonal and curved intersections, false bounding-box hits, nongroup shapes and full-containment treatment of enclosing groups.
- [x] 2.2 Wire mode selection before rectangle normalization and add solid/dashed band feedback with English/Spanish status and accessible mode names; verify Shift/Ctrl additions, cancellation and unchanged mouse/stylus/touch gesture arbitration in focused browser tests.
- [x] 2.3 Add the owner's generic grouped fixture with animated red/green/yellow connectors; verify full enclosure still works and a reverse-direction crossing selects a middle segment with endpoints and label outside, including hidden/clipped negatives and 49% zoom.
- [x] 2.4 Explain the two directions and enclosing-group behavior in both editor guides; verify the descriptions by replaying both gestures and run the bilingual documentation checks.

## 3. Shared-host integration

- [x] 3.1 Verify the finished selection flow in both playground and VS Code webview, covering representative flow, free, C4, sequence and Gantt relation profiles; retain screenshots or browser reports for the grouped 49% case and confirm no source mutation from selection alone.
- [x] 3.2 Run the repository-required `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm vscode:test`, `pnpm vscode:package` and `pnpm playground:test-browser`; if implementation changes layout, renderer, motion or exports, also run the applicable visual acceptance, player/browser and export checks required by `CONTRIBUTING.md`, reviewing every resulting diff.

## Workflow follow-up

- Review the proposed crossing gesture independently of the reproduced moving-dash defect before applying this change.
- Sync the approved spec delta and archive through the OpenSpec CLI after implementation and validation; release and deployment remain with `delivery`.

## Combined integration result

Completed against the combined implementation; results, retries and hosted-only limits are recorded in `docs/quality/2026-11-09-authoring-usability.md`. No commits or deployment were made.
