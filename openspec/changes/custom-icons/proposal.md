## Why

A project can already ship its own icons: an SVG file in `assets/icons/<prefix>/<name>.svg`, or an
Iconify file `assets/icons/<prefix>.json`, is a pack the registry resolves for `icon
"<prefix>:<name>"`, the sanitiser checks, every exporter embeds as paths and the cloud stores as
text. Nobody can get there from the editor: the icon picker has no way to add a file, the only
file request the canvas makes of its host picks an image (`pick { kind: "image" }`), a file
called `My Logo.svg` becomes an icon whose name the grammar refuses, a new pack is an error until
`assets/licenses.json` names its licence, an SVG folder pack has no labels or categories so it
never appears in the Libraries panel, and the problems of the asset files (`asset.missing-license`,
`asset.unsafe-svg`, `asset.invalid-file`, `asset.duplicate-pack`) are printed by the command line
only; the playground and VS Code show none of them. The owner asked on 2026-10-22 for "the
possibility of adding new icons". This change adds **Add icon…** to the picker and the Libraries
panel, writes the pack, its licence and its library entry in one undo step, and makes the asset
problems visible in both editors. Post-1.0 change, outside the roadmap; it builds on
`icons-and-assets` (decision 0014), `element-libraries` (decision 0041), `icon-placement-and-picker`
and `project-explorer`.

## What Changes

- **Add icon… in the icon picker and the Libraries panel.** The picker's footer and the Project
  group of the Libraries panel offer **Add icon…**, which asks the host for one or several `.svg`
  files and opens a small dialog over the canvas: the pack's prefix (`project` by default,
  remembered while the canvas is open; `tabler` refused), one editable name per file, slugified
  from the file name, the licence when the prefix is new ("Own work", the common SPDX identifiers,
  or a typed identifier), and a preview of each icon drawn through the sanitiser; a file the
  sanitiser refuses is shown with its reason and left out before anything is written.
- **One undo step writes the pack.** `assets/icons/<prefix>/<name>.svg` for each accepted file,
  the entry of `assets/licenses.json` when the prefix is new, and an entry per icon in
  `assets/libraries/project.json` (category named after the prefix, label from the name), so the
  icon is found by the search, listed in the Libraries panel and licensed. With elements selected
  that take icons, the new icon is applied to them in the same step; without a selection the
  picker shows it, chosen.
- **A new session request.** `addIcons { prefix, licence?, files: [{ name, svg }] }` joins
  `pick` in the canvas protocol; the session sanitises, slugifies, checks the names against the
  registry and answers the references, or the refusal per file; the playground and VS Code write
  the files, rebuild the registry and apply the style edits.
- **The project's packs in the picker.** An empty query shows Recent, then the project's packs,
  then the Technology library. The Libraries panel lists a Project library made of the project's
  SVG folder packs and `assets/libraries/project.json`.
- **File names that cannot be referenced.** An SVG file whose name is not a valid icon name is
  `asset.unusable-name` (warning) on the file, with the slug to rename it to; the pack keeps its
  other icons.
- **Asset problems in the editors.** The playground's problem counts, the explorer's badges and
  Show all files, and VS Code's diagnostic collection show the diagnostics of `Workspace.assets()`
  on the files they concern, refreshed when anything under `assets/` changes.
- **Guests of a live session may add icons** when the session lets them edit: the files are text,
  sanitised, and go through the room like any edit.
- **Documentation.** `docs/language/assets.md` and its Spanish mirror gain "Adding icons from the
  editor"; the editor guide's icon section; the playground guide; the changelog's 1.10.0 section;
  decision 0054.

## Non-goals

- The strip's effects row, the rotation gesture and the sequence heads belong to
  `canvas-feel-and-naming`; C4 entities from the palette to `c4-entities-and-routes`; the video
  defaults and the visibility of effects to `export-defaults-and-visible-effects`.
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

- `custom-icons`: adding icons to a project from the editor: the Add icon… flow, its dialog, the
  files it writes in one undo step, the session request and its refusals.

### Modified Capabilities

- `diagram-canvas`: the icon picker offers Add icon… and lists the project's packs for an empty
  query after Recent.
- `element-libraries`: the session answers an empty query with Recent, the project's packs and
  Technology, lists a Project library, and takes `addIcons`.
- `icon-packs`: an SVG folder pack reports a file whose name cannot be referenced as
  `asset.unusable-name` and keeps its other icons.
- `web-playground`: the asset diagnostics are counted and listed with the file's problems.
- `vscode-extension`: the asset diagnostics are published on the asset files.

## Impact

- `packages/assets`: `src/packs.ts` (`SvgFolderPack` reporting unusable names, `slugifyIconName`),
  `src/sanitize.ts` reused unchanged for previews; tests.
- `packages/project`: `src/assets.ts` (`asset.unusable-name`, the hint), `src/files.ts`
  (`iconFileName`), messages `en`/`es`; tests.
- `packages/editor`: `src/canvas/protocol.ts` (`addIcons` request and answer), `src/session.ts`,
  `src/icons.ts` (the project group, the Project library), `src/projects.ts` (the files to write
  and the licence entry), messages `en`/`es`; tests.
- `packages/canvas`: `src/icon-picker.ts` (Add icon…), `src/library.ts` (Project group), a new
  `src/add-icons.ts` dialog, `canvas.css`, messages `en`/`es`; tests.
- `packages/playground`: `src/canvas-host.ts`, `src/shell.ts`, `src/studio.ts` (`problems()` with
  asset diagnostics, `addFiles` from the canvas), `src/explorer/` counts; browser tests.
- `packages/vscode`: `src/extension/pickers.ts`, `src/extension/canvas.ts`,
  `src/extension/documents.ts` (asset diagnostics in the collection); the webview suite.
- Exporters, the player, the catalog and the cloud service need no change: icons are already
  inline paths in every scene, and `.svg` and `.json` are text files of a cloud project.
- `docs/language/assets.md`, `docs/es/language/assets.md`, `docs/editor.md`, `docs/es/editor.md`,
  `docs/playground.md`, `docs/es/playground.md`, `CHANGELOG.md`, `docs/decisions/0054-custom-icons.md`.
