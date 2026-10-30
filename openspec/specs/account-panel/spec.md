# account-panel Specification

## Purpose
The playground's account panel: one settings modal in the page with Profile, Sign-ins, Devices, API tokens, Usage and the Danger zone, reached from the account menu and by a deep link, reading and changing the person's identity data through the Worker's proxy to the identity service, with its motion and its phone layout.
## Requirements
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

### Requirement: Profile and the handle
Profile SHALL show the avatar and the name of the session, the emails of the linked sign-ins (or
that a provider gave none), the publishing handle as a field saved with Enter or **Save**
(`PATCH /api/account`, the handle rule `[a-z0-9-]{3,30}`, and `handle.taken` and `handle.locked`
explained in words), and **Sign out**, the same form the menu posts. The publish dialog SHALL keep
asking for a handle when there is none and SHALL say that it is changed in the account. After the
handle and before Sign out, Profile SHALL show every person the heading **Account id**, one
sentence saying it is what this service knows them by and that an administrator may ask for it,
the session's `sub` as it is, and a **Copy** button that puts it on the clipboard and says
"Copied."; when the clipboard refuses, the id SHALL be selected and the words SHALL say to copy it
by hand. For a person whose session answer says `user.entitlements.unbranded` is `true`, Profile
SHALL also show, after the account id, the heading **Exports without the Meltemi branding** and one
sentence saying the account may export without it and that the export dialog offers it, in the
interface language; for anyone else nothing of that SHALL exist, and the panel SHALL ask nothing
to know it, since the session answer the page read at start carries it.

#### Scenario: Handle saved
- **WHEN** `tienda-2` is typed and Save pressed
- **THEN** `GET /api/session` returns `tienda-2` as the handle and the field says it is saved

#### Scenario: Handle refused
- **WHEN** `Tienda` is typed and Save pressed
- **THEN** nothing is sent, the field says lower-case letters, digits and hyphens from 3 to 30, and the handle is unchanged

#### Scenario: Locked by a publication
- **WHEN** a person with a publication saves another handle
- **THEN** the field says the handle is locked while a page is published under it

#### Scenario: The account id
- **WHEN** a person whose session answer says `"sub": "u_7d3f"` opens Profile and presses Copy
- **THEN** the section shows "Account id" with `u_7d3f` between the handle form and Sign out, the clipboard holds `u_7d3f` and the button's row says "Copied."

#### Scenario: Without the clipboard
- **WHEN** the browser refuses the clipboard and the person presses Copy
- **THEN** the id is selected and the row says "Select the id and copy it."

#### Scenario: An entitled person's Profile
- **WHEN** a person entitled to unbranded exports opens the panel at Profile
- **THEN** the section shows the heading "Exports without the Meltemi branding" and the sentence "Your account may export without the Meltemi branding: the export dialog offers it." after the account id and before Sign out, with no request made for it

#### Scenario: A plain person's Profile
- **WHEN** a person whose session answer says `"unbranded": false`, or whose `user` carries no `entitlements`, opens Profile
- **THEN** the account id is shown and no heading or sentence about the branding exists in the panel

#### Scenario: In Spanish
- **WHEN** the interface language is Spanish and an entitled person opens Profile
- **THEN** the headings read "Identificador de la cuenta" and "Exportaciones sin la marca de Meltemi" and the button "Copiar"

### Requirement: Sign-ins
Sign-ins SHALL list each identity the identity service reports (the provider's mark, the GitHub
handle or the email, whether the provider verified it, the link date) with **Unlink** after a
confirmation, disabled with the reason when it is the only one, and SHALL offer **Link GitHub** or
**Link Google** for the provider not yet linked: a navigation that keeps the work first and goes
to the identity service's link flow with `return_to` the page at `?account=signins`. Coming back,
the section SHALL reload and show the new identity.

#### Scenario: Unlink one of two
- **WHEN** a person with GitHub and Google unlinks Google and confirms
- **THEN** the list shows GitHub only and the status says Google was unlinked

#### Scenario: The only sign-in
- **WHEN** a person with one identity opens Sign-ins
- **THEN** its Unlink is disabled and the row says to link another provider first

#### Scenario: Link the other
- **WHEN** Link GitHub is pressed
- **THEN** the work is kept and the page navigates to the identity service's `/login?provider=github&link=1&return_to=…%3Faccount%3Dsignins`

#### Scenario: Refused by the service
- **WHEN** the unlink answers `409 identity.last`
- **THEN** the identity stays listed and the panel says it is the only sign-in

### Requirement: Devices
Devices SHALL list each live session the identity service reports (label, signed in, last seen,
and "This device" on the current one), with **Sign out** on every other row and **Sign out of
other devices** under the list, each after a confirmation and disabled when there is nothing to
sign out, saying that the other devices lose the session within the hour. A signed-out session
SHALL leave the list.

#### Scenario: One device
- **WHEN** Sign out is pressed on another device's row and confirmed
- **THEN** that row is gone, this device stays, and the identity service answers 404 to that session's check

#### Scenario: All the others
- **WHEN** Sign out of other devices is confirmed with three sessions
- **THEN** only This device remains in the list

#### Scenario: Nothing to sign out
- **WHEN** the person has one session
- **THEN** Sign out of other devices is disabled

### Requirement: API tokens and usage as sections
API tokens SHALL be the tokens dialog's contents as a section: the form that creates one, the
token shown once with a copy button, the list with created and last used, revoke after a
confirmation, the count against the limit. Usage SHALL show the projects and the storage against
their limits, as numbers and meters, and a table of the other limits the usage answer carries.

#### Scenario: A token from the panel
- **WHEN** a token named `ci` is created in the section
- **THEN** it is shown once, listed as `ci`, and works as a bearer for `GET /api/projects`

#### Scenario: Usage shown
- **WHEN** Usage opens for an account with three projects
- **THEN** it reads "3 of 100 projects", the storage used, and lists the files, document, image and versions limits

#### Scenario: Usage unknown
- **WHEN** `GET /api/account/usage` fails
- **THEN** the section says the usage could not be read and offers to try again

### Requirement: Danger zone and the way out
Danger zone SHALL say what deleting the account does and offer **Delete account**: a navigation
that keeps the work and goes to the identity service's account page with `return_to` the page at
`?account=danger`, where the deletion is confirmed. No request of the page SHALL delete the account
or link a provider, and nothing of the panel SHALL open a frame, a popup or a new tab.

#### Scenario: To the identity service
- **WHEN** Delete account is pressed
- **THEN** the work is kept and the page navigates to the identity service's `/account?return_to=…%3Faccount%3Ddanger`

#### Scenario: Back without an account
- **WHEN** the page loads at `/?account=danger` and `/api/session` answers nobody
- **THEN** the page shows signed out with its work, and no panel opens

### Requirement: When the identity service cannot be reached
When the Worker answers `502 identity.unavailable` for the identity data, Sign-ins and Devices
SHALL say the identity service could not be reached and offer **Try again** and **Open the account
page**, a same-tab link to the identity service's account page with `return_to` the page; Profile,
API tokens and Usage SHALL keep working. A `401` from the Worker SHALL close the panel, re-read the
session and show the page signed out with its work kept.

#### Scenario: Unreachable
- **WHEN** the identity data answers `502 identity.unavailable`
- **THEN** Sign-ins shows the message with its two buttons and API tokens still lists the tokens

#### Scenario: The session died
- **WHEN** an action answers `401 auth.required`
- **THEN** the panel closes, the header shows Sign in, and the open file is as it was

### Requirement: Motion of the panel
The panel SHALL open with a fade and a scale from 0.98 over 160 ms and close in 100 ms, the sheet
sliding up on narrow screens; a section change SHALL cross-fade the content over 120 ms with the
tab indicator sliding; loading rows SHALL shimmer; a row that appears SHALL flash and one that
goes SHALL collapse; the usage meters SHALL fill from zero on the first draw. When reduced motion
is asked none of it SHALL move.

#### Scenario: Opening
- **WHEN** the panel opens
- **THEN** its computed transition lasts 160 ms and ends at scale 1 and full opacity

#### Scenario: Reduced motion
- **WHEN** the browser asks for reduced motion and the panel opens
- **THEN** it shows at once with no transition

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

