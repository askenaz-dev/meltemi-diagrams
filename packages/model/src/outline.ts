import type { ClassDefinition, ClassUse, Element, RuleEntry, StyleEntry } from "./types.js";

/** The style properties that make a note or a free text draw an outline a dash can follow. */
const OUTLINE_PROPERTIES = ["fill", "stroke", "pattern"] as const;

/**
 * A sticky is always filled, and a fill is no line: only a `stroke` gives its card the outline a
 * dash follows.
 */
const STICKY_OUTLINE_PROPERTIES = ["stroke"] as const;

/** What the predicate reads of a diagram: its style statements, classes and rules. */
export interface OutlineSource {
  readonly styles: readonly StyleEntry[];
  readonly classes: readonly ClassDefinition[];
  readonly rules: readonly RuleEntry[];
}

/**
 * Whether an element draws an outline: its own `style` statements, the classes its declaration or
 * those statements apply, or a `rule <kind>` of the diagram set `fill`, `stroke` or `pattern` (a
 * sticky: `stroke`). A theme's rules and classes do not count, since the model resolves no theme.
 */
export function outlined(source: OutlineSource, element: Element): boolean {
  const names: readonly string[] =
    element.kind === "sticky" ? STICKY_OUTLINE_PROPERTIES : OUTLINE_PROPERTIES;
  const writes = (properties: Readonly<Record<string, unknown>>) =>
    names.some((name) => properties[name] !== undefined);
  const entries = source.styles.filter(
    (s) => s.targetKind === "element" && s.target === element.id,
  );
  if (entries.some((entry) => writes(entry.properties))) return true;
  const used: ClassUse[] = [...element.classes, ...entries.flatMap((entry) => entry.classes)];
  for (const use of used) {
    const definition = source.classes.find((c) => c.id === use.name);
    if (definition && writes(definition.properties)) return true;
  }
  return source.rules.some((rule) => rule.kind === element.kind && writes(rule.properties));
}
