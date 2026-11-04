import {
  isIdentifierText,
  type Block,
  type KeywordStatement,
  type Range,
  type Statement,
  type TextEdit,
} from "@meltemi/diagrams-language";
import {
  BUILT_IN_CLASSES,
  ELEMENT_KINDS,
  isSafeUrl,
  LIST_ALIGNS,
  LIST_LAYOUTS,
  LIST_PROPERTIES,
  LIST_SPACING_RANGE,
  MAIN_LAYER,
  type Element,
  type ElementLink,
  type FlowDiagram,
  type Relation,
  type StyleProperties,
  type ThemeDefinition,
} from "@meltemi/diagrams-model";
import { insertStatement, reject, requireElement, type EditContext } from "./context.js";
import { declarationText, usedIds } from "./create.js";
import { deleteStatements } from "./delete.js";
import {
  GROUP_OWN_KEYWORDS,
  diagramBody,
  groupBlock,
  insertAfter,
  insertBefore,
  insertBeforeStatement,
  insertDeclaration,
  isDeclaration,
  isKeyword,
  reindent,
  verifyNoNewErrors,
} from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import type { OperationOf } from "./plan.js";
import { requireRelation } from "./relations.js";
import { formatNumber, lineIndent, lineStart, quoteString } from "./text.js";
import type { Dependent } from "./types.js";

// ---------------------------------------------------------------------- order

/** The block that declares an element: its innermost group's, or the diagram body. */
export function blockOfParent(ctx: EditContext, element: Element): { block: Block; owner: number } {
  const parent = element.groupPath[element.groupPath.length - 1];
  return parent
    ? groupBlock(ctx, parent)
    : { block: diagramBody(ctx), owner: ctx.diagram.node.start };
}

/**
 * The lines a statement owns, line break included, or undefined when it shares a line. What
 * follows it on its last line may be `;` and a trailing comment.
 */
export function ownLines(
  text: string,
  statement: Statement,
): { start: number; end: number } | undefined {
  const start = lineStart(text, statement.start);
  if (start + lineIndent(text, statement.start).length !== statement.start) return undefined;
  const newline = text.indexOf("\n", statement.end);
  if (newline < 0) return undefined;
  const rest = text
    .slice(statement.end, newline)
    .replace(/^(?:\s*;)+/, "")
    .trim();
  if (rest !== "" && !rest.startsWith("//")) return undefined;
  return { start, end: newline + 1 };
}

/**
 * Moves an element's declaration among the declarations of its block: `front` makes it the last
 * (drawn on top), `back` the first, `forward` and `backward` swap it with a neighbour.
 */
export function reorderElement(ctx: EditContext, op: OperationOf<"reorderElement">): TextEdit[] {
  const element = requireElement(ctx, op.element);
  const { block, owner } = blockOfParent(ctx, element);
  const siblings = block.statements.filter(isDeclaration);
  if (!element.node) {
    // An implicit element is declared where the move puts it.
    const text = declarationText(element.kind, element.id, element.label, ctx.diagram.type);
    const first = siblings[0];
    if ((op.to === "back" || op.to === "backward") && first) {
      return [insertBefore(ctx, first, () => text)];
    }
    return [insertDeclaration(ctx, block, owner, () => text)];
  }
  const index = siblings.indexOf(element.node);
  const last = siblings.length - 1;
  let anchor: Statement | undefined;
  let after = true;
  switch (op.to) {
    case "front":
      anchor = index < last ? siblings[last] : undefined;
      break;
    case "forward":
      anchor = index < last ? siblings[index + 1] : undefined;
      break;
    case "back":
      anchor = index > 0 ? siblings[0] : undefined;
      after = false;
      break;
    case "backward":
      anchor = index > 0 ? siblings[index - 1] : undefined;
      after = false;
      break;
  }
  if (!anchor) return [];
  const moved = ownLines(ctx.text, element.node);
  const target = ownLines(ctx.text, anchor);
  if (moved && target) {
    // Whole lines move, with a trailing comment.
    const at = after ? target.end : target.start;
    return [
      { start: moved.start, end: moved.end, newText: "" },
      { start: at, end: at, newText: ctx.text.slice(moved.start, moved.end) },
    ];
  }
  // Statements that share lines: delete the declaration and write it again next to the anchor.
  const node = element.node;
  const text = reindent(
    ctx.text.slice(node.start, node.end),
    lineIndent(ctx.text, node.start),
    lineIndent(ctx.text, anchor.start),
  );
  return [
    ...deleteStatements(ctx.text, ctx.compilation.parse.root, [node]),
    after ? insertAfter(ctx, block, anchor, () => text) : insertBefore(ctx, anchor, () => text),
  ];
}

// ---------------------------------------------------------------------- layer and link

const LINK = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){1,2}$/;

/** Sets, replaces or removes the `layer` or `link` statement of an element or relation block. */
/**
 * Renames a layer: the name in the `layers` statement and in every `layer` statement of the
 * diagram's elements, groups and relations; one edit per occurrence.
 */
export function renameLayer(ctx: EditContext, op: OperationOf<"renameLayer">): TextEdit[] {
  const layers = ctx.diagram.properties.layers;
  if (ctx.diagram.type !== "free" && ctx.diagram.type !== "flow") {
    reject("edit.invalid-value", reasons().properties.layersFree);
  }
  if (op.layer === MAIN_LAYER) reject("edit.invalid-value", reasons().properties.mainLayer);
  if (!layers.includes(op.layer)) {
    reject("edit.invalid-value", reasons().properties.noLayer(op.layer, layers));
  }
  if (!isIdentifierText(op.name) || op.name === MAIN_LAYER || layers.includes(op.name)) {
    reject("edit.invalid-value", reasons().properties.layerTaken(op.name));
  }
  const edits: TextEdit[] = [];
  const at = (range: Range | null) => {
    if (range) edits.push({ start: range.start.offset, end: range.end.offset, newText: op.name });
  };
  at(ctx.diagram.layerRanges.get(op.layer) ?? null);
  for (const element of ctx.diagram.elements) {
    if (element.layer === op.layer) at(element.layerRange);
  }
  for (const relation of ctx.diagram.relations) {
    if (relation.layer === op.layer) at(relation.layerRange);
  }
  return edits;
}

export function setElementProperty(
  ctx: EditContext,
  op: OperationOf<"setElementProperty">,
): TextEdit[] {
  const property = op.property;
  if (property === "layout" || property === "spacing" || property === "align") {
    return setListProperty(ctx, { ...op, property });
  }
  if (typeof op.value === "number") {
    reject("edit.invalid-value", reasons().styles.wordOrString(property));
  }
  const value = op.value;
  if (property === "kind") {
    if (ctx.diagram.type !== "sequence" || op.targetKind !== "relation") {
      reject("edit.invalid-value", reasons().properties.kindForMessages);
    }
    if (value !== null && value !== "async" && value !== "sync") {
      reject("edit.invalid-value", reasons().properties.messageKind);
    }
  } else if (property === "layer") {
    if (ctx.diagram.type !== "free" && ctx.diagram.type !== "flow") {
      reject("edit.invalid-value", reasons().properties.layersFree);
    }
    if (value !== null && !ctx.diagram.properties.layers.includes(value)) {
      reject(
        "edit.invalid-value",
        reasons().properties.noLayer(value, ctx.diagram.properties.layers),
      );
    }
  } else if (property === "url") {
    if (op.targetKind === "relation")
      reject("edit.invalid-value", reasons().properties.relationsNoUrl);
    if (ctx.diagram.type === "c4") {
      reject("edit.invalid-value", reasons().properties.viewUrl);
    }
    if (value !== null && !isSafeUrl(value)) {
      reject("edit.invalid-value", reasons().values.unsafeUrl(value));
    }
  } else {
    if (op.targetKind === "relation")
      reject("edit.invalid-value", reasons().properties.relationsNoLink);
    if (value !== null && !LINK.test(value)) {
      reject("edit.invalid-value", reasons().properties.notLink(value));
    }
  }
  // `layer main` and `kind sync` say nothing the defaults do not.
  const written =
    (property === "layer" && value === MAIN_LAYER) || (property === "kind" && value === "sync")
      ? null
      : value;
  const text =
    written === null
      ? null
      : property === "url"
        ? `url ${quoteString(written)}`
        : `${property} ${written}`;
  let node: { start: number; end: number; block: Block | undefined };
  if (op.targetKind === "element") {
    const element = requireElement(ctx, op.target);
    if (!element.node) {
      if (text === null) return [];
      const declaration = declarationText(
        element.kind,
        element.id,
        element.label,
        ctx.diagram.type,
      );
      const edits = [
        insertDeclaration(
          ctx,
          diagramBody(ctx),
          ctx.diagram.node.start,
          () => `${declaration} { ${text} }`,
        ),
      ];
      verifyNoNewErrors(ctx, edits);
      return edits;
    }
    node = element.node;
  } else {
    node = requireRelation(ctx, op.target).node;
  }
  const block = node.block;
  const statement = block?.statements.find((s) => isKeyword(s, property));
  let edits: TextEdit[];
  if (text === null) {
    if (!statement || !block) return [];
    edits =
      block.statements.length === 1
        ? [{ start: block.fullStart, end: block.end, newText: "" }]
        : deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]);
  } else if (statement) {
    if (ctx.text.slice(statement.start, statement.end) === text) return [];
    edits = [{ start: statement.start, end: statement.end, newText: text }];
  } else if (block) {
    edits = [insertStatement(ctx, block, node.start, () => text)];
  } else {
    edits = [{ start: node.end, end: node.end, newText: ` { ${text} }` }];
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- lists

/** The written value of a list property, or null to remove it; refuses what a list does not take. */
function listValue(property: (typeof LIST_PROPERTIES)[number], value: string | number | null) {
  if (value === null) return null;
  if (property === "spacing") {
    const number = typeof value === "number" ? value : Number(value);
    const { min, max } = LIST_SPACING_RANGE;
    if (String(value).trim() === "" || !Number.isFinite(number) || number < min || number > max) {
      reject("edit.invalid-value", reasons().styles.numberRange(property, min, max));
    }
    return formatNumber(number);
  }
  const values: readonly string[] = property === "layout" ? LIST_LAYOUTS : LIST_ALIGNS;
  if (typeof value !== "string" || !values.includes(value)) {
    reject("edit.invalid-value", reasons().lists.notValue(String(value), property, values));
  }
  return value;
}

/**
 * Writes, replaces or removes `layout`, `spacing` or `align` in the block of a group of a free
 * diagram, among the group's own statements: a value replaces the written one, a new statement
 * goes after the group's last own statement or before its first child. Removing `layout` removes
 * `spacing` and `align` with it, since they arrange the children of a list.
 */
function setListProperty(
  ctx: EditContext,
  op: OperationOf<"setElementProperty"> & { property: (typeof LIST_PROPERTIES)[number] },
): TextEdit[] {
  const { property } = op;
  if (ctx.diagram.type !== "free") reject("edit.invalid-value", reasons().lists.freeOnly(property));
  if (op.targetKind !== "element") {
    reject("edit.invalid-value", reasons().lists.groupsOnly(property, op.target));
  }
  const element = requireElement(ctx, op.target);
  if (element.kind !== "group") {
    reject("edit.invalid-value", reasons().lists.groupsOnly(property, op.target));
  }
  const value = listValue(property, op.value);
  const { block, owner } = groupBlock(ctx, element.id);
  const written = (name: string): KeywordStatement | undefined =>
    block.statements.find((s): s is KeywordStatement => isKeyword(s, name));
  if (value !== null && property !== "layout" && !written("layout")) {
    reject("edit.invalid-value", reasons().lists.needsLayout(property));
  }
  const statement = written(property);
  let edits: TextEdit[];
  if (value === null) {
    const removed = (property === "layout" ? LIST_PROPERTIES : [property])
      .map(written)
      .filter((s): s is KeywordStatement => s !== undefined);
    if (removed.length === 0) return [];
    edits = deleteStatements(ctx.text, ctx.compilation.parse.root, removed);
  } else if (statement && statement.args.length > 0) {
    // Only the value changes.
    const first = statement.args[0]!;
    const last = statement.args[statement.args.length - 1]!;
    if (ctx.text.slice(first.start, last.end) === value) return [];
    edits = [{ start: first.start, end: last.end, newText: value }];
  } else if (statement) {
    edits = [{ start: statement.start, end: statement.end, newText: `${property} ${value}` }];
  } else {
    const text = `${property} ${value}`;
    const own = block.statements.filter((s) => isKeyword(s, ...GROUP_OWN_KEYWORDS));
    const last = own[own.length - 1];
    const first = block.statements[0];
    edits = [
      last
        ? insertAfter(ctx, block, last, () => text)
        : first
          ? insertBeforeStatement(ctx, block, first, () => text)
          : insertStatement(ctx, block, owner, () => text),
    ];
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** Replaces the icon reference of an `icon` object or the path of an `image` object. */
export function setElementSource(
  ctx: EditContext,
  op: OperationOf<"setElementSource">,
): TextEdit[] {
  const element = requireElement(ctx, op.element);
  if (element.kind !== "icon" && element.kind !== "image") {
    reject("edit.unsafe-target", reasons().elements.notSourced(op.element));
  }
  const node = element.node as KeywordStatement;
  const source = node.args[1];
  if (source?.kind !== "StringLiteral")
    reject("edit.unsafe-target", reasons().elements.sourceUnreadable);
  const quoted = quoteString(op.source);
  if (source.token.text === quoted) return [];
  const edits = [{ start: source.token.start, end: source.token.end, newText: quoted }];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- links

/** The same-file links of other diagrams that point to an element of the diagram. */
export function linksTo(ctx: EditContext, element: string): ElementLink[] {
  return ctx.compilation.document.diagrams.flatMap((diagram) =>
    diagram === ctx.diagram
      ? []
      : diagram.links.filter(
          (link) =>
            link.binding === null && link.diagram === ctx.diagram.id && link.element === element,
        ),
  );
}

/** Edits that rewrite the element part of the links to a renamed element. */
export function renameLinks(ctx: EditContext, element: string, newId: string): TextEdit[] {
  return linksTo(ctx, element).map((link) => ({
    start: link.elementRange.start.offset,
    end: link.elementRange.end.offset,
    newText: newId,
  }));
}

/** The link statements to the removed elements, as dependents, and the edits that delete them. */
export function removedLinks(
  ctx: EditContext,
  removed: ReadonlySet<string>,
): { dependents: Dependent[]; edits: TextEdit[] } {
  const lines = ctx.compilation.parse.lines;
  const dependents: Dependent[] = [];
  const statements: KeywordStatement[] = [];
  const blocks: Block[] = [];
  for (const id of removed) {
    for (const link of linksTo(ctx, id)) {
      dependents.push({
        kind: "link",
        name: link.owner,
        description: messages().dependents.link(link.owner, link.range.start.line),
        range: lines.range(link.node),
      });
      const owner = ownerBlockOf(ctx, link);
      if (owner && owner.statements.length === 1) blocks.push(owner);
      else statements.push(link.node);
    }
  }
  const edits = deleteStatements(ctx.text, ctx.compilation.parse.root, statements);
  for (const block of blocks) edits.push({ start: block.fullStart, end: block.end, newText: "" });
  return { dependents, edits };
}

function ownerBlockOf(ctx: EditContext, link: ElementLink): Block | undefined {
  for (const diagram of ctx.compilation.document.diagrams) {
    const element = diagram.elementsById.get(link.owner);
    if (element?.link === link) return element.node?.block;
  }
  return undefined;
}

// ---------------------------------------------------------------------- conversion

/** Free kinds and the class of kind defaults for each flow kind. */
const CONVERTED: Readonly<Record<string, string>> = {
  node: "box",
  decision: "box",
  data: "box",
  note: "note",
  tag: "box",
  group: "group",
};

/**
 * Copies a flow diagram, as drawn, into a new free diagram inserted after it (decision 0018).
 * Every object links to its source; the source diagram is unchanged.
 */
export function convertToFree(ctx: EditContext, op: OperationOf<"convertToFree">): TextEdit[] {
  const source = ctx.diagram;
  if (source.type !== "flow") reject("edit.unsafe-target", reasons().convert.notFlow(source.id));
  if (source.hasErrors) reject("edit.unsafe-target", reasons().convert.hasErrors(source.id));
  for (const element of source.elements) {
    if (!op.boxes.has(element.id)) {
      reject("edit.unsafe-target", reasons().convert.noBox(element.id));
    }
  }
  const used = usedIds(ctx);
  const id = op.id ?? freeName(used, `${source.id}_free`);
  if (op.id !== undefined && used.has(op.id)) {
    reject("edit.id-conflict", reasons().ids.usedInFile(op.id));
  }
  const text = new FreeCopy(ctx, source, op, id).text();
  const edits: TextEdit[] = [
    { start: source.node.end, end: source.node.end, newText: `${ctx.eol}${ctx.eol}${text}` },
  ];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/**
 * Whether a group is drawn without a title band: its label is `""` and it has no description and
 * no icon. The icon is resolved as the layout resolves styles: rules of the file themes and of the
 * diagram, then classes, then `style` statements (built-in themes have no rules and their classes
 * no icons).
 */
export function isUntitled(ctx: EditContext, element: Element): boolean {
  if (element.kind !== "group" || element.label !== "" || element.description) return false;
  const diagram = ctx.diagram;
  // The file themes of the diagram's theme chain, the most specific first.
  const chain: ThemeDefinition[] = [];
  for (let name = diagram.properties.theme; name !== null;) {
    const theme = ctx.compilation.document.themes.find((t) => t.id === name);
    if (!theme || chain.includes(theme)) break;
    chain.push(theme);
    name = theme.extends;
  }
  const classOf = (name: string): StyleProperties | undefined =>
    diagram.classes.find((c) => c.id === name)?.properties ??
    chain.flatMap((t) => t.classes).find((c) => c.id === name)?.properties ??
    BUILT_IN_CLASSES[name];
  const styles = diagram.styles.filter(
    (s) => s.targetKind === "element" && s.target === element.id,
  );
  // From the weakest to the strongest; the last icon written wins.
  const sources: (StyleProperties | undefined)[] = [
    ...[...chain].reverse().flatMap((t) => t.rules),
    ...diagram.rules,
  ]
    .filter((rule) => rule.kind === "group")
    .map((rule) => rule.properties);
  for (const use of [...element.classes, ...styles.flatMap((s) => s.classes)]) {
    sources.push(classOf(use.name));
  }
  sources.push(...styles.map((s) => s.properties));
  let icon: unknown;
  for (const properties of sources) {
    if (properties && Object.hasOwn(properties, "icon")) icon = properties.icon;
  }
  return !icon;
}

function freeName(used: ReadonlySet<string>, base: string): string {
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

class FreeCopy {
  private readonly unit: string;
  private readonly eol: string;
  /** Class ids of the kind defaults, by flow kind. */
  private readonly kindClasses = new Map<string, string>();
  private readonly classLines: string[] = [];
  /** Centres of the copied groups' interiors, by group id. */
  private readonly origins = new Map<string, { x: number; y: number }>();

  constructor(
    private readonly ctx: EditContext,
    private readonly source: FlowDiagram,
    private readonly op: OperationOf<"convertToFree">,
    private readonly id: string,
  ) {
    this.unit = ctx.unit;
    this.eol = ctx.eol;
  }

  text(): string {
    const { unit, eol, source } = this;
    this.kindDefaults();
    const lines: string[] = [];
    const props = source.properties;
    if (props.title !== null) lines.push(`title ${quoteString(props.title)}`);
    if (props.description !== null) lines.push(`description ${quoteString(props.description)}`);
    if (props.theme !== null) lines.push(`theme ${quoteString(props.theme)}`);
    if (props.preset !== null) lines.push(`preset ${props.preset}`);
    if (props.canvas !== null) lines.push(`canvas (${props.canvas.width}, ${props.canvas.height})`);
    if (props.direction !== "LR") lines.push(`direction ${props.direction}`);
    if (props.routing !== "auto") lines.push(`routing ${props.routing}`);
    if (props.layers.length > 1 || props.layers[0] !== MAIN_LAYER) {
      lines.push(`layers ${props.layers.join(", ")}`);
    }
    lines.push("layout manual", "");
    lines.push(...this.members([], ""));

    const placement = this.placement();
    lines.push("", "placement {", ...placement.map((line) => unit + line), "}");

    const definitions = [...this.classLines, ...this.copied(["class"]), ...this.copiedRules()];
    const styles = this.copied(["style", "animate"]);
    if (definitions.length > 0 || styles.length > 0) lines.push("", ...definitions, ...styles);
    const body = lines
      .flatMap((line) => line.split(eol))
      .map((line) => (line === "" ? "" : unit + line))
      .join(eol);
    return `diagram ${this.id}: free {${eol}${body}${eol}}`;
  }

  /** Classes for the drawing of each flow kind, merged with the diagram's rules for it. */
  private kindDefaults(): void {
    const m = this.op.metrics;
    const defaults: Record<string, Record<string, string | number>> = {
      decision: { shape: "diamond" },
      data: { shape: "cylinder" },
      tag: {
        shape: "pill",
        fill: "@tag",
        stroke: "@tag",
        color: "@tagText",
        fontSize: m.tagSize,
        fontWeight: 500,
      },
    };
    const used = new Set(this.source.classes.map((c) => c.id));
    for (const kind of ELEMENT_KINDS) {
      // Groups copy as written, and a free note draws as a flow note does: no class for either.
      if (kind === "group" || kind === "note") continue;
      if (!this.source.elements.some((e) => e.kind === kind)) continue;
      const properties: Record<string, string | number> = { ...(defaults[kind] ?? {}) };
      for (const rule of this.source.rules) {
        if (rule.kind === kind) Object.assign(properties, rule.properties);
      }
      if (Object.keys(properties).length === 0) continue;
      let name = `from_${kind}`;
      for (let n = 2; used.has(name); n++) name = `from_${kind}_${n}`;
      used.add(name);
      this.kindClasses.set(kind, name);
      const body = Object.entries(properties)
        .map(([key, value]) => `${key} ${formatValue(value)}`)
        .join("; ");
      this.classLines.push(`class ${name} { ${body} }`);
    }
  }

  /** The rules the copy keeps: those for notes, groups and relations, which free diagrams accept. */
  private copiedRules(): string[] {
    return this.source.rules
      .filter((rule) => rule.kind === "note" || rule.kind === "group" || rule.kind === "relation")
      .map((rule) => this.slice(rule.node));
  }

  /** Statements of the source body with these keywords, as written. */
  private copied(keywords: readonly string[]): string[] {
    return (this.source.block?.statements ?? [])
      .filter((s) => s.kind === "KeywordStatement" && keywords.includes(s.keyword.text))
      .filter((s) => !(isKeyword(s, "class") && !(s as KeywordStatement).block))
      .map((s) => this.slice(s));
  }

  /** The text of a statement, with continuation lines kept relative to its first line. */
  private slice(node: { start: number; end: number }): string {
    const raw = this.ctx.text.slice(node.start, node.end);
    const indent = lineIndent(this.ctx.text, node.start);
    return raw
      .split(/\r?\n/)
      .map((line, i) =>
        i === 0 ? line : line.startsWith(indent) ? line.slice(indent.length) : line,
      )
      .join(this.eol);
  }

  /** Declarations and relations of a group (or the top level), indented by `indent`. */
  private members(path: readonly string[], indent: string): string[] {
    const depth = path.length;
    const here = (p: readonly string[]) =>
      p.length === depth && p.every((segment, i) => segment === path[i]);
    const lines: string[] = [];
    for (const element of this.source.elements) {
      if (!here(element.groupPath)) continue;
      lines.push(...this.declaration(element, indent));
    }
    for (const relation of this.source.relations) {
      if (!here(relation.groupPath)) continue;
      lines.push(...this.relation(relation, indent));
    }
    return lines;
  }

  private declaration(element: Element, indent: string): string[] {
    const kind = CONVERTED[element.kind] ?? "box";
    // A note keeps what it is attached to: the copy declares every element with its id.
    const attached =
      element.kind === "note" && element.attachedTo !== null ? ` on ${element.attachedTo}` : "";
    const head = `${kind} ${element.id} ${quoteString(element.label)}${attached}`;
    const statements: string[] = [];
    if (element.description !== null) {
      statements.push(`description ${quoteString(element.description)}`);
    }
    const classes = [
      ...(this.kindClasses.has(element.kind) ? [this.kindClasses.get(element.kind)!] : []),
      ...element.classes.map((c) => c.name),
    ];
    if (classes.length > 0) statements.push(`class ${classes.join(", ")}`);
    for (const port of element.ports) {
      const percent = Math.round(port.position * 100);
      statements.push(`port ${port.name} ${port.side}${percent === 50 ? "" : ` ${percent}%`}`);
    }
    if (element.layer !== null) statements.push(`layer ${element.layer}`);
    statements.push(`link ${this.source.id}.${element.id}`);
    if (element.kind !== "group") {
      const inline = `${head} { ${statements.join("; ")} }`;
      if (statements.length <= 2 && indent.length + inline.length <= 100) {
        return [indent + inline];
      }
      return [`${indent}${head} {`, ...statements.map((s) => indent + this.unit + s), `${indent}}`];
    }
    const inner = indent + this.unit;
    return [
      `${indent}${head} {`,
      ...statements.map((s) => inner + s),
      ...this.members([...element.groupPath, element.id], inner),
      `${indent}}`,
    ];
  }

  private relation(relation: Relation, indent: string): string[] {
    return this.slice(relation.node)
      .split(this.eol)
      .map((line) => indent + line);
  }

  /** `place` and `size` for every object as drawn, then the routes and labels as written. */
  private placement(): string[] {
    const theme = this.op.metrics;
    const lines: string[] = [];
    const ordered = [...this.source.elements].sort(
      (a, b) => a.groupPath.length - b.groupPath.length,
    );
    const written = new Map<string, string[]>();
    for (const element of ordered) {
      const box = this.op.boxes.get(element.id)!;
      const width = Math.round(box.width);
      const height = Math.round(box.height);
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const parent = element.groupPath[element.groupPath.length - 1];
      const origin = parent === undefined ? { x: 0, y: 0 } : this.origins.get(parent)!;
      const local = { x: Math.round(center.x - origin.x), y: Math.round(center.y - origin.y) };
      if (element.kind === "group") {
        // The interior of the copy follows from its written place and size, below the title band
        // of a titled group or the padding of an untitled one.
        const left = origin.x + local.x - width / 2;
        const top = origin.y + local.y - height / 2;
        this.origins.set(element.id, {
          x: left + theme.groupPadding,
          y: top + (isUntitled(this.ctx, element) ? theme.groupPadding : theme.groupHeader),
        });
      }
      written.set(element.id, [
        `place ${element.id} at (${formatNumber(local.x)}, ${formatNumber(local.y)})`,
        `size ${element.id} (${width}, ${height})`,
      ]);
    }
    // In source order, so the placement block reads like the declarations.
    for (const element of this.source.elements) lines.push(...written.get(element.id)!);
    const auto = this.source.properties.layout === "auto";
    for (const entry of this.source.placement) {
      if (entry.statement === "route") {
        // Waypoints of an automatic source were not drawn, so the copy leaves them out.
        const text = this.slice(entry.node);
        lines.push(auto ? text.replace(/\s+via\s*\[[^\]]*\]\s*$/, "") : text);
      } else if (entry.statement === "label") {
        lines.push(this.slice(entry.node));
      }
    }
    return lines;
  }
}

function formatValue(value: string | number): string {
  if (typeof value === "number") return formatNumber(value);
  if (value.startsWith("@")) return value.slice(1);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : quoteString(value);
}
