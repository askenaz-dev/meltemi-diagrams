# Spec Delta

## ADDED Requirements

### Requirement: Reverse relation
`planEdit` SHALL support `{ kind: "reverseRelation", diagram, relation }`, which swaps the ends
of a flow relation or a sequence message, or reverses the points of a free line, keeping id,
label, kind, line, styles, effects and tags; its `route` SHALL be turned around and `label … at
p%` SHALL become `(100 − p)%`. A self relation, a `return` and a C4 view relation SHALL be
refused.

#### Scenario: Reverse a flow relation with a route
- **WHEN** `reverseRelation` runs on `api -> db as save` with `route save from api.east 25% to db.in via [(300, 40), (300, 120)]`, `in` a named port of `db`
- **THEN** the text reads `db -> api as save` and `route save from db.in to api.east 25% via [(300, 120), (300, 40)]`, and compiles without errors

#### Scenario: The label stays put
- **WHEN** `reverseRelation` runs on a relation with `label save at 30% offset (0, -8)`
- **THEN** the placement reads `label save at 70% offset (0, -8)`

#### Scenario: Styles and effects follow the relation
- **WHEN** `reverseRelation` runs on `pay` with `style pay { arrowhead diamond }` and `animate pay { effect flow }`
- **THEN** both statements are unchanged, so the diamond is drawn at the new target and the particles run from the new source

#### Scenario: Reverse a sequence message
- **WHEN** `reverseRelation` runs on `customer -> api: "Pay" as pay` followed by `activate api` and `deactivate api`
- **THEN** the text reads `api -> customer: "Pay" as pay` followed by `activate customer` and `deactivate customer`, and the events keep their order

#### Scenario: Reverse a reply
- **WHEN** `reverseRelation` runs on `api --> customer: "Receipt"`
- **THEN** the text reads `customer --> api: "Receipt"` and the message is still a reply

#### Scenario: Reverse a free line
- **WHEN** `reverseRelation` runs on `line l1 [(40, 40), (120, 40), (120, 100)]` with `style l1 { arrowhead arrow }`
- **THEN** the points read `[(120, 100), (120, 40), (40, 40)]` and the arrowhead is drawn at (40, 40)

#### Scenario: Nothing to reverse
- **WHEN** `reverseRelation` runs on `api -> api: "retry"`, on a `return`, or on a relation of a C4 view
- **THEN** the plan is refused with `edit.unsafe-target` and a reason that says why
