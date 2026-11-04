## ADDED Requirements

### Requirement: Asset discovery
`Workspace.assets()` SHALL return the project's assets and their diagnostics:

- the project packs found under `assets/icons/`;
- the fonts found under `assets/fonts/` (`.woff2`, `.woff`, `.ttf`, `.otf`);
- the licences of `assets/licenses.json`;
- the lock `assets.lock.json`.

Asset diagnostics SHALL be grouped by the file they concern. The result SHALL be cached until a file under `assets/`, the lock or `project.json` changes or is invalidated. Hosts SHALL read fonts with `readBinary(path)`.

#### Scenario: Discovered assets
- **WHEN** a project has `assets/icons/brand.json`, `assets/icons/aws/lambda.svg`, `assets/fonts/Company-Regular.ttf` and licences for all three
- **THEN** `assets()` lists the packs `brand` and `aws` and one font of family `Company`, with no diagnostic

#### Scenario: Cache invalidation
- **WHEN** `assets/icons/aws/s3.svg` is added through an overlay after `assets()` was called
- **THEN** the next call lists `aws:s3`

### Requirement: Licence metadata
`assets/licenses.json` SHALL be an object with optional `icons` and `fonts` objects. Entries are keyed by pack prefix or font family and hold:

- `license`, required: an SPDX identifier or a `LicenseRef-` name;
- `title`, `version`, `url` and `author`, optional strings;
- `redistribute`, an optional boolean, true by default;
- `opticalScale`, packs only, a number from 0.5 to 1.5.

A pack or font whose licence is given neither by its own metadata nor by this file SHALL be `asset.missing-license` (error) on the pack file or folder, or on the font file. Invalid JSON or wrong types SHALL be `asset.invalid-file` (error). Unknown keys SHALL be `asset.invalid-file` (warning). An entry for a pack or font that does not exist SHALL be `asset.invalid-file` (warning).

#### Scenario: Missing licence
- **WHEN** `assets/icons/aws/` exists and `assets/licenses.json` has no `aws` entry
- **THEN** `asset.missing-license` is reported on the folder, with the hint showing the entry to add

#### Scenario: Licence override
- **WHEN** `assets/licenses.json` gives `brand` the licence `LicenseRef-Brand` and the Iconify file says `CC-BY-4.0`
- **THEN** the pack's licence is `LicenseRef-Brand`

#### Scenario: Wrong type
- **WHEN** an entry has `"redistribute": "no"`
- **THEN** `asset.invalid-file` is reported on `"no"`

### Requirement: Project fonts
Each font in `assets/fonts/` SHALL join the font library used to measure, embed and outline the project's diagrams, under the family, weight and style read from the font. A theme whose `font` stack names that family SHALL then be measured with it, without `layout.unmeasured-font`. A font whose `OS/2` `fsType` restricts embedding (bit `0x0002`) SHALL be used for measurement only, and SHALL be `asset.font-restricted` (warning) on the file. A file that is not a font SHALL be `asset.invalid-file`. A font over 16 MB SHALL be `asset.too-large`.

#### Scenario: Theme uses a project font
- **WHEN** a project font of family `Company Sans` exists with a licence, and a diagram's theme sets `font "Company Sans", sans-serif`
- **THEN** export measures labels with that font, reports no `layout.unmeasured-font`, and the `embedded` policy embeds the whole file in an `@font-face` rule without `unicode-range`

#### Scenario: Restricted font
- **WHEN** a project font's `fsType` is `0x0002`
- **THEN** `asset.font-restricted` is reported, and the `embedded` policy writes no `@font-face` rule for it

### Requirement: Asset lock
`meltemi-diagrams assets lock [path]` SHALL write `assets.lock.json` at the project root. It holds `lockVersion` 1 and, for every pack and font:

- the version and source;
- the licence;
- for project packs and fonts, `integrity` as `sha256-` and the base64 SHA-256 of the file, or of a folder's sorted `name\0content` pairs.

Built-in packs SHALL be recorded by version. When the lock exists, project compilation of the assets SHALL report `asset.lock-mismatch` (warning) on the lock file for every pack or font that was added, removed, or changed version or integrity. Without a lock, nothing SHALL be reported. The output SHALL be stable: keys sorted, two-space indentation, a final line break.

#### Scenario: Lock and drift
- **WHEN** `assets lock` runs on a project, then `assets/icons/aws/s3.svg` changes
- **THEN** `validate` reports `asset.lock-mismatch` naming `aws`, and running `assets lock` again clears it

#### Scenario: Stable output
- **WHEN** `assets lock` runs twice without changes
- **THEN** the two files are byte-identical

### Requirement: Assets command
`meltemi-diagrams assets` SHALL provide:

- `list [path]`, which prints every pack (prefix, version, source, licence, redistribution, icon count) and font (family, weight, style, file, licence), and the aliases;
- `icons <query> [--project <path>] [--limit <n>]`, which prints matching references one per line;
- `lock [path]`.

`[path]` defaults to the current folder. `validate` and `export` SHALL print asset diagnostics with the manifest diagnostics. An error SHALL make them exit with 1, and a warning SHALL do so with `--strict`. Unknown subcommands SHALL be usage errors (exit 2).

#### Scenario: List
- **WHEN** `meltemi-diagrams assets list corpus/projects/valid/assets` runs
- **THEN** stdout lists `tabler`, `brand` and `aws` with their licences, marks `aws` as not redistributable, and the exit code is 0

#### Scenario: Search
- **WHEN** `meltemi-diagrams assets icons "cloud upload" --limit 3` runs
- **THEN** stdout has at most three lines, each a `tabler:` reference whose name or tags contain both words

#### Scenario: Unknown subcommand
- **WHEN** `meltemi-diagrams assets publish` runs
- **THEN** stderr names the subcommands and the exit code is 2
