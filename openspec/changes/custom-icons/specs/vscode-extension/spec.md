## ADDED Requirements

### Requirement: Asset diagnostics published
The extension SHALL publish the diagnostics of `Workspace.assets()` to its diagnostic collection on the asset file they concern (a pack file or folder, `assets/licenses.json`, a font file), with code, severity and hint, and SHALL republish them when the watcher on `assets/**` or on `.svg` files fires or `project.json` changes, clearing those of files that no longer have any.

#### Scenario: Missing licence in the Problems view
- **WHEN** a workspace project has `assets/icons/brand/logo.svg` and no `brand` licence entry
- **THEN** the Problems view shows `asset.missing-license` on `assets/icons/brand` within a second of opening a file of the project

#### Scenario: Unsafe icon
- **WHEN** `assets/icons/brand/bad.svg` holding a `<script>` is saved
- **THEN** the Problems view shows `asset.unsafe-svg` naming `script` on that file, and it disappears after the file is fixed
