## Why

Trying 1.8.0, the owner found icons too rigid next to draw.io. An icon in a box sits only at the
left of the text or above it, in one size, the theme's `iconSize` token; there is no way to put it
at the right or below, to centre it as the picture of the box, or to make it bigger. A shape that
is just an icon with its label beside it — how provider icons are drawn in architecture diagrams —
does not exist outside free compositions, and there the `icon` object has no text. And adding an
icon takes a detour: the Libraries panel creates a box with an icon but is hard to find; the
inspector's Icon field opens a host dialog; the free palette's I creates a bare icon; flow
diagrams have no icon tool at all; nothing lets you drop an icon onto a box you already drew.

The owner also set a standing expectation: every visible change must be finished to a high UI/UX
standard, with the animations and transitions that make it feel professional.

## What Changes

- **Five icon positions and a label position.** `iconPosition` takes `left`, `right`, `top`,
  `bottom` and `center`. With `center` the icon is the picture of the box, as large as the box
  allows, and the label sits at the edge named by `labelPosition` (`top`, `bottom`, `left`,
  `right`; `bottom` by default).
- **Icon size per element.** `iconSize auto | <n>` (8 to 128 px) on nodes, decisions, data
  stores and boxes: a number grows a box without `size` to hold it; `auto` fits the box; the theme
  token stays the default beside text.
- **The icon as the shape.** `shape icon`, the twenty-fourth shape, draws an element as its icon
  alone — no box unless `fill` or `stroke` frames it — with the label outside at `labelPosition`.
  Connectors, magnets, selection and resizing use the icon; the label travels with it. An element
  with `shape icon` and no icon warns `layout.icon-missing` and draws a placeholder.
- **One icon picker in the canvas.** The I tool (flow and free), the inspector's Icon field and a
  new **Icon…** item of the context menu open the same popover: search across the packs and the
  libraries as you type, thumbnails with names, keyboard navigation, and a placement control —
  icon as the shape, icon in a box, or (free diagrams) just the icon — remembered while the
  canvas is open. With a selection the choice sets the selection's icon; without one it arms a
  tool that places the element where you click or drop. Results, like library items, can be
  dragged onto an existing box or node to give it that icon, with the target highlighted. The
  host's own icon dialog is no longer used by the canvas.
- **Libraries that create icon shapes.** The Libraries panel gets the same placement control;
  by default its elements are created as `shape icon` with the label below, as draw.io does.
- **Inspector fields with pictures.** Icon position and Label position are picked from pictures;
  Icon size is a slider with the drawn size greyed as the default and an auto choice.
- **Motion and finish.** Popovers, menus, panels, tooltips, the drop target and the inline editor
  open, close and move with short transitions on shared motion tokens, disabled under
  `prefers-reduced-motion`; the shapes grid, the arrow menu, the New diagram menu and the context
  menu adopt them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `style-classes-and-rules`: `iconPosition` values, `labelPosition`, `iconSize` per element.
- `free-diagram-model`: `shape icon`.
- `free-layout`, `flow-svg-export`: drawing of `center` and `shape icon`; default sizes.
- `diagram-canvas`: the icon tool and picker, drops onto a box, the inspector's icon fields, the
  context menu, motion and finish.
- `free-editor-tools`: the free palette's I creates a box with an icon; `icon` in the shapes grid
  opens the icon picker.
- `element-libraries`: `searchIcons` (pack icons only on C4 views, none on sequence diagrams); the
  placement control; drops onto a box.
- `theme-tokens`: the theme's `iconPosition` takes the five positions.
- `icon-rendering`: the five positions on nodes, decisions, data stores and boxes, `iconSize` per
  element and its gap, the icon shape drawn without the pack's optical scale, `center` on C4
  entities drawn as `top`.
- `quick-styling`: the Icon field opens the canvas's icon picker, on flow, free and C4 diagrams,
  instead of the host's dialog.

## Non-goals

- Icons on relations beyond today's label pill icon, icons on sequence participants, and the
  centred icon and the icon shape on C4 entities, which draw their own kinds and keep their icon
  beside, above or below their text.
- Rotating or recolouring multi-colour provider icons.
- Icons of files outside the project's packs (images already cover them).

This is a post-1.0 change outside `docs/roadmap-1.0.md`; it joins the unreleased 1.8.0.

## Impact

- Model: `ICON_POSITIONS`, `LABEL_POSITIONS`, `iconSize` and `labelPosition` style properties,
  `BOX_SHAPES` + `icon`. Layout: icon placement for the five positions, the icon shape, auto
  sizing, `layout.icon-missing`, `layout.label-position-ignored`. Editor: `searchIcons`, the
  create action's placement, the inspector fields, no host `pickIcon` for icons. Canvas: the
  picker popover, the I tool in flow, drops onto elements, the placement control, motion tokens.
  Hosts: the playground and VS Code stop answering `pickIcon` for the canvas (images unchanged).
- Docs: `docs/language/styles.md`, `free.md`, `assets.md`, `docs/editor.md`, their Spanish
  versions, the skill, CHANGELOG 1.8.0.
