## MODIFIED Requirements

### Requirement: Notices and versions
The page SHALL show its version and the generator's name, and an About dialog with the licence of
the product (MIT) and of every bundled component, linking to `NOTICES.md`: EPL-2.0 for elkjs with
its source link, OFL-1.1 for the fonts, Apache-2.0 for `@meltemi/ocean`, MIT for the others. It
SHALL link "Drawing with coding agents", in the page's language, to that language's agent setup
page by a relative address (`agent-setup/`, `es/agent-setup/`) that resolves under the Worker and
under a static server's sub-path. `pnpm licenses:inventory --check` SHALL cover the bundled
packages.

#### Scenario: Notices
- **WHEN** `NOTICES.md` of the built site is read
- **THEN** it names elkjs under EPL-2.0 with a link to its source, Inter under OFL-1.1 and `@meltemi/ocean` under Apache-2.0

#### Scenario: A bundled package missing from the notices
- **WHEN** `@meltemi/ocean` is bundled into the page and the inventory does not list it
- **THEN** `pnpm licenses:inventory --check` fails naming the package, and so does the build

#### Scenario: The agents link
- **WHEN** the About dialog opens
- **THEN** it holds a link named "Drawing with coding agents" whose `href` is `agent-setup/`, and `agent-setup/prompt.md` fetched from the page's origin starts with `# Set up Meltemi Diagrams for a coding agent`

#### Scenario: The agents link in Spanish
- **WHEN** the About dialog opens in the Spanish interface
- **THEN** its link is named "Dibujar con agentes de programación" and its `href` is `es/agent-setup/`

#### Scenario: The list cannot be read
- **WHEN** `notices.json` cannot be fetched or is not JSON
- **THEN** the dialog says the list could not be read and points at `NOTICES.md`, and the agents link is still there
