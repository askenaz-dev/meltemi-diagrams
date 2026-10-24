## Why

Three things the owner asked for on 2026-10-23 have one cause each in the language and the
drawing. A relation cannot be a plain line: the lexer's `-` branch makes `->` an `Arrow`, `-->` a
`DashedArrow` and `-digit` a number, and anything else starting with `-` is an `Unknown` token
(`packages/language/src/lexer.ts:176-191`, `355-358`), so `a -- b` is `syntax.unexpected-character`
with the hint that the arrows are `->`, `-->`, `<->` and `<-->` (`packages/language/src/messages/en.ts:98`);
the only way to draw a line between two boxes is `style x { arrowhead none }` on a named relation,
which is what the Mermaid and PlantUML importers write for every open link
(`packages/import/src/mermaid/flowchart.ts:686`, `packages/import/src/plantuml/description.ts:626`).
Nothing can be a line that joins no element at all: `FreeElementKind` is `box | text | icon |
image | group` (`packages/model/src/types.ts:28`), every relation joins two element ids and every
`route` names a relation (`packages/model/src/flow.ts:1436-1437`), so a bracket, a divider or an
underline on a free sheet has no statement. The "line kinds" of draw.io exist as `routing`
(`auto`, `orthogonal`, `polyline`, `bezier`) and `corners` (`docs/language/layout.md:169-182`), but
nothing hand-drawn exists anywhere in `packages/render`, `packages/model`, `packages/layout` or
`docs/language`, and the renderer has no third-party dependency to draw it with
(`packages/render/package.json:34-37`). Text in a free box has a horizontal choice only:
`textAlign` is free-only (decision 0043; `packages/layout/src/styles.ts:46`, `alignOf` at
`packages/layout/src/layout.ts:2845-2849`), while the vertical place is one point per shape from
`shapeTextCenter` (`packages/layout/src/shapes.ts:1036-1066`), consumed at `layout.ts:4143` and
stacked by `lines()` (`4186-4215`); a free `text` is centred at `box.y + box.height / 2 − lines ×
font.line / 2` (`layout.ts:3966`), and the centred-icon band sits at the `labelPosition` edge
(`layout.ts:3232-3248`). This change adds the two line tokens, free-standing lines, a sketched
stroke as a theme token with two built-in themes, and `verticalAlign` with an alignment picker.
Post-1.0 change, outside the roadmap (`docs/roadmap-1.0.md`); it builds on `free-profile`,
`styles-and-themes`, `text-measurement-and-fonts`, `connector-ends-and-shapes`,
`containers-shapes-and-corners`, `icon-placement-and-picker`, `agent-shape-and-inline-text`,
`canvas-styling-and-themes` and `canvas-feel-and-naming`.

## What Changes

- **Line tokens.** `--` (a solid line, no heads) and `---` (a dashed line, no heads) join `->`,
  `-->`, `<->` and `<-->` as relation tokens of flow and free diagrams: one more dash is dashed,
  the head glyph dropped. The lexer takes the longest match (`---` before `-->` before `--` before
  `->`); `--->` is `syntax.unexpected-character` at `>` and the hint names the six tokens. A
  relation records `heads` (`end`, `both` or `none`) beside `line`; `twoWay` stays `heads ===
  "both"`. A `--` relation draws no head unless `arrowhead` or `arrowtail` is written, the way the
  theme's `arrowhead` is the default of `->`. Sequence messages and C4 views refuse the tokens with
  `flow.arrowUnavailable`, as C4 views refuse `<->` today. The relation tool lists six kinds, R
  cycles all six, the strip's heads of a `--` relation show `none` greyed at both ends, the line
  row keeps the heads when it rewrites the token. The parser, the formatter, the TextMate grammar,
  completion, hover and the symbol list, the model JSON, the importers (Mermaid `---`, `-.-`, `===`,
  architecture `--`, block links; PlantUML headless arrows and note links become `--` or `---`,
  not `arrowhead none`) and the docs follow.
- **Free lines.** A free object `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), …]]
  [{ … }]`, free diagrams only, its points in the parent's interior coordinates like `place`. It is
  drawn by the connector machinery: `routing` (`polyline` by default; `orthogonal` and `bezier`
  when styled), `corners`, `line`, `width`, `stroke`, `arrowhead` and `arrowtail` (`none` by
  default), a label pill at 50 % moved by `label <id> at …`; `flow`, `dash`, `pulse` and `trace`
  run on it as on a relation; it has a layer and a place in the paint order like any object. On
  the canvas it is selected by its stroke, its ends, bends and stretches have the handles of a
  route, dragging them or the whole line rewrites the statement, snapped to the grid; the arrow
  tool pressed on empty canvas of a free diagram and dragged draws a line whose dashes and heads
  come from the armed kind as written styles, while a press on an element still starts a relation.
- **Sketched strokes.** A theme token `sketch none|light|rough` (built-in themes `none`). The
  renderer paints every stroke of shapes, connectors, heads, label pills, group bands and the frame
  as two passes offset by a jitter from a PRNG seeded by the group's id and the pass index, so the
  output is deterministic and snapshots are stable; fills stay clean, text, icons and images are
  untouched, and the layout's geometry (`track`, `bounds`, hit tests, handles, magnets) stays the
  clean one. Two built-in themes, `sketch.light` and `sketch.dark`, extend the technical pair with
  `sketch light`; any theme or diagram may set `sketch`; the theme panel gets the field with
  pictures. A hand font for the two themes is an owner approval (Open Questions of the design):
  until it lands they use Inter with sketched strokes.
- **Vertical alignment.** `verticalAlign top|middle|bottom` on free boxes, `middle` by default,
  free diagrams only like `textAlign` (decision 0043): the label and description block moves to
  the top or the bottom of the shape's text band where the shape has one (`rounded`, `rectangle`,
  `square`, `framed`, `ellipse`, `circle`, `pill`, `hexagon`, `octagon`, `parallelogram`,
  `trapezoid`, the body of `cylinder` and `callout`, the page of `document`, the shaft of `arrow`,
  `flag`), with the icon row or column; on shapes whose text spot is fixed (`triangle`,
  `pentagon`, `star`, `person`, `agent`, `icon`), when `iconPosition center` puts the band at a
  `labelPosition` edge, and on kinds that never use it, the layout reports
  `layout.vertical-align-ignored` (warning) once per statement, as `layout.label-position-ignored`
  does. The inline editor sits where the text is drawn. The strip gets a nine-cell alignment
  picker for free boxes (a three-cell row for texts) writing `textAlign` and `verticalAlign` with
  the defaults greyed; completion, hover, the formatter and the declared-type validator follow.
- **Documentation.** `docs/language/grammar-0.2.md` (tokens, EBNF, the flow and free statement
  tables, the theme token table), `styles.md` (arrow heads, the token table, the `sketch` token),
  `layout.md` (connectors: lines), `free.md` (objects, text and shapes, `verticalAlign`, lines),
  `svg-export.md` (headless relations, sketched strokes), `model-json.md` (`heads`, `line`),
  `diagnostics.md` (the six-token hint, `layout.vertical-align-ignored`), `fonts.md` and
  `motion.md` (targets) with their Spanish copies under `docs/es/language/`; `docs/editor.md` and
  `docs/es/editor.md` (the six kinds, drawing a line, editing its points, the alignment picker, the
  theme panel's `sketch`); the skill references `skills/meltemi-diagrams/reference/language.md`
  and `free.md` synced with `pnpm skills:sync`; the changelog's 1.10.0 section; decision 0058.

## Non-goals

- The Effects cards of the strip and the colours of effects belong to `panel-and-effects-polish`.
- The pointer tool and notes in free diagrams belong to `pointer-and-notes`.
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `language-syntax`: "Lexical structure" gains the tokens `--` and `---`, the longest-match rule and
  the six-token hint.
- `flow-diagram-model`: "Relations" gains the two headless forms, the `heads` fact and the refusal
  in sequence and C4 diagrams.
- `free-diagram-model`: "Free diagrams compile" lists `line` among the declarations and the
  headless tokens among the relations (`pointer-and-notes` extends the same list with `note`, so
  whichever archives second rebases the block); new requirements "Free lines" (the `line` object,
  its points, its properties, the free-only rule) and "Vertical text alignment" (`verticalAlign`
  accepted in free diagrams, refused in flow).
- `free-layout`: new requirements "Free lines are drawn", "Vertical alignment in shapes" and
  "Vertical alignment ignored".
- `connector-routing`: new requirement "Lines are routed as connectors".
- `quick-styling`: "Relation tool" lists six kinds and shows `none` greyed for a `--` relation; new
  requirement "Text alignment picker".
- `free-editor-tools`: new requirements "Line kinds and free lines in the palette" and "Services
  for lines and alignment"; "Free palette and pickers" names the six kinds of the arrow button.
- `diagram-canvas`: new requirement "Editing a free line"; "Creating and connecting" lists the six
  kinds of the arrow button's menu.
- `theme-tokens`: "Token table" gains `sketch`; "Built-in themes" lists eight themes; new
  requirement "Sketched strokes".
- `svg-font-policies`: new requirement "A hand font for sketch themes".
- `editor-language-services`: "Completion" offers the six tokens and `verticalAlign`; new
  requirement "Hover and symbols name the written token".
- `model-json-interchange`: new requirement "Lines and heads in JSON".
- `mermaid-import`: "Flowchart links" and "Mermaid architecture diagrams" write `--` and `---`.
- `plantuml-import`: "Description arrows and notes" writes `--` and `---`.
- `motion-effects`: "Effect targets" accepts free lines.
- `source-formatting`: new requirement "Line tokens and line statements".

## Impact

- `packages/language`: `src/lexer.ts` (the `-` branch, `canStartSomething`), `src/tokens.ts`
  (`Line`, `DashedLine`, `PUNCTUATION_TEXT`, `isArrowKind`), `src/messages/en.ts` and `es.ts`
  (the `arrows` and `minus` hints); `test/lexer.test.ts`, `test/parser.test.ts`,
  `test/format.test.ts`, `test/roundtrip.test.ts`.
- `packages/model`: `src/types.ts` (`Relation.heads`, `FreeElementKind` with `line`,
  `Element.line`), `src/schema.ts` (`FREE_ELEMENT_KINDS`, the profiles' `arrows` tables,
  `arrowToken`, `VERTICAL_ALIGNS`, `FREE_STYLE_PROPERTIES`, `SKETCH_LEVELS`, `THEME_TOKENS`,
  `BUILT_IN_THEMES`, `takesRotation`), `src/flow.ts` (the relation compiler, `FREE_DECLARATIONS`,
  the `line` declaration, `label` on lines, `NO_OUTLINE_KINDS`, `animationTargetFits`),
  `src/json.ts`, `src/diff.ts`, `src/diagram-types.ts`, `src/messages/en.ts` and `es.ts`;
  `test/flow.test.ts`, `test/free.test.ts`, `test/json.test.ts`, `test/themes.test.ts`,
  `test/corpus.test.ts` and the `.model.json` snapshots under `corpus/`.
- `packages/layout`: `src/theme.ts` (`Theme.sketch`, `sketch.light`, `sketch.dark`),
  `src/styles.ts` (`verticalAlign`), `src/layout.ts` (headless ends, lines through the connector
  machinery, the vertical band, `layout.vertical-align-ignored`), `src/free.ts`, `src/scene.ts`
  (`Scene.sketch`), `src/shapes.ts`, `src/messages/en.ts` and `es.ts`; `test/free.test.ts`,
  `test/layout.test.ts`, `test/markers.test.ts`, `test/themes.test.ts`, `test/shapes.test.ts`.
- `packages/render`: `src/sketch.ts` (new: the two-pass painter and its PRNG), `src/svg.ts`;
  `test/svg.test.ts`, `test/corpus.test.ts` and `test/examples.test.ts` with the SVG snapshots
  under `corpus/valid`, `examples/`; `test/skills.test.ts`.
- `packages/motion`: `src/plan.ts` (a group with a `track` is animated as a connector whatever its
  role); `test/motion.test.ts`.
- `packages/import`: `src/writer.ts` (`arrowToken`), `src/mermaid/flowchart.ts`,
  `architecture.ts`, `block.ts`, `src/plantuml/description.ts`; `test/import.test.ts`,
  `test/corpus.test.ts` and the sheets under `corpus/import`.
- `packages/edit`: `src/types.ts` (`createRelation.heads`, `createLine`, `setLinePoints`),
  `src/create.ts`, `src/relations.ts`, `src/plan.ts`, `src/free.ts`; `test/free.test.ts`,
  `test/operations.test.ts`.
- `packages/editor`: `src/canvas/palette.ts` (six kinds), `src/canvas/protocol.ts`
  (`connect.heads`, `ElementInfo.line`, `createLine`, `setLinePoints`), `src/session.ts`,
  `src/inspector.ts` (`withRelationDefaults`, `STRIP`, the alignment fields, `kindOptions`),
  `src/text-places.ts`, `src/themes.ts` (the `sketch` field), `src/services/completion.ts`,
  `hover.ts`, `navigation.ts`, `src/messages/en.ts` and `es.ts`; `test/canvas-palette.test.ts`,
  `test/strip.test.ts`, `test/free.test.ts`, `test/canvas.test.ts`, `test/text-places.test.ts`,
  `test/services.test.ts`, `test/themes.test.ts`, `test/messages.test.ts`.
- `packages/canvas`: `src/app.ts` (the kinds menu, R, the line drag of the arrow tool, line
  handles), `src/glyphs.ts` (headless pictures, the alignment and sketch families),
  `src/inspector.ts` (the alignment picker, the sketch row), `canvas.css`, `src/messages/en.ts`
  and `es.ts`; `test/messages.test.ts` and a new `test/alignment-picker.test.ts`.
- `packages/vscode`: `syntaxes/meltemi.tmLanguage.json`; `test/webview/run.ts` (the six kinds,
  drawing and editing a line, the alignment picker, a sketched theme on the canvas).
- `packages/playground/test/browser/run.ts`: the alignment picker and a line on the playground.
- `packages/fonts`: the hand font (gated on the owner's approval): `package.json`, `src/`,
  `README.md`, `test/bundled-files.test.ts`; `THIRD_PARTY_LICENSES.md` by `pnpm licenses:inventory`.
- Pictures: `corpus/valid/free/lines.meltemi` and `sketched.meltemi` with their `.svg` and
  `.model.json`, `corpus/valid/edge/arrows.meltemi` with headless relations, `corpus/acceptance/visual/free/lines`
  and `free/sketch` in `manifest.json`, `gallery/free/sketch.meltemi` with its SVG, PNG and PDF.
- Docs and the decision: the files of the documentation bullet, `CHANGELOG.md`,
  `docs/decisions/0058-lines-sketch-and-text-alignment.md`.
