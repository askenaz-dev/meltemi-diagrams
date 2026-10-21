# Coming from a visual editor

[Español](../es/tracks/from-visual-editors.md)

You draw with the mouse in tools such as draw.io, Lucidchart, Visio or Excalidraw, and you care
about how the picture looks. Meltemi Diagrams has a canvas that works the way you expect (drag,
resize, snap to a grid, align, group, route a connector), and every gesture writes a small, clean
change to a text file. That file is what makes diagrams reviewable, reusable and animated.

## What stays the same

- A canvas with a 14 px grid, guides, zoom, pan, a minimap, a palette, an inspector and full
  keyboard operation ([editor](../editor.md)).
- Shapes, icons, groups, layers, themes and exports to SVG, PNG and PDF.
- Free compositions for slides: place everything exactly where you want it
  ([free compositions](../language/free.md)).

## What is different

- **The file is the source.** Each move, resize, route or label change is an edit of the
  `.meltemi` text, shown next to the canvas. Undo works across both. Comments and formatting in
  the file are kept.
- **Meaning first, then looks.** A box in a C4 view is an entity of a model, a message in a
  sequence diagram has an order. The canvas keeps the meaning intact: moving a message never
  reorders the conversation, and renaming an entity renames it everywhere.
- **Styles come from themes and classes.** Instead of formatting each shape, give it a class or
  rely on the theme; one change restyles every diagram ([styles](../language/styles.md)).
- **Diagrams move.** Effects along connectors and stories with scenes, camera and transitions
  export as an HTML player, MP4, WebM or GIF ([stories](../language/stories.md)).

## Starting

There is no importer for draw.io, Lucidchart or Visio files: universal import is outside 1.0
([compatibility](../compatibility.md)). Start from a template instead, in the
[playground](../playground.md) without installing anything, or locally:

```bash
meltemi-diagrams init my-diagrams --template free
```

Then open the sheet in VS Code with the canvas beside the code, and draw. The palette adds boxes,
text, icons and groups; the inspector sets labels, shapes, colours and effects. Watch the code:
it is the same picture, written down.

## Your habits, here

| In a visual editor                       | In Meltemi Diagrams                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Drag a shape                             | drag on the canvas; the file gets `place id at (x, y)`                          |
| Resize                                   | drag a handle; the file gets `size id (w, h)`                                   |
| Connect two shapes                       | drag from the dots beside a selected box onto another; `a -> b`                 |
| Bend a connector                         | drag its bend; the file gets `route r from a.east to b.west via [...]`          |
| Move a connector's label                 | drag the label; the file gets `label r at 40% offset (dx, dy)`                  |
| Align and distribute                     | Ctrl+Shift+arrows, or `align`, `row` and `column` constraints                   |
| Group shapes                             | select them and press Alt+G; the file gets `group group1 "Group" { ... }`       |
| Pick a shape from the panel              | the arrow of the box button, or F; the file gets `style box1 { shape hexagon }` |
| Drop a shape into a container            | drag it onto a group; its declaration moves into the group's block              |
| Nested plain rectangles                  | untitled groups, `group g "" { ... }`, with `fill` and `radius 0`               |
| A band behind a row of boxes             | an untitled group with `place`, `size` and `layer back`                         |
| Corner radius                            | the **Corner radius** slider; the file gets `style a { radius 4 }`              |
| Select the shape underneath              | Alt+click, or **Select the shape below** in the context menu                    |
| Bring to front, send to back             | the order keys move the declaration; layers with the **Layer** field            |
| Format painter                           | classes: `class highlight { fill accent }` and `{ class highlight }`            |
| Export PNG with a transparent background | `--format png --background transparent`                                         |
| Present                                  | a story played in the HTML player or exported as video                          |

## First things to try

1. Open the `free` template's slide, move the boxes and change a label in the inspector; read the
   diff of the file.
2. Switch the theme in one line (`theme "editorial.dark"`) and export the slide again.
3. Add `animate <relation> { effect flow }` to a connector and export an animated SVG
   (`--motion animated`) or a GIF.
