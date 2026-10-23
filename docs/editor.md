# Editing in VS Code

[Español](es/editor.md)

The Meltemi Diagrams extension adds the `.meltemi` language to VS Code and its forks (1.95 or
later). It also puts a canvas beside the code. The text stays the source of truth: every action on
the canvas is a small edit to the same document. Undo, redo, save, dirty state and Git work exactly
as they do for the text.

The canvas is the `@meltemi/diagrams-canvas` package; the playground (`docs/playground.md`)
mounts the same canvas in a web page, so what this page says about it holds there too.

## Installing

Build the package and install it:

```bash
pnpm vscode:package
```

```bash
code --install-extension packages/vscode/meltemi-diagrams.vsix
```

Uninstall it from the Extensions view to roll back. To work on the extension itself, press F5 with
**Run Meltemi Diagrams**. That builds it and opens an Extension Development Host on `examples/`.

## The panes

- **Code**: highlighting, live diagnostics and every language feature listed below.
- **Canvas**:
  - opens beside the code when you open a `.meltemi` file;
  - the toolbar holds the diagram picker with **New diagram** beside it, the palette, zoom, grid,
    snapping, minimap and inspector toggles, arrange and export;
  - the badge shows the layout mode.
- **Inspector**: the style strip first (colours, line, width, corner radius, shape, icon
  position, arrowhead, effects, and the diagram's theme), then the properties of the diagram, the
  selected element or relation, or the shared style of several items. While a theme is edited,
  the theme panel takes its place.
- **Libraries** (toolbar toggle, U): ready-made elements by category, from AWS, Azure, Google
  Cloud, Kubernetes, Tabler and the technology logos, with a search box and the placement control
  of the icon picker ([element libraries](#element-libraries)).
- **Layers** (toolbar toggle, L): the layers of a flow diagram or a free composition, front to
  back, with what each holds ([layers and order](#layers-and-order)).

**Hiding the canvas.** If you close the canvas while the code stays open, it stays closed: in this
session, in the next ones, and for other files. **Open Canvas to the Side** (the icon in the editor
title, or the command palette) opens it again and restores the automatic opening. The setting
`meltemi.canvas.openWithText` chooses `remember` (the default), `always` or `never`.

| Setting                       | Default    | Meaning                                                                    |
| ----------------------------- | ---------- | -------------------------------------------------------------------------- |
| `meltemi.canvas.openWithText` | `remember` | When the canvas opens beside the code                                      |
| `meltemi.canvas.grid`         | `14`       | Grid size in diagram units                                                 |
| `meltemi.canvas.showGrid`     | `true`     | Draw the grid                                                              |
| `meltemi.canvas.snap`         | `true`     | Snap to the grid                                                           |
| `meltemi.canvas.guides`       | `true`     | Snap to the edges and centres of other boxes, with guides                  |
| `meltemi.canvas.minimap`      | `true`     | Show the minimap                                                           |
| `meltemi.canvas.inspector`    | `true`     | Show the inspector                                                         |
| `meltemi.export.browser`      | empty      | The browser that draws PNG, PDF and video; found when empty                |
| `meltemi.export.ffmpeg`       | empty      | The FFmpeg that encodes video; `ffmpeg` on the path when empty             |
| `meltemi.assist.provider`     | empty      | Optional AI assistance: `anthropic` or `openai-compatible`; off when empty |
| `meltemi.assist.model`        | empty      | The model; `claude-opus-5-5` for Anthropic when empty                      |
| `meltemi.assist.baseUrl`      | empty      | The endpoint, such as `http://127.0.0.1:11434/v1` for a local Ollama       |
| `meltemi.language`            | `auto`     | The language of the extension and the canvas: `auto`, `en` or `es`         |

The toolbar toggles override the grid, snapping, minimap and inspector settings for one canvas.

**A read-only canvas.** The canvas's host (the extension or the page) sends it its settings in a
`settings` message (`CanvasSettings`: `grid`, `showGrid`, `snap`, `guides`, `minimap` and `inspector`, the values of
the table above), and each message replaces the settings as a whole. A host may add `readOnly: true`
to make the canvas only show: the playground does it while a shared project is viewed
([playground](playground.md#viewing-a-shared-project)), and a later message without it, or with
`false`, makes the canvas edit again with no reload. The extension never sends it, so VS Code sees
no change. While it is on, the canvas shows a "view only" badge, hides the palette and every other
control that writes the diagram (the story timeline's editing controls, the libraries panel and
the buttons that create diagrams included), and sends the host no action: a drag, a connection, a
deletion, an in-place label, a keyboard edit, an inspector field, undo and redo and the theme panel
leave the diagram as it is, and the status line says so. Selection, zoom, pan, the minimap,
hiding and showing layers, copying, stories with their timeline, and effects work.

**Other people's selections.** A host that shares the diagram can tell the canvas who else is in it
with a `presence` message, `{ type: "presence", people }`, where each person has a `name`, a
`colour`, the ids they have selected (elements, relations and events) and, while it moves, the
`pointer` over their canvas. The playground does it
for a cloud project that several people have open
([working together](playground.md#working-together)); the extension never sends it, so VS Code
sees no change. The canvas outlines each of those ids in the person's colour and tags it with their
name, and draws each pointer as a cursor in the person's colour with the name at its tail, gliding
from one point to the next, on a layer above the scene that is never selected, copied or exported:
a press on an outline or a cursor reaches the element under it. The canvas tells such a host where
its own pointer is (`presencePointer`), and nothing else of the layer. Each message is the whole picture
and replaces the last; a message with nobody, an empty canvas or another diagram clears it. Ids the
diagram does not have are ignored, as is anything on a hidden layer, and while a story plays
nothing is drawn (the people are kept for when it ends). A name is always shown as text, never as
markup. [The canvas package's README](../packages/canvas/README.md) says how a host sends it.

**Language.** The extension speaks English and Spanish. `meltemi.language` is `auto` by default,
which follows VS Code's display language; `en` or `es` choose one. Diagnostics, hover, completion
and quick fixes follow it too. Changing it redraws open canvases and analyses open documents again
in the new language. Command titles and setting descriptions follow VS Code's display language. Words the canvas writes into files, such as the text of a new note ("Note" or "Nota"),
follow the interface's language, as if you had typed them. Exported drawings, players and catalogs
follow the project's `"locale"` instead ([projects](language/projects.md#language-of-exports)), so
the same project exports the same files whatever language the editor speaks.

## Language features

| Feature                                       | What it does                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Diagnostics                                   | Compile, project and layout problems, as you type, with their hints                                                                                                                                                                  |
| Completion                                    | Statements by block, element and relation ids, ports after `element.`, property values, themes, classes, colour tokens and icons inside `icon "…"`; in stories, actions, transitions, diagrams and the ids of the scene's view       |
| Hover                                         | Elements (kind, label, position, size, ports), relations (ends, label, route), ports, keywords, themes, and icons with a preview and their licence; story actions with their place on the clock, scenes and stories with their times |
| Outline and breadcrumbs                       | Diagrams, groups, elements and relations, nested as written; stories and their scenes                                                                                                                                                |
| Go to definition, find references, highlights | For element and relation ids, everywhere they are used, also in stories and in the stories of other files that import the diagram                                                                                                    |
| Rename (F2)                                   | Element ids and named relation ids, with every reference, from the diagram or from a story, across the files of the project                                                                                                          |
| Format document                               | The canonical layout of `meltemi-diagrams format`                                                                                                                                                                                    |
| Semantic colours                              | Elements, groups, relations, ports, classes and themes                                                                                                                                                                               |
| Quick fixes                                   | See the table below                                                                                                                                                                                                                  |

| Problem                                                                             | Quick fixes                                               |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `layout.missing-placement`, `layout.mode-unsupported`                               | Arrange the unplaced elements with ELK                    |
| `layout.placement-ignored`                                                          | Switch to `layout assisted`; switch to `layout manual`    |
| `ref.unknown-element`                                                               | Declare the element as a node                             |
| `placement.unknown-port`                                                            | Declare the port on the element; use one of its ports     |
| `layout.text-overflow`                                                              | Set the size the hint gives                               |
| `prop.unknown`, `layout.unknown-theme`, `theme.unknown-class`, `asset.unknown-icon` | Change to the closest accepted word, theme, class or icon |

Refactors: **Name this relation** on an anonymous relation, and **Arrange diagram** on any flow
diagram.

## Navigating the canvas

- The grid is 14 units by default, with every fourth line stronger. It covers the whole workspace
  and shows on the sheet behind the shapes.
- **Zoom**: Ctrl and the wheel, or a pinch, zooms around the pointer, from 10 % to 800 %. The
  toolbar menu has presets, **Fit** and **Selection**.
- **Pan**: the wheel, Shift and the wheel, Space+drag or the middle button.
- **Minimap**: shows the whole sheet and the visible area. Click or drag in it to move there.
- **Selecting**: click a box or a connector; Shift or Ctrl adds or removes one. The click selects
  the shape painted on top; a diamond, an ellipse or another shape drawn as a path is hit only
  inside its outline. Alt+click selects the shape below, cycling through the stack under the pointer
  ([covered shapes](#shapes-and-containers)). Dragging on empty space draws a rectangle that
  selects the boxes and the connectors fully inside it. Ctrl+A selects everything and Escape
  clears.
- **Two-way selection**: selecting on the canvas shows the id in the code without taking focus.
  Moving the text cursor highlights the element of the statement under it.

## New diagrams and the canvas size

**An empty file.** When the file has no diagram, the canvas says so and offers a button for each
kind it creates: **Flow diagram**, **Free composition** and **Sequence diagram**. Nothing of the
last drawing stays: the diagram picker, the inspector, the minimap and the layout and "Out of
date" badges are cleared. A button writes the diagram and shows it with its palette, so an emptied
file becomes:

```text
language "0.2"

diagram diagram1: flow {
}
```

**New diagram.** The **+** button right of the diagram picker offers the same three kinds in any
file. The diagram is written after the last statement of the file, past a blank line, with the
first id of `diagram1`, `diagram2`… that no diagram, model, theme or story of the file uses; a
file without `language` gets `language "0.2"` first. It is one undo step, and the picker names
the new diagram while the canvas shows it. C4 views are written in the text, since a view needs a
model ([c4.md](language/c4.md)). A read-only canvas shows the reason for an empty file without
the buttons and has no **New diagram**, and neither is offered while a story plays.

**The canvas size.** With nothing selected, the inspector's **Canvas** field sets the size of the
drawing of a flow diagram, a free composition, a sequence diagram or a C4 view
([presets and canvas](language/styles.md#presets-and-canvas)):

| Canvas         | Text                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------- |
| fit to content | Neither `preset` nor `canvas`: the content and its margin                                   |
| `document`     | `preset document`                                                                           |
| `slide`        | `preset slide`                                                                              |
| custom         | `canvas (w, h)` from the size drawn, with **Width** and **Height** fields from 100 to 10000 |

`preset` and `canvas` cannot be combined, so each choice removes the other in the same edit, and
fit to content removes both: one undo step each. A width or a height out of range is refused with
the range, and the text stays as it was.

## Gestures and what they write

| Gesture                                                                   | Text change                                                                                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag a box (or several, or a group)                                       | `place` of each box; Alt moves freely, otherwise guides first, then the grid                                                                                   |
| Drag a box into a group, or out of its group                              | Its declaration moves into that group's block, or to the top level, with its `place` in the new interior; Alt keeps the group                                  |
| Drag a resize handle                                                      | `size` and `place`; the opposite edges stay, sizes snap to the grid, at least 24                                                                               |
| Drag a relation label                                                     | `label <id> at <n>% offset (dx, dy)`                                                                                                                           |
| Drag a route bend, or the middle of a stretch                             | `route … via [...]`, adding a bend when you drag a middle                                                                                                      |
| Double-click a bend                                                       | Removes it from `via`; a route left with nothing else goes                                                                                                     |
| Drag a route end over its box, or just outside it                         | The point of the border it takes, in the `route` (below); inside the box, `auto`                                                                               |
| Drag a route end onto another box                                         | The relation's end, and its `route` with the point                                                                                                             |
| Double-click a route end                                                  | The layout chooses that end again                                                                                                                              |
| Drag from a connection handle (the dots beside a selected box) onto a box | `a -> b`; Shift for `-->`; onto its border, both ends pinned too                                                                                               |
| Press just outside a box's border and drag onto another box               | `a -> b` with its start pinned to that point; onto the border, its end too                                                                                     |
| Relation tool (R): click the source, then the target                      | `a -> b`, or the arrow kind chosen, selected; Shift on the second click flips solid and dashed; Escape cancels                                                 |
| Choose a palette tool and click, or drag a palette button onto the canvas | A declaration and its `place`, inside the group under the pointer (a group nests too); a box or node with the current shape also gets `style <id> { shape … }` |
| Choose an icon in the icon picker and click the canvas, or drag it there  | The element the placement control says, empty, with `style <id> { icon … }` and its `place` ([icons](#icons))                                                  |
| Drag an icon of the picker or the Libraries panel onto a shape            | `style <id> { icon … }` of that node, decision, data store or box, and nothing else; the shape is outlined while the pointer is over it                        |
| Double-click a box or relation, or press Enter                            | Its label, typed where it is drawn ([text in place](#empty-shapes-and-text-in-place))                                                                          |

- **Naming relations.** Actions on an anonymous relation, a style, an effect, a label, a layer,
  a dotted line, a label position, a moved label, a dragged end or bend included, first name it
  `<from>_<to>` (`as api_db`), in the same edit, and the status line says so; the relation stays
  selected under its new id, and the inspector stays on it. Classes and turning an effect off name
  nothing. In C4 views the name goes into the model relation (`as shop_api_db`, from the entity
  paths), in the model's file when that is another file of the project. Anonymous messages, notes
  and fragments of sequence diagrams are named the same way (`as web_api`, `note1`, `alt1`) when an
  effect or a style needs it: nothing is refused for want of a name.
- **Free diagrams.** Positions of objects inside a group are written relative to the group's
  interior ([free.md](language/free.md)): moving a group writes only the group's `place`, and
  resizing it from the left or top edge shifts its children's places so they stay where they are.
  The interior of an untitled group starts `groupPadding` below its top edge. The inspector shows
  the written values.
- **Pinning ends.** A connector can meet a box at any point of its border. While you drag a
  connector's end, or a new connection, over a box or within 12 px outside it, the box's outline
  shows with its magnets: the middle of each side, the corners and its named ports. On a shape
  other than a rectangle the outline is the shape's, and so are the magnets: its vertices and the
  middles of its sides, on the outline, with no corners on an ellipse. The end takes the point of
  the nearest side under the pointer, to 1 %, or a magnet within 6 px of it; Alt turns the magnets
  off. The route then says where it goes, such as `route save from api to db.north 37%`, and the
  connector stays there whatever the boxes' overlap or bends. Dropped further inside the box, the
  end is free again and the layout chooses its point.
- **Connecting from the border.** Hovering within 8 px outside a box's border, where no handle
  or connector is, shows the point a connection would start from, and the pointer turns into a
  crosshair. Press there and drag onto another box: the relation is written with its start
  pinned to that point, such as `route cache_db from cache.north 30% to db.auto`, and its end
  pinned too when you drop on the target's border. Sequence diagrams have no routes, so there the
  connection is created without pinned ends; in a C4 view the connection writes the relation into
  the model, named when an end is pinned.
- **Handles on the line.** A selected connector shows its ends, its bends and, for each stretch
  between two of them, a handle halfway along the line as drawn, wherever the line turns. Dragging
  it adds a bend there.
- **Colours from the theme.** The selection, handles, the point an end takes and the point a
  connection starts from use the theme's `selection` colour; alignment guides and the outline and
  magnets of the box under an end use its `guide` colour. Both default to the theme's `accent`, so
  a blue theme draws blue outlines; set them in a theme block, or in **Edit theme… › Canvas**
  ([styles.md](language/styles.md#tokens)). Focus rings and panels keep the editor's colours.
- **Live preview.** While you drag boxes or a resize handle in a flow diagram, a free composition
  or a C4 view, the drawing shows how the drop will leave it: connectors, relation labels and
  groups follow as they will be drawn after the release, and the dragged boxes stay under the
  pointer.
  Nothing is written until the drop: the canvas sends the session the move or resize the drop
  would send in a `preview` message, and the session plans it on a copy of the text, lays it out
  and answers with the drawing, with no undo step and no new revision. One preview is awaited at a
  time, the latest gesture first, so a large diagram previews less often rather than lagging. A
  `layout auto` diagram previews as the drop leaves it, with every box placed. Where the drop
  would be refused, such as a C4 element dragged across a boundary, or would leave errors in the
  text, the boxes move alone. Escape brings back the drawing from before the drag. Sequence
  diagrams have their own live moves of events; bends and labels are not previewed. Hosts pass
  `preview` messages on like any other.
- **One step each.** Every action is one undo step, whichever pane you undo from.

### Empty shapes and text in place

**New shapes are empty.** As in draw.io or Excalidraw, a node, a decision, a data store or a box
arrives without text: created from the palette, by a drop, with N, D, S or B, from the shapes
grid or from the icon picker, it is written with an empty label and selected, and no editor
opens:

```text
node1[""]
decision decision1 ""
data1[("")]
box box1 ""
```

A shape other than `rounded` adds `style <id> { shape <value> }` in the same edit, and the status
line names the element by its id (`box box1 selected.`). Double-click it, or press Enter or F2, to
give it text. Notes, tags and free texts, which show nothing without text, get their default text
("Note", "Tag", "Text", in the interface's language) and open the editor at once, and so does a
new group with its title "Group". An element from a library keeps its label and opens no editor.

**Editing in place.** The editor opens where the text is drawn: a shape's text area (the body of
`person` and `agent`), the label of an icon shape outside its square (at `labelPosition` beside
the square while it has none), the box of a free text, a note or a tag, a group's title, a
relation's label or, when the relation has none, the middle of its line. It writes in the drawing's font, at its
size times the zoom, with its weight, colour and alignment, and has no frame or background (a
relation's label is typed on its pill); a thin line in the selection colour marks it, and the
drawn text is hidden meanwhile. The browser's autocomplete, spelling and correction are off. The
editor grows with the text and stays centred where the text is drawn.

| Keys in the editor          | Effect                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| Enter, Tab, a click outside | Keep the text (`setElementLabel` or `setRelationLabel`), one undo step |
| Shift+Enter                 | Start a new line, written `\n`, where the drawing breaks lines         |
| Escape                      | Cancel: the text is unchanged and the drawn label comes back           |

- **Lines.** Shift+Enter breaks the labels of nodes, decisions, data stores, boxes and C4
  elements, free texts and notes, sequence notes included. Relation labels, group titles, tags,
  participants, fragment conditions, dividers and delays are drawn on one line: there Shift+Enter
  keeps the text as Enter does, and a pasted line break becomes a space. Line breaks at the end
  are dropped.
- **Empty text.** Emptying a labelled shape writes `""`; leaving an empty shape empty writes
  nothing.
- **Ids.** Shift+F2 renames the id in the same editor, on one line in a monospace font, with
  `renameElement` or `renameRelation`.
- **Sequence diagrams.** Notes, fragment conditions, dividers and delays use the same editor.

### Automatic and assisted layouts

- **`layout auto`.** ELK arranges the boxes and the canvas shows that arrangement. The first change
  of position writes the position of every box, switches the diagram to `layout assisted`, and
  then applies the change, all as one edit. Only what you moved moves. This applies to moving,
  resizing, bends, creating, aligning, distributing and pasting.
- **`layout assisted`.** Placed boxes stay where they are. A box you drag gets its `place`, and ELK
  keeps arranging the others.
- **Arranging on demand.** **Arrange Unplaced Elements** writes positions for the boxes that have
  none and keeps routes as they are. **Recompute Layout** arranges everything anew, as `layout
auto` draws it, and writes what it draws: every `place`, the `place` and `size` of placed groups,
  and the bends of every connector the engine bent, as `route <id> from <a> to <b> via [...]`
  with free ends (an anonymous relation is named `<from>_<to>` first). Compass sides and points of
  the ends go, named ports stay, and a route left with nothing is removed, so the drawing after it
  is the drawing before it. A placed and sized group with nothing inside, a band, stays where it
  is, and a container keeps its written size as the least it gets, its children centred inside.
  Double-click a bend to drop it, or recompute again to rewrite them. When the diagram cannot be
  arranged, the status line says why, such as a band inside a group the engine arranges. Both are
  in the toolbar menu, the context menu and the command palette.

## The keyboard

Every pointer action has a key. Keys work while the canvas has focus; VS Code's own keys (save,
undo, redo, the command palette) keep working as everywhere. Tab past the last element leaves the
canvas.

| Keys                                                          | Action                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Tab, Shift+Tab                                                | Select the next or previous element in source order                                                                                   |
| Ctrl+Left, Ctrl+Right, Ctrl+Up, Ctrl+Down                     | Select the nearest element in that direction; of two at one centre, the nested one                                                    |
| Ctrl+A                                                        | Select every element                                                                                                                  |
| Escape                                                        | Clear the selection or cancel a drag                                                                                                  |
| Left, Right, Up, Down                                         | Move the selection 1 px                                                                                                               |
| Shift+Left, Shift+Right, Shift+Up, Shift+Down                 | Move the selection one grid step                                                                                                      |
| Alt+Shift+Left, Alt+Shift+Right, Alt+Shift+Up, Alt+Shift+Down | Make the box one grid step narrower, wider, shorter or taller                                                                         |
| Enter, F2                                                     | Edit the label in place                                                                                                               |
| Shift+F2                                                      | Rename the id in place                                                                                                                |
| Delete, Backspace                                             | Delete the selection                                                                                                                  |
| Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D                                | Copy, cut, paste, duplicate                                                                                                           |
| Alt+G, Alt+Shift+G                                            | Group the selection, ungroup                                                                                                          |
| Ctrl+Shift+Left, Right, Up, Down                              | Align left, right, top or bottom edges                                                                                                |
| Ctrl+Alt+H, Ctrl+Alt+V                                        | Distribute horizontally or vertically                                                                                                 |
| C                                                             | Connect the selected element to… (type to filter, Enter to choose)                                                                    |
| R                                                             | Relation tool (Message on sequence diagrams): click the source, then target                                                           |
| R while the relation tool is armed                            | The next arrow kind: `->`, `-->`, `<->`, `<-->`                                                                                       |
| N, D, S, O, T, G                                              | Flow: create a node (of the current shape), decision, data store, note, tag or group (of the current kind) near the centre            |
| B, T, M, G                                                    | Free: create a box (of the current shape), text, image or group (of the current kind) near the centre                                 |
| F                                                             | Flow and free: open the shapes grid (type to filter, arrows to move, Enter to create, Escape to close)                                |
| I                                                             | Flow and free: open or close the icon picker, for the selection or to place an icon; in its search field I is typed ([icons](#icons)) |
| P, A, G                                                       | Sequence: create a participant or an actor at the right, or a group                                                                   |
| A                                                             | C4: add an entity of the model to the view                                                                                            |
| O, F                                                          | Sequence: a note over the selection; a fragment around the selected events                                                            |
| Alt+Up, Alt+Down                                              | Sequence: move the selected event before or after its neighbour                                                                       |
| Alt+A                                                         | Sequence: activate the receiver after the selected message, or undo that                                                              |
| L, U                                                          | Show or hide the layers panel, the element libraries                                                                                  |
| Ctrl+Shift+], Ctrl+]                                          | Bring to front, bring forward                                                                                                         |
| Ctrl+Shift+[, Ctrl+[                                          | Send to back, send backward                                                                                                           |
| +, =, -                                                       | Zoom in or out                                                                                                                        |
| Shift+0, Shift+1, Shift+2                                     | Zoom to 100 %, fit the diagram, fit the selection                                                                                     |
| Shift+F10, the context-menu key                               | Open the context menu (arrows to move, Enter to choose)                                                                               |

Focus is always visible: the canvas, toolbar buttons, inspector fields, menu items and dialog
buttons draw a ring in the theme's focus colour. Each element tells assistive technology its kind
and label, and a status line announces the selection and the result of each action.

## Motion

The canvas moves briefly and always the same way, on the motion tokens of its stylesheet
(`--mdg-motion-fast` 120 ms, `--mdg-motion` 160 ms, `--mdg-motion-slow` 220 ms, `--mdg-ease`):

- **Popovers and menus**, the icon picker, the shapes grid, the menus of the arrow, group and New
  diagram buttons, the context menu, the Arrange menu, **Connect to…** and the inspector's grids of
  arrowheads, open from their anchor with a fade, a 4 px rise and a scale from 98 % over 160 ms,
  and close with a 120 ms fade. They take presses at once.
- **Panels.** Libraries and Layers slide in from the left, the inspector and the theme panel from
  the right, over 220 ms.
- **Tooltips** appear after 400 ms over a control and fade in.
- **Outlines.** The outline of a drop or connection target and the inline editor's outline fade
  in; the results of the icon picker fade in one after the other.
- **Controls.** Buttons, chips and fields change colour over 120 ms.

When the system asks for reduced motion (`prefers-reduced-motion: reduce`), every duration is
zero and nothing rises, slides or scales.

## Icons

One icon picker serves the whole canvas. The icon button of the palette and I open it on flow
diagrams and free compositions, under the button; **Icon…** in the context menu opens it at the
pointer, and **Choose…** on the inspector's **Icon** field under the field. The icon button closes
it again, and so does I while the canvas has the focus; the search field takes the focus when the
picker opens, and there I is typed like any other letter, so Escape or the icon button closes it.
On C4 views only **Choose…** opens it, with the icons of the packs and no libraries or placement
control. Read-only canvases, sequence diagrams and story mode never open it.

- **Searching.** The search field has the focus. Type a word, such as `server`, `database` or
  `lambda`, and the results follow after 80 ms, grouped by pack (Tabler, AWS…) or library
  (Technology, the project's own), 60 at most, each with a 24 px thumbnail and its name; a
  thumbnail shimmers while its pack loads, and icons a pack cannot draw are never offered. A
  typed `pack:name` that names an icon, such as
  `aws:lambda`, comes first. With nothing typed, the picker shows the icons chosen while the
  canvas is open (**Recent**, ten at most), then the project's own packs, then the first category
  of the Technology library.
- **Adding icons.** In a file of a project, **Add icon…** at the picker's foot (and at the
  Libraries panel's) opens the system's file chooser for SVG files and a dialog: the pack
  (`project` by default), the licence of a new pack, and a row per file with its preview, the name
  it gets and what is wrong; a file no icon can be made of is left out with its reason. Adding
  writes the icons, the pack's licence and the Project library in one undo step; the selected
  elements take the first icon, or with none the icon tool is armed with it
  ([adding icons](language/assets.md#adding-icons-from-the-editor)).
- **Keys.** The arrows move through the results while the field keeps the focus; Enter chooses
  the active result, or the first one of a search still on its way when it arrives; Escape closes
  the picker and gives the focus back, and a click outside closes it too. Tab reaches the
  placement control, whose arrows choose.
- **For the selection.** With nodes, decisions, data stores or boxes selected, the picker is
  headed "Icon of api" (or "Icon of 2 elements"); a choice gives each of them the icon in one undo
  step, `style api { icon "tabler:server" }`, and the picker closes.
- **To place.** With nothing selected that takes an icon, the picker shows the placement control,
  **Insert as**, with a picture for each choice. The choice is kept while the canvas is open, and
  the Libraries panel shares it:

| Choice             | The element written                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Icon** (default) | a node (a box in free compositions) drawn as its icon, its label below: `shape icon`                          |
| **In a box**       | a node or a box of the current shape, the icon beside its label (`rounded` while the current shape is `icon`) |
| **Only the icon**  | in free compositions only, an `icon` object, without text                                                     |

A click on a result arms the icon tool. Its ghost shows what will be placed: the icon in its
square over a label bar, a box with the icon, or the icon alone. A click on the canvas places it,
inside the group under the pointer, empty and selected; a click on a node, a decision, a data
store or a box, outlined under the pointer, gives that shape the icon instead; Escape disarms.
Enter in the picker places the result near the centre. The status line says what each click will
do. **Icon** and a click write, in one undo step:

```text
node1[""]
style node1 { icon "aws:lambda"; shape icon }
```

- **Dragging.** Results drag onto the canvas like library items. Over a node, a decision, a data
  store or a box, the shape is outlined and the drop writes only its icon; over empty canvas the
  ghost follows the pointer and the drop creates the element as a click would. The picker fades
  away during the drag; Escape, or a release outside the canvas, cancels it.
- **The context menu.** With elements that take icons selected, **Icon…** (I) opens the picker at
  the menu's point. **Remove icon** shows when an element has an icon of its own and takes it away
  in one undo step, keeping its other styles: `style db { icon "tabler:database"; fill "#eef" }`
  becomes `style db { fill "#eef" }`.
- **The inspector.** **Icon** shows the thumbnail of the icon (greyed when a class or a rule gives
  it, dashed when there is none), its name and its reference, with **Choose…** and **Remove**
  beside the label; it works for relations and groups too, and an icon object's **Icon** field
  changes its icon. **Icon position**, in the strip after **Shape** when every selected element
  has an icon, picks `left`, `right`, `top`, `bottom` or `center` from pictures, the position
  drawn greyed; an icon shape has none, and C4 entities, which draw `center` as `top`, have the
  other four. **Label position** appears when the icon is the centre
  piece (`iconPosition center` or `shape icon`), four pictures with `bottom` greyed. **Icon size**
  is a number from 8 to 128 with a slider, the drawn size greyed; **Auto** writes `iconSize auto`
  and **Clear** removes it, and a number out of range is refused
  ([icons in boxes](language/styles.md#icons-in-boxes)).
- **Icon shapes.** An element drawn with `shape icon` is selected, resized and connected on its
  square: its outline, handles, magnets and border are the icon's
  ([icons as shapes](language/free.md#icons-as-shapes)). Its label belongs to it: a press on the
  label selects it, a selection rectangle must hold the label too, and a connection dropped on the
  label ends on the square. The connection handles on the label's side sit past the label, and a
  dashed outline marks the label of a selected icon shape. Choosing **icon** in the shapes grid
  opens the picker with the **Icon** placement, since an icon shape needs its icon.

## Element libraries

The libraries toggle on the toolbar (U, its tooltip "Libraries (U)") opens the Libraries panel
for flow diagrams and free compositions: a search box, the placement control of the icon picker,
and the libraries the document knows, each with its categories. Open a category to see its
elements with their icons; click one to add it at the centre of the view, or drag it onto the
canvas to put it where you drop it. With the **Icon** placement, the default, the element is a
node (a box in free compositions) drawn as its icon and labelled as the element, with its icon and
its shape written as a style on the next line, and it is selected without opening the label
editor:

```text
lambda1["AWS Lambda"]
style lambda1 { icon "aws:lambda"; shape icon }
```

The **Project** library lists the icons added with **Add icon…**, a category per pack, and the
panel's foot offers **Add icon…** too in a file of a project.

**In a box** writes it as a node or a box of the current shape with the icon beside its label, so
`style lambda1 { icon "aws:lambda" }` alone for `rounded`; **Only the icon**, in free
compositions, writes an `icon` object. An element whose library gives it a kind, such as a data
store, keeps that kind and takes the icon. Dragged onto a node, a decision, a data store or a box,
an element outlines it and gives it its icon, creating nothing. The placement is the icon
picker's, and changing it in one changes it in the other ([icons](#icons)).

The built-in libraries are AWS, Azure, Google Cloud and Kubernetes (the vendors' icon sets, by
their categories), Tabler (by its categories) and Technology (databases, messaging, languages,
frameworks, tools, platforms and operating systems from the technology logos). A project's own
`assets/libraries/*.json` and a plugin's libraries appear with them
([assets.md](language/assets.md#libraries)). Search matches labels and icon names across every
library. Sequence diagrams and C4 views draw their own kinds and have no panel.

## Layers and order

Flow diagrams and free compositions paint layer by layer: `layers back, main, front` declares
them from back to front, and `layer <name>` in the block of an element, a group or a relation
puts it on one ([free.md](language/free.md#layers-and-order)). Within a layer, groups come first,
then the other elements in source order, then relations, and tags on top. Boxes on different
layers are not checked against each other, which is how a coloured band sits behind a row of
boxes: an untitled group (`""`) with a `place`, a `size` and `layer back`. Within a layer, a box
declared after a box that holds it is drawn over it, a deliberate stack that the checks leave
alone; sending the inner box to the back turns it into a `layout.overlap`.

- **The panel.** The layers toggle on the toolbar (L) opens the Layers panel: the layers from
  front to back with how many elements and relations each holds. **Add** writes a new layer
  (`layer1`, `layer2`, …) just behind `main`; double-click a name to rename it everywhere it is
  written; the arrows move a layer forward or back; the cross removes it and its elements return
  to `main`; with something selected, **Move the selection to…** writes its `layer`. Each action is
  one undo step.
- **Hiding.** The eye hides a layer on the canvas: its drawings disappear from the sheet, from
  rectangle selection and from Tab, and nothing is written; exports still draw it. The choice is
  kept with the canvas, per diagram.
- **Order within a layer.** Bring to front, send to back, bring forward and send backward (keys
  above, and the context menu) move the declaration among its siblings, which sets the paint
  order. The inspector has a **Layer** field for elements and relations, and the diagram's
  **Layers** field lists the layers from back to front.
- **In the SVG.** Every element and relation on a layer other than `main` carries
  `data-layer="<name>"`, so stylesheets and hosts can address a layer.

## Shapes and containers

- **Shapes.** The **Box** button (free) and the **Node** button (flow) are split buttons. The main
  part creates the current shape and shows its picture, `rounded` until you choose another; the
  arrow beside it opens a grid of the twenty-four shapes, each with its picture and its name. A
  choice becomes the current shape and arms the tool, whose ghost takes the shape's default size
  and outline: the click or the drop writes the element, empty, and `style <id> { shape <value> }`
  in the same edit (nothing for `rounded`), and B or N then create the current shape near the
  centre. The current shape lasts while the canvas is open and is not saved. **agent** draws an
  AI agent: a robot head over a body that holds the text. The last shape, **icon**, draws the
  element as its icon with its label outside; choosing it opens the icon picker with the **Icon**
  placement ([icons](#icons)).
- **Shapes from the keyboard.** F opens the grid on flow and free diagrams: the arrows move,
  typing filters the shapes by their name in the interface language or in English, Enter creates
  the highlighted shape near the centre and makes it current, and Escape closes. Every shape has a
  keyboard path, such as F, `hex`, Enter, then B or N for the next one, or F, `agen`, Enter for an
  agent. Sequence diagrams keep F for fragments.
- **Arrow kinds.** The arrow button is split the same way: its menu lists `->`, `-->`, `<->` and
  `<-->` with their pictures, and a choice arms the relation tool with that kind. R arms the tool
  with the current kind; while it is armed, R again moves to the next kind, which the status line
  and the badge beside the pointer name. Shift on the second click still flips solid and dashed,
  and connection handles keep writing `->` (`-->` with Shift). C4 views offer the one-way kinds.
- **Containers.** The **Group** button is split too: its menu offers **Group**, a band with a
  title, and **Container**, a plain rectangle without one. A choice becomes the current kind and
  arms the tool, and G creates the current kind near the centre; Alt+G still groups the selection
  with a title. A container is written `group <id> "" { }` with its `place` and `size`, inside the
  group under the pointer, and is selected without opening the label editor: fill, stroke and
  corner radius are set in the strip as for any group. What you drop inside it moves into it, and
  it carries its children when it moves, in flow diagrams as in free compositions.
- **Convert to container.** A flow node or a free box drawn behind other boxes is only drawn
  behind them: they are stacked on it, and it does not hold them. **Convert to container**, in the
  context menu and beside **Inside** in the inspector, rewrites it as a group with the same id,
  label and description, and moves into it the boxes stacked on it (whole inside its box, declared
  after it, on its layer), in one edit: `node3[""]` with a database on it becomes
  `group node3 "" { db[("Database")] }`. Its styles keep everything but `shape`, since groups are
  rectangles: `square` and `rectangle` become `radius 0`. Its `place` and `size` stay, and a size
  is written when it had none; relations to it keep their ends. A node with named ports is refused
  until they are removed. The status line names the container and what it holds, and
  **Ungroup** turns it back into its children.
- **Stacks.** When you drop a box whole on a node or box that is not a group, the box keeps its
  group and the status line says that it is stacked on the other and that converting that one to a
  container would move them together.
- **Opening the menus.** The two parts of a split button share one outline with a divider between
  them. The arrow part is a chevron as tall as the button, wide enough to hit easily, and each part
  shows hover and keyboard focus on its own; its tooltip names the menu and its key, "More shapes
  (F)", "Kinds of arrow (R cycles)" and "Group or container (G)". A right-click on the main part, or a press of half a
  second (450 ms), opens the same menu without arming the tool; a short click arms the tool with
  the current shape or kind.
- **Read-only.** A read-only canvas shows no arrows on the split buttons, and F does nothing.
- **Into and out of groups.** While you drag a selection, the innermost group under the centre of
  the selection's box is highlighted as the drop target, like a connection target; the dragged
  elements and what they hold are left out, and hidden layers are skipped. On release, every
  dragged element whose group changes moves into that group's block, or to the top level when the
  centre is outside every group, with its block and its comments, and its `place` is written in
  the new group's interior, so it stays where it was dropped: one edit, one undo step. Alt keeps
  the groups, and the arrow keys never change them. The drawing stays put: dragging every child of
  a group that has no `place` moves the group with them; a group left empty without `place` or
  `size` gets its drawn place and size written; a placed free group without `size` gets its drawn
  size written when it gains or loses a child; and an element keeps a group on a hidden layer while
  its centre stays inside it. A group dropped from the palette inside a group nests in it. Sequence
  diagrams and C4 views keep their elements' groups.
- **Inside.** The inspector's **Inside** field shows an element's group, or none, and moves the
  element into another group, or to the top level, where it is drawn; the groups it offers never
  include the element or a group inside it. Beside it, flow nodes and free boxes have **Convert to
  container**.
- **Covered shapes.** A click selects the shape painted on top. Alt+click selects the shape below
  it, and the next one down on each Alt+click, cycling through the stack under the pointer; the
  context menu has **Select the shape below**. Ctrl with the arrows prefers the nested shape when
  two share a centre, and Tab, Ctrl+A and the selection rectangle reach every element.
- **Corner radius.** The strip's **Corner radius** is a slider with its number, from 0 to 64. It
  shows wherever corners are drawn: `rounded`, `rectangle`, `square` and `framed` boxes and nodes,
  the polygons (a hexagon, a star, a flag…) and decisions, persons and agents, notes, the frames of
  free texts, icons and images, and groups. Ellipses, circles, pills, cylinders, clouds and
  documents have no corners and no slider. Greyed, it shows the radius drawn: the theme's `radius`
  on `rounded` boxes, notes and frames, its `groupRadius` on a group (14 in `technical.light`), the
  body radius of a person or an agent, 0 on the other corners, or a rule's. Moving it writes
  `style g { radius 0 }` or `style h { shape hexagon; radius 10 }`; a number out of range is
  refused and the text stays as it was.
- **Rotation.** A selected element of a flow diagram or a free composition shows a rotation handle,
  a disc beyond its top-right corner. Drag it round the element: nothing turns until the pointer
  has moved a few pixels, so a click on the handle changes nothing; then the element turns by as
  much as the pointer has turned about the centre of its box since the press, in 15° steps, Alt for
  any angle, with the angle beside the pointer and in the status line. The element, its outline
  and its connectors follow the pointer at every frame, without easing; the release writes
  `style api { rotation 90 }` in one undo step and eases into it, 0 removes it, and Escape
  cancels. In a diagram with `layout auto` the first rotation writes the arrangement first, as
  the first move does, so the turned element stays where it is. The strip's **Rotation** is a slider with its
  number, from 0 to 359, greyed at 0 or a rule's angle, and the context menu has **Rotate 90°** and
  **Reset rotation**. A turned element is selected and hit by its turned outline; its selection,
  its resize and connection handles, its magnets and the text editor turn with it; resizing works
  in its own frame and keeps the opposite edge in place, without grid snapping; a connector end
  dropped on it is written on its own sides (`api.north 50%`). Groups have no handle.
- **Shape.** The strip's **Shape**, for free boxes and flow nodes, shows each shape as a picture
  named in the interface language; greyed, the shape drawn. Choosing the ellipse writes
  `style a { shape ellipse }`.

## Free compositions

The palette follows the diagram: flow diagrams offer node, decision, data store, note, tag, group
and icon; free diagrams offer box, text, icon, image and group. The box and node buttons open the
shapes ([shapes and containers](#shapes-and-containers)).

- **Icons.** The icon button and I open the icon picker ([icons](#icons)). With **Only the icon**,
  a choice placed with Enter becomes `icon icon1 "tabler:server"` near the centre; **Icon** and
  **In a box** write a box with the icon, as flow diagrams write a node.
- **Images.** Placing an image opens a file dialog; the file must be inside the project, and its
  path is written relative to the `.meltemi` file. Image paths also complete in the code.
- **Text.** The inspector has **Text size**, **Text weight** and **Text alignment** fields; icons
  and images have their **Icon** or **Image file** field instead of a label.
- **Links.** **Linked to** writes `link <diagram>.<element>`. Go to definition on a link opens the
  linked element, in this file or an imported one. **URL** writes `url "…"`, a hyperlink that SVG,
  PDF and HTML exports keep (every profile, and the model's entities in C4 views); the canvas never
  follows it.
- **Converting.** **Convert to Free Composition** (Arrange menu, context menu and command palette)
  copies the flow diagram shown into a new free diagram in the same file, as drawn, with a link
  from each object to its source, and shows the copy.
- **Copying.** A child copied without its group carries the position it is drawn at.

## Sequence diagrams

The canvas keeps the order of events ([sequence.md](language/sequence.md)); nothing on it writes
coordinates.

- **Palette.** Participant (P), actor (A), the other participant kinds in **More participants**,
  message (C, or drag from a head's connection handle), note (O), fragment (F, which asks for the
  operator), divider and delay, and group. A participant goes where it is dropped among the
  others; notes, dividers and delays go after the selected event, or at the end.
- **Heads.** A participant, database, collections or queue is selected, outlined, pulsed and
  edited on the box it is drawn as, at the bottom of the row of heads, whether or not an actor
  shares the diagram; an actor and the other figures on their figure and name.
- **Dragging.** Drag a head sideways to reorder the participant; no message changes. Drag a
  message, note or fragment down to add `space` above it, or up to take it away; it stops at its
  neighbour, so a drag never reorders events. Alt drags without the grid.
- **Moving events.** Alt+Up and Alt+Down move the selected event past its neighbour, into the
  nearest branch of an adjacent fragment, or out of the fragment at its edge. A move that would
  deactivate a participant that is not active, or break a lifecycle, is refused with the reason.
- **Activations.** Alt+A on a selected message activates its receiver (or the selected
  participant) right after it and deactivates it after its reply; again, it removes the pair.
- **Arrow keys.** Left and Right swap the selected participant with its neighbour; Up and Down
  change the space above the selected message, note or fragment.
- **Inspector.** Messages: **Message** (call, reply, async) and **Space before**. Notes: **Text**,
  **Position**, the participants and **Space before**. Fragments: **Operator**, one **Condition**
  per branch and **Space before**. Participants: **Kind** and **Gap before**. The diagram:
  **Number messages from** (`autonumber`).
- **Scenarios.** When the diagram has scenarios, the toolbar offers them beside **All events**.
  Picking one previews that path read-only; pick **All events** to edit again. **Export SVG** asks
  for "All events" or a scenario and writes `<file>.<scenario>.svg` for a scenario.
- **Language features.** Completion knows the sequence statements, participants after arrows and in
  events, note positions, fragments and their conditions in scenarios, and `kind async`. Hover
  describes events and scenarios; go to definition, references and rename follow the ids of notes
  and fragments; quick fixes declare an unknown participant and remove a stray `deactivate`.

## C4 views

A C4 view draws entities of a model ([c4.md](language/c4.md)); what the canvas creates is
declared in that model, in this file or in the model's own file.

- **Creating.** The palette offers the kinds the view's level draws: **Person** and **Software
  system** on a context view, **Container** and **Data store** too on a container view,
  **Component** on a component view. A click or a drop declares the entity in the model, inside
  the view's scope for containers, data stores and components and at the model's root for
  persons and systems, with an empty label that the label editor asks for at once; the view
  includes it when it lists `include`, and places it where it was dropped.
- **Adding.** **Add from the model…** (toolbar, A, context menu) lists the entities the view may
  draw and does not; the choice joins `include`.
- **Copying.** Copy, paste and **Duplicate** declare copies of the selected entities in the model,
  with their label, technology, description and `external`, under their id or `<id>_2`; their
  relations are not copied.
- **Removing.** Delete removes an entity from the view (out of `include`, or into `exclude`) with the
  view's statements that name it; the model keeps it.
- **Relations.** The arrows are the model's, and the canvas writes them there. Dragging from a
  connection handle, the relation tool and **Connect to…** write `a -> b` into the model (`->` is
  the one kind a model accepts; Shift changes nothing here). Dragging an end of an arrow onto
  another entity moves that end of the model relation, and its routes in every view of the
  project follow: the moved end is rewritten, a compass side carries over, a point of the old
  side does not, and the waypoints stay; a view that would stop drawing the relation loses its
  route, and a move that would break a view of another file is refused. An arrow that combines
  several model relations keeps its ends. Delete removes the model relation with everything that names it,
  asking first when another view draws it, a statement names it, or an entity the view drew only
  for that relation leaves with its statements. Styles, effects, routes, bends and label
  positions on a relation the model did not name first name it there; on a combination without
  an id, they name it in the view (`as shop_web_shop_api_orders`).
- **Labels.** Editing a label writes `label <entity> "Text"` in this view only, except on an entity
  whose label the model leaves empty (one just created), where it is the model's label. On an
  arrow it fills the model relation's label when it has none, and writes the view's local label
  otherwise.
- **Moving between systems.** An entity sits where the model declares it: moving it into another
  system or container is done in the model's text.
- **Moving.** Dragging, the layout modes and Arrange write the view's placement only.
- **Inspector.** Elements show their path and kind, the label in this view, and the entity's label,
  description, technology and `external`, which are written into the model: in this file, or in
  the model's own file, which the inspector names. Relations show their sources (the model
  relations they stand for), their style and effects, and their id, which names or renames the
  model relation. The view shows its level, scope and model.
- **Another file.** When the model is in another file of the project, the edit reaches both files
  in one step: the model's and the view's own statements. The status line names the model's file,
  and Ctrl+Z undoes both from the view's file.
- **Renaming.** Renaming an entity from the canvas, or with Rename Symbol in a model, a view or a
  link, renames it in every file of the project. **Open the Model** (context menu, command
  palette) shows the model of the view.

## Styling and themes

- **The style strip.** The top of the inspector styles the selection: **Fill**, **Stroke** and
  **Text colour** as rows of chips, then line and stroke width; for elements that take them, the
  corner radius, the shape and the icon position; for relations, the heads at both ends, the
  route kind and the corners; and the **Effects** row, which says at its right "off" or the effects
  that are on, with their toggles beneath. Several selected items are styled together in one edit;
  a row shows "mixed" where their values differ.
- **Pictures, not words.** The line (solid, dashed, dotted), the route kind (automatic, straight,
  elbow, curved), the corners (sharp, rounded) and the shapes are rows or grids of pictures;
  **Default** inherits again.
  **Start arrowhead** and **End arrowhead** are buttons showing the current head; each opens a
  grid of every head (triangles, diamonds, circles, bars, crosses and the crow's feet of ER
  diagrams). Arrows move in a row or the grid, Enter chooses, Escape closes. For a relation, solid
  and dashed rewrite its arrow (`->`, `-->`, or `<->`, `<-->` when it is two-way) and dotted
  writes `line dotted`.
- **Tokens, colours and the theme.** The chips are the theme's sixteen colour tokens, drawn in the
  colours the diagram's theme gives them, so a custom theme shows its own. A chip writes the
  token (`style api { fill accent }`), which follows the theme when it changes; the colour picker
  beside the row writes a fixed colour (`stroke "#E8A33D"`); **Theme** removes the property so the
  item inherits again. Arrows move between the chips, Space or Enter chooses.
- **Icons.** **Choose…** on the **Icon** field opens the canvas's icon picker under it, for the
  elements and relations of flow diagrams, free compositions and C4 views, and writes
  `style <id> { icon "tabler:server" }`; **Remove** takes the icon away. Sequence diagrams, whose
  participants and messages draw no icons, have no **Icon** or **Icon colour** field. Icon
  position, Label position and Icon size are described under [icons](#icons).
- **The diagram's theme.** With nothing selected, the strip starts with the **Theme** field. A
  built-in theme offers its counterpart in one click (**Dark** for `technical.light`), which writes
  `theme "technical.dark"`.
- **New theme from this one…** asks an id and where the theme lives. **This file** adds
  `theme <id> { extends "<current>" }` after the file's other themes and points the diagram at it.
  **The project** (a saved file in a project) writes `themes/<id>.meltemi` and sets
  `"theme": "themes/<id>.meltemi#<id>"` in `project.json`, keeping its formatting, so every diagram
  without its own `theme` follows it; the diagram's own `theme` is removed. Either way the theme
  panel opens on the new theme.
- **The theme panel.** **Edit theme…** (when the theme is a block of the file or the project)
  lists the theme's tokens by group: colours, fonts, type, spacing, shapes and lines, icons, frame,
  motion and canvas. Each shows the written value, or the base theme's greyed. A change writes the token
  into the block, in the file that holds it (the status line names it); **Inherit** or an empty
  value removes it. **Text font** and **Code font** offer the bundled families and the project's
  `assets/fonts/`, which exports embed; a stack written by hand shows as "custom" and stays.
  Classes and rules stay in the code. **Done** returns to the inspector.

## Effects

- **Inspector.** A selected element, relation, message, note or fragment lists the effects it can
  take, as toggles under the **Effects** row of the style strip: **Flow particles** (relations), **Moving dash** (relations
  and boxes with an outline), **Pulse** and **Trace** (relations: a highlight that fills the arrow
  from its start to its end, then starts again). Turning one on writes `animate <id> { effect … }`;
  its duration, repeat, delay and, where they apply, direction, particles and colour are written
  into the same statement. The speed shows, greyed, the theme's default (`flowDuration`,
  `dashDuration`, `pulseDuration`, `traceDuration`, or the engine's 1200, 1000, 1000 and 1500 ms). Turning it off removes it. A statement
  shared by several targets is split when one of them changes.
- **Pause and play.** A diagram with effects runs them on the canvas from the moment it is shown,
  as the animated SVG export would (`docs/language/motion.md`). The toolbar's **Pause effects**
  (❚❚) shows the static drawing and becomes **Play effects** (▷); the choice is kept for that
  diagram of the file, so a paused diagram is still paused after a reload. Under reduced motion a
  diagram starts paused until Play is pressed. Without effects the button is disabled. Turning an
  effect on while the diagram is paused says so in the status line. Selection, editing and live
  previews keep working while effects play.

## Stories

- **Story picker.** When the file has stories, the toolbar offers them beside the diagram picker.
  Picking one enters story mode: the canvas plays the story read-only, with the palette, **New
  diagram**, the inspector and the minimap put away; zoom and pan still work. **Edit the
  diagram** leaves it.
- **Timeline.** Below the canvas, one row per scene shows its transition and actions as bars on
  the story's clock; a `parallel` block's actions are stacked. ▷ plays and pauses (Space or K in
  the timeline), the ruler scrubs, Left and Right step 100 ms (a second with Shift), Home and End go
  to the ends. Frames are drawn in the webview with the exporter's functions, so they match
  `meltemi-diagrams export --story <id> --at <time>` exactly.
- **Editing from the timeline.** Dragging the right end of a bar writes the action's time
  (`over 1200ms`, `hold 3000ms`, or the transition's `over`), in steps of 100 ms. Clicking boxes on
  the frame selects them; **Add to scene** appends the chosen action for the selection to the scene
  at the playhead (`focus` and `camera` without a selection write `all`; `hold` writes
  `hold 1000ms`). The ☐ button adds a scene after the current one, and ✕ (or Delete) removes the
  selected bar. Each change is one edit of the text, undone like any other. **Export HTML** writes
  the story's HTML player beside the file.

## Deleting, copying and grouping

- **Delete.** Deleting checks what depends on the selection first. When relations, positions,
  routes, styles or constraints use it, a dialog lists them, and **Delete all** removes them in the
  same edit.
- **Copy.** Copying puts a complete `.meltemi` fragment on the clipboard: the selected boxes (groups
  with their children), the relations among them, their positions, routes and labels, and their
  styles. You can paste it into any `.meltemi` file as text.
- **Paste.** Pasting on the canvas gives clashing ids a `_2`, `_3`… suffix and places the copy two
  grid steps off, or under the pointer when you paste from the context menu.
- **Duplicate.** Duplicate is copy and paste in one step.
- **Group and ungroup.** **Group** (Alt+G) moves the declarations of the selected sibling boxes into
  a new `group group1 "Group" { … }`. **Ungroup** replaces a group with its children.

## Commands

| Command                                     | What it does                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Canvas to the Side, Open Canvas        | Opens the canvas, beside the code or in place                                                                                                                                                                                                                     |
| Show Source                                 | Shows the code of the canvas's file                                                                                                                                                                                                                               |
| Export SVG                                  | Writes the SVG of each diagram of the current text (unsaved changes included) beside the file, asking which scenario of a sequence diagram with scenarios; diagrams with problems are skipped and reported                                                        |
| Export HTML Player                          | Asks which story or diagram of the file to play and writes its HTML player beside the file (`docs/player.md`)                                                                                                                                                     |
| Export PNG, Export PDF                      | Writes the PNG (twice the size) or the PDF of each diagram beside the file through the installed Edge or Chrome (the `meltemi.export.browser` setting names another one)                                                                                          |
| Export Video                                | Asks for MP4, WebM or GIF and the story or diagram, then records it beside the file through the browser and FFmpeg, with progress; endless effects last one loop of their cycles, which the message after it names (`meltemi.export.ffmpeg` names another FFmpeg) |
| Generate Diagram with AI…                   | Optional: asks for a file, a description and a profile, shows what will be sent, and writes the accepted proposal (`docs/assist.md`)                                                                                                                              |
| Modify with AI…                             | Optional: asks what should change, shows what will be sent, opens the proposal as a diff and lets you choose its items; one undo step                                                                                                                             |
| Suggest Missing Relations with AI           | Optional: proposes probably missing relations, each written with `assumption "<why>"`                                                                                                                                                                             |
| Explain Changes with AI                     | Optional: explains the changes since the last commit in a Markdown document                                                                                                                                                                                       |
| Set AI Key… / Clear AI Key                  | Keeps the provider's key in VS Code's secret storage, never in files                                                                                                                                                                                              |
| (palette of a declared type)                | Diagrams of a type a plugin declares get its kinds in the palette, completion of their properties and values, and hover on kinds (`docs/plugins.md`)                                                                                                              |
| Build Catalog                               | Builds the offline HTML catalog of the project of the file or folder (`docs/catalog.md`) and offers to open it in the browser                                                                                                                                     |
| Run Export Profile                          | Writes one `export` profile of the file, or all of them, where the profiles say (`docs/language/export.md`)                                                                                                                                                       |
| Arrange Unplaced Elements, Recompute Layout | As above                                                                                                                                                                                                                                                          |
| Open the Model                              | Shows the model of the C4 view on the canvas, or under the cursor, in this file or the imported one                                                                                                                                                               |
| Convert to Free Composition                 | Copies the flow diagram on the canvas, or under the cursor, into a new free diagram and shows it                                                                                                                                                                  |
| Format Document                             | The canonical layout                                                                                                                                                                                                                                              |
| Import from Mermaid or PlantUML…            | Asks for a `.mmd`, `.mermaid`, `.puml`, `.plantuml`, `.pu`, `.iuml`, `.wsd` or `.md` file and imports it as below                                                                                                                                                 |
| Convert to Meltemi Diagram                  | In the explorer's context menu and the editor's title menu for those files: writes `<name>.meltemi` beside the file and opens it with the canvas                                                                                                                  |
| Import Selection as Meltemi Diagram         | In the editor's context menu: imports the selected Mermaid or PlantUML text (asking the language when it cannot tell) into a sheet you name                                                                                                                       |

## Importing

When the sheet already exists, the import asks whether to **Merge**, keeping its placement,
styles, classes, animations, scenarios and local labels for everything still in the source, or to
**Replace** it. Every construct that was approximated or dropped is listed in the **Meltemi
Import** output and shown in the Problems view on the source's lines until the source is imported
again or closed. A partial import (something essential could not be imported) says so with
**Show Findings**. What each language maps is in [docs/import/](import/mermaid.md).

## When something looks wrong

| Symptom                                      | Cause                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The canvas is dimmed and says "Out of date"  | The text has errors; the canvas keeps the last good picture until they are fixed                                                                                |
| A gesture is refused with "The text changed" | You typed while dragging; the canvas shows the new text, try again                                                                                              |
| Boxes move when one box moves                | The diagram was `layout assisted` with unplaced boxes, which ELK keeps arranging around the placed ones; give them positions with **Arrange Unplaced Elements** |
| The canvas does not open beside the code     | You closed it before; use **Open Canvas to the Side**, or set `meltemi.canvas.openWithText`                                                                     |
| A box dragged over a group went into it      | A drop moves the box into the group under the selection's centre; drag it out again, or hold Alt while dragging to keep its group                               |
| A box under another cannot be clicked        | The click takes the shape on top; Alt+click selects the one below, or use Tab                                                                                   |
| `layout.overlap` on boxes stacked on purpose | The inner box is declared before the outer one; bring the inner box to the front, or declare the outer one first                                                |
| A dashed square with an id where an icon was | The element has `shape icon` but no `icon` (`layout.icon-missing`); give it one with **Icon…** or the inspector's **Choose…**, or choose another shape          |
| Connectors stay behind a dragged box         | The drop would be refused there, such as a C4 element across a boundary, or would leave errors in the text; the boxes move alone until the drop                 |
