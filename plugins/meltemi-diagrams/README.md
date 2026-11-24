# Meltemi Diagrams for coding agents

The plugin of [Meltemi Diagrams](https://diagrams.meltemi.dev): diagrams as code that your team
reviews in Git and adjusts on a canvas. It gives your agent:

- **The skill**, `meltemi-diagrams`: how to choose between the five profiles (flow, sequence, C4,
  free and gantt), write valid `.meltemi` files, keep a sheet readable, import Mermaid and
  PlantUML, export SVG, PNG and PDF, and look at the picture before delivering.
- **MCP tools** (Claude Code): `validate`, `inspect_story` and `preview` over the `.meltemi` files of
  the project's folder, run on your machine by `mdg mcp --stdio --folder <project>`, with no account
  and no network.

## Install

Claude Code:

```text
/plugin marketplace add askenaz-dev/meltemi-diagrams
/plugin install meltemi-diagrams@meltemi
```

Codex, which takes the skill from the plugin and the MCP server from one line run in the
project's folder:

```bash
codex plugin marketplace add askenaz-dev/meltemi-diagrams
codex plugin add meltemi-diagrams@meltemi
codex mcp add meltemi -- npx -y @meltemi/diagrams-cli@latest mcp --stdio --folder .
```

The MCP server is the project's own `@meltemi/diagrams-cli` when it has one, and the latest
published one otherwise; the first start downloads it, so run
`npx -y @meltemi/diagrams-cli@latest --version` once if your client gives servers little time to
start. It needs Node 22.12 or later; PNG and PDF exports use an installed Edge or Chrome.

More, in English and Spanish: [drawing with coding agents](../../docs/agents.md).

The icon is the Meltemi Diagrams glyph from `brand/`, which follows the Meltemi brand's terms, not
the MIT licence of the code.
