# Proposal

## Why

The family administration is one console in Identity. The hosted Diagrams account panel currently
duplicates administrator invitations, permissions, sponsorships, publications and activity. Its
menu and account address must lead to the central console while preserving the actual product
environment and the person's work.

This is a post-1.0 hosted-service change outside `docs/roadmap-1.0.md`.

## What Changes

- Replace the hosted Administration panel and its browser API client with same-tab navigation to
  Identity's central Diagrams access page; owners, administrators and invitees keep their menu entry.
- Keep the product account modal as **Diagrams settings** and add **Meltemi account** for the
  central personal profile. Save browser work before either external navigation.
- Preserve the interface language and explicitly select production or staging from the page's
  actual origin; no query parameter can select an environment.
- Update bilingual user documentation and browser/unit checks. Local Docker stays offline and
  keeps its agent setup control.

## Capabilities

### New Capabilities

- `central-admin-navigation`: trusted central destinations, environment and language selection,
  work preservation and local-mode isolation.

### Modified Capabilities

- `account-panel`: product settings have no administration tab or forms; administration menu and
  deep link navigate to the central console.
- `cloud-accounts`: entitlement administration is described through the central console rather
  than a product account-panel section; persistence and business operations are unchanged.

## Impact

`packages/playground` account navigation, catalogs and tests; the real-Worker cloud browser
acceptance scenarios; `docs/web-app.md` and `docs/cloud.md`
with their Spanish counterparts. No new dependency, identity credential, public backend route or
data schema. The branch is stacked on `central-admin-service`; delivery waits for that backend
and the Web `central-administration` console to be deployed and verified first.

## Non-goals

- The private Worker transport belongs to `central-admin-service`.
- Central administration forms and family personal-account settings belong to Web's
  `central-administration` change.
- Infrastructure, deployment, owner allowlists, billing and secrets belong to delivery.
