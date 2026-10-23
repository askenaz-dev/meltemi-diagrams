## 1. Names and diagnostics (`packages/assets`, `packages/project`)

- [ ] 1.1 `packages/assets/src/packs.ts`: `slugifyIconName(fileName)` (extension dropped, diacritics folded, runs outside `[A-Za-z0-9_.-]` as `-`, trimmed) and `isIconName`; `SvgFolderPack` leaves out files whose name is not an icon name and reports them; tests in `packages/assets/test/packs.test.ts`: `My Logo (1).svg` → `My-Logo-1`, `Café.svg` → `Cafe`, an empty slug refused
- [ ] 1.2 `packages/project/src/assets.ts`: `asset.unusable-name` (warning) on the file with the hint naming `<slug>.svg`, the pack keeping its other icons; messages `en`/`es`; `packages/project/src/files.ts` `iconFileName`; tests in `packages/project/test/assets.test.ts` with a corpus project holding `My Logo (1).svg` beside `pin.svg`; `mdg assets list` shows the warning (`packages/cli/test`)

## 2. The session request (`packages/editor`)

- [ ] 2.1 `src/canvas/protocol.ts`: `addIcons { token, prefix, licence?, files, targets }` and `iconsAdded { token, added, refused }`; `src/projects.ts` `planSteps` learns the `writeFile` step (whole text of a new file, refused when the path exists) ; unit test of the step in `test/c4.test.ts`'s steps suite or a new `test/files.test.ts`
- [ ] 2.2 `src/session.ts`: `addIcons` validating the prefix (`^[a-z0-9][a-z0-9-]*$`, not `tabler`, not a plugin pack, not an alias of `project.json`) and each name (slug, free in the pack), sanitising each file with `sanitizeSvg` and refusing with the reason, planning `writeFile` per icon, `setJsonField` for `assets/licenses.json` (new prefix only) and `assets/libraries/project.json` (library `project`, category per prefix, label from the name), then `setStyleProperty icon` per target, as one `{ kind: "files", steps }`; refused outside a project with `edit.unsafe-target`; messages `en`/`es`; tests in `test/icons.test.ts`: the ordered steps, a taken name refused, an unsafe file refused and the rest planned, every file refused plans nothing, outside a project
- [ ] 2.3 `src/icons.ts`: `iconGroups` answers an empty query with Recent, one group per project pack (labels from `assets/libraries/project.json`, up to 24), then Technology; `librariesOf` includes the Project library; C4 views get the project's packs first; tests on `corpus/projects/valid/assets`

## 3. The canvas (`packages/canvas`)

- [ ] 3.1 `src/add-icons.ts`: the dialog model and view (prefix field with the remembered value, a row per file with the slug, the preview from the sanitised body, inline refusals, the licence select shown for a new prefix with **Own work**, the SPDX choices and **Other…**, confirm disabled while anything is refused), motion on the shared tokens; `canvas.css`; messages `en`/`es`; unit tests of the model in `packages/canvas/test`: slug offered, `<name>-2` for a taken name, `tabler` refused, confirm disabled, a raster refused
- [ ] 3.2 `src/icon-picker.ts` footer **Add icon…** and `src/library.ts` Project group **Add icon…** on a canvas that edits a project (`CanvasRender.project`), asking the host for `.svg` files (`CanvasHostApi.pickFiles`), opening the dialog, sending `addIcons`, marking the added references Recent, choosing the first when nothing was selected, the status line "Added …"; the empty-query groups rendered as the session answers them

## 4. The hosts

- [ ] 4.1 `packages/playground/src/canvas-host.ts` `pickFiles({ kind: "svg", multiple: true })` reading the files as text; `src/studio.ts` `applyProject` applying `writeFile` steps (text files) with the other edits in one undo step, then `addFiles` restarting the compiler; guests allowed when the live session lets them edit, images still refused; `src/shell.ts` wiring; browser tests in `packages/playground/test/browser/run.ts`: add `pin.svg` to a project from the picker, the node takes `project:pin`, the explorer shows the three files, one undo removes them; a guest of a live session adds an icon and the owner's picker lists it
- [ ] 4.2 `packages/playground/src/studio.ts` `problems()` and the explorer's counts include `workspace.assets().diagnostics` on their files, hidden files' problems on the folder with the existing offer; browser test: a project with a pack and no licence shows `asset.missing-license`
- [ ] 4.3 `packages/vscode/src/extension/pickers.ts` `showOpenDialog` with the SVG filter, read as text; `src/extension/canvas.ts` `applyProjectEdits` creating the new files in the same `WorkspaceEdit`; `src/extension/documents.ts` publishing `assets().diagnostics` on the asset URIs and republishing on the `assets/**` watcher; messages `en`/`es`; `pnpm vscode:test` case: a pack without a licence shows in the Problems view
- [ ] 4.4 `packages/vscode/test/webview/run.ts`: a scenario with a fake host answering `pickFiles` with two SVGs (one unsafe): the dialog shows the refusal, confirming sends `addIcons` with one file, and the picker shows the new reference chosen

## 5. Documentation and decision

- [ ] 5.1 `docs/language/assets.md` and `docs/es/language/assets.md`: "Adding icons from the editor" (the dialog, the files written, `asset.unusable-name`); `docs/editor.md` and `docs/es/editor.md`: the icon picker's Add icon… and the Project library; `docs/playground.md` and `docs/es/playground.md`: asset problems in the explorer; `pnpm docs` checks pass
- [ ] 5.2 `CHANGELOG.md` 1.10.0: an entry for icons added from the editor and one for asset problems in the editors
- [ ] 5.3 `docs/decisions/0054-custom-icons.md` (context, decision, alternatives, consequences), linked from `docs/decisions/0014-icons-and-assets.md` and `0041-element-libraries.md`

## 6. Gates

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`
- [ ] 6.2 `pnpm vscode:test-webview` and `pnpm playground:test-browser`, with a look at the screenshots of the Add icon dialog
