## Why

The proposal's command line covers starting a project, previewing, validating, formatting,
importing, exporting and generating a catalog (its illustrative interface validates and previews a folder, exports a
diagram to SVG and a story to MP4, and builds a catalog). Continuous integration validates
references, resources and profiles before producing deliverables, and a review can include the
image before, the image after and the semantic differences of the model, where explicit ids tell a
rename from a deletion followed by a creation. The reference example is a purchase: customer, API
entry, orders, payments, events and data, with an architecture view, a payment sequence, an
executive free composition and an animated walkthrough. Roadmap change 19 asks for `init` with
templates, `preview` with live reload, project-wide commands, review output and a CI workflow
template.

## What Changes

- **init.** `meltemi-diagrams init [folder] --template flow|c4|sequence|free|purchase` writes
  `project.json` and the template's sheets, never replacing a file; `--list`; `--name`.
  `purchase` is the reference example: model, context and container views, payment sequence with
  scenarios, executive slide, animated story and export profiles.
- **CI.** `init --ci github|gitlab` writes a workflow that validates strictly, reviews pull and
  merge requests against their base, builds the catalog and keeps both as artifacts, pinned to the
  CLI version; in an existing project it adds only the workflow.
- **preview.** `meltemi-diagrams preview [path]` serves the project's catalog on the loopback
  interface, rebuilds it when sources, `project.json` or assets change, and reloads open pages
  where they were; `--port`, `--open`; a file opens on its first diagram.
- **review.** `meltemi-diagrams review [path]` compares the working tree with a Git revision
  (`--base`, HEAD by default) or another folder or file (`--before`): files added, removed,
  renamed or changed, and the semantic changes of each (diagrams, elements, relations, entities,
  stories, scenes, themes, profiles), with renames told from removals and additions; `--json`,
  `--exit-code`, and `--out` for a page with before and after pictures of every changed diagram,
  its changes marked.
- **Project-wide commands.** `export` and `import` take a folder: every sheet of the project below
  it (with `--profiles`, every profile), every Mermaid, PlantUML and Markdown file below it.
  `validate` and `format` already take folders; `build catalog` came with change 18.
- **Model.** `diffDocuments` and `describeChange` in the model package.
- **Layout fix found by the templates.** A sequence `queue` participant is widened by its cap, and
  its label centred on its body.
- **Docs.** `docs/cli.md` (every command, option and exit code, and CI), decision 0028, README,
  skill.

## Capabilities

### New Capabilities

- `project-templates`: `init`, its templates and the reference example.
- `live-preview`: the preview server.
- `change-review`: semantic differences and the review command.
- `ci-workflows`: the CI templates.

### Modified Capabilities

- `cli-export`: folders.
- `cli-import`: folders.

## Impact

- New CLI modules (`init-command`, `preview`, `review-command`, `git`) and `templates/` shipped
  with the package; `@meltemi/diagrams-editor/node` gains `reviewProjects`; the catalog page can
  carry a live-reload stream.
- `review --base` runs the installed `git`; nothing new is downloaded.
