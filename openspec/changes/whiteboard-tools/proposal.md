## Why

The owner asked on 2026-10-28 for drawing tools in the free mode, "algo como Miro": a canvas where
a kanban, a free drawing or an explanation for a class can be made as quickly as a slide, with the
sheet still being code. Free compositions are close to it and stop short in four places.

- **Nothing is freehand.** The free kinds are `box`, `text`, `icon`, `image`, `note`, `line` and
  `group` (`packages/model/src/schema.ts:80-88`; `FREE_DECLARATIONS`,
  `packages/model/src/flow.ts:2212-2241`). A `line` holds its points in its statement
  (`declareLine`, `flow.ts:801-869`) and is routed as a connector (`polyline` by default,
  `packages/layout/src/layout.ts:1859-1940`), with a handle at every bend
  (`packages/canvas/src/app.ts:2778-2818`), so a hand-drawn arrow would be a line with forty bends
  and forty handles. The only freehand gesture on the canvas is the Pointer's trail, points `{ x,
  y, t }` on a 2D canvas that fade in 800 ms and reach no file (`packages/canvas/src/trail.ts:9-19`,
  decision 0059); the stage draws no stroke on the overlay and the canvas writes no points but a
  line's, rounded to integers (`packages/edit/src/lines.ts:17`).
- **Nothing wraps.** A free text and a note draw one `TextItem` per `\n` (`splitLines`,
  `packages/layout/src/text.ts:23-25`), a box grows until its label fits and a `size` too narrow is
  `layout.text-overflow` (`docs/language/free.md:105-110`): there is no card that keeps its size
  and fits the words to it, which is what a sticky is. Rejected once as "a sticky shape of a box"
  (`openspec/changes/archive/2026-10-24-pointer-and-notes/design.md:252-256`), because a shape is
  geometry and a sticky is a behaviour.
- **Nothing flows.** Every child of a group has a `place`; `layout assisted` and `auto` hand the
  rest to ELK (`docs/language/free.md:483-491`), and "stacks" are a rule of the overlap check, not
  syntax (`stacked`, `packages/layout/src/checks.ts:61-80`; decision 0043). A kanban column is a
  list: cards in order, one under the other, the column growing with them, a card dropped between
  two others taking their place. Reparenting exists (`moveElement`, `packages/edit/src/plan.ts`;
  the drop writes a `place` in the new interior, `openspec/specs/free-editor-tools/spec.md:48-66`),
  ordering exists only as z-order (`reorderElement`, bring to front and send to back), and nothing
  inserts a declaration at a position.
- **A whiteboard warns.** Without `canvas`, `preset document` reports `layout.too-large` past
  1,200 px and `preset slide` past 1,920 × 1,080 (`openspec/specs/canvas-presets/spec.md:32-38`;
  `canvasSize`, `packages/layout/src/layout.ts:2852-2899`), while the stage itself is unbounded
  (pan never clamped, `app.ts:5135-5148`, `5862-5865`; zoom 0.1 to 8,
  `packages/layout/src/viewport.ts:36-42`). An explanation that grows as it is drawn needs a
  preset that does not complain.

The base is ready for it. The canvas already has a drag state machine with ghosts and live
previews (`Drag`, `app.ts:161-256`; `drawLineGhost`, `:2826-2876`; `previewAction`,
`:2950-3097`), palette split buttons with kept choices (`shape`, `arrowKind`, `groupKind`,
`app.ts:569-573`; `PersistedState`, `:114-129`), a presence layer that draws other people's
strokes at their own pace (`presence-layer.ts:88-115`; `takeLasers`, `app.ts:2266-2294`) and a
room that relays them in the same 250 ms message (`canvas.laser`,
`packages/cloud/src/room-awareness.ts:36-38`, decision 0050), interior coordinates for everything
in a group (`LayoutResult.origins`), effects that run along any scene group with a `track`
(`packages/motion/src/plan.ts:119-123`), stories on a deterministic clock with a `trace` that draws
a connector from its start (`packages/motion/src/story.ts`), sketch themes with the hand font
(decision 0058), and live sessions where guests edit (decision 0050). What is missing is one
object for strokes, one for cards, one arrangement for lists, a preset for boards, and the tools
and templates that make them a whiteboard. Post-1.0 change, outside the roadmap
(`docs/roadmap-1.0.md`); it builds on `free-profile` (decision 0018),
`containers-shapes-and-corners` (0043), `lines-and-text-alignment` (0058), `pointer-and-notes`
(0059) and `live-sessions` (0050), and records decision 0064.

## What Changes

- **Pens: freehand strokes in the language.** `pen <id> [(x, y), (x, y), …] [{ … }]` joins the
  free kinds: a stroke through its points, in its group's interior coordinates as a line's are, at
  least one point, decimals kept, no label, no `place`, `size` or `rotation`. It takes `stroke`
  (the theme's `ink` by default), `width` (1 to 64, 3 by default), `line`, `opacity`,
  `arrowhead` and `arrowtail`, refuses a box's properties, and `rule pen { }` styles every
  stroke. The layout draws it as one path through the midpoints of consecutive points (quadratic
  curves, round caps and joins; one point is a dot), with a `track` and `bounds`, painted on its
  layer in source order like a line, outside every composition check, left alone by the sketch
  passes, and animated by `flow`, `dash`, `pulse` and `trace` as a line is. The formatter prints a
  pen's list filled to 100 columns, not one tuple per line, so a stroke of forty points is six
  lines. Model JSON carries `pen: { points }` after `line`.
- **Stickies: cards whose text fits them.** `sticky <id> "Text" [{ … }]` joins the free kinds: a
  160 × 160 card (scaled with `labelSize`, or its `size`) that never grows: its text wraps at the
  inner width, shrinks from 1.2 × the label size down to 8 px to fit, and is `layout.text-overflow`
  when it still does not; a soft shadow, the theme's new `sticky` fill and `stickyText` colour,
  `radius` 2; `fill`, `stroke`, `color`, the text properties, `rotation`, `opacity`, an icon;
  `shape` refused. It is a relation endpoint with ports, a story target and an outlined element
  for `dash` and `pulse`, as a box is.
- **Lists: groups that arrange their children.** A group block takes `layout column` or
  `layout row`, `spacing <n>` and `align start|center|end|stretch`: children in source order
  along the axis, each at the sum of the previous sizes plus the spacing, across the axis at the
  start, centred, at the end or stretched; a written `size` is the least size and the group grows
  with its children; a `place` on a child is `layout.place-ignored` (warning); lines and pens
  inside keep their points; the engine treats a list as a leaf in every mode. A row of columns is
  a kanban board. Model JSON carries `list: { layout, spacing, align }` on groups.
- **`opacity`, `preset board` and three tokens.** `opacity` (0 to 1) is a free-only style
  property of elements, groups, lines and pens; `width` grows to 0 to 64 on every target (the
  highlighter needs 20); `preset board` sizes the canvas from its content with no
  `layout.too-large`, and the `document` warning's hint names it; themes gain `highlight`,
  `sticky` and `stickyText`, set in every built-in theme and shown in the theme panel's new
  "Whiteboard" group.
- **A story action `draw`.** `draw a, b [over <time>]` replays pens, lines and named relations
  from their first point to their last, one after another in proportion to their lengths, and
  leaves them drawn; a target whose first visibility action is `draw` starts hidden. An
  explanation drawn on the whiteboard becomes a story, an animated SVG and a video.
- **Pen, highlighter and eraser on the canvas.** P, H and E (the pen button is a split button
  whose menu holds Pen, Highlighter, three widths and the strip's colour row; the choices are kept
  with the canvas's state). The tools stay armed after each stroke. A stroke is drawn on the
  overlay at every frame as the layout will draw it, Shift keeps it straight, Escape cancels; the
  release simplifies the raw points (Ramer–Douglas–Peucker at 0.75 screen pixels), rounds them to a
  tenth and writes `pen` inside the group under the first point, with `style` only for what
  differs from the defaults (the highlighter writes `stroke highlight; width 20; opacity 0.35`);
  nothing is selected, the status line says the point count, each stroke is one undo step. A
  stylus draws with palm rejection and erases with its barrel button. The eraser deletes every pen
  its circle crosses in one undo step and nothing else. A selected pen shows its bounds with
  resize handles that scale its points, moves by its stroke, and takes the strip's stroke, width,
  opacity, line and heads. Read-only canvases refuse the three; story mode hides them.
- **Strokes seen while they are drawn.** The pen's points ride in the `canvas.laser` batches with
  a `pen: { width, colour, opacity }` part; the room validates it; a peer's page draws the batches
  as one growing stroke in that colour, not a fading trail, until the document changes after the
  last batch or ten seconds pass. A class watches the teacher's hand; the file gets the stroke at
  the release.
- **Sticky tool and lists on the canvas.** S creates a sticky with its editor open, which wraps as
  the card will; the button's arrow picks the theme's colour or six fixed ones, written as `fill`.
  The group menu gains Column and Row. Dragging elements over a list shows an insertion bar and the
  live preview makes room; the drop moves the declaration to that index and removes its `place`
  (`moveElement { index }`); dragging within a list reorders, dragging out writes a `place`. A
  hovered or selected list shows a **+** at its end that adds a sticky (column) or a column (row);
  Ctrl+Enter adds after the selection and Alt+Up and Alt+Down move a child among its siblings. The inspector
  shows Layout, Spacing and Align; resizing a list writes its least size.
- **Two templates and the pictures.** `kanban` (a row of three columns of stickies under
  `preset board`) and `whiteboard` (`sketch.light`, `preset board`, a heading, stickies, a pen
  arrow, a highlighter stroke, a line and a story that draws them), in `init --list`, the
  playground's cards (seven) and `templates.json`; a gallery sheet `free/whiteboard`; corpus
  sheets for pens, stickies and lists with their snapshots; acceptance and visual references.
- **Language services, docs, skill.** Completion, hover and quick fixes for the new statements
  (`layout.place-ignored` removes the place; `layout.too-large` on a document offers
  `preset board`); the language reference (free, grammar, layout, styles, motion, stories,
  model-json, diagnostics), the editor, playground and cloud guides in English and Spanish, the
  skill's description and `reference/free.md` (synced to the agents' folders and `assist:guide`),
  the i18n glossary (pen → lápiz, highlighter → marcador, eraser → borrador, sticky → nota
  adhesiva, stroke → trazo, whiteboard → pizarra, board → tablero), the changelog's next section
  (1.11.0, since 1.10.0 is dated 2026-10-28 in the release in progress) and decision 0064.

## Non-goals

- Importing freehand strokes, stickies or boards from Miro, Excalidraw, tldraw or draw.io: the
  proposal's 1.0 exclusion of universal import.
- Recording a drawing session as a story, or replaying the room's history: `draw` replays what
  is written; a recorder is its own change if the owner wants one.
- Pressure-sensitive width, brushes, textures or an SVG filter look for strokes: one width per
  pen, as decision 0058 kept one `sketch` per theme.
- Comments, votes, timers, reactions, cards with fields (assignee, due date) or any widget that is
  not a diagram object: the sheet stays code that `validate` and `export` understand.
- The spacing of sequence participants (`sequence-spacing-and-nested-calls`), unbranded exports
  (`unbranded-exports`), the inspector's fold and tooltips (`inspector-collapse-and-tooltips`)
  and the agents' prompt (`agent-setup-prompt`), which touch the same toolbar, inspector and docs:
  this change is applied after `inspector-collapse-and-tooltips` and names its tooltips as that
  change does.
- The delivery change owns the pipelines and the 1.11.0 release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `free-diagram-model`: ADDED "Pen strokes", "Stickies", "List groups" and "Opacity"; MODIFIED
  "Free diagrams compile" (the kinds `pen` and `sticky`, the group properties, the hint).
- `free-layout`: ADDED "Pen strokes are drawn", "Stickies are drawn" and "List groups arrange
  their children".
- `canvas-presets`: MODIFIED "Preset and canvas properties" and "Canvas sizing" (`board`).
- `style-classes-and-rules`: MODIFIED "Width, pattern and arrowhead properties" (`width` 0 to 64,
  heads on lines and pens in rules); `flow-diagram-model`: MODIFIED "Style and animate blocks"
  (the same range).
- `theme-tokens`: ADDED "Whiteboard tokens".
- `motion-effects`: MODIFIED "Effect targets" (pens).
- `story-language`: MODIFIED "Scenes and actions" (`draw`); `story-timeline`: ADDED "Draw frames".
- `model-json-interchange`: ADDED "Whiteboard objects in JSON".
- `source-editing`: ADDED "Pen operations", "Stickies and list groups in edits" and "Moving a
  declaration to a position".
- `source-formatting`: ADDED "Pen statements".
- `free-editor-tools`: ADDED "Pen, highlighter and eraser", "Sticky tool", "Lists on the canvas"
  and "Language services for whiteboard statements"; MODIFIED "Free palette and pickers".
- `diagram-canvas`: ADDED "Editing a pen stroke" and "Strokes of others".
- `live-collaboration`: ADDED "Strokes being drawn in presence".
- `project-templates`: MODIFIED "Templates" (seven, `kanban` and `whiteboard`);
  `project-explorer`: MODIFIED "New project from cards" (seven cards).

## Impact

- `packages/language`: `src/format.ts` (the filled list of a `pen` statement); `test/format.test.ts`.
- `packages/model`: `src/schema.ts` (`FREE_ELEMENT_KINDS` with `pen` and `sticky`, `ALL_ELEMENT_KINDS`
  and `RULE_KINDS`, `STYLE_PROPERTIES.opacity`, `width` to 64, the group properties `layout`,
  `spacing`, `align`, `PRESETS` with `board`, `THEME_TOKENS` with `highlight`, `sticky`,
  `stickyText`, `STORY_ACTIONS` with `draw`), `src/types.ts` (`Element.pen`, `Element.list`),
  `src/flow.ts` (`declarePen`, `declareSticky`, the group block, the refusals, `animationTargetFits`),
  `src/style-values.ts` (`addRule` exempting `line` and `pen` from the relation-only refusal),
  `src/story.ts` (`draw` targets), `src/json.ts`, `src/diff.ts` (pen points compared as places
  are), `src/messages/en.ts` and `es.ts`; tests `free.test.ts`, `flow.test.ts`, `themes.test.ts`,
  `story.test.ts`, `json.test.ts`, `corpus.test.ts`.
- `packages/layout`: `src/layout.ts` (`emitter.pen`, the sticky drawer with wrapping and the
  shrink, the list arrangement, `canvasSize` for `board`, `layout.place-ignored`), `src/text.ts`
  (word wrapping), `src/theme.ts` (the three tokens in eight themes), `src/checks.ts` (pens
  excluded), `src/free.ts` (paint order), `src/messages/*`; tests `free.test.ts`, `themes.test.ts`.
- `packages/render`: `src/svg.ts` (`opacity` on groups, the pen path) and `src/sketch.ts`
  (pens untouched); `test/svg.test.ts`.
- `packages/motion`: `src/story.ts` and `src/plan.ts` (`draw` frames, the dash channel for the
  replay), `src/css.ts` (the animated SVG); `test/motion.test.ts`, `test/story.test.ts`.
- `packages/edit`: `src/types.ts` (`createPen`, `setPenPoints`, `createElement` with `sticky`,
  `fill` and `layout`, `setElementProperty` with the list properties, `moveElement.index`),
  `src/pens.ts` (new), `src/create.ts`, `src/free.ts`, `src/plan.ts`, `src/text.ts` (a tenth);
  tests `free.test.ts`, `operations.test.ts`.
- `packages/editor`: `src/canvas/protocol.ts` (`ElementInfo.pen`, `ElementInfo.list`, the actions
  `createPen`, `setPenPoints`, `move` with `index`, `create` with `fill` and `layout`, the
  `presence` message's `pen` part, `PersistedState` of the pen and sticky choices), `src/session.ts`
  (the actions, interior points, the drop index, the `+` creations), `src/canvas/keyboard.ts` (P,
  H, E, S, Ctrl+Enter, Alt+Up and Alt+Down on free), `src/inspector.ts` (the pen strip, the sticky strip
  with the six colours, the list fields), `src/services/completion.ts`, `hover.ts`,
  `actions.ts` (the quick fixes), `src/messages/*`; tests `canvas.test.ts`, `free.test.ts`, `strip.test.ts`,
  `services.test.ts`.
- `packages/canvas`: `src/app.ts` (the `penDraw` and `erase` drags, the overlay path, the pen and
  sticky split buttons and menus, the eraser cursor, the insertion bar and the `+` buttons, the pen
  selection frame and scaling, palm rejection and the barrel button, `presenceLaser` with `pen`),
  `src/presence.ts` and `presence-layer.ts` (peer strokes that stay), `src/glyphs.ts` and `dom.ts`
  (the pen, highlighter, eraser, sticky, column and row glyphs), `src/inspector.ts` (the opacity
  slider, the colour rows), `canvas.css`, `src/messages/en.ts` and `es.ts`, `src/view-only.ts`
  (the new actions in the exhaustive table); tests `messages.test.ts`, `view-only.test.ts`,
  `presence.test.ts`.
- `packages/playground`: `src/cloud/presence.ts`, `presence-wire.ts`, `presence-model.ts`,
  `presence-mount.ts` (the `pen` part), `src/templates.ts` and the explorer's cards (seven),
  `src/messages/*`; `build.mjs` (thumbnails of two more templates); tests `cloud-presence*.test.ts`,
  `messages.test.ts`, `test/browser/run.ts`.
- `packages/cloud`: `src/room-awareness.ts` (`pen` parsed and bounded); `test/room-awareness.test.ts`,
  `test/browser/scenarios-live.ts`.
- `packages/project` and `packages/cli`: `src/templates.ts` (`kanban`, `whiteboard`),
  `templates/kanban/diagrams/board.meltemi` and `templates/whiteboard/diagrams/whiteboard.meltemi`
  (with its story), `src/messages/*` (the titles and descriptions), `test/init.test.ts`.
- `packages/assist`: `src/guide.ts` regenerated from the skill's references.
- `packages/vscode`: `syntaxes/meltemi.tmLanguage.json` (`pen`, `sticky`, `draw`, `board`),
  `test/webview/run.ts` (the whiteboard scenarios and screenshots).
- `packages/acceptance`: `src/gallery.ts` (`free/whiteboard`), `test/gallery.test.ts`,
  `test/corpus.test.ts` (the new free sheets), the visual references re-recorded.
- `corpus/valid/free/{pens,stickies,lists,whiteboard}.meltemi` with snapshots,
  `corpus/invalid/{prop.invalid-value-pen,layout.place-ignored}.meltemi`,
  `corpus/acceptance/free/{whiteboard,kanban}.meltemi`, `gallery/free/whiteboard.meltemi`.
- `docs/language/{free,grammar-0.2,layout,styles,motion,stories,model-json,diagnostics}.md`,
  `docs/{editor,playground,cloud}.md` and their Spanish copies; `skills/meltemi-diagrams/SKILL.md`
  and `reference/free.md` (synced); `packages/i18n/README.md`; `CHANGELOG.md`;
  `docs/decisions/0064-whiteboard-tools.md`.
