## ADDED Requirements

### Requirement: Accessible connector endpoint changes

An editable flow, free or C4 connector SHALL expose both endpoints through screen-space drag handles and a filtered element picker in its context menu. A combined C4 connector SHALL continue to connect the same model entities, and C4 view-local notes SHALL not appear as destinations. The connector SHALL stay selected when a successful edit changes its key, and the edit SHALL preserve its label, style, opposite endpoint and existing bends.

#### Scenario: Change an endpoint of an imported connector

- **WHEN** the person selects a Mermaid-derived flow connector and drags its destination handle to another node
- **THEN** the connector attaches to the new node, retains its appearance and remains selected

#### Scenario: Change an endpoint with the keyboard

- **WHEN** the person opens the selected connector's context menu and picks another element for its source or destination
- **THEN** the corresponding end changes in one source edit

#### Scenario: Release without a valid destination

- **WHEN** the person clicks an endpoint without dragging, cancels the drag or releases it over empty canvas
- **THEN** the source is unchanged

### Requirement: Visual alignment precision

Alignment and distribution SHALL use the geometry shown by the canvas and maintain the precision supported by placement statements. Guide snapping SHALL land on the indicated guide within placement precision.

#### Scenario: Align the displayed edges of rotated elements

- **WHEN** the person aligns the left edges of a rotated shape and an upright box
- **THEN** the displayed bounding boxes share a left edge to the precision of a written placement

#### Scenario: Align a child with a box outside its group

- **WHEN** the person aligns a child in a placed, auto-sized free group with a box outside it
- **THEN** the group's interior origin stays steady and the child's displayed edge aligns with the external box

#### Scenario: Fractional guide intersections

- **WHEN** the person drags a box onto separate horizontal and vertical guides with fractional coordinates
- **THEN** the drop follows both guides within placement precision

## MODIFIED Requirements

### Requirement: Dragging in automatic mode materialises the layout

A gesture that changes geometry in a `layout auto` diagram SHALL materialise the current layout in the same edit batch. The diagram then becomes `layout assisted` with every box placed at the precision supported by placement statements. Only the boxes changed by that gesture SHALL change position, and authored routes SHALL remain intact.

#### Scenario: First drag in auto

- **WHEN** `api` is dragged by (28, 0) in a `layout auto` diagram of four boxes without `place` statements
- **THEN** the text gains `layout assisted` and four `place` statements, `api` is 28 px right of its arranged position, the other three boxes keep their positions, and one undo restores the original text

#### Scenario: First alignment with a manual route

- **WHEN** nodes are aligned in a `layout auto` diagram with an explicit route
- **THEN** the existing route, its anchors and its bends stay written
