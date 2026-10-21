# project-explorer Specification

## Purpose
The playground's explorer: the tree of the project's folders, diagrams and images with their problems, its actions, keys and drag and drop, Show all files and project settings, the project switcher and its Projects panel, New project from the templates' cards, the import and export of a project archive, and the motion of all of it.
## Requirements
### Requirement: The explorer pane
The playground SHALL show an explorer left of the code pane: a header naming the open project and a
tree of its folders and diagrams. The explorer SHALL be 180 to 480 px wide, resized by dragging its
edge (Left and Right on the focused edge move it 16 px, a double click resets it), collapsed to a
rail with one button that expands it, toggled by Ctrl+B (Cmd+B) and focused by Ctrl+Shift+E; its
width, whether it is collapsed and whether all files are shown SHALL be kept with the page's
settings. On a narrow screen the explorer SHALL be the first of three tabs, **Files**, **Code** and
**Canvas**, and opening a file from it SHALL switch to the code tab. Its words SHALL be in the
interface language.

#### Scenario: Collapse and expand
- **WHEN** Ctrl+B is pressed with the explorer open, and the page is reloaded
- **THEN** the explorer is a rail with one button, the code and the canvas take the width, and after the reload it is still collapsed

#### Scenario: Resized by the keyboard
- **WHEN** the explorer's edge is focused and Right is pressed three times
- **THEN** the explorer is 48 px wider and the width is kept across a reload

#### Scenario: Narrow screen
- **WHEN** the page is 375 px wide
- **THEN** the tabs are Files, Code and Canvas, and choosing a diagram in Files shows the Code tab with that file

#### Scenario: Too narrow a width
- **WHEN** the edge is dragged to 100 px
- **THEN** the explorer stops at 180 px

### Requirement: The tree of folders and diagrams
The tree SHALL show the project's folders and, inside them, each `.meltemi` file by its name without
the extension with the icon of its first diagram's kind, and each image with a picture icon;
folders come before files at every level, each sorted by name. A file
whose compilation holds more than one diagram or story SHALL expand to one child per diagram (its
title, or its id) and story. Files with problems SHALL show a count of errors or, failing that, of
warnings; a collapsed folder SHALL show the sum of its files'. Clicking a file SHALL open it;
clicking a diagram child SHALL open the file and show that diagram on the canvas; a story child
SHALL open the file with that story chosen. The open file SHALL be marked as current and, inside
it, the diagram the canvas shows SHALL be selected. The tree SHALL follow every change of the
project's files and compilations, those made by another person in a cloud project included,
without losing the focused row, the expanded folders or the scroll position.

#### Scenario: The purchase template
- **WHEN** the purchase template is open with all files hidden
- **THEN** the tree shows the folders `diagrams`, `models` and `stories`; `diagrams` holds `architecture`, `executive` and `payment`; `architecture` expands to `context` and `containers`; and `project.json` is not listed

#### Scenario: Picking a view
- **WHEN** `containers` under `architecture` is clicked
- **THEN** `diagrams/architecture.meltemi` is open in the code pane and the canvas shows the containers view

#### Scenario: A problem mark
- **WHEN** `style missing { fill "#fff" }` is typed into `diagrams/overview.meltemi` of the flow template
- **THEN** after the analysis pause the row `overview` shows 1 error and the mark goes when the line is removed

#### Scenario: A file that does not parse
- **WHEN** the text of a file is `diagram {` and nothing else
- **THEN** the file is listed by its name with an error count and no children, and clicking it opens it

#### Scenario: A remote change keeps the focus
- **WHEN** a row is focused in a cloud project and another person adds a file to the same folder
- **THEN** the new file appears in order and the focused row, the expanded folders and the scroll are as they were

### Requirement: Show all files
By default the tree SHALL list folders, `.meltemi` files and images only, hiding other files and
the folders left with nothing to show. **Show all files**, a toggle in the explorer's footer and in
the project menu, kept per browser, SHALL list every file, `project.json` and `assets.lock.json`
with a settings icon and the rest with a plain file icon, and SHALL add **New file** to the context
menu for text files of any kind. When a hidden file has a problem, the footer SHALL say how many
hidden files have problems and offer to show them, which turns the toggle on and selects the first.
**Project settings**, in the project menu, SHALL open `project.json` whatever the toggle says, and
SHALL create a manifest with the project's name, the language version and the tool's version range
when the project has none.

#### Scenario: Hidden by default
- **WHEN** the c4 template opens in a browser with no settings
- **THEN** the tree shows `models/system` and `diagrams/views` and neither `project.json` nor any other file

#### Scenario: Showing all
- **WHEN** Show all files is turned on and the page is reloaded
- **THEN** `project.json` is listed with the settings icon, and it is still listed after the reload

#### Scenario: A hidden problem
- **WHEN** all files are hidden and `project.json` holds `{ "name": 3 }`
- **THEN** the footer says one hidden file has a problem, and choosing to show it lists `project.json` selected with its error count

#### Scenario: Settings of a project without a manifest
- **WHEN** a project with only `diagrams/a.meltemi` is open and Project settings is chosen
- **THEN** `project.json` exists with the project's name, `language` and `tools`, and is open in the code pane

### Requirement: Actions on the tree
The explorer SHALL offer, on the root, a folder or a file, from a context menu (right click,
Shift+F10, the context-menu key, or the "…" button a row shows on hover and focus): **New
diagram…** (a name and a kind, flow, free or sequence; the file `<folder>/<name>.meltemi` written
through `createDiagram` with the name as the title), **New folder…**, **Rename** (F2: a box in the
row; Enter confirms, Escape cancels), **Move to…** (a dialog listing the folders and a field for
a new one), **Duplicate** (Ctrl+D: `<name>-copy`, then `-copy-2`…), **Download** and **Delete**
(Delete, after a confirmation naming the file, or the folder and how many files it holds). Renaming
or moving a folder SHALL move every file under it. Every name SHALL pass the path rule, SHALL keep
the file's extension, and SHALL be refused when a file exists at the resulting path, naming it,
with nothing changed. In view mode the explorer SHALL show the tree and no action.

#### Scenario: A new diagram in a folder
- **WHEN** New diagram… is chosen on `diagrams` with the name `checkout` and the kind sequence
- **THEN** `diagrams/checkout.meltemi` exists with `language "0.2"` and `diagram checkout: sequence { title "checkout" }`, is open, and the row `checkout` is selected and visible

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

### Requirement: Drag and drop
Rows SHALL be draggable, singly or as a selection made with Ctrl or Shift; the folder row under the
pointer, or the tree's empty space for the root, SHALL be the target and SHALL highlight; a drop
SHALL move each dragged file to the target, refused as a whole, with nothing moved, when any name
exists there; Escape SHALL cancel the drag. Files dropped from outside the page SHALL be added to
the target folder, a `.zip` SHALL open the import dialog instead.

#### Scenario: A file into a folder
- **WHEN** `diagrams/executive` is dragged onto `stories`
- **THEN** the file is `stories/executive.meltemi` and its row is under `stories`

#### Scenario: A drop that would overwrite
- **WHEN** `a/x.meltemi` and `a/y.meltemi` are dragged onto `b`, which holds `y.meltemi`
- **THEN** nothing moves and the status says `b/y.meltemi` exists

#### Scenario: An image from the desktop
- **WHEN** `logo.png` is dropped from the desktop onto `diagrams`
- **THEN** `diagrams/logo.png` is in the project and listed with the picture icon

### Requirement: The project switcher
The explorer's header SHALL name the open project with a chip saying where it lives: "This
browser", or for a cloud project its connection ("Saved to the cloud", "Saving…", "Offline", "View
only"), and SHALL open a panel: **New project…**, **Import project…**, **Export project (.zip)**,
**Save this project to the cloud** (the anonymous project with files, signed in), **Project
settings** and **Show all files**; then the project of this browser, marked when open and opened
on a click, with **Previous project · Restore** when one is kept; then, signed in, the person's
cloud projects with name, thumbnail, last change and role, the open one marked, each opened on a
click, with rename, duplicate, copy the link and delete for the owner, a filter field above eight
projects and the count against the account's limit; signed out, one line inviting to sign in. The
name in the header SHALL be editable (a pencil, or F2 with the header focused): in the browser
project it writes `name` in `project.json`; in a cloud project it renames the project. A name
SHALL be 1 to 100 characters with no control characters, refused otherwise with the reason.

#### Scenario: Anonymous
- **WHEN** the panel opens with nobody signed in
- **THEN** it lists New project, Import project, Export project, Project settings, Show all files, This browser marked as open, and a line inviting to sign in, and nothing about saving to the cloud

#### Scenario: Signed in
- **WHEN** a person with two cloud projects opens the panel while the anonymous project is open
- **THEN** This browser is marked, the two projects are listed with their thumbnails and "2 of 100 projects", Save this project to the cloud is offered, and clicking a project opens it and closes the panel

#### Scenario: Renaming the local project
- **WHEN** the header's pencil is used on the browser project and `Tienda` is confirmed
- **THEN** `project.json` holds `"name": "Tienda"` and the header reads Tienda

#### Scenario: Renaming a cloud project
- **WHEN** the header's name of a cloud project is changed to `Pagos`
- **THEN** the service's list names it `Pagos` and so does the panel

#### Scenario: An empty name
- **WHEN** the name is emptied and confirmed
- **THEN** the box says the project needs a name and the project keeps its name

### Requirement: New project from cards
**New project…** SHALL open a dialog with a name and a grid of cards, one per template, each with
a thumbnail of the template's first diagram in the page's theme, a title in words, the
description and what it holds (diagrams, models, views, stories), chosen with the pointer or the
arrows; the name SHALL default to the chosen card's title. Anonymous, **Create** SHALL replace the
project of this browser with the template's files, asking first when the work differs from every
template and keeping it as the previous project; signed in, it SHALL create a cloud project from
the template with that name and open it.

#### Scenario: The cards
- **WHEN** New project… opens in Spanish
- **THEN** five cards show, `c4` titled "Modelo C4" with "1 modelo · 2 vistas", `purchase` with "1 modelo · 2 vistas · 2 diagramas · 1 historia", each with its thumbnail

#### Scenario: Anonymous creation
- **WHEN** the anonymous flow project has been edited and the sequence card is created
- **THEN** the page asks before replacing, and after a yes the tree shows `diagrams/sign-in` and the panel offers Previous project · Restore

#### Scenario: A cloud project from a card
- **WHEN** a signed-in person creates `Pagos` from the sequence card
- **THEN** the service lists `Pagos` with the template's files, the page is bound to it and the header reads Pagos

#### Scenario: An empty name
- **WHEN** the name is emptied and Create is pressed
- **THEN** the dialog says the project needs a name and nothing is created

### Requirement: Importing and exporting a project
**Export project (.zip)** SHALL download the project as the archive **Download → Project (.zip)**
writes. **Import project…**, **Open** with a `.zip`, and a `.zip` dropped on the explorer SHALL read
the archive and open a dialog naming it, its project name and its file count, with the
destinations: **A new cloud project** (signed in, first and default; a name prefilled from the
archive; its texts created and its images and fonts uploaded, with progress; a failure deletes the
project again and says why), **This browser** (replacing the anonymous project and keeping it as
the previous project), and **Replace the files of <open project>** (last, its wording naming the
loss). An archive with no file inside the path rule SHALL add nothing and say so; nothing SHALL be
replaced without the choice.

#### Scenario: Export equals Download
- **WHEN** Export project is chosen for the c4 template
- **THEN** the archive holds `c4/project.json`, `c4/models/system.meltemi` and `c4/diagrams/views.meltemi`, the same as Download → Project

#### Scenario: Into a new cloud project
- **WHEN** a signed-in person imports an archive holding `project.json`, `diagrams/a.meltemi` and `assets/logo.png` as a new cloud project
- **THEN** the service lists a project named after the archive with the three files, the image uploaded, and the page is bound to it

#### Scenario: Into this browser
- **WHEN** the same archive is imported into this browser while a cloud project is open
- **THEN** the anonymous project holds the archive's files and is open, the cloud project stays in the account, and the previous anonymous project is restorable

#### Scenario: Replacing the open project
- **WHEN** Replace the files of the open project is chosen for a cloud project
- **THEN** the option's text named the replacement, and after the choice the room holds the archive's files

#### Scenario: An empty archive
- **WHEN** a `.zip` holding only `.git/config` and `.hidden/x.meltemi` is imported
- **THEN** no dialog opens, nothing changes and the status says the archive holds no project file

### Requirement: Motion of the explorer
Folders SHALL open and close with an animated height and a turning chevron (180 ms); row actions
SHALL fade in on hover and focus; a created or renamed row SHALL flash and scroll into view; a
deleted row SHALL collapse; a drag SHALL show a chip with the icon, the name and the count of other
files, tint the target folder and open it after 600 ms of hovering; the explorer's width SHALL
follow the drag and its collapse SHALL animate; the panel SHALL rise and fade in (150 ms) and out
(100 ms); cards SHALL lift on hover and draw a ring when chosen. When reduced motion is asked,
none of this SHALL move: states change at once.

#### Scenario: A folder opens
- **WHEN** `diagrams` is expanded
- **THEN** its group's height transitions over 180 ms and the chevron is turned 90° at the end

#### Scenario: Reduced motion
- **WHEN** the browser asks for reduced motion and `diagrams` is expanded
- **THEN** the group shows at once with no transition

