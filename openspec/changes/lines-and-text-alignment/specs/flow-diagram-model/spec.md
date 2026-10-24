## MODIFIED Requirements

### Requirement: Relations
A relation SHALL be `<ref> -> <ref>` (solid), `<ref> --> <ref>` (dashed), `<ref> <-> <ref>` (solid, two-way), `<ref> <--> <ref>` (dashed, two-way), `<ref> -- <ref>` (a solid line, no heads) or `<ref> --- <ref>` (a dashed line, no heads) with an optional label and an optional id introduced by `as`. Both endpoints MUST resolve to elements of the diagram; a qualified endpoint that does not resolve SHALL produce `ref.unknown-element`, while a bare identifier is implicitly declared. A relation SHALL record `line` (`solid` or `dashed`) and `heads` (`end` for `->` and `-->`, `both` for `<->` and `<-->`, `none` for `--` and `---`); a two-way relation SHALL keep `from` and `to` as written and record `twoWay`, which is true exactly when `heads` is `both`. `heads` SHALL be the default of the heads a relation is drawn with: `none` draws no head at either end, as the theme's `arrowhead` is drawn at the end of `->`, and a written `arrowhead` or `arrowtail` style SHALL apply to a relation of any token. A token the profile does not take (`--` and `---` in sequence diagrams and C4 views; `<->` and `<-->` in C4 views) SHALL produce `flow.arrowUnavailable` on the token, listing the tokens the profile takes. Parallel relations between the same endpoints and self-relations SHALL be allowed. Anonymous relations SHALL receive the deterministic key `<from>-><to>#<n>` where `n` counts parallel relations in source order starting at 1; the key is never written to the source. A relation id that duplicates any element or relation id SHALL produce `ref.duplicate-id`.

#### Scenario: Named and anonymous relations
- **WHEN** a diagram contains `api -> orders: "Create" as create` and two unnamed `orders -> db` relations
- **THEN** the relations are keyed `create`, `orders->db#1` and `orders->db#2`

#### Scenario: Unknown qualified endpoint
- **WHEN** a flow diagram contains `shop.api -> db`
- **THEN** `ref.unknown-element` is reported on `shop.api` with the hint that qualified references are not available in flow diagrams

#### Scenario: Relation id clashes with an element
- **WHEN** a diagram declares `api["API"]` and later `client -> api: "HTTPS" as api`
- **THEN** `ref.duplicate-id` is reported on the second `api`

#### Scenario: Two-way relation
- **WHEN** a diagram contains `api <--> cache as sync`
- **THEN** relation `sync` goes from `api` to `cache`, is dashed and two-way, and its `heads` is `both`

#### Scenario: Headless relations
- **WHEN** a flow diagram contains `api -- cache as link` and a free diagram contains `a --- b`
- **THEN** `link` is solid with `heads` `none` and `twoWay` false, `a->b#1` is dashed with `heads` `none`, no diagnostic is reported, and the scene draws no head at either end of either

#### Scenario: Heads by style on a line
- **WHEN** a flow diagram contains `a -- b as l` and `style l { arrowhead circle }`
- **THEN** `l` has `heads` `none` and the scene draws a circle at its end and nothing at its start

#### Scenario: Line tokens in a sequence diagram
- **WHEN** a sequence diagram contains `customer -- api: "Hello"`
- **THEN** `flow.arrowUnavailable` is reported on `--` with the message that it is not available here and the hint to write `->`, `-->`, `<->` or `<-->`

#### Scenario: Line tokens in a C4 view
- **WHEN** a C4 view contains `shop.web --- shop.api`
- **THEN** `flow.arrowUnavailable` is reported on `---` naming `->` and `-->`, as it is for `<->`
