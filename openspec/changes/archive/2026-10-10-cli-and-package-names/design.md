## Context

Decision 0002 kept the `studio` command and the `@dac/*` scope provisional. The owner chose `meltemi-diagrams` with the alias `mdg`, and `@meltemi/diagrams-*`. Names appear in package manifests, imports, the custom export condition used by `tsx`, TypeScript and vitest to read sources without a build, CLI messages, tests, docs, the skill and CI.

## Goals / Non-Goals

**Goals:**
- Final command and package names everywhere, in one change, with no leftovers outside decision records and archived changes.
- Identical behaviour of both binaries.

**Non-Goals:**
- Theme id changes and publishing (see the proposal).

## Decisions

### D1. Two `bin` entries, one entry point

`packages/cli/package.json` declares `"bin": { "meltemi-diagrams": "./dist/bin.js", "mdg": "./dist/bin.js" }`. `CLI_NAME` is `meltemi-diagrams`, and the help text adds the line `Alias: mdg`. Messages always use the full name, so logs are unambiguous.

Alternative: detect the invoked name from `process.argv[1]` and echo it. Rejected because the same command would print different messages depending on how it was called, which makes docs and tests fragile.

### D2. Scope `@meltemi` with a `diagrams-` prefix, folders unchanged

Package names are `@meltemi/diagrams-<folder>`. The folders stay `packages/language`, `packages/model` and so on, which keeps paths short and lets future family products share the scope.

The source condition becomes `@meltemi/diagrams-source`. It is a string used only inside this workspace, but it must be unique: a dependency that also defined `@meltemi/source` would otherwise resolve to its TypeScript sources.

Alternative: `@meltemi-diagrams/*`. Rejected by the owner.

### D3. Mechanical rename with a guard test

A script replaces `@dac/` with `@meltemi/diagrams-` in the files under `packages/`, the root configuration and the docs. `pnpm install` relinks the workspace. A new test checks two things:

- every `packages/*/package.json` name is `@meltemi/diagrams-<folder>` and declares the source condition;
- no file outside `openspec/changes/archive/` and the decision records mentions `@dac/` or the `studio` command.

## Risks / Trade-offs

- [The lockfile keeps stale `@dac/*` link entries] → `pnpm install` regenerates the workspace links, and CI runs with `--frozen-lockfile`, which fails if the lockfile is stale.
- [`studio` appears inside theme ids such as `studio.light`] → The guard test matches the command forms (`studio validate`, `pnpm studio`, `` `studio` ``, `CLI_NAME`), not theme ids.
