## Context

- The player (change 15) plays stories and effects from a JSON document with one offline script;
  `mountPlayer` draws in a shadow root, so ids and styles of one drawing never reach another.
- `produceExport` (change 16) lays out diagrams with the project's themes, fonts, icons and images;
  `storyDocument` and `effectsDocument` build player documents from laid-out views.
- `Workspace.compileProject()` compiles every source of a project; `project.json` is read by
  `readManifest` with `project.*` diagnostics and described by `schemas/project.schema.json`.
- C4 views draw model entities (`Element.entity`); `link` statements tie elements to elements of
  other diagrams or to entities, possibly through imports.

## Goals / Non-Goals

**Goals:** one command that turns a project into a catalog people can open from a file, a share
or a static host without a network; navigation by folder, between diagrams and through the model;
search; playback; a metadata policy that leaks nothing by default; the same result for the same
sources.

**Non-Goals:** a server, accounts or comments (realtime collaboration is outside 1.0); editing in
the catalog; publishing to a particular host (any static host serves the file).

## Decisions

### D1. One self-contained HTML file

The catalog is a single `index.html`: data, fonts, styles and scripts inline, routes in the hash
(`#/diagram/<key>`, `#/story/<key>`, `#/entity/<key>`, `#/entities`, `#/search?q=`). It opens
from `file://`, can be attached or emailed, and any static host serves it. A content security
policy (`default-src 'none'`, inline scripts and styles, `data:` and `blob:` images and fonts)
makes the offline promise checkable: nothing can be fetched. A folder of pages would scale better
but breaks under `file://` for search data, and a project of tens of diagrams stays a few
megabytes at most.

Entry keys are the project-relative file path without `.meltemi` and the block id
(`diagrams/checkout/checkout`), so links stay stable while files do not move.

### D2. Data, then views shared by the page and the runtime

`catalogData` turns laid-out views and stories into plain data: per diagram its type, title,
description, folder, file, one player document per view (one per sequence scenario), elements,
relations, links and the stories that show it; per story its document, scenes and the diagrams it
shows; the model entities drawn by catalogued views. `views.ts` renders pages from that data as
escaped HTML strings; the page writer uses it for the first page (so the folder list and home work
without scripts) and the runtime uses the same functions after each route change, then mounts
players and thumbnails in the placeholders. The runtime is bundled with the player runtime into
one script (`dist/catalog.js`), as the player is.

### D3. Fonts once

Player documents in the catalog carry no font faces; the page holds the faces every scene needs,
computed once with `embeddableFaces(scenes, provider)` and written with `fontFaceRule`. Each view
lists the indexes of the faces its text uses, so **Download SVG** writes a standalone SVG with only
those faces.

### D4. Navigation

- Home: title, description, counts, and each folder with cards (static thumbnail, title, type).
- Diagram: drawing in the player (controls when it has effects; scenario picker for sequence
  diagrams with scenarios), description, elements and relations tables (labels, kinds,
  descriptions, technology, links), the stories that show it, diagrams it links to and from.
  Clicking an element linked to another diagram opens that diagram with the element highlighted;
  clicking an element that draws an entity opens the entity.
- Story: the player, its scenes, the diagrams it shows.
- Entities: model entities drawn by catalogued views, by model, with kind, technology,
  description, external flag, URL and the views that draw them.
- Every route change sets the document title, focuses the page heading and keeps history, so back
  and forward work. The navigation marks the current entry with `aria-current`.

### D5. Search

The runtime searches the data it already has: titles, ids, descriptions, folders, files, element
and relation labels and descriptions, technology, and entities. Text is compared without case or
accents (Unicode decomposition); every word of the query must match. Titles and ids weigh more
than elements, elements more than descriptions. Results say where they matched; a live region
announces how many there are. `/` focuses the search, Escape clears it.

### D6. Authorised metadata

Included by default: the project's `name` (or `catalog.title`), `catalog.description`, titles,
descriptions, types, project-relative folders and file names, and what the drawings show
(labels, element and relation descriptions, technology, URLs). Never included: comments, absolute
paths, diagnostics, the tool's environment (browser, machine) or the build time; the page names
the generator and its version only. `catalog.source: true` (or `--source`) adds the text of each
catalogued file, comments included, shown and downloadable. `catalog.exclude` leaves out folders,
files or single blocks (`diagrams/checkout.meltemi#internal`); a story that shows an excluded
diagram still draws it, so the build warns.

### D7. Settings, command and editor

```json
"catalog": {
  "title": "Commerce architecture",
  "description": "Views and stories of the shop.",
  "out": "public/catalog",
  "exclude": ["drafts", "diagrams/checkout.meltemi#internal"],
  "source": false
}
```

`out` is a project-relative folder (the file is `index.html` inside) or `.html` file, default
`catalog`. `meltemi-diagrams build catalog [path]` (a project folder or a file inside one, default
the working folder) prints the project's diagnostics, skips diagrams that cannot be drawn, writes
the file and says what it holds; it exits 1 when something had errors or was skipped, 2 on usage
errors or when there is nothing to catalog. `--out`, `--title` and `--source` override the
settings. VS Code's **Build Catalog** builds the project of the active file and offers to open the
result in the browser.

## Risks / Trade-offs

- [Size] → one file holds every view; scenes are compact JSON and fonts are embedded once.
  Sequence scenarios multiply views; the build reports the size.
- [Excluded diagrams in stories] → warned, documented.
- [Shadow roots and clicks] → the runtime reads `composedPath()` on the player's host to find the
  clicked element's `data-id`; elements stay reachable from the keyboard through the tables.
