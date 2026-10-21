## ADDED Requirements

### Requirement: Size and complexity limits
Sources SHALL be refused above 2 Mi characters (`limit.too-large`); diagrams with more than 5,000
elements, 10,000 relations or 10,000 sequence events SHALL be reported (`limit.too-complex`) and not
drawn; a project SHALL compile at most 2,000 sources and report the rest (`limit.too-many-files`);
project.json and plugin manifests SHALL be refused above 1 Mi characters. Asset limits (icons,
images, fonts) SHALL stay as they are.

#### Scenario: Oversized diagram
- **WHEN** a diagram declares 5,001 elements
- **THEN** `limit.too-complex` is reported and the diagram is not drawn

### Requirement: No code and no network
Opening, validating, previewing or exporting a project SHALL run none of its code and fetch
nothing; exported player pages SHALL carry a content security policy that forbids requests, as
catalogs do.

#### Scenario: Player page
- **WHEN** a story is exported as an HTML player page
- **THEN** the page declares `default-src 'none'`

### Requirement: Errors without secrets
Unexpected errors of the command line SHALL be printed without the values of secret-looking
environment variables and without a stack unless `MELTEMI_DEBUG` is set, with exit code 70.
`docs/security.md` SHALL state every guarantee and limit.

#### Scenario: Key in an error
- **WHEN** an unexpected error message contains the value of `ANTHROPIC_API_KEY`
- **THEN** the printed message shows `[redacted]` instead
