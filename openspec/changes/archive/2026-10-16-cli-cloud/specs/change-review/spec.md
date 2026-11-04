## ADDED Requirements

### Requirement: Review against the cloud
`review --base cloud` SHALL compare the folder's project with its cloud project's current
files, and `--base cloud:<n>` with version `n`, through a `ProjectHost`
(`@meltemi/diagrams-project`) filled by one prefetch of the cloud's files and the blobs they
reference and rooted at the folder, as the Git revision host is; every cloud path SHALL pass
the path rule of `pull` and resolve inside the folder, else the command SHALL fail with
`pull.unsafe-path` naming it and exit code 1; the comparison, the summary, `--out`, `--json`
and `--exit-code` SHALL behave as with a Git revision; a folder without a cloud project or an
unknown version SHALL fail with exit code 1 naming the problem.

#### Scenario: Against the current cloud files
- **WHEN** `mdg review --base cloud` runs after someone renamed an element in the browser
- **THEN** the review reports the rename by id

#### Scenario: Unknown version
- **WHEN** `--base cloud:99` names no version
- **THEN** the command fails with exit code 1 naming version 99

#### Scenario: An unsafe cloud path
- **WHEN** the cloud project holds `../x.meltemi`
- **THEN** the command fails with `pull.unsafe-path` naming it and exit code 1, having compared nothing
