# 0028. The complete command line: templates, live preview, semantic review and CI

Status: accepted (cli-complete change, 11 October 2026)

## Context

The proposal's command line starts a project, previews, validates, formats, imports, exports and
generates a catalog; continuous integration validates before producing deliverables; a review shows
the image before, the image after and the semantic differences of the model, and explicit ids tell
a rename from a deletion followed by a creation. The first reference example is a purchase:
customer, API entry, orders, payments, events and data, with an architecture view, a payment
sequence, an executive free composition and an animated walkthrough.

## Decision

- **Templates are files.** `init` copies `templates/<name>/` of the CLI package and generates
  `project.json`; it checks every target first and never replaces a file. `purchase` is the
  reference example. Every template is tested to validate without diagnostics and to build its
  catalog.
- **Preview is the catalog, served live.** The server builds the catalog with a server-sent-events
  stream, rebuilds after file changes (150 ms debounce) and tells pages to reload; pages keep route
  and scroll. It listens on 127.0.0.1 and answers only loopback `Host` headers, so neither other
  machines nor DNS rebinding reach the project.
- **Semantic differences by id.** `diffDocuments` pairs by id, then pairs what is left as renames
  when the evidence is strong enough (same kind, and label, place, description or relations by the
  labels of the other ends; threshold 3). Relations are keyed by their ends after renames; stories
  compare targets through the renames of their diagrams. Formatting and comments never count. When
  the evidence is weak, a removal and an addition are reported, which is never wrong.
- **Review against Git or a path.** A Git host lists the revision's tree and reads its blobs on
  demand (`git ls-tree`, `git show`), so the earlier version is compiled, laid out and drawn
  exactly like the current one, with its own assets. `--out` writes a page and SVG pictures with
  coloured outlines; it names versions, not paths.
- **CI templates.** GitHub Actions and GitLab CI workflows pin the CLI version, validate
  `--strict`, review requests against their base into the job summary, build the catalog and keep
  artifacts. Branch names reach scripts only through environment variables.
- **Folders everywhere.** `export` and `import` join `validate`, `format` and `build catalog` in
  taking a folder; one-file options stay one-file.

## Alternatives considered

- **Text diffs.** Show formatting and comments as changes and cannot tell a rename from a removal
  and an addition.
- **Pixel diffs of the pictures.** Useful for visual regression (change 23), but say nothing of
  meaning; the review marks what changed in the model on the pictures instead.
- **A preview without the catalog.** A page per file would duplicate the catalog's navigation; the
  catalog already draws every diagram and story.
- **Posting review comments to the code host.** Needs tokens and a service-specific API; the job
  summary and artifacts work without either.

## Consequences

- `review --base` needs `git` on the path; `--before` works anywhere.
- The reference example ships with the CLI; the release (change 24) builds its gallery from it.
