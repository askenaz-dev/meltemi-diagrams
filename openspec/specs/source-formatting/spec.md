# source-formatting Specification

## Purpose
The canonical layout of `.meltemi` sources, its safety guarantees, its options and the minimal line edits it returns.

## Requirements
### Requirement: Canonical layout
`formatSource(text, options)` SHALL lay out a file as follows:

- **Indentation.** Indentation follows block and multi-line list depth, at two spaces per level by default.
- **Spacing.** One space separates tokens on a line. There is no space before `,`, `;`, `:`, `.`, `)` or `]`, none after `(`, `[` or `.`, and none between an identifier and a `[` that directly followed it in the source.
- **Blocks.**
  - A block written on one line stays on one line, with one space inside its braces.
  - Every other block ends its first line with `{`, puts each statement on its own line one level deeper, and puts `}` on its own line, so chained clauses continue after it on the same line.
- **Multi-line lists.** A list or tuple written over several lines puts one item per line, one level deeper, and its closer on its own line.
- **Blank lines.** There is at most one blank line in a row, none right after `{` or right before `}`, and exactly one between top-level blocks.
- **Line ends.** There are no trailing spaces. The first line ending of the file is used for every line, and the output ends with exactly one line break.

#### Scenario: Messy flow diagram
- **WHEN** the input is `diagram d:flow{\n    client[ "Client" ]\n  client->api :"HTTPS" as req\n\n\n  placement {place client at (120,60)}\n}`
- **THEN** the output is `diagram d: flow {\n  client["Client"]\n  client -> api: "HTTPS" as req\n\n  placement { place client at (120, 60) }\n}\n`

#### Scenario: Shorthand versus list
- **WHEN** a statement is `route r from a.east to b.west via [(1,2),(3,4)]`
- **THEN** it becomes `route r from a.east to b.west via [(1, 2), (3, 4)]` and the space before `[` is kept

#### Scenario: Chained clauses
- **WHEN** a block contains `alt "A" {\na -> b\n} else "B" {\nb -> a\n}`
- **THEN** each clause body is indented one level and `} else "B" {` stays on one line

#### Scenario: Multi-line list
- **WHEN** a list is written as `via [(1, 2),\n(3, 4)]`
- **THEN** the output puts `via [` at the end of the line, one item per line one level deeper with its comma, and `]` on its own line

#### Scenario: Top-level spacing
- **WHEN** two `theme` blocks follow each other with no blank line, and three blank lines separate the second from a `diagram`
- **THEN** exactly one blank line separates each pair of top-level blocks

### Requirement: Comments are kept
Every line and block comment SHALL appear in the output once, in the original order.

- A comment that ended a line SHALL stay at the end of that line after one space.
- A comment on its own line SHALL stay on its own line at the indentation of the surrounding statements.
- Block comments SHALL be kept verbatim, including their inner line breaks.

#### Scenario: Trailing and own-line comments
- **WHEN** the input is `diagram d: flow {\n// first\n   a -> b    // keep\n}`
- **THEN** the output is `diagram d: flow {\n  // first\n  a -> b // keep\n}\n`

#### Scenario: Comment inside a multi-line list
- **WHEN** a multi-line list has `// bend` after its first item's comma
- **THEN** the comment stays at the end of that item's line

### Requirement: Safety guarantees
The formatter SHALL NOT change the text or order of any non-line-break token. Formatting its own output SHALL return the same text. Compiling the output SHALL give the same model JSON as the input, apart from source ranges. A file whose parse reports an error SHALL be refused: the result is `ok: false` with those diagnostics, and no text is produced.

#### Scenario: Whole corpus
- **WHEN** every file under `corpus/valid`, `corpus/parse-only`, `corpus/edits`, `examples` and the skill examples is formatted
- **THEN** each result is `ok`, its non-line-break tokens and comments equal the input's, formatting it again changes nothing, and its model JSON without ranges equals the input's

#### Scenario: Syntax error
- **WHEN** the input contains an unterminated string
- **THEN** the result is `ok: false` with `syntax.unterminated-string`, and the input is not modified

#### Scenario: Byte order mark and CRLF
- **WHEN** the input starts with a BOM, uses CRLF, and has one LF-only line
- **THEN** the output keeps the BOM and uses CRLF on every line

### Requirement: Options and minimal edits
`FormatOptions.indent` SHALL accept a whole number of spaces from 1 to 8 or `"tab"`, defaulting to 2. Any other value SHALL make `formatSource` refuse with `format.invalid-option`. The result SHALL carry `changed` and line-based `edits`: replacements of changed line ranges only, which applied to the input give exactly the output.

#### Scenario: Tabs
- **WHEN** a nested block is formatted with `indent: "tab"`
- **THEN** each level is indented with one tab

#### Scenario: Edits touch only changed lines
- **WHEN** a 40-line canonical file has one badly indented line and is formatted
- **THEN** `edits` has one edit covering that line, and applying the edits to the input gives the output

#### Scenario: Invalid option
- **WHEN** `formatSource(text, { indent: 0 })` is called
- **THEN** the result is `ok: false` with `format.invalid-option`

