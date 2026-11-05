# Proposal: Copyable local installation

## Why

The local guide starts with an instruction to find and extract a release on another page. It
omits the commands that get the person to `compose.yaml`. The owner requested a direct installation
sequence. This is a post-1.0 documentation correction outside `docs/roadmap-1.0.md`.

## What Changes

- Give both guides one copyable clone, change-directory and Compose startup block.
- Pin the clone to a published release that includes the local distribution.
- State Git/Docker prerequisites, supported containers, the editor URL and working directory.

## Capabilities

- Modify `local-installation`: the bilingual guide starts from a terminal outside the repository.

## Non-goals

- Public OCI image and installer distribution belong to `delivery`.

## Impact

Only `docs/local-compose.md`, `docs/es/local-compose.md` and the corresponding specification.
The portal consumes these sources through the existing release/deploy workflow.
