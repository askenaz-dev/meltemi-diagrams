# playground-cloud Specification

## Purpose
The playground with a cloud project: the cloud projects of the explorer's switcher, an archive as a new cloud project, opening a project by address, the binding of a project to the editor, undo of one's own edits, offline work kept in IndexedDB, the versions panel and thumbnails.
## Requirements
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

### Requirement: A cloud project bound to the Studio
Opening a cloud project SHALL load its files into the Studio, connect to its room, and keep
them in step: typing, canvas edits, quick fixes, formatting, renames, imports, added and deleted
files SHALL become transactions of the document, merged and sent at most every 250 ms; changes
from the room SHALL update the text, the code pane (keeping the caret), the canvas and the
analysis, and SHALL not enter the person's undo. A kind 4 answer of the room to a local edit
SHALL be shown in the status line naming the limit, the local text SHALL return to the room's
state and the socket SHALL be reopened. The last file open in each project SHALL be remembered
per browser.

#### Scenario: A canvas edit reaches the room
- **WHEN** the person drags an element of a `layout manual` diagram
- **THEN** the room's `Y.Text` of that file holds the new `place` line

#### Scenario: A remote change keeps the caret
- **WHEN** the caret is on line 10 and a remote change inserts two lines above it
- **THEN** the caret stays on the same text, now on line 12, and the canvas redraws after the analysis pause

#### Scenario: A remote change does not undo locally
- **WHEN** a remote change arrives and the person presses Ctrl+Z
- **THEN** only the person's last own edit is undone and the remote change stays

#### Scenario: A refused transaction
- **WHEN** the room answers kind 4 `doc.too-large` for a local edit
- **THEN** the status line names the limit, the local text returns to the room's state and the socket is reopened

### Requirement: Undo of one's own edits with the same grouping
In a cloud project Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y SHALL undo and redo the person's own
transactions of the open file, with typing coalesced until a pause of 700 ms or a line break,
and with the other files of the same step (a rename across the project) undone together while
their last step is that one. A non-typing edit (a canvas plan, a fix, formatting, a rename, an
import, a file operation) SHALL always start a new step, a deletion or a line break SHALL end
the typing step, and a file rename SHALL be one undoable step of its own. The header's undo and
redo buttons SHALL follow `canUndo` and `canRedo` of the bound document.

#### Scenario: A rename across files
- **WHEN** the person renames an element referenced from another file and presses Ctrl+Z
- **THEN** both files return to their previous text

#### Scenario: Typing coalesces
- **WHEN** the person types `abc` within 700 ms and presses Ctrl+Z
- **THEN** the three characters are removed as one step

#### Scenario: Drag then type undo separately
- **WHEN** the person drags an element on the canvas, types `x` within 700 ms and presses Ctrl+Z
- **THEN** only `x` is removed and the element keeps its new position until a second Ctrl+Z

#### Scenario: Enter ends the step
- **WHEN** the person types `ab`, presses Enter, types `c` within 700 ms and presses Ctrl+Z
- **THEN** only `c` is removed and the line break stays

#### Scenario: A file rename undoes alone
- **WHEN** the person renames `a.meltemi` to `b.meltemi` and presses Ctrl+Z
- **THEN** the file is `a.meltemi` again with the same text

#### Scenario: Nothing of one's own to undo
- **WHEN** only remote changes arrived since the person's last step and Ctrl+Z is pressed
- **THEN** nothing changes and the undo button stays disabled

### Requirement: Offline and kept in IndexedDB
Each cloud document SHALL be kept in IndexedDB; opening a project SHALL load it from there at
once and then sync; with no connection the page SHALL keep editing and say so in the status
line; on reconnect the offline transactions SHALL reach the room and remote ones the page, both
merged without a dialog. The status line SHALL show connected and saved, saving, offline, or
reconnecting.

#### Scenario: Offline edits merge
- **WHEN** the connection drops, the person edits one file, another device edits another, and the connection returns
- **THEN** both edits are in both devices' documents and the status reads connected

#### Scenario: Storage unavailable
- **WHEN** IndexedDB is unavailable
- **THEN** the project still opens from the room and the status line says it will not be kept offline

### Requirement: Versions in the page
The page SHALL offer the project's versions: a list with number, label, time and the files
changed, "Name this version", and restore with confirmation; a restore SHALL arrive as a remote
change.

#### Scenario: Name and restore
- **WHEN** the person names the current state `before review`, edits, and restores that version
- **THEN** the files equal the named version and the list shows an automatic version of the state before the restore

#### Scenario: Label too long
- **WHEN** a label of 81 characters is entered
- **THEN** the dialog refuses it and nothing is created

### Requirement: Thumbnails from the page
Five seconds after the analysis of a drawable file settles, at most once a minute, the page
SHALL render the static SVG of the open diagram and send it as the project's thumbnail when it
changed; an SVG over 200 KiB SHALL not be sent.

#### Scenario: Thumbnail updated
- **WHEN** the person changes a label and waits
- **THEN** the project's thumbnail shows the new label

#### Scenario: Not for a model file
- **WHEN** the open file holds only a `model` block
- **THEN** no thumbnail is sent

### Requirement: The project switcher
Signed in, the explorer's switcher panel (`project-explorer`) SHALL list the person's cloud
projects with name, thumbnail, last change and role, the open one marked, and SHALL offer **New
project** from the template cards as a cloud project, **Import project** into a new cloud project,
**Save this project to the cloud** when the current project is the anonymous one and has files,
and per project open, rename, duplicate, copy the link and delete (with confirmation). The header's
name of an open cloud project SHALL rename it. Anonymous, the panel SHALL show the project of this
browser and its actions only, and nothing of the cloud but an invitation to sign in. A refusal of
the service (the quota above all) SHALL be said in the panel and in the status line and SHALL
change nothing in the list.

#### Scenario: Save the local project
- **WHEN** a signed-in person with the anonymous `flow` project edited chooses "Save this project to the cloud"
- **THEN** a project with those files exists in the cloud and the page is bound to it

#### Scenario: Quota shown
- **WHEN** creating a project answers `413 quota.projects`
- **THEN** the status line says the account's limit of projects is reached and the panel is unchanged

#### Scenario: Anonymous
- **WHEN** nobody is signed in and the panel opens
- **THEN** no cloud project, no Save this project to the cloud and no cloud destination of the import dialog appear

### Requirement: An archive as a new cloud project
Signed in, the import dialog SHALL create a cloud project from an archive: `POST /api/projects`
with the archive's text files under their paths, then each image and font through the binaries
route, reporting the progress, and open the project; a creation or an upload that fails SHALL
delete the project again, so that nothing half-made stays in the account, and say why. The limits
of a cloud project (paths, files, sizes) SHALL be checked before the first call, naming the limit.

#### Scenario: Texts and an image
- **WHEN** an archive with `project.json`, `diagrams/a.meltemi` and `assets/logo.png` is imported as a new cloud project
- **THEN** the project exists with the two texts, `assets/logo.png` is uploaded by hash, and the page is bound to the project

#### Scenario: An upload that fails
- **WHEN** the image's upload answers `413 quota.storage`
- **THEN** the project is deleted again, the list does not show it, and the dialog says the storage limit is reached

#### Scenario: An image over the limit
- **WHEN** the archive holds an image of 10 MiB and one byte
- **THEN** nothing is created and the dialog says an image or a font takes at most 10 MiB

