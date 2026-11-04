## RENAMED Requirements

- FROM: `### Requirement: Gallery of the four profiles`
- TO: `### Requirement: Gallery of the profiles`

## MODIFIED Requirements

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
