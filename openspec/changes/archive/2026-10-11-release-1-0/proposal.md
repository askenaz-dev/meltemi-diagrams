## Why

Changes 1 to 23 built and verified every capability of the proposal, but the product is not yet
something people outside this repository can install, learn and trust: the packages are at 0.3.0
and carry development-only fields, nothing checks that a published package works on its own, the
documentation is a list of features rather than a way in for people coming from Mermaid, PlantUML
or a visual editor, and the proposal's maintenance and launch material (language change policy,
conformance tests, release process, gallery, editing demo, pilot protocol, compatibility table)
does not exist. This change makes 1.0 releasable and is the last change of the roadmap.

## What Changes

- **Version 1.0.0.** Every package, the CLI's version, the VS Code extension and the templates'
  pinned tool version move to 1.0.0 together through `pnpm release:version <version>`; the
  language stays `"0.2"`, the version the proposal defines, and the model and renderer APIs stay at
  1.0.0. A test keeps every version equal.
- **Packages ready to publish.** Public packages get `publishConfig` (public access, exports
  without the source condition), a README, the licence and the repository; the CLI's dependencies
  resolve from the published names. `pnpm release:check` builds from clean, packs every package,
  checks each tarball's contents, installs the tarballs into an empty folder without network and
  runs the main journey with the installed CLI (`init`, `validate`, export SVG, PNG, PDF and MP4,
  `build catalog`, `import`), then packages the VS Code extension. `RELEASING.md` gives the order
  and the commands to publish to npm, the VS Code Marketplace and Open VSX, which only the owner
  runs; `CHANGELOG.md` records 1.0.0.
- **Language change policy and conformance tests.** `docs/language/policy.md` says what a language
  version promises, what changes need a new version, how deprecations are reported, and that format
  migrations are explicit commands that keep the original. `pnpm conformance` runs the conformance
  suite (valid files to model JSON, invalid files to their diagnostic codes, projects to their
  diagnostics) against this implementation or any command given with `--command`, so that another
  implementation can be checked; `docs/language/conformance.md` describes it.
- **Documentation for 1.0.** A documentation index and a getting-started guide; three tracks for
  people coming from Mermaid, from PlantUML and from visual editors such as draw.io; an explicit
  compatibility table (Node, operating systems, browsers, VS Code and its forks, FFmpeg, slide
  applications, import coverage) with the known limitations; the README rewritten around
  installation, the gallery and the demo; `corpus/README.md` brought up to date. A test checks that
  every relative link in the documentation resolves.
- **Gallery and reference example.** `gallery/` holds the four profiles (flow, sequence, C4 and
  free), each with its source and downloadable SVG, PNG and PDF exports. `examples/purchase/` is the
  reference purchase project with every export: the views as SVG, the executive slide as PNG and
  PDF, a short MP4 and GIF of the story, the HTML player and the browsable catalog. `pnpm gallery`
  writes both; a test checks that every source compiles cleanly and that the committed SVGs equal
  a fresh export. The purchase template's composition is polished (a narrower container view, a
  balanced executive slide).
- **Editing demo.** `pnpm demo` drives the playground through an editing session (code typed,
  boxes dragged, a route and a label changed on the canvas, the code following each step) and
  records it with the system FFmpeg as `docs/media/editing-demo.mp4` and a GIF for the README.
- **Pilot and launch material.** `docs/pilot/` has the protocol for five to eight users (their own
  diagram and a later change, timed creation, adjustment, export and update, errors and help), the
  ten-case comparison with reference tools (legibility, visual preference and maintainability
  recorded separately), consent and privacy notes, and CSV measurement templates; `pnpm
  pilot:summary <folder>` summarises filled templates. `docs/launch/` has the announcement and the
  launch checklist. `GOVERNANCE.md` and `SECURITY.md` complete the repository.
- **Cleanup.** Leftover test scripts are removed and every version string comes from one place.

## Capabilities

### New Capabilities

- `release-packaging`: one version for every package, publishable manifests, the release check
  from clean build to an offline install that runs the CLI, the release process and changelog.
- `language-conformance`: the language change policy and the conformance suite runnable against
  any implementation.
- `documentation-tracks`: the documentation index, getting started, the three tracks, the
  compatibility table with known limitations, and the link check.
- `gallery-and-examples`: the gallery of the four profiles and the reference purchase example with
  every export, generated and checked against fresh exports.
- `editing-demo`: the recorded code and canvas editing demo.
- `pilot-and-launch`: the pilot protocol, measurement templates and their summary, the launch
  material, governance and security policy.

### Modified Capabilities

- `project-templates`: the purchase template's composition is balanced (container view and
  executive slide), and templates pin the released tool version.

## Impact

- Every `package.json` (version, `publishConfig`, `repository`), `packages/cli/src/cli.ts`
  (`CLI_VERSION`), the extension manifest, corpus project manifests and tests that name the version.
- New scripts in `scripts/` and `packages/acceptance/src/` (`release-version`, `release-check`,
  `conformance`, `gallery`, `demo`, `pilot-summary`) and their root `pnpm` scripts.
- New top-level folders `gallery/` and `examples/purchase/`, documents under `docs/`, root
  `RELEASING.md`, `CHANGELOG.md`, `GOVERNANCE.md`, `SECURITY.md`, and a README per package.
- No new dependencies: packing and installing use pnpm and its store, recording uses the system
  FFmpeg and the installed browser.
- Publishing itself, the trademark review and running the pilot remain owner actions.
