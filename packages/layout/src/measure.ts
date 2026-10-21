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

  private resolve(role: FontRole): { measurer: TextMeasurer; stack: string } {
    const stack = role === "mono" ? this.theme.mono : this.theme.font;
    if (this.measurer.knows(stack)) return { measurer: this.measurer, stack };
    this.unknownFonts.add(stack);
    return { measurer: estimateMeasurer, stack };
  }

  width(text: string, role: FontRole, weight: number, size: number): number {
    const { measurer, stack } = this.resolve(role);
    for (const ch of measurer.uncovered?.(text, stack) ?? []) this.uncovered.add(ch);
    return measurer.width(text, stack, weight, size);
  }

  /** The baseline of a text centred on `centreY`. */
  baseline(centreY: number, role: FontRole, weight: number, size: number): number {
    const { measurer, stack } = this.resolve(role);
    return centreY + (measurer.capHeight(stack, weight) * size) / 2;
  }
}
