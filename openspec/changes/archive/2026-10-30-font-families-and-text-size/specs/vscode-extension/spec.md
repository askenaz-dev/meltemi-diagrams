## MODIFIED Requirements

### Requirement: Packaging with notices
`pnpm vscode:package` SHALL bundle the extension and the webview with esbuild and write `meltemi-diagrams-<version>.vsix`. The package SHALL contain:

- the bundles, the canvas stylesheet of `@meltemi/diagrams-canvas` as `dist/canvas.css`, and the bundled fonts, Tabler data and ELK worker;
- every font file the font library reads, as `bundledFontFiles()` of `@meltemi/diagrams-fonts/node` lists them: the complete files, the script subsets of the bundled weights of every one of the seventeen families and the Fontsource `unicode.json` tables;
- the icon and the README;
- `LICENSE`;
- `THIRD_PARTY_NOTICES.md` with the licence of every bundled component: EPL-2.0 for elkjs with a link to its source, each font package under the licence its `package.json` records (OFL-1.1 for all of them), and MIT for the others.

It SHALL not contain `node_modules`, sources or tests.

#### Scenario: Package contents
- **WHEN** the `.vsix` is built and listed
- **THEN** it contains `extension/dist/extension.cjs`, `extension/dist/webview.js`, `extension/dist/canvas.css`, `extension/dist/assets/elk-worker.min.js`, `extension/dist/assets/fonts/@fontsource/cascadia-mono/unicode.json`, `extension/dist/assets/fonts/@fontsource/roboto/unicode.json` and `extension/THIRD_PARTY_NOTICES.md`, and no `.ts` file

#### Scenario: Same measurements as the installed fonts
- **WHEN** a font library reads only the extension's font assets
- **THEN** it measures text in Inter, IBM Plex Sans, Cascadia Mono, Roboto, Lora and Caveat exactly as the library over the installed packages, and embeds the same font subsets

#### Scenario: Notices name every font package
- **WHEN** `THIRD_PARTY_NOTICES.md` of the package is read
- **THEN** it names `@fontsource/roboto` and `@fontsource/comic-neue` under OFL-1.1 beside `@fontsource/inter`
