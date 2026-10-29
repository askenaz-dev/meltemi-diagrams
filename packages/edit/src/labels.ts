import {
  isIdentifierText,
  isToken,
  type Block,
  type KeywordStatement,
  type ShorthandDeclaration,
  type TextEdit,
} from "@meltemi/diagrams-language";
import { takesShape, type ElementKind } from "@meltemi/diagrams-model";
import { insertStatement, reject, requireElement, type EditContext } from "./context.js";
import { declarationText } from "./create.js";
import { deleteStatements } from "./delete.js";
import { declareImplicit, isKeyword } from "./insert.js";
import type { OperationOf } from "./plan.js";
import { requireRelation } from "./relations.js";
import { setStyleProperty } from "./styles.js";
import { reasons } from "./messages/index.js";
import { quoteString } from "./text.js";

type Declaration = ShorthandDeclaration | KeywordStatement;

/** The string literal that holds the label of a declaration, if it is written. */
function labelToken(node: Declaration): { start: number; end: number; text: string } | undefined {
  if (node.kind === "ShorthandDeclaration") {
    return isToken(node.label) ? node.label : undefined;
  }
  const label = node.args[1];
  return label?.kind === "StringLiteral" ? label.token : undefined;
}

export function setElementLabel(ctx: EditContext, op: OperationOf<"setElementLabel">): TextEdit[] {
  const element = requireElement(ctx, op.element);
  if (element.kind === "icon" || element.kind === "image") {
    reject("edit.unsafe-target", reasons().elements.sourcedLabel(element.id, element.kind));
  }
  if (element.kind === "pen") reject("edit.unsafe-target", reasons().pens.noLabel(element.id));
  const quoted = quoteString(op.label);
  const node = element.node;
  if (!node) {
    return [
      declareImplicit(
        ctx,
        element,
        declarationText(element.kind, element.id, op.label, ctx.diagram.type),
      ),
    ];
  }
  const token = labelToken(node);
  if (token)
    return token.text === quoted ? [] : [{ start: token.start, end: token.end, newText: quoted }];
  if (node.kind === "KeywordStatement") {
    const id = node.args[0];
    if (!id) reject("edit.unsafe-target", reasons().elements.declarationNoId);
    return [{ start: id.end, end: id.end, newText: ` ${quoted}` }];
  }
  reject("edit.unsafe-target", reasons().elements.labelUnreadable);
}

/** The block of an element's declaration or of a relation statement. */
function blockOf(node: Declaration | { block: Block | undefined }): Block | undefined {
  return node.block;
}

export function setDescription(ctx: EditContext, op: OperationOf<"setDescription">): TextEdit[] {
  let node: Declaration | { start: number; end: number; block: Block | undefined };
  if (op.targetKind === "element") {
    const element = requireElement(ctx, op.target);
    if (!element.node) {
      if (op.description === null) return [];
      return [
        declareImplicit(
          ctx,
          element,
          `${declarationText(element.kind, element.id, element.label, ctx.diagram.type)} { description ${quoteString(op.description)} }`,
        ),
      ];
    }
    node = element.node;
  } else {
    node = requireRelation(ctx, op.target).node;
  }
  const block = blockOf(node);
  const statement = block?.statements.find((s) => isKeyword(s, "description"));
  if (op.description === null) {
    if (!statement || !block) return [];
    // A block left empty goes with its last statement.
    if (block.statements.length === 1)
      return [{ start: block.fullStart, end: block.end, newText: "" }];
    return deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]);
  }
  const quoted = quoteString(op.description);
  if (statement && isKeyword(statement, "description")) {
    const value = statement.args[0];
    if (value?.kind !== "StringLiteral") {
      reject("edit.unsafe-target", reasons().elements.descriptionUnreadable);
    }
    if (value.token.text === quoted) return [];
    return [{ start: value.token.start, end: value.token.end, newText: quoted }];
  }
  if (block) return [insertStatement(ctx, block, node.start, () => `description ${quoted}`)];
  return [{ start: node.end, end: node.end, newText: ` { description ${quoted} }` }];
}

export function setElementKind(ctx: EditContext, op: OperationOf<"setElementKind">): TextEdit[] {
  const element = requireElement(ctx, op.element);
  if (element.kind === "group") {
    reject("edit.unsafe-target", reasons().elements.groupKind);
  }
  if (element.kind === op.elementKind) return [];
  const kind: ElementKind = op.elementKind;
  const allowed =
    ctx.diagram.type === "free"
      ? ["box", "text"]
      : ctx.diagram.type === "sequence"
        ? [
            "participant",
            "actor",
            "boundary",
            "control",
            "entity",
            "database",
            "collections",
            "queue",
          ]
        : ["node", "decision", "data", "note", "tag"];
  if (!allowed.includes(kind) || !allowed.includes(element.kind)) {
    reject("edit.invalid-value", reasons().elements.cannotBecome(element.id, kind, allowed));
  }
  // A kind that draws its own shape cannot keep a `shape` style.
  const unshaped =
    !takesShape(kind) &&
    ctx.diagram.styles.some(
      (e) =>
        e.targetKind === "element" &&
        e.target === element.id &&
        e.node.block?.statements.some((s) => isKeyword(s, "shape")),
    )
      ? setStyleProperty(ctx, {
          kind: "setStyleProperty",
          diagram: op.diagram,
          target: element.id,
          targetKind: "element",
          property: "shape",
          value: null,
        })
      : [];
  const node = element.node;
  if (!node) {
    return [
      declareImplicit(
        ctx,
        element,
        declarationText(kind, element.id, element.label, ctx.diagram.type),
      ),
      ...unshaped,
    ];
  }
  // Keep the written label, escapes included, and the block as it is.
  const token = labelToken(node);
  const label = token?.text ?? quoteString(element.label);
  const head =
    kind === "node"
      ? `${element.id}[${label}]`
      : kind === "data"
        ? `${element.id}[(${label})]`
        : `${kind} ${element.id} ${label}`;
  const end = node.block ? node.block.fullStart : node.end;
  return [{ start: node.start, end, newText: head }, ...unshaped];
}

export function setClasses(ctx: EditContext, op: OperationOf<"setClasses">): TextEdit[] {
  for (const name of op.classes) {
    if (!isIdentifierText(name)) reject("edit.invalid-value", reasons().elements.notClass(name));
  }
  const text = `class ${op.classes.join(", ")}`;
  let node: Declaration | { start: number; end: number; block: Block | undefined };
  if (op.targetKind === "element") {
    const element = requireElement(ctx, op.target);
    if (!element.node) {
      if (op.classes.length === 0) return [];
      return [
        declareImplicit(
          ctx,
          element,
          `${declarationText(element.kind, element.id, element.label, ctx.diagram.type)} { ${text} }`,
        ),
      ];
    }
    node = element.node;
  } else {
    node = requireRelation(ctx, op.target).node;
  }
  const block = node.block;
  const statement = block?.statements.find((s) => isKeyword(s, "class"));
  if (op.classes.length === 0) {
    if (!statement || !block) return [];
    if (block.statements.length === 1)
      return [{ start: block.fullStart, end: block.end, newText: "" }];
    return deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]);
  }
  if (statement) {
    if (ctx.text.slice(statement.start, statement.end) === text) return [];
    return [{ start: statement.start, end: statement.end, newText: text }];
  }
  if (block) return [insertStatement(ctx, block, node.start, () => text)];
  return [{ start: node.end, end: node.end, newText: ` { ${text} }` }];
}
