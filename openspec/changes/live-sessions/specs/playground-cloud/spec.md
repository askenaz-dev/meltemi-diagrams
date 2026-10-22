## MODIFIED Requirements

### Requirement: Opening a project by address
On load the page SHALL read `project`, `invite` and `live` from `location.search`, open that
project and keep the address as it is (`invite` dropped once accepted, `live` kept), so a
reload reopens it; the link the switcher's panel and the share dialog copy SHALL be
`<origin>/p/<id>`. A signed-in person SHALL get the mode their role gives: the normal page as
`owner` or `editor`, view mode as `viewer`; an anonymous person SHALL get view mode connected
to the room as a visitor when the link admits viewing (`project-sharing`); with a current
`live` token anyone SHALL get the mode the room's `hello` gives, as a guest when there is no
account (`live-sessions`); otherwise the status line SHALL say the project was not found,
offer sign-in, and the anonymous project SHALL open as usual. An `invite` SHALL be accepted
before the role is resolved when the person is signed in, and kept in the address until they
sign in otherwise.

#### Scenario: Opened from a link
- **WHEN** a signed-in person opens `<origin>/p/<id>` of their project
- **THEN** the page lands on `/?project=<id>`, the project is open and bound, and the address stays

#### Scenario: An anonymous viewer by link
- **WHEN** an anonymous browser opens `/?project=<id>` of a `view` project
- **THEN** the project opens in view mode connected to the room, the address stays, and the status line says it follows live

#### Scenario: A guest by the live link
- **WHEN** an anonymous browser opens `/?project=<id>&live=<token>` of a `private` project during its session
- **THEN** the project opens bound to the room with the session's role, the address keeps `live`, and a reload rejoins

#### Scenario: Not found
- **WHEN** `?project=<id>` names a project the person cannot open, with no token or an ended one
- **THEN** the status line says the project was not found, offers sign-in when anonymous, and the anonymous project opens unchanged

#### Scenario: An invitation kept until sign-in
- **WHEN** an anonymous browser opens `/?project=<id>&invite=<token>` of a `private` project and signs in from the offer
- **THEN** the page returns to the same address, accepts the invitation and opens the project with the invited role
