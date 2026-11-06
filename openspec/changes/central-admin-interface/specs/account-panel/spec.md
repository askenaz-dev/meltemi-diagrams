## MODIFIED Requirements

### Requirement: The account panel
Signed in, **Diagrams settings** SHALL open a product settings panel: a modal of at most 880 by
640 px with a title, a close button, a vertical list of tabs (Profile, Sign-ins, Devices, API
tokens, Connected apps, Usage, Danger zone; arrows, Home and End move, the chosen one is
`aria-selected`) and the chosen section as a scrolling tab panel; under 720 px it SHALL be a
full-screen sheet with the tabs as a horizontal strip above the content. Focus SHALL enter on the
chosen tab, and Escape or the close button SHALL close the panel and return focus to the avatar
button. The menu's **Diagrams settings** SHALL open Profile, **API tokens** that section and the
usage block the Usage section. Every cookie session SHALL also have **Meltemi account**, a same-tab
link to the central personal profile; owners, administrators and invitees SHALL have their central
administration link under `central-admin-navigation`. No administration tab SHALL exist in the
product panel. `?account=<section>` at start SHALL open the panel at that section once ready and
SHALL be removed from the address; an unknown section SHALL open Profile, while `administration`
SHALL follow the central-navigation requirement. Its words SHALL be in the interface language.
Anonymous and local sessions SHALL have no product account modal.

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
- **WHEN** an owner, an invitee and an ordinary account each open Diagrams settings
- **THEN** each sees the seven personal product tabs, and none sees an Administration tab or form

#### Scenario: A deep link to administration without a role
- **WHEN** a plain person loads `/?account=administration`
- **THEN** the panel opens at Profile and no administration request or central navigation is made

## REMOVED Requirements

### Requirement: Administration section
**Reason**: The product no longer renders administration forms. Their interface belongs to the central Identity console; account entry points follow the new `central-admin-navigation` capability.
