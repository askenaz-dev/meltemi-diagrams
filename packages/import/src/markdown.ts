import type { Span } from "@meltemi/diagrams-language";
import type { SourceFormat } from "./report.js";

/** A fenced diagram block of a Markdown file. */
export interface MarkdownBlock {
  readonly format: SourceFormat;
  /** Offsets of the block's content, between the fences. */
  readonly start: number;
  readonly end: number;
  /** The fence line, for findings about the whole block. */
  readonly fence: Span;
  /** The nearest heading above the block. */
  readonly heading: string | null;
}

/** The fenced `mermaid`, `plantuml` and `puml` blocks of a Markdown text, in order. */
export function markdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lineRe = /[^\n]*(\n|$)/g;
  let heading: string | null = null;
  let open: {
    marker: string;
    format: SourceFormat | null;
    contentStart: number;
    fence: Span;
  } | null = null;
  for (let m = lineRe.exec(text); m && m[0] !== ""; m = lineRe.exec(text)) {
    const lineStart = m.index;
    const raw = m[0].replace(/\r?\n$/, "");
    const lineEnd = lineStart + raw.length;
    if (open) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(raw);
      if (close && close[1]![0] === open.marker[0] && close[1]!.length >= open.marker.length) {
        if (open.format) {
          blocks.push({
            format: open.format,
            start: open.contentStart,
            end: Math.max(open.contentStart, lineStart - 1),
            fence: open.fence,
            heading,
          });
        }
        open = null;
      }
      continue;
    }
    const fence = /^ {0,3}(`{3,}|~{3,})\s*\{?\s*([A-Za-z0-9_-]*)/.exec(raw);
    if (fence) {
      const info = fence[2]!.toLowerCase();
      const format: SourceFormat | null =
        info === "mermaid" ? "mermaid" : info === "plantuml" || info === "puml" ? "plantuml" : null;
      open = {
        marker: fence[1]!,
        format,
        contentStart: m[1] === "" ? lineEnd : lineStart + m[0].length,
        fence: { start: lineStart, end: lineEnd },
      };
      continue;
    }
    const atx = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
    if (atx) heading = atx[1]!.trim();
  }
  if (open?.format) {
    blocks.push({
      format: open.format,
      start: open.contentStart,
      end: text.length,
      fence: open.fence,
      heading,
    });
  }
  return blocks;
}
