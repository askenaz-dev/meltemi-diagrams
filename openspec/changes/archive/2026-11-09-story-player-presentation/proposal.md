# Configurable HTML story presentation

## Why

The owner wants fullscreen presentation and control over the extra text/configuration shown in
HTML. The timeline currently downloads immediately, bypassing the existing export chooser, and
the runtime has no fullscreen control.

## What changes

Open the export dialog with the current story selected. Expose heading/description, textual
summary, details and playback controls as explicit HTML choices, defaulting the browser's export
to a clean diagram presentation. Add fullscreen on the player itself with robust keyboard/exit
handling. Preserve existing programmatic export defaults unless options are supplied.

## Capabilities

- Modified: `player-runtime` — fullscreen and granular optional presentation content.
- Modified: `player-export` — serialized presentation options and optional page heading.
- Modified: `playground-exports` — chooser entry and HTML-specific options.

## Impact

Player runtime/HTML, export requests, browser dialog and localized guidance. No account or cloud
change; use synthetic local fixtures. Embedded geometry/timing remain necessary for offline use.
