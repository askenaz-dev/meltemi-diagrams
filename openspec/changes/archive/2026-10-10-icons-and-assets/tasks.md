## 1. Assets package

- [x] 1.1 Create `@meltemi/diagrams-assets` (version 0.3.0, source condition, `./node` entry) with `@tabler/icons` 3.48.0, and add it to the licence inventory
- [x] 1.2 XML reader and SVG sanitiser with the allow-list, local gradient references, shapes to paths and the limits
- [x] 1.3 Path geometry: path data parser, transforms, flattening, bounding boxes, optical ratio per icon and per pack
- [x] 1.4 Icon packs: metadata, the built-in Tabler pack from a reader, Iconify JSON packs, SVG folder packs, the registry with aliases, search
- [x] 1.5 `assets/licenses.json` reader, `assets.lock.json` reader and writer, portable SHA-256
- [x] 1.6 `createNodeIconPacks()` reading Tabler from `node_modules`
- [x] 1.7 Tests: sanitiser cases, geometry, Tabler, Iconify, folders, search, licences, lock, SHA-256 vectors

## 2. Model

- [x] 2.1 Theme tokens `iconSize` and `iconPosition`; style properties `iconColor` and `iconPosition` (elements only)
- [x] 2.2 Icon uses with the range of the value on diagrams (styles, classes, rules) and themes (classes, rules)
- [x] 2.3 JSON and model tests

## 3. Layout and render

- [x] 3.1 `LayoutOptions.icons` (a resolver); icon sizes in `Sizing` for default sizes and overflow
- [x] 3.2 Icon placement on boxes (`left` and `top`), groups, tags, notes and relation pills, including icon-only pills
- [x] 3.3 Icon scene groups with role `icon`, colours, opacity and fill rule; icon gradients as scene gradients with unique ids; radial gradients and gradient units and transforms in the scene
- [x] 3.4 Renderer: `opacity`, `fill-rule`, radial gradients, gradient units, transforms and stop opacity
- [x] 3.5 Layout and render tests

## 4. Fonts

- [x] 4.1 `FontLibrary.addFont` with family, weight, style and `fsType`; whole-file faces for embedding; restricted fonts measured only
- [x] 4.2 Font tests with a project font built from a bundled TrueType or WOFF file

## 5. Project and CLI

- [x] 5.1 `readBinary` on hosts; memory hosts accept bytes
- [x] 5.2 Manifest `icons` field and schema; `Workspace.assets()` with discovery, licences, fonts, lock comparison, alias checks and caching
- [x] 5.3 Icon checks in project compilation (`asset.unknown-pack`, `asset.unknown-icon`)
- [x] 5.4 CLI: `assets list`, `assets icons`, `assets lock`; asset diagnostics in `validate` and `export`; export passes icons and project fonts
- [x] 5.5 Corpus: `corpus/projects/valid/assets` with an Iconify pack, an SVG folder pack, an alias, a project font, licences, a lock and a diagram using them; `corpus/projects/invalid/<code>` for every asset code
- [x] 5.6 Project and CLI tests

## 6. Docs and skill

- [x] 6.1 `docs/language/assets.md`; updates to styles, SVG export, fonts, projects, diagnostics, grammar and README; decision 0014
- [x] 6.2 Skill: icons in the language and themes references, the `assets icons` search in the workflow; `pnpm skills:sync`

## 7. Verification

- [x] 7.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm licenses:inventory --check`, `pnpm mdg validate` on the corpus projects, `pnpm mdg format --check examples skills corpus/projects/valid`
- [x] 7.2 Export the assets corpus and a sheet with Tabler icons in every built-in theme and look at them
