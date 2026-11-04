## Why

The owner requests a release for every push to main, without manual version bumps or tags. Today
the web service deploys before CI finishes, tags alone release packages, and a missing Marketplace
credential blocks Open VSX and GitHub after npm has already published.

## What Changes

- Successful push CI on main authorizes delivery of its exact commit, including validated recovery.
- Versions follow first-parent source order; an older CI completing late cannot supersede newer code.
- Immutable tags reserve versions; only the build checkout is stamped, without bot commits to main.
- npm, Marketplace (OIDC), Open VSX and GitHub publish independently from one checked artifact.
- Hosted deployment waits for CI and refuses to roll production back to a superseded main commit.

## Capabilities

### New Capabilities

- `automatic-main-releases`: source-ordered versions, CI authorization, independent delivery and recovery.

## Impact

The three workflows, delivery scripts and their tests, the version stamper, VSCE's pinned tool version
and lockfile, and release/contribution documentation. No product feature or language version changes.
The owner's request authorizes implementation; publishing and merging are separate operations.
