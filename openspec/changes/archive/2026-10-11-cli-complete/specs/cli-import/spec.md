## ADDED Requirements

### Requirement: Import folders
`meltemi-diagrams import <folder>` SHALL import every Mermaid, PlantUML and Markdown file below the
folder (hidden folders and `node_modules` left out; PlantUML `.iuml` includes read through the
files that include them; Markdown files without diagram blocks passed over), each into its sheet
beside it or under `--out` keeping the folders, with `--force`, `--merge`, `--check` and `--json`
as for one file, and sum up how many were complete, partial, failed or not replaced. The exit code
SHALL be 2 when one failed or was not replaced, 1 when one was partial, else 0.

#### Scenario: A folder of diagrams
- **WHEN** a folder holds `flows/checkout.mmd`, `sequences/pay.puml` (including
  `includes/people.iuml`) and a `README.md` without diagrams
- **THEN** two sheets are written and the summary reads `2 complete, 0 partial, 1 without diagrams`
