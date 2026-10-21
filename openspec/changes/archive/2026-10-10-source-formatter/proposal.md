## Why

The proposal makes full formatting a separate action from visual edits. Dragging a box must never reprint the file, but users and teams still need one canonical layout for review in Git, for files written by hand or by agents, and for the editor's "Format Document". Without a formatter every author invents indentation and spacing, and diffs fill with noise.

## What Changes

Roadmap change **4** (`docs/roadmap-1.0.md`), part of **Stage 1 (language services)**. The language component of the proposal includes "parser, diagnostics, format and services for the editor".

- **`formatSource(text, options)` in `@meltemi/diagrams-language`.** It produces the canonical layout:
  - indentation by block depth (two spaces by default, or another width, or tabs);
  - one space between tokens, with no space around `.`, before `,`, `;` and `:`, inside parentheses and brackets, or between an id and its `[` shorthand;
  - blocks written on one line stay on one line, and other blocks put each statement on its own line with the closing brace aligned;
  - lists and tuples written over several lines put one item per line;
  - at most one blank line, none at the start or end of a block, and exactly one between top-level blocks;
  - every comment kept, in place and in order;
  - no trailing spaces, one final line break, the file's first line ending used everywhere, and the byte order mark kept.
- **Guarantees.** The formatter never changes token text or order. Formatting twice gives the same text. Files with syntax errors are refused with their diagnostics and left untouched. The result comes with minimal line-based text edits, so editors keep cursors and undo granularity.
- **`format` in `project.json`.** The manifest gains `format: { "indent": 2 | 4 | … | "tab" }` for the project's indentation.
- **`meltemi-diagrams format <paths…>`.** It formats files and project folders in place. `--check` reports files that would change, for CI, and `--stdout` prints one formatted file.
- **Docs.** A formatting reference (`docs/language/formatting.md`), README and skill notes, and decision note 0011.

## Capabilities

### New Capabilities
- `source-formatting`: the canonical layout rules, the guarantees (token preservation, idempotence, comment preservation, refusal on syntax errors), the options and the minimal edits.
- `cli-format`: behaviour, outputs and exit codes of `meltemi-diagrams format`.

### Modified Capabilities
- `project-manifest`: the manifest accepts the `format` field.

## Impact

- `@meltemi/diagrams-language`: new `format.ts` (`formatSource`, `FormatOptions`) and `diff.ts` (`diffLines`, line edits).
- `@meltemi/diagrams-project`: the manifest field `format`, the schema, and `formatOptionsFor(manifest)`.
- `@meltemi/diagrams-cli`: the `format` command and its help.
- New diagnostic code `format.syntax-errors`, used by the CLI when a file is refused.
- No new dependencies.

## Non-goals

- Reformatting as a side effect of visual edits. Structured edits stay minimal (`source-editing`), and the editor runs the formatter only when the user asks (roadmap change 8 wires "Format Document").
- Sorting or reordering statements, renaming ids, or rewriting shorthand into typed declarations. The formatter changes only whitespace and line breaks.
