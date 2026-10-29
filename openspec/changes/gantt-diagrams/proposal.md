## Why

The owner asked on 2026-10-29: "Falta agregar diagramas gantt y soporte a importar diagramas Gantt
desde mermaid". The roadmap he keeps in Mermaid (a `gantt` with three sections, ten tasks, `after`
chains, durations in days and `excludes weekends`) cannot reach Meltemi today, and nothing in the
language can say "this task starts after that one and lasts ten working days".

- **The importer refuses it.** `gantt` is in `MERMAID_UNSUPPORTED` (`packages/import/src/detect.ts:41`),
  so `importMermaid` stops with `import.unsupported-diagram` (`packages/import/src/mermaid/index.ts:88-106`),
  and the generated coverage table says so (`docs/import/mermaid.md:32`, from
  `packages/import/src/coverage.ts:269-271`). The output types are closed: `ImportedType` is
  `flow | free | sequence | c4` (`packages/import/src/report.ts:13`) and the writer's `Sheet` has
  no fourth shape (`packages/import/src/writer.ts:217`).
- **There are four diagram types.** `DIAGRAM_TYPES` is `flow, sequence, c4, free`
  (`packages/model/src/schema.ts:203`), `compile` routes them at `packages/model/src/compile.ts:109-147`
  and anything else is `profile.unknown`. No profile has a time axis: free compositions place by
  coordinates, flow and C4 hand positions to ELK, and sequence diagrams order events top to bottom
  without dates.
- **The language cannot read a date.** `2026-06-01` lexes as three numbers, `2026`, `-06` and `-01`
  (a `-` before a digit starts a number, `packages/language/src/lexer.ts:176-201`, `279-297`), and
  arguments are identifiers, strings, numbers, tuples and lists only
  (`packages/language/src/parser.ts:814-841`). Durations already lex: `5d` is the number 5 with the
  unit `d` (`lexer.ts:288-296`), which no profile accepts yet.

The base is ready for a fifth type. Sequence diagrams show how a type with its own deterministic
layout plugs in: one analyzer beside `analyzeFlowDiagram` (`compile.ts:119-126`), one early return
in `layoutDrawing` (`packages/layout/src/layout.ts:1202-1204`, `layoutSequence` at
`packages/layout/src/sequence.ts:99`), elements and relations in the shared `FlowDiagram`
(`packages/model/src/types.ts:564-619`, decision 0019). Render, effects, stories, the player and
every export work through scene-group conventions (`role`, `id`, `bounds`, `track`, `href`;
`packages/layout/src/scene.ts:4-5`, `129-163`) with no per-type code, so a chart drawn as element
and relation groups is exported, animated and explained like the others. The canvas already moves
declarations to a position (`moveElement { index }`, decision 0064), plans drags per profile
(`packages/editor/src/session.ts:1782-1794`), and its palette, keymap and New diagram menu are
tables keyed by profile (`packages/canvas/src/app.ts:483-522`;
`packages/editor/src/canvas/keyboard.ts:138-224`). The Mermaid front-ends share a statement
splitter, an id map, a reporter and generated coverage tables (`packages/import/src/mermaid/common.ts:40-90`,
`ids.ts`, `report.ts:96-250`, `coverage.ts`). Post-1.0 change, outside the roadmap
(`docs/roadmap-1.0.md`); it builds on the generic statement grammar (decision 0003), the sequence
profile (0019), import (0021), effects and stories (0022, 0023) and the whiteboard's
`moveElement { index }` and `draw` (0064), and records decision 0066 (0065 is reserved by the
change `sequence-wrap-tags-and-activation`, proposed at the same time).

## What Changes

- **A fifth diagram type, `gantt`.** `diagram <id>: gantt { … }` compiles on its own profile:
  `section <id> ["Label"] { … }` groups rows; `task <id> ["Label"] [from <date>] [after <id>[, <id>…]]
  [for <duration> | to <date> | until <id>[, <id>…]] [done | active] [critical] [{ … }]` is a bar;
  `milestone <id> ["Label"] [at <date>] [after …] [done | active] [critical]` is a diamond;
  `marker <id> ["Label"] at <date>` is a vertical line across the chart. A task without a start
  follows the previous one, as in Mermaid; `from` and `after` together mean "the later of the two";
  `to` is the last day, inclusive; a task without an end lasts one day. Dates are written
  `2026-06-01` or `2026-06-01T09:30[:15]` (civil time, no zone); durations are `s`, `min`, `h`, `d`
  and `w`. Chart statements: `exclude weekends | <weekday> | <date>`, `include <date>`,
  `weekStart`, `axisFormat "%d %b"` (a strftime subset), `ticks 1w`, `axis top|bottom|both`,
  `labels bar|column`, `display normal|compact`, `dependencies shown|hidden`, `dayWidth <n>` and
  `today [<date>]`. With excluded days, `d` and `w` count working time. Tasks take `description`,
  `class`, `link` and `url` in their block, and `style`, `class`, `rule task|milestone|marker|section`,
  `animate` and stories work as on other profiles. Diagnostics: `gantt.cycle`, `gantt.unscheduled`,
  `gantt.schedule`, `gantt.relation` (errors), `gantt.excluded-day` (warning), and the existing
  `prop.*` and `ref.*` codes for malformed dates, units, clauses and unknown tasks. Model JSON
  carries each task's written schedule and its resolved start and end.
- **Date literals in the language.** The lexer reads `\d{4}-\d{2}-\d{2}` with an optional
  `T\d{2}:\d{2}[:\d{2}]` as one `Date` token and the parser takes it as an argument
  (`DateLiteral`); the formatter prints it as written. `gantt`, `task`, `milestone`, `marker` and
  `section` become reserved words of declared types.
- **A layout without an engine.** A time axis whose span is the tasks' span rounded to whole ticks,
  ticks chosen from a ladder (seconds to years) so their labels never collide, labels in the
  content language (`jun`, `Jun`); a section column, alternating section bands, one row per task
  (`display compact` packs rows), bars coloured by status from the theme's tokens (`accent`,
  `info`, `muted`, `danger`), labels inside the bar or beside it, diamonds for milestones, dashed
  marker lines, a `danger` today line, shaded excluded days, and dependency arrows from each
  predecessor's end to its successor's start in the theme's connector style. Sketch themes draw bars,
  diamonds and arrows by hand and keep the grid crisp. SVG, PNG, PDF, the HTML player (task cards
  with dates, duration, status and dependencies), animated SVG and video work unchanged.
- **Effects and stories that tell a plan.** `draw` grows task bars from their start to their end;
  `trace <task>` draws the chain of dependencies that drives a task, earliest first; `reveal` of a
  section shows its band and tasks; `flow` and `trace` effects on a task run along its incoming
  arrows; `pulse` and `dash` take tasks, milestones, markers and sections.
- **A canvas that schedules.** Dragging a bar writes `from` (keeping `after`), dragging its ends
  writes `for` or `to`, snapping to weeks, days, hours or quarter hours by zoom; successors glide to
  their new dates in the live preview and a tooltip shows the dates and the working days. Dragging a
  row up or down moves the declaration (into another section too); dragging a bar's connect handle
  onto another writes `after`, refused with a red flash when it would loop; deleting an arrow
  removes the id from `after` and pins the start. T, M, V and G add a task, a milestone, a marker
  and a section (with T armed, a drag on the timeline draws a task); Left and Right move the start
  a day (Shift: a week), `]` and `[` lengthen and shorten, Alt+Up and Alt+Down reorder. The
  inspector gains a Schedule group (start, after, end, status, critical) with date, duration and
  task-list fields, and chart fields (axis, ticks, week start, labels, display, day width, excluded
  days, today). Read-only canvases select and show cards only. Removing a task keeps its
  successors' dates by writing their `from`.
- **Mermaid gantt import, complete.** A `gantt` front-end reads `title`, `accTitle`, `accDescr`,
  `dateFormat` (the dayjs tokens), `axisFormat`, `tickInterval`, `weekday`, `excludes`,
  `includes`, `weekend`, `todayMarker`, `inclusiveEndDates`, `topAxis`, front matter
  `config.gantt.displayMode` and `topAxis`, `section`, every task metadata form (ids, `after` with
  several ids, `until`, dates, durations `ms` to `y` with decimals, the tags `done`, `active`,
  `crit`, `milestone` and `vert`), `click … href` (to `url`) and `%%` comments. It replays
  Mermaid's scheduling to write what Mermaid draws: exclusive end dates become inclusive `to`,
  weeks under exclusions become days, months and years become days, a milestone's
  `start + duration / 2` becomes its date. `click … call` is dropped (`gantt.click`), styled
  `todayMarker` and `ms` precision are approximated; every finding is in the coverage table. The
  owner's roadmap imports with no finding: ten tasks in three sections, dated exactly as Mermaid
  dates them (tec0 1–5 June to sdlc2 10–28 August 2026), six dependency arrows, weekends shaded,
  weekly ticks `01 jun` … `31 ago` in Spanish projects. Re-import keeps the chart's view settings
  and styles.
- **Everywhere a type is listed.** New diagram menus, the explorer's kinds and the empty-file
  buttons offer Gantt chart; a `roadmap` template (eight templates, cards and thumbnails); a gallery
  sheet `gallery/gantt/launch-plan.meltemi`; corpus, acceptance and import-corpus sheets with
  snapshots; `review` reports schedule changes ("tec1 starts 2026-06-08 → 2026-06-15");
  `mdg export --today <date>` pins the today line; completion, hover, quick fixes, outline and the
  VS Code grammar; `docs/language/gantt.md` and its Spanish copy, the grammar, diagnostics, layout,
  styles, motion, stories, model JSON, editor, CLI and import pages in both languages; the skill's
  `reference/gantt.md`; the i18n glossary; the changelog's open section; decision 0066.

## Non-goals

- Importing PlantUML `@startgantt`, Microsoft Project, spreadsheets or issue trackers: the proposal's
  1.0 exclusion of universal import. Mermaid is the source the owner named.
- Exporting a chart as editable PPTX shapes: the proposal's 1.0 exclusions (editable PPTX shapes,
  PPTX export).
- Message wrapping, tags and activation bars of sequence diagrams: the change
  `sequence-wrap-tags-and-activation`, which touches the same toolbar, keymap and model JSON and
  reserves decision 0065. This change is independent of it and names its keys per profile.
- The sea of the playground's empty canvas: the change `playground-sea`, which owns the empty-canvas
  state where this change adds a Gantt chart button.
- The release that ships it (version, tags, registries): the delivery change.

## Capabilities

### New Capabilities

- `gantt-diagram-model`: the `gantt` profile: sections, tasks, milestones, markers, chart
  statements, dates and durations, the calendar, the schedule rules, the diagnostics, styles,
  links, effects and stories on gantt targets.
- `gantt-layout`: the time scale and ticks, rows and sections, bars, labels, milestones, markers,
  the today line, excluded days, dependency arrows, themes and sketch, the scene groups and the
  layout result the canvas reads.
- `gantt-editing`: the edit operations (`setTaskSchedule`, `setTaskStatus`, `createTask`,
  `setCalendar`), dependencies, rows moved between sections, removal that keeps successors' dates,
  renames through `after` and `until`, and `createDiagram` of a gantt.
- `gantt-editor-tools`: the canvas gestures, palette, keys, live preview, inspector fields,
  inline editing, read-only behaviour and the language services of gantt charts.

### Modified Capabilities

- `language-syntax`: MODIFIED "Lexical structure" (the `Date` token) and "Statement forms and
  terminators" (dates as arguments).
- `flow-diagram-model`: MODIFIED "Profile gating" (five types; `profile.unknown` lists `gantt`).
- `model-json-interchange`: ADDED "Gantt charts in JSON".
- `motion-effects`: MODIFIED "Effect targets" (tasks, milestones, markers and sections).
- `story-language`: MODIFIED "Scenes and actions" (`draw` on tasks, `trace` on a task);
  `story-timeline`: ADDED "Gantt frames".
- `viewer-interaction`: ADDED "Gantt cards".
- `change-review`: ADDED "Gantt schedules in differences".
- `cli-export`: ADDED "The day of the today line".
- `mermaid-import`: MODIFIED "Mermaid diagram types" (`gantt` imported); ADDED "Mermaid gantt
  charts", "Mermaid gantt schedules" and "Mermaid gantt calendars and axes".
- `import-merge`: MODIFIED "Re-import keeps manual adjustments" (the chart's view statements).
- `source-editing`: MODIFIED "Creating diagrams" (`gantt`).
- `diagram-canvas`: MODIFIED "Empty file and new diagrams" (Gantt chart).
- `project-explorer`: MODIFIED "Actions on the tree" (the kind gantt) and "New project from cards"
  (eight cards).
- `project-templates`: MODIFIED "Templates" (`roadmap`, eight templates).
- `gallery-and-examples`: RENAMED "Gallery of the four profiles" to "Gallery of the profiles" and
  MODIFIED it (a gantt sheet with a pinned today; the profiles are five).
- `acceptance-suite`: MODIFIED "Acceptance corpus" (gantt sheets).

## Impact

- `packages/language`: `src/tokens.ts` (`Date`), `src/lexer.ts` (`number()` reading a date,
  `:279-297`), `src/cst.ts` and `src/parser.ts` (`DateLiteral` in `parseArg`, `:814-841`),
  `src/format.ts` (dates verbatim); tests `lexer.test.ts`, `parser.test.ts`, `format.test.ts`.
- `packages/model`: `src/schema.ts` (`DIAGRAM_TYPES`, `GANTT_PROFILE`, `GANTT_ELEMENT_KINDS`,
  `DURATION_UNITS`, `TICK_UNITS`, `WEEKDAYS`, `PROFILES`, `profileOf`, `RULE_KINDS`),
  `src/types.ts` (`DiagramType`, `Element.task`, `FlowDiagram.gantt`, `CivilTime`),
  `src/calendar.ts` (new: civil dates, weekdays, working time), `src/gantt.ts` (new: the analyzer
  and the scheduler), `src/compile.ts` (the route), `src/diagram-types.ts` (reserved words),
  `src/json.ts`, `src/diff.ts` (schedules), `src/story.ts` (`draw` and `trace` on tasks),
  `src/flow.ts` (`animationTargetFits`), `src/messages/en.ts` and `es.ts`; tests `gantt.test.ts`,
  `calendar.test.ts`, `json.test.ts`, `story.test.ts`, `diff.test.ts`, `corpus.test.ts`.
- `packages/layout`: `src/gantt.ts` (new: `layoutGantt`), `src/layout.ts` (the route beside
  sequence, `LayoutResult.gantt`), `src/scene.ts` (the `axis` role), `src/messages/*` (month and
  weekday names, "Today"/"Hoy", `layout.ticks-crowded`); tests `gantt.test.ts`, `corpus.test.ts`.
- `packages/render`: `src/sketch.ts` (the `axis` role kept crisp); `test/svg.test.ts`,
  `test/corpus.test.ts`.
- `packages/motion`: `src/plan.ts` (gantt task targets expanded to their incoming arrows),
  `src/story.ts` (`draw` of bars, `trace` of chains); tests.
- `packages/player`: `src/document.ts` (`detailsOf` with the schedule), `src/runtime.ts` (the
  card's fields); tests.
- `packages/edit`: `src/types.ts`, `src/gantt.ts` (new), `src/create.ts`, `src/plan.ts`
  (`removeElement` keeping successors), `src/diagrams.ts` (`CREATABLE_DIAGRAMS`, `:11`); tests
  `gantt.test.ts`, `operations.test.ts`.
- `packages/editor`: `src/canvas/protocol.ts` (`CanvasProfile`, `ElementInfo.task`,
  `CanvasRender.timeline`, the `schedule` action, field types `date`, `duration`, `tasks`,
  `CREATABLE`), `src/gantt.ts` (new: plans and inspector fields), `src/session.ts`, `src/inspector.ts`,
  `src/canvas/keyboard.ts`, `src/text-places.ts`, `src/services/*` (completion, hover, actions,
  docs, navigation), `src/syntax.ts`, `src/messages/*`; tests.
- `packages/canvas`: `src/app.ts` (palette, `CREATABLE`, the `bar`, `barEnd`, `row` and
  `taskDraw` drags, the connect handle, the date tooltip, the insertion bar between rows),
  `src/inspector.ts` (date, duration and task-list fields), `src/glyphs.ts`, `canvas.css`,
  `src/view-only.ts`, `src/messages/en.ts` and `es.ts`; tests `view-only.test.ts`,
  `messages.test.ts`.
- `packages/import`: `src/detect.ts` (`gantt` supported), `src/mermaid/gantt.ts` (new),
  `src/mermaid/index.ts` (the route), `src/mermaid/dates.ts` (new: dayjs formats and Mermaid's
  scheduling), `src/writer.ts` (`GanttSheet`), `src/report.ts` (`ImportedType`), `src/merge.ts`
  (`REPLACING`, `:34`), `src/coverage.ts` and `coverage-es.ts` (the `gantt` table),
  `src/messages/*`; tests `import.test.ts`, `corpus.test.ts`, `messages.test.ts`.
- `packages/project`, `packages/cli`: `TEMPLATES` with `roadmap`, `templates/roadmap/`,
  `src/export-command.ts` (`--today`), `src/messages/*`; tests `init.test.ts`, `export.test.ts`.
- `packages/playground`: the explorer's New diagram kinds (`src/explorer/dialogs.ts:73`), the
  template card, `build.mjs` thumbnails; tests. `packages/catalog`: the kind word "Gantt".
  `packages/vscode`: `syntaxes/meltemi.tmLanguage.json` (`gantt`, the keywords, dates), the webview
  scenarios. `packages/acceptance`: `src/corpus.ts` (`PROFILES`), `src/gallery.ts`, tests.
- `corpus/valid/gantt/*`, `corpus/invalid/gantt.*`, `corpus/acceptance/gantt/*`,
  `corpus/import/mermaid/gantt-*`, `corpus/import/merge/gantt/`, `gallery/gantt/launch-plan.*`.
- `docs/language/{gantt,grammar-0.2,diagnostics,layout,styles,motion,stories,model-json,formatting}.md`,
  `docs/{editor,cli,playground,compatibility,features}.md`, `docs/tracks/from-mermaid.md`,
  `docs/import/mermaid.md` (generated) and their Spanish copies; `skills/meltemi-diagrams/SKILL.md`,
  `reference/gantt.md` (new) and `reference/converting.md`; `packages/import/README.md`;
  `packages/i18n/README.md`; `CHANGELOG.md`; `docs/decisions/0066-gantt-charts.md`.
