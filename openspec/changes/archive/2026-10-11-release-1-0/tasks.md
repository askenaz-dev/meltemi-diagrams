## 1. Version and manifests

- [x] 1.1 `scripts/release-version.mjs` and `pnpm release:version`; every version to 1.0.0; corpus project manifests and tests that pinned 0.3.0; the versions test
- [x] 1.2 `publishConfig`, `repository`, `homepage`, `bugs` and `engines` in every public manifest; a README per package; the manifest test
- [x] 1.3 Remove leftover test scripts (`packages/vscode/.test-output/shot.mjs`) and stale build output

## 2. Release check and process

- [x] 2.1 `packages/acceptance/src/release-check.ts` and `pnpm release:check`: clean build, pack, tarball checks, offline install, the installed CLI's journey, the extension package, `release/manifest.json`
- [x] 2.2 `RELEASING.md`, `CHANGELOG.md`, `release/` in the ignore lists; decision 0033 (release and versioning)

## 3. Language policy and conformance

- [x] 3.1 `docs/language/policy.md`, linked from the grammar and the contribution guide
- [x] 3.2 `packages/acceptance/src/conformance.ts` and `pnpm conformance` with `--command` and `--diagnostics`; test in-process and with a stub implementation; `docs/language/conformance.md`

## 4. Gallery, example and template

- [x] 4.1 Purchase template composition: container view top to bottom, executive slide balanced; snapshots and visual references reviewed
- [x] 4.2 Gallery sheets for the four profiles; `packages/acceptance/src/gallery.ts` and `pnpm gallery`; `gallery/README.md`
- [x] 4.3 `examples/purchase/` with exports and README; the gallery and example test

## 5. Documentation

- [x] 5.1 `docs/README.md`, `docs/getting-started.md`, `docs/features.md`; README rewritten; `corpus/README.md` updated
- [x] 5.2 Tracks from Mermaid, PlantUML and visual editors; the test against the coverage tables
- [x] 5.3 `docs/compatibility.md` with known limitations
- [x] 5.4 The link and anchor test over every Markdown file

## 6. Demo, pilot and launch

- [x] 6.1 `packages/acceptance/src/demo.ts` and `pnpm demo`; `docs/media/editing-demo.mp4` and `.gif`
- [x] 6.2 `docs/pilot/` protocol and templates; `scripts/pilot-summary.mjs` and `pnpm pilot:summary` with tests
- [x] 6.3 `docs/launch/announcement.md` and `checklist.md`; `GOVERNANCE.md`; `SECURITY.md`

## 7. Verification

- [x] 7.1 Typecheck, lint, unit tests, every browser suite, VS Code tests, `pnpm acceptance`, `pnpm conformance`, `pnpm release:check`; roadmap, README status and memory
