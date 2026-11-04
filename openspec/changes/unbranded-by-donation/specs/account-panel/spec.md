# Spec Delta

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
interface language, and when `unbrandedBy` is `github-sponsors` the sentence "Granted for your
donation. Thank you." before it; for a person whose answer says `false` and carries `support`,
Profile SHALL show instead the heading **Support Meltemi Diagrams**, a link to `support.url` and
one sentence saying that a donation made with the GitHub account linked to this one lets the
account export without the branding, recognised when this panel opens, and, when the sign-ins
hold no GitHub identity, that linking one in Sign-ins is how it is recognised; for anyone else
nothing of that SHALL exist, and the panel SHALL ask nothing to know it, since the session answer
the page read at start carries it. After the sign-ins are read, Profile SHALL read the session
answer again when the sign-ins' answer says a claim was made (`claimed: true`), so the heading
changes without a reload.

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
- **WHEN** a person whose session answer says `"unbranded": false` and carries no `support`, or whose `user` carries no `entitlements`, opens Profile
- **THEN** the account id is shown and no heading or sentence about the branding exists in the panel

#### Scenario: In Spanish
- **WHEN** the interface language is Spanish and an entitled person opens Profile
- **THEN** the headings read "Identificador de la cuenta" and "Exportaciones sin la marca de Meltemi" and the button "Copiar"

#### Scenario: A person who may donate
- **WHEN** a person whose session answer says `"unbranded": false` and `"support": { "url": "https://github.com/sponsors/askenaz" }` opens Profile with a Google sign-in only
- **THEN** the section shows "Support Meltemi Diagrams", the link, the sentence about the donation and that linking GitHub in Sign-ins is how it is recognised; in Spanish "Apoya a Meltemi Diagrams"

#### Scenario: The claim while the panel is open
- **WHEN** a sponsor opens Profile and the sign-ins' answer says `claimed: true`
- **THEN** the panel reads the session again and shows "Granted for your donation. Thank you." with the entitlement heading, with no reload

### Requirement: Administration section
For an owner or an administrator the Administration section SHALL load `GET /api/admin` when it is
shown and after every change it makes, and SHALL show six parts:

- **Administrators**: the owners, each marked **Owner**, then the administrators with their name,
  handle, email, who invited them and since when; an owner SHALL see **Remove** on each
  administrator, behind a confirmation naming the person, and an administrator SHALL see **Leave**
  on their own row only, behind a confirmation.
- **Invitations** (owners only): an email field with **Invite**, and the pending invitations with
  their email, who invited, the expiry date and **Revoke**; the field SHALL refuse an email that is
  not one before any request, and a refusal of the Worker (`409 admin.already`, `409 admin.limit`)
  SHALL be said in words next to the field.
- **Permissions**: per permission of the catalog, its name and description, its holders (name,
  handle, email, who granted it and when, "GitHub Sponsors" for a claim) with **Revoke**, and a
  field **Grant to** that takes an
  account id, `@handle` or email with **Grant**; `404 not-found` SHALL be said as "No account signed
  in with this email, handle or id yet: ask the person to sign in once, or for the account id
  Profile shows", and `409 account.ambiguous` as "Several accounts signed in with this email: ask
  for the account id".
- **Sponsorships** (when the answer lists any): the sponsorships received, the newest first, each
  with the sponsor's login, one-time or monthly and the amount, the date, the status, and who
  claimed it or **Unclaimed** with **Grant by hand**, which moves the focus to the Grant field of
  the permission with the login as its placeholder; a private sponsorship SHALL be marked
  private.
- **Take down a publication**: the publication's address (`https://<publish host>/<handle>/<slug>`
  or `<handle>/<slug>`) and a reason, refusing another host or shape in the page, and a confirmation
  naming the address before `DELETE /api/admin/publications/<handle>/<slug>`.
- **Recent changes**: the log's latest fifty entries, the newest first, as sentences in the
  interface language ("Guillmar Ortiz granted Export without the Meltemi branding to Ana, 29 Oct";
  "GitHub Sponsors granted Export without the Meltemi branding to Ana (ana), 4 Nov").

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

#### Scenario: An unclaimed sponsorship
- **WHEN** the answer lists a monthly sponsorship by `ben` of 1000 cents, unclaimed, and the administrator presses Grant by hand
- **THEN** the Sponsorships part shows "ben · monthly · US$10 · Unclaimed" and the Grant field of the permission has the focus with `ben` as its placeholder

#### Scenario: No sponsorships
- **WHEN** the answer's `sponsorships` is `[]`
- **THEN** the section shows no Sponsorships part
