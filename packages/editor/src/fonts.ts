import {
  BUNDLED_FAMILIES,
  FONT_GROUPS,
  resolveFontStack,
  type FamilyInfo,
} from "@meltemi/diagrams-fonts";
import { StyleResolver, type ResolvedStyle, type Theme } from "@meltemi/diagrams-layout";
import { TEXTLESS_KINDS, type FlowDiagram } from "@meltemi/diagrams-model";
import { fontFaceRule, type FontProvider } from "@meltemi/diagrams-render";
import type { FontOption } from "./canvas/protocol.js";

/**
 * The common text sizes the strip's size list offers and its − and + buttons, and the text size
 * keys, step along (decision 0067). Any size from 6 to 160 may still be typed.
 */
export const FONT_SIZE_STEPS: readonly number[] = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96,
];

/**
 * The size one step of the list up (1) or down (-1) from `size`: the next larger or smaller
 * common size, so that a size between two of them steps to the nearer one in that direction;
 * undefined past the ends of the list.
 */
export function stepFontSize(size: number, step: 1 | -1): number | undefined {
  if (step > 0) return FONT_SIZE_STEPS.find((s) => s > size + 1e-9);
  return [...FONT_SIZE_STEPS].reverse().find((s) => s < size - 1e-9);
}

/** A target of the selection: an element, a relation or a sequence event, by its id or key. */
export interface TextTarget {
  readonly id: string;
  readonly kind: "element" | "relation" | "event";
}

/** What a target's text draws: its family (the first of its stack), size and weight. */
export interface TextFace {
  readonly family: string;
  readonly size: number;
  readonly weight: number;
}

/** The first family of a CSS font stack, without quotes. */
export function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/**
 * The family a theme's stack draws with: its first bundled family (`ui-monospace, "Cascadia
 * Mono", …` is Cascadia Mono), else its first family.
 */
export function stackFamily(stack: string): string {
  return resolveFontStack(stack) ?? firstFamily(stack);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The family, size and weight a target's text takes from the theme when its styles write none,
 * as the layout draws it: labels at `labelSize` and `labelWeight`, free texts 1.6 times that,
 * stickies 1.2 times at 400, group titles at `groupTitleSize`, notes at `noteSize` and 400, tags
 * in the mono font at `tagSize` and 500, relation labels at `relationLabelSize` and 500 (400 for
 * sequence messages), a fragment's operator at 600. Undefined for what draws no text.
 */
export function themeText(
  theme: Theme,
  diagram: FlowDiagram,
  target: TextTarget,
): TextFace | undefined {
  const body = stackFamily(theme.font);
  if (target.kind === "relation") {
    const weight = diagram.type === "sequence" ? 400 : 500;
    return { family: body, size: theme.relationLabelSize, weight };
  }
  if (target.kind === "event") {
    const event = diagram.eventsByKey.get(target.id);
    if (event?.kind === "note") return { family: body, size: theme.noteSize, weight: 400 };
    if (event?.kind === "fragment") {
      return { family: body, size: theme.relationLabelSize, weight: 600 };
    }
    return undefined;
  }
  const element = diagram.elementsById.get(target.id);
  if (!element || TEXTLESS_KINDS.includes(element.kind)) return undefined;
  switch (element.kind) {
    case "text":
      return { family: body, size: Math.round(theme.labelSize * 1.6), weight: theme.labelWeight };
    case "sticky":
      return { family: body, size: round2(theme.labelSize * 1.2), weight: 400 };
    case "group":
      return { family: body, size: theme.groupTitleSize, weight: theme.labelWeight };
    case "note":
      return { family: body, size: theme.noteSize, weight: 400 };
    case "tag":
      return { family: stackFamily(theme.mono), size: theme.tagSize, weight: 500 };
    case "line":
      return { family: body, size: theme.relationLabelSize, weight: 500 };
    default:
      return { family: body, size: theme.labelSize, weight: theme.labelWeight };
  }
}

/** The style a target resolves to through rules, classes and its own statements. */
export function resolvedStyle(
  resolver: StyleResolver,
  diagram: FlowDiagram,
  target: TextTarget,
): ResolvedStyle {
  if (target.kind === "relation") {
    const relation = diagram.relationsByKey.get(target.id);
    return relation ? resolver.relation(relation) : {};
  }
  if (target.kind === "event") {
    const event = diagram.eventsByKey.get(target.id);
    return event?.kind === "note" || event?.kind === "fragment"
      ? resolver.event(event.id ?? event.key, event.kind)
      : {};
  }
  const element = diagram.elementsById.get(target.id);
  return element ? resolver.element(element) : {};
}

/**
 * What a target's text draws with its rules and classes but without its own `style` statements
 * being asked for separately: the resolved family, size and weight over the theme's.
 */
export function drawnText(
  theme: Theme,
  diagram: FlowDiagram,
  target: TextTarget,
  resolver: StyleResolver = new StyleResolver(theme, diagram),
): TextFace | undefined {
  const base = themeText(theme, diagram, target);
  if (!base) return undefined;
  const style = resolvedStyle(resolver, diagram, target);
  return {
    family: style.font ? firstFamily(style.font) : base.family,
    size: style.fontSize ?? base.size,
    weight: style.fontWeight ?? base.weight,
  };
}

/**
 * The families text can be measured with: the provider's catalogue (bundled families by group,
 * then the project's fonts), or the bundled families when the host measures with estimates.
 */
export function fontFamilies(provider: FontProvider | undefined): FamilyInfo[] {
  const catalogue = (provider as { families?: () => FamilyInfo[] } | undefined)?.families?.();
  return (
    catalogue ??
    [...BUNDLED_FAMILIES]
      .sort((a, b) => FONT_GROUPS.indexOf(a.group) - FONT_GROUPS.indexOf(b.group))
      .map((f) => ({
        family: f.family,
        group: f.group,
        weights: f.weights,
        license: f.license,
        source: "bundled" as const,
        restricted: false,
      }))
  );
}

/** What a written stack is measured with: a family of the catalogue, or nothing (estimates). */
export function measuredFamily(
  provider: FontProvider | undefined,
  stack: string,
): FamilyInfo | undefined {
  const families = fontFamilies(provider);
  const name = provider?.family(stack);
  if (name !== undefined) return families.find((f) => f.family === name);
  // Without a provider, a stack is measured with a bundled family when it names one.
  for (const part of stack.split(",")) {
    const word = part
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase();
    const found = families.find((f) => f.family.toLowerCase() === word);
    if (found) return found;
  }
  return undefined;
}

/** The most bytes of font data a picker row's faces may carry: a project font is a whole file. */
const ROW_FACE_LIMIT = 256 * 1024;

/** The rules of each family's row, by provider, kept while it lives; empty answers are not kept. */
const rowFaces = new WeakMap<object, Map<string, readonly string[]>>();

/**
 * The families the font picker lists: the provider's catalogue (bundled families by group, then
 * the project's fonts), each with the `@font-face` rules of its row's glyphs. Without a provider
 * (a host that measures with estimates) the bundled families are listed without faces.
 */
export function fontOptions(provider: FontProvider | undefined): FontOption[] {
  const families = fontFamilies(provider);
  const known = provider ? (rowFaces.get(provider) ?? new Map()) : new Map();
  if (provider) rowFaces.set(provider, known);
  return families.map((info) => {
    let faces = known.get(info.family);
    if (!faces && provider && !info.restricted) {
      const sample = `${info.family} Aa`;
      const found = provider.faces(info.family, 400, sample);
      const bytes = found.reduce((sum, face) => sum + face.data.length, 0);
      faces = bytes <= ROW_FACE_LIMIT ? found.map(fontFaceRule) : [];
      if (found.length > 0) known.set(info.family, faces);
    }
    return {
      family: info.family,
      group: info.group,
      weights: [...info.weights],
      faces: faces ?? [],
      ...(info.restricted ? { restricted: true } : {}),
    };
  });
}
