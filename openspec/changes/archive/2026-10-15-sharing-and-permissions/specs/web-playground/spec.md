## MODIFIED Requirements

### Requirement: Share links
For the anonymous project the page SHALL make a link that carries the project's text files in
the URL fragment (`#p=` followed by the base64url of the raw-deflated JSON `{ v: 1, open,
files }`), copied to the clipboard, with the size shown and a warning above 32 KiB. Images SHALL
not travel in links, and the dialog SHALL say so. Opening a link SHALL decompress at most 4 MiB,
refuse more files than the project limit, keep the work it replaces as the previous project the
person can restore, and open the linked project as the anonymous project, whether or not the
person is signed in. A link that cannot be read SHALL leave the work as it is and say why. For a
cloud project the share action SHALL open the sharing dialog with the project's own link instead
(`project-sharing`).

#### Scenario: Round trip
- **WHEN** a link made from a two-file project is opened in a new page
- **THEN** the page shows the same two files with the same text, and the same file open

#### Scenario: Oversized link
- **WHEN** a link whose content decompresses beyond 4 MiB is opened
- **THEN** the page keeps its current work and reports that the link is too large

#### Scenario: A fragment link while signed in
- **WHEN** a signed-in person opens a `#p=` link
- **THEN** it opens as the anonymous project and the drawer offers to save it to the cloud
