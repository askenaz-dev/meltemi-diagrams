## Why

The owner liked the icon picker and asked for what draw.io offers: libraries of ready-made
elements for AWS, Google Cloud, Azure, Kubernetes and the like, grouped by category, to pick
from a panel; boxes already made, with their icon and name, not just icons. Today the built-in
pack is Tabler, provider icons must be added to each project by hand, and the palette offers
only the language's kinds.

## What Changes

- **Built-in provider packs.** The icon packs `aws` (AWS Architecture Icons), `azure` (Azure
  architecture icons), `gcp` (Google Cloud icons), `kubernetes` (Kubernetes icons) and `logos`
  (SVG Logos) ship with the tool, next to `tabler`, converted once to the Iconify JSON format by
  `scripts/vendor-icons.mjs` from the vendors' downloads and kept in the repository. Each carries
  its terms, which the inventories and notices repeat; vendor icons are never modified.
- **Element libraries.** A library is a list of ready-made elements by category: a label, an
  icon and, when it matters, a kind. Libraries come with the built-in packs (AWS by its
  categories, Azure, Google Cloud, Kubernetes, and "Technology" curated from the logos),
  from any pack that declares categories (Tabler, project packs), and from plugins.
- **The Libraries panel.** The canvas gets a Libraries panel (toolbar toggle, key L for layers,
  key U for libraries) with a search box and the libraries' categories; clicking an element
  creates it at the centre of the view, dragging drops it where the pointer is. The element is a
  node (a box in free compositions) with the label and `style <id> { icon "<pack>:<name>" }`.
- **Labels for icons.** Packs may carry a label per icon (`labels` in the pack file, a Meltemi
  extension of the Iconify format); the icon picker and completion show it.

## Capabilities

### New Capabilities

- `element-libraries`: library files, built-in libraries, libraries of packs with categories,
  plugin libraries, the session protocol of the panel.

### Modified Capabilities

- `icon-packs`: built-in provider packs; labels in Iconify files.
- `diagram-canvas`: the Libraries panel and creating from it.
- `project-plugins`: plugins may declare libraries under the `icons` permission.

## Impact

- Assets: `vendor/*.json` packs and `libraries/*.json`, `builtInPacks(reader)`,
  `builtInLibraries(reader)`, labels. Edit: `createElement.icon`. Editor: `analysis.libraries`,
  session messages. Canvas: `LibraryPanel`. Hosts: the VS Code build and the playground copy the
  packs and libraries; the playground fetches packs on demand. Inventories: `scripts/licenses.mjs`
  and the hosts' notices list the vendor sets with their terms.
- Docs: `docs/language/assets.md`, `docs/editor.md`, `docs/plugins.md`, Spanish versions, the
  skill reference; decision 0041; CHANGELOG 1.7.0.
