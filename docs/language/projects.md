# Projects and imports

[Español](../es/language/projects.md)

A Meltemi Diagrams project is a plain folder. Diagrams, themes, models, stories and export profiles
can live in separate `.meltemi` files and refer to each other through relative imports with
explicit names. Nothing is stored outside the files: no database, no hidden state.

```text
architecture/
  project.json
  models/commerce.meltemi
  diagrams/checkout.meltemi
  diagrams/payment.meltemi
  stories/purchase.meltemi
  themes/company.meltemi
  assets/icons/          icon packs: <prefix>.json (Iconify) or <prefix>/*.svg
  assets/fonts/          project fonts
  assets/licenses.json   licences of the packs and fonts
  assets.lock.json       versions and hashes, written by `meltemi-diagrams assets lock`
```

Icons, fonts, licences and the lock are described in [assets.md](assets.md).

## project.json

`project.json` marks the project root. Editors can validate and complete it with
`schemas/project.schema.json`.

```json
{
  "$schema": "../schemas/project.schema.json",
  "name": "commerce",
  "language": "0.2",
  "tools": { "meltemi-diagrams": "^1.0.0" },
  "sources": ["diagrams", "themes"],
  "exclude": ["drafts"],
  "theme": "themes/company.meltemi#corporate",
  "locale": "es"
}
```

| Field      | Required | Meaning                                                                                                 |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `name`     | yes      | Project name, shown in catalogs and reports.                                                            |
| `language` | yes      | Language version of every file. A file with another `language` header is reported.                      |
| `tools`    | no       | `meltemi-diagrams` version range: exact, `^x.y.z`, `~x.y.z`, comparators, `\|\|`, or `*`.               |
| `sources`  | no       | Folders or files to compile, relative to `project.json`. Default `["."]`.                               |
| `exclude`  | no       | Paths that are never compiled. `node_modules` and hidden folders are always excluded.                   |
| `format`   | no       | Formatter settings: `{ "indent": 2 }`, spaces from 1 to 8 or `"tab"`.                                   |
| `theme`    | no       | Default theme of diagrams without `theme`: a built-in name or `<path>#<theme id>`.                      |
| `locale`   | no       | Language of the words the tool adds to exports: `"en"` (default) or `"es"`. See below.                  |
| `icons`    | no       | Icon pack aliases, such as `{ "cloud": "aws" }` for `cloud:lambda`.                                     |
| `catalog`  | no       | The HTML catalog's `title`, `description`, `out`, `exclude` and `source` ([catalog.md](../catalog.md)). |
| `plugins`  | no       | Plugins installed: folder, exact version and permissions granted ([plugins.md](../plugins.md)).         |
| `cloud`    | no       | The cloud project the folder mirrors: `host` and `project` ([below](#the-cloud-project)).               |
| `$schema`  | no       | Schema location for editors.                                                                            |

Problems are `project.*` diagnostics located in `project.json` (see
[diagnostics.md](diagnostics.md)).

## Project root

The root of a file is the nearest folder, starting with the file's own, that contains
`project.json`. Without one, the root is the file's own folder, so a loose file can still import
files next to it or below it.

## Imports

```text
language "0.2"

import "../themes/company.meltemi" as company
import corporate as corp, base from "../themes/company.meltemi"
```

- **Namespace import** (`import "<path>" as <ns>`): every top-level block of the module is
  reached as `<ns>.<id>`, for example `company.corporate`.
- **Member import** (`import <id> [as <alias>], ... from "<path>"`): each listed block is bound
  under its id or alias.

Rules:

- Imports go after the `language` header and before the first block (`module.import-position`).
- Paths are relative to the importing file, start with `./` or `../`, use `/`, end in `.meltemi`,
  and are case-sensitive. URLs and absolute paths are rejected, so nothing is ever fetched from the
  network (`module.invalid-path`).
- A path that leaves the project root is `module.outside-project`. A missing file is
  `module.not-found`, which names a file that differs only in letter case.
- Bound names share the file's top-level namespace with its diagrams and themes
  (`ref.duplicate-id`). `technical`, `editorial` and `stage` are reserved because built-in theme
  names start with them (`module.reserved-name`).
- Importing an id the module does not define is `module.unknown-member`. Importing the same file
  twice is `module.duplicate-import`. A name never used is `module.unused-import` (info).
- Every top-level block is importable. There is no export list.

## Cycles

Modules may not import each other in a loop. The import that closes the loop is `module.cycle`, with
the chain in the message (`a.meltemi → b.meltemi → a.meltemi`). Its names stay unresolved and
compilation continues. Loops between relations inside a diagram are normal and unaffected.

## Themes across files

Imported themes are used by name wherever a theme name is written:

```text
diagram checkout: flow {
  theme "corp"                      // member binding
}
theme local { extends "company.base"; accent "#ff0000" }   // namespace-qualified
```

An imported theme resolves its own `extends` in its own file. A name that starts with an import
binding but resolves to nothing is `theme.unknown-base` in an `extends` and `layout.unknown-theme`
in a diagram.

## Default theme

`"theme"` in `project.json` gives every diagram without a `theme` property a default: a built-in
name such as `"editorial.light"`, or `"<path>#<theme id>"` relative to `project.json`, such as
`"themes/company.meltemi#corporate"`. The file joins every compilation of the project, so diagrams
use the theme, its classes and its rules without importing it. A diagram's own `theme` and the
export's `--theme` still win. A malformed value, a missing file or a file that does not declare the
theme is `project.invalid-value` on the value, and diagrams then use `technical.light`.

Project compilation checks every applied class against the diagram's classes, its theme chain (its
own theme, the default theme, or `technical.light`) and the built-in classes; an unknown name is
`theme.unknown-class` (warning).

## Language of exports

`"locale"` sets the language of the words the tool itself adds to what the project exports: the
type lines of C4 entities (`[Container: Go]` or `[Contenedor: Go]`, `External Person` or
`Persona externa`), the controls and summaries of HTML players and the headings and search of the
HTML catalog, whose pages also carry it as their `lang`. It is `"en"` (the default) or `"es"`;
another value is `project.invalid-value` and the project exports in English.

The words people write (labels, descriptions, titles) are never translated, and neither are the
keywords and values of the language. The setting is part of the input, so the same sources and
options export the same bytes on every machine: the language of the machine, of the editor or of
the browser never changes an exported file. The command line's `--lang en|es` and the playground's
export dialog choose another language for one export.

## The cloud project

`"cloud"` records which cloud project a folder mirrors, so that `push`, `pull`, `publish` and
`review --base cloud` need no argument ([the command line](../cli.md#the-cloud-commands)):

```json
{
  "name": "commerce",
  "language": "0.2",
  "cloud": { "host": "https://diagrams.meltemi.dev", "project": "k4c2w7x5q3y6m2n5r7d4" }
}
```

`host` is the origin of the service: `https:`, or `http:` only for `127.0.0.1`, `localhost` and
`[::1]`. `project` is the id of the cloud project, 20 lower-case letters and digits.
`mdg push --create` makes the project and writes the setting, and `mdg pull` adds it to a folder
that lacks it; both write it as a one-line object and leave the rest of the file as it was, byte for
byte: its indentation, its line endings and a byte order mark.

The setting names a service and never chooses where a token goes. A command that talks to another
host than `host` fails with `cloud.host-mismatch` before any request, so a repository you cloned
cannot make your sign-in travel anywhere ([the host and the token](../cli.md#the-host-and-the-token)).
Commit `project.json` with the setting: it holds no secret. The id is the project's address
(`/p/<id>`), though, and in a public repository anybody can use it as the project's link level
allows ([sharing](../cloud.md#sharing-and-permissions)), so keep the project private unless its link
is meant to be public.

A `cloud` that is not an object with both settings, a `host` that is not an origin of that kind and a
`project` that is not an id are `project.invalid-value`, and the folder then mirrors no project; a
setting written twice is `project.invalid-value` too, and the first one counts. An unknown setting
inside `cloud` is `project.unknown-field` (a warning).

## References to other blocks

The C4 `using` model, the story `for` diagram and the export `for` target are resolved in the same
way: first a local id, then a member binding, then `<ns>.<id>`. A reference to a block of the wrong
kind names the kind it found.

## Compilation

`@meltemi/diagrams-project` compiles projects for the CLI, the editor and the playground:

- `Workspace` compiles a file with its imports (`compileFile`) or the whole project
  (`compileProject`).
- Single-file results are cached by text, so a change recompiles only the changed file. Its importers
  are resolved again, which is cheap.
- Unsaved editor buffers are given as overlays (`setOverlay`).
- `themeDefinitionsFor(file)` and `projectTheme(program)` give the layout every theme in scope and
  the project's default theme (`LayoutOptions.themes` and `defaultTheme`).
- `assets()` discovers icon packs, fonts, licences and the lock, and its registry is the layout's
  `icons`. Icons are checked against it when the host passes asset services.
- No cache is written to disk. If a tool ever needs one, it lives under `.meltemi/cache/`, which is
  always excluded and safe to delete.

The command line uses it automatically:

```bash
pnpm mdg validate architecture/
```

```bash
pnpm mdg export architecture/diagrams/checkout.meltemi
```
