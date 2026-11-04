## Why

Two requests of the owner on 2026-10-23 are not met by what the canvas has. The first is the
professional touch of explaining a diagram in a meeting: a pointer that points and never edits, as
Excalidraw's laser does in its presentation mode, without the mode itself, which the owner finds of
little value. Today the canvas has no such tool: every press selects, moves or creates
(`packages/canvas/src/app.ts:3648-3700`), the only cursors are `grab` and `crosshair`
(`packages/canvas/canvas.css:397-405`), the plain letters `k`, `e`, `h`, `j`, `q`, `w`, `y` and `z`
are free on every profile (`packages/editor/src/canvas/keyboard.ts:116-184`), and a read-only
canvas refuses every tool (`arm()` at `app.ts:4993-4995`, `VIEW_COMMANDS` in
`packages/canvas/src/view-only.ts:8-30`). In a room, other people's pointers are already drawn as
cursors that glide over 200 ms from the position published four times a second
(`packages/canvas/src/presence-layer.ts:89-114`, `canvas.css:645-655`,
`packages/playground/src/cloud/presence.ts:41`), so a trail only needs its points to ride in the
same message; decision 0050 (`docs/decisions/0050-live-sessions.md:43-46`, `58-60`) rejected a
channel of its own because of the day's request budget, and that rejection stands. The second
request is notes everywhere: `note <id> "Text"` is a flow annotation
(`docs/language/grammar-0.2.md:134`, `152-154`) drawn by `Layout.note`
(`packages/layout/src/layout.ts:4260-4300`: an outline only when `fill`, `stroke` or `pattern` is
styled, left-aligned muted text at the note size, an icon before the first line), but
`FreeElementKind` has no `note` (`packages/model/src/types.ts:28`), free compositions refuse it with
`prop.unknown` (`packages/model/src/flow.ts:580-590`, `docs/language/free.md:54-55`), C4 views
refuse every declaration (`packages/model/src/c4.ts:495-528`, `C4_PROFILE.elementKinds` empty at
`packages/model/src/schema.ts:629-630`), Convert to free turns notes into texts with the class
`from_note` (`packages/edit/src/free.ts:343-350`, `478-490`), and a note cannot be attached to
what it annotates: the model has no field for it (`types.ts:140-183`), the engine's edges come
from `diagram.relations` alone (`layout.ts:2138-2150`), and deleting an element knows fourteen
dependent kinds, none of them a note (`packages/edit/src/types.ts:711-725`). This change adds the
pointer tool, its trail in rooms, and notes with an optional attachment in every profile the flow
pipeline draws. Post-1.0 change, outside the roadmap (`docs/roadmap-1.0.md`); it builds on
`live-collaboration`, `live-sessions`, `free-profile`, `c4-entities-and-routes`,
`c4-relations-and-effects`, `canvas-feel-and-naming` and `agent-skill-install`.

## What Changes

- **A Pointer tool.** A toolbar toggle beside the view toggles and the key K (K or Escape puts it
  away; a toggle like Layers). While it is on the canvas selects, moves, creates, edits and opens
  nothing: a press and drag draws a trail 3 px wide with round caps and joins that tapers over its
  last points and fades over about 800 ms from each point's own moment, in the theme's `accent`
  locally and in the person's presence colour while a host shares presence; the cursor is a dot;
  wheel zoom and Space-drag pan keep working; the status line announces the tool; the trail lives
  on the presence layer, so it is never in the SVG, never exported and never in the HTML views.
  The tool works on read-only canvases, since nothing is written. Under
  `prefers-reduced-motion: reduce` the trail is the stroke drawn so far and goes at once when the
  pointer lifts, instead of fading.
- **Pointer trails in rooms.** In a cloud project or a live session the trail's points go in the
  same presence message at the same 250 ms throttle as the caret, the selection and the pointer:
  `canvas.laser`, a bounded batch of points `{ x, y, t }` (`t` in milliseconds since the batch's
  first point, integers, at most 64 points, coordinates within the room's pointer bound). The
  Worker validates the shape, drops a message whose batch does not fit and never keeps it; peers
  replay each batch over the next 250 ms in the person's colour, keyed as their cursor is. No new
  channel. The canvas posts the points to a host that shares presence through a new
  `presenceLaser` message, which the playground's page accumulates between publishes; in VS Code,
  which shares no presence, the trail stays local.
- **Notes in free compositions.** `note <id> "Text"` joins the free kinds (`box`, `text`, `icon`,
  `image`, `note`, `group`): the flow note's drawing, with `fill`, `stroke`, `pattern`, `line`,
  `width`, `color`, `radius`, `icon`, `iconColor`, `rotation`, `layer`, `link` and the free text
  properties `fontSize`, `fontWeight` and `textAlign`; `place` and `size`, layers and z-order, the
  pulse effect, and the dash when the note has an outline. `shape` stays refused on notes.
- **Notes in C4 views.** `note <id> "Text"` is the one declaration a view accepts: a view-local
  annotation, never written to the model, drawn by the flow pipeline as an element without an
  entity, with `class` and `url` in its block, styles and effects as any element of the view, and
  the same attachment, to an entity path the view draws.
- **An attachment.** `note <id> "Text" on <element>` draws a thin dotted leader in the theme's
  `muted` colour from the note's border to its element's; in `layout auto`, and for an unplaced note
  in `layout assisted`, the leader is an edge for the engine, so the note is arranged beside its
  element; in `layout manual` and for a placed note nothing moves. The model records
  `attachedTo`; an unknown target is `ref.unknown-element`; the note itself is `prop.invalid-value`.
  Model JSON writes `attachedTo` on every element. Renaming the element rewrites the attachment;
  deleting the element lists the attachment as a dependent and, cascading, strips `on <element>`
  and keeps the note; excluding an entity from a view and removing an entity from a model do the
  same for the notes attached to it.
- **Notes on the canvas.** The note tool and the key O on the free and C4 palettes, as on flow
  (sequence keeps O for its own note); dropping the note tool on an element, or clicking an element
  with the tool armed, creates the note beside it and attaches it, with the drop outline of the icon
  drag; the inspector shows **Attached to**, a picker of the diagram's elements (the drawn entity
  paths on a C4 view), which writes or removes the attachment; the delete dialog lists attached
  notes among the dependents, and confirming keeps the notes without their leaders.
- **Convert to free keeps notes.** A flow note is copied as `note <id> "Text" [on <element>]` with
  its place, size, layer and link; the class `from_note` and the `noteSize` metric disappear.
- **Dash on an outlined note.** `animate <note> { effect dash }` is accepted when the note has a
  `fill`, `stroke` or `pattern` from its style, a class or a `rule note` of the diagram, in every
  profile, and refused with `animate.invalid-target` otherwise, with a hint naming the outline to
  write; the same rule applies to free texts, which draw their frame the same way. The inspector's
  Effects section offers the dash to an outlined note or text.
- **Language services.** Completion offers `note` in free diagrams and C4 views, `on` after a
  note's text and the diagram's elements after `on`; hover and go to definition on the target reach
  the element; the quick fix for an unknown target offers close ids; the formatter keeps `on`; the
  TextMate grammar colours `on`.
- **Documentation.** `docs/language/free.md`, `grammar-0.2.md`, `c4.md`, `motion.md`,
  `diagnostics.md`, `model-json.md`, `docs/editor.md`, `docs/playground.md` and `docs/cloud.md` with
  their Spanish copies under `docs/es/`; the skill references `free.md`, `c4.md` and `language.md`
  with `pnpm skills:sync`; the changelog's 1.10.0 section; decision 0059.

## Non-goals

- The code pane's collapse, which with the toolbar's toggles gives the clean stage a presentation
  mode would, and the style strip's effect cards belong to `panel-and-effects-polish`.
- The relation tool's kinds, free lines and text alignment belong to `lines-and-text-alignment`.
- The delivery change owns the pipelines, the deployment of the Worker and the release of what
  this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diagram-canvas`: ADDED "Pointer tool" (the toggle, K, the trail, the cursor, read-only
  canvases, reduced motion) and "Pointer trails of others" (the `presence` message's `laser`
  batches and the person's own colour).
- `live-collaboration`: ADDED "Pointer trails in presence" (`canvas.laser` in the same state at the
  same throttle, replayed in the person's colour).
- `cloud-document`: ADDED "Pointer trails relayed by the room" (the Worker's bounds on
  `canvas.laser`, never kept).
- `flow-diagram-model`: ADDED "Note attachments" (`on <element>` in flow and free diagrams, the
  model's `attachedTo`, the diagnostics).
- `free-diagram-model`: MODIFIED "Free diagrams compile" (`note` among the declarations and out
  of the refused flow kinds; `lines-and-text-alignment` extends the same list with `line`, so
  whichever archives second rebases the block) and ADDED "Notes in free compositions" (the kind,
  its properties, the refusals that stay).
- `free-layout`: ADDED "Notes in free compositions are drawn" (the drawing, layers and order).
- `layout-constraints`: ADDED "Attached notes" (the leader, the engine edge, the modes).
- `c4-views`: MODIFIED "Views compile against a model" (`note` declarations among what a view
  accepts) and ADDED "Notes in views" (the declaration a view accepts, the attachment to an entity
  path, what a note is not).
- `c4-editing`: ADDED "Note operations in views" (`createElement` of a note, `attachNote`,
  `excludeEntity` and `removeEntity` stripping attachments, renames).
- `c4-editor-tools`: ADDED "Notes on the C4 canvas" (O, drop to attach, the inspector, delete).
- `free-editor-tools`: ADDED "Note tool on the free palette", "Attached notes on the canvas" and
  "Language services for notes".
- `source-editing`: ADDED "Note attachment operations" (`createElement` with `attachedTo`,
  `attachNote`, the `attachment` dependent of `removeElement`, `renameElement`).
- `view-conversion`: MODIFIED "Convert a flow diagram to free" (notes stay notes, no `from_note`,
  the metrics lose the note size).
- `model-json-interchange`: ADDED "Note attachments in JSON" (`attachedTo` after `shape` on
  every element, version 0.1 kept).
- `motion-effects`: ADDED "Effects on notes" (pulse on every note, dash on an outlined note or
  text, the diagnostic otherwise).

## Impact

- `packages/canvas`: `src/app.ts` (the Pointer toggle and `pointing` state, the laser drag, the
  early returns of the pointer handlers, `presenceLaser` posting, replaying peers' batches, the dot
  cursor, the O key on free and C4, drop to attach, the `attachedTo` field), new `src/trail.ts`
  (points, fading, segments), `src/presence-layer.ts` (the trails canvas), `src/presence.ts`
  (`laser` batches and the person's own colour read from the message), `src/view-only.ts`
  (`togglePointer` in `VIEW_COMMANDS`), `canvas.css` (`.stage.pointing`, the trails canvas, reduced
  motion), `src/messages/en.ts` and `es.ts`; tests `test/trail.test.ts`, `test/presence.test.ts`,
  `test/view-only.test.ts`, `test/messages.test.ts`.
- `packages/editor`: `src/canvas/keyboard.ts` (`togglePointer` on K, `createNote` on free and
  C4), `src/canvas/protocol.ts` (`presenceLaser`, `PresencePerson.laser`, the `presence` message's
  `me`, the render's `accent`, `create.attachedTo`, the `attachNote` action), `src/messages/keys.ts`,
  `src/session.ts` (the create action's attachment, the attach action), `src/inspector.ts` (the
  Attached to field, C4 notes without entity fields), `src/effects.ts` (dash on an outlined note),
  `src/arrange.ts` (`convertOperation` without `noteSize`), `src/services/completion.ts`,
  `hover.ts`, `navigation.ts`, `docs.ts`, `src/messages/services.ts`; tests under `test/`.
- `packages/model`: `src/types.ts` (`FreeElementKind`, `Element.attachedTo`, the reference roles),
  `src/schema.ts` (`FREE_ELEMENT_KINDS`, `C4_PROFILE.elementKinds`), `src/flow.ts` (the `on`
  clause, the outline-aware dash check, the hints), `src/c4.ts` (the note branch), `src/json.ts`
  (`attachedTo`), `src/messages/en.ts` and `es.ts`; tests `test/free.test.ts`, `test/c4.test.ts`,
  `test/flow.test.ts`, `test/json.test.ts`.
- `packages/layout`: `src/layout.ts` (the leader, the engine edge, free notes' text properties),
  `src/engine.ts` (no interface change; the edge id's prefix documented); `test/free.test.ts`,
  `test/layout.test.ts`, `test/c4.test.ts`; snapshots under `corpus/valid/free`,
  `corpus/valid/c4`, `corpus/valid/edge` and every `.model.json` under `corpus/`, `examples/` and
  the import corpora.
- `packages/edit`: `src/create.ts` (`attachedTo`, notes on C4 views), `src/plan.ts`
  (`attachNote`, the `attachment` dependent), `src/c4.ts` (`excludeEntity` and `removeEntity`
  stripping attachments), `src/free.ts` (notes stay notes), `src/types.ts`, `src/messages/en.ts`
  and `es.ts`; tests `test/operations.test.ts`, `test/plan.test.ts`, `test/c4.test.ts`,
  `test/free.test.ts`.
- `packages/playground`: `src/canvas-host.ts` (`presenceLaser` intercepted), `src/shell.ts`
  (`onCanvasLaser`), `src/cloud/presence.ts` (the pending batch), `presence-wire.ts`
  (`canvas.laser` read and written), `presence-model.ts` (batches per peer), `presence-mount.ts`
  (the person's own colour, the batches to the canvas); tests `test/cloud-presence*.test.ts`,
  `test/browser/run.ts` (the pointer tool in the playground).
- `packages/cloud`: `src/room-awareness.ts` (`canvas.laser` parsed and bounded, never kept);
  `test/room-awareness.test.ts`; `test/browser/scenarios-live.ts` (a guest's trail on the owner's
  canvas).
- `packages/vscode`: `syntaxes/meltemi.tmLanguage.json` (`on`); `test/webview/run.ts` (pointer,
  notes and attachment scenarios with screenshots).
- `skills/meltemi-diagrams/reference/free.md`, `c4.md`, `language.md` and their copies through
  `pnpm skills:sync`; `docs/language/*.md` and `docs/es/language/*.md` named above; `docs/editor.md`,
  `docs/playground.md`, `docs/cloud.md` and their Spanish copies; `CHANGELOG.md`;
  `docs/decisions/0059-pointer-and-notes.md`.
