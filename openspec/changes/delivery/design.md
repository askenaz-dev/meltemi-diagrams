## Context

Everything the product needs exists and passes on the owner's machine: nineteen public packages,
the extension, the playground's static build, and the two Workers of `packages/cloud` (the
service of decision 0041, the publish host of decision 0042), verified by the unit, browser and
cloud suites. What does not exist is the delivery: no Git repository, no GitHub repository,
nothing on npm or the marketplaces, no Cloudflare resource, and a CI workflow that has never
run. Decision 0001 of Meltemi Web split delivery into one change per repository.

What the owner decided on 2026-10-20: GitHub organisation `askenaz-dev` (repositories
`askenaz-dev/meltemi-diagrams` and `askenaz-dev/meltemi-web`); npm organisation `meltemi`, so
`@meltemi/diagrams-*` stays and `@meltemi/identity` is published from Meltemi Web;
`diagrams.meltemi.dev` for the app and its API, `id.meltemi.dev` for identity, `meltemi.page`
(registered on Cloudflare) for published catalogs; the playground ships only with the Worker;
the free plans; and two rules: infrastructure configuration is Terraform wherever a provider
exists, and everything executes as GitHub pipelines.

The family's Terraform root lives in Meltemi Web (`C:\meltemi/packages/infra`, its `delivery`
change): it creates this repository on GitHub with its `production` environment and secrets
(`CLOUDFLARE_API_TOKEN` minted by Terraform with Workers Scripts and D1 edit only, `NPM_TOKEN`,
`VSCE_PAT`, `OVSX_PAT` from variables), the Worker entities `meltemi-diagrams-cloud` and
`meltemi-diagrams-publish` with `workers.dev` and previews off, the database
`meltemi-diagrams`, the bucket `meltemi-diagrams-blobs`, the Custom Domains
`diagrams.meltemi.dev` and `meltemi.page`, and the Secrets Store `meltemi` with
`FORMS_SECRET`, `IDENTITY_EVENTS_SECRET` (the same value as identity's
`EVENTS_SECRET_DIAGRAMS`, by construction) and `ADMIN_SUBS`. Its outputs give this repository
the ids to bind. What was verified before designing: Cloudflare's guidance is that Terraform
manages the Worker entity and Wrangler uploads versions (static assets and Durable Object
migrations are Wrangler's); a Worker binds a Store secret with `secrets_store_secrets` and reads
it with `await env.X.get()`; Wrangler refuses two bindings of one name, so a Store binding and
a `.dev.vars` string cannot share a name.

Constraints that shape the design: the cloud Worker depends on `@meltemi/identity` through a
`link:`, so nothing installs without `C:\meltemi` beside the repository; the Worker runs first
on every request, so every asset counts as one of the 100,000 daily requests of Workers Free;
the browser suite starts `wrangler dev` from a copy of `wrangler.jsonc` and a test forbids `DEV`
and `IDENTITY_JWKS` in it; `.vscode-test/` (1.1 GB) and `release/` are not ignored.

## Goals / Non-Goals

**Goals:**

- A public repository that installs, builds and passes on any machine and in CI.
- Three workflows the owner never edits for a release: `ci.yml` on every push and pull request,
  `deploy.yml` on every push to `main`, `release.yml` on a version tag; none creates a resource
  or sets a secret.
- Both Workers' code uploaded onto the infrastructure Terraform declared, within the free plan,
  with the playground's assets outside the Worker's request quota and the secrets read from
  the Store.
- Every address a user or a contributor can reach is the real one.
- The owner's steps written once, in order; release 1.8.0 as the first run of the pipelines.

**Non-Goals:**

- Any Cloudflare or GitHub resource: the family's Terraform root owns them.
- Staging, previews, canaries, analytics, paid plans, the known gaps of the cloud review, the
  IDE repository.

## Decisions

### 1. The repository address, written once and checked

`https://github.com/askenaz-dev/meltemi-diagrams` replaces `github.com/meltemi/meltemi-diagrams`
in the `repository` (with `directory`), `homepage` and `bugs` of the nineteen public manifests
and `packages/vscode/package.json`, in the nineteen package READMEs, in
`docs/launch/checklist.md` and wherever else `grep` finds it. `packages/acceptance/test/release.test.ts`
keeps one constant, `REPOSITORY`, and derives the three fields from it. npm provenance
(decision 6) requires the manifest's `repository.url` to match the repository the workflow runs
in. The repository itself is created by the family's Terraform (`github_repository`); the
owner's first push fills it.

Alternatives: a generator for the twenty manifests (npm reads them as they are); creating the
repository by hand (the owner's rule: Terraform).

### 2. `@meltemi/identity` from npm

`packages/cloud/package.json` declares `"@meltemi/identity": "^0.1.0"`, the version Meltemi Web
publishes with provenance. `pnpm install` rewrites the lockfile's `link:` entry; the Worker's
imports do not change; `wrangler` bundles the package from `node_modules` as it does `yjs`.
`docs/cloud.md` "The identity package" describes the published package and `pnpm link` for work
against a local checkout, never committed.

Alternatives: a Git submodule, checking out both repositories in the workflows, vendoring
`dist/`: each leaves a clone that does not install or drifts from the contract.

### 3. The Worker runs first for its own paths only

`wrangler.jsonc` sets `assets.run_worker_first` to
`["/api/*", "/_identity/*", "/_published/*", "/cli-auth", "/cli-auth/*", "/p/*", "/rooms/*"]`,
so the platform serves every other path from the assets directly: free and unlimited on Workers
Free, never invoking the Worker, with the platform's caching. The two headers the Worker added
to assets are written by `packages/playground/build.mjs` as `dist/_headers`
(`/*` with `Content-Security-Policy: frame-ancestors 'self'` and
`X-Content-Type-Options: nosniff`). `cloud()` is unchanged: it still answers the reserved paths
in any spelling, refuses another `Host`, and wraps an asset with `pageResponse` when asked for
one. The tests change: `config.test.ts` and `browser/helpers.test.ts` expect the list; the
browser suite asserts the headers on files that exist and accepts, for a reserved path spelled
with escapes, the Worker's JSON 404, a redirect to the plain spelling on the same origin (which the
suite follows to the Worker's own answer), or the static anonymous session (the one file under a
reserved name, the answer the Worker gives nobody), never another file; a missing file is the
platform's 404 with no promise about headers. Under `wrangler dev` the platform answers
`/%61pi/session` with a `307` to `/api/session`, which the Worker answers.

Why now: decision 0041 chose `run_worker_first: true` because a path list matches whatever the
`Host`, and the publish host would have served the page. Publications are a second Worker
with their own Custom Domain, and neither Worker has a `workers.dev` address (Terraform
disables it and the files keep it off), so no other host reaches the assets.

Alternatives: keep `run_worker_first: true` (a page load is ten to twenty requests; the free
plan holds a few thousand visits a day before every request of the day fails).

### 4. The configuration files are the code's; secrets come from the Store

`wrangler.jsonc` names `"PUBLISH_HOST": "meltemi.page"` among `vars`, `workers_dev: false`,
`preview_urls: false` (so a deploy never re-enables what Terraform disabled), no `routes` (the
Custom Domain is Terraform's; one owner per thing), no `account_id` (Wrangler reads
`CLOUDFLARE_ACCOUNT_ID` from the environment), and the Store bindings:

```jsonc
"secrets_store_secrets": [
  { "binding": "FORMS_SECRET_STORE", "store_id": "<placeholder>", "secret_name": "FORMS_SECRET" },
  { "binding": "IDENTITY_EVENTS_SECRET_STORE", "store_id": "<placeholder>", "secret_name": "IDENTITY_EVENTS_SECRET" },
  { "binding": "ADMIN_SUBS_STORE", "store_id": "<placeholder>", "secret_name": "ADMIN_SUBS" },
]
```

The database's and the store's ids stay placeholders (all zeros), which `wrangler dev` accepts:
the family's Terraform writes the real ones as the `production` environment's variables
`D1_DATABASE_ID` and `SECRETS_STORE_ID`, and `scripts/deploy-config.mjs` writes them into
`wrangler.deploy.json` and `wrangler.publish.deploy.json` before the upload, refusing to leave a
placeholder; nobody copies an id. `wrangler.publish.jsonc` names the same database and bucket,
`workers_dev: false`, `preview_urls: false`, and no `routes`, account, variable, secret or asset.
The suite's configuration copy (`test/browser/worker.ts`) keeps the Store bindings: Wrangler's
local mode accepts them, and the suite's `.dev.vars` strings win.

`src/secrets.ts` (the same module as the identity Worker's) resolves the bindings at the entry:
`worker-handler.ts` calls `resolveSecrets(env)` before anything else in `fetch` and `scheduled`;
every `<NAME>_STORE` binding is read once per isolate into `<NAME>`, a non-empty string wins and
leaves the binding uncalled, and a binding that cannot give its value is logged by name and asked
again next time. Every route keeps reading `env.<NAME>` as a string, so the handler, `config.ts`
and the tests do not change. `ADMIN_SUBS` is a Store secret instead of a variable, so the
administrators' `sub`s are not in a public file; an unreadable one is unset, which is nobody (the
takedown route answers `404`, as before), and the Store's single space for "nobody" reads as
empty. The suffix keeps a development string and a production binding from naming one binding
twice.

Alternatives: `wrangler secret put` in `deploy.yml` from GitHub secrets (no code change; the
values live in two places and a removed secret stays on the Worker); `ADMIN_SUBS` as a `var`
(public, and the file changes with every administrator).

### 5. Deployment on every push to `main`: uploads only

`.github/workflows/deploy.yml` runs on `push` to `main` and `workflow_dispatch`, under
`concurrency: deploy` without cancellation, in the `production` environment Terraform made,
with `CLOUDFLARE_API_TOKEN` (the deploy token Terraform minted: Workers Scripts and D1 edit,
nothing else) as its only secret: `pnpm install --frozen-lockfile`, `pnpm playground:build`,
`wrangler d1 migrations apply DB --remote`, `wrangler deploy`, `wrangler deploy -c
wrangler.publish.jsonc`. It runs no `wrangler secret` command and creates nothing; a Worker
entity it would upload to must already exist (the family's apply), which is the bootstrap order
of Meltemi Web's design. A failed migration ends the run before either upload; rollback is a
revert pushed to `main`, or `wrangler rollback` run by the workflow on `workflow_dispatch` with
the version id as its input.

Alternatives: Cloudflare Workers Builds (a second definition of the build, no ordering with the
migrations); deploying on tags only (the service and the packages have different rhythms).

### 6. Release on a tag, resumable

`.github/workflows/release.yml` runs on tags `v*`, in jobs that each need the previous:
`check` (the tag's version equals every manifest's and `CLI_VERSION`, else the run fails before
publishing anything; `pnpm release:check` on `ubuntu-latest`, where Chrome and FFmpeg are
installed; `release/` uploaded as the run's artifact), `npm` (`permissions: id-token: write`;
for every `./release/*.tgz` (with `./`: npm reads `release/<name>.tgz` as a GitHub repository): skip when `npm view <name>@<version> version` answers, else
`npm publish --access public --provenance` with the `NPM_TOKEN` Terraform placed), `extension`
(`vsce publish --packagePath` with `VSCE_PAT`, `ovsx publish` with `OVSX_PAT`), `github`
(`gh release create v<version>` with `release/manifest.json`, the `.vsix` and the changelog
section). A run that failed midway is re-run and finishes the rest. Trusted publishing is the
owner's follow-up once each package exists on npm; `RELEASING.md` names it.

Alternatives: publishing from the owner's machine (the owner's rule); one job for everything
(a failure after the npm step cannot be re-run without re-publishing).

### 7. Continuous integration with the browser suites

`ci.yml` keeps its matrix (Node 22 and 24 on `ubuntu-latest` and `windows-latest`) and steps,
adds `concurrency` by ref with cancellation, `permissions: contents: read`, and two jobs on
`ubuntu-latest`: `browser` (`pnpm playground:test-browser`, `pnpm player:test-browser`,
`pnpm catalog:test-browser`, `pnpm vscode:test-webview`) and `cloud` (`pnpm cloud:test-browser`,
eight minutes, `wrangler dev` with D1, R2 and Durable Objects locally, standing in for the
identity service on port 8787). `pnpm vscode:test`, which downloads VS Code, stays a local step
of `RELEASING.md`. The first run shows what the suites assumed of the owner's machine; fixing
that is part of this change.

### 8. What the public repository holds

`.gitignore` adds `packages/vscode/.vscode-test/`, `packages/vscode/.test-output/`, `release/`,
`mi-prueba/` and the two proposal documents (`propuesta-detallada-diagramas-como-codigo.*`),
keeping `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars*` and `!.dev.vars.example`. The
proposal documents are the owner's to un-ignore later. `brand/`, `corpus/`, `gallery/`,
`examples/`, `docs/media/` and `schemas/` are tracked. A test in `packages/acceptance/test/`
reads `.gitignore` and asserts the entries. The first commit is the whole tree on `main`, pushed
to the repository Terraform created; `gh` on the owner's machine is signed in to a work account
with an invalid token, so the push uses `gh auth login` with the personal account or SSH.

### 9. Documents

- `RELEASING.md`: prepare, verify on the reference machine, tag and push, watch the workflow,
  what to do when it fails after publishing; the tokens are the family's infrastructure's
  (`C:\meltemi/packages/infra`); trusted publishing as the follow-up.
- `docs/launch/checklist.md`: the real values, ticks for what this change did, where the
  infrastructure lives; the remaining owner items.
- `docs/cloud.md` and `docs/es/cloud.md`: "One Worker, one origin" (the Worker-first paths,
  `_headers`), "Configuration" (the Store bindings and the entry's resolution, `.dev.vars` strings,
  `ADMIN_SUBS` in the Store, the ids are outputs of the family's Terraform), "Custom Domains"
  (Terraform's), "The identity package" (published), a "Deploying" section (the workflow, the
  bootstrap order, rollback, where resources are declared).
- `docs/playground.md`, `docs/es/playground.md`, `README.md`, `README.es.md`: the hosted app at
  `https://diagrams.meltemi.dev`; `CONTRIBUTING.md` (what CI runs, the address), `SECURITY.md`
  (1.8.x), `CHANGELOG.md` (1.8.0 dated, a line on the delivery), decision 0046.

### 10. Order

After Meltemi Web's first apply (the repository, the environment and its secrets, the entities,
the database, the bucket, the Store) and before its second (the Custom Domains): the manifests
and the ignore rules (1, 8); the first push; the dependency (2) once `@meltemi/identity` is on
npm; CI green (7); `deploy.yml` writes the environment's ids and uploads both Workers (4, 5); the
family's second apply attaches the domains; the smoke test (`mdg login`, a project pushed, a
page published at `https://meltemi.page/…`, two browsers collaborating); the owner's `sub` into
the family's `ADMIN_SUBS` variable; the marketplace publishers, whose tokens go to the family's
variables; the tag `v1.8.0` (6).

## Risks / Trade-offs

- [The platform matches `run_worker_first` patterns differently from `RESERVED`, for example on
  percent-escapes] → the only file under a reserved name is `api/session`, the anonymous
  answer; the browser suite requests `/%61pi/session` and accepts either answer and no other.
- [`_headers` does not apply to the platform's 404 for a missing file] → the specification
  promises the headers on files that exist.
- [`wrangler dev` with a Store binding that has no local value] → the entry never calls
  `get()` when the string exists; the suite's configuration copy strips the bindings.
- [Secrets Store is in open beta] → the entry keeps strings working, so classic secrets are a
  one-line fallback in the configuration file and a `wrangler secret put` step; the family's
  design names it.
- [The free plan's caps: 100,000 Worker requests a day, D1's rows written, the Durable Objects'
  duration] → assets no longer count; the room's materialisation is throttled; the dashboard
  shows the usage; the paid plan is a follow-up with no code change.
- [The first CI run fails on things the owner's machine had] → fixing the suites on Linux is in
  the tasks; `windows-latest` covers the owner's platform.
- [A release fails after some packages are on npm] → the npm job skips what is published.
- [The publisher `meltemi` is taken on a marketplace] → the owner creates it first (both were
  free on 2026-10-20); if taken, the `publisher` field changes in this change.
- [`wrangler deploy` finds no entity because the family's apply has not run] → the bootstrap
  order; the run fails with the API's error and nothing is served from a wrong name.
- [The lockfile changes when the `link:` becomes a version] → one `pnpm install` and a commit;
  CI refuses drift.
