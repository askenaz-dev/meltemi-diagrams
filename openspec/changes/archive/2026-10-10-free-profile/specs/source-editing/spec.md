## ADDED Requirements

### Requirement: Creating free objects
`createElement` SHALL accept the kinds `box`, `text`, `icon` and `image` in free diagrams, and `group` in both profiles. It SHALL write:

- `box <id> "<label>"`, defaulting the label to `Box`;
- `text <id> "<text>"`, defaulting the text to `Text`;
- `icon <id> "<source>"`;
- `image <id> "<source>"`.

`icon` and `image` SHALL require `source`, and SHALL otherwise be refused with `edit.invalid-value`. In a free diagram, `at` SHALL be written as given, since the host converts it to the parent's interior coordinates. Flow kinds SHALL be refused in free diagrams and free kinds in flow diagrams with `edit.invalid-value`.

#### Scenario: Icon with a source
- **WHEN** `createElement { kind: "icon", source: "tabler:server", at: (420, 266) }` runs on a free diagram whose ids include `icon1`
- **THEN** `icon icon2 "tabler:server"` is inserted after the last declaration, and `place icon2 at (420, 266)` in the placement block

### Requirement: Reordering declarations
`reorderElement { element, to }` SHALL move an element's declaration, with its block and the comments attached to it, among its sibling declarations in the same block:

- `front` makes it the last sibling declaration;
- `back` makes it the first;
- `forward` moves it after the next sibling declaration;
- `backward` moves it before the previous one.

Relations and other statements SHALL stay where they are. A move that would change nothing SHALL return an empty plan. Implicit elements SHALL first gain a declaration.

#### Scenario: Send backward
- **WHEN** a free diagram declares `a`, `b` and `c` in that order and `c` is sent backward
- **THEN** the order of the declarations is `a`, `c`, `b`, and the text compiles without new errors

### Requirement: Layer and link statements
`setElementProperty { target, targetKind, property, value }` SHALL set, replace or (with `null`) remove the `layer` or `link` statement in the block of an element or relation, creating the block when needed. A `layer` value SHALL name a declared layer and a `link` value SHALL be `<diagram>.<element>`; other values SHALL be refused with `edit.invalid-value`. `link` SHALL be refused on relations.

#### Scenario: Move to a layer
- **WHEN** `box a "A"` in a free diagram with `layers main, front` is set to layer `front`
- **THEN** the declaration reads `box a "A" { layer front }`

### Requirement: Arranging free diagrams
`arrange` with `writeGroups: true` SHALL also write a `place` and a `size` for each group. In a free diagram, the places of group children SHALL be written relative to their group's interior origin. Without `writeGroups`, groups SHALL be left as they are.

#### Scenario: Write an automatic free layout
- **WHEN** an `auto` free diagram with group `g` holding `a` is arranged with scope `all` and `writeGroups: true`
- **THEN** `g` gains a `place` and a `size`, and `a`'s `place` is relative to `g`'s interior

### Requirement: Links follow renames and removals
`renameElement` SHALL rewrite the element part of every same-file `link` that targets the renamed element. `removeElement` SHALL list the `link` statements targeting the element as dependents of kind `link`. With `cascade` it SHALL remove those statements, and a block left empty SHALL be removed with them. `ungroup` SHALL remove the links to the group, with a note.

#### Scenario: Rename a linked element
- **WHEN** `api` of `diagram checkout` is renamed to `gateway` and `checkout_free` holds `box api "API Gateway" { link checkout.api }`
- **THEN** the link reads `link checkout.gateway`, and the box keeps its id `api`

### Requirement: Icon and image sources
`setElementSource { element, source }` SHALL replace the icon reference of an `icon` object or the path of an `image` object, and SHALL be refused with `edit.unsafe-target` for other elements. `setElementLabel` SHALL be refused for icons and images, which have no label.

#### Scenario: Change an icon
- **WHEN** `icon i "tabler:user"` gets the source `tabler:server`
- **THEN** the declaration reads `icon i "tabler:server"`
