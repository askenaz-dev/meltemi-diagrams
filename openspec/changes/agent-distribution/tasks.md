# Tasks

## 1. One text for the skill

- [x] 1.1 Rewrite the canonical skill to name `mdg <command>`, `mdg preview` and "the project's folder" in `SKILL.md`, every reference and the examples' comments, and add to "Before you start" the clause on `pnpm mdg` inside the Meltemi Diagrams repository; `grep -rn pnpm skills/meltemi-diagrams` prints that one line.
- [x] 1.2 Remove `installedText` from `packages/cli/src/skill-command.ts` so that `skill install` copies bytes; replace its tests in `packages/cli/test/skill.test.ts` with one that compares every installed file with the package's.
- [x] 1.3 Turn the guard in `packages/render/test/skills.test.ts`: any `pnpm` of the skill outside the one sentence fails naming its line; add the size of 32,000 bytes with LF line ends and the description naming each of `DIAGRAM_TYPES` and each source of `import`; check each failure by breaking it locally.
- [x] 1.4 Run `pnpm skills:sync`; update `docs/agents.md`, `docs/es/agents.md` and the README's lines that describe the rewrite; the skills, skill-command and documentation tests pass.

## 2. The stdio transport

- [x] 2.1 Add `--stdio` to `packages/cli/src/mcp-command.ts`: the same server connected to the library's stdio transport, the address and the calls' lines on standard error, exit 0 when input closes, `--port` and a missing folder refused with code 2 before input is read, and an unexpanded placeholder as `--folder` read as the working folder.
- [x] 2.2 Add `packages/cli/test/mcp-stdio.test.ts`, starting the real command as a process: `initialize`, `tools/list` and `preview` in folder mode, every line of standard output a protocol message, the same picture as over HTTP, the closed input, the refusals, the placeholder and a path outside the folder.
- [x] 2.3 Add `--stdio` to the help in English and Spanish and document it in `docs/cli.md` and `docs/es/cli.md`; the help and localized documentation tests pass.

## 3. The plugin

- [x] 3.1 Create `plugins/meltemi-diagrams/` with the two manifests, `README.md` and the skill's copy as a fourth target of `scripts/sync-skills.mjs`, and the two marketplace files at the root; add the plugin's skill copy to `.prettierignore` beside the other copies, and have `scripts/release-version.mjs` write the Codex manifest's `version`.
- [x] 3.2 Write `plugins/meltemi-diagrams/bin/mcp.mjs` and `.mcp.json`: the project's own command line first, npm's `npx-cli.js` beside the running Node otherwise, no shell, the streams passed through, and the one line on standard error when neither starts; test it as a process against a folder with spaces in its name, with and without a project install.
- [x] 3.3 Add `packages/acceptance/test/plugin.test.ts` for `specs/agent-plugin`: the six paths, the skill's copy, no link and no path out of the folder, the two marketplaces and their one source, the seven equal keys, the description's length and profiles, no `version` for Claude Code and `CLI_VERSION` for Codex, the Codex `interface` and its absent `mcpServers`.
- [x] 3.4 Check that `pnpm release:check` and the tarball tests still pass, since `plugins/` is in no package, and that `names.test.ts` and the licence inventory accept the new folder.

## 4. The doctor command

- [x] 4.1 Add `packages/cli/src/doctor-command.ts` and register it: the five checks in order with `findBrowser`, `findFfmpeg` and `ffmpegVersion` of `packages/capture`, the skill copies of the folder and the home with major and minor compared, the stored sign-in asked of the credentials store, the lines, the summary and the exit codes.
- [x] 4.2 Add `--json`, the help and the messages in English and Spanish; test in `packages/cli/test/doctor.test.ts` every scenario of `specs/cli-doctor` with an injected environment, home and network guard: no file written, no request made, no part of a token printed.
- [x] 4.3 Add the row for a missing tool to the skill's table of symptoms and run `pnpm skills:sync`; document `doctor` in `docs/cli.md`, `docs/getting-started.md` and their Spanish pairs; the skills and documentation tests pass.

## 5. The agents guide

- [x] 5.1 Add to `docs/agents.md` and `docs/es/agents.md` the table of the four ways to install with what each brings, how it updates and what it sends, a fenced block for each command, the Codex line for the stdio server and the note on the `skills` command's telemetry.
- [x] 5.2 Extend `packages/acceptance/test/docs.test.ts`: the five commands of `specs/agent-skill` in fenced blocks in both languages, failing with the command and the file that lacks it.

## 6. The README

- [x] 6.1 Reorder `README.md`: the sentence, badges, links and demo; "With your coding agent" with the commands and four requests; "Without an agent"; the gallery's grid as the third section; "How it compares" with its table and the paragraph on what the others do better; the rest as it is.
- [x] 6.2 Write `README.es.md` with the same sections, commands, badges and pictures.
- [x] 6.3 Add `packages/acceptance/test/readme.test.ts` for `specs/repository-readme`: the order of the top, the agents' commands held by `docs/agents.md`, the five pictures and their files, the comparison's columns, rows and paragraph, and the two languages' structure; the link check of the documentation still passes.

## 7. Trials with the clients

- [x] 7.1 From a branch pushed to GitHub, install the plugin in Claude Code in an empty project with `/plugin marketplace add askenaz-dev/meltemi-diagrams#<branch>` and `/plugin install meltemi-diagrams@meltemi`; run `claude plugin validate --strict` on the repository and on `plugins/meltemi-diagrams`; record in `docs/quality/2026-11-agent-distribution.md` the client's version, the skill listed, the three tools answering, a cold and a warm start of the server in seconds, and the same on Windows and on one other system.
- [x] 7.2 Install the plugin in Codex from the same branch and add the stdio server with the guide's line; record the client's version, the skill listed and `preview` answering for the project's folder; if the skill is not listed, replace the Codex plugin's row of the guide as design.md says and record it.
- [x] 7.3 Run `npx skills add askenaz-dev/meltemi-diagrams@<commit> --list`, with the branch's commit, and then with `--skill meltemi-diagrams` into an empty folder; record what is listed, that the installed files equal the canonical ones, and `mdg doctor` reporting the copy.

## 8. Record and integration

- [x] 8.1 Add the changelog entry and write `docs/decisions/0080-agent-distribution.md` with the decisions of design.md, noting that it replaces the rewrite of decision 0056; the decisions index test passes.
- [x] 8.2 Run `pnpm typecheck`, `pnpm lint` and `pnpm test`; record the results.
- [x] 8.3 Run `openspec validate agent-distribution --strict` and read the final diff: no `pnpm` in any copy of the skill beyond the one sentence, no token or address in the plugin, and no file of the local workspace's plugins changed.

## Notes on what was built

- 7.1 and 7.2 ran from the worktree, not from a pushed branch: Claude Code with `--plugin-dir`, Codex
  with an empty `CODEX_HOME` and `codex plugin marketplace add <path>`; the published command line
  has no `--stdio` yet, so the trial project used a stand-in for its own command line. Results and
  what was not tried are in `docs/quality/2026-11-24-agent-distribution.md`. `claude plugin validate
  --strict` fails on the missing `version` alone, which is on purpose; the spec now asks for no other
  warning. Codex has `codex plugin add`, which the guides now give.
- 7.3 ran with the person's permission against the worktree's path, not a pushed commit; results in
  the same note.

## Workflow follow-up

- After the pull request is merged and its release is verified, install the plugin from `main` once more in each client and add the result to the note.
- Archive the change with `/opsx:archive`.
