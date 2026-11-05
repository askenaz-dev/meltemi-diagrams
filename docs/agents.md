# Drawing with coding agents

[Español](es/agents.md)

Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, Devin Desktop and other coding agents draw,
convert and export Meltemi diagrams with the `meltemi-diagrams` skill: a workflow, a template, the
rules that save iterations, references for the language, layout, themes, C4, sequence diagrams,
free compositions, stories and converting, and complete examples. An agent that reads it writes
`.meltemi` files, validates them with the command line and fixes what it reports, instead of
drawing pictures by hand. This page is on the web too, at
[diagrams.meltemi.dev/agent-setup](https://diagrams.meltemi.dev/agent-setup/), linked from the
app's About dialog.

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

## Through the MCP endpoint

The hosted service has an MCP endpoint, `https://diagrams.meltemi.dev/mcp`, through which an agent
works on the projects of your Meltemi account instead of a folder: it creates projects, writes and
validates their `.meltemi` files, looks at the drawings as pictures drawn on the server, and shares
them, runs a live session or publishes them when you ask. Connect Codex with OAuth: you sign in in
the browser and approve what it asks for (reading and writing your projects, sharing them, live
sessions, publishing):

```bash
codex mcp add meltemi --url https://diagrams.meltemi.dev/mcp
codex mcp login meltemi
```

Or with an API token that you make in the app's **API tokens** dialog (the account menu), kept in
the environment as `MELTEMI_TOKEN` and never written in a file, in `~/.codex/config.toml`:

```toml
[mcp_servers.meltemi]
url = "https://diagrams.meltemi.dev/mcp"
bearer_token_env_var = "MELTEMI_TOKEN"
```

The skill's reference for the endpoint teaches the agent its tools and their workflow. It reads a
project before it writes, and writes with the revision it read (`ifRevision`), so a change you made
in the browser meanwhile is never overwritten; it gives each change a key, so a retry applies it
once; it validates, looks at the preview and gives you the address that opens the project, where
an open page shows each change without a reload. It shares, invites, starts a live session or
publishes only when you ask, and says what it did: an invitation is a link it can give you, and no
email is sent (the tool answers `emailSent: false`). It never prints a token, or an invitation's or
a live session's link you did not ask for. The scopes you grant never add a role: an account that
is an editor of a project writes there, but only its owner shares or publishes it. The tools and
their rules are in [the MCP endpoint](cloud.md#the-mcp-endpoint), and how the endpoint is accepted
in [MCP acceptance](quality/mcp-acceptance.md).

## Through the local server

The command line serves the same tools on your machine: `mdg mcp`, a local MCP server over
Streamable HTTP. It acts on the projects of your account through the service's API, with your
`mdg login` (or `MELTEMI_TOKEN` in its environment), and draws the previews, checks the files and
builds the catalogs on your machine, with the engine the endpoint uses: the same tools, the same
answers and the same pictures. Choose it for an agent that runs on your machine (Codex's command
line or app, Claude Code, Cursor); a client that only reaches an address on the internet uses the
endpoint. Start it in a terminal and keep it running while the agent works:

```bash
npx -y @meltemi/diagrams-cli@latest mcp
```

It prints its address, `http://127.0.0.1:7373/mcp` (`--port` picks another). Connect the agent to
it once:

```bash
codex mcp add meltemi --url http://127.0.0.1:7373/mcp
```

```bash
claude mcp add --transport http meltemi http://127.0.0.1:7373/mcp
```

In Cursor, `.cursor/mcp.json` holds `{ "mcpServers": { "meltemi": { "url": "http://127.0.0.1:7373/mcp" } } }`.
Without a sign-in the server still starts, and its tools answer `auth.required` until you run
`mdg login` in another terminal; the next call uses it.

With `--folder`, it serves two tools, `validate` and `preview`, over the `.meltemi` files of a folder
on disk, with no account and no network: an agent working in a repository writes the files with its
own tools and looks at them as pictures.

```bash
npx -y @meltemi/diagrams-cli@latest mcp --folder .
```

It listens on `127.0.0.1` only and refuses requests from web pages. On a computer other people sign
in to, set `MELTEMI_MCP_KEY` (16 characters or more) in the server's environment and in the agent's:
every request must then carry it as its bearer token (`--bearer-token-env-var MELTEMI_MCP_KEY` for
Codex, `--header "Authorization: Bearer …"` for Claude Code). The command, its options and its
refusals are in [the command line](cli.md#the-local-mcp-server-mcp).

## In this repository

The canonical skill is `skills/meltemi-diagrams/`; `pnpm skills:sync` copies it to
`.claude/skills/`, `.agents/skills/` and the command line's package, and a test fails when a copy
drifts. The setup prompt is `packages/cli/agent-setup/prompt.md`, which the web app's build
serves beside the page `agent-setup/`. See [the command line](cli.md#agents-skill) for
`skill install` and `skill prompt`.
