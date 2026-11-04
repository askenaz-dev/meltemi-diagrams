import {
  createDiagnostic,
  isNode,
  isToken,
  sortDiagnostics,
  type Diagnostic,
  type DiagnosticInput,
  type QualifiedRef,
  type Range,
  type Severity,
} from "@meltemi/diagrams-language";
import {
  BUILT_IN_CLASSES,
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  compile,
  type ClassUse,
  type Compilation,
  type ImportDeclaration,
  type ResolvedDiagram,
  type ResolvedModel,
  type ThemeDefinition,
} from "@meltemi/diagrams-model";
import { iconProblemCode, type ProjectAssets } from "./assets.js";
import { lookupFile, type ProjectHost } from "./host.js";
import { resolveImagePath, type ImageLookup } from "./images.js";
import { projectThemeSetting, type ManifestResult } from "./manifest.js";
import { messages } from "./messages/index.js";
import { dirnamePath, isInside, joinPath, relativePath, resolveImportPath } from "./paths.js";

export type BlockKind = "diagram" | "theme" | "model" | "story" | "export";

/** A top-level block of a file, by id. */
export interface Definition {
  readonly id: string;
  readonly kind: BlockKind;
  readonly range: Range;
}

/** A name bound in a file by an `import` statement, with the file it refers to. */
export interface Binding {
  readonly name: string;
  readonly kind: "namespace" | "member";
  /** The imported file, or null when the import did not resolve or closes a cycle. */
  readonly target: string | null;
  /** The imported id for member bindings. */
  readonly member: string | null;
  readonly range: Range;
  readonly declaration: ImportDeclaration;
}

export interface ResolvedImport {
  readonly declaration: ImportDeclaration;
  /** The imported file when the path is valid, inside the project and exists. */
  readonly target: string | null;
  /** True when this import closes a cycle; its names stay unresolved. */
  readonly cut: boolean;
}

export interface FileCompilation {
  readonly path: string;
  readonly program: Program;
  /** The single-file compilation of the file. */
  readonly compilation: Compilation;
  readonly imports: readonly ResolvedImport[];
  readonly bindings: ReadonlyMap<string, Binding>;
  readonly definitions: ReadonlyMap<string, Definition>;
  /** Compile diagnostics plus every module, project and cross-file theme diagnostic of the file. */
  readonly diagnostics: readonly Diagnostic[];
}

/** A set of compiled files and the project they belong to. */
export interface Program {
  readonly root: string;
  readonly manifest: ManifestResult;
  readonly files: ReadonlyMap<string, FileCompilation>;
}

/** Loads the single-file compilation of a path, or undefined when it cannot be read. */
export type CompilationLoader = (path: string) => Compilation | undefined;

/** First segments of built-in theme names, which namespaces may not shadow. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set(
  BUILT_IN_THEMES.map((name) => name.split(".")[0]!),
);

interface Draft {
  readonly path: string;
  compilation: Compilation;
  imports: ResolvedImport[];
  readonly diagnostics: Diagnostic[];
}

/**
 * Compiles `entries` and their import closures into a program. Files are loaded with `load`,
 * which reuses single-file compilations; only resolution across files runs here.
 */
export function buildProgram(
  host: ProjectHost,
  root: string,
  manifest: ManifestResult,
  entries: readonly string[],
  load: CompilationLoader,
  exists: (path: string) => boolean = () => false,
  assets?: ProjectAssets,
  images?: (path: string) => ImageLookup,
): Program {
  const drafts = new Map<string, Draft>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const report = (draft: Draft, input: DiagnosticInput) =>
    draft.diagnostics.push(createDiagnostic(draft.compilation.parse.lines, input));
  const span = (range: Range) => ({ start: range.start.offset, end: range.end.offset });
  const display = (path: string) => relativePath(root, path);
  // Diagnostics are written in the interface language of the moment the program is built.
  const words = messages();
  const t = words.diagnostics.modules;
  const hints = words.hints.modules;

  const visit = (path: string): void => {
    if (drafts.has(path)) return;
    const compilation = load(path);
    if (!compilation) return;
    const draft: Draft = { path, compilation, imports: [], diagnostics: [] };
    drafts.set(path, draft);
    stack.push(path);
    onStack.add(path);
    const targets = new Set<string>();
    for (const declaration of compilation.document.imports) {
      const resolved = resolveDeclaration(draft, declaration);
      if (resolved.target !== null) {
        if (targets.has(resolved.target)) {
          report(draft, {
            code: "module.duplicate-import",
            severity: "warning",
            message: t.duplicateImport(display(resolved.target)),
            span: span(declaration.range),
            hints: [hints.duplicateImport],
          });
        }
        targets.add(resolved.target);
      }
      draft.imports.push(resolved);
    }
    stack.pop();
    onStack.delete(path);
  };

  const resolveDeclaration = (draft: Draft, declaration: ImportDeclaration): ResolvedImport => {
    if (declaration.afterBlock) {
      report(draft, {
        code: "module.import-position",
        severity: "warning",
        message: t.importPosition,
        span: span(declaration.range),
        hints: [hints.importPosition],
      });
    }
    if (declaration.path === null || declaration.pathRange === null) {
      return { declaration, target: null, cut: false };
    }
    const pathSpan = span(declaration.pathRange);
    const check = resolveImportPath(draft.path, declaration.path);
    if (!check.ok) {
      report(draft, {
        code: "module.invalid-path",
        message: t.invalidPath(declaration.path, check.reason),
        span: pathSpan,
        hints: [hints.relativePath],
      });
      return { declaration, target: null, cut: false };
    }
    if (!isInside(root, check.path)) {
      report(draft, {
        code: "module.outside-project",
        message: t.outsideProject(declaration.path),
        span: pathSpan,
        hints: [hints.outsideProject],
      });
      return { declaration, target: null, cut: false };
    }
    if (!exists(check.path)) {
      const lookup = lookupFile(host, check.path);
      if (lookup.status !== "found") {
        report(draft, {
          code: "module.not-found",
          message: t.notFound(display(check.path)),
          span: pathSpan,
          hints:
            lookup.status === "case-mismatch"
              ? [hints.caseMismatch(display(lookup.actual))]
              : undefined,
        });
        return { declaration, target: null, cut: false };
      }
    }
    if (onStack.has(check.path)) {
      const chain = [...stack.slice(stack.indexOf(check.path)), check.path].map(display);
      report(draft, {
        code: "module.cycle",
        message: t.cycle(chain),
        span: pathSpan,
        hints: [hints.cycle],
      });
      return { declaration, target: check.path, cut: true };
    }
    visit(check.path);
    if (!drafts.has(check.path)) {
      report(draft, {
        code: "module.not-found",
        message: t.unreadable(display(check.path)),
        span: pathSpan,
      });
      return { declaration, target: null, cut: false };
    }
    return { declaration, target: check.path, cut: false };
  };

  for (const entry of entries) visit(entry);
  // The project's default theme is in scope for every file, so its file joins every program.
  const themeFile = projectThemeFile(root, manifest);
  if (themeFile !== null) visit(themeFile);

  const files = new Map<string, FileCompilation>();
  const program: Program = { root, manifest, files };
  const definitions = new Map<string, Map<string, Definition>>();
  for (const [path, draft] of drafts) definitions.set(path, topLevelDefinitions(draft.compilation));

  for (const [path, draft] of drafts) {
    const bindings = new Map<string, Binding>();
    for (const resolved of draft.imports) {
      const { declaration } = resolved;
      const target = resolved.cut ? null : resolved.target;
      for (const binding of declaration.bindings) {
        if (RESERVED_NAMES.has(binding.name)) {
          report(draft, {
            code: "module.reserved-name",
            message: t.reservedName(binding.name),
            span: span(binding.range),
            hints: [hints.reservedName],
          });
        }
        if (binding.member !== null && target !== null) {
          const offered = definitions.get(target)!;
          if (!offered.has(binding.member)) {
            report(draft, {
              code: "module.unknown-member",
              message: t.unknownMember(display(target), binding.member),
              span: span(binding.memberRange ?? binding.range),
              hints: [hints.defines([...offered.keys()].sort())],
            });
          }
        }
        if (!bindings.has(binding.name)) {
          bindings.set(binding.name, {
            name: binding.name,
            kind: declaration.form === "namespace" ? "namespace" : "member",
            target,
            member: binding.member,
            range: binding.range,
            declaration,
          });
        }
      }
    }
    files.set(path, {
      path,
      program,
      compilation: draft.compilation,
      imports: draft.imports,
      bindings,
      definitions: definitions.get(path)!,
      diagnostics: [],
    });
  }

  // C4 views and links that name imported models compile against the imported files' models.
  for (const [path, draft] of drafts) {
    const file = files.get(path)!;
    if (!namesImportedModels(file)) continue;
    const compilation = compile(draft.compilation.text, {
      ...draft.compilation.options,
      models: (name) => importedModel(file, name),
    });
    draft.compilation = compilation;
    files.set(path, { ...file, compilation });
  }

  // Stories that name imported diagrams compile against the imported files' diagrams, once those
  // are final.
  for (const [path, draft] of drafts) {
    const file = files.get(path)!;
    if (!namesImportedDiagrams(file)) continue;
    const compilation = compile(draft.compilation.text, {
      ...draft.compilation.options,
      models: (name) => importedModel(file, name),
      diagrams: (name) => importedDiagram(file, name),
    });
    draft.compilation = compilation;
    files.set(path, { ...file, compilation });
  }

  for (const [path, draft] of drafts) {
    const file = files.get(path)!;
    checkModels(file, (input) => report(draft, input));
    checkUsage(file, (input) => report(draft, input));
    checkThemes(file, (input) => report(draft, input));
    checkClasses(file, (input) => report(draft, input));
    if (assets) checkIcons(file, assets, (input) => report(draft, input));
    checkImages(file, root, images, (input) => report(draft, input));
    checkLinks(file, (input) => report(draft, input));
    checkLanguage(file, manifest, (input) => report(draft, input));
    (file as { diagnostics: readonly Diagnostic[] }).diagnostics = sortDiagnostics([
      ...draft.compilation.diagnostics,
      ...draft.diagnostics,
    ]);
  }
  return program;
}

// ---------------------------------------------------------------- imported models

/** Whether a file has views or links whose model may come from an import. */
function namesImportedModels(file: FileCompilation): boolean {
  if (file.bindings.size === 0) return false;
  for (const diagram of file.compilation.document.diagrams) {
    if (diagram.c4 && diagram.c4.resolved === null) return true;
    if (diagram.links.some((l) => l.target === null)) return true;
  }
  return false;
}

/** Whether a file has stories whose diagram may come from an import. */
function namesImportedDiagrams(file: FileCompilation): boolean {
  if (file.bindings.size === 0) return false;
  return file.compilation.document.stories.some(
    (story) => story.target.diagram === null || story.scenes.some((s) => s.view.diagram === null),
  );
}

/**
 * The diagram a name of `file` refers to through its imports, for stories: a member import of a
 * diagram (`checkout`) or `<namespace>.<diagram>`.
 */
export function importedDiagram(file: FileCompilation, name: string): ResolvedDiagram | undefined {
  const dot = name.indexOf(".");
  const first = dot < 0 ? name : name.slice(0, dot);
  const binding = file.bindings.get(first);
  if (!binding || binding.target === null) return undefined;
  let id: string;
  if (binding.kind === "member") {
    if (dot >= 0 || binding.member === null) return undefined;
    id = binding.member;
  } else {
    if (dot < 0) return undefined;
    id = name.slice(dot + 1);
  }
  const target = file.program.files.get(binding.target);
  const diagram = target?.compilation.document.diagrams.find((d) => d.id === id);
  return diagram ? { diagram, file: binding.target } : undefined;
}

/**
 * The model a name of `file` refers to through its imports: a member import of a model
 * (`commerce`) or `<namespace>.<model>`.
 */
export function importedModel(file: FileCompilation, name: string): ResolvedModel | undefined {
  const dot = name.indexOf(".");
  const first = dot < 0 ? name : name.slice(0, dot);
  const binding = file.bindings.get(first);
  if (!binding || binding.target === null) return undefined;
  let id: string;
  if (binding.kind === "member") {
    if (dot >= 0 || binding.member === null) return undefined;
    id = binding.member;
  } else {
    if (dot < 0) return undefined;
    id = name.slice(dot + 1);
  }
  const target = file.program.files.get(binding.target);
  const definition = target?.compilation.document.models.find((m) => m.id === id);
  return definition ? { definition, file: binding.target } : undefined;
}

/** Views whose imported model name does not lead to a model. */
function checkModels(file: FileCompilation, report: Reporter): void {
  const words = messages();
  for (const diagram of file.compilation.document.diagrams) {
    const c4 = diagram.c4;
    if (!c4 || c4.resolved !== null) continue;
    const first = c4.model.split(".")[0]!;
    const binding = file.bindings.get(first);
    if (!binding || binding.target === null) continue;
    const target = file.program.files.get(binding.target);
    const models = target?.compilation.document.models.map((m) => m.id) ?? [];
    const display = target ? relativePath(dirnamePath(file.path), target.path) : first;
    const candidates = models.map((m) => (binding.kind === "namespace" ? `${first}.${m}` : m));
    report({
      code: "ref.unknown-model",
      message:
        binding.kind === "namespace" && !c4.model.includes(".")
          ? words.diagnostics.references.namespaceModel(first)
          : words.diagnostics.references.unknownModel(c4.model, display),
      span: toSpan(c4.modelRange),
      data: { candidates },
      hints: [words.hints.references.models(display, candidates)],
    });
  }
}

// ---------------------------------------------------------------- definitions and references

/** Every top-level block of a compilation by id; the first block wins on duplicates. */
export function topLevelDefinitions(compilation: Compilation): Map<string, Definition> {
  const found = new Map<string, Definition>();
  const lines = compilation.parse.lines;
  for (const item of compilation.parse.root.items) {
    let kind: BlockKind | undefined;
    switch (item.kind) {
      case "DiagramBlock":
        kind = "diagram";
        break;
      case "ThemeBlock":
        kind = "theme";
        break;
      case "ModelBlock":
        kind = "model";
        break;
      case "StoryBlock":
        kind = "story";
        break;
      case "ExportBlock":
        kind = "export";
        break;
    }
    if (!kind || !("id" in item)) continue;
    const id = item.id;
    if (!isToken(id) || found.has(id.text)) continue;
    found.set(id.text, { id: id.text, kind, range: lines.range({ start: id.start, end: id.end }) });
  }
  return found;
}

export type NameUse = "theme" | "extends" | "block" | "link";

/** A name written in a file that may refer to an imported block. */
export interface NameReference {
  readonly name: string;
  readonly use: NameUse;
  readonly range: Range;
}

/**
 * Names that can refer to imported blocks: `theme "<name>"` in diagrams, `extends "<name>"` in
 * themes, and the `using` and `for` targets of diagrams, stories and exports.
 */
export function nameReferences(compilation: Compilation): NameReference[] {
  const found: NameReference[] = [];
  const lines = compilation.parse.lines;
  const range = (node: { start: number; end: number }) => lines.range(node);
  const ref = (node: QualifiedRef) =>
    found.push({ name: node.parts.map((p) => p.text).join("."), use: "block", range: range(node) });
  for (const item of compilation.parse.root.items) {
    if (item.kind === "DiagramBlock") {
      if (item.usingRef?.kind === "QualifiedRef") ref(item.usingRef);
      if (item.block.kind !== "Block") continue;
      for (const statement of item.block.statements) {
        if (statement.kind !== "KeywordStatement" || statement.keyword.text !== "theme") continue;
        const arg = statement.args[0];
        if (isNode(arg) && arg.kind === "StringLiteral") {
          found.push({ name: arg.value, use: "theme", range: range(arg) });
        }
      }
    } else if (item.kind === "ThemeBlock") {
      if (item.block.kind !== "Block") continue;
      for (const statement of item.block.statements) {
        if (statement.kind !== "KeywordStatement" || statement.keyword.text !== "extends") continue;
        const arg = statement.args[0];
        if (isNode(arg) && arg.kind === "StringLiteral") {
          found.push({ name: arg.value, use: "extends", range: range(arg) });
        }
      }
    } else if (item.kind === "StoryBlock" || item.kind === "ExportBlock") {
      if (item.target?.kind === "QualifiedRef") ref(item.target);
      // A scene's `view <diagram>` names a diagram too.
      if (item.kind !== "StoryBlock" || item.block.kind !== "Block") continue;
      for (const scene of item.block.statements) {
        if (scene.kind !== "KeywordStatement" || scene.keyword.text !== "scene" || !scene.block)
          continue;
        for (const statement of scene.block.statements) {
          if (statement.kind !== "KeywordStatement" || statement.keyword.text !== "view") continue;
          const arg = statement.args[0];
          if (arg?.kind === "QualifiedRef") ref(arg);
        }
      }
    }
  }
  for (const diagram of compilation.document.diagrams) {
    for (const link of diagram.links) {
      found.push({ name: link.text, use: "link", range: link.range });
    }
  }
  return found;
}

/** The binding a name starts with (`corp`, or `company` in `company.corporate`), if any. */
export function bindingOf(file: FileCompilation, name: string): Binding | undefined {
  return file.bindings.get(name) ?? file.bindings.get(name.split(".")[0]!);
}

// ---------------------------------------------------------------- qualified references

export type ReferenceResult =
  | {
      readonly ok: true;
      readonly file: string;
      readonly id: string;
      readonly kind: BlockKind;
      readonly definition: Definition;
    }
  | { readonly ok: false; readonly message: string };

/**
 * Resolves a reference to a top-level block of one of `kinds`: a local id, then a member binding,
 * then `namespace.id`.
 */
export function resolveReference(
  file: FileCompilation,
  ref: string | QualifiedRef,
  kinds: readonly BlockKind[],
): ReferenceResult {
  const name = typeof ref === "string" ? ref : ref.parts.map((p) => p.text).join(".");
  const found = lookupName(file, name);
  // Written in the interface language of the moment the reference is resolved.
  const t = messages().lookup;
  if (!found) return { ok: false, message: t.notFound(name, kinds, visibleNames(file, kinds)) };
  if (!kinds.includes(found.definition.kind)) {
    return { ok: false, message: t.wrongKind(name, found.definition.kind, kinds) };
  }
  return {
    ok: true,
    file: found.file,
    id: found.definition.id,
    kind: found.definition.kind,
    definition: found.definition,
  };
}

function lookupName(
  file: FileCompilation,
  name: string,
): { file: string; definition: Definition } | undefined {
  const local = file.definitions.get(name);
  if (local) return { file: file.path, definition: local };
  const files = file.program.files;
  const member = file.bindings.get(name);
  if (member?.kind === "member" && member.target !== null && member.member !== null) {
    const definition = files.get(member.target)?.definitions.get(member.member);
    if (definition) return { file: member.target, definition };
  }
  const dot = name.indexOf(".");
  if (dot > 0) {
    const namespace = file.bindings.get(name.slice(0, dot));
    if (namespace?.kind === "namespace" && namespace.target !== null) {
      const definition = files.get(namespace.target)?.definitions.get(name.slice(dot + 1));
      if (definition) return { file: namespace.target, definition };
    }
  }
  return undefined;
}

/** Names of blocks of `kinds` that `file` can refer to, sorted. */
export function visibleNames(file: FileCompilation, kinds: readonly BlockKind[]): string[] {
  const names: string[] = [];
  for (const definition of file.definitions.values()) {
    if (kinds.includes(definition.kind)) names.push(definition.id);
  }
  for (const binding of file.bindings.values()) {
    if (binding.target === null) continue;
    const offered = file.program.files.get(binding.target)?.definitions;
    if (!offered) continue;
    if (binding.kind === "member" && binding.member !== null) {
      const definition = offered.get(binding.member);
      if (definition && kinds.includes(definition.kind)) names.push(binding.name);
    } else if (binding.kind === "namespace") {
      for (const definition of offered.values()) {
        if (kinds.includes(definition.kind)) names.push(`${binding.name}.${definition.id}`);
      }
    }
  }
  return names.sort();
}

// ---------------------------------------------------------------- theme scopes

export function themeKey(path: string, id: string): string {
  return `${path}#${id}`;
}

/** The absolute path of the file that holds the project's default theme, or null. */
export function projectThemeFile(root: string, manifest: ManifestResult): string | null {
  const setting = projectThemeSetting(manifest.manifest);
  return setting?.kind === "file" ? joinPath(root, setting.path) : null;
}

/**
 * The project's default theme as a name `resolveTheme` resolves under `themeDefinitionsFor(file)`:
 * a built-in name or the key of a theme in a project file. Null when there is none or it does not
 * resolve; diagrams then use the built-in default.
 */
export function projectTheme(program: Program): string | null {
  const setting = projectThemeSetting(program.manifest.manifest);
  if (setting === null) return null;
  if (setting.kind === "built-in") return setting.name;
  const path = joinPath(program.root, setting.path);
  const declares = program.files
    .get(path)
    ?.compilation.document.themes.some((theme) => theme.id === setting.id);
  return declares ? themeKey(path, setting.id) : null;
}

/** Resolves a theme name written in `file` to a key, a built-in name, or undefined. */
export function resolveThemeName(file: FileCompilation, name: string): string | undefined {
  if ((BUILT_IN_THEMES as readonly string[]).includes(name)) return name;
  const found = lookupName(file, name);
  if (!found || found.definition.kind !== "theme") return undefined;
  return themeKey(found.file, found.definition.id);
}

function themeByKey(program: Program, key: string): ThemeDefinition | undefined {
  const hash = key.lastIndexOf("#");
  if (hash < 0) return undefined;
  const file = program.files.get(key.slice(0, hash));
  const id = key.slice(hash + 1);
  return file?.compilation.document.themes.find((t) => t.id === id);
}

/**
 * Theme definitions under which `resolveTheme` resolves every theme name visible in `file`:
 * each reachable theme under its key with `extends` rewritten in its own file's scope, plus one
 * token-less alias per visible name.
 */
export function themeDefinitionsFor(file: FileCompilation): ThemeDefinition[] {
  const program = file.program;
  const result: ThemeDefinition[] = [];
  const included = new Set<string>();
  const include = (key: string) => {
    if (included.has(key)) return;
    const hash = key.lastIndexOf("#");
    const owner = program.files.get(key.slice(0, hash));
    const theme = themeByKey(program, key);
    if (!owner || !theme) return;
    included.add(key);
    const base =
      theme.extends === null ? null : (resolveThemeName(owner, theme.extends) ?? theme.extends);
    result.push({ ...theme, id: key, extends: base });
    if (base !== null && base.includes("#")) include(base);
  };
  const aliases: ThemeDefinition[] = [];
  for (const name of visibleNames(file, ["theme"])) {
    const key = resolveThemeName(file, name);
    if (!key || !key.includes("#")) continue;
    include(key);
    const theme = themeByKey(program, key)!;
    aliases.push({
      ...theme,
      id: name,
      extends: key,
      tokens: {},
      classes: [],
      rules: [],
      icons: [],
    });
  }
  const fallback = projectTheme(program);
  if (fallback !== null && fallback.includes("#")) include(fallback);
  return [...result, ...aliases];
}

/**
 * Names of the classes of a theme chain under `definitions`, or undefined when the name does not
 * resolve. Built-in themes end the chain; their classes are the built-in classes.
 */
function chainClasses(name: string, definitions: readonly ThemeDefinition[]): string[] | undefined {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current: string | null = name;
  while (current !== null) {
    const definition = byId.get(current);
    if (!definition) {
      return (BUILT_IN_THEMES as readonly string[]).includes(current) ? names : undefined;
    }
    if (visited.has(current)) return undefined;
    visited.add(current);
    names.push(...definition.classes.map((c) => c.id));
    current = definition.extends;
  }
  return names;
}

// ---------------------------------------------------------------- checks

type Reporter = (input: DiagnosticInput & { severity?: Severity }) => void;

const toSpan = (range: Range) => ({ start: range.start.offset, end: range.end.offset });

function checkUsage(file: FileCompilation, report: Reporter): void {
  const used = new Set<string>();
  for (const reference of nameReferences(file.compilation)) {
    const binding = bindingOf(file, reference.name);
    if (binding) used.add(binding.name);
  }
  for (const binding of file.bindings.values()) {
    // Unresolved imports already have their own diagnostic.
    if (used.has(binding.name) || binding.target === null) continue;
    report({
      code: "module.unused-import",
      severity: "info",
      message: messages().diagnostics.modules.unusedImport(binding.name),
      span: toSpan(binding.range),
    });
  }
}

function checkThemes(file: FileCompilation, report: Reporter): void {
  // Inheritance cycles across files need an import cycle, which is reported as `module.cycle`;
  // the cut import leaves its names unresolved, so they are skipped here.
  for (const reference of nameReferences(file.compilation)) {
    const binding =
      reference.use === "block" || reference.use === "link"
        ? undefined
        : bindingOf(file, reference.name);
    if (!binding || binding.target === null) continue;
    const offered = file.program.files.get(binding.target)?.definitions;
    if (binding.member !== null && !offered?.has(binding.member)) continue;
    if (resolveThemeName(file, reference.name)) continue;
    const words = messages();
    const candidates = visibleNames(file, ["theme"]);
    const hint = candidates.length > 0 ? [words.hints.references.themes(candidates)] : undefined;
    if (reference.use === "extends") {
      report({
        code: "theme.unknown-base",
        message: words.diagnostics.references.unknownBase(reference.name),
        span: toSpan(reference.range),
        hints: hint,
      });
    } else {
      report({
        code: "layout.unknown-theme",
        severity: "warning",
        message: words.diagnostics.references.unknownTheme(reference.name),
        span: toSpan(reference.range),
        hints: hint,
        data: { candidates },
      });
    }
  }
}

/**
 * Reports class names that no class in scope declares: the diagram's classes, the classes of its
 * theme chain (its `theme`, the project's default theme, or the built-in default) and the
 * built-in classes. Diagrams whose theme does not resolve are left to `layout.unknown-theme`.
 */
function checkClasses(file: FileCompilation, report: Reporter): void {
  let definitions: ThemeDefinition[] | undefined;
  for (const diagram of file.compilation.document.diagrams) {
    const uses = new Map<number, ClassUse>();
    const collect = (list: readonly ClassUse[]) => {
      for (const use of list) uses.set(use.range.start.offset, use);
    };
    for (const element of diagram.elements) collect(element.classes);
    for (const relation of diagram.relations) collect(relation.classes);
    for (const entry of diagram.styles) collect(entry.classes);
    if (uses.size === 0) continue;
    definitions ??= themeDefinitionsFor(file);
    const theme = diagram.properties.theme ?? projectTheme(file.program) ?? DEFAULT_THEME;
    const inherited = chainClasses(theme, definitions);
    if (inherited === undefined) continue;
    const visible = new Set([
      ...diagram.classes.map((c) => c.id),
      ...inherited,
      ...Object.keys(BUILT_IN_CLASSES),
    ]);
    const offered = [...visible].filter((c) => !c.startsWith("c4_")).sort();
    const words = messages();
    for (const use of uses.values()) {
      if (visible.has(use.name)) continue;
      report({
        code: "theme.unknown-class",
        severity: "warning",
        message: words.diagnostics.references.unknownClass(use.name),
        span: toSpan(use.range),
        // The C4 classes colour views; they are not offered in hints.
        hints: [words.hints.references.classes(offered)],
        data: { candidates: offered },
      });
    }
  }
}

/** Reports icon values whose pack or icon does not exist, or whose icon cannot be used. */
function checkIcons(file: FileCompilation, assets: ProjectAssets, report: Reporter): void {
  const document = file.compilation.document;
  const uses = [
    ...document.diagrams.flatMap((d) => d.icons),
    ...document.themes.flatMap((theme) => theme.icons),
  ];
  const words = messages();
  const t = words.diagnostics.assets;
  const hints = words.hints.assets;
  for (const use of uses) {
    const found = assets.registry.lookup(use.reference);
    const span = toSpan(use.range);
    switch (found.status) {
      case "unknown-pack":
        report({
          code: "asset.unknown-pack",
          message: t.unknownPack(found.prefix),
          span,
          hints: [hints.packs(found.packs)],
        });
        break;
      case "unknown-icon":
        report({
          code: "asset.unknown-icon",
          message: t.unknownIcon(found.pack.prefix, found.name),
          span,
          data: { candidates: found.suggestions },
          hints: [
            found.suggestions.length > 0 ? hints.didYouMean(found.suggestions) : hints.searchIcons,
          ],
        });
        break;
      case "unusable":
        report({
          code: iconProblemCode(found.problem),
          message: t.unusableIcon(use.reference, found.problem.message),
          span,
        });
        break;
      default:
        break;
    }
  }
}

/**
 * Reports `image` paths that leave the project, and, when the host reads binary files, images that
 * do not exist or cannot be used. URLs, absolute paths and backslashes are reported by the model.
 */
function checkImages(
  file: FileCompilation,
  root: string,
  images: ((path: string) => ImageLookup) | undefined,
  report: Reporter,
): void {
  const words = messages();
  const t = words.diagnostics.assets;
  const hints = words.hints.assets;
  for (const diagram of file.compilation.document.diagrams) {
    for (const use of diagram.images) {
      const target = resolveImagePath(root, file.path, use.path);
      const span = toSpan(use.range);
      if (!target.ok) {
        report({
          code: "asset.outside-project",
          message: target.reason,
          span,
          hints: [hints.imagesInside],
        });
        continue;
      }
      const found = images?.(target.path);
      if (!found || found.status === "found" || found.status === "unreadable") continue;
      if (found.status === "missing") {
        report({
          code: "asset.unknown-image",
          message: t.unknownImage(use.path),
          span,
          hints: [hints.lookedFor(relativePath(root, target.path))],
        });
      } else {
        report({
          code: "asset.unsupported-image",
          message: t.unsupportedImage(use.path, found.message),
          span,
          hints: [hints.imageFormats],
        });
      }
    }
  }
}

/**
 * Resolves `link` statements that go through imports: `link <member>.<element>` for a member
 * import of a diagram, `link <namespace>.<diagram>.<element>` for a namespace import.
 */
function checkLinks(file: FileCompilation, report: Reporter): void {
  const words = messages();
  const t = words.diagnostics.references;
  const hints = words.hints.references;
  for (const diagram of file.compilation.document.diagrams) {
    for (const link of diagram.links) {
      // Links to models were checked against the model by compile.
      if (link.target !== null) continue;
      const binding = file.bindings.get(link.binding ?? link.diagram);
      if (!binding || binding.target === null) continue;
      const target = file.program.files.get(binding.target);
      if (!target) continue;
      if (binding.kind === "member" && !target.definitions.has(binding.member ?? "")) continue;
      const fail = (message: string, range: Range, notes?: string[]) =>
        report({ code: "ref.unknown-link", message, span: toSpan(range), hints: notes });
      let id: string;
      // A namespace without a block was reported by compile.
      if (link.binding === null && binding.kind === "namespace") continue;
      if (link.binding !== null) {
        if (binding.kind !== "namespace") {
          fail(t.linkSingleBlock(binding.name), link.range);
          continue;
        }
        id = link.diagram;
      } else {
        if (binding.kind === "namespace") {
          fail(t.linkNamespace(binding.name), link.range);
          continue;
        }
        id = binding.member!;
      }
      const linked = target.compilation.document.diagrams.find((d) => d.id === id);
      const display = relativePath(dirnamePath(file.path), target.path);
      if (!linked) {
        const ids = [
          ...target.compilation.document.diagrams.map((d) => d.id),
          ...target.compilation.document.models.map((m) => m.id),
        ];
        fail(t.linkUnknownDiagram(display, id), link.diagramRange, [hints.linkTargets(ids)]);
        continue;
      }
      if (link.element.includes(".")) {
        const prefix = link.text.slice(0, link.text.length - link.element.length);
        fail(t.linkOneElement(prefix), link.elementRange);
        continue;
      }
      if (!linked.elementsById.has(link.element)) {
        const elements = linked.elements.map((e) => e.id);
        fail(t.linkUnknownElement(id, display, link.element), link.elementRange, [
          hints.elements(id, elements),
        ]);
      }
    }
  }
}

function checkLanguage(file: FileCompilation, manifest: ManifestResult, report: Reporter): void {
  const expected = manifest.manifest?.language;
  const written = file.compilation.document.language;
  if (!expected || written === null || written === expected) return;
  const header = file.compilation.parse.root.items.find((i) => i.kind === "Header");
  if (!header || header.kind !== "Header" || !isToken(header.version)) return;
  const words = messages();
  report({
    code: "project.language-mismatch",
    message: words.diagnostics.manifest.languageMismatch(written, expected),
    span: { start: header.version.start, end: header.version.end },
    hints: [words.hints.manifest.languageHeader(expected)],
  });
}
