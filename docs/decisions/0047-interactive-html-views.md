# 0047. Interactive HTML views: zoom, hover cards, details and drill-down

Status: accepted (interactive-html-views change, 20 October 2026)

## Context

With IcePanel in mind, the owner asked for HTML diagrams that explain themselves: rest the pointer
on a box and see what it is, click it for the whole story, zoom in and out, and open what a box
holds with a double click or a plus sign drawn on it when it has nested items. The exported player
(decision 0024) drew a fixed picture that reacted only to `url` links, and the catalog (decision 0027) jumped on a single click to a linked diagram or an entity page, with no transition and no way
to read a box without leaving it. Everything the viewer needed existed already: `description`,
`technology` and `url`, `link` between diagrams, `level` and `scope` on C4 views (decision 0020),
and the story machinery that draws any instant deterministically (decision 0023). The frame at an
instant had to stay byte-identical everywhere.

## Decision

- **The viewer lives around the frame.** User zoom and pan are a CSS transform on a persistent
  content layer of the player's stage; selection rings, hover rings, relation hit tracks and plus
  badges are an overlay drawn from the scene's data in scene units. The renderer's SVG string,
  `PlayerHandle.svg`, **Download SVG** and every export stay what they were; the browser suites
  compare them after zooming, hovering, selecting and opening.
- **One viewport, shared.** The canvas's viewport math moved to `@meltemi/diagrams-layout/viewport`
  (the canvas re-exports it) and gained `clampPan`, `canPan`, `viewBoxPlacement` and fit options.
  The player fits the whole drawing at most at actual size; Ctrl or Cmd and the wheel zoom around
  the pointer; a plain wheel pans only a drawing larger than its window and is the page's
  otherwise; drags pan, pinches zoom, `+ - 0 1` and Shift with an arrow work from the keyboard. The
  100 ms step moved from Shift with an arrow to `,` and `.`.
- **Click selects, double click opens.** A click opens a non-modal panel with the element's type,
  technology, description, link and relations, plus what the host adds; Up and Down walk the items,
  Enter opens the panel, Escape closes. A click on a `url` element selects it; Ctrl or Cmd follows
  the link. A double click, the plus badge or Enter on a selected element opens what it opens.
- **What opens is resolved once, when the page is built.** `packages/editor/src/drill.ts` gives a
  system the container view scoped to it, a container its component view (`childLevel`,
  `isChildView` in the model), and an element with a `link` the diagram it names; candidates come
  from the drawing's own file first, then the project's files in order. The plus badge shows
  exactly where something opens.
- **The transition is the story machinery.** `drillFrame` plays a camera move to the box (320 ms)
  and then a morph, or a cross-fade when ids differ (480 ms), carrying the camera into the change
  of view; the way up is the way down played backwards. Frames stay linear and pure; the player
  eases each phase on its clock, and reduced motion cuts.
- **Documents carry what cards say.** Player documents are at version 2: effects documents hold a
  `views` map like stories, and every view has `details` (type words in the content language,
  technology, description, url, what each element opens, C4 level and scope, parent). A diagram's
  HTML page bundles every view a drill-down reaches across the project; VS Code writes it through
  the same `produceExport`. The catalog data is at version 2 with what elements open, the stories
  that show each element and relation, relation end ids, and each entry's level, scope and parent.
- **The catalog routes, the player interacts.** The catalog no longer handles clicks: it gives the
  player its targets, panel sections and parent pages, changes the address when a drill leaves
  the page, and the next page's player plays the morph in from the view it came from. Back and
  Forward play the same moves. The published page is the catalog build and gets it all.

## Alternatives considered

- **Rewriting the `viewBox` for zoom**: re-applied on every frame and every wheel tick, impossible
  to animate in CSS, and a step away from leaking viewer state into downloads.
- **Native SVG `<title>`s for tooltips**: free in a raw `.svg`, but a refresh of every SVG snapshot
  and a second, plain tooltip over the cards in the player; left to its own change
  (`svg-element-titles`).
- **Resolving what opens in the page**: `link` resolution goes through imports and needs the
  compiler; one resolver at build time serves the export, VS Code and the catalog alike.
- **A camera that persists across a story's change of view**: it would change the frames of
  existing stories; the drill frame carries its own camera instead.
- **Semantic zoom and group folding**: drawing more detail as the scale grows, or folding a group
  into one box, are changes of their own (`semantic-zoom`, `group-folding`); the proposal prefers
  splitting dense diagrams into views, which drill-down now joins.

## Consequences

- Pages of diagrams grow by one scene per bundled view; the catalog grows by the per-element
  details. The runtime grew with the viewer: the player bundle from 112,818 to 161,304 bytes and
  the catalog's from 137,224 to 214,523 bytes (minified, against the 1.8.0 builds of 14 October).
- The canvas keeps its own interaction (a double click edits a label there); hover cards and
  drill-down on the canvas would be the change `canvas-hover-cards`.
- Stories keep their camera and transitions: their elements get cards and the panel, not badges.
