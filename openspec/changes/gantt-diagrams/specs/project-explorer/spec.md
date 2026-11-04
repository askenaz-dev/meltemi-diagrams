## MODIFIED Requirements

### Requirement: Actions on the tree
The explorer SHALL offer, on the root, a folder or a file, from a context menu (right click,
Shift+F10, the context-menu key, or the "…" button a row shows on hover and focus): **New
diagram…** (a name and a kind, flow, free, sequence or gantt; the file `<folder>/<name>.meltemi` written
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

#### Scenario: A new Gantt chart
- **WHEN** New diagram… is chosen on `diagrams` with the name `roadmap` and the kind gantt
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
- **THEN** eight cards show, `c4` titled "Modelo C4" with "1 modelo · 2 vistas", `roadmap` titled "Hoja de ruta" with "1 diagrama · 1 historia", `kanban` titled "Tablero kanban" with "1 diagrama", `whiteboard` titled "Pizarra" with "1 diagrama · 1 historia", `purchase` with "1 modelo · 2 vistas · 2 diagramas · 1 historia", each with its thumbnail

#### Scenario: Anonymous creation
- **WHEN** the anonymous flow project has been edited and the sequence card is created
- **THEN** the page asks before replacing, and after a yes the tree shows `diagrams/sign-in` and the panel offers Previous project · Restore

#### Scenario: A cloud project from a card
- **WHEN** a signed-in person creates `Pagos` from the sequence card
- **THEN** the service lists `Pagos` with the template's files, the page is bound to it and the header reads Pagos

#### Scenario: An empty name
- **WHEN** the name is emptied and Create is pressed
- **THEN** the dialog says the project needs a name and nothing is created

#### Scenario: A whiteboard from its card
- **WHEN** the whiteboard card is created anonymously
- **THEN** the tree shows `diagrams/whiteboard` and the canvas draws the strokes and stickies under `sketch.light`

#### Scenario: A roadmap from its card
- **WHEN** the roadmap card is created anonymously
- **THEN** the tree shows `diagrams/roadmap`, the canvas draws the chart's sections, bars and arrows, and the story `plan` is offered for playback
