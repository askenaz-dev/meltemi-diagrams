## ADDED Requirements

### Requirement: Recovery reuses an authorized checked artifact

Dispatch MAY select a Release run artifact while still requiring successful main push CI.
Recovery SHALL validate the run, attempt, archive digest, source/CI metadata and manifest before
reusing its bytes. It SHALL NOT rebuild the selected artifact or replace existing published bytes.

#### Scenario: Recover a partial publication

- **WHEN** a completed main Release run has a successful check attempt for the authorized source
- **THEN** recovery reuses that attempt's artifact without rebuilding packages or the VSIX
- **AND** missing channels may continue after publication preflight passes

#### Scenario: Artifact identity or integrity disagrees

- **WHEN** the selected run, archive, source, CI, version, file hash or published content disagrees
- **THEN** the shared check fails before any publishing job starts

#### Scenario: The original artifact expired

- **WHEN** the original checked artifact is expired or unavailable
- **THEN** recovery fails explicitly without silently choosing a rebuilt artifact

### Requirement: Existing publications are checked before channel writes

The shared check SHALL validate local artifact integrity for all releases and existing npm/GitHub
content for recovery. Fresh deliveries SHALL keep independent channels; npm SHALL check all
existing packages before its first write. Immutable conflicts SHALL fail and an older version
SHALL NOT replace a newer latest version.

#### Scenario: A later npm package has a conflict

- **WHEN** earlier packages are missing but a later package already exists with different bytes
- **THEN** npm publishes no package
- **AND** recovery starts no other publishing channel

#### Scenario: Recovery follows a newer release

- **WHEN** the selected artifact predates the current published latest
- **THEN** its bytes remain unchanged and no latest pointer is moved backwards
