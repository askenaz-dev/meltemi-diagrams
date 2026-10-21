## ADDED Requirements

### Requirement: Re-import keeps manual adjustments
`mergeImport(existing, imported)` SHALL return `{ text, findings }`: the imported sheet in which,
for every diagram whose id and type are the same in both, the existing sheet's adjustments are
kept when their targets still exist:

- `layout`, `routing`, `theme`, `preset` and `canvas` statements (the existing ones replace the
  imported ones);
- `placement` statements (`place`, `size`, `route`, `label`, constraints, `space`, `gap`), with
  constraint lists reduced to the targets that remain;
- `style`, `animate`, `class` and `rule` statements, with target lists reduced the same way;
- classes, ports, `link` and `layer` written in element blocks, re-applied to the same ids;
- relation ids: an imported relation without id SHALL take the id of the existing relation with
  the same endpoints and occurrence order;
- sequence fragment ids and `scenario` blocks, and C4 view `label` statements.

Statements whose targets are gone SHALL be dropped with one `import.merge` info finding each.
After merging, the sheet SHALL be compiled and any copied statement that causes an error SHALL be
dropped the same way, so the result compiles without errors.

#### Scenario: Placement survives
- **WHEN** a flowchart was imported, the user wrote `layout assisted` and `place api at (400,
  120)`, and the source gains a node
- **THEN** the merged sheet keeps `layout assisted` and the `place`, and declares the new node

#### Scenario: Removed node
- **WHEN** the source no longer has `cache` and the sheet styled it
- **THEN** the style statement is dropped with `import.merge` naming `cache`

### Requirement: Blocks not in the source
Top-level blocks of the existing sheet that the import does not produce (other diagrams, themes,
models, comments between them) SHALL be kept after the imported blocks, each with an
`import.merge` info finding saying it is not in the source. Diagrams with the same id but a
different type SHALL take the imported version with an `import.merge` warning.

#### Scenario: Converted copy kept
- **WHEN** the user added a free copy `checkout_free` with `mdg convert` and re-imports
- **THEN** `checkout_free` is still in the sheet
