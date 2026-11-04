## 1. Registry

- [x] 1.1 `DiagramTypeDefinition`, `readDiagramType`, `MODEL_API_VERSION`, `declaredProfile`; compile with `types`; `typeKind`, `data`, `definition`; `type.*` checks; JSON; tests.
- [x] 1.2 Layout: the kind's style first, rules by kind, tree placement in ELK.
- [x] 1.3 Editor: completion, hover, palette tools, `createElement` of declared kinds; tests.

## 2. Plugins

- [x] 2.1 project.json `plugins`, schema; `loadPlugins`, `Workspace.plugins()`, compatibility with `RENDERER_API_VERSION`; plugin icon packs; lock; `plugin.*` diagnostics; tests.
- [x] 2.2 CLI `plugins`; plugin diagnostics in validate; corpus valid and invalid projects.

## 3. Safety

- [x] 3.1 Limits in compile and the workspace; `limit.*` diagnostics; tests.
- [x] 3.2 Player page policy; CLI errors without secrets.

## 4. Docs

- [x] 4.1 `docs/plugins.md`, `docs/security.md`, decision 0030, diagnostics, projects, CLI, editor, README, skill.

## 5. Verification

- [x] 5.1 typecheck, lint, test, browser suites, VS Code, package, licences; review the plugin diagrams.
