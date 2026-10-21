## ADDED Requirements

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
