## ADDED Requirements

### Requirement: Lexical structure
The lexer SHALL tokenize `.arch` text into identifiers (`[A-Za-z_][A-Za-z0-9_]*`), double-quoted strings with the escapes `\"`, `\\`, `\n` and `\t`, numbers (integer or decimal, optional leading `-`) with an optional unit suffix (`ms`, `s`, `%`), the arrows `->` and `-->`, the punctuation `{ } ( ) [ ] : ; , .`, and line breaks. Spaces, tabs, line comments (`//` to end of line) and block comments (`/* ... */`) SHALL be kept as trivia attached to the next token. A character that starts no token SHALL produce the diagnostic `syntax.unexpected-character` covering that character, and lexing SHALL continue with the next character.

#### Scenario: Statement with every token class
- **WHEN** the text `route create from api.east to orders.west via [(520, -16.5)] // bend` is tokenized
- **THEN** the token kinds are identifier, identifier, identifier, identifier, dot, identifier, identifier, identifier, dot, identifier, identifier, left-bracket, left-paren, number `520`, comma, number `-16.5`, right-paren, right-bracket, and the line comment is leading trivia of the end-of-file token

#### Scenario: Unit suffixes
- **WHEN** `duration 1200ms; hold 2.5s; label r at 50%` is tokenized
- **THEN** the numbers carry the units `ms`, `s` and `%` respectively and `;` tokens separate the statements

#### Scenario: Unterminated string
- **WHEN** a line contains `api["API` with no closing quote before the line break
- **THEN** the lexer reports `syntax.unterminated-string` with a range from the opening quote to the end of the line and continues with the next line

#### Scenario: Unsupported arrow
- **WHEN** a line contains `a => b`
- **THEN** the lexer reports `syntax.unexpected-character` at `=` with the hint that the supported arrows are `->` and `-->`

### Requirement: Source file structure
A source file SHALL consist of an optional header `language "<version>"` that, when present, MUST be the first statement, followed by top-level blocks `model <id> { }`, `diagram <id>: <type> [using <ref>] { }`, `story <id> for <ref> { }`, `export <id> for <ref> { }` and `theme <id> { }`. An unrecognised top-level statement SHALL produce `syntax.unexpected-top-level` and parsing SHALL continue after it. A header that is not the first statement SHALL produce `syntax.header-not-first`.

#### Scenario: Minimal file
- **WHEN** the text is `language "0.2"` followed by `diagram example: flow { A -> B }`
- **THEN** the CST contains a `Header` node with version `0.2` and one `DiagramBlock` node with id `example` and type `flow`

#### Scenario: Header after a block
- **WHEN** a `diagram` block appears before `language "0.2"`
- **THEN** the parser reports `syntax.header-not-first` on the header and still returns both nodes

#### Scenario: Unknown top-level word
- **WHEN** the top level contains the line `widget x { }`
- **THEN** the parser reports `syntax.unexpected-top-level` on `widget` and the following `diagram` block is parsed normally

### Requirement: Statement forms and terminators
Inside a block the parser SHALL recognise three statement forms: relation statements (`<ref> -> <ref>` or `<ref> --> <ref>`, with optional `: "label"`, optional `as <id>` and optional block), shorthand declarations (`<id>["Label"]` and `<id>[("Label")]`), and keyword statements (`<word>` followed by zero or more arguments and an optional chain of blocks each introduced by a word and arguments). Arguments SHALL be identifiers, qualified references (`a.b`), strings, numbers with optional unit, tuples `( ... )` and lists `[ ... ]`, optionally separated by commas. A statement SHALL end at a line break, at `;` or before `}`. Line breaks inside parentheses and brackets SHALL be continuation, not terminators.

#### Scenario: Relation with label and id
- **WHEN** a block contains `client -> api: "HTTPS" as request`
- **THEN** the CST holds a `RelationStatement` with source `client`, arrow `->`, target `api`, label `HTTPS` and id `request`

#### Scenario: Several statements on one line
- **WHEN** a block contains `effect flow; duration 1200ms; repeat forever`
- **THEN** the CST holds three `KeywordStatement` nodes in that order

#### Scenario: Continuation inside a list
- **WHEN** a `via` list is written across two lines as `via [(520, 180),` and `(600, 180)]`
- **THEN** the parser produces one `KeywordStatement` whose `List` argument has two tuples and reports no diagnostic

#### Scenario: Block chain
- **WHEN** a block contains `alt "Approved" { a --> b } else "Declined" { a --> c }`
- **THEN** the CST holds one `KeywordStatement` with a `BlockChain` of two blocks whose introducing words are `alt` and `else`

#### Scenario: Missing closing brace
- **WHEN** a `diagram` block reaches end of file without `}`
- **THEN** the parser reports `syntax.expected-token` naming `}` at end of file and the statements already read are present in the CST

### Requirement: Lossless concrete syntax tree
The parser SHALL return a CST in which every token keeps its exact text and leading trivia, every node records start and end offsets, and `toText(parse(text))` MUST equal `text` for every input, including inputs with diagnostics. Recovery SHALL insert zero-width `Missing` nodes rather than altering text.

#### Scenario: Round trip of a valid file
- **WHEN** any corpus file is parsed and converted back to text
- **THEN** the result is identical to the input byte for byte, including comments, tabs and CRLF line endings

#### Scenario: Round trip of an invalid file
- **WHEN** a file with an unterminated string, a stray `=` and a missing `}` is parsed and converted back to text
- **THEN** the result is identical to the input and the CST contains `Missing` nodes where recovery inserted them

### Requirement: Error recovery
On a syntax error inside a block the parser SHALL report exactly one diagnostic for the failing statement, skip to the next statement terminator (or the enclosing `}`), and continue. Later valid statements MUST appear in the CST.

#### Scenario: One bad statement between good ones
- **WHEN** a block contains `a -> b`, then `c -> : "x"`, then `d -> e`
- **THEN** exactly one diagnostic is reported, on the second line, and the CST contains `RelationStatement` nodes for both `a -> b` and `d -> e`

### Requirement: Diagnostics contract
Every diagnostic SHALL carry a stable `code`, a `severity` of `error`, `warning` or `info`, a one-sentence `message` naming the offending text, a `range` with start and end offsets and 1-based line and column, and optional `hints` and `related` ranges. Parsing and compiling SHALL never throw on user input.

#### Scenario: Diagnostic positions
- **WHEN** the third line of a file is `  foo -> ` and the target is missing
- **THEN** the diagnostic range starts at line 3, column 10 and its offsets match the position of the end of that line

#### Scenario: Pathological input does not throw
- **WHEN** the parser receives an empty string, a string of only `}` characters, or a 1 MB file of random printable characters
- **THEN** it returns a CST and diagnostics without throwing

### Requirement: Encoding and line endings
The parser SHALL accept UTF-8 text with LF or CRLF line breaks. A leading byte order mark SHALL be accepted, preserved as trivia and reported as `syntax.bom` with severity `info`. A file mixing LF and CRLF SHALL produce `syntax.mixed-line-endings` with severity `warning`. Tabs and spaces SHALL both be accepted as indentation.

#### Scenario: CRLF file
- **WHEN** a corpus file saved with CRLF line endings is parsed
- **THEN** no diagnostic is reported and the round trip preserves every CRLF

#### Scenario: Mixed line endings
- **WHEN** a file contains both LF and CRLF line breaks
- **THEN** one `syntax.mixed-line-endings` warning is reported on the first line break that differs from the first one in the file
