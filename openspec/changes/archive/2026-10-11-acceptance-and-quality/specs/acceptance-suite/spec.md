## ADDED Requirements

### Requirement: Acceptance corpus
`corpus/acceptance/` SHALL hold sheets for `flow`, `sequence`, `c4` and `free` covering long labels,
cycles, nested containers, parallel relations and views of 30 elements; sheets with syntax errors
for each profile in `errors/`; and edit scenarios in `edits/` (a sheet, a list of edit operations
and what must hold after each). Every valid sheet SHALL compile without errors and lay out with no
warning, and SHALL keep a reviewed SVG snapshot.

#### Scenario: Valid sheets are clean
- **WHEN** the acceptance suite lays out every valid acceptance sheet
- **THEN** each has no error and no warning, and its SVG equals its snapshot

#### Scenario: Syntax errors
- **WHEN** a sheet of `errors/` is analysed
- **THEN** its errors point at the faulty statement, every language service answers without throwing, and the canvas session shows the last drawable state as stale

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
