# project-manifest Specification

## Purpose
`project.json`: the project root, manifest fields, version pins, sources and the manifest schema.
## Requirements
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
- `locale` (optional, `en` or `es`, default `en`): the language of the words the tool adds to
  exported drawings, players and catalogs;
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

#### Scenario: Spanish exports
- **WHEN** `project.json` is `{ "name": "commerce", "language": "0.2", "locale": "es" }`
- **THEN** no diagnostic is reported, and `"locale": "fr"` would be `project.invalid-value` listing
  `en` and `es`

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

### Requirement: Format settings
`project.json` SHALL accept an optional `format` object with `indent` (a whole number of spaces from 1 to 8, or `"tab"`). A wrong value SHALL be `project.invalid-value`, and an unknown key inside `format` SHALL be `project.unknown-field`. `formatOptionsFor(manifest)` SHALL return the formatter options of the project, with two spaces when the setting is absent. The schema SHALL describe the same field.

#### Scenario: Four spaces
- **WHEN** `project.json` has `"format": { "indent": 4 }`
- **THEN** `formatOptionsFor` returns `{ indent: 4 }` and no diagnostic is reported

#### Scenario: Invalid indentation
- **WHEN** `project.json` has `"format": { "indent": 12 }`
- **THEN** `project.invalid-value` is reported on `12`, and the default of two spaces is used

#### Scenario: Unknown format key
- **WHEN** `project.json` has `"format": { "width": 80 }`
- **THEN** `project.unknown-field` is reported on `width`

### Requirement: Default theme setting
`project.json` SHALL accept an optional `theme` string: a built-in theme name, or `<path>#<theme id>` where the path is relative to the project root and names a `.meltemi` file inside the project. The checks SHALL be:

- a value that is not a string, is neither a built-in name nor of the form `<path>#<id>`, or names a path outside the project, is `project.invalid-value` when the manifest is read;
- a file that does not exist, or does not declare the theme, is `project.invalid-value` on the value when the project is compiled.

The schema SHALL describe the field. Diagrams of the project without `theme` SHALL use the default theme (see `project-compilation`).

#### Scenario: Built-in default theme
- **WHEN** `project.json` has `"theme": "editorial.light"`
- **THEN** no diagnostic is reported and the manifest's theme is `editorial.light`

#### Scenario: Theme in a project file
- **WHEN** `project.json` has `"theme": "themes/company.meltemi#corporate"` and that file declares `theme corporate`
- **THEN** no diagnostic is reported

#### Scenario: Missing theme
- **WHEN** `project.json` has `"theme": "themes/company.meltemi#nope"`
- **THEN** `project.invalid-value` is reported on the value, naming `nope` and listing the themes of the file

#### Scenario: Malformed value
- **WHEN** `project.json` has `"theme": "corporate"`
- **THEN** `project.invalid-value` is reported, with the hint to use a built-in name or `<path>#<theme id>`

### Requirement: Icon aliases
`project.json` SHALL accept an optional `"icons"` object mapping alias names to pack prefixes, such as `{ "cloud": "aws" }`. An alias SHALL match `[a-z0-9][a-z0-9-]*`. An alias equal to a pack prefix, or a target that is not a pack, SHALL be `project.invalid-value` on the entry. A value that is not a string SHALL be `project.invalid-value` when the manifest is read. The schema SHALL describe the field.

#### Scenario: Alias
- **WHEN** `project.json` has `"icons": { "cloud": "aws" }` and the project has an `aws` pack
- **THEN** `cloud:lambda` resolves to `aws:lambda` and no diagnostic is reported

#### Scenario: Alias to nothing
- **WHEN** `project.json` has `"icons": { "cloud": "gcp" }` and there is no `gcp` pack
- **THEN** `project.invalid-value` is reported on `"gcp"` listing the packs

### Requirement: Catalog settings
`project.json` SHALL accept an optional `catalog` object with `title` (non-empty string),
`description` (string), `out` (a relative path inside the project: a folder or a `.html` file),
`exclude` (relative paths of folders or files, or `<file>#<id>` for one block) and `source`
(boolean, false by default). A wrong type, an absolute path or a path that leaves the project SHALL
be `project.invalid-value`; an unknown setting SHALL be `project.unknown-field` (warning). The
schema SHALL describe the object.

#### Scenario: Valid settings
- **WHEN** `catalog` is `{ "title": "Shop", "exclude": ["drafts", "diagrams/a.meltemi#x"] }`
- **THEN** no diagnostic is reported and the catalog's title is `Shop`

#### Scenario: Output outside the project
- **WHEN** `catalog.out` is `"../site"`
- **THEN** `project.invalid-value` is reported on the value

### Requirement: Plugin installation settings
project.json SHALL accept an optional `plugins` object mapping plugin names (lower-case words) to
`{ "path", "version", "permissions" }`: a folder inside the project, an exact version and a subset
of `diagram-types` and `icons`. Paths outside the project, inexact versions and unknown permissions
(including `network`) SHALL be `project.invalid-value`; the schema SHALL describe the field.

#### Scenario: Network permission
- **WHEN** project.json grants a plugin `"network"`
- **THEN** `project.invalid-value` says that it cannot be granted

### Requirement: The cloud field
`project.json` MAY carry `cloud`, an object with `host` (an `https:` address, or `http:` on
`127.0.0.1`, `localhost` or `[::1]`) and `project` (the cloud project's id); `mdg push --create` and `mdg pull` write
it; any other shape SHALL be `project.invalid-value` with a hint naming both keys; the schema
SHALL document it.

#### Scenario: Written by push
- **WHEN** `mdg push --create` succeeds
- **THEN** `project.json` holds `"cloud": { "host": …, "project": … }` with its formatting kept

#### Scenario: Added by pull to a CRLF manifest
- **WHEN** `mdg pull` adds `cloud` to a `project.json` with CRLF line endings and four-space indentation
- **THEN** the field is one line in that indentation with CRLF endings and nothing else of the file changes

#### Scenario: A wrong shape
- **WHEN** `cloud` is `"abc"` or lacks `project`
- **THEN** validation reports `project.invalid-value` naming `host` and `project`

