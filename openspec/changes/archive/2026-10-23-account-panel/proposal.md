## Why

The account is scattered and leaves the page. The header's menu opens the identity service's
account page in a new tab, which breaks the flow; the API tokens live in a dialog of their own; the
usage sits under the menu's entries; and the publishing handle can only be set inside the publish
dialog. Reviewing the hosted 1.9.0 the owner asked for one account view inside the playground,
with the API keys in it, and ruled out two things: frames, and the page talking to any origin but
its own.

## What Changes

- **An account panel.** The avatar's menu opens a modal with a navigation on the left and six
  sections: **Profile** (avatar, name, the emails of the linked sign-ins, the publishing handle,
  sign out), **Sign-ins** (each linked provider, unlink, link the missing one), **Devices** (where
  the person is signed in, sign out one or all the others), **API tokens** (the dialog's contents,
  as a section), **Usage** (projects, storage and the limits), and **Danger zone** (delete the
  account). On a narrow screen it is a full-screen sheet with the sections as tabs on top.
  `?account=<section>` opens the panel at a section, and is where the identity service brings the
  person back after linking a provider or deleting the account.
- **The Worker proxies the identity service's account API.** `GET /api/account/identity`,
  `POST /api/account/identity/unlink`, `POST /api/account/identity/sessions/revoke-others` and
  `POST /api/account/identity/sessions/:sid/revoke`, for a cookie principal under the Origin rule,
  each a product-signed call to `id.meltemi.dev` carrying the person's session token, signed with
  the product's secret through `@meltemi/identity` 0.2.0. The page keeps `connect-src 'self'`;
  nothing of the project leaves it, and nothing new is sent anywhere but to the identity service,
  on the person's behalf, when they open those sections.
- **Two things stay navigations**, in the same tab and back to the panel: linking a provider (the
  providers refuse frames and popups alike) and deleting the account (its confirmation and its
  final page are the identity service's). Sign out stays the form it is.
- **The menu shrinks** to Account, API tokens (the panel at that section), the usage lines, which
  open the Usage section, and Sign out. The tokens dialog goes.

## Capabilities

### New Capabilities

- `account-panel`: the panel, its sections, the handle in Profile, the navigations out and back,
  what it shows when the identity service cannot be reached, and its motion.

### Modified Capabilities

- `cloud-accounts`: the menu opens the panel instead of a tab and a dialog; the Worker's proxy
  routes to the identity service's account API, with the product's signature and the person's
  session token.

## Non-goals

- The identity service's side: the account API, the signature scheme, "Back to <product>" and
  signing out of one device on its page are the `identity-account-api` change of `C:\meltemi`;
  this change depends on `@meltemi/identity` 0.2.0.
- Frames, popups or a second tab anywhere in the account flow.
- Deleting the account or linking a provider from the panel without going through the identity
  service's own pages.
- Publishing the package or placing secrets: no new secret is needed; the product's secret is the
  one the Worker already holds for the events.

This is a post-1.0 change outside `docs/roadmap-1.0.md`; it joins the unreleased 1.10.0.

## Impact

- Worker (`packages/cloud`): `routes/account.ts` gains the four proxy routes; the cookie principal
  carries the session token it was verified from; `deps.fetch` now reaches the identity service's
  account API besides its keys and session check; the browser suite's fake identity service
  answers the API and checks the signature; `@meltemi/identity` bumped to `^0.2.0`.
- Playground (`packages/playground`): `cloud/account-panel.ts` and `account-panel-model.ts`, the
  tokens dialog turned into a section, the handle field shared with the publish dialog, the menu,
  `?account=` on load, words en/es, `playground.css`, unit tests and browser scenarios in both
  suites.
- Docs: `docs/playground.md` and `docs/es/playground.md` ("The account"), `docs/cloud.md` and
  `docs/es/cloud.md` (routes, who is asking, configuration), decision 0049, CHANGELOG 1.10.0.
