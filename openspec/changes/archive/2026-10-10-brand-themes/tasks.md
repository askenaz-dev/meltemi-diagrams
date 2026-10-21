## 1. Theme blocks in the model

- [x] 1.1 Add `THEME_TOKENS`, `FRAME_MODES`, `MARK_MODES` and `BUILT_IN_THEMES` to the schema; drop `theme` from the parse-only blocks
- [x] 1.2 Add `ThemeDefinition` and `Document.themes`; compile `theme` blocks with token validation, `theme.unknown-base` and `theme.cycle`
- [x] 1.3 Emit `themes` in the model JSON and write model tests for the theme scenarios

## 2. Theme resolution and the frame

- [x] 2.1 Rewrite the layout theme table: `meltemi.light` (default), `meltemi.dark`, `studio.light`, `studio.dark`, with `accent`, `accentEnd`, `frame`, `brand` and `mark` tokens
- [x] 2.2 Implement `resolveTheme(name, definitions)` with file themes, `extends` chains and visited-set protection
- [x] 2.3 Add gradients and group transforms to the scene; embed the Meltemi V2 mark paths and draw the footer or header frame
- [x] 2.4 Accept a theme override in `layoutDiagram` and write layout tests for resolution, the frame and the override

## 3. Render and CLI

- [x] 3.1 Emit `<defs>` with linear gradients and `transform` on groups; keep the portability checks
- [x] 3.2 Add `--theme <name>` to `studio export` with tests for a built-in override and an unknown name

## 4. Corpus and documentation

- [x] 4.1 Add `corpus/valid/edge/themed.meltemi` (file theme extending a built-in, footer) and `corpus/valid/edge/header-frame.meltemi` (header, no mark); regenerate SVG and model snapshots
- [x] 4.2 Add `corpus/invalid/theme.unknown-base.meltemi` and `corpus/invalid/theme.cycle.meltemi`; update `block.unsupported.meltemi` to use a `story` block
- [x] 4.3 Update `docs/language/grammar-0.2.md`, `docs/language/svg-export.md`, `docs/language/diagnostics.md`, `docs/language/model-json.md` and the README; write `docs/decisions/0007-branding-as-theme.md`

## 5. Brand assets

- [x] 5.1 Write `brand/README.md` with the naming shortlist and recommendation, the lockup rules, the glyph and file icon, palette and typography
- [x] 5.2 Create `brand/meltemi-charts-lockup-light.svg` and `-dark.svg` from the Meltemi V2 mark and wordmark plus the outlined `CHARTS` pill
- [x] 5.3 Create `brand/meltemi-charts-glyph.svg` and `brand/meltemi-charts-file-icon.svg`
- [x] 5.4 Create `brand/meltemi-charts-board.svg` and check it, the lockups and a branded export in the browser

## 6. Quality

- [x] 6.1 Switch the Konfío example to the branded default, re-export it and review the result in the browser beside the original
- [x] 6.2 Run typecheck, lint, test, build and validate the change with `openspec validate brand-themes --strict`
