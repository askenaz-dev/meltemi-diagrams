# web-playground Specification

## Purpose
The playground: a static web page with in-memory projects and templates, visible code with language services beside the shared canvas, one undo history, import, share links, kept work, no account and no network.
## Requirements
### Requirement: Templates and projects in the browser
The page SHALL hold a project in memory: `project.json` and its files under one root, compiled by
the same project compiler as the CLI and the editor (imports, models, themes, stories, assets,
profiles, plugins, limits). The explorer (`project-explorer`) SHALL list the project's files as
folders and diagrams, switch between them, and create, rename, move, duplicate and delete files and
folders; its **New project** SHALL open the `init` templates `flow`, `c4`, `sequence`, `free` and
`purchase` with the `project.json` that `init` writes. **Open** SHALL open files the person
chooses: `.meltemi` files, images and a `project.json` are added beside the open file; a project
`.zip` goes to the import dialog, which never replaces the open project without that choice. A new
visit with no kept work and no link SHALL open the `flow` template.

#### Scenario: Reference example
- **WHEN** the person opens the `purchase` template
- **THEN** the explorer lists its five `.meltemi` files under `diagrams`, `models` and `stories`, shows `diagrams/architecture.meltemi` with no error, and its story plays in the canvas

#### Scenario: Opening a project archive
- **WHEN** the person opens a `.zip` holding `project.json` and `diagrams/a.meltemi` with **Open**
- **THEN** the import dialog names the archive and its one diagram, and after This browser is chosen the page shows `diagrams/a.meltemi`

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
- **THEN** it opens as the anonymous project and the switcher's panel offers to save it to the cloud

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
in the installed Edge or Chrome through `playwright-core`, checking templates and the New project
cards, the explorer (the tree, its actions, drag and drop, Show all files, the switcher, import and
export), the code pane and its services, canvas edits in both directions, undo, import, share
links, kept work, every export format, keyboard access, the narrow layout, and that no request
leaves the page's origin.

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

### Requirement: Asset problems are shown
The playground SHALL count and list the diagnostics of `Workspace.assets()` with the problems of the project: each on the asset file or folder it concerns (`assets/licenses.json`, a pack file or folder, a font file), in the explorer's badge of the file when it is shown and of its folders (a folder counting its own problems with its children's), with the existing offer to show hidden files that have problems, and in the problems list of an asset file when it is open, with its code and hint. The counts SHALL refresh when anything under `assets/` changes, including files added by the Add icon dialog, dropped into the explorer or imported from an archive.

#### Scenario: Missing licence shown
- **WHEN** a project with `assets/icons/brand/logo.svg` and no `brand` entry in `assets/licenses.json` is opened
- **THEN** the explorer's `brand` and `assets` folders carry the count of `asset.missing-license`, whose hint shows the entry to add

#### Scenario: Unsafe icon dropped into the explorer
- **WHEN** `bad.svg` holding a `<script>` is dropped into `assets/icons/brand/`
- **THEN** within the next analysis the file's row and its folders count `asset.unsafe-svg`, and the other icons of `brand` keep working

#### Scenario: Problem resolved
- **WHEN** the missing `brand` entry is added to `assets/licenses.json`
- **THEN** the diagnostic disappears from the list and the badge

### Requirement: Collapsible code pane
On a wide screen the playground SHALL fold the code pane to a 36 px rail and unfold it again: a
button at the right end of the code-path bar (**Hide the code (Ctrl+J)**, `aria-expanded`) and a
double click on the divider fold it; the rail SHALL hold one button (**Show the code (Ctrl+J)**,
`aria-expanded`, `aria-controls="code-pane"`) that unfolds it, and beneath it the open file's
error count when the file has errors, with the problems' summary as its title, and nothing
otherwise. Ctrl+J (Cmd+J) SHALL toggle the pane from anywhere in the page, the code's own
textarea included, except while a dialog is open or the focus is in a native input, a select, a
contenteditable field or a textarea other than the code's, claiming the key from the browser as
Ctrl+S is claimed. Whether the pane is folded SHALL be kept with the page's settings beside the code's
share, read as folded only when the kept value is a boolean `true`; unfolding SHALL restore the
kept share. Folding from inside the pane SHALL move the focus to the rail's button and unfolding
SHALL put it in the code. The grid's columns SHALL move with the page's transition and none under
reduced motion; the canvas SHALL keep its viewport (no fit, no zoom) as its pane grows or shrinks;
the divider SHALL keep its column, hidden and inert, while the pane is folded. A reveal that asks
for the focus (**Show in text** from the canvas's menus, go to definition, a problem's line, a
quick fix) SHALL unfold the pane; opening a file from the explorer and a canvas selection SHALL
leave it folded. Go to definition, Ctrl+click and the problems list live inside the pane and fire
only while it is open. On a narrow screen the code SHALL stay the Code
tab, whole, whatever is kept, the bar button and the rail SHALL not be shown, and Ctrl+J SHALL
show the Code tab when another is shown and the Canvas tab otherwise.

#### Scenario: Fold from the bar and keep it
- **WHEN** the code-path bar's **Hide the code** button is pressed and the page is reloaded
- **THEN** the code pane is a 36 px rail with one button and the canvas takes the width, the canvas's zoom and offset are what they were, and after the reload the pane is still a rail

#### Scenario: Ctrl+J unfolds and focuses the code
- **WHEN** Ctrl+J is pressed on a folded pane
- **THEN** the pane is open at its kept share, the divider's `aria-valuenow` is that share and the code's textarea has the focus

#### Scenario: Double click on the divider
- **WHEN** the divider is double-clicked with the code at 60 % of the width
- **THEN** the pane folds, no share is written, and unfolding brings it back to 60 %

#### Scenario: Errors on the rail
- **WHEN** the pane is folded and the open file gains `style missing { fill "#fff" }` without `missing`
- **THEN** the rail shows 1 under its button, titled with the problems' summary, and the live region announces the summary; fixing the line removes the number

#### Scenario: A reveal with focus unfolds
- **WHEN** the pane is folded and **Show in text** is chosen in the canvas's context menu for `api`
- **THEN** the pane unfolds at its kept share and `api`'s declaration is selected in the code with the focus

#### Scenario: Opening a file leaves it folded
- **WHEN** the pane is folded and another diagram is opened from the explorer
- **THEN** the canvas shows that diagram and the pane stays a rail, its badge counting that file's errors

#### Scenario: A canvas selection leaves it folded
- **WHEN** the pane is folded and an element is selected on the canvas
- **THEN** the pane stays a rail, and its text is selected in the code when the pane unfolds

#### Scenario: Narrow screen keeps the tabs
- **WHEN** the page is 375 pixels wide with a kept folded state
- **THEN** the tabs are Files, Code and Canvas, the Code tab shows the whole code with no rail and no bar button, the page does not scroll sideways, and Ctrl+J shows the Canvas tab

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and the pane is folded
- **THEN** the columns change with a transition of 0 s, while without it they take 0.18 s

#### Scenario: A kept value that is not a boolean
- **WHEN** the kept settings hold `"code": { "collapsed": "yes" }`
- **THEN** the page opens with the code pane open and keeps working

#### Scenario: Ctrl+J in a native input
- **WHEN** Ctrl+J is pressed while the explorer's rename box or a dialog's field has the focus
- **THEN** the pane does not change and the field keeps its text

