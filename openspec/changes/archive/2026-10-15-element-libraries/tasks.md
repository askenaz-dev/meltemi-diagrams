## 1. Icon sets

- [x] 1.1 `scripts/vendor-icons.mjs`: AWS, Azure, Google Cloud and Kubernetes downloads to `packages/assets/vendor/*.json` (categories, labels, info with terms; `<style>` inlined; sanitiser-checked) and `libraries/*.json`; Google Cloud category table; run it
- [x] 1.2 Assets: `labels` and `label()` in packs, `categories()`, `builtInPacks(read)`, `LazyIconifyPack`, `createNodeIconPacks` with the vendor files and logos; `files` of the package; tests
- [x] 1.3 Inventories: `scripts/licenses.mjs` bundled icon sets; VS Code and playground notices; `THIRD_PARTY_LICENSES.md`

## 2. Libraries

- [x] 2.1 Library files and `tech.json`; `builtInLibraries`, `libraries(registry, files)`, plugin `libraries`; `analysis.libraries`; tests
- [x] 2.2 Edit `createElement.icon`; session `create` with label and icon; protocol messages `libraries`, `libraryItems`, `librarySearch`; validator; tests
- [x] 2.3 Canvas `LibraryPanel`: toggle and key U, search, categories, thumbnails, click and drag to create; words en/es; webview test
- [x] 2.4 Hosts: VS Code build copies packs and libraries, `assetReader`; playground copies them and fetches packs on demand; CLI reads the installed files; picker shows labels

## 3. Documentation and release

- [x] 3.1 `docs/language/assets.md`, `docs/editor.md`, `docs/plugins.md` and Spanish versions; skill reference; decision 0041; CHANGELOG and version 1.7.0; typecheck, lint, every suite, conformance, acceptance
