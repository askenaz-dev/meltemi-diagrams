# Formatting

[Español](../es/language/formatting.md)

`meltemi-diagrams format` rewrites `.meltemi` files in one canonical layout. Formatting is a
separate action: visual edits in the editor change only the tokens they need and never reformat a
file.

```bash
pnpm mdg format diagrams/checkout.meltemi
```

```bash
pnpm mdg format --check architecture/
```

## Rules

| Situation              | Canonical form                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Indentation            | two spaces per block level, or the project's `format.indent` (1 to 8 spaces, or `"tab"`)                     |
| Tokens on a line       | one space between them                                                                                       |
| No space               | before `,` `;` `:` `.` `)` `]`, after `(` `[` `.`, and between an id and its shorthand `[` (`api["API"]`)    |
| Block on one line      | stays on one line: `api["API"] { description "REST" }`, `{ }`                                                |
| Block on several lines | `{` ends the line, one statement per line one level deeper, `}` on its own line; `} else "B" {` stays joined |
| `;`                    | statements joined by `;` stay on one line: `place a at (1, 2); size a (160, 56)`                             |
| Multi-line list        | `via [` ends the line, one item per line one level deeper, `]` on its own line                               |
| Blank lines            | at most one in a row; none right after `{` or before `}`; exactly one between top-level blocks               |
| Comments               | kept in place and order; one space before a trailing `//` comment; block comments verbatim                   |
| Line ends              | no trailing spaces, the file's first line ending everywhere, one final line break, the BOM kept              |

The formatter never changes token text or order, never drops a comment, and gives the same result
when run twice. Files with syntax errors are refused and left unchanged (`format.syntax-errors`).

## Project setting

```json
{ "name": "commerce", "language": "0.2", "format": { "indent": 4 } }
```

## Command

| Option     | Effect                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| (none)     | rewrite changed files, print `Formatted <path>` and `Formatted N of M files.` |
| `--check`  | write nothing; print `Would format <path>`; exit 1 when a file would change   |
| `--stdout` | print the formatted text of exactly one file                                  |

Folders are formatted as projects, through their sources. Exit codes: 0 when done, 1 when a file is
refused or `--check` finds changes, 2 on usage errors.

## For tools

`formatSource(text, { indent })` in `@meltemi/diagrams-language` returns the text, `changed` and
line-range `edits` (from a Myers line diff). Editors apply the edits so cursors and folding outside
the changed lines stay put.
