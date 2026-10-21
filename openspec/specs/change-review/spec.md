# change-review Specification

## Purpose
Semantic differences between versions of a document or project, by id, with renames told from removals and additions, and the review command with pictures before and after.
## Requirements
### Requirement: Semantic differences
`diffDocuments(before, after)` SHALL list the diagrams, elements, relations, models, entities,
stories, scenes, themes and export profiles added, removed, renamed or changed between two
versions of a document, with what changed for each (label, kind, description, technology, URL,
link, classes, group, place, size, route, label position, style, effects, diagram properties,
scenarios, C4 lists, constraints, story timing and actions). An id that changed SHALL be reported
as a rename when the item kept its kind and enough of its label, place, description or relations;
relations and story targets SHALL be compared through those renames. Comments and formatting SHALL
not count.

#### Scenario: Rename, not delete and create
- **WHEN** element `api["API Gateway"]` becomes `gateway["API Gateway"]` with its relations
- **THEN** the only change is `> element api → gateway "API Gateway"`

#### Scenario: Relabel
- **WHEN** the label of `api` changes and its id stays
- **THEN** one change reports the old and new label

### Requirement: Review command
`meltemi-diagrams review [path]` SHALL compare the path with its version at a Git revision
(`--base`, HEAD by default) or with another folder or file (`--before`), pairing files by path and
renamed files by the blocks they hold, and print the changes by file and block with a summary.
`--json` SHALL print one object; `--exit-code` SHALL exit 1 when something changed; usage errors
and unknown revisions SHALL exit 2 without local paths in the message. `--out <folder>` SHALL write
`index.html` and, for every changed diagram, pictures before and after with the changed elements
and relations outlined (added green, removed red, renamed blue, changed amber); the page SHALL name
the versions, not local paths.

#### Scenario: Pull request review
- **WHEN** `mdg review architecture --base main --out review` runs after an element was renamed
- **THEN** the output lists the rename, and `review/index.html` shows the diagram before and after
  with the element outlined in blue

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

