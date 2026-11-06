# Proposal: Copyable local installation

## Why

The local guide starts with an instruction to find and extract a release on another page. It
omits the commands that get the person to `compose.yaml`. The owner requested a direct installation
sequence. This is a post-1.0 documentation correction outside `docs/roadmap-1.0.md`.

## What Changes

- Give both guides copyable Bash/PowerShell commands to resolve `latest`, clone its published tag,
  change directory and start Compose, without embedding a version number.
- State Git/Docker prerequisites, supported containers, the editor URL and working directory.
- Record the stable/preview delivery follow-up without changing publication policy.

## Capabilities

- Modify `local-installation`: the bilingual guide starts from a terminal outside the repository.

## Non-goals

- Public OCI image and installer distribution belong to `delivery`.

## Impact

`docs/local-compose.md`, `docs/es/local-compose.md`, `RELEASING.md` and the corresponding specification.
The portal consumes these sources through the existing release/deploy workflow.
