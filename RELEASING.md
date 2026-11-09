# Releasing

Every successful **push CI on main** starts release and hosted deployment automatically. Nobody
bumps patch versions, commits generated versions, or pushes release tags by hand. Twenty npm
packages, CLI and VS Code extension share one product version. Language/model/renderer versions
remain separate contracts.

## Source and version

`release.yml` validates the CI run through GitHub's API: the repository's `ci.yml` id and path,
completed/success, push, main, and matching repository/head repository. PR CI cannot authorize
delivery. The source SHA must be on main's first-parent history. Trusted delivery scripts are
checked out at the workflow revision separately from the exact CI source.

A version tag at that SHA is reused. Otherwise the nearest stable first-parent tag is the base;
each first-parent commit adds one patch. Two commits after `v1.10.0` become `1.10.1` and `1.10.2`,
even when the second CI finishes first. Failed/skipped commits can leave gaps. Merge commits count
once. A higher declared version opens a new base at its introduction: `1.11.0` starts that line,
but a declaration of `1.10.1` cannot reset an automated `1.10.50` trajectory. A tag inside the same
declared-version era is authoritative; later declarations take the higher of the two trajectories.

Delivery reserves an immutable `v<version>` tag at the CI SHA, then stamps manifests, CLI and skills
only in the disposable checkout. It never writes commits to main or moves an existing tag. A
collision or inconsistent version history fails before publication.

`pnpm release:check` builds, packs, installs tarballs into an empty directory, tests the CLI and
packages the VSIX. One checked artifact feeds all four channels. Its name includes source SHA,
version, workflow run and attempt. Notes identify the source, CI and commit range. VSIX packaging
sets `SOURCE_DATE_EPOCH` to the source commit's timestamp so checkout mtimes do not change its bytes.

CI/release/deploy use `queue: max` without cancellation. GitHub allows **100 pending runs per group**;
overflow is canceled by GitHub and needs recovery. Queue arrival is not source order, so versions
derive from Git history instead of CI completion time.

## Publishing channels and configuration

Installation guides resolve GitHub's `latest` release and clone that exact tag. They do not
embed a version number or choose the highest Git tag: delivery reserves tags before publication.
GitHub excludes drafts and prereleases from `latest`.

The current main-push automation publishes full releases. Separate `stable` and `preview` tracks
remain delivery work to define before introducing prereleases: stable as the default installation,
explicit preview opt-in, SemVer prerelease names, matching npm/gallery channels and promotion
after validation. Every approved main push must still produce a release; publishing a preview
must not move the stable/default pointer. This documentation correction does not change that
publication policy. See [GitHub's release rules](https://docs.github.com/en/rest/releases/releases#create-a-release).

npm, Visual Studio Marketplace, Open VSX and GitHub run independently after the build. The final
summary fails if any channel is incomplete. The family's Terraform in Meltemi Web supplies
deployment configuration from its `infrastructure` environment, and `NPM_TOKEN` until npm's trusted
publishers replace it. npm and both extension registries use separate GitHub OIDC registrations.

After the GitHub release, **tell the web** starts Meltemi Web's deploy, whose documentation portal
at docs.meltemi.dev builds from each product's latest release. It reads `WEB_DISPATCH_TOKEN`, the
narrow token (Actions read and write on `meltemi-web` only) that Web's Terraform places here, never
its admin token. Until the owner creates it the job warns and passes, and the portal updates on the
web's next deploy. It is not a publishing channel, so the summary leaves it out.

- **npm:** each of the twenty packages names a trusted publisher in npmjs.com → the package →
  **Settings** → **Trusted publishing** → **GitHub Actions**: **Organization or user**
  **askenaz-dev**, **Repository** **meltemi-diagrams**, **Workflow filename** **release.yml**,
  **Environment name** **npm**, and the allowed actions **npm publish** and **npm dist-tag**. The
  job uses that GitHub environment, restricted like `open-vsx` to one **Branch: main** rule,
  `id-token: write` and npm 11.21.1, which exchanges the job's identity for `publish` and for
  `dist-tag`. npm tries that identity first and uses `NPM_TOKEN` (a granular token for the
  `meltemi` organization with publish/dist-tag rights and the automation bypass of two-factor
  authentication) only for a package the registry does not trust yet; the job's log counts the
  packages published each way and names those still on the token. Packages publish under
  `release-<version>` first; latest advances only after every tarball is present, and never to a
  lower version. Existing versions must match the local tarball's SHA-512 integrity. Publication
  includes provenance.
- **Marketplace:** publisher **meltemi**, Trusted Publishing policy with owner **askenaz-dev**,
  repository **meltemi-diagrams**, workflow **release.yml**, **Environment empty**. The job has no
  environment and uses `id-token: write` with pinned `@vscode/vsce@4.1.0 publish --oidc`.
  There is no `VSCE_PAT`; the installed CLI exposes `--oidc` and `--skip-duplicate`.
- **Open VSX:** verified namespace **meltemi**, extension **meltemi-diagrams-vscode**. In Open VSX
  Settings → Trusted Publishers register GitHub owner **askenaz-dev**, repository
  **meltemi-diagrams**, workflow filename **release.yml**, environment **open-vsx**. Configure
  that GitHub environment's deployment branches as **Selected branches and tags**, with one
  **Branch: main** rule and no tag rules. The job uses that environment, `id-token: write` and
  pinned `ovsx@1.3.0 publish --trusted-publishing --skip-duplicate` on Node 24. The registry
  exchanges the job identity for a short-lived token scoped to this extension. `OVSX_PAT` is
  never set in that step: a PAT would take precedence over OIDC. Missing/mismatched registration or identity
  fails this channel; an existing version is a successful retry. Other channels remain independent.
- **GitHub:** create a draft, upload and verify every required asset digest, then publish. A partial
  draft can be completed. A public release is read-only; missing/different assets fail instead of
  overwriting immutable content. Historical versions never replace latest.

See [Marketplace trusted publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing),
[Open VSX trusted publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing),
and [GitHub concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).

Open VSX registration requires namespace ownership (contributor access is insufficient), the
publisher agreement and an existing extension with an active version. The first publication
therefore needs a token, and the release job does it: when the registry's public API has no
extension with the VSIX's identifier, a separate step publishes that version with `OVSX_PAT`,
which Terraform distributes, and leaves a notice to register the trusted publisher. Once it is
registered, later versions publish through OIDC. The namespace claim
[was granted](https://github.com/EclipseFdn/open-vsx.org/issues/15211). Deleting every version
of the extension disables its registration, and the next release bootstraps it again. The `open-vsx` environment restriction is intentional: without an environment,
the registry trusts any ref running the registered workflow. Recovery dispatched from main uses
the same identity and original checked VSIX; it does not restore the old PAT-based job.

npm registers a trusted publisher only for a package that exists, and a new registration expires
unless a publication uses it within two days, so a release follows the registrations soon after
they are saved. `npm trust github` sets everything but the dist-tag permission, which only the web
form grants. `NPM_TOKEN` retires once a release's npm job reports all twenty packages through
trusted publishing: in each package's **Settings** → **Publishing access** choose **Require
two-factor authentication and disallow tokens**, remove the token from Meltemi Web's Terraform and
its `infrastructure` environment, and revoke it in npmjs.com → **Access Tokens**. From then on a
package without a matching registration fails the npm channel instead of falling back. The `npm`
environment restriction is intentional for the same reason as Open VSX's. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers).

npm's publishing child process preserves the runner's actual `GITHUB_SHA`, `GITHUB_REF` and OIDC
identity. Sigstore verifies them against the signing certificate; substituting a product tag or
historical source causes npm E422. The signed workflow revision and product source may differ
during recovery. Deterministic `meltemiRelease` metadata inside each new npm tarball and `source`
inside the release manifest identify the checked product repository/SHA/tag separately.
`provenance.json` additionally records the successful CI run; `delivery-plan.json` holds per-attempt
decisions and is not a GitHub release asset. New plans require matching package source metadata;
original artifacts created before this correction remain recoverable, with their product source
identified by their existing provenance file. Recovery checks for `scripts/package-source.mjs`
in the product source SHA, not the delivery checkout: rebuilding an older source adds neither
package metadata nor a new release-manifest field. Packaging can still change dependency key order;
only reuse of the original artifact preserves its checked bytes. Provenance stays enabled.

## Recovery

Use **Re-run failed jobs** while the checked artifact exists and the existing workflow code needs
no correction. To use current delivery code, dispatch **Release** from **main**, giving both the
original successful **CI run id** and the **Release run id** holding the checked artifact:

```bash
gh workflow run release.yml --ref main -f ci_run_id=123456789 -f release_run_id=234567890
```

Dispatch repeats API/source checks; it cannot bypass failed CI. Artifact recovery validates the
Release workflow/repository/main commit, the original successful check attempt, GitHub's ZIP digest,
the source/CI metadata, all twenty package identities and every manifest file hash. It skips the
build and reuses the original bytes. A missing, expired or inconsistent original artifact fails;
a later rebuilt attempt is never silently substituted.

Every delivery checks local artifact integrity before its publishing jobs. Recovery also verifies
existing npm integrity and GitHub asset digests at that shared boundary, so a conflict stops all
channels before mutation. Fresh deliveries keep independent channels: npm checks every existing
package before its first publication, without making other channels depend on npm availability.
Older recovery does not move latest backwards.

Omitting `release_run_id`, or rerunning all jobs, rebuilds the source and reuses its version/tag.
Rebuilt bytes can differ even when the source is identical; existing-source preflight rejects that
conflict. Prefer artifact recovery. Never move a tag or overwrite a published version: fix main and
let the next source release follow.

### Historical 1.10.17 incident (2026-11-03)

The first release run [41692700620](https://github.com/askenaz-dev/meltemi-diagrams/actions/runs/41692700620)
published the extension and GitHub assets but npm signing failed. Recovery run
[41696521732](https://github.com/askenaz-dev/meltemi-diagrams/actions/runs/41696521732) used corrected
signing coordinates and rebuilt the same source. `pnpm pack` reordered dependency keys in eleven
package manifests; parsed JSON, all code/assets, the VSIX and source provenance remained identical.
GitHub rejected the changed release manifest. Recovery was cancelled during independent npm upload:
18 of 19 packages reached npm, with `@meltemi/diagrams-render` missing. Ten published tarballs differ
in bytes from the original GitHub manifest. No npm latest pointer was promoted to that incomplete
set. These immutable historical packages/assets are preserved; the subsequent complete release is
the supported distribution. Recovery of either 1.10.17 artifact must reject those conflicts instead
of replacing published bytes or relaxing integrity checks.

**Migration boundary:** this dispatcher rejects sources predating `automatic-release.mjs`, including
the partial **1.10.0** release. Recover that through its original execution and original artifacts.
Do not rebuild 1.10.0 from today's main or claim the new dispatcher repairs its former PAT-based
publishing step. Adapting that separate recovery to OIDC is a separate operation.

## Hosted deployment

`deploy.yml` independently consumes successful main push CI. It checks out that exact source,
derives/stamps the same version without reserving a tag, builds the web app and checks main again
immediately before migrations/uploads. Superseded sources are skipped. Marketplace failure does not
block the service. A push arriving after this final check is processed by its own later CI;
serialization prevents older completed CI from overtaking newer deployed runs.

Before production, the same source goes to staging: `meltemi-diagrams-staging` and
`meltemi-diagrams-publish-staging` (https://staging.diagrams.meltemi.dev, staging.meltemi.page),
their own database, bucket and OAuth namespace, then `pnpm acceptance:mcp` against them. All 35
steps and fixture cleanup must pass before production. Missing hosts, credentials or prerequisites
fail the gate rather than reducing its coverage. After production deploys, the same complete suite
and cleanup run against it too; their results are retained in the deployment's acceptance artifacts.

Recovery accepts `ci_run_id` from main with the same checks; its source must still be current main.
Rollback is a revert on main that passes CI, or an explicit Cloudflare rollback with the owner.
There is no unchecked rollback workflow input. Worker rollback does not undo D1 migrations; schema
changes must remain compatible during rollout.

## Before merging

Run `pnpm typecheck`, `pnpm lint` and `pnpm test`. Export/layout changes also run `pnpm acceptance`
and `pnpm conformance`; editor changes run the suites in [CONTRIBUTING.md](CONTRIBUTING.md). Keep
user-facing changes in `CHANGELOG.md`. A deliberate minor/major baseline is set with
`pnpm release:version <x.y.z>` in its reviewed change, never by delivery writing back to main.
