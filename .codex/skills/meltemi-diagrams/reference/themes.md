# Themes and styles

A theme sets palette, type, spacing, strokes, arrowheads and the brand frame. The diagram picks it
with `theme "<name>"`; a project can set a default in `project.json`
(`"theme": "themes/company.meltemi#corporate"`); `meltemi-diagrams export --theme <name>`
overrides both.

## Built in

| Name                        | Use it for                | Look                                                                |
| --------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `technical.light` (default) | architecture review       | Sea Mist background, Inter, Aegean tags, footer with the mark       |
| `technical.dark`            | architecture review, dark | Meltemi Night background, cyan tags, footer with the mark           |
| `editorial.light`           | documents, long reading   | white sheet, IBM Plex, quiet greys, open arrowheads, no frame       |
| `editorial.dark`            | documents, dark           | dark neutral sheet, IBM Plex, no frame                              |
| `stage.light`               | slides and video          | high contrast, 16 px labels, 2 px connectors, 48 px margins, header |
| `stage.dark`                | slides and video, dark    | the same on a near-black background                                 |
| `sketch.light`              | whiteboards, early ideas  | technical light with strokes painted by hand and rounded bends      |
| `sketch.dark`               | whiteboards, dark         | the same on the technical dark palette                              |

Explicit quoted colours in styles are kept in every theme, so category colours of a sheet survive
a theme change. Colour token names (`stroke danger`, `fill surface`) follow the theme instead.

## Theme blocks

```text
theme konfio {
  extends "technical.light"
  accent "#6a4fd0"            // start of the mark gradient
  accentEnd "#a594f0"         // end of the mark gradient
  tag "#6a4fd0"               // tag pill fill
  band "#f6f3fe"              // group fill
  bandLine "#6a4fd0"          // group outline
  brand "Konfío · Meltemi Diagrams"
  frame footer                // none | footer | header

  class partner { line dashed; stroke accent }   // reusable styles for every diagram
  rule data { pattern dots }                     // every data store
}

diagram platform: flow {
  theme "konfio"
  ...
}
```

Tokens (numbers without a unit or with `px`):

| Tokens                                                                                                                    | Value                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd` | quoted colour                                     |
| `success`, `warning`, `danger`, `info`                                                                                    | quoted colour (signals)                           |
| `font`, `mono`                                                                                                            | quoted font stack                                 |
| `labelSize`, `descriptionSize`, `groupTitleSize`, `noteSize`, `tagSize`, `relationLabelSize`, `frameSize`                 | 6 to 48 (technical: 13, 11, 13, 11, 10.5, 11, 12) |
| `labelWeight`                                                                                                             | 400, 500, 600 or 700                              |
| `padding`, `groupPadding`, `groupHeader`, `margin`                                                                        | 0 to 200 (technical: 16, 16, 40, 20)              |
| `radius`, `groupRadius`                                                                                                   | 0 to 64 (technical: 8, 14); defaults of `radius`  |
| `strokeWidth`, `connectorWidth`                                                                                           | 0 to 8 (technical: 1, 1.3)                        |
| `arrowhead`, `arrowSize`, `corners`                                                                                       | a head (language.md); 0 to 32; `sharp`, `rounded` |
| `sketch`                                                                                                                  | `none`, `light`, `rough`: strokes painted by hand |
| `frame`, `brand`, `mark`                                                                                                  | `none`/`footer`/`header`; text; `meltemi`/`none`  |
| `flowDuration`, `dashDuration`, `pulseDuration`, `traceDuration`                                                          | `100ms` to `60s`; default speed of each effect    |
| `selection`, `guide`                                                                                                      | colour of the canvas's selection and guides only  |

A theme without `extends` inherits from `technical.light`. Share a theme between files with an
import (`import corporate from "../themes/company.meltemi"`) or make it the project default.

Bare sheet with the Meltemi palette:

```text
theme bare { extends "technical.light"; frame none }
```

Company wordmark without the Meltemi mark:

```text
theme acme { frame header; mark none; brand "Acme Architecture"; font "Georgia, serif" }
```

A whiteboard look: `theme "sketch.light"`, or `sketch rough` in a theme block
(`theme hand { extends "technical.light"; sketch rough }`). Every outline, connector, head, pill
and band is drawn twice with a small seeded wobble; text, icons and images stay crisp, the layout
is unchanged and the same file always renders the same bytes. `sketch` is a theme token only:
`style a { sketch rough }` is `prop.unknown`. Name relations whose wobble must not move when
statements are reordered (anonymous keys change with the order).

## Classes, rules and patterns

```text
diagram platform: flow {
  class hot { stroke danger; width 2 }
  rule relation { arrowhead open }
  api["API"] { class hot }
  legacy["Legacy"] { class deprecated }        // built in: hatch, muted
  proxy["Proxy"] { class proposed }            // built in: dashed, warning colour
  style db { class critical; fill "#fff" }
}
```

- Built-in classes: `highlight`, `critical`, `proposed`, `deprecated`, `external`.
- Order: theme tokens, theme rules, diagram rules, classes (declaration block, then `style`
  statements), explicit `style` properties. The last value wins.
- `pattern hatch|dots|cross` marks state without relying on colour; use it with a legend.
- `width` sets an outline or connector width; `arrowhead` and `arrowtail` a relation's heads at the
  target and the source; `line dotted` dots it; `corners rounded` rounds its bends.
- The theme's `radius` and `groupRadius` are only defaults: `style api { radius 0 }` squares one
  node, `rule group { radius 0 }` every group, and a class may carry `radius` too. Square corners
  everywhere: `theme square { extends "technical.light"; radius 0; groupRadius 0 }`.
- `rule node { shape hexagon }` (or `rule box`) gives every node a shape; rules for other kinds
  cannot set `shape`.
- An unknown class is `theme.unknown-class` (warning) in `validate`.

## Icons

- `style api { icon "tabler:server" }` draws a Tabler icon; classes and rules carry icons too
  (`rule data { icon "tabler:database" }`). Provider sets are built in: `aws:lambda`,
  `azure:virtual-machine`, `gcp:cloud-run`, `kubernetes:pod`, `logos:postgresql`; find names with
  `pnpm mdg assets icons <word>`.
- Search names with `pnpm mdg assets icons <words>`. An unknown name is `asset.unknown-icon` in
  `validate`, with close names in the hint.
- Project packs live in `assets/icons/` (Iconify JSON or a folder of SVG files) and need a licence
  in `assets/licenses.json`. `pnpm mdg assets list` shows every pack and its licence.
- `iconSize` and `iconPosition` are theme tokens; the stage themes put icons above the label.
  `iconColor accent` colours monochrome icons; provider icons keep their colours.
- Per element, `iconPosition left|right|top|bottom|center` places the icon (`center`: the picture
  of the box, its label at the `labelPosition` edge), `iconSize 32` or `auto` sizes it (8 to 128),
  and `shape icon` draws the element as its icon with the label outside (free.md).

## Presets

- `preset document`: warns above 1,200 px wide.
- `preset slide`: a 16:9 canvas, warns above 1,920 × 1,080 px. Pair it with a `stage.*` theme.
- `canvas (1280, 720)`: a fixed canvas with the content centred.

`layout.too-large` means the diagram should be split into views, not shrunk.
