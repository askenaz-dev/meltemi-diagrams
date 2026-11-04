## MODIFIED Requirements

### Requirement: A static page, an optional account, one origin
`pnpm playground:build` SHALL write a static site to `packages/playground/dist/` that any static
server can serve: `index.html`, the bundles, the stylesheets, `templates.json`, the font, icon and
runtime assets, `NOTICES.md`, `api/session` holding `{ "user": null }`, and `_headers` giving
every path (`/*`) `Content-Security-Policy: frame-ancestors 'self'` and
`X-Content-Type-Options: nosniff`, the headers the assets platform of the cloud Worker applies to
the files it serves. The page SHALL need no account and no server code: served by a static
server it SHALL work entirely as a local page. Served by the cloud Worker (`packages/cloud`),
it SHALL offer sign-in through the family's identity service as a navigation, and the account
SHALL add to the page without taking anything away. Its Content-Security-Policy SHALL be
`default-src 'none'` with scripts, styles, fonts and connections from the page's own origin only
(plus `data:` and `blob:` images and fonts, inline styles for drawn SVG, and the providers'
avatar hosts `https://avatars.githubusercontent.com` and `https://*.googleusercontent.com` in
`img-src`), `frame-src 'self'`, `base-uri 'none'` and `form-action 'self'` plus the origin of the
identity service the page was built with (`PLAYGROUND_IDENTITY`, default
`https://id.meltemi.dev`). The page SHALL make no request to another origin, whatever the
project holds; signing in and out are navigations, not requests the page makes.

#### Scenario: Only its own origin
- **WHEN** the browser test opens the page, loads every template, exports every format, opens a share link, and (against the Worker) signs in with a session minted with a `picture` under the Worker's own origin
- **THEN** every request the page made, the avatar included, went to the page's own origin

#### Scenario: Policy in the page
- **WHEN** `dist/index.html` is read after a build with the default identity origin
- **THEN** it declares a Content-Security-Policy starting with `default-src 'none'`, no `connect-src` other than `'self'`, and `form-action 'self' https://id.meltemi.dev`

#### Scenario: Without a server
- **WHEN** the page is opened from a static server with no `/api` route
- **THEN** `api/session` answers the static `{ "user": null }`, every feature of this specification works, and the header offers sign-in as a link the page built from the identity origin it was built with

#### Scenario: The headers file
- **WHEN** `dist/_headers` is read after a build
- **THEN** it holds one rule for `/*` with exactly `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff`, and the file is served as a plain file by a static server with no effect on the page
