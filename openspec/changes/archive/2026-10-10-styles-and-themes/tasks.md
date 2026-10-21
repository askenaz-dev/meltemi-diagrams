## 1. Model: tokens, values and built-in names

- [x] 1.1 Rename the built-in themes in `schema.ts` to `technical.*`, `editorial.*` and `stage.*`, with `DEFAULT_THEME` `technical.light`
- [x] 1.2 Add the colour tokens `success`, `warning`, `danger` and `info`, the number tokens with their ranges, `labelWeight` and `arrowhead` to `THEME_TOKENS`
- [x] 1.3 Add the value specs `number` (range, optional allowed values, `px` accepted), `size` (a pair of numbers) and `classes`, and let `color` accept colour token names stored as `@<token>`
- [x] 1.4 Add `BUILT_IN_CLASSES`, `STYLE_PROPERTIES` with `width`, `pattern`, `arrowhead` and `class`, `RULE_KINDS`, `PRESETS`, `PATTERNS` and `ARROWHEADS`
- [x] 1.5 Theme blocks: read number tokens, `class <id> { }` and `rule <kind> { }` into `ThemeDefinition.classes` and `rules`; tokens become `string | number`
- [x] 1.6 Flow diagrams: `class` and `rule` statements, `preset` and `canvas` properties (with the conflict check), `class` in element, group and relation blocks and in `style`, new style properties, target-kind checks for `pattern` and `arrowhead`
- [x] 1.7 Types: `ClassDefinition`, `RuleEntry`, `ClassUse`, `classes` on elements, relations and style entries, `preset` and `canvas` in diagram properties
- [x] 1.8 JSON: `classes` and `rules` in diagrams and themes, classes on elements, relations and styles, `preset` and `canvas`, numbers kept as numbers
- [x] 1.9 Model tests for tokens, classes, rules, presets, style values and JSON

## 2. Layout: themes, styles and geometry

- [x] 2.1 `Theme` with every token, six built-in themes and the built-in classes; `resolveTheme` merges classes and rules along the chain
- [x] 2.2 Style resolver with the precedence of D4 and colour token substitution
- [x] 2.3 Token-driven sizes, line heights, paddings, group band, margin, radii and widths; vertical fit for description lines; default sizes scaled with `labelSize`
- [x] 2.4 Arrowheads `triangle`, `open` and `none` with `arrowSize`; relation `width` and `arrowhead`
- [x] 2.5 Patterns: scene pattern definitions and overlay items
- [x] 2.6 Frame strip scaled with `frameSize` and spanning the canvas
- [x] 2.7 Presets and `canvas`, and `layout.too-large`
- [x] 2.8 `LayoutOptions.defaultTheme`
- [x] 2.9 Layout tests for themes, precedence, geometry, arrowheads, patterns and presets

## 3. Render

- [x] 3.1 `<pattern>` definitions in `<defs>` and open arrowheads as polylines
- [x] 3.2 Render tests for patterns

## 4. Project and CLI

- [x] 4.1 Manifest `theme` field with form checks, schema entry and `MANIFEST_FIELDS`
- [x] 4.2 Workspace check that the theme file declares the theme; invalidation of the theme file
- [x] 4.3 Programs include the theme file; `projectTheme(program)`; `themeDefinitionsFor` includes the project theme; reserved names follow the new prefixes
- [x] 4.4 `theme.unknown-class` in project compilation
- [x] 4.5 `export` passes `defaultTheme`
- [x] 4.6 Project and CLI tests, including the `overview` diagram of the commerce corpus

## 5. Corpus, examples, docs and skill

- [x] 5.1 Replace the old theme names in the corpus, examples, brand files and tests; add `overview.meltemi`, the project theme and a class to the commerce corpus; regenerate snapshots and SVGs and review them as numbers-only except intended changes
- [x] 5.2 A names test that fails when `meltemi.light`, `meltemi.dark`, `studio.light` or `studio.dark` appear outside archived changes
- [x] 5.3 `docs/language/styles.md`; updates to the grammar, diagnostics, SVG export, fonts, projects and model JSON references; decision 0013; README
- [x] 5.4 Skill: themes reference rewritten, language and layout references and examples updated; `pnpm skills:sync`

## 6. Verification

- [x] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm licenses:inventory --check`, `pnpm mdg validate corpus/projects/valid/commerce` and `pnpm mdg format --check examples skills corpus/projects/valid`
- [x] 6.2 Export the Konfío example and the commerce corpus with each built-in theme and look at the results
