## Context

Icons reach a drawing through one pipeline: a reference `<prefix>:<name>` (grammar
`packages/model/src/style-values.ts:182-186`) is resolved by the project's `IconRegistry`
(`packages/assets/src/packs.ts`, `lookup`), built by `discoverAssets`
(`packages/project/src/assets.ts:138-476`) from the built-in packs and the project's
`assets/icons/<prefix>/*.svg` folders (`SvgFolderPack`, `packs.ts:460-489`, read by `folderPack`,
`assets.ts:533-570`) and `assets/icons/<prefix>.json` Iconify files; `Workspace.assets()` caches
the result and forgets it when anything under `assets/`, the lock or `project.json` changes
(`packages/project/src/workspace.ts:118-124, 189-201`); every file is sanitised on discovery
(`packages/assets/src/sanitize.ts`, `sanitizeSvg`); the layout turns an icon into a scene group of
plain paths (`packages/layout/src/icons.ts`), so the SVG, the players, the catalog and the videos
embed a project icon exactly as a Tabler one; the cloud stores `.svg` and `.json` as text
(`packages/project/src/files.ts:5`, `packages/cloud/src/document.ts`). A pack without an entry in
`assets/licenses.json` is `asset.missing-license` (error) but is registered and drawn
(`assets.ts:223-233`). The picker (`packages/canvas/src/icon-picker.ts`) asks the session for
`searchIcons` and shows, for an empty query, Recent then the Technology library's first category
(`packages/editor/src/icons.ts:192-211`); the Libraries panel (`packages/canvas/src/library.ts`)
lists `librariesOf` the registry (`packages/assets/src/libraries.ts`), which SVG folder packs never
join because they have no labels or categories. The only file the canvas asks its host for is an
image (`pick { kind: "image" }`, `packages/editor/src/session.ts:107, 1385`; playground
`src/canvas-host.ts:43-56`, `src/shell.ts:1303-1323`; VS Code `src/extension/pickers.ts:9`). In the
playground, files dropped into the explorer go through `addLocalFiles` (`shell.ts:1258-1300`),
where `.svg` counts as an image stored as bytes and guests are refused (`shell.ts:1273-1276`), and
`addFiles` restarts the compiler so the registry is rebuilt (`src/studio.ts:349-364, 480-494`);
`Studio.problems()` counts manifest and compile diagnostics only (`studio.ts:804-821`). VS Code
watches `assets/**` and `*.svg` to invalidate the workspace (`src/extension/documents.ts:52-56`)
but never reads `assets().diagnostics`. `cleanPath` accepts spaces, `()`, `+` and `@`
(`files.ts:31`) while an icon name must match `[A-Za-z0-9_.-]+` and a prefix
`^[a-z0-9][a-z0-9-]*$` (`packs.ts:27`).

## Goals / Non-Goals

**Goals:**

- A person adds an SVG icon to the project from the picker or the Libraries panel, in the
  playground and in VS Code, without editing `licenses.json` or a library file by hand, and the
  icon is usable, searchable, listed and licensed at once, in one undo step.
- The names written are always referenceable; a file that is not is reported where the person
  can see it, with the name to give it.
- The problems of the asset files are visible in both editors, not only on the command line.

**Non-Goals:**

- Changing the grammar: no path, URL or data URI as an `icon` value; the reference stays
  `<prefix>:<name>`.
- PNG or other raster icons: a raster file stays an `image` object of a free composition.
- Editing the SVG (colours, geometry) in the canvas; the sanitiser's limits stay as they are.
- Writing Iconify JSON packs from the editor: added icons always go to an SVG folder pack.

## Decisions

### Where the icons go: an SVG folder pack, a licence entry and a library file

Each accepted file is written as `assets/icons/<prefix>/<name>.svg`, text, as the person gave it
after a pass through `sanitizeSvg` that keeps the file's own markup (the pack is sanitised again on
discovery, as every pack is). A new prefix gets its entry in `assets/licenses.json`
(`{ "icons": { "<prefix>": { "license": "<id>" } } }`, merged into the existing file through
`setJsonField`, `packages/editor/src/json-edit.ts`), so no `asset.missing-license` ever follows an
editor action. Each icon gets an entry in `assets/libraries/project.json` (`id: "project"`, title
"Project", one category per prefix with the prefix as its title, the item's label from the name
with `-` and `_` as spaces), created when it does not exist, so `librariesOf` lists the icons in
the Libraries panel and `searchIcons` finds them by label. Alternatives: (a) an Iconify JSON pack
per prefix, one file holding every icon: smaller folders, but each addition rewrites one growing
file and a diff shows path data instead of one new file; (b) no library file, with the panel
listing SVG folder packs directly: the panel would then need labels and categories from file
names for every project pack, old ones included, and a person could not reorder or rename them.
Decision: the folder pack plus the library file; the library file is the existing way to give
labels to any pack (decision 0041).

### SVG only

The file picker asks for `.svg`. A PNG, JPEG or WebP is not an icon: it cannot be recoloured, it
is stored as bytes and it is already served by the `image` object and the image picker.
Alternative: accept rasters and wrap them in an `<svg><image>`: the sanitiser refuses `image`
(spec `icon-packs`, "SVG sanitising"), rightly. Decision: SVG only; the dialog says so when the
host hands back another kind.

### Names and prefixes

`slugifyIconName(fileName)` in `packages/assets/src/packs.ts`: the extension dropped, diacritics
folded, every run of characters outside `[A-Za-z0-9_.-]` replaced by `-`, leading and trailing `-`
trimmed, so `My Logo (1).svg` becomes `My-Logo-1`; a name taken in the pack is offered as
`<name>-2`, `<name>-3`…; the person may edit it and the dialog refuses an invalid or taken name
inline. The prefix defaults to `project`, matches `^[a-z0-9][a-z0-9-]*$`, and refuses every
built-in pack's prefix (`tabler`, whose replacement `asset.duplicate-pack` forbids, and the vendor
packs, which a project may replace with a whole vendor set but not by adding one icon), the
prefixes of plugin packs (`asset.duplicate-pack` would follow), the Iconify files of the project
(the dialog writes SVG files, and a folder beside the file would be a second pack), and the
aliases of `project.json`; it is remembered while the canvas
is open (in the canvas's memory, as the icon placement is). The same slug rule reports a
file already in a pack whose name cannot be referenced: `asset.unusable-name` (warning) on the
file, hint "rename it to `<slug>.svg`", and the pack keeps its other icons. Alternative: widen the
grammar to accept any file name quoted: references with spaces would break completion, the lock
and the Iconify convention. Decision: slugs in the editor, a warning for files that arrive
otherwise.

### Licence of a new prefix

The dialog shows a licence select for a prefix that has no entry: **Own work** (writes
`LicenseRef-Project`), `CC-BY-4.0`, `CC0-1.0`, `MIT`, `Apache-2.0`, and **Other…** with a text
field for an SPDX identifier or a `LicenseRef-` name. An existing prefix keeps its licence and
shows no select. Alternatives: always write `LicenseRef-Project` silently (a person adding a
vendor's icons would mislabel them); require the licence file to be edited first (the friction
this change removes). Decision: ask once per prefix, in the dialog.

### The requests: `checkIcons` and `addIcons`

`packages/editor/src/canvas/protocol.ts` gains two canvas messages and their answers. The dialog
sends `checkIcons { token, prefix, files: { file, name?, svg }[] }` as the prefix and the names
are typed (debounced, the latest token kept) and the session answers `iconsChecked { token,
prefix: { prefix, problem?, existing, licensed }, files: { file, name, problem?, svg }[] }`: the
name offered when none is typed, a 48 px preview through the sanitiser, and the problem of each;
the dialog is a view of that answer, so the rules live in one place (`packages/editor/src/
add-icons.ts`, `checkIconPrefix`, `checkIconFiles`, `addIcons`), tested without a browser.
Confirming sends `addIcons { token, prefix, licence?, files: { file, name, svg }[], targets }`;
the session checks again and returns `iconsAdded { token, added, refused }` with
`SessionResult.project` as `{ kind: "files", steps, assets }`: `assets` holds the new files
(`assets/icons/<prefix>/<name>.svg`, the text as picked) and the changes of the JSON files of the
assets (`AssetFileChange`: the pack's licence when it has none, the icons' items in the project's
library), `steps` the `setStyleProperty icon` statements on the targets that take an icon. The
hosts plan them with `ProjectSessions.planAssetSteps(document, assets, steps)`, beside
`planSteps`, which it calls after setting the new files as overlays, so the statements are
planned against a project that has the icons; it refuses a new file whose path is taken
(`edit.id-conflict`) and a JSON file it cannot read, keeps the indentation of a JSON file it
changes (`changedAssetFile`, `packages/editor/src/asset-files.ts`), and answers the edits of the
files that exist and the files to create. `planSteps` itself stays as it was. Alternatives: (a) a
`writeFile` kind of `ProjectStep` planned inside `planSteps`: every consumer of the steps (the C4
paths, their tests) would have to tell the kinds apart; (b) the host writes the files itself and
tells the session afterwards: two undo steps and two code paths; (c) the dialog checking names
itself: the registry, the sanitiser and the pack rules would have to reach the webview. Decision:
the two requests, the assets beside the steps, one undo step.

### The file chooser is the page's

The canvas opens the system's file chooser itself, with an `<input type="file" accept=".svg"
multiple>`, and reads the files as text: the playground is a page, and VS Code's webview lets a
page open the chooser, so no host request is needed and the two hosts behave alike; a file that is
not an SVG, or larger than an icon may be (256 KB), is left out unread. Alternative: a host
request beside `pick` (`showOpenDialog` in VS Code, a file input in the playground's shell): two
implementations of the same chooser, and the files' texts going through the host for nothing.

### After the write

The session's answer carries the references with their thumbnails; the canvas marks them Recent
and, when nothing was selected, chooses the first once the drawing that knows it arrives, as a
click on it in the picker would: the icon tool is armed with it (or the inspector's Icon field
written with it when the dialog was opened from there), and the status line says "Added
`project:my-logo` to the project." before the tool's hint. In the playground the step is one of
the project's undo stack (`History.recordCreates`): undo takes the files away and the texts back,
from any file, as a move of files is undone; redo writes them again. The Libraries panel's
Project group and the picker's empty-query groups refresh when the next `libraries`/`searchIcons`
answer arrives after the registry is rebuilt. Elements that were selected take the icon through
the `setStyleProperty` steps of the same plan.

### The project's packs in the picker and the panel

`iconGroups` (`packages/editor/src/icons.ts`) answers an empty query with Recent, then one group
per project pack (the SVG folder packs and the project's Iconify packs, up to 24 icons each,
labelled through `assets/libraries/project.json` when it names them, else by name), then the
Technology library's first category; `librariesOf` lists the Project library when
`assets/libraries/project.json` exists. On C4 views the project's packs are offered like Tabler's
(icons only, no libraries). Alternative: leave the project's icons to the search only, as today:
nobody finds an icon they do not know the name of.

### Asset problems in the editors

`Studio.problems()` adds `workspace.assets().diagnostics` (already grouped by file) to the counts
and to the problems list, under the asset file's path; the explorer shows the count on the file
when it is listed and, when the file is hidden by Show all files, on the folder, with the existing
"hidden files have problems" offer. VS Code publishes them in the diagnostic collection on the
asset file's URI and republishes when the `assets/**` watcher fires. Alternative: a notice in the
status line after an addition only: the problems of files added by hand or by a teammate would
stay invisible. Decision: the same channel as every other diagnostic.

### Guests of a live session

A guest who may edit may add icons: the files are sanitised text written through the room like
any edit, and the limits of a cloud project apply (`manifest.ts`, 2M characters per text file).
Alternative: refuse as `addLocalFiles` refuses images from guests (`shell.ts:1273-1276`): images
are bytes uploaded as blobs under the owner's account, which is why guests are refused there;
icons are not. Decision: allowed when editing is; the image refusal stays.

## Risks / Trade-offs

- [A large SVG set added one file at a time is slow to discover] → every pack is sanitised on
  discovery today; the dialog accepts several files per request, and the registry is rebuilt once
  per request.
- [`project.json`-level aliases could hide a project pack] → the dialog refuses a prefix that is
  an alias of `project.json` and names the pack it points at.
- [Two people add the same prefix at once in a live session] → the licence entry is merged by
  `setJsonField` into whatever the file holds when the step is applied, and the second write of
  an existing path is refused by `writeFile`, so a name is never overwritten silently.
- [Icon file names in archives and local folders stay free] → `asset.unusable-name` says what to
  rename, and the CLI's `assets list` shows it too.
- [VS Code undoes a `WorkspaceEdit` with new files file by file] → the same holds for Rename
  Symbol and the C4 steps; the message names the files written.
- [The real-VS Code suite cannot run where VS Code is not installed for it] → the asset
  diagnostics are published by a function tested without VS Code (`assetProblems`), and the
  canvas's flow is covered by the webview suite with the same page.
