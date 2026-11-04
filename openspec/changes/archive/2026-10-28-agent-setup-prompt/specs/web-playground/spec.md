## ADDED Requirements

### Requirement: Agent setup page
`pnpm playground:build` SHALL write `agent-setup/index.html` (English) and `es/agent-setup/index.html` (Spanish) to `dist/`, from `packages/playground/agent-setup/en.html` and `es.html`, beside `agent-setup/agent-setup.css` and `agent-setup/prompt.md` (the command line's prompt, copied unchanged). Each page SHALL be static: no script, no inline style, no resource from another origin, a `meta` Content-Security-Policy of exactly `default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'`, its `lang`, `rel="alternate"` links to its twin and the product version in its generator meta. Each SHALL hold, in its language, what the skill does, the one-line prompt in a `pre > code` block, the commands `npm install --global @meltemi/diagrams-cli` and `npx @meltemi/diagrams-cli@latest skill install --agent <names>`, a table of the agents with their `--agent` names and folders equal to the command line's `SKILL_AGENTS`, what the agent never does, and links to `prompt.md`, to the documentation for agents and to the playground; every `pre > code` block of the page SHALL be a fenced block of `docs/agents.md`; the two twins SHALL hold the same code blocks and the same external links; the page SHALL not scroll sideways at 375 pixels. Served by the cloud Worker, the four files SHALL carry `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff` from the build's `_headers`, and `prompt.md` SHALL be served as `text/markdown; charset=utf-8`.

#### Scenario: The build writes the page
- **WHEN** `pnpm playground:build` runs
- **THEN** `dist/agent-setup/index.html`, `dist/es/agent-setup/index.html`, `dist/agent-setup/agent-setup.css` and `dist/agent-setup/prompt.md` exist, the two pages declare the policy above and no `<script`, and `prompt.md` equals `packages/cli/agent-setup/prompt.md`

#### Scenario: The page in the browser
- **WHEN** the browser suite opens `agent-setup/` and `es/agent-setup/`
- **THEN** each shows its heading and the one-line prompt, links `prompt.md`, logs no console error, and at 375 pixels wide does not scroll sideways

#### Scenario: Served by the Worker
- **WHEN** `/agent-setup/`, `/es/agent-setup/`, `/agent-setup/prompt.md` and `/agent-setup/agent-setup.css` are requested on the Worker's origin
- **THEN** each answers `200` with `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff`, and the prompt is served as `text/markdown; charset=utf-8` with the package's file as its body

#### Scenario: The page's commands are the documentation's
- **WHEN** the agent-setup test reads `en.html` and `docs/agents.md`
- **THEN** every `pre > code` block of the page is one of the page's fenced blocks, the one-line prompt and `npx @meltemi/diagrams-cli@latest skill install --agent <names>` among them, and the agents table's rows are `SKILL_AGENTS`'s names and folders

#### Scenario: A command the documentation does not have
- **WHEN** `en.html` gains a `pre > code` block whose text is in no fenced block of `docs/agents.md`, or a row of its agents table names a folder `SKILL_AGENTS` does not
- **THEN** the agent-setup test fails naming the page and the block or the row

#### Scenario: A twin that differs
- **WHEN** the English page's one-line prompt block gains a word the Spanish page's does not, or a page gains an external link its twin lacks
- **THEN** the agent-setup test fails naming the two files and the block or the link

#### Scenario: A script or an inline style in a page
- **WHEN** `en.html` gains a `<script>` tag or a `style=` attribute
- **THEN** the agent-setup test fails naming the file and the tag or attribute

## MODIFIED Requirements

### Requirement: Continuing locally
The page SHALL download the project as a `.zip` with `project.json` and every file at its path,
which `meltemi-diagrams validate` and VS Code open as is, and SHALL show how to continue: the CLI's
`init`, `validate`, `export`, `build catalog` and `skill install` commands (the last labelled
"Give your coding agents the skill", in the page's language) and the VS Code extension.

#### Scenario: Archive validates
- **WHEN** the `c4` template is downloaded as `.zip` and extracted
- **THEN** `meltemi-diagrams validate` on the folder reports no diagnostic

#### Scenario: The skill in the commands
- **WHEN** the Continue locally dialog opens, in English and then in Spanish
- **THEN** its commands list ends with `meltemi-diagrams skill install` under "Give your coding agents the skill" and under "Dar la skill a tus agentes de programación"

#### Scenario: A project without a manifest
- **WHEN** the dialog opens on a project whose files hold no `project.json`
- **THEN** the commands name the folder `diagrams` and still list `skill install`, which takes no folder

### Requirement: Notices and versions
The page SHALL show its version and the generator's name, and an About dialog with the licence of
the product (MIT) and of every bundled component, linking to `NOTICES.md`: EPL-2.0 for elkjs with
its source link, OFL-1.1 for the fonts, MIT for the others, and linking "Drawing with coding
agents" (in the page's language) to the agent setup page in that language, `agent-setup/` or
`es/agent-setup/`, a relative address that resolves under the Worker and under a static server's
sub-path. `pnpm licenses:inventory
--check` SHALL cover the playground's bundled packages.

#### Scenario: Notices
- **WHEN** `NOTICES.md` of the built site is read
- **THEN** it names elkjs under EPL-2.0 with a link to its source and Inter under OFL-1.1

#### Scenario: The agents link
- **WHEN** the About dialog opens
- **THEN** it holds a link named "Drawing with coding agents" whose `href` is `agent-setup/`, and `agent-setup/prompt.md` fetched from the page's origin starts with `# Set up Meltemi Diagrams for a coding agent`

#### Scenario: The agents link in Spanish
- **WHEN** the About dialog opens in the Spanish interface
- **THEN** its link is named "Dibujar con agentes de programación" and its `href` is `es/agent-setup/`

#### Scenario: The list cannot be read
- **WHEN** `notices.json` cannot be fetched or is not JSON
- **THEN** the dialog says the list could not be read and points at `NOTICES.md`, and the agents link is still there
