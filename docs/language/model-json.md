# Model JSON 0.1

[Español](../es/language/model-json.md)

`toJson(compile(text))` in `@meltemi/diagrams-model` turns a compilation into JSON for other tools:
`meltemi-diagrams convert <file> --to json` writes it (`docs/cli.md`), the playground downloads it,
and layout engines and tests read it. The format name is `model-json` and this page
describes version `0.1`. A breaking change increases the version.

## Rules

- Keys are emitted in the order shown on this page, so output is stable and diff-friendly.
- Diagrams with any error are left out of `diagrams`; their problems are in `diagnostics`.
- Every element, relation and statement carries the `range` of its statement in the source.
- Anonymous relations appear with their synthetic `key` (`<from>-><to>#<n>`) and `id: null`.
- Every diagram profile compiles; `story` and `export` blocks are not in the JSON yet.

## Document

```json
{
  "format": "model-json",
  "version": "0.1",
  "language": "0.2",
  "ok": true,
  "imports": [],
  "diagrams": [],
  "themes": [],
  "models": [],
  "stories": [],
  "exports": [],
  "diagnostics": []
}
```

| Key           | Type           | Meaning                                                    |
| ------------- | -------------- | ---------------------------------------------------------- |
| `format`      | string         | Always `model-json`.                                       |
| `version`     | string         | Version of this format.                                    |
| `language`    | string or null | Version from the `language` header; null without a header. |
| `ok`          | boolean        | True when no diagnostic has severity `error`.              |
| `imports`     | array          | `import` statements of the file, in source order.          |
| `diagrams`    | array          | Compiled diagrams without errors, in source order.         |
| `themes`      | array          | Theme definitions of the file, in source order.            |
| `models`      | array          | `model` blocks, in source order (see C4 views and models). |
| `stories`     | array          | `story` blocks, in source order (see Stories).             |
| `exports`     | array          | `export` profiles, in source order (see Export profiles).  |
| `diagnostics` | array          | All diagnostics, ordered by position.                      |

## Import

```json
{
  "form": "members",
  "path": "../themes/company.meltemi",
  "bindings": [{ "name": "corp", "member": "corporate" }],
  "range": {
    "start": { "offset": 15, "line": 2, "column": 1 },
    "end": { "offset": 70, "line": 2, "column": 56 }
  }
}
```

| Key        | Type           | Meaning                                                                             |
| ---------- | -------------- | ----------------------------------------------------------------------------------- |
| `form`     | string         | `namespace` (`import "<path>" as <ns>`) or `members` (`import <id> from "<path>"`). |
| `path`     | string or null | The path as written; null when it is missing.                                       |
| `bindings` | array          | Bound names; `member` is the imported id, null for a namespace import.              |
| `range`    | range          | The whole statement.                                                                |

Resolution of paths and names happens in project compilation (`docs/language/projects.md`).

## Range

```json
{
  "start": { "offset": 167, "line": 9, "column": 3 },
  "end": { "offset": 184, "line": 9, "column": 20 }
}
```

This is the range of `client["Cliente"]` in `corpus/valid/checkout.meltemi`. Offsets count UTF-16
code units from the start of the file. Lines and columns are 1-based. `end` is
exclusive.

## Diagram

| Key          | Type   | Meaning                                                                                                                                                                                                                                               |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | string | Diagram id.                                                                                                                                                                                                                                           |
| `type`       | string | `flow`, `free`, `sequence` or `c4`.                                                                                                                                                                                                                   |
| `range`      | range  | The whole `diagram` block.                                                                                                                                                                                                                            |
| `properties` | object | `direction`, `layout` (defaults applied), `theme`, `title`, `description`, `preset` (string or null), `canvas` (`{ "width", "height" }` or null), `routing`, `layers` (back to front; `["main"]` for flow), `autonumber` (the first number, or null). |
| `classes`    | array  | `class <id> { }` declarations, in source order.                                                                                                                                                                                                       |
| `rules`      | array  | `rule <kind> { }` statements, in source order.                                                                                                                                                                                                        |
| `elements`   | array  | Elements in source order.                                                                                                                                                                                                                             |
| `relations`  | array  | Relations in source order.                                                                                                                                                                                                                            |
| `placement`  | array  | `place`, `size`, `route` and `label` statements in source order.                                                                                                                                                                                      |
| `styles`     | array  | One entry per `style` statement.                                                                                                                                                                                                                      |
| `animations` | array  | One entry per `animate` statement.                                                                                                                                                                                                                    |

### Element

| Key           | Type           | Meaning                                                                                                                                                                  |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | string         | Element id.                                                                                                                                                              |
| `kind`        | string         | `node`, `decision`, `data`, `group`, `note` or `tag`; in free diagrams `box`, `text`, `icon`, `image` or `group`; in sequence diagrams the participant kinds or `group`. |
| `label`       | string         | Visible text; defaults to the id.                                                                                                                                        |
| `implicit`    | boolean        | True when only a relation mentions the element.                                                                                                                          |
| `description` | string or null | From an element or group block.                                                                                                                                          |
| `url`         | string or null | The `url` of the block, or of the entity in C4 views.                                                                                                                    |
| `classes`     | array          | Class names applied in the declaration block, in order.                                                                                                                  |
| `ports`       | array          | Named ports: `{ "name", "side", "position" }`.                                                                                                                           |
| `layer`       | string or null | The `layer` of the block (free diagrams).                                                                                                                                |
| `link`        | object or null | `{ "binding", "diagram", "element" }`; `binding` is null for links in the same file.                                                                                     |
| `source`      | string or null | The icon reference or image path of `icon` and `image` objects.                                                                                                          |
| `shape`       | string or null | The shape the declaration implies: `cylinder` for `id[("…")]`, null otherwise. A `shape` written in a style stays in `styles`.                                           |
| `groupPath`   | array          | Ids of the enclosing groups, outermost first.                                                                                                                            |
| `range`       | range          | Declaring statement, or the first mention for implicit elements.                                                                                                         |
| `idRange`     | range          | The identifier token.                                                                                                                                                    |

### Relation

| Key           | Type           | Meaning                                            |
| ------------- | -------------- | -------------------------------------------------- |
| `key`         | string         | The id, or `<from>-><to>#<n>` when anonymous.      |
| `id`          | string or null | The `as <id>` name.                                |
| `from`, `to`  | string         | Element ids.                                       |
| `line`        | string         | `solid` (`->`, `<->`) or `dashed` (`-->`, `<-->`). |
| `twoWay`      | boolean        | Written `<->` or `<-->`.                           |
| `async`       | boolean        | `kind async` on a sequence message.                |
| `label`       | string or null | Text after `:`.                                    |
| `description` | string or null | From the relation block.                           |
| `classes`     | array          | Class names applied in the relation block.         |
| `layer`       | string or null | The `layer` of the block (free diagrams).          |
| `groupPath`   | array          | Groups that contain the relation statement.        |
| `range`       | range          | The relation statement.                            |
| `idRange`     | range or null  | The `as <id>` identifier.                          |

### Placement entries

Every entry has `statement`, `target`, `range` and `targetRange`, plus:

| `statement` | Extra keys                                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `place`     | `x`, `y`: center of the element in logical units.                                                                                                                     |
| `size`      | `width`, `height`.                                                                                                                                                    |
| `route`     | `from` and `to` as `{ "element", "port" }`, with `"position"` (a percentage) when the end is pinned to a point of its side; `via` as a list of `{ "x", "y" }` points. |
| `label`     | `at`: percentage along the route; `offset` as `{ "x", "y" }`.                                                                                                         |
| `space`     | `amount`: extra space above a sequence message, note or fragment.                                                                                                     |
| `gap`       | `amount`: extra space left of a sequence participant.                                                                                                                 |

For `route` and `label`, `target` is the relation key; for `space`, the id of the event.

### Style and animation entries

| Key           | Type                        | Meaning                                                      |
| ------------- | --------------------------- | ------------------------------------------------------------ |
| `target`      | string                      | Element id, relation id, or the id of a note or fragment.    |
| `targetKind`  | string                      | `element`, `relation` or `event`.                            |
| `properties`  | object                      | Styles only: explicit properties sorted by name (see below). |
| `classes`     | array                       | Styles only: class names applied by the statement, in order. |
| `effect`      | string or null              | Animations only: `flow`, `pulse`, `dash` or `trace`.         |
| `durationMs`  | number or null              | Animations only: duration in milliseconds.                   |
| `repeat`      | number, `"forever"` or null | Animations only.                                             |
| `delayMs`     | number or null              | Animations only: delay in milliseconds.                      |
| `direction`   | string or null              | Animations only: `forward` or `reverse`.                     |
| `particles`   | number or null              | Animations only: particles of a flow effect.                 |
| `color`       | string or null              | Animations only: a colour, or `@<token>` for a theme token.  |
| `range`       | range                       | The statement.                                               |
| `targetRange` | range                       | The target identifier.                                       |

Style properties keep their types: `width` is a number, words such as `dashed` or `hatch` are
strings, and a colour written as a theme token name (`stroke danger`) is the string `@danger`. A
quoted colour is kept as written, so it never starts with `@`.

### Class and rule entries

| Key          | Type   | Meaning                                                                |
| ------------ | ------ | ---------------------------------------------------------------------- |
| `id`         | string | Classes only: the class id.                                            |
| `kind`       | string | Rules only: an element kind of the profile, `relation`, or `fragment`. |
| `properties` | object | Style properties sorted by name, typed as in style entries.            |
| `range`      | range  | The statement.                                                         |

### C4 views and models

C4 views add a `c4` object after `scenarios` (null for other diagrams): `model` (as written),
`level`, `scope`, `includes` (null when the view draws its default set), `excludes`, `labels`
(`{ "target", "targetKind", "text", "range" }`) and `combined` (the keys of combinations). Their
elements carry `entity` (`{ "model", "path", "file" }`, `file` null for a model of the same file),
`technology` and `external`; their relations carry `technology`, `sources` (the model relation keys
they stand for) and `derived`. Other diagrams have `entity: null`, `technology: null`,
`external: false`, `sources: []` and `derived: false`.

The document lists `models` after `themes`:

| Key         | Type   | Meaning                                                                                                                                     |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | string | Model id.                                                                                                                                   |
| `range`     | range  | The `model` block.                                                                                                                          |
| `entities`  | array  | `{ "path", "id", "kind", "label", "description", "technology", "external", "url", "parent", "range", "idRange" }`, parents before children. |
| `relations` | array  | `{ "key", "id", "from", "to", "label", "technology", "description", "range" }`; `from` and `to` are paths.                                  |

### Sequence events and scenarios

Sequence diagrams add `events` and `scenarios` after `animations`; other diagrams have both empty.
Events are in order, fragments holding their branches' events.

| `kind`                                        | Keys besides `kind`, `key` and `range`                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `message`                                     | `relation`: the relation key, which is also the event key.                              |
| `activate`, `deactivate`, `create`, `destroy` | `participant`.                                                                          |
| `note`                                        | `id` (or null), `position` (`over`, `left`, `right`), `participants`, `text`.           |
| `fragment`                                    | `id` (or null), `operator`, `branches`: `{ "condition" (or null), "events", "range" }`. |
| `divider`                                     | `label`.                                                                                |
| `delay`                                       | `label` (or null).                                                                      |

Events without an id have the key `<kind>#<n>` (`activate#1`, `note#2`; fragments use their
operator, `alt#1`).

| Key       | Type   | Meaning                                                                                                             |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `id`      | string | Scenario id.                                                                                                        |
| `label`   | string | The label, or the id.                                                                                               |
| `choices` | array  | `{ "kind" (choose, repeat, skip, take), "fragment", "branch" (0-based or null), "iterations" (or null), "range" }`. |
| `range`   | range  | The `scenario` block.                                                                                               |

### Stories

The document lists `stories` after `models`, in source order, with times in milliseconds from the
start of the story ([stories.md](stories.md)):

| Key           | Type           | Meaning                                                                                 |
| ------------- | -------------- | --------------------------------------------------------------------------------------- |
| `id`          | string         | Story id.                                                                               |
| `target`      | string         | The diagram after `for`, as written.                                                    |
| `title`       | string or null | The `title`.                                                                            |
| `description` | string or null | The `description`.                                                                      |
| `durationMs`  | number         | How long the story lasts.                                                               |
| `scenes`      | array          | `{ "id", "title", "view", "transition", "startMs", "durationMs", "actions", "range" }`. |
| `range`       | range          | The `story` block.                                                                      |

A scene's `view` is the diagram it shows, as written; `transition` is `{ "kind", "startMs",
"durationMs" }` or null. Actions are `{ "kind", "targets", "all", "startMs", "durationMs",
"children", "range" }`, with defaults applied; a `parallel` action holds its actions in
`children` and lasts as long as the longest.

### Export profiles

The document lists `exports` after `stories`, in source order: `{ "id", "target", "targetKind"
("diagram", "story" or null), "format", "size", "scale", "background", "atMs", "motion", "theme",
"fonts", "scenario", "link", "fps", "durationMs", "file", "autoplay", "loop", "embed", "range" }`,
null for options not written ([export.md](export.md)).

## Theme

| Key       | Type           | Meaning                                                    |
| --------- | -------------- | ---------------------------------------------------------- |
| `id`      | string         | Theme id.                                                  |
| `extends` | string or null | Base theme name, or null for `technical.light`.            |
| `tokens`  | object         | Token values sorted by name; sizes and widths are numbers. |
| `classes` | array          | Class entries of the theme block.                          |
| `rules`   | array          | Rule entries of the theme block.                           |
| `range`   | range          | The `theme` block.                                         |

## Diagnostic

```json
{
  "code": "ref.unknown-element",
  "severity": "error",
  "message": "Unknown element `gateway`.",
  "range": {
    "start": { "offset": 76, "line": 6, "column": 11 },
    "end": { "offset": 83, "line": 6, "column": 18 }
  },
  "hints": ["Declare it first, for example `gateway[\"Label\"]`."],
  "related": []
}
```

`hints` and `related` are always present, possibly empty. Each related entry has `message` and
`range`. Codes are listed in [diagnostics.md](diagnostics.md).

## Example

`corpus/valid/checkout.model.json` is the JSON of `corpus/valid/checkout.meltemi` and is checked by
the test suite.
