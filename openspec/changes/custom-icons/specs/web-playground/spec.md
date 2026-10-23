## ADDED Requirements

### Requirement: Asset problems are shown
The playground SHALL count and list the diagnostics of `Workspace.assets()` with the problems of the project: each on the asset file it concerns (`assets/licenses.json`, a pack file or folder, a font file), in the problems list with its code and hint, in the explorer's badge of the file when it is shown and of its folder when Show all files hides it, with the existing offer to show hidden files that have problems. The counts SHALL refresh when anything under `assets/` changes, including files added by the Add icon dialog, dropped into the explorer or imported from an archive.

#### Scenario: Missing licence shown
- **WHEN** a project with `assets/icons/brand/logo.svg` and no `brand` entry in `assets/licenses.json` is opened
- **THEN** the problems list names `asset.missing-license` on `assets/icons/brand` with the hint showing the entry to add, and the explorer's `assets` folder carries the count

#### Scenario: Unsafe icon dropped into the explorer
- **WHEN** `bad.svg` holding a `<script>` is dropped into `assets/icons/brand/`
- **THEN** within the next analysis the file shows `asset.unsafe-svg` naming `script` in the problems list, and the other icons of `brand` keep working

#### Scenario: Problem resolved
- **WHEN** the missing `brand` entry is added to `assets/licenses.json`
- **THEN** the diagnostic disappears from the list and the badge
