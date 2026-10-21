## MODIFIED Requirements

### Requirement: Lexical structure
The lexer SHALL tokenize `.meltemi` text into identifiers (`[A-Za-z_][A-Za-z0-9_]*`), double-quoted strings with the escapes `\"`, `\\`, `\n` and `\t`, numbers (integer or decimal, optional leading `-`) with an optional unit suffix (`ms`, `s`, `%`), the arrows `->`, `-->`, `<->` and `<-->`, the punctuation `{ } ( ) [ ] : ; , .`, and line breaks. Spaces, tabs, line comments (`//` to end of line) and block comments (`/* ... */`) SHALL be kept as trivia attached to the next token. A character that starts no token SHALL produce the diagnostic `syntax.unexpected-character` covering that character, and lexing SHALL continue with the next character.

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
- **THEN** the lexer reports `syntax.unexpected-character` at `=` with the hint that the supported arrows are `->`, `-->`, `<->` and `<-->`

#### Scenario: Two-way arrows
- **WHEN** `a <-> b` and `c <--> d` are tokenized
- **THEN** each line has an identifier, one arrow token (`<->`, then `<-->`) and an identifier
