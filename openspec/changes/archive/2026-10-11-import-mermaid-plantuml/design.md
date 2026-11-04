## Context

- **Targets exist.** Flow diagrams (ELK `layout auto`), free compositions, sequence diagrams and
  models with C4 views compile, lay out and render. An importer writes ordinary `.meltemi` text;
  positions are left to the layout engine unless the source has a grid (`block-beta`).
- **The proposal's rules.** Importers publish coverage by construct and version, keep the original,
  produce native source with a report, and an essential unsupported element prevents declaring the
  conversion complete. Migration never extracts meaning from a rendered image.
- **Formats.** Mermaid diagrams start with a keyword line (after optional front matter and
  `%%{init}%%` directives); PlantUML sources are `@startuml … @enduml` blocks processed by a
  preprocessor before parsing; Markdown carries both in fenced blocks.

## Goals / Non-Goals

**Goals:** the roadmap's diagram types, the preprocessor, Markdown, a report on every construct,
deterministic output that compiles and renders, re-import keeping adjustments, CLI and VS Code.

**Non-Goals:** other diagram types (class, state, ER, Gantt, mind maps…), which are reported as
unsupported; remote includes and network access; exporting back to Mermaid or PlantUML.

## Decisions

### D1. Pipeline

```
text ─▶ detect ─▶ (markdown: fenced blocks) ─▶ front-end per block
     ─▶ builders (flow | sequence | c4 | free) + findings ─▶ printer ─▶ sheet text
     ─▶ self-check: compile without errors ─▶ ImportResult
```

- `importText(text, { format?, fileName?, readFile? })` returns
  `{ text, status: "complete" | "partial" | "failed", diagrams, findings }`. It never throws for
  user input. `readFile(path)` serves `!include` of local files; without it includes are reported.
- **Findings.** `{ code, severity, message, construct, status, essential, range }`, the range in
  the source text, so the CLI prints `source.puml:line:column` and VS Code shows Problems on the
  source.
- **Status.** `failed` when nothing could be imported (unknown format, only unsupported diagrams,
  syntax that stops a diagram); `partial` when an essential construct was dropped
  (`import.partial` summarises); `complete` otherwise. Approximations do not make an import
  partial.

### D2. Ids, labels and comments

- Source ids that are not `.meltemi` identifiers are rewritten (`order-api` → `order_api`, `1` →
  `n1`), uniquely, with `import.renamed-id` (info). Labels keep the source text; a node without a
  label gets its source id as label.
- Line comments (`%%` in Mermaid, `'` in PlantUML) are kept as `//` comments before the statement
  that follows them.
- The sheet starts with `language "0.2"` and `// Imported from <file> (<format>) by meltemi-diagrams.`
  Output is deterministic: no dates, stable order.

### D3. Mermaid

| Source | Target | Notes |
| --- | --- | --- |
| `flowchart`/`graph` + direction | flow diagram, `direction`, `layout auto` | `TD` is `TB` |
| `A[t]`, `A(t)` | `node` | stadium, subroutine, circle, hexagon, parallelogram, trapezoid, asymmetric: `node`, approximated |
| `A{t}` | `decision` | |
| `A[(t)]` | `data` | |
| `-->`, `---`, `-.->`, `==>`, `--o`, `--x`, `<-->` | relations | dotted is dashed; thick is `width 3`; circle and cross ends and bidirectional are approximated; `---` has no arrowhead; relations that need a style are named `e<n>` |
| labels `-->|t|`, `-- t -->`, chains, `&` | labels, one relation per pair | |
| `subgraph id [t] … end`, nested | groups | `direction` in a subgraph is dropped |
| `classDef`, `class`, `:::`, `style`, `linkStyle` | `class` definitions and `style` | `fill`, `stroke`, `color`, `stroke-width`, `stroke-dasharray`; others dropped |
| `click`, `%%{init}%%` | dropped | |
| front matter `title` | `title` | |
| `sequenceDiagram` | sequence diagram | participants, actors, aliases, boxes, `create`/`destroy`, every arrow, `+`/`-`, activations, notes, `loop`, `alt`/`else`, `opt`, `par`/`and`, `critical`/`option`, `break`, `rect` (region), `autonumber` |
| `C4Context`, `C4Container`, `C4Component`, `C4Dynamic` | model + view | D5; `C4Deployment` is unsupported |
| `architecture-beta` | flow diagram | groups, services with icons (`cloud`, `database`, `disk`, `internet`, `server` and `pack:name`), junctions (small nodes), edges with sides as route ports |
| `block-beta` | free composition | `columns`, spans, `space`, nested blocks, shapes, edges; places on a grid of 168 × 84 |

### D4. PlantUML

- **Preprocessor** (`plantuml-preprocessor`): `!define`/`!undef` (object-like and function-like),
  `!definelong … !enddefinelong`, `!procedure`/`!unquoted procedure … !endprocedure`,
  `!function … !return … !endfunction`, `!$var = value` and `?=`, `!if`/`!ifdef`/`!ifndef`/
  `!elseif`/`!else`/`!endif` with comparisons, `&&`, `||` and `!`, `!while`, `!foreach`,
  `!include`/`!include_once` of
  local files (relative to the source, inside the project) and of `<C4/…>` (recognised, not
  read), `!includeurl` and `https://` includes of C4 (recognised) or anything else (reported,
  never fetched), built-ins `%strlen`, `%substr`, `%upper`, `%lower`, `%string`, `%intval`,
  `%true`, `%false`, `%not`, `%newline`, `%variable_exists`, `%function_exists`, `%date` (empty,
  for determinism). Expansion depth and output size are limited; errors are `import.preprocessor`.
- **Description diagrams.** `component`/`[C]`, `interface`/`()`, `node`, `package`, `folder`,
  `frame`, `cloud`, `rectangle`, `database`, `queue`, `artifact`, `storage`, `actor`, `usecase`/
  `(U)`, containers with `{ }` as groups, `as` aliases, arrows of any length with `-`/`.`,
  direction hints, colours (dropped), labels, `<<stereotypes>>` (description), notes (`note … of`,
  `note "t" as N`), `left to right direction`, `title`. Kinds map to flow: `database` and
  `storage` to `data`, the rest to `node`, containers to groups.
- **Sequence diagrams.** Participant kinds map one to one; `->`, `-->`, `->>`, `->x`, `<-`,
  `++`/`--`, `activate`, `deactivate`, `create`, `destroy`, `return`, notes, `alt`/`else`,
  `opt`, `loop`, `par`/`else`, `break`, `critical`, `group` (region), `== t ==` (divider), `...`
  and `...t...` (delay), `|||` and `||n||` (space), `autonumber`, `box … end box`.
- **C4-PlantUML** (D5) after preprocessing: the macros are recognised by name.
- Fragments of both languages get ids `<operator><n>` (`alt1`, `loop2`) so scenarios and re-import
  can name them.
- `@startuml`/`@enduml` blocks each become a diagram; `skinparam`, `hide`, `show`, `scale`,
  `legend`, `header`, `footer`, `caption` are dropped with findings.

### D5. C4 into models and views

- **Entities.** `Person`, `Person_Ext`, `System`, `System_Ext`, `SystemDb(_Ext)`,
  `SystemQueue(_Ext)`, `Container`, `ContainerDb`, `ContainerQueue`, `Container_Ext`,
  `Component`, `ComponentDb`, `ComponentQueue`, `Component_Ext`; `$descr`/`$techn` arguments map
  to `description` and `technology`; `Db` kinds to `datastore` (systems with `Db` are approximated).
- **Boundaries.** `System_Boundary` becomes the system holding its containers; `Container_Boundary`
  the container holding its components; `Enterprise_Boundary` and `Boundary` are flattened
  (approximated). Elements outside a boundary at a level that needs a parent get a synthetic
  system or container, approximated.
- **Relations.** `Rel`, `Rel_*` directions (approximated), `BiRel` (two relations, approximated),
  `Rel_Back` (reversed), labels and `techn`.
- **View.** One view per source diagram: the level from the diagram type (`C4Context` → `context`,
  `C4Container` → `container`, `C4Component` → `component`, `C4Dynamic` → `container`, approximated)
  or, in PlantUML, from the included library; the scope from the single boundary; `include` of every
  drawn entity; `LAYOUT_LEFT_RIGHT` → `direction LR`. Tags, legends and sprites are dropped.

### D6. Re-import

`mergeImport(existing, imported)` returns the imported sheet with, for each diagram whose id and
type are still the same: the existing `placement` entries, `style`, `class`, `rule`, `animate`
statements and C4 local labels whose targets still exist; the existing `layout` mode when it had
placements; and an `import.merge` finding for every statement that was dropped because its target
is gone. Everything else follows the new source.

### D7. Commands

- `meltemi-diagrams import <file> [--from mermaid|plantuml|markdown] [--out <file>] [--force]
  [--merge] [--json] [--check]`: writes `<stem>.meltemi` beside the source; refuses to overwrite
  without `--force` or `--merge`; `--check` writes nothing and reports.
- VS Code: the three commands; the result opens with the canvas; findings in **Meltemi Import** and
  as Problems on the source until it is imported again or closed.

## Risks / Trade-offs

- [Mermaid and PlantUML evolve] → Coverage tables are explicit and versioned in the docs; unknown
  constructs are reported, never guessed.
- [Preprocessor depth] → Limits on expansion keep imports fast and safe; errors point at the source
  line.
- [Auto layout differs from the source's drawing] → The import is a starting point; the canvas and
  re-import with `--merge` keep later adjustments.
