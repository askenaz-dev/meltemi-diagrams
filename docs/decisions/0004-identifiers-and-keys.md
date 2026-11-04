# 0004. Identifiers, references and relation keys

Status: accepted (language 0.2)

## Context

IDs are separate from labels and must stay stable so manual adjustments survive edits. Relation
names are optional in small examples, but the editor must be able to point at any relation, and
compiling must never write to the file.

## Decision

- Identifiers match `[A-Za-z_][A-Za-z0-9_]*`. Hyphens are excluded so `a->b` lexes without spaces.
- Inside a diagram, elements and relations share one flat namespace; a duplicate is
  `ref.duplicate-id`. Groups do not create namespaces in `flow` 0.2.
- Qualified references (`shop.api`) are parsed everywhere but only resolve in `model` and `c4`
  (not yet compiled). In `flow`, a dotted name is valid only as a port: `api.east`.
- Ports in 0.2 are `north`, `south`, `east`, `west` and `auto`.
- An anonymous relation gets the key `<from>-><to>#<n>`, where `n` is its 1-based position among
  all relations with the same source and target, named or not, in source order. Counting named
  relations too keeps keys stable when another relation between the same elements is named.
- Keys live in the model, the JSON and the edit layer, never in the file. Edits that need a
  persistent reference first run `materializeRelationId`, which writes `as <id>`.

## Alternatives considered

- Hyphenated identifiers (`order-service`): conflicts with `->` and `-->` without mandatory spaces.
- Writing generated IDs on compile: violates "compiling never modifies a file".
- Counting only anonymous relations for keys: naming the first relation would renumber the others.

## Consequences

- Renaming an element changes the keys of its anonymous relations; the editor refreshes keys after
  each edit.
- Named ports, group namespaces and cross-type linking remain open questions for grammar 0.3.
