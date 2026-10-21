# Getting started

[Español](es/getting-started.md)

From nothing installed to a diagram drawn on the canvas and exported, in about ten minutes. No
account is needed, and nothing you write leaves your machine.

## Try it without installing

The [playground](playground.md) runs the whole product in a browser tab: pick a template, change
the code or drag on the canvas, and export. When you want to keep going locally, **Download** the
project as an archive; the command line and the editor open it as it is.

## Install

The command line needs Node 22.12 or later:

```bash
npm install --global @meltemi/diagrams-cli
```

```bash
meltemi-diagrams --version
```

The command is also available as `mdg`. PNG, PDF and video exports use an installed Edge, Chrome
or Chromium, and video also an installed FFmpeg ([compatibility](compatibility.md)).

The editor is the **Meltemi Diagrams** extension for Visual Studio Code 1.95 or later, from the
Visual Studio Marketplace or Open VSX, or from a `.vsix` file:

```bash
code --install-extension meltemi-diagrams-1.0.0.vsix
```

Working from this repository instead, run `pnpm install` once and use `pnpm mdg` wherever this
guide says `meltemi-diagrams`; [trying it from the repository](../README.md#trying-it-from-this-repository)
covers the editor and the playground too.

## A first project

```bash
meltemi-diagrams init shop
```

`init` writes `shop/project.json` and `shop/diagrams/overview.meltemi`, a small flow diagram:

```text
language "0.2"

diagram overview: flow {
  title "Overview"
  description "How a request reaches the data"
  direction LR

  client["Client"]
  api["API"] { description "Handles requests" }
  db[("Database")]

  client -> api: "HTTPS" as request
  api -> db: "Reads and writes" as store
}
```

Other templates start from a C4 model, a sequence diagram, a slide or the complete purchase
example: `meltemi-diagrams init --list`.

Check it, then export it:

```bash
meltemi-diagrams validate shop
```

```bash
meltemi-diagrams export shop
```

`validate` prints each problem as `path:line:column: severity code message` and exits 1 on errors
([diagnostics](language/diagnostics.md)). `export` writes `shop/diagrams/overview.svg` beside the
source: one file with its fonts, ready for a document or a web page.

## See it while you write

```bash
meltemi-diagrams preview shop --open
```

`preview` serves the project's catalog on `http://127.0.0.1:4317/` and redraws it every time a file
changes. Edit `overview.meltemi` in any editor: add `cache[("Cache")]` and `api -> cache` and save.

## Draw on the canvas

Open the `shop` folder in VS Code and `overview.meltemi` in it. The canvas opens beside the code
(**Open Canvas to the Side** brings it back after you close it).

1. Drag the **Cache** box. The code gains a `placement` block with a `place` for every box and
   the line `layout assisted`: what is placed stays where it is, and new boxes are arranged
   around it.
2. Double-click the arrow's label **HTTPS** and type `HTTPS and JSON`. The string in the code
   changes, and nothing else.
3. Select **Client**, then drag from one of the dots beside it onto **Database**: a new
   `client -> db` line appears.
4. Undo (Ctrl+Z) in the code takes back each step, and the canvas follows.

Every gesture is a small edit of the text, so the diff of your change shows exactly what moved
([editor](editor.md)).

## Export for your audience

```bash
meltemi-diagrams export shop --format png
```

```bash
meltemi-diagrams export shop/diagrams/overview.meltemi --format pdf
```

PNG is drawn at twice the pixels by default (`--scale`), with an optional transparent background;
PDF is a vector page with selectable text. Diagrams with effects or stories also export as an
animated SVG, an HTML player, MP4, WebM or GIF; an `export` block in the file remembers a delivery
so that `--profiles` writes them all ([export](language/export.md)).

The whole project, with every diagram and story, becomes one offline page:

```bash
meltemi-diagrams build catalog shop
```

## Where to go next

- Coming from another tool: [Mermaid](tracks/from-mermaid.md), [PlantUML](tracks/from-plantuml.md)
  or a [visual editor](tracks/from-visual-editors.md).
- What else the product does: [features](features.md), the [gallery](../gallery/README.md) and the
  [purchase example](../examples/purchase/README.md).
- The language: [grammar](language/grammar-0.2.md), [layout](language/layout.md),
  [styles](language/styles.md), [stories](language/stories.md).
- Everything else: the [documentation index](README.md).
