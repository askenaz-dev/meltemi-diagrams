## MODIFIED Requirements

### Requirement: Actions on the tree
The explorer SHALL offer, on the root, a folder or a file, from a context menu (right click,
Shift+F10, the context-menu key, or the "…" button a row shows on hover and focus): **New
diagram…** (a name and one of Flow, Sequence, C4 architecture, Gantt, Whiteboard, Kanban or Free
composition, in that order, with a translated description of each starting point; one file
`<folder>/<name>.meltemi` written atomically from the chosen starter, with the name as its title),
**New folder…**, **Rename** (F2: a box in the row; Enter confirms, Escape cancels), **Move to…**
(a dialog listing the folders and a field for a new one), **Duplicate** (Ctrl+D: `<name>-copy`,
then `-copy-2`…), **Download** and **Delete** (Delete, after a confirmation naming the file, or the
folder and how many files it holds). Renaming or moving a folder SHALL move every file under it.
Every name SHALL pass the path rule, SHALL keep the file's extension, and SHALL be refused when
a file exists at the resulting path, naming it, with nothing changed. In view mode the explorer
SHALL show the tree and no action. Creation SHALL add only the new file and SHALL NOT replace
existing project content, its manifest or sharing settings.

#### Scenario: A new diagram in a folder
- **WHEN** New diagram… is chosen on `diagrams` with the name `checkout` and Sequence selected
- **THEN** `diagrams/checkout.meltemi` exists with `language "0.2"` and `diagram checkout: sequence { title "checkout" }`, is open, and the row `checkout` is selected and visible

#### Scenario: A new Gantt chart
- **WHEN** New diagram… is chosen on `diagrams` with the name `roadmap` and Gantt selected
- **THEN** `diagrams/roadmap.meltemi` exists with `diagram roadmap: gantt { title "roadmap" }`, is open, and the canvas shows its empty timeline

#### Scenario: Rename in the row
- **WHEN** F2 is pressed on `overview`, `start` is typed and Enter pressed
- **THEN** the file is `diagrams/start.meltemi`, still open, and the row reads `start`

#### Scenario: A name that exists
- **WHEN** `payment` is renamed to `executive` in the purchase template
- **THEN** the box stays open, says `diagrams/executive.meltemi` exists, and nothing changed

#### Scenario: Deleting a folder
- **WHEN** Delete is chosen on `diagrams` of the purchase template and confirmed
- **THEN** the confirmation named 3 files, the three files are gone, and the tree shows `models` and `stories`

#### Scenario: View mode
- **WHEN** a project is open by a link that admits viewing only
- **THEN** the tree lists the files and no row has a context menu, a rename box or a "…" button

#### Scenario: All starting points in every project
- **WHEN** New diagram… opens in a project initially created from any existing project template, or in a mixed project without a manifest
- **THEN** the same seven choices are available in the same order, regardless of the active diagram

#### Scenario: C4 inside an existing non-C4 project
- **WHEN** C4 architecture is created as `architecture` in a flow project
- **THEN** one new file contains a valid self-contained model and context view, opens that view and leaves all previous file and manifest bytes unchanged

#### Scenario: Kanban inside an existing C4 project
- **WHEN** Kanban is created as `ideas` in a C4 project
- **THEN** one new free-diagram file contains a row of three column lists and an editable sticky, opens the board and leaves the model, imports, manifest and sharing settings unchanged

#### Scenario: Creation collision
- **WHEN** a valid destination file already exists when Create is committed
- **THEN** the dialog stays open, identifies the existing path and writes nothing

#### Scenario: Invalid name or cancelled creation
- **WHEN** the name violates the path rule or the dialog is cancelled
- **THEN** no file or project setting changes, and invalid input shows the localized reason

## ADDED Requirements

### Requirement: Initial project templates do not limit diagram creation
The project creation dialog SHALL describe its cards as initial templates. Choosing one SHALL NOT limit the New diagram catalogue of the resulting project. The same creation choices SHALL be available for editable local and cloud-backed workspaces, with keyboard access, visible focus and a layout usable on narrow screens.

#### Scenario: An initial template
- **WHEN** New project… opens in English or Spanish
- **THEN** the template chooser explains that the choice is a starting point and diagrams of other kinds can be added to the project

#### Scenario: Keyboard and narrow screen
- **WHEN** a person opens New diagram… on a narrow viewport and selects Kanban using only the keyboard
- **THEN** every choice and Create/Cancel remain reachable without horizontal page overflow, and focus returns to the invoking control on cancel

#### Scenario: Editing access is lost before creation
- **WHEN** an editable cloud project becomes read-only while the creation dialog is open
- **THEN** Create writes nothing and reports the access restriction in the interface language
