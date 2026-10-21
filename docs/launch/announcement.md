# Meltemi Diagrams 1.0

_Draft announcement for the 1.0 release. The owner adjusts it, adds the links of the published
packages, the extension and the hosted playground, and publishes it with the release._

Meltemi Diagrams 1.0 is out: professional diagrams written as code, adjusted on a canvas,
animated, and exported for documents, slides, the web and video. It is open source under the MIT
licence, runs on your machine, and needs no account.

![Editing a diagram: code and canvas side by side](../media/editing-demo.gif)

## Why

Diagrams as code are reviewable and reusable, but their layout is out of your hands. Visual
editors give you the picture you want, but the file behind it is opaque, and a change to the
system means redrawing by hand. Meltemi Diagrams keeps both: the text file is the source, the
canvas edits it, and every gesture is a small change you can read in a diff.

## What is in 1.0

- **Four profiles in one language**: flow diagrams, sequence diagrams with scenarios, C4 views of
  a shared model, and free compositions for slides ([gallery](../../gallery/README.md)).
- **Code and canvas**: an extension for VS Code and a browser playground with the same canvas:
  grid, guides, routing, an inspector, and every change written back to the text.
- **Motion**: effects along connectors and stories with scenes, camera and transitions, played in
  an offline HTML player or exported as MP4, WebM and GIF.
- **Delivery**: SVG with embedded fonts, PNG, vector PDF with selectable text and links, and a
  browsable catalog of a whole project in one file.
- **Coming from elsewhere**: Mermaid and PlantUML importers that report every construct, and
  guides for people coming from [Mermaid](../tracks/from-mermaid.md),
  [PlantUML](../tracks/from-plantuml.md) or a [visual editor](../tracks/from-visual-editors.md).
- **Checked**: every acceptance criterion passes on the reference machine, every export opens in
  Edge, Chrome and Firefox, and a conformance suite fixes what files mean
  ([quality](../quality.md)).

## See it

- The [purchase example](../../examples/purchase/README.md): one purchase drawn as a C4 model with
  two views, a payment sequence, an executive slide and an animated story, with its video and
  catalog.
- The [editing demo](../media/editing-demo.mp4): code typed, boxes dragged, a route and a label
  changed, and the code following every step.

## Get it

```bash
npm install --global @meltemi/diagrams-cli
```

```bash
meltemi-diagrams init my-diagrams --template purchase
```

Then install the **Meltemi Diagrams** extension for VS Code, or open the playground at
[diagrams.meltemi.dev](https://diagrams.meltemi.dev). The
[getting started](../getting-started.md) guide takes about ten minutes. What runs where, and what
1.0 does not do, is in [compatibility](../compatibility.md).

## What comes next

After the release, work goes first to defects and to what people need to use it again for their
next delivery, before new notations. Realtime collaboration has since arrived, with the optional
hosted playground ([working together](../playground.md#working-together)); proposals for new diagram
types and for more managed services will be weighed against evidence of demand and the cost of
supporting them.
