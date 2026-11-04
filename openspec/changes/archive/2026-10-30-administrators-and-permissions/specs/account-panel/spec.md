## MODIFIED Requirements

### Requirement: The account panel
Signed in, the page SHALL open an account panel: a modal of at most 880 by 640 px with a title, a
close button, a vertical list of tabs (Profile, Sign-ins, Devices, API tokens, Usage, Administration
when the session answer gives `user.administration` or `user.administrationInvitation`, Danger zone;
arrows, Home and End move, the chosen one is `aria-selected`) and the chosen section as a scrolling
tab panel; under 720 px it SHALL be a full-screen sheet with the tabs as a horizontal strip above
the content. Focus SHALL enter on the chosen tab, and Escape or the close button SHALL close the
panel and return focus to the avatar button. The menu's **Account** SHALL open Profile, **API
tokens** that section, the usage block the Usage section, and, for an owner or an administrator,
**Administration** that section, or, for a person with a pending administrator invitation,
**Invitation to administer**. `?account=<section>` in the page's address at start SHALL open the
panel at that section once the page is ready, an unknown section, or `administration` for a person
the tab is not shown to, opening Profile, and SHALL be removed from the address. Its words SHALL be
in the interface language. Anonymous, none of it SHALL exist.

#### Scenario: From the menu
- **WHEN** a signed-in person chooses API tokens in the avatar's menu
- **THEN** the panel opens with the API tokens tab selected and focused, and its section shows the tokens form and list

#### Scenario: Deep link
- **WHEN** the page loads at `/?account=devices` with a session
- **THEN** the panel opens at Devices and the address no longer holds `account`

#### Scenario: Narrow screen
- **WHEN** the page is 375 px wide and the panel opens
- **THEN** it fills the screen, the tabs are a strip above the content, and the chosen tab is in view

#### Scenario: An unknown section
- **WHEN** the page loads at `/?account=nothing` with a session
- **THEN** the panel opens at Profile

#### Scenario: Administration for whom it is
- **WHEN** the panel opens for the owner, for a person with a pending invitation and for a plain person
- **THEN** the first two see an Administration tab between Usage and Danger zone, and the third sees the six tabs of before and no Administration item in the menu

#### Scenario: A deep link to administration without a role
- **WHEN** a plain person loads `/?account=administration`
- **THEN** the panel opens at Profile and no administration request is made

## ADDED Requirements

### Requirement: Administration section
For an owner or an administrator the Administration section SHALL load `GET /api/admin` when it is
shown and after every change it makes, and SHALL show five parts:

- **Administrators**: the owners, each marked **Owner**, then the administrators with their name,
  handle, email, who invited them and since when; an owner SHALL see **Remove** on each
  administrator, behind a confirmation naming the person, and an administrator SHALL see **Leave**
  on their own row only, behind a confirmation.
- **Invitations** (owners only): an email field with **Invite**, and the pending invitations with
  their email, who invited, the expiry date and **Revoke**; the field SHALL refuse an email that is
  not one before any request, and a refusal of the Worker (`409 admin.already`, `409 admin.limit`)
  SHALL be said in words next to the field.
- **Permissions**: per permission of the catalog, its name and description, its holders (name,
  handle, email, who granted it and when) with **Revoke**, and a field **Grant to** that takes an
  account id, `@handle` or email with **Grant**; `404 not-found` SHALL be said as "No account signed
  in with this email, handle or id yet: ask the person to sign in once, or for the account id
  Profile shows", and `409 account.ambiguous` as "Several accounts signed in with this email: ask
  for the account id".
- **Take down a publication**: the publication's address (`https://<publish host>/<handle>/<slug>`
  or `<handle>/<slug>`) and a reason, refusing another host or shape in the page, and a confirmation
  naming the address before `DELETE /api/admin/publications/<handle>/<slug>`.
- **Recent changes**: the log's latest fifty entries, the newest first, as sentences in the
  interface language ("Guillmar Ortiz granted Export without the Meltemi branding to Ana, 29 Oct").

For a person with a pending invitation and no role the section SHALL show only the invitation: who
invited them, what administrators can do (grant permissions to accounts, take down any
publication), the expiry date, **Accept** and **Decline**; accepting SHALL read the session answer
again and show the full section, and declining SHALL remove the tab and close the panel's section
to Profile. No part SHALL list or search accounts that hold no role and no permission. A `404` from
any administration route SHALL make the page read the session answer again and drop the tab when the
role is gone. Names, emails, addresses and reasons SHALL be set as text.

#### Scenario: The owner invites
- **WHEN** the owner types `ana@example.com` in Invitations and chooses Invite
- **THEN** the list shows the pending invitation for `ana@example.com` with its expiry date, and Recent changes starts with the invitation

#### Scenario: The invitee accepts
- **WHEN** Ana, signed in with the verified email `ana@example.com`, opens Invitation to administer and chooses Accept
- **THEN** the section shows Administrators, Permissions, Take down a publication and Recent changes, with no Invitations part, and lists Ana among the administrators

#### Scenario: Grant by email
- **WHEN** an administrator types `ben@example.com` in Grant to under Export without the Meltemi branding and chooses Grant
- **THEN** Ben is listed among the holders with the administrator's name and the date

#### Scenario: Nobody signed in with that email
- **WHEN** an administrator grants to `nobody@example.com`
- **THEN** the field says no account signed in with it yet, and the holders are unchanged

#### Scenario: Not an email
- **WHEN** the owner types `ana` in Invitations and chooses Invite
- **THEN** the field says it is not an email and no request is sent

#### Scenario: Removed while the page is open
- **WHEN** the owner removes `u2` while `u2`'s page shows the section, and `u2` then chooses Grant
- **THEN** the grant is refused with `404`, the page reads the session again, and the Administration tab disappears

#### Scenario: A takedown from the section
- **WHEN** an administrator types `https://meltemi.page/tienda/precios` and the reason "Phishing", and confirms
- **THEN** the publication is taken down, the field empties, and Recent changes starts with the takedown and its reason

#### Scenario: Another host
- **WHEN** an administrator types `https://example.com/tienda/precios`
- **THEN** the field says it is not an address of the publish host and no request is sent
