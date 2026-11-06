## MODIFIED Requirements

### Requirement: Audit every published guide in both languages

The documentation SHALL maintain equivalent user-facing English and Spanish guides across the
published inventory. Each audit SHALL record per-page implementation sources, findings and fixes
or a reason that no change is needed. Normative public language/API contracts SHALL remain
precise, including actual limitations and diagnostics.

#### Scenario: A guide has a translated title but stale instructions

- **WHEN** the English and Spanish bodies differ in supported behaviour, setup or navigation
- **THEN** both bodies are reconciled against the implementation rather than relying only on
  matching heading levels and fenced code

#### Scenario: SVG is the default rather than the only export format

- **WHEN** a reader opens the English or Spanish SVG export guide
- **THEN** its introduction includes the delivered diagram profiles, its options describe SVG as
  the default selected explicitly with `--format svg`, and it links the general export guide for
  the other supported formats and their requirements
