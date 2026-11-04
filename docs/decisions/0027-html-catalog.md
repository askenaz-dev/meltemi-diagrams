# 0027. The HTML catalog: one offline file with authorised metadata only

Status: accepted (html-catalog change, 11 October 2026)

## Context

The proposal promises that one architecture repository yields a static sheet, an animated
explanation and an interactive catalog without three versions of the content. Platform teams keep a
catalog of systems as a library by folders with automatic publication; the CLI covers
`build catalog`; the HTML export serves the catalog and interactive playback with local resources,
navigation and offline use checked; the exported catalog includes only authorised metadata, without
private notes or local paths by default. The player (decision 0024) already plays stories and
effects offline from a JSON document, in shadow roots.

## Decision

- **One file.** The catalog is a single `index.html` with its data, fonts, styles and script
  inline and routes in the hash. It opens from `file://`, can be attached or emailed, and any static
  host serves it. A content security policy (`default-src 'none'`, inline scripts and styles,
  `data:` and `blob:` pictures and fonts) makes the offline promise checkable.
- **Data, then shared views.** `catalogData` turns laid-out views and stories into plain data:
  entries keyed by project-relative file and id, one player document per view (one per sequence
  scenario), elements, relations, links in and out, the stories that show a diagram, and the model
  entities that catalogued views draw. `views.ts` writes every page as escaped HTML; the page
  writer uses it for the overview and navigation (readable without scripts), the runtime for every
  route. The runtime is bundled with the player's into one script.
- **Fonts once.** Documents in the catalog carry no font faces; the page holds every subset the
  drawings need once (`embeddableFaces`), and each view lists the faces its text uses, so
  **Download SVG** writes a standalone SVG with only those.
- **Navigation through links and the model.** An element linked to another diagram's element opens
  that diagram with the element highlighted; an element that draws or links to an entity opens the
  entity, which lists every view that shows it. Links are resolved through imports by the host.
- **Search in the page.** Words are compared without case or accents; all must match; titles and
  ids weigh most, then elements, then descriptions; results say where they matched.
- **Authorised metadata only.** Included by default: titles, descriptions, types, project-relative
  folders and files, and what the drawings show. Never: comments, absolute paths, diagnostics, the
  machine, the build time. Source text only on request (`catalog.source`, `--source`). Story
  documents now name views by diagram id instead of `<absolute file>#<id>`, which also keeps local
  paths out of exported players. `catalog.exclude` leaves out folders, files or blocks; a story
  that shows an excluded diagram is warned about.
- **Settings and commands.** `project.json` `catalog` (`title`, `description`, `out`, `exclude`,
  `source`); `meltemi-diagrams build catalog [path] [--out] [--title] [--source]` with exit codes for
  CI; VS Code **Build Catalog**.

## Alternatives considered

- **A folder of pages.** Scales to very large projects and gives each page its own file, but search
  data cannot be fetched under `file://`, and a folder cannot be attached as one file. Projects of
  tens of diagrams stay at a few hundred kilobytes to a few megabytes.
- **Pictures instead of documents.** Static SVG per page is smaller for diagrams without effects,
  but stories and effects need the player's documents anyway, and one drawing path keeps every view
  identical to the other exports.
- **A search index built ahead.** Unneeded at catalog sizes; searching the data in the page keeps
  one source of truth.

## Consequences

- A catalog is reproducible: same sources, same bytes; CI can build and publish it.
- Large projects make large files; sequence scenarios add one view each. The build prints the size.
- The release (change 24) can publish its gallery as a catalog with `--source`.
