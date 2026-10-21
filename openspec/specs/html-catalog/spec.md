# html-catalog Specification

## Purpose
The offline HTML catalog of a project: one self-contained file of its diagrams and stories by folder, with the player, search, navigation through links and model entities, downloads and only authorised metadata, built from the command line and VS Code.
## Requirements
### Requirement: Build command
`meltemi-diagrams build catalog [path]` SHALL build the catalog of the project that contains
`path` (a folder or a file; the working folder by default) and write one HTML file: the
`catalog.out` setting, `catalog/index.html` under the project root by default, or `--out` (a
folder, which receives `index.html`, or a `.html` file). It SHALL print the diagnostics of the
catalogued files, skip diagrams and stories that cannot be drawn (saying which and why), print what
the catalog holds and its size, and exit 0 when nothing had errors, 1 when something had errors or
was skipped, and 2 on usage errors, unreadable paths or a project with nothing to catalog. The same
sources SHALL give the same file.

#### Scenario: Architecture project
- **WHEN** `mdg build catalog corpus/projects/valid/architecture --out out` runs
- **THEN** `out/index.html` is written, the output names 3 diagrams, 1 story and the model's
  entities, and the exit code is 0

#### Scenario: Reproducible
- **WHEN** the catalog of a project is built twice without changes
- **THEN** both files are byte for byte the same

### Requirement: Self-contained and offline
The catalog SHALL be one HTML file with its data, fonts, styles and scripts inline, and a content
security policy that allows no network request. Opened from `file://`, it SHALL draw every page
without requesting anything outside the file.

#### Scenario: No requests
- **WHEN** the catalog is opened from disk in a browser and every page is visited
- **THEN** the browser makes no request except for the file itself and `data:` or `blob:` URLs

### Requirement: Folders and pages
The catalog SHALL list the project's diagrams and stories by project-relative folder on its home
page and in its navigation, with a static thumbnail of each diagram. Each diagram SHALL have a page
with its drawing, type, folder, file, description, elements, relations, the stories that show it
and the diagrams it links to and from; sequence diagrams with scenarios SHALL offer each scenario.
Each story SHALL have a page with its player, scenes and the diagrams it shows. An entities page
SHALL list the model entities drawn by catalogued views with the views that draw them. Pages SHALL
be reachable by deep links in the hash, keep browser history and focus their heading.

#### Scenario: Deep link
- **WHEN** the catalog is opened at `#/diagram/diagrams/context/context`
- **THEN** the page of the `context` view is shown with its drawing

#### Scenario: Scenario picker
- **WHEN** a sequence diagram declares scenarios `ok` and `declined`
- **THEN** its page offers both and draws the chosen one

### Requirement: Navigation through links and the model
Clicking an element whose `link` names an element of another catalogued diagram SHALL open that
diagram with the element highlighted; clicking an element that draws or links to a model entity
SHALL open the entity, which lists every catalogued view that draws it. The same links SHALL be
reachable from the keyboard in the elements table.

#### Scenario: Entity
- **WHEN** the `shop.api` entity is opened
- **THEN** it lists the `containers` view and the `purchase` sequence that links to it

### Requirement: Playback and downloads
Stories SHALL play in the catalog with the player's controls, keyboard, static view and text
summary; diagrams with effects SHALL offer their effects. Each diagram view and story SHALL offer
**Download SVG**: a standalone SVG of the drawing (the current frame of a story) with the faces of
its text embedded.

#### Scenario: Story page
- **WHEN** the story page of `tour` is opened and played
- **THEN** the player shows its scenes and the frame changes over time

### Requirement: Search
The catalog SHALL search titles, ids, descriptions, folders, files, element and relation labels
and descriptions, technology and entities, ignoring case and accents, requiring every word of the
query, ranking titles and ids first, and saying where each result matched. `/` SHALL focus the
search and the number of results SHALL be announced.

#### Scenario: Accent-insensitive search
- **WHEN** the query is `pedidos`
- **THEN** the results include the views that draw the `Pedidos` datastore

### Requirement: Authorised metadata only
By default the catalog SHALL contain only the project's title and description, titles,
descriptions, types, project-relative folders and file names, and what the drawings show (labels,
descriptions, technology and URLs). It SHALL NOT contain comments, source text, absolute paths,
diagnostics, information about the machine or the build time. The source text of the catalogued
files SHALL be included only with `catalog.source` or `--source`. `catalog.exclude` SHALL leave out
folders, files or single blocks (`<file>#<id>`); a story that shows an excluded diagram SHALL be
reported with a warning.

#### Scenario: Comments stay out
- **WHEN** a file has the comment `// internal: rotate keys on Friday`
- **THEN** the catalog built without `--source` does not contain that text or the project's
  absolute path

#### Scenario: Source on request
- **WHEN** the catalog is built with `--source`
- **THEN** each diagram page shows and downloads its file's text

### Requirement: Accessible catalog
The catalog SHALL use landmarks (banner, navigation, search, main), a skip link, headings per page,
`aria-current` on the current entry, visible focus, and work at narrow widths and in light and dark
colour schemes; drawings SHALL have text alternatives through their element tables and the
player's summary.

#### Scenario: Keyboard
- **WHEN** a keyboard user presses `/`, types a query and follows a result with Enter
- **THEN** the result's page opens and its heading has focus

### Requirement: Build Catalog in VS Code
VS Code SHALL offer **Build Catalog**, which builds the catalog of the active file's project (or a
given file or folder) with the same settings, reports what it wrote and offers to open it in the
browser.

#### Scenario: Command
- **WHEN** **Build Catalog** runs for a file of the architecture project
- **THEN** `catalog/index.html` is written under the project root

