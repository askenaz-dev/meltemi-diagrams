## ADDED Requirements

### Requirement: The day of the today line
`meltemi-diagrams export` SHALL lay out gantt charts that write `today` without a date with the
machine's local date, or with `--today <YYYY-MM-DD>` when given, in every format (SVG, PNG, PDF, HTML,
animated SVG and video), the same day for every chart of the run. A `today <date>` written in the
chart SHALL win over both. A `--today` value that is not a date SHALL be a usage error (exit 2) naming
the form; `--today` SHALL be accepted and ignored when no exported chart writes `today`.

#### Scenario: A pinned day for CI
- **WHEN** `mdg export plan.meltemi --today 2026-07-15` runs twice on different days
- **THEN** both SVGs are identical and the today line is at 15 July 2026

#### Scenario: Written in the chart
- **WHEN** the chart writes `today 2026-07-01` and the command passes `--today 2026-07-15`
- **THEN** the line is at 1 July 2026

#### Scenario: Not a date
- **WHEN** `mdg export plan.meltemi --today tomorrow` runs
- **THEN** it exits with code 2 and says `--today` takes a date written 2026-07-15
