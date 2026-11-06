# Built-in AI assistance

[Español](es/assist.md)

Ask for a first diagram, a change to an existing one, or an explanation of a diff without leaving
VS Code or the command line. Meltemi sends your request and the relevant `.meltemi` sources to the
model you configure. Changes come back as a **proposal**: you review the diff and choose the items
to apply.

Use it for a focused task on a diagram. If you want your coding agent to read your application,
document its architecture, or work on projects open in the web editor, start with
[Drawing with agents: skill and MCP](agents.md). A skill teaches that agent how to draw; MCP gives
it tools to work with Meltemi. Neither configures the provider used by this built-in assistance.

Built-in assistance is available in the **VS Code extension and CLI**, with your own provider
configuration. It is not a chat in the browser editor. You do not need a Meltemi account to use it
on local files. Validation, layout, export, catalogs and source reviews work without AI.

## Choose a task

| You want to…               | Operation   | Example request                                                                        |
| -------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| Start from a description   | `generate`  | “Draw the checkout as a sequence diagram, including a declined payment.”               |
| Revise an existing diagram | `modify`    | “Add a cache between the API and the database; keep the existing labels.”              |
| Find gaps to check         | `relations` | Suggest missing relations; inferred ones are marked as assumptions for you to confirm. |
| Prepare a review           | `explain`   | Explain the changes since `main` for the person reviewing the diagram.                 |

Generation creates a new sheet and may reuse imported project models. Modification can add or
remove elements, change a view for an audience, or add a story. These are source changes you can
keep in Git and continue editing on the canvas.

## Set up a provider

In VS Code, install [the Meltemi Diagrams extension](editor.md), open **Meltemi Diagrams › Assist**
in Settings and choose a provider. Set the model and endpoint when needed, then use
**Meltemi Diagrams: Set AI Key…** from the Command Palette to store its key. Open a `.meltemi`
file and run **Meltemi Diagrams: Modify with AI…**, or use **Generate Diagram with AI…** to start
a new one. VS Code shows the proposed diff and lets you select its items before applying them.

For the command line, install the CLI:

```bash
npm install --global @meltemi/diagrams-cli
```

Configure the provider in your terminal's environment:

| Provider            | Settings                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic`         | Key in `ANTHROPIC_API_KEY` (or VS Code's secret storage); model `claude-opus-5-5` by default                                                             |
| `openai-compatible` | `MELTEMI_AI_BASE_URL` such as `http://127.0.0.1:11434/v1` (Ollama, llama.cpp, LM Studio) and `MELTEMI_AI_MODEL`; an optional key in `MELTEMI_AI_API_KEY` |

For Anthropic, set `MELTEMI_AI_PROVIDER` to `anthropic` and supply `ANTHROPIC_API_KEY`. For a
local or remote OpenAI-compatible server, set `MELTEMI_AI_PROVIDER` to `openai-compatible`,
`MELTEMI_AI_BASE_URL` to its endpoint and `MELTEMI_AI_MODEL` to a model it serves; supply
`MELTEMI_AI_API_KEY` if that server requires it. Start a local model server separately before
making a request.

The command line reads `MELTEMI_AI_PROVIDER`, `MELTEMI_AI_MODEL`, `MELTEMI_AI_BASE_URL`,
`MELTEMI_AI_API_KEY` and `ANTHROPIC_API_KEY`, or `--provider`, `--model` and `--base-url`. Keys are
never options (they would end in shell history) and never in project files. VS Code reads
**Meltemi Diagrams › Assist** settings and keeps the key in its secret storage (**Set AI Key…**,
**Clear AI Key**). Errors never show a key.

## Make and review a first change

From a project with an existing diagram, ask for a small change and save its proposal:

```bash
mdg assist modify architecture/diagrams/containers.meltemi --prompt "Add a cache for the API" --save cache.json
```

Replace the path with your file. The command shows the destination and the files it will send,
then asks for confirmation. After it returns, read the numbered changes:

```text
Proposal for architecture/diagrams/containers.meltemi (revision cn-b374b3a1, anthropic claude-opus-5-5): A cache in front of the database
  1. replace diagram containers: Reads go through a cache
       + element shop.cache "Cache"
       + relation cache (API → Cache: Reads)
Saved cache.json; apply with meltemi-diagrams assist apply cache.json --items <list>
```

Accept only the items you want; for this example, item 1:

```bash
mdg assist apply cache.json --items 1
```

The source file changes only when you apply the proposal. Open it in the editor to inspect the
diagram and review its source diff before committing. You can discard `cache.json` without
applying it.

## What is sent

Before anything is sent you see where it goes and what it holds:

```text
This request goes to anthropic (claude-opus-5-5) at https://api.anthropic.com, with:
  diagrams/containers.meltemi (0.6 KB, the file)
  models/commerce.meltemi (0.9 KB, imported by it)
  your request (31 characters)
  the language guide
Send it? [y/N]
```

A request carries the file and the files it imports (a new file: the project's models and themes,
which it may import), at most 12 files and 200 KB, under paths relative to the project, plus the
language guide (the agent skill's references). No other repository content is included in that
request. A local endpoint is marked as on this machine. Validation, layout and export do not call
the model.

## Proposals

- **Items** are whole blocks (a diagram, model, story, theme or export profile), a new file, or a
  relation; each lists what it changes, as `review` does.
- **Partial acceptance**: choose items with `--items 1,3` (or `--apply 1,3` at once); in VS Code,
  the proposal opens as a diff and a list lets you pick; accepted items apply as one undo step.
- **Known revision**: a proposal records the text it was made against. If the file changed since,
  items whose block changed are left out as conflicts and the others apply.
- **Validation**: the result is compiled in its project; if it has errors the current text does
  not, nothing is written. When the whole proposal adds errors, they go back to the model once for
  a corrected answer.

## Assumptions

Relations the assistant infers are written with `assumption "<why>"`:

```text
api -> cache: "Reads" { assumption "Reads of orders are usually cached" }
```

They are drawn dashed in the muted colour, badged in the catalog and reported by `review`. To
confirm one, remove its `assumption` line; in VS Code the quick fix **Confirm the relation** does
it. Models take `assumption` too, and a C4 view relation is an assumption when every model relation
it stands for is one.

## Explanations

```bash
mdg assist explain architecture --base main
```

prints a short explanation of the review between `main` and the working tree (or `--before
<path>`). VS Code's **Explain Changes with AI** explains the changes since the last commit in a
Markdown document.
