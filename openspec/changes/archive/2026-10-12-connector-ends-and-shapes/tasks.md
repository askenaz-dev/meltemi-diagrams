## 1. Language and model

- [x] 1.1 Tokens `<->` and `<-->` (lexer, parser, CST, formatter, the unexpected-character hint); profile arrows give `line` and `twoWay`; model relations still refuse anything but `->`
- [x] 1.2 `Relation.twoWay` in flow, free, sequence and declared types; model JSON `twoWay`; diff details; anonymous keys unchanged
- [x] 1.3 Value tables: the fifteen heads in `ARROWHEADS` (style and theme), `arrowtail` (relation only), `line dotted`, `corners` (style, relation only, and theme token); validation messages and hints
- [x] 1.4 Corpus: a valid sheet with two-way arrows, every head at both ends, dotted lines and rounded corners (model JSON and SVG); every model JSON snapshot regenerated with `twoWay`; conformance passes

## 2. Layout and render

- [x] 2.1 `endMarker` geometry for every head at either end, with line trimming; the relation emitter draws line, start head, end head, label; outlined shapes unfilled
- [x] 2.2 Bézier trimmed at both ends; sequence messages with `arrowtail`, two-way heads and every head
- [x] 2.3 Rounded corners sampled into the polyline (theme and style `corners`)
- [x] 2.4 Dotted strokes: scene `dotted`, SVG dash `0 g` with round caps, element outlines and relations
- [x] 2.5 Unit tests of the geometry, the theme default, sequence heads; visual references unchanged

## 3. Editing

- [x] 3.1 `setRelationLine` keeps two-way arrows; completion, hover and docs of the arrows, heads, `arrowtail`, `dotted`, `corners`
- [x] 3.2 Inspector: the relation's line field with dotted (arrow or style), start and end heads with their inherited values, route and corners in the strip, `glyphs` hints; element line with dotted
- [x] 3.3 Canvas: glyphs for line, route, corners and heads; icon chip rows; the head grid (radiogroup, keyboard, Escape); select fallback; context menu dotted line

## 4. Import

- [x] 4.1 Mermaid flowchart (`<-->`, `<-.->`, `<==>`, `--o`, `--x`, `o--o`, `x--x`, curves), sequence (`<<->>`, `<<-->>`), architecture (`<-->`), block links
- [x] 4.2 PlantUML description (both heads, `|>`, `*`, `o`, `x` at either end) and sequence (`<->`, `<-->`); coverage tables, findings, `pnpm import:docs`, corpus reports

## 5. Documentation, version and checks

- [x] 5.1 Grammar, styles, layout, svg-export, sequence, model-json, diagnostics, editor docs; import tracks; skill references and `pnpm skills:sync`; VS Code grammar and the playground highlighter; decision 0036; CHANGELOG 1.2.0; `pnpm release:version 1.2.0`
- [x] 5.2 Webview and playground browser tests of the icon pickers and the head grid; typecheck, lint, unit tests, every browser suite, VS Code tests, `pnpm conformance`, `pnpm acceptance`
