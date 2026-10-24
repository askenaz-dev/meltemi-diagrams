## Context

**The canvas and its tools.** `CanvasApp` (`packages/canvas/src/app.ts`) is shared by the VS Code
webview and the playground. Its armed tool is `private tool: ElementKind | "relation" | undefined`
(`app.ts:403`); `arm()` (`4993-5012`) refuses every tool on a read-only canvas, toggles the same
tool off, clears `relationFrom` and `armedIcon`, toggles the stage's `placing` class (cursor
`crosshair`, `canvas.css:402-405`), calls `syncToggles()` (`3426-3446`, which sets `aria-pressed`
on the `[data-tool]` buttons from `this.tool` and on the toggles from the persisted booleans) and
announces `placeWords`. `pointerDown` (`3648-3700`) handles a pan first (middle button, or button 0
with Space), then a story click, the relation tool, an armed icon, an armed creation tool (which
creates and disarms) and finally hits and handles; `pointerMove` (`3841-3850`) calls `drawOverlay`
when a tool is armed and `hoverBorder` (`4341`) otherwise; `dblclick` (`4458`) opens the label
editor and the `contextmenu` listener (`3542-3550`) opens the menu; `wheel` (`4510-4525`) zooms with
Ctrl or Cmd and pans otherwise, whatever the tool. `keyDown` (`4527-4550`) handles the menu, refuses
undo and redo when read-only, Space, then `commandFor(e, mac, profile)`; `command()`
(`4563-4572`) announces `readOnly.refused` for every command outside `VIEW_COMMANDS`
(`packages/canvas/src/view-only.ts:8-30`); `applyReadOnly` (`1668-1706`) drops the armed tool, the
inline editor, the menus and the pickers. The `clearSelection` command (`4581-4586`) cancels a
drag, else disarms a tool, else clears the selection. The toolbar is built at `2785-2990`: the
palette from `PALETTE` (`256-280`; `note` on O for `flow` only, hidden per profile through
`data-profile` in `syncProfile` at `3479-3485`), the relation split, the sequence buttons (the
sequence note on O at `2850-2852`), `addEntity`, then the zoom controls and the view toggles made
by `toggle()` (`2722`; Layers at `2973-2976` keyed `L` in `syncToggles`, Libraries at `2977-2983`
with the key `U`). Toolbar elements tagged `data-write` are hidden on read-only canvases
(`2992-3050`, `canvas.css:1549-1562`); `data-drawing` ones without a diagram. The keyboard map
(`packages/editor/src/canvas/keyboard.ts:116-184`) binds no plain `k`; `o` is `createNote` on
`flow` (`154`) and `createSequenceNote` on `sequence` (`167`); `CanvasCommand` is a closed union
(`4-78`) whose descriptions live in `packages/editor/src/messages/keys.ts` for `en` and `es`.

**Presence.** The canvas reads other people from the host's `presence` message
(`app.ts:721-727`; `readPeople` in `packages/canvas/src/presence.ts:151-175` bounds 50 people, 1000
ids, 200-character names, pointers within `MAX_POINTER` = 1 000 000 at `132`), draws them on the
`PresenceLayer` (`packages/canvas/src/presence-layer.ts:40-55`: a `div.presence` with
`aria-hidden`, an SVG of outlines and a `div.presence-cursors`; `drawCursors` at `89-114` keeps a
cursor per key `${colour}|${name}|${nth}` from `cursorMarks` at `presence.ts:197-210` and toggles
`gliding` only when the scene point moved), never hit-tested (`canvas.css:596-600`), gliding over
`--mdg-cursor-glide` 200 ms (`653-655`), both dropped under reduced motion (`695-703`). The canvas
posts `presencePointer` at most every `POINTER_EVERY_MS` = 50 ms (`app.ts:96`, `2004-2034`), only
once the host has sent `presence` (`sharesPointer`, `393-400`); `post()` drops messages for which
`writesDocument` is true when read-only (`774-783`). The playground's host intercepts
`presencePointer` before the Studio (`packages/playground/src/canvas-host.ts:71-77`,
`requests.pointer`), `presence-mount.ts:81-88` wires it to `Presence.pointer()`
(`packages/playground/src/cloud/presence.ts:181-200`), whose state leaves at most every
`THROTTLE_MS` = 250 ms (`41`) and again every 15 s as a heartbeat (`43`); `inputs()` (`207-213`)
keys the state for change detection and `state()` (`216-240`) includes `canvas` only when ids are
selected or a pointer is set. The wire format (`presence-wire.ts:8-20`) is
`{ "<client id>": { file?, caret?, canvas?: { selection, pointer?: { x, y, diagram? } } } }`;
`readState` (`199-211`) reads only `selection` and `pointer` of `canvas`. The Worker's
`parseAwareness` (`packages/cloud/src/room-awareness.ts:117-178`) reads `file`, `caret`,
`canvas.selection` and `canvas.pointer`, treats a `canvas` part with neither as invalid (`175`),
rounds coordinates (`181-188`) and bounds the diagram id; `fitRecord` (`242-259`) keeps only the
colour, file, caret and last-seen in the attachment; `AWARENESS_MESSAGE_BYTES` is 16 KiB and the
rate 20 dropped and 100 closed per second (`24-32`). The page knows its own `sub` (signed in,
`packages/playground/src/cloud/session.ts:15`) and a guest's id (`guest.ts:3-5`), from which
`presenceColour` derives the colour the room gives them (`presence-model.ts:105`). The VS Code
extension never sends `presence` (`packages/vscode/src`, no sender), and the player package has no
presence code. The render carries `colors: { selection, guide }` (`packages/editor/src/canvas/protocol.ts:270-276`),
each falling back to the theme's `accent`. Canvas motion tokens are `--mdg-motion-fast` 120 ms,
`--mdg-motion` 160 ms, `--mdg-motion-slow` 220 ms and `--mdg-ease` (`canvas.css:14-29`), zeroed
under reduced motion (`35-44`); the canvas reads `matchMedia("(prefers-reduced-motion: reduce)")`
for the effects' default (`app.ts:2756`).

**Notes.** `FlowElementKind` holds `note`; `FreeElementKind` is `box | text | icon | image | group`
(`packages/model/src/types.ts:26-28`); `FREE_ELEMENT_KINDS` (`schema.ts:80`) feeds
`FREE_PROFILE.elementKinds` and `ruleKinds`, `diagramStatements()` (`760-765`) and the hints
`FREE_DECLARATIONS` (`flow.ts:1996`, `messages/en.ts:538-540`); `otherProfileKind()`
(`flow.ts:580-590`) turns `note` in a free diagram into `prop.unknown`. `declare()` (`594-700`)
reads `[idArg, labelArg, ...extra]` and reports `valueAfter` for anything after the label
(`690-694`). `Element` (`types.ts:140-183`) has no attachment field; `ReferenceRole` (`351`) and
`EntityReferenceRole` (`691`) list the roles renames rewrite (`packages/edit/src/plan.ts:864-881`,
`packages/edit/src/c4.ts:336-357`). The C4 profile declares no element kinds (`schema.ts:629-630`)
and `C4Analyzer.run()` (`c4.ts:481-531`) reports `prop.unknown` with the words `c4.viewDeclares` for a shorthand and
`c4.unknownInView` for any keyword outside `level`, `scope`, `include`, `exclude`, `label`, the
diagram properties and the blocks; `buildElements` (`672-710`) makes an element with `entity` per
drawn entity; `c4Drawing` (`packages/layout/src/layout.ts:315-330`) rewrites descriptions through
`c4TypeLine`, which returns null for an element without an entity (`288-300`). `Layout.note`
(`4260-4300`) draws the outline only when `fill`, `stroke` or `pattern` is styled, the text in
`scale.note` at weight 400 start-anchored in `style.color ?? theme.muted`, an icon before the first
line; `defaultSize` (`3503-3513`) gives `noteLine × lines + 4`; `element()` (`3880-3900`)
dispatches by kind for every profile; `arrangeRequest` (`2095`) builds the engine's edges from
`diagram.relations` only (`2138-2150`); `ArrangeEdge` (`packages/layout/src/engine.ts:45-57`) is
`{ id, source, target, sourcePort, targetPort, primary, label }`; the scene has `PolylineItem`
with `dashed: StrokeDash = boolean | "dotted"` (`packages/layout/src/scene.ts:9`, `58-64`); the
motion plan takes "the first line or outline drawn in a group" as the dash's target
(`packages/motion/src/plan.ts:89`). `NO_OUTLINE_KINDS` (`flow.ts:96-100`) refuses a dash on a note
by kind (`1953-1955`, `dashWithoutOutline` at `messages/en.ts:243`), and the editor's `effectsFor`
(`packages/editor/src/effects.ts:21-42`) offers only `pulse` for those kinds. `createElement`
(`packages/edit/src/create.ts:95-135`) refuses a kind outside `profile.elementKinds` and writes
`${kind} ${id} ${quoteString(label)}` through `declarationText` (`71-90`); `removeElement`
(`plan.ts:924-1060`) collects dependents of fourteen kinds (`types.ts:711-725`) with partial edits
for list statements; `excludeEntity` (`c4.ts:209-242`) removes the view statements that only
target the entity through `viewDependents` (`139-170`), and `removeEntity` (`364-420`) lists view
list entries, labels, placement, styles and combinations. Convert to free maps `note → text`
(`free.ts:343-350`) with the class `from_note` (`478-490`) from the `noteSize` metric
(`packages/editor/src/arrange.ts:311-331`). Model JSON writes each element's keys in a fixed order,
`shape` then `entity` (`packages/model/src/json.ts:697-730`). The canvas creates through the
`create` action (`protocol.ts:697-720`) and the session (`packages/editor/src/session.ts:1576-1627`)
derives the id and the parent; `QUIET_KINDS` (`app.ts:139`, read at `730-739`) excludes `note`, so a new note
opens its editor; the icon drag's drop onto a shape (`takesIcon`, `stackAt` at `1927`, `giveIcon` at
`1062`) is the pattern for dropping a tool on an element. The inspector draws `enum` fields as a
`<select>` (`packages/canvas/src/inspector.ts:145-156`) and the editor's fields write through
`setElementProperty` (`packages/editor/src/inspector.ts:1306-1316`). The TextMate grammar already
colours `note` as `storage.type.element` (`packages/vscode/syntaxes/meltemi.tmLanguage.json:76-77`)
and knows no `on`; the parser's generic statement grammar accepts any identifiers after a string
(`packages/language/src/parser.ts:799-840`, decision 0003), so `note n "Text" on api` parses today.

## Goals / Non-Goals

**Goals:**

- A pointer that points and never edits, on every canvas that shows a diagram, read-only ones
  included, with a trail that looks like Excalidraw's and costs no request in a room.
- Notes in free compositions and C4 views with the flow note's drawing, and a note that can be
  attached to what it annotates, drawn with a leader and arranged beside its element.
- Everything that names an element follows the attachment: renames, deletes, excludes, removes,
  copies, conversion, JSON, completion, hover, the grammar's colours and the docs.

**Non-Goals:**

- A presentation mode, a spotlight or a follow-the-presenter view.
- Changing how the player, the HTML views or the catalog draw anything: the trail never reaches
  them, and a note in a C4 view is drawn there as a flow note is today.
- Notes in sequence diagrams, which have their own `note [<id>] over|left of|right of` events.
- A higher-rate presence channel (decision 0050's rejection stands).

## Decisions

### The pointer is a toggle of its own, not a value of `tool`

`CanvasApp` gains `private pointing = false`, a toolbar toggle `pointer` (`toggle("pointer", …)`
with the key K in its title, placed before the grid toggle, tagged `data-drawing` and never
`data-write`) and the command `togglePointer` (`CanvasCommand`, `keys.ts` in both languages,
`bind({ key: "k", command: "togglePointer" })` on every profile, and a member of
`VIEW_COMMANDS`). `setPointing(on)` arms no tool: it calls `arm(undefined)`, commits the inline
editor, closes the menu and the pickers, toggles `.stage.pointing`, writes `aria-pressed` through
`syncToggles` and announces `announcements.pointerOn` / `pointerOff`; `arm(tool)` with a tool sets
`pointing` false first, so the two never hold together. `clearSelection` (Escape) cancels a drag,
else puts the pointer away, else disarms a tool, else clears the selection. `applyReadOnly` leaves
`pointing` as it is, since it writes nothing; `setStoryMode(true)` turns it off (a story's frames
are not the scene). The state is not persisted: a pointer is a moment's tool, and a canvas that
reopened pointing would surprise. Alternatives: a value `"pointer"` of `this.tool` (every path that
reads `this.tool` for creation, `pointerDown` at `3683-3688`, `paletteDrag`, `syncProfile` at
`3496-3504`, `applyReadOnly` at `1683` and `arm()`'s read-only refusal at `4995`, would need a
special case, and a read-only canvas would need `arm()` opened); a persisted toggle like Layers
(rejected above). Recommendation: the separate boolean.

### What the canvas does while pointing

`pointerDown` handles the pan branch as today, then, when `pointing`, starts a `laser` drag (a new
`Drag` kind holding nothing but the pointer id), adds the first point and returns before story
clicks, tools, hits and handles; `pointerMove` with a `laser` drag adds a point and returns;
`pointerUp` ends the drag; `pointerMove` without a drag returns before `hoverBorder` while
pointing, so no connection handle or border outline appears; `doubleClick` and the `contextmenu`
listener return while pointing, and the `contextMenu` command is ignored, so no editor and no
menu opens (Escape or K first, then the menu). `wheel` is untouched (zoom with Ctrl or Cmd, pan
otherwise) and Space with a drag pans as today, since the pan branch runs before the laser one.
Keys other than K, Escape, Space and the zoom keys still run their commands; the ones that edit
need a selection, which the pointer never makes, and `selectAll` is allowed (it writes nothing).
The cursor is `cursor: url("data:image/svg+xml,…") 8 8, crosshair` set on the stage by
`setPointing`, a 16 px SVG disc in the trail's colour with a white ring, so the browser moves the
dot at the pointer's native rate; it is rebuilt when the colour changes. Alternatives: `cursor:
none` with a dot drawn at the trail's head (the dot would lag a frame and vanish when the
pointer leaves the stage); a plain `crosshair` (not what the owner asked for). Recommendation: the
SVG cursor.

### The trail: a 2D canvas on the presence layer, points in diagram units

New module `packages/canvas/src/trail.ts`: `TRAIL_FADE_MS` = 800, `TRAIL_WIDTH` = 3,
`TRAIL_MIN_WIDTH` = 1, `TRAIL_MAX_POINTS` = 256, `TrailPoint { x, y, t }` (diagram units, `t` from
`performance.now()`), `class Trail { add(point, now); prune(now); readonly points; readonly
colour }` (a point closer than 0.5 diagram units to the last one is not added; the oldest points go
past `TRAIL_MAX_POINTS`), and `trailSegments(points, now, fade = TRAIL_FADE_MS): { from, to,
opacity, width }[]`, a pure function the tests pin: each point lives `fade` ms from its own `t`, a
segment's opacity is `1 − age / fade` of its older point and its width tapers from `TRAIL_WIDTH` at
the head to `TRAIL_MIN_WIDTH` at the tail over the last 16 points. `PresenceLayer` gains a
`<canvas class="presence-trails" aria-hidden="true">` after the outlines and before the cursors,
sized to the stage times `devicePixelRatio` on `ResizeObserver`, and `drawTrails(trails:
readonly { points, colour }[], toScreen, now)` which clears and strokes every segment with round
caps and joins; `CanvasApp` keeps the person's own `Trail` and one per peer key, runs a
`requestAnimationFrame` loop only while any trail has live points, and converts each point with
`screenOf`, so a pan or a zoom during a stroke keeps the trail on the diagram. The trail's colour is
the `me.colour` of the last `presence` message when the host shares presence, else the render's
`colors.accent` (the render's canvas colours gain `accent`, the theme's token). Under
`prefers-reduced-motion: reduce` (`matchMedia`, read once per stroke) points do not age: the trail
is the stroke drawn so far and is cleared when the pointer lifts, and a peer's batch is drawn once
and cleared with its next batch or after 250 ms. Alternatives: SVG `<path>` items with a CSS
transition per point (hundreds of elements a second); points in screen pixels (the trail would stay
on the screen while the diagram panned under it); one shared `<canvas>` for cursors too (the
cursors' CSS glide is already right). Recommendation: the 2D canvas with diagram-unit points.

### The trail in a room: `canvas.laser` in the same presence message

The canvas posts a new `CanvasMessage` `presenceLaser { points: { x, y, t }[], diagram? }` with the
points added since the last post, `t` in milliseconds since the batch's first point, at most every
`POINTER_EVERY_MS` (its own `laserNext` queue on the same timer as `presencePointer`), only to a
host that shares presence and never as a write (`writesDocument` false). The playground's
`canvas-host.ts` intercepts it as it does the pointer (`requests.laser`, `shell.onCanvasLaser`),
`presence-mount.ts` wires it to `Presence.laser(batch)`, which appends to a pending batch (the
most recent `MAX_LASER_POINTS` = 64 kept, `t` rebased to the pending batch's first point, bounded
by `MAX_LASER_MS` = 1000) and calls `moved()`; `inputs()` includes a laser sequence number, so a
batch counts as a change; `state()` includes `canvas.laser: { diagram?, points }` when a batch is
pending, so a `canvas` part may hold a laser alone; `publish()` clears the batch, and a heartbeat
never resends one. `presence-wire.ts` writes and reads `canvas.laser` with the same bounds (a
batch that does not fit is dropped, the rest of the state read); `presence-model.ts` stores on each
peer `laser: { seq, diagram?, points }` where `seq` is the page's own count of batches received
from that peer; `canvasPeople` passes `laser: { batch: seq, points }` to the canvas when the batch's
diagram is the one shown. `PresencePerson` gains `laser?: { batch: number; points: readonly
{ x, y, t }[] }` and the `presence` message gains `me?: { colour: string }` (the person's own
presence colour, `presenceColour(sub)` or of the guest id); `readPeople` bounds the batch (64
points, `t` integers 0..1000, coordinates within `MAX_POINTER`, `batch` a finite integer); the
canvas keeps the last `batch` per cursor key and appends a new batch's points at `now + t` to that
peer's `Trail`, so a batch replays at its own pace, within the next 250 ms for a batch the page
made, in the person's colour. The Worker's `parseAwareness` reads `canvas.laser` as an
`AwarenessLaser { diagram?, points }` with the same bounds (`MAX_LASER_POINTS`, `MAX_LASER_MS`),
a batch over the bounds or a point of the wrong shape making the whole message invalid (dropped and
counted, as every bad part is), a `canvas` part holding a selection, a pointer, a laser or any of
them, and `fitRecord` never keeps it. 64 points at four batches a second is under 2 KiB a second,
far inside 16 KiB per message and 20 messages a second. Alternatives: sending only "pointer on" and
drawing a trail from the 4 Hz pointer (a trail of four points a second is a chain of jumps);
a channel of its own at a higher rate (rejected in decision 0050); points in screen pixels (peers
have other zooms). Recommendation: the batch in the same message.

### No presentation mode

The owner finds it low value; the existing toggles hide the inspector, the layers and the
libraries, and `panel-and-effects-polish` owns collapsing the code pane. The pointer tool is the
whole of it. Alternative: a "Present" button that hides the panels and arms the pointer (two
features welded together, one of them unwanted). Recommendation: none.

### `note` joins the free kinds, and C4 views accept it

`FreeElementKind` gains `note`, `FREE_ELEMENT_KINDS` gains it before `group` (so
`FREE_PROFILE.elementKinds`, `ruleKinds`, `diagramStatements()` and the completion follow),
`FREE_DECLARATIONS` and the hints `freeDeclarations` (en and es) name it, `otherProfileKind()`
no longer reports it in free diagrams, and `flowDeclarations(keyword)` keeps listing the flow
kinds (a `decision` in a free diagram still says it belongs to flow). `C4_PROFILE.elementKinds`
becomes `["note"]` ("views declare notes, never entities"), `C4Analyzer.run()` gains a branch for
the keyword `note` that collects the statements and, after `buildElements`, declares each through
the flow analyzer's note path (factored as `declareNote(stmt)`) with `entity: null`, `groupPath:
[]`, and a block that accepts `class` and `url` (`C4_PROFILE.elementProperties` gains them for
notes only; `description`, `layer` and `link` stay `prop.unknown` in views); a shorthand or an
entity kind in a view is refused as today; `include`, `exclude`, `label` and relation statements
naming a note are `ref.unknown-entity` as they are for any non-entity; `c4Drawing` leaves elements
without an entity alone, which `c4TypeLine` already does. `createElement` refuses on a C4 view
every kind but `note` with the reason naming `createEntity` and `includeEntity`, as today. In free
diagrams the note takes `fill`, `stroke`, `pattern`, `line`, `width`, `color`, `radius`, `icon`,
`iconColor`, `rotation`, `layer`, `link`, `url`, `description`, `class` and the free text
properties `fontSize` (default the theme's `noteSize`), `fontWeight` (default 400) and `textAlign`
(default `left`); `shape` stays `prop.invalid-value` naming `node` and `box`; in flow diagrams the
text properties stay refused. `Layout.note` reads `fontSize`, `fontWeight` and `textAlign` from the
resolved style when the profile accepts them, measuring and anchoring the lines as `freeText` does,
and keeps the flow drawing otherwise. Alternatives: notes as a sticky shape of a box
(`shape note`: no annotation semantics, no attachment, a label audit that would count it, and
`node` has no place in free diagrams); free notes without attachment (half the request); notes in
C4 views as entities of a `note` kind in the model (a note is one view's remark, and the model is
shared). Recommendation: the kind in free and the one declaration in views.

### The attachment: `on <element>`

`note <id> "Text" on <element>` is read in `declare()` as the one word that may follow the string:
`extra[0]` an identifier (or a qualified ref in C4 views) after the word `on`, anything else still
`valueAfter`. `Element` gains `attachedTo: string | null` and `attachedToRange: Range | null`;
`ReferenceRole` gains `attachment` (the flow analyzer records a reference to the target, so
`renameElement`'s token walk at `plan.ts:868-872` rewrites it) and `EntityReferenceRole` gains
`attachment` (so `renameEntity` and the project-wide rename rewrite it). The target must be an
element of the diagram other than the note: an unknown id is `ref.unknown-element` with the
diagram's ids as candidates (a path the model has but the view does not draw gets the "not drawn"
hint of `label`), the note itself is `prop.invalid-value`, and the target may be of any kind, a
group or another note included. In flow and free diagrams the target may be inside a group the note
is not in. Keyword alternatives: `for` (the export statement's word, coloured top-level by the
grammar at `tmLanguage.json:72-73`), `of` (a sequence word, `note left of`), `at` and `to` (placement
words), `about` (reads as prose, not as a reference), a block property `{ attach api }` (longer, and
the shorthand is what people type). Recommendation: `on`, a word nothing in the grammar uses, which
reads as "a note on api"; it joins the `keyword.other.placement` rule of the TextMate grammar.

### The leader and the engine edge

`Layout.note` appends, as the last item of the note's group (so the motion plan's "first line or
outline" is still the outline rect), a `PolylineItem` with class `leader` from the point where the
segment between the two boxes' centres leaves the note's box to where it enters the target's box
(the existing border intersection of connectors, the turned outline for a turned target), stroked
`theme.muted` at `theme.strokeWidth`, `dashed: "dotted"`; nothing is drawn when the boxes overlap or
the target is not drawn. The leader is part of the note's group with `role: "element"`, so a click
on it selects the note and the presence and hit paths need no change; it is never a relation: not in
`diagram.relations`, Connect to…, the JSON's relations, the relation counts or the routes. In
`layout auto`, and for a note without `place` in `layout assisted`, `arrangeRequest` adds an
`ArrangeEdge { id: "\u0002attach\u0002<note>", source: <element>, target: <note>, sourcePort:
null, targetPort: null, primary: false, label: null }` (the element first, so the note follows it
in the flow's direction, as a dashed relation would), and the arrangement's route for that id is
discarded; in `layout manual` and for a placed note nothing moves and the leader is drawn straight.
The composition checks treat the leader as nothing (it crosses whatever lies between, as a leader
does), and the label audit keeps excluding notes. Alternatives: the leader as a synthetic relation
of the diagram (it would appear in every list that keys on relations: Connect to…, counts, routes,
exports, JSON); a route for the leader from the engine (an orthogonal leader looks like a relation,
and the straight segment is what draw.io and Excalidraw draw). Recommendation: the polyline in
the note's group and the edge for the engine only.

### Edit operations and dependents

`createElement` gains `attachedTo?: string` (written after the string as `on <id>`; refused with
`edit.unsafe-target` when the target is not an element of the diagram, `edit.invalid-value` when
the kind is not `note`); a new operation `attachNote { diagram, note, element: string | null }`
writes, replaces or removes the `on` clause with a minimal edit of the declaration (an unknown note
or element is `edit.unsafe-target`, a non-note `edit.invalid-value`, the note itself
`edit.invalid-value`). `DependentKind` gains `attachment`: `removeElement` lists every note
attached to a removed element (description "note `<id>` is attached to it, line N" in both
languages) and, cascading, strips ` on <id>` from the note's declaration and keeps the note;
`excludeEntity` does the same for the notes of the view attached to the entity (through
`viewDependents`), and `removeEntity` for the notes of every view of the file attached to a
removed path (the project's other files are checked by `planSteps` as today, so a view elsewhere
that would break refuses the plan). `renameElement` and `renameEntity` rewrite the attachment
token through the references. Paste and Duplicate copy a note as a note and keep `on` only when
its target is copied with it or, in a C4 view, is drawn in the view; otherwise the copy has no
attachment. The canvas's `create` action gains `attachedTo?`, the session passes it through, and a
new action `attachNote { note, element: string | null }` serves the inspector's field.
Alternatives: deleting the attached notes with their element (a note's text is the person's words,
not a dependent statement; the dialog would hide that loss); refusing the delete while notes are
attached (the dialog already explains cascades). Recommendation: the partial edit that keeps the
note.

### Notes on the canvas: O, drop to attach, the inspector

`PALETTE`'s `note` entry gets `profile: "flow free c4"`, `keyboard.ts` binds `o` to `createNote`
on `free` and `c4` too (sequence keeps `createSequenceNote`, and the sequence note button keeps its
title's O: the palette button is hidden there by `data-profile`), `QUIET_KINDS` still excludes
notes, so a new note opens its label editor. A drop of the note tool (`paletteDrag`) or a click
with it armed on an element of the diagram (the topmost of `stackAt`, groups included) creates the
note at the element's east edge plus the theme's `groupPadding`, aligned to its top, with
`attachedTo` set, and the status line says "Created a note attached to `api`"; while the tool is
armed or dragged over an element, the element shows the drop outline the icon drag draws (the
guide colour). A click or drop on empty canvas creates an unattached note as today. The inspector
of a note gains **Attached to** after the label: an `enum` field `attachedTo` whose options are the
ids of the diagram's other elements (the drawn entity paths on a C4 view), with the empty option
for none, written through `attachNote`. On a C4 view the inspector of a note shows the note's own
fields (label, Attached to, Style, Effects, class and url) and none of the entity's. Alternatives: a
connection-handle gesture from the note to its element (the handles mean relations); a context-menu
entry "Attach to…" (one more list; the inspector's field already lists the elements).
Recommendation: the drop, the click and the field.

### Convert to free keeps notes

`CONVERTED.note` becomes `note`; the copy writes `note <id> "Text" [on <element>]` with the same
`place`, `size`, `layer` and `link <source>.<id>`; `kindDefaults` drops the note entry, so
`from_note` is never written, and `convertToFree.metrics` loses `noteSize` (`convertOperation`
stops computing it). `corpus/valid/free/converted.meltemi` gains a note attached to `api` in its
flow diagram and its free copy, so the snapshot covers both. Alternative: keep `from_note` for the
text properties (a note draws them as its defaults already). Recommendation: no class.

### Dash on an outlined note or text

The model exports `outlined(diagram, element): boolean`: true when the element's `style` entries,
the classes its declaration applies or a `rule <kind>` of the diagram set `fill`, `stroke` or
`pattern`. `animationTargetFits` uses it for `note` and `text` instead of their kind alone
(`icon`, `image` and the stick figures keep the refusal by kind), with the reason
`dashNeedsOutline(target, kind)` ("`n1` is a note without an outline; give it a `fill` or a
`stroke`, or use a pulse") in both languages; `effectsFor` in the editor calls the same predicate,
so the strip and the Effects section offer the dash to an outlined note or text. A theme's rule
that outlines notes is not seen by the model (the analyzer resolves no theme), so a dash there is
still refused, with the hint to write the outline on the note; `docs/language/motion.md` says so.
Alternatives: accept the dash on every note and let the layout draw nothing (an effect that does
nothing silently); resolve the theme in the model (the model never reads themes, by design).
Recommendation: the diagram-level predicate.

### Model JSON and interchange

`ElementJson` gains `attachedTo: string | null` between `shape` and `entity` on every element of
every profile (null when none), as the free precedent added `layer`, `link`, `source` and `shape`;
`version` stays `0.1`, since no existing field changes; `docs/language/model-json.md` gains the row;
every `.model.json` snapshot under `corpus/`, `examples/` and the import corpora regenerates, and
the diff is read before `--update`. Alternative: the key only on notes (the fixed key order is a
promise of the format). Recommendation: on every element.

### Language services, grammar and docs

Completion offers `note` among the statements of free diagrams and C4 views (from
`profile.elementKinds`), the word `on` after a note's closing quote, and the diagram's element ids
(entity paths in a view) after `on `; hover on the target shows the element's hover; definition on
it goes to the declaration (or the model's entity in a view); the `ref.unknown-element` quick fix
offers the close ids it already offers for placement targets; `keywordDoc("on")` documents the
word; the formatter needs no change (the generic statement printer keeps the args), and a test pins
`note n "T" on api` through `formatDocument`. The TextMate grammar adds `on` to the placement
words. The docs: `free.md` (the kinds table gains the note row, the refusal sentence loses `note`,
the conversion table's note row becomes "note → note, no class"), `grammar-0.2.md` (the note row
gains `[on <element>]`, the annotations sentence names the leader), `c4.md` (a "Notes in views"
section), `motion.md` (the dash row and the sentence after the table), `diagnostics.md`
(`animate.invalid-target` wording, `ref.unknown-element` on an attachment), `model-json.md`,
`docs/editor.md` (the Pointer tool with K, the keyboard table rows for K and for O on free and C4,
Attached to, the delete dialog), `docs/playground.md` (trails under Pointers), `docs/cloud.md` (the
awareness format with `canvas.laser` and its bounds), each with its Spanish copy; the skill
references `free.md` (line 19's refusal, the table, the conversion sentence), `language.md` (the
note row with `on`, the pulse and dash targets) and `c4.md` (notes in views), then
`pnpm skills:sync`.

## Motion

- **The trail.** Each segment's opacity falls linearly over 800 ms from its own point's moment and
  the width tapers from 3 px to 1 px over the last 16 points, drawn with round caps and joins at
  `devicePixelRatio`; the frame loop runs only while a point is alive, and stops within one frame
  after the last one dies. A peer's batch appears point by point over its own duration, never all
  at once, so a trail from a room reads as the same motion as a local one.
- **The cursor.** The dot cursor replaces the arrow the moment the tool turns on; the toggle's
  button transitions its colours over `--mdg-motion-fast` with `--mdg-ease`, as every toolbar
  toggle does, and its pressed state is the same as Layers'.
- **The status line** announces the tool on and off, in the live region as every announcement.
- **Drop to attach.** The element under a dragged or armed note tool shows the drop outline the
  icon drag draws, fading in over `--mdg-motion` and out over `--mdg-motion-fast`; the new note
  appears selected with its label editor, whose outline fades in as today.
- **The leader** is part of the drawing: it moves with the note during a live preview of a drag,
  since the preview redraws the scene, and a recomputed arrangement eases nothing more than any
  other box moving under Arrange.
- **Reduced motion.** `prefers-reduced-motion: reduce` turns the fade off (the stroke stays whole
  until the pointer lifts, then goes at once), the button and the outline transitions are zero as
  the canvas tokens make them, and the leader is static anyway.

## Risks / Trade-offs

- [The pointer tool's early returns miss a handler and a press edits something] → the webview
  suite presses, drags, double-clicks and right-clicks on an element, a handle, a relation's label
  and the empty canvas while pointing and asserts the document, the selection, the inline editor
  and the menu unchanged; `view-only.test.ts` keeps `togglePointer` among the view commands.
- [The MODIFIED block of "Free diagrams compile" collides with `lines-and-text-alignment`, which
  extends the same list of declarations with `line`] → each change's block adds only its own kind,
  and whichever change archives second rebases that block on the then-current main spec before
  `openspec archive` (task 9.5); every other block of this change is ADDED, except "Convert a flow
  diagram to free" and "Views compile against a model", which no sibling touches.
- [K reaches the stage while a person types in the inline editor or the picker's search] → the
  key handler is the stage's; the inline editor and the search field are their own elements and
  keep their letters, as I does today; a scenario types `k` in the inline editor and asserts the
  text.
- [A peer's batch replays late or forever] → `t` is bounded to 0..1000 in the page and the Worker,
  the batch to 64 points, and a batch is appended once per `batch` number; a hostile batch is
  dropped whole.
- [`canvas.laser` changes the Worker's rule that a canvas part needs a selection or a pointer] →
  the rule becomes "a selection, a pointer, a laser or any of them"; `room-awareness.test.ts` pins
  a laser alone, a laser with a selection, an oversized batch and a bad point.
- [Adding `note` to the free kinds leaves a contradictory word somewhere] → the ripple is listed
  in the tasks (`types.ts`, `schema.ts`, `flow.ts` hints, model messages en and es, `create.ts`,
  the completion, the docs, the skill references) and the messages and skills tests fail on a copy
  left behind.
- [Every `.model.json` snapshot changes for one key] → the free precedent did the same; the diffs
  are read before `--update`, and the JSON test asserts the key's order and null value on a node.
- [A leader under the motion plan's "first line or outline" rule] → the leader is the group's last
  item, and `motion.test.ts` asserts that a dash on an outlined note animates its rect.
- [Convert to free's snapshot and the free corpus are touched by `lines-and-text-alignment` at the
  same time] → the two changes regenerate the same files; whichever applies second regenerates
  again from its own text, and `converted.meltemi`'s note is this change's only addition there.
- [C4 notes meet code that assumes an entity on every C4 element] → `c4TypeName` already returns
  null for `entity: null`; the inspector's C4 fields, the catalog's hover cards and the drill-down
  are checked by tests with a note in the commerce views, and the design gives a note the note's
  fields only.
- [A theme rule outlines notes and the dash is still refused] → the hint names the outline to
  write on the note; `motion.md` says the model reads the diagram's own statements.
- [A hidden layer holds the attached element while the note is on a shown one] → the leader is
  part of the note's group and is drawn to where the element would be; the layers panel's hide is a
  canvas-only view, as for a relation whose end is hidden today.
