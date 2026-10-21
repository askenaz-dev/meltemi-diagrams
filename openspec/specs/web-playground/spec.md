# web-playground Specification

## Purpose
The playground: a static web page with in-memory projects and templates, visible code with language services beside the shared canvas, one undo history, import, share links, kept work, no account and no network.
## Requirements
### Requirement: Templates and projects in the browser
The page SHALL hold a project in memory: `project.json` and its files under one root, compiled by
the same project compiler as the CLI and the editor (imports, models, themes, stories, assets,
profiles, plugins, limits). It SHALL open the `init` templates `flow`, `c4`, `sequence`, `free` and
`purchase` with the `project.json` that `init` writes, list the project's files, switch between
them, add a `.meltemi` file, rename and delete files, and open files the person chooses: `.meltemi`
files, images, a `project.json`, or a project `.zip`. A new visit with no kept work and no link SHALL
open the `flow` template.

#### Scenario: Reference example
- **WHEN** the person opens the `purchase` template
- **THEN** the page lists its five `.meltemi` files and `project.json`, shows `diagrams/architecture.meltemi` with no error, and its story plays in the canvas

#### Scenario: Opening a project archive
- **WHEN** the person opens a `.zip` holding `project.json` and `diagrams/a.meltemi`
- **THEN** the page replaces its project with the archive's files and shows `diagrams/a.meltemi`

### Requirement: Importing Mermaid and PlantUML
The page SHALL import Mermaid, PlantUML or Markdown text, pasted or from a chosen file, with the
same importer as `meltemi-diagrams import`: it SHALL add the sheet as a new `.meltemi` file of the
project, show the import's status and findings with their lines, and offer the report as Markdown.
A source that cannot be imported SHALL add nothing and show why.

#### Scenario: Mermaid flowchart
- **WHEN** the person pastes `flowchart LR\n  a[Shop] --> b[(Orders)]` and imports it
- **THEN** a new file opens with a flow diagram of `a` and `b`, and the status reads complete

### Requirement: Visible code with language services
The page SHALL show the source of the open file beside the canvas, editable as text, with line
numbers, highlighting (keywords, ids, strings, numbers, comments, arrows) and the editor's language
services: diagnostics underlined and listed with their lines; completion (Ctrl+Space, and while
typing a word); hover with the keyword's or element's documentation and the diagnostics there;
quick fixes (Ctrl+.); formatting (Shift+Alt+F); rename (F2) through the edit planner; and go to
definition (F12), across files of the project. Tab and Shift+Tab SHALL indent and unindent, and
Enter SHALL keep the line's indentation. Analysis SHALL follow typing after a pause of 250 ms.

#### Scenario: Diagnostic in the code
- **WHEN** the person types `style missing { fill "#fff" }` in a flow diagram without `missing`
- **THEN** after the pause `missing` is underlined, the problems list names `ref.unknown-element` with its line, and the canvas shows the last drawable state as stale

#### Scenario: Completion
- **WHEN** the caret is after `shape ` in a `style` block and Ctrl+Space is pressed
- **THEN** a list of shapes opens, and Enter writes the chosen one

### Requirement: The same canvas
The page SHALL draw and edit the open file with the canvas of `@meltemi/diagrams-canvas` and a
`CanvasSession`, as VS Code does: palette, selection, moves, routes, labels, inspector, minimap,
grid and snapping, layout actions, sequence and C4 tools, effects and story playback. Plans from the
canvas SHALL become text edits of the open file; selecting in the canvas SHALL select the element's
text in the code pane, and moving the caret in the code SHALL highlight the element in the canvas. The
canvas's icon chooser SHALL search the Tabler pack; its image chooser SHALL add the chosen image to
the project beside the file. Copy and paste SHALL use the system clipboard when the browser allows
it, and the page's own otherwise.

#### Scenario: Canvas edit writes code
- **WHEN** the person drags an element of a `layout manual` diagram on the canvas
- **THEN** its `place` line in the code pane changes to the new position

#### Scenario: Caret highlights
- **WHEN** the caret moves into the id of an element in the code pane
- **THEN** the canvas highlights that element

### Requirement: One undo history
Every change of a file (typing, canvas edits, quick fixes, formatting, renames, imports) SHALL go
through one history per file. Ctrl+Z SHALL undo, and Ctrl+Shift+Z and Ctrl+Y redo, wherever the
focus is in the page, so that a canvas edit and the typing around it undo in order. Typing SHALL
coalesce into one step until a pause of 700 ms or a line break. In a cloud project the history
SHALL hold the person's own transactions only, grouped by the same rules, and changes that
arrive from the room SHALL never be undone by the person.

#### Scenario: Undo a canvas edit from the code
- **WHEN** the person moves an element on the canvas, focuses the code pane and presses Ctrl+Z
- **THEN** the element's previous position is back in the text and on the canvas

#### Scenario: Only one's own edits in a cloud project
- **WHEN** a remote change arrives after the person's edit and the person presses Ctrl+Z
- **THEN** the person's edit is undone and the remote change stays

### Requirement: Share links
For the anonymous project the page SHALL make a link that carries the project's text files in
the URL fragment (`#p=` followed by the base64url of the raw-deflated JSON `{ v: 1, open,
files }`), copied to the clipboard, with the size shown and a warning above 32 KiB. Images SHALL
not travel in links, and the dialog SHALL say so. Opening a link SHALL decompress at most 4 MiB,
refuse more files than the project limit, keep the work it replaces as the previous project the
person can restore, and open the linked project as the anonymous project, whether or not the
person is signed in. A link that cannot be read SHALL leave the work as it is and say why. For a
cloud project the share action SHALL open the sharing dialog with the project's own link instead
(`project-sharing`).

#### Scenario: Round trip
- **WHEN** a link made from a two-file project is opened in a new page
- **THEN** the page shows the same two files with the same text, and the same file open

#### Scenario: Oversized link
- **WHEN** a link whose content decompresses beyond 4 MiB is opened
- **THEN** the page keeps its current work and reports that the link is too large

#### Scenario: A fragment link while signed in
- **WHEN** a signed-in person opens a `#p=` link
- **THEN** it opens as the anonymous project and the drawer offers to save it to the cloud

### Requirement: Work kept in the browser
The page SHALL keep the anonymous project in the browser's storage after each change, text
files and images up to 512 KiB each, and open it on the next visit. It SHALL work when storage
is unavailable or full, saying that the work will not be kept. "New from template" SHALL ask
before replacing work that differs from every template. Cloud projects SHALL be kept as their
documents in IndexedDB, so a cloud project opens from there when the room cannot be reached, and
the anonymous project and the cloud projects SHALL never replace each other. The page itself
does not load without a connection (it has no service worker).

#### Scenario: Next visit
- **WHEN** the person edits a file and reloads the page
- **THEN** the edited text is open

#### Scenario: A cloud project reopens offline
- **WHEN** a signed-in person had a cloud project open, the connection to the room drops, and the person reloads the page or opens the project again
- **THEN** the project opens from IndexedDB with its last state and the status line says offline

#### Scenario: Storage full
- **WHEN** the browser refuses to store the anonymous project
- **THEN** the page keeps working and says the work will not be kept

### Requirement: Continuing locally
The page SHALL download the project as a `.zip` with `project.json` and every file at its path,
which `meltemi-diagrams validate` and VS Code open as is, and SHALL show how to continue: the CLI's
`init`, `validate`, `export` and `build catalog` commands and the VS Code extension.

#### Scenario: Archive validates
- **WHEN** the `c4` template is downloaded as `.zip` and extracted
- **THEN** `meltemi-diagrams validate` on the folder reports no diagnostic

### Requirement: Accessible and responsive page
The page SHALL use landmarks and labelled controls, keep a visible focus, reach every action by
keyboard, announce changes in the problems of the open file and export outcomes in a polite live
region, follow the system's light or dark scheme with a switch that the page remembers, use no
transitions or animations of its own when reduced motion is asked (exported players honour it as
they do everywhere), and work at 375 pixels wide by showing the code and the canvas as tabs.

#### Scenario: Narrow screen
- **WHEN** the page is 375 pixels wide
- **THEN** the code and the canvas are tabs, and the page does not scroll sideways

### Requirement: Notices and versions
The page SHALL show its version and the generator's name, and an About dialog with the licence of
the product (MIT) and of every bundled component, linking to `NOTICES.md`: EPL-2.0 for elkjs with
its source link, OFL-1.1 for the fonts, MIT for the others. `pnpm licenses:inventory --check` SHALL
cover the playground's bundled packages.

#### Scenario: Notices
- **WHEN** `NOTICES.md` of the built site is read
- **THEN** it names elkjs under EPL-2.0 with a link to its source and Inter under OFL-1.1

### Requirement: Browser test suite
`pnpm playground:test-browser` SHALL build the site, serve it on the loopback interface and drive it
in the installed Edge or Chrome through `playwright-core`, checking templates, the code pane and
its services, canvas edits in both directions, undo, import, share links, kept work, every export
format, keyboard access, the narrow layout, and that no request leaves the page's origin.

#### Scenario: Suite
- **WHEN** `pnpm playground:test-browser` runs on a machine with Edge or Chrome
- **THEN** every check passes and the suite prints the number of checks

### Requirement: A static page, an optional account, one origin
`pnpm playground:build` SHALL write a static site to `packages/playground/dist/` that any static
server can serve: `index.html`, the bundles, the stylesheets, `templates.json`, the font, icon and
runtime assets, `NOTICES.md`, and `api/session` holding `{ "user": null }`. The page SHALL need
no account and no server code: served by a static server it SHALL work entirely as a local
page. Served by the cloud Worker (`packages/cloud`), it SHALL offer sign-in through the
family's identity service as a navigation, and the account SHALL add to the page without
taking anything away. Its Content-Security-Policy SHALL be `default-src 'none'` with scripts,
styles, fonts and connections from the page's own origin only (plus `data:` and `blob:` images
and fonts, inline styles for drawn SVG, and the providers' avatar hosts
`https://avatars.githubusercontent.com` and `https://*.googleusercontent.com` in `img-src`),
`frame-src 'self'`, `base-uri 'none'` and `form-action 'self'` plus the origin of the identity
service the page was built with (`PLAYGROUND_IDENTITY`, default `https://id.meltemi.dev`). The
page SHALL make no request to another origin, whatever the project holds; signing in and out
are navigations, not requests the page makes.

#### Scenario: Only its own origin
- **WHEN** the browser test opens the page, loads every template, exports every format, opens a share link, and (against the Worker) signs in with a session minted with a `picture` under the Worker's own origin
- **THEN** every request the page made, the avatar included, went to the page's own origin

#### Scenario: Policy in the page
- **WHEN** `dist/index.html` is read after a build with the default identity origin
- **THEN** it declares a Content-Security-Policy starting with `default-src 'none'`, no `connect-src` other than `'self'`, and `form-action 'self' https://id.meltemi.dev`

#### Scenario: Without a server
- **WHEN** the page is opened from a static server with no `/api` route
- **THEN** `api/session` answers the static `{ "user": null }`, every feature of this specification works, and the header offers sign-in as a link the page built from the identity origin it was built with

