import { isIdentifierText, type KeywordStatement, type TextEdit } from "@meltemi/diagrams-language";
import {
  ELEMENT_ONLY_PROPERTIES,
  PROFILES,
  RELATION_ONLY_PROPERTIES,
  STYLE_PROPERTIES,
  type DiagramType,
} from "@meltemi/diagrams-model";
import { insertStatement, reject, requireElement, type EditContext } from "./context.js";
import { deleteStatements } from "./delete.js";
import {
  DIAGRAM_PROPERTY_KEYWORDS,
  diagramBody,
  insertAfter,
  insertDeclaration,
  isKeyword,
  verifyNoNewErrors,
} from "./insert.js";
import { reasons } from "./messages/index.js";
import { removeListItems, type OperationOf } from "./plan.js";
import { requireRelation } from "./relations.js";
import { formatNumber, quoteString } from "./text.js";

/**
 * Writes a style value: bare words for enums, colour tokens and the words of a property that also
 * takes a number (`iconSize auto`), quotes for the rest.
 */
export function formatStyleValue(property: string, value: string | number): string {
  const spec = STYLE_PROPERTIES[property];
  if (!spec) reject("edit.invalid-value", reasons().styles.notProperty(property));
  if (spec.kind === "keywordOrNumber") {
    if (typeof value === "string" && spec.keywords.includes(value)) return value;
    const number = typeof value === "number" ? value : Number(value);
    if (typeof value === "string" && (value.trim() === "" || !Number.isFinite(number)))
      reject("edit.invalid-value", reasons().values.notValueOf(value, property));
    if (!Number.isFinite(number) || number < spec.min || number > spec.max)
      reject("edit.invalid-value", reasons().styles.numberRange(property, spec.min, spec.max));
    return formatNumber(number);
  }
  if (typeof value === "number") {
    if (spec.kind !== "number")
      reject("edit.invalid-value", reasons().styles.wordOrString(property));
    return formatNumber(value);
  }
  switch (spec.kind) {
    case "enum":
      if (!isIdentifierText(value))
        reject("edit.invalid-value", reasons().values.notValueOf(value, property));
      return value;
    case "color": {
      const token = value.startsWith("@") ? value.slice(1) : value;
      return isIdentifierText(token) ? token : quoteString(value);
    }
    case "number": {
      const number = Number(value);
      if (!Number.isFinite(number))
        reject("edit.invalid-value", reasons().values.takesNumber(property));
      return formatNumber(number);
    }
    default:
      return quoteString(value);
  }
}

/** The text of a style block's statements other than `property`, one per entry. */
function otherStatements(
  ctx: EditContext,
  statement: KeywordStatement,
  property: string,
): string[] {
  return (statement.block?.statements ?? [])
    .filter((s) => !isKeyword(s, property))
    .map((s) => ctx.text.slice(s.start, s.end));
}

export function setStyleProperty(
  ctx: EditContext,
  op: OperationOf<"setStyleProperty">,
): TextEdit[] {
  if (op.targetKind === "element" || op.targetKind === "event") {
    // A free line and a pen take a connector's heads (a line its routing and corners too): the
    // model refuses what they do not take once the edit is made.
    let stroke = false;
    if (op.targetKind === "element") {
      const kind = requireElement(ctx, op.target).kind;
      stroke = kind === "line" || kind === "pen";
    } else {
      const event = ctx.diagram.eventsByKey.get(op.target);
      if (!event || event.id !== op.target || event.kind === "message") {
        reject("edit.unsafe-target", reasons().styles.unnamedEvent(op.target));
      }
    }
    if (!stroke && RELATION_ONLY_PROPERTIES.includes(op.property)) {
      reject("edit.invalid-value", reasons().styles.relationsOnly(op.property));
    }
  } else {
    const relation = requireRelation(ctx, op.target);
    if (relation.id === null) {
      reject("edit.anonymous-relation", reasons().styles.nameRelation);
    }
    if (ELEMENT_ONLY_PROPERTIES.includes(op.property)) {
      reject("edit.invalid-value", reasons().styles.elementsOnly(op.property));
    }
  }
  const value = op.value === null ? null : formatStyleValue(op.property, op.value);
  const entries = ctx.diagram.styles.filter(
    (e) => e.target === op.target && e.targetKind === op.targetKind,
  );
  const setting = entries.find((e) =>
    e.node.block?.statements.some((s) => isKeyword(s, op.property)),
  );
  const edits: TextEdit[] = [];

  if (setting) {
    const statement = setting.node;
    const property = statement.block!.statements.find((s) =>
      isKeyword(s, op.property),
    ) as KeywordStatement;
    if (statement.args.length > 1) {
      // A statement shared by several targets loses this one, which gets its own statement.
      const index = statement.args.findIndex((a) => a.start === setting.targetRange.start.offset);
      edits.push(...removeListItems(statement.args, new Set([index])));
      const kept = otherStatements(ctx, statement, op.property);
      if (value !== null) kept.push(`${op.property} ${value}`);
      if (kept.length > 0) {
        edits.push(
          insertAfter(
            ctx,
            diagramBody(ctx),
            statement,
            () => `style ${op.target} { ${kept.join("; ")} }`,
          ),
        );
      }
    } else if (value === null) {
      const left = statement.block!.statements.length;
      edits.push(
        ...deleteStatements(ctx.text, ctx.compilation.parse.root, [
          left === 1 ? statement : property,
        ]),
      );
    } else {
      const first = property.args[0];
      const last = property.args[property.args.length - 1];
      if (!first || !last) reject("edit.unsafe-target", reasons().targets.propertyUnreadable);
      if (ctx.text.slice(first.start, last.end) === value) return [];
      edits.push({ start: first.start, end: last.end, newText: value });
    }
  } else {
    if (value === null) return [];
    const own = entries.find((e) => e.node.args.length === 1 && e.node.block);
    if (own) {
      edits.push(
        insertStatement(ctx, own.node.block!, own.node.start, () => `${op.property} ${value}`),
      );
    } else {
      const body = diagramBody(ctx);
      const styles = body.statements.filter((s) => isKeyword(s, "style"));
      const last = styles[styles.length - 1];
      const text = `style ${op.target} { ${op.property} ${value} }`;
      edits.push(
        last
          ? insertAfter(ctx, body, last, () => text)
          : insertStatement(ctx, body, ctx.diagram.node.start, () => text),
      );
    }
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** Writes a diagram property value: quotes for strings, bare words for enums and names. */
function formatDiagramValue(
  property: string,
  value: string | number,
  profile: DiagramType,
): string {
  const spec = PROFILES[profile].diagramProperties[property];
  if (!spec) {
    reject("edit.invalid-value", reasons().styles.notProfileProperty(property, profile));
  }
  if (spec.kind === "names") {
    const names = String(value)
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "");
    if (names.length === 0 || names.some((name) => !isIdentifierText(name))) {
      reject("edit.invalid-value", reasons().styles.names(property));
    }
    return names.join(", ");
  }
  if (spec.kind === "string") return quoteString(String(value));
  // The scope of a C4 view is an entity path.
  if (property === "scope") {
    const path = String(value);
    if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(path)) {
      reject("edit.invalid-value", reasons().styles.entityPath(path));
    }
    return path;
  }
  if (spec.kind === "number") {
    const number = Number(value);
    if (
      String(value).trim() === "" ||
      !Number.isFinite(number) ||
      (spec.min !== undefined && number < spec.min) ||
      (spec.max !== undefined && number > spec.max)
    ) {
      reject("edit.invalid-value", reasons().styles.numberRange(property, spec.min, spec.max));
    }
    return formatNumber(number);
  }
  if (spec.kind === "size") {
    const match = /^\(?\s*(\d+)\s*[,x×]\s*(\d+)\s*\)?$/.exec(String(value));
    if (!match) reject("edit.invalid-value", reasons().styles.canvasSize);
    return `(${match[1]}, ${match[2]})`;
  }
  const word = String(value);
  if (!isIdentifierText(word))
    reject("edit.invalid-value", reasons().values.notValueOf(word, property));
  return word;
}

export function setDiagramProperty(
  ctx: EditContext,
  op: OperationOf<"setDiagramProperty">,
): TextEdit[] {
  if (!DIAGRAM_PROPERTY_KEYWORDS.has(op.property)) {
    reject("edit.invalid-value", reasons().styles.notDiagramProperty(op.property));
  }
  const body = diagramBody(ctx);
  const statement = body.statements.find((s) => isKeyword(s, op.property));
  const edits: TextEdit[] = [];
  if (op.value === null) {
    if (!statement) return [];
    edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]));
  } else {
    const value = formatDiagramValue(op.property, op.value, ctx.diagram.type);
    if (statement && isKeyword(statement, op.property)) {
      const first = statement.args[0];
      const last = statement.args[statement.args.length - 1];
      if (!first && statement.kind === "KeywordStatement" && !statement.block) {
        // A property written without a value, such as `autonumber`.
        const end = statement.keyword.end;
        edits.push({ start: end, end, newText: ` ${value}` });
        verifyNoNewErrors(ctx, edits);
        return edits;
      }
      if (!first || !last) reject("edit.unsafe-target", reasons().targets.propertyUnreadable);
      if (ctx.text.slice(first.start, last.end) === value) return [];
      edits.push({ start: first.start, end: last.end, newText: value });
    } else {
      edits.push(
        insertDeclaration(
          ctx,
          body,
          ctx.diagram.node.start,
          () => `${op.property} ${value}`,
          (s) => s.kind === "KeywordStatement" && DIAGRAM_PROPERTY_KEYWORDS.has(s.keyword.text),
        ),
      );
    }
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}
