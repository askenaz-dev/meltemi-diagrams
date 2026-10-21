# @meltemi/diagrams-player

The HTML player of stories and diagram effects: a custom element with play, pause, scenes,
keyboard control, reduced motion, a static view and a text summary, written as a whole offline
page or a fragment to paste into a page. Every drawing zooms and pans, shows hover cards and a
detail panel, and opens the views its boxes hold with a double click or a plus sign, all drawn
around the frame and never in it. The `./node` entry gives the bundled runtime script.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-player
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

Most people get a player from the command line:

```bash
meltemi-diagrams export stories/purchase.meltemi --story purchase --format html
```

In code, a player document is built from a compiled story and its laid-out views:

```js
import { playerPage, storyDocument, storyViews } from "@meltemi/diagrams-player";
import { playerScript } from "@meltemi/diagrams-player/node";

const layouts = new Map();
for (const [key, view] of storyViews(story)) {
  layouts.set(key, { diagram: view.diagram, layout: layoutDiagram(compilation, view.diagram) });
}
const html = playerPage(storyDocument(story, layouts), playerScript());
```

## Documentation

- [The player](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/player.md)
- [Stories](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/stories.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
