import { inflateSync } from "node:zlib";

/** What a PDF file holds, as far as the export checks need. */
export interface PdfFacts {
  readonly pages: number;
  /** The first page's size in points. */
  readonly size: { readonly width: number; readonly height: number } | null;
  /** Embedded font programs (`FontFile`, `FontFile2`, `FontFile3`). */
  readonly embeddedFonts: number;
  /** Text-showing operators in the content streams: the text can be selected and searched. */
  readonly textOperators: number;
  /** Fonts with a map back to characters: copied and searched text reads as written. */
  readonly unicodeMaps: number;
  /** Link annotations with a URI. */
  readonly links: number;
}

/** Reads the facts of a PDF by scanning its objects and inflating its compressed streams. */
export function pdfFacts(bytes: Uint8Array): PdfFacts {
  const buffer = Buffer.from(bytes);
  const text = buffer.toString("latin1");
  if (!text.startsWith("%PDF-")) throw new Error("Not a PDF file.");
  const streams: string[] = [];
  // `endstream` ends with the same word, so a stream starts where the word stands alone.
  const pattern = /(?<!end)stream\r?\n/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    const dictionary = text.slice(Math.max(0, match.index - 400), match.index);
    const body = buffer.subarray(start, end);
    if (/\/FlateDecode/.test(dictionary.slice(dictionary.lastIndexOf("<<")))) {
      try {
        streams.push(inflateSync(body).toString("latin1"));
      } catch {
        // A stream that is not a zlib stream (an image, a font) is not text.
      }
    }
    // A stream without compression is already part of the file's text.
    pattern.lastIndex = end;
  }
  const all = [text, ...streams].join("\n");
  const box = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/.exec(all);
  return {
    pages: (all.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length,
    size: box
      ? { width: Number(box[3]) - Number(box[1]), height: Number(box[4]) - Number(box[2]) }
      : null,
    embeddedFonts: (all.match(/\/FontFile[23]?\b/g) ?? []).length,
    textOperators: streams.reduce((n, s) => n + (s.match(/\b(?:Tj|TJ)\b/g) ?? []).length, 0),
    unicodeMaps: (all.match(/\/ToUnicode\b/g) ?? []).length,
    links: (all.match(/\/URI\s*\(/g) ?? []).length,
  };
}
