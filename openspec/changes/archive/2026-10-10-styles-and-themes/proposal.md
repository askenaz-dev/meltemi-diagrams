## Why

The proposal asks for repeatable professional quality: a full set of design tokens (typography, spacing, radii, fills, semantic colours, connectors, arrowheads, margins), three initial themes (Editorial for reading, Technical for architecture review, Stage for presentations and video), reusable style classes without arbitrary CSS, and a clear precedence: base theme, then project, then diagram rules, then explicit style, then animation state. It also asks for documentation and 16:9 presets, for dense diagrams to be split rather than shrunk, and for meaning never to depend on colour alone. Today themes only carry colours and fonts, sizes are constants, there are no classes or rules, and there is no project-wide theme.

## What Changes

Roadmap change **6**, part one (`docs/roadmap-1.0.md`; the second part is `icons-and-assets`). Part of **Stage 2 (flow and free: themes)**.

- **Complete token set.** Theme blocks and built-in themes carry the following tokens, and number and enum tokens are validated:
  - colours, including the semantic `success`, `warning`, `danger` and `info`;
  - type sizes and the label weight;
  - text and group padding, the group header and the canvas margin;
  - corner radii, stroke and connector widths;
  - arrowhead shape (`triangle`, `open`, `none`) and size;
  - fonts, frame, brand and mark.
- **Six built-in themes:** `technical.light` (the default) and `technical.dark`, `editorial.light` and `editorial.dark`, `stage.light` and `stage.dark`. They replace `meltemi.*` and `studio.*`. Corpus, examples, docs and the skill move to the new names.
- **Style classes.** `class <id> { … }` declares reusable style properties, inside a theme block or a diagram. Classes are applied with `class a, b` in an element or relation block, or in a `style` statement. Every built-in theme provides `highlight`, `critical`, `proposed`, `deprecated` and `external`. An unknown class is `theme.unknown-class` (warning), reported by project compilation, which knows the theme scope.
- **Kind rules.** `rule <kind> { … }` (`node`, `decision`, `data`, `group`, `note`, `tag` or `relation`) styles every element of a kind, in a diagram or in a theme.
- **Precedence.** Theme tokens (the project's default theme when the diagram names none), then theme rules, then diagram rules, then applied classes, then explicit `style` properties. Animation state stays on top of all of them (roadmap change 13).
- **New style properties:**
  - `width` sets the outline or connector width;
  - `pattern` (`hatch`, `dots`, `cross`, `none`) carries meaning without colour;
  - `arrowhead` (`triangle`, `open`, `none`) sets a relation's head;
  - colour properties accept semantic token names (`fill danger`, `stroke accent`).
- **Project default theme.** `project.json` gains `"theme"`, either a built-in name or `<file>#<theme>`. Diagrams without `theme` use it.
- **Presets and canvas.**
  - `preset document` warns when a diagram is wider than 1,200 px;
  - `preset slide` gives a 16:9 canvas and warns when the content exceeds 1,920 × 1,080;
  - `canvas (w, h)` fixes the canvas and centres the content.

  Each warning is `layout.too-large`, with a hint to split the diagram into views rather than shrink the text.
- **Docs.** A new `docs/language/styles.md`, a rewritten skill themes reference, the grammar, diagnostics and SVG export references, and decision note 0013.

## Capabilities

### New Capabilities
- `style-classes-and-rules`: classes in themes and diagrams, `class` application, built-in classes, `rule` selectors, the precedence order, and the new style properties.
- `theme-tokens`: the complete token table, number and enum validation, semantic colours, and the six built-in themes.
- `canvas-presets`: `preset document`, `preset slide`, `canvas (w, h)` and `layout.too-large`.

### Modified Capabilities
- `theme-blocks`: new built-in names; classes and rules inside theme blocks; the token table.
- `flow-diagram-model`: diagram properties `preset` and `canvas`; style properties `width`, `pattern` and `class`; colour token names.
- `flow-svg-export`: default theme `technical.light`; token-driven sizes, radii, widths and arrowheads; patterns.
- `model-json-interchange`: the document example uses the new theme names; classes and rules appear in the JSON.
- `cli-export`: scenarios use the new theme names; export uses the project default theme.
- `project-manifest`: the `theme` field.
- `project-compilation`: the project default theme in every scope, and class checks.

## Impact

- `@meltemi/diagrams-model`: schema tables, value specs (`number`, `size`, `classes`, colour token names), built-in classes, theme-block classes and rules, flow `class` and `rule` statements, `preset` and `canvas`, and new JSON keys `classes` and `rules`.
- `@meltemi/diagrams-layout`: a `Theme` with every token, six built-in themes, the style resolver with precedence, patterns in the scene, token-driven geometry, arrowhead kinds, presets and canvas, `LayoutOptions.defaultTheme`, and `layout.too-large`.
- `@meltemi/diagrams-render`: `<pattern>` definitions, open and absent arrowheads.
- `@meltemi/diagrams-project`: the manifest `theme`, `projectTheme(program)`, project theme definitions in every file's scope, and `theme.unknown-class`.
- `@meltemi/diagrams-cli`: export uses the project default theme.
- Every snapshot that uses a theme name changes. Corpus files and examples are updated in place.

## Non-goals

- Icons and asset packs, which form the second part of this roadmap row (`icons-and-assets`).
- Animation state, the top level of the precedence chain, which comes with roadmap change 13 (`motion-effects`).
- Selectors beyond element kinds (for example by tag or by group), which are covered by classes.
