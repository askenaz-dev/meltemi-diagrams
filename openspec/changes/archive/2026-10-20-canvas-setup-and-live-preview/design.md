## Context

- The session answers an analysis without diagrams with `{ type: "empty", message }`
  (`packages/editor/src/session.ts` ~234); the canvas (`packages/canvas/src/app.ts` ~474) clears
  the stage content and shows the text, but keeps the diagram selector, the inspector, the minimap
  and the layout badge of the last render.
- No edit operation creates a diagram; `convertToFree` inserts one after its source.
- The diagram inspector has a `preset` field (`packages/editor/src/inspector.ts` ~573); `canvas
  (w, h)` has no field. The language refuses `preset` with `canvas`.
- Split buttons (`canvas.css` ~107-132): the arrow part is 12 px wide with a 9 px muted caret.
- A move drag translates the dragged element groups in the stage SVG (`previewMove`, app.ts
  ~1383); nothing else moves until the drop. Hosts forward every `HostMessage` of a
  `SessionResult` to the canvas and every canvas message to the session (playground
  `canvas-host.ts`, VS Code panel), so new message kinds need no host code.

## Goals / Non-Goals

**Goals:** start from an empty file without typing; size the drawing from the inspector; split
buttons that read as dropdowns; drags and resizes that show the final drawing as they happen.

**Non-Goals:** C4 views from the canvas; live preview of bends, labels and sequence events.

## Decisions

### `createDiagram` edit

`{ kind: "createDiagram", type: "flow" | "free" | "sequence", id?: string, title?: string }`.
The id defaults to the first free of `diagram1`, `diagram2`… (a given id that is taken or not an
identifier is `edit.invalid-value`). It writes, after the last top-level statement of the file,
a blank line and `diagram <id>: <type> {\n}\n`; an empty file (or one without `language`) gets
`language "0.2"\n\n` first. `title` adds `  title "<title>"` inside. The plan's `select` facts name
the new diagram so hosts can switch to it. *Alternative:* a full template with a first node
(rejected: the owner wants to start clean).

### Session and canvas: the empty file and New diagram

- Canvas action `{ kind: "createDiagram", type }` → `createDiagram`; the session then renders the
  new diagram (it becomes the shown one).
- The `empty` message gains `creatable: ["flow", "free", "sequence"]` (empty in story mode). The
  canvas shows, under the message, one button per kind (en/es words: "Flow diagram" / "Diagrama de
  flujo", "Free composition" / "Composición libre", "Sequence diagram" / "Diagrama de secuencia"),
  hidden when read-only; on `empty` it also clears the diagram selector, the inspector (to nothing),
  the minimap and the layout and stale badges.
- A **New diagram** button (a `+` icon, label "New diagram" / "Nuevo diagrama") right of the
  diagram selector opens a menu with the same three kinds; hidden when read-only and in story
  mode.

### Canvas field

The diagram inspector replaces the `preset` field by a **Canvas** group: a select with `fit`
(fit to content, no statement), `document`, `slide` and `custom`, and, when `custom`, Width and
Height number fields (100 to 10000). Choosing writes in one batch: `setDiagramProperty preset`
(document/slide) and removes `canvas`, or `setDiagramProperty canvas` `(w, h)` and removes
`preset`, or removes both for `fit`. Custom starts from the drawn size of the content. Read-only
canvases show the values disabled.

### Visible split buttons

- Both parts share one outline (1 px, the toolbar border colour, radius 4) and a 1 px divider; the
  arrow part is 18 px wide and as tall as the button, with a 10 × 6 chevron SVG stroked in the
  foreground colour (1.5 px); hover and keyboard focus colour each part; `aria-expanded` shades the
  arrow part.
- Tooltips: "More shapes (F)" / "Más formas (F)" and "Kinds of arrow (R cycles)" / "Tipos de
  flecha (R cambia)".
- A right-click or a 450 ms press on the main part opens the same menu (a short click still arms
  the tool).

### Live preview of moves and resizes

- Canvas message `{ kind: "preview", token: number, action: <move or resize action> }` (move with
  its `parent` when the drop would reparent). It is not an edit: no history, no revision change.
- The session plans the action exactly as on the drop (materialising `layout auto` first), applies
  the plan's edits to a copy of the text, analyses the copy with the same project context, lays
  out the shown diagram and answers `{ type: "preview", token, svg }` with the SVG the stage would
  draw (the stage's render options), or `svg: null` when the action would be refused or the copy
  has errors. Nothing else is sent (no inspector, no status).
- The canvas keeps at most one preview in flight; on each answer, if the pointer moved, it sends
  the latest gesture. It swaps the stage SVG for the preview and re-applies the remaining offset
  (pointer delta minus the previewed delta) to the dragged element groups, so they stay under the
  pointer while connectors and groups follow at the previewed position. The overlay (selection,
  drop target, guides) is unchanged. On drop, the edit renders as today; on Escape or a refused
  drop the last real render comes back. Answers with an old token are ignored.
- Sequence diagrams keep their own event previews; previews apply to flow, free and C4 views.

## Packages and interfaces

- `@meltemi/diagrams-edit`: `createDiagram` (types, plan dispatch, inverse, messages en/es).
- `@meltemi/diagrams-editor`: `CanvasAction` `createDiagram` and `preview` (validated in
  `isCanvasMessage`), `HostMessage` `preview` and `empty.creatable`, the session's dry run, the
  inspector's Canvas group; words en/es.
- `@meltemi/diagrams-canvas`: empty state with buttons, New diagram menu, cleared stale state,
  split-button CSS and gestures, the preview client; words en/es.

## Risks / Trade-offs

- [Preview cost on large diagrams] → one request in flight and latest wins; a diagram whose dry
  run takes longer simply previews less often. After the first drag of a `layout auto` diagram
  every box is placed, so previews do not run the engine.
- [Messages crossing the webview] → the SVG is the same size as a render, at most one per answer.
