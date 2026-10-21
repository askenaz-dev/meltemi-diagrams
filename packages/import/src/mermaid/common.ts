import type { Span } from "@meltemi/diagrams-language";
import { messages } from "../messages/index.js";
import type { Reporter, SourceLine } from "../report.js";
import { cssValue, type Props } from "../writer.js";

/** One Mermaid statement: a line or a `;`-separated part, possibly joined over several lines. */
export interface Statement {
  readonly text: string;
  readonly span: Span;
  /** Offset of `text[0]` in the original file, or -1 when the text was joined from lines. */
  readonly offset: number;
  /** Comments written on their own lines just before the statement. */
  readonly comments: string[];
}

/** The span of `text.slice(index, index + length)` of a statement. */
export function partSpan(st: Statement, index: number, length: number): Span {
  if (st.offset < 0 || index < 0) return st.span;
  return { start: st.offset + index, end: st.offset + index + length };
}

/** Depth change of brackets outside quotes, used to join statements that span lines. */
function openCount(text: string, braces: boolean): number {
  let depth = 0;
  let quote = false;
  for (const ch of text) {
    if (ch === '"') quote = !quote;
    else if (quote) continue;
    else if (ch === "[" || ch === "(" || (braces && ch === "{")) depth++;
    else if (ch === "]" || ch === ")" || (braces && ch === "}")) depth--;
  }
  return quote ? Math.max(depth, 1) : depth;
}

/**
 * Splits lines into statements: `%%` lines become comments of the next statement, `;` separates
 * statements outside quotes and brackets, and a line that leaves a bracket or quote open is joined
 * with the following ones. Without `braces`, `{` and `}` open and close blocks instead.
 */
export function splitStatements(
  lines: readonly SourceLine[],
  options: { semicolons?: boolean; braces?: boolean } = {},
): { statements: Statement[]; trailing: string[] } {
  const statements: Statement[] = [];
  let comments: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.text.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("%%")) {
      if (!trimmed.startsWith("%%{")) comments.push(trimmed.slice(2).trim());
      continue;
    }
    let text = line.text;
    let span: Span = line.span;
    let offset = line.generated ? -1 : line.start;
    const braces = options.braces !== false;
    if (openCount(text, braces) > 0) {
      // Join only when a later line closes what this one opened.
      let joined = text;
      for (let j = i + 1; j < lines.length; j++) {
        joined += "\n" + lines[j]!.text;
        if (openCount(joined, braces) <= 0) {
          text = joined;
          span = { start: span.start, end: lines[j]!.span.end };
          offset = -1;
          i = j;
          break;
        }
      }
    }
    const parts = options.semicolons === false ? [{ text, index: 0 }] : splitOutside(text, ";");
    for (const part of parts) {
      const lead = part.text.length - part.text.trimStart().length;
      const body = part.text.trim();
      if (body === "") continue;
      statements.push({
        text: body,
        span:
          offset >= 0
            ? { start: offset + part.index + lead, end: offset + part.index + lead + body.length }
            : span,
        offset: offset >= 0 ? offset + part.index + lead : -1,
        comments,
      });
      comments = [];
    }
  }
  return { statements, trailing: comments };
}

/** Splits on a separator outside quotes and brackets, with each part's index. */
export function splitOutside(text: string, separator: string): { text: string; index: number }[] {
  const parts: { text: string; index: number }[] = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quote = !quote;
    else if (quote) continue;
    else if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push({ text: text.slice(start, i), index: start });
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push({ text: text.slice(start), index: start });
  return parts;
}

const ENTITIES: Record<string, string> = {
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  apos: "'",
  nbsp: " ",
  num: "#",
  semi: ";",
  colon: ":",
};

/** Decodes Mermaid `#quot;`, `#35;` and HTML `&amp;` entities. */
export function decodeEntities(text: string): string {
  return text.replace(/[#&](#?)([A-Za-z0-9]+);/g, (whole, hash: string, name: string) => {
    let code: number | null = null;
    if (/^[0-9]+$/.test(name)) code = Number(name);
    else if (/^x[0-9a-f]+$/i.test(name) && (hash === "#" || whole.startsWith("#"))) {
      code = parseInt(name.slice(1), 16);
    }
    if (code !== null) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * The visible text of a Mermaid label: quotes removed, `<br>` as line breaks, entities decoded.
 * Markdown strings, HTML tags and `fa:` icons are reduced to text and reported.
 */
export function cleanLabel(raw: string, reporter: Reporter, span: Span): string {
  let text = raw.trim();
  let markdown = false;
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
    if (text.length >= 2 && text.startsWith("`") && text.endsWith("`")) {
      text = text.slice(1, -1);
      markdown = true;
    }
  }
  text = text.replace(/<br\s*\/?>/gi, "\n");
  if (/<\/?[a-z][^>]*>/i.test(text)) {
    text = text.replace(/<\/?[a-z][^>]*>/gi, "");
    reporter.approximated("mermaid.label.html", span, messages().mermaid.labelHtml);
  }
  if (markdown) {
    const plain = text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/(?<![\w*])[*_](.+?)[*_](?![\w*])/g, "$1");
    if (plain !== text) {
      reporter.approximated("mermaid.label.markdown", span, messages().mermaid.labelMarkdown);
    }
    text = plain;
  }
  if (/\bfa[bsrl]?:fa-[a-z0-9-]+/.test(text)) {
    text = text.replace(/\bfa[bsrl]?:fa-[a-z0-9-]+\s*/g, "");
    reporter.approximated("mermaid.label.icon", span, messages().mermaid.labelIcon);
  }
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Reads a YAML-ish scalar: quotes removed. */
export function yamlScalar(text: string): string {
  const t = text.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Maps a CSS declaration list (`fill:#f9f,stroke:#333,stroke-width:4px`) to style properties.
 * Returns the properties and the names that have no equivalent.
 */
export function cssProps(
  text: string,
  target: "element" | "relation",
): { props: Props; dropped: string[] } {
  const props = new Map<string, string>();
  const dropped: string[] = [];
  for (const part of splitOutside(text.replace(/;\s*$/, ""), ",")) {
    const decl = part.text.trim();
    if (decl === "") continue;
    const colon = decl.indexOf(":");
    if (colon < 0) {
      dropped.push(decl);
      continue;
    }
    const name = decl.slice(0, colon).trim().toLowerCase();
    const value = decl
      .slice(colon + 1)
      .replace(/!important/g, "")
      .trim();
    switch (name) {
      case "fill":
      case "background":
      case "background-color":
        if (target === "relation" && name === "fill") {
          // `fill` on a link paints nothing in Mermaid.
          dropped.push(name);
          break;
        }
        props.set("fill", cssValue(value));
        break;
      case "stroke":
        props.set("stroke", cssValue(value));
        break;
      case "color":
        props.set("color", cssValue(value));
        break;
      case "stroke-width": {
        const n = Number.parseFloat(value);
        if (Number.isFinite(n) && n >= 0 && n <= 16)
          props.set("width", String(Math.round(n * 100) / 100));
        else dropped.push(name);
        break;
      }
      case "stroke-dasharray":
        props.set("line", value === "0" || value === "none" ? "solid" : "dashed");
        break;
      default:
        dropped.push(name);
    }
  }
  return { props: [...props.entries()], dropped };
}

/** Merges properties into a per-target map; later values win. */
export function mergeProps(
  into: Map<string, Map<string, string>>,
  target: string,
  props: Props,
): void {
  let map = into.get(target);
  if (!map) {
    map = new Map();
    into.set(target, map);
  }
  for (const [name, value] of props) map.set(name, value);
}

/** Writes per-target properties as style statements, one per target, in first-use order. */
export function stylesOf(
  map: Map<string, Map<string, string>>,
): { targets: string[]; props: Props }[] {
  return [...map.entries()]
    .filter(([, props]) => props.size > 0)
    .map(([target, props]) => ({ targets: [target], props: [...props.entries()] }));
}
