## MODIFIED Requirements

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
