# Drawing with coding agents

[Español](es/agents.md)

Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, Devin Desktop and other coding agents draw,
convert and export Meltemi diagrams with the `meltemi-diagrams` skill: a workflow, a template, the
rules that save iterations, references for the language, layout, themes, C4, sequence diagrams,
free compositions, stories and converting, and complete examples. An agent that reads it writes
`.meltemi` files, validates them with the command line and fixes what it reports, instead of
drawing pictures by hand. This page is on the web too, at
[diagrams.meltemi.dev/agent-setup](https://diagrams.meltemi.dev/agent-setup/), linked from the
playground's About dialog.

## The prompt

Paste this into your coding agent, in your project:

```text
Set up Meltemi Diagrams in this project so you can draw diagrams as code, and prove it works — you'll need terminal access on this machine and Node 22.12 or later. First read https://diagrams.meltemi.dev/agent-setup/prompt.md and follow it. Install the meltemi-diagrams skill for the coding agents this project uses (ask me if it's unclear which) with `npx @meltemi/diagrams-cli@latest skill install`. Then prove it: write a small sequence diagram of one flow of this project, validate it until no diagnostic remains, export the SVG, and show me the validation's last line and where the SVG is. Never sign in to the cloud, never print or commit a token, and don't commit or change my project's configuration beyond the skill folders without asking me first.
```

The agent reads the setup prompt at `https://diagrams.meltemi.dev/agent-setup/prompt.md` and
follows it: it checks Node and the command line's version, installs the skill for the agents your
project uses (asking you when that is unclear), proves it draws and tells you what it did. The
prompt needs the command line 1.10.0 or later; an agent that finds an older one says so and stops.
An agent without web access prints the same text with the command line:

```bash
npx @meltemi/diagrams-cli@latest skill prompt
```

## Installing the skill

The command line ships the skill. Install the command line once:

```bash
npm install --global @meltemi/diagrams-cli
```

Then, in a project's folder:

```bash
mdg skill install
```

It writes the skill into the folders the agents read skills from:
`.claude/skills/meltemi-diagrams/` for Claude Code, and `.agents/skills/meltemi-diagrams/`, the
cross-agent folder, for the others. `--agent` names the agents, one or several separated by commas
(`--agent claude,codex`), or `all`, the default; a folder several agents share is written once.

| Agent                                       | `--agent`  | Folder           |
| ------------------------------------------- | ---------- | ---------------- |
| Claude Code                                 | `claude`   | `.claude/skills` |
| Codex                                       | `codex`    | `.agents/skills` |
| Cursor                                      | `cursor`   | `.agents/skills` |
| GitHub Copilot                              | `copilot`  | `.agents/skills` |
| Gemini CLI                                  | `gemini`   | `.agents/skills` |
| Windsurf                                    | `windsurf` | `.agents/skills` |
| Devin Desktop                               | `devin`    | `.agents/skills` |
| Any other agent that reads `.agents/skills` | `agents`   | `.agents/skills` |

`--user` writes your own folders (`~/.claude/skills`, `~/.agents/skills`), for every project. A
copy already there is kept unless you add `--force`, which replaces only the skill's own folder.
The command writes skill folders only, never `AGENTS.md`, `CLAUDE.md` or another file of the
project. Without the command line installed, in the project's folder:

```bash
npx @meltemi/diagrams-cli@latest skill install --agent <names>
```

The installed skill names the commands as they are installed (`mdg validate`, `mdg export`,
`mdg preview`), so the agent runs what your project has. By hand: copy `skills/meltemi-diagrams/`
from the package (`node_modules/@meltemi/diagrams-cli/skills/`) to the folder your agent reads
skills from, or point the agent's instructions (an `AGENTS.md`, for instance) at its `SKILL.md`.

## What the agent proves

Following the prompt, the agent picks one real flow of your project (a sign-in, a checkout, a
request through the services) and writes it as a small sequence diagram under `diagrams/`, at most
six participants and twelve messages. In a folder with no code to read, it uses the sign-in that
`mdg init --template sequence` writes. It validates the sheet until the last line reads
`Checked 1 file: 0 errors, 0 warnings.`, exports the SVG beside it and tells you that line, where
the SVG is and which folders the skill went to. It starts `mdg preview`, a local server, only when
you ask to look at the result in a browser.

## What it never does

- Print, read, copy or commit a token (an `mdg_…` value, `MELTEMI_TOKEN`, the credentials file).
- Sign in, push, pull, publish or run any other cloud command unless you ask for it.
- Commit or stage anything, or change your configuration, CI or agent instruction files beyond the
  skill folders, without asking you first.
- Add `--force` or `--user` on its own.
- Install or download Node or any other tool on its own: when Node is missing or older than
  22.12, it tells you and stops.
- Draw a picture by hand, edit an exported SVG or retype a Mermaid or PlantUML source, which
  `mdg import` converts.

## Asking for a diagram

Ask in your own words, naming what to draw and from what: "draw the checkout service from
`docs/architecture.md` as a flow diagram", "convert `diagrams/billing.mmd` to Meltemi and keep its
layout", "add a sequence diagram of the payment with an approved and a declined scenario", "make a
C4 container view of the shop". The skill tells the agent to import Mermaid and PlantUML sources
instead of retyping them, to choose the profile (flow, free, sequence or C4), to validate until no
diagnostic remains and to export SVG for you to look at with `mdg preview`.

## In this repository

The canonical skill is `skills/meltemi-diagrams/`; `pnpm skills:sync` copies it to
`.claude/skills/`, `.agents/skills/` and the command line's package, and a test fails when a copy
drifts. The setup prompt is `packages/cli/agent-setup/prompt.md`, which the playground build
serves beside the page `agent-setup/`. See [the command line](cli.md#agents-skill) for
`skill install` and `skill prompt`.
