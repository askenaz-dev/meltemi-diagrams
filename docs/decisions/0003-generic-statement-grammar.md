# 0003. Generic statement grammar with profile vocabularies

Status: accepted (language 0.2). The relation tokens gain the lines without heads `--` and
`---`, lexed by the longest match, and free diagrams the keyword statement `line`, by
[decision 0058](0058-lines-sketch-and-text-alignment.md).

## Context

The proposal shows many constructs across four profiles, stories and exports: `direction LR`,
`place api at (360, 180)`, `route create from api.east to orders.west via [(520, 180)]`,
`alt "A" { } else "B" { }`, `reveal client, api over 800ms`, `include customer, shop.web`. The
vocabulary will keep growing in every stage. Changing the parser for each new word would make the
grammar unstable exactly when the proposal wants to stabilise it.

## Decision

The parser knows a handful of shapes. The meaning of words lives in per-profile schema tables in
`@meltemi/diagrams-model`.

- Relation statement: `<ref> (-> | -->) <ref> [: "label"] [as <id>] [{ ... }]`.
- Shorthand declaration: `<id>["Label"]` or `<id>[("Label")]`.
- Keyword statement: a word, arguments (references, strings, numbers with units, tuples, lists,
  optional commas), an optional block, and optionally more `word args { }` clauses on the same line.
- Top-level blocks: `language`, `model`, `diagram`, `story`, `export`, `theme`.

Keywords are contextual: a word is a keyword only at the start of a statement, so an element may be
called `label` or `theme`.

## Alternatives considered

One grammar rule per construct gives a more explicit EBNF, but every vocabulary change becomes a
parser change and an unknown word becomes a parse error instead of a precise "unknown property"
diagnostic.

## Consequences

- New vocabulary is a table change in `@meltemi/diagrams-model` plus documentation.
- Unknown words produce `prop.unknown` with the exact range and a list of valid words.
- The grammar document lists the recognised vocabulary per profile so both the shapes and the words
  are public.
- Chained clauses must stay on the line of the closing `}`: `} else "B" {`.
