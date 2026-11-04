## MODIFIED Requirements

### Requirement: Re-import keeps manual adjustments
`mergeImport(existing, imported)` SHALL return `{ text, findings }`: the imported sheet in which,
for every diagram whose id and type are the same in both, the existing sheet's adjustments are
kept when their targets still exist:

- `layout`, `routing`, `theme`, `preset` and `canvas` statements, and the view statements of gantt
  charts (`axisFormat`, `ticks`, `weekStart`, `axis`, `labels`, `display`, `dependencies` and
  `dayWidth`) (the existing ones replace the imported ones);
- `placement` statements (`place`, `size`, `route`, `label`, constraints, `space`, `gap`), with
  constraint lists reduced to the targets that remain;
- `style`, `animate`, `class` and `rule` statements, with target lists reduced the same way;
- classes, ports, `link` and `layer` written in element blocks, re-applied to the same ids;
- relation ids: an imported relation without id SHALL take the id of the existing relation with
  the same endpoints and occurrence order;
- sequence fragment ids and `scenario` blocks, and C4 view `label` statements.

A gantt chart's schedule (sections, tasks, their clauses and status words, `exclude`, `include` and
`today`) SHALL come from the source.
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

#### Scenario: A re-imported roadmap
- **WHEN** the owner's roadmap was imported, the user wrote `labels column`, `dayWidth 14` and
  `style tec1 { fill warning }`, and the source gains a task and lengthens flu2 to 12 days
- **THEN** the merged sheet keeps `labels column`, `dayWidth 14` and the style, declares the new
  task, has flu2 `for 12d`, and `corpus/import/merge/gantt/merged.findings.txt` is empty

#### Scenario: A styled task that is gone
- **WHEN** the source no longer has tec2 and the sheet wrote `style tec2 { fill warning }`
- **THEN** the style is dropped with `import.merge` naming `tec2`
