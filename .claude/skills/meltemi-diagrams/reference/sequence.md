# Sequence diagrams

Use `diagram <id>: sequence { }` for interactions over time: who calls whom, in what order, with
which alternatives. Participants stand left to right in source order and events go top to bottom
in source order. Never write `place`, `size` or `route` here; the layout is computed.

## Participants

`participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections` and `queue`,
each `<kind> <id> "Label"`. `id["Label"]` is a participant and `id[("Label")]` a database. A
message end that is never declared becomes a participant labelled with its id, placed at its first
mention. `group backend "Backend" { participant api "API" }` draws a box around participants.

## Messages and events

```text
customer -> api: "Pay" as pay          // call: solid, filled arrowhead
api --> customer: "Receipt"            // reply: dashed, open arrowhead
api -> events: "Paid" as paid { kind async }   // async: solid, open arrowhead
api <-> cache: "Sync"                 // two-way: a head at both ends
api -> api: "Validate"                 // self-call
activate api                           // bar from the message before; deactivate ends it
create order                           // the head appears at this row
destroy order                          // the lifeline ends with a cross
note over api, bank "Timeout 3 s"      // also: note left of api "…", note right of api "…"
divider "Fulfilment"
delay "Two days later"
autonumber                             // numbers every message from 1 (autonumber 10: from 10)
```

## Fragments

```text
alt result "Approved" {
  bank --> api: "OK"
} else "Declined" {
  bank --> api: "Declined"
}
opt coupon "Coupon applied" { … }
loop polling "Until shipped" { … }
par { … } and "Notify" { … }
break "Fraud" { … }
critical "Shipment" { … } option "Carrier down" { … }
region "Audit" { … }
```

Write `else`, `and` and `option` on the line of the closing `}`. Give a fragment an id (`alt
result …`) when a scenario or `space` must name it. Fragments hold events only: declare every
participant at the diagram level first.

## Scenarios

```text
scenario approved "Payment approved" {
  choose result "Approved"   // or: choose result 1
  repeat polling 3           // 1 to 100 passes
  skip coupon                // opt or break not taken; take coupon keeps it (the default)
}
```

`pnpm mdg export sheet.meltemi --scenario approved` writes `sheet.approved.svg` with only that
path; without `--scenario` every branch is drawn.

## Spacing and styles

```text
placement {
  space authorize 28    // more room above a named message, note or fragment
  gap bank 40           // more room left of a participant
  label pay at 50% offset (0, -4)
}
style result { stroke accent }   // notes and fragments with ids take styles
rule fragment { stroke muted }
```

## Diagnostics

| Code                  | Fix                                                                          |
| --------------------- | ---------------------------------------------------------------------------- |
| `sequence.activation` | `deactivate p` without an open `activate p`: add the `activate` or remove it |
| `sequence.lifecycle`  | an event after `destroy`, `create` after the participant appeared, or twice  |
| `sequence.scenario`   | the scenario names an unknown fragment, branch or loop count                 |
| `ref.unknown-element` | declare the participant (`participant x "X"`); groups are not participants   |
| `prop.unknown`        | a flow or free kind (`node`, `box`) or a declaration inside a fragment       |

Branches of `alt`, `par` and `critical` are checked separately, each from the state before the
fragment; the first branch's state continues after it. Activations open at the end are fine.

## Converting

Import Mermaid and PlantUML sequences with `pnpm mdg import`, which maps them one to one: `participant`/`actor` (and the
PlantUML kinds), `->>` and `->` to `->`, `-->>` and `-->` to `-->`, `-)` to `-> … { kind async }`,
`+`/`-` suffixes to `activate`/`deactivate`, `Note over A,B: text` to `note over a, b "text"`,
`rect`/`group` to `region`, `box` to `group`, `== x ==` to `divider "x"`, `...` to `delay`.
