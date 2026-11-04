## MODIFIED Requirements

### Requirement: Lexical structure
The lexer SHALL tokenize `.meltemi` text into identifiers (`[A-Za-z_][A-Za-z0-9_]*`), double-quoted strings with the escapes `\"`, `\\`, `\n` and `\t`, dates (four digits, `-`, two digits, `-`, two digits, optionally followed with no space by `T`, two digits, `:`, two digits and optionally `:` and two digits, as `2026-06-01` and `2026-06-01T09:30`), numbers (integer or decimal, optional leading `-`) with an optional unit suffix (an identifier such as `ms`, `s`, `min`, `h`, `d` or `w`, or `%`), the relation tokens `->`, `-->`, `--`, `---`, `<->` and `<-->`, the punctuation `{ } ( ) [ ] : ; , .`, and line breaks. A run of digits that has the form of a date SHALL be one date token; any other run SHALL lex as numbers as before, so `2026-6-1` is the numbers `2026`, `-6` and `-1`. A run of `-` and `>` SHALL take the longest token it starts with (`---` before `-->` before `--` before `->`), and `-` before a digit SHALL start a number; `--->` is therefore `---` followed by an unexpected `>`. Spaces, tabs, line comments (`//` to end of line) and block comments (`/* ... */`) SHALL be kept as trivia attached to the next token. A character that starts no token SHALL produce the diagnostic `syntax.unexpected-character` covering that character, with the hint that the relation tokens are `->`, `-->`, `--`, `---`, `<->` and `<-->` when it holds `=`, `<` or `>`, and lexing SHALL continue with the next character or the next token start, `--` included.

#### Scenario: Statement with every token class
- **WHEN** the text `route create from api.east to orders.west via [(520, -16.5)] // bend` is tokenized
- **THEN** the token kinds are identifier, identifier, identifier, identifier, dot, identifier, identifier, identifier, dot, identifier, identifier, left-bracket, left-paren, number `520`, comma, number `-16.5`, right-paren, right-bracket, and the line comment is leading trivia of the end-of-file token

#### Scenario: Unit suffixes
- **WHEN** `duration 1200ms; hold 2.5s; label r at 50%` is tokenized
- **THEN** the numbers carry the units `ms`, `s` and `%` respectively and `;` tokens separate the statements

#### Scenario: Dates
- **WHEN** `task a from 2026-06-01 to 2026-06-05T17:30 for 5d` is tokenized
- **THEN** the tokens are identifier, identifier, identifier, date `2026-06-01`, identifier, date `2026-06-05T17:30`, identifier and the number `5` with the unit `d`, and `toText` of the parse equals the input

#### Scenario: Not quite a date
- **WHEN** `2026-6-1` and `2026-06-01 T09:30` are tokenized
- **THEN** the first is the numbers `2026`, `-6` and `-1`; the second is the date `2026-06-01` followed by the identifier `T09`, a colon and the number `30`

#### Scenario: Unterminated string
- **WHEN** a line contains `api["API` with no closing quote before the line break
- **THEN** the lexer reports `syntax.unterminated-string` with a range from the opening quote to the end of the line and continues with the next line

#### Scenario: Unsupported arrow
- **WHEN** a line contains `a => b`
- **THEN** the lexer reports `syntax.unexpected-character` at `=` with the hint that the relation tokens are `->`, `-->`, `--`, `---`, `<->` and `<-->`

#### Scenario: Two-way arrows
- **WHEN** `a <-> b` and `c <--> d` are tokenized
- **THEN** each line has an identifier, one arrow token (`<->`, then `<-->`) and an identifier

#### Scenario: Line tokens
- **WHEN** `a -- b` and `c --- d` are tokenized
- **THEN** each line has an identifier, one token (`--` of kind `Line`, then `---` of kind `DashedLine`) and an identifier, and `toText` of the parse equals the input

#### Scenario: Longest match
- **WHEN** `a --> b`, `a ---> b`, `a --5` and `a --b` are tokenized
- **THEN** the first has one `-->` token; the second has a `---` token and reports `syntax.unexpected-character` at `>` with the six-token hint; the third has a `--` token followed by the number `5`; and the fourth has a `--` token followed by the identifier `b`

#### Scenario: Minus hint
- **WHEN** a line contains `a -x b`
- **THEN** `syntax.unexpected-character` is reported at `-` with the hint that a minus sign must be followed by a digit, `-` or `>`

### Requirement: Statement forms and terminators
Inside a block the parser SHALL recognise three statement forms: relation statements (`<ref> -> <ref>` or `<ref> --> <ref>`, with optional `: "label"`, optional `as <id>` and optional block), shorthand declarations (`<id>["Label"]` and `<id>[("Label")]`), and keyword statements (`<word>` followed by zero or more arguments and an optional chain of blocks each introduced by a word and arguments). Arguments SHALL be identifiers, qualified references (`a.b`), strings, numbers with optional unit, dates, tuples `( ... )` and lists `[ ... ]`, optionally separated by commas. A statement SHALL end at a line break, at `;` or before `}`. Line breaks inside parentheses and brackets SHALL be continuation, not terminators.

#### Scenario: Relation with label and id
- **WHEN** a block contains `client -> api: "HTTPS" as request`
- **THEN** the CST holds a `RelationStatement` with source `client`, arrow `->`, target `api`, label `HTTPS` and id `request`

#### Scenario: Several statements on one line
- **WHEN** a block contains `effect flow; duration 1200ms; repeat forever`
- **THEN** the CST holds three `KeywordStatement` nodes in that order

#### Scenario: A date argument
- **WHEN** a block contains `task tec1 "Prueba" after tec0, tec2 from 2026-06-15 for 10d`
- **THEN** the CST holds one `KeywordStatement` `task` whose arguments are the refs `tec1`, a string, the refs `after`, `tec0` and `tec2` (the comma kept as a token), the ref `from`, a `DateLiteral` `2026-06-15`, the ref `for` and the number `10` with the unit `d`

#### Scenario: Continuation inside a list
- **WHEN** a `via` list is written across two lines as `via [(520, 180),` and `(600, 180)]`
- **THEN** the parser produces one `KeywordStatement` whose `List` argument has two tuples and reports no diagnostic

#### Scenario: Block chain
- **WHEN** a block contains `alt "Approved" { a --> b } else "Declined" { a --> c }`
- **THEN** the CST holds one `KeywordStatement` with a `BlockChain` of two blocks whose introducing words are `alt` and `else`

#### Scenario: Missing closing brace
- **WHEN** a `diagram` block reaches end of file without `}`
- **THEN** the parser reports `syntax.expected-token` naming `}` at end of file and the statements already read are present in the CST
