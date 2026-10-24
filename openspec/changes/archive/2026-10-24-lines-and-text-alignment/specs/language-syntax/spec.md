## MODIFIED Requirements

### Requirement: Lexical structure
The lexer SHALL tokenize `.meltemi` text into identifiers (`[A-Za-z_][A-Za-z0-9_]*`), double-quoted strings with the escapes `\"`, `\\`, `\n` and `\t`, numbers (integer or decimal, optional leading `-`) with an optional unit suffix (`ms`, `s`, `%`), the relation tokens `->`, `-->`, `--`, `---`, `<->` and `<-->`, the punctuation `{ } ( ) [ ] : ; , .`, and line breaks. A run of `-` and `>` SHALL take the longest token it starts with (`---` before `-->` before `--` before `->`), and `-` before a digit SHALL start a number; `--->` is therefore `---` followed by an unexpected `>`. Spaces, tabs, line comments (`//` to end of line) and block comments (`/* ... */`) SHALL be kept as trivia attached to the next token. A character that starts no token SHALL produce the diagnostic `syntax.unexpected-character` covering that character, with the hint that the relation tokens are `->`, `-->`, `--`, `---`, `<->` and `<-->` when it holds `=`, `<` or `>`, and lexing SHALL continue with the next character or the next token start, `--` included.

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
