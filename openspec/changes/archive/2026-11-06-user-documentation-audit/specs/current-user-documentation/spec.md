## ADDED Requirements

### Requirement: Audit every published guide in both languages

The documentation SHALL maintain equivalent user-facing English and Spanish guides across the
published inventory. Each audit SHALL record per-page implementation sources, findings and fixes
or a reason that no change is needed. Normative public language/API contracts SHALL remain
precise, including actual limitations and diagnostics.

#### Scenario: A guide has a translated title but stale instructions

- **WHEN** the English and Spanish bodies differ in supported behaviour, setup or navigation
- **THEN** both bodies are reconciled against the implementation rather than relying only on
  matching heading levels and fenced code

### Requirement: User commands work outside the source repository

User guides SHALL show installed CLI commands and current extension installation. Repository-only
build, test and developer-start commands SHALL not appear as ordinary product usage instructions.
Valid SDK installation and CI examples for the user's own project SHALL remain available.

#### Scenario: A user copies a validation command into their project

- **WHEN** the published guide shows how to validate a diagram with the installed CLI
- **THEN** the command uses `mdg` or `meltemi-diagrams` and does not require this repository's
  private `pnpm mdg` script

#### Scenario: A user installs the extension

- **WHEN** the user follows the installation guide
- **THEN** it uses the real published extension identifier or the latest-release VSIX workflow,
  without a fixed obsolete artifact filename

### Requirement: Separate product guidance from private implementation

Public guides SHALL explain current workflows, supported capabilities, safety, public API and
limits. Private implementation topology, database schemas, source-build deployment steps and
test/benchmark procedures SHALL be kept in internal documentation with valid links.

#### Scenario: A developer integrates the public API

- **WHEN** they read the cloud reference
- **THEN** authentication, routes, errors, limits and MCP contracts remain available without
  requiring repository-private interfaces or deployment configuration

#### Scenario: A maintainer follows an extracted reference

- **WHEN** an existing internal reference points to extracted implementation material
- **THEN** its file and heading resolve in the repository
