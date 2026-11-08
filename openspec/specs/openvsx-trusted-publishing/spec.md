# openvsx-trusted-publishing Specification

## Purpose
TBD - created by archiving change openvsx-trusted-publishing. Update Purpose after archive.

## Requirements

### Requirement: Open VSX trusts a constrained release identity

The Open VSX publishing job SHALL request GitHub OIDC with `id-token: write` in environment
`open-vsx`, restricted to `main`. Its registry registration SHALL name `askenaz-dev`,
`meltemi-diagrams`, `release.yml` and `open-vsx` for `meltemi.meltemi-diagrams-vscode`. When the
registry already has the extension, the pinned CLI SHALL require trusted publishing and SHALL NOT
receive a personal access token.

#### Scenario: A checked main release publishes

- **GIVEN** namespace ownership, the publisher agreement, an active extension and the matching registration
- **WHEN** a main release passes its existing CI authorization and artifact preflight
- **THEN** Open VSX exchanges that job's OIDC identity and publishes the checked VSIX

#### Scenario: The identity or registration is unavailable

- **WHEN** OIDC cannot be obtained or the registry registration does not match, for an extension
  the registry already has
- **THEN** the Open VSX job fails, without falling back to a PAT
- **AND** other independent publication channels can still complete

#### Scenario: An unapproved ref requests the environment

- **WHEN** a workflow ref other than `main` requests environment `open-vsx`
- **THEN** the environment's deployment branch policy prevents that job from publishing

### Requirement: The first version of an extension publishes with the namespace token

A registration needs an extension with an active version. The Open VSX job SHALL ask the
registry's public API whether the VSIX's extension exists. When it does not, a separate step SHALL
publish that version with the namespace token `OVSX_PAT` and ask for the trusted publisher to be
registered; no other step SHALL receive the token.

#### Scenario: The extension is new or was removed

- **WHEN** the registry's public API answers that the VSIX's extension does not exist
- **THEN** the job publishes that version with `OVSX_PAT` and asks for the trusted publisher to be
  registered
- **AND** once it is registered, the next version of that extension publishes through OIDC

#### Scenario: The registry cannot be asked

- **WHEN** the registry's answer is neither found nor missing
- **THEN** the Open VSX job fails without publishing

### Requirement: Checked artifact recovery preserves duplicate handling

Open VSX SHALL consume the same checked artifact as the other release channels for new
deliveries and recovery. An already published version SHALL complete successfully; other
publishing failures SHALL remain failures.

#### Scenario: The original artifact is retried

- **WHEN** recovery validates the original artifact and its version already exists on Open VSX
- **THEN** the channel completes without rebuilding or replacing the extension

#### Scenario: A publication fails for another reason

- **WHEN** the CLI reports authentication, transport or validation failure
- **THEN** the channel and final release summary fail
