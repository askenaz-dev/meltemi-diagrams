import { isIdentifierText, type KeywordStatement, type TextEdit } from "@meltemi/diagrams-language";
import {
  ANIMATION_DIRECTIONS,
  ANIMATION_EFFECT_PROPERTIES,
  ANIMATION_LIMITS,
  type AnimationEffect,
  type AnimationEntry,
} from "@meltemi/diagrams-model";
import { insertStatement, reject, requireElement, type EditContext } from "./context.js";
import { deleteStatements } from "./delete.js";
import { diagramBody, insertAfter, isKeyword, verifyNoNewErrors } from "./insert.js";
import { reasons } from "./messages/index.js";
import { removeListItems, type OperationOf } from "./plan.js";
import { requireRelation } from "./relations.js";
import { formatNumber, quoteString } from "./text.js";

/** Element kinds drawn without an outline, which a moving dash cannot follow. */
const NO_OUTLINE = new Set([
  "note",
  "text",
  "icon",
  "image",
  "actor",
  "boundary",
  "control",
  "entity",
]);

export const ANIMATION_PROPERTIES = [
  "duration",
  "repeat",
  "delay",
  "direction",
  "particles",
  "color",
] as const;
export type AnimationProperty = (typeof ANIMATION_PROPERTIES)[number];

/** Whether a property can be written for an effect. */
export function animationPropertyApplies(effect: AnimationEffect, property: string): boolean {
  return (
    ["duration", "repeat", "delay"].includes(property) ||
    ANIMATION_EFFECT_PROPERTIES[effect].includes(property)
  );
}

function requireTarget(
  ctx: EditContext,
  target: string,
  kind: "element" | "relation" | "event",
  effect: AnimationEffect,
): void {
  if (kind === "element") {
    const element = requireElement(ctx, target);
    // A free line and a pen are connectors without ends: every effect runs along their stroke.
    if (element.kind === "line" || element.kind === "pen") return;
    if (effect === "flow") reject("edit.invalid-value", reasons().animations.flowOnBoxes);
    if (effect === "trace") reject("edit.invalid-value", reasons().animations.traceOnBoxes);
    if (effect === "dash" && NO_OUTLINE.has(element.kind)) {
      reject("edit.invalid-value", reasons().animations.noOutline(target));
    }
    return;
  }
  if (kind === "relation") {
    const relation = requireRelation(ctx, target);
    if (relation.id === null) {
      reject("edit.anonymous-relation", reasons().animations.nameRelation);
    }
    return;
  }
  const event = ctx.diagram.eventsByKey.get(target);
  if (!event || event.id !== target || event.kind === "message") {
    reject("edit.unsafe-target", reasons().animations.unnamedEvent(target));
  }
  if (effect !== "pulse") reject("edit.invalid-value", reasons().animations.pulseOnly);
}

/** Writes an animation value as the language reads it; times are milliseconds. */
export function formatAnimationValue(property: string, value: string | number): string {
  switch (property) {
    case "duration":
    case "delay": {
      const ms = typeof value === "number" ? value : Number(value);
      const min = property === "duration" ? ANIMATION_LIMITS.minDuration : 0;
      const max =
        property === "duration" ? ANIMATION_LIMITS.maxDuration : ANIMATION_LIMITS.maxDelay;
      if (!Number.isFinite(ms) || ms < min || ms > max) {
        reject("edit.invalid-value", reasons().animations.timeRange(property, min, max));
      }
      return `${formatNumber(ms)}ms`;
    }
    case "repeat": {
      if (value === "forever") return "forever";
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n) || n < 1 || n > ANIMATION_LIMITS.maxRepeat) {
        reject("edit.invalid-value", reasons().animations.repeatRange(ANIMATION_LIMITS.maxRepeat));
      }
      return String(n);
    }
    case "particles": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n) || n < 1 || n > ANIMATION_LIMITS.maxParticles) {
        reject(
          "edit.invalid-value",
          reasons().animations.particlesRange(ANIMATION_LIMITS.maxParticles),
        );
      }
      return String(n);
    }
    case "direction":
      if (!(ANIMATION_DIRECTIONS as readonly string[]).includes(String(value))) {
        reject("edit.invalid-value", reasons().animations.direction);
      }
      return String(value);
    case "color": {
      const text = String(value);
      const token = text.startsWith("@") ? text.slice(1) : text;
      return isIdentifierText(token) ? token : quoteString(text);
    }
    default:
      return reject("edit.invalid-value", reasons().animations.notProperty(property));
  }
}

function entryFor(
  ctx: EditContext,
  target: string,
  kind: string,
  effect: AnimationEffect,
): AnimationEntry | undefined {
  return ctx.diagram.animations.find(
    (e) => e.target === target && e.targetKind === kind && e.effect === effect,
  );
}

/**
 * Makes sure a target has an `animate` statement with an effect, and sets or (with `null`) removes
 * one of its properties. A statement shared by several targets is split.
 */
export function setAnimation(ctx: EditContext, op: OperationOf<"setAnimation">): TextEdit[] {
  requireTarget(ctx, op.target, op.targetKind, op.effect);
  const property = op.property;
  if (property !== undefined && !animationPropertyApplies(op.effect, property)) {
    reject("edit.invalid-value", reasons().animations.notForEffect(property, op.effect));
  }
  const value =
    property === undefined || op.value === undefined || op.value === null
      ? null
      : formatAnimationValue(property, op.value);
  const entry = entryFor(ctx, op.target, op.targetKind, op.effect);
  const edits: TextEdit[] = [];
  if (!entry) {
    if (property !== undefined && value === null) return [];
    const inner = [
      `effect ${op.effect}`,
      ...(property !== undefined && value !== null ? [`${property} ${value}`] : []),
    ];
    const text = `animate ${op.target} { ${inner.join("; ")} }`;
    const body = diagramBody(ctx);
    const anchors = body.statements.filter((s) => isKeyword(s, "animate") || isKeyword(s, "style"));
    const last = anchors[anchors.length - 1];
    edits.push(
      last
        ? insertAfter(ctx, body, last, () => text)
        : insertStatement(ctx, body, ctx.diagram.node.start, () => text),
    );
    verifyNoNewErrors(ctx, edits);
    return edits;
  }
  if (property === undefined) return [];
  const statement = entry.node;
  const block = statement.block!;
  const written = block.statements.find((s) => isKeyword(s, property)) as
    KeywordStatement | undefined;
  if (statement.args.length > 1) {
    // The target leaves the shared statement and gets its own copy with the change.
    const index = statement.args.findIndex((a) => a.start === entry.targetRange.start.offset);
    edits.push(...removeListItems(statement.args, new Set([index])));
    const kept = block.statements
      .filter((s) => !isKeyword(s, property))
      .map((s) => ctx.text.slice(s.start, s.end));
    if (value !== null) kept.push(`${property} ${value}`);
    edits.push(
      insertAfter(
        ctx,
        diagramBody(ctx),
        statement,
        () => `animate ${op.target} { ${kept.join("; ")} }`,
      ),
    );
  } else if (written) {
    if (value === null) {
      edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, [written]));
    } else {
      const first = written.args[0];
      const last = written.args[written.args.length - 1];
      if (!first || !last) reject("edit.unsafe-target", reasons().targets.propertyUnreadable);
      if (ctx.text.slice(first.start, last.end) === value) return [];
      edits.push({ start: first.start, end: last.end, newText: value });
    }
  } else {
    if (value === null) return [];
    edits.push(insertStatement(ctx, block, statement.start, () => `${property} ${value}`));
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** Removes a target's effect: the target leaves its statement, or the statement goes. */
export function removeAnimation(ctx: EditContext, op: OperationOf<"removeAnimation">): TextEdit[] {
  const entry = ctx.diagram.animations.find(
    (e) => e.target === op.target && e.effect === op.effect,
  );
  if (!entry) return [];
  const statement = entry.node;
  const edits: TextEdit[] =
    statement.args.length > 1
      ? removeListItems(
          statement.args,
          new Set([statement.args.findIndex((a) => a.start === entry.targetRange.start.offset)]),
        )
      : deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]);
  verifyNoNewErrors(ctx, edits);
  return edits;
}
