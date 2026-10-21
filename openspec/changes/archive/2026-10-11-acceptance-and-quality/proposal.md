## Why

The proposal makes 1.0 pass an acceptance corpus (long labels, cycles, nested containers, parallel
relations, syntax errors and small edits) in its four profiles, with zero cut or overlapping
labels, visual tests with pinned resources, frame determinism, measured performance targets on a
reference machine, a first export from a template in under ten minutes, and exports verified in
an agreed matrix of applications (roadmap change 23, "Calidad y criterios de aceptación"). The
tests so far check each package; nothing measures the release criteria as a whole, nothing checks
labels against each other in the drawing, and the reference machine is still to be fixed.

## What Changes

- **Labels in the drawing.** `auditLabels(scene, measurer)` in `@meltemi/diagrams-layout` checks
  every text of a laid-out scene: inside its shape, its label's background and the picture; not
  over another text, a box it does not belong to, or another connector. `layoutDiagram` reports
  `layout.label-cut` and `layout.label-overlap` in every profile, without repeating what other
  checks already name.
- **Layouts that keep labels clear.**
  - Labels the layout places slide along their connectors to a clear spot.
  - Connectors pass under group titles (drawn with a gap there).
  - In `assisted` and `manual` mode, a default connector that would run through another box takes
    the L or Z route that crosses the fewest.
  - A new composition warning, `layout.connector-crossing`, reports a connector that still runs
    through a box.
- **`validate` checks composition.** `meltemi-diagrams validate` adds each file's layout warnings,
  as the editor shows them, so `validate --strict` is the quality gate in CI.
- **Acceptance corpus.** `corpus/acceptance/` covers `flow`, `sequence`, `c4` and `free` with long
  labels, cycles, nested containers, parallel relations and 30-element sheets, plus sheets with
  syntax errors and scripted small edits. Every valid sheet compiles and lays out with no warning,
  and keeps a reviewed SVG snapshot.
- **Acceptance suite.** The new private package `packages/acceptance` holds:
  - a test for each condition of the proposal's acceptance table (persistence, source, references,
    layout, connectors, sequence, C4, motion, import, delivery);
  - the label target, at zero over every corpus, template and example;
  - determinism checks of scenes and control frames;
  - the performance targets.
- **Pinned visual regression.** `pnpm acceptance:visual` draws every acceptance sheet as PNG in the
  installed Edge or Chrome and compares the pixels with reviewed references made with a recorded
  browser version and the bundled fonts, writing diff images. `--update` records new references.
- **Frame determinism.** `pnpm acceptance:determinism` exports every format twice:
  - SVG and HTML byte for byte, PNG pixel for pixel;
  - MP4, WebM and GIF frame by frame through FFmpeg's frame hashes, so that container metadata is
    not taken for a content change.
- **Performance.** `pnpm bench` measures the editor's real path: analysis after an edit, and a
  canvas drag round trip, for 30-element views of the four profiles, plus the existing cases.
  `--write` records the results with the machine in `docs/performance.md`. Decision 0032 fixes the
  reference machine and the targets: incremental analysis p95 under 500 ms; a canvas round trip
  p95 under 100 ms.
- **First export.** `pnpm acceptance:first-export` times `init` → `validate` → `export` (SVG, PNG,
  PDF, MP4) from each template, and the playground from opening to the SVG download; the target is
  ten minutes for a person, so the pilot measures that (change 24).
- **Verification matrix.**
  - `pnpm verification:browsers` opens every export format in Edge, Chrome and Firefox (through
    WebDriver BiDi) and checks that each one loads, draws, plays, seeks and works offline. The
    results, with versions, are recorded in `docs/verification/browsers.md`.
  - `pnpm verification:kit` writes the files and checklist for PowerPoint, Keynote and Google
    Slides; `docs/verification/office-apps.md` holds the checklist and the results table the owner
    fills in.
- `pnpm acceptance` runs all of it and writes `docs/quality/results.md`.
- Documentation: `docs/quality.md` (criteria, how each is checked, how to run it), decision 0032,
  the README's performance section, CONTRIBUTING, the roadmap and the layout and diagnostics
  references.

## Capabilities

### New Capabilities

- `label-audit`: the checks of every label of a drawing and their diagnostics.
- `acceptance-suite`: the acceptance corpus, the tests of the acceptance conditions, the label
  target and determinism.
- `visual-regression`: pixel comparison of PNG drawings against references recorded with a pinned
  browser and fonts.
- `performance-targets`: the benchmark of the editor's path, the reference machine and the targets.
- `export-verification`: the automated browser matrix, the kit and checklist for office
  applications, and the recorded results.

### Modified Capabilities

- `composition-checks`: adds `layout.connector-crossing`.
- `connector-routing`: default connectors avoid boxes in assisted and manual mode; labels slide
  to clear spots; connectors pass under group titles.
- `cli-validation`: `validate` reports the layout warnings of each file.

## Impact

- `packages/layout`: `audit.ts`; `layout.ts` (label placement, title gaps, the audit); `routing.ts`
  (`crossedBoxes`, `avoidingRoute`); `checks.ts`. Snapshots change where a label or a connector
  moved, and each change is reviewed.
- `packages/cli`: `validate`. New package `packages/acceptance` (private) with tests and runners;
  root scripts `acceptance`, `acceptance:visual`, `acceptance:determinism`,
  `acceptance:first-export`, `verification:browsers`, `verification:kit`, and `bench` moved there.
- New corpus folder `corpus/acceptance/` with snapshots and visual references.
- No new dependency: Firefox is driven through `playwright-core`'s WebDriver BiDi support, and FFmpeg,
  Edge, Chrome and Firefox are the installed ones.
