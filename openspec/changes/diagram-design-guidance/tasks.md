# Tasks

## 1. Contrast of the texts of a scene

- [x] 1.1 Add `parseColour` and `contrastRatio` to `packages/layout/src/contrast.ts` with unit tests: hexadecimal of three, six and eight digits, `rgb()`, a colour it does not read, and the ratios `#FFFFFF` on `#dae8fc` = 1.24, on `#F59E0B` = 2.15 and `#3B82F6` on `#1b1f24` = 4.5027.
- [x] 1.2 Add `auditContrast(scene, options)`: the fill behind each text from paint order, the unchecked cases (opacity, gradient, pattern, image, unread colour), the least ratio by size and weight, and one problem for each pair of colours with its count; test each case with a scene built by hand.
- [x] 1.3 Report its problems from `layoutDiagram` as `layout.low-contrast` with the message and the hint in English and Spanish; test the scenarios of `specs/text-contrast` through `pnpm mdg validate` on sheets of the flow, sequence, free, C4 and gantt profiles, and with `--lang es`.
- [x] 1.4 Add the zero-target test: the gallery's sheet of each profile with each of the eight built-in themes, the corpus of valid sheets, the templates and the examples give no `layout.low-contrast`; fix any drawing or token that does and record each fix in the decision note.
- [x] 1.5 Document the code in `docs/language/diagnostics.md`, `docs/language/layout.md` and their Spanish pairs, and in the skill's `reference/language.md`; run `pnpm skills:sync`; the documentation and skills tests pass.

## 2. The image role of an exported SVG

- [x] 2.1 Add `role` to `RenderOptions` and write `role="img"` in `renderSvg` for a titled scene without links; test the four scenarios of `specs/flow-svg-export` and that two renders of one scene are equal.
- [x] 2.2 Read each caller of `renderSvg` (`packages/editor` exports, render and review; `packages/player` frames; `packages/canvas` story view) and pass `role: "none"` where the host makes parts of the drawing selectable; a test of the player's frame finds no `role`.
- [x] 2.3 Write the stored SVG snapshots, the gallery and the examples again (`pnpm gallery`) and check that each diff is the one attribute; the gallery, examples and visual tests pass with the PNG references unchanged.
- [x] 2.4 Say in `docs/language/svg-export.md` and its Spanish pair (the export guide; `docs/cli.md` has no export section) that a titled SVG is named by its title for assistive technology; the documentation tests pass.

## 3. Skill: choosing the profile

- [x] 3.1 Add to the workflow of `SKILL.md` the table from what the person shows to profile, reference and example, the sentences on when not to draw, and the plan said in one line; keep the "Before you start" paragraph within the first 40 lines.
- [x] 3.2 Extend `packages/render/test/skills.test.ts`: every profile of `DIAGRAM_TYPES` is the profile of a row whose paths exist, and the test fails naming a profile without a row (checked by removing a row locally).

## 4. Skill: the design reference

- [x] 4.1 Write `skills/meltemi-diagrams/reference/design.md` with its seven sections, each rule naming the statement that applies it (`style`, `class`, `tag`, `group`, `link`, C4 views), with the amounts of design.md and fenced examples of a focal element, a legend and a grouped sheet; list it under Reference in `SKILL.md`.
- [x] 4.2 Extend the skills test: the seven headings in order, the link from `SKILL.md`, and every fenced `.meltemi` example of the file compiled without diagnostics; run `pnpm skills:sync` and check that the local plugin payload holds `reference/design.md`.

## 5. Skill: looking at the drawing

- [x] 5.1 Rewrite the review step of `SKILL.md`: a PNG at scale 1 exported to a temporary folder or `preview` through MCP, the six defects, naming what was found and fixed or why each does not apply, structure before coordinates, two rounds, and "validated, not looked at" when there is nothing to look with; keep the sentence on the preview server that the size requirement holds.
- [x] 5.2 Say the same in `reference/mcp.md` for the tools' workflow; extend the skills test with the six defects and the two phrases, and check on this machine that the step's export command writes the PNG outside the project.

## 6. Skill: a theme from a brand

- [x] 6.1 Add the section to `reference/themes.md`: the sources, the table from the brand's values to tokens, the base by the background's lightness, the table of nearest bundled families, where the block goes, the fix for `layout.low-contrast` and the report; no change to `project.json` unless asked.
- [x] 6.2 Extend the skills test: the section's heading, each token of the table is a token of the language, each family named is bundled, and the section's example theme compiles without diagnostics.

## 7. Guides and record

- [x] 7.1 Describe in `docs/agents.md` and `docs/es/agents.md` what the skill now teaches (choosing, the design reference, the look, the brand theme) with one request of each kind in the table of requests; the localized documentation test passes.
- [x] 7.2 Add the changelog entry and write `docs/decisions/0079-diagram-design-guidance.md` with the decisions of design.md and the fixes of task 1.4; the decisions index test passes.

## 8. Trial with an agent

- [x] 8.1 With the skill installed in an empty folder, give an agent three requests: the declined payment as messages over time, a platform of thirty-four components, and a sheet in the colours of `https://meltemi.dev`; record in `docs/quality/2026-11-diagram-design-guidance.md` the plan line, the profile chosen, the pictures, the defects named and the theme's report of each.
- [x] 8.2 Compare each picture with its report; where the skill's text led the agent wrong, change the text and repeat that request, recording both runs.

## 9. Integration

- [x] 9.1 Run `pnpm typecheck`, `pnpm lint` and `pnpm test`, then `pnpm vscode:test-webview`, `pnpm player:test-browser` and `pnpm playground:test-browser`, since diagnostics and frames reach the canvas and the player; record the results.
- [x] 9.2 Run `openspec validate diagram-design-guidance --strict` and read the final diff for changes of pictures beyond the one attribute and for diagnostics other than the new code.

## Workflow follow-up

- Archive the change with `/opsx:archive` after the pull request is merged and its release is verified.
