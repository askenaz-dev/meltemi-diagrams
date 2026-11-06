## Scope

Only `docs/language/svg-export.md` and its Spanish twin change. The introduction names the five
delivered profiles; the options distinguish default SVG from the available output formats.
The existing general export guide carries format-specific requirements, so the SVG page links it
instead of duplicating that reference.

## Evidence and verification

`packages/editor/src/exports.ts` defines the supported formats; `packages/cli/src/export-command.ts`
selects the default and all error-free diagrams. Existing CLI tests cover sequence, C4, Gantt,
SVG and other formats. Documentation tests check bilingual structure, examples and links.
No public API, runtime, dependency or delivery configuration changes.
