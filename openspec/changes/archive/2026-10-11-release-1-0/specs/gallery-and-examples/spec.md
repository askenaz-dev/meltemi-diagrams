## ADDED Requirements

### Requirement: Gallery of the four profiles
`gallery/` SHALL hold one sheet for each of the flow, sequence, C4 and free profiles, each with its
SVG, PNG (scale 2) and PDF export beside it, and `gallery/README.md` SHALL show each picture with
links to its source and exports. Every sheet SHALL validate without diagnostics.

#### Scenario: Gallery current
- **WHEN** the tests run
- **THEN** every gallery sheet validates cleanly and each committed SVG equals a fresh export

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
