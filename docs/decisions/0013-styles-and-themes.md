# 0013. Design tokens, style classes and presets

Status: accepted (styles-and-themes change, 10 October 2026). The token table gains `sketch`,
the built-in themes `sketch.light` and `sketch.dark`, and `sketch` is a reserved import name by
[decision 0058](0058-lines-sketch-and-text-alignment.md).

## Context

Themes carried colours, fonts and the frame, while sizes, paddings, radii and stroke widths were
constants in the layout. There was no way to reuse a set of styles, to style every element of a
kind, or to set a project-wide theme. The proposal asks for a complete token set, three initial
themes (Editorial, Technical, Stage), reusable classes without arbitrary CSS, a clear precedence
(base theme, project, diagram rules, explicit style, animation state), 16:9 presets, splitting
dense diagrams instead of shrinking them, and meaning that never depends on colour alone.

## Decision

- Every visual measure is a theme token: colours (with the signals `success`, `warning`, `danger`,
  `info`), fonts, type sizes and the label weight, paddings, the group band, the margin, radii,
  stroke and connector widths, the arrowhead and its size, and the frame. Line heights, pills, the
  frame strip and default boxes derive from the type sizes.
- Six built-in themes, `technical.*` (default), `editorial.*` and `stage.*`, replace `meltemi.*`
  and `studio.*`. Nothing maps the old names: the product has no users yet.
- `class <id> { }` in diagrams and themes, applied with `class a, b`; `rule <kind> { }` in diagrams
  and themes. Classes do not chain and live in their own namespace. Five built-in classes use
  colour token names, so they follow the theme.
- Precedence: theme tokens, theme rules, diagram rules, applied classes, explicit `style`
  properties; animation state on top. Classes come after rules because they are opt-in.
- Colour properties accept colour token names, stored as `@<token>` in the model.
- `width`, `pattern` (hatch, dots, cross) and `arrowhead` style properties. Patterns are SVG
  `<pattern>` tiles, drawn in the stroke colour at 35 % opacity.
- `"theme"` in `project.json` is the project level of the precedence chain; its file joins every
  compilation of the project.
- `preset document`, `preset slide` and `canvas (w, h)` size the canvas and warn with
  `layout.too-large` instead of shrinking text.
- Unknown classes are checked by project compilation (`theme.unknown-class`), the only place that
  knows a diagram's whole theme chain.

## Alternatives considered

- CSS classes and selectors: rejected by the proposal for breaking portability across renderers.
- Classes only, no kind rules: styling every data store would need a class on each one.
- Rules only in diagrams: the project level would need its own construct; rules in themes give it
  for free through the project's default theme.
- Keeping the old theme names as aliases: there are no users to migrate.
- Scaling text down to fit presets: the proposal asks to split dense diagrams instead.

## Consequences

- Snapshots of sheets using the editorial themes changed (radii, open arrowheads, group titles).
- Boxes without `size` now grow vertically for several description lines.
- Import namespaces `technical`, `editorial` and `stage` are reserved.
- Icons, the other half of roadmap change 6, use the same style statements (`icon`) and come with
  the `icons-and-assets` change.
