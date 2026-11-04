## 1. The skill in the package

- [x] 1.1 `scripts/sync-skills.mjs`: a third target `packages/cli/skills`, written and pruned with its manifest as the agent folders are; `pnpm skills:sync` run; `packages/cli/package.json` `files` gains `skills`; `packages/render/test/skills.test.ts` checks the CLI's copy too

## 2. The command

- [x] 2.1 `packages/cli/src/skill-command.ts`: `installedText(text)` (the three rewrite rules) and `skillCommand(args, ctx)` (`install [folder]`, `--agent claude|codex|all`, `--user` with the home folder from `ctx.home`, `--force` replacing the destination only, `Wrote <path>`, exit 0 or 2); `src/cli.ts` dispatches `skill`; help and words in `src/messages/en.ts` and `es.ts`
- [x] 2.2 `packages/cli/test/skill.test.ts`: both agents into an empty folder, one agent with `--user` into a temporary home, an existing copy refused then replaced with `--force` keeping a file beside it, an unknown agent, no `pnpm` left in any installed file, the examples byte for byte

## 3. Documentation and decision

- [x] 3.1 `docs/agents.md` and `docs/es/agents.md`; `docs/cli.md` and `docs/es/cli.md` `skill install`; `docs/README.md`, `docs/es/README.md`, `README.md` and `README.es.md` link the page; the docs tests pass
- [x] 3.2 `CHANGELOG.md` 1.10.0: a "Command line" entry; `docs/decisions/0056-agent-skill-install.md` (context, decision, alternatives, consequences)

## 4. Gates

- [x] 4.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `openspec validate agent-skill-install`
