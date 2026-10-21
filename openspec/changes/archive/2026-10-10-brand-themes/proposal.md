## Why

Exported sheets must carry the identity of the product family they belong to. Meltemi, the agentic IDE, already has a brand system (the continuous-line `m` with two sails and a minimal hull, the Aegean palette, Inter). The diagrams tool has none: its exports use a neutral "studio" look and the brand can only be imitated by writing colours into every file. The proposal reserves `theme <id> { }` blocks and a `themes/` folder for exactly this, and the first real sheet (Konfío Agent Platform) is the natural place to show a branded export.

## What Changes

This change makes branding part of the language and ships the Meltemi family look.

- Compile `theme <id> { }` blocks into theme definitions: colour tokens (`background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`), fonts (`font`, `mono`), `extends "<theme>"`, and the export frame (`frame none|footer|header`, `brand "<text>"`, `mark meltemi|none`). Unknown bases and inheritance cycles are diagnostics.
- Add built-in themes `meltemi.light` (new default) and `meltemi.dark` beside the existing `studio.light` and `studio.dark`; a diagram's `theme "<name>"` resolves built-ins and file themes alike, and `studio export --theme <name>` overrides it.
- Draw an optional frame: a footer (or header) strip with the Meltemi mark drawn with its gradient, the product wordmark and the diagram title. Scenes gain linear gradients and group transforms; the SVG renderer emits `<defs>` for them.
- Publish the sub-brand under `brand/`: naming shortlist with the recommended name "Meltemi Charts", lockups, product glyph, file-type icon, presentation board and a guide.
- Add `themes` to the model JSON, corpus files for themes and frames, docs and a decision note.

No **BREAKING** changes for sources: files without `theme` render with the new default look; files naming `studio.*` keep theirs.

## Capabilities

### New Capabilities
- `theme-blocks`: compiling `theme` blocks, token validation, inheritance and resolution of theme names.

### Modified Capabilities
- `flow-svg-export`: built-in themes, file themes, the export frame with the brand mark, and gradients in the portable SVG.
- `cli-export`: `--theme <name>`.
- `model-json-interchange`: `themes` in the document JSON.

## Impact

- `@dac/model` gains theme analysis; `@dac/layout` gains theme resolution, the frame and the embedded mark; `@dac/render` gains `<defs>` and `transform`. `@dac/cli` gains one option.
- New diagnostic codes: `theme.unknown-base`, `theme.cycle`. `block.unsupported` no longer applies to `theme` blocks.
- `brand/` holds assets derived from the Meltemi identity, which belongs to the Meltemi project; the folder documents that.
- All SVG and model JSON snapshots change (default theme and the `themes` key) and are regenerated.

## Non-goals

- Theme files shared across `.meltemi` files (`project.json`, `themes/company.meltemi`): a theme must be built in or defined in the same file until the project manifest exists.
- Fonts embedded in the SVG; per-element font sizes; icons.
- The final product name: "Meltemi Charts" is the recommendation, the wordmark is a theme token.
