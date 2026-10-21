## MODIFIED Requirements

### Requirement: Convert command
`meltemi-diagrams convert <file.meltemi> --to free [--diagram <id>] [--id <new-id>] [--stdout] [--check]` SHALL lay the diagram out like `export` and apply `convertToFree` to it, the only flow diagram of the file unless `--diagram` chooses one. It SHALL write the file and print `Converted "<id>" to "<new-id>" in <path>`. `--stdout` SHALL print the result instead of writing it, and `--check` SHALL write nothing and exit 1. A file with several flow diagrams and no `--diagram`, an unknown diagram, or `--to` other than `free` or `json` SHALL be usage errors (exit 2).

`meltemi-diagrams convert <file.meltemi> --to json [--out <file>] [--stdout]` SHALL write the file's model JSON (format `model-json`, the interchange format) to `<stem>.model.json` beside the file, or to `--out`, or print it with `--stdout`; it SHALL exit 1 when the file has errors (the JSON lists them in `diagnostics`), and `--diagram`, `--id` and `--check` with it, or `--out` with `--to free`, SHALL be usage errors.

#### Scenario: Convert from the command line
- **WHEN** `meltemi-diagrams convert sheet.meltemi --to free` runs on a copy of the checkout sheet
- **THEN** the file gains the free diagram, and running `meltemi-diagrams export` on it writes two SVG files

#### Scenario: Model JSON
- **WHEN** `meltemi-diagrams convert sheet.meltemi --to json` runs on a copy of the checkout sheet
- **THEN** `sheet.model.json` holds the format `model-json` with the diagram `checkout`, the same text `--stdout` prints
