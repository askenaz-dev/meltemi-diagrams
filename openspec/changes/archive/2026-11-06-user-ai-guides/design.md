## Context

The same documentation is read in Git and published by Meltemi Web. Both readers need an immediate
explanation of the useful result and setup path, rather than repository-maintenance instructions.

## Decisions

1. Put an AI and agents group immediately after Start in both indexes. Keeping the links in Tools
   would preserve the current discoverability problem; a dedicated group gives both workflows a
   clear entry point.
2. Describe skill as diagramming instructions and MCP as project tools. A comparison by storage
   distinguishes CLI files, folder-mode validation/preview, account projects and the shared Docker
   backend. Treating skill and MCP as alternatives would misdescribe the local plugin, which
   bundles both.
3. Keep the existing repository setup prompt and connection commands valid. Add use cases before
   setup, and remove contributor paragraphs and acceptance-record links from the user guides.
4. Lead built-in assistance with operations and a first proposal. State CLI/VS Code support and
   the separate provider configuration before the technical disclosure and review details.

## Modules and interfaces

Only English/Spanish Markdown entry points change. Existing URLs stay at `agents.md` and
`assist.md`; no CLI, MCP or service interface changes. Meltemi Web consumes these files from the
product release.

## Validation

Existing documentation tests check links, translated heading levels/code, agent setup command
parity and MCP connection instructions. Run them along with the repository's typecheck, lint and
test gates. Read the final guide text against provider settings, MCP modes and local setup source.
No validation needs credentials or a live provider.
