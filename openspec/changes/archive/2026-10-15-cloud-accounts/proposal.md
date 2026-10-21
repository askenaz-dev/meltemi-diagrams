## Why

The owner wants the playground to offer what Excalidraw and Mermaid Live offer on top of a page
that needs no account: projects that follow a person between devices, sharing and editing
together. The family now has an identity service (`id.meltemi.dev`, specified in the Meltemi
Web repository), so this product can add an account as a layer without hosting identity of its
own. This change lays the foundation the other cloud changes build on: the Worker that serves
the page and the API from one origin, the account in the page, users, the deletion events and
the API tokens the command line will use ([decision 0041](../../../docs/decisions/0041-hosted-service.md),
which amends 0031). Post-1.0 change, outside the roadmap; it applies first of the hosted
service's changes.

## What Changes

- New private package `packages/cloud` (`@meltemi/diagrams-cloud`): the Worker of
  `diagrams.meltemi.dev`. It runs first on every request, answers `/api/*`, `/_identity/*`,
  `/cli-auth`, `/p/*` and `/rooms/*` itself and serves the playground's built site as static
  assets for everything else on its own origin; `wrangler.jsonc`, `.dev.vars.example`,
  `pnpm cloud:dev` (the built playground plus the API with a local D1, on port 8788),
  `pnpm cloud:test` (Node) and `pnpm cloud:test-browser` (the page against `wrangler dev` in a
  headless Edge or Chrome).
- **A handler of plain functions**: `cloud(request, env, deps)`, a `CloudStore` interface with
  an in-memory implementation for tests and a D1 implementation with migrations, errors as JSON
  with stable codes.
- **Sessions and users**: the session cookie verified with the family's reference verifier
  (`@meltemi/identity`, linked from `C:\meltemi\packages\identity` during development; its
  JWKS address or an inline JWKS for development and tests); users kept by `sub` with the
  profile cached from the token; `GET /api/session`; the `Origin` check on every state change
  made with a cookie.
- **Deletion events**: `POST /_identity/events` with the signature verified, idempotent,
  cascading to everything the service holds for that `sub`.
- **API tokens**: create, list and revoke; `Authorization: Bearer mdg_…` on the API; the
  `/cli-auth` approval page that hands a one-time code to a listener on the loopback interface,
  exchanged for the token at `POST /cli-auth/token`; the token never travels in a URL.
- **The page**: a "Sign in" button that navigates to the identity service and comes back; an
  account menu with name, avatar, the account page, API tokens and a sign-out form. With no
  account, or served by any static server, the page is exactly as today.
- **Policy**: the page's Content-Security-Policy adds `form-action 'self'` plus the origin of
  the identity service the page is built with (`PLAYGROUND_IDENTITY`, default
  `https://id.meltemi.dev`) and the providers' avatar hosts to `img-src`; `connect-src 'self'`
  stays, and the browser test that every request goes to the page's own origin keeps passing.
- Documentation: `docs/cloud.md` (the service, its routes, how to run and test it), the account
  section of `docs/playground.md`, decision 0041.

## Capabilities

### New Capabilities

- `cloud-service`: the Worker: one origin for the page and the API, the handler of plain
  functions, request authentication and the `Origin` rule, errors, local run and the browser
  suite.
- `cloud-accounts`: the account in the page, users, `GET /api/session`, the deletion events,
  API tokens and the command line's approval page.

### Modified Capabilities

- `web-playground`: "A static page with no account and no network" becomes "A static page, an
  optional account, one origin": the page still needs no account and no server code and makes
  no request outside its origin; served by the Worker it offers sign-in; the policy's
  `form-action` and `img-src` change.

## Non-goals

- Projects in the cloud, versions, quotas and the local cache: `cloud-projects`.
- Sharing, permissions, viewing by link and publishing, including the second Worker that serves
  the publish host: `sharing-and-permissions`.
- Presence and editing together: `live-collaboration`. The command line's `login`, `push`,
  `pull` and `publish`: `cli-cloud` (this change provides the tokens and the approval page).
- The identity service itself (Meltemi Web, change `identity-service`); registering the
  production OAuth apps, the Cloudflare zone, DNS, secrets, the GitHub repository and the
  pipeline: the delivery change.

## Impact

- New development dependencies, approved on 2026-10-13: `wrangler` (MIT or Apache-2.0) and
  `@cloudflare/workers-types` (MIT or Apache-2.0); `@meltemi/identity` by `link:` to the
  family's repository (its licence is the owner's, Apache-2.0). No new runtime dependency in the
  page.
- `packages/playground`: `src/cloud/session.ts`, the header's account menu, the policy in
  `build.mjs` and the static `dist/api/session` it writes, messages in both languages; the
  browser suite grows a cloud variant.
- Root scripts `cloud:dev`, `cloud:migrate`, `cloud:test`, `cloud:test-browser`; the licence
  inventory covers the Worker's bundle.
