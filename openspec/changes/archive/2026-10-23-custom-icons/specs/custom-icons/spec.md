## ADDED Requirements

### Requirement: Add icon from the editor
The icon picker and the Project group of the Libraries panel SHALL offer **Add icon…** on a canvas that edits a project. It SHALL open the system's file chooser for one or several `.svg` files, from the canvas's own page, and open a dialog over the canvas with: the pack's prefix (`project` by default, remembered while the canvas is open, matching `^[a-z0-9][a-z0-9-]*$`; a built-in pack's prefix such as `tabler` or `aws`, a plugin pack's, an Iconify file's of the project and an alias of `project.json` SHALL be refused inline, naming why); one name per file, slugified from the file name (extension dropped, diacritics folded, runs of other characters as `-`, a taken name offered as `<name>-2`), editable and refused inline when invalid or taken; the licence when the prefix has no entry in `assets/licenses.json` (**Own work** writing `LicenseRef-Project`, `CC-BY-4.0`, `CC0-1.0`, `MIT`, `Apache-2.0`, or **Other…** with an SPDX identifier or a `LicenseRef-` name); and a preview of each file drawn through the sanitiser. A file the sanitiser refuses, or larger than an icon may be, SHALL be shown with its reason and left out without keeping the others from being added; a file that is not SVG SHALL be left out saying pictures are added as images; a bad prefix, a name refused or a licence missing or malformed SHALL keep the dialog from confirming until it is fixed. Confirming SHALL write, in one undo step across files: `assets/icons/<prefix>/<name>.svg` per accepted file, the licence entry when the prefix is new, an entry per icon in `assets/libraries/project.json` (library `project`, one category per prefix, the label from the name), and `style <id> { icon "<prefix>:<name>" }` on every selected element that takes an icon. Afterwards the registry SHALL be rebuilt, the new references SHALL be among the picker's Recent icons, and, when nothing was selected, the first SHALL be chosen as a click on it in the picker chooses it once the drawing that knows it arrives (the icon tool armed with it, or the inspector's Icon field written with it); the status line SHALL name what was added. Read-only canvases and documents outside a project SHALL not offer Add icon…; a guest of a live session SHALL be offered it when the session lets guests edit.

#### Scenario: One icon on a selected node
- **WHEN** `api` is selected, Add icon… is chosen, `My Logo.svg` is picked and the dialog is confirmed with the prefix `project` and **Own work**
- **THEN** one undo step writes `assets/icons/project/My-Logo.svg`, `assets/licenses.json` with `"project": { "license": "LicenseRef-Project" }`, `assets/libraries/project.json` with the item `My Logo` of the category `project`, and `style api { icon "project:My-Logo" }`; the canvas draws the icon on `api`

#### Scenario: Several icons, nothing selected
- **WHEN** nothing is selected and `a.svg` and `b.svg` are added to the existing prefix `brand`
- **THEN** no licence select is shown, `assets/icons/brand/a.svg` and `b.svg` are written with two library items, and the icon tool is armed with `brand:a`, which a click on the stage places

#### Scenario: Unsafe file left out
- **WHEN** `ok.svg` and `bad.svg`, which holds a `<script>`, are picked together
- **THEN** the dialog shows `bad.svg` refused naming `script`, confirming writes `ok.svg` only, and no `assets/icons/<prefix>/bad.svg` exists

#### Scenario: Taken name
- **WHEN** `assets/icons/project/logo.svg` exists and `logo.svg` is picked again
- **THEN** the dialog offers `logo-2`, and typing `logo` is refused inline as taken

#### Scenario: Reserved prefix
- **WHEN** `tabler` is typed as the prefix
- **THEN** the dialog refuses it inline as a built-in pack and the confirm button stays disabled

#### Scenario: A raster is not an icon
- **WHEN** `photo.png` is picked
- **THEN** the dialog leaves it out saying pictures are added as images, and nothing is written for it

#### Scenario: Guest of a live session
- **WHEN** a guest of a live session that lets guests edit adds `pin.svg`
- **THEN** the files are written through the room and every participant's picker lists `project:pin`

### Requirement: Session request for added icons
While the dialog is open the canvas SHALL send `checkIcons { token, prefix, files: [{ file, name?, svg }] }` as the prefix and the names are typed, and the session SHALL answer `iconsChecked { token, prefix: { prefix, problem?, existing, licensed }, files: [{ file, name, problem?, svg }] }`: the name offered when none is typed, a 48 px preview through the sanitiser, and what keeps each from being added. Confirming SHALL send `addIcons { token, prefix, licence?, files: [{ file, name, svg }], targets }` and the session SHALL answer `iconsAdded { token, added: [{ file, reference, label, svg }], refused: [{ file, reason }] }`. The session SHALL validate the prefix, the licence and each name against the registry, sanitise each file and plan the writes as one request of steps over files: `assets` holding a new file for each `assets/icons/<prefix>/<name>.svg` and the changes of `assets/licenses.json` (the pack's licence, when it has none) and of `assets/libraries/project.json` (an item per icon), then `steps` holding `setStyleProperty icon` for each target that takes an icon. The host SHALL plan them with `ProjectSessions.planAssetSteps`, which refuses a new file whose path is taken and a JSON file it cannot read, SHALL apply them in one undo step and SHALL rebuild the registry. A request whose every file is refused SHALL plan nothing. A request on a document outside a project SHALL be refused with `edit.unsafe-target` saying icons need a project.

#### Scenario: Steps planned
- **WHEN** the session receives `addIcons` with the new prefix `project`, the licence `MIT`, one valid file `pin` and the target `api`
- **THEN** the result's `assets` hold the new file `assets/icons/project/pin.svg` and the changes of `assets/licenses.json` and `assets/libraries/project.json`, its `steps` hold `setStyleProperty { icon "project:pin" }` on `api`, and the answer lists `project:pin` as added

#### Scenario: Names offered as the dialog checks
- **WHEN** `assets/icons/project/logo.svg` exists and the canvas sends `checkIcons` for `My Logo (1).svg` and `logo.svg` without names
- **THEN** the answer offers `My-Logo-1` and `logo-2`, each with a preview, and the prefix as existing

#### Scenario: Existing path refused
- **WHEN** `addIcons` names `pin` while `assets/icons/project/pin.svg` exists
- **THEN** the file is listed as refused with the reason that the name is taken, and no step is planned for it

#### Scenario: A file written meanwhile
- **WHEN** `assets/icons/project/pin.svg` appears on disk between the session's answer and the host's planning
- **THEN** `planAssetSteps` refuses with `edit.id-conflict` and nothing is written

#### Scenario: Outside a project
- **WHEN** `addIcons` is sent for a single `.meltemi` file opened without a project
- **THEN** the answer refuses every file with `edit.unsafe-target` saying icons need a project
