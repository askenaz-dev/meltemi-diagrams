# Open VSX trusted publishing

## Why

Eclipse has granted ownership of the `meltemi` namespace, and `meltemi-diagrams` has active
versions. Open VSX can now identify the release workflow through GitHub OIDC instead of a
long-lived publishing token.

This is a post-1.0 delivery change outside `docs/roadmap-1.0.md`.

## What changes

- Register `askenaz-dev/meltemi-diagrams`, `release.yml`, environment `open-vsx` in Open VSX.
- Restrict that GitHub environment to `main` and grant the publishing job `id-token: write`.
- Require trusted publishing with the verified `ovsx@1.3.0` CLI and remove its PAT injection.
- Keep checked artifacts, independent channels and duplicate-version recovery.

## Capabilities

- `openvsx-trusted-publishing`: constrained workflow identity for Open VSX publication.

## Non-goals

Version allocation, artifact recovery and hosted deployment belong to `automatic-main-releases`
and `recover-checked-release-artifacts`. Marketplace's existing identity policy stays in that
delivery change.

## Authorization

The owner authorized the branch and pull request after Eclipse verified the namespace. The
owner configures the registration and confirms it before merge and production publication.
