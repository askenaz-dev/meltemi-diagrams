## ADDED Requirements

### Requirement: Link access and members
A project SHALL have a link level, `private` by default, `view` or `edit`, set by its owner
(`PATCH /api/projects/:id/sharing { linkAccess }`), and members with a role `viewer` or
`editor` besides the owner. Access SHALL resolve as: owner → `owner`; a member → their role,
raised to `viewer` by a `view` link and to `editor` by an `edit` link; anyone else → `viewer`
with a `view` or `edit` link, `editor` with an `edit` link when signed in, and nothing when
`private`. When the role falls short a route SHALL answer, in this order: `404
project.not-found` when access resolves to nothing; `401 auth.required` when the principal is
anonymous and the link would give a signed-in person enough (a `write` route on an `edit`
link), so the page can offer sign-in; `403 access.denied` for any other insufficient role.
Only the owner SHALL manage sharing.

#### Scenario: Edit by link needs an account
- **WHEN** a project's link level is `edit` and an anonymous request pushes files
- **THEN** the answer is `401 auth.required`, while the same request signed in succeeds

#### Scenario: Anonymous push on a private project
- **WHEN** a project is `private` and an anonymous request pushes files
- **THEN** the answer is `404 project.not-found`, not `401`

#### Scenario: A private project does not exist for others
- **WHEN** a signed-in person who is not a member reads a `private` project
- **THEN** the answer is `404 project.not-found`

#### Scenario: A viewer cannot change sharing
- **WHEN** a viewer patches the link level
- **THEN** the answer is `403 access.denied`

### Requirement: The role each route needs
Every route SHALL state the role it needs and check it with the same resolution:

| Needs | Routes |
| --- | --- |
| `manage` (owner) | `DELETE /api/projects/:id`; `PATCH /api/projects/:id` (name, description); `PATCH …/sharing`; `POST …/members`; `PATCH`/`DELETE …/members/:sub`; `GET`/`DELETE …/invitations`; `PUT`/`DELETE …/publish` |
| `write` (editor) | `PUT …/files`; `PUT`/`DELETE …/binaries/<path>`; `PUT …/thumbnail`; `POST …/versions`; `POST …/versions/:n/restore` |
| `read` (viewer, anonymous included on a link) | `GET /api/projects/:id`; `GET …/files`; `GET`/`HEAD …/blobs/<hash>`; `GET …/versions`, `…/versions/:n`; `GET …/thumbnail`; `GET …/sharing`; the room as viewer |

`POST …/duplicate` SHALL need `read` and create in the caller's account; `DELETE
…/members/me` SHALL need a membership; `PATCH /api/account { handle }` SHALL need a person, with the cookie
or an API token (the command line publishes with one); the admin routes SHALL need a cookie principal listed in `ADMIN_SUBS`.

#### Scenario: An editor cannot delete
- **WHEN** an editor calls `DELETE /api/projects/:id`
- **THEN** the answer is `403 access.denied` and the project remains

#### Scenario: An editor restores a version
- **WHEN** an editor calls `POST …/versions/:n/restore`
- **THEN** the version is restored as it would be for the owner

### Requirement: Invitations
The owner SHALL invite by email with a role (`POST /api/projects/:id/members { email, role }`),
which records a pending invitation with a token and answers its link; a pending invitation SHALL
become a membership when that email signs in verified by the provider, or when a signed-in
person opens the link (`POST /api/invitations/:token/accept`), and SHALL expire after thirty
days; the owner SHALL list, revoke invitations, change roles and remove members; a member SHALL
be able to leave; an invalid or expired token SHALL answer `404 invite.invalid`. Invitation
tokens and links SHALL be returned only to the owner: `GET …/invitations` SHALL answer `403
access.denied` to anyone else, and `GET …/sharing` SHALL answer the full state to the owner and
only `{ linkAccess, role }` to others, with the member list (names and pictures, never emails)
added for members and nothing of it for link-only viewers. A project SHALL hold at most 50
members plus pending invitations (`413 quota.members`).

#### Scenario: Resolved at sign-in
- **WHEN** `ana@example.com` is invited as editor and later a session with that email verified calls `GET /api/session`
- **THEN** Ana is an editor of the project and the invitation is accepted

#### Scenario: Unverified email does not match
- **WHEN** a session carries that email with `email_verified` false
- **THEN** the invitation stays pending

#### Scenario: Expired link
- **WHEN** an invitation link older than thirty days is accepted
- **THEN** the answer is `404 invite.invalid`

#### Scenario: A viewer asks for the invitations
- **WHEN** a viewer calls `GET …/invitations` or `GET …/sharing`
- **THEN** the first answers `403 access.denied` and the second only `{ linkAccess, role }`

#### Scenario: The fifty-first invitation
- **WHEN** a project has 50 members and pending invitations together and the owner invites another
- **THEN** the answer is `413 quota.members` and nothing is recorded

### Requirement: Viewing by link
`/p/<id>` SHALL answer a 302 to `/?project=<id>` keeping the query (`?invite=` included), and
the project's link SHALL stay `<origin>/p/<id>`; the page SHALL read `project` and `invite`
from `location.search`, keep the address as it is, and open the project for anyone its link
admits: with the role `viewer` the page SHALL be read-only (`CodePane.setReadOnly(true)`; the
`Playground` guards on `applyEdits`, `format`, `rename`, `newFile`, `renameFile`, `deleteFile`
and `openLocal`; the binding sending no update; the canvas with `readOnly` through its
`settings` message), while exports, stories and effects work, "Make a copy" loads the files as
the anonymous project, and signed in "Save a copy to my projects" duplicates it; with `editor`
or `owner` it SHALL open normally. Anonymous viewers SHALL read a snapshot and be told to
reload after five minutes; signed-in viewers SHALL follow the room live. A project the link
does not admit SHALL show "not found" without revealing whether it exists.

#### Scenario: Redirected with the invitation
- **WHEN** a signed-in browser opens `/p/<id>?invite=<token>`
- **THEN** the Worker answers `302` to `/?project=<id>&invite=<token>` and the page accepts the invitation before opening the project

#### Scenario: Anonymous viewer
- **WHEN** an anonymous browser opens `/p/<id>` of a `view` project
- **THEN** the diagrams draw, the story plays, the SVG export works, and the code pane refuses typing

#### Scenario: A private link
- **WHEN** an anonymous browser opens `/p/<id>` of a `private` project
- **THEN** the page says the project was not found

#### Scenario: Make a copy
- **WHEN** an anonymous viewer chooses "Make a copy"
- **THEN** the page leaves view mode with the files as its anonymous project, kept in the browser as usual

### Requirement: The share dialog
In a cloud project the share action SHALL open a dialog with the link level, the project's link
with copy, the members and their roles, invite by email with a role, pending invitations with
their links and revoke, and leave; the owner SHALL be able to change everything, while a
non-owner SHALL see only the link, their own role, as a member the member list (names and
pictures) and "Leave", never an invitation or its link. The anonymous project's dialog SHALL
stay the `#p=` dialog.

#### Scenario: Invite and copy
- **WHEN** the owner invites `ana@example.com` as viewer
- **THEN** the dialog lists the pending invitation with a link `<origin>/p/<id>?invite=…` and a copy button

#### Scenario: A viewer's dialog
- **WHEN** a link-only viewer opens the dialog
- **THEN** it shows the link and the role `viewer`, no member, no invitation and no control that changes the level

#### Scenario: An invalid email
- **WHEN** the owner enters `ana@`
- **THEN** the dialog refuses it and nothing is sent

### Requirement: The cascade
Deleting the account SHALL remove its memberships, the invitations it created or that address
its verified email, and its publications; a project whose owner is deleted SHALL be deleted
with them.

#### Scenario: Owner deleted
- **WHEN** the owner of a shared project is deleted
- **THEN** the project, its memberships and its publication are gone and the members' lists no longer show it

#### Scenario: Member deleted
- **WHEN** a member is deleted
- **THEN** the project remains and the membership is gone
