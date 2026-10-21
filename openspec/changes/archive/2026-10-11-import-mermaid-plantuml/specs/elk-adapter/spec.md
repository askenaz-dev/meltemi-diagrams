## ADDED Requirements

### Requirement: Relation ends on group sides
When a route names a side of a group (`route r from api.east to fn.west` where `api` is a group),
the ELK graph SHALL give the group's container a port on that side, with fixed sides and positions
chosen by ELK, so the layout succeeds. The drawn connector SHALL start or end on the border of the
group as drawn: an end that the engine leaves short of or inside the group's box SHALL move along
its first or last segment onto the border.

#### Scenario: Route from a group
- **WHEN** a flow diagram in `layout auto` routes a relation from `api.east`, where `api` is a
  group, to a node
- **THEN** the layout has no diagnostics and the connector's first point lies on the right edge of
  the drawn group
