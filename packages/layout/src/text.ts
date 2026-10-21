import type { FontRole } from "./scene.js";

const NARROW = new Set("iljtfrI.,'`:;|!()[]{} ");
const WIDE = new Set("mwMW@%");

/**
 * Estimates the rendered width of a text without a font engine. Boxes with an explicit `size`
 * never depend on it; tags, notes and label pills do. Measurement arrives with the layout engine.
 */
export function estimateTextWidth(text: string, size: number, font: FontRole): number {
  if (font === "mono") return text.length * size * 0.6;
  let width = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) width += 0.32;
    else if (WIDE.has(ch)) width += 0.85;
    else if (ch >= "A" && ch <= "Z") width += 0.68;
    else if (ch >= "0" && ch <= "9") width += 0.58;
    else width += 0.56;
  }
  return width * size;
}

export function splitLines(text: string): string[] {
  return text.split("\n");
}
