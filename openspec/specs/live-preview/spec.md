# live-preview Specification

## Purpose
The preview server: the project's catalog served on the loopback interface, rebuilt as files change, with pages that reload where they were.
## Requirements
### Requirement: Preview server
`meltemi-diagrams preview [path]` SHALL serve the catalog of the project containing the path on
`http://127.0.0.1:<port>/` (4317 by default, `--port`, 0 for a free port), print its address (with
the route of the file's first diagram when the path is a file), open it with `--open`, and run
until stopped. It SHALL listen on the loopback interface only and answer only requests whose
`Host` is a loopback name; other paths are 404. A port in use SHALL be reported with exit code 2.

#### Scenario: Other hosts
- **WHEN** a request reaches the preview with `Host: attacker.example`
- **THEN** it is refused with status 403

### Requirement: Live reload
The preview SHALL watch the project folder and, after a change to a source, `project.json`, the
lock or an asset, build the catalog again (printing its diagnostics) and send a `reload` event on
`/events`; the page SHALL reload keeping its route and scroll. The page's policy SHALL allow only
that connection besides the inline content.

#### Scenario: Edit a sheet
- **WHEN** a title is added to a diagram while its page is open
- **THEN** the preview builds again, the page reloads, and the new title is served

