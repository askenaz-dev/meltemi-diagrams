## Context

The import dialog uses the same return value for a failed conversion and a successful conversion with findings. Both paths keep the dialog open.

## Decision

Keep the input and diagnostics in the dialog when a conversion fails. After a successful conversion, make its report available from the status bar and let the existing dialog helper close the form. Guard the submission after adding a file so repeated activation creates one file.
