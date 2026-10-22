import type { EditOperation } from "@meltemi/diagrams-edit";
import {
  ANIMATION_DEFAULT_DURATIONS,
  ANIMATION_DIRECTIONS,
  ANIMATION_EFFECT_PROPERTIES,
  type AnimationEffect,
  type AnimationEntry,
  type FlowDiagram,
} from "@meltemi/diagrams-model";
import type { InspectorField } from "./canvas/protocol.js";
import { messages } from "./messages/index.js";
import { namedNotice, styleTargets } from "./targets.js";

/** The name of an effect in the inspector and the strip, in the interface language. */
export function effectLabel(effect: AnimationEffect): string {
  return messages().effects[effect];
}

const DEFAULT_DURATION: Readonly<Record<AnimationEffect, number>> = ANIMATION_DEFAULT_DURATIONS;

/** Element kinds without an outline, which take no moving dash. */
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

/** The effects a target can take, in the order the inspector lists them. */
export function effectsFor(
  diagram: FlowDiagram,
  id: string,
  kind: "element" | "relation" | "event",
): AnimationEffect[] {
  if (kind === "relation") return ["flow", "dash", "pulse", "trace"];
  if (kind === "event") return ["pulse"];
  const element = diagram.elementsById.get(id);
  return element && NO_OUTLINE.has(element.kind) ? ["pulse"] : ["pulse", "dash"];
}

/**
 * The Effects section of a target: each effect as on or off and, when on, its timing and the
 * properties that apply to it. Times are shown in milliseconds.
 */
export function effectFields(
  diagram: FlowDiagram,
  id: string,
  kind: "element" | "relation" | "event",
): InspectorField[] {
  const words = messages();
  const fields: InspectorField[] = [];
  for (const effect of effectsFor(diagram, id, kind)) {
    const entry = diagram.animations.find(
      (e: AnimationEntry) => e.target === id && e.targetKind === kind && e.effect === effect,
    );
    const name = words.effects[effect];
    fields.push({
      name: `effect.${effect}`,
      label: name,
      type: "enum",
      value: entry ? "on" : null,
      placeholder: "off",
      options: ["off", "on"],
    });
    if (!entry) continue;
    const prefix = `effect.${effect}`;
    const label = (field: keyof typeof words.effectFields) =>
      words.effectField(name, words.effectFields[field]);
    fields.push(
      {
        name: `${prefix}.duration`,
        label: label("duration"),
        type: "number",
        value: entry.durationMs,
        placeholder: String(DEFAULT_DURATION[effect]),
      },
      {
        name: `${prefix}.repeat`,
        label: label("repeat"),
        type: "text",
        value: entry.repeat === null ? null : String(entry.repeat),
        // `forever` is what `repeat` takes when written, so it stays as the language writes it.
        placeholder: "forever",
      },
      {
        name: `${prefix}.delay`,
        label: label("delay"),
        type: "number",
        value: entry.delayMs,
        placeholder: "0",
      },
    );
    const extra = ANIMATION_EFFECT_PROPERTIES[effect];
    if (extra.includes("direction")) {
      fields.push({
        name: `${prefix}.direction`,
        label: label("direction"),
        type: "enum",
        value: entry.direction,
        placeholder: "forward",
        options: ANIMATION_DIRECTIONS,
      });
    }
    if (extra.includes("particles")) {
      fields.push({
        name: `${prefix}.particles`,
        label: label("particles"),
        type: "number",
        value: entry.particles,
        placeholder: "1",
      });
    }
    if (extra.includes("color")) {
      fields.push({
        name: `${prefix}.color`,
        label: label("colour"),
        type: "color",
        value:
          entry.color === null
            ? null
            : entry.color.startsWith("@")
              ? entry.color.slice(1)
              : entry.color,
        placeholder: words.placeholders.linesColour,
      });
    }
  }
  return fields;
}

/** The operations of an `effect.*` inspector field, or a reason when the target cannot take it. */
export function effectOperations(
  diagram: FlowDiagram,
  ids: readonly string[],
  field: string,
  value: string | number | null,
): { ok: true; operations: EditOperation[]; notice?: string } | { ok: false; reason: string } {
  const [, effect, property] = field.split(".") as [string, AnimationEffect, string | undefined];
  // Turning an effect off names nothing: an anonymous relation, note or fragment has no effect
  // to remove.
  const off = property === undefined && String(value ?? "").trim() !== "on";
  const anonymous = (id: string) =>
    (diagram.relationsByKey.get(id) ?? diagram.eventsByKey.get(id))?.id === null;
  const resolved = styleTargets(diagram, off ? ids.filter((id) => !anonymous(id)) : ids);
  if (!resolved.ok) return resolved;
  const operations: EditOperation[] = [...resolved.operations];
  for (const { target, targetKind } of resolved.targets) {
    const text = value === null ? "" : String(value).trim();
    if (property === undefined) {
      operations.push(
        text === "on"
          ? { kind: "setAnimation", diagram: diagram.id, target, targetKind, effect }
          : { kind: "removeAnimation", diagram: diagram.id, target, effect },
      );
      continue;
    }
    const numeric = ["duration", "delay", "particles"].includes(property);
    const written =
      text === ""
        ? null
        : numeric
          ? Number(text)
          : property === "repeat" && text !== "forever"
            ? Number(text)
            : text;
    operations.push({
      kind: "setAnimation",
      diagram: diagram.id,
      target,
      targetKind,
      effect,
      property: property as "duration" | "repeat" | "delay" | "direction" | "particles" | "color",
      value: written,
    });
  }
  const notice = namedNotice(resolved.named);
  return {
    ok: true,
    operations,
    ...(notice ? { notice, select: selectionAfter(ids, resolved.targets) } : {}),
  };
}

/** The selection once anonymous relations among `ids` have been named: their new ids. */
export function selectionAfter(
  ids: readonly string[],
  targets: readonly { id: string; target: string }[],
): string[] {
  return ids.map((id) => targets.find((t) => t.id === id)?.target ?? id);
}
