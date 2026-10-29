import { getLocale, type Locale } from "@meltemi/diagrams-i18n";
import type { TextEdit } from "@meltemi/diagrams-language";
import {
  BOX_SHAPES,
  LIST_LAYOUTS,
  PORTS,
  PROFILES,
  SHAPE_KINDS,
  arrowToken,
  declaredProfile,
  type DiagramType,
  type ElementKind,
} from "@meltemi/diagrams-model";
import {
  insertStatement,
  isListGroup,
  reject,
  requireElement,
  requireIndex,
  requireNumbers,
  type EditContext,
} from "./context.js";
import {
  diagramBody,
  groupBlock,
  insertAfter,
  insertBeforeStatement,
  insertDeclaration,
  insertIntoBlock,
  isDeclaration,
  isKeyword,
  verifyNoNewErrors,
} from "./insert.js";
import { en } from "./messages/en.js";
import { messages, reasons } from "./messages/index.js";
import { insertViewNote } from "./c4.js";
import { insertPlacements, requireNewId, type OperationOf } from "./plan.js";
import { endpointText, requireEndPosition } from "./routes.js";
import { isEventStatement } from "./sequence.js";
import { formatStyleValue } from "./styles.js";
import { formatPoint, quoteString } from "./text.js";

/** Labels of new elements created without one, in English; `defaultLabel` gives them by language. */
export const DEFAULT_LABELS: Readonly<Record<ElementKind, string>> = en.labels;

/**
 * The label of a new element of `kind` created without one, in the interface language unless a
 * locale is given: it is what the person would have typed, so a Spanish interface writes
 * `node1["Nodo"]`. Undefined for the kinds of declared types, whose definitions name their own.
 */
export function defaultLabel(kind: string, locale: Locale = getLocale()): string | undefined {
  return Object.hasOwn(DEFAULT_LABELS, kind)
    ? messages(locale).labels[kind as ElementKind]
    : undefined;
}

/** Ids in use in the diagram and at the top level of the file. */
export function usedIds(ctx: EditContext): Set<string> {
  const used = new Set<string>(ctx.diagram.elementsById.keys());
  for (const relation of ctx.diagram.relations) if (relation.id !== null) used.add(relation.id);
  for (const diagram of ctx.compilation.document.diagrams) used.add(diagram.id);
  for (const theme of ctx.compilation.document.themes) used.add(theme.id);
  return used;
}

/** `<base><n>` with the smallest `n` from 1 not in use, or `base` itself when `bare` and free. */
export function freeId(ctx: EditContext, written: string, bare = false): string {
  // Entity paths of C4 views make ids with `_` between their parts.
  const base = written.replace(/\./g, "_");
  const used = usedIds(ctx);
  if (bare && !used.has(base)) return base;
  for (let n = bare ? 2 : 1; ; n++) {
    const id = bare ? `${base}_${n}` : `${base}${n}`;
    if (!used.has(id)) return id;
  }
}

/**
 * The declaration of an element of `kind`, in the form the language prefers for it. Implicit
 * elements are nodes in flow diagrams and boxes in free diagrams; icons and images take their
 * source in place of a label.
 */
export function declarationText(
  kind: ElementKind,
  id: string,
  label: string,
  profile: DiagramType = "flow",
): string {
  switch (kind) {
    case "node":
      return `${id}[${quoteString(label)}]`;
    case "data":
      return `${id}[(${quoteString(label)})]`;
    case "group":
      return `group ${id} ${quoteString(label)} { }`;
    default:
      if (profile === "free" && kind === "box" && label === id) return `box ${id}`;
      return `${kind} ${id} ${quoteString(label)}`;
  }
}

export function createElement(ctx: EditContext, op: OperationOf<"createElement">): TextEdit[] {
  const kind = op.elementKind;
  const declared = ctx.diagram.definition;
  const profile = declared ? declaredProfile(declared) : PROFILES[ctx.diagram.type];
  // A view declares notes and nothing else: its entities belong to the model.
  if (ctx.diagram.type === "c4" && kind !== "note") {
    reject("edit.invalid-value", reasons().c4.onlyNotes(kind, ctx.diagram.c4?.model ?? ""));
  }
  if (op.attachedTo !== undefined) {
    if (kind !== "note") reject("edit.invalid-value", reasons().attach.kinds(kind));
    // A flow or free diagram attaches to an element it declares, a view to an entity it draws.
    const target = ctx.diagram.elementsById.get(op.attachedTo);
    if (ctx.diagram.type === "c4") {
      if (!target?.entity) {
        reject("edit.unsafe-target", reasons().attach.notDrawn(op.attachedTo, ctx.diagram.id));
      }
    } else if (!target) {
      requireElement(ctx, op.attachedTo);
    }
  }
  if (!profile.elementKinds.includes(kind)) {
    reject(
      "edit.invalid-value",
      reasons().elements.otherProfile(
        kind,
        ctx.diagram.type === "free" ? "flow" : "free",
        profile.elementKinds,
      ),
    );
  }
  const sourced = kind === "icon" || kind === "image";
  if (sourced && (op.source === undefined || op.source === "")) {
    reject("edit.invalid-value", reasons().elements.needsSource(kind));
  }
  if (ctx.diagram.type === "sequence" && (op.at || op.size)) {
    reject("edit.invalid-value", reasons().elements.participantsNotPlaced);
  }
  if (op.layout !== undefined) {
    if (ctx.diagram.type !== "free")
      reject("edit.invalid-value", reasons().lists.freeOnly("layout"));
    if (kind !== "group") reject("edit.invalid-value", reasons().lists.kindLayout(kind));
    if (!(LIST_LAYOUTS as readonly string[]).includes(op.layout)) {
      reject("edit.invalid-value", reasons().lists.notValue(op.layout, "layout", LIST_LAYOUTS));
    }
  }
  if (op.index !== undefined) requireIndex(op.index);
  const id = op.id ?? freeId(ctx, kind);
  requireNewId(ctx, id);
  const label = sourced
    ? op.source!
    : (op.label ?? defaultLabel(kind) ?? declared?.elements[kind]?.label ?? kind);
  const text =
    (op.layout !== undefined
      ? `group ${id} ${quoteString(label)} { layout ${op.layout} }`
      : declarationText(kind, id, label, ctx.diagram.type)) +
    (op.attachedTo !== undefined ? ` on ${op.attachedTo}` : "");
  const { block, owner } = op.parent
    ? groupBlock(ctx, op.parent)
    : { block: diagramBody(ctx), owner: ctx.diagram.node.start };
  if (op.icon !== undefined && !/^[a-z0-9][a-z0-9-]*:[A-Za-z0-9_.-]+$/.test(op.icon)) {
    reject("edit.invalid-value", reasons().elements.badIcon(op.icon));
  }
  if (op.shape !== undefined) {
    if (!(SHAPE_KINDS as readonly string[]).includes(kind)) {
      reject("edit.invalid-value", reasons().elements.shapeKinds(kind));
    }
    if (!(BOX_SHAPES as readonly string[]).includes(op.shape)) {
      reject("edit.invalid-value", reasons().elements.notShape(op.shape, BOX_SHAPES));
    }
  }
  // The icon, the shape and the fill go in a style statement: on the next line in the diagram
  // body, or with the diagram's style statements when the element goes into a group, which takes
  // none. `rounded` is the shape a box has without one.
  const properties = [
    ...(op.icon !== undefined ? [`icon ${quoteString(op.icon)}`] : []),
    ...(op.shape !== undefined && op.shape !== "rounded" ? [`shape ${op.shape}`] : []),
    ...(op.fill !== undefined ? [`fill ${formatStyleValue("fill", op.fill)}`] : []),
  ];
  const styled = properties.length > 0 ? `style ${id} { ${properties.join("; ")} }` : undefined;
  const beside = styled !== undefined && !op.parent ? styled : undefined;
  const render = (indent: string | null) =>
    beside === undefined
      ? text
      : indent === null
        ? `${text}; ${beside}`
        : `${text}${ctx.eol}${indent}${beside}`;
  // Before the declaration at `index`; else after the last one, or a group's own statements.
  const before =
    op.index !== undefined ? block.statements.filter(isDeclaration)[op.index] : undefined;
  const edits: TextEdit[] = [
    ctx.diagram.type === "c4"
      ? insertViewNote(ctx, text)
      : before
        ? insertBeforeStatement(ctx, block, before, render)
        : op.parent
          ? insertIntoBlock(ctx, block, owner, false, render)
          : insertDeclaration(ctx, block, owner, render),
  ];
  // A list places its children: a new one gets no place.
  const listed = isListGroup(ctx, op.parent);
  const placement: string[] = [];
  if (op.at && !listed) {
    const at = { x: Math.round(op.at.x), y: Math.round(op.at.y) };
    requireNumbers(at.x, at.y);
    placement.push(`place ${id} at ${formatPoint(at)}`);
  }
  if (op.size) {
    const size = { x: Math.round(op.size.width), y: Math.round(op.size.height) };
    requireNumbers(size.x, size.y);
    if (size.x <= 0 || size.y <= 0) reject("edit.invalid-value", reasons().values.positiveSize);
    placement.push(`size ${id} ${formatPoint(size)}`);
  }
  const placed = placement.length > 0 ? [insertPlacements(ctx, placement)] : [];
  if (styled !== undefined && op.parent) {
    // After the last style statement of the body, else last. A new placement block inserted at
    // the same offset comes after the existing styles, or before a first one.
    const body = diagramBody(ctx);
    const styles = body.statements.filter((s) => isKeyword(s, "style"));
    const last = styles[styles.length - 1];
    const style = last
      ? insertAfter(ctx, body, last, () => styled)
      : insertStatement(ctx, body, ctx.diagram.node.start, () => styled);
    edits.push(...(last ? [style, ...placed] : [...placed, style]));
  } else edits.push(...placed);
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** Checks that `port` is a compass port, `auto`, or a port the element declares. */
export function requirePortOf(ctx: EditContext, element: string, port: string): void {
  if ((PORTS as readonly string[]).includes(port)) return;
  const declared = requireElement(ctx, element).ports.map((p) => p.name);
  if (!declared.includes(port)) {
    reject("edit.invalid-value", reasons().ports.unknown(element, port, [...declared, ...PORTS]));
  }
}

export function createRelation(ctx: EditContext, op: OperationOf<"createRelation">): TextEdit[] {
  requireElement(ctx, op.from);
  requireElement(ctx, op.to);
  const routed = op.fromPort !== undefined || op.toPort !== undefined;
  if (op.fromPort !== undefined) requirePortOf(ctx, op.from, op.fromPort);
  if (op.toPort !== undefined) requirePortOf(ctx, op.to, op.toPort);
  if (op.fromPosition !== undefined) requireEndPosition(op.fromPort, op.fromPosition);
  if (op.toPosition !== undefined) requireEndPosition(op.toPort, op.toPosition);
  const id = op.id ?? (routed ? freeId(ctx, `${op.from}_${op.to}`, true) : undefined);
  if (id !== undefined) requireNewId(ctx, id);
  const declared = ctx.diagram.definition;
  const profile = declared ? declaredProfile(declared) : PROFILES[ctx.diagram.type];
  const arrow = arrowToken(op.line, op.heads ?? "end");
  if (!Object.hasOwn(profile.arrows, arrow)) {
    reject("edit.invalid-value", reasons().relations.oneWay);
  }
  const text =
    `${op.from} ${arrow} ${op.to}` +
    (op.label !== undefined ? `: ${quoteString(op.label)}` : "") +
    (id !== undefined ? ` as ${id}` : "");
  if (ctx.diagram.type === "sequence" && routed) {
    reject("edit.invalid-value", reasons().relations.messagesNoPorts);
  }
  const body = diagramBody(ctx);
  // Sequence messages go after the last event; other relations after the last relation.
  const relations = body.statements.filter((s) =>
    ctx.diagram.type === "sequence" ? isEventStatement(s) : s.kind === "RelationStatement",
  );
  const last = relations[relations.length - 1];
  const edits: TextEdit[] = [
    last
      ? insertAfter(ctx, body, last, () => text)
      : insertDeclaration(ctx, body, ctx.diagram.node.start, () => text, isDeclaration),
  ];
  if (routed) {
    edits.push(
      insertPlacements(ctx, [
        `route ${id} from ${endpointText(op.from, op.fromPort ?? "auto", op.fromPosition)} to ${endpointText(op.to, op.toPort ?? "auto", op.toPosition)}`,
      ]),
    );
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}
