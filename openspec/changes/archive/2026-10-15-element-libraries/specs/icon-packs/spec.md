## ADDED Requirements

### Requirement: Built-in provider packs
Besides `tabler`, the packs `aws` (AWS Architecture Icons), `azure` (Azure architecture icons), `gcp` (Google Cloud icons), `kubernetes` (Kubernetes icons) and `logos` (SVG Logos) SHALL be built in, read through the same reader as Tabler (`icons/<prefix>.json`) or from the package's own files under Node. The vendor packs SHALL be Iconify files written by `scripts/vendor-icons.mjs` from the vendors' downloads, with the vendor's categories (a table for Google Cloud), a label per icon from the vendor's file name, and `info` naming the title, the vendor's version, the author, the licence (`LicenseRef-<vendor>` with its URL, `Apache-2.0` for Kubernetes, `CC0-1.0` for logos) and the vendor's `terms`. Icons SHALL keep the vendor's geometry and colours: `<style>` rules are inlined into attributes, editor metadata is dropped, and an icon the sanitiser refuses is left out. The metadata of `aws`, `azure` and `gcp` SHALL say `redistribute: false`. Hosts that bundle the packs SHALL repeat each set's terms in their notices, and the licence inventory SHALL list the sets.

#### Scenario: A provider icon resolves everywhere
- **WHEN** `style api { icon "aws:lambda" }` is laid out under Node, in the extension and in the playground
- **THEN** the icon group `<g data-id="aws:lambda" data-role="icon">` holds the vendor's paths with their colours in each host

#### Scenario: Terms in the notices
- **WHEN** the extension and the playground are built
- **THEN** their notices hold a section per vendor set with its version, URL and terms

## MODIFIED Requirements

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
