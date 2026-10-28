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
   `.github/copilot-instructions.md`, `.gemini/`, `.devin/` or `.windsurf/`, count yourself among
   them, and ask the person when it is unclear.

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
