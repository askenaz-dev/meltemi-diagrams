# automatic-main-releases Specification

## Purpose
TBD - created by archiving change automatic-main-releases. Update Purpose after archive.

## Requirements

### Requirement: Only successful main push CI authorizes delivery

The system SHALL validate the CI run through GitHub's API and deliver its exact SHA from the same
repository's main history. Dispatch SHALL require a CI run id and main as its workflow ref.

#### Scenario: Recovery cannot bypass CI

- **WHEN** a run is failed, pending, from a pull request, another workflow, branch or repository
- **THEN** delivery fails before version reservation, deployment or publication

#### Scenario: A source predates automatic delivery

- **WHEN** a historic CI run predating automatic-release.mjs is requested
- **THEN** delivery refuses it explicitly and points to its original release execution and artifacts

#### Scenario: A supported historical source is recovered

- **WHEN** a valid CI run from the automatic-delivery era is recovered
- **THEN** trusted delivery code from the workflow revision operates on its separate exact source checkout

### Requirement: Versions follow source order and tags are immutable

The system SHALL assign versions using stable first-parent anchors and distance, preserve the version
of an already tagged SHA, and stamp only the disposable build checkout. It SHALL reject collisions.

#### Scenario: CI finishes out of order

- **WHEN** a newer commit publishes before an older successful CI run is processed
- **THEN** the older source receives a lower version and cannot replace latest in any channel

#### Scenario: Recover a partial publication

- **WHEN** publication is retried for the same SHA
- **THEN** its tag and version are reused, existing packages remain unchanged, and missing channels proceed

### Requirement: Channels publish independently from one checked build

The system SHALL publish npm, Marketplace, Open VSX and GitHub independently after release:check,
using one artifact with source/CI provenance. The summary SHALL fail if any channel fails.

#### Scenario: Open VSX has no token

- **WHEN** OVSX_PAT is absent
- **THEN** Open VSX explicitly fails while the other publishing jobs may complete

#### Scenario: Marketplace trusted publishing

- **WHEN** Marketplace runs
- **THEN** VSCE uses OIDC without a PAT or GitHub environment and the job can request an identity token

### Requirement: npm provenance retains authentic runner identity

Publication SHALL retain the runner's GitHub SHA/ref and OIDC coordinates with provenance enabled.
New source capabilities SHALL record the product repository/SHA/tag separately in package and
release metadata, which MUST match the checked plan before any npm publication.

#### Scenario: Product source differs from workflow revision

- **WHEN** a historical CI source is published by a newer workflow revision
- **THEN** the npm signing environment retains the workflow runner's authentic SHA/ref
- **AND** product source metadata identifies the checked source without replacing signing claims

#### Scenario: Package source disagrees with its checked plan

- **WHEN** a new-format tarball has missing or different product source metadata
- **THEN** publication fails before publishing any package

#### Scenario: Recover source predating package metadata

- **WHEN** the checked source does not contain the package-source capability marker
- **THEN** recovery adds neither new package metadata nor a new release-manifest field
- **AND** source/CI provenance remains unchanged; byte-preserving recovery reuses the original artifact

### Requirement: Hosted deployment follows validated current main

The system SHALL deploy only after successful push CI and SHALL skip a source superseded by main.
CI and delivery queues SHALL preserve pending runs up to GitHub's documented 100-run queue limit.
Both Worker deployment configurations SHALL preserve the observability and invocation logging
already declared by the family's Terraform, avoiding alternating infrastructure drift.

#### Scenario: Older CI completes after a newer push

- **WHEN** deploy reaches its mutation boundary and main no longer names its source SHA
- **THEN** no migration or Worker deployment runs for that source

#### Scenario: Deploying a Worker preserves infrastructure observability

- **WHEN** delivery fills the deployment configuration with Terraform's resource identifiers
- **THEN** both cloud and publish Workers retain enabled observability, logs and invocation logs
