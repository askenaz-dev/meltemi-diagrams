## Context

Architecture Studio compiles `.arch` sources into a typed model, lays it out, renders a vector scene and exports it. Nothing is implemented yet. This change builds the bottom of that pipeline for the `flow` profile (source text, lossless CST, typed model with diagnostics, JSON) plus the reverse path the editor needs (structured operations that become minimal text edits).

Constraints from the proposal that shape this design:
- The text document is the source of truth; compiling never modifies it.
- Visual edits must map to minimal text changes that keep comments and formatting; a drag must not reprint the file.
- IDs are separate from labels and stable; anonymous relations receive an ID only when something needs to reference them, and only through an explicit edit.
- Unknown properties and missing references are errors with precise locations.
- All four profiles exist in the internal schema from the start even though only `flow` is delivered now.
- The parser approach must be chosen for incremental editing, error recovery and format preservation, not parsing convenience.
- TypeScript engine independent of editor and input format; Node 22.12+ (Node 20 is end of life and current vitest requires 22.12), ESM, pnpm, vitest. TypeScript is pinned to 6.0 because typescript-eslint does not support 7.x yet.

Stakeholders: the three engineering roles named in the proposal (language/model, editor/interaction, render/export) and the product owner who signs off the grammar before Stage 2.

## Goals / Non-Goals

**Goals:**
- A grammar document and a parser that agree, proven by a conformance corpus.
- Lossless CST: `toText(parse(text)) === text` for every input, including invalid ones.
- Diagnostics with stable codes and exact ranges; the compiler never throws on user input.
- A `flow` model good enough for Stage 2 layout work: elements, relations, placement constraints, style and animate references all resolved and validated.
- Edit operations that pass the gate set by the proposal (drag, rename and connection edits without losing comments), with regression tests.
- A runnable slice (`studio validate`) within the first tasks.

**Non-Goals:**
- Layout, rendering, export, editor UI, LSP, importers, animation runtime.
- Incremental reparsing, full formatter, undo/redo stack (the edit layer only returns inverses).
- Semantics for `sequence`, `c4` and `free` (parsed only).

## Decisions

### D1. Monorepo layout and provisional names

pnpm workspace, TypeScript 6.0 strict, ESM, vitest, Node 22.12+.

| Package | npm name (provisional) | Responsibility | Public surface |
|---|---|---|---|
| `packages/language` | `@dac/language` | lexer, parser, CST, diagnostics, positions, `TextEdit` primitives | `tokenize()`, `parse()`, `toText()`, `CstNode`/`Token` types, `Diagnostic`, `Position`/`Range`, `LineIndex`, `applyTextEdits()`, `invertTextEdits()`, `detectLineEnding()`, `detectIndent()` |
| `packages/model` | `@dac/model` | intermediate model types for the four profiles, `flow` analysis and validation, JSON interchange | `compile()`, `Compilation`, `Document`, `FlowDiagram`, `Element`, `Relation`, `PlacementStatement`, `toJson()`, `diagnosticsToJson()`, profile schema tables |
| `packages/edit` | `@dac/edit` | structured operations to `EditPlan` | `planEdit()`, `applyEdits()`, `EditOperation`, `EditPlan`, `EditRejection` |
| `packages/cli` | `@dac/cli` (bin `studio`) | `studio validate` | command line only |
| `corpus/` | none | reference `.arch` files, expected diagnostics and model JSON, edit fixtures | fixtures for all packages |
| `docs/` | none | `language/grammar-0.2.md`, `language/diagnostics.md`, `language/model-json.md`, `decisions/*.md` | none |

Alternatives: a single package (simpler now, but the proposal wants language, model and edit to be reusable by the editor and the CLI separately); scope `@archstudio` (name unverified for trademarks). Recommendation: `@dac/*` and bin `studio` as placeholders, each referenced from one constant so a rename is a single commit; recorded in `docs/decisions/0002-provisional-names.md`.

### D2. Parser approach: hand-written lexer and recursive-descent parser over a lossless CST

Criteria from the proposal: format preservation, error recovery, incremental editing, precise diagnostics, dependency footprint.

| Option | Format preservation | Error recovery | Incremental | Footprint | Notes |
|---|---|---|---|---|---|
| Hand-written recursive descent + lossless CST (recommended) | full control, trivia attached to tokens | custom, statement-level resynchronisation | whole file now; block-level reparse possible later | none | grammar is small and line oriented |
| Chevrotain | CST without trivia by default; comments recoverable by position | good, built in | no | small dependency (Apache-2.0) | fast, but still needs a trivia layer for edits |
| tree-sitter | full-fidelity CST | excellent | excellent | native/WASM toolchain, grammar in a JS DSL | strongest for incremental parsing, but adds a build toolchain and a second language for the grammar |
| Langium | AST + CST, LSP included | good | partial | large, dictates project structure | fights the "text is the source of truth, minimal edits" model |
| PEG generators (peggy, ohm) | no CST trivia | weak | no | small | not suited to recovery |

Decision: hand-written. The grammar has about a dozen node kinds and statements end at newlines, so recovery is simple (skip to the end of the line or to the matching `}`). Tokens carry leading trivia (whitespace, line breaks, comments) so the CST round-trips byte for byte. Recorded in `docs/decisions/0001-parser-approach.md`. The decision is revisited if a corpus file of 2,000 lines parses slower than 50 ms on the reference machine; tree-sitter is the fallback.

### D3. Generic statement grammar with profile vocabularies

The grammar knows only a few shapes; the meaning of keywords lives in per-profile schema tables in `@dac/model`.

Shapes:
- Header: `language "0.2"`, only as the first statement of a file.
- Top level: `model <id> { ... }`, `diagram <id>: <type> [using <ref>] { ... }`, `story <id> for <ref> { ... }`, `export <id> for <ref> { ... }`, and `theme <id> { ... }` for theme files.
- Relation statement: `<ref> (-> | -->) <ref> [: "label"] [as <id>] [{ ... }]`.
- Shorthand declarations: `<id>["Label"]` (box) and `<id>[("Label")]` (data store).
- Keyword statement: `<word> <arg>* [{ ... } (<word> <arg>* { ... })*]`, where args are identifiers, qualified references (`a.b`), strings, numbers with an optional unit (`ms`, `s`, `%`), tuples `(x, y)` and lists `[(x, y), ...]`, optionally separated by commas. The trailing chain of `word args { }` groups covers `alt "A" { } else "B" { }`.
- Terminators: line break, `;`, or the closing `}`. Line breaks inside `(...)` and `[...]` are continuation.
- Comments `//` and `/* ... */` are trivia and may appear wherever a line break may.

Why: every construct in the proposal (`direction LR`, `place api at (360, 180)`, `route create from api.east to orders.west via [(520, 180)]`, `label create at 50% offset (0, -16)`, `alt "Aprobado" { } else "Rechazado" { }`, `reveal client, api over 800ms`, `include customer, shop.web`) fits these shapes. Adding vocabulary changes a table, not the parser, and an unknown word produces an "unknown statement" or "unknown property" diagnostic with the exact range instead of a parse error.

Alternative: one grammar rule per construct (clearer EBNF, but every vocabulary change becomes a parser change). Recommendation: generic shapes; the grammar document still lists every recognised keyword per profile so the EBNF and the vocabulary are both public.

### D4. CST representation

- `Token { kind, text, start, end, leadingTrivia: Trivia[] }`; trivia after the last token hangs on the end-of-file token.
- `CstNode { kind, children: (CstNode | Token)[], start, end }`. Node kinds: `SourceFile`, `Header`, `ModelBlock`, `DiagramBlock`, `StoryBlock`, `ExportBlock`, `ThemeBlock`, `Block`, `RelationStatement`, `ShorthandDeclaration`, `KeywordStatement`, `BlockChain`, `Arg`, `Tuple`, `List`, `QualifiedRef`, `Missing` (inserted during recovery, zero width).
- `toText(node)` concatenates trivia and token text; tested as a property on every corpus file and on random mutations.
- Offsets are UTF-16 code unit indices (what editors and `String.prototype.slice` use); `Position { line, column }` is 1-based for display and computed through a `LineIndex` built once per text.

Alternative: AST plus a separate comment map (the Prettier approach). Simpler to build, but reconstructing untouched text around an edit is exactly the hard part, so the CST pays for itself.

### D5. Identifiers, references and keys

- Identifier: `[A-Za-z_][A-Za-z0-9_]*`. No hyphens, so `->` lexes unambiguously.
- Keywords are contextual: the first word of a statement is a keyword only by position, so an element may be called `label` or `theme`. A bare `<id>` line is reported as an unknown statement with the hint to use `<id>["..."]`.
- Names are unique per diagram across elements and relations (flat namespace). Groups do not create namespaces in `flow` 0.2; qualified references `a.b` are parsed and reserved for `model`/`c4` and for ports (`api.east`).
- Ports in 0.2: `north`, `south`, `east`, `west`, `auto`. Named ports are an open question.
- Anonymous relations get a deterministic key `<from>-><to>#<n>` (n counts parallel relations between the same endpoints in source order). The key is used by the model, the JSON and the edit layer and is never written to the file. An operation that needs a persistent reference first calls `materializeRelationId`, which adds `as <id>`.

### D6. Diagnostics contract

```ts
interface Diagnostic {
  code: string;            // stable, e.g. "syntax.unexpected-token", "ref.unknown-element"
  severity: "error" | "warning" | "info";
  message: string;         // one sentence that names the offending text
  range: Range;            // start/end offsets plus 1-based line and column
  hints?: string[];        // e.g. "add `as <id>` to reference this relation"
  related?: { message: string; range: Range }[];
}
```
- The compiler never throws on user input; every problem is a diagnostic.
- Errors stop production of the model for the affected diagram only; other diagrams in the file still compile.
- Codes are listed in `docs/language/diagnostics.md` and covered by corpus snapshots.

### D7. Profiles as schema tables

`@dac/model` holds one table per profile describing diagram-level properties (name to type or enum), element kinds (`node`, `decision`, `data`, `group`), relation arrows, allowed element and relation block properties, placement statements, style properties (`icon`, `fill`, `stroke`, `color`) and animate properties (`effect` in {flow, pulse, dash}, `duration` as a time, `repeat` as `forever` or an integer). Validation is driven by the tables. The `flow` table is complete; the `sequence`, `c4` and `free` tables exist as typed shapes but validation returns `profile.unsupported` so a user is never silently given an empty model.

Alternative: hard-coded validators per construct. Tables are chosen because every later stage extends the vocabulary and because the same tables can later feed editor completion and the grammar document.

### D8. Edit model

```ts
// Every operation also carries `diagram: string`, the id of the flow diagram it targets,
// because one file may hold several diagrams.
type EditOperation =
  | { kind: "setPosition"; element: string; x: number; y: number }
  | { kind: "setSize"; element: string; width: number; height: number }
  | { kind: "setRoute"; relation: string; from?: Port; to?: Port; via: Point[] }
  | { kind: "setLabelAnchor"; relation: string; at: number; offset: Point }
  | { kind: "setRelationLabel"; relation: string; label: string | null }
  | { kind: "renameElement"; element: string; newId: string }
  | { kind: "materializeRelationId"; relationKey: string; id: string }
  | { kind: "removeElement"; element: string; cascade: boolean };

interface EditPlan { operation: EditOperation; baseRevision: number; edits: TextEdit[]; inverse: TextEdit[]; notes: string[] }
interface EditRejection { code: string; reason: string; dependents?: Dependent[] }
type PlanResult = { ok: true; plan: EditPlan } | { ok: false; rejection: EditRejection };
```
- `planEdit(compilation, op, { revision })` resolves the target through the source map of the model and returns edits against exact token ranges (for `place api at (360, 180)` only the two number tokens change). Rejections are values, not exceptions.
- Coordinates that cannot be written (NaN, infinite, beyond 1e9), non-positive sizes, unknown ports and percentages outside 0 to 100 are rejected with `edit.invalid-value`.
- Safety net: a plan is refused with `edit.unsafe-result` if the edited text would parse with more errors than the original. No test triggers it; it guards against future bugs.
- When a cascading removal deletes every relation that mentions an implicit element, the first of those relations is replaced by `node <id>` so the element, and any placement or style that targets it, survives.
- Operations that reference a relation (`setRoute`, `setLabelAnchor`, `setRelationLabel`) require a named relation; given an anonymous key they are rejected with `edit.anonymous-relation` and the hint to run `materializeRelationId` first, so the editor materialises an ID in the same transaction.
- Insertion rules when the statement does not exist: append inside the existing `placement { }` block as a new line, using the indentation of the existing statements of that block (or the parent indentation plus the detected indent unit of the file, default two spaces). If no `placement` block exists, create one as the last statement of the diagram block. Inserted lines use the detected line ending of the document.
- Rename updates every identifier token that resolves to the element (declaration, relation endpoints, port references such as `api.east`, placement, style and animate targets) and nothing else: strings and comments are untouched, and the `notes` of the plan list comments that mention the old name.
- Remove without `cascade` is rejected with the list of dependents (relations, placement, style and animate statements); with `cascade` every dependent statement is deleted whole, including its line when it owns the line, or the statement plus one `;` separator when it shares a line.
- Every plan carries `baseRevision`; `applyEdits(document, plan)` rejects when the document revision differs. Applying returns the new text and revision; `inverse` restores the previous text exactly.
- If the target diagram has syntax errors, planning is rejected with `edit.unsafe-target` and an explanation, as the proposal requires.

Alternative considered: regenerate the diagram block from the model (pretty-print). Rejected by the proposal because it reorders statements and strips comments.

### D9. JSON interchange

`toJson(compilation)` emits `{ "format": "model-json", "version": "0.1", "language": "0.2", "ok": boolean, "diagrams": [...], "diagnostics": [...] }` with elements, relations (including synthetic keys for anonymous ones), placement, style and animate entries, each carrying a `range`. Object keys are emitted in a fixed order so output is diff-friendly. The schema is documented in `docs/language/model-json.md`; a breaking change bumps `version`.

### D10. Text encoding and line endings

UTF-8 without BOM is canonical; a BOM is accepted, preserved by edits and reported as an info diagnostic. LF and CRLF are both accepted; the first line break decides the style used for inserted lines; mixed files produce a warning. Tabs and spaces are both accepted for indentation; the unit is detected from the first indented line.

### D11. Testing strategy

- Lexer and parser unit tests with valid and invalid snippets; a round-trip property test over corpus files and random mutations of them.
- Corpus snapshots: for each `corpus/**/*.arch`, expected diagnostics (`*.diagnostics.json`) and expected model JSON (`*.model.json`).
- Edit fixtures: `before.arch`, operation JSON, `after.arch`; the assertion is exact text equality plus inverse round-trip.
- A benchmark script (`pnpm bench`) reporting median and p95 parse and compile times, including a drag-and-recompile cycle on a 30-node diagram; recorded in the README, not gated, until the reference machine is fixed. Vitest 5 replaced its `bench()` API, so the script times runs directly.
- The Stage 1 gate (drag, resize, route, label and rename edits on a commented checkout, then undo of every step) runs as a test; see `docs/decisions/0005-stage1-gate.md`.

## Risks / Trade-offs

- [Grammar changes after Stage 2 prototypes invalidate corpus files] -> generic statement shapes keep the parser stable; vocabulary changes are table edits; corpus files carry `language "0.2"` so a migration can target them.
- [A lossless CST is more code than an AST] -> round-trip property test from the first task; node kinds kept small.
- [Insertion rules produce ugly files in unusual layouts] -> rules are deterministic and documented; the future formatter is the clean-up path; fixtures cover tabs, CRLF and `;`.
- [Hand-written parser lacks incremental reparse] -> Stage 1 file sizes keep whole-file reparse far below the 500 ms p95 target; the benchmark documents the margin; tree-sitter remains the fallback.
- [Provisional names leak into docs and code] -> single constants for scope and bin name; the decision note lists where they appear.
- [Flat per-diagram namespace conflicts with future group namespaces] -> qualified references are already parsed; the model records the group path of each element so a later profile version can switch without a parser change.

## Migration Plan

Greenfield: nothing to migrate. Rollback is deleting the packages. Corpus files are versioned by their `language` header.

## Open Questions

Deferred to a grammar 0.3 decision after Stage 2 prototypes, listed so they are not forgotten:
- Named ports beyond the compass points (for example `api.ingress`).
- Relative constraints (`place a right of b`, alignment groups).
- Group semantics: whether groups create namespaces and how qualified references interact with rename.
- Reusable style classes (`class service { ... }`).
- Cross-type linking syntax (`free`/`sequence` objects bound to `model` entities).
- Whether `kind async` on relations is a block property or an inline keyword in `sequence`.
