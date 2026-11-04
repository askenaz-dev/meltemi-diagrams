// The part of fontkit 2.0.4's API this package uses. fontkit ships no type declarations.
declare module "fontkit" {
  export interface Path {
    readonly commands: readonly { command: string; args: number[] }[];
    readonly bbox: { minX: number; minY: number; maxX: number; maxY: number };
    scale(scaleX: number, scaleY?: number): Path;
    translate(x: number, y: number): Path;
    toSVG(): string;
  }

  export interface Glyph {
    readonly id: number;
    readonly codePoints: readonly number[];
    readonly advanceWidth: number;
    readonly path: Path;
  }

  export interface GlyphPosition {
    readonly xAdvance: number;
    readonly yAdvance: number;
    readonly xOffset: number;
    readonly yOffset: number;
  }

  export interface GlyphRun {
    readonly glyphs: readonly Glyph[];
    readonly positions: readonly GlyphPosition[];
    readonly advanceWidth: number;
  }

  export interface Subset {
    includeGlyph(glyph: Glyph | number): number;
    encode(): Uint8Array;
  }

  export interface Font {
    readonly familyName: string;
    readonly unitsPerEm: number;
    readonly capHeight: number;
    readonly ascent: number;
    readonly descent: number;
    readonly italicAngle: number;
    readonly "OS/2": {
      readonly xAvgCharWidth: number;
      readonly usWeightClass: number;
      readonly fsType: number | { readonly [flag: string]: boolean };
      readonly fsSelection: number | { readonly italic?: boolean };
    };
    layout(text: string): GlyphRun;
    hasGlyphForCodePoint(codePoint: number): boolean;
    createSubset(): Subset;
  }

  export function create(buffer: Uint8Array): Font;
}
