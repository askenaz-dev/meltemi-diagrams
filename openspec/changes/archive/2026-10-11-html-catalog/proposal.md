## Why

The proposal promises that an architecture repository produces a static sheet, an animated
explanation and an interactive catalog without keeping three versions of the content. Platform
teams "keep a catalog of systems" through a library by folders and automatic publication; the CLI
covers `build catalog`; the HTML export serves "catalog and interactive playback" with local
resources, navigation and offline use checked; and the exported catalog includes only authorised
metadata, without private notes or local paths by default. The launch material names a navigable
HTML catalog. Roadmap change 18 asks for `meltemi-diagrams build catalog`: a self-contained,
offline HTML catalog of a project's diagrams and stories by folder, with the player, search and
authorised metadata only.

## What Changes

- **Catalog package.** New `@meltemi/diagrams-catalog`: the catalog's data (diagrams with their
  views and scenarios, stories, folders, model entities, links between them), one HTML file with
  everything inline and a content security policy that forbids network requests, and a browser
  runtime that routes, searches and plays with the player's own runtime.
- **Navigation.** Home page by folder with thumbnails; a page per diagram (drawing, effects,
  scenarios, elements, relations, the stories that show it, links in and out), per story (the
  player, scenes, the diagrams it shows) and for the model's entities (where each one is drawn);
  elements linked to another diagram or to an entity navigate there; deep links and history.
- **Search.** Titles, ids, descriptions, folders, element and relation labels, technology and
  entities, ignoring case and accents; `/` focuses the search.
- **Authorised metadata.** By default the catalog holds what the drawings already show plus titles,
  descriptions and project-relative folders; never comments, absolute paths, diagnostics, the
  machine or the build time. The source text is included only when asked; diagrams and files can
  be left out.
- **Settings.** `project.json` gains `catalog` (`title`, `description`, `out`, `exclude`,
  `source`).
- **CLI.** `meltemi-diagrams build catalog [path]` with `--out`, `--title` and `--source`.
- **Editor.** VS Code command **Build Catalog**, which offers to open the result in the browser.
- **Fonts.** The renderer exposes the faces a set of scenes needs, so the catalog embeds each font
  subset once.
- **Docs.** `docs/catalog.md`, `project.json` reference, decision 0027, README, editor guide, skill.

## Capabilities

### New Capabilities

- `html-catalog`: the offline HTML catalog of a project, its navigation, search, player and
  metadata policy, from the command line and VS Code.

### Modified Capabilities

- `project-manifest`: the `catalog` settings.

## Impact

- New package `@meltemi/diagrams-catalog` (no third-party runtime code; esbuild bundles its browser
  runtime as the player's is bundled).
- `@meltemi/diagrams-editor/node` gains `buildCatalog`; layout of exports and the catalog share one
  helper.
- `@meltemi/diagrams-render` gains `embeddableFaces` and `fontFaceRule`.
- `@meltemi/diagrams-project` reads and checks `catalog`; `schemas/project.schema.json` documents it.
- The CLI gains the `build` command; VS Code gains a command and a test; a browser suite checks the
  catalog in Edge or Chrome.
