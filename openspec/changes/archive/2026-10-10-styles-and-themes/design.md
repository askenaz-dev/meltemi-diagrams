## Context

- Themes hold 17 tokens: 12 colours, two font stacks, frame, brand and mark.
- Sizes, paddings, radii and widths are constants in `layout.ts` (`SIZES`, `GROUP_PADDING`, `MARGIN`, `NODE_RADIUS`, `GROUP_RADIUS`, `STROKE_WIDTH`, `CONNECTOR_WIDTH`).
- Style blocks take `icon`, `fill`, `stroke`, `color` and `line`, and a property set twice for a target is `prop.duplicate`.
- The built-in themes are `meltemi.light` (the default, branded footer, Inter), `meltemi.dark`, `studio.light` and `studio.dark` (neutral, IBM Plex, no frame).
- Text is measured with real fonts, so larger type sizes grow boxes automatically.
- `validate` compiles through a workspace but does not lay out; `export` lays out.

## Goals / Non-Goals

**Goals:**
- Every visual constant is a token a theme can set, so Editorial, Technical and Stage differ by data, not code.
- Reusable styling through classes and kind rules, with a precedence anyone can predict.
- Presets that keep slides and documents legible by warning instead of shrinking.

**Non-Goals:**
- Icons (part two of the roadmap row), animation state (change 13), and selectors other than kinds.

## Decisions

### D1. Token table

| Group | Tokens | Value |
|---|---|---|
| Colours | `background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`, `success`, `warning`, `danger`, `info` | quoted colour |
| Fonts | `font`, `mono` | quoted font stack |
| Type | `labelSize`, `descriptionSize`, `groupTitleSize`, `noteSize`, `tagSize`, `relationLabelSize`, `frameSize` | number 6 to 48 |
| | `labelWeight` | number 100 to 900 |
| Spacing | `padding` (text padding, 16), `groupPadding` (16), `groupHeader` (40), `margin` (20) | number 0 to 200 |
| Shape | `radius` (8), `groupRadius` (14) | number 0 to 64 |
| Strokes | `strokeWidth` (1), `connectorWidth` (1.3) | number 0 to 8 |
| Arrows | `arrowhead` (`triangle`, `open`, `none`), `arrowSize` (8) | enum, number 0 to 32 |
| Frame | `frame` (`none`, `footer`, `header`), `brand`, `mark` (`meltemi`, `none`) | enum, string, enum |

- Number tokens use a new `number` value spec with bounds. A value out of range is `prop.invalid-value`, naming the range.
- `TEXT_PADDING` stays as the default of `padding`. `MIN_TEXT_MARGIN` stays a constant, because it is a correctness threshold, not a style.

### D2. Built-in themes

| Theme | Character | Fonts | Frame | Notable tokens |
|---|---|---|---|---|
| `technical.light` (default), `technical.dark` | architecture review: protocols, boundaries and relations readable | Inter, Cascadia Mono | footer with mark | today's Meltemi palette and sizes |
| `editorial.light`, `editorial.dark` | documents and long reading: light background, typographic hierarchy, little noise | IBM Plex Sans, Cascadia Mono | none | quiet greys, `radius` 6, `connectorWidth` 1, `groupTitleSize` 12 |
| `stage.light`, `stage.dark` | presentations and video: high contrast, wide framing, controlled emphasis | Inter, Cascadia Mono | header with mark | `labelSize` 16, `descriptionSize` 13, `relationLabelSize` 13, `connectorWidth` 2, `strokeWidth` 1.5, `margin` 48, `arrowSize` 10 |

The old names are removed. The product has no users, so nothing maps them. Reserved import namespaces follow the built-in prefixes automatically: `technical`, `editorial` and `stage`.

### D3. Classes and rules

```text
theme company {
  extends "technical.light"
  class partner { line dashed; stroke accent }
  rule data { pattern dots }
}

diagram checkout: flow {
  class hot { stroke danger; width 2 }
  rule relation { arrowhead open }
  api["API"] { class partner, hot }
  style db { class critical; fill "#fff" }
}
```

- **Declaring classes.** `class <id> { <style properties> }` is valid inside theme blocks and at the top level of diagrams. A class may not use `class` itself, so there is no chaining. Classes have their own namespace.
- **Built-in classes.** Every built-in theme carries `highlight`, `critical`, `proposed`, `deprecated` and `external`, written with colour token names so they follow the theme. They are data in the model schema (`BUILT_IN_CLASSES`), so project compilation can check names without the layout.
- **Applying classes.** A `class <id>[, <id>…]` property in an element's or relation's own block, or in a `style` statement. The model keeps class uses as `{ name, range }` lists on elements, relations and style entries, apart from the property record.
- **Unknown classes.** Single-file compilation cannot know them: the theme may come from an import or from the project's default theme. Project compilation checks every use against the diagram's classes, the theme chain and the built-in classes, and reports `theme.unknown-class` (warning). The layout ignores unknown names. Every CLI path compiles through a workspace, so `validate` and `export` both report it.
- **Rules.** `rule <kind> { <style properties> }` applies to every element of a kind, or to every relation with `rule relation`, in a diagram or in a theme. A property repeated for the same kind is `prop.duplicate`.

### D4. Precedence

For each element or relation, each property is resolved by taking the last value set in this order:

1. theme tokens (built-in, extended through `extends`; the project's default theme when the diagram names none);
2. rules of the theme chain, from the base theme to the most specific;
3. the diagram's rules;
4. applied classes, in the order written: the declaration block first, then `style` statements in source order. A name resolves to a diagram class, then a class of the most specific theme that has it, then a built-in class;
5. explicit properties of `style` statements.

Classes come after rules because they are opt-in and therefore more specific. Animation state is applied on top of all of them by the motion engine (roadmap change 13).

| Alternative | Why not |
|---|---|
| CSS selectors and cascade | The proposal rejects arbitrary CSS that breaks portability |
| Classes only, no rules | Styling every data store needs a class on each one |
| Rules only in diagrams | The project level of the precedence chain needs project-wide rules, which live in the project's default theme |

### D5. New style properties and token colours

| Property | Applies to | Value | Effect |
|---|---|---|---|
| `width` | element outline, relation connector | number 0 to 16 | stroke width |
| `pattern` | elements | `none`, `hatch`, `dots`, `cross` | an overlay pattern in the stroke colour, at 35 % opacity |
| `arrowhead` | relations | `triangle`, `open`, `none` | the relation's head |
| `class` | elements, relations | one or more class ids | applies classes (D3) |
| colour properties | both | quoted colour or a colour token name (`danger`, `accent`, `muted`, …) | a token name follows the theme |

- A colour token name is stored as `@<token>`, which a quoted colour can never be confused with, since CSS colours do not start with `@`.
- `pattern` on a relation, or `arrowhead` on an element, is `prop.invalid-value` in `style` statements and rules. In a class, which may serve both, the property that does not apply is ignored.
- Patterns live in the scene as `patterns: { id, kind, color }[]` and as an overlay item filled `url(#id)`, rendered as `<pattern>` in `<defs>`, so the SVG stays portable.
- Style values keep numbers as numbers: `StyleEntry.properties` and theme tokens become `Record<string, string | number>`.

### D6. Project default theme

`project.json` gains `"theme"`, either a built-in name or `"<path>#<theme id>"` relative to the root.

- `readManifest` checks the form. `Workspace.manifest()` also loads the file and checks that it declares the theme, reporting `project.invalid-value` on the value; invalidating the theme file invalidates the manifest result.
- The theme's file joins every program of the project, `themeDefinitionsFor(file)` includes the theme and its bases, and `projectTheme(program)` returns its key.
- A diagram without `theme` uses it through `LayoutOptions.defaultTheme`. A theme block without `extends` still inherits from `technical.light`, so a theme file means the same in every project.

### D7. Presets and canvas

The content canvas is the content bounds plus `margin`, plus the frame strip.

| Property | Canvas | Warning |
|---|---|---|
| (none) | the content canvas | none |
| `preset document` | the content canvas | `layout.too-large` when wider than 1,200 px |
| `preset slide` | the content canvas, extended to 16:9, content centred | `layout.too-large` when wider than 1,920 or taller than 1,080 px |
| `canvas (w, h)` | `w × h`, content centred; a dimension the content exceeds grows to fit | `layout.too-large` when the content does not fit |

- `preset` and `canvas` together are `prop.invalid-value` on the second one.
- The frame strip spans the full canvas width, at its top or bottom edge.
- The warning's hint says to split the diagram into views or scenes; the proposal rejects shrinking type indefinitely, and nothing is ever clipped.

### D8. Arrowheads

- `triangle` is today's filled head.
- `open` is a two-segment chevron in the connector colour and width.
- `none` draws no head and does not shorten the line.

`arrowSize` scales the head.

## Risks / Trade-offs

- [Renaming built-in themes touches many files] → A mechanical replacement plus snapshot review. A names test fails if `meltemi.light`, `meltemi.dark`, `studio.light` or `studio.dark` reappear outside archived changes.
- [Classes from imported themes cannot be checked by single-file compilation] → Project compilation checks them (`theme.unknown-class`); every CLI command and the editor compile through a workspace.
- [Stage sizes make boxes larger] → Fit-to-text handles it. Explicit sizes in a sheet authored for Technical may overflow, and `layout.text-overflow` says so.
- [Boxes now grow vertically for several description lines] → Diagrams that relied on text overflowing a 56 px box change size; the snapshot review checks that only those boxes change.
