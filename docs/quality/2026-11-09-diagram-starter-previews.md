# Illustrated diagram choices — 9 November 2026

Local verification on Windows, Node 24.15.0 and pnpm 10.33.2, branch
`codex/starter-previews` based on `ccb070df86aee9bdf82359d08eeab0b391feff49`.

## Change

The browser's New diagram form shows seven distinct colored vector examples, retaining native
radio choices, accessible names and descriptions. A localized hint identifies them as examples
of what can be created. Only this form uses the existing wide dialog; its responsive gallery
fits three columns on desktop and one at 320 pixels. Header and footer remain available while
the body scrolls. Selection and keyboard focus retain the product's blue treatment.

The examples are static local SVG, without image requests, renderer initialization, text inside
the drawings, external assets or dependencies. They are decorative for assistive technology.
The creation identities, source templates, validation and cancellation behavior are unchanged.
See [decision 0076](../decisions/0076-diagram-starter-previews.md).

## Verification

- Strict OpenSpec proposal validation: passed before implementation.
- Canonical specification: synchronized and valid, retaining only its existing requirement-length
  warnings. The original canonical text remains unchanged before the added requirement.
- Build, typecheck and lint: passed.
- Unit suite: 394 files passed; 11,488 tests passed and one existing skip.
- Full playground browser suite: 149 passed, including all nine catalogue cases.
- Focused catalogue browser suite: nine passed. It exercises all seven types from flow/C4
  projects, every initial template, cancellation without changing files, invalid names and
  permissions, seven distinct visible colored illustrations, preview-area clicks and native
  keyboard selection with visible focus.
- Visual review: all six captures inspected. Desktop English light/dark and Spanish light/dark;
  English light and Spanish dark at 320 pixels. Shapes, colors, labels, selected/focused states,
  viewport bounds and accessible footer actions are covered by the browser assertions and review.

The build preceded the full browser run; the runner reads the final built site directly so a
concurrent build cannot replace its scripts. No editor/canvas, renderer, language, export or
VS Code implementation changed, so their separate browser and extension suites were not repeated.

## Evidence

Logs and six screenshots are under `C:/meltemi/artifacts/starter-previews-20261109/`.
The primary comparison is `diagram-catalogue-es-dark-wide.png`; narrow captures show the
scrolled gallery with Cancel/Create still visible. The test uses generic local template data.
No private cloud project, credentials, account settings, dependency lockfile or project
configuration was changed. This feature remains local; no commit, push or deployment was made.
