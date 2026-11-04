## ADDED Requirements

### Requirement: A push job
`init --ci github|gitlab --cloud` SHALL add to the workflow a job that runs on pushes to the
default branch and executes `meltemi-diagrams push --force --strict` with the token from the
CI's secret `MELTEMI_TOKEN` (and `MELTEMI_HOST` when set), never writing the token into the
file; without `--cloud` the workflow SHALL be as before.

#### Scenario: GitHub push job
- **WHEN** `mdg init docs/architecture --ci github --cloud` runs
- **THEN** the workflow has a job on `main` with `MELTEMI_TOKEN: ${{ secrets.MELTEMI_TOKEN }}` running the push with `--force --strict`

#### Scenario: No token in the file
- **WHEN** the workflow is read
- **THEN** it contains no `mdg_` token
