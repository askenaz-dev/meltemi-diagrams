# Documentation

[Español](es/README.md)

Meltemi Diagrams turns `.meltemi` text files into professional diagrams, edited as code or on a
canvas, animated, and exported for documents, slides, the web and video.

## Start

- [Getting started](getting-started.md): install, a first project, the canvas and the exports.
- [Features](features.md): everything 1.0 does, by area.
- [Gallery](../gallery/README.md) and the [purchase example](../examples/purchase/README.md).
- [Compatibility and known limitations](compatibility.md).

## AI and agents

- [Diagram with AI agents: skill and MCP](agents.md): turn project code or a description into
  editable diagrams with your coding agent. Choose the skill for local files, MCP for project
  tools, or both for shared editing with the browser.
- [Built-in AI assistance](assist.md): generate a first diagram, propose changes, suggest missing
  relations or explain a diff from the CLI and VS Code, with your own provider and review before
  applying.

## Coming from another tool

- [From Mermaid](tracks/from-mermaid.md)
- [From PlantUML](tracks/from-plantuml.md)
- [From a visual editor](tracks/from-visual-editors.md) such as draw.io, Lucidchart or Visio

## The language

| Topic                                                     | Reference                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Syntax, flow diagrams, placement and styles               | [grammar](language/grammar-0.2.md)                                   |
| Free compositions                                         | [free](language/free.md)                                             |
| Sequence diagrams and scenarios                           | [sequence](language/sequence.md)                                     |
| Gantt charts: tasks scheduled on a calendar               | [gantt](language/gantt.md)                                           |
| Models and C4 views                                       | [C4](language/c4.md)                                                 |
| Layout, ports, constraints and checks                     | [layout](language/layout.md)                                         |
| Themes, classes and presets                               | [styles](language/styles.md)                                         |
| Icons, images and fonts                                   | [assets](language/assets.md), [fonts](language/fonts.md)             |
| Motion effects and stories                                | [motion](language/motion.md), [stories](language/stories.md)         |
| Exports and export profiles                               | [export](language/export.md), [SVG](language/svg-export.md)          |
| Projects and imports between files                        | [projects](language/projects.md)                                     |
| Formatting                                                | [formatting](language/formatting.md)                                 |
| Every diagnostic                                          | [diagnostics](language/diagnostics.md)                               |
| The model JSON interchange format                         | [model JSON](language/model-json.md)                                 |
| How the language changes, and how implementations conform | [policy](language/policy.md), [conformance](language/conformance.md) |

## Tools

- [Local workspace with Docker Compose](local-compose.md): start the editor, backend and MCP with
  one command, then install the Claude Code or Codex plugin from the local setup prompt.
- [The command line](cli.md): `init`, `preview`, `validate`, `format`, `layout`, `import`,
  `export`, `build catalog`, `review`, `assist`, CI, and the cloud commands (`login`, `push`,
  `pull`, `publish`, `projects`) that keep a project in step with the cloud service.
- [The editor for VS Code](editor.md): language features and the canvas.
- [The web app](web-app.md): everything in a browser tab, and projects in the cloud when you
  sign in, shared by link, with people, worked on together live and published as web pages.
- [The cloud service](cloud.md): the Worker behind the hosted web app, with its optional
  account, API tokens, the command line's sign-in and projects kept in the cloud: rooms, versions,
  thumbnails and quotas; sharing and permissions; the presence the room relays; and publishing on a
  host of its own.
- [The HTML player](player.md) and [the catalog](catalog.md).
- [Importing Mermaid](import/mermaid.md) and [PlantUML](import/plantuml.md): what each construct
  becomes.
- [Plugins](plugins.md) and [safety](security.md).

## Compatibility and updates

- [Compatibility and known limitations](compatibility.md), including supported exports and hosts.
- [Performance](performance.md): limits and measured behaviour.
- [Changelog](../CHANGELOG.md): changes in each release.
