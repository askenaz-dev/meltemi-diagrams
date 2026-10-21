# 0046. Delivery: pipelines onto the family's infrastructure as code

Status: accepted (owner, 20 October 2026; the `delivery` change)

## Context

Meltemi Diagrams 1.8.0 was complete and verified on the owner's machine, and could not be
installed or opened by anyone: no Git repository, no GitHub repository, nothing on npm or the
extension marketplaces, and the cloud service of decisions 0041 and 0042 never deployed. On
20 October 2026 the owner decided to go to production on the GitHub organisation `askenaz-dev`,
the npm organisation `meltemi`, `meltemi.dev` and its subdomains for the product, `meltemi.page`
for published catalogs (both domains registered at Dynadot), the free plans of GitHub and
Cloudflare, and with two rules: every piece of infrastructure configuration is Terraform, and
everything runs as GitHub pipelines, never from a machine.

The family's Terraform lives in the Meltemi Web repository (`packages/infra`, its decision 0004),
which already holds what the family shares. It declares, for this product, the Workers
`meltemi-diagrams-cloud` and `meltemi-diagrams-publish` as entities with no `workers.dev` and no
preview address, their Custom Domains `diagrams.meltemi.dev` and `meltemi.page`, the D1 database,
the R2 bucket, the Secrets Store's `FORMS_SECRET`, `IDENTITY_EVENTS_SECRET` and `ADMIN_SUBS`, this
repository on GitHub with its `production` environment (a deploy token that can only upload
Workers and migrate D1, and the ids), and the release tokens. Cloudflare's provider cannot deploy a
Worker's static assets nor create a Durable Object binding in a first apply, so Wrangler uploads
the versions.

## Decision

- **The repository** is `https://github.com/askenaz-dev/meltemi-diagrams`, named in every
  manifest, README and document; the release test holds the address once.
- **Three workflows.** `ci.yml` checks every push and pull request, now with the browser suites
  and the cloud suite on Linux. `deploy.yml` deploys every push to `main`: it writes the ids into
  the Workers' configurations (`scripts/deploy-config.mjs`), builds the playground, applies the
  migrations and uploads the main Worker and the publish Worker; dispatched with a version id it
  rolls back instead. `release.yml` releases a tag `v<x.y.z>`: the tag must name the manifests'
  version, `pnpm release:check` runs on Linux, the tarballs are published with provenance, the
  `.vsix` reaches both marketplaces, and the GitHub release carries the manifest, the `.vsix` and
  the changelog's section; every publishing job skips what is published, so a failed run is
  re-run.
- **The configuration files are the code's.** `wrangler.jsonc` and `wrangler.publish.jsonc` hold
  no route, no account and no secret, keep `workers_dev` and `preview_urls` off, and keep
  placeholder ids that the deploy workflow replaces from the environment's variables. Nobody
  copies an id, and `wrangler dev` keeps working with the placeholders.
- **Secrets from the Store.** The main Worker binds its three secrets as `<NAME>_STORE` and reads
  them into `<NAME>` once per isolate at its entry (`src/secrets.ts`); a `.dev.vars` string always
  wins, so development and the tests are unchanged. `ADMIN_SUBS` becomes a secret, so the
  administrators' `sub`s are not in a public file. `wrangler secret put` is never run.
- **Assets outside the Worker's quota.** The main Worker runs first only for its own paths
  (`/api/*`, `/_identity/*`, `/_published/*`, `/cli-auth`, `/cli-auth/*`, `/p/*`, `/rooms/*`); the
  assets platform serves every other path, free on the free plan, with the two headers the Worker
  added now written by the playground build as `_headers`. Decision 0041 ran the Worker first on
  everything because a list of paths matches whatever the host is, and the publish host would then
  have served the page; the publish host is a Worker of its own and neither Worker has an address
  but its Custom Domain, so the reason is gone.
- **The identity package from npm.** `packages/cloud` depends on the published `@meltemi/identity`
  instead of a link to a checkout beside this one, so the repository installs anywhere.
- **The release tokens** come from the family's infrastructure; trusted publishing replaces the npm
  token once every package exists on npm.

## Alternatives considered

- **Running the Worker first on everything**, as before: every file of every visit counts against
  the free plan's 100,000 daily Worker requests, which a launch can exceed in an afternoon.
- **Classic Worker secrets set by the deploy workflow** from GitHub secrets: no change to the
  Worker, but every value in two places and stale secrets left behind.
- **Ids committed in the configuration files**, copied from Terraform's outputs: one manual step
  per resource, and a mismatch nobody sees until a deploy fails.
- **Publishing from the owner's machine**, as `RELEASING.md` described: no provenance, no record of
  what ran, and a machine holding every token.
- **Cloudflare Pages for the page and the Worker for the API**: two origins, CORS, and a policy that
  loses `connect-src 'self'` (decision 0041).

## Consequences

- The first deployment waits for the family's first apply (the Workers must exist), and the Custom
  Domains attach after it (a Custom Domain needs a version); the Meltemi Web repository's design
  orders the stages.
- A reserved path spelled with escapes may now reach the assets platform, which can answer only
  `api/session`, the anonymous session; the browser suite accepts that file or the Worker's `404`
  and nothing else.
- The platform's `404` for a missing file carries no promise about headers; nothing in it can be
  framed.
- CI cannot install until `@meltemi/identity` is on npm; the Meltemi Web repository releases first.
