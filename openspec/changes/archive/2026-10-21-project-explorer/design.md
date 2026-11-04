## Context

- The playground's project view is a `<select>` with an `<optgroup>` per folder and three icon
  buttons (new, rename, delete) at the top of the code pane (`packages/playground/src/shell.ts`
  ~365 and ~895); `project.json` is listed under "Project". New files start from `starterText`
  (`files.ts`), always a flow with two boxes. `renameFile` moves the file and says that imports
  naming it are not changed (`studio.ts` ~499).
- Templates are a header menu whose entries carry a localised description
  (`shell.ts` `templateMenu`, `templates.ts` `templateDescription`); the cloud drawer's **Start
  from** is a bare `select` of names (`cloud/projects.ts`). `TEMPLATES` in
  `packages/project/src/templates.ts` holds a name and an English description; the build writes
  `templates.json` from the CLI's template folders (`build.mjs` ~161).
- The drawer (`cloud/projects.ts`, drawn from `cloud/projects-model.ts`, a DOM-free model with a
  `ProjectsHost`) holds, in this order: an intro, "Save this project to the cloud", "Open the local
  project", the **New project** form, the status, the count and the list. It opens from a header
  button only when signed in. `CloudController` gives it `createFrom`, `saveLocal` (which splits
  texts and binaries, creates, then uploads each binary), `leaveToLocal`, `deleted`, `link`,
  `localName` and the thumbnails.
- Export and import exist: **Download → Project (.zip)** (`exports/files.ts` `projectArchive`)
  and **Open** with a `.zip` (`shell.ts` `openLocal`), which replaces the open project after a
  confirmation, in a cloud project too.
- The shell is a grid of top bar, view tabs, panes and status line; the panes are
  `var(--split) 6px minmax(0, 1fr)` (`playground.css` ~363); under `.shell.narrow` the code and
  the canvas are tabs. Settings kept per browser: `theme`, `language`, `split`, `canvas`
  (`store.ts`).
- The Studio compiles the whole project for the problems list (`studio.problems()` walks
  `workspace.compileProject().files`, cached by text); a compiled file's `document` holds its
  `diagrams` and `stories`. The canvas picks a diagram with `pickDiagram` and a story with
  `pickStory`; every render message names the shown diagram.
- `createDiagram` (`@meltemi/diagrams-edit`) writes `language "0.2"` and an empty diagram of a
  kind on an empty text (decision in `canvas-setup-and-live-preview`).
- The cloud browser suite drives the drawer through `openDrawer`, `drawerNames` and `drawerRow`
  (`packages/cloud/test/browser/cloud.ts` ~486) in the projects, binaries and offline scenarios.

## Goals / Non-Goals

**Goals:** one place for the project and its files, where the files are; folders and diagrams
as the person thinks of them; configuration out of sight until asked; templates that say what
they are; a project that travels as one archive; moves that keep imports working; the same
quality of motion and keyboard access as the rest of the canvas.

**Non-Goals:** several projects in this browser; an explorer in the VS Code extension; folders
as entities of the cloud document; search inside files; Git status marks.

## Decisions

### A third column, remembered

The shell's main area becomes `grid-template-columns: var(--explorer) 1px var(--split) 6px
minmax(0, 1fr)`: the explorer, its edge, the code, the divider and the canvas. The explorer is 180
to 480 px wide (default 260), dragged by its edge (Left and Right arrows on the focused edge move
it 16 px; a double click resets it) and collapsed to a 36 px rail with one button that expands it;
Ctrl+B (Cmd+B) toggles it and Ctrl+Shift+E focuses the tree, as in VS Code. `settings.explorer =
{ width, collapsed, showAll }` is kept with the other settings. Under `.shell.narrow` the explorer
is the first of three tabs, **Files · Code · Canvas**; opening a file from it switches to the code
tab. The first visit shows it expanded where the code and the canvas sit side by side.
*Alternative:* the explorer inside the code pane above the code (rejected: it would move with the
split and leave no room for the tree on the canvas side).

### Undo of moves in the browser project

The browser project's `History` had no undo for renames. A move is now a step of a project-level
stack beside the per-file stacks (`recordMoves`), holding the moves and sharing its group with the
import edits: an undo from any file takes it when it is the latest step, as the cloud binding's
`walk` takes the structure manager's item; undoing moves the files back (last first), rekeys their
stacks and restores the texts; a move that can no longer be made back (the file went, or another
took its old path) is dropped. Deleting a file stays not undoable.

### The explorer is a model and a view

`packages/playground/src/explorer/tree-model.ts` has no DOM: it builds the tree from the
Studio's paths, outlines and problems, gives the rows the keys walk, and holds the rules of names,
moves and copies; `explorer-model.test.ts` drives it. `tree.ts` (`TreeView`) draws it, keeps what is
expanded, selected and focused and the rename in progress, and redraws only the rows whose data
changed, keeping scroll and focus by key. `explorer.ts` (`Explorer`) is the pane: it turns the
tree's gestures into the Studio's file operations and asks an `ExplorerHost` (the shell) for what
only the page can do: open a file, add files from outside, import an archive, confirm, report, keep
the settings. The browser suite drives the DOM. *Alternative:* rebuild the DOM from scratch on each change (rejected: remote changes in
a cloud project arrive every 250 ms and would steal focus and scroll).

### Nodes: folders, diagrams, images; files expand to their diagrams

- A folder node per path segment; folders before files at every level, each sorted by name, as
  VS Code lists them.
- A `.meltemi` file is shown by its name without the extension, with the icon of its first
  diagram's kind (flow, free, sequence, C4 view, model, story). A file whose compilation holds more
  than one of diagrams and stories expands to one child per diagram (its title, or its id) and
  story; a single diagram is the file itself. Children come from `Studio.outline(path)`, which reads
  the workspace's compilation of the file (cached by text, as `problems()` is) and answers
  `{ diagrams: { id, title, type }[], stories: { id, title }[] }`.
- An image (`isImagePath`) is shown with a picture icon; it opens the preview the code pane
  already shows. Fonts and every other file are "all files".
- Marks: a red count of errors or an amber count of warnings after the name, from
  `studio.problems()`; a folder carries the sum of what it hides when collapsed.
- The open file is `aria-current`; within it, the diagram the canvas shows (from the render
  message) is selected. Clicking a file opens it and keeps the diagram the canvas had; clicking a
  diagram child opens the file and posts `pickDiagram`; a story child posts `pickStory`.

*Alternative:* one node per diagram, flattening files (rejected: moving, renaming and deleting
act on files; a tree that hides them would act on things the person cannot see).

### Show all files

Off by default (`settings.explorer.showAll`), the tree holds folders, `.meltemi` files and images;
a folder with nothing to show is hidden too. On, every file is listed, with `project.json` and
`assets.lock.json` under a gear icon and the rest under a plain file icon, and the context menu
gains **New file** for text files of any kind. The toggle is the last row of the explorer's
footer and an entry of the project menu. When a hidden file has a problem (an invalid
`project.json`, a lock file that does not parse), the footer shows "1 hidden file has a problem ·
Show", which turns the toggle on and selects the file. **Project settings** in the project menu
opens `project.json` whatever the toggle says, and creates it (`templateManifest`-like, with the
page's language and tool version) when the project has none. The project's name is edited in the
explorer's header (a pencil, or F2 with the header focused): in the browser project it writes the
`name` of `project.json`; in a cloud project it is the drawer's rename (`PATCH`), and the manifest
follows as it does today.

### The switcher and its panel replace the drawer and the Templates menu

The explorer's header is the switcher: the project's name, a chip saying where it lives ("This
browser"; "Saved to the cloud", "Saving…", "Offline", "View only", from `ConnectionStatus` and the
role), and a chevron that opens the panel. The panel is a non-modal popover anchored under the
header (420 px wide at most, 70 vh tall, scrolling), a full-width sheet under `.shell.narrow`:

1. Actions: **New project…**, **Import project…**, **Export project (.zip)**, **Save this project to
   the cloud** (anonymous project with files, signed in), **Project settings**, **Show all files**.
2. **This browser**: the anonymous project, marked when open, with "Open the local project" as a
   click; under it **Previous project · Restore** when one is kept (today's Templates entry).
3. **In the cloud** (signed in): the person's projects, name, thumbnail, last change and role, the
   open one marked, with open, rename, duplicate, copy the link and delete on hover and focus; a
   filter field appears above eight projects; the count "n of 100 projects" closes the section.
   Signed out, the section is one line: sign in to keep projects in the cloud, with the page's
   sign-in link.

`cloud/projects-model.ts` stays the model of the cloud list (it is about cloud projects) and
grows: its host gives `uploadProject` (shared with Save to the cloud) and hears `renamed`, and
`ProjectsModel.createFromFiles` makes a project from an archive with its progress. The project of
this browser, the previous one and the local rename are the shell's, through the `SwitcherHost`. The header's **Projects** button, the drawer
(`cloud/projects.ts`) and the **Templates** menu are removed; **Open** keeps opening files and
hands a `.zip` to the import dialog. Versions, Share and Publish stay in the header's cloud slot.
*Alternative:* keep the drawer and add the explorer (rejected by the owner: two views of one
thing, disconnected).

### New project: a name and cards

`explorer/new-project.ts` is a dialog with a name field (checked as the drawer checks it) and a
grid of cards, a `radiogroup` of one `radio` per template: the thumbnail, the title in words
("Flow diagram", "C4 model", "Sequence diagram", "Slide", "Purchase example" / their Spanish), the
description, and a line of contents such as "1 model · 2 views", "4 diagrams · 1 story". Keyboard
moves between cards with the arrows; Enter creates. Anonymous, **Create** replaces the browser's
project with the template's files, after the existing question when the work differs from every
template, keeping the previous project; signed in, it calls `createFrom(name, template)` and opens
the project, as the drawer did. The name defaults to the template's title.

`TEMPLATES` in `@meltemi/diagrams-project` becomes `{ title, description, contents }` per name,
`contents` being counts of models, of C4 views (`views`), of the other diagrams (`diagrams`) and of
stories, listed in that order (`TEMPLATE_CONTENT_KINDS`); `init --list` prints
`<name>  <title> — <description> (<contents>)`. The build writes `templates.json` v2: each entry
with `title`, `description`, `contents`, `files` and `thumbnails: { light, dark }`, the paths of
two SVGs the build renders with the editor's node API (`ProjectSessions`, `produceExport`) from
the template's entry diagram (`templateEntry`), static, without embedded fonts, with the diagram's
theme and its dark counterpart, at most 200 KiB each, into `dist/templates/`. The page shows the
one of its theme. The page's messages keep the localised titles and descriptions by name, as they
keep descriptions today. *Alternative:* render the thumbnails in the page when the dialog opens
(rejected: five compilations and layouts before the dialog shows, on every visit).

### Import and export

**Export project (.zip)** calls `downloadProject`; the **Download** menu keeps its entry, since that
menu is where outputs are. **Import project…** (the panel, **Open** with a `.zip`, or a `.zip`
dropped on the explorer) reads the archive (`readZip`, the path rule, text and bytes as `openLocal`
does) and opens `explorer/import.ts`: the archive's name, its project name from `project.json`
and its file count, and a `radiogroup` of destinations:

- **A new cloud project** (signed in; first and default): a name prefilled with the archive's
  project name; `api.create({ name, files: texts })` then each binary through `uploadBinary`, with
  the drawer's progress line, and the copy opened; a failure deletes the project again
  (`saveLocal`'s rule). Where `saveLocal` reads the Studio's files, both now share `uploadProject
  (name, files, progress)` in `CloudController`.
- **This browser**: the anonymous project, replaced as a link or a template replaces it, the
  previous project kept; opens it (leaving a cloud project when one is open).
- **Replace the files of <open project>**: last, with the destructive wording in the option
  itself; in a cloud project it is the current `replaceConfirm` behaviour.

An archive with no file inside the path rule adds nothing and says so; the dialog never runs
without a choice. Files that are not archives, dropped on a folder row, are added into that folder
(an image or a `.meltemi`); dropped on the tree's empty space, at the root.

### Moving a file keeps imports working

`@meltemi/diagrams-editor` gains `moveFileEdits(sessions, moves)`, every move of one step at once:
for every file whose imports resolve to a file that moves, the edit that rewrites the import's path
string relative to where each of the two files is after the moves; for a file that moves, the
edits of its own imports relative to where it goes. One pass over one program, so a folder that
moves with files importing each other needs no recompilation between moves; the edits are keyed
by the path each file has after the moves. Paths are written as the language wants them (`./` or `../`, `/`,
`.meltemi`, the shortest relative form). Import strings come from the parsed statements and their
ranges, so comments and formatting stay; a file that does not parse is left alone and named in the
status. `Studio.renameFile` applies the rename and these edits in one `inStep`, so they are one
undo step and one transaction of a cloud document; `StudioChange` reports the rename and the text
changes with the same `step`. Renaming a folder moves every file under it, each with its edits, in
one step. The spec lives in `source-editing` beside `createDiagram`; the planner lives in the editor
package because it needs the project's files, not one text. *Alternative:* a `renameModule` edit in
`@meltemi/diagrams-edit` on a single text (rejected: it cannot know the importers).

### Drag and drop, and Move to

Rows are `draggable`; a drag carries the paths (the selection, several files with Ctrl or Shift);
a folder row under the pointer is the target and highlights; the root is the target on the tree's
empty space; a drop moves each file to `<folder>/<name>`, refused when a name exists there (the
whole drop is refused, nothing moves, the status says which name). Escape cancels. Touch and the
keyboard use **Move to…** (the context menu; no letter, which the tree's type-ahead takes): a dialog listing the folders and a field for a new
one. External files use the same targets (previous section). *Alternative:* pointer events for
drags (rejected: the browser's drag gives the drag image, auto-scroll and external files for free).

### Keyboard and assistive technology

The tree follows the WAI-ARIA tree pattern: `role="tree"`, `treeitem` rows with `aria-level`,
`aria-expanded`, `aria-selected`, a `group` per open folder, one tab stop with roving focus; Up and
Down move, Right expands or enters, Left collapses or goes to the parent, Home and End, typing a
letter jumps to the next row starting with it, Enter and Space open, F2 renames in place (an
`input` in the row, Enter confirms, Escape cancels, the same checks as the dialog), Delete deletes
after the confirmation, Shift+F10 and the context-menu key open the menu, Ctrl+D duplicates; moving
has no letter, which type-ahead takes. Every action is also in the context menu and, on hover and focus, as a "…" button at the
row's end. The context menu is the page's `menuButton` menu anchored at the pointer. Live
announcements go through the status line as today.

### Motion

Tokens `--pg-motion-fast: 120ms`, `--pg-motion: 180ms`, `--pg-ease: cubic-bezier(0.2, 0.8, 0.2,
1)` in `playground.css`; the existing `prefers-reduced-motion` block sets them to 0 ms and drops
the transforms.

- Expand and collapse: the folder's `group` animates `grid-template-rows` from 0fr to 1fr and
  back (the chevron rotates 90°), 180 ms.
- Row actions fade in on hover and focus, 120 ms; a renamed or created row flashes its background
  for 600 ms and scrolls into view; a deleted row collapses its height, 150 ms.
- Drag: the drag image is a chip with the icon, the name and "+n"; the target folder tints and
  its chevron opens after 600 ms of hovering; the drop lands with the created-row flash at the new
  place.
- The explorer's width follows the drag live; collapsing and expanding animate the column, 180
  ms; the rail's button fades.
- The panel rises 4 px and fades in, 150 ms; closes in 100 ms. Cards lift 2 px with a shadow on
  hover and draw the accent ring when chosen; the import dialog's progress bar fills per uploaded
  file.
- Under `.shell.narrow` the Files tab slides as the other tabs do.

### Removals

`cloud/projects.ts` goes; `cloud/projects-model.ts` stays and grows; `templateMenu`, `restorePrevious`'s
menu entry, the file bar and `starterText` go; `openLocal`'s archive branch becomes the import
dialog. The cloud browser suite's `openDrawer`, `drawerNames` and `drawerRow` become
`openSwitcher`, `switcherNames` and `switcherRow` over the panel, and the scenarios that used the
drawer's form use the cards.

### Decisions on the owner's open points

- **One local project.** The anonymous project stays one, with the previous project kept. Named
  local projects would need their own storage, switching and sharing rules; the switcher's list is
  ready to show them when that change comes. Recommendation: this change ships without them.
- **The unit is the file, shown as its diagrams.** A file named without its extension, expanding
  to its diagrams when it holds more than one, keeps every action on something the person sees.
- **Export in two places.** The project menu, because the owner looks for it there; the Download
  menu, because that is the list of outputs. Both call the same function.
- **Ctrl+B toggles the explorer**, as in VS Code; nothing in the page used it.

## Packages and interfaces

- `@meltemi/diagrams-project`: `TEMPLATES` entries `{ title, description, contents: { diagrams,
  models, views, stories } }`; `TemplateName` unchanged; `templateManifest` unchanged.
- `@meltemi/diagrams-cli`: `init --list` prints title, description and contents.
- `@meltemi/diagrams-editor`: `moveFileEdits(sessions: ProjectSessions, moves: readonly FileMove[]):
  MoveEdits` (`{ edits, skipped }`, keyed by the paths after the moves) and `importSpec`, exported
  from the package (the browser-safe entry, which the playground uses).
- Playground: `explorer/` (`tree-model.ts`, `tree.ts`, `explorer.ts`, `switcher.ts` with the
  panel, `new-project.ts`, `import.ts`, `dialogs.ts`, `icons.ts`), `menu.ts` `contextMenu`,
  `Studio.outlines()`, `Studio.moveFiles(pairs)` and `renameFile` through it,
  `History.recordMoves`, `CloudController.uploadProject` and `renamed`,
  `ProjectsModel.createFromFiles`, `Settings.explorer`, `templates.json` v2 (`Template` gains
  `title`, `contents`, `thumbnails`), `thumbnails.mjs` at build, words en/es in
  `messages/explorer-en.ts` and `explorer-es.ts` (`pane`, `menu`, `actions`, `switcher`, `panel`,
  `newProject`, `importProject`), `playground.css`.

## Risks / Trade-offs

- [Remote changes redraw the tree while the person renames or drags] → the model keeps the rename
  and the drag as state and the view redraws by path diff; a row being renamed is not replaced;
  a file renamed remotely while its rename box is open cancels the box and says so.
- [Import rewriting misses an import] → only imports that resolve to the moved path are rewritten,
  through the parser's ranges; files that do not parse are named in the status; the move itself is
  one undo step, so Ctrl+Z restores everything.
- [Thumbnails without fonts look different from the canvas] → at 320 px wide the text is
  decoration; the title and the description carry the meaning; the thumbnails are rendered once at
  build, never at run time.
- [HTML drag and drop does not work on touch] → **Move to…** from the context menu (long press)
  and the keyboard cover it.
- [Removing the drawer breaks the cloud browser suite] → the helpers are renamed, not reinvented;
  the scenarios keep their steps over the panel and the cards.
- [A fourth column on a laptop screen] → the explorer collapses to a rail in one key, and its
  width is remembered; under 1100 px the first visit shows it collapsed.
