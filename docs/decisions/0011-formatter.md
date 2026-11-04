# 0011. Formatter: a token-stream printer that keeps authored one-line blocks

Status: accepted (source-formatter change, 10 October 2026)

## Context

The proposal separates full formatting from visual edits: dragging a box must not reprint the file,
but teams need one canonical layout for review. The lexer keeps every character (line breaks are
tokens, spaces and comments are trivia), and the generic statement grammar (decision 0003) means
most statements share one shape.

## Decision

- `formatSource` in `@meltemi/diagrams-language` re-emits every token unchanged and decides only the
  separators: spaces, line breaks and indentation. A pre-pass finds matching brackets, blocks and
  lists written over several lines, and top-level item boundaries.
- Blocks written on one line stay on one line. Blocks and lists written over several lines put one
  statement or item per line. There is no line-width rule, so the output is idempotent.
- Files with syntax errors are refused. The corpus test checks that token sequence, comments, model
  JSON and idempotence are preserved for every reference file.
- Edits come from a Myers line diff, so editors keep cursors outside changed lines.
- Indentation is two spaces, or the project's `format.indent`.

## Alternatives considered

- Node-specific pretty-printers on the CST: every statement form would need a printer.
- A Prettier plugin: an extra dependency and a second parser to keep in agreement.
- Wrapping at a fixed width: lines would move between runs as labels change length.
- Always expanding blocks: three lines for every `{ description "…" }`.

## Consequences

- New token kinds need a spacing rule and a corpus case.
- Column alignment written by hand is not kept.
- The byte-exact corpus fixtures are not formatted; examples, skill examples and example projects
  are kept canonical, and CI checks them with `meltemi-diagrams format --check`.
