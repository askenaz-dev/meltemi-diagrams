# 0074. Quick actions live in the context menu, and automatic layout asks before it removes positions

Status: accepted (context-actions-and-layout-menu change, 7 November 2026). Builds on decisions
[0015](0015-layout-engine.md), [0044](0044-containers-from-the-canvas-and-arrangements-that-keep-the-picture.md),
[0057](0057-panel-and-effects-polish.md) and [0062](0062-inspector-collapse-and-tooltips.md).

## Context

On 7 November 2026 the owner reviewed Mermaid Chart's visual editor, which puts a floating bar over
a selected edge (animate, reverse, line, colour, "Goto Code", delete), chips for the layout above
the canvas (algorithm, direction, an Auto layout switch) and a rail of navigation buttons, and asked
which of these Meltemi should have. Meltemi already had every capability but one: effects in the
inspector's Effects tab, routes and lines in the strip and the context menu, the layout modes in the
inspector with nothing selected and in the Arrange menu, `autonumber` as a number field, and Show in
text in the context menu. Reversing a connector had no operation: it was done by hand in the text.
The badge that names the layout mode was a label only.

The owner decided against a floating selection bar, which would repeat the context menu and add
noise over the drawing, against layout chips and a navigation rail, and against moving any control:
every action is added beside what exists, with one click and no typed input. They asked that
returning to automatic layout after moving things by hand warn that those positions will be lost,
in English and Spanish.

## Decision

1. **The context menu is the home of quick actions.** Every editing menu (flow and free, sequence,
   C4, gantt) lists the effects the selection takes as checkbox items, **Flow particles**, **Moving
   dash**, **Pulse** and **Trace**, after the selection's own items. The inspector keeps every
   setting of an effect. A floating bar was rejected for the reasons above.
2. **Effect items come from the inspector model.** The canvas reads the `effect.<e>` fields the
   editor already sends for the selection, and a choice posts the inspector's own `setField`, so
   naming an anonymous target, splitting a shared statement and refusals stay the editor's. A menu
   opened on a selection whose properties have not arrived is drawn again when they do. A new
   message listing effects, or effect rules copied into the canvas, were rejected: the rules depend
   on styles the canvas does not see.
3. **`Menu` has checkbox items.** `MenuItem.check: "checkbox"` renders `menuitemcheckbox`, a small
   box filled with a check while on; radio items stay as they were, and the checked radio item is
   still focused first. Submenus were rejected: one click, a flat menu.
4. **`reverseRelation` is one edit operation for three statements.** A flow relation swaps its
   references, swaps the two endpoint texts of its `route` whole (element, port, side and point
   together) and mirrors its waypoints, and a placed label moves from `p%` to `(100 − p)%`; a
   sequence message does the same, keeps a reply a reply and its call block, and renames a written
   activation of its receiver right after it, with its `deactivate`; a free line has its points
   mirrored as text. Styles, effects and tags name the relation and stay. A self relation, a
   `return` and a C4 view's relation are refused with `edit.unsafe-target`; a view's relations
   come from the model, where they would be reversed. Composing `reconnectRelation` twice was
   rejected: it passes through an invalid state and drops named ports.
5. **Numbering is a toggle.** **Number messages** writes `autonumber` alone, the canonical form,
   which `setDiagramProperty` now writes for the empty value, or removes the statement whatever its
   start; the render tells the canvas whether a sequence diagram is numbered, and VS Code offers the
   same as the command **Number Messages**. The inspector's **Number messages from** stays for
   another start.
6. **The badge is the layout's menu.** On a canvas that edits a flow diagram, a free composition or
   a C4 view, the badge is a button (`aria-haspopup="menu"`) with the three modes as radio items and
   **Arrange unplaced elements** and **Recompute layout**; elsewhere it stays a label. A new chip
   would duplicate it.
7. **The editor decides the mode, and the confirmation is a refusal.** `setLayoutMode` (and the
   inspector's Layout field with nothing selected): `assisted` writes the statement; `manual` first
   writes the places the engine gives unplaced boxes, so the diagram compiles and keeps its picture;
   `auto` writes the mode and `clearPlacement` in one edit. When `clearPlacement` would remove
   anything, the session answers `edit.loses-placement` with the counts and a retry carrying
   `confirmed: true`, and the canvas shows **Back to automatic layout** / **Volver al orden
   automático** with **Cancel** focused and **Arrange** / **Reordenar**. Counting places in the
   canvas was rejected (it cannot tell bands, list children or routes), and so was keeping the
   ignored places, which would leave a file that no longer matches its picture.
8. **`clearPlacement` removes exactly what `auto` ignores.** The places of arranged elements and
   groups and the waypoints of routes, the same set the layout reports as
   `layout.placement-ignored`; bands, what a list holds, sizes, named ports, sides and points stay;
   a route or a `placement` block left with nothing goes, unless a comment is written in the block.
9. **Words.** Spanish says "ruta" for routes in the confirmation, as the canvas does elsewhere:
   "Recorrido" is already the name of the trace effect.

## Consequences

- Effects, reversal and numbering are one click from the drawing, and the inspector and toolbar are
  unchanged.
- Returning to automatic layout never removes hand-made positions silently, and one undo brings
  them back.
- A menu opened by a right click on an unselected item shows its effect items a moment after the
  rest, when the editor's answer arrives.
- Reversing a relation of a C4 view still means editing the model.
