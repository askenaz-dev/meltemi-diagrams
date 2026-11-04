## MODIFIED Requirements

### Requirement: Session protocol
The canvas session SHALL answer `libraries` with the libraries and their categories (ids, titles and counts), `libraryItems` with the items of one category and their thumbnails (null while the pack is loading), `librarySearch` with up to 60 items matching the query by label, name or keyword, and `searchIcons { query, token }` with `icons { token, groups }`: up to 60 icons of the document's packs matching the query by name or keyword, and the library items matching it, grouped by pack or library with a title, each with its reference, a readable label and an SVG thumbnail (null while its pack loads); an empty query SHALL answer the first category of the Technology library, or the first icons of the Tabler pack where there are no libraries. A query that reads as `pack:name` SHALL be offered first when it names an icon. Only icons the packs can draw SHALL be offered: never a reference the packs do not have or whose SVG the sanitiser refuses. Sequence diagrams SHALL get no libraries and no icons. C4 views SHALL get no libraries, and `searchIcons` SHALL answer them with the icons of the packs alone, for the Icon field of their entities and relations.

#### Scenario: Items with thumbnails
- **WHEN** the canvas asks for the `compute` category of `aws`
- **THEN** the answer lists `AWS Lambda` with icon `aws:lambda` and an SVG thumbnail

#### Scenario: Icons by keyword
- **WHEN** the canvas sends `searchIcons { query: "database", token: 3 }`
- **THEN** the answer carries token 3, a Tabler group with `tabler:database` labelled "database" and a thumbnail, and a Technology group with PostgreSQL

#### Scenario: Stale token
- **WHEN** two searches are sent and the first answer arrives after the second
- **THEN** each answer carries its own token, so the canvas keeps the latest query's results

#### Scenario: Only icons that can be drawn
- **WHEN** the canvas sends `searchIcons { query: "google drive", token: 2 }`
- **THEN** every offered reference resolves to an icon the packs can draw, and `logos:google-drive`, whose SVG holds a `<mask>`, is not among them

#### Scenario: Icons on a C4 view
- **WHEN** the canvas of a C4 view sends `libraries` and `searchIcons { query: "server", token: 1 }`
- **THEN** the libraries answer is empty, and the icons answer carries a Tabler group with `tabler:server` and no library group

#### Scenario: No icons on a sequence diagram
- **WHEN** the canvas of a sequence diagram sends `searchIcons { query: "server", token: 1 }`
- **THEN** the answer carries token 1 and no group
