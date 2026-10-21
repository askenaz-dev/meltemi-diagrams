## MODIFIED Requirements

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
