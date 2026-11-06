# Design

## Context

`account.ts` owns the avatar menu, `account-panel.ts` draws product settings and `shell.ts` resolves
the `account` query parameter. The session already supplies a validated identity account URL.
The Web console owns the real administrator interface and uses the private `Administration`
binding delivered by the preceding backend change.

## Decisions

### Separate product settings from the family account

Keep the publishing handle, entitlements, tokens, connected apps and product usage in the existing
modal. Name its menu item **Diagrams settings** / **Ajustes de Diagrams**. A new **Meltemi account** /
**Cuenta Meltemi** link opens Identity's `/account/profile` in this tab. Moving product-specific
state into Identity was rejected because it crosses the backend boundary of this change.

### One administration destination

An owner or administrator sees **Administration**; an invitee sees **Invitation to administer**.
Both are ordinary same-tab links to Identity's `/admin/diagrams/access`. Opening
`?account=administration` for the same roles navigates there after removing the parameter and
keeping work. For a signed-in person with no role/invitation it opens Profile. Anonymous and local
sessions never navigate to Identity from this parameter. The Administration tab, old UI, its
browser mutation client and unused words are removed. A fallback administration panel was rejected
because it would maintain two consoles.

### Fixed destinations and actual environment

A pure helper builds new URLs from the validated session account URL's origin, discarding its
query and fragment. It accepts only the fixed account or Diagrams access pathname. Language is the
current `en` or `es`. Environment is `staging` only when the actual page origin is exactly
`https://staging.diagrams.meltemi.dev`; other hosted/development pages explicitly select
`production`. Caller query parameters, fragments, account role and account URL query never choose
the environment. Identity independently selects its fixed binding and verifies role per action.

### Preserve work and local isolation

All outgoing links invoke the existing `keep()` hook before navigation. The account controller
uses the same helper for a deep link and keeps work before assigning `location`. Local mode returns
its existing agent setup control before any hosted account menu is constructed, so no identity or
administration link is available locally.

## Interfaces and touched modules

- `packages/playground/src/cloud/account-navigation.ts`: pure account/admin URL and role helpers.
- `account-panel-model.ts`: separate the administration destination from actual modal sections.
- `account.ts`: central account/admin links and deep-link dispatch; existing `AccountHooks.keep`.
- `account-panel.ts`: seven product sections; no administration renderer.
- `shell.ts`: existing account destination resolution, preserving its removal of the parameter.
- Catalogs, focused unit tests, complete playground browser suite and bilingual user docs.
- `packages/cloud/test/browser`: retain real cookie/Origin invitation, permission, sponsorship and
  account lifecycle assertions while testing central navigation instead of removed product forms.

## Risks and verification

- Delivery before the central console is ready would strand administrators. Merge/deploy in the
  explicit order backend, Web console, then this navigation change; no feature flag or fallback.
  The preceding pull requests are [Diagrams #16](https://github.com/askenaz-dev/meltemi-diagrams/pull/16)
  and [Web #31](https://github.com/askenaz-dev/meltemi-web/pull/31), in that order.
- A staging menu could mutate production if the environment were omitted. Unit and browser
  checks cover explicit production selection and exact staging-origin selection.
- Leaving the editor could lose unsaved work. Browser checks edit source, navigate and confirm
  the existing browser storage retains it.

There are no unresolved design decisions or new dependencies.
