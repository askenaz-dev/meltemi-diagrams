# gallery-and-examples Specification

## Purpose
The gallery of the four profiles and the reference purchase example with every export, generated from their sources and checked against fresh exports.

## Requirements

### Requirement: Gallery of the profiles
`gallery/` SHALL hold one sheet for each of the flow, sequence, C4, free and gantt profiles, each with
its SVG, PNG (scale 2) and PDF export beside it, and `gallery/README.md` SHALL show each picture with
links to its source and exports. Every sheet SHALL validate without diagnostics. The gantt sheet,
`gallery/gantt/launch-plan.meltemi`, SHALL pin its `today` date so that its exports do not depend on
the day they are made.

#### Scenario: Gallery current
- **WHEN** the tests run
- **THEN** every gallery sheet validates cleanly and each committed SVG equals a fresh export

#### Scenario: The gantt sheet
- **WHEN** `pnpm gallery` runs on two different days
- **THEN** `gallery/gantt/launch-plan.svg` is the same both times and shows sections, bars of every
  status, a milestone, a marker, the today line and dependency arrows

#### Scenario: A sheet that does not validate
- **WHEN** a gallery sheet gains a diagnostic
- **THEN** the gallery test fails naming the sheet and the diagnostic

### Requirement: Reference purchase example
`examples/purchase/` SHALL be the purchase template as a project, with `exports/` holding every view
as SVG, the executive slide as PNG and PDF, the story as MP4 and GIF, the story's HTML player and
the project's catalog, and a README that walks through them. Its sources SHALL equal the
template's files.

#### Scenario: Example and template agree
- **WHEN** the tests run
- **THEN** each source file of `examples/purchase/` equals the purchase template's file, its SVG
  exports equal fresh exports, and the MP4 lasts as long as the story when FFmpeg is installed

### Requirement: One command writes them
`pnpm gallery` SHALL write the gallery's exports and the example's exports and README tables, and
print each file written.

#### Scenario: Refreshed
- **WHEN** a gallery sheet changes and `pnpm gallery` runs
- **THEN** its SVG, PNG and PDF are rewritten and the gallery test passes
