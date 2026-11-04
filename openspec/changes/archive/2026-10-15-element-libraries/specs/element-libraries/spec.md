## ADDED Requirements

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
The canvas session SHALL answer `libraries` with the libraries and their categories (ids, titles and counts), `libraryItems` with the items of one category and their thumbnails (null while the pack is loading), and `librarySearch` with up to 60 items matching the query by label, name or keyword. Diagrams of sequence and C4 profiles SHALL get no libraries.

#### Scenario: Items with thumbnails
- **WHEN** the canvas asks for the `compute` category of `aws`
- **THEN** the answer lists `AWS Lambda` with icon `aws:lambda` and an SVG thumbnail
