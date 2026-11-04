## ADDED Requirements

### Requirement: Moving files rewrites imports
`moveFileEdits(sessions, moves)` of the editor package SHALL return, for a list of moves `{ from,
to }` made together, the text edits of every file of the project whose imports resolve to a file
that moves, rewriting each such import's path to the relative path from where the importing file
is after the moves to where the imported file is, and, for each file that moves, the edits that
rewrite its own imports relative to where it goes; files that move together and import each other
keep their imports when the relative path does not change. The edits SHALL be keyed by the path
each file has after the moves; paths SHALL be written as the language takes them (`./` or `../`,
`/` separators, `.meltemi`, the shortest form). The edits SHALL change the path strings only,
keeping comments and formatting. A file that does not parse SHALL be left as it is and named among
the skipped. Hosts SHALL apply the move and the edits as one undoable step.

#### Scenario: An importer follows the move
- **WHEN** `diagrams/views.meltemi` holds `import "../models/system.meltemi" as sys` and `models/system.meltemi` moves to `models/core/system.meltemi`
- **THEN** the edits rewrite the import to `"../models/core/system.meltemi"` and nothing else in the file changes

#### Scenario: The moved file's own imports
- **WHEN** `diagrams/views.meltemi`, which imports `"../models/system.meltemi"`, moves to `diagrams/c4/views.meltemi`
- **THEN** its import becomes `"../../models/system.meltemi"`

#### Scenario: An import of something else
- **WHEN** a file imports `"../models/other.meltemi"` and `models/system.meltemi` moves
- **THEN** that file has no edit

#### Scenario: A file that does not parse
- **WHEN** an importer's text is `import "../models/system.meltemi" as` and the model moves
- **THEN** the file is named in `skipped` and has no edit
