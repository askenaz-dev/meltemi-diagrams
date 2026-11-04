## MODIFIED Requirements

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
