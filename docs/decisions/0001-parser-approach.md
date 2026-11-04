# 0001. Hand-written parser over a lossless CST

Status: accepted (Stage 1)

## Context

The proposal makes the `.meltemi` text the source of truth. The canvas and timeline change it through
structured operations, and a drag must change only the affected numbers while keeping comments and
formatting. The parser therefore has to keep every character, recover from errors statement by
statement, and give exact positions. The proposal asks to choose the parser for incremental editing,
error recovery and format preservation, not for parsing convenience.

## Decision

Write the lexer and a recursive-descent parser by hand in `@meltemi/diagrams-language`.

- Tokens carry their leading trivia (spaces, tabs, comments, byte order mark). Line breaks are tokens
  because they end statements.
- Nodes keep every token and child in source order, so `toText(parse(text).root) === text` for any
  input, including invalid input.
- Recovery reports one diagnostic per failing statement, skips to the next line break, `;` or the
  enclosing `}`, and inserts zero-width `Missing` nodes where something was expected.
- The whole file is reparsed after each change. Stage 1 files are small enough.

## Alternatives considered

| Option           | Why not now                                                                     |
| ---------------- | ------------------------------------------------------------------------------- |
| Chevrotain       | Good recovery, but comments are not kept in the CST; a trivia layer is needed.  |
| tree-sitter      | Best incremental parsing, but adds a native or WASM toolchain and a JS grammar. |
| Langium          | Brings LSP, but dictates project structure and is AST-first.                    |
| peggy, ohm (PEG) | No trivia, weak recovery.                                                       |

## Consequences

- No runtime dependency; the grammar is small (about twenty node kinds) and line oriented.
- Incremental reparsing is not available. Revisit if a 2,000-line corpus file takes more than 50 ms
  to parse on the reference machine; tree-sitter is the fallback.
- The round-trip property test over the corpus and random mutations guards losslessness.
