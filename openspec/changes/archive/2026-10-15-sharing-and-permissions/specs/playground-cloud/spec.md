## MODIFIED Requirements

### Requirement: Opening a project by address
On load the page SHALL read `project` and `invite` from `location.search`, open that project and
keep the address as it is, so a reload reopens it; the link the drawer and the share dialog copy
SHALL be `<origin>/p/<id>`. A signed-in person SHALL get the mode their role gives: the normal
page as `owner` or `editor`, view mode as `viewer`; an anonymous person SHALL get view mode when
the link admits viewing (`project-sharing`), and otherwise the status line SHALL say the project
was not found, offer sign-in, and the anonymous project SHALL open as usual. An `invite` SHALL be
accepted before the role is resolved when the person is signed in, and kept in the address
until they sign in otherwise.

#### Scenario: Opened from a link
- **WHEN** a signed-in person opens `<origin>/p/<id>` of their project
- **THEN** the page lands on `/?project=<id>`, the project is open and bound, and the address stays

#### Scenario: An anonymous viewer by link
- **WHEN** an anonymous browser opens `/?project=<id>` of a `view` project
- **THEN** the project opens in view mode and the address stays

#### Scenario: Not found
- **WHEN** `?project=<id>` names a project the person cannot open
- **THEN** the status line says the project was not found, offers sign-in when anonymous, and the anonymous project opens unchanged

#### Scenario: An invitation kept until sign-in
- **WHEN** an anonymous browser opens `/?project=<id>&invite=<token>` of a `private` project and signs in from the offer
- **THEN** the page returns to the same address, accepts the invitation and opens the project with the invited role
