# The HTML catalog

[Español](es/catalog.md)

`meltemi-diagrams build catalog` turns a project into one HTML file that people can open from a
disk, a share, an attachment or any static host, without a network: the project's diagrams and
stories by folder, with the player, search, links between diagrams and the architecture model's
entities. The same sources give the same file (decision 0027).

```bash
pnpm mdg build catalog architecture
```

```text
Wrote architecture/catalog/index.html (3 diagrams, 1 story, 6 entities; 289 KB)
```

## Building

| Command                                           | Writes                                                         |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm mdg build catalog`                          | the catalog of the project of the working folder               |
| `pnpm mdg build catalog architecture/`            | `architecture/catalog/index.html`, or where `catalog.out` says |
| `pnpm mdg build catalog architecture/ --out site` | `site/index.html`; a path ending in `.html` names the file     |
| `pnpm mdg build catalog --title "Shop"`           | with another title than `catalog.title` or the project name    |
| `pnpm mdg build catalog --source`                 | with the text of each catalogued file                          |

The path is a project folder or a file inside one. The command prints the diagnostics of the
catalogued files, leaves out (and names) diagrams and stories that cannot be drawn, and says what
the catalog holds and its size. It exits 0 when nothing had errors, 1 when something had errors or
was left out, and 2 on usage errors or when the project has nothing to catalog, so a CI job can
validate and publish in one step.

In VS Code, **Meltemi Diagrams: Build Catalog** (command palette, or the explorer menu of a folder,
a `.meltemi` file or `project.json`) builds the catalog of the project and offers to open it in the
browser.

The catalog's headings, navigation, search and players are in English or Spanish: `--lang`, else
the project's `"locale"`, else English ([projects](language/projects.md#language-of-exports)). The
page carries the language as its `lang`, and search in Spanish also finds the type keywords
(`sequence`, `story`). The language is part of the input, so the same sources give the same file on
every machine.

## Settings

`project.json` can say what the catalog is called, where it goes and what it leaves out:

```json
{
  "name": "commerce",
  "language": "0.2",
  "catalog": {
    "title": "Commerce architecture",
    "description": "Views and stories of the shop.",
    "out": "public/catalog",
    "exclude": ["drafts", "diagrams/checkout.meltemi#internal"],
    "source": false
  }
}
```

| Setting       | Default    | Meaning                                                                             |
| ------------- | ---------- | ----------------------------------------------------------------------------------- |
| `title`       | the `name` | The catalog's title                                                                 |
| `description` | none       | Text on the home page                                                               |
| `out`         | `catalog`  | A folder inside the project (the file is `index.html` in it) or a `.html` file      |
| `exclude`     | none       | Folders or files left out, or `<file>.meltemi#<id>` for one diagram or story        |
| `source`      | `false`    | Include the text of each catalogued file, comments included, shown and downloadable |

A story that shows an excluded diagram still draws it in its frames; the build warns, so exclude
the story too when the diagram must not appear.

## What people find

- **Overview**: the title, the description, how many diagrams, stories and entities there are, and
  every folder with a card per diagram and story (a thumbnail, the title, the type).
- **Navigation**: the same folders in a side panel that marks the page on screen; on a phone it
  sits above the page.
- **A diagram**: its drawing, type, id, file and description; effects with the player's controls;
  a scenario picker for sequence diagrams with scenarios (the choice is part of the address);
  tables of elements (kind, technology, description, what each one opens and where it leads) and
  relations; the stories that show it; the diagrams it links to and from; **Download SVG**, always
  the drawing as written, whatever the zoom or the selection. The breadcrumbs name the views above
  it: a component view sits under its container view and the context view.
- **A story**: the player with play, pause, progress, scenes, keyboard, static view and text
  summary; its scenes; the diagrams it shows; **Download SVG** of the frame on screen.
- **Entities**: the entities of the architecture models that catalogued views draw or link to, by
  model, with kind, technology, description and the views that show them. An entity's page lists
  what it is part of, what it contains and the views scoped to it.
- **Exploring a drawing**: every drawing zooms and pans, shows a card when the pointer rests on an
  element or a relation, and opens a panel on a click: type, technology, description, relations,
  the stories that show it, the entity it draws, the views scoped to that entity and **Open link**
  for a `url` ([the player](player.md#exploring-a-drawing)). A click selects and never leaves the
  page; an address with `?element=` selects that element.
- **Opening what a box holds**: a box with a plus sign opens a view: a system its container
  view, a container its component view, an element with a `link` the diagram it names. A double
  click, the plus sign or the panel's **Open** button moves the camera to the box and goes to that
  page, whose drawing morphs in from the box; the drawing's **Up**, Backspace and the browser's
  Back go up the same way. The panel's links lead to the entity's page and the stories; the tables
  give the same links to keyboards and screen readers.
- **Search**: titles, ids, descriptions, folders, files, element and relation labels, technology,
  scenes and entities, ignoring case and accents and requiring every word. Titles and ids come
  first; each result says where it matched. Press `/` to search, Enter to open the first result,
  Down to reach the results, Escape to clear.

Every page has its own address (`#/diagram/diagrams/checkout/checkout`, `#/story/…`, `#/entity/…`,
`#/entities`, `#/search?q=…`), so links can be shared and the browser's back and forward work. The
page heading takes the focus after each change; landmarks, a skip link, visible focus and light and
dark colour schemes are built in.

## Authorised metadata only

By default the catalog holds the project's title and description, titles, descriptions, types,
project-relative folders and file names, and what the drawings show: labels, descriptions,
technology and URLs. It never holds comments, absolute paths, diagnostics, the machine or the
build time; the page names its generator and version only. The source text is included only with
`catalog.source` or `--source`. Story documents name their views by diagram id, never by the file
an imported diagram comes from.

## Offline by construction

The catalog is one file: its data, the font subsets its drawings use (each once), its styles and
its script are inline. A content security policy allows inline scripts and styles, `data:` and
`blob:` pictures and fonts, and nothing else, so the page cannot fetch anything even by mistake.
The drawings are the renderer's own SVG, drawn in shadow roots by the player's runtime, so they
look like every other export. Without JavaScript the overview and the navigation still read.
