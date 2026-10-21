# AI assistance

[Español](es/assist.md)

Assistance is optional help to write and change `.meltemi` sources. Validation, layout, export,
catalogs and reviews never use it, and a project works the same without it. Every answer becomes a
**proposal**: whole blocks to replace, add or remove, a new file, or relations marked as
assumptions. You see what each item changes, accept any of them, and nothing is written that adds
errors (decision 0029).

| Operation   | What it does                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `generate`  | Writes a first structure from a description: a new sheet, which may import the project's models |
| `modify`    | Changes a sheet as you ask: new elements, a view for an audience, a story, a renamed entity…    |
| `relations` | Suggests relations that are probably missing, each marked with `assumption "<why>"`             |
| `explain`   | Explains what changed since a Git revision or another version, for a reviewer                   |

## Providers and keys

| Provider            | Settings                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic`         | Key in `ANTHROPIC_API_KEY` (or VS Code's secret storage); model `claude-opus-5-5` by default                                                             |
| `openai-compatible` | `MELTEMI_AI_BASE_URL` such as `http://127.0.0.1:11434/v1` (Ollama, llama.cpp, LM Studio) and `MELTEMI_AI_MODEL`; an optional key in `MELTEMI_AI_API_KEY` |

The command line reads `MELTEMI_AI_PROVIDER`, `MELTEMI_AI_MODEL`, `MELTEMI_AI_BASE_URL`,
`MELTEMI_AI_API_KEY` and `ANTHROPIC_API_KEY`, or `--provider`, `--model` and `--base-url`. Keys are
never options (they would end in shell history) and never in project files. VS Code reads
**Meltemi Diagrams › Assist** settings and keeps the key in its secret storage (**Set AI Key…**,
**Clear AI Key**). Errors never show a key.

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
language guide (the agent skill's references). Nothing else of the repository is sent, and no
other command sends anything. A local endpoint is marked as on this machine.

## Proposals

```bash
pnpm mdg assist modify architecture/diagrams/containers.meltemi --prompt "Add a cache for the API" --save cache.json
```

```text
Proposal for architecture/diagrams/containers.meltemi (revision cn-b374b3a1, anthropic claude-opus-5-5): A cache in front of the database
  1. replace diagram containers: Reads go through a cache
       + element shop.cache "Cache"
       + relation cache (API → Cache: Reads)
Saved cache.json; apply with meltemi-diagrams assist apply cache.json --items <list>
```

```bash
pnpm mdg assist apply cache.json --items 1
```

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
pnpm mdg assist explain architecture --base main
```

prints a short explanation of the review between `main` and the working tree (or `--before
<path>`). VS Code's **Explain Changes with AI** explains the changes since the last commit in a
Markdown document.
