// The bounds of a preview's picture, which the tools' descriptions name: a module of constants only,
// so the catalogue reads them without the engine.

/** The PNG width when the request names none, in pixels. */
export const DEFAULT_PNG_WIDTH = 1280;
/** The widest PNG a preview draws; a wider request is refused (`request.invalid`). */
export const MAX_PNG_WIDTH = 2048;
/** The narrowest PNG a preview draws. */
export const MIN_PNG_WIDTH = 16;
/**
 * The most pixels a PNG holds (2048 × 2048). A tall diagram at the asked width would pass it: the
 * picture is then drawn narrower, keeping its proportions, and the report says `fitted`. The bound
 * keeps the rasteriser's memory (four bytes a pixel, in an isolate of 128 MB) in hand.
 */
export const MAX_PNG_PIXELS = MAX_PNG_WIDTH * MAX_PNG_WIDTH;
