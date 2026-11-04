## Context

The product name lives in a few places by design (`brand/README.md`: "changing it is changing one string and regenerating the lockups"):

- In code, the name appears once: `BRAND_NAME` in `packages/layout/src/theme.ts`, which feeds the `brand` token of `meltemi.light` and `meltemi.dark`.
- The visible results are the footer of default exports, five brand SVGs whose file names carry the old name, the agent skill folder `skills/meltemi-charts` (copied to `.claude/` and `.codex/`), and prose in the README, `AGENTS.md`, docs and examples.
- The repository is still not under Git, so renames are plain file moves.

## Goals / Non-Goals

**Goals:**
- One product name, `Meltemi Diagrams`, in exports, assets, skill, docs and the upcoming extension.
- Regenerated snapshots reviewed like any other output change.
- No trace of the previous name outside the record of the naming decision.

**Non-Goals:**
- Command, package-scope or file-extension changes, and trademark work.

## Decisions

### D1. Change the brand token, not the frame layout

`BRAND_NAME` becomes `"Meltemi Diagrams"`. The frame keeps its geometry rules: `frameMinWidth` already accounts for the brand text width, so wider sheets are unchanged except for the text, and sheets narrower than the new minimum grow by the extra characters.

Alternative: shorten the footer to `Meltemi`. Rejected because the frame identifies the product, and the family has other products.

### D2. Rename the skill folder and sync with a manifest

The skill's `name` must match its folder for Claude Code and Codex to load it. The folder becomes `skills/meltemi-diagrams`.

The agent folders also hold skills this repository does not manage (the OpenSpec skills `openspec-*`), so "delete what is not in `skills/`" would destroy them. Instead, `scripts/sync-skills.mjs` keeps a manifest, `.skills-sync.json`, in each agent folder. It lists the skills the script copied. On each run the script deletes the folders it managed before that no longer exist in `skills/`, and never touches other folders, so a renamed skill cannot linger and be loaded twice while the OpenSpec skills survive.

Alternative: keep the folder name and change only the title. Rejected because agents would show "meltemi-charts" to users, and the skill test checks name and folder.

### D3. Re-vectorise the pill text; keep the rest of the lockup

The lockups keep the Meltemi mark and wordmark untouched and replace the `CHARTS` pill with a `DIAGRAMS` pill, widened to fit eight characters, in the same Aegean and Cyan variants. The text is outlined from Cascadia Mono as before, so the asset has no live text. The board updates its live text.

Alternative: live `<text>` in the lockup. Rejected because the brand guide forbids live text in lockups (fonts are not embedded).

### D4. Record the decision in a new note

`docs/decisions/0009-product-name.md` records:

- the chosen name and the date;
- the rejected options (Charts, Draft, Rumbo, Flow) with the owner's choice;
- what stays provisional: `studio` and `@dac/*`;
- the owner's trademark check before publication.

Notes 0002, 0007 and 0008 are updated to use the product name; 0009 is the only record of the earlier options.

## Risks / Trade-offs

- [A stale skill copy is loaded next to the new one] → The sync script deletes managed folders that are gone from `skills/`, and the skills test fails when a manifest differs from the folders in `skills/`.
- [The sync script deletes skills it does not own] → It deletes only names from its own manifest. A test keeps a foreign folder in a temporary agent directory and checks that it survives.
- [Snapshot churn hides a real regression] → Regenerate in a dedicated task and check that every changed SVG differs only in the footer text and footer width.
