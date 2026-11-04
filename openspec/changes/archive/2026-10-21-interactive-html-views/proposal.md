## Why

On 2026-10-20 the owner, with IcePanel in mind, asked for HTML diagrams that explain themselves:
rest the pointer on a box and see what it is, click it for the whole story, zoom in and out, and
open what a box holds with a double click or a plus sign drawn on it when it has nested items.
Today the exported player and the catalog draw a fixed picture: the player reacts to nothing but
`url` links, and the catalog jumps on a single click to a linked diagram or an entity page with no
transition and no way to read a box without leaving it. Everything the viewer needs already
exists in the language and the engine: `description`, `technology` and `url` on elements and
relations, `link` between diagrams, `level` and `scope` on C4 views, and the story machinery
(`camera`, `morph`, `fade`) that draws any instant deterministically. What is missing is the
viewer.

## What Changes

- **Zoom and pan in every HTML drawing.** The player gets a stage with a persistent, CSS-transformed
  content layer: Ctrl/Cmd + wheel and pinch zoom around the pointer, a plain wheel pans only while
  the drawing overflows (otherwise the page scrolls), drag pans, `+` `-` `0` `1` and Shift+Arrows
  work from the keyboard, and a zoom cluster (out, level, in, fit) joins the control bar. Fit never
  exceeds actual size. The frame's SVG string never changes: zoom is viewer state, the exported
  frame and **Download SVG** stay byte-identical to the renderer's output.
- **Hover cards.** Resting the pointer on an element, a relation or a lifeline for 400 ms shows a
  card with its label, its C4 type word and technology, its description (three lines at most) and
  its link; relations show their ends, technology, description and assumption. Cards never cover
  what they describe, never show on touch, and render text only.
- **A detail panel on click.** A click or tap selects an element (a ring on an overlay, never in the
  frame) and opens a side panel inside the player: type, technology, full description, the link as
  an action, relations in and out, and in the catalog the stories that show it, the entity and the
  views scoped to it. Up and Down walk the elements from the keyboard, Enter selects, Escape closes.
  A click on an element with a `url` selects it too; the panel offers **Open link** and a
  modifier click still follows the link.
- **Drill-down by double click or the plus sign.** An element shows a plus badge only when it opens
  something: a C4 system whose container view exists, a C4 container whose component view exists,
  or an element whose `link` resolves to a bundled or catalogued diagram. Double click, the badge
  or Enter on the selected element opens it: the camera moves to the box (320 ms), then the view
  morphs into the child (480 ms; a cross-fade when ids differ), drawn by the story functions on the
  player's clock, a cut under reduced motion. A trail above the stage names the ancestor views,
  **Up** and Backspace go back with the reverse transition.
- **One interactive player for three surfaces.** The exported page and fragment, the catalog and
  the published catalog page (meltemi.page serves the same build) all mount the same runtime. The
  catalog stops handling clicks itself: it passes the player the targets, the panel sections and the
  parent view, and changes its route when a drill-down leaves the page.
- **Documents that carry what cards say.** The player document goes to version 2: effects documents
  hold a `views` map like stories (the root named by `key`), every view has `details` (per element
  kind, type word, technology, description, url, external, entity and what it opens; per relation
  label, technology, description, assumption, derivation), its C4 level and scope and its parent
  view. Type words are written in the content language at build time. The catalog data goes to
  version 2 with what each element opens, the stories that show each element and relation, relation
  end ids and each entry's C4 level, scope and parent.
- **Standalone exports bundle the reachable views.** `meltemi-diagrams export --format html` of a
  diagram lays out and bundles every view reachable by drill-down across the project, so the page
  explores offline; the same resolver serves the CLI, the playground and VS Code's **Export HTML
  Player**.
- **Catalog pages.** The elements table gains an **Opens** link to the child view, breadcrumbs show
  the parent views of a C4 view, the entity page lists the views scoped to the entity, and a deep
  link with `?element=` selects the element instead of styling it.
- **Shared pure modules.** The canvas's viewport math moves to `@meltemi/diagrams-layout/viewport`
  and the canvas re-exports it; `@meltemi/diagrams-motion` gains `drillTimeline`, `drillFrame` and
  `transitionFor` and exports `boundsOf` and `frameBox`; `@meltemi/diagrams-model` gains
  `childLevel` and `isChildView`; `@meltemi/diagrams-editor` gains `drill.ts`, the one resolver of
  child views and link targets.
- **Motion and finish.** The player's shadow root declares the motion tokens of the canvas under
  `--meltemi-*` names and zeroes them under `prefers-reduced-motion`; cards, rings, badges, the
  panel, the trail and zoom changes move on them. Interaction messages exist in English and
  Spanish.

## Capabilities

### New Capabilities

- `viewer-interaction`: zoom and pan, hover cards, selection and the detail panel, drill-down and
  the trail of the HTML viewer, on every surface that mounts the player.

### Modified Capabilities

- `player-runtime`: the `interactive` option, the zoom cluster and the new keys, reduced motion for
  viewer transitions and drill-downs, announcements and the Elements list of the text summary.
- `player-export`: player document version 2 (`views` map for effects documents, `details`), pages
  of a diagram that bundle the reachable views, VS Code's export through `produceExport`.
- `html-catalog`: single click selects and opens the panel, double click and the plus sign drill
  down with a transition, breadcrumbs of parent views, **Opens** links in the tables, views scoped
  to an entity, zoom on every drawing, **Download SVG** without viewer state.
- `c4-views`: `childLevel` and `isChildView`, the child view of an entity and the order of
  candidates.
- `story-timeline`: `drillTimeline` and `drillFrame`, the camera carried into a transition for
  drill-down frames.
- `links`: a click on a `url` element selects it in the interactive player and the panel opens the
  link; a modifier click follows it.
- `localization`: hover cards, the panel, the trail and the zoom controls are words of the content
  language.

## Non-goals

- Semantic zoom, drawing more or less detail as the scale changes: the change `semantic-zoom`.
- Folding a group into one box with its relations lifted to it: the change `group-folding`.
- A native `<title>` per element in SVG files, so a raw `.svg` shows browser tooltips: the change
  `svg-element-titles`.
- Hover cards, a detail panel or drill-down on the canvas (VS Code, the playground and the read-only
  `/p/<id>` page, where a double click edits a label): the change `canvas-hover-cards`.
- A minimap in the player: the change `viewer-minimap`.
- Drill-down inside story players: stories keep the author's camera and transitions; their elements
  get hover cards and the panel.
- New command-line flags, export-profile options or language statements: HTML output is interactive
  and bundles the reachable views; a host that wants a plain picture writes `interactive="false"`
  on the element or exports SVG.

This is a post-1.0 change outside `docs/roadmap-1.0.md`; it opens 1.9.0 (the `delivery` change
dates and tags 1.8.0).

## Impact

- `@meltemi/diagrams-layout`: `src/viewport.ts` (moved from `packages/editor/src/canvas/geometry.ts`,
  plus `clampPan`, `canPan`, `viewBoxPlacement`, fit options), the `./viewport` subpath, `c4TypeName`
  and `c4TypeLine` exported.
- `@meltemi/diagrams-motion`: `src/drill.ts`; `boundsOf` and `frameBox` public.
- `@meltemi/diagrams-model`: `childLevel`, `isChildView` in `c4.ts`.
- `@meltemi/diagrams-editor`: `src/drill.ts` (`resolveLink` lifted from `catalog.ts`, `childViews`,
  `openTargetOf`, `viewClosure`), `produceExport`'s html branch, `catalog.ts` inputs,
  `canvas/geometry.ts` as a re-export.
- `@meltemi/diagrams-player`: document version 2 and builders, `viewport.ts`, `ease.ts`, `cards.ts`,
  controller (view, trail, drill, selection, focused item, commands), runtime (stage, overlay, card,
  panel, trail, zoom cluster, events), `html.ts` (`interactive`), messages en/es, unit and browser
  tests.
- `@meltemi/diagrams-catalog`: data version 2, `views.ts`, `runtime.ts` (mount options instead of
  its own click handling; `fit` and `decorate` removed), messages en/es, unit and browser tests.
- `@meltemi/diagrams-cli`: tests of the bundled page; no option changes. VS Code: **Export HTML
  Player** through `produceExport`. Playground: no source change; its bundles are rebuilt.
- Docs en/es: `docs/player.md`, `docs/catalog.md`, `docs/language/export.md`, `docs/features.md`,
  the skill references, `docs/decisions/0047-interactive-html-views.md`, CHANGELOG 1.9.0; the
  gallery outputs regenerated by `pnpm gallery`.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm player:test-browser`,
  `pnpm catalog:test-browser`, `pnpm playground:test-browser`, `pnpm vscode:test-webview`,
  `pnpm acceptance:determinism`, `openspec validate interactive-html-views`.
