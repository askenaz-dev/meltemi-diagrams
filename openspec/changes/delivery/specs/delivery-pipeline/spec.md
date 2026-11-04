## ADDED Requirements

### Requirement: Continuous integration
`.github/workflows/ci.yml` SHALL run on every push to `main` and every pull request: a `check`
job on Node 22 and 24, on `ubuntu-latest` and `windows-latest`, that installs with
`pnpm install --frozen-lockfile` and runs `pnpm typecheck`, `pnpm lint`,
`pnpm licenses:inventory --check`, `pnpm test`, `pnpm build`, the corpus validations and an
export; a `browser` job on `ubuntu-latest` that runs `pnpm playground:test-browser`,
`pnpm player:test-browser`, `pnpm catalog:test-browser` and `pnpm vscode:test-webview`; and a
`cloud` job on `ubuntu-latest` that runs `pnpm cloud:test-browser`. Runs SHALL be grouped by
ref with cancellation of the superseded run, with `permissions: contents: read`. The workflow
SHALL deploy nothing, publish nothing and name no secret.

#### Scenario: A pull request
- **WHEN** a pull request is opened
- **THEN** the four `check` jobs, the `browser` job and the `cloud` job run, and the pull request shows each as a check

#### Scenario: A lockfile out of date
- **WHEN** a push changes a `package.json` without updating `pnpm-lock.yaml`
- **THEN** the install step fails naming the lockfile and no later step runs

#### Scenario: A secret added to the workflow
- **WHEN** `ci.yml` is edited to read `${{ secrets.NPM_TOKEN }}`
- **THEN** the workflow test fails naming the secret

### Requirement: Deployment on every push to main
`.github/workflows/deploy.yml` SHALL run on every push to `main` and on `workflow_dispatch`, in
the `production` environment the family's Terraform made, one run at a time without
cancellation, and SHALL write the ids of the environment's variables `D1_DATABASE_ID` and
`SECRETS_STORE_ID` into both configurations (`scripts/deploy-config.mjs`, which writes
`wrangler.deploy.json` and `wrangler.publish.deploy.json` and refuses to leave a placeholder),
build the playground, apply the D1 migrations to the remote database
(`wrangler d1 migrations apply DB --remote`), and upload the main Worker and then the publish
Worker with `wrangler deploy`, with `CLOUDFLARE_API_TOKEN` (the deploy token Terraform placed) as
its only secret and `CLOUDFLARE_ACCOUNT_ID` as a variable. The workflow
SHALL run no `wrangler secret` command and create no resource; Worker secrets SHALL NOT appear
in the repository or the workflow. A failed step SHALL end the run before the steps after it.
On `workflow_dispatch` with a version id as input it SHALL run `wrangler rollback` to it
instead.

#### Scenario: A push to main
- **WHEN** a commit reaches `main`
- **THEN** the migrations are applied and both Workers' versions are uploaded, in that order, and the run's log names each version

#### Scenario: An id missing from the environment
- **WHEN** the workflow runs without `D1_DATABASE_ID`
- **THEN** `deploy-config.mjs` fails naming `D1_DATABASE_ID` and nothing is migrated or uploaded

#### Scenario: A failed migration
- **WHEN** `wrangler d1 migrations apply DB --remote` fails
- **THEN** neither Worker is uploaded and the versions serving before the push keep serving

#### Scenario: A secret command in the file
- **WHEN** the workflow test reads `deploy.yml`
- **THEN** the only `secrets.` reference is `CLOUDFLARE_API_TOKEN`, and the file contains no `wrangler secret`, `FORMS_SECRET`, `IDENTITY_EVENTS_SECRET` or `ADMIN_SUBS`

#### Scenario: A rollback
- **WHEN** the workflow is dispatched with a version id
- **THEN** `wrangler rollback` runs to that version and nothing is uploaded

### Requirement: Release on a version tag
`.github/workflows/release.yml` SHALL run on a tag `v<x.y.z>` and SHALL, in jobs that each need
the previous: fail before publishing anything when the tag's version differs from the manifests'
version; run `pnpm release:check` and keep `release/` as the run's artifact; publish every
tarball of `./release/*.tgz` to npm with `--access public --provenance`, skipping a tarball whose
name and version the registry already has; publish the `.vsix` to the Visual Studio Marketplace
and to Open VSX; and create the GitHub release `v<x.y.z>` with `release/manifest.json`, the
`.vsix` and the changelog entry of the version as its notes. The npm token, the Marketplace token
and the Open VSX token SHALL be the repository secrets the family's Terraform placed
(`NPM_TOKEN`, `VSCE_PAT`, `OVSX_PAT`) and SHALL never be written to a file or the log.

#### Scenario: The tag of the release
- **WHEN** the tag `v1.8.0` is pushed with every manifest at 1.8.0
- **THEN** nineteen tarballs are published with provenance, the extension reaches both marketplaces, and the release `v1.8.0` holds the manifest and the `.vsix`

#### Scenario: A tag that does not match
- **WHEN** the tag `v1.9.0` is pushed while the manifests say 1.8.0
- **THEN** the run fails in its first job, naming both versions, and nothing is published

#### Scenario: A run resumed after a partial publish
- **WHEN** the npm job failed after publishing some tarballs and the run is re-run
- **THEN** the tarballs already on the registry are skipped, the rest are published, and the later jobs run

### Requirement: What the public repository holds
`.gitignore` SHALL exclude `node_modules/`, `dist/`, `packages/vscode/.vscode-test/`,
`packages/vscode/.test-output/`, `release/`, `.wrangler/`, `.dev.vars*` (keeping
`.dev.vars.example`), the owner's scratch folder `mi-prueba/` and the proposal documents
`propuesta-detallada-diagramas-como-codigo.*` and the generated `wrangler.deploy.json` and
`wrangler.publish.deploy.json`; `brand/`, `corpus/`, `gallery/`, `examples/`,
`docs/media/` and `schemas/` SHALL be tracked. A test SHALL read `.gitignore` and fail when one
of the excluded entries is missing.

#### Scenario: After a release check
- **WHEN** `pnpm release:check` and `pnpm vscode:test` have run and `git status` is read
- **THEN** nothing under `release/` or `packages/vscode/.vscode-test/` is untracked or modified

#### Scenario: An entry removed
- **WHEN** `release/` is removed from `.gitignore`
- **THEN** the test fails naming the entry
