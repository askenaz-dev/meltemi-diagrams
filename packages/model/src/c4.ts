import {
  isToken,
  type Arg,
  type DiagnosticBag,
  type DiagramBlock,
  type KeywordStatement,
  type LineIndex,
  type QualifiedRef,
  type RelationStatement,
  type Statement,
  type Token,
} from "@meltemi/diagrams-language";
import { FlowAnalyzer, type Classified, type Mutable } from "./flow.js";
import { messages } from "./messages/index.js";
import { closePaths, isAncestorPath } from "./model.js";
import { C4_LEVELS, C4_PROFILE, PORTS } from "./schema.js";
import { headerHasError, singleIdent } from "./style-values.js";
import type {
  C4Level,
  C4View,
  EntityKind,
  EntityReference,
  EntityReferenceRole,
  FlowDiagram,
  LocalLabel,
  ModelDefinition,
  ModelEntity,
  Relation,
  ResolvedModel,
  RouteEndpoint,
  ViewListEntry,
} from "./types.js";

/** The model a view uses, as compile found it. */
export interface ViewModel {
  /** The name written after `using`. */
  readonly name: string;
  readonly ref: QualifiedRef;
  /** The model, or null when the name does not resolve. */
  readonly resolved: ResolvedModel | null;
  /** True when the name goes through an import that the host did not resolve: stay silent. */
  readonly pending: boolean;
}

/** Analyzes `diagram <id>: c4 using <model> { }` into a view. */
export function analyzeC4View(
  node: DiagramBlock,
  id: Token,
  lines: LineIndex,
  bag: DiagnosticBag,
  model: ViewModel,
): { diagram: FlowDiagram; errors: number } {
  const analyzer = new C4Analyzer(node, id, lines, bag, model);
  return { diagram: analyzer.run(), errors: analyzer.errors };
}

/**
 * The entities a C4 view of a level and scope may draw: persons and systems at the context level;
 * the scope's containers and datastores, persons and other systems at the container level; the
 * scope's components, the other containers of its system, persons and other systems at the
 * component level.
 */
/** The nearest ancestor-or-self of an entity path in a set of paths. */
function liftTo(
  model: ModelDefinition,
  path: string,
  set: ReadonlySet<string>,
): string | undefined {
  let current: string | null = path;
  while (current !== null) {
    if (set.has(current)) return current;
    current = model.entitiesByPath.get(current)?.parent ?? null;
  }
  return undefined;
}

/**
 * The entities a view of this level and scope draws without `include`: every allowed entity at
 * the context level without a scope; else the core (the scope at the context level, its children
 * below) and the allowed entities the model's relations join to it, each end lifted to the
 * nearest allowed ancestor. `allowed` is `allowedEntities` of the same view when given.
 */
export function defaultEntities(
  model: ModelDefinition,
  level: C4Level,
  scopePath: string | null,
  allowed: ReadonlySet<string> = allowedEntities(model, level, scopePath),
): Set<string> {
  const scope = scopePath === null ? null : (model.entitiesByPath.get(scopePath) ?? null);
  if (level === "context" && !scope) return new Set(allowed);
  // Without its scope a container or component view has no core; its error is reported.
  if (!scope) return new Set();
  const core = new Set<string>();
  if (level === "context") core.add(scope.path);
  else
    for (const path of allowed)
      if (model.entitiesByPath.get(path)!.parent === scope.path) core.add(path);
  const set = new Set(core);
  for (const relation of model.relations) {
    const a = liftTo(model, relation.from, allowed);
    const b = liftTo(model, relation.to, allowed);
    if (!a || !b || a === b) continue;
    if (core.has(a)) set.add(b);
    if (core.has(b)) set.add(a);
  }
  return set;
}

export function allowedEntities(
  model: ModelDefinition,
  level: C4Level,
  scopePath: string | null,
): Set<string> {
  const allowed = new Set<string>();
  const scope = scopePath === null ? null : (model.entitiesByPath.get(scopePath) ?? null);
  for (const entity of model.entities) {
    const kind = entity.kind;
    switch (level) {
      case "context":
        if (kind === "person" || kind === "system") allowed.add(entity.path);
        break;
      case "container":
        if (kind === "person") allowed.add(entity.path);
        else if (kind === "system" && entity.path !== scope?.path) allowed.add(entity.path);
        else if ((kind === "container" || kind === "datastore") && entity.parent === scope?.path)
          allowed.add(entity.path);
        break;
      case "component": {
        const system = scope?.parent ?? null;
        if (kind === "person") allowed.add(entity.path);
        else if (kind === "system" && entity.path !== system) allowed.add(entity.path);
        else if (
          (kind === "container" || kind === "datastore") &&
          entity.parent === system &&
          entity.path !== scope?.path
        )
          allowed.add(entity.path);
        else if (kind === "component" && entity.parent === scope?.path) allowed.add(entity.path);
        break;
      }
    }
  }
  return allowed;
}

/**
 * The level of the view that opens an entity of a kind: a system opens a container view scoped
 * to it, a container a component view scoped to it; persons, datastores and components open
 * nothing.
 */
export function childLevel(kind: EntityKind): C4Level | null {
  if (kind === "system") return "container";
  if (kind === "container") return "component";
  return null;
}

/**
 * Whether a compiled C4 view is the child view of an entity: it uses the same model (the model's
 * file and id; `owner` is the view's own file, standing for a model resolved in that file), has
 * the level `childLevel` gives the entity's kind, and is scoped to the entity. A context view
 * scoped to a system is not its child view.
 */
export function isChildView(
  view: C4View,
  owner: string | null,
  model: { readonly file: string | null; readonly id: string },
  entity: Pick<ModelEntity, "kind" | "path">,
): boolean {
  const level = childLevel(entity.kind);
  if (level === null || view.level !== level || view.scope !== entity.path) return false;
  const resolved = view.resolved;
  if (!resolved || resolved.definition.id !== model.id) return false;
  return (resolved.file ?? owner) === model.file;
}

/** A token standing for a whole qualified reference: its text is the joined path. */
function wholeToken(ref: QualifiedRef): Token {
  const first = ref.parts[0]!;
  return {
    kind: first.kind,
    text: ref.parts.map((p) => p.text).join("."),
    start: ref.start,
    end: ref.end,
    fullStart: first.fullStart,
    leadingTrivia: first.leadingTrivia,
  };
}

const ENTITY_TYPES: Readonly<Record<string, string>> = {
  person: "person",
  system: "system",
  container: "container",
  datastore: "datastore",
  component: "component",
};

/** The statements of C4 views, as their hint lists them. */
const VIEW_STATEMENTS: readonly string[] = [
  "level",
  "scope",
  "include",
  "exclude",
  "label",
  "direction",
  "layout",
  "routing",
  "theme",
  "title",
  "description",
  "preset",
  "canvas",
  "placement",
  "style",
  "animate",
  "class",
  "rule",
];

class C4Analyzer extends FlowAnalyzer {
  private definition: ModelDefinition | null;
  private level: C4Level = "context";
  private levelToken: Token | undefined;
  private scope: ModelEntity | null = null;
  private readonly labels: LocalLabel[] = [];
  private readonly labelStatements: KeywordStatement[] = [];
  private includes: ViewListEntry[] | null = null;
  private readonly excludes: ViewListEntry[] = [];
  private includeNode: KeywordStatement | null = null;
  private excludeNode: KeywordStatement | null = null;
  private readonly combined: string[] = [];
  /** Tokens of `include` entries by path, which stand for the elements in this file. */
  private readonly includeTokens = new Map<string, Token>();

  constructor(
    node: DiagramBlock,
    id: Token,
    lines: LineIndex,
    bag: DiagnosticBag,
    private readonly model: ViewModel,
  ) {
    super(node, id, lines, bag, C4_PROFILE);
    this.definition = model.resolved?.definition ?? null;
  }

  // ---------------------------------------------------------------- entity references

  private entityRef(token: Token, path: string, role: EntityReferenceRole): void {
    this.entityReferences.push({ token, model: this.model.name, path, role });
  }

  /** The entity a qualified reference names, from the model's root, with a reference per part. */
  private entity(
    ref: QualifiedRef,
    role: EntityReferenceRole,
    report = true,
  ): ModelEntity | undefined {
    const model = this.definition!;
    const path = ref.parts.map((p) => p.text).join(".");
    const entity = model.entitiesByPath.get(path);
    if (!entity) {
      if (report) {
        const close = closePaths(path, model.entitiesByPath.keys());
        const m = messages();
        this.error("ref.unknown-entity", m.diagnostics.common.unknownEntity(path, model.id), ref, {
          data: { candidates: close },
          hints: [close.length > 0 ? m.hints.didYouMean(close) : m.hints.c4.entityPath],
        });
      }
      return undefined;
    }
    ref.parts.forEach((part, i) => {
      this.entityRef(
        part,
        ref.parts
          .slice(0, i + 1)
          .map((p) => p.text)
          .join("."),
        role,
      );
    });
    return entity;
  }

  protected override targetToken(
    arg: Arg | undefined,
    role: "placement" | "style" | "animate",
  ): Token | undefined {
    if (arg?.kind !== "QualifiedRef") return undefined;
    const path = arg.parts.map((p) => p.text).join(".");
    // Relation ids are single words; entity paths may have several parts.
    if (this.elementsById.has(path) && this.definition) this.entity(arg, role, false);
    return arg.parts.length === 1 ? arg.parts[0] : wholeToken(arg);
  }

  protected override readEndpoint(
    ref: QualifiedRef,
  ): { endpoint: RouteEndpoint; token: Token } | undefined {
    // The longest prefix that is an element of the view; one more part is a port.
    for (let n = ref.parts.length; n >= 1; n--) {
      const path = ref.parts
        .slice(0, n)
        .map((p) => p.text)
        .join(".");
      const element = this.elementsById.get(path);
      if (!element) continue;
      const rest = ref.parts.slice(n);
      if (rest.length > 1) break;
      const portToken = rest[0];
      let port = "auto";
      let named = false;
      if (portToken) {
        if ((PORTS as readonly string[]).includes(portToken.text)) port = portToken.text;
        else if (element.ports.some((p) => p.name === portToken.text)) {
          port = portToken.text;
          named = true;
        } else {
          const m = messages();
          this.error(
            "placement.unknown-port",
            m.diagnostics.common.unknownPort(path, portToken.text),
            portToken,
            { hints: [m.hints.c4.ports(PORTS)], data: { ids: [path, portToken.text] } },
          );
          return undefined;
        }
      }
      const partial = { ...ref, parts: ref.parts.slice(0, n) } as QualifiedRef;
      if (this.definition) this.entity(partial, "placement", false);
      return {
        endpoint: { element: path, port, named, explicitPort: portToken !== undefined },
        token: n === 1 ? ref.parts[0]! : wholeToken(partial),
      };
    }
    const m = messages();
    this.error("ref.unknown-element", m.diagnostics.c4.notDrawn(ref.text), ref, {
      hints: [m.hints.c4.routeEnds],
      data: { ids: [ref.text] },
    });
    return undefined;
  }

  protected override resolveElement(
    token: Token,
    statement: "place" | "size",
    stmt: KeywordStatement,
  ): string | undefined {
    if (this.elementsById.has(token.text) || this.relationsByKey.has(token.text)) {
      return super.resolveElement(token, statement, stmt);
    }
    this.error("ref.unknown-element", messages().diagnostics.c4.notDrawn(token.text), token, {
      hints: [this.notDrawnHint(token.text)],
      data: { ids: [token.text] },
    });
    return undefined;
  }

  /** Why a path is not an element of the view, as a hint in the interface language. */
  private notDrawnHint(path: string): string {
    const hints = messages().hints.c4;
    const entity = this.definition?.entitiesByPath.get(path);
    if (!entity) return hints.nameEntity;
    if (this.allowed().has(path)) return hints.include(path);
    return hints.notAtLevel(path, entity.kind, this.level);
  }

  // ---------------------------------------------------------------- levels and sets

  /** The entities a view of this level and scope may draw. */
  private allowed(): Set<string> {
    return allowedEntities(this.definition!, this.level, this.scope?.path ?? null);
  }

  /** The nearest ancestor-or-self of a path in a set. */
  private lift(path: string, set: ReadonlySet<string>): string | undefined {
    return liftTo(this.definition!, path, set);
  }

  /** The default set: everything at context without scope; else the core and its neighbours. */
  private defaults(allowed: ReadonlySet<string>): Set<string> {
    return defaultEntities(this.definition!, this.level, this.scope?.path ?? null, allowed);
  }

  // ---------------------------------------------------------------- statements

  private readLevel(stmt: KeywordStatement): void {
    const word = singleIdent(stmt.args[0]);
    if (
      !word ||
      stmt.args.length > 1 ||
      stmt.block ||
      !(C4_LEVELS as readonly string[]).includes(word.text)
    ) {
      this.error(
        "c4.invalid-level",
        messages().diagnostics.c4.invalidLevel,
        stmt.args[0] ?? stmt.keyword,
      );
      return;
    }
    this.level = word.text as C4Level;
    this.levelToken = stmt.keyword;
  }

  private readList(
    stmt: KeywordStatement,
    which: "include" | "exclude",
    allowed: ReadonlySet<string>,
  ): void {
    const node = which === "include" ? this.includeNode : this.excludeNode;
    if (node) {
      const m = messages();
      this.error("prop.duplicate", m.diagnostics.c4.listTwice(which), stmt.keyword, {
        related: [{ message: m.related.firstWritten, at: node.keyword }],
      });
      return;
    }
    if (which === "include") this.includeNode = stmt;
    else this.excludeNode = stmt;
    if (stmt.block || stmt.chain || stmt.args.length === 0) {
      this.invalid(
        messages().diagnostics.c4.listShape(which),
        stmt.block ?? stmt.chain ?? stmt.keyword,
      );
      return;
    }
    const entries: ViewListEntry[] = [];
    const seen = new Set<string>();
    for (const arg of stmt.args) {
      if (arg.kind !== "QualifiedRef") {
        this.invalid(messages().diagnostics.c4.listByPath(which), arg);
        continue;
      }
      const entity = this.entity(arg, which);
      if (!entity) continue;
      if (seen.has(entity.path)) {
        this.invalid(messages().diagnostics.c4.listedTwice(entity.path, which), arg);
        continue;
      }
      seen.add(entity.path);
      if (which === "include" && !allowed.has(entity.path)) {
        const boundary = entity.path === this.scope?.path;
        const m = messages();
        this.error(
          "c4.out-of-level",
          boundary
            ? m.diagnostics.c4.scopeIncluded(entity.path, this.level)
            : m.diagnostics.c4.outOfLevel(this.level, entity.kind, entity.path),
          arg,
          { hints: [boundary ? m.hints.c4.removeScope(entity.path) : this.levelHint()] },
        );
        continue;
      }
      entries.push({ path: entity.path, range: this.range(arg) });
      if (which === "include") {
        this.includeTokens.set(
          entity.path,
          arg.parts.length === 1 ? arg.parts[0]! : wholeToken(arg),
        );
      }
    }
    if (which === "include") this.includes = entries;
    else this.excludes.push(...entries);
  }

  /** What a view of this level draws, as a hint in the interface language. */
  private levelHint(): string {
    const hints = messages().hints.c4;
    const scope = this.scope?.path ?? null;
    switch (this.level) {
      case "context":
        return hints.contextLevel;
      case "container":
        return hints.containerLevel(scope);
      case "component":
        return hints.componentLevel(scope);
    }
  }

  // ---------------------------------------------------------------- run

  override run(): FlowDiagram {
    const block = this.node.block.kind === "Block" ? this.node.block : undefined;
    const statements = block?.statements ?? [];
    const properties: KeywordStatement[] = [];
    const blocks: KeywordStatement[] = [];
    const lists: KeywordStatement[] = [];
    const relationStatements: RelationStatement[] = [];
    let scopeStmt: KeywordStatement | undefined;
    let levelStmt: KeywordStatement | undefined;
    for (const stmt of statements) {
      if (stmt.kind === "Error" || headerHasError(stmt)) continue;
      if (stmt.kind === "RelationStatement") {
        relationStatements.push(stmt);
        continue;
      }
      if (stmt.kind === "ShorthandDeclaration") {
        const m = messages();
        this.error("prop.unknown", m.diagnostics.c4.viewDeclares, stmt.id, {
          hints: [m.hints.c4.declareInModel(stmt.id.text, this.model.name)],
        });
        continue;
      }
      const keyword = stmt.keyword.text;
      if (keyword === "level") {
        if (levelStmt) {
          this.error(
            "prop.duplicate",
            messages().diagnostics.common.setMoreThanOnce("level"),
            stmt.keyword,
          );
        } else levelStmt = stmt;
      } else if (keyword === "scope") {
        if (scopeStmt) {
          this.error(
            "prop.duplicate",
            messages().diagnostics.common.setMoreThanOnce("scope"),
            stmt.keyword,
          );
        } else scopeStmt = stmt;
      } else if (keyword === "include" || keyword === "exclude") lists.push(stmt);
      else if (keyword === "label") this.labelStatements.push(stmt);
      else if (keyword in this.profile.diagramProperties) properties.push(stmt);
      else if (this.profile.diagramBlocks.includes(keyword)) blocks.push(stmt);
      else {
        const m = messages();
        this.error("prop.unknown", m.diagnostics.c4.unknownInView(keyword), stmt.keyword, {
          data: { candidates: ENTITY_TYPES[keyword] ? [] : VIEW_STATEMENTS },
          hints: [
            ENTITY_TYPES[keyword]
              ? m.hints.c4.entitiesInModel(this.model.name)
              : m.hints.c4.viewStatements,
          ],
        });
      }
    }
    for (const stmt of properties) this.diagramProperty(stmt);
    if (levelStmt) this.readLevel(levelStmt);
    else {
      const m = messages();
      this.error("c4.invalid-level", m.diagnostics.c4.missingLevel, this.node.keyword, {
        hints: [m.hints.c4.addLevel],
      });
    }

    if (this.definition) {
      this.readScope(scopeStmt, levelStmt);
      const allowed = this.allowed();
      for (const stmt of lists)
        this.readList(stmt, stmt.keyword.text as "include" | "exclude", allowed);
      const visible = this.includes
        ? new Set(this.includes.map((e) => e.path))
        : this.defaults(allowed);
      for (const entry of this.excludes) visible.delete(entry.path);
      this.buildElements(visible);
      this.buildRelations(relationStatements);
      this.readLabels();
    }
    // Placement and styles name the elements and relations built above; a view of a model that
    // is not resolved has none, and stays silent.
    for (const stmt of blocks) {
      const keyword = stmt.keyword.text;
      if (!this.definition && keyword !== "class" && keyword !== "rule") continue;
      if (keyword === "placement") this.placementBlock(stmt);
      else if (keyword === "class") this.definitions.addClass(stmt);
      else if (keyword === "rule") this.definitions.addRule(stmt);
      else this.styleOrAnimate(stmt, keyword as "style" | "animate");
    }

    const base = this.diagram(block);
    return {
      ...base,
      c4: {
        model: this.model.name,
        modelRange: this.range(this.model.ref),
        resolved: this.model.resolved,
        level: this.level,
        scope: this.scope?.path ?? null,
        includes: this.includes,
        excludes: this.excludes,
        includeNode: this.includeNode,
        excludeNode: this.excludeNode,
        labels: this.labels,
        combined: this.combined,
      },
      // A view of a model that is not resolved draws nothing; the project reports its import.
      hasErrors: base.hasErrors || this.definition === null,
    };
  }

  /** The diagram the base analyser would return, from the state built here. */
  private diagram(block: FlowDiagram["block"]): FlowDiagram {
    return {
      type: "c4",
      id: this.id.text,
      range: this.range(this.node),
      idRange: this.range(this.id),
      node: this.node,
      block,
      properties: { ...this.properties, layers: [...this.properties.layers] },
      elements: this.elements,
      relations: this.relations,
      placement: this.placement,
      constraints: this.constraints,
      styles: this.styles,
      animations: this.animations,
      classes: this.definitions.classes,
      rules: this.definitions.rules,
      icons: [...this.icons, ...this.definitions.icons].sort(
        (a, b) => a.range.start.offset - b.range.start.offset,
      ),
      images: [],
      links: [],
      layerRanges: this.layerRanges,
      events: [],
      eventsByKey: new Map(),
      scenarios: [],
      references: this.references,
      c4: null,
      entityReferences: this.entityReferences,
      placementBlocks: this.placementBlocks,
      elementsById: this.elementsById,
      relationsByKey: this.relationsByKey,
      definition: null,
      hasSyntaxErrors: this.node.hasError,
      hasErrors: this.node.hasError || this.errors > 0,
    };
  }

  private readScope(
    stmt: KeywordStatement | undefined,
    levelStmt: KeywordStatement | undefined,
  ): void {
    if (!stmt) {
      if (this.level !== "context" && levelStmt && this.levelToken) {
        const m = messages();
        this.error("c4.scope-required", m.diagnostics.c4.scopeRequired(this.level), levelStmt, {
          hints: [this.level === "container" ? m.hints.c4.systemScope : m.hints.c4.containerScope],
        });
      }
      return;
    }
    const [arg, extra] = stmt.args;
    if (arg?.kind !== "QualifiedRef" || extra || stmt.block) {
      this.invalid(messages().diagnostics.c4.scopeShape, extra ?? arg ?? stmt.keyword);
      return;
    }
    const entity = this.entity(arg, "scope");
    if (!entity) return;
    const expected = this.level === "component" ? "container" : "system";
    if (entity.kind !== expected) {
      const m = messages().diagnostics.c4;
      this.error(
        "c4.invalid-scope",
        entity.kind === "datastore" && this.level === "component"
          ? m.datastoreScope(entity.path)
          : m.invalidScope(this.level, expected, entity.path, entity.kind),
        arg,
      );
      return;
    }
    this.scope = entity;
  }

  /** The token that stands for an element in this file. */
  private tokenFor(entity: ModelEntity): Token {
    const included = this.includeTokens.get(entity.path);
    if (included) return included;
    if (this.model.resolved?.file === null) return entity.idToken;
    return wholeToken(this.model.ref);
  }

  private buildElements(visible: ReadonlySet<string>): void {
    const model = this.definition!;
    const scope = this.scope;
    const boundary =
      scope !== null &&
      this.level !== "context" &&
      [...visible].some((p) => model.entitiesByPath.get(p)!.parent === scope.path);
    const local = this.model.resolved?.file === null;
    const add = (entity: ModelEntity, kind: string, groupPath: string[]) => {
      const token = this.tokenFor(entity);
      const inFile = this.includeTokens.has(entity.path) || local;
      this.addElement({
        id: entity.path,
        kind: kind as ModelEntity["kind"],
        label: entity.label,
        implicit: false,
        description: entity.description,
        url: entity.url,
        classes: [],
        ports: [],
        layer: null,
        layerRange: null,
        link: null,
        source: null,
        sourceRange: null,
        labelWritten: true,
        entity: { model: model.id, path: entity.path, file: this.model.resolved?.file ?? null },
        technology: entity.technology,
        external: entity.external,
        shape: null,
        line: null,
        typeKind: null,
        data: {},
        groupPath,
        range:
          inFile && this.includeTokens.has(entity.path)
            ? this.range(token)
            : local
              ? entity.range
              : this.range(token),
        idRange: this.range(token),
        idToken: token,
        node: undefined,
      });
      if (this.includeTokens.has(entity.path)) {
        this.reference(token, entity.path, "element", "declaration", this.includeNode!);
      }
    };
    if (boundary) add(scope!, "group", []);
    for (const entity of model.entities) {
      if (!visible.has(entity.path) || (boundary && entity.path === scope!.path)) continue;
      add(entity, entity.kind, boundary && entity.parent === scope!.path ? [scope!.path] : []);
    }
  }

  private buildRelations(statements: readonly RelationStatement[]): void {
    const model = this.definition!;
    // The boundary stands for its children; relations land on drawn entities only.
    const visible = new Set(this.elements.filter((e) => e.kind !== "group").map((e) => e.id));
    // Explicit combinations first: they claim their pairs.
    const claims = new Map<string, Mutable<Relation>>();
    const ids = new Map<string, Token>();
    for (const stmt of statements) {
      if (stmt.target.kind !== "QualifiedRef") continue;
      // A view draws its relations one way, with a head: `->` and `-->` only.
      if (this.profile.arrows[stmt.arrow.text] === undefined) {
        this.invalid(
          messages().diagnostics.flow.arrowUnavailable(
            stmt.arrow.text,
            Object.keys(this.profile.arrows),
          ),
          stmt.arrow,
        );
      }
      const ends: string[] = [];
      for (const ref of [stmt.source, stmt.target]) {
        const path = ref.parts.map((p) => p.text).join(".");
        if (!visible.has(path)) {
          this.error("ref.unknown-element", messages().diagnostics.c4.notDrawn(path), ref, {
            hints: [this.notDrawnHint(path)],
            data: { ids: [path] },
          });
          continue;
        }
        this.entity(ref, "relation", false);
        this.reference(
          ref.parts.length === 1 ? ref.parts[0]! : wholeToken(ref),
          path,
          "element",
          "relation-endpoint",
          stmt,
        );
        ends.push(path);
      }
      if (ends.length !== 2) continue;
      const [from, to] = ends as [string, string];
      const pair = `${from}->${to}`;
      if (claims.has(pair)) {
        this.invalid(messages().diagnostics.c4.alreadyCombined(from, to), stmt);
        continue;
      }
      const idToken = stmt.id && isToken(stmt.id) ? stmt.id : undefined;
      let id: string | null = null;
      if (idToken) {
        if (ids.has(idToken.text) || model.relationsByKey.has(idToken.text)) {
          this.error(
            "ref.duplicate-id",
            messages().diagnostics.c4.relationIdUsed(idToken.text),
            idToken,
          );
        } else {
          ids.set(idToken.text, idToken);
          id = idToken.text;
        }
      }
      const { description, values } = this.elementBlock(
        stmt.block,
        this.profile.relationProperties,
        "Relation",
        undefined,
      );
      const relation: Mutable<Relation> = {
        key: "",
        id,
        from,
        to,
        line: "solid",
        heads: "end",
        twoWay: false,
        async: false,
        technology: typeof values.technology === "string" ? values.technology : null,
        sources: [],
        derived: true,
        label: stmt.label && isToken(stmt.label) ? String(stmt.label.value ?? "") : null,
        description,
        assumption: typeof values.assumption === "string" ? values.assumption : null,
        data: {},
        classes: [],
        layer: null,
        layerRange: null,
        groupPath: [],
        range: this.range(stmt),
        idRange: id !== null && idToken ? this.range(idToken) : null,
        node: stmt,
      };
      claims.set(pair, relation);
      if (id !== null && idToken) this.reference(idToken, id, "relation", "relation-id", stmt);
    }

    const local = this.model.resolved?.file === null;
    const usingRange = this.range(this.model.ref);
    for (const relation of model.relations) {
      const a = this.lift(relation.from, visible);
      const b = this.lift(relation.to, visible);
      if (!a || !b || a === b) continue;
      const claim = claims.get(`${a}->${b}`);
      if (claim) {
        (claim.sources as string[]).push(relation.key);
        continue;
      }
      this.relations.push({
        key: relation.key,
        id: relation.id,
        from: a,
        to: b,
        line: "solid",
        heads: "end",
        twoWay: false,
        async: false,
        technology: relation.technology,
        sources: [relation.key],
        derived: a !== relation.from || b !== relation.to,
        label: relation.label,
        description: relation.description,
        assumption: relation.assumption,
        data: {},
        classes: [],
        layer: null,
        layerRange: null,
        groupPath: [],
        range: local ? relation.range : usingRange,
        idRange: local ? relation.idRange : null,
        node: relation.node,
      });
    }
    const counts = new Map<string, number>();
    for (const [pair, claim] of claims) {
      if (claim.sources.length === 0) {
        const m = messages();
        this.error(
          "c4.unsupported-relation",
          m.diagnostics.c4.unsupportedRelation(claim.from, claim.to),
          claim.node,
          { hints: [m.hints.c4.addToModel] },
        );
        if (claim.id) this.brokenRelationIds.add(claim.id);
        continue;
      }
      const n = (counts.get(pair) ?? 0) + 1;
      counts.set(pair, n);
      claim.key = claim.id ?? `${pair}#${n}`;
      // A relation that only combines assumptions is one itself.
      if (claim.assumption === null) {
        const combined = claim.sources.map(
          (key) => model.relationsByKey.get(key)?.assumption ?? null,
        );
        if (combined.every((a) => a !== null)) claim.assumption = combined[0] ?? null;
      }
      this.relations.push(claim);
      this.combined.push(claim.key);
    }
    for (const relation of this.relations) {
      if (!this.relationsByKey.has(relation.key)) this.relationsByKey.set(relation.key, relation);
    }
  }

  private readLabels(): void {
    const seen = new Map<string, Token>();
    for (const stmt of this.labelStatements) {
      const [target, text, extra] = stmt.args;
      if (
        target?.kind !== "QualifiedRef" ||
        text?.kind !== "StringLiteral" ||
        extra ||
        stmt.block
      ) {
        this.invalid(messages().diagnostics.c4.labelShape, extra ?? text ?? target ?? stmt.keyword);
        continue;
      }
      const path = target.parts.map((p) => p.text).join(".");
      const token = target.parts.length === 1 ? target.parts[0]! : wholeToken(target);
      const element = this.elementsById.get(path);
      const relation = element ? undefined : this.relationsByKey.get(path);
      if (!element && !relation) {
        const known =
          this.definition!.entitiesByPath.has(path) || this.definition!.relationsByKey.has(path);
        this.error(
          known && this.definition!.relationsByKey.has(path)
            ? "ref.unknown-relation"
            : "ref.unknown-element",
          messages().diagnostics.c4.notDrawn(path),
          target,
          {
            data: { ids: [path] },
            hints: [
              this.definition!.entitiesByPath.has(path)
                ? this.notDrawnHint(path)
                : messages().hints.c4.localLabel,
            ],
          },
        );
        continue;
      }
      const first = seen.get(path);
      if (first) {
        const m = messages();
        this.error("prop.duplicate", m.diagnostics.c4.labelTwice(path), stmt.keyword, {
          related: [{ message: m.related.firstSet, at: first }],
        });
        continue;
      }
      seen.set(path, stmt.keyword);
      if (element) {
        this.entity(target, "label", false);
        this.reference(token, path, "element", "label", stmt);
        const index = this.elements.indexOf(element);
        const updated = { ...element, label: text.value };
        this.elements[index] = updated;
        this.elementsById.set(path, updated);
      } else {
        this.reference(token, relation!.key, "relation", "label", stmt);
        (relation as Mutable<Relation>).label = text.value;
      }
      this.labels.push({
        target: path,
        targetKind: element ? "element" : "relation",
        text: text.value,
        range: this.range(stmt),
        targetRange: this.range(target),
        node: stmt,
      });
    }
  }

  protected override classify(
    _statements: readonly Statement[],
    _groupPath: string[],
    _context: "diagram" | "group",
    _out: Classified,
  ): void {}
}

export type { EntityReference };
export { isAncestorPath };
