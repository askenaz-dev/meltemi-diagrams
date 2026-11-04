## Why

Meltemi Diagrams 1.8.0 is complete and verified on the owner's machine, and nobody can install
it or open it: the repository is not a Git repository, no GitHub repository exists, nothing has
been published to npm or the extension marketplaces, and the cloud service of decisions 0041
and 0042 has never been deployed. The owner decided on 2026-10-20 to go to production, on the
GitHub organisation `askenaz-dev`, the npm organisation `meltemi`, `meltemi.dev` and its
subdomains for the product, `meltemi.page` for published catalogs, and the free plans of GitHub
and Cloudflare, with two rules: every piece of infrastructure configuration is Terraform, and
everything runs as GitHub pipelines, never from a machine. Meltemi Web's `delivery` change holds
the family's Terraform root (`packages/infra` in `C:\meltemi`), which creates this repository
on GitHub, its environment and secrets, the Worker entities, the database, the bucket, the
Custom Domains and the Secrets Store; this change is what the diagrams repository itself must
hold to be built, deployed and released by pipelines onto that infrastructure.

## What Changes

- **A public repository.** `.gitignore` covers what must not be committed (`.vscode-test/`,
  `release/`, the owner's scratch project, Wrangler state); the first commit goes to
  `https://github.com/askenaz-dev/meltemi-diagrams`, the repository Terraform created, and
  every manifest, README and document that named `github.com/meltemi/meltemi-diagrams` names
  the real address (the release test enforces it).
- **The identity package from npm.** `packages/cloud` depends on the published
  `@meltemi/identity` instead of the `link:` to `C:\meltemi`, so the repository installs on any
  machine and in CI.
- **Pipelines.** `ci.yml` runs on every push and pull request, now including the browser
  suites on Linux; `deploy.yml` applies the D1 migrations and uploads both Workers' code with
  `wrangler deploy` on every push to `main`, with the deploy token Terraform placed in the
  `production` environment, and creates no resource and sets no secret; `release.yml` runs the
  release check on a `v<x.y.z>` tag and publishes the npm tarballs with provenance, the
  extension to the Visual Studio Marketplace and Open VSX, and a GitHub release, with the
  tokens Terraform placed.
- **The Workers' configuration is the code's only.** `wrangler.jsonc` and
  `wrangler.publish.jsonc` name the Worker, the bindings with placeholder ids, the variables
  (`PUBLISH_HOST` among them), `workers_dev: false` and `preview_urls: false`; no route, no
  Custom Domain, no account, no secret: those are Terraform's. The deploy workflow writes the ids
  Terraform set as the `production` environment's variables into the uploaded configuration, so
  nobody copies an id.
- **Secrets from the Store.** The main Worker reads `FORMS_SECRET`, `IDENTITY_EVENTS_SECRET`
  and `ADMIN_SUBS` (no longer a variable) from Secrets Store bindings, resolved once per isolate at
  its entry; the strings of `.dev.vars` still win in development and tests; nothing runs
  `wrangler secret put`.
- **Assets outside the Worker's quota.** The main Worker runs first only for the paths it
  answers (`/api`, `/_identity`, `/_published`, `/cli-auth`, `/p`, `/rooms`); every other path
  is served by the assets platform directly, free and unlimited on the free plan, with the two
  headers the Worker added now written by the playground build as `_headers`. The reason
  decision 0041 chose `run_worker_first: true` (the publish host could serve the page) is gone:
  publications have their own Worker and the main Worker has no address but its Custom Domain.
- **Docs and owner steps.** `RELEASING.md` becomes the tag-and-watch procedure; the launch
  checklist, `CONTRIBUTING.md`, `SECURITY.md`, `docs/cloud.md`, `docs/playground.md`, the
  README and their Spanish versions name the real addresses, the hosted app and where the
  infrastructure lives; decision 0046 records the delivery; the owner's steps (the first push,
  the marketplace publishers whose tokens go to the family's infrastructure variables, the tag)
  are listed in order in the tasks.
- **Release 1.8.0** is the first thing the pipelines deliver: the changelog entry dated, the
  verification runs, the tag.

## Capabilities

### New Capabilities

- `delivery-pipeline`: the repository's own continuous integration, deployment and release
  workflows, the files they need, and the ignore rules of the public repository.

### Modified Capabilities

- `cloud-service`: the Worker runs first for its own paths only; assets carry their headers
  from `_headers`; the configuration file names the family's ids, no route and no address but
  the Custom Domain; the secrets come from the Store through an adapter.
- `publishing`: the publish host is `meltemi.page`, a Custom Domain the family's Terraform
  attaches to the publish Worker; `PUBLISH_HOST` is set in production; the publish Worker's
  file has no route.
- `web-playground`: the build writes `_headers` beside `api/session`.
- `release-packaging`: manifests name `askenaz-dev/meltemi-diagrams`; the release is published
  by the release workflow on a tag, with provenance, after the same release check.
- `pilot-and-launch`: the launch checklist names the real repository, accounts and hosting,
  and marks what this change did.

## Non-goals

- The family's infrastructure (the zones, DNS, the database, the bucket, the Worker entities,
  the Custom Domains, the Secrets Store and its values, the deploy tokens, this repository's
  GitHub settings and secrets): Meltemi Web's `delivery` change (`C:\meltemi/packages/infra`),
  which lands first; this change binds the ids it outputs and never creates a resource.
- A staging environment, preview deployments per pull request, analytics, paid plans.
- Changes to what the service does: no new route, no new feature, no fix of the known gaps
  listed in the cloud review.
- The IDE repository.

## Dependencies

No new dependency: `wrangler` (approved) uploads the Workers; the GitHub-hosted actions
(`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, `actions/upload-artifact`) run
in the workflows.

## Impact

- Repository: `.gitignore`, `.github/workflows/{ci,deploy,release}.yml`, decision 0046,
  `CHANGELOG.md` (1.8.0 dated), `RELEASING.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `docs/launch/checklist.md`, `README.md` and `README.es.md`.
- Manifests: `repository`, `homepage` and `bugs` in the 19 public packages and
  `packages/vscode/package.json`; `packages/cloud/package.json` dependency on
  `@meltemi/identity`; `pnpm-lock.yaml`; the 19 package READMEs' links;
  `packages/acceptance/test/release.test.ts`.
- Cloud: `wrangler.jsonc`, `wrangler.publish.jsonc`, `src/env.ts` (the adapter and the binding
  types), `src/config.ts` (`ADMIN_SUBS` through the adapter), the routes that read the two
  secrets, `test/config.test.ts`, `test/publish-host.test.ts`, `test/browser/helpers.test.ts`,
  `test/browser/worker.ts` and `test/browser/run.ts`, `docs/cloud.md` and `docs/es/cloud.md`.
- Playground: `build.mjs` writes `_headers`; `test/policy.test.ts`; `docs/playground.md` and
  `docs/es/playground.md` name `https://diagrams.meltemi.dev`.
- Owner: the first push, the Marketplace and Open VSX publishers (their tokens go to the
  family's infrastructure variables), the tag `v1.8.0`, their `sub` for `ADMIN_SUBS` (a
  variable of the family's infrastructure).
