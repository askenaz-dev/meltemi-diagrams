## Scope

The reader-facing changes affect `docs/language/svg-export.md` and its Spanish twin. The introduction names the five
delivered profiles; the options distinguish default SVG from the available output formats.
The existing general export guide carries format-specific requirements, so the SVG page links it
instead of duplicating that reference.

## Evidence and verification

`packages/editor/src/exports.ts` defines the supported formats; `packages/cli/src/export-command.ts`
selects the default and all error-free diagrams. Existing CLI tests cover sequence, C4, Gantt,
SVG and other formats. Documentation tests check bilingual structure, examples and links.
No public API, exporter runtime or dependency changes.

## Browser CI installation recovery

The follow-up changes only the FFmpeg installation step in `.github/workflows/ci.yml`. Replace
the literal `azure.archive.ubuntu.com` host in the existing `/etc/apt/sources.list`,
`/etc/apt/sources.list.d/ubuntu.sources` and `/etc/apt/apt-mirrors.txt` files. Preserve protocols,
suite/component names, signing-key declarations and every unrelated source.

APT uses two retries and thirty-second HTTP/HTTPS inactivity limits. The installation step has a
ten-minute backstop and still fails if update or mandatory FFmpeg installation fails. All browser
commands and test deadlines remain unchanged. No external action or new dependency is introduced.
Shell/YAML checks and temporary source-format fixtures run locally without invoking real APT;
fresh full remote CI remains required for the revised commit.
