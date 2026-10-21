## Why

The proposal asks for icons referenced by stable names such as `tabler:server` or by aliases of installed packs, with optical scale, margins and position relative to the label normalised, and with icons measured before layout. The catalog of resources must keep the version, origin and licence of every collection: including several sources does not make them all MIT. Local resources and optional provider packs are allowed, provider icons keep their own terms and are never relicensed, and fonts need distribution and embedding permissions. Projects hold `assets/icons/`, `assets/fonts/`, `assets/licenses.json` and `assets.lock.json`, the manifest pins resource versions, and continuous integration validates references and resources. Imported SVG must be sanitised and size-limited. Today `icon "<pack>:<name>"` is accepted and validated for its shape only: nothing is drawn, no pack exists, and a project cannot bring icons or fonts.

## What Changes

Roadmap change **6**, part two (`docs/roadmap-1.0.md`; part one was `styles-and-themes`). Part of **Stage 2 (flow and free: themes)**.

- **`@meltemi/diagrams-assets`**, a new host-neutral package:
  - icon packs with metadata (title, version, source, licence, author, URL, whether it may be redistributed);
  - the built-in **Tabler** pack (`@tabler/icons` 3.48.0, MIT): outline icons as `tabler:<name>`, filled ones as `tabler:<name>-filled`, with their search tags;
  - **Iconify JSON** packs (`assets/icons/<prefix>.json`), keeping their `info` licence metadata;
  - **SVG folder** packs (`assets/icons/<prefix>/*.svg`), for local and provider icons;
  - an SVG sanitiser with an allow-list of elements and attributes (shapes, groups, transforms and local gradients), no DTDs, scripts, links, external references or other `url(` values, and size and complexity limits;
  - path geometry: shapes to paths, transforms, bounding boxes;
  - the optical scale of a pack, so icons of every pack fill the same share of their box;
  - `assets/licenses.json` and `assets.lock.json` readers, a lock writer and a portable SHA-256.
- **Icons are drawn.** The `icon` style property places a normalised icon:
  - on nodes, decisions and data stores, left of or above the text;
  - before group titles, tag text and the first line of notes;
  - inside relation label pills, or in an icon-only pill.

  Monochrome icons take the text colour or the new `iconColor` style property; multicolour icons keep their colours.
- **Icons are measured before layout.** Default sizes and `layout.text-overflow` include the icon.
- **New theme tokens** `iconSize` and `iconPosition` (`left` or `top`), and **new style properties** `iconColor` and `iconPosition`.
- **Project assets.**
  - `"icons"` in `project.json` maps aliases to packs (`"cloud": "aws"`).
  - Project fonts in `assets/fonts/` are measured, embedded and outlined like bundled fonts when their embedding permission allows it.
  - Every project pack and font needs licence metadata.
  - `assets.lock.json` records versions and content hashes, and drift is reported.
- **Diagnostics**, reported by project compilation:
  - `asset.unknown-icon` and `asset.unknown-pack` (errors) on the icon value;
  - `asset.missing-license`, `asset.invalid-file`, `asset.unsafe-svg`, `asset.too-large`, `asset.duplicate-pack` and `asset.font-restricted` on the asset files;
  - `asset.lock-mismatch` (warning) on the lock.
- **CLI.** `meltemi-diagrams assets list` prints packs and fonts with version, source and licence. `assets icons <query>` searches icon names and tags. `assets lock` writes `assets.lock.json`. `validate` and `export` report asset diagnostics.
- **Docs.** A new `docs/language/assets.md`, updates to styles, SVG export, projects, fonts and diagnostics, the skill, and decision note 0014.

## Capabilities

### New Capabilities
- `icon-packs`: pack metadata, the built-in Tabler pack, Iconify JSON and SVG folder packs, sanitising and limits, aliases, search.
- `icon-rendering`: normalisation, placement relative to the label, colour, measurement before layout, icons on every element kind and on relation labels.
- `project-assets`: `assets/` discovery, `assets/licenses.json`, project fonts and embedding permissions, `assets.lock.json`, asset diagnostics and the `assets` CLI command.

### Modified Capabilities
- `theme-tokens`: the `iconSize` and `iconPosition` tokens.
- `style-classes-and-rules`: the `iconColor` and `iconPosition` style properties.
- `flow-svg-export`: the SVG draws icons as groups of paths.
- `project-manifest`: the `"icons"` alias field.
- `svg-font-policies`: project fonts in the embedded and outlined policies.

## Impact

- New package `@meltemi/diagrams-assets` with dependency `@tabler/icons` 3.48.0 (MIT, approved), added to the licence inventory.
- `@meltemi/diagrams-model`: icon uses with ranges on diagrams and themes, and the new tokens and style properties.
- `@meltemi/diagrams-layout`: icon placement and measurement, `LayoutOptions.icons`, and an `icon` scene role. Paths gain `opacity` and `fillRule`, and scene gradients become linear or radial with units and transforms.
- `@meltemi/diagrams-render`: `opacity` and `fill-rule` on paths, and radial gradients.
- `@meltemi/diagrams-fonts`: project fonts added to a `FontLibrary`, and the embedding permission read from `OS/2.fsType`.
- `@meltemi/diagrams-project`: binary reads on hosts, `Workspace.assets()`, icon checks in project compilation, and the manifest `icons` field.
- `@meltemi/diagrams-cli`: the `assets` command, and icons and fonts passed to export.
- Corpus: a project with an Iconify pack, an SVG folder pack, an alias, licences and a lock; invalid cases for each asset code.

## Non-goals

- Images in `free` diagrams (roadmap change 9) and the general rules for images, plugins and network references (roadmap change 21). Both reuse the sanitiser and limits from this change.
- Downloading packs from the network. Project packs are files the user adds to `assets/`.
