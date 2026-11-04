## Decisions

1. Trust the GitHub API, not a dispatch input or an artifact. Require the repository's `ci.yml` id
   and path, name CI, completed/success, push, main, same repository and head repository. The SHA
   must be on main's first-parent history. Dispatch is allowed only from main. Delivery code is
   checked out at `github.workflow_sha` separately from the exact source SHA, so old CI runs can
   be recovered without mixing revisions. Sources predating this mechanism, including legacy
   1.10.0, are rejected; recover those using their original execution and artifacts.
2. Keep every main CI and serialize release/deploy with `queue: max`, cancellation disabled. GitHub
   queues at most 100 pending runs; overflow needs recovery, not a false promise of unbounded delivery.
3. Reuse a stable version tag at the source SHA. Otherwise, start at the nearest stable tag on its
   first-parent history and add first-parent distance to its patch. A higher declared version opens
   a new base at the first commit of its contiguous declaration; add distance from that base. This
   makes delayed CI safe even for marketplaces that choose the greatest semver automatically.
   Reject collisions, unsafe integers and inconsistent legacy version history; never move tags.
   A tag within the same declaration era resets its distance. A declaration introduced after the
   tag takes the higher of its own and the ancestor tag's version trajectories.
4. Stamp all manifests, CLI constants and skill copies only in the source checkout. Build once with
   release:check; put provenance and notes beside the checked files in an artifact named by source
   SHA, version, workflow run and attempt. No bot commits or pushes to main. npm provenance keeps
   the runner's authentic SHA/ref and OIDC identity: Sigstore verifies those against its
   certificate. Product source SHA/tag/repository are recorded separately in deterministic
   `meltemiRelease` package metadata and the checked release manifest. New artifact plans require
   that metadata. A source capability marker (`scripts/package-source.mjs`) keeps a recovery build
   of older source from adding metadata; byte-preserving recovery reuses the original artifact
   because pnpm may reorder dependency keys during a rebuild. Those releases
   retain their original source/CI provenance file.
5. Independent publishing jobs consume that artifact. npm uses a version-specific dist-tag first
   and promotes latest only when safe; GitHub marks historical releases non-latest. Missing OVSX
   credentials fail only that channel. Existing npm bytes must match registry integrity. GitHub
   builds/verifies a draft before publication, and checks published assets without modifying them.
   An always-running summary fails unless all channels passed.
6. Marketplace uses VSCE 4.1.0 and `--oidc`, `id-token: write`, with no environment. The publisher's
   policy must name askenaz-dev / meltemi-diagrams / release.yml, with Environment empty. No PAT.
7. Deployment separately validates CI and checks the current main SHA immediately before mutations.
   A superseded commit is recorded as skipped. It stamps the same version without reserving a tag.
   Both Wrangler configurations preserve Terraform's enabled observability, logs and invocation
   logs so deploying source does not disable the infrastructure's logging settings.
   Migrations then precede both Worker deployments;
   rollback remains a deliberate Cloudflare operation, not an unchecked workflow bypass.

## Evidence

- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing

## Validation

Git fixtures cover ordered and out-of-order CI, retries, manifest bases, annotated/lightweight tags,
collisions and branch exclusion. API fixture tests cover every authorization predicate. Workflow
tests enforce exact checkout, independent channels, no Marketplace environment, summary and queues.
Run typecheck, lint, tests and packaging checks appropriate to the changed VSCE dependency.
