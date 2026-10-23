## MODIFIED Requirements

### Requirement: Session protocol
The canvas session SHALL answer `libraries` with the libraries and their categories (ids, titles and counts), including a **Project** library when `assets/libraries/project.json` exists, `libraryItems` with the items of one category and their thumbnails (null while the pack is loading), `librarySearch` with up to 60 items matching the query by label, name or keyword, and `searchIcons { query, token }` with `icons { token, groups }`: up to 60 icons of the document's packs matching the query by name or keyword, and the library items matching it, grouped by pack or library with a title, each with its reference, a readable label and an SVG thumbnail (null while its pack loads); an empty query SHALL answer the icons chosen earlier in the session, then one group per project pack (its icons labelled by `assets/libraries/project.json` when it names them, else by name, up to 24 each), then the first category of the Technology library, or the first icons of the Tabler pack where there are no libraries. A query that reads as `pack:name` SHALL be offered first when it names an icon. Only icons the packs can draw SHALL be offered: never a reference the packs do not have or whose SVG the sanitiser refuses. Sequence diagrams SHALL get no libraries and no icons. C4 views SHALL get no libraries, and `searchIcons` SHALL answer them with the icons of the packs alone, the project's packs first for an empty query, for the Icon field of their entities and relations. The session SHALL take `addIcons` and answer `iconsAdded` as `custom-icons` describes.

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

#### Scenario: The project's packs for an empty query
- **WHEN** the project has `assets/icons/brand/logo.svg` labelled "Company logo" in `assets/libraries/project.json` and the canvas sends `searchIcons { query: "", token: 4 }`
- **THEN** the answer carries a `brand` group with `brand:logo` labelled "Company logo" and a thumbnail, before the Technology group

#### Scenario: The Project library
- **WHEN** `assets/libraries/project.json` lists the category `brand` with two items and the canvas sends `libraries`
- **THEN** the answer includes a library `project` titled "Project" with the category `brand` and a count of 2

#### Scenario: Unusable file left out
- **WHEN** `assets/icons/brand/My Logo.svg` exists and the canvas sends `searchIcons { query: "logo", token: 5 }`
- **THEN** no reference of that file is offered, and the file carries `asset.unusable-name`
