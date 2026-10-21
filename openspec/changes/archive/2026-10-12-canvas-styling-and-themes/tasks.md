## 1. Language: effect durations in themes

- [x] 1.1 `flowDuration`, `dashDuration`, `pulseDuration` in `THEME_TOKENS` as times with `ms` or `s` (100 ms to 60 s, stored in ms); `prop.invalid-value` range; theme definitions, the resolved theme and model JSON carry them
- [x] 1.2 `motionOptions(theme)` gives `planMotion` the theme's colours and durations; an effect takes its own duration, else the theme's, else the constant; the canvas preview, the animated SVG, story and effects views (players, videos) all plan through it
- [x] 1.3 Corpus: a valid theme with the tokens (`corpus/valid/motion/theme-durations.meltemi` and its model JSON), an invalid one out of range; conformance passes; `docs/language/styles.md` and `motion.md`

## 2. Edit operations

- [x] 2.1 `createTheme`, `setThemeToken`, `removeThemeToken` in `packages/edit` with minimal edits, validation against the token table, inverse plans and fixtures in `corpus/edits/`
- [x] 2.2 Style and effect operations on an anonymous relation prepend `materializeRelationId` (inspector and effects services, distinct ids in one edit, a status notice); relations get the classes field

## 3. Editor services

- [x] 3.1 Inspector model: the style strip section (swatches of the effective theme with resolved colours, inherit, line, width, arrowhead, effects with speed and the theme default greyed, the theme row with the light/dark counterpart); batch plans for a selection
- [x] 3.2 Icon pick from the Icon field (`SessionResult.pick` with a style target) written with `setStyleProperty`
- [x] 3.3 Theme creation: in the file (block + `theme "<id>"` in one batch) and in the project (`themes/<id>.meltemi` plus the `project.json` default through a minimal JSON text edit; multi-file result as renames return); refusal of an id in use
- [x] 3.4 Theme panel model: tokens by group with resolved values, embeddable fonts (bundled and `assets/fonts/`), "custom" for other stacks; `setThemeToken` and `removeThemeToken` in the block's own file

## 4. Canvas

- [x] 4.1 Style strip rendering: swatch rows with names and resolved colours, native colour input, inherit, "mixed"; keyboard reach and status announcements
- [x] 4.2 Relation tool in the palette (R; Message on sequence): source highlight, target click, Escape, Shift
- [x] 4.3 Theme panel: groups, pickers, inherit, open from the Theme field; "New theme from this one…" dialog (id, file or project)
- [x] 4.4 Hosts: VS Code and the playground pick icons for style targets and create the project's theme file; status line names every file written

## 5. Tests, documentation and version

- [x] 5.1 Unit tests of the operations, the inspector model, the planner defaults and the JSON edit of `project.json`; webview and playground browser tests of the strip, the relation tool, the icon pick and the theme panel; the acceptance visual references unchanged
- [x] 5.2 `docs/editor.md` (strip, relation tool, theme panel), `docs/playground.md`, `docs/features.md`, `CHANGELOG.md` 1.1.0, decision 0034 (styling on the canvas and custom themes); `pnpm release:version 1.1.0`
- [x] 5.3 Typecheck, lint, unit tests, every browser suite, VS Code tests, `pnpm conformance`, `pnpm acceptance`
