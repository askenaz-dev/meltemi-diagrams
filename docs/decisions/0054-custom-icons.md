# 0054. Icons of one's own are added from the editor as a project pack

Status: accepted (custom-icons change, 23 October 2026). Extends decisions 0014 and 0041.

## Context

A project could already ship its own icons (decision 0014): an SVG file in
`assets/icons/<prefix>/<name>.svg`, or an Iconify file, is a pack the registry resolves for
`icon "<prefix>:<name>"`, the sanitiser checks, every exporter embeds as paths and the cloud stores
as text. Nobody could get there from the editor: the icon picker had no way to add a file, a file
called `My Logo.svg` became an icon whose name the grammar refuses, a new pack was an error until
`assets/licenses.json` named its licence, an SVG folder pack had no labels or categories so it
never appeared in the Libraries panel, and the problems of the asset files were printed by the
command line only. The owner asked on 2026-10-22 for "the possibility of adding new icons".

## Decision

- **Add icon… writes a project pack, its licence and its library, in one undo step.** At the foot
  of the icon picker and of the Libraries panel, in a file of a project, it opens the system's file
  chooser for SVG files (from the canvas's own page: the playground is one, VS Code's webview lets
  one open it) and a dialog: the pack's prefix (`project` by default), the licence of a new pack
  (**Own work** is `LicenseRef-Project`, a few SPDX identifiers, or one typed), and a row per file
  with its preview, the name it gets and what is wrong. Adding writes
  `assets/icons/<prefix>/<name>.svg` per icon, the pack's entry in `assets/licenses.json` when it
  has none, and an item per icon in `assets/libraries/project.json` (the Project library, a
  category per pack), so the icon is found, listed and licensed at once. Selected elements take the
  first icon in the same step; with none, the icon tool is armed with it.
- **The session checks, the dialog shows.** `checkIcons` answers, as the prefix and the names are
  typed, the name offered (made of the file's: `My Logo (1).svg` is `My-Logo-1`, a taken one gets
  `-2`), a preview through the sanitiser and each problem; `addIcons` checks again and answers the
  icons added with the files to write. A prefix is refused when it is a built-in pack's, a plugin's,
  an Iconify file's of the project or an alias of `project.json`. A file no icon can be made of (one
  the sanitiser refuses, a raster, one over 256 KB) is left out with its reason; a bad prefix, name
  or licence keeps the dialog from confirming.
- **The files go beside the steps.** The request is steps over files (decision 0051) with an
  `assets` part: the new files and the changes of the JSON files of the assets.
  `ProjectSessions.planAssetSteps` plans them first, as overlays, then the steps, refuses a new
  file whose path is taken, and keeps a JSON file's indentation. `planSteps` is unchanged. In the
  playground the step is one of the project's undo stack: undo takes the files away, redo writes
  them again.
- **SVG only, names a reference can write.** A raster stays an `image` of a free composition. A
  file already in a pack whose name a reference cannot write is left out with the warning
  `asset.unusable-name`, whose hint names the file to rename it to.
- **The assets' problems are shown where the others are.** The playground counts them on the file
  and its folders (a folder has problems of its own, a pack without licence), and an asset file
  opened lists its own; VS Code publishes them in its Problems view.
- **Guests of a live session may add icons when they may edit**: the files are sanitised text,
  written through the room like any edit. Images stay refused to them, being uploaded as blobs.

## Alternatives considered

- **An Iconify file per prefix**: smaller folders, but each addition rewrites one growing file and
  a diff shows path data instead of one new file.
- **A path or a data URI as an `icon` value**: references with spaces or data would break
  completion, the lock and the Iconify convention.
- **A `writeFile` kind of step inside `planSteps`**: every consumer of the steps would have to tell
  the kinds apart.
- **A host request for the files (`showOpenDialog`, a shell input)**: two implementations of the
  same chooser, and the texts going through the host for nothing.
- **Writing `LicenseRef-Project` silently**: a person adding a vendor's icons would mislabel them.

## Consequences

- An icon added from the editor is an ordinary project pack: the command line, the exporters, the
  player, the catalog and the cloud need no change.
- New public surface: `slugifyIconName`, `isIconName` and `ICON_NAME` in the assets package;
  `iconFilePath` and `PROJECT_LIBRARY_FILE` in the project package and the warning
  `asset.unusable-name`; the canvas messages `checkIcons` and `addIcons` and their answers,
  `CanvasRender.project`, `AssetSteps`, `ProjectSessions.planAssetSteps`, `changedAssetFile`,
  `checkIconPrefix`, `checkIconFiles` and `addIcons` in the editor package. The language stays
  0.2.
