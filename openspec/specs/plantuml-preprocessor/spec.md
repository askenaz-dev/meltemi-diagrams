# plantuml-preprocessor Specification

## Purpose
Runs the PlantUML preprocessor (defines, variables, procedures, functions, conditionals, loops, local includes and built-ins) before import, without network access and within limits.
## Requirements
### Requirement: Definitions and variables
The preprocessor SHALL expand, in source order: `!define NAME value` and `!define NAME(a, b)
body` (whole-word replacement, arguments substituted), `!undef NAME`, `!definelong NAME(a) …
!enddefinelong`, `!$var = value`, `!$var ?= value` (only when unset) and `!local $var` inside
procedures, with `$var` and `NAME(args)` replaced in later lines. String values SHALL accept
double and single quotes; `+` SHALL concatenate strings; integers SHALL support `+ - * / %` and
comparisons.

#### Scenario: Function-like define
- **WHEN** a source has `!define SERVICE(n, l) component l as n` and `SERVICE(api, "Order API")`
- **THEN** the preprocessed line is `component "Order API" as api`

#### Scenario: Variable
- **WHEN** a source has `!$tech = "Kotlin"` and `[API] <<$tech>>`
- **THEN** the preprocessed line is `[API] <<Kotlin>>`

### Requirement: Procedures and functions
`!procedure $name($a, $b = "default") … !endprocedure` (and `!unquoted procedure`) SHALL expand
their body lines at each call; `!function $name($a) … !return expr … !endfunction` SHALL be
callable in expressions and in lines; keyword arguments (`$name($b = "x")`) and defaults SHALL
work; `!$var` assignments inside a body SHALL be local unless the variable is global.

#### Scenario: Procedure with defaults
- **WHEN** a procedure `$svc($id, $label = "Service")` emits `component "$label" as $id` and is
  called as `$svc(api)`
- **THEN** the line `component "Service" as api` is produced

### Requirement: Conditionals and loops
`!if`, `!elseif`, `!else`, `!endif`, `!ifdef`, `!ifndef`, `!while … !endwhile` and `!foreach $x in
[a, b] … !endfor` (when written as JSON arrays) SHALL select or repeat lines. Conditions SHALL
evaluate comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`), `&&`, `||`, `!` and parentheses, with
non-empty strings and non-zero numbers true.

#### Scenario: Conditional block
- **WHEN** a source sets `!$prod = 1` and has `!if $prod == 1` … `!else` … `!endif`
- **THEN** only the lines of the first branch remain

### Requirement: Includes
`!include path`, `!include_once path` and `!include path!id` SHALL read local files through the
host's `readFile`, relative to the including file, and SHALL refuse absolute paths and paths that
leave the folder of the first source with `import.include` (essential). `!include <C4/C4_*>`,
the `C4_*.puml` files of the C4-PlantUML repository (by URL or `!includeurl`) and
`<stdlib/…>`/`<awslib/…>` paths SHALL be recognised without reading: C4 sets the C4 level by file
name (`C4_Context`, `C4_Container`, `C4_Component`, `C4_Dynamic`) and other libraries produce
`import.unsupported-construct` (not essential). Any other remote include SHALL be reported with
`import.include` and never fetched. A missing local file SHALL be `import.include`. Inclusion
cycles SHALL be refused.

#### Scenario: Local include
- **WHEN** `main.puml` has `!include common/styles.iuml` and the host can read it
- **THEN** its lines are preprocessed in place

#### Scenario: Network never used
- **WHEN** a source has `!includeurl https://example.com/x.puml`
- **THEN** no request is made and an `import.include` finding points at the line

### Requirement: Built-in functions and limits
The built-ins `%strlen`, `%substr`, `%strpos`, `%upper`, `%lower`, `%string`, `%intval`,
`%boolval`, `%true`, `%false`, `%not`, `%newline`, `%chr`, `%variable_exists`,
`%function_exists`, `%get_variable_value`, `%set_variable_value`, `%size` and `%splitstr` SHALL
work; `%date`, `%filename`, `%dirpath` and `%version` SHALL return stable values (empty date, the
source's name and folder, `"meltemi-import"`). Unknown `%` functions, unbalanced blocks, more than
100 nested expansions or more than 100 000 output lines SHALL stop with `import.preprocessor`
(error) at the offending line. Every produced line SHALL keep the range of the source line it came
from, so findings point at the user's text.

#### Scenario: Runaway recursion
- **WHEN** a procedure calls itself without end
- **THEN** preprocessing stops with `import.preprocessor` at the call

