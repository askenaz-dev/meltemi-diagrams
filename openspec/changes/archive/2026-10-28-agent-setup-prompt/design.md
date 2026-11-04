## Context

**The skill and its copies.** `skills/meltemi-diagrams/SKILL.md` is 227 lines and 17 KB; its
front matter is `name` and `description` (`SKILL.md:1-4`), the description one sentence of 1,117
characters that lists every construct before it says when to use the skill (`:3`); the Agent
Skills specification caps it at 1,024 (`agentskills.io/specification`, read 2026-10-28: "Must be
1-1024 characters", `license`, `compatibility` and `metadata` as the optional keys, "Keep your main
`SKILL.md` under 500 lines"), and Claude Code's listing caps each entry's description at 1,536
characters and drops descriptions when the listing overflows its budget, keeping the start of each
(`code.claude.com/docs/en/skills`, read 2026-10-28, which also says a compacted session may keep
only the start of an invoked skill, so "put the most important instructions near the top"). The
workflow (`:12-66`) names `pnpm mdg import`, `convert`, `layout`, `assets icons`, `validate` "(from
the repository root)" (`:47`), `export`, `pnpm preview` "serves the repository" (`:55`) and
`format`: thirteen `pnpm mdg` in `SKILL.md`, thirty-one in the references and examples; nothing
says where a new sheet goes, how to check the command is there or what a successful validation
prints. "Sharing in the cloud (only when the person asks)" (`:184-202`) lists `login`, `push`,
`pull`, `review`, `publish` and `projects`, says to run them only when asked and never add
`--force` unasked, and ends with the rule "Never print, read or copy a token (`mdg_…`)"
(`:201-202`), the file's last paragraph before the Reference list. `scripts/sync-skills.mjs`
copies every skill under `skills/` to `.claude/skills`, `.codex/skills` and `packages/cli/skills`
(`:24-28`), prunes only what its manifest `.skills-sync.json` says it wrote (`:51-73`), then
regenerates the assist guide from the references (`:75-81`, decision 0029).
`packages/render/test/skills.test.ts` holds `agentDirs = [".claude", ".codex", "packages/cli"]`
(`:37`), checks the front matter starts with `---\nname: meltemi-diagrams\ndescription: `
(`:46`), fails on any drift (`:51-70`), checks the manifests (`:72-78`), exercises the sync's
pruning in a temporary root with `.codex/skills/old` (`:80-112`) and compiles every example
(`:114-129`). `.codex/skills/` also holds the four `openspec-*` skills that OpenSpec 1.6.0 writes
for Codex beside the synced one, the one piece of evidence in the repository that some tools still
write `.codex/skills`.

**The command.** `packages/cli/src/skill-command.ts`: `SKILL_AGENTS = { claude: ".claude",
codex: ".codex" }` (`:29`), `SKILL_ROOT` from `new URL("../skills/", import.meta.url)` (`:36`),
`installedText` with its four rules (`:46-55`), `writeSkill` copying and rewriting every `.md` and
`.meltemi` (`:61-75`), `skillCommand` parsing `--agent`, `--user`, `--force`, `--help` with
`parseArgs` strict (`:86-96`), accepting `install` alone (`:108`), resolving `claude|codex|all`
(`:111-119`), joining `<base>/<agent dir>/skills/meltemi-diagrams` (`:120-121`), refusing any
existing destination unless `--force` (`:123-126`) and printing `Wrote <path>` (`:131`).
`packages/cli/src/cli.ts` dispatches `skill` (`:208-215`) and holds `CLI_VERSION = "1.9.0"`
(`:62`). The words: the help line (`packages/cli/src/messages/en.ts:44`), `help.skill`
(`:185-196`), `validate.summary` `Checked N files: N errors, N warnings.` (`:430-433`) and
`skill.{wrote, subcommand, tooMany, userWithFolder, unknownAgent, exists}` (`:575-588`); Spanish
`es.ts:46`, `:216-228`, `:600-611`. `packages/cli/package.json` ships `dist`, `skills`,
`templates` (`:30-34`); the templates are read beside `dist` as the skills are, and
`templates/sequence/diagrams/sign-in.meltemi` (`:1-36`) is a sequence diagram of a sign-in with two
scenarios that `init --template sequence` writes. `packages/cli/test/skill.test.ts:52-134` covers
both agents, `--user` with an injected `home`, the refusal and `--force`, the unknown agent
`cursor` with the message listing `claude, codex, all`, and that no `pnpm` survives in any
installed file. `packages/acceptance/src/release-check.ts:85-112` checks each packed tarball's
version, ranges, exported paths, README, licence and the absence of `src/` and `test/`, and
nothing about the CLI's `skills/`; `packages/acceptance/test/tarball.test.ts` feeds it a fake
tarball map. `scripts/release-version.mjs` writes the version into every manifest, the CLI's
constant and `VERSION_MENTIONS`, a list of `{ path, pattern }` (`:20-29`), which
`packages/acceptance/test/release.test.ts:54-68` walks, checking each mention holds the version.

**The documentation.** `docs/agents.md` (`:1-48`): installing with `mdg skill install` and `npx
@meltemi/diagrams-cli skill install`, by hand for "another agent" (`:29-33`), asking (`:35-42`),
"In this repository" (`:44-48`); `docs/es/agents.md` is its twin (`:1-50`), with the same three
headings and the same two code blocks; `docs/cli.md:195-202` "Agents' skill" and
`docs/es/cli.md:206-213`; linked from `docs/README.md:56`, `docs/es/README.md:59`,
`README.md:315-321`, `README.es.md:326-333`; `AGENTS.md:8-11` names `.claude/skills/` and
`.codex/skills/`; `CHANGELOG.md:228-233` records `skill install` under 1.10.0's "Command line"
(`:217`), and `:66` opens its "Playground" section. `packages/acceptance/test/docs.test.ts`:
`SKIPPED` holds `.claude` and `.codex` (`:8-18`), `TRANSLATED` lists the pages with a Spanish
twin, `agents` absent (`:101-124`), and the parity tests compare the language line, the heading
levels and the code blocks of each pair (`:186-205`).

**The web.** `packages/cloud/wrangler.jsonc:9-22`: `assets.directory` is `../playground/dist`,
`not_found_handling: none`, `run_worker_first` lists `/api/*`, `/_identity/*`, `/_published/*`,
`/cli-auth`, `/cli-auth/*`, `/p/*`, `/rooms/*`; with the default `html_handling`, the platform
serves `agent-setup/index.html` at `/agent-setup/`. The Worker's `RESERVED` regex names the same
paths (`packages/cloud/src/handler.ts:411`) and `cloud()` falls through to `deps.assets.fetch`
for any other path, wrapped by `pageResponse` (`:469-472`), which adds `frame-ancestors 'self'`
and `nosniff` (`packages/cloud/src/http.ts:33-38`); the build writes the same two headers as
`dist/_headers` for `/*` (`packages/playground/policy.mjs:20-23`, `build.mjs:134`). The build
writes `index.html` from `packages/playground/index.html` (`:1-26`: the meta CSP placeholder
`{{policy}}`, `{{version}}`, `lang="en"`, the favicon and the two stylesheets) with
`contentSecurityPolicy(identity)` (`policy.mjs:75-87`: `default-src 'none'`, `script-src 'self'`,
`style-src 'self' 'unsafe-inline'`, …) at `build.mjs:122-128`; copies the templates from
`packages/cli/templates` (`:163`); writes `NOTICES.md` and `notices.json` (`:200-313`).
`packages/playground/test/policy.test.ts:267-270` asserts the build's source writes `_headers`.
The page's stylesheet, `packages/playground/playground.css`, declares its tokens on `:root`
(`:54-88`: `--pg-bg`, `--pg-surface`, `--pg-border`, `--pg-fg`, `--pg-muted`, `--pg-accent`,
`--pg-code-bg`, the fonts) and overrides them under `:root[data-theme="dark"]` (`:168-185`), which
the app sets from its settings; a page without a script has no `data-theme`. The About dialog
(`dialogs.ts:245-263`) fetches `notices.json`, lists the packages and links `NOTICES.md` with
`target="_blank"`; the Continue locally dialog (`:265-294`) lists five `[label, command]` pairs in
a `dl.commands`; the words are `about.{title, loading, unreadable, text, notices}` (`en.ts:306-313`)
and `continue.{title, text, download, install, validate, export, catalog, init}` (`:316-326`),
Spanish at `es.ts:282-289` and `:291-301`. The playground suite's About scenario clicks the (i)
button, reads the notices list and fetches `NOTICES.md`
(`packages/playground/test/browser/run.ts:3053-3071`); the cloud suite's anonymous scenario asserts
the two headers on `/`, `/playground.js`, `/playground.css` and `/favicon.svg`
(`packages/cloud/test/browser/run.ts:253-258`) after building the playground (`:994-998`). Two
cadences: `deploy.yml` deploys every push to `main` (`.github/workflows/deploy.yml:10-12`,
decision 0046 at `docs/decisions/0046-delivery.md:31-35`) and `release.yml` publishes the packages
on a tag `v*` (`release.yml:10-12`, `RELEASING.md:8-11`), so the hosted prompt can be live before
the command line it describes is on npm. The family site (`C:\meltemi\web\packages\site`,
read-only here) is static HTML in EN/ES twins with no script and a strict `_headers` policy (its
`README.md`); its tests require the same external links in both twins (`test/site.test.ts:327-331`)
and check the Diagrams page's install command (`:343-360`); its Diagrams page is written by Meltemi
Web's `product-site` change.

**Where agents read skills**, as the vendors' pages read on 2026-10-28 (the first task reads them
again on the day and the decision note records what was read):

- Claude Code (`code.claude.com/docs/en/skills`): `.claude/skills/<name>/SKILL.md` in the project
  and in each parent up to the repository root, `~/.claude/skills/`, nested `<subdir>/.claude/skills/`,
  a directory given with `--add-dir`, plugins; the page does not name `.agents/skills`.
- Codex (`developers.openai.com/codex/skills`, served on that day from
  `learn.chatgpt.com/docs/build-skills`): "Codex scans `.agents/skills` in every directory from your
  current working directory up to the repository root", `$HOME/.agents/skills` for the person,
  `/etc/codex/skills` for the machine; the page does not name `.codex/skills` or `~/.codex/skills`.
- Cursor (`cursor.com/docs/context/skills`): `.agents/skills/` and `.cursor/skills/` in the project
  (nested folders too), `~/.agents/skills/` and `~/.cursor/skills/`; "For compatibility, Cursor also
  loads skills from Claude and Codex directories: `.claude/skills/`, `.codex/skills/`,
  `~/.claude/skills/`, and `~/.codex/skills/`".
- GitHub Copilot (`docs.github.com/en/copilot/concepts/agents/about-agent-skills`): project skills in
  `.github/skills`, `.claude/skills` and `.agents/skills`; personal skills in `~/.copilot/skills` and
  `~/.agents/skills`; "supported locations depend on the surface you're using".
- Gemini CLI (`geminicli.com/docs/cli/skills/`): workspace skills "in `.gemini/skills/` or the
  `.agents/skills/` alias", user skills "in `~/.gemini/skills/` or the `~/.agents/skills/` alias";
  `gemini skills install <path>` copies a skill in.
- Windsurf, now Devin Desktop with Cascade as its agent (`docs.windsurf.com/windsurf/cascade/skills`,
  which redirects to `docs.devin.ai/desktop/cascade/skills`): `.devin/skills/` preferred,
  `.windsurf/skills/` legacy and still read, `.agents/skills/` "for cross-agent compatibility",
  `.claude/skills/` only when reading Claude Code's configuration is enabled; the person's
  `~/.codeium/windsurf/skills/`, `~/.config/devin/skills/`, `~/.agents/skills/`.

Every agent on the owner's list but Claude Code reads `.agents/skills` in the project and
`~/.agents/skills` for the person; Claude Code reads `.claude/skills` and `~/.claude/skills`, which
Copilot, Cursor and Devin read as well.

**The ngrok pattern** (`ngrok.com/agent-setup/prompt.md`, read 2026-10-28): about 950 words
addressed to the agent under `# ngrok agent setup`, `## Setup` (four numbered steps: install,
authenticate, start the endpoint in the background, prove it), `## Offer to protect it (free) — only
with the developer's OK`, `## Keep it running vs. always-on`, `## Next steps that fit the app —
match to what it actually does` and `## Notes for agents`. It checks terminal access and hands the
person the commands when it has none, confirms the app and the port before acting, has the person
run the authtoken command themselves ("don't ask them to paste the token to you"), never prints,
commits or requests the token, applies a policy "only if they agree", and proves success by
requesting the public address and confirming "the response matches what the local app returns".
The one-liner that goes with it names the address, the checks, the proof and the never-rules in one
paragraph.

## Goals / Non-Goals

**Goals:**

- One address an agent reads and follows, one paragraph a person pastes, and the same text
  printed by the command line for an agent without web access.
- `skill install` works for the agents people use and writes the folders those agents read.
- The web says how to install and use the skill, in English and Spanish, from the product's own
  origin, reachable from the playground.
- The skill loads under the Agent Skills specification and tells an agent how to check the
  command, where a sheet goes and what success prints.
- Every copy of a text that appears twice (the one-liner, the prompt, the page's commands, the
  agents table) is pinned by a test.

**Non-Goals:**

- The family site's card (Meltemi Web's `product-site`), marketplaces and registries (`delivery`).
- Detecting agents from a project's folders in the command (the prompt tells the agent to look
  and ask).
- A Spanish prompt file (the agent reads English; the page explains in Spanish).
- Any change to what the references teach about the language.

## Decisions

### The prompt lives in the command line's package, printed by `skill prompt`, copied by the build

`packages/cli/agent-setup/prompt.md` is the canonical text; `files` gains `agent-setup`, so the
npm package carries it; `skill prompt` reads `new URL("../agent-setup/prompt.md", import.meta.url)`
as `SKILL_ROOT` reads the skills (`skill-command.ts:36`) and writes it to stdout byte for byte,
exit 0, no rewrite (the text is written for products: `mdg`, `npx @meltemi/diagrams-cli@latest`,
never `pnpm`); `skill prompt <anything>` is a usage error (exit 2) as `install x y` is (`:109`).
The playground build copies the file to `dist/agent-setup/prompt.md` next to the page, from
`join(repo, "packages", "cli", "agent-setup", "prompt.md")`, as it reads the templates from
`packages/cli/templates` (`build.mjs:163`); the assets platform serves it at
`https://diagrams.meltemi.dev/agent-setup/prompt.md` as it serves `NOTICES.md`, with the
`_headers`, deployed with every push to `main`. The one-liner names that address. Alternatives:
(a) the family site hosts the page and the prompt (`meltemi.dev/diagrams/agent-setup/prompt.md`):
the site has the EN/ES test, the strict policy and the IDE's agents page as precedent, but the
prompt would be a copy of a text whose truth is here, with no test across repositories, on
Meltemi Web's cadence, and the playground's (i) would still say nothing; (b) the raw file of
`main` on GitHub (`raw.githubusercontent.com/…/docs/agent-setup/prompt.md`): no hosting work, but
a branch-dependent address on a third party's host and nothing on the product's web, which the
owner asked for; (c) a command-only flow (`skill install --agent auto` detecting folders and a
`skill check` writing a sample): deterministic and offline, but the folders exist only after an
agent ran, and the ngrok trick is "read this address and follow it", which carries the asking and
the never-rules; (d) the prompt under `docs/` with the build reading it from there: the command
line could not print it from npm. Recommendation: the package's file, `skill prompt`, the build's
copy; the family site links the page (Meltemi Web).

### The prompt's content, and the version it needs

The file is English, addressed to the agent in the second person, 500 to 1,000 words, with seven
sections in a fixed order. Its draft, which the first prompt task writes and the prompt test pins
by its headings, phrases and length:

~~~markdown
# Set up Meltemi Diagrams for a coding agent

You are reading this because a person asked you to set up Meltemi Diagrams in their project and
to prove it works. Follow the steps in order. When something is unclear (which agents the project
uses, which flow to draw, whether a folder may be written), ask the person instead of guessing.

## What Meltemi Diagrams is

Meltemi Diagrams is diagrams as code. A diagram is a `.meltemi` text file; the command line
`meltemi-diagrams` (alias `mdg`, npm package `@meltemi/diagrams-cli`) validates it and exports SVG,
PNG, PDF and an HTML player. The text is the source of truth: when a `.meltemi` file can produce
the picture, never draw the picture by hand and never edit an exported SVG. The `meltemi-diagrams`
skill teaches you the language, the workflow and the rules that save iterations; this prompt
installs it and has you draw once.

## Before you start

1. Confirm you have terminal access on this machine. If you cannot run commands here, give the
   person the commands of this page to run themselves, and stop.
2. Run `node --version`. Node 22.12 or later is needed.
3. Run `npx @meltemi/diagrams-cli@latest --version` (or `mdg --version` when the command line is
   installed). This prompt is for 1.10.0 or later. If the version is older, tell the person that
   the published command line is older than this prompt needs, and stop.
4. Find out which coding agents the project uses: look for `.claude/`, `.agents/`, `.cursor/`,
   `.github/copilot-instructions.md`, `.gemini/`, `.devin/` or `.windsurf/`, count yourself, and
   ask the person when it is unclear.

## Install the skill

In the project's root folder, run

```
npx @meltemi/diagrams-cli@latest skill install --agent <names>
```

with `<names>` a comma-separated list of `claude`, `codex`, `cursor`, `copilot`, `gemini`,
`windsurf`, `devin` or `agents` (an agent not in the list that reads `.agents/skills/`), or `all`
for every folder. `claude` writes `.claude/skills/meltemi-diagrams/`; every other name writes
`.agents/skills/meltemi-diagrams/`, the cross-agent folder those agents read. The command writes
skill folders and nothing else: it never edits `AGENTS.md`, `CLAUDE.md` or any other file of the
project. A copy already there is kept and the command says so; add `--force` only if the person
asks you to replace it, and `--user` (the person's own folders, for every project) only if they
ask for that. Then read the installed `SKILL.md` before drawing.

## Prove it

1. Pick one real flow of this project (a sign-in, a checkout, a request through the services)
   from its code or its documentation, and write it as a sequence diagram in
   `diagrams/<name>.meltemi`: at most six participants and twelve messages, with a title. The
   skill's `reference/sequence.md` has the syntax. If there is no code to read, run
   `npx @meltemi/diagrams-cli@latest init --template sequence` and use the
   `diagrams/sign-in.meltemi` it writes.
2. Run `mdg validate diagrams/<name>.meltemi` (or the `npx` form) and fix every diagnostic it
   reports until its last line reads `Checked 1 file: 0 errors, 0 warnings.`.
3. Run `mdg export diagrams/<name>.meltemi`, which writes `diagrams/<name>.svg` beside the source.
4. Report to the person: the validation's last line, the path of the SVG, and the folders the
   skill was installed in. Start `mdg preview` (a local server) only if they ask to look at the
   result in a browser, and tell them how to stop it.

## Never

- Never print, read, copy or commit a token: an `mdg_…` value, `MELTEMI_TOKEN`, or the
  credentials file that `login` keeps.
- Never run `login`, `push`, `pull`, `publish` or any other cloud command unless the person asks
  for it.
- Never commit or stage anything, and never change the project's configuration, CI or agent
  instruction files beyond the skill folders, without asking first.
- Never add `--force` or `--user` on your own.
- Never draw a picture by hand, edit an exported SVG, or retype a Mermaid or PlantUML source:
  `mdg import` converts it.

## Next

Ask the person what to draw, in their words: "draw the checkout service from
`docs/architecture.md` as a flow diagram", "convert `diagrams/billing.mmd` and keep its layout",
"add a C4 container view of the shop". The installed skill holds the workflow, a template, the
rules and references for the language, layout, themes, C4, sequence diagrams, free compositions,
stories and converting. The documentation is at
https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/agents.md, and
`npx @meltemi/diagrams-cli@latest skill prompt` prints this text.
~~~

The version sentence is a precondition, not a workaround: the hosted text is live from the push
to `main`, while `npx @meltemi/diagrams-cli@latest` fetches what npm has, 1.9.0 until the 1.10.0
tag, which knows `--agent claude|codex|all` only; an agent that meets the older version reports it
and stops, and the gap closes when the owner releases 1.10.0 (recorded in Open Questions).
Alternatives: a fallback sentence in the prompt telling the agent how to make 1.9.0 do (install
`all` and copy `.codex/skills/meltemi-diagrams` to `.agents/skills/`): compatibility text for a
window of days, kept forever in a product file and naming a folder this change retires, which the
project's rules refuse; a `{{version}}` the build and the command stamp (two renderings of one
file, and the test "printed byte for byte" would have to render too); a prompt that names only
`claude|codex|all` until 1.10.0 ships (a second edit on release day, and the agents of the owner's
list unnamed on the web). Recommendation: the precondition, and the release of 1.10.0 close to
the merge.

### The one-line prompt is English, and one text

The paragraph a person pastes:

> Set up Meltemi Diagrams in this project so you can draw diagrams as code, and prove it works —
> you'll need terminal access on this machine and Node 22.12 or later. First read
> https://diagrams.meltemi.dev/agent-setup/prompt.md and follow it. Install the meltemi-diagrams
> skill for the coding agents this project uses (ask me if it's unclear which) with
> `npx @meltemi/diagrams-cli@latest skill install`. Then prove it: write a small sequence diagram
> of one flow of this project, validate it until no diagnostic remains, export the SVG, and show
> me the validation's last line and where the SVG is. Never sign in to the cloud, never print or
> commit a token, and don't commit or change my project's configuration beyond the skill folders
> without asking me first.

It has the ngrok shape: the goal and the proof in the first sentence, the prerequisites, the
address to read first, the smallest action with the asking, the proof the person can see, the
never-rules. It is written once per surface: the English and the Spanish page hold it in a
`pre > code` block, `docs/agents.md` and `docs/es/agents.md` in a fenced block (the docs test
already requires the fenced blocks of a pair to be equal, `docs.test.ts:196-205`), and the README
links the page instead of repeating it. `packages/playground/test/agent-setup.test.ts` reads the
four and fails naming the file whose block differs. Alternatives: a Spanish one-liner for the
Spanish page and `docs/es/agents.md` ("Configura Meltemi Diagrams en este proyecto para dibujar
diagramas como código y demuestra que funciona; necesitas acceso a la terminal de esta máquina y
Node 22.12 o superior. Primero lee https://diagrams.meltemi.dev/agent-setup/prompt.md y síguelo.
Instala la skill meltemi-diagrams para los agentes de programación que usa este proyecto
(pregúntame si no está claro cuáles) con `npx @meltemi/diagrams-cli@latest skill install`. Luego
demuéstralo: escribe un diagrama de secuencia pequeño de un flujo de este proyecto, valídalo hasta
que no quede ningún diagnóstico, exporta el SVG y muéstrame la última línea de la validación y
dónde quedó el SVG. Nunca inicies sesión en la nube, nunca imprimas ni confirmes un token, y no
hagas commit ni cambies la configuración del proyecto más allá de las carpetas de skills sin
preguntarme antes."): a second text to keep true, in the docs it would have to leave the fenced
block for a blockquote to pass the parity test, and the prompt it points at is English anyway.
Recommendation: the English paragraph everywhere, the Spanish page and docs explaining it in
Spanish; the Spanish text above is ready if the owner wants it.

### Agents and folders: a table, a list, one write per folder, skill folders only

`SKILL_AGENTS` becomes a table of agent name to the folder under the base:
`{ claude: ".claude/skills", codex: ".agents/skills", cursor: ".agents/skills",
copilot: ".agents/skills", gemini: ".agents/skills", windsurf: ".agents/skills",
devin: ".agents/skills", agents: ".agents/skills" }`, each row the folder the vendor's page names
above (`windsurf` and `devin` are the same product under its old and new name, and a person types
the one they know); `all` means every distinct folder of the table (two today); `--agent` takes
one name, `all`, or a comma-separated list, and may be repeated (`parseArgs` with
`multiple: true`), an empty name or an unknown one being a usage error whose message lists the
eight names and `all`; the destinations are the distinct `join(base, folder, SKILL_NAME)` in the
table's order, each written once and each printed once as `Wrote <path>`; `--user` keeps its
rule (the home folder, no folder argument) and writes `~/.claude/skills` and `~/.agents/skills`,
the two user folders the pages name; the refusal of an existing copy and `--force` are unchanged
(`:123-129`). The command writes skill folders and nothing else: no `AGENTS.md`, `CLAUDE.md`,
`.github/copilot-instructions.md` or `GEMINI.md`, which are the person's; the prompt tells the
agent the same. The generic name `agents` is for an agent not in the table that reads the
cross-agent folder. Public interface: `SKILL_AGENTS` (exported, read by the page's test),
`SkillAgent`, `skillCommand(args, ctx)` with the subcommands `install` and `prompt`. Alternatives:
(a) writing each agent's own folder as well (`.cursor/skills`, `.github/skills`, `.gemini/skills`,
`.devin/skills`): every one of them reads `.agents/skills` too, and each extra copy is one more to
drift and to refuse on reinstall; (b) keeping `.codex/skills` for `codex`: the vendor's page does
not list it, and a skill in a folder the agent does not read is the failure the owner would meet
first; (c) writing both for `codex`: two copies, one unread; (d) no generic name: a person with an
agent outside the table would have to name `codex` to get the folder; (e) `windsurf` alone: the
vendor now calls the product Devin Desktop and `.windsurf/skills` legacy. Recommendation: the
table above, `.agents/skills` for everyone but Claude Code, skill folders only.

### The repository's own folders follow the command

`scripts/sync-skills.mjs` targets `.claude/skills`, `.agents/skills` and `packages/cli/skills`;
`.codex/skills/meltemi-diagrams` and `.codex/skills/.skills-sync.json` are removed by hand (the
script never visits `.codex` again, so its manifest logic cannot prune them; the `openspec-*`
skills there are OpenSpec's and stay); `agentDirs` in the skills test, its test name and its
pruning scenario (`skills.test.ts:37`, `:52`, `:80-112`) move to `.agents`; `.prettierignore:7-10`,
`eslint.config.js:17-18` and `docs.test.ts:8-18` gain `.agents/`; `AGENTS.md:10` names it. The
canonical text keeps `pnpm mdg` and the install rewrite (decision 0056): the repository's agents
keep reading the canonical copy with the repository's command. Alternatives: keeping `.codex` as a
third target (a copy for a folder the vendor's page no longer lists); flipping the canonical text
to `mdg` (the repository has no `mdg` on the path, decision 0056's recorded reason).
Recommendation: two agent folders, `.claude` and `.agents`, and the rewrite as it is.

### The proof is a real flow, with the template's sheet as the fallback

The prompt has the agent draw a sequence diagram of one flow of the project it is in (a sign-in,
a checkout, a request through the services), from the code or the documentation, kept small (at
most six participants and twelve messages), under `diagrams/`; when the folder has no code to
read, it runs `init --template sequence` and validates and exports `diagrams/sign-in.meltemi`
(`packages/cli/templates/sequence/diagrams/sign-in.meltemi:1-36`). Success is the validation's
last line `Checked 1 file: 0 errors, 0 warnings.` (`en.ts:430-433`) and the SVG's path, which the
agent reports together; `mdg preview` only when asked (it starts a server). Alternatives: the
sample by default and the project only on request (proves the install, not the agent's drawing,
which is what the owner wants to see); a flow diagram (the sequence profile has no layout modes or
positions, `SKILL.md:27-29`, so the first sheet cannot go wrong on placement); exporting PNG
(needs Edge or Chrome on the machine, `SKILL.md:51-52`). Recommendation: a real sequence diagram,
the template as the fallback, SVG.

### The never-rules, and the cloud only on request

The prompt's `## Never` section and the one-liner say: never print, read, copy or commit a token
(`mdg_…`, `MELTEMI_TOKEN`, the credentials file `login` keeps); never run `login`, `push`,
`pull`, `publish` or any cloud command unless the person asks (the skill's own rule,
`SKILL.md:184-202`); never commit, stage or change the project's configuration, CI or
instruction files beyond the skill folders without asking; never add `--force` or `--user`
unasked; never draw a picture by hand, edit an exported SVG or retype a Mermaid or PlantUML source
(import it). A test reads `prompt.md` and fails naming the rule that is missing. Alternatives:
forbidding the cloud commands outright in the prompt (the skill allows them on request, and a
person who asks for a push should get one); leaving the rules to the skill alone (the agent reads
the prompt first, before any skill is installed). Recommendation: the rules in both, the cloud on
request.

### The agent-setup page: hand-written twins, their own stylesheet and policy, served as assets

`packages/playground/agent-setup/en.html` and `es.html` are static pages modelled on
`index.html`'s head (`{{policy}}`, `{{version}}`, the favicon) and on the family site's rules (EN
and ES twins, `<html lang>`, `rel="alternate"` to each other, no script, no inline style, no
resource from another origin). Each holds, in its language: what the skill does; the one-line
prompt in `pre > code`; `npm install --global @meltemi/diagrams-cli` and
`npx @meltemi/diagrams-cli@latest skill install --agent <names>`, with `--user` explained; the
table of agents, names and folders; what the agent never does; links to `prompt.md`, to
`docs/agents.md` on GitHub, to the playground (`../`) and to the twin. The page documents what
`docs/agents.md` documents, so its code blocks are the docs': every `pre > code` block of
`en.html` is a fenced block of `docs/agents.md` (the one-liner and the install command among
them), and the agents table's rows are `SKILL_AGENTS`'s; the test fails naming the page and the
block or the row, and the docs parity test (`docs.test.ts:196-205`) carries the same blocks to
`docs/es/agents.md`. `policy.mjs` gains `agentSetupPolicy()`, `default-src 'none'; style-src
'self'; img-src 'self'; base-uri 'none'; form-action 'none'`, the shape of the app's policy without
scripts, connections or inline styles; the build writes `dist/agent-setup/index.html`,
`dist/es/agent-setup/index.html` and copies `agent-setup/agent-setup.css` and the prompt, after
`_headers` (`build.mjs:134`), so the `/*` rule covers them. `agent-setup.css` is a short sheet
that declares the playground's tokens (`packages/playground/playground.css:54-88`) on `:root` and
the dark ones (`:168-185`) under `@media (prefers-color-scheme: dark)`, since the page has no
script to set `data-theme`, and styles the page at 375 pixels without sideways scroll.
`packages/playground/test/agent-setup.test.ts` reads the two sources and the docs: no `<script`,
no `style=`, no `http` resource, the same code blocks and the same external links in both twins
(the family site's rule, `site.test.ts:327-331`), every code block in the docs, the agents table
equal to `SKILL_AGENTS`, the stylesheet linked relatively. `policy.test.ts` asserts the build
writes the four files; the playground suite opens `agent-setup/` and `es/agent-setup/` (the
heading, the one-liner, the link to `prompt.md`, no sideways scroll at 375 pixels, no console
error) and fetches `agent-setup/prompt.md` as the About scenario fetches `NOTICES.md`; the cloud
suite adds `/agent-setup/`, `/es/agent-setup/`, `/agent-setup/prompt.md` and
`/agent-setup/agent-setup.css` to its header loop (`run.ts:253-258`), and asserts
`/agent-setup/prompt.md`'s text equals the package's file. Alternatives: (a) generating the page
from `docs/agents.md` at build time (its relative links break off the repository, the page wants
the one-liner and the table rather than the whole guide, and the build has no Markdown renderer);
(b) a route inside the app (needs the app's script and policy, and is not a page an agent or a
crawler reads); (c) linking `playground.css` (4,000 lines of app rules on `body`); (d)
`/agent-setup/es/` instead of `/es/agent-setup/` (the family site's shape is `/es/<path>/`).
Recommendation: the twins, the small sheet, the own policy, the family's path shape, the code
blocks pinned to the docs.

### The About dialog and Continue locally lead to the page

`aboutDialog` (`dialogs.ts:245-263`) gains, after the notices link, `h("a", { href:
"agent-setup/", target: "_blank", rel: "noopener" }, m.agents)` with `about.agents` = "Drawing
with coding agents" / "Dibujar con agentes de programación"; the relative address works under the
Worker and under `pnpm preview`'s sub-path. `continueDialog` (`:265-294`) gains a sixth pair after
`init`: `[m.skill, "meltemi-diagrams skill install"]` with `continue.skill` = "Give your coding
agents the skill" / "Dar la skill a tus agentes de programación". Alternatives: a top-bar entry
"Agents" (the bar holds Download, theme, (i), language and the account, and the owner's other
change of the day polishes its icons and tooltips; a page link belongs with the version and the
licences); a line in the footer beside the version (the footer is the status line). Recommendation:
the About dialog's link and the Continue locally line; the top-bar entry stays an open question.

### The skill's front matter and workflow

Each change answers a way the skill fails an agent today. The description lists every construct
before it says when to use the skill and is over the specification's limit, so a spec-following
loader refuses it and a listing that keeps the start of each entry keeps the inventory and drops
the triggers: it becomes one text under 1,024 characters that starts with the triggers, its draft:

> Use when asked to draw, document or convert a system or software architecture, turn a diagram
> or a screenshot into code, or change a `.meltemi` file. Creates, edits, converts and exports
> architecture diagrams as code in the Meltemi language (`.meltemi` files): flow sheets with
> groups, plain containers, data stores, decisions, notes, tags and boxes in twenty-four shapes
> with icons, laid out automatically (ELK), assisted or by hand, with ports, constraints, styles
> and themes; free compositions (slides with boxes, text, icons, images, layers and links to flow
> views); sequence diagrams (participants, calls, replies, activations, notes, alt/opt/loop/par
> fragments and exportable scenarios); C4 models with context, container and component views;
> motion effects and stories that walk through a diagram scene by scene; SVG, PNG, PDF and
> HTML-player exports with repeatable export profiles. Imports Mermaid, PlantUML, draw.io, HTML
> and SVG sources instead of retyping them.

`license: MIT`; `metadata:` with `version: <product version>`, written by `pnpm release:version`
through a new entry of `VERSION_MENTIONS` (`release-version.mjs:20-29`, pattern
`/(^  version: )\d+\.\d+\.\d+$/m`), checked by `release.test.ts:54-68` as every mention is and by
the skills test against `CLI_VERSION` read from `packages/cli/src/cli.ts`; the skills test parses
the four keys with a regex (no YAML dependency), fails when the description passes 1,024
characters or `SKILL.md` 500 lines. An agent in a project without `mdg` on the path fails at
step 3, an agent that does not know the summary line cannot tell when it is done, an agent told to
"write the file" writes it at the root: the workflow gains, before step 1 and within the file's
first 40 lines, "Before you start" (`pnpm mdg --version` says which version you have, installed:
`mdg --version`, by the existing rule; where `mdg` is not on the path
`npx @meltemi/diagrams-cli@latest <command>` runs the same command; new sheets go under
`diagrams/`, or where the project keeps them, `project.json` naming the folders; cloud commands
only when the person asks, and never a token (`mdg_…`) printed, read, copied or committed), step 3
names the summary line `Checked 1 file: 0 errors, 0 warnings.` as what success prints, and step 5
says `pnpm preview` starts a server, to run when the person wants to look and to tell them how to
stop. The token rule moves from the last paragraph to the top because a compacted session keeps
the start of a skill (Claude Code's page, above), and the never-rules are what must survive.
"Sharing in the cloud" moves to `reference/cloud.md` (listed under Reference, rewritten on install
like the others: its commands become `mdg login`…), so an agent that reads the whole file no
longer reads six commands it must not run. `installedText` needs no new rule: the new sentences
hold `pnpm mdg --version` and `npx @meltemi/diagrams-cli@latest`, and the no-`pnpm` test covers
`cloud.md`. Alternatives: no `metadata.version` (nothing says which skill a project holds; the
cost is one pattern in the release script); keeping the cloud section in `SKILL.md` (the agent
that reads the whole file reads six commands it must not run); cutting the description to the
triggers alone (loaders show the description as the skill's summary, so the profiles belong in
it); a `compatibility` key (the specification says most skills need none, and the skill runs
wherever Node does). Recommendation: the front matter above, the "Before you start" paragraph at
the top, the two sentences in steps 3 and 5, the cloud reference.

### Tests pin every text that appears twice

The one-liner (two pages, two docs), the prompt (the package's file, the hosted copy, what
`skill prompt` prints), the page's commands (every code block of the page in `docs/agents.md`),
the agents table (`SKILL_AGENTS` and the page's table: the test reads the table's rows from both
sources and compares names and folders), and the version in the skill's front matter against
`CLI_VERSION`. Alternative: trusting the docs tests' parity alone (they pair EN and ES, not the
page with the docs). Recommendation: the five comparisons, in `agent-setup.test.ts` and
`skills.test.ts`.

## Risks / Trade-offs

- [The hosted prompt is ahead of the published command line until the 1.10.0 tag] → the prompt
  names 1.10.0 as what it needs and has the agent report an older version and stop; the owner
  releases 1.10.0 close to the merge (Open Questions); the tasks' real proof runs against the
  published package after the tag and checks the stop before it.
- [A vendor moves its skills folder again] → the table is one object with one test per row; the
  page's table and the docs name the folder beside each agent; the first task re-reads the six
  pages on the day and the decision note records what was read, with the addresses above.
- [Codex still reads `.codex/skills` and not `.agents/skills` on the day] → the open question
  below; if so, `codex` maps to `.codex/skills` in the table and the repository keeps `.codex` as
  a target, one row and one target changed.
- [`.md` served with `nosniff`] → `NOTICES.md` is served the same way today and the About
  scenario fetches it; the cloud suite asserts a `200` with `text/markdown; charset=utf-8`, which `_headers` names
  for the prompt (the real proof found PowerShell reading it as Latin-1 without the charset).
- [The page at `/agent-setup` without the slash] → the assets platform's default `html_handling`
  redirects to `/agent-setup/`; the suite asserts the slash form only, which is what the links
  use.
- [The one-liner drifts between the page, the docs and the README] → the README links the page,
  and the test compares the other four.
- [The page's policy refuses an inline style Prettier or a hand adds] → the test refuses `style=`
  and `<script` in the sources; the browser scenario reads the console for a policy violation.
- [`npx @meltemi/diagrams-cli@latest` downloads the package on each run] → the prompt uses it
  for the few commands of the setup and tells the agent to install globally only when the person
  asks; the page shows `npm install --global @meltemi/diagrams-cli` beside it.
- [The skill's `metadata.version` is forgotten on a release] → `release:version` writes it and
  the skills test fails on drift.
- [An agent that reads the prompt has no web access] → `npx @meltemi/diagrams-cli@latest skill
  prompt` prints the same text; the docs and the prompt's last line say so.
- [The page's code blocks and the docs' diverge in wording] → the inclusion test names the block;
  a command changes in `docs/agents.md` first, then in the page.

## Open Questions

- Hosting: is `https://diagrams.meltemi.dev/agent-setup/` (this repository, deployed with
  `main`) the address to paste, with the family site's Diagrams page gaining a "For coding agents"
  card queued in Meltemi Web (`product-site` or a change of its own)? Default: yes to both.
- Codex's folder: may `--agent codex` and this repository's sync write `.agents/skills` instead
  of `.codex/skills` (decision 0056 revisited, no trace left)? Default: yes, as the vendor's page
  reads on 2026-10-28.
- The agents' own folders: is `.agents/skills` enough for Cursor, Copilot, Gemini and Devin, or
  should `copilot` also write `.github/skills` and `cursor` `.cursor/skills`? Default:
  `.agents/skills` alone.
- The names: `windsurf` and `devin` both, for the product the vendor now calls Devin Desktop?
  Default: both, one folder.
- Instruction files: must `skill install` leave `AGENTS.md`, `.github/copilot-instructions.md`
  and `GEMINI.md` alone? Default: yes, skill folders only.
- The proof: a flow of the project itself by default, the template's sheet when there is no
  code? Default: yes.
- The cloud: allowed when the person asks, as the skill says, or forbidden outright in the
  prompt? Default: on request.
- Language: the one-liner and the prompt in English, the page in both languages? Default: yes;
  the Spanish one-liner is drafted above if wanted.
- Cadence: release 1.10.0 with or right after the merge, so that `npx @meltemi/diagrams-cli@latest`
  has the agents the hosted prompt names? Default: yes; until then the prompt has the agent report
  the older version and stop.
- A visible "Agents" entry in the top bar besides the About dialog's link? Default: no.
