## ADDED Requirements

### Requirement: Language contribution
The extension `meltemi-diagrams` (display name **Meltemi Diagrams**, engine `vscode ^1.95.0`) SHALL register:

- the language `meltemi` for `.meltemi` files, with the file icon from `brand/`;
- line and block comments, brackets, auto-closing pairs and folding by braces;
- a TextMate grammar covering every keyword of the model's schema tables, strings, numbers, colours, ports and comments;
- snippets for a new diagram, a group, a placement block and a style block.

#### Scenario: Grammar covers the schema
- **WHEN** the keyword tables of `@meltemi/diagrams-model` are compared with the grammar
- **THEN** every keyword is matched by a grammar rule

### Requirement: Language providers
The extension SHALL keep one analysis per open document version, debounced by 120 ms. It SHALL publish the analysis diagnostics, with code, severity, related information and hints, to a diagnostic collection. It SHALL register these providers over the editor services:

- completion (with the trigger characters `.`, `"` and space), hover, document symbols, definition, references and document highlights;
- rename with prepare, document formatting and semantic tokens;
- code actions for quick fixes and refactors.

Analyses SHALL use the project of each file, and an edit to a theme file SHALL refresh the open files that import it.

#### Scenario: Diagnostics follow typing
- **WHEN** `api -> ghost` is typed in an open file of a `manual` diagram, then removed
- **THEN** the Problems view shows `layout.missing-placement` for `ghost` within a second, and it disappears after the removal

#### Scenario: Providers answer in VS Code
- **WHEN** the VS Code test suite opens `corpus/valid/checkout.meltemi`
- **THEN** `vscode.executeCompletionItemProvider`, `vscode.executeHoverProvider`, `vscode.executeDocumentSymbolProvider`, `vscode.executeDefinitionProvider`, `vscode.executeReferenceProvider`, `vscode.executeDocumentRenameProvider`, `vscode.executeFormatDocumentProvider`, `vscode.provideDocumentSemanticTokens` and `vscode.executeCodeActionProvider` return results from the editor services

### Requirement: Canvas beside the code
The extension SHALL contribute the custom text editor `meltemi.canvas` (priority `option`) for `*.meltemi`. When a `.meltemi` text editor becomes visible and no canvas for it is open, the extension SHALL open the canvas in the column beside it, keeping focus in the text. This SHALL follow `meltemi.canvas.openWithText`:

- **`remember`** (default): only while the remembered flag is on. The flag SHALL turn off when the user closes a canvas while its text stays visible (checked 500 ms later, only while the extension is active), and on when the user opens a canvas.
- **`always`**: always.
- **`never`**: only on request.

The commands **Open Canvas to the Side** and **Open Canvas** SHALL be available from the editor title and the command palette.

#### Scenario: Hidden canvas stays hidden
- **WHEN** the user closes the canvas beside `checkout.meltemi`, reloads the window and opens another `.meltemi` file
- **THEN** no canvas opens, and **Open Canvas to the Side** turns the automatic opening back on

### Requirement: Shared document, undo and save
Every canvas action SHALL be applied as one `WorkspaceEdit` on the document, converting offsets with `document.positionAt`. Undo, redo, dirty state and save SHALL be those of the document, including undo and redo pressed while the canvas has focus.

#### Scenario: Undo from the text
- **WHEN** a box is moved on the canvas and Undo runs in the text editor
- **THEN** the `place` statement returns to its previous text and the canvas re-renders it there

### Requirement: Commands and settings
The extension SHALL contribute the following commands, enabled for `.meltemi` editors:

- **Export SVG**: writes the SVG of every renderable diagram of the current buffer beside the file, named with `exportFileName`, and reports skipped diagrams once;
- **Arrange Unplaced Elements** and **Recompute Layout**: `arrange` with scope `unplaced` or `all`;
- **Format Document**, through the formatting provider.

It SHALL contribute these settings:

- `meltemi.canvas.openWithText`;
- `meltemi.canvas.grid` (default 14, minimum 1), `meltemi.canvas.showGrid`, `meltemi.canvas.snap` and `meltemi.canvas.guides`;
- `meltemi.canvas.minimap` and `meltemi.canvas.inspector`.

Changes to the settings SHALL reach open canvases without reopening them.

#### Scenario: Export the buffer
- **WHEN** **Export SVG** runs on an unsaved `annotations.meltemi` whose title was edited
- **THEN** `annotations.svg` beside it contains the edited title

### Requirement: Webview security
The canvas webview SHALL use the Content-Security-Policy `default-src 'none'` with images, styles and fonts from the webview source (plus `data:` images and inline styles for the rendered SVG) and nonce scripts. Its `localResourceRoots` SHALL be limited to the extension's `dist/` and `media/`, it SHALL load no remote resources, and it SHALL validate every message from the webview before acting.

#### Scenario: Malformed message
- **WHEN** the webview posts a move gesture with a non-finite delta
- **THEN** the extension ignores it and changes nothing

### Requirement: Packaging with notices
`pnpm vscode:package` SHALL bundle the extension and the webview with esbuild and write `meltemi-diagrams-<version>.vsix`. The package SHALL contain:

- the bundles, and the bundled fonts, Tabler data and ELK worker;
- the icon and the README;
- `LICENSE`;
- `THIRD_PARTY_NOTICES.md` with the licence of every bundled component: EPL-2.0 for elkjs with a link to its source, OFL-1.1 for the fonts, and MIT for the others.

It SHALL not contain `node_modules`, sources or tests.

#### Scenario: Package contents
- **WHEN** the `.vsix` is built and listed
- **THEN** it contains `extension/dist/extension.cjs`, `extension/dist/webview.js`, `extension/dist/assets/elk-worker.min.js` and `extension/THIRD_PARTY_NOTICES.md`, and no `.ts` file

### Requirement: Tests in VS Code and in a browser
`pnpm vscode:test` SHALL run the extension's integration suite inside VS Code through `@vscode/test-electron`, with a runner that needs no test framework. It SHALL check:

- activation, the language and the providers;
- the canvas opening beside the text and its remembered state;
- the commands;
- an edit from the canvas undone in the text.

`pnpm vscode:test-webview` SHALL load the built webview in headless Edge or Chrome through `playwright-core`, with a fake host, and check the following through the messages posted and the DOM:

- pointer, wheel and keyboard input;
- palette, inspector and minimap;
- focus order and the stale state.

#### Scenario: Webview keyboard test
- **WHEN** the webview test focuses the canvas, presses Tab twice and Shift+ArrowRight
- **THEN** the fake host receives a move gesture for the second element by one grid step
