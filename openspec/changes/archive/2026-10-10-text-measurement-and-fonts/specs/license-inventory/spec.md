## ADDED Requirements

### Requirement: Generated inventory
`pnpm licenses:inventory` SHALL write `THIRD_PARTY_LICENSES.md` listing every production dependency of the workspace packages: name, version, license and homepage. Fonts SHALL carry a note that they are embedded in exported files under their license. `pnpm licenses:inventory --check` SHALL exit with 1 and name the differences when the file is stale, and CI SHALL run it.

#### Scenario: Fonts listed
- **WHEN** the inventory is generated
- **THEN** it lists `@fontsource/inter`, `@fontsource/ibm-plex-sans`, `@fontsource/cascadia-mono` with `OFL-1.1` and the embedding note, and `fontkit` with `MIT`

#### Scenario: Stale inventory
- **WHEN** a production dependency is added and `--check` runs before regenerating
- **THEN** the command exits with 1 and names the missing package
