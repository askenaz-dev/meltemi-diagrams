# icon-packs Specification

## Purpose
Icon references, the built-in Tabler pack, Iconify JSON and SVG folder packs, aliases, SVG sanitising with limits, and icon search.
## Requirements
### Requirement: Icon packs and references
An icon SHALL be referenced as `"<pack>:<name>"`. `@meltemi/diagrams-assets` SHALL provide packs with:

- a prefix matching `[a-z0-9][a-z0-9-]*`;
- a title, a version, a source, a licence, an author, a URL and whether the pack may be redistributed;
- the names of their icons;
- the geometry of each icon.

The registry built for a project SHALL hold the built-in packs, the project packs and the aliases of `project.json`, and SHALL resolve a reference to its pack, its name and its geometry. A project pack whose prefix is `tabler` or another project or plugin pack's prefix SHALL be `asset.duplicate-pack` on its file; a project pack named like a built-in provider pack (`aws`, `azure`, `gcp`, `kubernetes`, `logos`) SHALL replace it, so a project can adopt a newer vendor set. In project compilation, an icon value whose prefix names no pack or alias SHALL be `asset.unknown-pack`, and an unknown name in a known pack `asset.unknown-icon`. Both are errors on the value, and the hint names the known packs or up to five close names.

#### Scenario: Built-in reference
- **WHEN** the registry resolves `tabler:server`
- **THEN** it returns the outline Tabler icon `server` with a 24 × 24 view box, from pack `tabler` with licence `MIT`

#### Scenario: Unknown icon
- **WHEN** a diagram in a project sets `style api { icon "tabler:servr" }`
- **THEN** `asset.unknown-icon` is reported on `"tabler:servr"` with `tabler:server` among the suggestions

#### Scenario: Unknown pack
- **WHEN** a diagram sets `icon "oci:vm"` and the project has no `oci` pack or alias
- **THEN** `asset.unknown-pack` is reported on the value, listing the known packs

#### Scenario: Icons in classes, rules and themes
- **WHEN** a theme declares `class db { icon "tabler:databse" }` and a diagram declares `rule data { icon "tabler:database" }`
- **THEN** project compilation reports `asset.unknown-icon` on the theme's value, and nothing on the rule

#### Scenario: A project's own provider set
- **WHEN** a project has `assets/icons/aws/lambda.svg`
- **THEN** `aws:lambda` resolves to the project's file and no `asset.duplicate-pack` is reported

### Requirement: Built-in Tabler pack
The built-in pack `tabler` SHALL be read from `@tabler/icons` 3.48.0 (`tabler-nodes-outline.json`, `tabler-nodes-filled.json` and `icons.json`).

- Outline icons SHALL be named as in the package, drawn with `stroke` set to the icon colour, stroke width 2, round caps and joins, and no fill.
- Filled icons SHALL be named with the `-filled` suffix and drawn with fill set to the icon colour.
- The pack's version SHALL come from the package, its licence SHALL be MIT, its author Paweł Kuna, and it SHALL be redistributable.
- Hosts without a file system SHALL be able to pass the same JSON through a reader.

#### Scenario: Filled variant
- **WHEN** the registry resolves `tabler:star-filled` and `tabler:star`
- **THEN** the first has filled paths and the second stroked paths

#### Scenario: Reader-based host
- **WHEN** the Tabler pack is built from a reader that returns the three JSON files from memory
- **THEN** it resolves the same icons as the Node loader

### Requirement: Iconify JSON packs
A file `assets/icons/<prefix>.json` in the Iconify JSON format SHALL be a pack:

- its `prefix` field MUST equal the file name;
- every icon `body` SHALL be sanitised, with the icon's or the file's `width`, `height`, `left` and `top` as its view box;
- `aliases` SHALL resolve to their parent icons;
- `info` SHALL supply the title, version, author, licence and URL;
- `info.palette` SHALL mark multicolour icons.

A file that is not valid JSON, has no `icons` object, or whose prefix differs from its name SHALL be `asset.invalid-file`. An icon whose body is rejected by the sanitiser SHALL be `asset.unsafe-svg` naming the icon, and the rest of the pack SHALL stay usable.

#### Scenario: Pack with an alias
- **WHEN** `assets/icons/brand.json` has prefix `brand`, icons `logo` and `mark`, the alias `symbol` of `mark`, and `info.license.spdx` `CC-BY-4.0`
- **THEN** `brand:logo`, `brand:mark` and `brand:symbol` resolve, and the pack's licence is `CC-BY-4.0`

#### Scenario: Wrong prefix
- **WHEN** `assets/icons/brand.json` declares the prefix `company`
- **THEN** `asset.invalid-file` is reported on the prefix value and the pack is not registered

#### Scenario: Labels
- **WHEN** an Iconify file carries `"labels": { "lambda": "AWS Lambda" }`
- **THEN** the pack's `label("lambda")` is `AWS Lambda`, and `label("s3")` without an entry is `S3`

### Requirement: SVG folder packs
A folder `assets/icons/<prefix>/` SHALL be a pack whose icons are its `.svg` files, named after the file without the extension. Every file SHALL be sanitised when the project's assets are read, using its `viewBox`, or its `width` and `height`, as the view box. A file rejected by the sanitiser SHALL be `asset.unsafe-svg` on that file. A file whose name without the extension is not a valid icon name (`[A-Za-z0-9_.-]+`) SHALL be `asset.unusable-name` (warning) on the file, with the hint naming the slug to rename it to (`slugifyIconName`: diacritics folded, runs of other characters as `-`, trimmed), SHALL not be registered, and the pack SHALL keep its other icons.

#### Scenario: Provider icons
- **WHEN** `assets/icons/aws/lambda.svg` and `assets/icons/aws/s3.svg` exist with flat colours
- **THEN** `aws:lambda` and `aws:s3` resolve, keep their colours, and are multicolour

#### Scenario: A file name that cannot be referenced
- **WHEN** `assets/icons/brand/My Logo (1).svg` and `assets/icons/brand/pin.svg` exist
- **THEN** `asset.unusable-name` is reported on the first file with the hint `My-Logo-1.svg`, `brand:pin` resolves, and no reference of the first file resolves

#### Scenario: Unsafe file
- **WHEN** `assets/icons/local/bad.svg` contains `<script>`
- **THEN** `asset.unsafe-svg` is reported on the file and `local:bad` does not resolve

### Requirement: SVG sanitising
The sanitiser SHALL accept only these elements:

- the root `svg`;
- `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline` and `polygon`;
- `defs`, `linearGradient`, `radialGradient` and `stop`.

It SHALL skip `title`, `desc` and `metadata`, and SHALL accept only the geometry, paint, gradient, `transform`, `id` and limited `style` attributes listed in the design. It SHALL reject:

- DTDs and custom entities;
- `script`, `style` elements, `foreignObject`, `image`, `use` and `a`;
- event attributes;
- links other than `href` from one gradient to another gradient of the same file;
- patterns, masks, clips, filters and animation;
- any `url(` that does not name a gradient of the same file.

Shapes SHALL be converted to path data. These limits SHALL apply, each violation being `asset.too-large`:

| Item | Limit |
|---|---|
| SVG file | 256 KB |
| Iconify file | 16 MB |
| Elements per icon | 2,000 |
| Nesting depth | 32 |
| Path data per icon | 256 KB |

#### Scenario: Script in an icon
- **WHEN** `assets/icons/local/bad.svg` contains `<script>`
- **THEN** `asset.unsafe-svg` is reported on the file naming `script`, and `local:bad` does not resolve

#### Scenario: External reference
- **WHEN** an icon contains `<path fill="url(https://example.com/x.svg#g)"/>`
- **THEN** `asset.unsafe-svg` is reported naming the external reference

#### Scenario: Local gradient
- **WHEN** an icon defines `<linearGradient id="g">` with two stops and fills a path with `url(#g)`
- **THEN** the icon resolves with one linear gradient and the path refers to it

#### Scenario: Entity expansion
- **WHEN** an SVG declares `<!DOCTYPE svg [<!ENTITY a "…">]>`
- **THEN** `asset.unsafe-svg` is reported naming the DTD

### Requirement: Icon search
`searchIcons(registry, query)` SHALL return references whose name, Tabler tags or categories, or Iconify categories contain every word of the query, ignoring case. Exact name matches SHALL come first, then name prefixes, then other matches in name order. Results SHALL be limited to a requested count, 50 by default.

#### Scenario: Search by tag
- **WHEN** the registry is searched for `database`
- **THEN** `tabler:database` is the first result and other results include icons tagged `database`

#### Scenario: Empty query
- **WHEN** the registry is searched for an empty string
- **THEN** the result is empty

### Requirement: Built-in provider packs
Besides `tabler`, the packs `aws` (AWS Architecture Icons), `azure` (Azure architecture icons), `gcp` (Google Cloud icons), `kubernetes` (Kubernetes icons) and `logos` (SVG Logos) SHALL be built in, read through the same reader as Tabler (`icons/<prefix>.json`) or from the package's own files under Node. The vendor packs SHALL be Iconify files written by `scripts/vendor-icons.mjs` from the vendors' downloads, with the vendor's categories (a table for Google Cloud), a label per icon from the vendor's file name, and `info` naming the title, the vendor's version, the author, the licence (`LicenseRef-<vendor>` with its URL, `Apache-2.0` for Kubernetes, `CC0-1.0` for logos) and the vendor's `terms`. Icons SHALL keep the vendor's geometry and colours: `<style>` rules are inlined into attributes, editor metadata is dropped, and an icon the sanitiser refuses is left out. The metadata of `aws`, `azure` and `gcp` SHALL say `redistribute: false`. Hosts that bundle the packs SHALL repeat each set's terms in their notices, and the licence inventory SHALL list the sets.

#### Scenario: A provider icon resolves everywhere
- **WHEN** `style api { icon "aws:lambda" }` is laid out under Node, in the extension and in the playground
- **THEN** the icon group `<g data-id="aws:lambda" data-role="icon">` holds the vendor's paths with their colours in each host

#### Scenario: Terms in the notices
- **WHEN** the extension and the playground are built
- **THEN** their notices hold a section per vendor set with its version, URL and terms

