# project-plugins Specification

## Purpose
Plugins installed explicitly by projects: data packages of diagram types and icon packs, with pinned versions, granted permissions, declared compatibility and provenance in the lock.
## Requirements
### Requirement: Plugins are data installed explicitly
A plugin SHALL be a folder with `meltemi-plugin.json` (name, version, description, licence,
homepage, compatibility, permissions, diagram types, icons, libraries). Projects SHALL install plugins in
project.json `plugins` with the folder (inside the project), the exact version and the permissions
granted (`diagram-types`, `icons`); nothing else is loaded. Fields that would name code SHALL be
ignored with `plugin.code-ignored`; no plugin code SHALL ever run.

#### Scenario: Code ignored
- **WHEN** a manifest has `"main": "index.js"`
- **THEN** a warning says it is ignored and the declared types still load

#### Scenario: A plugin library
- **WHEN** a plugin granted `icons` declares `"libraries": ["shapes.json"]` whose items name icons of its pack
- **THEN** the library is listed with the project's libraries under the plugin's name, and an item naming an unknown icon is `plugin.invalid-manifest` on the library file

### Requirement: Versions, compatibility and permissions
The manifest's name and version SHALL match project.json (`plugin.name-mismatch`,
`plugin.version-mismatch`); its `compatibility` SHALL accept the model API 1.0.0 and the renderer
API 1.0.0 (`plugin.incompatible`); a plugin SHALL contribute only what it asks for and is granted
(`plugin.permission-denied`; `network` is never granted); duplicate types SHALL be
`plugin.duplicate-type`; a missing manifest `plugin.not-found`; a wrong one `plugin.invalid-manifest`.

#### Scenario: Not granted
- **WHEN** project.json grants `icons` only to a plugin that declares diagram types
- **THEN** the types are not loaded and a warning names the permission

### Requirement: Provenance and listing
`assets.lock.json` SHALL record each plugin's version, folder and manifest integrity, and
validation SHALL report a changed plugin as `asset.lock-mismatch`. `meltemi-diagrams plugins [path]`
SHALL list each plugin's version, licence, origin, granted permissions, diagram types and icon pack,
and its problems (`--json` for one object; exit 1 on errors).

#### Scenario: Listing
- **WHEN** `mdg plugins corpus/projects/valid/plugins` runs
- **THEN** it prints `erd 1.0.0 (MIT)` and the types `erd` and `org`

