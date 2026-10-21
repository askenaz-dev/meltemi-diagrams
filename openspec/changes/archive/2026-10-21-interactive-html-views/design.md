## Context

- The player (`packages/player/src/runtime.ts`) draws every frame as a string from `frameSvg` and
  replaces `frame.innerHTML` whenever it changes (lines 222-228), at display rate while a story or
  endless effects play. DOM identity of `<g data-id>` nodes is lost on every draw; hover and
  selection state cannot live on them. `PlayerHandle.svg` is "exactly as the renderer wrote it"
  (line 71), feeds the catalog's **Download SVG** (`packages/catalog/src/runtime.ts:201, 221`) and
  the browser test's byte equality with `export --at` (`test/browser/run.ts:102, 111`); the
  acceptance determinism gate exports the HTML twice and compares bytes.
- The player has no pointer listener; the only keys are the controller's (Space/K, Left/Right,
  Home/End, PageUp/PageDown, P/N, S). The catalog adds click delegation from outside the shadow root
  (`runtime.ts:175-196`): an SVG `<a>` opens its URL, an element with a `link` or an entity goes to
  another page. `decorate` injects `cursor: pointer` and a drop-shadow highlight; `fit` caps the
  frame at the scene width.
- The renderer writes `<g data-id data-role [data-layer]>` for every item (`packages/render/src/svg.ts:267-283`);
  roles are `element | relation | label | frame | icon | lifeline | event | motion`. Elements and
  events carry `bounds`, relations `track`, in scene units, so an overlay can be positioned from the
  document's data without `getBBox`. Containers are siblings of their children, not ancestors. The
  `<a href>` of a `url` element sits inside its `<g>`. Motion overlays (`data-role="motion"`) are
  hit-testable in player frames because the `pointer-events: none` rule exists only in the animated
  SVG profile (`packages/motion/src/css.ts:227`).
- `storyFrame` (`packages/motion/src/story.ts:496-591`) writes the camera as `Scene.viewBox` (a
  plain field, lines 510-526), drops the camera when the scene's view changes (273-276, 293-294) and
  draws `fade`/`morph` transitions between consecutive scenes of different views; a morph matches
  `role: "element"` groups by id and bounds. C4 ids are entity paths at every level, and the scope of
  a container or component view is a `group` element with the scope's path as id (`packages/model/src/c4.ts:621-625, 665`),
  so a system box morphs into the boundary of its container view.
- Player documents hold `names` (labels only); `isPlayerDocument` checks `version === 1`. Effects
  documents carry one view (`key`, `view`, `durationMs`); story documents already key `views` by
  diagram id, deduplicated with `-2`, `-3`, never a path (decision 0027).
- `C4View` keeps `level`, `scope`, `resolved` (`packages/model/src/types.ts:877-893`);
  `allowedEntities` (`c4.ts:61-96`) defines what each level draws. `ElementLink` resolution through
  imports lives in `packages/editor/src/catalog.ts:104-129` (`resolveLink`), and `buildCatalog`
  walks `workspace.sources()` in sorted order (`catalog.ts:132`).
- `packages/editor/src/canvas/geometry.ts` (208 lines, zero imports) holds the canvas's viewport
  math: `Viewport`, `ZOOM_MIN 0.1`, `ZOOM_MAX 8`, `ZOOM_PRESETS`, `zoomAt`, `zoomStep`, `fitBox`,
  `revealBox`. The player cannot import the editor (the editor depends on the player), and
  `@meltemi/diagrams-layout` already exposes a pure `./shapes` subpath.
- The canvas's motion tokens and rules live in `packages/canvas/canvas.css:13-44` (120/160/220 ms,
  two easings, rise 4 px, slide 12 px, all zeroed under reduced motion); its tooltips rest 400 ms
  (`packages/canvas/src/tooltip.ts`). The player's shadow `STYLE` has system colours, one focus
  token and no transitions.
- `c4TypeLine(element, locale)` (`packages/layout/src/layout.ts:288`) builds the drawn type line in
  the content language but is not exported from the package root. `effectsPlayerDocument` and
  `storyPlayerDocument` (`packages/editor/src/story.ts`) build single documents from a
  `DocumentAnalysis` for VS Code and the acceptance tests; the CLI, the playground and profiles go
  through `produceExport` (`packages/editor/src/exports.ts:224-241`).
- The published page is the catalog build served as stored (`packages/cloud/src/publish-worker.ts`),
  with hash routes and no post-processing: whatever the catalog runtime does reaches meltemi.page.

## Goals / Non-Goals

**Goals:** one interactive viewer in the player runtime, used unchanged by the exported page, the
catalog and the published page: geometric zoom and pan, hover cards, selection with a detail panel,
drill-down by double click or plus badge with a deterministic camera-and-morph transition, a trail
back; documents that carry the words the cards say; a standalone export that bundles what can be
opened; the frame string, the exports and the story semantics untouched; keyboard, touch, screen
readers, light and dark, English and Spanish; motion on shared tokens, still under reduced motion.

**Non-Goals:** semantic zoom, group folding, native SVG `<title>`s, interaction inside the canvas,
a minimap, drill-down inside stories, new CLI flags, profile options or language statements (each
named in the proposal as a change of its own or as excluded).

## Decisions

### The viewer transform

- User zoom and pan are a CSS `transform: translate(x, y) scale(zoom)` on a persistent `div.content`
  inside the stage; `draw()` replaces the SVG inside that wrapper, so the transform survives every
  frame and composes with the story camera (`viewBox` inside, user transform outside, the canvas's
  own model at `packages/canvas/src/app.ts:1687-1690`). Nothing viewer-side enters `frameSvg`'s
  string, `PlayerHandle.svg` or **Download SVG**. *Alternative:* rewriting the live `viewBox` after
  each draw (rejected: re-applied at 60 fps, forces an SVG re-layout per wheel tick, cannot be
  animated by CSS, and diverges the live attribute from the string). *Alternative:* a native scroll
  container (rejected: scrollbars inside a 6 px frame, no CSS animation of fit, pinch at the
  browser's mercy).
- The viewer state is a pure class `ViewerViewport` (`packages/player/src/viewport.ts`, no DOM),
  tested in Node like `PlayerController`; the runtime applies it as custom properties on the stage
  and reads it for buttons, cursor and announcements. *Alternative:* fields on the controller
  (rejected: the controller is the clock; zoom needs stage and content sizes it never knew).

### Shared viewport math

- `packages/editor/src/canvas/geometry.ts` moves to `packages/layout/src/viewport.ts`, published as
  `@meltemi/diagrams-layout/viewport` beside `./shapes` (exports, `publishConfig`, the vitest
  alias); `editor/src/canvas/geometry.ts` becomes `export * from "@meltemi/diagrams-layout/viewport"`,
  so the canvas keeps importing from `@meltemi/diagrams-editor/canvas`. It gains `clampPan`,
  `canPan`, `viewBoxPlacement` (the `xMidYMid meet` placement of a camera box inside an element)
  and `FitOptions { margin, maxZoom, minZoom }` on `fitBox`/`fitViewport`/`fitSelection` (defaults
  equal today's `FIT_MARGIN 24` and `maxZoom 1`; the player passes `{ margin: 0, maxZoom: 1 }`).
  *Alternative:* `@meltemi/diagrams-motion` (rejected: motion is the deterministic clock; a viewer
  viewport is not frame data). *Alternative:* a copy in the player (rejected: two sources of the
  same numbers).

### The stage and fit

- `div.stage` is a fixed window: `width: 100%`, `max-width` the current view's width, centred,
  `aspect-ratio` the current view's, `overflow: hidden`. The SVG keeps its intrinsic
  `width`/`height` inside `div.content`; fit is `fitBox(view, stage, { margin: 0, maxZoom: 1 })`,
  so a drawing is never stretched above actual size and the picture at fit equals today's catalog
  (which already caps at the scene width; its `fit()` helper is deleted). When the current view
  changes (a story scene in another view, a drill-down) the stage's aspect ratio animates over the
  slow token, and transition frames, which are the union of both scenes, are fitted at every
  instant. *Alternative:* `.frame svg { width: 100% }` as today (rejected: the exported page
  stretches a 600 px drawing to 1200 px, and a self-resizing stage fights the user's viewport).
  *Alternative:* a stage sized by the union of every view (rejected: a small context view would sit
  top-left of a stage sized for its component views).
- A `ResizeObserver` on the stage refits while the viewport is still the fit (`fitted`), else keeps
  the zoom and the content point under the stage centre, without transition. The viewport lives in
  memory per mount; the catalog remounts on each route, so pages open fitted. *Alternative:*
  `localStorage` per diagram (rejected: `file://` pages, hash routes per entry and scenario, a stored
  zoom surprises on another window size).

### Gestures

- **Wheel.** Ctrl/Cmd + wheel (trackpad pinch arrives so) zooms around the pointer by
  `exp(-deltaY × 0.002)` (the canvas constant). A plain wheel pans only when `canPan` says the
  drawing overflows in that direction and is otherwise left to the page; Shift turns a vertical
  delta horizontal. *Alternative:* plain wheel zooms (rejected: a scroll trap on every catalog page).
  *Alternative:* plain wheel always to the page (rejected: no trackpad pan while zoomed in).
- **Drag.** Left or middle button past 3 px (`DRAG_THRESHOLD`) pans with pointer capture; the
  trailing `click` is cancelled in the capture phase before the native `<a>` and any host handler;
  `user-select: none` and `dragstart` prevented inside the stage (the summary, tables and panel stay
  selectable). *Alternative:* middle button or Space+drag only (rejected: Space plays; touchpads
  and phones excluded).
- **Touch.** `touch-action: pan-y` at fit (the page scrolls over a drawing) and `none` once the
  drawing overflows (`.pannable`); two captured pointers pinch around their midpoint; one pointer
  pans when zoomed. No hover card for `pointerType === "touch"`; a tap selects and opens the panel.
  *Alternative:* `touch-action: none` always (rejected: a phone cannot scroll past a drawing).

### Keys

- The figure's keydown handler keeps its exclusions (the `<select>`, the slider's own keys, buttons'
  Space and Enter, Ctrl/Alt/Meta chords) and gains: `+`/`=` zoom in, `-` zoom out, `0` fit, `1`
  actual size (around the focused item when one is focused, else the stage centre); Shift+Arrows pan
  an eighth of the stage (key repeat pans continuously); `ArrowUp`/`ArrowDown` move a keyboard focus
  ring through the view's items in drawing order (elements with bounds, then relations), reveal the
  item inside the stage and announce it; `Enter` selects the focused item and opens the panel, and on
  an already selected item that opens something, opens it; `Backspace` goes up one view (prevented
  from reaching the browser only when the stage is the target); `Escape` closes the card, then the
  panel, then clears the selection. Tab is never captured: the player is embedded in pages.
- The fine time step moves from Shift+Left/Right to `,` and `.` (the video convention) so that
  Shift+Arrows can pan. This changes a shipped binding and is recorded as a question for the owner;
  the default applies. *Alternative:* no pan keys (rejected: pan would have no keyboard equivalent).
  *Alternative:* arrows pan only while zoomed (rejected: modal keys that tests and screen-reader
  users cannot predict). *Alternative:* Tab cycles elements inside the stage, the canvas's model of
  decision 0017 (rejected: capturing Tab inside a `role="img"` on a web page surprises; Up/Down are
  free and the Elements list gives an arrow-free path).

### Composition with the story camera

- The user viewport is independent and persistent: play, scene changes, camera actions and the
  static toggle never reset it; `fit` is the only reset. A camera action pans inside the person's
  window, as on the canvas in story mode. The drill-down resets to fit before its camera move so the
  transition is seen whole. *Alternative:* refit on every camera action (rejected: the person's zoom
  is lost on each scene).

### Zoom controls, limits, resize

- A `div.zoom[role="group"]` at the end of the control bar: zoom out, a level button (the
  percentage in the content language; click = actual size), zoom in, fit, 32 × 32 like the other
  buttons, named with their keys. The bar is shown for every document; playback controls stay
  hidden when nothing plays (today the whole bar hides). *Alternative:* an overlay cluster in the
  stage's corner (rejected: covers the picture, splits the focus order).
- Presets `0.1 … 8` and `ZOOM_MAX 8` from the shared module; `min = Math.min(0.1, fitZoom)` so a
  huge scene can always be fitted; buttons and keys step presets; wheel and pinch are continuous.
  No minimap (the pan clamp and Fit remove the lost case, and a second SVG per player on pages with
  size and CSP limits is not worth it). *Alternative:* an optional minimap (named as its own change).

### The player document, version 2

- `PLAYER_VERSION = 2`, `CATALOG_VERSION = 2`, `MeltemiPlayer.version = 2`; every new field is
  required. Data and runtime always ship in one file, so no cross-version reading exists; optional
  fields would be compatibility planning, which the rules forbid. *Alternative:* version 1 with
  optional fields (rejected for that reason).
- Effects documents become `{ kind: "effects", key, views: Record<key, EffectsViewData> }` with
  `EffectsViewData extends StoryViewData { durationMs: number | null }`; `view` and the top-level
  `durationMs` go. The controller's current view is one key for both kinds; `frameSvg(data, t,
  { view })` draws `views[view]`; keys follow `storyDocument`'s rule (diagram id, `-2`, `-3`, never a
  path). *Alternative:* keep `view` plus an optional `views` (rejected: two ways to reach a view).
- `DocumentBase.details: Record<key, ViewDetails>` beside `names`:

  ```ts
  interface ElementDetails { kind: ElementKind; type: string | null; technology: string | null;
    description: string | null; url: string | null; external: boolean; entity: string | null;
    opens: OpenTarget | null }
  interface RelationDetails { label: string | null; technology: string | null; description: string | null;
    assumption: string | null; derived: boolean; sources: readonly string[]; async: boolean }
  interface ViewDetails { elements: Record<string, ElementDetails>; relations: Record<string, RelationDetails>;
    c4: { level: C4Level; scope: string | null } | null; parent: { view: string; element: string } | null }
  type OpenTarget = { view: string; element: string | null; transition: "morph" | "fade" }
  ```

  `type` is the C4 type word as drawn (`c4TypeName`, the word `c4TypeLine` picks, without brackets
  or technology: "Container", "External Software System", "Contenedor"), computed at build time
  with `DocumentOptions.locale` (the layout's content locale), null outside C4 views; relation ends
  come from `StoryViewData.ends`. `detailsOf(diagram, locale, opens)` reads only `label`, `kind`,
  `technology`, `description`, `url`, `external`, `entity.path` and the relation fields: never
  comments, ranges, paths or diagnostics. *Alternative:* kind words for every element kind in the
  player's messages (rejected: twenty words in two languages the drawing never shows; the card and
  the drawn type line could disagree). *Alternative:* the catalog feeds cards from `CatalogElement`
  (rejected: the exported player would have no cards).

### Hover cards

- `div.card[role="tooltip"]`, `position: fixed`, appended to the figure (never inside the
  transformed content). It shows after the pointer rests 400 ms on an element, a relation or a
  lifeline; while a card is visible, moving to another target swaps its content at once (the warm
  state lasts 300 ms after leaving). It hides on `pointerout`, `pointerdown`, `keydown`, `wheel` and
  Escape. Elements: label, `type · technology` (plus "external"), the description clamped to three
  lines, the URL's host. Relations: label or `from → to`, the ends in a muted line, technology, the
  description clamped, "Assumption: why". Lifelines show their participant's card. Placement: 6 px
  below the box, centred, flipped above when it does not fit, clamped 4 px inside the viewport;
  pointer-anchored for relations, lifelines and boxes taller than 60 % of the viewport; `max-width:
  300px`, 12 px text, `pointer-events: none`. All text through text nodes; `href` set only after
  re-checking `^(https?:|mailto:)`. *Alternative:* a card that follows the pointer (rejected:
  jitters and covers neighbours). *Alternative:* the full description (rejected: a ten-line card
  taller than its box).

### Selection, hover and the overlay

- An `svg.overlay[aria-hidden]` inside `div.content` after the picture, with the picture's root
  `viewBox`, `width` and `height` copied after every draw, holds in scene units: invisible hit
  tracks for relations (`<polyline points=track>` with a transparent 10-unit stroke,
  `pointer-events: stroke`; an element whose bounds contain the pointer wins over a crossing
  track), the hover ring (1.5 px accent, opacity .6), the selection ring (3 px accent, the geometry
  of a story `highlight`: bounds inflated by 4 and rounded by `radius + 4`; a relation's track
  widened by 6), the keyboard focus ring (1.5 px dashed `--meltemi-focus`) and the plus badges.
  Rings are recomputed from `views[view].scene` after each draw and not re-animated (`held`), so a
  playing story never loses them. *Alternative:* `filter: drop-shadow` through a `<style>` (the
  catalog's `decorate`; rejected: costly on groups at 60 fps, smears relations, no badge or hit area).
  *Alternative:* a synthetic `highlight` action in `storyFrame` (rejected: viewer state in the frame
  string).
- `[data-role="motion"] { pointer-events: none }` joins the player's `STYLE`, so halos, particles,
  story highlights and morph wrappers never take a hover or a click.

### The detail panel

- `aside.details[role="region"][aria-labelledby][tabindex="-1"]`, non-modal, docked to the stage's
  right edge over the drawing (`min(320px, 60%)` wide, Canvas background, left border and shadow),
  stacked below the stage when it is narrower than 720 px or shorter than 280 px. Content: Close,
  the label as `h2`, the type line, a definition list (Kind, Technology, Link as **Open link**), the
  description with `white-space: pre-line`, **Open …** when the element opens something, Relations
  as Outgoing and Incoming lists of buttons (each selects that relation), then the host's sections
  (the catalog's Stories that show it, Entity, Views scoped to it). Relations get From and To buttons,
  Technology, Assumption, "Stands for n model relations" with a lifted badge when `derived`, and
  the description. Opened by pointer the panel never takes focus; opened by Enter it stays with the
  stage too, and Tab reaches it next (it follows the stage in DOM order). Selecting another target
  swaps the body; Escape or Close closes it; clicks elsewhere on the page do not. *Alternative:* an
  in-flow panel that narrows the stage (rejected: the drawing jumps on every click). *Alternative:*
  a popover at the box (rejected: two relation lists and stories do not fit). *Alternative:* a
  modal dialog (rejected: the point is browsing boxes while reading).
- "Stories that show it" is precomputed at build in `catalogData` (`CatalogElement.stories`,
  `CatalogRelation.stories`) from each story's `timeline.scenes[].actions[].targets` resolved
  through `StoryInput.shows`; `CatalogRelation` gains `fromId`/`toId` because `from`/`to` are labels.
- Descriptions appear once in the catalog's `CatalogElement` (tables, search) and once in each
  view's `details` (cards, panel). Accepted: geometry dominates the page, and the 16 MiB publish
  check already exists; the fixture catalog's size before and after is recorded in the decision.

### Drill-down: what opens

- Resolution happens at build time, in one shared resolver `packages/editor/src/drill.ts` used by
  `produceExport`'s html branch and `buildCatalog`; the viewer only looks up `details[view].elements[id].opens`
  (standalone) or the host's `targets` (catalog). *Alternative:* resolve at runtime from model data
  shipped on the page (rejected: `link` resolution through imports needs the compiler; two
  resolvers would drift).
- What an element opens, by its own kind, never by the current view's level: a C4 `system` opens a
  `container` view scoped to it, a `container` a `component` view scoped to it (`childLevel(kind)`
  in `packages/model/src/c4.ts`); `person`, `datastore` and `component` open nothing; the boundary
  group of a C4 view opens nothing (its children are on screen). A flow, free or sequence element
  (participants included) whose `link` resolves to a catalogued or bundled diagram opens that
  diagram with the element selected; an element linked to a model entity opens that entity's child
  view when one exists. Relations, labels, events, notes, tags, lifelines, the brand frame and
  `url`-only elements open nothing. *Alternative:* level N+1 only for the scope's children
  (rejected: a system drawn beside the scope could not open its own containers).
- A child view must have the same model identity (`resolved.file ?? owner file`, model id), the
  next level and `scope === entity.path`, not `hasErrors`, not excluded by `catalog.exclude`.
  Candidates are ordered same file first in source order, then the project's files in
  `workspace.sources()` order (the catalog's order); the first opens, every candidate is listed in
  the panel under **Views scoped to it**. *Alternative:* alphabetical by id (rejected: ignores
  locality).
- The plus badge appears exactly when `opens` is set, and double click, Enter on the selected element
  and the badge do the same thing; an element that opens nothing is only selected by a double click.
  The entity page stays one click away in the panel. *Alternative:* a double click on an
  entity-only element opens the entity page as a single click did (rejected: a hidden extra meaning
  not signalled by a badge; the owner tied opening to nested items).
- `transition` is chosen by data at build time: `morph` when both laid-out scenes have a
  `role: "element"` group with the clicked element's id and bounds (every C4 drill-down, and a `link
  checkout.api` whose ids match), else `fade`. *Alternative:* by profile (rejected: misses matching
  flow ids).

### The plus badge

- Drawn on the overlay in scene units at the top-right corner of the selection ring (`x + width + 4`,
  `y - 4`), a circle with a plus, counter-scaled by `1 / zoom` around its centre so it stays 20 px on
  screen with a 32 px hit area, hidden when the element's box is under 32 px on screen in either
  direction, while a drill plays and while a drag is in progress; a rotated element's corner is
  rotated with the group's `rotate(d cx cy)`. Idle: Canvas fill, accent stroke, accent plus;
  selected: accent fill, `HighlightText` plus; hover scales to 1.08. Its accessible path is the
  panel's **Open …** button, the Enter key and the Elements list ("API opens Components of API").
  Never in SVG, PNG or PDF exports: viewer chrome (the proposal lets the interactive preview add
  controls absent from exports). *Alternative:* one HTML `<button>` per openable element in a layer
  beside the SVG (rejected: one tab stop per element on sheets of thousands, two focus paths for one
  action). *Alternative:* a badge scaled with the picture (rejected: unusable at 0.1 and 8).
  *Alternative:* a count on the badge (not adopted; recorded as a question).

### Clicks

- A `click` whose press moved under 3 px selects at once and opens the panel; `dblclick` on the same
  element opens it (the panel closes as the drill starts); no click timer. Both are delegated on the
  stage through `composedPath` to the nearest `[data-id][data-role="element"|"lifeline"|"relation"]`,
  skipping motion wrappers and groups at opacity 0. *Alternative:* a 250 ms timer (rejected: every
  selection sluggish).
- A click on an element with `url` selects it; the player calls `preventDefault` on the anchor
  unless Ctrl, Cmd or the middle button is pressed, which follow the link as the browser does. The
  `<a href>` stays in the markup (SVG, PDF and the frame keep the link) and the panel offers **Open
  link** (`target="_blank" rel="noopener noreferrer"`). *Alternative:* the anchor keeps winning
  (rejected: a double click would open a tab first; a `url` element could never be selected).

### The drill transition

- `packages/motion/src/drill.ts`: `drillTimeline(spec)` builds a plain two-scene `StoryTimeline`
  (scene 1 on the parent view with a real `camera <element>` action over `cameraMs`; scene 2 on the
  child view with `transition morph | fade` over `transitionMs`), and `drillFrame(spec, views, t)`
  calls `storyFrame` and then sets `viewBox` during the transition to
  `lerp(frameBox(parent, boundsOf(element)), fullBox(child), p)` (going up: from the child's full
  box to the element's camera box, then to the parent's full box), and `width`/`height` to the max
  of both scenes for every `t`, so the picture never snaps size mid-drill. `DRILL_DURATIONS =
  { cameraMs: 320, transitionMs: 480 }`; `transitionFor(parent, child, element)`; `boundsOf` and
  `frameBox` become public. The spec is a `DrillSpec { from, to, element, transition, direction,
  cameraMs, transitionMs }`; `drillFrame` returns null when a view or the element's bounds are
  missing. Pure, JSON-serialisable, unit-tested at control instants. *Alternative:* make the story
  camera persist across a transition in `stateAt` (rejected: changes documented story semantics and
  every exported frame of such stories). *Alternative:* the viewer composes its own viewport move,
  then a morph-only timeline (rejected: depends on stage size, two clocks, two implementations).
- The controller owns the drill clock: `drill: { spec, time }` advanced by `tick`; at its end the
  current view becomes `spec.to`, the time 0, the autoplay rule re-applied. The runtime maps each
  phase's progress through the shared ease `cubic-bezier(0.2, 0.7, 0.3, 1)` (a small solver in
  `packages/player/src/ease.ts`) before calling `drillFrame`, whose timeline stays linear; drill
  frames never export. Under reduced motion both durations are 0: a cut to the child's static frame,
  the same frame the animated drill ends on. **Download SVG** during a drill writes the settled
  view's frame, never a drill frame. *Alternative:* linear (rejected: reads mechanical beside every
  other transition; the UI standard asks for motion on tokens).

### The trail and the way back

- `nav.trail[aria-label]` above the stage: an **Up** button named after the parent and an ordered
  list of ancestor views as buttons, the current view with `aria-current="page"`; hidden when there
  is nothing above and nothing in the document opens. Backspace goes up one level with the reverse
  transition; a crumb jumps several levels (one reverse drill to that view). The standalone trail is
  the controller's stack (`trail`), capped at 32 entries because `link` cycles are legal; in the
  catalog the trail is data-derived from `DiagramEntry.parent` (the first entry in catalog order with
  an element that opens this one) so deep links show it, and the in-page origin wins when the page
  was reached by a drill in this session. After an up, the element the person came from gets a
  transient selection ring. *Alternative:* only an Up button (rejected: no orientation three levels
  deep).

### Catalog integration and routes

- The player owns hover, selection and drill-down; the catalog deletes `decorate`, `fit` and its
  click handler and mounts with host options: `select` (the route's `?element=`), `targets(view,
  id)` (the entry's `opens` as `{ kind: "host", label, transition }`), `onNavigate(target, origin)`,
  `sections(view, id)` (Stories that show it, Entity, Views scoped to it, as hash links), `up`
  (the parent entry) and `enter` (the pending transition). The element also dispatches
  `meltemi-select`, `meltemi-navigate` and `meltemi-view` as composed, bubbling `CustomEvent`s for
  pages that use `<meltemi-player>` without the handle. *Alternative:* the catalog keeps its own
  handlers beside the player's (rejected: two hit-testing paths, no drill-down in the exported page).
- A drill-down that leaves the page: the player plays the camera phase, calls `onNavigate`, the
  catalog stores `pending = { fromKey, from: the view's data, element, transition, direction }` and
  calls `go(route)` to the child's own page (`#/diagram/<key>`, plus `?element=` for a `link`
  target); the new page's player mounts with `enter` and plays the morph from the parent's data into
  its root view; `render` keeps the heading focus for ordinary navigation and leaves focus in the
  player when `enter` plays. Back and Forward derive the direction from data (the previous entry has
  an element that opens the next one, or the inverse). Routes, `href` and `parseRoute` are
  unchanged; the transition is viewer state and never enters an address. *Alternative:*
  `?from=<entry>` in the route (rejected: leaks into every copied link, two addresses for one page).
  *Alternative:* drilling inside the mounted player without a route change (rejected: heading,
  tables, Download SVG and the address would describe another diagram).
- Catalog data version 2: `DiagramInput.c4 { level, scope, model: { file, id } }` and
  `CatalogInput.locale` filled by `buildCatalog`; `CatalogElement.opens` and `.stories`;
  `CatalogRelation.fromId`, `.toId`, `.stories`; `DiagramEntry.c4 { level, scope }` and `.parent`.
  Pages: the elements table's **Leads to** cell starts with "Opens <child view>", breadcrumbs of a
  diagram list its parent chain after the folder (cycle-cut), the entity page lists **Views scoped
  to it**, and a story's panel sections link the diagram of each view.

### Standalone export and the view closure

- `export --format html` of a diagram compiles the project (`workspace.compileProject()`, as
  `buildCatalog` does), resolves what every element opens with `drill.ts` (`childViews`,
  `openTargetOf`, `resolveLink` lifted from `catalog.ts`), lays out each reachable view once with
  its owner's theme scope (`viewClosure`, breadth-first with a visited set keyed `file#id`, excluded
  and erroneous views dropped with their targets) and builds one effects document whose `views`,
  `names`, `details` and `fontFaces` cover them all; the CLI's report line says how many views were
  bundled. No flag: HTML output always bundles the closure; `interactive="false"` is the hand edit
  for a plain picture. *Alternative:* the exported diagram only (rejected: the plus sign would appear
  nowhere in a standalone context page). *Alternative:* `--no-drill` or a profile option (rejected:
  a CLI, profile, model JSON, docs and diagnostics surface nobody asked for). Views nobody wrote are
  never synthesised: only existing `level`/`scope` views open.
- VS Code's **Export HTML Player** builds an `ExportRequest` and goes through `produceExport` like
  the SVG, PNG and PDF commands, so its page equals the CLI's; `effectsPlayerDocument(analysis, id)`
  and `storyPlayerDocument` stay as single-document builders for the acceptance tests and the canvas
  timeline. *Alternative:* a second closure inside `effectsPlayerDocument` (rejected: a
  `DocumentAnalysis` has no workspace; two builders to keep equal).

### Stories

- Story documents and story pages get hover cards, selection and the panel; no plus badge and no
  drill-down: the story keeps the author's camera and transitions, and bundling the closure of
  every scene's view would multiply story pages. In the catalog a story's panel sections link to the
  diagram of the element's view. *Alternative:* pause the story and drill in place (rejected: two
  timelines under one slider and scene picker).

### Options and switches

- One `interactive` option in `MountOptions` and one `interactive="false"` attribute on
  `<meltemi-player>` (true by default), as `controls` is; `framesPage` (video capture) and the
  catalog's thumbnails never mount interaction. No per-feature switches, no CLI flag, no profile
  option, no VS Code setting, no `catalog.interactive`. *Alternative:* `zoom`, `hover`, `details`,
  `open` options (rejected: combinations without sense, five surfaces each).

### Motion and finish

- Tokens on `:host` in the player's `STYLE`, the canvas's values under player names:
  `--meltemi-motion-fast: 120ms`, `--meltemi-motion: 160ms`, `--meltemi-motion-slow: 220ms`,
  `--meltemi-ease: cubic-bezier(0.2, 0.7, 0.3, 1)`, `--meltemi-ease-in: cubic-bezier(0.4, 0, 1, 1)`,
  `--meltemi-rise: 4px`, `--meltemi-slide: 12px`, `--meltemi-pop-scale: 0.98`, plus
  `--meltemi-accent` (set from the document), `--meltemi-focus` (existing). Custom properties
  inherit into the shadow root, so a page overrides them on the element; the catalog's `STYLE`
  declares the same names on `:root` for its own page-level motion.
- Zoom by key or button: `div.content` transitions `transform` over `--meltemi-motion` with
  `--meltemi-ease`; fit and actual size over `--meltemi-motion-slow`; wheel, pinch, drag and resize
  apply directly (`.direct`, no transition, `will-change: transform` only then). Cursor `grab` when
  pannable, `grabbing` while panning.
- Hover card: `@starting-style` opacity 0 and half a rise, over `--meltemi-motion-fast`; hides over
  `--meltemi-motion-fast` with `--meltemi-ease-in`; the 400 ms rest is a delay, not an animation.
  Hover ring over `--meltemi-motion-fast`; selection ring over `--meltemi-motion`; moving the
  selection fades the old ring out and the new one in (no morph between boxes).
- Panel: slides 12 px from the right (rises from below when stacked) with a fade over
  `--meltemi-motion-slow`; closes over `--meltemi-motion-fast` with `--meltemi-ease-in`; a body swap
  fades the new body in over `--meltemi-motion`.
- Drill-down: the user viewport returns to fit over `--meltemi-motion` and the badges fade out over
  `--meltemi-motion-fast`; the camera phase (320 ms) and the transition phase (480 ms) are eased
  through `--meltemi-ease`'s curve on the controller's clock; when it settles the child's badges pop
  in (opacity 0 → 1, `scale(0.98) → 1`) over `--meltemi-motion`, the new crumb slides in over
  `--meltemi-motion-slow`, the stage's aspect ratio animates over `--meltemi-motion-slow`, and the
  child's effects start. Up plays the reverse.
- Buttons: background and border colour over `--meltemi-motion-fast`. Control bar, trail, card and
  panel use system colours (`Canvas`, `CanvasText`, `GrayText`, `ButtonFace`, `ButtonBorder`,
  `Highlight`) with `color-scheme: light dark`; rings and badges use the theme accent; under
  `forced-colors: active` rings and badges use `Highlight`/`HighlightText`.
- `@media (prefers-reduced-motion: reduce)`: every duration 0 ms, rise, slide and pop scale neutral;
  the drill is a cut; the player keeps starting static without autoplay through the existing JS
  check. Screenshots of a zoomed drawing, a card, the panel (docked and stacked), a badge, a
  mid-drill frame and the trail, in light and dark, English and Spanish, are looked at before the
  work is called done.

### Accessibility

- The stage keeps `role="img"`, `tabindex="0"` and its name (title plus scene), suffixed with
  "Interactive drawing" when interactive; the SVG and the overlay are `aria-hidden`. Every control
  has a name, a key in its title and the shared focus ring. The live region announces selection,
  clearing, "Opened …", "Back in …", the focused item ("API, Container") and key or button zooms
  ("Zoom 150 %", "Whole drawing, 62 %"); wheel and drag announce nothing. The text summary gains an
  **Elements** list of buttons that select each element and say what it opens. The catalog's tables
  keep every link for keyboards and screen readers. Nothing depends on colour alone: rings are
  outlines, the badge is a glyph, states are announced.

## Packages and interfaces

- `@meltemi/diagrams-layout`: `./viewport` subpath (`Viewport`, `ZOOM_MIN`, `ZOOM_MAX`,
  `ZOOM_PRESETS`, `FIT_MARGIN`, `toScreen`, `toDiagram`, `zoomAt`, `zoomStep`, `fitBox`,
  `fitViewport`, `fitSelection` with `FitOptions`, `clampPan`, `canPan`, `viewBoxPlacement`,
  `keepOrigin`, `revealBox`, minimap helpers unchanged); root exports `c4TypeName`, `c4TypeLine`.
- `@meltemi/diagrams-model`: `childLevel(kind): C4Level | null`, `isChildView(view, model, entity)`.
- `@meltemi/diagrams-motion`: `DRILL_DURATIONS`, `DrillSpec`, `drillTimeline`, `drillFrame`,
  `transitionFor`, `boundsOf`, `frameBox`.
- `@meltemi/diagrams-editor`: `drill.ts` (`resolveLink`, `childViews`, `openTargetOf`,
  `viewClosure`, `ViewRef`, `ViewClosure`), `produceExport` html branch, `catalog.ts` (`DiagramInput.c4`,
  `CatalogInput.locale`), `canvas/geometry.ts` re-export.
- `@meltemi/diagrams-player`: `PLAYER_VERSION 2`, `EffectsViewData`, `ElementDetails`,
  `RelationDetails`, `ViewDetails`, `OpenTarget`, `DocumentOptions { fonts, locale, views, opens }`,
  `detailsOf`; `ViewerViewport`, `viewerCommandForKey`, `WHEEL_ZOOM`, `DRAG_THRESHOLD`,
  `PAN_FRACTION`; `ease`; `frameScene`, `frameSvg(data, t, { static, background, view })`,
  `drillSvg`; `PlayerController` gains `view`, `trail`, `drill`, `selection`, `focused`,
  `items(view)`, `canOpen(id)`, `open(id)`, `enter(spec, views)`, `up()`, `select(id)`, commands
  `zoomIn | zoomOut | zoomFit | zoomActual | previousItem | nextItem | select | up | escape |
  backSmall | forwardSmall`; `MountOptions { interactive, select, targets, onNavigate, sections,
  up, enter }`; `PlayerHandle { viewport, zoom, view, trail, selection, zoomTo, setZoom, fit,
  actualSize, panBy, project, select, showDetails, closeDetails, open, up }`; events
  `meltemi-select`, `meltemi-navigate`, `meltemi-view`; `ElementOptions.interactive`; messages
  groups `view`, `details`, `trail`, `open` and new `player` entries, en/es.
- `@meltemi/diagrams-catalog`: `CATALOG_VERSION 2`, `DiagramInput.c4`, `CatalogInput.locale`,
  `CatalogElement.opens`/`.stories`, `CatalogRelation.fromId`/`.toId`/`.stories`,
  `DiagramEntry.c4`/`.parent`; `views.ts` Opens cell, parent breadcrumbs, Views scoped to it;
  `runtime.ts` mount options, `pending`, `window.meltemiCatalog.{selection, trail, pending}`;
  messages `entry.opens`, `entities.views`, `nav.up`, en/es.
- Hosts: the CLI's export tests; VS Code's `exportPlayer` through `produceExport`; the playground's
  bundles rebuilt with no source change.

## Risks / Trade-offs

- [The exported page stops stretching a narrow drawing above actual size] → recorded in this design
  with the catalog and canvas precedent; `docs/player.md` says the drawing is fitted up to its actual
  size; screenshots reviewed; `1` and `+` are one key away.
- [Hover, selection and badges vanish when the SVG is replaced each frame] → all overlay geometry
  comes from `views[view].scene` keyed by `data-id`, redrawn after each draw; listeners sit on the
  stage; motion groups are `pointer-events: none`.
- [Viewer state leaking into exports] → zoom is a CSS transform on `div.content`, overlays are
  siblings of the picture, drill frames are drawn but never exported; browser tests assert
  `handle.svg === exported(t)` after zooming, hovering, selecting and opening, and the catalog test
  compares the downloaded SVG with `handle.svg`.
- [Plain-wheel panning catches page momentum until the drawing's edge] → only while the drawing
  overflows in that direction; never captured at fit; `0` restores.
- [A two-finger pinch at fit taken by the browser as a scroll] → `touch-action` switches to `none`
  the moment two pointers are captured; a CDP touch smoke test in the player suite.
- [`,`/`.` replace Shift+Left/Right for the 100 ms step] → the MODIFIED Controls requirement, both
  docs and the key test change together; a question for the owner.
- [Page growth: bundled closures in standalone pages, `details` beside `CatalogElement` in catalogs]
  → bounded by the project, one scene per view, descriptions are small next to geometry; the publish
  size check exists; the fixture catalog's size delta is recorded in decision 0047.
- [Bundle growth of `dist/player.js` (112,818 bytes) and `dist/catalog.js` (137,224 bytes)] → no
  third-party code; small DOM builders over `el()`/`icon()`; both sizes recorded in the decision.
- [Determinism of the closure and `opens`] → same-file views by source position, other files by
  `workspace.sources()`, stories by catalog order, a breadth-first visited set; unit tests build the
  document twice and compare JSON; `pnpm acceptance:determinism` keeps exporting HTML twice.
- [The camera box is not clamped to the sheet, so the page shows through at an edge box] → the same
  behaviour as today's story camera, kept on purpose; the stage's background is the theme's canvas.
- [Moving `geometry.ts` touches layout exports, the vitest alias and `fitBox`'s signature] →
  `editor/src/canvas/geometry.ts` re-exports, so no import path changes; `FitOptions` defaults equal
  today's values; typecheck across the player's three tsconfigs and the editor's tests catch drift.
- [Single click no longer navigates in the catalog] → both browser tests are rewritten (click →
  panel with a **Leads to** link; double click and badge → child page; Backspace → up) and the
  MODIFIED requirement says so; `?element=` becomes a selection.
- [Hover delays and an 800 ms drill on `ubuntu-latest`] → `waitFor` on the tooltip role and
  `waitForFunction` on `controller.view`/`controller.drill === null`, no fixed sleeps;
  reduced-motion variants assert the cut.
- [Another session's `delivery` change owns CHANGELOG 1.8.0, decision 0046, `playground/build.mjs`]
  → a `## 1.9.0` section above 1.8.0, decision 0047, no edit to `playground/build.mjs`; MODIFIED
  spec blocks rebased on current `openspec/specs` at archive time.

## Questions for the owner

Each default is applied; a different answer changes one decision.

1. Keys: Shift+Left/Right stop stepping 100 ms (the fine step moves to `,` and `.`) so that
   Shift+Arrows pan. If not, the player keeps every current key, gains `+ - 0 1` only, and keyboard
   users reach a zoomed region through Up/Down plus the reveal of the focused item.
2. The plus badge is a plain plus; it could carry the number of nested items it opens.
3. Standalone HTML exports now embed descriptions, technology and URLs of elements and relations
   (today labels only) and the reachable views; the catalog already embeds the same metadata.
