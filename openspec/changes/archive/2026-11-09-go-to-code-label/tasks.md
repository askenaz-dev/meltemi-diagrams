## Implementation

- [x] Rename the shared canvas action in English and Spanish, preserving its internal event.
- [x] Update current documentation, specs, comments and existing menu assertions.
- [x] Run typecheck, lint, unit tests, playground and webview browser tests, VS Code integration and VSIX packaging.

## Validation

- `pnpm typecheck` and `pnpm lint` passed.
- `pnpm test --maxWorkers=4`: 11,370 passed, one skipped across 386 files.
- `pnpm playground:test-browser`: 136 passed, including Go to code unfolding the code pane,
  selecting the element's declaration and focusing the editor.
- `pnpm vscode:test-webview`: 315 passed, including the read-only context menus.
- `pnpm vscode:test`: 26 passed.
- `pnpm vscode:package`: VSIX packaged and contents checked, 416 files.
