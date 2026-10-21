# element-libraries Specification

## Purpose
Libraries of ready-made elements by category (library files, the built-in provider and technology libraries, libraries of packs with categories, plugin libraries) and the session protocol the canvas's Libraries panel reads them through.
## Requirements
### Requirement: Library files
A library SHALL be a JSON file `{ "id", "title", "categories": [{ "id", "title", "items": [{ "icon", "label", "kind"? }] }] }`: `icon` is a `pack:name` reference, `label` the element's name, `kind` optionally `node`, `data`, `box` or another kind the diagram's profile accepts (the panel takes the profile's box kind otherwise). Ids SHALL be lower-case words; a malformed file SHALL be reported on the file (`asset.invalid-library` for project and plugin files) and left out.

#### Scenario: Malformed library
- **WHEN** a plugin's library file lacks `categories`
- **THEN** `plugin.invalid-manifest` names the file and the plugin's other contributions still load

### Requirement: Built-in libraries
The tool SHALL ship the libraries `aws`, `azure`, `gcp` and `kubernetes`, derived from the vendor packs' categories and labels (the category sizes known from `icons/index.json` before a pack is read), and `tech` ("Technology"), curated from `logos` in `libraries/tech.json`: databases, messaging, languages, frameworks and runtimes, tools, platforms and operating systems. Library files SHALL be read through the same reader as the packs or from the package's files under Node.

#### Scenario: AWS by category
- **WHEN** the built-in libraries are read
- **THEN** `aws` has a `compute` category holding an item with icon `aws:lambda` and label `AWS Lambda`

### Requirement: Libraries of packs with categories
Every pack of the registry that declares categories and has no library file of its own SHALL be a library too, titled as the pack and with the pack's labels: `tabler` by Tabler's categories, and project Iconify packs by theirs. Libraries SHALL be listed built-in first, then project packs, then plugins, each in name order.

#### Scenario: Tabler as a library
- **WHEN** the libraries of a document outside a project are listed
- **THEN** `tabler` is among them with the category `Devices` holding `tabler:server` labelled `Server`

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

