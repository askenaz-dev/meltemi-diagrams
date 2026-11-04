## Context

The Release workflow already validates successful main push CI, builds once and shares its
artifact among four channels. Rebuilding a previous source is insufficient for byte reproducibility:
pnpm's workspace dependency conversion changed package.json key order in production.

## Decisions

1. Add optional dispatch `release_run_id`, alongside the mandatory successful `ci_run_id`. Keep
   the existing check job and publishers. Artifact recovery skips build/install steps.
2. Validate the selected run against the repository's Release workflow id/path, main branch,
   repository identities, completion and a commit in main history. Select its first matching
   checked artifact; require the check job of that attempt to have succeeded. Refuse expired or
   ambiguous artifacts. Verify the downloaded ZIP's SHA-256 against GitHub's artifact API.
3. Require flat regular files, a complete nineteen-package/VSIX manifest, exact source/version/tag,
   repository and CI provenance, file sizes/hashes, and matching package source capability. Preserve
   artifact bytes; update only the private delivery plan's latest promotion eligibility.
4. Run a shared local integrity preflight before artifact upload for every release. Recovery also
   requires existing npm integrity and GitHub asset digests to match before any channel can publish.
   Fresh deliveries retain independent channels: npm performs its complete package preflight before
   its first write. Publishers retain their checks against races. API errors never mean absence.
5. Keep 1.10.17's immutable conflicting bytes. Document its incident and prefer the subsequent
   complete release; neither overwrite assets nor relax integrity comparisons.

## Validation

Fixtures cover wrong workflow/repository/source/CI/attempt, expired artifacts, archive corruption,
unsafe paths, metadata and file hash mismatch, existing publication conflicts and all-valid reuse.
Publication fixtures prove a mismatch in a late npm package prevents all writes. Workflow tests
require preflight before upload and check as the dependency of every publisher. Verify a real
already-published complete release through recovery after the fix reaches main.
