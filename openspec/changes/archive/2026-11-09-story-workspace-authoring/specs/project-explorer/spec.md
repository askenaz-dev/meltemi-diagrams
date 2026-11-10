## ADDED Requirements

### Requirement: Explorer story naming and deletion authority

The explorer SHALL offer story display-name editing through Rename/F2 and story deletion.
The upper story selector SHALL also offer story deletion in the shared editor.
The scene panel SHALL delete scenes rather than stories. Naming/deletion SHALL preserve unrelated
files and refuse stale or duplicate requests without reporting a missing old story after success.

#### Scenario: Rename an explorer story

- **WHEN** Rename or F2 is used on a story and a title is accepted
- **THEN** its visible name changes without changing its identifier or dependent export references

#### Scenario: Delete while navigating

- **WHEN** a deletion confirmation becomes stale because the source or selected story changes
- **THEN** it writes nothing and the current story remains usable
