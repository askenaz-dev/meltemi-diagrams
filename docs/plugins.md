# Plugins and diagram types

[Español](es/plugins.md)

A plugin adds **diagram types** and an **icon pack** to a project. Plugins are data: a folder
with a `meltemi-plugin.json` manifest, read and checked like any other file of the project. Opening
a diagram never runs code (decision 0030).

## Installing a plugin

A project installs a plugin explicitly in `project.json`: where its folder is (inside the project),
the exact version, and what it may contribute.

```json
{
  "name": "data",
  "language": "0.2",
  "plugins": {
    "erd": { "path": "plugins/erd", "version": "1.0.0", "permissions": ["diagram-types", "icons"] }
  }
}
```

| Permission      | Lets the plugin                                                |
| --------------- | -------------------------------------------------------------- |
| `diagram-types` | declare diagram types, which every file of the project can use |
| `icons`         | add its icon pack, named after the plugin (`erd:key`)          |

There is no `network` permission: nothing a project installs fetches anything. A plugin contributes
only what it asks for **and** project.json grants; asking for more is a warning, and the rest is not
loaded. `meltemi-diagrams assets lock` records each plugin's version, folder and the SHA-256 of its
manifest in `assets.lock.json`; a manifest that changes afterwards is reported until the lock is
written again, so a change to a plugin shows up in review like any change to the project.

`pnpm mdg plugins <project>` lists the plugins, what they add, their origin and their problems;
`--json` prints the same as one object.

## The manifest

```json
{
  "name": "erd",
  "version": "1.0.0",
  "description": "Entity-relationship diagrams and organisation charts",
  "license": "MIT",
  "homepage": "https://example.com/meltemi-erd",
  "compatibility": { "model": "^1.0.0", "renderer": "^1.0.0" },
  "permissions": ["diagram-types", "icons"],
  "icons": "icons",
  "diagramTypes": [ … ]
}
```

| Field                                | Meaning                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `name`                               | The plugin's name, as project.json installs it                                                               |
| `version`                            | Its exact version, which must be the one project.json names                                                  |
| `compatibility`                      | Version ranges of the intermediate **model** (1.0.0) and of the **renderer** (1.0.0) it works with; required |
| `permissions`                        | What it asks for                                                                                             |
| `icons`                              | A folder of SVG files or an Iconify `.json` file inside the plugin; SVG is sanitised as any pack             |
| `libraries`                          | Library files inside the plugin ([assets.md](language/assets.md#libraries)); read with `icons`               |
| `diagramTypes`                       | The diagram types it declares                                                                                |
| `license`, `homepage`, `description` | Its licence and origin, shown by `plugins`; the homepage is never fetched                                    |

`main`, `module`, `exports`, `scripts` and `bin` are ignored with a warning: there is no code to run.

## Declaring a diagram type

A type registers its **schema** (kinds and properties), **validation** (required properties and
allowed relations), **layout** (mode, algorithm, direction), **editing tools** (the canvas palette)
and its **conversion to primitives** (the shape and style of every kind):

```json
{
  "type": "erd",
  "title": "Entity relationship",
  "description": "Tables of a database and how they relate",
  "layout": { "mode": "auto", "algorithm": "layered", "direction": "LR" },
  "elements": {
    "entity": {
      "label": "Entity",
      "description": "A table",
      "style": { "shape": "rectangle", "fill": "@surface", "stroke": "@accent", "width": 2 },
      "properties": { "owner": "string", "rows": "number", "archived": "boolean" },
      "required": ["owner"]
    },
    "view": {
      "label": "View",
      "style": { "shape": "rounded", "line": "dashed", "stroke": "@muted" }
    }
  },
  "relations": {
    "allowed": [
      ["entity", "entity"],
      ["view", "entity"]
    ],
    "properties": { "cardinality": { "kind": "enum", "values": ["one_to_one", "one_to_many"] } }
  },
  "tools": [
    { "kind": "entity", "label": "Entity" },
    { "kind": "view", "label": "View" }
  ]
}
```

| Part          | Rules                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`, kinds | Lower-case words that are not words of the language (`flow`, `story`, `group`, `text` and the like)                                                                                                                                                                                                                                         |
| `layout`      | `mode` auto, assisted or manual; `algorithm` `layered` or `tree` (parents centred over their children); `direction` LR, RL, TB or BT                                                                                                                                                                                                        |
| `style`       | `shape` (any of the twenty-four shapes of [free compositions](language/free.md#text-and-shapes)), `radius` (0 to 64), `fill`, `stroke`, `color`, `iconColor` (tokens such as `@accent` or CSS colours), `line`, `width`, `pattern`, `icon`, `iconPosition`, `labelPosition`, `iconSize`, `fontSize`, `fontWeight`, `textAlign`, `arrowhead` |
| `properties`  | `"string"`, `"number"`, `"boolean"` or `{ "kind": "enum", "values": [...] }`; names may not be the language's own (`description`, `url`, `class`…)                                                                                                                                                                                          |
| `allowed`     | Pairs of kinds a relation may join, `*` for any; every pair when absent                                                                                                                                                                                                                                                                     |
| `tools`       | The palette, every kind by default                                                                                                                                                                                                                                                                                                          |

## Writing diagrams of a declared type

```text
diagram schema: erd {
  title "Orders schema"

  entity customer "Customer" { owner "Sales" }
  entity orders "Orders" { owner "Sales"; rows 120000 }
  view open_orders "Open orders"

  customer -> orders: "places" { cardinality one_to_many }
  open_orders -> orders: "reads"

  style orders { icon "erd:key" }
  rule view { color muted }
}
```

A declared type compiles on the free profile: its kinds are boxes drawn with the kind's style,
and everything free diagrams take works too (`text`, `icon`, `image`, `group`, `layers`, `placement`,
`style`, `rule <kind>`, `animate`, stories, exports and the catalog). The type checks required
properties (`type.missing-property`) and the kinds a relation joins (`type.relation-not-allowed`);
values are checked against their declared kind. In VS Code, completion offers the kinds, their
properties and the values of enumerations, hover shows a kind's description and plugin, and the
canvas palette offers the type's tools.

In the model JSON, elements of a declared kind are `"kind": "box"` with `"typeKind"` and `"data"`,
and the diagram carries `"declaredType"` with the plugin's name and version.

## For applications that embed the libraries

`readDiagramType(json, plugin)` checks a definition and `compile(text, { types })` compiles with it,
so an application can register types of its own with the same format. Projects never load code; an
application that embeds the libraries decides what it imports itself.
