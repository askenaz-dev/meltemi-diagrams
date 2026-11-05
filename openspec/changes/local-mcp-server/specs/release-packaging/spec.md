## MODIFIED Requirements

### Requirement: Release check
`pnpm release:check` SHALL build every package from clean, pack every public package into
`release/`, check every tarball (version, ranges, README, licence, every exported, `bin` and
`types` path present, no sources or tests), install the CLI from the tarballs into an empty folder
(internal packages mapped to their tarballs, never the registry's; third-party packages from the
local store when it has them, else from the registry, so that a fresh machine, a CI runner
included, can run it), run the installed command through `--version`, `init --template purchase`, `validate`,
`export` to SVG, PNG, PDF and (with FFmpeg) MP4, `build catalog` and `import` of a Mermaid file,
start the installed `mcp --folder` on the purchase project over stdio and call `initialize`,
`tools/list` and a PNG `preview` through it, package the VS Code extension, and write
`release/manifest.json` with each file's name, version, size and SHA-256. It SHALL exit 1 naming
each failed step.

#### Scenario: Installed from tarballs
- **WHEN** `pnpm release:check` runs on the reference machine
- **THEN** the CLI installed from the tarballs validates and exports the purchase project, its local MCP server answers a PNG preview, and the manifest lists twenty npm tarballs, `@meltemi/diagrams-mcp` among them, and the `.vsix`

#### Scenario: The local server fails
- **WHEN** the installed `mcp --folder` answers `preview` with an error or no image
- **THEN** the release check exits 1 naming the step `mcp`
