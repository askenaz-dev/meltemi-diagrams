# Icons and assets

[Español](../es/language/assets.md)

Diagrams draw icons by name and can use project fonts. Every icon pack and font a project uses
has a known version, origin and licence, and a lock records them so a change never goes unnoticed.
Nothing is downloaded: the built-in pack ships with the tool, and project assets are files in the
project.

## Icons

An icon is written `"<pack>:<name>"` in the `icon` style property, so `style` statements, classes
and rules can all set it:

```text
diagram checkout: flow {
  rule data { icon "tabler:database"; iconColor accent }
  class edge { icon "tabler:server" }

  api["API"] { class edge }
  worker["Worker"]
  api -> worker: "jobs" as jobs

  style worker { icon "tabler:cpu"; iconPosition top }
  style jobs { icon "tabler:clock" }
}
```

| Target                          | Where the icon goes                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node, decision, data store, box | beside the text (`iconPosition left`, the default, or `right`), above or below it (`top`, `bottom`), centred in the box; or, with `center`, as the picture of the box, the label at an edge inside it |
| node or box with `shape icon`   | the icon is the element, its label outside ([free.md](free.md#icons-as-shapes))                                                                                                                       |
| group                           | before the title                                                                                                                                                                                      |
| tag, note                       | before the text, or before the first line of a note                                                                                                                                                   |
| relation                        | before the label inside its pill; without a label, alone in a small pill                                                                                                                              |

- `iconSize` (a theme token: technical 18, editorial 16, stage 24) is the side of the square
  icons of boxes are drawn in beside their text. The `iconSize` style property sets it per
  element, from 8 to 128, or `auto` to fit the box ([styles.md](styles.md#icons-in-boxes)). Other
  targets use 1.3 times their text size.
- `iconPosition` is a theme token and a style property; the stage themes put icons on top.
  `labelPosition` places the label around a centred icon or an icon shape.
- Monochrome icons take `iconColor`, which accepts colour token names, or else the target's text
  colour. Icons with their own colours, such as provider icons, keep them.
- Boxes without `size` grow to fit the icon, and `layout.text-overflow` counts it.
- Icons are normalised across packs. A pack's optical ratio is the median share of the view box its
  icons fill. Every pack is scaled so its icons fill the same share as Tabler's, 20 of 24 units.
  Icons are centred on their own view box. An icon drawn as the shape (`shape icon`) is not
  rescaled: it fills its square, so connectors touch it.

In the SVG, an icon is a group `<g data-id="tabler:server" data-role="icon">` holding plain paths,
with gradients in `<defs>`. Nothing is referenced with `<use>` or `<image>`, so files stay portable.

## Packs

| Pack                    | Files                              | Names                                                 | Licence                                      |
| ----------------------- | ---------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| `tabler` (built in)     | `@tabler/icons` 3.48.0             | `tabler:server`; filled variants `tabler:star-filled` | MIT, Paweł Kuna                              |
| `aws` (built in)        | AWS Architecture Icons             | `aws:lambda`, `aws:group-vpc`, `aws:client`           | AWS terms: architecture diagrams             |
| `azure` (built in)      | Azure architecture icons           | `azure:virtual-machine`                               | Microsoft terms: architecture diagrams       |
| `gcp` (built in)        | Google Cloud icons                 | `gcp:cloud-run`                                       | Google terms: architecture diagrams          |
| `kubernetes` (built in) | Kubernetes icons                   | `kubernetes:pod`, `kubernetes:sts`                    | Apache-2.0, the Kubernetes Authors           |
| `logos` (built in)      | SVG Logos (`@iconify-json/logos`)  | `logos:postgresql`, `logos:docker-icon`               | CC0-1.0                                      |
| Iconify JSON            | `assets/icons/<prefix>.json`       | `<prefix>:<name>` and the file's aliases              | the file's `info`, or `assets/licenses.json` |
| SVG folder              | `assets/icons/<prefix>/<name>.svg` | `<prefix>:<name>`                                     | `assets/licenses.json`                       |

- Prefixes use lower-case letters, digits and hyphens. A project pack may not reuse `tabler` or
  another project or plugin pack's prefix (`asset.duplicate-pack`). A project pack named like a
  built-in provider pack (`aws`, `azure`, `gcp`, `kubernetes`, `logos`) replaces it, to adopt a
  newer vendor set.
- An Iconify file's `prefix` must equal its file name.
- `"icons": { "cloud": "aws" }` in `project.json` adds aliases: `cloud:lambda` is `aws:lambda`.
- An SVG file whose name a reference cannot write (`My Logo (1).svg`: a space, brackets) is left
  out of its pack with the warning `asset.unusable-name`, whose hint names the file to rename it
  to (`My-Logo-1.svg`); the pack keeps its other icons.

Find icon names with the command line, which matches names, tags and categories:

```bash
pnpm mdg assets icons cloud upload
```

### Adding icons from the editor

**Add icon…** at the foot of the icon picker and of the Libraries panel adds SVG files of your own
to the project, in VS Code and in the playground, when the file belongs to a project. Pick one or
several `.svg` files; a dialog shows each one drawn as it will be, the name it gets and the pack:

- **Pack**: `project` by default, or another prefix; a built-in pack (`tabler`, `aws`…), a
  plugin's, an Iconify file of the project or an alias is refused.
- **Licence**, asked for a new pack only: **Own work** (`LicenseRef-Project`), `CC-BY-4.0`,
  `CC0-1.0`, `MIT`, `Apache-2.0`, or **Other…** for another SPDX identifier or `LicenseRef-` name.
- **Name**, made of the file's (`My Logo.svg` is `My-Logo`, a name the pack has gets `-2`), and
  edited in place; a name taken or one a reference cannot write is refused as it is typed.
- A file the sanitiser refuses (a `<script>`, an external link), a picture that is not an SVG
  (added as an `image` instead) or a file over 256 KB is left out, with the reason.

Adding writes, in one undo step: `assets/icons/<prefix>/<name>.svg` per icon, the pack's entry in
`assets/licenses.json` when it is new, and an item per icon in `assets/libraries/project.json`
(the Project library, a category per pack), so the icon is found, listed and licensed at once.
With elements selected, they take the first icon in the same step; without, the icon tool is
armed with it. An empty search of the picker shows your recent icons, then the project's own
packs, then the Technology library.

### Provider icons

The AWS, Azure, Google Cloud and Kubernetes sets are built in, converted unmodified from the
vendors' downloads by `pnpm vendor:icons` into `packages/assets/vendor/` with the vendor's
categories and a label per icon (`aws:lambda` is "AWS Lambda"). Each keeps its vendor's terms,
which permit architecture diagrams and documentation: the tool reports the terms in
`THIRD_PARTY_LICENSES.md` and in the notices of the extension and the playground, and the `aws`,
`azure` and `gcp` packs say `"redistribute": false`, so `assets list` marks exports that carry
them. The playground fetches a provider pack the first time a document or the libraries panel
needs it. Other provider sets go in a project pack, for example `assets/icons/oci/`, with their
terms in `assets/licenses.json`.

### Libraries

A library is a list of ready-made elements by category, which the canvas's Libraries panel
offers ([editor.md](../editor.md#element-libraries)). Every pack with categories is a library:
the provider packs by their categories, Tabler by its, and project Iconify packs by theirs, with
each icon's label. The built-in `tech` library ("Technology") curates databases, messaging,
languages, frameworks, tools, platforms and operating systems from `logos`. A project adds its own
in `assets/libraries/<id>.json`, and a plugin in its `libraries` ([plugins.md](../plugins.md)):

```json
{
  "id": "shapes",
  "title": "Our shapes",
  "categories": [
    {
      "id": "stores",
      "title": "Data stores",
      "items": [{ "icon": "tabler:database", "label": "Database", "kind": "data" }]
    }
  ]
}
```

`icon` is a `pack:name` reference, `label` the element's name and `kind` an optional element kind
of the diagram's profile (a node, or a box in free compositions, otherwise). A file that is not a
library is `asset.invalid-library`. An Iconify pack may carry `"labels": { "<name>": "<label>" }`,
a Meltemi extension the pickers and libraries read.

The panel's placement control decides what an item becomes, and the canvas's icon picker shares
it ([editor.md](../editor.md#icons)): **Icon**, the default, writes a node or a box drawn as its
icon with the item's label below (`shape icon`); **In a box** a node or a box of the current shape
with the icon beside its label; **Only the icon**, in free compositions, an `icon` object. An
item with a `kind` keeps its kind and takes the icon without a `shape`. Dropped onto a node, a
decision, a data store or a box, an item gives it its icon and creates nothing. The icon picker
searches the libraries with the packs, so library labels find icons too.

### Sanitising and limits

Project icons are untrusted files and are checked when the project's assets are read:

| Allowed                                                                                         | Refused (`asset.unsafe-svg`)                                                           |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`                  | `script`, `style` elements, `foreignObject`, `image`, `use`, `a`, animation            |
| `defs`, `linearGradient`, `radialGradient`, `stop`, referenced as `url(#id)` from the same file | patterns, masks, clips, filters, and `url(` to anything else                           |
| geometry, paint, opacity, `fill-rule`, `transform` and `style` with those properties            | event attributes (`on…`), links other than between gradients, DTDs and custom entities |

`title`, `desc`, `metadata` and editor namespaces (Inkscape, Sodipodi) are skipped. Limits
(`asset.too-large`): 256 KB per SVG file, 16 MB per Iconify file or font, 2,000 elements and 32
levels of nesting per icon, and 256 KB of path data per icon. An unusable icon is reported on its
file, and wherever a diagram uses it.

## Fonts

Every `.woff2`, `.woff`, `.ttf` or `.otf` file in `assets/fonts/` joins the fonts the project's
exports measure, embed and outline, under the family, weight and style the font declares. A theme
uses it by name:

```text
theme company { extends "technical.light"; font "'Company Sans', sans-serif" }
```

The `embedded` font policy writes the whole file into the SVG. A font whose embedding permission
(`OS/2 fsType`) is restricted is used to measure text only: exports name it without embedding or
outlining it, and `asset.font-restricted` (warning) says so.

## `assets/licenses.json`

```json
{
  "icons": {
    "aws": {
      "title": "AWS Architecture Icons",
      "version": "2026.02",
      "license": "LicenseRef-AWS-Architecture-Icons",
      "url": "https://aws.amazon.com/architecture/icons/",
      "author": "Amazon Web Services",
      "redistribute": false
    }
  },
  "fonts": {
    "Company Sans": { "version": "2.001", "license": "OFL-1.1" }
  }
}
```

| Field           | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| `license`       | required: an SPDX identifier (`MIT`, `OFL-1.1`) or a `LicenseRef-` name      |
| `title`         | display name                                                                 |
| `version`       | version of the pack or font                                                  |
| `url`, `author` | where it comes from and who made it                                          |
| `redistribute`  | whether exports may be published; `true` by default                          |
| `opticalScale`  | packs only, 0.5 to 1.5: the optical ratio to use instead of the computed one |

An entry overrides an Iconify file's own metadata. Every project pack and font needs a licence from
one of the two (`asset.missing-license`).

## `assets.lock.json`

```bash
pnpm mdg assets lock
```

The lock records every pack and font with its version, source, licence and, for project assets, a
SHA-256 integrity (`sha256-…`, of the file, or of a folder's sorted names and contents). Built-in
packs are pinned by version. When the lock exists, `validate` and `export` report each difference as
`asset.lock-mismatch` (warning); `validate --strict` turns it into a failure for continuous
integration. The file is written with sorted keys, so it diffs cleanly.

## Commands

| Command                                   | Prints or does                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `assets list [path]`                      | the bundled fonts, then packs, aliases and project fonts with versions, sources and licences |
| `assets icons <words> [--project <path>]` | matching references, exact names first (`--limit`, default 50)                               |
| `assets lock [path]`                      | writes `assets.lock.json` at the project root                                                |

## For tools

`@meltemi/diagrams-assets` holds packs, the sanitiser, path geometry, the lock format and a portable
SHA-256; `createNodeIconPacks()` loads Tabler from `node_modules`. `Workspace.assets()` in
`@meltemi/diagrams-project` returns the registry, packs, fonts, locks and diagnostics of a project
when the host passes `assets` services (built-in packs and a font inspector). The layout draws
icons through `LayoutOptions.icons`.
