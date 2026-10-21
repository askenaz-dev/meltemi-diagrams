## Why

Managing projects and files in the playground is scattered and unclear. The project's files are a
`<select>` at the top of the code pane that lists `project.json` beside the diagrams; templates are a
header menu; a `.zip` opens from **Open** and replaces whatever is open; the project's archive hides
under **Download**; and the cloud projects live in a drawer on the right that reads as disconnected
from the files on the left, with the list of projects below a creation form whose **Start from** is a
bare list of template names. Testing 1.9.0 the owner asked for the view VS Code and Claude Code
give: folders and diagrams in a tree, the project chosen where the files are, configuration out of
the way unless asked for, templates that explain themselves, and a project that is exported and
imported as a whole.

## What Changes

- **An explorer pane.** A sidebar left of the code pane shows the project as a tree of folders and
  diagrams: each `.meltemi` file by its name, expanding to its diagrams and stories when it holds
  more than one, images as pictures, folders collapsible, problems marked per file. It opens files and
  picks the diagram on the canvas; it creates diagrams and folders, renames, moves (drag and drop,
  and a **Move to** dialog for the keyboard), duplicates, downloads and deletes, with a context menu
  and the keyboard pattern of a tree. It replaces the file bar and its three buttons, collapses to a
  rail, resizes, and is a tab or a sheet on narrow screens.
- **Configuration hidden unless asked.** By default the tree shows folders, `.meltemi` files and
  images. **Show all files** (remembered per browser) reveals `project.json`, `assets.lock.json`,
  fonts, Markdown and anything else. The project's name is edited in the explorer's header, which
  writes `project.json`; a hidden file with a problem announces itself and reveals on request;
  **Project settings** opens `project.json` whatever the toggle says.
- **The project switcher.** The explorer's header names the open project and where it lives (this
  browser, or the cloud with its connection state) and opens a panel: the project of this browser,
  the previous project when one is kept, the person's cloud projects with thumbnail and last change
  when signed in, and the actions **New project**, **Import project**, **Export project**, **Save
  this project to the cloud** and **Project settings**, plus open, rename, duplicate, copy the link
  and delete per cloud project. The header's **Projects** button and the drawer go; the **Templates**
  menu goes; **Open** keeps opening files and sends an archive to the import dialog. Versions, sharing
  and publishing stay where they are.
- **Templates as cards.** **New project** is a dialog with a name and a grid of cards, one per
  template: a thumbnail rendered at build time, a title in words, the description, and what the
  template holds (diagrams, models, views, stories). The CLI's `init --list` prints the same titles
  and summaries. Anonymous, a new project replaces the browser's project as a template did; signed
  in, it is a cloud project.
- **Import and export a project.** **Export project** writes the `.zip` the **Download** menu
  already writes. **Import project** takes a `.zip` (chosen, or dropped on the explorer) and asks
  where it goes: a new cloud project when signed in, the project of this browser, or the files of
  the open project replaced, each said plainly; an archive never replaces anything without that
  choice. Files dropped on a folder are added to it.
- **Moving a file keeps its imports working.** A rename or move of a `.meltemi` file rewrites the
  relative imports that name it in other files and the moved file's own imports, in the same
  undoable step, in the browser project and in a cloud project alike.

## Capabilities

### New Capabilities

- `project-explorer`: the explorer pane of the playground: the tree of folders, diagrams and
  images, its actions, keyboard and drag and drop, **Show all files**, the project switcher and its
  panel, the template cards, the import and export of a project, and the motion of all of it.

### Modified Capabilities

- `web-playground`: files are listed and managed by the explorer, not a file bar; templates open
  from the switcher's **New project**, not a header menu; an archive goes through the import dialog
  and never replaces the open project without a choice; the explorer joins the browser suite.
- `playground-cloud`: the projects drawer becomes the switcher's panel; an archive can become a new
  cloud project; a cloud project is renamed from the explorer's header; the explorer is read-only
  in view mode.
- `project-templates`: each template has a title, a summary of its contents and a thumbnail that
  the playground's build renders and `init --list` describes, from one source in
  `@meltemi/diagrams-project`.
- `source-editing`: a `moveFile` plan that rewrites the imports between files when a file's path
  changes.

## Non-goals

- Several projects in this browser: the anonymous project stays one, with the previous project kept
  as today. Named local projects in IndexedDB would be a change of their own.
- An explorer in the VS Code extension: VS Code's own explorer shows the folders and files; the
  extension's context menu already converts and builds from it.
- Creating folders in the cloud document as entities: folders exist through the paths of files, as
  the project format has them; an empty folder lives in the explorer until its first file.
- Searching inside files, and Git-like status marks.

This is a post-1.0 change outside `docs/roadmap-1.0.md`; it opens 1.10.0.

## Impact

- Playground (`packages/playground`): a new `explorer/` module (tree, model, switcher, panel, new
  project dialog, import dialog, drag and drop, motion), the shell's layout and settings (sidebar
  width, collapsed, show all files), the removal of the file bar, the **Templates** menu and the
  drawer (`cloud/projects.ts`; `projects-model.ts` becomes the switcher's model), the build
  (template thumbnails and metadata in `templates.json`), `playground.css`, words en/es, unit tests
  and browser scenarios; the cloud browser suite's drawer helpers move to the switcher.
- Project (`packages/project`): `TEMPLATES` gains titles and summaries; nothing else of the format
  changes.
- Edit and editor (`packages/edit`, `packages/editor`): `moveFile` (import rewriting) and its use by
  the Studio's rename; the CLI's `init --list` prints titles and summaries.
- Docs: `docs/playground.md` and `docs/es/playground.md` (the explorer, the switcher, templates,
  import and export), `docs/cli.md` (`init --list`), decision 0048, CHANGELOG 1.10.0.
