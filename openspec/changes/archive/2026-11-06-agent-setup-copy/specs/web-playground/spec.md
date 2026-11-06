## MODIFIED Requirements

### Requirement: Agent setup page
`pnpm playground:build` SHALL write `agent-setup/index.html` (English) and `es/agent-setup/index.html` (Spanish) to `dist/`, from `packages/playground/agent-setup/en.html` and `es.html`, beside `agent-setup/agent-setup.css`, `agent-setup/copy-prompt.js` and `agent-setup/prompt.md` (the command line's prompt, copied unchanged). Each page SHALL remain readable without JavaScript and load only the same-origin copy module, with no inline script/style or resource from another origin, a `meta` Content-Security-Policy of exactly `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'`, its `lang`, `rel="alternate"` links to its twin and the product version in its generator meta. Each SHALL hold, in its language, what the skill does, the one-line prompt in a `pre > code` block, the commands `npm install --global @meltemi/diagrams-cli` and `npx @meltemi/diagrams-cli@latest skill install --agent <names>`, a table of the agents with their `--agent` names and folders equal to the command line's `SKILL_AGENTS`, what the agent never does, and links to `prompt.md`, to the documentation for agents and to the playground; every `pre > code` block of the page SHALL be a fenced block of `docs/agents.md`; the two twins SHALL hold the same code blocks and the same external links; the page SHALL not scroll sideways at 375 pixels. Served by the cloud Worker, all five files SHALL carry `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff` from the build's `_headers`, and `prompt.md` SHALL be served as `text/markdown; charset=utf-8`.

#### Scenario: The build writes the page
- **WHEN** `pnpm playground:build` runs
- **THEN** `dist/agent-setup/index.html`, `dist/es/agent-setup/index.html`, `dist/agent-setup/agent-setup.css`, `dist/agent-setup/copy-prompt.js` and `dist/agent-setup/prompt.md` exist, the two pages declare the policy above and only their copy module, and `prompt.md` equals `packages/cli/agent-setup/prompt.md`

#### Scenario: The page in the browser
- **WHEN** the browser suite opens `agent-setup/` and `es/agent-setup/`
- **THEN** each shows its heading and the one-line prompt, links `prompt.md`, logs no console error, and at 375 pixels wide does not scroll sideways

#### Scenario: Served by the Worker
- **WHEN** `/agent-setup/`, `/es/agent-setup/`, `/agent-setup/prompt.md`, `/agent-setup/agent-setup.css` and `/agent-setup/copy-prompt.js` are requested on the Worker's origin
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
- **WHEN** `en.html` gains a script other than the single copy module, an inline event handler or a `style=` attribute
- **THEN** the agent-setup test fails naming the file and the tag or attribute

## ADDED Requirements

### Requirement: Copy the setup prompt

The One prompt block SHALL offer a keyboard-accessible copy icon at its upper-right in English
and Spanish. It SHALL copy exactly its `code` text, confirm success with a check icon and localized
live status, and reset afterward. Clipboard failure SHALL select the prompt, show localized manual
copy instructions and allow retry without claiming success. Without JavaScript the prompt SHALL
remain readable/selectable and the inactive button SHALL remain hidden.

#### Scenario: Copy with the keyboard

- **WHEN** the person activates the copy button with Enter
- **THEN** the clipboard equals the complete prompt text and localized copied feedback is announced

#### Scenario: Clipboard refusal and retry

- **WHEN** the browser refuses copying and the person later retries with clipboard access available
- **THEN** the refusal selects the prompt with manual-copy instructions, never claims success, and the retry copies the complete prompt

#### Scenario: JavaScript unavailable

- **WHEN** either setup page is opened with JavaScript disabled
- **THEN** the complete prompt remains readable and selectable and no inactive copy button is shown
