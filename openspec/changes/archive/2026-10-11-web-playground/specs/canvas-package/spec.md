## ADDED Requirements

### Requirement: Canvas package
`@meltemi/diagrams-canvas` SHALL hold the canvas application: `CanvasApp`, its toolbar, palette,
inspector, menus, dialogs, minimap, story panel and `canvas.css`. `new CanvasApp(root, host, mac)`
SHALL take the element to draw in and a host with `post(message)`, `getState()` and
`setState(state)`, and `receive(message)` SHALL take the host's messages. The package SHALL depend
on no host: no VS Code API, no Node module and no global other than the DOM. The VS Code webview
and the playground SHALL both mount it.

#### Scenario: Two hosts
- **WHEN** the extension's webview bundle and the playground bundle are built
- **THEN** both contain the `CanvasApp` of `@meltemi/diagrams-canvas`, and the extension's webview tests pass against it

### Requirement: Stylesheet shipped by hosts
`canvas.css` SHALL read its colours from `--vscode-*` variables with fallbacks, so VS Code themes it
and other hosts define the variables. Hosts SHALL ship the stylesheet from the package; the
extension SHALL ship it as `dist/canvas.css`.

#### Scenario: Extension stylesheet
- **WHEN** the extension's canvas page is built
- **THEN** it links `dist/canvas.css`, which equals the package's `canvas.css`
