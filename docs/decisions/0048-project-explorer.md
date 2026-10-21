# 0048. The project explorer: one place for the project and its files

Status: accepted (project-explorer change, 21 October 2026)

## Context

Testing 1.9.0, the owner found managing projects and files in the playground scattered and unclear.
The project's files were a `<select>` at the top of the code pane that listed `project.json` beside
the diagrams, with three buttons to add, rename and delete; templates were a header menu; a `.zip`
opened from **Open** and replaced whatever was open; the project's archive hid under **Download**;
and the cloud projects lived in a drawer on the right, with a creation form whose **Start from** was
a bare list of template names above the list of projects. The owner asked for the view VS Code and
Claude Code give: folders and diagrams in a tree, the project chosen where the files are,
configuration out of the way unless asked for, templates that explain themselves, and a project that
is exported and imported as a whole.

## Decision

- **An explorer in the first column.** The page has five columns: the explorer, its edge, the
  code, the divider and the canvas. The explorer is 180 to 480 pixels wide, collapses to a rail
  (Ctrl+B) and is the first of three tabs on a narrow screen. Its model (`tree-model.ts`) has no DOM;
  its tree redraws by key, so that focus, scroll, a rename in progress and an opening folder survive
  a cloud project's remote changes.
- **The unit is the file, shown as its diagrams.** A `.meltemi` file is listed by its name without
  the extension, with the picture of its first diagram's kind, and opens to list its diagrams and
  stories when it declares more than one. Renames, moves and deletions act on what the person sees;
  a click on a diagram opens the file and shows that diagram.
- **Configuration is hidden, never gone.** The tree lists folders, `.meltemi` files and images.
  **Show all files** lists the rest; a hidden file with a problem says so at the foot; **Project
  settings** opens or makes `project.json`. The project's name is edited in the explorer's header.
- **One switcher replaces the drawer, the Projects button and the Templates menu.** The header of the
  explorer names the open project and where it lives, and opens the Projects panel: New project,
  Import and Export, Save to the cloud, Project settings, this browser's project and the previous
  one, and the cloud projects. Versions, Share and Publish stay in the page's header.
- **Templates are cards.** `TEMPLATES` gives each template a title, a description and its contents
  (models, C4 views, other diagrams, stories), which `init --list` prints too and the CLI's tests
  check against the files; the playground's build draws two pictures per template, light and dark,
  from its first diagram, without embedded fonts.
- **An archive asks where it goes.** A new project in the account, the project of this browser, or
  the files of the open cloud project; it never replaces anything without that choice. Export is in
  the panel and in Download, one function behind both.
- **A move keeps imports working.** `moveFileEdits` (editor package) takes every move of a step at
  once and rewrites, in one pass over the project's compilation, the imports that name a file that
  moves and the imports of a file that moves; `Studio.moveFiles` makes the moves and those edits one
  step. The browser project's history gained a project-level stack for moves, beside the per-file
  stacks, so Ctrl+Z from any file undoes the latest move as the cloud document's undo already did.

## Alternatives considered

- **Keeping the drawer beside the explorer**: two views of one thing, which is what the owner found
  disconnected.
- **One node per diagram, flattening files**: renames, moves and deletions act on files, and a tree
  that hides them would act on things the person cannot see.
- **Rendering the template pictures in the page**: five compilations and layouts each time New project
  opens; drawn at build time they cost nothing at run time.
- **Several local projects in this browser**: they need their own storage, switching and sharing
  rules; the switcher's list is ready to show them when that change comes.
- **A rename that leaves imports broken, as before**: the explorer makes moves easy, and broken
  imports after a drag would be the first thing a person meets.

## Consequences

- The playground has no file `<select>`, no Templates menu and no Projects button; scripts and tests
  that drove them use the tree and the panel.
- A move is one undoable step in both kinds of project; a deletion is still not undoable.
- An empty sequence diagram lays out with an empty width (it divided by nothing before), which New
  diagram's sequence choice showed.
- `templates.json` grows by the titles and contents, and the site by ten small SVG files.
