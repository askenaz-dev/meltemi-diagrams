## ADDED Requirements

### Requirement: Icon packs and references
An icon SHALL be referenced as `"<pack>:<name>"`. `@meltemi/diagrams-assets` SHALL provide packs with:

- a prefix matching `[a-z0-9][a-z0-9-]*`;
- a title, a version, a source, a licence, an author, a URL and whether the pack may be redistributed;
- the names of their icons;
- the geometry of each icon.

The registry built for a project SHALL hold the built-in packs, the project packs and the aliases of `project.json`, and SHALL resolve a reference to its pack, its name and its geometry. A project pack whose prefix is `tabler` or another pack's prefix SHALL be `asset.duplicate-pack` on its file. In project compilation, an icon value whose prefix names no pack or alias SHALL be `asset.unknown-pack`, and an unknown name in a known pack `asset.unknown-icon`. Both are errors on the value, and the hint names the known packs or up to five close names.

#### Scenario: Built-in reference
- **WHEN** the registry resolves `tabler:server`
- **THEN** it returns the outline Tabler icon `server` with a 24 × 24 view box, from pack `tabler` with licence `MIT`

#### Scenario: Unknown icon
- **WHEN** a diagram in a project sets `style api { icon "tabler:servr" }`
- **THEN** `asset.unknown-icon` is reported on `"tabler:servr"` with `tabler:server` among the suggestions

#### Scenario: Unknown pack
- **WHEN** a diagram sets `icon "azure:vm"` and the project has no `azure` pack or alias
- **THEN** `asset.unknown-pack` is reported on the value, listing the known packs

#### Scenario: Icons in classes, rules and themes
- **WHEN** a theme declares `class db { icon "tabler:databse" }` and a diagram declares `rule data { icon "tabler:database" }`
- **THEN** project compilation reports `asset.unknown-icon` on the theme's value, and nothing on the rule

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

### Requirement: SVG folder packs
A folder `assets/icons/<prefix>/` SHALL be a pack whose icons are its `.svg` files, named after the file without the extension. Every file SHALL be sanitised when the project's assets are read, using its `viewBox`, or its `width` and `height`, as the view box. A file rejected by the sanitiser SHALL be `asset.unsafe-svg` on that file.

#### Scenario: Provider icons
- **WHEN** `assets/icons/aws/lambda.svg` and `assets/icons/aws/s3.svg` exist with flat colours
- **THEN** `aws:lambda` and `aws:s3` resolve, keep their colours, and are multicolour

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
