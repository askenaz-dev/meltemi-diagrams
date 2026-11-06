# Diagram with AI agents: skill and MCP

[Español](es/agents.md)

Turn a description, your project's code or an existing diagram into an editable Meltemi diagram
with the AI agent you already use. Ask it to document a real flow, convert Mermaid or PlantUML,
update an architecture view after a code change, or create a diagram you can adjust together in
the browser. The result is `.meltemi` source you can review and edit, plus a preview or export.

Claude Code, Codex, Cursor and other coding agents can use the `meltemi-diagrams` **skill** and
Meltemi's **MCP tools**. They do different jobs and can work together. Your agent supplies the AI
model; installing the skill or connecting MCP does not configure a model for Meltemi's separate
[built-in AI assistance](assist.md).

## Skill or MCP?

| Part            | What it gives your agent                                                                                                              | When you need it                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Skill**       | Instructions, examples and language references: how to choose a diagram, write valid `.meltemi`, preserve layout and check the result | Teach your agent to draw and edit Meltemi diagrams. With file and terminal access, it can use the CLI directly |
| **MCP**         | Tools to read projects, validate source and inspect diagram previews; the project service also supports writing, versions and sharing | Let your agent act on a Meltemi project and see its rendered result through its own tool interface             |
| **Skill + MCP** | Diagramming guidance together with tools that operate on your project                                                                 | Work on the same project as the browser editor, with the agent checking its drawing as it goes                 |

A skill is knowledge, not a connection to your account. MCP is a connection to tools, not an AI
model. Connecting MCP does not install the skill; installing the skill does not grant project
access.

## Choose where your diagrams live

| Your goal                                                          | Start here                                                                                                                               | What you get                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Keep diagrams beside code in Git                                   | [Install the skill](#installing-the-skill) and use the CLI                                                                               | Local `.meltemi` files and exports; no Meltemi account or MCP required               |
| Let the agent inspect diagrams from a local repository through MCP | Add [folder mode](#through-the-local-server), `mdg mcp --folder .`, to the skill                                                         | `validate` and `preview` tools; the agent edits files with its own file tools        |
| Edit a project saved in your Meltemi account                       | Connect the [hosted MCP endpoint](#through-the-mcp-endpoint), or use the [local MCP server](#through-the-local-server) with your account | Read and write the same project as the web app, inspect previews and return its URL  |
| Work with an agent and browser together on your machine            | Start the [Docker workspace](#with-the-docker-workspace) and install its agent plugin                                                    | Skill and MCP configured together for the local backend; no Meltemi account or token |

For a repository, start with the setup prompt below. For a project already open in the local
Docker editor, use **Set up my agent** there: it keeps the agent connected to that project.

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

Name what to draw and the source the agent should use. Give it the relevant code, document or
existing diagram rather than asking it to guess how your system works.

| Ask your agent                                                                                      | Useful result                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| "Read the checkout handlers and draw the approved and declined payment flows as a sequence diagram" | A diagram grounded in your implementation, with both scenarios         |
| "Make a C4 container view from `docs/architecture.md`; mark anything you had to infer"              | A reviewable architecture view with uncertain relationships identified |
| "Convert `diagrams/billing.mmd` to Meltemi and keep its layout"                                     | Editable source imported from Mermaid                                  |
| "Update the login diagram for the code changes in this branch, preserving my manual positions"      | Documentation updated alongside the implementation                     |
| "Plan the launch from `docs/plan.md` as a Gantt chart"                                              | Tasks and dependencies you can adjust on the canvas                    |

Ask it to validate the result, inspect the preview and tell you where to open it. With the CLI,
that means a source file and SVG, with `mdg preview` when you want a browser preview. With a
project MCP connection, ask it to return the project's URL so you can continue on the same canvas.

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
their rules are in [the cloud reference](cloud.md#the-mcp-endpoint).

## Through the local server

Use local MCP when your agent runs on your machine and you want validation and drawing to run
there too. It has two modes: **account projects** by default, and **local files** with `--folder`.
Starting the default server does not turn a disk folder into a shared browser project; use the
[Docker workspace](local-compose.md) for that.

The command line serves the account tools on your machine: `mdg mcp`, a local MCP server over
Streamable HTTP. It acts on the projects of your account through the service's API, with your
`mdg login` (or `MELTEMI_TOKEN` in its environment), and draws the previews, checks the files and
builds the catalogs on your machine, with the engine the endpoint uses: the same tools, the same
answers and the same pictures. Choose it for an agent that runs on your machine (Codex's command
line or app, Claude Code, Cursor); a client that only reaches an address on the internet uses the
endpoint. If the hosted endpoint answers `renderer.unavailable`, use this mode to keep working
on the same account projects with local rendering. Start it in a terminal and keep it running
while the agent works:

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

## With the Docker workspace

[The local Docker workspace](local-compose.md) starts the editor, backend and MCP together with
`docker compose up`, without an account or token. **Set up my agent** in the editor gives you a
prompt that installs the real Meltemi plugin and its native MCP entry for Claude Code or Codex.
The plugin edits the same backend project as the open browser; it does not require a host CLI
or another `mdg mcp` process. Follow its client activation continuation before diagramming.
