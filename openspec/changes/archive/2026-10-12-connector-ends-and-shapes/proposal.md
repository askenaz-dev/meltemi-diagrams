## Why

Testing 1.1, the owner found the arrows too limited next to draw.io and Excalidraw: a relation has
a head only at its target, the heads are `triangle`, `open` or `none`, lines are solid or dashed,
corners are always sharp, and the inspector chooses all of it from text lists. They asked to set
both ends of an arrow, to choose heads and line types by their pictures, and for more arrow types,
rounded ones included. Two-way arrows are also what the Mermaid and PlantUML importers currently
approximate as one-way.

## What Changes

- **Two-way arrows in the language.** `a <-> b` and `a <--> b` (dashed) draw a head at both ends,
  in flow, free and sequence diagrams and in declared diagram types. `--` and `<-` stay invalid;
  model relations stay `->`.
- **A head at the start.** The style property `arrowtail` sets the head at the source end, with the
  same values as `arrowhead`; without it a relation has no start head, or the end's head when it is
  written `<->`.
- **More heads.** `arrowhead` and `arrowtail` (and the theme token `arrowhead`) accept `none`,
  `triangle`, `triangleOutline`, `open`, `diamond`, `diamondOutline`, `circle`, `circleOutline`,
  `bar`, `cross`, and the crow's-foot ends of entity-relationship diagrams `many`, `oneOrMany`,
  `zeroOrMany`, `zeroOrOne` and `onlyOne`.
- **Dotted lines.** `line dotted` for relations and outlines, beside `solid` and `dashed`.
- **Rounded corners.** The style property and theme token `corners sharp|rounded` round the bends
  of straight and elbow connectors; built-in themes stay `sharp`.
- **Pictures instead of words in the strip.** The style strip shows the line (solid, dashed,
  dotted), the route (automatic, straight, elbow, curved), the corners and both heads as rows of
  icons; the heads open a grid of every head. Each still writes the same statements.
- **Importers keep more.** Mermaid `<-->`, `o--o`, `--o`, `--x` and link curves, sequence
  `<<->>`, PlantUML two-headed arrows and `|>`, `*`, `o`, `x` heads map to the new syntax and heads
  instead of being approximated.
- The product version moves to 1.2.0, with the trace effect.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `language-syntax`: the arrows `<->` and `<-->`.
- `flow-diagram-model`: two-way relations.
- `sequence-diagram-model`: two-way messages.
- `style-classes-and-rules`: `arrowtail`, the new heads, `line dotted` and `corners`.
- `theme-tokens`: the new heads in `arrowhead`, and `corners`.
- `connector-routing`: rounded corners.
- `flow-svg-export`: heads at both ends, their geometry, dotted lines.
- `sequence-layout`: heads at both ends of messages.
- `source-editing`: `setRelationLine` keeps a two-way arrow two-way.
- `quick-styling`: icon pickers for line, route, corners and heads.
- `diagram-canvas`: the relation fields of the inspector.
- `mermaid-import`, `plantuml-import`: the arrows and heads they now keep.

## Impact

- `packages/language`: tokens, lexer, parser, formatter.
- `packages/model`: profile arrows, `Relation.twoWay`, value tables, model JSON (`twoWay`),
  diff, the edit-facing types.
- `packages/layout`: end markers, trimming at both ends, Bézier at both ends, rounded corners,
  dotted strokes, sequence messages; `packages/render`: dotted dashes.
- `packages/edit`: `setRelationLine`; `packages/editor`: inspector fields, strip, completion and
  hover; `packages/canvas`: icon pickers and glyphs; the context menu.
- `packages/import`: Mermaid and PlantUML arrows, coverage tables, generated docs.
- `packages/vscode/syntaxes`, the playground highlighter, docs (grammar, styles, layout,
  svg-export, sequence, model-json, editor, import tracks), skill references, corpus, decision
  0036, CHANGELOG 1.2.0.
- Additive within language 0.2: no valid file changes meaning and no existing drawing changes. The
  model JSON gains `twoWay` on relations (an added field, version 0.1 kept).
