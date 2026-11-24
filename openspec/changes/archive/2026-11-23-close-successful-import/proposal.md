## Why

An import that creates a diagram and reports unsupported syntax keeps the input dialog open over the new file.

## What Changes

- Close the input dialog after any successful import.
- Keep findings and the Markdown report available from the import status.
- Leave the input open when the importer cannot create a file.

## Capabilities

### Modified Capabilities

- `web-playground`: Close the import dialog as soon as the converted file opens.
