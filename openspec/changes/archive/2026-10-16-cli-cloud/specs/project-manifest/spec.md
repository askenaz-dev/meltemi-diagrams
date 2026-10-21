## ADDED Requirements

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
