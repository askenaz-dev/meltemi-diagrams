## MODIFIED Requirements

### Requirement: Link access and members
A project SHALL have a link level, `private` by default, `view` or `edit`, set by its owner
(`PATCH /api/projects/:id/sharing { linkAccess }`), and members with a role `viewer` or
`editor` besides the owner. Access SHALL resolve as: owner → `owner`; a member → their role,
raised to `viewer` by a `view` link and to `editor` by an `edit` link; anyone else → `viewer`
with a `view` or `edit` link, `editor` with an `edit` link when signed in, and nothing when
`private`. A current live session token (`live-sessions`) SHALL raise the role of whoever
carries it, signed in or not, to the session's (`editor` when guests may edit, else
`viewer`), on the socket and on the reads that take the token, and nowhere else. When the role
falls short a route SHALL answer, in this order: `404 project.not-found` when access resolves
to nothing; `401 auth.required` when the principal is anonymous and the link would give a
signed-in person enough (a `write` route on an `edit` link), so the page can offer sign-in;
`403 access.denied` for any other insufficient role. Only the owner SHALL manage sharing.

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

#### Scenario: A token raises only where it is taken
- **WHEN** an anonymous request with a current live token pushes files to a `private` project
- **THEN** the answer is `404 project.not-found`, while the socket with the same token is admitted

### Requirement: The role each route needs
Every route SHALL state the role it needs and check it with the same resolution:

| Needs | Routes |
| --- | --- |
| `manage` (owner) | `DELETE /api/projects/:id`; `PATCH /api/projects/:id` (name, description); `PATCH …/sharing`; `POST …/members`; `PATCH`/`DELETE …/members/:sub`; `GET`/`DELETE …/invitations`; `PUT`/`DELETE …/publish`; `PUT`/`GET`/`DELETE …/live` |
| `write` (editor) | `PUT …/files`; `PUT`/`DELETE …/binaries/<path>`; `PUT …/thumbnail`; `POST …/versions`; `POST …/versions/:n/restore` |
| `read` (viewer, anonymous included on a link) | `GET /api/projects/:id`; `GET …/files`; `GET`/`HEAD …/blobs/<hash>`; `GET …/versions`, `…/versions/:n`; `GET …/thumbnail`; `GET …/sharing`; the room as viewer |

`POST …/duplicate` SHALL need `read` and create in the caller's account; `DELETE
…/members/me` SHALL need a membership; `PATCH /api/account { handle }` SHALL need a person, with the cookie
or an API token (the command line publishes with one); the admin routes SHALL need a cookie principal listed in `ADMIN_SUBS`.
`GET /api/projects/:id` and `GET`/`HEAD …/blobs/<hash>` SHALL also take `read` from a current
live token in `X-Meltemi-Live`; no other route SHALL read the header.

#### Scenario: An editor cannot delete
- **WHEN** an editor calls `DELETE /api/projects/:id`
- **THEN** the answer is `403 access.denied` and the project remains

#### Scenario: An editor restores a version
- **WHEN** an editor calls `POST …/versions/:n/restore`
- **THEN** the version is restored as it would be for the owner

#### Scenario: A token reads a thumbnail
- **WHEN** an anonymous request with a current live token calls `GET …/thumbnail` of a `private` project
- **THEN** the answer is `404 project.not-found`

### Requirement: Viewing by link
`/p/<id>` SHALL answer a 302 to `/?project=<id>` keeping the query (`?invite=` and `?live=`
included), and the project's link SHALL stay `<origin>/p/<id>`; the page SHALL read `project`,
`invite` and `live` from `location.search`, keep the address as it is, and open the project
for anyone its link admits: with the role `viewer` the page SHALL be read-only
(`CodePane.setReadOnly(true)`; the `Playground` guards on `applyEdits`, `format`, `rename`,
`newFile`, `renameFile`, `deleteFile` and `openLocal`; the binding sending no update; the
canvas with `readOnly` through its `settings` message), while exports, stories and effects
work, "Make a copy" loads the files as the anonymous project, and signed in "Save a copy to my
projects" duplicates it; with `editor` or `owner` it SHALL open normally. A viewer, signed in
or not, SHALL follow the room live, an anonymous one with a guest identity, and SHALL be in
the presence as anybody; the page SHALL read the snapshot only when the room does not answer
within the usual wait, and then say it may be old and offer to reload. A project the link
does not admit SHALL show "not found" without revealing whether it exists.

#### Scenario: Redirected with the invitation
- **WHEN** a signed-in browser opens `/p/<id>?invite=<token>`
- **THEN** the Worker answers `302` to `/?project=<id>&invite=<token>` and the page accepts the invitation before opening the project

#### Scenario: Anonymous viewer
- **WHEN** an anonymous browser opens `/p/<id>` of a `view` project
- **THEN** the diagrams draw, the story plays, the SVG export works, and the code pane refuses typing

#### Scenario: Anonymous and live
- **WHEN** an anonymous browser has a `view` project open and the owner changes a file
- **THEN** the change shows on the anonymous page as it is made, the owner's header lists "Guest NN", and the anonymous browser keeps nothing in IndexedDB

#### Scenario: The room does not answer
- **WHEN** an anonymous browser opens a `view` project and the room sends no answer within the wait
- **THEN** the page shows the snapshot and offers to reload

#### Scenario: A private link
- **WHEN** an anonymous browser opens `/p/<id>` of a `private` project
- **THEN** the page says the project was not found

#### Scenario: Make a copy
- **WHEN** an anonymous viewer chooses "Make a copy"
- **THEN** the page leaves view mode with the files as its anonymous project, kept in the browser as usual

### Requirement: The share dialog
In a cloud project the share action SHALL open a dialog with the link level, the project's link
with copy, the members and their roles, invite by email with a role, pending invitations with
their links and revoke, leave, and, for the owner, the live session section
(`live-sessions`); the owner SHALL be able to change everything, while a non-owner SHALL see
only the link, their own role, as a member the member list (names and pictures) and "Leave",
never an invitation or its link, and nothing of the live session. The anonymous project's
dialog SHALL stay the `#p=` dialog, with one sentence saying a live session needs the project
in an account and the action that takes it there.

#### Scenario: Invite and copy
- **WHEN** the owner invites `ana@example.com` as viewer
- **THEN** the dialog lists the pending invitation with a link `<origin>/p/<id>?invite=…` and a copy button

#### Scenario: A viewer's dialog
- **WHEN** a link-only viewer opens the dialog
- **THEN** it shows the link and the role `viewer`, no member, no invitation, no live-session control and no control that changes the level

#### Scenario: An invalid email
- **WHEN** the owner enters `ana@`
- **THEN** the dialog refuses it and nothing is sent

#### Scenario: The anonymous project's dialog
- **WHEN** a signed-in person opens the share dialog of the anonymous project
- **THEN** it offers the `#p=` link and "Save to my projects" as the way to a live session
