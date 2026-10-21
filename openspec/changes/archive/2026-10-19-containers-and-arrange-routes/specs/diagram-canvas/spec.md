## ADDED Requirements

### Requirement: Containers on the canvas
The group button SHALL be a split button: its main part SHALL arm the tool with the canvas's current kind of group (**Group** until one is chosen) and show its picture; its arrow part SHALL open a menu of two kinds with a picture and a name each, **Group** (a band with a title) and **Container** (an untitled group, a plain container), and choosing one SHALL make it current and arm the tool. G SHALL create the current kind near the centre; Alt+G SHALL keep grouping the selection with a title. A container SHALL be created with `createElement` as a group with the label `""`, its `place` and its `size`, inside the group under the drop point, with no style written, and SHALL then be selected without opening the label editor.

The context menu of a flow node or a free box, and a **Convert to container** button under **Inside** in the inspector, SHALL run `convertToContainer` with the boxes stacked on the element (whole inside its box, declared after it, on its layer) as children, their free places in the new interior, and the element's drawn size; the status line SHALL name the container and its children. When a drop leaves a moved element stacked on a node or box of its layer that is not a group, the status line SHALL say so and name the conversion, writing nothing.

When an arrange cannot be made because the diagram has layout errors, the status line SHALL say that the problems must be fixed first and give the first message, instead of doing nothing.

#### Scenario: Create a container
- **WHEN** the arrow of the group button is pressed on a flow diagram, **Container** is chosen and the stage is clicked at (420, 260) with a 14 px grid, then G is pressed
- **THEN** the text gains `group group1 "" { }`, `place group1 at (420, 266)` and a `size group1` in one undo step, then `group group2 "" { }` with a place and a size near the centre, no label editor opens, and the group button shows the container

#### Scenario: Convert a square with a database on it
- **WHEN** `node3` is a flow node with `shape square`, a fill and `size node3 (238, 196)`, `db` is declared after it and drawn whole inside it, and **Convert to container** is chosen on `node3`
- **THEN** the text declares `group node3 "" { db[("Database")] }`, `style node3 { … }` keeps the fill and gains `radius 0` without `shape`, `place node3` and `size node3` are unchanged, `api -> db` still resolves, the status line says `node3` is now a container holding `db`, and dragging `node3` moves `db` with it

#### Scenario: Refused conversion
- **WHEN** **Convert to container** is chosen on a node that declares `port in west`
- **THEN** the text is unchanged and the status line says the ports must be removed first

#### Scenario: A drop that stacks
- **WHEN** `db` is dropped whole inside the box of `node3`, a node with `shape square` that is not a group
- **THEN** `db` keeps its parent, its `place` is written where it was dropped, and the status line says `db` is stacked on `node3` and that converting `node3` to a container moves them together

#### Scenario: Refused arrange
- **WHEN** **Recompute Layout** is chosen on an `assisted` diagram holding a placed and sized group without children inside another group, which `auto` cannot draw (`layout.missing-placement`)
- **THEN** nothing is written and the status line says the problems of the diagram must be fixed before arranging it, with that message
