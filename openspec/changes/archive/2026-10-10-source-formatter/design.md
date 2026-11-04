## Context

- The lexer keeps every character. Line breaks are `Newline` tokens. Spaces, comments and the BOM are leading trivia of the following token.
- The parser is lossless and reports syntax errors without throwing.
- Statements end at a line break, at `;` or before `}`. Inside `( )` and `[ ]`, a line break continues the statement when the line ends with the opener or a comma, or the next line starts with a comma or the closer.
- Chained clauses (`} else "B" {`) must start on the line of the previous `}`.
- An identifier directly followed by `[` is a shorthand declaration, so `api["API"]` and `api ["API"]` mean different things.

## Goals / Non-Goals

**Goals:**
- One canonical layout that is stable (idempotent), safe (never changes meaning, never drops a comment) and readable in review.
- Minimal edits, so the editor's "Format Document" behaves like other languages.

**Non-Goals:**
- Statement reordering and rewriting (see the proposal).

## Decisions

### D1. A token-stream printer with a few structural facts

The formatter re-emits every non-`Newline` token with its exact text. Only the separators between tokens change: spaces, line breaks and indentation.

A pre-pass over the tokens computes:

- matching pairs for `{ }`, `( )` and `[ ]`;
- whether each block was written on one line (no `Newline` token inside);
- whether each list or tuple spans several lines;
- the first and last token of each top-level item (from the CST), and whether that item is a block.

The emitter then decides each separator from those facts and the original `Newline` tokens.

| Alternative | Why not |
|---|---|
| Pretty-print from the CST with node-specific printers | Every statement form, current and future, would need its own printer. The generic statement grammar (decision 0003) makes the token stream enough. |
| Reuse a generic formatter (Prettier plugin) | Adds a dependency and a second parser that must agree with ours on every edge |

### D2. Layout rules

| Situation | Output |
|---|---|
| Between tokens on a line | one space |
| Before `,`, `;`, `:`, `.`, `)`, `]`; after `(`, `[`, `.` | no space |
| `[` right after an identifier with nothing in between (shorthand) | no space; `via [` keeps its space |
| Block written on one line | stays on one line: `{ description "web" }`, `{ }` |
| Other blocks | `{` ends the line, each statement on its own line one level deeper, `}` on its own line at the block's level; chained clauses continue after `}` |
| Statements joined by `;` | kept on one line as `a; b` |
| Multi-line list or tuple | opener ends the line, one item per line one level deeper with its comma, closer on its own line |
| Blank lines | at most one; none right after `{` or right before `}`; exactly one between top-level blocks; header and imports keep zero or one |
| Comments | line comments stay at the end of their line after one space, or on their own line at the current indentation; block comments are kept verbatim |
| Line ends | no trailing spaces; the first line ending of the file is used everywhere; exactly one final line break; the BOM is kept |

Keeping one-line blocks on one line respects the author's choice for short `{ description "…" }` blocks. Without a width rule the output stays idempotent.

| Alternative | Trade-off |
|---|---|
| Wrap at a fixed width | Needs a line-breaking algorithm, and long labels make lines move between runs |
| Always expand blocks | Turns `api["API"] { description "x" }` into three lines everywhere |

### D3. Safety guarantees, checked by tests over the whole corpus

- A file whose parse has errors is refused: the result has `ok: false` and the error diagnostics, and the text is not changed.
- The sequence of non-`Newline` tokens (kind and text) is identical before and after.
- The sequence of comments is identical.
- Formatting the output again gives the same text.
- Compiling the output gives the same model JSON apart from source ranges.

### D4. Minimal edits

`diffLines(before, after)` runs Myers' O(ND) diff on lines and returns `TextEdit`s that replace changed line ranges. Unchanged lines produce no edit, so an editor keeps cursors and folding outside the changed lines. The edits apply to the original text with `applyTextEdits` and give exactly the formatted text.

### D5. Options and project setting

```ts
interface FormatOptions {
  indent?: number | "tab";   // default 2, 1 to 8 spaces
}
type FormatResult =
  | { ok: true; text: string; edits: TextEdit[]; changed: boolean }
  | { ok: false; diagnostics: Diagnostic[] };
function formatSource(text: string, options?: FormatOptions): FormatResult;
```

`project.json` gains `"format": { "indent": 4 }` (or `"tab"`). Other values are `project.invalid-value`, and unknown keys inside `format` are `project.unknown-field`. `formatOptionsFor(manifest)` in `@meltemi/diagrams-project` returns the options. The CLI and the editor use the project's options.

### D6. CLI

`meltemi-diagrams format <paths…> [--check] [--stdout]`:

- **Paths.** Files are formatted; folders are formatted as projects, through their sources.
- **Default.** Changed files are rewritten, each named in a `Formatted <path>` line, followed by `Formatted N of M files.`.
- **`--check`.** Nothing is written. Files that would change are named in `Would format <path>` lines, and the exit code is 1 when any would.
- **`--stdout`.** It prints the formatted text of exactly one file.
- **Refused files.** A file with syntax errors prints its diagnostics and `format.syntax-errors`, stays unchanged, and makes the exit code 1.
- **Exit codes.** 0 when everything is formatted or already canonical, 1 for findings, 2 for usage errors.

## Risks / Trade-offs

- [A future statement form needs special spacing] → The rules are token-based. A new token kind gets a rule and a corpus case, and the token-preservation test catches any change in meaning.
- [Authors who like aligned columns (`place a  at (…)`)] → Alignment is lost by design. The formatter is opt-in per run and visual edits never format.
