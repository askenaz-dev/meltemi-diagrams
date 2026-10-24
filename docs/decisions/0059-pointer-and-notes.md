# 0059. The Pointer tool, notes in free compositions and C4 views, and note attachments

Status: accepted (pointer-and-notes change, 24 October 2026). Extends decisions 0018, 0020, 0045,
0050 and 0058.

## Context

The owner asked on 2026-10-23 for the professional touch of explaining a diagram in a meeting, and
for notes:

- A pointer that points and never edits, as Excalidraw's laser does in its presentation mode,
  without the mode itself (the owner finds a presentation mode of little value). The canvas had no
  such tool: every press selected, moved or created, the only cursors were `grab` and `crosshair`,
  and a read-only canvas refused every tool. In a room other people's pointers were already drawn as
  cursors gliding over 200 ms from a position published four times a second, so a trail only needed
  its points to ride in the same message; decision 0050 had rejected a channel of its own for
  anything faster than that.
- Notes. `note` was a flow kind: free compositions refused it (`prop.unknown`, decision 0018),
  C4 views held no declaration at all (decision 0020), a note was never tied to what it is about,
  and **Convert to Free Composition** turned it into a text with a `from_note` class.

## Decision

- **The Pointer is a toggle of the canvas, not a tool value.** `CanvasApp.pointing` is a boolean
  with its toolbar toggle (before the grid's), the key K on every profile and the command
  `togglePointer`, a view command, so it works on read-only canvases and writes nothing. It never
  holds with a tool: arming one, or pressing a creation key, puts it away, and Escape puts it away
  after a drag and before a tool. Turning it on lets go of the selection, the editor in place and
  the menus. While it is on a press starts a `laser` drag that draws a trail and nothing else: no
  hover handles, no double click, no context menu, no Shift+F10; Space-drag, the middle button and
  the wheel still pan and zoom. The state is not kept.
- **The trail is a 2D canvas on the presence layer, in diagram units.** `Trail` keeps points
  `{ x, y, t }` (a point closer than half a unit to the last is not kept, at most 256), and the pure
  `trailSegments` gives each segment an opacity falling linearly over 800 ms from its older point
  and a width tapering from 3 px to 1 px over the last 16 points; a point whose moment has not come
  draws nothing yet, which is how a batch from a room replays at its own pace. The layer's canvas
  sits between the outlines and the cursors at the device's resolution, a frame loop runs while a
  point lives, and points are converted to the screen at each frame so a pan or a zoom keeps the
  trail on the diagram. Under `prefers-reduced-motion` the stroke does not age while it is drawn
  and goes at once when the pointer lifts; a peer's batch is drawn whole and kept 250 ms. The
  cursor is an SVG dot in the trail's colour, set through a custom property so a pan still shows
  `grab`. The colour is the person's presence colour when the host names it (`presence.me`), else
  the theme's `accent` (the render's colours gain it). Nothing of it is in an SVG, an export, the
  HTML views or the project.
- **Trails in a room ride in the pointer's message.** The canvas posts `presenceLaser` (the points
  since the last post, `t` since the batch's first, at most every 50 ms and only to a host that
  shares presence), the page keeps the most recent 64 points of a state's window and sends them in
  `canvas.laser` beside the pointer (never in a heartbeat, never resent), the room parses them with
  the same bounds (64 points, `t` 0 to 1000, coordinates within the pointer bound, a tenth of a unit)
  and relays them once without keeping them, and a peer's page counts the batches it receives so the
  canvas draws each one once, in the person's colour. A batch that does not fit is dropped; in the
  room it invalidates the message, as every other bad part does. Four batches of 64 points a second
  are under 2 KiB a second, far inside the room's limits and with no message of their own.
- **No presentation mode.** The existing toggles hide the inspector, the layers and the libraries,
  and the code pane folds to a rail (decision 0057); the Pointer is the whole of it.
- **`note` joins the free kinds and C4 views accept it.** `note <id> "Text" [on <element>]` is a
  declaration of free diagrams and the one a C4 view holds (never written to the model, never an
  entity, with `class` and `url` in its block). A free note takes the text properties of free
  boxes (`fontSize`, `fontWeight`, `textAlign`), `radius`, `color`, `icon`, `rotation` and the
  outline properties, and refuses `shape` as a text does; it is drawn as a flow note is, with an
  outline only when `fill`, `stroke` or `pattern` is styled. `rule note` and the model JSON's
  `kind` carry it.
- **`on <element>` is an attachment.** The model records `attachedTo` (with its range) and a
  reference with the role `attachment`, so renames rewrite it; any other element of the diagram is
  a target, inside or outside any group, and an entity the view draws in a C4 view. It is a
  drawing and an arrangement hint, never a dependency: the layout draws a dotted leader from the
  note's border to the element's (the connector's intersection, the turned outline for a turned
  element, none when the boxes overlap) as the last item of the note's group, and `layout auto`
  adds an engine edge from the element to the note (assisted layout only for an unplaced note), so
  they stay near each other. The leader is no track of an effect and no part of the label audit.
- **Edit operations.** `createElement` takes `attachedTo`, `attachNote` writes, replaces or removes
  the clause with a minimal edit, deleting an element lists its attached notes as `attachment`
  dependents and, confirmed, strips ` on <id>` and keeps the notes, a C4 view's `excludeEntity` and
  the model's `removeEntity` do the same in every view of the file, and renames reach every file
  that resolves the model. A note of a view takes the element operations a declaration of the view
  takes (its text, id, classes, url and removal); every other kind stays refused there.
- **Notes on the canvas.** The note button and O make a note with its editor open on flow, free and
  C4 canvases (a sequence diagram keeps its note over the selection). Dropping the tool on an
  element, or clicking with it armed on one, creates the note at the element's east edge plus the
  theme's `groupPadding`, level with its top, in that element's group, attached; the element is
  outlined as a drop while the tool is over it, and the status line, which the selection would
  otherwise overwrite, ends on the attachment. The inspector shows **Attached to** after the label,
  and a note of a view shows its own fields and none of an entity's. Copy, paste and Duplicate keep
  the attachment when the element is copied with the note and drop it otherwise.
- **Convert to Free Composition keeps notes.** The copy writes `note <id> "Text" [on <element>]`
  with the same `place`, `size`, `layer` and link; `from_note` is gone.
- **Dash on an outlined note or text.** `animate … { effect dash }` is accepted on a note or a text
  when its styles, classes or a `rule` give it an outline, which the model decides (`outlined`) and
  the inspector offers; without one it is `animate.invalid-target`.

## Alternatives considered

- **A value `"pointer"` of the canvas's `tool`.** Every path that reads `tool` for creation, the
  palette drag, the profile sync and the read-only refusal would need a special case, and a
  read-only canvas would need `arm()` opened. A separate boolean touches the press, the move, the
  release and the keys.
- **A trail drawn as SVG paths with a CSS transition per point.** Hundreds of nodes a second for
  what one canvas strokes in a frame.
- **Points in screen pixels.** The trail would stay on the screen while the diagram panned under it,
  and a peer's would be at another zoom.
- **A channel of its own for trails.** Decision 0050 rejected it for the pointer; a trail is the
  same traffic in bigger batches inside the same message.
- **Drawing the peer's trail from the 4 Hz pointer.** A chain of jumps, not a stroke.
- **A "Present" button.** Two features welded together, one of them unwanted.
- **A connection handle from the note to its element, or an "Attach to…" menu entry.** The
  handles mean relations, and the inspector's field already lists the elements.
- **An attachment as a relation, or as an edge in the model.** A relation would draw a connector and
  make the note an endpoint of every query; the clause is a property of the note.
- **A leader as a free line or as a relation's track.** It would be selectable, animatable and
  audited; it is a part of the note's drawing.
- **Keeping notes as texts when converting.** A text has no `on`, no outline by default and no
  place in a view, and the class `from_note` only imitated a note.

## Consequences

- The Pointer works in the extension, the playground and the player's canvas alike, with no
  language change; rooms carry `canvas.laser` and need no migration, since an older page ignores
  what it does not read.
- Free compositions and C4 views gain annotations that move with what they explain; the model JSON
  gives every element `attachedTo`, `convert --to free` keeps notes, and the corpus, the pictures
  and the gallery show them.
- A note's leader and its arrangement edge are two more things `layout` computes: the leader costs
  one polyline in the note's group and the edge one more arrangement edge, both dropped when the
  note has no `on`.
- `docs/editor.md`, `docs/playground.md`, `docs/cloud.md`, the language reference and the skill
  describe the Pointer, notes and attachments in English and Spanish.
