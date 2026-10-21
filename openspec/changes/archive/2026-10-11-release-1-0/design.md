## Context

The product is complete and verified (`pnpm acceptance` passes every criterion on the reference
machine), but it has only ever run from this repository. The packages are versioned 0.3.0, their
`exports` name a development condition that points at `src/`, which the tarballs do not contain,
they have no README, and nothing has installed them from their tarballs. The proposal's last
section asks for a public repository with licence, installation, examples and reproducible tests;
a gallery of the four diagram types with sources and downloadable exports; a demonstration of
editing between code and canvas including route and label changes; a short video from a story and
a browsable catalog; an explicit compatibility and import table with known limitations; separate
documentation tracks for people coming from Mermaid, PlantUML or a visual editor; a pilot with
five to eight users and a ten-case comparison; and, under maintenance, a contribution guide,
examples, a language change policy, conformance tests and a release process.

## Goals / Non-Goals

**Goals:**

- Every artefact a release publishes is built, packed, installed and run by one command before
  anyone publishes it.
- A person coming from Mermaid, PlantUML or a visual editor finds a path written for them, and the
  limits of the product are stated, not discovered.
- The language's promises are written down and checkable by another implementation.
- The launch material is generated from the product, so it stays true.

**Non-Goals:**

- Publishing to npm, the VS Code Marketplace or Open VSX, hosting the playground, the trademark
  review and running the pilot: owner actions, prepared and documented here.
- A new language version: the language stays `"0.2"`, as the proposal defines it.

## Decisions

### One version, one place to change it

All packages, the extension and the private packages share the product version. `pnpm
release:version 1.0.0` rewrites every `package.json` version and `CLI_VERSION` (which the bundles
inline, so it stays a constant), and a test asserts that every version, `CLI_VERSION` and the
extension version are equal. Templates pin `^<CLI_VERSION>` already. The language version
(`"0.2"`), `MODEL_API_VERSION` and `RENDERER_API_VERSION` (1.0.0, decision 0030) are separate
contracts with their own rules in the language policy; the product version does not move them.

Corpus project manifests and tests that pinned 0.3.0 move to 1.0.0; tests that only need some tool
version read `CLI_VERSION`.

### Publishable manifests

Each public package gets:

- `publishConfig`: `access: "public"` and an `exports` map equal to `exports` without the
  `@meltemi/diagrams-source` condition (pnpm replaces the field when packing), so a published
  package never names a file it does not ship;
- `repository` with the package's `directory`, the same repository the extension already names,
  `homepage` and `bugs`, and `engines.node` `>=22.12.0` like the workspace;
- a README: what the package is, how to install it, a minimal use, and where the documentation is.

pnpm already copies the root `LICENSE` into every tarball and replaces `workspace:*` with the
version. A test checks every public manifest for these fields and that `publishConfig.exports` is
`exports` without the source condition.

### The release check

`pnpm release:check` (`packages/acceptance/src/release-check.ts`):

1. removes every package's `dist/` and runs `pnpm -r build`;
2. packs each public package into `release/` with `pnpm pack`;
3. checks each tarball: the version, no `workspace:` ranges, no `src/` or tests, a README and the
   licence, every path named by `exports`, `bin` and `types` present, and the size;
4. installs the CLI from the tarballs into an empty folder with `pnpm install --offline`, mapping
   every `@meltemi/diagrams-*` name to its tarball with `pnpm.overrides`, so nothing comes from a
   registry that is not yet published and third-party packages come from the local store;
5. runs the installed `meltemi-diagrams` and `mdg` through `--version`, `init --template purchase`,
   `validate`, `export` to SVG, PNG, PDF and MP4 (when FFmpeg is installed), `build catalog` and
   `import` of a Mermaid file, and checks each output;
6. packages the extension with `pnpm vscode:package`;
7. writes `release/manifest.json` (names, versions, sizes, SHA-256 of each file) and prints the
   publish commands of `RELEASING.md`.

`RELEASING.md` gives the release process: changelog, `release:version`, `pnpm acceptance`,
`release:check`, then `pnpm publish -r --access public` (pnpm publishes in dependency order),
`vsce publish` and `ovsx publish` with the `.vsix`, and the tag. `CHANGELOG.md` starts with 1.0.0.

### Language policy and conformance

`docs/language/policy.md`:

- A file declares its language version (`language "0.2"`). Within a version, changes only add:
  new statements, properties, values or diagnostics that make no valid file invalid and change no
  valid file's meaning. A change that would do either needs a new language version.
- Deprecations are warnings with a stable code and a quick fix for at least one minor product
  release before a new language version removes anything.
- A new language version ships with an explicit `meltemi-diagrams migrate` that writes the new
  file next to the original, never in place, and reports what it changed; tools keep reading the
  previous version for at least one major product version.
- The model JSON (`MODEL_API_VERSION`) and the renderer API (`RENDERER_API_VERSION`) follow
  semantic versioning; plugins declare the ranges they support (decision 0030).
- Every language change is an OpenSpec change with a decision note, a grammar update and new
  conformance cases.

The conformance suite is the corpus that defines the language's meaning:

| Case                                         | Expected                                        |
| -------------------------------------------- | ----------------------------------------------- |
| `corpus/valid/**/*.meltemi`                  | the model JSON in `<name>.model.json`           |
| `corpus/invalid/*.meltemi`                   | the language codes of `<name>.diagnostics.json` |
| `corpus/projects/valid/*`                    | no error                                        |
| `corpus/projects/invalid/*`                  | the diagnostic codes in `expected.json`         |

`pnpm conformance` (`packages/acceptance/src/conformance.ts`) runs every case through this
implementation in-process by default. `--command "<command with {file}>"` runs another
implementation instead: for a file it must print the model JSON (as `convert --to json --stdout`
does) or, with `--diagnostics "<command>"`, the diagnostics as `validate --json` prints them. Model
JSON is compared as parsed JSON, diagnostics by code. The report lists each failing case with the
first differing path. A test runs the suite in-process; `docs/language/conformance.md` documents
the levels and the commands.

### Documentation

- `docs/README.md` is the index: getting started, the three tracks, the language reference, the
  editor, the CLI, exports, the playground, quality, compatibility, contributing and decisions.
- `docs/getting-started.md`: install (npm, the extension, the playground), first project from a
  template, validate, export, open the canvas, change a label on the canvas and see the code.
- `docs/tracks/from-mermaid.md`, `from-plantuml.md`, `from-visual-editors.md`: what is the same,
  what is different (ids, models and views, placement written in the file, stories), a side by
  side table of constructs, importing existing files and reading the import report, and the first
  three things to try. The constructs in the tables are checked by a test against the import
  coverage tables, so a track never promises what the importer drops.
- `docs/compatibility.md`: supported Node versions and operating systems, browsers for captures
  and the playground, VS Code and its forks (engine `^1.95.0`), FFmpeg, slide applications (from
  the office applications' table), the import coverage summary, and the known limitations (the
  proposal's exclusions, Google Slides' formats, transparent video only through the CLI, the
  playground's PDF through printing, and so on).
- The README becomes the front door: what it is, the demo GIF, install, a first diagram, the
  gallery, documentation links, status and licence; the long feature list moves into
  `docs/features.md`.
- A test (`packages/acceptance/test/docs.test.ts`) resolves every relative link and heading anchor
  of every Markdown file outside `node_modules`, `openspec/changes/archive` and test output.

### Gallery and reference example

`gallery/<profile>/` holds one sheet per profile, chosen to show what each profile is for:
a delivery pipeline (flow, assisted layout with icons and an effect), a sign-in sequence with
scenarios (sequence), the container view of a ride-sharing platform with its model (C4), and a
roadmap slide (free). Each has its `.svg`, `.png` (scale 2) and `.pdf` beside it, and
`gallery/README.md` shows them with links to the files.

`examples/purchase/` is the purchase template as a project with `exports/`: every view as SVG, the
executive slide as PNG and PDF, the story as MP4 (1080p) and GIF, the HTML player and the catalog.
Its sources are the template's files; a test checks they are equal.

`pnpm gallery` (`packages/acceptance/src/gallery.ts`) writes both. A test checks that every source
validates with no diagnostic, that each committed SVG equals a fresh export, and that the PNG,
PDF, video and HTML files exist with the expected sizes (PNG dimensions, PDF page, video duration
through FFmpeg when present). Binary files are regenerated deliberately, not compared byte for byte.

The purchase template's container view is laid out top to bottom, so it fits a page; the
executive slide's shop group fits its boxes and the subtitle sits under the title with balanced
space.

### Editing demo

`pnpm demo` (`packages/acceptance/src/demo.ts`) builds on the playground's test harness: it serves
`packages/playground/dist`, opens it in the installed Edge or Chrome at 1280 × 720 and plays a
script: open the flow template, type a new element and relation in the code, drag the new box on
the canvas, change a connector's route by dragging its bend, rename a label in the inspector,
undo and redo, and export SVG. Each step shows a caption bar drawn by the script in the page. The
script takes a screenshot every 100 ms of page time while it moves the mouse in small steps, and
FFmpeg encodes the frames into `docs/media/editing-demo.mp4` (H.264, 10 fps) and
`docs/media/editing-demo.gif` (960 px wide, palette from the frames). The README shows the GIF.

### Pilot and launch

`docs/pilot/protocol.md` follows the proposal: five to eight participants with repeated
documentation or presentation needs; each brings a diagram of their own and later changes it;
the sessions time creation, adjustment, export and update, and count errors and help; ten cases
are drawn with Meltemi Diagrams and the reference tools with equivalent content and comparable
editing effort, and legibility, visual preference and maintainability are rated separately by
people who did not draw them; the usage goal is a second delivery with the product. It states
that the sample gives qualitative signals, not proof of demand, and how data is kept (no names in
files, consent, deletion on request).

`docs/pilot/templates/` holds `participants.csv`, `sessions.csv` (participant, task, phase,
start and end times, errors, help), `comparison.csv` (case, tool, rater, legibility, preference,
maintainability on 1 to 5) and `followup.csv` (second delivery: yes/no, when). `pnpm pilot:summary
<folder>` (`scripts/pilot-summary.mjs`) reads the filled files and writes a Markdown summary:
medians and ranges per phase, errors and help per task, mean ratings per tool and criterion, and
the return rate. It checks the columns and reports rows it cannot read.

`docs/launch/announcement.md` and `docs/launch/checklist.md` (owner actions: trademark review,
accounts, publishing, hosting the playground, filling the office applications' table, running the
pilot). `GOVERNANCE.md`: maintainers decide through OpenSpec changes and decision notes;
contributions are accepted under the MIT licence with a Developer Certificate of Origin sign-off,
no copyright assignment; users' diagrams, assets and projects remain theirs and the project never
collects them. `SECURITY.md`: supported versions and private reporting through the repository's
security advisories, with the safety model of `docs/security.md`.

## Risks / Trade-offs

- [The repository URL is not yet created] → the URL already used by the extension is used
  everywhere and listed in the launch checklist to confirm before publishing.
- [The demo depends on the playground's layout] → it uses roles and labels, like the playground's
  tests, and fails loudly when a step cannot run.
- [Committed binary exports drift from the code] → the gallery test compares SVGs exactly and
  checks binaries' facts; `pnpm gallery` refreshes everything in one step.
- [An offline install depends on the local pnpm store] → the check says which package is missing
  from the store and how to fetch it once with network.

## Migration Plan

None: nothing is published yet.

## Open Questions

None.
