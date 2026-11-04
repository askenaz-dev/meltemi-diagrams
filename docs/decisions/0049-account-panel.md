# 0049. The account panel: one view in the page, the Worker between it and the identity service

Status: accepted (account-panel change, 21 October 2026)

## Context

Reviewing 1.9.0 the owner found the account scattered and leaving the page. The header's menu
opened the identity service's account page in a new tab, which broke the flow; the API tokens lived
in a dialog of their own; the usage sat under the menu's entries; and the publishing handle could
only be set inside the publish dialog. The owner asked for one account view inside the playground,
with the API keys in it, and ruled out two ways of building it: frames, which they consider unsafe,
and the page talking to any origin but its own. The identity service (decision 0002 of the family's
repository) answered pages and forms only, and held what the view needed most: the person's linked
sign-ins and their sessions.

## Decision

- **A settings panel in the page.** The avatar's menu opens a modal with a list of sections beside
  the one shown: Profile (with the handle), Sign-ins, Devices, API tokens, Usage and Danger zone. On a
  narrow screen it is a full-screen sheet with the sections as a strip of tabs. The tokens dialog
  became a section; the handle moved to Profile and the publish dialog still asks for it the first
  time.
- **The Worker is the only caller of the identity service.** Four routes,
  `/api/account/identity…`, read and change the person's sign-ins and sessions by calling the
  identity service's account API (its decision 0005) with the person's session token as a bearer and
  this product's signature, made with the secret the two already share for the deletion events. The
  page keeps `connect-src 'self'` and `frame-src 'self'`: its policy, and the rule that it talks to
  its own origin only, do not change.
- **A cookie only, and the Origin rule.** The routes refuse an API token (an automation does not
  manage the account) and apply the Origin rule to their changes. The cookie principal keeps the
  token it was verified from, which only these routes read.
- **Two flows leave the page and come back.** Linking a provider (GitHub and Google refuse anything
  but the top window) and deleting the account (whose confirmation and final page are the identity
  service's) are navigations in the same tab, the work kept first. They return to `?account=<section>`,
  which opens the panel there and leaves the address.
- **Degrade, never block.** When the identity service cannot be reached the two sections that need
  it say so, with a retry and a link to its page; Profile, API tokens and Usage keep working. A
  session that ends under the panel reloads the page signed out, the work kept.

## Consequences

- The Worker's `deps.fetch` reaches the identity service's account API besides its keys and session
  check, and the browser suite's stand-in for the identity service answers that API and checks the
  product's signature.
- `@meltemi/identity` 0.2.0 is required: the Worker signs its calls with `signProductRequest`.
- A device signed out from the panel keeps working on this product until the verifier checks its
  session again, at most an hour, as every sign-out does.
