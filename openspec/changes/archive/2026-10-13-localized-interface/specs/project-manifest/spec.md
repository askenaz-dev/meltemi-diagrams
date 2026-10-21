## MODIFIED Requirements

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
