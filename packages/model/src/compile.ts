import {
  DiagnosticBag,
  LANGUAGE_VERSION,
  LineIndex,
  createDiagnostic,
  hasErrors,
  isToken,
  parse,
  sortDiagnostics,
  type DiagramBlock,
  type ExportBlock,
  type ImportStatement,
  type QualifiedRef,
  type StoryBlock,
  type Token,
} from "@meltemi/diagrams-language";
import { analyzeC4View, type ViewModel } from "./c4.js";
import { analyzeFlowDiagram } from "./flow.js";
import { messages } from "./messages/index.js";
import { analyzeModel, closePaths } from "./model.js";
import { analyzeSequenceDiagram } from "./sequence.js";
import { analyzeStory, type StoryResolver } from "./story.js";
import { spanOf } from "./style-values.js";
import { analyzeExport, type ExportResolver } from "./export.js";
import { DIAGRAM_TYPES } from "./schema.js";
import { analyzeThemeBlock, checkThemeBases } from "./theme-block.js";
import type {
  Compilation,
  CompileOptions,
  Element,
  ElementLink,
  EntityReference,
  ExportProfile,
  ImportBinding,
  ImportDeclaration,
  FlowDiagram,
  ModelDefinition,
  ResolvedModel,
  StoryDefinition,
  ThemeDefinition,
  UnsupportedBlock,
} from "./types.js";

/**
 * Compiles `.meltemi` text into a typed document. Pure: the text is never modified and nothing is
 * thrown for user input. Errors in one diagram do not prevent other diagrams from compiling.
 * `options.models` resolves models named through imports, for C4 views and links.
 */
export function compile(text: string, options: CompileOptions = {}): Compilation {
  // Untrusted repositories cannot make a host parse without bound (decision 0030).
  if (text.length > SOURCE_LIMITS.characters) return tooLarge(text, options);
  const parsed = parse(text);
  const lines = parsed.lines;
  const bag = new DiagnosticBag(lines);
  const diagrams: FlowDiagram[] = [];
  const themes: ThemeDefinition[] = [];
  const models: ModelDefinition[] = [];
  const views: { node: DiagramBlock; id: Token; unique: boolean }[] = [];
  const storyBlocks: { node: StoryBlock; id: Token; unique: boolean }[] = [];
  const exportBlocks: { node: ExportBlock; id: Token; unique: boolean }[] = [];
  const unsupported: UnsupportedBlock[] = [];
  const imports: ImportDeclaration[] = [];
  const topLevelIds = new Map<string, Token>();
  let language: string | null = null;
  let seenBlock = false;

  const claimId = (token: Token): boolean => {
    const first = topLevelIds.get(token.text);
    if (first) {
      const m = messages();
      bag.add({
        code: "ref.duplicate-id",
        message: m.diagnostics.compile.duplicateTopLevelId(token.text),
        span: spanOf(token),
        related: [{ message: m.related.firstUsed, span: spanOf(first) }],
      });
      return false;
    }
    topLevelIds.set(token.text, token);
    return true;
  };

  for (const item of parsed.root.items) {
    if (item.kind !== "Header" && item.kind !== "ImportStatement" && item.kind !== "Error") {
      seenBlock = true;
    }
    switch (item.kind) {
      case "ImportStatement": {
        const { declaration, tokens } = importDeclaration(item, lines, seenBlock);
        for (const token of tokens) claimId(token);
        imports.push(declaration);
        break;
      }
      case "Header": {
        if (!isToken(item.version)) break;
        const version = String(item.version.value ?? "");
        if (language === null) language = version;
        if (version !== LANGUAGE_VERSION) {
          const m = messages();
          bag.add({
            code: "language.unsupported-version",
            message: m.diagnostics.compile.unsupportedVersion(version, LANGUAGE_VERSION),
            span: spanOf(item.version),
            hints: [m.hints.compile.version(LANGUAGE_VERSION)],
          });
        }
        break;
      }
      case "DiagramBlock": {
        if (!isToken(item.id) || !item.type || !isToken(item.type)) break;
        const unique = claimId(item.id);
        const type = item.type.text;
        const declared = options.types?.find((t) => t.type === type);
        if (declared) {
          const { diagram } = analyzeFlowDiagram(item, item.id, lines, bag, "free", declared);
          diagrams.push(unique ? diagram : { ...diagram, hasErrors: true });
          break;
        }
        if (type === "flow" || type === "free" || type === "sequence") {
          const { diagram } =
            type === "sequence"
              ? analyzeSequenceDiagram(item, item.id, lines, bag)
              : analyzeFlowDiagram(item, item.id, lines, bag, type);
          diagrams.push(unique ? diagram : { ...diagram, hasErrors: true });
          break;
        }
        if (type === "c4") {
          // Views compile once every model of the file is known.
          views.push({ node: item, id: item.id, unique });
          break;
        }
        bag.add({
          code: "profile.unknown",
          message: messages().diagnostics.compile.unknownDiagramType(type, [
            ...DIAGRAM_TYPES,
            ...(options.types ?? []).map((t) => t.type),
          ]),
          span: spanOf(item.type),
        });
        unsupported.push({
          kind: "diagram",
          profile: type,
          id: item.id.text,
          range: lines.range(spanOf(item)),
          node: item,
        });
        break;
      }
      case "ThemeBlock": {
        if (!isToken(item.id)) break;
        const unique = claimId(item.id);
        const theme = analyzeThemeBlock(item, item.id, lines, bag);
        if (unique) themes.push(theme);
        break;
      }
      case "ModelBlock": {
        if (!isToken(item.id)) break;
        const unique = claimId(item.id);
        const model = analyzeModel(item, item.id, lines, bag);
        if (unique) models.push(model);
        break;
      }
      case "StoryBlock": {
        // Stories compile once every diagram of the file is known.
        if (isToken(item.id))
          storyBlocks.push({ node: item, id: item.id, unique: claimId(item.id) });
        break;
      }
      case "ExportBlock": {
        // Profiles compile once every diagram and story of the file is known.
        if (isToken(item.id))
          exportBlocks.push({ node: item, id: item.id, unique: claimId(item.id) });
        break;
      }
      case "Error":
        break;
    }
  }
  const bindings = new Set(imports.flatMap((i) => i.bindings.map((b) => b.name)));
  const namespaces = new Set(
    imports.filter((i) => i.form === "namespace").flatMap((i) => i.bindings.map((b) => b.name)),
  );
  const resolveModel = (name: string): ResolvedModel | undefined => {
    const local = models.find((m) => m.id === name);
    if (local) return { definition: local, file: null };
    return options.models?.(name);
  };
  for (const view of views) {
    const ref = view.node.usingRef;
    if (ref?.kind !== "QualifiedRef") {
      bag.add({
        code: "ref.unknown-model",
        message: messages().diagnostics.compile.viewWithoutModel,
        span: spanOf(view.node.type as Token),
        hints: modelHints(models, namespaces, bindings),
        data: { candidates: modelNames(models, namespaces, bindings) },
      });
      continue;
    }
    const name = ref.parts.map((p) => p.text).join(".");
    const resolved = resolveModel(name) ?? null;
    const pending = resolved === null && bindings.has(ref.parts[0]!.text);
    if (resolved === null && !pending) {
      bag.add({
        code: "ref.unknown-model",
        message: messages().diagnostics.compile.unknownModel(name),
        span: spanOf(ref),
        hints: modelHints(models, namespaces, bindings),
        data: { candidates: modelNames(models, namespaces, bindings) },
      });
    }
    const model: ViewModel = { name, ref, resolved, pending };
    const { diagram } = analyzeC4View(view.node, view.id, lines, bag, model);
    diagrams.push(view.unique ? diagram : { ...diagram, hasErrors: true });
  }
  diagrams.sort((a, b) => a.node.start - b.node.start);
  checkThemeBases(themes, bag, bindings);
  const linked = resolveLinks(diagrams, models, bindings, namespaces, options, bag);

  const stories: StoryDefinition[] = [];
  const resolver: StoryResolver = {
    resolve: (name) => {
      const local = linked.find((d) => d.id === name);
      if (local) return { diagram: local, file: null };
      return options.diagrams?.(name);
    },
    pending: (name) => bindings.has(name.split(".")[0]!) && options.diagrams === undefined,
    names: () => [...linked.map((d) => d.id), ...bindings],
  };
  for (const story of storyBlocks) {
    const definition = analyzeStory(story.node, story.id, lines, bag, resolver);
    if (story.unique) stories.push(definition);
  }

  const exports: ExportProfile[] = [];
  const exportResolver: ExportResolver = {
    diagram: resolver.resolve,
    story: (name) => stories.find((s) => s.id === name),
    pending: resolver.pending,
    names: () => [...resolver.names(), ...stories.map((s) => s.id)],
  };
  for (const profile of exportBlocks) {
    const definition = analyzeExport(profile.node, profile.id, lines, bag, exportResolver);
    if (profile.unique) exports.push(definition);
  }

  // Diagrams too large to lay out and draw safely are reported and left undrawn.
  const bounded = linked.map((diagram) => {
    const counts = [
      [diagram.elements.length, SOURCE_LIMITS.elements, "elements"],
      [diagram.relations.length, SOURCE_LIMITS.relations, "relations"],
      [diagram.eventsByKey.size, SOURCE_LIMITS.events, "events"],
    ] as const;
    const over = counts.find(([count, limit]) => count > limit);
    if (!over) return diagram;
    const m = messages();
    bag.add({
      code: "limit.too-complex",
      message: m.diagnostics.compile.tooComplex(diagram.id, over[0], over[2], over[1]),
      span: spanOf(diagram.node.id),
      hints: [m.hints.compile.splitDiagram],
    });
    return { ...diagram, hasErrors: true };
  });

  const diagnostics = sortDiagnostics([...parsed.diagnostics, ...bag.items]);
  return {
    text,
    options,
    parse: parsed,
    diagnostics,
    document: {
      language,
      imports,
      diagrams: bounded,
      themes,
      models,
      stories,
      exports,
      unsupported,
    },
    ok: !hasErrors(diagnostics),
  };
}

/** The models a view may name: the file's and the imported ones. */
function modelNames(
  models: readonly ModelDefinition[],
  namespaces: ReadonlySet<string>,
  bindings: ReadonlySet<string>,
): string[] {
  return [...models.map((m) => m.id), ...[...bindings].filter((b) => !namespaces.has(b))];
}

/** Hints naming the models a view can use, in the interface language. */
function modelHints(
  models: readonly ModelDefinition[],
  namespaces: ReadonlySet<string>,
  bindings: ReadonlySet<string>,
): string[] {
  const hints = messages().hints.compile;
  const names = models.map((m) => m.id);
  const imported = [...bindings].filter((b) => !namespaces.has(b));
  if (names.length === 0 && imported.length === 0 && namespaces.size === 0) {
    return [hints.declareModel];
  }
  return [hints.models(names, imported, [...namespaces])];
}

/**
 * Resolves the `link` statements: to an element of another diagram of the file, to an entity of a
 * model of the file or of an imported model the host resolves; links through other imports are
 * left to the project. Elements without a label of their own take a linked entity's label.
 * Returns the diagrams, marking those with broken links as having errors.
 */
function resolveLinks(
  diagrams: readonly FlowDiagram[],
  models: readonly ModelDefinition[],
  bindings: ReadonlySet<string>,
  namespaces: ReadonlySet<string>,
  options: CompileOptions,
  bag: DiagnosticBag,
): FlowDiagram[] {
  const byId = new Map(diagrams.map((d) => [d.id, d]));
  const modelsById = new Map(models.map((m) => [m.id, m]));
  return diagrams.map((diagram) => {
    if (diagram.links.length === 0) return diagram;
    let broken = false;
    const links: ElementLink[] = [];
    const references: EntityReference[] = [...diagram.entityReferences];
    const labels = new Map<string, string>();
    const fail = (message: string, at: ElementLink["range"], hints?: string[]) => {
      broken = true;
      bag.add({
        code: "ref.unknown-link",
        message,
        span: rangeSpan(at),
        ...(hints ? { hints } : {}),
      });
    };
    for (const link of diagram.links) {
      const ref = link.node.args[0] as QualifiedRef;
      const parts = ref.parts;
      const first = parts[0]!.text;
      // A model of the file, or an imported one the host resolves.
      const modelLink = (
        name: string,
        definition: ModelDefinition,
        from: number,
        resolved: Pick<ElementLink, "binding" | "diagram">,
      ): void => {
        const path = parts
          .slice(from)
          .map((p) => p.text)
          .join(".");
        const updated: ElementLink = {
          ...link,
          ...resolved,
          element: path,
          target: "model",
          elementRange: elementRange(link, parts, from),
        };
        links.push(updated);
        const entity = definition.entitiesByPath.get(path);
        if (path === "" || !entity) {
          const close = closePaths(path, definition.entitiesByPath.keys());
          const m = messages();
          fail(
            path === ""
              ? m.diagnostics.compile.linkNamesModel(link.text)
              : m.diagnostics.compile.linkUnknownEntity(name, path),
            path === "" ? link.range : updated.elementRange,
            close.length > 0 ? [m.hints.didYouMean(close)] : undefined,
          );
          return;
        }
        parts.slice(from).forEach((part, i) => {
          references.push({
            token: part,
            model: name,
            path: parts
              .slice(from, from + i + 1)
              .map((p) => p.text)
              .join("."),
            role: "link",
          });
        });
        const owner = diagram.elementsById.get(link.owner);
        if (owner && !owner.labelWritten) labels.set(owner.id, entity.label);
      };
      const local = byId.get(first);
      const localModel = modelsById.get(first);
      if (local) {
        links.push({ ...link, target: "diagram" });
        const m = messages();
        if (parts.length !== 2) {
          fail(m.diagnostics.compile.linkDiagramShape(first), link.range);
        } else if (local === diagram) {
          fail(m.diagnostics.compile.linkToItself(link.text), link.diagramRange);
        } else if (!local.elementsById.has(link.element)) {
          fail(m.diagnostics.compile.linkUnknownElement(first, link.element), link.elementRange, [
            m.hints.compile.elementsOf(
              first,
              local.elements.map((e) => e.id),
            ),
          ]);
        }
      } else if (localModel) {
        modelLink(first, localModel, 1, { binding: null, diagram: first });
      } else if (namespaces.has(first)) {
        if (parts.length < 3) {
          links.push(link);
          fail(messages().diagnostics.compile.linkNamespace(first), link.range);
          continue;
        }
        const block = parts[1]!.text;
        const resolved = options.models?.(`${first}.${block}`);
        const fields = { binding: first, diagram: block, diagramRange: rangeOf(link, parts[1]!) };
        if (resolved) modelLink(`${first}.${block}`, resolved.definition, 2, fields);
        else {
          links.push({
            ...link,
            ...fields,
            element: parts
              .slice(2)
              .map((p) => p.text)
              .join("."),
            elementRange: elementRange(link, parts, 2),
          });
        }
      } else if (bindings.has(first)) {
        const resolved = options.models?.(first);
        if (resolved) modelLink(first, resolved.definition, 1, { binding: null, diagram: first });
        else links.push(link);
      } else {
        links.push(link);
        const names = [...byId.keys()].filter((id) => id !== diagram.id);
        const m = messages();
        fail(m.diagnostics.compile.linkUnknownTarget(first, link.text), link.diagramRange, [
          names.length > 0 || models.length > 0
            ? m.hints.compile.diagramsAndModels([...names, ...models.map((model) => model.id)])
            : m.hints.compile.linkTargets,
        ]);
      }
    }
    // Elements carry their resolved link, and a linked entity's label when they have none.
    const resolvedLinks = new Map(diagram.links.map((link, i) => [link, links[i]!]));
    const elements = diagram.elements.map((e): Element => {
      const link = e.link ? (resolvedLinks.get(e.link) ?? e.link) : null;
      const label = labels.get(e.id) ?? e.label;
      return link === e.link && label === e.label ? e : { ...e, link, label };
    });
    const elementsById = new Map(elements.map((e) => [e.id, e]));
    return {
      ...diagram,
      links,
      entityReferences: references,
      elements,
      elementsById,
      ...(broken ? { hasErrors: true } : {}),
    };
  });
}

/** The range of one part of a link's reference. */
function rangeOf(link: ElementLink, part: Token): ElementLink["range"] {
  const delta = part.start - (link.node.args[0] as QualifiedRef).start;
  return shift(link.range, delta, part.end - part.start);
}

/** The range from part `from` to the end of the reference. */
function elementRange(
  link: ElementLink,
  parts: readonly Token[],
  from: number,
): ElementLink["range"] {
  const ref = link.node.args[0] as QualifiedRef;
  const start = parts[from]?.start ?? ref.end;
  return shift(link.range, start - ref.start, ref.end - start);
}

/** A range within a single-line reference, moved by `delta` characters and `length` long. */
function shift(range: ElementLink["range"], delta: number, length: number): ElementLink["range"] {
  const start = {
    offset: range.start.offset + delta,
    line: range.start.line,
    column: range.start.column + delta,
  };
  return {
    start,
    end: { offset: start.offset + length, line: start.line, column: start.column + length },
  };
}

function rangeSpan(range: { start: { offset: number }; end: { offset: number } }): {
  start: number;
  end: number;
} {
  return { start: range.start.offset, end: range.end.offset };
}

/** The declaration of an `import` statement and the tokens that bind its names. */
function importDeclaration(
  node: ImportStatement,
  lines: LineIndex,
  afterBlock: boolean,
): { declaration: ImportDeclaration; tokens: Token[] } {
  const range = (token: Token) => lines.range(spanOf(token));
  const bindings: ImportBinding[] = [];
  const tokens: Token[] = [];
  if (node.form === "namespace") {
    if (isToken(node.namespace)) {
      tokens.push(node.namespace);
      bindings.push({
        name: node.namespace.text,
        member: null,
        range: range(node.namespace),
        memberRange: null,
      });
    }
  } else {
    for (const member of node.members) {
      const bound = isToken(member.alias) ? member.alias : member.id;
      tokens.push(bound);
      bindings.push({
        name: bound.text,
        member: member.id.text,
        range: range(bound),
        memberRange: range(member.id),
      });
    }
  }
  const declaration: ImportDeclaration = {
    form: node.form,
    path: isToken(node.path) ? String(node.path.value ?? "") : null,
    pathRange: isToken(node.path) ? range(node.path) : null,
    bindings,
    range: lines.range(spanOf(node)),
    afterBlock,
    node,
  };
  return { declaration, tokens };
}

/**
 * Bounds of what one source may hold, so that a repository from anywhere cannot exhaust an editor
 * or an automated job (decision 0030).
 */
export const SOURCE_LIMITS = {
  /** Characters of one `.meltemi` file. */
  characters: 2 * 1024 * 1024,
  /** Elements, relations and sequence events of one diagram. */
  elements: 5000,
  relations: 10000,
  events: 10000,
} as const;

/** The compilation of a file too large to read: one diagnostic and an empty document. */
function tooLarge(text: string, options: CompileOptions): Compilation {
  const empty = parse("");
  const lines = new LineIndex(text.slice(0, 1024));
  const m = messages();
  const diagnostic = createDiagnostic(lines, {
    code: "limit.too-large",
    severity: "error",
    message: m.diagnostics.compile.tooLarge(text.length, SOURCE_LIMITS.characters),
    span: { start: 0, end: 0 },
    hints: [m.hints.compile.splitFile],
  });
  return {
    text,
    options,
    parse: { ...empty, text },
    diagnostics: [diagnostic],
    document: {
      language: null,
      imports: [],
      diagrams: [],
      themes: [],
      models: [],
      stories: [],
      exports: [],
      unsupported: [],
    },
    ok: false,
  };
}
