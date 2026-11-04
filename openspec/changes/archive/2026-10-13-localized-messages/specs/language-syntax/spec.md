## MODIFIED Requirements

### Requirement: Diagnostics contract
Every diagnostic SHALL carry a stable `code`, a `severity` of `error`, `warning` or `info`, a one-sentence `message` naming the offending text, a `range` with start and end offsets and 1-based line and column, and optional `hints`, `related` ranges and `data`. The message, hints and related notes SHALL be in the interface language (English unless a host or `--lang` chose Spanish); codes, severities and ranges SHALL NOT depend on the language. `data` SHALL hold what tools need from a diagnostic without reading its words: the ids it names (`ids`), the alternatives a fix may write (`candidates`) and values of particular codes. Parsing and compiling SHALL never throw on user input.

#### Scenario: Diagnostic positions
- **WHEN** the third line of a file is `  foo -> ` and the target is missing
- **THEN** the diagnostic range starts at line 3, column 10 and its offsets match the position of the end of that line

#### Scenario: Pathological input does not throw
- **WHEN** the parser receives an empty string, a string of only `}` characters, or a 1 MB file of random printable characters
- **THEN** it returns a CST and diagnostics without throwing

#### Scenario: A Spanish diagnostic
- **WHEN** a file writes `place ghost at (10, 20)` for an undeclared element and the interface language is Spanish
- **THEN** the diagnostic has the same code, severity and range as in English, its message is in Spanish and names `ghost` in backticks, and its `data.ids` is `["ghost"]`
