# 0063. One prompt sets up a coding agent, and the skill goes where each agent reads it

Status: accepted (agent-setup-prompt change, 28 October 2026).

## Context

The owner asked on 27 October 2026 for what ngrok does for agents: one prompt a person pastes into
Claude Code, Codex or another coding agent, which has the agent install the `meltemi-diagrams`
skill and prove it draws, with the installation and the use of the skill documented on the web.
Each part stopped one step short. `skill install` (decision 0056) wrote `.claude/skills` and
`.codex/skills` only, and Codex no longer reads `.codex/skills`. The documentation was on GitHub
only, and nothing on diagrams.meltemi.dev said how to give an agent the skill. There was no address
an agent could be told to read and follow, which is the whole of the ngrok pattern
(`ngrok.com/agent-setup/prompt.md`: the agent reads a hosted text that checks the prerequisites,
installs, proves the result and lists what it must never do). The skill's description was 1,117
characters, over the Agent Skills specification's 1,024, and listed every construct before saying
when to use the skill; its token rule was its last paragraph, which a compacted session loses.

The vendors' pages, read again on the day this was applied (28 October 2026):

- Claude Code (`code.claude.com/docs/en/skills`): `.claude/skills/` in the project, nested folders
  and `--add-dir` folders, `~/.claude/skills/`, plugins; no `.agents/skills`. The listing truncates
  a description at 1,536 characters ("put the key use case first"), `SKILL.md` should stay under
  500 lines, and compaction keeps the first 5,000 tokens of an invoked skill.
- Codex (`developers.openai.com/codex/skills`, redirected to `learn.chatgpt.com/docs/build-skills`):
  "Codex scans `.agents/skills` in every directory from your current working directory up to the
  repository root", `$HOME/.agents/skills`, `/etc/codex/skills`; no `.codex/skills`.
- Cursor (`cursor.com/docs/context/skills`): `.agents/skills/`, `.cursor/skills/` and their home
  twins, and for compatibility `.claude/skills/` and `.codex/skills/`.
- GitHub Copilot (`docs.github.com/en/copilot/concepts/agents/about-agent-skills`): `.github/skills`,
  `.claude/skills` or `.agents/skills` in the repository; `~/.copilot/skills` or
  `~/.agents/skills`; locations depend on the surface.
- Gemini CLI (`geminicli.com/docs/cli/skills/`): `.gemini/skills/` or the `.agents/skills/` alias,
  and their home twins.
- Windsurf, now Devin Desktop (`docs.windsurf.com/windsurf/cascade/skills`, redirected to
  `docs.devin.ai/desktop/cascade/skills`): `.devin/skills/`, the legacy `.windsurf/skills/`, and
  `.agents/skills/` and `~/.agents/skills/` "for cross-agent compatibility"; `.claude/skills/`
  only when reading Claude Code's configuration is enabled.

Every agent of the owner's list but Claude Code reads `.agents/skills`.

## Decision

- **A hosted prompt an agent reads and follows.** `packages/cli/agent-setup/prompt.md` is the
  canonical text: English, addressed to the agent, 500 to 1,000 words, with seven sections in a
  fixed order (what Meltemi Diagrams is, before you start, install the skill, prove it, never,
  next). The package ships it, `meltemi-diagrams skill prompt` prints it byte for byte for an agent
  without web access, and the playground build copies it to `dist/agent-setup/prompt.md`, served
  at `https://diagrams.meltemi.dev/agent-setup/prompt.md` with every push to `main`. A test pins its
  headings, its required sentences, each never-rule and its length.
- **Two cadences, one precondition.** The page and the prompt deploy with `main`; the command line
  reaches npm on a release tag. The prompt says it needs the command line 1.10.0 or later, and an
  agent that finds an older one tells the person and stops, rather than a fallback text kept
  forever in a product file.
- **The one-line prompt is English and one text**, written on the page in both languages and in
  `docs/agents.md` and its Spanish copy; the page's test and the documentation's parity test fail
  when a copy differs. The Spanish page and documentation explain it in Spanish.
- **`skill install` writes the folders each agent reads.** `SKILL_AGENTS` maps `claude` to
  `.claude/skills` and `codex`, `cursor`, `copilot`, `gemini`, `windsurf`, `devin` and the generic
  `agents` to `.agents/skills`, as the pages above say. `--agent` takes a name, `all` (the default)
  or a comma-separated list and may be repeated; each folder is written once, in the table's order;
  `--user` writes `~/.claude/skills` and `~/.agents/skills`; an unknown or empty name is a usage
  error listing the names. The command writes skill folders only, never an instruction file.
  This repository's sync follows: `.agents/skills` replaces `.codex/skills`, whose copy is gone,
  while the OpenSpec skills that tool writes there stay.
- **An agent setup page on the product's origin.** `agent-setup/` and `es/agent-setup/` are static
  twins with no script, their own stylesheet and their own policy
  (`default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'`),
  served by the assets platform with the build's `_headers`. Every code block of the page is a
  fenced block of `docs/agents.md`, and the agents table equals `SKILL_AGENTS`. The playground's
  About dialog links it in the interface's language (the Spanish interface opens the Spanish twin),
  and Continue locally lists `meltemi-diagrams skill install`.
- **The skill fit to travel.** The description is under 1,024 characters and starts with when to
  use the skill; `license: MIT` and `metadata.version`, which `pnpm release:version` writes through
  `VERSION_MENTIONS` (a second, possibly empty capture keeps the script's `$1<version>$2`
  replacement, CRLF files included) and the skills test checks against `CLI_VERSION`. The workflow
  opens with how to check the command line, where new sheets go and the token rule, within the
  first 40 lines; the validation step names `Checked 1 file: 0 errors, 0 warnings.`; the review step
  says `pnpm preview` starts a server; the cloud commands move to `reference/cloud.md`.

## Alternatives considered

- **The family site hosts the page and the prompt**: a copy of a text whose truth is here, with no
  test across repositories, on another cadence.
- **The raw file on GitHub**: a branch-dependent address on a third party's host, and nothing on
  the product's web.
- **A command-only flow** (`--agent auto` detecting folders, a `skill check` writing a sample):
  deterministic, but the folders exist only after an agent ran, and the asking and the never-rules
  belong to a text the agent reads first.
- **Each agent's own folder as well** (`.cursor/skills`, `.github/skills`, `.gemini/skills`,
  `.devin/skills`): every one reads `.agents/skills` too, and each extra copy is one more to drift.
- **Keeping `.codex/skills` for `codex`**: a skill in a folder Codex does not read.
- **A Spanish one-liner**: a second text to keep true for a prompt whose target is English anyway.
- **A fallback sentence for 1.9.0** in the prompt: compatibility text kept forever for a window
  of days, naming a retired folder.

## Consequences

- Until the 1.10.0 tag, `npx @meltemi/diagrams-cli@latest` is 1.9.0, which knows
  `--agent claude|codex|all` only: an agent following the hosted prompt reports the older version
  and stops. Releasing 1.10.0 close to the merge closes the gap. The real proof, pasting the
  one-liner into Claude Code and into Codex in an empty folder against the published package, is
  the owner's step after the tag.
- On 28 October 2026, after the tag, Codex (`codex exec`, its `workspace-write` sandbox with the
  network) ran the one-liner in an empty folder: it read the hosted prompt, checked Node and 1.10.0,
  asked which agents since the folder had none, installed `.claude/skills` and `.agents/skills`,
  drew `init`'s sign-in, validated it to `Checked 1 file: 0 errors, 0 warnings.` and exported the
  SVG, with no cloud command, token or commit. It found two faults, fixed the same day: the prompt
  was served as `text/markdown` with no charset, which PowerShell read as Latin-1, so `_headers`
  names `charset=utf-8`; and its sandbox could not run the machine's Node, so it downloaded one,
  which the prompt now forbids (it tells the person and stops).
- The same day, Claude Code (`claude -p`, allowed `npx`, `node`, file reads and writes and a
  fetch of diagrams.meltemi.dev) ran the one-liner in another empty folder: its fetch tool returned
  the prompt paraphrased, which was enough; it checked Node and 1.10.0, counted itself as the
  project's only agent and installed `.claude/skills` without asking, saying so in its report and
  offering the other folders; with no code to read it drew the setup flow itself rather than
  `init`'s sign-in, validated it to `Checked 1 file: 0 errors, 0 warnings.` on the first run and
  exported the SVG, with no cloud command, token or commit.
- A project installed by 1.9.0 keeps `.codex/skills/meltemi-diagrams`; running `skill install`
  again writes `.agents/skills`, and the old folder is the person's to delete.
- The family site's Diagrams page linking `https://diagrams.meltemi.dev/agent-setup/` belongs to
  Meltemi Web.
- New public surface: `skill prompt`, the agents' names, `SKILL_AGENTS` as a table of folders, the
  package's `agent-setup/` folder, the page and its address.
