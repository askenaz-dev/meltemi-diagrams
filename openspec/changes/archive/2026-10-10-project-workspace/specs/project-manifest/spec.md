## ADDED Requirements

### Requirement: Project root
The project root of a file SHALL be the nearest ancestor folder, including the file's own folder, that contains `project.json`. When no ancestor has one, the root SHALL be the file's own folder.

#### Scenario: Nested file
- **WHEN** `architecture/project.json` exists and `architecture/diagrams/checkout.meltemi` is compiled
- **THEN** the root is `architecture`

#### Scenario: Loose file
- **WHEN** `notes/sketch.meltemi` is compiled and no ancestor has `project.json`
- **THEN** the root is `notes`

### Requirement: Manifest fields
`project.json` SHALL be a JSON object with these fields:

- `name` (required, non-empty string);
- `language` (required; equal to the supported language version);
- `tools` (optional object mapping `meltemi-diagrams` to a version range);
- `sources` (optional array of relative paths, default `["."]`);
- `exclude` (optional array of relative paths);
- `$schema` (optional).

Each problem SHALL be reported with a range inside `project.json`:

- invalid JSON is `project.invalid-json`;
- a missing required field is `project.missing-field`;
- an unknown field is `project.unknown-field` (warning);
- a wrong type, an unsupported language or an unreadable range is `project.invalid-value`.

#### Scenario: Valid manifest
- **WHEN** `project.json` is `{ "name": "commerce", "language": "0.2" }`
- **THEN** no diagnostic is reported and `sources` defaults to `["."]`

#### Scenario: Broken JSON
- **WHEN** `project.json` contains `{ "name": "commerce", }`
- **THEN** `project.invalid-json` is reported at the trailing comma

#### Scenario: Unknown and missing fields
- **WHEN** `project.json` is `{ "nmae": "commerce", "language": "0.2" }`
- **THEN** `project.unknown-field` is reported on `nmae` and `project.missing-field` names `name`

### Requirement: Version pins
The `tools` range SHALL accept:

- exact versions;
- caret and tilde ranges;
- comparator sets separated by spaces (`>=0.3.0 <1.0.0`);
- `*`.

A range that the running tool's version does not satisfy SHALL be `project.tool-version` (error), naming both versions. A file whose `language` header differs from the manifest's `language` SHALL be `project.language-mismatch` on the header.

#### Scenario: Tool too old
- **WHEN** `tools` is `{ "meltemi-diagrams": "^0.9.0" }` and the tool is `0.3.0`
- **THEN** `project.tool-version` names `^0.9.0` and `0.3.0`

#### Scenario: Range forms
- **WHEN** `satisfiesRange` checks `0.3.4` against `~0.3.0`, `^0.3.0`, `>=0.3.0 <1.0.0`, `*` and `0.3.5`
- **THEN** the first four are satisfied and the last is not

#### Scenario: File in another language version
- **WHEN** the manifest says `"language": "0.2"` and a file starts with `language "0.1"`
- **THEN** `project.language-mismatch` is reported on the header

### Requirement: Sources and schema
The project's sources SHALL be every `.meltemi` file under the `sources` paths, minus the `exclude` paths, `node_modules` and hidden folders (names starting with `.`, such as `.git` and `.meltemi`), listed in a stable order. The repository SHALL ship `schemas/project.schema.json` describing the manifest fields.

#### Scenario: Excluded drafts
- **WHEN** `exclude` is `["drafts"]` and `drafts/old.meltemi` exists
- **THEN** `drafts/old.meltemi` is not among the project's sources

#### Scenario: Schema agrees with the reader
- **WHEN** the schema test reads `schemas/project.schema.json`
- **THEN** its properties are exactly the fields the reader accepts, and its required list is `name` and `language`
