# acceptance-suite Specification

## Purpose
The acceptance corpus of the four profiles and the conditions it is held to: clean compile and layout with snapshots, small edits that change only what they should, syntax errors that keep the services, deterministic geometry and frames, and one command that runs every criterion and records the results.

## Requirements

### Requirement: Acceptance corpus
`corpus/acceptance/` SHALL hold sheets for `flow`, `sequence`, `c4` and `free` covering long labels,
cycles, nested containers, parallel relations and views of 30 elements; for `flow` and `free` also
a `stacked` sheet (nested untitled groups with fills and `radius 0`, a stack of sibling boxes with
empty labels, a band on a back layer behind arranged boxes) and a `shapes` sheet (every `shape`
value, connected, with ends pinned to a diamond and an ellipse); for `gantt` the sheets `chains`
(dependency chains with `after` lists and `until`), `long-labels` (labels inside, after and before
their bars), `parallel` (overlapping tasks in one section and in `display compact`), `sections`
(sections, tasks outside them, milestones and markers) and `thirty` (thirty tasks over a year with
exclusions), each pinning its `today`; sheets with syntax errors
for each profile in `errors/`; and edit scenarios in `edits/` (a sheet, a list of edit operations
and what must hold after each), among them a reparenting scenario (`moveElement` into and out of
a group) and a gantt scenario (a task moved later, stretched, linked, moved to another section and
removed). Every valid sheet SHALL compile without errors and lay out with no
warning, and SHALL keep a reviewed SVG snapshot.

#### Scenario: Valid sheets are clean
- **WHEN** the acceptance suite lays out every valid acceptance sheet
- **THEN** each has no error and no warning, and its SVG equals its snapshot

#### Scenario: Stacked sheet
- **WHEN** `corpus/acceptance/free/stacked.meltemi` is laid out
- **THEN** no `layout.overlap`, `layout.connector-crossing`, `layout.container-margin` or label finding is reported, and the untitled groups draw no title

#### Scenario: Reparent scenario
- **WHEN** the `free-reparent` edit scenario moves a box into a group and back
- **THEN** after each step the box is drawn where the scenario says and the text compiles without errors

#### Scenario: Gantt scenario
- **WHEN** the `gantt` edit scenario (`corpus/acceptance/edits/gantt.json`) runs its five steps on `corpus/acceptance/gantt/chains.meltemi`
- **THEN** after each step only the edited task's line, or the moved and removed lines, changed, every comment is still there, and the successors' dates are the ones the scenario says

#### Scenario: Syntax errors
- **WHEN** a sheet of `errors/` is analysed
- **THEN** its errors point at the faulty statement, every language service answers without throwing, and the canvas session shows the last drawable state as stale

#### Scenario: A gantt sheet with errors
- **WHEN** `corpus/acceptance/errors/gantt-section.meltemi` (an unterminated section and a date `2026-02-30`) is analysed
- **THEN** both errors point at their statements, completion inside the broken section still offers the clause words, and the canvas shows the last drawable chart as stale

### Requirement: Acceptance conditions
`packages/acceptance` SHALL test each condition of the proposal's acceptance table on the corpus:

- **persistence**: a move written to the text, recompiled and laid out, keeps the position and the
  style;
- **source**: a drag changes only the expected ranges and keeps every comment;
- **references**: a rename keeps identity in every file and story; a delete detects its dependents;
- **layout**: adding elements to an assisted diagram keeps placed elements where they are;
- **connectors**: parallel relations keep separate routes and separate effects;
- **sequence**: spacing, gaps and label moves keep the order of messages;
- **C4**: a renamed entity changes in every view, and a move in one view does not move it in
  another;
- **motion**: the player's frames equal the exported frames at control times;
- **import**: no essential construct is dropped without a finding;
- **delivery**: the export matrix passes (`export-verification`).

#### Scenario: Comments survive a drag
- **WHEN** the edit scenario moves an element of a commented sheet
- **THEN** only the `placement` block changes and every comment of the sheet is still there

### Requirement: Determinism of geometry and frames
Laying out the same sheet in fresh project sessions SHALL give equal scenes, and the frames of
stories and effects at control times (scene boundaries and action middles) SHALL be equal SVG text.
`pnpm acceptance:determinism` SHALL export every format of the reference example twice and find
SVG and HTML equal byte for byte, PNG equal pixel for pixel, and MP4, WebM and GIF equal frame by
frame (FFmpeg frame hashes), naming the browser and FFmpeg versions.

#### Scenario: Video twice
- **WHEN** the purchase story is exported as MP4 twice
- **THEN** the frame hashes of both files are equal

### Requirement: One run of every criterion
`pnpm acceptance` SHALL run the acceptance tests, the visual regression, the determinism, the
first-export timing, the browser matrix and the benchmark, and write `docs/quality/results.md`
with the date, the machine, the versions and each result.

#### Scenario: Results
- **WHEN** `pnpm acceptance` completes on the reference machine
- **THEN** `docs/quality/results.md` lists every criterion with its result and the versions it ran with
