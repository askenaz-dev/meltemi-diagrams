import type { FontRole } from "./scene.js";
import { estimateTextWidth } from "./text.js";
import type { Theme } from "./theme.js";

/**
 * Measures text in the font a CSS font stack resolves to. Hosts with fonts pass a real measurer
 * (`@meltemi/diagrams-fonts`); hosts without them use `estimateMeasurer`.
 */
export interface TextMeasurer {
  /** Advance width in pixels of `text`. */
  width(text: string, fontStack: string, weight: number, size: number): number;
  /** Cap height in ems, used to centre text vertically. */
  capHeight(fontStack: string, weight: number): number;
  /** Whether the stack resolves to a font the measurer has metrics for. */
  knows(fontStack: string): boolean;
  /** Characters of `text` no font of the stack covers, when the measurer can tell. */
  uncovered?(text: string, fontStack: string): string[];
}

/** Width estimates from character classes, for hosts without fonts. Cap height 0.7 em. */
export const estimateMeasurer: TextMeasurer = {
  width: (text, fontStack, _weight, size) =>
    estimateTextWidth(text, size, /mono/i.test(fontStack) ? "mono" : "body"),
  capHeight: () => 0.7,
  knows: () => true,
};

/**
 * The font a text is measured and drawn with: the theme's stack of a role (`body` or `mono`), or a
 * stack a style writes (`font "Roboto"`), measured as written and drawn before the role's stack.
 */
export type TextFont = FontRole | { readonly role: FontRole; readonly stack: string };

/** The role of a text font, whose theme stack follows a written one. */
export function fontRole(font: TextFont): FontRole {
  return typeof font === "string" ? font : font.role;
}

/** The stack a style writes for a text, or undefined when it takes its role's. */
export function writtenStack(font: TextFont): string | undefined {
  return typeof font === "string" ? undefined : font.stack;
}

/** A text font from a written stack, or the role alone when none is written. */
export function textFont(stack: string | undefined, role: FontRole = "body"): TextFont {
  return stack === undefined ? role : { role, stack };
}

/** Horizontal padding of the default theme between a box edge and its text (the `padding` token). */
export const TEXT_PADDING = 16;
/** Smallest gap between text and a box edge before `layout.text-overflow` is reported. */
export const MIN_TEXT_MARGIN = 6;

/**
 * Measures the text of one diagram with its theme's fonts and remembers what could not be
 * measured exactly, for the `layout.unmeasured-font` diagnostic.
 */
export class TextMetrics {
  readonly unknownFonts = new Set<string>();
  readonly uncovered = new Set<string>();

  constructor(
    private readonly measurer: TextMeasurer,
    private readonly theme: Theme,
  ) {}

  /**
   * The measurer and stack of a font: the theme's stack of a role, or a written stack alone, so
   * that a stack with no known family is estimated and reported rather than measured with the
   * theme's font.
   */
  private resolve(font: TextFont): { measurer: TextMeasurer; stack: string } {
    const written = writtenStack(font);
    const role = fontRole(font);
    const stack = written ?? (role === "mono" ? this.theme.mono : this.theme.font);
    if (this.measurer.knows(stack)) return { measurer: this.measurer, stack };
    this.unknownFonts.add(stack);
    // Estimates tell monospace text by the stack's name; a written mono text keeps its role.
    return {
      measurer: estimateMeasurer,
      stack: written !== undefined && role === "mono" ? `${stack}, monospace` : stack,
    };
  }

  width(text: string, font: TextFont, weight: number, size: number): number {
    const { measurer, stack } = this.resolve(font);
    for (const ch of measurer.uncovered?.(text, stack) ?? []) this.uncovered.add(ch);
    return measurer.width(text, stack, weight, size);
  }

  /** The baseline of a text centred on `centreY`. */
  baseline(centreY: number, font: TextFont, weight: number, size: number): number {
    const { measurer, stack } = this.resolve(font);
    return centreY + (measurer.capHeight(stack, weight) * size) / 2;
  }
}
