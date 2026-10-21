## 1. Templates with titles, contents and thumbnails

- [ ] 1.1 `packages/project/src/templates.ts`: `TEMPLATES` entries `{ title, description, contents: { diagrams, models, views, stories } }`; `templateManifest` unchanged; `test/templates.test.ts` compiles each CLI template and asserts its declared contents match the files
- [ ] 1.2 CLI `init --list` prints `<name>  <title> — <description> (<contents>)`; the CLI test of `--list` and `docs/cli.md`, `docs/es/cli.md` updated
- [ ] 1.3 `packages/playground/build.mjs`: `templates.json` v2 (`title`, `description`, `contents`, `files`, `thumbnails: { light, dark }`); two static SVGs per template rendered from its entry diagram with the editor's node API, no embedded fonts, the template's theme and its dark counterpart, into `dist/templates/`; a build test asserts the files exist, are under 200 KiB and hold no `@font-face`; `src/templates.ts` `Template` gains the fields and `templateThumbnail(template, dark)`
- [ ] 1.4 Playground words en/es: `templates.titles` by name and `templates.contents(counts)` ("1 model · 2 views"); `messages.test.ts` parity

## 2. Moving files with their imports

- [ ] 2.1 `packages/editor/src/move-file.ts` `moveFileEdits(sessions, from, to)`: importers of `from` rewritten to the relative path from each file, the moved file's own imports rewritten relative to `to`, shortest `./`/`../` form, strings only, unparsable files in `skipped`; exported from the package and `node.ts`; `test/move-file.test.ts` with the four spec scenarios and a folder move
- [ ] 2.2 `Studio.renameFile` applies the rename and the import edits in one `inStep` (one undo step, one `StudioChange` step); `Studio.moveFiles(pairs)` for a folder rename or a multi-file drop, one step for all; `Studio.outline(path)` from the workspace compilation (cached by text); `studio-changes.test.ts` and `files.test.ts` cover the step grouping and the outline
- [ ] 2.3 Cloud binding: a step holding a rename and text edits reaches the room as one transaction and undoes as one (`binding.test.ts`, `cloud-project.test.ts`)

## 3. The explorer pane: layout and tree

- [ ] 3.1 `playground.css` and `shell.ts`: the explorer column (`--explorer`, 180..480, default 260), its edge (drag, Left/Right 16 px, double click resets), the 36 px rail, Ctrl+B / Cmd+B toggle, Ctrl+Shift+E focus, `Settings.explorer = { width, collapsed, showAll }`, collapsed by default under 1100 px on the first visit; under `.shell.narrow` the tabs Files · Code · Canvas with Files first and a file opening switching to Code; the file bar and its three buttons removed
- [ ] 3.2 `explorer/model.ts` `ExplorerModel` and `ExplorerHost`: tree from paths, outlines and problems (root files, then folders; folders before files; names without `.meltemi`; kind icons; diagram and story children when more than one; image rows; error/warning counts with folder sums), expanded/selected/focused state by path, Show all files filtering (hidden kinds, folders left empty), the hidden-problems count; `explorer-model.test.ts` with a fake host (purchase tree, filtering, counts, outline children, remote add keeps state)
- [ ] 3.3 `explorer/tree.ts`: WAI-ARIA tree (`tree`, `treeitem`, `aria-level`, `aria-expanded`, `aria-selected`, `group`, roving tabindex), keyboard (Up/Down, Left/Right, Home/End, type-ahead, Enter/Space), redraw by path diff keeping focus and scroll, `aria-current` on the open file and the shown diagram selected from the render message; clicks open files, `pickDiagram`, `pickStory`; the open file is revealed and scrolled into view
- [ ] 3.4 Browser scenarios: the purchase tree with `project.json` hidden, `architecture` expanding to `context` and `containers`, picking `containers` shows the view, the error count on `overview` appears and goes, a file that does not parse, the narrow Files tab, collapse kept across a reload, Ctrl+B and Ctrl+Shift+E

## 4. Actions, Show all files and project settings

- [ ] 4.1 Context menu (right click, Shift+F10, context-menu key, the "…" row button) through `menuButton` anchored at the pointer: New diagram…, New folder…, Rename, Move to…, Duplicate, Download, Delete, and New file… with Show all files on; hidden in view mode with the "…" buttons
- [ ] 4.2 New diagram… dialog (name, kind flow/free/sequence) writing `<folder>/<name>.meltemi` through `createDiagram` with the title; New folder… (a transient empty folder until its first file; the first file by New diagram… inside it); `starterText` removed
- [ ] 4.3 Rename in the row (F2; Enter/Escape; path rule, extension kept, existing path refused with its name) and a remote rename cancelling the box; Move to… dialog (folders list and a new-folder field; M); Duplicate (Ctrl+D, `-copy`, `-copy-2`…); Download (text and images); Delete (Delete key, confirmation naming the file or the folder and its count); folder rename and delete over every file; words en/es; `explorer-model.test.ts` for each refusal
- [ ] 4.4 Show all files: the footer toggle and the project-menu entry kept in settings, settings icon for `project.json` and `assets.lock.json`, the "n hidden files have problems · Show" footer line that turns the toggle on and selects the first; Project settings opening or creating `project.json` (name, `language`, `tools`)
- [ ] 4.5 Browser scenarios: New diagram… in `diagrams` (file, header, title, selected row), F2 rename, a name that exists, Delete on `diagrams` naming 3 files, Show all files on and kept, the hidden `project.json` problem, Project settings on a manifest-less project, view mode without actions, a rename of `models/system` to `models/core/system` leaving the c4 template without diagnostics

## 5. Drag and drop

- [ ] 5.1 `explorer/dnd.ts`: draggable rows (single and Ctrl/Shift selection), folder and root targets with highlight, a whole drop refused when any name exists (status names it), Escape cancels, auto-open of a hovered folder after 600 ms, the drag chip image; drops moved through `Studio.moveFiles`
- [ ] 5.2 External drops: files added into the target folder (root on empty space), a `.zip` to the import dialog; **Open** keeps adding beside the open file
- [ ] 5.3 Browser scenarios: `executive` onto `stories`, a drop that would overwrite moves nothing, an image dropped onto `diagrams`, a `.zip` dropped opens the import dialog

## 6. The switcher and its panel

- [ ] 6.1 `cloud/projects-model.ts` → `explorer/switcher-model.ts`: `ProjectsModel` plus the local project (name, has files), the previous project, `renameLocal` (writes `name` in `project.json`, creating the manifest when missing), `importArchive(destination)`; `cloud-projects-model.test.ts` → `switcher-model.test.ts` extended
- [ ] 6.2 `explorer/switcher.ts`: the header with the name, the storage chip (This browser / Saved to the cloud / Saving… / Offline / View only from `ConnectionStatus` and the role), the pencil and F2 rename with the name checks, the chevron; `explorer/panel.ts`: the anchored popover (sheet under `.shell.narrow`) with the actions, This browser with Previous project · Restore, the cloud list (thumbnail, name, last change, role, open on click, owner actions on hover and focus, filter above eight, the count) and the signed-out invitation line; focus restore by project id as the drawer did; thumbnails listened to while open
- [ ] 6.3 Removals: `cloud/projects.ts`, the header's Projects button, the Templates menu and `restorePrevious`'s entry, `openProjects`; `cloudSlot` keeps Versions, Share and Publish; words moved from `cloud.projects` to `switcher`; `docs` references updated in 10.x
- [ ] 6.4 Cloud browser suite: `openDrawer`/`drawerNames`/`drawerRow` → `openSwitcher`/`switcherNames`/`switcherRow` over the panel; `scenarios-projects`, `scenarios-binaries`, `scenarios-offline` adapted; new scenarios: rename from the header reaches the list, a remote file appears in the tree keeping focus, view mode shows the tree without actions
- [ ] 6.5 Playground browser scenarios: the anonymous panel's contents, the local rename writing `project.json`, the empty name refused, Previous project · Restore after a new project

## 7. New project from cards

- [ ] 7.1 `explorer/new-project.ts`: the dialog with the name (default the chosen title, checked as the drawer checked it) and the `radiogroup` of cards (thumbnail of the page's theme, title, description, contents; arrows move, Enter creates); anonymous creation replacing the browser project with the existing question and the previous project kept; signed in `createFrom` and open
- [ ] 7.2 Browser scenarios: the five cards in Spanish with `c4` "1 modelo · 2 vistas" and `purchase` "4 diagramas · 1 historia" and thumbnails loaded from the page's origin; anonymous creation asks and replaces; the empty name; cloud: `Pagos` from the sequence card listed by the service and bound

## 8. Import and export

- [ ] 8.1 `CloudController.uploadProject(name, files, progress)` shared by `saveLocal` and the import (create with texts, upload binaries, delete on failure, limits checked before the first call naming the limit); `cloud-controller.test.ts`
- [ ] 8.2 `explorer/import.ts`: reading the archive (`readZip`, path rule, text/bytes), the dialog (archive name, project name, file count; destinations A new cloud project with the prefilled name, This browser, Replace the files of <open project> with its wording), progress, outcomes in the status; an archive with no valid file adds nothing and says so; wired from the panel, **Open** and the drop; Export project (.zip) calling `downloadProject`, the Download entry kept
- [ ] 8.3 Browser scenarios: export equals Download for `c4`; import into this browser while a cloud project is open (cloud project kept, previous restorable); the empty archive; cloud: import as a new cloud project with an image (uploaded by hash, bound), an upload answering `413 quota.storage` deletes the project again, a `.hidden/` path refused before any call, Replace the files of the open project reaches the room

## 9. Motion

- [ ] 9.1 `playground.css`: `--pg-motion-fast`, `--pg-motion`, `--pg-ease`; folder groups animating `grid-template-rows` with the chevron turn; row actions fading in; created/renamed row flash and scroll into view; deleted row collapse; drag chip, target tint; the explorer width following the drag and the collapse animating; panel rise and fade (150/100 ms); card lift and chosen ring; import progress bar; the Files tab slide; all neutralised in the `prefers-reduced-motion` block
- [ ] 9.2 Browser scenarios: the folder group's computed transition duration is 180 ms, and 0 under emulated reduced motion; screenshots of the explorer, the panel, the cards and the import dialog in light and dark reviewed against the design

## 10. Documentation and gates

- [ ] 10.1 `docs/playground.md` and `docs/es/playground.md`: "What it does" rows (Projects, Keep, Cloud), a new "The explorer" section (tree, actions, keyboard, drag and drop, Show all files, project settings), "The project switcher" replacing "The Projects drawer", "New project" with the cards, "Importing and exporting a project" replacing the archive paragraphs of "Continuing locally", the keys table (Ctrl+B, Ctrl+Shift+E, F2, M, Ctrl+D, Delete); `docs/getting-started.md` and `docs/es/getting-started.md` "Try it without installing" naming Export project
- [ ] 10.2 `docs/decisions/0048-project-explorer.md`; `CHANGELOG.md` 1.10.0 "Playground" section (the explorer, the switcher, cards, import and export, moves rewriting imports); `docs/features.md` and `docs/es/features.md` playground line
- [ ] 10.3 Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm playground:test-browser`, `pnpm cloud:test-browser`, `openspec validate project-explorer`; the skill copies unchanged (`pnpm skills:sync` reports nothing)
