## MODIFIED Requirements

### Requirement: One Worker, one origin
`packages/cloud` SHALL be a Cloudflare Worker that answers `/api/*`, `/_identity/*`,
`/_published/*`, `/cli-auth`, `/p/*` and `/rooms/*` itself, in whatever spelling of the path, and
whose `wrangler.jsonc` names exactly those paths in `assets.run_worker_first`, so that every
other path of `packages/playground/dist` is served by the assets platform directly, on the
Worker's own origin, so the page and its API share one origin and the page's policy keeps
`connect-src 'self'`; for a request the Worker receives whose `Host` is not the Worker's own
origin it SHALL serve no asset and answer `404`. The files the assets serve SHALL carry
`Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff` from
the build's `_headers`, for the page's own policy is a `meta` tag, which cannot say who may frame
it; an asset the Worker itself serves SHALL carry the same two headers. `/p/<id>`, with an id of
20 lowercase letters and digits, SHALL answer a `302` to `/?project=<id>` keeping the query.
`wrangler.jsonc` SHALL keep `workers_dev: false` and `preview_urls: false`, define no `routes`
(the Custom Domain `diagrams.meltemi.dev` is the family's Terraform's), no `account_id` and no
secret value, and keep placeholder ids for the D1 database and the Secrets Store that the deploy
workflow replaces from the `production` environment's variables. The Worker SHALL bind
`FORMS_SECRET`, `IDENTITY_EVENTS_SECRET` and `ADMIN_SUBS` as `secrets_store_secrets` named
`<NAME>_STORE`, and its entry SHALL read each binding into `<NAME>` once per isolate unless a
non-empty string `<NAME>` (`.dev.vars`, the tests) is set, which wins and leaves the binding
uncalled; a binding that cannot give its value SHALL be logged by name, never by value, treated as
unset, and asked again on the next request. `pnpm cloud:dev` SHALL build the page and run the
Worker locally on port 8788 with a local D1; `pnpm cloud:migrate` SHALL apply the migrations
locally or remotely.

#### Scenario: The page from the Worker
- **WHEN** `wrangler dev` serves the Worker and `/` is requested
- **THEN** the playground's `index.html` is served, and `/api/session` is answered by the Worker, not by the static file of the same path

#### Scenario: A project link
- **WHEN** `GET /p/01h2x5z8kq3m7n9p2r4t?invite=t` is requested on the Worker's origin
- **THEN** the answer is `302` with `Location: /?project=01h2x5z8kq3m7n9p2r4t&invite=t`

#### Scenario: A malformed project address
- **WHEN** `GET /p/not-an-id` is requested on the Worker's origin
- **THEN** the answer is `404 project.not-found` and no redirect is sent

#### Scenario: Another host
- **WHEN** `GET /api/session` arrives with a `Host` that is not the Worker's own origin, such as the publish host
- **THEN** the answer is the Worker's `404` JSON and no asset is served

#### Scenario: Unknown API route
- **WHEN** `GET /api/nothing` is requested
- **THEN** the answer is `404` with the JSON `{ "code": "not-found", "message": … }`

#### Scenario: A reserved path spelled with escapes
- **WHEN** `GET /%61pi/session` or `GET /api%2Fsession` is requested
- **THEN** the answer is the Worker's `404` JSON, a redirect to `/api/session` on the same origin (which the Worker answers), or the static `api/session` file (`{"user":null}`, the answer the Worker gives nobody), and never another file

#### Scenario: The page cannot be framed
- **WHEN** a file of the page is requested, such as `/` or `/playground.js`
- **THEN** the answer carries `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff` and keeps the status, type and body of the file

#### Scenario: The configuration file
- **WHEN** `wrangler.jsonc` is read
- **THEN** `run_worker_first` lists exactly `/api/*`, `/_identity/*`, `/_published/*`, `/cli-auth`, `/cli-auth/*`, `/p/*` and `/rooms/*` (every prefix the handler reserves), `workers_dev` and `preview_urls` are `false`, there is no `routes` and no `account_id`, the three `secrets_store_secrets` bindings are `FORMS_SECRET_STORE`, `IDENTITY_EVENTS_SECRET_STORE` and `ADMIN_SUBS_STORE` with their `secret_name`s, and the file defines no `DEV`, `IDENTITY_JWKS`, `IDENTITY_EVENTS_SECRET`, `FORMS_SECRET` or `ADMIN_SUBS`

#### Scenario: Secrets from the Store
- **WHEN** the strings `FORMS_SECRET` and `IDENTITY_EVENTS_SECRET` are unset and their bindings resolve
- **THEN** the Worker answers with those values, and a second request in the same isolate does not call `get()` again

#### Scenario: A binding that cannot give its value
- **WHEN** neither `env.ADMIN_SUBS` nor a readable `env.ADMIN_SUBS_STORE` gives a value
- **THEN** the log names `ADMIN_SUBS`, nobody is an administrator (the takedown route answers `404`), and every other route works
