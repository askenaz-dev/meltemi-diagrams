# performance-targets Specification

## Purpose
The reference machine and the targets the editor and the exports are measured against: analysis after an edit, the canvas round trip and the first export from a template.
## Requirements
### Requirement: Benchmark of the editor's path
`pnpm bench` SHALL measure, with median and 95th percentile: parsing and compiling, exporting and
arranging (the existing cases), the analysis after an edit through `ProjectSessions` (compile,
layout and diagnostics inside the project) and a canvas drag round trip (message, plan, edit,
analysis, render) for 30-element views of `flow` (auto and assisted), `sequence`, `c4` and `free`.
It SHALL print the machine (processor, threads, memory, system, Node). `--write` SHALL record the
results in `docs/performance.md`.

#### Scenario: Recorded results
- **WHEN** `pnpm bench --write` runs
- **THEN** `docs/performance.md` lists every case with its median and p95 and the machine

### Requirement: Reference machine and targets
Decision 0032 SHALL fix the reference machine and the targets: analysis after an edit p95 under
500 ms and a canvas round trip p95 under 100 ms for views of up to 30 elements, and a first export
from a template under 60 s of machine time. The acceptance tests SHALL assert the analysis and
canvas targets with a factor of 4 for slower machines.

#### Scenario: Targets held
- **WHEN** the acceptance tests run on the reference machine
- **THEN** every 30-element view meets both targets without the factor

### Requirement: First export from a template
`pnpm acceptance:first-export` SHALL time, for each template, `init`, `validate` and the export of
SVG, PNG, PDF and MP4 with the CLI, and the playground from opening to the downloaded SVG, and
report each time against the target.

#### Scenario: Template to files
- **WHEN** the runner exports the `flow` template
- **THEN** it reports the four files and a total under 60 s on the reference machine

