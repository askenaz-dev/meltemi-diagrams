# Code block notes — 24 November 2026

Local verification on Windows, Node 24.15.0, pnpm 10.33.2 and Edge 158, in the worktree of branch
`claude/meltemi-code-block-notes-c183ff` based on `56b2823`. See
[decision 0078](../decisions/0078-code-block-notes.md).

## The request's acceptance criteria

Walked on the web playground built from the branch, with the owner's Post Login fragment (seven
lines, three indentation levels and an empty line), and repeated by the automated scenarios named.

| #   | Criterion                                                                                    | Result                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Note → Code block** creates a note and takes a pasted fragment                             | Passed. One edit wrote `note note1 "Code"` and `style note1 { textFormat code }`, the editor opened on the selected word, the paste replaced it and Ctrl+Enter wrote the seven lines as one label. Playground scenario "code notes: a code block takes a pasted fragment…" and webview "code notes: Code block from the note tool's menu…".    |
| 2   | **Properties → Text** shows **Format** above **Font**; switching keeps text and indentation  | Passed. The Text tab lists Text colour, Format, Font, Text size, Text weight; Format's two chips are Plain text and Code. Plain text removed the property, Code wrote it back, and the label was the same bytes at each step. Webview "code notes: Format in the Text tab…".                                                                   |
| 3   | The style and indentation survive saving, reopening, the preview and SVG and PNG exports     | Passed. After a reload the block drew the same seven lines, the indented ones with `xml:space="preserve"`. `mdg export` with `--fonts system`, `embedded` and `outlined`, PNG and PDF through Edge, and the local MCP's `preview` all keep the indentation; the MCP preview draws in Cascadia Mono. Visual reference `free/code` recorded.     |
| 4   | Copying the fragment from the note and pasting it in an editor keeps spaces, tabs and breaks | Passed. **Copy code** in the context menu said "Copied the code."; the browser pane forbids reading the clipboard, so the text itself was compared by the playground and webview scenarios, which read it back equal to the pasted fragment (Windows keeps CR LF on its clipboard; the page writes line feeds). The player's panel copies too. |
| 5   | A project saved before the option opens its notes as plain text                              | Passed. A note written without `textFormat` drew no panel, in the body font, before and after the reload; the model reports no diagnostic for it. Model and layout tests "a document without the property" and "is a plain note again when the format goes".                                                                                   |

## Gates

- Typecheck and lint (eslint and the Prettier check): passed.
- Unit suite: 409 of 410 files, 11,761 tests passed and one existing skip. The file left is
  `packages/acceptance/test/local-operations.test.ts` under Git Bash, whose four archive tests need
  the Windows `tar`; run from PowerShell it passes, 8 of 8, as on main.
- Browser suites, complete: VS Code webview 374 of 374, playground 161 of 161, player 50 of 50 and
  catalog 15 of 15, with the scenarios this change added (seven webview, one playground, four
  player, one catalog). The first webview run found four existing scenarios that counted the
  theme's colour tokens or the split buttons as they were before; they now count the two code
  tokens and the note's split button, and pass.
- Visual suite: 42 of 42, the new `free/code` among them. It was recorded with Edge 158; the other
  41 references date from Edge 156 and still pass, so they were not re-recorded.
- Conformance: passed, with the new `valid/free/code-notes` case.

## Observations

- A code block created from the menu starts as a small note in a free cell near the centre and
  grows to the right and down with the pasted code, so it may cover a neighbour, as a long sticky
  note does. Move it, or drag **Code block** from the menu to where it should go.
- The Text tab of a free note keeps Text colour above the Text group; Format is the first field of
  that group, directly above Font.
