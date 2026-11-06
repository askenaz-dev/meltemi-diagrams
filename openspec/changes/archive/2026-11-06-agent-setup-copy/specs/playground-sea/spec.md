## MODIFIED Requirements

### Requirement: A still picture on the agent setup pages
The agent setup pages in English and Spanish SHALL show the `diagrams` still picture of `@meltemi/ocean` above their heading, as an image of the site in the system's scheme, with empty alternative text. The sea SHALL load no animation script. The page SHALL load only its same-origin copy module, under the setup page's policy; inline scripts and connections SHALL remain blocked.

#### Scenario: The setup page
- **WHEN** `dist/agent-setup/index.html` and its Spanish twin are read after a build
- **THEN** each shows `sea-diagrams.svg` from the site with `alt=""`, and `sea-diagrams-dark.svg` for a dark scheme, loads only the setup copy module as its script, and declares the setup page policy

#### Scenario: A missing picture
- **WHEN** the build does not write `sea-diagrams.svg` or `sea-diagrams-dark.svg`, or writes one that is not well-formed SVG
- **THEN** the build test fails naming the file
