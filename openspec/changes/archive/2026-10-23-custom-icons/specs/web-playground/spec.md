## ADDED Requirements

### Requirement: Asset problems are shown
The playground SHALL count and list the diagnostics of `Workspace.assets()` with the problems of the project: each on the asset file or folder it concerns (`assets/licenses.json`, a pack file or folder, a font file), in the explorer's badge of the file when it is shown and of its folders (a folder counting its own problems with its children's), with the existing offer to show hidden files that have problems, and in the problems list of an asset file when it is open, with its code and hint. The counts SHALL refresh when anything under `assets/` changes, including files added by the Add icon dialog, dropped into the explorer or imported from an archive.

#### Scenario: Missing licence shown
- **WHEN** a project with `assets/icons/brand/logo.svg` and no `brand` entry in `assets/licenses.json` is opened
- **THEN** the explorer's `brand` and `assets` folders carry the count of `asset.missing-license`, whose hint shows the entry to add

#### Scenario: Unsafe icon dropped into the explorer
- **WHEN** `bad.svg` holding a `<script>` is dropped into `assets/icons/brand/`
- **THEN** within the next analysis the file's row and its folders count `asset.unsafe-svg`, and the other icons of `brand` keep working

#### Scenario: Problem resolved
- **WHEN** the missing `brand` entry is added to `assets/licenses.json`
- **THEN** the diagnostic disappears from the list and the badge
