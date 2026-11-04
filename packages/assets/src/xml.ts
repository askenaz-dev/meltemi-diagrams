/**
 * A small, strict XML reader for icon files. It builds an element tree and refuses DTDs and custom
 * entities, so no input can expand or fetch anything. It never throws: problems come back as
 * values.
 */
import { messages } from "./messages/index.js";

export interface XmlElement {
  readonly name: string;
  /** Attributes in source order; names keep their prefix (`xlink:href`). */
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
}

export type XmlResult =
  | { readonly ok: true; readonly root: XmlElement; readonly elements: number }
  | {
      readonly ok: false;
      readonly reason: "unsafe" | "invalid" | "too-large";
      readonly message: string;
    };

export interface XmlLimits {
  /** Most elements in the document. */
  readonly maxElements: number;
  /** Deepest nesting of elements. */
  readonly maxDepth: number;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const PREDEFINED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

interface Draft {
  name: string;
  attributes: Map<string, string>;
  children: XmlElement[];
}

/** Replaces the five predefined entities and numeric references; anything else is refused. */
export function decodeEntities(text: string): string | { entity: string } {
  let refused: string | undefined;
  const decoded = text.replace(/&([^;&\s]*);?/g, (match, body: string) => {
    if (!match.endsWith(";")) {
      refused ??= match;
      return match;
    }
    if (body in PREDEFINED) return PREDEFINED[body]!;
    const numeric = /^#(x[0-9a-fA-F]+|[0-9]+)$/.exec(body);
    if (numeric) {
      const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    refused ??= match;
    return match;
  });
  return refused === undefined ? decoded : { entity: refused };
}

/** Parses an XML document with one root element. */
export function parseXml(text: string, limits: XmlLimits): XmlResult {
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const stack: Draft[] = [];
  let root: XmlElement | undefined;
  let elements = 0;
  // Problems are written in the interface language of the moment the file is read.
  const t = messages().xml;

  const fail = (reason: "unsafe" | "invalid" | "too-large", message: string): XmlResult => ({
    ok: false,
    reason,
    message,
  });

  while (pos < text.length) {
    const lt = text.indexOf("<", pos);
    if (lt < 0) {
      if (text.slice(pos).trim() !== "") return fail("invalid", t.textAfterRoot);
      break;
    }
    pos = lt;
    if (text.startsWith("<!--", pos)) {
      const end = text.indexOf("-->", pos + 4);
      if (end < 0) return fail("invalid", t.unterminatedComment);
      pos = end + 3;
      continue;
    }
    if (text.startsWith("<?", pos)) {
      const end = text.indexOf("?>", pos + 2);
      if (end < 0) return fail("invalid", t.unterminatedInstruction);
      pos = end + 2;
      continue;
    }
    if (text.startsWith("<![CDATA[", pos)) {
      const end = text.indexOf("]]>", pos + 9);
      if (end < 0) return fail("invalid", t.unterminatedCdata);
      pos = end + 3;
      continue;
    }
    if (text.startsWith("<!", pos)) return fail("unsafe", t.declarations);
    if (text.startsWith("</", pos)) {
      const match = NAME.exec(text.slice(pos + 2));
      const close = text.indexOf(">", pos);
      if (!match || close < 0) return fail("invalid", t.malformedClosingTag);
      const open = stack.pop();
      if (!open || open.name !== match[0]) return fail("invalid", t.closingTag(match[0]));
      const element: XmlElement = open;
      if (stack.length > 0) stack[stack.length - 1]!.children.push(element);
      else root = element;
      pos = close + 1;
      continue;
    }
    // Opening tag.
    const nameMatch = NAME.exec(text.slice(pos + 1));
    if (!nameMatch) return fail("invalid", t.malformedTag);
    if (root !== undefined && stack.length === 0) return fail("invalid", t.secondRoot);
    const name = nameMatch[0];
    pos += 1 + name.length;
    const attributes = new Map<string, string>();
    let selfClosing = false;
    for (;;) {
      while (pos < text.length && /\s/.test(text[pos]!)) pos++;
      if (pos >= text.length) return fail("invalid", t.unterminatedTag(name));
      if (text.startsWith("/>", pos)) {
        selfClosing = true;
        pos += 2;
        break;
      }
      if (text[pos] === ">") {
        pos++;
        break;
      }
      const attribute = NAME.exec(text.slice(pos));
      if (!attribute) return fail("invalid", t.malformedAttribute(name));
      pos += attribute[0].length;
      while (pos < text.length && /\s/.test(text[pos]!)) pos++;
      if (text[pos] !== "=") return fail("invalid", t.noValue(attribute[0]));
      pos++;
      while (pos < text.length && /\s/.test(text[pos]!)) pos++;
      const quote = text[pos];
      if (quote !== '"' && quote !== "'") return fail("invalid", t.unquotedValue(attribute[0]));
      const end = text.indexOf(quote, pos + 1);
      if (end < 0) return fail("invalid", t.unterminatedValue(attribute[0]));
      const raw = text.slice(pos + 1, end);
      if (raw.includes("<")) return fail("invalid", t.lessThanInValue(attribute[0]));
      const value = decodeEntities(raw);
      if (typeof value !== "string") return fail("unsafe", t.entity(value.entity));
      if (attributes.has(attribute[0])) return fail("invalid", t.repeatedAttribute(attribute[0]));
      attributes.set(attribute[0], value);
      pos = end + 1;
    }
    elements++;
    if (elements > limits.maxElements)
      return fail("too-large", t.tooManyElements(limits.maxElements));
    if (stack.length + 1 > limits.maxDepth) return fail("too-large", t.tooDeep(limits.maxDepth));
    const draft: Draft = { name, attributes, children: [] };
    if (selfClosing) {
      if (stack.length > 0) stack[stack.length - 1]!.children.push(draft);
      else root = draft;
    } else {
      stack.push(draft);
    }
    // Text content is ignored, but entities in it are still refused.
    const next = text.indexOf("<", pos);
    const content = text.slice(pos, next < 0 ? text.length : next);
    if (content.includes("&")) {
      const decoded = decodeEntities(content);
      if (typeof decoded !== "string") return fail("unsafe", t.entity(decoded.entity));
    }
    pos = next < 0 ? text.length : next;
  }
  if (stack.length > 0) return fail("invalid", t.unclosedElement(stack[stack.length - 1]!.name));
  if (!root) return fail("invalid", t.noRoot);
  return { ok: true, root, elements };
}
