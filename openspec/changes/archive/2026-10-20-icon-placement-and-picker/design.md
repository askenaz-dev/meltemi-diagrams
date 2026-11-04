## Context

- `ICON_POSITIONS = ["left", "top"]` (`packages/model/src/schema.ts`); `iconSize` is a theme
  token (8..64); `Sizing.iconOf` (`packages/layout/src/layout.ts` ~2055) places a box's icon at
  `theme.iconSize` left of or above the text block, groups, tags and notes at 1.3 × their text
  size; `shape()` draws the icon row or column inside the shape's text area.
- Free `icon` objects are 48 × 48, textless. There is no icon tool in flow diagrams.
- The inspector's Icon field asks the host (`pickIcon`): a dialog in the playground
  (`packages/playground/src/dialogs.ts`), a QuickPick in VS Code. The editor already has
  `iconChoices(analysis, query, limit)` for that dialog, and the session answers
  `librarySearch` across libraries with thumbnails.
- The Libraries panel (`packages/canvas/src/library.ts`) creates a node or box labelled as the
  item with `style <id> { icon }`; a drag onto the canvas creates where it ends; it never targets
  an existing element.
- The canvas has one transition today (the split-button chevron, 120 ms).

## Goals / Non-Goals

**Goals:** icons where the owner expects them (five positions, centred as the picture, as the
shape itself), sized per element; one way to find and apply an icon from anywhere in the canvas;
icons dropped onto existing shapes; a finished, animated feel for every popover, menu and panel.

**Non-Goals:** icons on sequence kinds, and the centred icon and the icon shape on C4 kinds (C4
entities keep their icon beside, above or below their text, chosen with the Icon field's picker);
multi-colour icon recolouring; rich labels.

## Decisions

### Properties

- `iconPosition left | right | top | bottom | center` on nodes, decisions, data stores and boxes
  (relations keep refusing it). `right` and `bottom` mirror `left` and `top`: the icon and the
  text form one row or column centred in the text area.
- `labelPosition top | bottom | left | right` on the same kinds, default `bottom`. It says where
  the label sits when the icon is the centre piece: inside the box at that edge for
  `iconPosition center`, outside the icon for `shape icon`. Elsewhere it has no effect and the
  layout reports `layout.label-position-ignored` (warning, hint: set `iconPosition center` or
  `shape icon`), as `layout.placement-ignored` does for ignored places: once per statement, once
  on the diagram's `theme` for a theme's rule or class, and with the hint to remove it on the
  kinds whose icon is never the centre piece (groups, tags, notes, texts, icons, images, C4
  entities). *Alternative:* folding the
  label side into `iconPosition` (rejected: `center` needs a side, and a second axis reads better
  in the inspector).
- `iconSize auto | <n>` (8 to 128, px or unitless) on the same kinds; a new value spec "a keyword
  or a number", as `repeat` is `forever` or a number. Defaults: the theme's `iconSize` beside text
  (`left`, `right`, `top`, `bottom`); `auto` for `center` and `shape icon`. A number in a box
  without `size` grows the box to hold the icon with the text; with a written `size` the icon is
  clamped to the space it has, never cut. The theme token keeps its 8..64 range.

### Drawing

- **`center`.** The label (and the description under it) takes a band at the `labelPosition`
  edge, inside the box, `padding` from the edge; the icon is centred in the remaining area; its
  auto size is the largest square that fits that area with `padding` around it. A node or box
  with `iconPosition center` and no `size` takes 120 × 120 (scaled with the label size), widened
  for a long label. In a written `size` short of room the margin shrinks to half the padding; an
  icon that still stays under 8 px is `layout.text-overflow`, never a silent blank.
- **`shape icon`.** The element's box is the icon's square: `size` or `iconSize` set it
  (`iconSize` a number = the side; `auto` = the default 64 at label size 13, scaled); with both,
  `size` wins and the icon fits it (`xMidYMid meet`). Nothing is drawn behind the icon unless
  `fill`, `stroke` or `pattern` is set, which frames it like a free text's frame, with the radius
  rules of boxes: the frame's inset (half the padding) grows the default square on each side, so
  the icon keeps its `iconSize`; a written `size` too small for an 8 px icon inside the frame is
  `layout.text-overflow`. The label is drawn outside the box at `labelPosition`, half `padding` away,
  aligned by `textAlign` (centred by default), the description under it. The element's `box`
  (anchors, magnets, selection, handles, hit test) is the icon; its `bounds` (engine request,
  composition overlap, derived groups, canvas size) are the icon plus the label. The label audit
  treats the label as the element's own text (not cut by the shape, not an overlap with its own
  icon box). Without an `icon` style: `layout.icon-missing` (warning, on the shape property) and
  a dashed placeholder square with the id, as unavailable images draw.
- Free `icon` objects are unchanged (an icon without text); a labelled icon is a box or node with
  `shape icon`.

### The picker

- One popover, `packages/canvas/src/icon-picker.ts`, anchored to what opened it (the I button,
  the inspector's Icon field, the context menu's point): a search field focused on open, results
  as you type (80 ms debounce) grouped by library or pack, each with a 24 px thumbnail and its
  name, the typed `pack:name` offered first when it looks like a reference; arrows move, Enter
  chooses, Escape closes and returns focus. Empty query: the recent icons of this canvas session,
  then the Technology library's first category.
- Data: a new session message `searchIcons { query, token }` answered by
  `icons { token, groups: [{ title, items: [{ reference, label, svg }] }] }`, built from
  `iconChoices` (packs by name and keyword) and the libraries (`searchLibraries`), 60 items at
  most; thumbnails as `librarySearch` gives them. The host's `pickIcon` request is dropped from
  the canvas protocol (image picking stays host-side).
- Placement control (a segmented control with pictures, en/es): **Icon** (`shape icon`, label
  below), **In a box** (the canvas's current shape, icon at the theme's position), and in free
  diagrams **Only the icon** (the `icon` object). Shown when nothing is selected; the choice is
  kept in memory while the canvas is open (default: Icon).
- With a selection of elements that take icons, choosing sets `style <id> { icon }` on each (one
  batch); without one, choosing arms a create tool with the icon and placement: click or drop
  places it (the ghost shows the icon), Enter in the picker creates at the centre. The new element
  is created with an empty label, as shapes are, except the Libraries' labelled items.
- Results and library items are draggable onto the stage: over a node, decision, data store or
  box the target is highlighted like the drop target of a move and the drop writes its icon (and
  nothing else); over empty space the drop creates with the placement control's choice.
- Context menu of a selection: **Icon…** (opens the picker on the selection) and **Remove icon**
  (visible when an element has one; `setStyleProperty icon null`).
- The I key opens the picker on flow and free diagrams and closes it while the canvas has the
  focus. Opening moves the focus into the search field, where I is typed like any letter, so the
  I button, Escape or a click outside closes it.
- With the icon tool armed, a click on a node, decision, data store or box gives that shape the
  icon, as a drop does, instead of creating an element on top of it.
- Choosing `icon` in the shapes grid opens the picker with the **Icon** placement and does not
  make `icon` the current shape: an icon shape needs its icon.
- C4 views: `searchIcons` answers the packs' icons without libraries, and only the inspector's
  Icon field opens the picker there; Icon position offers no `center`, which C4 entities draw as
  `top`. Sequence diagrams draw no icons and get none.

### Inspector

- **Icon**: thumbnail, name, Choose… (the picker) and Remove.
- **Icon position**: five pictures (glyph family `iconPosition`); **Label position**: four
  pictures (`labelPosition`), shown only when the icon is the centre piece (`center` or
  `shape icon`).
- **Icon size**: a number with a slider (8..128) and the drawn size greyed as the default;
  "auto" as a choice (writes `iconSize auto`) and Clear (removes the property).
- The strip shows Icon position after Shape for elements with an icon.

### Libraries panel

The same placement control at the top of the panel; items create with it (default **Icon**:
`lambda1["AWS Lambda"]` + `style lambda1 { icon "aws:lambda"; shape icon }`); dragging an item
onto an element sets its icon. The toolbar button keeps its toggle and gains the tooltip
"Libraries (U)".

### Motion and finish

- Tokens in `canvas.css`: `--mdg-motion-fast: 120ms`, `--mdg-motion: 160ms`,
  `--mdg-motion-slow: 220ms`, `--mdg-ease: cubic-bezier(0.2, 0.7, 0.3, 1)`,
  `--mdg-ease-in: cubic-bezier(0.4, 0, 1, 1)`.
- Popovers and menus (icon picker, shapes grid, arrow menu, New diagram menu, context menu, head
  grids): open with opacity 0→1 and a 4 px rise plus scale 0.98→1 from their anchor side over
  `--mdg-motion`, close over `--mdg-motion-fast`; items of the picker fade in.
- Side panels (Libraries, Layers): slide in 12 px with a fade over `--mdg-motion-slow`.
- Tooltips: fade in after a 400 ms hover delay over `--mdg-motion-fast`.
- Drop target and connect target outlines: fade in; the inline editor's outline fades in.
- Buttons and chips: background and colour transitions over `--mdg-motion-fast`.
- `@media (prefers-reduced-motion: reduce)`: durations 0, no transforms.
- Screenshots of each state (light and dark) are looked at before the work is called done.

## Packages and interfaces

- `@meltemi/diagrams-model`: `ICON_POSITIONS`, `LABEL_POSITIONS`, `STYLE_PROPERTIES.labelPosition`,
  `STYLE_PROPERTIES.iconSize` (keyword-or-number spec), `BOX_SHAPES` + `icon`.
- `@meltemi/diagrams-layout`: `ResolvedStyle.labelPosition/iconSize`, icon placement for five
  positions, the icon shape in `shapes.ts` (outline = its square, magnets = middles and corners),
  `LayoutResult` boxes vs bounds for icon shapes, diagnostics `layout.icon-missing`,
  `layout.label-position-ignored`, messages en/es.
- `@meltemi/diagrams-editor`: session `searchIcons`/`icons`, `create.icon` + `create.shape`
  combined, `setIcon` batch for selections, inspector fields and glyph families, `ElementInfo`
  with `icon` and `takesIcon`; `pickIcon` removed from `SessionResult.pick` for icons.
- `@meltemi/diagrams-canvas`: `icon-picker.ts`, placement control, drop-onto-element,
  context-menu items, glyph families `iconPosition`/`labelPosition`, motion tokens; words en/es.
- Hosts: playground and VS Code drop their canvas icon dialogs (the VS Code text-editor command
  that picks an icon for the cursor's element, if any, keeps its QuickPick).

## Risks / Trade-offs

- [Library default changes from a box to an icon shape] → the placement control is one click
  away and remembered; the CHANGELOG says so.
- [Bounds vs box for icon shapes] → every consumer of `LayoutResult.boxes` keeps the icon box;
  only the engine request, overlap checks and derived groups read the wider bounds; tests pin
  both.
- [Search cost] → 60 results, debounced; thumbnails come from the packs already loaded for the
  drawing, lazily for provider packs as the Libraries panel does.
