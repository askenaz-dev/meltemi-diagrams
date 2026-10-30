## ADDED Requirements

### Requirement: Popular families on demand
The playground's built site SHALL carry every file of `bundledFontFiles()`, its startup set SHALL stay the files the templates measure with, and a family another text names (a theme's `font` or `mono`, a style's `font`) SHALL be fetched the first time a text needs it: the text is drawn when the files arrive, the picker's row for it is drawn in its face, and the About dialog's notices list the new packages under OFL-1.1. A family whose files cannot be fetched SHALL leave its text measured with the fallback families (Inter, then IBM Plex Sans), as the text of a family not yet fetched is, and the page SHALL keep working.

#### Scenario: A family fetched when named
- **WHEN** the page loads and `style api { font "Roboto" }` is typed in the code pane
- **THEN** no Roboto file was requested before the typing, the Roboto subset files the label needs are requested after it, and once they arrive `api` is drawn in Roboto with its box fitted to the measured width

#### Scenario: Startup set unchanged
- **WHEN** the page loads a template
- **THEN** the font files requested before the first render are the startup set (Inter and IBM Plex Sans complete files and their tables) and nothing of the thirteen new families

#### Scenario: A file that cannot be fetched
- **WHEN** the server answers 404 for Caveat's files and a sticky has `font "Caveat"`
- **THEN** the sticky is drawn with its text measured with Inter, its `font-family` still names Caveat first, and the rest of the diagram and the page work
