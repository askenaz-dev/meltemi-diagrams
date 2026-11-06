## ADDED Requirements

### Requirement: Trusted central account and administration destinations
Cookie sessions SHALL have a **Meltemi account** / **Cuenta Meltemi** link to `/account/profile`.
Owners, administrators and invitees SHALL also have their administration link to
`/admin/diagrams/access`. Both SHALL use the validated account origin, same tab, current `lang`,
explicit `environment` and no other query or fragment, and SHALL keep work before navigation.

#### Scenario: An owner leaves for the central console
- **WHEN** an owner edits a diagram and chooses Administration
- **THEN** the page keeps the edited browser work and navigates in the same tab to the central Diagrams access page with the interface language and explicit environment

#### Scenario: Fixed destinations discard caller parameters
- **WHEN** the validated session account address or product page carries a return address, fragment or unrelated query
- **THEN** neither destination carries those values or any token; its only parameters are `lang=en|es` and `environment=production|staging`

#### Scenario: A pending invitation
- **WHEN** the signed-in session has an administration invitation and no administration role
- **THEN** the menu's Invitation to administer leads to the same central access page and no invitation acceptance request is sent by Diagrams

#### Scenario: No administration role
- **WHEN** a signed-in session has no administration role or invitation
- **THEN** the menu has Meltemi account and Diagrams settings but no administration entry

### Requirement: Environment comes from the actual product origin
The central destination's environment SHALL be `staging` only for the actual page origin
`https://staging.diagrams.meltemi.dev`, and SHALL otherwise explicitly be `production` for hosted
or development cookie sessions. No query parameter, fragment, session role or identity-account URL
query SHALL select or override it.

#### Scenario: Staging
- **WHEN** an administrator opens the menu on `https://staging.diagrams.meltemi.dev`
- **THEN** the central account and administration links carry `environment=staging`

#### Scenario: A query cannot switch the environment
- **WHEN** production Diagrams is opened with `?environment=staging`
- **THEN** both central destinations still carry `environment=production`

### Requirement: Administration is not a product settings panel
The playground SHALL contain no Administration tab, administrative forms or `/api/admin` browser
client. Its personal modal SHALL remain **Diagrams settings** / **Ajustes de Diagrams**.
`?account=administration` SHALL be removed, then keep work and navigate to central access for an
owner, administrator or invitee, or open product Profile for another signed-in person.

#### Scenario: Product settings for an owner
- **WHEN** an owner opens Diagrams settings
- **THEN** the modal contains the same seven personal product sections as an ordinary account and no administration UI or administration API request

#### Scenario: A direct administration destination
- **WHEN** an invitee opens `?account=administration`
- **THEN** work is kept and the page navigates to the central access page without calling a Diagrams administration API

#### Scenario: A plain account asks for administration
- **WHEN** an ordinary account opens `?account=administration`
- **THEN** Profile opens and no administration request or central navigation occurs

### Requirement: Local and anonymous pages do not gain identity dependencies
The local Docker session SHALL keep its existing local-workspace and agent-setup control and
SHALL offer no central account or administration link. An anonymous page SHALL keep its existing
sign-in control. An administration query parameter SHALL not cause either kind of session to
navigate to Identity or to request administration data.

#### Scenario: Local or anonymous administration address
- **WHEN** a local or anonymous page starts with `?account=administration`
- **THEN** the parameter is removed, the existing workspace remains usable and no central account/admin navigation or administration request occurs
