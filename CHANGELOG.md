# Changelog

Every package of Meltemi Diagrams, the CLI and the VS Code extension share one version
([decision 0033](docs/decisions/0033-release-and-versioning.md)). The language version is separate
([language policy](docs/language/policy.md)).

## 1.10.0

The playground's project in one place: an explorer of folders and diagrams in the first column,
with the project's switcher at its top, as VS Code lists a workspace
([decision 0048](docs/decisions/0048-project-explorer.md)).

### Playground

- The explorer: a tree of the project's folders, diagrams and images; a file with several diagrams
  or stories lists them, and a click shows one on the canvas. Errors and warnings are counted on each
  file, and summed on a closed folder. The keys of a tree (arrows, Home, End, Enter, a letter, F2,
  Delete, Ctrl+D, Shift+F10), drag and drop of rows and of files from your computer, a menu on
  every row. Ctrl+B hides it to a rail, Ctrl+Shift+E goes to it; its width is dragged or set from
  the keyboard and kept. On a phone it is the Files tab.
- New diagram asks a name and a kind (flow, free composition, sequence) and writes an empty diagram
  titled with the name; New folder, New file (for other files), rename, move, duplicate, download
  (a folder as a `.zip`) and delete.
- Renaming or moving a `.meltemi` file rewrites the imports that name it and its own, in one step
  that Ctrl+Z undoes from any file, in the browser's project as in a cloud project.
- `project.json` and the other files that describe the project are hidden until **Show all files**;
  a hidden file with a problem says so; **Project settings** opens `project.json`, made when the
  project has none. The project's name is edited in the explorer's header.
- The Projects panel replaces the drawer, the header's Projects button and the Templates menu: New
  project, Import project, Export project (.zip), Save this project to the cloud, Project settings,
  this browser's project and the previous one, and the cloud projects with a filter above eight.
- New project shows a card per template with a picture of its first diagram, its title, what it is
  for and what it holds; signed in, a project is made in the account or, when chosen, in this
  browser.
- A project archive, opened, imported or dropped, asks where it goes: a new project in the account,
  this browser, or the files of the open cloud project.
- The path of the open file above the code; menus and dialogs fade in, folders open by their height,
  rows made or moved flash once, and none of it moves with reduced motion.

### Account

- The account panel: the avatar's Account and API tokens open one panel in the page, with Profile
  (picture, name, the emails of your sign-ins, the publishing handle, Sign out), Sign-ins (unlink
  one, link the other), Devices (sign out one device or all the others), API tokens (the dialog,
  now a section), Usage (the limits too) and the Danger zone. Nothing opens a tab, a popup or a
  frame; on a phone the panel is a sheet with its sections as tabs
  ([decision 0049](docs/decisions/0049-account-panel.md)).
- Linking a provider and deleting the account go to the identity service in the same tab, the work
  kept first, and come back to the section they left (`?account=<section>`).
- The Worker reads and changes the identity service's sign-ins and sessions on the person's behalf
  (`/api/account/identity…`), signed as this product and carrying the person's session, so the page
  keeps talking to its own origin only; it needs `@meltemi/identity` 0.2.0. New codes:
  `identity.last`, `provider.unknown`, `session.current`, `session.not-found`, `rate.limited` and
  `identity.unavailable`.
- The publish dialog says what your handle is and that it changes in the account.

### Canvas (VS Code and the playground)

- The relations of a C4 view are edited in its model from the canvas: a connection writes `a -> b`
  into the model, dragging an end of an arrow onto another entity moves that end of the model
  relation, and Delete removes the model relation with what names it, asking first when another
  view draws it or an entity leaves the view with it. A style, an effect, a route or a label on a
  relation the model did not name first names it there (`as shop_api_db`). When the model is in
  another file of the project, both files change in one undo step, and the inspector writes the
  model's fields there too ([decision 0051](docs/decisions/0051-c4-relations-from-the-canvas.md)).
- Effects on what an import leaves anonymous: the Effects section shows for every relation of a C4
  view and every message, note and fragment of a sequence diagram, and turning one on names the
  target first (`as customer_web`, `note1`, `alt1`), as it does for flow relations.
- Effects play from the moment a diagram is shown. The toolbar's **Pause effects** shows the
  static drawing and becomes **Play effects**; the choice is kept per diagram of the file, so a
  pause holds over a reload, and reduced motion starts paused. The style strip heads the toggles
  with an **Effects** row like the route kind's, saying "off" or the effects that are on
  ([decision 0052](docs/decisions/0052-canvas-feel-and-naming.md)).
- The rotation handle turns an element by as much as the pointer turns about its centre since the
  press, after the pointer has moved a few pixels: a click on the handle no longer writes
  `rotation 60`. The element, its outline and its connectors follow the pointer without easing,
  agree at every frame, and keep their place in a diagram with `layout auto`.
- Sequence diagrams: a participant, database, collections or queue beside an actor is selected,
  pulsed, highlighted in stories and edited on the box it is drawn as, not on the empty row above
  it. Heads, activation bars, notes and lifelines are drawn in the theme's `muted` colour (lifelines
  at half opacity) instead of the faint `line`, so the diagram reads at a glance.
- A relation, message, note or fragment named by an edit (a label, a layer, a dotted line, a label
  position, a moved label, a dragged end or bend, a style) stays selected under its new id; a style
  on an unnamed note or fragment and the label position of an anonymous relation name it instead of
  refusing.
- C4 views grow from the canvas: the palette offers the kinds the view's level draws (persons and
  systems; containers and data stores in a container view; components in a component view), and a
  click declares the entity in the model, inside the view's scope where it belongs, includes and
  places it, and opens its label, which goes into the model. Copy, paste and Duplicate declare
  copies of entities, without their relations. A combination without an id is named in the view
  for a style, an effect, a route or a label, and the C4 context menu's entry reads **Connect
  to…** ([decision 0053](docs/decisions/0053-c4-entities-and-routes.md)).

### Command line

- `init --list` prints each template's title, description and contents ("1 model, 2 views").
- `skill install [folder]` gives a project's coding agents the skill that draws Meltemi diagrams:
  it writes `.claude/skills/meltemi-diagrams/` and `.codex/skills/meltemi-diagrams/` (`--agent`,
  `--user` for your own folders, `--force` to replace a copy), with the commands named as they are
  installed (`mdg validate`, `mdg preview`). The package ships the skill
  ([drawing with coding agents](docs/agents.md),
  [decision 0056](docs/decisions/0056-agent-skill-install.md)).

### Fixed

- An empty sequence diagram drew with an unknown width (`NaN`) on the canvas.
- Moving an end of a C4 relation left the views' `route` statements at the old entity, so the next
  edit of a view laid out with Arrange answered "The `route` statement for `uses` … is invalid"
  and the canvas refused every edit. The move now rewrites the routes of every view of the
  project, and refuses when it would break a view of another file.
- PNG, PDF and video exports give a browser that is starting two minutes to answer, not thirty
  seconds: a first start builds the browser's caches, which on a fresh or busy Linux machine took
  longer and failed the export with "The browser did not answer Browser.getVersion".

## 1.9.0 (2026-10-21)

The first version published: on npm (`@meltemi/diagrams-*`), the Visual Studio Marketplace and
Open VSX, with the hosted service at `https://diagrams.meltemi.dev`. It carries 1.8.0 and every
version below, which were not published on their own.

HTML diagrams that explain themselves: every drawing of the player, the catalog and the published
page zooms and pans, shows a card when the pointer rests on a box or a line, opens a panel of
details on a click, and opens what a box holds with a double click or its plus sign, the camera
moving to the box and the view morphing into the one it opens
([decision 0047](docs/decisions/0047-interactive-html-views.md)). The language stays 0.2: nothing
is written to open a view; C4 views with `level` and `scope`, and `link`, are what boxes open.

### Player and catalog

- Zoom and pan in every HTML drawing: Ctrl or Cmd and the wheel (or a pinch) zoom around the
  pointer from 10 % to 800 %, a plain wheel pans a drawing larger than its window and scrolls the
  page otherwise, a drag pans, and `+`, `-`, `0` (fit), `1` (actual size) and Shift with an arrow
  work from the keyboard; a zoom cluster joins the controls. The drawing first shows whole, never
  above actual size. Zoom is never part of the frame: **Download SVG** and exports are unchanged.
- The 100 ms step of the player moved from Shift with Left or Right to `,` and `.`.
- Hover cards: the label, the C4 type and technology, the description (three lines) and the link
  of an element; the label, ends, technology, description and assumption of a relation.
- A detail panel on a click or a tap: type, technology, the full description, **Open link**, the
  relations in and out, and in the catalog the stories that show the element, its entity and the
  views scoped to it. Up and Down walk the elements, Enter shows their details, Escape closes. A
  click on an element with a `url` selects it; Ctrl or Cmd and a click follows the link.
- Drill-down: a plus sign marks a system whose container view exists, a container whose component
  view exists, or an element whose `link` names a diagram; a double click, the plus sign or Enter
  opens it with a camera move and a morph (a cross-fade when the boxes differ), a cut under
  reduced motion. A trail names the views above; **Up**, Backspace and its crumbs go back.
- `meltemi-diagrams export --format html` of a diagram bundles every view a drill-down reaches
  across the project and says how many (`Wrote commerce.context.html (3 views)`); VS Code's
  **Export HTML Player** writes the same page.
- Player documents are at version 2 (`views` for diagrams, `details` per view) and catalog data at
  version 2 (what elements open, the stories that show each element and relation, parents).
- `<meltemi-player interactive="false">` draws the frame and the playback controls only.
- The catalog no longer leaves the page on a click: a click selects, a double click or **Open**
  goes to the opened view's page, which morphs in from the box; Back and Forward play the same
  moves. Breadcrumbs name the views above a C4 view, the elements table says what each element
  opens, an entity's page lists the views scoped to it, and `?element=` selects the element.
- The viewport math of the canvas is shared with the player as `@meltemi/diagrams-layout/viewport`.

## 1.8.0

Plain containers, deliberate stacks and bands behind boxes, a corner radius per element, and
twenty-four shapes that connectors meet and text fits, an AI agent among them, picked from the
canvas by their pictures, created empty and given their text where it is drawn
([decision 0043](docs/decisions/0043-containers-shapes-and-corners.md)); icons on any side or at
the centre of a box, sized per element or drawn as the shape itself, found with one icon picker
and dropped onto shapes; and short transitions on every popover, menu and panel of the canvas. The
language stays 0.2: `radius`, `labelPosition`, `iconSize` and the new `shape` and `iconPosition`
values are additive, flow nodes take `shape`, which they refused, and an untitled group changes no
statement.

### Language

- `radius <n>` (0 to 64, with or without `px`) sets the corner radius of nodes, `rounded` boxes,
  notes, framed texts, icons and images, and groups, over the theme's `radius` and `groupRadius`,
  in styles, classes, rules (`rule group { radius 0 }`) and plugin kind styles; relations refuse
  it.
- `radius` also rounds the corners of `rectangle`, `square` and `framed` boxes and nodes, the
  vertices of the polygons (`diamond` and decisions, `triangle`, `parallelogram`, `trapezoid`,
  `pentagon`, `hexagon`, `octagon`, `star`, `arrow`, `flag`, `callout`) and the bodies of `person`
  and `agent`; without it they keep square corners and sharp vertices
  ([decision 0045](docs/decisions/0045-rotation-and-corner-radius.md)). Ellipses, circles, pills,
  cylinders, clouds and documents have no corners and ignore it.
- `rotation <degrees>` (0 to 360) turns an element of a flow diagram or a free composition
  clockwise about the centre of its box, its text, icon and outside label with it, in styles,
  classes and rules; `place` and `size` keep describing the unturned box. Groups, sequence
  diagrams and C4 views refuse it with `prop.invalid-value`.
- `shape` takes twenty-four values: `rounded`, `rectangle`, `square`, `ellipse`, `circle`,
  `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`,
  `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person`, `agent`,
  an AI agent (`style planner { shape agent }`), and `icon`, the element drawn as its icon with
  its label outside (`style fn { icon "aws:lambda"; shape icon }`). Flow `node`s take it as free
  boxes do, and `rule node` and `rule box` may set it; decisions, data stores, notes, tags,
  groups, free texts, icons and images, sequence participants and C4 entities refuse it with
  `prop.invalid-value` naming `node` and `box`, in `style` statements as in rules. `fontSize`,
  `fontWeight` and `textAlign` stay free-only.
- `group <id> ""` without a description or an icon is untitled: a plain container whose interior
  starts `groupPadding` below its top edge.
- `iconPosition` takes `left`, `right`, `top`, `bottom` and `center` on nodes, decisions, data
  stores and boxes, as a style property and as a theme token. `labelPosition` (`top`, `bottom` by
  default, `left` or `right`) is the edge of the label when the icon is the centre piece
  (`iconPosition center` or `shape icon`). `iconSize auto | <n>` (8 to 128, with or without `px`)
  sizes an element's icon; the theme token keeps its 8 to 64. Relations and relation rules refuse
  the three with the hint that they apply to elements, and `iconSize 200` is `prop.invalid-value`.
  Plugin kind styles take them too.
- The model JSON writes `shape` after `source` on every element: the shape the declaration
  implies, such as `cylinder` for `id[("…")]`, or null. Its version stays 0.1.

### Layout

- Untitled groups draw only their outline, with no title, icon, description or gap in the
  connectors that cross them; their children keep half the padding from every edge, and the
  engine leaves `groupPadding` above them. Children of an untitled group are drawn 24 px higher
  than before in the technical themes.
- A box lying strictly inside a box declared before it on the same layer is a stack, not
  `layout.overlap`; partial overlaps and coinciding boxes are still reported, and so are stacks
  declared inner first, with a hint to declare the outer box first. Boxes and groups on different
  layers are not checked against each other, `layout.container-margin` included, and connectors
  are neither checked against nor routed around boxes on another layer or the boxes and groups
  that hold one of their ends. A container's own label may lie over the boxes it holds.
- A group with `place` and `size` is neither arranged nor an obstacle in `layout assisted`, so an
  untitled group on a back layer is a band behind the boxes the engine places; a placed and sized
  group with no children, and the relations that end on it, are left out of the engine's request.
- Every shape has a default size, a text area that sizing, `layout.text-overflow` and the label
  audit use, and an outline that connector ends meet: anchors, pinned points, named ports, lanes
  and engine routes slide along their side's normal onto it, while the text keeps `side n%`.
  Decisions with long labels grow until the label is inside the diamond, and connector ends on
  decisions, data stores and tags now touch their outline. `layout.connector-crossing` follows the
  outline, so a line through a diamond's empty corner is not reported.
- `agent` is drawn as a robot head, a rounded square with two eyes, a mouth and an antenna ending
  in a dot, over a rounded body that holds the text; 160 × 120 by default. The head and antenna
  take at most a third of the height, so connectors spread along a side meet the body, and an end
  on the north side meets the top of the head.
- The labels of nodes, decisions, data stores, boxes and C4 entities break at `\n` into lines, as
  descriptions, notes and texts did, and the box grows to hold them; one-line labels are drawn as
  before.
- In `layout auto`, a placed and sized group at the top level with nothing inside is a band drawn
  where it is written, out of the engine's way, and its `place` is not reported as ignored; a
  group's written `size` is the least size the engine gives it, its children centred inside
  ([decision 0044](docs/decisions/0044-containers-from-the-canvas-and-arrangements-that-keep-the-picture.md)).
  The engine interface passes it as `groups[].minimum` and returns the boxes of the groups.
- Free ends of connectors drawn by the anchor rules that land less than a lane apart on one side of
  a box spread a lane apart, ordered by where their other ends are, and a straight connector moves
  whole; two connectors into one side no longer share an anchor and an arrowhead.
- Rounded polygons are drawn with a curve through each vertex, cut `radius` along both edges, and
  connectors, magnets, hit tests and text areas follow the rounded outline. A turned element's
  scene group carries `transform="rotate(...)"`; connectors meet its turned outline (ports and
  pinned points turn with it), and the engine, derived groups, obstacles, the checks and the
  canvas size use the turned drawing's bounding box. `LayoutResult.rotations` and `radii` give the
  angles and radii.
- `meltemi-diagrams layout --all` writes the bends of the connectors the engine draws as `route …
via [...]` with free ends, naming anonymous relations `<from>_<to>`, so the file keeps the
  drawing of `layout auto`.
- Icons at the `right` of the text or `bottom` mirror `left` and `top`, the icon and the text one
  row or column centred in the text area. A written `iconSize` grows a box without `size` to hold
  the icon with its text, taller for a large icon beside it; in a box with a written `size` a
  number is clamped to the room the text leaves and `auto` fills it. With `iconPosition center`
  the label takes a band at the `labelPosition` edge inside the box and the icon is centred in
  the rest, as large as fits; such a node, decision, data store or box without `size` starts at
  120 × 120, wider for a long label, and shapes other than rectangles grow until their inscribed
  rectangle holds both. In a written `size` the centred icon keeps half the padding around it when
  the room is short, and a `size` without room for an 8 px icon is `layout.text-overflow`. C4
  entities take `left`, `right`, `top` and `bottom`, and draw `center` as `top`. Drawings without
  these properties are unchanged.
- `shape icon` draws the element's icon alone, filling its square: 64 × 64 at the 13 px label
  size, or a written `iconSize`, and a `size` wins with the icon fitted inside. `fill`, `stroke`
  or `pattern` frame it, and the frame grows the square by half the padding on each side, so the
  icon keeps its size. The label and the description are drawn outside at `labelPosition`,
  half the padding away, aligned by `textAlign`. Anchors, magnets, ports and compass sides use the
  square; the engine, the composition checks, group margins, derived groups, connector obstacles
  and the canvas size count the label too, the engine's routes end on the square, and the
  element's own connectors pass under its label. `LayoutResult.elementLabels` gives the label box
  of each icon shape.
- New warnings: `layout.icon-missing`, on the `shape` of an element drawn as its icon without one,
  which draws a dashed placeholder with the id; and `layout.label-position-ignored`, on a
  `labelPosition` where the icon is not the centre piece, groups included, and once, on the
  diagram's `theme`, for one a theme gives; on groups, tags, notes, texts, icons, images and C4
  entities, whose icon is never the centre piece, its hint is to remove it. An icon shape whose
  written `size` leaves its icon under 8 px is `layout.text-overflow`, with a size that holds it.

### Canvas (VS Code and the playground)

- The box and node buttons are split: the main part creates the current shape, the arrow opens a
  grid of the twenty-four shapes with their pictures and names, and the choice is written as
  `style <id> { shape … }` in the same edit. F opens the grid from the keyboard (type to filter,
  Enter to create), B and N repeat the current shape, and a read-only canvas shows no arrows.
- Nodes, decisions, data stores and boxes are created empty, as in draw.io and Excalidraw: the
  palette, a drop, N, D, S, B and the shapes grid write `node1[""]`, `decision decision1 ""`,
  `data1[("")]` or `box box1 ""` and select it without opening the label editor, and a
  double-click, Enter or F2 adds the text. Notes, tags and free texts keep their default text and
  open the editor, groups keep "Group", and library elements keep their label and open no editor.
- Text is edited where it is drawn: a borderless text area over the shape's text area (the body of
  `person` and `agent`), the label box, a group's title or a relation's label, in the drawing's
  font, size at the zoom, weight, colour and alignment, with the drawn text hidden meanwhile and
  the browser's autocomplete, spelling and correction off. It grows with its lines; Enter, Tab or
  a click outside keeps the text, Shift+Enter starts a new line (written `\n`) in labels drawn on
  several lines, and Escape cancels. Shift+F2 renames the id in the same editor, and sequence
  notes, fragment conditions, dividers and delays use it too.
- The arrow button is split for `->`, `-->`, `<->` and `<-->`; R cycles the kinds while the
  relation tool is armed, and the status line names the current one.
- Dragging a selection into a group, or out of its group, moves the declarations into that block
  and writes their places in its interior, in one undo step (`moveElement`); Alt keeps the groups
  and nudges never change them. A group dropped from the palette inside a group nests in it. The
  inspector's Inside field moves an element too.
- Alt+click and **Select the shape below** reach covered shapes; Ctrl with the arrows prefers the
  nested shape. Clicks, magnets, the border point and the highlight follow a shape's outline.
- The strip's **Shape** shows pictures, for free boxes and flow nodes only. **Corner radius** is a
  slider from 0 to 64 with the radius drawn greyed, shown only where a radius is drawn: `rounded`
  boxes and nodes, notes, the frames of free texts, icons and images, and groups.
- A file without diagrams offers **Flow diagram**, **Free composition** and **Sequence diagram**
  buttons and clears the diagram picker, the inspector, the minimap and the badges of the last
  drawing; **New diagram** (+) beside the picker offers the same kinds in any file. Each writes
  `diagram <id>: <type> { }` with the first free `diagram<n>`, after `language "0.2"` when the
  file has none, in one undo step (`createDiagram`), and shows it. Read-only canvases and story
  mode offer neither.
- The diagram's **Canvas** field chooses fit to content, `document`, `slide` or a custom width and
  height from 100 to 10000, writing `preset` or `canvas (w, h)` and removing the other in one undo
  step.
- The arrow part of a split button is a chevron at full contrast inside one outline with the main
  part, with hover and focus states and the tooltips "More shapes (F)" and "Kinds of arrow (R
  cycles)"; a right-click or a 450 ms press on the main part opens the same menu, and a short click
  arms the tool.
- While boxes of a flow diagram, a free composition or a C4 view are dragged or resized, their
  connectors, labels and groups follow as the drop will draw them: the session plans the drop on a
  copy of the text and answers the canvas's `preview` with the drawing, writing nothing. Escape
  brings back the drawing from before the gesture.
- The canvas protocol has the actions `createDiagram` and `preview`, the host message `preview`,
  `creatable` on `empty`, and `text` on elements, relations and events (where their text is drawn
  and in which font); hosts pass them on unchanged.
- Completion and hover know the twenty-four shapes and `radius` in both profiles; completion
  offers `auto` for `iconSize`, and the highlighting knows `labelPosition`, `iconSize` and
  `shape icon`.
- The group button is split: **Group** writes a titled group and **Container** an untitled one,
  created with its place and size and selected without opening the label editor; G creates the
  current kind. **Convert to container**, in the context menu and beside **Inside**, turns a flow
  node or a free box into a group holding the boxes stacked on it, in one undo step
  (`convertToContainer`): its `shape` goes (`square` and `rectangle` become `radius 0`) and its
  size is kept. A box dropped on a box that is not a group is stacked on it, and the status line
  says how to make that box its container.
- **Recompute Layout** keeps the picture: it writes the engine's bends as waypoints, keeps bands
  and container sizes, and says in the status line why when the diagram cannot be arranged.
- A selected element shows a rotation handle beyond its top-right corner: dragging it turns the
  element in 15° steps (Alt for any angle), live with its connectors, and the release writes
  `rotation` in one undo step; Escape cancels. A turned element's selection, handles, magnets,
  hit tests, resizing and text editor work in its own frame. The strip has **Rotation** (0 to 359)
  and **Corner radius** wherever corners are drawn, polygons and rectangles included; the context
  menu has **Rotate 90°** and **Reset rotation**.
- One icon picker, a popover opened by I and the icon button on flow and free diagrams, by
  **Icon…** in the context menu and by **Choose…** on the inspector's Icon field: it searches the
  packs and the libraries as you type, groups the results with 24 px thumbnails and names, puts a
  typed `pack:name` first and, with nothing typed, the icons chosen while the canvas is open, then
  the Technology library's first category. Arrows move, Enter chooses, and Escape or the icon
  button closes it; I typed in its search field is part of the query; read-only canvases never
  open it, and on C4 views only **Choose…** does, with the packs' icons alone. With nodes,
  decisions, data stores or boxes selected, a choice sets their icon in one undo step; without
  them, the placement control (**Icon**, **In a box**, and **Only the icon** on free diagrams)
  arms a tool whose ghost shows the icon: a click on a node, a decision, a data store or a box
  gives it the icon, a click on empty canvas places it empty (`node1[""]` with
  `style node1 { icon "aws:lambda"; shape icon }`), and Enter places it near the centre; on free
  diagrams, **Only the icon** writes an `icon` object.
- Icons of the picker and the Libraries panel dropped onto a node, a decision, a data store or a
  box give it that icon and nothing else, the target outlined during the drag; dropped on empty
  canvas they create the element. **Remove icon** in the context menu takes an element's own
  icon away.
- The Libraries panel has the same placement control, shared with the picker, and creates an
  element drawn as its icon by default: `lambda1["AWS Lambda"]` with
  `style lambda1 { icon "aws:lambda"; shape icon }`; **In a box** writes a node or a box of the
  current shape with the icon beside its label. Its toggle's tooltip is "Libraries (U)".
- The inspector's Icon field shows the icon's thumbnail, name and reference with **Choose…** and
  **Remove**, and opens the canvas's picker on flow diagrams, free compositions and C4 views;
  **Icon position** (also in the strip, after Shape) and **Label position** are picked from
  pictures, the latter only when the icon is the centre piece, and C4 entities, which draw
  `center` as `top`, get the other four positions; **Icon size** is a slider from 8 to 128 with
  the drawn size greyed, **Auto** and **Clear**.
- Icon shapes are selected, resized and connected on their square, while their label counts for
  presses, the selection rectangle and connection drops; their label is edited in place outside
  the square. Choosing `icon` in the shapes grid opens the icon picker.
- Popovers and menus open from their anchor with a fade, a 4 px rise and a slight scale over
  160 ms and close with a 120 ms fade; the Libraries and Layers panels slide in from the left, the
  inspector and the theme panel from the right; tooltips appear after 400 ms; drop and connection
  targets and the inline editor's outline fade in; buttons and chips change colour smoothly. They
  run on the motion tokens of `canvas.css` (`--mdg-motion-fast`, `--mdg-motion`,
  `--mdg-motion-slow`, `--mdg-ease`); when the system asks for reduced motion the durations are
  zero and nothing moves.
- The canvas protocol has the message `searchIcons`, answered by `icons`, the actions `setIcon`
  and `removeIcon`, `create` with `icon` and `shape: "icon"`, and `takesIcon`, `icon` and
  `labelBox` on elements; hosts pass them on unchanged. Hosts pick images only: icons are chosen
  in the canvas, and the playground's icon dialog and the extension's icon list are removed.

### Import

- Mermaid flowcharts and block diagrams keep hexagons, parallelograms, trapezoids, circles,
  stadiums, subroutines, flags, documents and triangles as `shape` styles; mirrored and double
  forms are approximated to the nearest shape. Block arrows are boxes with `shape arrow`,
  approximated when they do not point right, and nested blocks are untitled groups placed from
  their padding.
- PlantUML `cloud`, `hexagon`, `usecase`, `interface`, `circle`, `actor`, `person`, `card`, `file`
  and `folder` keep a shape of their own instead of being approximated.

### Fixed

- Converting a flow diagram to a free one, and pasting a fragment, dropped `layers` and `layer`.
- The shorthand `id[("…")]` lost its cylinder in the model JSON.
- C4 entities were never checked for overlaps, crossings or margins inside their boundaries.
- Changing a node with a `shape` into a decision, a data store, a note or a tag left a `shape` the
  new kind refuses; the change now removes it.
- Double-clicking a selected relation's label did not edit it: the handle in the middle of the
  line took the second click.
- The context menu, the Arrange menu and **Connect to…** opened a side panel's width away from
  the pointer while the Libraries or Layers panel was open.

### Delivery

- The repository is public at `https://github.com/askenaz-dev/meltemi-diagrams`; every package,
  the extension and the documents name it ([decision 0046](docs/decisions/0046-delivery.md)).
- The hosted playground and its service run at `https://diagrams.meltemi.dev`, deployed from `main`
  by `deploy.yml`; published pages are served at `https://meltemi.page/<handle>/<page>/`.
- Releases are published by `release.yml` from a tag: the npm packages with provenance, the
  extension on the Visual Studio Marketplace and Open VSX, and the GitHub release
  ([releasing](RELEASING.md)).
- The service's assets are served without running the Worker, which runs first only for its own
  paths; the playground's build writes `_headers` with the two headers the Worker added.
- The service reads its secrets from the family's Secrets Store; `ADMIN_SUBS` is a secret, no longer
  a variable. Its infrastructure is Terraform in the Meltemi Web repository; nothing is configured
  by hand.

## 1.7.0

Element libraries with the providers' icons, layers in flow diagrams, and connectors selected and
outlined as drawn ([decision 0041](docs/decisions/0041-element-libraries.md)). The language stays
0.2: `layers` and `layer`, which free compositions had, now work in flow diagrams too; nothing
else changes in the text.

### Icons and libraries

- Built-in packs `aws` (AWS Architecture Icons), `azure` (Azure architecture icons), `gcp`
  (Google Cloud icons), `kubernetes` (Kubernetes icons) and `logos` (SVG Logos), beside `tabler`,
  with each icon's label and the vendors' categories; `pnpm vendor:icons` converts a new vendor
  release. The vendors' terms are in `THIRD_PARTY_LICENSES.md` and in the notices of the
  extension and the playground; `aws`, `azure` and `gcp` are marked as not freely redistributable.
  A project pack may replace a built-in provider pack.
- The **Libraries** panel (toolbar toggle, U): AWS, Azure, Google Cloud, Kubernetes and Tabler by
  category, Technology from the logos, a project's `assets/libraries/*.json` and a plugin's
  `libraries`, with a search box; a click or a drag creates a node (a box in free compositions)
  with its label and `style <id> { icon "…" }`.
- Iconify packs may carry `labels`; the playground fetches a provider pack the first time a
  document or the panel needs it.

### Layers

- `layers` and `layer` in flow diagrams, painted layer by layer with groups first, then elements,
  relations and tags; the inspector's Layer and Layers fields show there too.
- The **Layers** panel (toolbar toggle, L): add, rename, remove, reorder, hide or show layers, and
  move the selection to one. Hiding is a view of the canvas and writes nothing.
- Element and relation groups on a layer other than `main` carry `data-layer` in the SVG.

### Canvas

- A selected connector's outline and its midpoint handle follow the connector as drawn: a Bézier
  route's curve, rounded corners, detours.
- The selection rectangle selects the connectors fully inside it, with the boxes.

### Projects

- `assets.lock.json` records the built-in provider packs: run `meltemi-diagrams assets lock` once
  after upgrading.

## 1.6.0

Connectors go around boxes whatever their ends, and the canvas takes its colours from the theme
([decision 0040](docs/decisions/0040-detours-and-canvas-colours.md)). The language stays 0.2: two
theme tokens are added; drawings change only where a connector ran through a box.

### Layout

- In every layout mode, an `auto` or `orthogonal` connector without waypoints or lane whose route
  — the engine's or the anchor rules' — runs through another box goes around it: free ends first
  try the L and Z routes between side middles, then the shortest orthogonal detour that keeps the
  connector's own ends and sides, pinned ones included.

### Canvas (VS Code and the playground)

- The handle that adds a bend sits on the connector as drawn, halfway along its stretch.
- The selection, handles and guides take the diagram theme's `accent`, or its new `selection` and
  `guide` tokens (theme panel › Canvas). Exports never use them, and styles cannot name them.

### Fixed

- **Recompute Layout** failed with "Text edits overlap" when it removed the last routes of the
  `placement` block, and the playground could not start with such a file kept: the new places are
  now written where the removed routes were.

## 1.5.0

Connectors meet boxes at any point of their border, and recomputing the layout lets the engine
choose those points again ([decision 0039](docs/decisions/0039-border-connection-points.md)). The language stays 0.2: routes already took any percentage; no drawing
of an existing file changes.

### Canvas (VS Code and the playground)

- Dragging a connector's end, or a new connection, over a box or within 12 px outside it shows the
  box's outline and its magnets (the middle of each side, the corners and its named ports). The end
  takes any point of the nearest side, to 1 %, or a magnet within 6 px; Alt turns the magnets off.
- Hovering within 8 px outside a box's border shows the point a connection would start from; a
  drag from there to another box creates the relation with its start pinned to that point, and its
  end pinned when dropped on the target's border.
- The canvas protocol's `connect` pins its start and its end independently.

### Edits and the CLI

- `arrange` with scope `all` (**Recompute Layout**, `meltemi-diagrams layout --all`) also frees
  route ends: compass sides and points go, named ports stay, and a route left with nothing is
  removed, so the engine chooses where connectors meet the boxes.

## 1.4.0

Connector ends pinned to points of sides
([decision 0038](docs/decisions/0038-pinned-connector-ends.md)). The language stays 0.2: no valid
file could write a percentage after a route end before, and no drawing of an existing file changes.

### Language

- `route save from api.east 50% to db.north 25%`: a percentage after a compass side pins the end
  to that point of the side, like a named port, in every layout mode; bends do not move it. The
  model JSON writes `position` on pinned ends.

### Canvas (VS Code and the playground)

- Dragging a connector's end, or a new connection, over a box shows its points (the middle and
  the quarters of each side, and its named ports) and snaps to them; near a side the end takes the
  pointer's point to 5 %, or 1 % with Alt; inside the box it is free again.
- A connection dropped on one of the target's points pins both ends.
- A double click on an end hands it back to the layout; a route left with nothing else goes.

### Fixed

- A double click on a bend removes it again: handles are redrawn between the two clicks, which
  browsers did not count as a double click.
- Removing a route's last bend no longer leaves `via []` behind.

## 1.3.0

English and Spanish ([decision 0037](docs/decisions/0037-languages.md)). The interface follows the
person's language; exported files follow the project's, never the machine's, so the same sources
still export the same bytes everywhere. English output is unchanged. The language stays 0.2.

### Projects and exports

- `project.json` takes `"locale": "en" | "es"`: the language of the words the tool adds to
  exports, such as the type lines of C4 entities (`[Contenedor: Go]`), the controls and summary of
  HTML players and the headings and search of catalogs, whose pages carry it as their `lang`.
- Every command takes `--lang en|es`, for its files and its messages.
- `@meltemi/diagrams-i18n`, the nineteenth public package: locales, typed catalogs in English and
  Spanish, and formatting by language.

### Editor, canvas and playground

- VS Code: `meltemi.language` (`auto` follows VS Code's display language); command titles and
  setting descriptions in both languages; changing the setting redraws open canvases.
- The canvas, its inspector, theme panel, menus, announcements and story timeline in both
  languages; words written into files, such as the label of a new node ("Nodo"), follow the
  interface.
- The playground follows the browser's language or the globe menu in its header, which reloads
  the page keeping the work; the export dialog chooses the language of the export.
- The inspector says "mixed" and "theme" through flags (`mixed`, `fromTheme`), so translating them
  cannot change behaviour.

### Messages

- Diagnostics, hints and related notes, quick-fix titles, hover and completion, the reasons an
  edit is refused, import findings and the command line's help and messages in the interface
  language; codes, severities and ranges unchanged.
- Diagnostics carry `data` (the ids they name, the alternatives a fix may write, the size that
  fits a text), and quick fixes read it instead of words.

### Documentation

- The guides, the language reference, the tracks and the import pages in Spanish under
  `docs/es/`, and `README.es.md`; every page links to its other language, and a test keeps both
  in step (headings, code, links).

### Fixed

- The fix of an unknown theme rewrites the theme's value in a single file too.
- The inline label editor no longer scrolls the canvas sideways near its right edge.

## 1.2.0

Arrow ends and shapes, and the trace effect
([decision 0035](docs/decisions/0035-trace-effect.md),
[decision 0036](docs/decisions/0036-connector-ends-and-shapes.md)). The language stays 0.2: every
addition is something no valid file could contain before, and no drawing of an existing file
changes. The model JSON keeps version 0.1 and gains `twoWay` on relations.

### Language

- Two-way arrows: `a <-> b` and `a <--> b` draw the head at both ends, in flow, free and sequence
  diagrams.
- `arrowtail` sets the head at a relation's source. `arrowhead` and `arrowtail` (and the theme
  token `arrowhead`) take fifteen heads: `triangle`, `open`, `none`, `triangleOutline`,
  `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, and the crow's feet
  `many`, `oneOrMany`, `onlyOne`, `zeroOrOne` and `zeroOrMany`.
- `line dotted` draws round dots; `corners rounded` (style and theme token) rounds the bends of
  straight and elbow connectors.
- `effect trace`: a highlight that fills a relation from its start to its end, then fades and
  starts again; `traceDuration` sets its default speed (1500 ms).

### Canvas (VS Code and the playground)

- The strip shows the line, the route kind, the corners and both heads as pictures; each head
  opens a grid of every head. Dotted is written as a style, solid and dashed as the arrow.
- A **Trace** toggle with its speed beside the other effects.

### Import

- Mermaid `<-->`, `o--o`, `x--x`, `--o`, `--x`, link curves and sequence `<<->>` and PlantUML
  two-headed arrows, hollow triangles, diamonds, crosses and crow's feet are kept instead of
  approximated.

### Fixed

- The new-theme dialog accepted ids with `-`, which the language refuses.

## 1.1.0

Styling and custom themes on the canvas
([decision 0034](docs/decisions/0034-canvas-styling-and-themes.md)). The language stays 0.2: the
new theme tokens are additions no valid file could contain before. The model JSON and the APIs
are unchanged, and no drawing of an existing file changes.

### Language

- `flowDuration`, `dashDuration` and `pulseDuration`: a theme sets the default speed of each
  effect, written with `ms` or `s` from 100 ms to 60 s. An effect's own `duration` still wins;
  built-in themes write none, so the engine's 1200, 1000 and 1000 ms stay the defaults.

### Canvas (VS Code and the playground)

- The style strip at the top of the inspector: fill, stroke and text colour as chips of the
  theme's sixteen colour tokens in the theme's own colours, a colour picker for a fixed colour,
  **Theme** to inherit again; line, width and arrowhead; the effects as toggles with their speed
  and the theme's default greyed; for the diagram, the theme with its light or dark counterpart.
  Several items are styled in one edit.
- Styles and effects on an anonymous relation name it first, as labels and routes do; relations
  have a classes field.
- **Choose…** on the Icon field picks an icon for elements and relations of every profile.
- The relation tool (R; **Message** on sequence diagrams): click the source, then the target,
  Shift for a dashed line; the new relation is selected.
- **New theme from this one…** creates a theme that extends the diagram's, in the file or for the
  project (`themes/<id>.meltemi` and the default in `project.json`, kept as formatted).
- The theme panel edits a theme's tokens by group, in the file that holds the theme, with the
  bundled and project fonts for text and code.

### Edits

- `createTheme`, `setThemeToken` and `removeThemeToken` operations, with minimal edits, inverse
  plans and fixtures.

## 1.0.0

The first public version: the complete product described in the proposal.

### Language and model

- The `.meltemi` language 0.2: a lossless parser, stable diagnostics, comments and formatting kept
  by every edit, and the formatter.
- Four profiles in one model: `flow` diagrams, `free` compositions, `sequence` diagrams with
  scenarios, and architecture models with C4 context, container and component views.
- Projects with `project.json`, imports with namespaces, shared themes, models and stories across
  files, assets with a lock, plugins that declare diagram types and icon packs as data, and limits
  for untrusted repositories.
- The model JSON interchange format (`convert --to json`).

### Drawing

- Six themes, a full token set, classes and rules, document and slide presets.
- Bundled open fonts with measured text, embedded subsets or outlines.
- The Tabler icon pack, Iconify and SVG packs, sanitised project images.
- Automatic (ELK), assisted and manual layout, named ports, constraints, lanes, orthogonal,
  straight and curved connectors that go around boxes, labels that slide clear, composition
  checks and a label audit.

### Motion and stories

- Effects on a deterministic clock, the animated SVG profile and frames at any time.
- Stories with scenes, reveals, highlights, camera, traces and transitions.
- The HTML player, as a page or an embeddable fragment, accessible by keyboard and with reduced
  motion.

### Exports and delivery

- SVG, PNG, PDF (vector, with fonts, text and links), MP4, WebM and GIF, through the installed
  browser and FFmpeg, and export profiles in the sources.
- The offline HTML catalog of a project.
- Exports verified in Edge, Chrome and Firefox, deterministic by content, with a kit for slide
  applications.

### Tools

- The `meltemi-diagrams` command (alias `mdg`): `init` with five templates, `preview`, `validate`,
  `format`, `layout`, `convert`, `import`, `export`, `build catalog`, `review`, `assets`,
  `plugins` and `assist`, with CI workflows for GitHub and GitLab.
- Mermaid and PlantUML importers with coverage reports and re-import that keeps adjustments.
- The VS Code extension: every language feature and a canvas beside the code where every gesture
  is a small edit of the text.
- The playground: templates, code and the same canvas in a static web page, every export, with no
  account.
- Optional AI assistance with Anthropic or OpenAI-compatible endpoints, as reviewable proposals.

### Quality

- The acceptance corpus, visual regression, determinism, performance targets on the reference
  machine and the browser matrix, run together by `pnpm acceptance`.
- The conformance suite (`pnpm conformance`) and the language change policy.
- The release check (`pnpm release:check`).
