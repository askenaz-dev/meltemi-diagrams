# canvas-package Specification

## Purpose
The canvas application as a host-neutral package with a host interface, mounted by the VS Code webview and the playground.
## Requirements
### Requirement: Canvas package
`@meltemi/diagrams-canvas` SHALL hold the canvas application: `CanvasApp`, its toolbar, palette,
inspector, menus, dialogs, minimap, story panel, tooltips and `canvas.css`. `new CanvasApp(root, host, mac)`
SHALL take the element to draw in and a host with `post(message)`, `getState()`,
`setState(state)` and an optional `keys` (`{ inspector?: string }`, the host's own key for the
inspector's fold, shown in the canvas's tooltips), and `receive(message)` SHALL take the host's
messages. `CanvasApp` SHALL expose `setInspectorCollapsed(collapsed)` and `inspectorCollapsed`,
which fold and unfold the inspector through its kept state as its own buttons do. The package
SHALL export `Tooltips` (`new Tooltips(root, { except? })`: the bubble that shows a control's
`title` after `TOOLTIP_DELAY`, ignoring controls inside the elements `except` selects) and
`ariaKeyshortcuts(shown)`, so a host draws its own controls' tooltips with the canvas's bubble and
states their keys as ARIA writes them. The package SHALL depend
on no host: no VS Code API, no Node module and no global other than the DOM. The VS Code webview
and the playground SHALL both mount it.

#### Scenario: Two hosts
- **WHEN** the extension's webview bundle and the playground bundle are built
- **THEN** both contain the `CanvasApp` of `@meltemi/diagrams-canvas`, and the extension's webview tests pass against it

#### Scenario: A host folds the inspector
- **WHEN** a host calls `app.setInspectorCollapsed(true)` and then reads `app.inspectorCollapsed`
- **THEN** the inspector is a rail, the host's `setState` received `inspector: false`, and the property reads `true`

#### Scenario: A host's bubble beside the canvas's
- **WHEN** a host creates `new Tooltips(document.body, { except: "#app" })` and the pointer rests on a canvas toolbar button
- **THEN** only the canvas's bubble shows, and on a button of the host's own the host's bubble shows the button's title after 400 ms

#### Scenario: The key as ARIA writes it
- **WHEN** `ariaKeyshortcuts` is given "Ctrl+Alt+B", "Cmd+Alt+B", "Mayús+1" and "L"
- **THEN** it returns "Control+Alt+B", "Meta+Alt+B", "Shift+1" and "L", and an empty string gives an empty string

### Requirement: Stylesheet shipped by hosts
`canvas.css` SHALL read its colours from `--vscode-*` variables with fallbacks, so VS Code themes it
and other hosts define the variables. Hosts SHALL ship the stylesheet from the package; the
extension SHALL ship it as `dist/canvas.css`.

#### Scenario: Extension stylesheet
- **WHEN** the extension's canvas page is built
- **THEN** it links `dist/canvas.css`, which equals the package's `canvas.css`

### Requirement: A read-only canvas
`CanvasSettings` SHALL carry `readOnly` (false when absent), delivered through the `settings`
host message and switchable at run time. While it is true, `act()` SHALL drop every action so
no plan reaches the host, inline editing of labels and ids and the inspector's `commit` SHALL
be no-ops, the palette and the other editing controls SHALL be hidden as in story mode (the
`data-edit` hiding), and drags, connections, deletions and keyboard edits SHALL leave the
diagram as it is; selection, zoom, pan, the minimap, stories and effects SHALL work. A host
that never sends `readOnly` (VS Code) SHALL see no change.

#### Scenario: No plan in read-only mode
- **WHEN** the canvas is read-only and the person drags an element
- **THEN** the element stays where it was and the host receives no plan

#### Scenario: The inspector does not commit
- **WHEN** the canvas is read-only and a field is changed in the inspector
- **THEN** no `setField` action is posted

#### Scenario: Stories still play
- **WHEN** the canvas is read-only and a story is chosen
- **THEN** it plays as in edit mode

#### Scenario: Switched back at run time
- **WHEN** a `settings` message with `readOnly: false` arrives
- **THEN** the palette returns and a drag sends a plan again

