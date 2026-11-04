# 0016. The editor is a VS Code custom text editor with in-process services

Status: accepted (vscode-extension change, 10 October 2026)

## Context

The proposal's editor shows the code, a canvas and an inspector together. It also asks for the
following:

- every visual action becomes a minimal change to the source, with undo shared between text and
  canvas;
- a stale render while the text is invalid;
- language features.

Its audience already works in VS Code or a fork, which provides the explorer, the text editor, undo,
save and Git. The owner asked for the code and the canvas side by side by default, with a hidden
canvas remembered across sessions.

## Decision

- **Host.**
  - The canvas is a `CustomTextEditorProvider` (`meltemi.canvas`, priority `option`) on the same
    `TextDocument` as the text, so VS Code owns undo, redo, dirty state, save and hot exit for
    both.
  - The text editor stays the default, so files open as code and diffs stay textual.
  - The extension opens the canvas beside a `.meltemi` text editor while a flag in `globalState` is
    on. The flag turns off when the user closes a canvas while its text stays visible (checked
    500 ms later, so a closing window does not count), and on with **Open Canvas**.
  - `meltemi.canvas.openWithText` (`remember`, `always`, `never`) overrides it.
- **Packages.**
  - `@meltemi/diagrams-editor` holds everything testable without VS Code: analysis, language
    services, rendering, the canvas session, the inspector, the clipboard, and pure canvas helpers
    under `/canvas` for the webview bundle.
  - `ProjectSessions` under `/node` replaces the command line's project cache, so both hosts
    analyse projects the same way.
- **Services run in process.** The canvas needs the same compilation and layout as the language
  features, so a language server would compile twice or proxy scenes. Results use LSP-like shapes,
  so a server can wrap them later.
- **Bundling.**
  - esbuild produces a Node bundle and a browser bundle.
  - Fonts, Tabler data and the ELK worker are copied next to the bundle and read through injected
    readers.
  - `loadElkWorkerFile` evaluates the ELK worker with `self` hidden, because the extension host
    defines `self` and ELK would otherwise start as a web worker.
- **Notices.** `THIRD_PARTY_NOTICES.md` is generated from the bundle's actual inputs, with the
  full licence texts (EPL-2.0 for elkjs, OFL-1.1 for the fonts).
- **Engines.** VS Code 1.95 or later, `@types/vscode` 1.95.0. Every API used is older.

## Alternatives considered

- **The canvas as the default editor.** It hides the code and opens in diffs.
- **A webview panel like the Markdown preview.** It is not bound to the document, so canvas undo
  would need a parallel stack.
- **A standalone desktop app.** It would rebuild the explorer, editor, undo and Git first.
- **A language server now.** It adds a process and a protocol, and duplicates analysis, for no
  current client.

## Consequences

- The command line depends on `@meltemi/diagrams-editor/node`; its output is unchanged, which a
  byte-for-byte test against the editor's rendering guards.
- Tests run at three levels:
  - vitest for the editor package;
  - headless Edge or Chrome for the webview (`pnpm vscode:test-webview`);
  - a real VS Code downloaded by `@vscode/test-electron` (`pnpm vscode:test`).
- Publishing to the Marketplace and Open VSX is an owner action, prepared by the release change.
