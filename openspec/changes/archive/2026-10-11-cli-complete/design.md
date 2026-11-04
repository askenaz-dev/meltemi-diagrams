## Context

- The CLI validates, formats, imports (one file), exports (one file), builds catalogs and manages
  assets; `ProjectSessions` gives workspaces over any `ProjectHost`.
- The catalog (change 18) is one offline page built from a project.
- Explicit ids are the identity of elements, relations, entities, stories and scenes.

## Goals / Non-Goals

**Goals:** start a project in one command; see changes live; review changes by meaning in CI with
pictures; run every command on a whole project.

**Non-Goals:** hosting previews for other machines; publishing to a specific site; posting review
comments to a code host (the workflow keeps the review as an artifact and a job summary).

## Decisions

### D1. Templates are files shipped with the CLI

`templates/<name>/` holds the sheets as written; `project.json` is generated with the project's
name, the language version, the CLI version range and, for `purchase`, catalog settings. `init`
checks every target first and writes nothing when one exists. Each template must validate without
diagnostics and build its catalog (tested).

### D2. Preview serves the catalog

`preview` builds the catalog with a live-reload stream (`/events`, server-sent events), whose page
policy adds `connect-src 'self'`. It listens on 127.0.0.1 only and answers only requests whose
`Host` is a loopback name, so other machines and DNS rebinding cannot read the project. A
recursive file watch collects changes for 150 ms, invalidates the changed files (or reopens the
project when `project.json` or assets change), builds again and sends `reload`; pages keep their
route (the hash) and scroll.

### D3. Semantic differences

`diffDocuments(before, after)` pairs blocks by id; what is left is paired as a rename when it is
similar enough: elements of the same kind with the same written label, place, description or
relations (by the labels of the other ends); relations with the same ends after element renames
and label; entities of the same kind with the same label, parent or technology; diagrams of the
same type sharing half their element ids or their title; scenes showing the same view with the same
actions. Anonymous relations are keyed by their ends after renames and their order. Matched items
report what changed: label, kind, description, technology, URL, link, classes, group, place, size,
route, label position, style, effects; diagram properties, scenarios, C4 lists, constraints; story
timing and actions. Stories compare targets through the renames of the diagrams they show.
Comments and formatting never count.

### D4. Review

`reviewProjects(before, after)` pairs files by path relative to the compared folder; an added file
holding the same blocks as a removed one is a rename. The command takes the version before from
Git (`--base`, HEAD by default) through a host that lists the revision's tree and reads its blobs
on demand, or from another path (`--before`). `--out` writes `index.html` and, for every changed
diagram, `<file>/<diagram>.before.svg` and `.after.svg` with outlines in the colours of the change
(added green, removed red, renamed blue, changed amber). The page names versions, never local
paths. `--exit-code` exits 1 when something changed.

### D5. CI templates

`init --ci github` writes `.github/workflows/meltemi-diagrams.yml` at the top of the Git working
tree (or the project), with the project's path from there: validate `--strict`; on pull requests,
`review --base origin/$GITHUB_BASE_REF --out review` into the job summary (the branch name comes
from the environment, never written into the script); `build catalog`; artifacts. `--ci gitlab`
writes `.gitlab-ci.yml`, or `.gitlab/meltemi-diagrams.yml` with the `include` to add when a pipeline
exists. Both pin `@meltemi/diagrams-cli` to the CLI's version.

### D6. Folders everywhere

`export <folder>` plans every source below the folder with the same options in one browser
session; files without diagrams (models, themes, stories) are passed over; `--out` keeps the
folders; `--diagram`, `--story`, `--scenario` and `--stdout` stay one-file options. `import <folder>`
imports every Mermaid, PlantUML and Markdown file below it (PlantUML `.iuml` includes through the
files that include them; Markdown files without diagrams are passed over) and sums up.

## Risks / Trade-offs

- [Rename heuristics] → a rename needs real evidence (threshold 3); otherwise a removal and an
  addition are reported, which is never wrong, only less precise.
- [Watchers] → recursive watching is native on Windows and macOS and supported by Node 22 on Linux;
  without it the server still serves.
