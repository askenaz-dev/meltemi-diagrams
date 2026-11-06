# Language maintenance

[Español](es/language-maintenance.md)

Corpus and policy maintenance procedures extracted from public references. The final section
preserves historical prototype questions; this audit adopts no grammar 0.3 or new normative decision.

## How the language changes

Every change to the language is an OpenSpec change (`openspec/changes/`) with:

1. a decision note in `docs/decisions/` that names the problem, the alternatives and what existing
   files see;
2. the grammar update in [grammar-0.2.md](../language/grammar-0.2.md) (or the next version's grammar) and the
   affected profile references;
3. new conformance cases: valid files with their model JSON and invalid files with their
   diagnostics in `corpus/`, and a project case when the change concerns projects;
4. the diagnostics in [diagnostics.md](../language/diagnostics.md), with the quick fixes;
5. the importers' coverage tables when the change maps a Mermaid or PlantUML construct.

A change that needs a new language version also states the migration and its tests.

## Adding cases

Every language change adds its cases ([policy](../language/policy.md)): a valid file and its model JSON, an
invalid file named after the diagnostic it shows, or a project folder with `expected.json`. The
snapshots are written by the tests (`pnpm test -u`) and reviewed like code ([corpus](../../corpus/README.md)).

## Not yet decided

Deferred to a grammar 0.3 decision after the Stage 2 prototypes:

- Group semantics: whether groups create namespaces and how qualified references interact with
  rename.
- Whether chained clauses may start on the line after the closing `}`.
