## Why

The owner asked on 2026-10-27 for the thing ngrok does for agents: one prompt a person pastes into
Claude Code, Codex or any other coding agent, which makes the agent install the `meltemi-diagrams`
skill and prove it draws, with the installation and the use of the skill documented on the web,
"ahora no está". Everything but the web exists, and each part stops one step short. The skill is
canonical in `skills/meltemi-diagrams/` (`SKILL.md`, eight references, five examples),
`pnpm skills:sync` copies it to `.claude/skills`, `.codex/skills` and `packages/cli/skills`
(`scripts/sync-skills.mjs:24-28`), and `meltemi-diagrams skill install` writes it into a project
for Claude Code and Codex only: `SKILL_AGENTS = { claude: ".claude", codex: ".codex" }`
(`packages/cli/src/skill-command.ts:29`), `--agent` refuses every other name listing the three
(`:111-119`; the spec's own refused example is `cursor`, `openspec/specs/agent-skill/spec.md:32-34`).
Cursor, GitHub Copilot, Gemini CLI and Windsurf (now Devin Desktop) all read the cross-agent folder
`.agents/skills`, and so does Codex, whose documentation lists `.agents/skills` and `~/.agents/skills`
and not `.codex/skills` (the vendors' pages as read on 2026-10-28, their addresses in the design, to
be read again the day this is implemented), so a Codex user who runs `skill install` today installs
a skill in a folder Codex does not read. The documentation is on GitHub only: `docs/agents.md:11-33`
(install with the command or by hand), `:35-42` (how to ask), its Spanish twin, `docs/cli.md:195-202`,
the README's "For agents" (`README.md:315-321`); the page is not in the docs test's `TRANSLATED`
list (`packages/acceptance/test/docs.test.ts:101-124`), so the spec's scenario "A missing Spanish
page" (`openspec/specs/agent-skill/spec.md:54-56`) is enforced by nothing. On the web,
diagrams.meltemi.dev is the playground build served by the Worker of `packages/cloud`
(`wrangler.jsonc:9-22` serves `../playground/dist` for every path the Worker does not reserve,
`packages/cloud/src/handler.ts:411`, `469-472`); the build writes the page, its bundles,
`api/session`, `_headers`, fonts, icon data, templates and `NOTICES.md`
(`packages/playground/build.mjs:118-134`, `162-198`, `200-313`) and no page of documentation; the
only informational control of the screenshot, the (i) icon, is `iconButton("info", m.header.about)`
(`packages/playground/src/shell.ts:408-409`) opening an About dialog of version and licences
(`packages/playground/src/dialogs.ts:245-263`, words at `packages/playground/src/messages/en.ts:306-313`),
and the Continue locally dialog lists install, validate, export, build catalog and init, not
`skill install` (`dialogs.ts:265-294`, `en.ts:316-326`). The family site's Diagrams page sends
people to the GitHub docs folder in general
(`C:\meltemi\web\packages\site\public\diagrams\index.html:46-48`, `374-377`) and says nothing
about agents. There is no address an agent can be told to read and follow, which is the whole of
the ngrok trick. The skill itself has things to fix before it travels: its front matter is `name`
and `description` only (`skills/meltemi-diagrams/SKILL.md:1-4`), the description is 1,117
characters, over the Agent Skills specification's 1,024 (the specification's validation fails it)
and names every construct before it says when to use the skill; its workflow never says how to
check the command is there, where a new sheet goes or what a successful validation prints, which an
agent proving itself needs; and the rule about tokens is its last paragraph (`:201-202`), where a
compacted session loses it. Post-1.0 change, outside the roadmap (`docs/roadmap-1.0.md`); it builds
on `agent-skill-install` (decision 0056), `ai-assist` (decision 0029, the references as the assist
guide's source) and `delivery` (decision 0046, the page deployed from `main`).

## What Changes

- **A hosted prompt an agent reads and follows.** `packages/cli/agent-setup/prompt.md`, English,
  written for an agent, 500 to 1,000 words, its text drafted in full in the design: what Meltemi
  Diagrams is (the `.meltemi` text is the truth, the command line validates and exports), what to
  check before starting (terminal access, Node 22.12 or later, the command line's version, 1.10.0
  or later, else report it and stop; which agents the project uses, and to ask when unclear), how
  to install the skill (`npx @meltemi/diagrams-cli@latest skill install --agent <names>` in the
  project's root; `--user` and `--force` only when asked), how to prove it (write a small sequence
  diagram of one real flow of the project, or the `sequence` template's sheet when there is no
  code to read, validate until the last line reads `Checked 1 file: 0 errors, 0 warnings.`, export
  the SVG and say where it is), what it must never do (print, read, copy or commit an `mdg_…`
  token; run `login`, `push`, `pull`, `publish` or any cloud command unasked; commit, stage or
  change the project's configuration, CI or instruction files beyond the skill folders without
  asking; draw pictures by hand or edit an exported SVG), and what to do next. The package ships it
  (`files`), `meltemi-diagrams skill prompt` prints it, and the playground build copies it to
  `dist/agent-setup/prompt.md`, so it is served at `https://diagrams.meltemi.dev/agent-setup/prompt.md`
  with every push to `main`.
- **The one-line prompt.** One English paragraph a person pastes, in the shape of the ngrok
  example and written verbatim in the design: set up Meltemi Diagrams in this project and prove it
  works, you need terminal access and Node 22.12 or later, first read the hosted prompt and follow
  it, install the skill for the agents this project uses (ask when unclear) with
  `npx @meltemi/diagrams-cli@latest skill install`, then prove it with a small sequence diagram
  validated until no diagnostic remains and exported to SVG, showing the validation's last line and
  where the SVG is, never sign in to the cloud, never print or commit a token, never commit or
  change the project's configuration beyond the skill folders without asking. It appears, the same
  text, on the hosted page in both languages and in `docs/agents.md` and `docs/es/agents.md`, and
  a test fails when the copies differ.
- **`skill install` for the agents people use, in the folders they read.** `--agent` takes
  `claude` (`.claude/skills/`), `codex`, `cursor`, `copilot`, `gemini`, `windsurf`, `devin` and the
  generic `agents` (all `.agents/skills/`, the cross-agent folder every one of them reads), `all`
  (both folders, the default), and a comma-separated list; destinations are written once however
  many names share them; `--user` writes `~/.claude/skills` and `~/.agents/skills`; the refusal of
  an unknown name lists them all. The command writes skill folders and nothing else: no
  `AGENTS.md`, no `.github/copilot-instructions.md`, no `GEMINI.md`. This repository's own sync
  and drift test follow: `.agents/skills` replaces `.codex/skills` as the second target, and the
  ignore lists and `AGENTS.md` name it.
- **An agent-setup page in the playground build.** `dist/agent-setup/index.html` and
  `dist/es/agent-setup/index.html`, static HTML twins with no script, their own stylesheet and
  their own Content-Security-Policy, served by the assets platform at
  `https://diagrams.meltemi.dev/agent-setup/` and `/es/agent-setup/` with the build's `_headers`:
  what the skill does, the one-line prompt in a copyable block, the manual commands
  (`npm install --global @meltemi/diagrams-cli`, `skill install --agent <names>`), the agents and
  their folders, what the agent never does, links to the prompt, the documentation and the
  playground. Every code block of the page is a fenced block of `docs/agents.md`, and a test fails
  when one is not. The About dialog gains the link "Drawing with coding agents" and the Continue
  locally dialog the line `meltemi-diagrams skill install`, in both languages.
- **The skill, fit to travel.** The description cut under 1,024 characters with the trigger
  phrases first; `license: MIT` and `metadata` with the product version, which
  `pnpm release:version` keeps and the skills test checks; a "Before you start" paragraph at the
  top of the workflow (`pnpm mdg --version`; `npx @meltemi/diagrams-cli@latest` where `mdg` is not
  on the path; new sheets under `diagrams/` or where the project keeps them; cloud commands only on
  request and never a token printed, read, copied or committed); the validation's summary line
  named in the workflow so an agent knows what success prints; `pnpm preview` named as a server to
  start when the person wants to look; "Sharing in the cloud" moved to `reference/cloud.md`; a
  test that `SKILL.md` stays under 500 lines. The canonical text keeps `pnpm mdg` and the install
  rewrite (decision 0056).
- **Documentation.** `docs/agents.md` and `docs/es/agents.md` restructured around the prompt
  (the one-liner, the hosted address, `skill prompt`, the agents table, the proof, the never
  rules, "In this repository" naming `.agents/skills`), and the page joins the docs test's
  translated list; `docs/cli.md` and `docs/es/cli.md` (the agents, `skill prompt`);
  `docs/playground.md` and `docs/es/playground.md` (`agent-setup/` among what the build writes,
  the About dialog's link); the documentation index (`docs/README.md`, `docs/es/README.md`) and
  the README's "For agents" in both languages naming the page and the hosted address; `AGENTS.md`;
  the changelog's 1.10.0 section; decision 0063.

## Non-goals

- The "For coding agents" card of the family site's Diagrams page, linking
  `https://diagrams.meltemi.dev/agent-setup/` from `packages/site/public/diagrams/index.html` and
  its Spanish twin, belongs to Meltemi Web (`C:\meltemi\web`): its `product-site` change owns that
  page, or a change of its own in that repository.
- Publishing the skill in a plugin marketplace or a skills registry stays an owner step of the
  `delivery` change (decision 0056).
- The tooltips and the distinct icons of the playground's top bar, the (i) icon's included, belong
  to `inspector-collapse-and-tooltips`; the sequence diagram's spacing and nested calls to
  `sequence-spacing-and-nested-calls`; unbranded exports to `unbranded-exports`.
- The delivery change owns the pipelines, the deploy of the page and the release of the command
  line that ships the prompt.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-skill`: "The skill ships with the command line" (the prompt in the package, the
  repository's second target `.agents/skills`, the release check's assertion), "Installing the
  skill into a project" (the agents, their folders, the list, deduplication, `--user`, the
  refusal, skill folders only), "The installed skill names the installed command" (the new
  reference and paragraph rewritten too), "Documentation for agents" (the prompt, the agents
  table, the proof, the never rules, the translated list); new requirements "The agent setup
  prompt" (the file, its sections and sentences, the version it needs, `skill prompt`, the hosted
  copy) and "The skill's front matter and size" (the description's limit, licence, version, the
  "Before you start" paragraph, the summary line, the cloud reference).
- `web-playground`: a new requirement "Agent setup page" (the twins, their policy, what they
  hold, the code blocks pinned to the docs, the prompt beside them, the headers they are served
  with); "Notices and versions" (the About dialog's link to the page); "Continuing locally" (the
  `skill install` line).
- `localized-documentation`: "Spanish documentation" (`agents.md` among the pages with a Spanish
  version).

## Impact

- `packages/cli`: `agent-setup/prompt.md` (new), `package.json` `files` (`agent-setup`),
  `src/skill-command.ts` (`SKILL_AGENTS` as a table of folders, the list, deduplication,
  `skill prompt`), `src/messages/en.ts` and `es.ts` (help, words), `test/skill.test.ts`,
  `test/prompt.test.ts` (new).
- `scripts/sync-skills.mjs` (`.agents/skills` for `.codex/skills`), `scripts/release-version.mjs`
  (the skill's `metadata.version` among `VERSION_MENTIONS`, which
  `packages/acceptance/test/release.test.ts` already walks), `.prettierignore`,
  `eslint.config.js`, `.agents/skills/` (new, synced), `.codex/skills/meltemi-diagrams` and its
  manifest removed, `AGENTS.md`.
- `skills/meltemi-diagrams/SKILL.md` (front matter, "Before you start", the summary line, the
  preview sentence, the cloud section's move), `reference/cloud.md` (new);
  `packages/render/test/skills.test.ts`.
- `packages/playground`: `agent-setup/en.html`, `agent-setup/es.html`,
  `agent-setup/agent-setup.css` (new), `build.mjs`, `policy.mjs` (the page's policy),
  `src/dialogs.ts`, `src/messages/en.ts` and `es.ts`; `test/policy.test.ts`,
  `test/agent-setup.test.ts` (new), `test/messages.test.ts`, `test/browser/run.ts`.
- `packages/cloud/test/browser/run.ts` (the page, its twin, the prompt and the stylesheet in the
  header loop); no Worker code changes.
- `packages/acceptance/src/release-check.ts` (the CLI tarball's `skills/` and `agent-setup/`),
  `packages/acceptance/test/tarball.test.ts` (the packed paths), `packages/acceptance/test/docs.test.ts`
  (`agents` translated, `.agents` skipped).
- `docs/agents.md`, `docs/es/agents.md`, `docs/cli.md`, `docs/es/cli.md`, `docs/playground.md`,
  `docs/es/playground.md`, `docs/README.md`, `docs/es/README.md`, `README.md`, `README.es.md`,
  `CHANGELOG.md`, `docs/decisions/0063-agent-setup-prompt.md` (new, linked from 0056 and 0008).
