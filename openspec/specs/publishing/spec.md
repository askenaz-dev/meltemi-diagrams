# publishing Specification

## Purpose
Publishing a project as the HTML catalog: handles and slugs, publish and unpublish, the separate publish host with no cookie and no API, the development-only route, takedown by the administrators, and the publish dialog.
## Requirements
### Requirement: Handles
A person SHALL choose a handle (`[a-z0-9-]{3,30}`, unique) before their first publication
(`PATCH /api/account { handle }`, with the cookie or an API token); an invalid handle SHALL answer `400
handle.invalid`, a taken one `409 handle.taken`, and a change while a publication exists `409
handle.locked`; `GET /api/session` SHALL return it.

#### Scenario: Taken
- **WHEN** a person chooses a handle another account holds
- **THEN** the answer is `409 handle.taken`

#### Scenario: Locked by a publication
- **WHEN** a person with a publication patches a new handle
- **THEN** the answer is `409 handle.locked`

### Requirement: Publish and unpublish
`PUT /api/projects/:id/publish { slug, html }` by the owner SHALL store the HTML (at most 16
MiB) under the handle and slug (`[a-z0-9-]{1,60}`, unique per handle) and answer the public
address `https://<PUBLISH_HOST>/<handle>/<slug>/`; at most 10 publications per project per hour
(`429 publish.rate`); `DELETE …/publish` SHALL remove it. The page SHALL build the HTML with the
catalog build over the project's files, as the catalog export does, asking for the handle the
first time and showing the address afterwards.

#### Scenario: Published
- **WHEN** the owner publishes `purchase` as `purchase`
- **THEN** the HTML is served at `/<handle>/purchase/` on the publish host and the dialog shows that address

#### Scenario: Too large
- **WHEN** the HTML is 17 MiB
- **THEN** the answer is `413 publish.too-large` and nothing changes

#### Scenario: Not the owner
- **WHEN** an editor publishes
- **THEN** the answer is `403 access.denied`

### Requirement: The publish host serves publications only
A second, minimal Worker (`packages/cloud/src/publish.ts` with `wrangler.publish.jsonc`: the R2
binding `BLOBS`, the D1 binding `DB`, no assets), bound to `PUBLISH_HOST`, SHALL serve only
`/<handle>/<slug>/` (and `index.html` under it) of a publication that exists, from the stored
HTML, with `Content-Type: text/html; charset=utf-8`, `Cache-Control: public, max-age=300`,
`X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`; it SHALL never set a
cookie nor answer an API route, and SHALL answer `404` to everything else; the main Worker
SHALL never serve the publish host. In development only (`DEV`), the main Worker SHALL serve
the same content under `/_published/<handle>/<slug>/` on its own origin.

#### Scenario: No API on the publish host
- **WHEN** `GET /api/session` is requested on the publish host
- **THEN** the answer is `404` with no cookie

#### Scenario: The app is not on the publish host
- **WHEN** `GET /playground.js` is requested with `Host: PUBLISH_HOST`
- **THEN** the answer is `404`

#### Scenario: Development route absent in production
- **WHEN** `DEV` is not set and `/_published/a/b/` is requested on the Worker's origin
- **THEN** the answer is `404`

### Requirement: Takedown
A cookie principal listed in `ADMIN_SUBS` SHALL remove any publication (`DELETE
/api/admin/publications/<handle>/<slug>` with a reason), recording `takedowns (handle, slug,
by_sub, reason, at)`, after which the address answers `404` and the owner's dialog shows the
publication as removed by the service; anyone else SHALL get `404` from the admin routes.

#### Scenario: Removed
- **WHEN** an administrator removes a publication
- **THEN** its address answers `404` and the project's publish dialog says the service removed it

#### Scenario: Not an administrator
- **WHEN** a signed-in person outside `ADMIN_SUBS` calls the route
- **THEN** the answer is `404`

