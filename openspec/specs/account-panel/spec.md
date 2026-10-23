# account-panel Specification

## Purpose
The playground's account panel: one settings modal in the page with Profile, Sign-ins, Devices, API tokens, Usage and the Danger zone, reached from the account menu and by a deep link, reading and changing the person's identity data through the Worker's proxy to the identity service, with its motion and its phone layout.
## Requirements
### Requirement: The account panel
Signed in, the page SHALL open an account panel: a modal of at most 880 by 640 px with a title, a
close button, a vertical list of tabs (Profile, Sign-ins, Devices, API tokens, Usage, Danger
zone; arrows, Home and End move, the chosen one is `aria-selected`) and the chosen section as a
scrolling tab panel; under 720 px it SHALL be a full-screen sheet with the tabs as a horizontal
strip above the content. Focus SHALL enter on the chosen tab, and Escape or the close button SHALL
close the panel and return focus to the avatar button. The menu's **Account** SHALL open Profile,
**API tokens** that section, and the usage block the Usage section. `?account=<section>` in the
page's address at start SHALL open the panel at that section once the page is ready, an unknown
section opening Profile, and SHALL be removed from the address. Its words SHALL be in the
interface language. Anonymous, none of it SHALL exist.

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

### Requirement: Profile and the handle
Profile SHALL show the avatar and the name of the session, the emails of the linked sign-ins (or
that a provider gave none), the publishing handle as a field saved with Enter or **Save**
(`PATCH /api/account`, the handle rule `[a-z0-9-]{3,30}`, and `handle.taken` and `handle.locked`
explained in words), and **Sign out**, the same form the menu posts. The publish dialog SHALL keep
asking for a handle when there is none and SHALL say that it is changed in the account.

#### Scenario: Handle saved
- **WHEN** `tienda-2` is typed and Save pressed
- **THEN** `GET /api/session` returns `tienda-2` as the handle and the field says it is saved

#### Scenario: Handle refused
- **WHEN** `Tienda` is typed and Save pressed
- **THEN** nothing is sent, the field says lower-case letters, digits and hyphens from 3 to 30, and the handle is unchanged

#### Scenario: Locked by a publication
- **WHEN** a person with a publication saves another handle
- **THEN** the field says the handle is locked while a page is published under it

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

