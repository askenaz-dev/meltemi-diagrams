// What an uploaded image or font is, read from its bytes and from nothing else: the `Content-Type` a
// client claims decides nothing (`cloud-projects`, "Images and fonts by hash"). The magic bytes name
// PNG, JPEG, GIF, WebP and the fonts woff2, ttf and otf; SVG, which has no magic bytes, is accepted
// only when the body is well-formed XML whose root element is `svg`.
//
// An SVG may hold a `<script>` and is still a valid upload: it is never served in a way that runs it
// (every blob answer carries `Content-Security-Policy: sandbox`, `nosniff` and `attachment`), so the
// check is about what the bytes are, not whether they are harmless to open.
//
// Workers have no `DOMParser`, so the XML check is written here: a strict scanner over the text that
// never builds a tree and never expands anything. It refuses a DOCTYPE with an internal subset (the
// only way to declare an entity) and any entity but the five predefined ones and numeric references.

/** The media types an upload may have, and what `GET …/blobs/<hash>` may answer. */
export const BINARY_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "font/woff2",
  "font/ttf",
  "font/otf",
] as const;

export type BinaryType = (typeof BINARY_TYPES)[number];

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = ascii("GIF87a");
const GIF89 = ascii("GIF89a");
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const WOFF2 = ascii("wOF2");
const TTF = [0x00, 0x01, 0x00, 0x00];
// The tag of an Apple TrueType font: the four letters t, r, u and e.
const TTF_APPLE = [0x74, 0x72, 0x75, 0x65];
const OTF = ascii("OTTO");

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0): boolean {
  if (bytes.length < at + signature.length) return false;
  return signature.every((byte, i) => bytes[at + i] === byte);
}

/** The media type the magic bytes name, or undefined (SVG is not one of these). */
export function magicType(bytes: Uint8Array): Exclude<BinaryType, "image/svg+xml"> | undefined {
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return "image/gif";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp";
  if (startsWith(bytes, WOFF2)) return "font/woff2";
  if (startsWith(bytes, TTF) || startsWith(bytes, TTF_APPLE)) return "font/ttf";
  if (startsWith(bytes, OTF)) return "font/otf";
  return undefined;
}

// ---- SVG: well-formed XML with an `svg` root ------------------------------------------------------

/** The deepest nesting accepted: no drawing needs more, and the scanner keeps its own stack. */
const MAX_DEPTH = 256;

// A name: letters, `_` and `:` to start, then digits, `.` and `-` too; any character above ASCII is a
// letter here (the scanner checks well-formedness, not which Unicode letters XML allows). The range
// is built from its two code units so that no invisible character sits in this file.
const ABOVE_ASCII = `${String.fromCharCode(0x80)}-${String.fromCharCode(0xffff)}`;
const NAME_START = `A-Za-z_:${ABOVE_ASCII}`;
const NAME_PART = `A-Za-z0-9_:.${ABOVE_ASCII}-`;
const WS = /[ \t\r\n]+/y;
const NAME = new RegExp(`[${NAME_START}][${NAME_PART}]*`, "y");
const ATTRIBUTE_VALUE = /"[^<"]*"|'[^<']*'/y;
const XML_DECLARATION =
  /<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"1\.[0-9]+"|'1\.[0-9]+')[^?]*\?>/y;
const END_TAG = new RegExp(String.raw`<\/([${NAME_START}][${NAME_PART}]*)[ \t\r\n]*>`, "y");
const PROCESSING_TARGET = new RegExp(
  String.raw`<\?([${NAME_START}][${NAME_PART}]*)(?=[ \t\r\n?])`,
  "y",
);
// `<!DOCTYPE svg>`, with an external identifier at most: never an internal subset.
const DOCTYPE =
  /<!DOCTYPE[ \t\r\n]+[A-Za-z_:][A-Za-z0-9_:.-]*(?:[ \t\r\n]+(?:SYSTEM[ \t\r\n]+(?:"[^"]*"|'[^']*')|PUBLIC[ \t\r\n]+(?:"[^"]*"|'[^']*')[ \t\r\n]+(?:"[^"]*"|'[^']*')))?[ \t\r\n]*>/y;
const REFERENCE = /&(?:(?:amp|lt|gt|quot|apos);|#([0-9]{1,7});|#x([0-9a-fA-F]{1,6});)/y;
/** The C0 controls but tab, line feed and carriage return: XML 1.0 never allows them, in any markup. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
/** U+FFFE and U+FFFF, which no document may hold either (built, so that no invisible character sits in this file). */
const NONCHARACTERS = [String.fromCharCode(0xfffe), String.fromCharCode(0xffff)];
/** An element name `svg`, with or without a prefix. */
const SVG_ROOT = /^(?:[A-Za-z_][A-Za-z0-9_.-]*:)?svg$/;

const isXmlCharacter = (code: number): boolean =>
  code === 0x9 ||
  code === 0xa ||
  code === 0xd ||
  (code >= 0x20 && code <= 0xd7ff) ||
  (code >= 0xe000 && code <= 0xfffd) ||
  (code >= 0x10000 && code <= 0x10ffff);

/** Whether every `&` of a piece of text starts a predefined entity or a reference to a real character. */
function validReferences(text: string): boolean {
  for (let at = text.indexOf("&"); at >= 0; at = text.indexOf("&", REFERENCE.lastIndex)) {
    REFERENCE.lastIndex = at;
    const found = REFERENCE.exec(text);
    if (!found) return false;
    const decimal = found[1];
    const hexadecimal = found[2];
    if (decimal !== undefined && !isXmlCharacter(parseInt(decimal, 10))) return false;
    if (hexadecimal !== undefined && !isXmlCharacter(parseInt(hexadecimal, 16))) return false;
  }
  return true;
}

/**
 * Whether the text is a well-formed XML document whose root element is `svg`: one root, tags that
 * nest and close, attributes quoted and not repeated, comments without `--`, only the predefined
 * entities, nothing but whitespace, comments and instructions outside the root. Namespaces are not
 * resolved: a root named `svg` is what the specification asks for.
 */
export function isSvgText(text: string): boolean {
  if (FORBIDDEN_CONTROL.test(text) || NONCHARACTERS.some((c) => text.includes(c))) return false;
  const length = text.length;
  let pos = 0;
  /** Matches a sticky pattern at `pos` and moves past it. */
  const take = (pattern: RegExp): RegExpExecArray | undefined => {
    pattern.lastIndex = pos;
    const found = pattern.exec(text);
    if (!found) return undefined;
    pos = pattern.lastIndex;
    return found;
  };

  // The XML declaration, if any, is the very first thing.
  if (text.startsWith("<?xml") && /[ \t\r\n]/.test(text[5] ?? "")) {
    if (!take(XML_DECLARATION)) return false;
  }

  const open: string[] = [];
  let state: "before" | "inside" | "after" = "before";
  let doctype = false;
  for (;;) {
    if (state === "inside") {
      // Character data up to the next markup.
      const next = text.indexOf("<", pos);
      if (next < 0) return false;
      const data = text.slice(pos, next);
      if (data.includes("]]>") || !validReferences(data)) return false;
      pos = next;
    } else {
      take(WS);
      if (pos >= length) return state === "after";
      // Outside the root there is markup and whitespace, and nothing else.
      if (text[pos] !== "<") return false;
    }

    if (text.startsWith("<!--", pos)) {
      const end = text.indexOf("-->", pos + 4);
      if (end < 0) return false;
      const body = text.slice(pos + 4, end);
      if (body.includes("--") || body.endsWith("-")) return false;
      pos = end + 3;
    } else if (text.startsWith("<?", pos)) {
      const target = take(PROCESSING_TARGET);
      if (!target || target[1]?.toLowerCase() === "xml") return false;
      const end = text.indexOf("?>", pos);
      if (end < 0) return false;
      pos = end + 2;
    } else if (text.startsWith("<![CDATA[", pos)) {
      if (state !== "inside") return false;
      const end = text.indexOf("]]>", pos + 9);
      if (end < 0) return false;
      pos = end + 3;
    } else if (text.startsWith("<!DOCTYPE", pos)) {
      if (state !== "before" || doctype || !take(DOCTYPE)) return false;
      doctype = true;
    } else if (text.startsWith("<!", pos)) {
      return false;
    } else if (text.startsWith("</", pos)) {
      const closing = state === "inside" ? take(END_TAG) : undefined;
      if (!closing || open.pop() !== closing[1]) return false;
      if (open.length === 0) state = "after";
    } else {
      // A start tag: its name, its attributes, then `>` or `/>`.
      if (state === "after") return false;
      pos += 1;
      const name = take(NAME)?.[0];
      if (name === undefined) return false;
      if (state === "before" && !SVG_ROOT.test(name)) return false;
      const attributes = new Set<string>();
      let empty = false;
      for (;;) {
        const spaced = take(WS) !== undefined;
        if (text.startsWith("/>", pos)) {
          empty = true;
          pos += 2;
          break;
        }
        if (text[pos] === ">") {
          pos += 1;
          break;
        }
        const attribute = spaced ? take(NAME)?.[0] : undefined;
        if (attribute === undefined || attributes.has(attribute)) return false;
        attributes.add(attribute);
        take(WS);
        if (text[pos] !== "=") return false;
        pos += 1;
        take(WS);
        const value = take(ATTRIBUTE_VALUE)?.[0];
        if (value === undefined || !validReferences(value)) return false;
      }
      if (empty) {
        if (state === "before") state = "after";
      } else {
        open.push(name);
        if (open.length > MAX_DEPTH) return false;
        state = "inside";
      }
    }
  }
}

/** Whether the bytes are a well-formed XML document with an `svg` root (UTF-8; a byte-order mark is allowed). */
export function isSvg(bytes: Uint8Array): boolean {
  let text: string;
  try {
    // A byte-order mark is dropped (`ignoreBOM: false`), invalid UTF-8 throws.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return false;
  }
  return isSvgText(text);
}

/**
 * The media type of an upload, from its bytes: the magic bytes first, then an XML parse for SVG.
 * Undefined for anything else (`400 binary.invalid`).
 */
export function binaryType(bytes: Uint8Array): BinaryType | undefined {
  return magicType(bytes) ?? (isSvg(bytes) ? "image/svg+xml" : undefined);
}
