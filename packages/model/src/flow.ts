import {
  isToken,
  type Arg,
  type Block,
  type CstElement,
  type DiagnosticBag,
  type DiagramBlock,
  type KeywordStatement,
  type LineIndex,
  type QualifiedRef,
  type Range,
  type RelationStatement,
  type ShorthandDeclaration,
  type Span,
  type Statement,
  type Token,
} from "@meltemi/diagrams-language";
import {
  DIRECTIONS,
  LAYOUT_MODES,
  ALIGN_EDGES,
  ANIMATION_EFFECT_PROPERTIES,
  AXES,
  ELEMENT_ONLY_PROPERTIES,
  FLOW_PROFILE,
  FREE_PROFILE,
  MAIN_LAYER,
  PORTS,
  PORT_SIDES,
  RELATION_ONLY_PROPERTIES,
  diagramStatements,
  profileTakesShape,
  takesShape,
  profileTakesRotation,
  takesRotation,
  type ProfileSchema,
  type PropertyTable,
  type ValueSpec,
} from "./schema.js";
import {
  relationAllowed,
  type DiagramTypeDefinition,
  type PropertyDefinition,
} from "./diagram-types.js";
import { messages } from "./messages/index.js";
import {
  StyleDefinitions,
  checkArg,
  describeArg,
  headerHasError,
  readClasses,
  readPropertyBlock,
  readStatementValue,
  refuseFreeProperties,
  singleIdent,
  spanOf,
  targetHint,
  type ReportOptions,
  type Value,
} from "./style-values.js";
import type {
  AlignEdge,
  AnimationDirection,
  AnimationEffect,
  AnimationEntry,
  ClassUse,
  ConstraintEntry,
  ConstraintKind,
  DiagramType,
  Direction,
  Element,
  ElementKind,
  ElementLink,
  EntityReference,
  FlowDiagram,
  IconUse,
  ImageUse,
  LayoutMode,
  PlacementEntry,
  Point,
  PortDefinition,
  PortSide,
  Preset,
  Reference,
  ReferenceRole,
  Relation,
  RouteEndpoint,
  SequenceEvent,
  SequenceScenario,
  Routing,
  StyleEntry,
  StyleValue,
  TargetKind,
} from "./types.js";

/** Element kinds drawn without an outline, which a moving dash cannot follow. */
const NO_OUTLINE_KINDS: ReadonlySet<string> = new Set([
  "note",
  "text",
  "icon",
  "image",
  "actor",
  "boundary",
  "control",
  "entity",
]);

export interface Classified {
  declarations: { stmt: ShorthandDeclaration | KeywordStatement; groupPath: string[] }[];
  relations: { stmt: RelationStatement; groupPath: string[] }[];
  properties: KeywordStatement[];
  blocks: KeywordStatement[];
  /** Sequence diagrams: the statements of the event order at the diagram level. */
  events: Statement[];
}

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The `layer`, `link` and `port` statements of an element or relation block. */
interface BlockExtras {
  layer: string | null;
  layerRange: Range | null;
  link: ElementLink | null;
}

/**
 * Analyzes one `diagram <id>: flow { }` or `diagram <id>: free { }` block into a `FlowDiagram`,
 * reporting diagnostics. Same-file links are resolved later by `resolveLinks`.
 */
export function analyzeFlowDiagram(
  node: DiagramBlock,
  id: Token,
  lines: LineIndex,
  bag: DiagnosticBag,
  type: DiagramType = "flow",
  declared: DiagramTypeDefinition | null = null,
): { diagram: FlowDiagram; errors: number } {
  const analyzer = new FlowAnalyzer(
    node,
    id,
    lines,
    bag,
    declared ? declaredProfile(declared) : type === "free" ? FREE_PROFILE : FLOW_PROFILE,
    declared,
  );
  return { diagram: analyzer.run(), errors: analyzer.errors };
}

/** The value spec of a declared property. */
function specOf(property: PropertyDefinition): ValueSpec {
  switch (property.kind) {
    case "string":
      return { kind: "string" };
    case "number":
      return { kind: "number", min: -1e12, max: 1e12 };
    case "boolean":
      return { kind: "enum", values: ["true", "false"] };
    case "enum":
      return { kind: "enum", values: property.values };
  }
}

/** The properties of a declared kind, as a table. */
function tableOf(properties: Readonly<Record<string, PropertyDefinition>>): PropertyTable {
  return Object.fromEntries(Object.entries(properties).map(([name, p]) => [name, specOf(p)]));
}

/**
 * The profile of a declared diagram type: the free profile, whose kinds it adds, with the type's
 * layout defaults and relation properties (decision 0030).
 */
export function declaredProfile(definition: DiagramTypeDefinition): ProfileSchema {
  const kinds = Object.keys(definition.elements);
  return {
    ...FREE_PROFILE,
    diagramProperties: {
      ...FREE_PROFILE.diagramProperties,
      direction: { kind: "enum", values: DIRECTIONS, default: definition.layout.direction },
      layout: { kind: "enum", values: LAYOUT_MODES, default: definition.layout.mode },
    },
    elementKinds: [...FREE_PROFILE.elementKinds, ...kinds],
    relationProperties: {
      ...FREE_PROFILE.relationProperties,
      ...tableOf(definition.relations.properties),
    },
    ruleKinds: [...FREE_PROFILE.ruleKinds, ...kinds],
  };
}

/** The declared values of a block: booleans as booleans. */
function dataOf(
  values: Readonly<Record<string, Value>>,
  properties: Readonly<Record<string, PropertyDefinition>>,
): Record<string, string | number | boolean> {
  const data: Record<string, string | number | boolean> = {};
  for (const [name, property] of Object.entries(properties)) {
    const value = values[name];
    if (value === undefined) continue;
    data[name] = property.kind === "boolean" ? value === "true" : (value as string | number);
  }
  return data;
}

/**
 * What is wrong with a path written as a URL, an absolute path or with backslashes, in the
 * interface language; undefined for a usable path.
 */
function unsafeImagePath(path: string): string | undefined {
  const m = messages().diagnostics.flow;
  if (path.trim() === "") return m.imageEmpty;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) {
    return /^[A-Za-z]:/.test(path) ? m.imageAbsolute(path) : m.imageUrl(path);
  }
  if (path.startsWith("/")) return m.imageAbsolute(path);
  if (path.includes("\\")) return m.imageBackslash(path);
  return undefined;
}

/** The analyser of flow and free diagrams; the sequence analyser extends it. */
export class FlowAnalyzer {
  errors = 0;
  protected readonly elements: Element[] = [];
  protected readonly elementsById = new Map<string, Element>();
  protected readonly relations: Mutable<Relation>[] = [];
  protected readonly relationsByKey = new Map<string, Relation>();
  /** Every `as <id>` written in the diagram, collected before relations are resolved. */
  protected readonly relationIdTokens = new Map<string, Token>();
  /** Ids of relations that could not be built; references to them stay silent. */
  protected readonly brokenRelationIds = new Set<string>();
  protected readonly placement: PlacementEntry[] = [];
  protected readonly constraints: ConstraintEntry[] = [];
  protected readonly styles: StyleEntry[] = [];
  protected readonly icons: IconUse[] = [];
  protected readonly images: ImageUse[] = [];
  protected readonly links: ElementLink[] = [];
  /** Layer names used by blocks, checked once `layers` is read. */
  protected readonly layerUses: { name: string; token: Token }[] = [];
  protected readonly layerRanges = new Map<string, Range>();
  protected readonly animations: AnimationEntry[] = [];
  protected readonly references: Reference[] = [];
  protected readonly entityReferences: EntityReference[] = [];
  protected readonly placementBlocks: KeywordStatement[] = [];
  protected readonly placementSeen = new Map<string, KeywordStatement>();
  protected readonly styleSeen = new Map<string, Token>();
  /** `<target>:<effect>` of every animation, for `animate.conflict`. */
  protected readonly animationSeen = new Map<string, Token>();
  protected readonly properties: {
    direction: Direction;
    layout: LayoutMode;
    theme: string | null;
    title: string | null;
    description: string | null;
    preset: Preset | null;
    canvas: { width: number; height: number } | null;
    routing: Routing;
    layers: string[];
    autonumber: number | null;
  };
  protected readonly definitions: StyleDefinitions;
  protected readonly report = (
    code: string,
    message: string,
    at: CstElement | Span,
    options: ReportOptions = {},
  ): void => this.error(code, message, at, options);

  constructor(
    protected readonly node: DiagramBlock,
    protected readonly id: Token,
    protected readonly lines: LineIndex,
    protected readonly bag: DiagnosticBag,
    protected readonly profile: ProfileSchema,
    /** The definition of a declared type, or null for the built-in profiles. */
    protected readonly declared: DiagramTypeDefinition | null = null,
  ) {
    this.definitions = new StyleDefinitions(lines, this.report, profile);
    const layout = profile.diagramProperties.layout;
    const direction = profile.diagramProperties.direction;
    this.properties = {
      direction: (direction?.kind === "enum" ? direction.default : "LR") as Direction,
      layout: (layout?.kind === "enum" ? layout.default : "auto") as LayoutMode,
      theme: null,
      title: null,
      description: null,
      preset: null,
      canvas: null,
      routing: "auto",
      layers: [MAIN_LAYER],
      autonumber: null,
    };
  }

  /** Sequence diagrams: the ordered events, their index and the scenarios. */
  protected events: SequenceEvent[] = [];
  protected readonly eventsByKey = new Map<string, SequenceEvent>();
  protected readonly scenarios: SequenceScenario[] = [];

  /** Handles a statement of the event order; true when it was one. */
  protected classifyEvent(
    _stmt: Statement,
    _context: "diagram" | "group",
    _out: Classified,
  ): boolean {
    return false;
  }

  /** Runs once relations have keys: sequence diagrams build their events here. */
  protected afterRelations(_classified: Classified): void {}

  /** Reads a placement statement of the profile; true when it was one. */
  protected placementStatement(_stmt: KeywordStatement): boolean {
    return false;
  }

  /** Reads a `scenario` block. */
  protected scenarioBlock(_stmt: KeywordStatement): void {}

  /** Runs after every block was read. */
  protected finish(): void {}

  /**
   * The token that names an element or relation in placement, constraints, styles and
   * animations: one identifier here; C4 views also read qualified entity paths.
   */
  protected targetToken(
    arg: Arg | undefined,
    _role: "placement" | "style" | "animate",
  ): Token | undefined {
    return singleIdent(arg);
  }

  protected get free(): boolean {
    return this.profile.name === "free";
  }

  run(): FlowDiagram {
    const block = this.node.block.kind === "Block" ? this.node.block : undefined;
    const classified: Classified = {
      declarations: [],
      relations: [],
      properties: [],
      blocks: [],
      events: [],
    };
    if (block) this.classify(block.statements, [], "diagram", classified);

    for (const { stmt } of classified.relations) {
      if (stmt.id && isToken(stmt.id) && !this.relationIdTokens.has(stmt.id.text)) {
        this.relationIdTokens.set(stmt.id.text, stmt.id);
      }
    }
    for (const decl of classified.declarations) this.declare(decl.stmt, decl.groupPath);
    for (const rel of classified.relations) this.relation(rel.stmt, rel.groupPath);
    this.assignKeys();
    this.afterRelations(classified);
    for (const stmt of classified.properties) this.diagramProperty(stmt);
    for (const stmt of classified.blocks) {
      const keyword = stmt.keyword.text;
      if (keyword === "placement") this.placementBlock(stmt);
      else if (keyword === "class") this.definitions.addClass(stmt);
      else if (keyword === "rule") this.definitions.addRule(stmt);
      else if (keyword === "scenario") this.scenarioBlock(stmt);
      else this.styleOrAnimate(stmt, keyword as "style" | "animate");
    }
    this.checkLayers();
    this.finish();
    if (this.declared) this.checkDeclared(this.declared);

    this.elements.sort((a, b) => a.idToken.start - b.idToken.start);
    return {
      type: this.profile.name,
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
      images: this.images,
      links: this.links,
      layerRanges: this.layerRanges,
      events: this.events,
      eventsByKey: this.eventsByKey,
      scenarios: this.scenarios,
      references: this.references,
      c4: null,
      entityReferences: this.entityReferences,
      placementBlocks: this.placementBlocks,
      elementsById: this.elementsById,
      relationsByKey: this.relationsByKey,
      definition: this.declared,
      hasSyntaxErrors: this.node.hasError,
      hasErrors: this.node.hasError || this.errors > 0,
    };
  }

  /** A declared type's rules: required properties, and the kinds relations may join. */
  protected checkDeclared(definition: DiagramTypeDefinition): void {
    for (const element of this.elements) {
      const kind = element.typeKind ? definition.elements[element.typeKind] : undefined;
      for (const name of kind?.required ?? []) {
        if (element.data[name] !== undefined) continue;
        const m = messages();
        this.error(
          "type.missing-property",
          m.diagnostics.flow.missingProperty(kind!.label, element.id, name),
          element.idToken,
          {
            hints: [m.hints.flow.requiredProperty(definition.title, name, element.typeKind!)],
          },
        );
      }
    }
    for (const relation of this.relations) {
      const from = this.elementsById.get(relation.from)?.typeKind ?? null;
      const to = this.elementsById.get(relation.to)?.typeKind ?? null;
      if (relationAllowed(definition, from, to)) continue;
      const pairs = (definition.relations.allowed ?? []).map(([a, b]) => `${a} -> ${b}`);
      const m = messages();
      this.error(
        "type.relation-not-allowed",
        m.diagnostics.flow.relationNotAllowed(definition.title, from ?? "box", to ?? "box"),
        relation.node,
        { hints: [m.hints.flow.allowedRelations(pairs)] },
      );
    }
  }

  // ------------------------------------------------------------------ helpers

  protected range(element: CstElement): Range {
    return this.lines.range(spanOf(element));
  }

  protected error(
    code: string,
    message: string,
    at: CstElement | Span,
    options: ReportOptions = {},
  ): void {
    this.errors++;
    this.bag.add({
      code,
      message,
      span: "kind" in at ? spanOf(at) : at,
      hints: options.hints,
      data: options.data,
      related: options.related?.map((r) => ({
        message: r.message,
        span: "kind" in r.at ? spanOf(r.at) : r.at,
      })),
    });
  }

  protected invalid(message: string, at: CstElement | Span, hints?: string[]): void {
    this.error("prop.invalid-value", message, at, { hints });
  }

  protected reference(
    token: Token,
    target: string,
    targetKind: TargetKind,
    role: ReferenceRole,
    statement: Statement,
  ): void {
    this.references.push({ token, target, targetKind, role, statement });
  }

  // ------------------------------------------------------------------ classification

  protected classify(
    statements: readonly Statement[],
    groupPath: string[],
    context: "diagram" | "group",
    out: Classified,
  ): void {
    for (const stmt of statements) {
      if (stmt.kind === "Error" || headerHasError(stmt)) continue;
      if (this.classifyEvent(stmt, context, out)) continue;
      if (stmt.kind === "ShorthandDeclaration") {
        out.declarations.push({ stmt, groupPath });
        continue;
      }
      if (stmt.kind === "RelationStatement") {
        out.relations.push({ stmt, groupPath });
        continue;
      }
      const keyword = stmt.keyword.text;
      if (this.profile.elementKinds.includes(keyword)) {
        out.declarations.push({ stmt, groupPath });
        if (keyword === "group" && stmt.block) {
          const groupId = singleIdent(stmt.args[0]);
          const path = groupId ? [...groupPath, groupId.text] : groupPath;
          this.classify(stmt.block.statements, path, "group", out);
        }
        continue;
      }
      const otherKind = this.otherProfileKind(keyword);
      if (context === "group") {
        // `description`, `url`, `class`, `layer` and `link` are read when the group is declared.
        if (keyword === "description" || keyword === "url" || (keyword === "class" && !stmt.block))
          continue;
        if (
          (keyword === "layer" || keyword === "link") &&
          keyword in this.profile.groupProperties
        ) {
          continue;
        }
        const m = messages();
        const hints = otherKind
          ? [otherKind]
          : diagramStatements(this.profile).includes(keyword)
            ? [m.hints.flow.diagramLevel(keyword)]
            : [m.hints.flow.groupContents];
        const candidates = otherKind
          ? this.declarationWords()
          : diagramStatements(this.profile).includes(keyword)
            ? []
            : ["description", "url"];
        this.error("prop.unknown", m.diagnostics.flow.unknownInGroup(keyword), stmt.keyword, {
          hints,
          data: { candidates },
        });
        continue;
      }
      if (keyword in this.profile.diagramProperties) {
        out.properties.push(stmt);
        continue;
      }
      if (this.profile.diagramBlocks.includes(keyword)) {
        out.blocks.push(stmt);
        continue;
      }
      const hints = this.statementHints(keyword, stmt);
      this.error(
        "prop.unknown",
        messages().diagnostics.flow.unknownInDiagram(keyword, this.profile.name),
        stmt.keyword,
        { hints, data: { candidates: this.statementCandidates(keyword) } },
      );
    }
  }

  /** Hints for an unknown statement at the diagram level, in the interface language. */
  protected statementHints(keyword: string, stmt: KeywordStatement): string[] {
    const otherKind = this.otherProfileKind(keyword);
    if (otherKind) return [otherKind];
    const m = messages().hints.flow;
    const hints: string[] = [];
    if (stmt.args.length === 0 && !stmt.block) {
      hints.push(m.declareElement(keyword, this.profile.shorthand.box));
    }
    hints.push(this.free ? m.freeStatements : m.flowStatements);
    return hints;
  }

  /** The statements an unknown one at the diagram level may have meant, for fixes. */
  protected statementCandidates(keyword: string): readonly string[] {
    if (this.otherProfileKind(keyword)) return this.declarationWords();
    return this.free ? FREE_STATEMENTS : FLOW_STATEMENTS;
  }

  /** The declaration keywords of this profile, as its hints list them. */
  protected declarationWords(): readonly string[] {
    return this.free ? FREE_DECLARATIONS : FLOW_DECLARATIONS;
  }

  /**
   * The hint for a declaration keyword of the other profile, in the interface language, or
   * undefined.
   */
  protected otherProfileKind(keyword: string): string | undefined {
    if (this.profile.name === "sequence") return undefined;
    const other = this.free ? FLOW_PROFILE : FREE_PROFILE;
    if (!other.elementKinds.includes(keyword) || this.profile.elementKinds.includes(keyword)) {
      return undefined;
    }
    const m = messages().hints.flow;
    return this.free ? m.freeDeclarations : m.flowDeclarations(keyword);
  }

  // ------------------------------------------------------------------ elements

  protected declare(stmt: ShorthandDeclaration | KeywordStatement, groupPath: string[]): void {
    if (stmt.kind === "ShorthandDeclaration") {
      const label = isToken(stmt.label) ? String(stmt.label.value ?? "") : stmt.id.text;
      const block = this.elementBlock(
        stmt.block,
        this.profile.elementProperties,
        "Element",
        stmt.id,
      );
      const data = stmt.shape === "data";
      this.addElement({
        id: stmt.id.text,
        kind: (data ? this.profile.shorthand.data : this.profile.shorthand.box) as ElementKind,
        label,
        implicit: false,
        ...block,
        source: null,
        sourceRange: null,
        labelWritten: isToken(stmt.label),
        entity: null,
        technology: null,
        external: false,
        shape: data ? "cylinder" : null,
        typeKind: null,
        data: {},
        groupPath,
        range: this.range(stmt),
        idRange: this.range(stmt.id),
        idToken: stmt.id,
        node: stmt,
      });
      return;
    }

    // A kind of a declared type is drawn as a box with the kind's style.
    const declaredKind = this.declared?.elements[stmt.keyword.text];
    const typeKind = declaredKind ? stmt.keyword.text : null;
    const kind = (declaredKind ? "box" : stmt.keyword.text) as ElementKind;
    const sourced = kind === "text" || kind === "icon" || kind === "image";
    const second = { text: '"Text"', icon: '"<pack>:<name>"', image: '"<path>"' }[kind as string];
    const form = sourced
      ? `\`${kind} <id> ${second}\``
      : `\`${kind} <id> ["Label"]${kind === "group" ? " { ... }" : ""}\``;
    const example = {
      text: 'text heading "Architecture"',
      icon: 'icon server "tabler:server"',
      image: 'image logo "logo.png"',
    }[kind as string];
    if (stmt.chain) {
      this.invalid(messages().diagnostics.common.singleBlock(kind), stmt.chain.clauses[1]!.keyword);
      return;
    }
    const [idArg, labelArg, ...extra] = stmt.args;
    const idToken = singleIdent(idArg);
    if (!idToken) {
      const m = messages();
      this.invalid(m.diagnostics.common.expected(form), idArg ?? stmt.keyword, [
        m.hints.example(example ?? `${kind} api "API Gateway"`),
      ]);
      return;
    }
    let label = idToken.text;
    let source: string | null = null;
    let sourceRange: Range | null = null;
    if (labelArg) {
      if (labelArg.kind !== "StringLiteral") {
        const what = sourced && kind !== "text" ? kind : "label";
        this.invalid(messages().diagnostics.flow.quotedSource(what, idToken.text), labelArg);
        return;
      }
      if (kind === "text" || !sourced) label = labelArg.value;
      // A bad source is reported, and the object still declared so that its uses resolve.
      let usable = true;
      if (kind === "icon") {
        const checked = checkArg(labelArg, { kind: "icon" }, "icon");
        if (!checked.ok) {
          this.invalid(checked.message, labelArg, checked.hints);
          usable = false;
        }
      }
      if (kind === "image") {
        const problem = unsafeImagePath(labelArg.value);
        if (problem) {
          this.error("asset.outside-project", problem, labelArg, {
            hints: [messages().hints.flow.imagePath],
          });
          usable = false;
        }
      }
      if (usable && (kind === "icon" || kind === "image")) {
        source = labelArg.value;
        sourceRange = this.range(labelArg);
      }
    } else if (sourced) {
      const m = messages();
      this.invalid(m.diagnostics.flow.needsSource(kind, idToken.text, form), stmt, [
        m.hints.example(example!),
      ]);
    }
    if (extra.length > 0) {
      this.invalid(
        messages().diagnostics.flow.valueAfter(sourced ? kind : "label", form),
        extra[0]!,
      );
      return;
    }
    const block =
      kind === "group"
        ? { ...this.groupBlock(stmt.block, idToken), ports: [], values: {} }
        : this.elementBlock(
            stmt.block,
            declaredKind
              ? { ...this.profile.elementProperties, ...tableOf(declaredKind.properties) }
              : this.profile.elementProperties,
            "Element",
            idToken,
          );
    const { values: blockValues, ...blockFields } = block;
    const added = this.addElement({
      id: idToken.text,
      kind,
      label,
      implicit: false,
      ...blockFields,
      source,
      sourceRange,
      labelWritten: labelArg !== undefined && (kind === "text" || !sourced),
      entity: null,
      technology: null,
      external: false,
      shape: null,
      typeKind,
      data: declaredKind ? dataOf(blockValues, declaredKind.properties) : {},
      groupPath,
      range: this.range(stmt),
      idRange: this.range(idToken),
      idToken,
      node: stmt,
    });
    if (!added || source === null || !sourceRange) return;
    if (kind === "icon") this.icons.push({ reference: source, range: sourceRange });
    else this.images.push({ element: idToken.text, path: source, range: sourceRange });
  }

  protected addElement(element: Element): boolean {
    const existing = this.elementsById.get(element.id);
    if (existing) {
      const m = messages();
      this.error(
        "ref.duplicate-id",
        m.diagnostics.flow.duplicateElement(element.id),
        element.idToken,
        {
          related: [{ message: m.related.firstDeclared, at: existing.idToken }],
          hints: [m.hints.flow.sharedNamespace],
        },
      );
      return false;
    }
    this.elements.push(element);
    this.elementsById.set(element.id, element);
    if (element.node) {
      this.reference(element.idToken, element.id, "element", "declaration", element.node);
    }
    if (element.link) this.links.push(element.link);
    return true;
  }

  /**
   * Reads an element or relation block: its description, applied classes, named ports, and the
   * `layer` and `link` statements the profile accepts.
   */
  protected elementBlock(
    block: Block | undefined,
    table: PropertyTable,
    owner: "Element" | "Relation",
    ownerToken: Token | undefined,
  ): {
    description: string | null;
    url: string | null;
    classes: ClassUse[];
    ports: PortDefinition[];
    values: Record<string, Value>;
  } & BlockExtras {
    const empty = { layer: null, layerRange: null, link: null };
    if (!block)
      return { description: null, url: null, classes: [], ports: [], values: {}, ...empty };
    const ports: PortDefinition[] = [];
    const extras: BlockExtras = { ...empty };
    const seen = new Map<string, Token>();
    const rest = block.statements.filter((stmt) => {
      if (stmt.kind !== "KeywordStatement") return true;
      const keyword = stmt.keyword.text;
      if (owner === "Element" && keyword === "port" && this.profile.ports.length > 0) {
        if (!headerHasError(stmt)) this.port(stmt, ports);
        return false;
      }
      if ((keyword === "layer" || keyword === "link") && keyword in table) {
        if (!headerHasError(stmt)) this.extra(stmt, extras, seen, ownerToken);
        return false;
      }
      return true;
    });
    const words = Object.keys(table).concat(
      owner === "Element" && this.profile.ports.length > 0 ? ["port"] : [],
    );
    const { values, classes } = this.readProperties(
      { ...block, statements: rest },
      table,
      () => {
        const m = messages().hints.flow;
        return owner === "Element" ? m.elementBlock(words) : m.relationBlock(words);
      },
      owner.toLowerCase(),
      words,
    );
    return {
      description: typeof values.description === "string" ? values.description : null,
      url: typeof values.url === "string" ? values.url : null,
      classes,
      ports,
      values,
      ...extras,
    };
  }

  /** Reads `layer <name>` or `link <diagram>.<element>` into the extras of a block. */
  protected extra(
    stmt: KeywordStatement,
    extras: BlockExtras,
    seen: Map<string, Token>,
    ownerToken: Token | undefined,
  ): void {
    const keyword = stmt.keyword.text as "layer" | "link";
    const first = seen.get(keyword);
    if (first) {
      const m = messages();
      this.error("prop.duplicate", m.diagnostics.common.setMoreThanOnce(keyword), stmt.keyword, {
        related: [{ message: m.related.firstSet, at: first }],
      });
      return;
    }
    seen.set(keyword, stmt.keyword);
    const value = this.readValue(stmt, { kind: keyword === "layer" ? "name" : "link" }, keyword);
    if (value === undefined) return;
    const arg = stmt.args[0]!;
    if (keyword === "layer") {
      const token = singleIdent(arg)!;
      extras.layer = token.text;
      extras.layerRange = this.range(token);
      this.layerUses.push({ name: token.text, token });
      return;
    }
    if (arg.kind !== "QualifiedRef" || !ownerToken) return;
    // Read provisionally as `<block>.<rest>`; compile decides what the first part names.
    const parts = arg.parts;
    extras.link = {
      owner: ownerToken.text,
      text: arg.text,
      binding: null,
      diagram: parts[0]!.text,
      element: parts
        .slice(1)
        .map((p) => p.text)
        .join("."),
      target: null,
      range: this.range(arg),
      diagramRange: this.range(parts[0]!),
      elementRange: this.lines.range({ start: parts[1]!.start, end: arg.end }),
      node: stmt,
    };
  }

  /** Reads `port <name> <side> [<n>%]`. */
  protected port(stmt: KeywordStatement, ports: PortDefinition[]): void {
    const form = "`port <name> north|south|east|west [<n>%]`";
    if (stmt.block || stmt.chain) {
      this.invalid(
        messages().diagnostics.common.takesNoBlockExpected("port", form),
        stmt.block ?? stmt.chain!,
      );
      return;
    }
    const [nameArg, sideArg, positionArg, extra] = stmt.args;
    const name = singleIdent(nameArg);
    if (!name)
      return this.invalid(messages().diagnostics.common.expected(form), nameArg ?? stmt.keyword);
    if ((PORTS as readonly string[]).includes(name.text)) {
      const m = messages();
      return this.invalid(m.diagnostics.flow.builtInPort(name.text), name, [
        m.hints.flow.compassPorts,
      ]);
    }
    const side = singleIdent(sideArg);
    if (!side || !(PORT_SIDES as readonly string[]).includes(side.text)) {
      return this.invalid(
        messages().diagnostics.flow.portSide(name.text, PORT_SIDES),
        sideArg ?? name,
      );
    }
    let position = 0.5;
    if (positionArg) {
      if (
        positionArg.kind !== "NumberLiteral" ||
        positionArg.unit !== "%" ||
        positionArg.value < 0 ||
        positionArg.value > 100
      ) {
        return this.invalid(messages().diagnostics.flow.portPosition, positionArg);
      }
      position = positionArg.value / 100;
    }
    if (extra) return this.invalid(messages().diagnostics.flow.unexpectedValue(form), extra);
    const first = ports.find((p) => p.name === name.text);
    if (first) {
      const m = messages();
      this.error("ref.duplicate-id", m.diagnostics.flow.duplicatePort(name.text), name, {
        related: [
          {
            message: m.related.firstDeclared,
            at: { start: first.nameRange.start.offset, end: first.nameRange.end.offset },
          },
        ],
      });
      return;
    }
    ports.push({
      name: name.text,
      side: side.text as PortSide,
      position,
      range: this.range(stmt),
      nameRange: this.range(name),
    });
  }

  /**
   * Reads the `description`, `class`, `layer` and `link` properties of a group block; children are
   * classified.
   */
  protected groupBlock(
    block: Block | undefined,
    ownerToken: Token,
  ): { description: string | null; url: string | null; classes: ClassUse[] } & BlockExtras {
    let description: string | null = null;
    let url: string | null = null;
    let classes: ClassUse[] = [];
    const extras: BlockExtras = { layer: null, layerRange: null, link: null };
    if (!block) return { description, url, classes, ...extras };
    const seen = new Map<string, Token>();
    for (const stmt of block.statements) {
      if (stmt.kind !== "KeywordStatement" || headerHasError(stmt)) continue;
      const name = stmt.keyword.text;
      if ((name === "layer" || name === "link") && name in this.profile.groupProperties) {
        this.extra(stmt, extras, seen, ownerToken);
        continue;
      }
      if (name !== "description" && name !== "url" && !(name === "class" && !stmt.block)) continue;
      const first = seen.get(name);
      if (first) {
        const m = messages();
        this.error("prop.duplicate", m.diagnostics.flow.setTwiceInGroup(name), stmt.keyword, {
          related: [{ message: m.related.firstSet, at: first }],
        });
        continue;
      }
      seen.set(name, stmt.keyword);
      if (name === "class") {
        classes = readClasses(stmt, this.lines, this.report) ?? [];
        continue;
      }
      if (name === "url") {
        const value = this.readValue(stmt, { kind: "url" }, "url");
        if (typeof value === "string") url = value;
        continue;
      }
      const value = this.readValue(stmt, this.profile.groupProperties.description!, "description");
      if (typeof value === "string") description = value;
    }
    return { description, url, classes, ...extras };
  }

  // ------------------------------------------------------------------ relations

  protected relation(stmt: RelationStatement, groupPath: string[]): void {
    const target = stmt.target as QualifiedRef;
    const idToken = stmt.id && isToken(stmt.id) ? stmt.id : undefined;
    const from = this.resolveEndpoint(stmt.source, stmt, groupPath);
    const to = this.resolveEndpoint(target, stmt, groupPath);
    if (from === undefined || to === undefined) {
      if (idToken) this.brokenRelationIds.add(idToken.text);
      return;
    }
    let id: string | null = null;
    if (idToken) {
      const element = this.elementsById.get(idToken.text);
      const firstRelation = this.relationIdTokens.get(idToken.text);
      if (element) {
        const m = messages();
        this.error(
          "ref.duplicate-id",
          m.diagnostics.flow.relationIdUsedByElement(idToken.text),
          idToken,
          {
            related: [{ message: m.related.elementDeclared, at: element.idToken }],
            hints: [m.hints.flow.sharedNamespace],
          },
        );
        this.brokenRelationIds.add(idToken.text);
      } else if (firstRelation && firstRelation !== idToken) {
        const m = messages();
        this.error("ref.duplicate-id", m.diagnostics.flow.relationIdUsed(idToken.text), idToken, {
          related: [{ message: m.related.firstUsed, at: firstRelation }],
        });
      } else {
        id = idToken.text;
      }
    }
    if (this.profile.arrows[stmt.arrow.text] === undefined) {
      this.invalid(
        messages().diagnostics.flow.arrowUnavailable(
          stmt.arrow.text,
          Object.keys(this.profile.arrows),
        ),
        stmt.arrow,
      );
    }
    const { description, classes, layer, layerRange, values } = this.elementBlock(
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
      line: this.profile.arrows[stmt.arrow.text] ?? "solid",
      twoWay: stmt.arrow.text.startsWith("<"),
      async: values.kind === "async",
      technology: null,
      sources: [],
      derived: false,
      label: stmt.label && isToken(stmt.label) ? String(stmt.label.value ?? "") : null,
      description,
      assumption: typeof values.assumption === "string" ? values.assumption : null,
      data: this.declared ? dataOf(values, this.declared.relations.properties) : {},
      classes,
      layer,
      layerRange,
      groupPath,
      range: this.range(stmt),
      idRange: id !== null && idToken ? this.range(idToken) : null,
      node: stmt,
    };
    this.relations.push(relation);
    if (id !== null && idToken) this.reference(idToken, id, "relation", "relation-id", stmt);
  }

  protected resolveEndpoint(
    ref: QualifiedRef,
    stmt: RelationStatement,
    groupPath: string[],
  ): string | undefined {
    if (ref.parts.length > 1) {
      const m = messages();
      this.error("ref.unknown-element", m.diagnostics.common.unknownElement(ref.text), ref, {
        hints: [m.hints.flow.qualifiedEndpoint],
        data: { ids: [ref.text] },
      });
      return undefined;
    }
    const token = ref.parts[0]!;
    const name = token.text;
    if (this.elementsById.has(name)) {
      this.reference(token, name, "element", "relation-endpoint", stmt);
      return name;
    }
    if (this.relationIdTokens.has(name)) {
      this.error(
        "ref.unknown-element",
        messages().diagnostics.flow.relationAsEndpoint(name),
        token,
        { data: { ids: [name] } },
      );
      return undefined;
    }
    this.addElement({
      id: name,
      kind: this.profile.implicitKind as ElementKind,
      label: name,
      implicit: true,
      description: null,
      url: null,
      classes: [],
      ports: [],
      layer: null,
      layerRange: null,
      link: null,
      source: null,
      sourceRange: null,
      labelWritten: false,
      entity: null,
      technology: null,
      external: false,
      shape: null,
      typeKind: null,
      data: {},
      groupPath,
      range: this.range(token),
      idRange: this.range(token),
      idToken: token,
      node: undefined,
    });
    this.reference(token, name, "element", "relation-endpoint", stmt);
    return name;
  }

  protected assignKeys(): void {
    const counts = new Map<string, number>();
    for (const relation of this.relations) {
      const pair = `${relation.from}->${relation.to}`;
      const n = (counts.get(pair) ?? 0) + 1;
      counts.set(pair, n);
      relation.key = relation.id ?? `${pair}#${n}`;
      if (!this.relationsByKey.has(relation.key)) this.relationsByKey.set(relation.key, relation);
    }
  }

  // ------------------------------------------------------------------ diagram properties

  protected readonly propertySeen = new Map<string, Token>();

  protected diagramProperty(stmt: KeywordStatement): void {
    const name = stmt.keyword.text;
    const first = this.propertySeen.get(name);
    if (first) {
      const m = messages();
      this.error(
        "prop.duplicate",
        m.diagnostics.flow.setMoreThanOnceInDiagram(name),
        stmt.keyword,
        {
          related: [{ message: m.related.firstSet, at: first }],
        },
      );
      return;
    }
    this.propertySeen.set(name, stmt.keyword);
    if (name === "layers") {
      this.layersProperty(stmt);
      return;
    }
    if (name === "autonumber" && stmt.args.length === 0 && !stmt.block && !stmt.chain) {
      this.properties.autonumber = 1;
      return;
    }
    const value = this.readValue(stmt, this.profile.diagramProperties[name]!, name);
    if (value === undefined) return;
    switch (name) {
      case "direction":
        this.properties.direction = value as Direction;
        break;
      case "layout":
        this.properties.layout = value as LayoutMode;
        break;
      case "theme":
      case "title":
      case "description":
        this.properties[name] = String(value);
        break;
      case "preset":
      case "canvas": {
        const other = name === "preset" ? "canvas" : "preset";
        const set = name === "preset" ? this.properties.canvas : this.properties.preset;
        if (set !== null) {
          const m = messages();
          this.invalid(m.diagnostics.flow.canvasConflict(name, other), stmt, [
            m.hints.flow.oneCanvas,
          ]);
          return;
        }
        if (name === "preset") this.properties.preset = value as Preset;
        else this.properties.canvas = value as { width: number; height: number };
        break;
      }
      case "routing":
        this.properties.routing = value as Routing;
        break;
      case "autonumber":
        this.properties.autonumber = Number(value);
        break;
    }
  }

  /** Reads `layers a, b, c`: back to front, `main` last unless listed. */
  protected layersProperty(stmt: KeywordStatement): void {
    if (stmt.block || stmt.chain) {
      this.invalid(
        messages().diagnostics.common.doesNotTakeBlock("layers"),
        stmt.block ?? stmt.chain!,
      );
      return;
    }
    if (stmt.args.length === 0) {
      const m = messages();
      this.invalid(m.diagnostics.flow.layersEmpty, stmt.keyword, [
        m.hints.example("layers background, main, front"),
      ]);
      return;
    }
    const names: string[] = [];
    for (const arg of stmt.args) {
      const token = singleIdent(arg);
      if (!token) {
        this.invalid(messages().diagnostics.flow.invalidLayer(describeArg(arg)), arg);
        return;
      }
      if (names.includes(token.text)) {
        this.error("prop.duplicate", messages().diagnostics.flow.layerTwice(token.text), token);
        return;
      }
      names.push(token.text);
      this.layerRanges.set(token.text, this.range(token));
    }
    if (!names.includes(MAIN_LAYER)) names.push(MAIN_LAYER);
    this.properties.layers = names;
  }

  /** Reports `layer` statements that name an undeclared layer. */
  protected checkLayers(): void {
    const layers = this.properties.layers;
    for (const use of this.layerUses) {
      if (layers.includes(use.name)) continue;
      const m = messages();
      this.error("ref.unknown-layer", m.diagnostics.flow.unknownLayer(use.name), use.token, {
        data: { ids: [use.name] },
        hints: [
          m.hints.flow.layers(layers),
          m.hints.flow.declareLayer([
            ...layers.filter((l) => l !== MAIN_LAYER),
            use.name,
            MAIN_LAYER,
          ]),
        ],
      });
    }
  }

  /** Reads the single value of a property statement, reporting `prop.invalid-value` when it does not fit. */
  protected readValue(stmt: KeywordStatement, spec: ValueSpec, name: string): Value | undefined {
    return readStatementValue(stmt, spec, name, this.report);
  }

  /** Reads `name value` statements from a block against a property table. */
  protected readProperties(
    block: Block,
    table: PropertyTable,
    /** The hint for an unknown statement, built when one is reported. */
    unknownHint: () => string,
    owner: string,
    accepted?: readonly string[],
  ): ReturnType<typeof readPropertyBlock> {
    return readPropertyBlock(block, table, unknownHint, owner, this.lines, this.report, accepted);
  }

  // ------------------------------------------------------------------ placement

  protected placementBlock(stmt: KeywordStatement): void {
    if (stmt.args.length > 0) {
      this.invalid(messages().diagnostics.flow.placementArguments, stmt.args[0]!);
      return;
    }
    if (stmt.chain || !stmt.block) {
      this.invalid(messages().diagnostics.flow.placementBlock, stmt.chain ?? stmt.keyword);
      return;
    }
    this.placementBlocks.push(stmt);
    const hint = () => messages().hints.flow.placementAccepts(this.profile.placementStatements);
    for (const inner of stmt.block.statements) {
      if (inner.kind === "Error" || headerHasError(inner)) continue;
      if (inner.kind !== "KeywordStatement") {
        const m = messages().diagnostics.flow;
        this.error(
          "prop.unknown",
          inner.kind === "RelationStatement" ? m.relationsInPlacement : m.declarationsInPlacement,
          inner,
          {
            hints: [hint()],
            data: { candidates: this.profile.placementStatements },
          },
        );
        continue;
      }
      if (this.placementStatement(inner)) continue;
      switch (inner.keyword.text) {
        case "place":
          this.place(inner);
          break;
        case "size":
          this.size(inner);
          break;
        case "route":
          this.route(inner);
          break;
        case "label":
          this.label(inner);
          break;
        case "align":
        case "row":
        case "column":
        case "order":
        case "distance":
          this.constraint(inner, inner.keyword.text);
          break;
        default:
          this.error(
            "prop.unknown",
            messages().diagnostics.flow.unknownPlacement(inner.keyword.text),
            inner.keyword,
            {
              hints: [hint()],
              data: { candidates: this.profile.placementStatements },
            },
          );
      }
    }
  }

  protected shapeError(stmt: KeywordStatement, form: string, at?: CstElement): void {
    this.invalid(messages().diagnostics.common.expected(form), at ?? stmt);
  }

  protected noBlock(stmt: KeywordStatement, form: string): boolean {
    if (stmt.block || stmt.chain) {
      this.invalid(
        messages().diagnostics.flow.noBlock(stmt.keyword.text, form),
        stmt.block ?? stmt.chain!,
      );
      return false;
    }
    return true;
  }

  protected duplicatePlacement(stmt: KeywordStatement, target: string): boolean {
    const key = `${stmt.keyword.text}:${target}`;
    const first = this.placementSeen.get(key);
    if (first) {
      const m = messages();
      this.error(
        "placement.duplicate",
        m.diagnostics.flow.duplicatePlacement(target, stmt.keyword.text),
        stmt,
        { related: [{ message: m.related.firstOne, at: first }] },
      );
      return true;
    }
    this.placementSeen.set(key, stmt);
    return false;
  }

  protected place(stmt: KeywordStatement): void {
    const form = "`place <element> at (x, y)`";
    if (!this.noBlock(stmt, form)) return;
    const [target, at, position, extra] = stmt.args;
    const targetToken = this.targetToken(target, "placement");
    if (!targetToken) return this.shapeError(stmt, form, target);
    if (!isWord(at, "at")) return this.shapeError(stmt, form, at);
    const point = readPoint(position);
    if (!point) return this.invalid(messages().diagnostics.flow.position, position ?? stmt);
    if (extra) return this.shapeError(stmt, form, extra);
    const element = this.resolveElement(targetToken, "place", stmt);
    if (!element || this.duplicatePlacement(stmt, element)) return;
    this.placement.push({
      statement: "place",
      target: element,
      x: point.x,
      y: point.y,
      range: this.range(stmt),
      targetRange: this.range(targetToken),
      node: stmt,
    });
  }

  protected size(stmt: KeywordStatement): void {
    const form = "`size <element> (width, height)`";
    if (!this.noBlock(stmt, form)) return;
    const [target, dimensions, extra] = stmt.args;
    const targetToken = this.targetToken(target, "placement");
    if (!targetToken) return this.shapeError(stmt, form, target);
    const point = readPoint(dimensions);
    if (!point || point.x <= 0 || point.y <= 0) {
      return this.invalid(messages().diagnostics.flow.size, dimensions ?? stmt);
    }
    if (extra) return this.shapeError(stmt, form, extra);
    const element = this.resolveElement(targetToken, "size", stmt);
    if (!element || this.duplicatePlacement(stmt, element)) return;
    this.placement.push({
      statement: "size",
      target: element,
      width: point.x,
      height: point.y,
      range: this.range(stmt),
      targetRange: this.range(targetToken),
      node: stmt,
    });
  }

  protected route(stmt: KeywordStatement): void {
    const form =
      "`route <relation> from <element>.<port> [<n>%] to <element>.<port> [<n>%] via [(x, y), ...]`";
    if (!this.noBlock(stmt, form)) return;
    // A percentage may follow each end: the point of its compass side.
    const args = [...stmt.args];
    const percentAt = (index: number) =>
      args[index]?.kind === "NumberLiteral" ? args.splice(index, 1)[0] : undefined;
    const fromAt = percentAt(3);
    const toAt = percentAt(5);
    const [target, fromWord, fromRef, toWord, toRef, viaWord, viaList, extra] = args;
    const targetToken = this.targetToken(target, "placement");
    if (!targetToken) return this.shapeError(stmt, form, target);
    if (!isWord(fromWord, "from")) return this.shapeError(stmt, form, fromWord);
    if (fromRef?.kind !== "QualifiedRef") return this.shapeError(stmt, form, fromRef);
    if (!isWord(toWord, "to")) return this.shapeError(stmt, form, toWord);
    if (toRef?.kind !== "QualifiedRef") return this.shapeError(stmt, form, toRef);
    const via: Point[] = [];
    if (viaWord) {
      if (!isWord(viaWord, "via")) return this.shapeError(stmt, form, viaWord);
      if (viaList?.kind !== "List")
        return this.invalid(messages().diagnostics.flow.viaList, viaList ?? viaWord);
      for (const item of viaList.items) {
        const point = readPoint(item);
        if (!point) return this.invalid(messages().diagnostics.flow.waypoint, item);
        via.push(point);
      }
      if (extra) return this.shapeError(stmt, form, extra);
    }

    const from = this.positioned(this.readEndpoint(fromRef), fromRef, fromAt);
    const to = this.positioned(this.readEndpoint(toRef), toRef, toAt);
    if (!from || !to) return;
    const relation = this.resolveRelation(targetToken, "route", stmt);
    if (!relation) return;
    if (from.endpoint.element !== relation.from) {
      this.error(
        "placement.route-mismatch",
        messages().diagnostics.flow.routeStart(relation.key, relation.from, from.endpoint.element),
        fromRef,
      );
      return;
    }
    if (to.endpoint.element !== relation.to) {
      this.error(
        "placement.route-mismatch",
        messages().diagnostics.flow.routeEnd(relation.key, relation.to, to.endpoint.element),
        toRef,
      );
      return;
    }
    if (this.duplicatePlacement(stmt, relation.key)) return;
    this.reference(from.token, from.endpoint.element, "element", "route-endpoint", stmt);
    this.reference(to.token, to.endpoint.element, "element", "route-endpoint", stmt);
    this.placement.push({
      statement: "route",
      target: relation.key,
      from: from.endpoint,
      to: to.endpoint,
      via,
      range: this.range(stmt),
      targetRange: this.range(targetToken),
      node: stmt,
    });
  }

  /** An endpoint with the position written after it, when it is a compass side. */
  protected positioned(
    read: { endpoint: RouteEndpoint; token: Token } | undefined,
    ref: QualifiedRef,
    at: Arg | undefined,
  ): { endpoint: RouteEndpoint; token: Token } | undefined {
    if (!read || !at) return read;
    const { endpoint } = read;
    if (endpoint.named || endpoint.port === "auto") {
      this.invalid(messages().diagnostics.flow.endPosition(ref.text, endpoint.element), at);
      return undefined;
    }
    if (at.kind !== "NumberLiteral" || at.unit !== "%" || at.value < 0 || at.value > 100) {
      this.invalid(messages().diagnostics.flow.endPositionRange, at);
      return undefined;
    }
    return { ...read, endpoint: { ...endpoint, position: at.value / 100 } };
  }

  protected readEndpoint(ref: QualifiedRef): { endpoint: RouteEndpoint; token: Token } | undefined {
    if (ref.parts.length > 2) {
      this.invalid(messages().diagnostics.flow.endpointShape(ref.text), ref);
      return undefined;
    }
    const [elementToken, portToken] = ref.parts as [Token, Token | undefined];
    let port = "auto";
    let named = false;
    if (portToken) {
      const declared = this.elementsById.get(elementToken.text)?.ports ?? [];
      if ((PORTS as readonly string[]).includes(portToken.text)) {
        port = portToken.text;
      } else if (declared.some((p) => p.name === portToken.text)) {
        port = portToken.text;
        named = true;
      } else {
        const m = messages();
        this.error(
          "placement.unknown-port",
          m.diagnostics.common.unknownPort(elementToken.text, portToken.text),
          portToken,
          {
            data: { ids: [elementToken.text, portToken.text] },
            hints: [
              m.hints.flow.ports(elementToken.text, [...declared.map((p) => p.name), ...PORTS]),
            ],
          },
        );
        return undefined;
      }
    }
    return {
      endpoint: { element: elementToken.text, port, named, explicitPort: portToken !== undefined },
      token: elementToken,
    };
  }

  /** Reads `align`, `row`, `column`, `order` and `distance` constraints. */
  protected constraint(stmt: KeywordStatement, keyword: string): void {
    const kind = keyword as ConstraintKind;
    const forms: Record<ConstraintKind, string> = {
      align: "`align <element>, <element>... top|middle|bottom|left|center|right`",
      row: "`row <element>, <element>...`",
      column: "`column <element>, <element>...`",
      order: "`order <element>, <element>... [horizontal|vertical]`",
      distance: "`distance <element>, <element> <n>`",
    };
    if (!this.noBlock(stmt, forms[kind])) return;
    const args = [...stmt.args];
    let edge: AlignEdge | null = kind === "row" ? "middle" : kind === "column" ? "center" : null;
    let axis: "horizontal" | "vertical" | null = null;
    let distance: number | null = null;
    if (kind === "align") {
      const last = args.pop();
      const word = singleIdent(last);
      if (!word || !(ALIGN_EDGES as readonly string[]).includes(word.text)) {
        return this.invalid(
          messages().diagnostics.flow.alignEdge(ALIGN_EDGES),
          last ?? stmt.keyword,
        );
      }
      edge = word.text as AlignEdge;
    } else if (kind === "order") {
      const word = singleIdent(args[args.length - 1]);
      if (
        word &&
        (AXES as readonly string[]).includes(word.text) &&
        !this.elementsById.has(word.text)
      ) {
        axis = word.text as "horizontal" | "vertical";
        args.pop();
      }
    } else if (kind === "distance") {
      const last = args.pop();
      if (
        last?.kind !== "NumberLiteral" ||
        (last.unit !== null && last.unit !== "px") ||
        last.value <= 0
      ) {
        const m = messages();
        return this.invalid(m.diagnostics.flow.distanceGap, last ?? stmt.keyword, [
          m.hints.example("distance api, db 80"),
        ]);
      }
      distance = last.value;
    }
    const targets: string[] = [];
    const targetRanges: Range[] = [];
    for (const arg of args) {
      const token = this.targetToken(arg, "placement");
      if (!token) return this.shapeError(stmt, forms[kind], arg);
      const element = this.elementsById.get(token.text);
      if (!element) {
        const m = messages();
        this.error("ref.unknown-element", m.diagnostics.common.unknownElement(token.text), token, {
          hints: [m.hints.flow.constraintElements],
          data: { ids: [token.text] },
        });
        return;
      }
      if (element.kind === "group") {
        return this.invalid(messages().diagnostics.flow.constraintGroup(token.text), token);
      }
      if (targets.includes(token.text)) {
        return this.invalid(messages().diagnostics.flow.constraintTwice(token.text), token);
      }
      targets.push(token.text);
      targetRanges.push(this.range(token));
      this.reference(token, token.text, "element", "constraint", stmt);
    }
    if ((kind === "distance" && targets.length !== 2) || targets.length < 2) {
      const m = messages();
      return this.invalid(
        m.diagnostics.flow.constraintCount(kind, kind === "distance"),
        stmt.keyword,
        [m.hints.flow.form(forms[kind])],
      );
    }
    this.constraints.push({
      kind,
      targets,
      targetRanges,
      edge,
      axis,
      distance,
      range: this.range(stmt),
      node: stmt,
    });
  }

  protected label(stmt: KeywordStatement): void {
    const form = "`label <relation> at <n>% offset (dx, dy)`";
    if (!this.noBlock(stmt, form)) return;
    const [target, atWord, at, offsetWord, offset, extra] = stmt.args;
    const targetToken = this.targetToken(target, "placement");
    if (!targetToken) return this.shapeError(stmt, form, target);
    if (!isWord(atWord, "at")) return this.shapeError(stmt, form, atWord);
    if (at?.kind !== "NumberLiteral" || at.unit !== "%") {
      return this.invalid(messages().diagnostics.flow.labelPosition, at ?? stmt);
    }
    if (at.value < 0 || at.value > 100) {
      return this.invalid(messages().diagnostics.flow.labelOutside(at.token.text), at);
    }
    let point: Point = { x: 0, y: 0 };
    if (offsetWord) {
      if (!isWord(offsetWord, "offset")) return this.shapeError(stmt, form, offsetWord);
      const p = readPoint(offset);
      if (!p) return this.invalid(messages().diagnostics.flow.offset, offset ?? offsetWord);
      point = p;
      if (extra) return this.shapeError(stmt, form, extra);
    }
    const relation = this.resolveRelation(targetToken, "label", stmt);
    if (!relation || this.duplicatePlacement(stmt, relation.key)) return;
    this.placement.push({
      statement: "label",
      target: relation.key,
      at: at.value,
      offset: point,
      range: this.range(stmt),
      targetRange: this.range(targetToken),
      node: stmt,
    });
  }

  protected resolveElement(
    token: Token,
    statement: "place" | "size",
    stmt: KeywordStatement,
  ): string | undefined {
    const name = token.text;
    if (this.elementsById.has(name)) {
      this.reference(token, name, "element", statement, stmt);
      return name;
    }
    if (this.brokenRelationIds.has(name)) return undefined;
    if (this.relationsByKey.has(name)) {
      this.error(
        "ref.unknown-element",
        messages().diagnostics.flow.relationNotElement(name, statement),
        token,
        { data: { ids: [name] } },
      );
      return undefined;
    }
    const m = messages();
    this.error("ref.unknown-element", m.diagnostics.common.unknownElement(name), token, {
      hints: [m.hints.flow.declareFirst(name)],
      data: { ids: [name] },
    });
    return undefined;
  }

  protected resolveRelation(
    token: Token,
    statement: "route" | "label",
    stmt: KeywordStatement,
  ): Relation | undefined {
    const name = token.text;
    const relation = this.relationsByKey.get(name);
    if (relation && relation.id !== null) {
      this.reference(token, name, "relation", statement, stmt);
      return relation;
    }
    if (this.brokenRelationIds.has(name)) return undefined;
    if (this.elementsById.has(name)) {
      this.error(
        "ref.unknown-relation",
        messages().diagnostics.flow.elementNotRelation(name, statement),
        token,
      );
      return undefined;
    }
    const m = messages();
    this.error("ref.unknown-relation", m.diagnostics.flow.unknownRelation(name), token, {
      hints: [m.hints.flow.nameRelation],
    });
    return undefined;
  }

  // ------------------------------------------------------------------ style and animate

  /** `style a, b { ... }` and `animate a, b { ... }`: one block applied to one or more targets. */
  protected styleOrAnimate(stmt: KeywordStatement, kind: "style" | "animate"): void {
    const form = `\`${kind} <target>[, <target>...] { ... }\``;
    if (stmt.args.length === 0) return this.shapeError(stmt, form, stmt.keyword);
    const targetTokens: Token[] = [];
    for (const arg of stmt.args) {
      const token = this.targetToken(arg, kind);
      if (!token) return this.shapeError(stmt, form, arg);
      targetTokens.push(token);
    }
    if (stmt.chain || !stmt.block) {
      return this.invalid(
        messages().diagnostics.common.needsOneBlock(kind, form),
        stmt.chain ?? stmt.keyword,
      );
    }
    const table = kind === "style" ? this.profile.styleProperties : this.profile.animateProperties;
    const shapes = profileTakesShape(this.profile);
    const words =
      kind === "style"
        ? Object.keys(table).filter((p) =>
            p === "shape" ? shapes : this.free || !(p in FREE_PROFILE_ONLY),
          )
        : ["effect", "duration", "repeat"];
    const hint = () => {
      const m = messages().hints.flow;
      return kind === "style" ? m.styleAccepts(words) : m.animateAccepts;
    };
    const read = this.readProperties(stmt.block, table, hint, kind, words);
    const { classes, classToken, icon } = read;
    const values = { ...read.values };
    const tokens = { ...read.tokens };
    if (kind === "animate") this.checkAnimationBlock(stmt, values, tokens);
    if (kind === "style" && !this.free) {
      refuseFreeProperties(values, tokens, this.report);
      for (const name of Object.keys(tokens)) if (!(name in values)) delete tokens[name];
    }
    if (icon) this.icons.push(icon);
    const applied: Record<string, Token> = { ...tokens };
    if (classToken) applied.class = classToken;
    const misplaced = new Set<string>();

    for (const targetToken of targetTokens) {
      const resolved = this.resolveStyleTarget(targetToken, kind, stmt);
      if (!resolved) continue;
      const misfit =
        kind === "style"
          ? resolved.kind === "relation"
            ? ELEMENT_ONLY_PROPERTIES
            : RELATION_ONLY_PROPERTIES
          : [];
      for (const name of misfit) {
        const token = tokens[name];
        // `shape` is reported below, with the kinds that take it.
        if (!token || name === "shape" || misplaced.has(name)) continue;
        misplaced.add(name);
        this.invalid(
          messages().diagnostics.flow.notForTargets(
            name,
            resolved.kind === "relation",
            resolved.name,
          ),
          token,
          [targetHint(name)],
        );
      }
      // `shape` is refused per target: a block may list a node and a decision.
      const shapeless = kind === "style" && tokens.shape ? this.shapeRefusal(resolved) : null;
      if (shapeless !== null && !misplaced.has("shape")) {
        misplaced.add("shape");
        this.invalid(
          messages().diagnostics.values.shapeNotFor(shapeless, resolved.name),
          tokens.shape!,
        );
      }
      // `rotation` too: a block may list a node and a group (decision 0045).
      const unturned = kind === "style" && tokens.rotation ? this.rotationRefusal(resolved) : null;
      if (unturned !== null && !misplaced.has("rotation")) {
        misplaced.add("rotation");
        this.invalid(
          unturned.profile
            ? messages().diagnostics.values.rotationInProfile(this.profile.name)
            : messages().diagnostics.values.rotationNotFor(unturned.kind, resolved.name),
          tokens.rotation!,
        );
      }
      const refused = [
        ...(shapeless === null ? [] : ["shape"]),
        ...(unturned === null ? [] : ["rotation"]),
      ];
      const excluded = refused.length === 0 ? misfit : [...misfit, ...refused];
      if (kind === "animate") {
        // One effect per channel and target; different channels may share a target.
        const effect = values.effect as AnimationEffect | undefined;
        if (effect && !this.animationTargetFits(effect, resolved, targetToken)) continue;
        if (effect) {
          const key = `${resolved.name}:${effect}`;
          const first = this.animationSeen.get(key);
          if (first) {
            const m = messages();
            this.error(
              "animate.conflict",
              m.diagnostics.flow.effectConflict(resolved.name, effect),
              targetToken,
              {
                related: [{ message: m.related.firstEffect, at: first }],
                hints: [m.hints.flow.mergeEffects],
              },
            );
            continue;
          }
          this.animationSeen.set(key, targetToken);
        }
      }
      for (const [name, token] of Object.entries(applied)) {
        if (kind === "animate") break;
        if (excluded.includes(name)) continue;
        const key = `${kind}:${resolved.name}:${name}`;
        const first = this.styleSeen.get(key);
        if (first) {
          const m = messages();
          this.error(
            "prop.duplicate",
            m.diagnostics.flow.alreadySetFor(name, resolved.name),
            token,
            {
              related: [{ message: m.related.firstSet, at: first }],
            },
          );
          continue;
        }
        this.styleSeen.set(key, token);
      }
      const common = {
        target: resolved.name,
        targetKind: resolved.kind,
        range: this.range(stmt),
        targetRange: this.range(targetToken),
        node: stmt,
      };
      if (kind === "style") {
        const properties: Record<string, StyleValue> = {};
        for (const [name, value] of Object.entries(values)) {
          if (excluded.includes(name)) continue;
          if (typeof value === "string" || typeof value === "number") properties[name] = value;
        }
        this.styles.push({ ...common, properties, classes });
      } else {
        this.animations.push({
          ...common,
          effect: (values.effect as AnimationEffect | undefined) ?? null,
          durationMs: typeof values.duration === "number" ? values.duration : null,
          repeat:
            values.repeat === "forever"
              ? "forever"
              : typeof values.repeat === "number"
                ? values.repeat
                : null,
          delayMs: typeof values.delay === "number" ? values.delay : null,
          direction: (values.direction as AnimationDirection | undefined) ?? null,
          particles: typeof values.particles === "number" ? values.particles : null,
          color: typeof values.color === "string" ? values.color : null,
        });
      }
    }
  }

  /**
   * An `animate` block names its effect, and its other properties must apply to that effect.
   * Properties that do not are reported and dropped.
   */
  protected checkAnimationBlock(
    stmt: KeywordStatement,
    values: Record<string, unknown>,
    tokens: Record<string, Token>,
  ): void {
    const effect = values.effect as AnimationEffect | undefined;
    if (effect === undefined) {
      // An `effect` with a wrong value is already reported as such.
      const written = stmt.block?.statements.some(
        (s) => s.kind === "KeywordStatement" && s.keyword.text === "effect",
      );
      if (!written) {
        const m = messages();
        this.error("animate.missing-effect", m.diagnostics.flow.missingEffect, stmt.keyword, {
          hints: [m.hints.example("animate r1 { effect flow; duration 1200ms }")],
        });
      }
      return;
    }
    for (const name of ["direction", "particles", "color"]) {
      const token = tokens[name];
      if (!token || ANIMATION_EFFECT_PROPERTIES[effect].includes(name)) continue;
      const users = (Object.keys(ANIMATION_EFFECT_PROPERTIES) as AnimationEffect[]).filter((e) =>
        ANIMATION_EFFECT_PROPERTIES[e].includes(name),
      );
      this.invalid(messages().diagnostics.flow.effectProperty(name, users, effect), token);
      delete values[name];
    }
  }

  /**
   * The kind a refusal of `shape` names for a style target (`relation` for relations, the event
   * kind for events), or null when the target takes it: nodes and free boxes. Free text, icons and
   * images are refused as `rule text|icon|image` refuses them.
   */
  protected shapeRefusal(resolved: { name: string; kind: TargetKind }): string | null {
    if (resolved.kind === "relation") return "relation";
    if (resolved.kind === "event") return this.eventsByKey.get(resolved.name)?.kind ?? "event";
    const element = this.elementsById.get(resolved.name);
    if (!element || takesShape(element.kind)) return null;
    return element.kind;
  }

  /**
   * Why `rotation` does not turn a style target, or null when it does: the profile (sequence
   * diagrams, C4 views), or the kind of the element (groups). Relations are refused with the other
   * element properties.
   */
  protected rotationRefusal(resolved: {
    name: string;
    kind: TargetKind;
  }): { profile: true } | { profile: false; kind: string } | null {
    if (!profileTakesRotation(this.profile)) return { profile: true };
    if (resolved.kind !== "element") return null;
    const element = this.elementsById.get(resolved.name);
    if (!element || takesRotation(element.kind)) return null;
    return { profile: false, kind: element.kind };
  }

  /** Whether an effect can run on a target; reports `animate.invalid-target` when not. */
  protected animationTargetFits(
    effect: AnimationEffect,
    resolved: { name: string; kind: TargetKind },
    token: Token,
  ): boolean {
    const element = resolved.kind === "element" ? this.elementsById.get(resolved.name) : undefined;
    const m = messages().diagnostics.flow;
    let reason: string | null = null;
    if (effect === "flow" && resolved.kind !== "relation") {
      reason = m.flowTarget;
    } else if (effect === "trace" && resolved.kind !== "relation") {
      reason = m.traceTarget;
    } else if (effect === "dash") {
      if (resolved.kind === "event") reason = m.dashOnEvent;
      else if (element && NO_OUTLINE_KINDS.has(element.kind)) {
        reason = m.dashWithoutOutline(resolved.name, element.kind);
      }
    }
    if (reason === null) return true;
    this.error("animate.invalid-target", reason, token);
    return false;
  }

  protected resolveStyleTarget(
    token: Token,
    kind: "style" | "animate",
    stmt: KeywordStatement,
  ): { name: string; kind: TargetKind } | undefined {
    const name = token.text;
    if (this.elementsById.has(name)) {
      this.reference(token, name, "element", kind, stmt);
      return { name, kind: "element" };
    }
    const relation = this.relationsByKey.get(name);
    if (relation && relation.id !== null) {
      this.reference(token, name, "relation", kind, stmt);
      return { name, kind: "relation" };
    }
    const event = this.eventsByKey.get(name);
    if (event && event.id === name && event.kind !== "message") {
      this.reference(token, name, "event", kind, stmt);
      return { name, kind: "event" };
    }
    if (this.brokenRelationIds.has(name)) return undefined;
    const m = messages();
    this.error("ref.unknown-element", m.diagnostics.flow.unknownTarget(name), token, {
      hints: [m.hints.flow.styleTargets(kind)],
      data: { ids: [name] },
    });
    return undefined;
  }
}

// -------------------------------------------------------------------- free helpers

/** The declarations and statements of flow and free diagrams, as their hints list them. */
const FLOW_DECLARATIONS: readonly string[] = ["node", "decision", "data", "group", "note", "tag"];
const FREE_DECLARATIONS: readonly string[] = ["box", "text", "icon", "image", "group"];
const FLOW_STATEMENTS: readonly string[] = [
  "direction",
  "layout",
  "theme",
  "title",
  "description",
  "preset",
  "canvas",
  "routing",
  "placement",
  "style",
  "animate",
  "class",
  "rule",
];
const FREE_STATEMENTS: readonly string[] = [
  ...FREE_DECLARATIONS,
  ...FLOW_STATEMENTS.slice(0, 8),
  "layers",
  ...FLOW_STATEMENTS.slice(8),
];

/** Style properties that only free diagrams accept, for hints. */
const FREE_PROFILE_ONLY: Readonly<Record<string, true>> = {
  fontSize: true,
  fontWeight: true,
  textAlign: true,
};

function isWord(arg: Arg | undefined, word: string): boolean {
  return singleIdent(arg)?.text === word;
}

/** A tuple of exactly two numbers without units. */
export function readPoint(arg: Arg | undefined): Point | undefined {
  if (arg?.kind !== "Tuple" || arg.items.length !== 2) return undefined;
  const [x, y] = arg.items;
  if (x?.kind !== "NumberLiteral" || y?.kind !== "NumberLiteral") return undefined;
  if (x.unit !== null || y.unit !== null) return undefined;
  return { x: x.value, y: y.value };
}
