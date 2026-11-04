# ci-workflows Specification

## Purpose
GitHub and GitLab CI workflows written by init --ci: validate, review requests against their base, build the catalog and keep the results.
## Requirements
### Requirement: CI workflow templates
`meltemi-diagrams init --ci github|gitlab` SHALL write a workflow, at the top of the Git working
tree when there is one, that installs the CLI pinned to its version, validates the project with
`--strict`, reviews pull or merge requests against their base branch into the job summary and a
`review` folder, builds the catalog, and keeps `catalog` and `review` as artifacts. Branch names
SHALL reach scripts through environment variables, never written into them. An existing workflow
SHALL not be replaced; with an existing `.gitlab-ci.yml`, the GitLab job SHALL go to
`.gitlab/meltemi-diagrams.yml` with the `include` to add printed.

#### Scenario: GitHub workflow for a project in a subfolder
- **WHEN** `mdg init docs/architecture --ci github` runs at the top of a repository
- **THEN** `.github/workflows/meltemi-diagrams.yml` sets `PROJECT: "docs/architecture"` and uses
  `$GITHUB_BASE_REF`

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

