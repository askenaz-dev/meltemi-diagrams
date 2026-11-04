## MODIFIED Requirements

### Requirement: The publish host serves publications only
A second, minimal Worker (`packages/cloud/src/publish.ts` with `wrangler.publish.jsonc`: the R2
binding `BLOBS`, the D1 binding `DB`, no assets), bound to `PUBLISH_HOST`, SHALL serve only
`/<handle>/<slug>/` (and `index.html` under it) of a publication that exists, from the stored
HTML, with `Content-Type: text/html; charset=utf-8`, `Cache-Control: public, max-age=300`,
`X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`; it SHALL never set a
cookie nor answer an API route, and SHALL answer `404` to everything else; the main Worker
SHALL never serve the publish host. In production `PUBLISH_HOST` SHALL be `meltemi.page`, a
registrable domain of its own on the owner's Cloudflare account, attached to the publish
Worker as a Custom Domain by the family's Terraform: `wrangler.publish.jsonc` SHALL name the
same database (its placeholder id, replaced at deploy as the main Worker's) and bucket as the main
Worker, `workers_dev: false` and `preview_urls: false`, and no `routes`, `account_id`, variable,
secret or asset; `wrangler.jsonc` SHALL set
`PUBLISH_HOST` to `meltemi.page` among its `vars`, so that published addresses are
`https://meltemi.page/<handle>/<slug>/`. In development only (`DEV`), the main Worker SHALL
serve the same content under `/_published/<handle>/<slug>/` on its own origin.

#### Scenario: No API on the publish host
- **WHEN** `GET /api/session` is requested on the publish host
- **THEN** the answer is `404` with no cookie

#### Scenario: The app is not on the publish host
- **WHEN** `GET /playground.js` is requested with `Host: PUBLISH_HOST`
- **THEN** the answer is `404`

#### Scenario: Development route absent in production
- **WHEN** `DEV` is not set and `/_published/a/b/` is requested on the Worker's origin
- **THEN** the answer is `404`

#### Scenario: The address of a publication
- **WHEN** `wrangler.jsonc` and `wrangler.publish.jsonc` are read
- **THEN** `PUBLISH_HOST` is `meltemi.page`, the publish Worker's file has no `routes` and no `account_id`, `workers_dev` and `preview_urls` are `false`, both files name the same `database_id` and bucket, and a publication by `ana` named `purchase` is addressed `https://meltemi.page/ana/purchase/`

#### Scenario: A publish host under the family's domain
- **WHEN** the configuration sets `PUBLISH_HOST` to `pages.meltemi.dev`
- **THEN** publishing answers `500 internal` and the log says the host must not be under the family's domain, and nothing else of the service changes
