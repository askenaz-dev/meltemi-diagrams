## MODIFIED Requirements

### Requirement: The agent setup prompt
The `@meltemi/diagrams-cli` package SHALL hold `agent-setup/prompt.md` (listed in its `files`), an English text of 500 to 1,000 words addressed to a coding agent, with the sections `# Set up Meltemi Diagrams for a coding agent`, `## What Meltemi Diagrams is`, `## Before you start`, `## Install the skill`, `## Prove it`, `## Never` and `## Next`, in that order. It SHALL tell the agent to check terminal access (and to hand the person the commands and stop when it has none), Node 22.12 or later (when it is missing or older, to tell the person and stop), the command line's version with `npx @meltemi/diagrams-cli@latest --version` or `mdg --version` (1.10.0 or later; when it is older, to tell the person that the published command line is older than the prompt needs and stop) and select the current agent by default, with other agents only on explicit request and no preliminary question about which agents the person uses; to use the selected project or the containing repository root without installing in sibling repositories, asking for a project folder only when a container holds several repositories and none is selected; to install with `npx @meltemi/diagrams-cli@latest skill install --agent <names>` in the project's root, reusing a usable copy already there and using `--user` and `--force` only when asked; to prove it with a sequence diagram of one real flow under `diagrams/` (at most six participants and twelve messages), choosing the flow without asking, or `init --template sequence` in a temporary folder and only its `diagrams/sign-in.meltemi` copied to the project when there is no suitable flow, with unused source and SVG filenames and no generated project configuration copied, validated until the last line reads `Checked 1 file: 0 errors, 0 warnings.` and exported to SVG whose path it reports with that line, without pausing after version checks or installation to ask whether to continue, reporting concrete blockers instead of claiming success, with `mdg preview` only when asked; and never to print, read, copy or commit a token (`mdg_…`), run `login`, `push`, `pull`, `publish` or any cloud command unasked, commit, stage or change the project's configuration, CI or instruction files beyond the skill folders without asking, add `--force` or `--user` unasked, install or download Node or any other tool, draw a picture by hand, edit an exported SVG or retype a Mermaid or PlantUML source. The text SHALL name no `pnpm` command and no `.codex` folder. `meltemi-diagrams skill prompt` SHALL print the file to stdout byte for byte and exit 0; `skill prompt` with any argument SHALL be a usage error (exit 2). The playground build SHALL copy the file unchanged to `dist/agent-setup/prompt.md`.

#### Scenario: The command prints the prompt
- **WHEN** `meltemi-diagrams skill prompt` runs
- **THEN** stdout is exactly the text of `packages/cli/agent-setup/prompt.md` and the exit code is 0

#### Scenario: The prompt has its sections and rules
- **WHEN** the prompt test reads `packages/cli/agent-setup/prompt.md`
- **THEN** the seven headings are found in order, the text holds `Checked 1 file: 0 errors, 0 warnings.`, `npx @meltemi/diagrams-cli@latest skill install`, `1.10.0`, `Node 22.12`, `If it is missing or older`, `--template sequence` and each never-rule, holds no `pnpm` and no `.codex`, and has 500 to 1,000 words

#### Scenario: A rule removed is caught
- **WHEN** the sentence about tokens (`mdg_…`) is removed from the prompt
- **THEN** the prompt test fails naming the missing rule

#### Scenario: An argument to `skill prompt`
- **WHEN** `meltemi-diagrams skill prompt es` runs
- **THEN** the exit code is 2 and the message says `skill prompt` takes no argument

#### Scenario: The hosted copy
- **WHEN** `pnpm playground:build` runs
- **THEN** `dist/agent-setup/prompt.md` is byte for byte the package's `agent-setup/prompt.md`

#### Scenario: The current agent is enough
- **WHEN** the person pastes the setup prompt into Codex without naming other agents
- **THEN** the prompt directs Codex to use `--agent codex` in the selected project and continue through a chosen example, validation and SVG export without asking which agents or flow to use

#### Scenario: No project is selected among several repositories
- **WHEN** the working folder contains several repositories and the person has not selected one
- **THEN** the prompt directs the agent to ask which project folder to use and not install across sibling repositories

#### Scenario: An existing skill or no suitable flow
- **WHEN** a usable skill already exists, or no suitable project flow is available
- **THEN** the prompt directs the agent to reuse the skill, generate the sequence template in a temporary folder if needed, copy only its source to an unused project filename and validate and export without overwriting files or changing project configuration
