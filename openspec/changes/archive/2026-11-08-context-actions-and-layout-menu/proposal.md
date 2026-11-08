# Context actions and layout menu

## Why

The owner reviewed Mermaid Chart's visual editor on 7 November 2026 and asked for one-click
actions inside the drawing: turning an effect on a connector, reversing a connector, numbering
the messages of a sequence diagram, and seeing clearly in which layout mode the canvas is. Meltemi
has every one of these capabilities, but reaching them means a round trip to the inspector or a
field that is easy to miss: the Effects tab, the `layout` enum with nothing selected, the
**Number messages from** field, and a layout badge that is only a label. Reversing a connector
has no operation at all, so it is done by hand in the text.

The owner decided against a floating selection bar (it would only repeat what the context menu
has) and against moving anything: every action here is **additive**, the inspector and the
toolbar keep their current controls, and no new control takes typed input.

## What Changes

- **Effects in the context menu.** The canvas context menu of a selected element, relation,
  free line, pen, sequence message, note or fragment, or C4 relation offers the effects the
  target can take (Flow particles, Moving dash, Pulse, Trace) as checkable items. One click turns
  the effect on with its default values or off, through the same path as the inspector's toggles,
  so an anonymous relation is named first and several selected items are edited together. The
  inspector keeps duration, repeat, delay, direction, particles and colour.
- **Reverse direction.** A new edit operation `reverseRelation` swaps the source and the target
  of a flow relation or a sequence message, and the two ends of a free line, keeping id, label,
  styles, effects and tags, and turning its `route` around (ports, sides, points and waypoints in
  reverse). The context menu offers **Reverse direction** for one selected relation, message or
  line. Relations of C4 views are out of this change: reversing them changes the model.
- **Number messages.** The context menu of a sequence diagram offers **Number messages** as a
  checkable item that writes or removes `autonumber`, and the command palette offers it too. The
  inspector field stays for choosing the first number.
- **Layout badge as a menu.** The toolbar badge that names the layout mode of a flow diagram or a
  free composition becomes a menu button: it shows the mode as today and opens a menu with the
  three modes as radio items (**Automatic**, **Assisted**, **Manual**) and the two arrange
  actions (**Arrange unplaced elements**, **Recompute layout**). Choosing a mode writes the
  diagram's `layout`, as the inspector's field does. The Arrange button and the inspector field
  stay.
- **Confirmation before losing positions.** Setting `layout auto` on a diagram that has written
  positions (`place`, the `place` and `size` of groups) or route waypoints and pinned ends, from
  the badge menu or the inspector, first asks for confirmation in the interface language; on
  confirmation one edit writes the mode and removes those statements, undone as one step. With
  nothing to lose the mode changes directly.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `diagram-canvas`: context menu offers the effects a selection takes and **Reverse direction**;
  the layout badge is a menu with the modes and the arrange actions; the switch to `auto`
  confirms before removing written positions.
- `motion-editing`: the effect toggles reachable from the context menu, with the same naming
  and multi-selection behaviour as the inspector's.
- `source-editing`: the `reverseRelation` operation for flow relations, sequence messages and
  free lines.
- `sequence-editor-tools`: **Number messages** in the context menu and the command palette.
- `layout-actions`: the `clearPlacement` operation behind the confirmed switch to automatic
  mode, which removes exactly what `auto` ignores, and the mode choices of the badge menu
  (**Manual** writes the missing positions first).

## Impact

- `packages/edit`: new `reverseRelation` operation (relations, routes, sequence messages, free
  lines) and the placement-removing plan behind the confirmed switch to `auto`; tests in
  `test/operations.test.ts`, `test/sequence.test.ts` and `test/free.test.ts`.
- `packages/editor`: canvas protocol (a `rejected` code with `retry` for the confirmation, the
  context-menu actions), session handling of the new action and of `autonumber`, command palette
  entry; `test/canvas.test.ts`, `test/sequence.test.ts`, `test/effects.test.ts`.
- `packages/canvas`: context menus of the flow/free, sequence, C4 and gantt profiles, a
  checkable (non-radio) menu item, the badge menu, the confirmation dialog with its EN/ES words;
  `test/` units and the webview suite of `packages/vscode/test/webview`.
- `packages/playground`: browser scenarios for the context menu actions and the confirmation.
- Documentation: `docs/editor.md` and `docs/es/editor.md` (context menu, Effects, Automatic and
  assisted layouts, Sequence diagrams), `CHANGELOG.md`, and decision note 0074 written at apply.
- No change to the language, the exports, the cloud service, the CLI or any published package
  contract. No control is moved or removed.
