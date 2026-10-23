## ADDED Requirements

### Requirement: Add icon from the editor
The icon picker and the Project group of the Libraries panel SHALL offer **Add icon…** on a canvas that edits a project. It SHALL ask the host for one or several `.svg` files and open a dialog over the canvas with: the pack's prefix (`project` by default, remembered while the canvas is open, matching `^[a-z0-9][a-z0-9-]*$`; `tabler`, a plugin pack's prefix and an alias of `project.json` SHALL be refused inline, naming why); one name per file, slugified from the file name (extension dropped, diacritics folded, runs of other characters as `-`, a taken name offered as `<name>-2`), editable and refused inline when invalid or taken; the licence when the prefix has no entry in `assets/licenses.json` (**Own work** writing `LicenseRef-Project`, `CC-BY-4.0`, `CC0-1.0`, `MIT`, `Apache-2.0`, or **Other…** with an SPDX identifier or a `LicenseRef-` name); and a preview of each file drawn through the sanitiser. A file the sanitiser refuses SHALL be shown with its reason and left out; a file that is not SVG SHALL be refused saying rasters are images. Confirming SHALL write, in one undo step across files: `assets/icons/<prefix>/<name>.svg` per accepted file, the licence entry when the prefix is new, an entry per icon in `assets/libraries/project.json` (library `project`, one category per prefix, the label from the name), and `style <id> { icon "<prefix>:<name>" }` on every selected element that takes an icon. Afterwards the registry SHALL be rebuilt, the new references SHALL be among the picker's Recent icons and chosen when nothing was selected, and the status line SHALL name what was added. Read-only canvases and documents outside a project SHALL not offer Add icon…; a guest of a live session SHALL be offered it when the session lets guests edit.

#### Scenario: One icon on a selected node
- **WHEN** `api` is selected, Add icon… is chosen, `My Logo.svg` is picked and the dialog is confirmed with the prefix `project` and **Own work**
- **THEN** one undo step writes `assets/icons/project/My-Logo.svg`, `assets/licenses.json` with `"project": { "license": "LicenseRef-Project" }`, `assets/libraries/project.json` with the item `My Logo` of the category `project`, and `style api { icon "project:My-Logo" }`; the canvas draws the icon on `api`

#### Scenario: Several icons, nothing selected
- **WHEN** nothing is selected and `a.svg` and `b.svg` are added to the existing prefix `brand`
- **THEN** no licence select is shown, `assets/icons/brand/a.svg` and `b.svg` are written with two library items, and the picker shows `brand:a` chosen with the placement control

#### Scenario: Unsafe file left out
- **WHEN** `ok.svg` and `bad.svg`, which holds a `<script>`, are picked together
- **THEN** the dialog shows `bad.svg` refused naming `script`, confirming writes `ok.svg` only, and no `assets/icons/<prefix>/bad.svg` exists

#### Scenario: Taken name
- **WHEN** `assets/icons/project/logo.svg` exists and `logo.svg` is picked again
- **THEN** the dialog offers `logo-2`, and typing `logo` is refused inline as taken

#### Scenario: Reserved prefix
- **WHEN** `tabler` is typed as the prefix
- **THEN** the dialog refuses it inline and the confirm button stays disabled

#### Scenario: A raster is not an icon
- **WHEN** the host hands back `photo.png`
- **THEN** the dialog refuses it saying pictures are added as images, and nothing is written

#### Scenario: Guest of a live session
- **WHEN** a guest of a live session that lets guests edit adds `pin.svg`
- **THEN** the files are written through the room and every participant's picker lists `project:pin`

### Requirement: Session request for added icons
The canvas SHALL send `addIcons { token, prefix, licence?, files: [{ name, svg }], targets }` and the session SHALL answer `iconsAdded { token, added: [{ file, reference }], refused: [{ file, reason }] }`. The session SHALL validate the prefix and each name against the registry, sanitise each file and plan the writes as steps over files (`writeFile` for each `assets/icons/<prefix>/<name>.svg`, refused when the path exists; `setJsonField` for the licence entry when the prefix is new and for `assets/libraries/project.json`; `setStyleProperty icon` for each target) which the host SHALL apply in one undo step and after which the host SHALL rebuild the registry. A request whose every file is refused SHALL plan nothing. A request on a document outside a project SHALL be refused with `edit.unsafe-target` saying icons need a project.

#### Scenario: Steps planned
- **WHEN** the session receives `addIcons` with the new prefix `project`, the licence `MIT`, one valid file `pin` and the target `api`
- **THEN** the result holds, in order, a `writeFile` step for `assets/icons/project/pin.svg`, `setJsonField` steps for `assets/licenses.json` and `assets/libraries/project.json`, and `setStyleProperty { icon "project:pin" }` on `api`, and the answer lists `project:pin` as added

#### Scenario: Existing path refused
- **WHEN** `addIcons` names `pin` while `assets/icons/project/pin.svg` exists
- **THEN** the file is listed as refused with the reason that the name is taken, and no step is planned for it

#### Scenario: Outside a project
- **WHEN** `addIcons` is sent for a single `.meltemi` file opened without a project
- **THEN** the answer refuses every file with `edit.unsafe-target` saying icons need a project
