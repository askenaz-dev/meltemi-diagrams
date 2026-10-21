# theme-editing Specification

## Purpose
Create and edit custom themes from the canvas: a new theme that extends the diagram's, in the file
or for the project, and the theme panel that writes its tokens in the file that holds the block,
through the `createTheme`, `setThemeToken` and `removeThemeToken` edit operations.
## Requirements
### Requirement: New theme from the current one
The diagram's Theme field SHALL offer "New theme from this one…", which asks an id and where the
theme lives. In the file, it SHALL insert `theme <id> { extends "<current theme>" }` before the
first diagram and point the diagram at it with `theme "<id>"`, in one batch. In the project, it
SHALL write the block to `themes/<id>.meltemi` (creating the file when missing) and set
`"theme": "themes/<id>.meltemi#<id>"` in `project.json` with a minimal text edit that keeps the
file's formatting, so that diagrams without their own `theme` follow it. An id in use SHALL be
refused with the reason.

#### Scenario: Theme in the file
- **WHEN** a diagram uses `editorial.light` and "New theme from this one…" creates `brand` in the file
- **THEN** the file gains `theme brand { extends "editorial.light" }` before the diagram, and the
  diagram gains `theme "brand"`

#### Scenario: Theme of the project
- **WHEN** `brand` is created for the project
- **THEN** `themes/brand.meltemi` holds the block and `project.json` has
  `"theme": "themes/brand.meltemi#brand"`, with its other fields and formatting unchanged

### Requirement: Theme panel
"Edit theme…" SHALL open a theme panel for a theme that is a block of a file of the project (a
built-in theme offers only "New theme from this one…"). The panel SHALL list the theme's tokens by
group: colours (the sixteen colour and four signal tokens, each with its resolved colour, a picker
and "inherit"), fonts, type sizes and weight, spacing, shape, icons, frame and mark, and the effect
durations. Each change SHALL be one edit of the block in its own file: `setThemeToken` inserts
the token's statement when absent or replaces its value, and `removeThemeToken` deletes it. Every
diagram that uses the theme SHALL redraw.

#### Scenario: Change a colour
- **WHEN** the panel of `brand` sets `accent` to `#6A4FD0`
- **THEN** the block gains `accent "#6A4FD0"`, and a diagram using `brand` draws its accents in it

#### Scenario: Inherit again
- **WHEN** `brand` writes `accent "#6A4FD0"` and the panel chooses "inherit" on `accent`
- **THEN** the statement is removed and the accent is the base theme's again

#### Scenario: Theme file of the project
- **WHEN** the project's default theme is `themes/brand.meltemi#brand` and the panel changes `radius`
- **THEN** the edit is written in `themes/brand.meltemi`, and the open diagram redraws

### Requirement: Embeddable fonts in the panel
The `font` and `mono` controls of the panel SHALL offer the bundled families (Inter, IBM Plex
Sans, Cascadia Mono) and the fonts of the project's `assets/fonts/`, which exports embed. A stack
written by hand that is none of them SHALL show as "custom" and stay as written.

#### Scenario: Project font
- **WHEN** the project has `assets/fonts/Atkinson.woff2` and the panel chooses it for `font`
- **THEN** the block gains `font "Atkinson Hyperlegible"` and the exported SVG embeds it

### Requirement: Theme edit operations
`packages/edit` SHALL offer `createTheme { file, id, extends }`, `setThemeToken { file, theme,
token, value }` and `removeThemeToken { file, theme, token }`, which SHALL write minimal text edits
that keep comments and formatting, refuse an unknown token or a value the token table does not
accept with the reason, and support inverse plans.

#### Scenario: Insert and replace
- **WHEN** `setThemeToken` sets `padding` to 20 on a block without it, then to 24
- **THEN** the block first gains `padding 20` and the second edit replaces only `20` with `24`

