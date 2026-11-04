## Context

- The header's account control (`packages/playground/src/cloud/account.ts`): a menu with
  "Account" (an `<a target="_blank">` to the identity service's `/account`), "API tokens"
  (`openTokensDialog`, `tokens-dialog.ts` over `TokensModel`), a separator, "Sign out" (a form
  posting to the identity service's `/logout`) and, beside the menu items, the usage lines and
  meters read from `UsageSource` (`usage.ts`) when the menu opens.
- `GET /api/session` answers `user { sub, name, picture, handle }`, `account` and `signOut`
  (`packages/cloud/src/routes/session.ts`); the cookie principal holds `sub`, `sid` and the
  profile, not the token it was verified from (`principal.ts`, `types.ts`). The Worker's
  `deps.fetch` is "the identity service's keys and session check, nothing else" (`docs/cloud.md`).
  `IDENTITY_EVENTS_SECRET` arrives from the Secrets Store and verifies the deletion events.
- The handle is set only in the publish dialog (`cloud/publish.ts`, `PATCH /api/account`).
- The identity service's `identity-account-api` change gives: `GET /api/account`,
  `POST /api/account/unlink`, `…/sessions/revoke-others`, `…/sessions/:sid/revoke`, authenticated
  by the person's session token as a bearer plus the product's signature (`signProductRequest` of
  `@meltemi/identity` 0.2.0, with the product's secret, the same as the events'); error codes
  `product.unauthorized`, `session.invalid`, `identity.last`, `session.current`,
  `session.not-found`, `rate.limited`; `/account?return_to=` and the link flow return to a
  product's address; no CORS, cookies ignored under `/api`.
- The playground's policy is `connect-src 'self'`, `frame-src 'self'`, and the `web-playground`
  spec says the page makes no request to another origin; the browser suites assert it.
- The cloud browser suite stands in for the identity service with `test/browser/identity.ts`
  (today: the session check only); the playground suite answers the account's requests at the
  page's own origin.
- Dialogs: `openDialog(title, body, actions, { wide, drawer })` (`ui.ts`); `.pg-dialog` is 520 px,
  `.wide` 760 px, `.drawer` the right-hand panel.

## Goals / Non-Goals

**Goals:** one account view in the page, with everything the person has here (tokens, usage,
handle) and what the identity service holds about them (sign-ins, devices); no frame, no second
tab, the page talking to its own origin only; the two flows that must leave the page come back to
the section they left.

**Non-Goals:** account deletion or provider linking from the panel; several accounts; changing
what the identity service holds.

## Decisions

### The Worker is the only caller of the identity service

Four routes in `packages/cloud/src/routes/account.ts`, for a cookie principal only: a bearer API
token answers `403 request.forbidden` (an automation must not manage the account), anonymous `401
auth.required`, and the Origin rule applies to the three `POST`s as to every change made with the
cookie. Each route builds the identity call with `signProductRequest({ product: "diagrams", secret:
IDENTITY_EVENTS_SECRET, method, url, body, now })` and `Authorization: Bearer <session token>`,
sends it through `deps.fetch` with a five-second timeout, and answers the service's JSON and status
as they are for the codes the page expects (`identity.last`, `session.current`,
`session.not-found`, `provider.unknown`, `rate.limited`); `session.invalid` from the service
becomes `401 auth.required` (the session died under the person), and no answer, a timeout or an
answer the Worker cannot read becomes `502 identity.unavailable`, logged without the body. The
cookie principal gains `token`, the JWT `parseSessionCookie` returned, so that the route can
present it; nothing else reads it. *Alternative:* the page calling the service with CORS
(rejected by the owner: one origin).

### The panel is a model and a view

`cloud/account-panel-model.ts` holds `AccountPanelModel` with no DOM: the section shown, the
identity data (`loading | ready | failed`), the tokens (`TokensModel`, reused), the usage
(`UsageSource`), the handle, the busy flag, status and problem lines, and the actions (`unlink`,
`revokeOthers`, `revokeOne`, `setHandle`, `linkAddress(provider)`, `deleteAddress()`), over an
`AccountPanelHost` (the Worker calls, the session, the usage source, `keep`, `report`, navigation).
`cloud/account-panel.ts` draws it and redraws by section and by changed state, as the switcher and
the versions panel do; a unit test drives the model with a fake host. The tokens dialog's drawing
becomes `tokens-section.ts`, a function that returns the section's element over the same
`TokensModel`.

### Layout: a settings modal

`openDialog` gains `{ settings: true }` (the class `settings`: the canvas already styles a shared `.panel` class, which would turn the dialog transparent): `min(880px, 100vw - 32px)` wide, `min(640px, 100vh - 48px)`
tall, no footer, a header with the title and a close button, and a body in two columns: a vertical
`tablist` of 200 px (one `tab` per section, with an icon, arrows move, Home and End, the chosen one
has `aria-selected`), and a `tabpanel` that scrolls. Under 720 px the dialog is a full-screen sheet
and the tablist becomes a horizontal strip above the content, scrollable, with the chosen tab kept
in view. Focus enters on the chosen tab; Escape and the close button return focus to the avatar
button. *Alternative:* the right-hand drawer (rejected: 420 px are short for the devices table and
the tokens list, and the account is a settings surface, not a glance).

### The sections

1. **Profile**: the avatar and name from the session; the emails of the identities (from the
   identity data; "no email" when a provider gave none); **Publishing handle**, a field with the
   checks and the words of the publish dialog (`[a-z0-9-]{3,30}`, `handle.taken`, `handle.locked`
   explained), saved on Enter or Save; the publish dialog keeps asking the first time and links
   "Change it in your account"; **Sign out**, the same form as the menu's.
2. **Sign-ins**: one row per identity: the provider's mark, the GitHub handle or the email, the
   verified badge, "Linked <date>", and **Unlink** (after a confirmation), disabled with the hint
   "Your only sign-in. Link another before you unlink it." when `canUnlink` is false; under the
   rows, **Link GitHub** or **Link Google** for the missing provider: a link that keeps the work
   (`hooks.keep`) and navigates to `<issuer>/login?provider=<p>&link=1&return_to=<page>?account=signins`.
3. **Devices**: one row per session: the label, "Signed in <when>", "Last seen <when>", the badge
   "This device" on the current one; **Sign out** on each other row (`revokeOne`, confirmed), and
   **Sign out of other devices** under the list (confirmed; disabled with one session). Times
   through `whenText` in the page's language.
4. **API tokens**: the section from `tokens-section.ts`: the form, the token shown once, the list,
   the count.
5. **Usage**: the two meters with their numbers, and a table of the limits the usage answer
   carries (files per project, document size, image size, versions).
6. **Danger zone**: a paragraph saying what deletion does (the account, its sign-ins, its
   sessions; this product deletes the projects within seven days) and **Delete account**, a link
   that keeps the work and navigates to `<issuer>/account?return_to=<page>?account=danger`.

Sections 2 and 3 read `GET /api/account/identity` once when the panel opens and again after each
action; while loading they show skeleton rows; on `identity.unavailable` they show "The identity
service could not be reached" with **Try again** and **Open the account page**, a same-tab link
with `return_to`. A `401` from the Worker closes the panel, re-reads `/api/session` and shows the
page signed out, work kept.

### Opening, deep links and the way back

The menu becomes: **Account** (Profile), **API tokens** (that section), the usage block (a button
that opens Usage), a separator, **Sign out**. `?account=<section>` in `location.search` at start,
with a signed-in session, opens the panel at that section after the page is ready and removes the
parameter with `history.replaceState`; an unknown section opens Profile. The address the two
navigations send as `return_to` is the page's address with that parameter (`returnAddress` keeps
it within the identity service's length limit). Coming back from a link flow, Sign-ins reloads and
the new provider's row flashes; coming back after a deletion, `/api/session` says nobody and the
page is simply signed out.

### Motion

Tokens shared with the explorer (`--pg-motion-fast`, `--pg-motion`, `--pg-ease`); the reduced-
motion block neutralises all of it.

- The panel opens with a fade and a scale from 0.98 (160 ms) and closes in 100 ms; the sheet
  slides up on narrow screens.
- A section change cross-fades the content (120 ms) with a 4 px rise; the tab's indicator slides
  along the list.
- Skeleton rows shimmer while identity data loads; a row that appears (a linked provider, a new
  token) flashes 600 ms; a row that goes (an unlinked provider, a signed-out device, a revoked
  token) collapses its height (150 ms).
- The usage meters fill from zero on the first draw (240 ms).
- Buttons that wait for the Worker show the page's busy state; the status line and the panel's
  status say what happened, as the drawer did.

### Tests

- Unit: `account-panel-model.test.ts` (sections, loading and failure states, each action and
  refusal, the 401 path, deep-link parsing), `cloud/routes` tests for the proxy (signature and
  bearer on the outgoing call, pass-through of codes, `502` on timeout, `403` for a bearer API
  token, the Origin rule), `principal` test for `token`.
- Playground browser suite: the static server answers `/api/account/identity*` as it answers the
  tokens; scenarios: the menu's entries open the panel at the right section, the tabs by keyboard,
  the narrow sheet, Spanish words, the handle saved, the unreachable state with its two buttons,
  `?account=tokens` on load, dark and light screenshots.
- Cloud browser suite: `test/browser/identity.ts` answers the account API and verifies the
  signature with the suite's secret and the bearer against its minted sessions; scenarios: Sign-ins
  listed, Unlink refused for the last one, Link GitHub's address, a second browser's device
  signed out from the first and its next request answered as nobody once the verifier asks, Sign
  out of other devices, Delete account's address, a token made in the section and used as a bearer.

## Packages and interfaces

- `packages/cloud`: `Principal` (cookie) gains `token`; `routes/account.ts` the four routes;
  `routes/account.ts` names the product (`PRODUCT_NAME`, `"diagrams"`, a constant); `deps.fetch` documented
  as reaching the identity service's keys, session check and account API; `@meltemi/identity`
  `^0.2.0` (`pnpm link` against `C:\meltemi` while 0.2.0 is unpublished, never committed, as
  `docs/cloud.md` describes).
- `packages/playground`: `cloud/account-panel.ts`, `account-panel-model.ts`, `tokens-section.ts`
  (from `tokens-dialog.ts`), `identity-api.ts` (the four calls), `account.ts` (the menu),
  `shell.ts` (`?account=` on load, the panel's opening), `ui.ts` (`settings` dialogs), `avatar.ts` (the picture, shared with the presence bar), words en/es
  (`account.panel`, `signins`, `devices`, `danger`, the handle's words shared with `publish`),
  `playground.css`.

## Risks / Trade-offs

- [The identity service is slow or down] → five-second timeout, `502 identity.unavailable`, the
  sections degrade to a message and the page link; Profile, Tokens and Usage keep working.
- [The verifier caches a session for an hour] → a device signed out from the panel keeps working
  on this product for up to an hour, as a sign-out everywhere does today; the Devices section says
  "within the hour" under the action.
- [Deep-link parameter left in the address] → removed on open with `replaceState`; a reload shows
  the page without the panel.
- [`@meltemi/identity` 0.2.0 unpublished while this is built] → `pnpm link`, and the gate of
  `pnpm install --frozen-lockfile` waits for the family's publish, as the delivery change noted.
- [Two places to set the handle] → one field component and one set of words; the publish dialog
  only asks when there is none.
