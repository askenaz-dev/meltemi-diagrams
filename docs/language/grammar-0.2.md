# `.meltemi` language 0.2

[Español](../es/language/grammar-0.2.md)

This is the reference for the syntax implemented by `@meltemi/diagrams-language` and the `flow`,
`free`, `sequence` and `c4` vocabularies and `model` blocks validated by `@meltemi/diagrams-model`.
It follows the proposal of 9 October 2026 and decisions 0001 to 0004 and 0018 to 0020.
Changes to the language follow the [language change policy](policy.md), and the
[conformance suite](conformance.md) fixes what files mean.

A file may start with a version header. Every example below is a complete, valid file.

```text
language "0.2"

diagram example: flow {
  A -> B
}
```

## Text and encoding

- Files are UTF-8. A leading byte order mark is accepted and kept (`syntax.bom`, info).
- Line breaks are LF or CRLF. Mixing both is a warning (`syntax.mixed-line-endings`); edits use the
  style of the first line break.
- Offsets count UTF-16 code units. Lines and columns in diagnostics are 1-based.

## Lexical rules

| Element         | Rule                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Identifier      | `[A-Za-z_][A-Za-z0-9_]*`. Hyphens are not allowed.                                                                                        |
| String          | `"..."` on one line. Escapes: `\"`, `\\`, `\n`, `\t`. Other escapes are errors.                                                           |
| Number          | Optional `-`, digits, optional `.digits`, then an optional unit suffix.                                                                   |
| Unit            | Letters directly after a number (`1200ms`, `1s`) or `%` (`50%`).                                                                          |
| Relation tokens | `->` (solid or call), `-->` (dashed or reply), the two-way `<->` and `<-->`, and the lines without heads `--` (solid) and `---` (dashed). |
| Punctuation     | `{ } ( ) [ ] : ; , .`                                                                                                                     |
| Line break      | `\n` or `\r\n`. A token, because it ends statements.                                                                                      |
| Trivia          | Spaces, tabs, `// line comments`, `/* block comments */`, byte order mark.                                                                |

Trivia is attached to the following token, so the tree keeps every character. A run of characters
that starts no token (for example `=>` or `#`) is one `syntax.unexpected-character` error.

A run of `-` and `>` takes the longest token it starts with: `---`, then `-->`, then `--`, then
`->`; `-` before a digit starts a number. One dash more is dashed, and the lines drop the head:
`a -- b` and `a --- b` are lines, `a --5` is `--` followed by the number `5`, and `a ---> b` is
`---` followed by an unexpected `>`, whose hint names the six relation tokens.

## Grammar

```ebnf
source-file   = { separator | top-level } EOF ;
separator     = NEWLINE | ";" ;

top-level     = header | import | model-block | diagram-block | story-block | export-block | theme-block ;
header        = "language" STRING ;                       (* only as the first statement *)
import        = "import" ( STRING "as" IDENT                    (* namespace import *)
                         | member { "," member } "from" STRING ) ; (* member import *)
member        = IDENT [ "as" IDENT ] ;
model-block   = "model" IDENT block ;
theme-block   = "theme" IDENT block ;
diagram-block = "diagram" IDENT ":" IDENT [ "using" ref ] block ;
story-block   = "story" IDENT "for" ref block ;
export-block  = "export" IDENT "for" ref block ;

block         = "{" { separator | statement } "}" ;
statement     = relation | shorthand | keyword-stmt ;

relation      = ref arrow ref [ ":" STRING ] [ "as" IDENT ] [ block ] ;
arrow         = "->" | "-->" | "--" | "---" | "<->" | "<-->" ;
shorthand     = IDENT "[" ( STRING | "(" STRING ")" ) "]" [ block ] ;
keyword-stmt  = IDENT args [ block { IDENT args block } ] ;   (* chained clauses stay on one line *)
args          = { arg | "," } ;
arg           = ref | STRING | NUMBER | tuple | list ;
tuple         = "(" { arg | "," } ")" ;
list          = "[" { arg | "," } "]" ;
ref           = IDENT { "." IDENT } ;
```

Rules that the EBNF does not show:

- A statement ends at a line break, at `;`, or before the `}` that closes its block.
- Inside `( )` and `[ ]`, a line break continues the statement when the line ends with the opener
  or a comma, or when the next line starts with a comma or the closer. Otherwise the tuple or list
  is reported as unclosed at the end of its line.
- Words are keywords only by position. `label`, `theme` or `node` can be element ids.
- `as`, `from`, `using` and `for` are recognised only where the grammar expects them.
- An identifier directly followed by `[` is a shorthand declaration.
- Chained clauses, such as `alt "A" { ... } else "B" { ... }`, must start on the line of the
  previous `}`.
- Blocks, tuples and lists nest at most 100 levels (`syntax.nesting-too-deep`).

## Error recovery

The parser never throws. For each failing statement it reports one diagnostic, skips to the next
line break, `;` or enclosing `}`, and continues. Zero-width `Missing` nodes mark what was expected.
A missing `}` is reported once, at the end of the file. Tokens already reported by the lexer, such
as an unterminated string, do not produce a second diagnostic.

## Top-level blocks

| Block                            | Status in 0.2                                               |
| -------------------------------- | ----------------------------------------------------------- |
| `language "0.2"`                 | Checked. Other versions are `language.unsupported-version`. |
| `diagram <id>: flow { }`         | Compiled and validated.                                     |
| `diagram <id>: sequence { }`     | Compiled and validated ([sequence.md](sequence.md)).        |
| `diagram <id>: c4 using <m> { }` | Compiled and validated against the model ([c4.md](c4.md)).  |
| `diagram <id>: free { }`         | Compiled and validated ([free.md](free.md)).                |
| `theme <id> { }`                 | Compiled into a theme definition (see Theme blocks).        |
| `model <id> { }`                 | Compiled ([c4.md](c4.md)).                                  |
| `story <id> for <diagram> { }`   | Compiled and validated ([stories.md](stories.md)).          |
| `export <id> for <target> { }`   | Compiled and validated ([export.md](export.md)).            |

## Imports

```text
import "../themes/company.meltemi" as company        // company.corporate, company.base
import corporate as corp, base from "./themes.meltemi" // corp, base
```

Imports come after the `language` header and before the first block. Paths are relative to the
importing file, start with `./` or `../`, use `/` and end in `.meltemi`. Bound names share the
file's top-level namespace. A namespace may not be `technical`, `editorial`, `stage` or `sketch`,
the prefixes of the built-in themes. Imported themes are used by name: `theme "corp"`, `theme "company.corporate"`,
`extends "company.base"`. Resolution, cycles and project roots are described in
[projects.md](projects.md).

## `flow` vocabulary

### Diagram statements

| Statement     | Form                                                                                    | Notes                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| shorthand     | `id["Label"]`, `id[("Label")]`                                                          | kinds `node` and `data`                                                                |
| `node`        | `node <id> ["Label"] [{ ... }]`                                                         |                                                                                        |
| `decision`    | `decision <id> ["Label"] [{ ... }]`                                                     |                                                                                        |
| `data`        | `data <id> ["Label"] [{ ... }]`                                                         |                                                                                        |
| `group`       | `group <id> ["Label"] [{ ... }]`                                                        | holds declarations and relations; with `""`, a plain container without a title band    |
| `note`        | `note <id> "Text\nmore text" [on <element>]`                                            | free text; `\n` starts a new line; `on` attaches it to an element (a dotted leader)    |
| `tag`         | `tag <id> "PKCE"`                                                                       | small pill, placed on or beside a box                                                  |
| relation      | `a -> b`, `a --> b`, `a <-> b`, `a <--> b`, `a -- b`, `a --- b`, `: "Label"`, `as <id>` | solid or dashed, one way, two-way or a line without heads; endpoints are elements      |
| `direction`   | `direction LR`                                                                          | `LR` (default), `RL`, `TB`, `BT`                                                       |
| `layout`      | `layout assisted`                                                                       | `auto` (default), `assisted`, `manual`                                                 |
| `routing`     | `routing orthogonal`                                                                    | `auto` (default), `orthogonal`, `polyline`, `bezier`                                   |
| `layers`      | `layers back, main, front`                                                              | paint order, back to front; `main` always exists ([free.md](free.md#layers-and-order)) |
| `theme`       | `theme "editorial.light"`                                                               |                                                                                        |
| `title`       | `title "Checkout"`                                                                      |                                                                                        |
| `description` | `description "..."`                                                                     |                                                                                        |
| `preset`      | `preset slide`                                                                          | `document` or `slide`                                                                  |
| `canvas`      | `canvas (1280, 720)`                                                                    | 100 to 10,000 px; not with `preset`                                                    |
| `placement`   | `placement { ... }`                                                                     | may appear more than once                                                              |
| `style`       | `style <target>[, <target>...] { ... }`                                                 | targets: elements or named relations                                                   |
| `animate`     | `animate <target>[, <target>...] { ... }`                                               | targets: elements, named relations, notes, fragments                                   |
| `class`       | `class <id> { ... }`                                                                    | reusable style properties                                                              |
| `rule`        | `rule <kind> { ... }`                                                                   | styles every element of a kind                                                         |

An identifier used as a relation endpoint without a declaration declares a `node` whose label is
its id. Labels default to the id. A relation records its `line` (`solid` or `dashed`) and its
`heads`: `end` for `->` and `-->`, `both` for `<->` and `<-->`, `none` for `--` and `---`. A line
draws no head at either end unless `arrowhead` or `arrowtail` is written, as the theme's
`arrowhead` is only the default of `->` ([styles.md](styles.md#arrow-heads)). Sequence diagrams
take the four arrows and C4 views `->` and `-->`; another token is `prop.invalid-value` on the
token, naming the ones the profile takes. `note` and `tag` are annotations: they take part in placement and
rendering like any element (see [svg-export.md](svg-export.md)) and are rarely relation endpoints. A
note's `on <element>` clause attaches it to an element of the diagram (the entity path in a C4 view):
the model records it as `attachedTo`, draws a dotted leader from the note to the element, and makes
the arrangement of `layout auto` keep them near each other. `note` is a declaration of free
diagrams and of C4 views too ([free.md](free.md#notes), [c4.md](c4.md#notes-in-views)).
A `style` or `animate` block with several targets applies to each of them; setting the same style
property again for a target in a later statement is `prop.duplicate`, and a second effect of the
same kind on a target is `animate.conflict` ([motion.md](motion.md)). Classes, rules, presets and
the order in which styles apply are described in [styles.md](styles.md). Layout modes, ports,
constraints and route kinds are described in [layout.md](layout.md).

### Blocks

| Block          | Statements                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| element block  | `description "<text>"`, `class <id>[, <id>...]`, `layer <name>`, `port <name> north\|south\|east\|west [<n>%]`, `link <d>.<e>`, `url "<url>"`        |
| group block    | declarations, relations, nested groups, `description "<text>"`, `class <id>[, <id>...]`, `layer <name>`, `link <d>.<e>`, `url "<url>"`               |
| relation block | `description "<text>"`, `assumption "<why>"` (an inferred relation, drawn dashed and muted until confirmed), `class <id>[, <id>...]`, `layer <name>` |
| `placement`    | `place`, `size`, `route`, `label` and the constraints `align`, `row`, `column`, `order`, `distance` (below)                                          |
| `style`        | the style properties below, and `class <id>[, <id>...]`                                                                                              |
| `class`        | the style properties below                                                                                                                           |
| `rule`         | the style properties below                                                                                                                           |
| `animate`      | `effect`, `duration`, `repeat`, `delay`, `direction`, `particles`, `color` ([motion.md](motion.md))                                                  |

| Style property  | Value                                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `icon`          | `"<pack>:<name>"`, drawn from the built-in or project packs ([assets.md](assets.md))                                                                                                                                                                                                                   |
| `iconColor`     | a quoted colour or a colour token name; the colour of monochrome icons                                                                                                                                                                                                                                 |
| `iconPosition`  | `left`, `right`, `top`, `bottom` or `center`; nodes, decisions, data stores and boxes only                                                                                                                                                                                                             |
| `labelPosition` | `top`, `bottom`, `left` or `right`, the edge of the label when the icon is the centre piece (`iconPosition center`, `shape icon`); nodes, decisions, data stores and boxes only                                                                                                                        |
| `iconSize`      | `auto` or a number from 8 to 128, with or without `px`; nodes, decisions, data stores and boxes only                                                                                                                                                                                                   |
| `fill`          | a quoted colour (`"none"` draws no background) or a colour token name such as `surface`                                                                                                                                                                                                                |
| `stroke`        | a quoted colour or a colour token name such as `danger`                                                                                                                                                                                                                                                |
| `color`         | a quoted colour or a colour token name; the text colour                                                                                                                                                                                                                                                |
| `line`          | `solid`, `dashed` or `dotted`                                                                                                                                                                                                                                                                          |
| `width`         | outline or connector width, 0 to 16                                                                                                                                                                                                                                                                    |
| `radius`        | corner radius, 0 to 64, with or without `px`, over the theme's `radius` or `groupRadius`; elements and groups only                                                                                                                                                                                     |
| `shape`         | `rounded`, `rectangle`, `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person`, `agent` or `icon`; `node` (flow) and `box` (free) only  |
| `pattern`       | `none`, `hatch`, `dots` or `cross`; elements only                                                                                                                                                                                                                                                      |
| `arrowhead`     | the head at the target: `triangle`, `open`, `none`, `triangleOutline`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `onlyOne`, `zeroOrOne` or `zeroOrMany`; the theme's by default, none for `--`, `---` and free lines; relations and free lines only |
| `arrowtail`     | the head at the source, with the same values; none by default, or the end's head for `<->`; relations and free lines only                                                                                                                                                                              |
| `routing`       | `auto`, `orthogonal`, `polyline` or `bezier`; relations and free lines only (`polyline` by default on a line)                                                                                                                                                                                          |
| `corners`       | `sharp` or `rounded` bends of straight and elbow routes; relations and free lines only                                                                                                                                                                                                                 |

### Placement

| Statement  | Form                                                                                 | Rules                                  |
| ---------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| `place`    | `place <element> at (x, y)`                                                          | center of the box, logical units       |
| `size`     | `size <element> (w, h)`                                                              | positive numbers                       |
| `route`    | `route <relation> from <el>.<port> [<n>%] to <el>.<port> [<n>%] [via [(x, y), ...]]` | endpoints match the relation, in order |
| `label`    | `label <relation> at <n>% [offset (dx, dy)]`                                         | `n` from 0 to 100                      |
| `align`    | `align <el>, <el>... top\|middle\|bottom\|left\|center\|right`                       | two or more elements                   |
| `row`      | `row <el>, <el>...`                                                                  | equal vertical centres                 |
| `column`   | `column <el>, <el>...`                                                               | equal horizontal centres               |
| `order`    | `order <el>, <el>... [horizontal\|vertical]`                                         | axis defaults to the direction         |
| `distance` | `distance <el>, <el> <n>`                                                            | at least `n` px between the boxes      |

Ports are `north`, `south`, `east`, `west`, `auto` and the ports an element declares with `port`
in its block; `from api` means `from api.auto`. A percentage after a compass side pins the end to
that point of the side (`from api.east 50%`). A port name that the element does not declare is
`placement.unknown-port`. `route` and `label` need a named relation (`as <id>`). Each element has
at most one `place` and one `size`, and each relation at most one `route` and one `label`.
Constraints apply to boxes, notes and tags, not groups; an element appears at most once in each.

Relations without `as <id>` get the key `<from>-><to>#<n>` in the model and JSON (decision 0004).

`link <diagram>.<element>` in an element or group block records that the element stands for an
element of another diagram: of the same file, or through an import as `link <member>.<element>` or
`link <namespace>.<diagram>.<element>`. It is identity only; an unknown target is `ref.unknown-link`.

## `free` vocabulary

A free diagram places objects by hand ([free.md](free.md)). It shares relations, `placement`,
`style`, `class`, `rule` and `animate` with flow diagrams, and `layout manual` is its default.

| Statement  | Form                                                                      | Notes                                                                                        |
| ---------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `box`      | `box <id> ["Label"] [{ ... }]`                                            | also `id["Label"]`; `id[("Label")]` is a cylinder box                                        |
| `text`     | `text <id> "Text\nmore text"`                                             | measured text without a frame                                                                |
| `icon`     | `icon <id> "<pack>:<name>"`                                               | an icon of the packs, 48 × 48 by default                                                     |
| `image`    | `image <id> "<path>"`                                                     | a PNG, JPEG, GIF, WebP or SVG file of the project                                            |
| `group`    | `group <id> ["Label"] { ... }`                                            | children are placed inside its interior                                                      |
| `line`     | `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), ...]] [{ ... }]` | a line that joins no element, its points in the parent's interior ([free.md](free.md#lines)) |
| `layers`   | `layers back, main, front`                                                | back to front; `main` is last unless listed                                                  |
| relation   | as in flow, `--` and `---` included                                       |                                                                                              |
| properties | as in flow, with `layout manual` default                                  |                                                                                              |

Element, group and relation blocks also take `layer <name>`. The free style properties are
`fontSize` (6 to 160), `fontWeight` (400, 500, 600, 700), `textAlign` (`left`, `center`,
`right`) and `verticalAlign` (`top`, `middle`, `bottom`); flow diagrams refuse them. `shape` takes
the twenty-four shapes on boxes as on flow nodes ([free.md](free.md#text-and-shapes)); texts,
icons, images and lines refuse it. Rules take the free kinds: `rule box { ... }`,
`rule line { ... }`.

A `line` takes no `place`, `size` or `rotation`: its points are written in its statement. It takes
the styles of a relation (`stroke`, `line`, `width`, `color`, `fill` and `icon` for its label
pill, `arrowhead`, `arrowtail`, `routing`, `corners`) and refuses those of a box; `label <id> at
<n>% [offset (dx, dy)]` moves its label as it moves a named relation's. Flow, sequence and C4
diagrams refuse `line` with `prop.unknown`.

The `place` of a child of a group is relative to the group's interior: its top-left corner plus
`groupPadding` across and, down, `groupHeader` for a titled group or `groupPadding` for an
untitled one (`group <id> ""` without `description` or icon). Groups need a `place`; their size is
written or derived from their children.

## `sequence` vocabulary

A sequence diagram orders events top to bottom ([sequence.md](sequence.md)). It shares relations,
`style`, `class`, `rule`, `animate`, `link` and the diagram properties `theme`, `title`,
`description`, `preset` and `canvas` with the other profiles; `autonumber` and `spacing` are its
own.

| Statement    | Form                                                                                                                   | Notes                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| participants | `participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections`, `queue` `<id> ["Label"] [{ ... }]` | also `id["Label"]` and `id[("Label")]`                                                                  |
| `group`      | `group <id> ["Label"] { participants }`                                                                                | a box around participants                                                                               |
| message      | `a -> b: "L" as id { kind async }`, `a --> b`, `a <-> b`                                                               | call, reply; two-way; `kind async`; `a -> a` is a self-call; a call's block holds properties and events |
| `return`     | `return ["L"] [as id] [{ ... }]`                                                                                       | in a call's block: the dashed reply from the receiver to the caller, last of its list                   |
| activation   | `activate <p>`, `deactivate <p>`                                                                                       | nested bars; a call's block with events is one too                                                      |
| lifecycle    | `create <p>`, `destroy <p>`                                                                                            | head at its row; a cross ends the lifeline                                                              |
| `note`       | `note [<id>] over <p>[, <q>] "T"`, `left of <p>`, `right of <p>`                                                       |                                                                                                         |
| fragments    | `alt`/`else`, `opt`, `loop`, `par`/`and`, `break`, `critical`/`option`, `region` `[<id>] ["c"] { ... }`                | chained branches on the line of `}`                                                                     |
| `divider`    | `divider "L"`                                                                                                          |                                                                                                         |
| `delay`      | `delay ["L"]`                                                                                                          |                                                                                                         |
| `autonumber` | `autonumber [n]`                                                                                                       | numbers messages from `n` (1)                                                                           |
| `spacing`    | `spacing n`                                                                                                            | the distance between neighbouring heads, 0 to 400 (40)                                                  |
| `scenario`   | `scenario <id> ["L"] { choose <f> "c" \| <n>; repeat <loop> <n>; skip <f>; take <f> }`                                 | one path for exports                                                                                    |
| `placement`  | `space <event> n [before\|after]`, `gap <participant> [-]n [before\|after]`, `label <message> at n% offset (dx, dy)`   | `before` by default; a `gap` may be negative except on the outer side                                   |

The order-checked rules (`sequence.activation`, `sequence.return`, `sequence.lifecycle`) and
scenario checks (`sequence.scenario`) are listed in [diagnostics.md](diagnostics.md).

## `model` blocks and `c4` vocabulary

A model declares entities and relations; C4 views draw it ([c4.md](c4.md)).

| Statement   | Form                                                                                 | Notes                                                                                             |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| entities    | `person`, `system`, `container`, `datastore`, `component` `<id> ["Label"] [{ ... }]` | systems hold containers and datastores; containers hold components                                |
| properties  | `description "…"`, `technology "…"`, `external`, `url "…"`                           | `external` on persons and systems                                                                 |
| relation    | `a -> b: "Label" as id { technology "…"; description "…"; assumption "…" }`          | endpoints are paths, looked up from the enclosing entity; `assumption` marks an inferred relation |
| view        | `diagram <id>: c4 using <model> { ... }`                                             | a model of the file or an import                                                                  |
| `level`     | `level context` \| `container` \| `component`                                        | required                                                                                          |
| `scope`     | `scope <path>`                                                                       | a system, or a container at the component level                                                   |
| lists       | `include <path>, …`, `exclude <path>, …`                                             | without `include`, the level's default set                                                        |
| `label`     | `label <path-or-relation> "Text"`                                                    | a local label                                                                                     |
| combination | `<a> -> <b>: "Label" as id`                                                          | one arrow for the model relations between `a` and `b`                                             |

Views also take `title`, `description`, `direction`, `layout`, `routing`, `theme`, `preset`,
`canvas`, `placement`, `style`, `class`, `rule` and `animate`; targets are entity paths
(`place shop.api at (…)`, `route request from shop.web.east to shop.api`).

## Theme blocks

`theme <id> { }` defines design tokens at the top level of a file. Tokens are flat `name value`
statements; a diagram selects a theme with `theme "<id>"`, a project may set a default theme in
`project.json`, and `meltemi-diagrams export --theme <name>` overrides both. Built-in themes:
`technical.light` (default), `technical.dark`, `editorial.light`, `editorial.dark`, `stage.light`,
`stage.dark`, `sketch.light` and `sketch.dark`.

```text
theme konfio {
  extends "technical.light"
  accent "#6a4fd0"
  accentEnd "#a594f0"
  brand "Konfío · Meltemi Diagrams"
  frame footer

  class partner { line dashed; stroke accent }
  rule data { pattern dots }
}
```

| Token                                                                                                                                                             | Value                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extends`                                                                                                                                                         | quoted name of a built-in or file theme                                                                                                                                                    |
| `background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`, `success`, `warning`, `danger`, `info` | quoted colour                                                                                                                                                                              |
| `font`, `mono`                                                                                                                                                    | quoted font stack                                                                                                                                                                          |
| `labelSize`, `descriptionSize`, `groupTitleSize`, `noteSize`, `tagSize`, `relationLabelSize`, `frameSize`                                                         | number, 6 to 48                                                                                                                                                                            |
| `iconSize`                                                                                                                                                        | number, 8 to 64                                                                                                                                                                            |
| `iconPosition`                                                                                                                                                    | `left`, `right`, `top`, `bottom` or `center`                                                                                                                                               |
| `labelWeight`                                                                                                                                                     | 400, 500, 600 or 700                                                                                                                                                                       |
| `padding`, `groupPadding`, `groupHeader`, `margin`                                                                                                                | number, 0 to 200                                                                                                                                                                           |
| `radius`, `groupRadius`                                                                                                                                           | number, 0 to 64                                                                                                                                                                            |
| `strokeWidth`, `connectorWidth`                                                                                                                                   | number, 0 to 8                                                                                                                                                                             |
| `arrowhead`                                                                                                                                                       | a head: `triangle`, `open`, `none`, `triangleOutline`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `onlyOne`, `zeroOrOne` or `zeroOrMany` |
| `corners`                                                                                                                                                         | `sharp` (built-in themes but `sketch.*`) or `rounded` (`sketch.*`)                                                                                                                         |
| `sketch`                                                                                                                                                          | `none` (built-in themes but `sketch.*`), `light` (`sketch.*`) or `rough`: how strokes are painted ([svg-export.md](svg-export.md#sketched-strokes))                                        |
| `arrowSize`                                                                                                                                                       | number, 0 to 32                                                                                                                                                                            |
| `frame`                                                                                                                                                           | `none`, `footer` or `header`                                                                                                                                                               |
| `brand`                                                                                                                                                           | quoted wordmark text                                                                                                                                                                       |
| `mark`                                                                                                                                                            | `meltemi` or `none`                                                                                                                                                                        |

Numbers are written without a unit or with `px`. Theme blocks also take `class <id> { }` and
`rule <kind> { }`, inherited by themes that extend them ([styles.md](styles.md)).

A theme without `extends` inherits from `technical.light`. An `extends` target that is neither built
in nor defined in the file is `theme.unknown-base`; a chain that returns to a theme is
`theme.cycle`. Theme ids share the file namespace with diagram ids.

## Story blocks

| Block      | Statements                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `story`    | `title`, `description`, `scene <id> ["Title"] { }`                                                  |
| `scene`    | `view <diagram>`, `transition cut\|fade\|morph [over <time>]`, then actions                         |
| actions    | `reveal`, `hide`, `highlight`, `focus`, `camera`, `trace` (targets, `[over <time>]`), `hold <time>` |
| `parallel` | actions that start together                                                                         |

Times take `ms` or `s`, from `0ms` to `600s`; `focus` and `camera` take `all`
([stories.md](stories.md)).

## Export profiles

`export <id> for <diagram-or-story> { … }` holds the options of one delivery: `format` (required),
`size`, `scale`, `background`, `at`, `motion`, `theme`, `fonts`, `scenario`, `link`, `fps`,
`duration`, `file`, and `autoplay`, `loop` and `embed` for HTML. Each option applies to some
formats only ([export.md](export.md)).

## Not yet decided

Deferred to a grammar 0.3 decision after the Stage 2 prototypes:

- Group semantics: whether groups create namespaces and how qualified references interact with
  rename.
- Whether chained clauses may start on the line after the closing `}`.
