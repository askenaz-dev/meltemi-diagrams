## MODIFIED Requirements

### Requirement: Relation operations
The edit package SHALL support:

- **`renameRelation { relation, newId }`**: renames a named relation and every `route`, `label`, `style` and `animate` reference to it;
- **`removeRelation { relation }`**: deletes the relation, its `route` and `label`, and its style and animate targets, keeping shared statements for other targets;
- **`reconnectRelation { relation, end, element, port? }`**: replaces one endpoint, and its port in the `route`;
- **`setRelationLine { relation, line }`**: switches `->` and `-->`, and `<->` and `<-->` for a two-way relation, which stays two-way.

A relation that cannot be named because it is anonymous SHALL be addressed by its key.

#### Scenario: Reconnect the target
- **WHEN** `api -> db as save` with `route save from api.east to db.west` is reconnected to `cache` at the north port
- **THEN** the relation reads `api -> cache as save` and the route `route save from api.east to cache.north`

#### Scenario: Dashed two-way
- **WHEN** `setRelationLine` sets `line` `dashed` on `api <-> cache as sync`
- **THEN** the relation reads `api <--> cache as sync`
