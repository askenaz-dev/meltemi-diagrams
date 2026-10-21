# visual-regression Specification

## Purpose
Pixel references of the acceptance corpus, drawn with pinned fonts, layout engine and browser, compared with a tolerance that absorbs anti-aliasing and catches moved labels and lines.
## Requirements
### Requirement: Pixel references with pinned resources
`pnpm acceptance:visual` SHALL draw every valid acceptance sheet as PNG at scale 1 in the installed
Edge or Chrome with the bundled fonts, and compare it with its reference in
`corpus/acceptance/visual/`. A pixel SHALL differ when a channel differs by more than 16 of 255. A
drawing SHALL pass with at most 0.1 % differing pixels and no differing run longer than 2 pixels.
Failures SHALL write the drawn PNG and a diff image beside the test output. `manifest.json` SHALL
record the browser and version of the references; a run with another version SHALL name both.
`--update` SHALL record new references and the manifest.

#### Scenario: Unchanged drawing
- **WHEN** nothing in the layout or the renderer changed
- **THEN** every drawing passes

#### Scenario: A moved label
- **WHEN** a change moves a label by 10 pixels
- **THEN** that drawing fails and its diff image shows the label at both places

