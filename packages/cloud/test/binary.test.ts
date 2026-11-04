// What an upload is, from its bytes (`cloud-projects`, "Images and fonts by hash"): the magic bytes of
// PNG, JPEG, GIF, WebP, woff2, ttf and otf, and the strict XML check that lets an SVG in.

import { describe, expect, it } from "vitest";
import { BINARY_TYPES, binaryType, isSvg, isSvgText, magicType } from "../src/binary.js";

const bytes = (...values: (number | string)[]): Uint8Array =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "number" ? [value] : [...value].map((c) => c.charCodeAt(0)),
    ),
  );

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("magicType", () => {
  it.each([
    ["a PNG", bytes(0x89, "PNG\r\n", 0x1a, "\n", 0, 0, 0, 0), "image/png"],
    ["a JPEG", bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, "JFIF"), "image/jpeg"],
    ["a GIF87a", bytes("GIF87a", 1, 0, 1, 0), "image/gif"],
    ["a GIF89a", bytes("GIF89a", 1, 0, 1, 0), "image/gif"],
    ["a WebP", bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 "), "image/webp"],
    ["a woff2 font", bytes("wOF2", 0, 1, 0, 0), "font/woff2"],
    ["a TrueType font", bytes(0, 1, 0, 0, 0, 0x10), "font/ttf"],
    ["an Apple TrueType font", bytes("true", 0, 0x10), "font/ttf"],
    ["an OpenType font", bytes("OTTO", 0, 0x10), "font/otf"],
  ])("names %s", (_label, content, type) => {
    expect(magicType(content)).toBe(type);
    expect(binaryType(content)).toBe(type);
  });

  it.each([
    ["nothing", bytes()],
    ["one byte", bytes(0x89)],
    ["a PNG signature cut short", bytes(0x89, "PNG\r\n", 0x1a)],
    ["a GIF with another version", bytes("GIF88a")],
    ["a WAV, which is RIFF too", bytes("RIFF", 0x24, 0, 0, 0, "WAVEfmt ")],
    ["a RIFF too short to be a WebP", bytes("RIFF", 1, 2)],
    ["a woff (version 1) font", bytes("wOFF", 0, 1, 0, 0)],
    ["a font collection", bytes("ttcf", 0, 1, 0, 0)],
    ["a PDF", bytes("%PDF-1.7\n")],
    ["a ZIP", bytes("PK", 3, 4)],
    ["an HTML page", utf8("<!doctype html><title>x</title>")],
    ["plain text", utf8("hello")],
    ["a script", utf8("alert(1)")],
  ])("does not name %s", (_label, content) => {
    expect(binaryType(content)).toBeUndefined();
  });

  it("knows exactly the eight types the specification lists", () => {
    expect([...BINARY_TYPES].sort()).toEqual([
      "font/otf",
      "font/ttf",
      "font/woff2",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/svg+xml",
      "image/webp",
    ]);
  });

  it("prefers the magic bytes: a PNG with markup after its signature is a PNG", () => {
    const polyglot = bytes(
      0x89,
      "PNG\r\n",
      0x1a,
      "\n",
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
    );
    expect(binaryType(polyglot)).toBe("image/png");
  });
});

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe("isSvgText: what is accepted", () => {
  it.each([
    ["an empty root", `<svg ${NS}/>`],
    ["a root without a namespace", "<svg></svg>"],
    [
      "an XML declaration",
      `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg ${NS}/>\n`,
    ],
    ["an XML declaration in single quotes", `<?xml version='1.1'?><svg ${NS}/>`],
    ["comments and whitespace around the root", `\n<!-- a -->\n<svg ${NS}/>\n<!-- b -->\n`],
    [
      "an SVG 1.1 DOCTYPE with its public identifier",
      `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg ${NS}/>`,
    ],
    ["a DOCTYPE with a system identifier", `<!DOCTYPE svg SYSTEM "svg.dtd"><svg ${NS}/>`],
    ["a bare DOCTYPE", `<!DOCTYPE svg><svg ${NS}/>`],
    ["an instruction before the root", `<?xml-stylesheet href="a.css"?><svg ${NS}/>`],
    ["a prefixed root", '<svg:svg xmlns:svg="http://www.w3.org/2000/svg"></svg:svg>'],
    [
      "nested elements and attributes of both quotes",
      `<svg ${NS} viewBox='0 0 10 10'><g id="a"><path d="M0 0L1 1"/><circle r='2'></circle></g></svg>`,
    ],
    [
      "the predefined entities and numeric references",
      `<svg ${NS}><text a="&amp;&lt;&gt;&quot;&apos;">&#65;&#x42;&amp;</text></svg>`,
    ],
    ["CDATA inside the root", `<svg ${NS}><style><![CDATA[ a > b { fill: red } ]]></style></svg>`],
    [
      "a script: it is a valid SVG, and is never served in a way that runs it",
      `<svg ${NS}><script>alert(document.cookie)</script></svg>`,
    ],
    ["an event handler attribute", `<svg ${NS} onload="alert(1)"/>`],
    ["a foreignObject with markup", `<svg ${NS}><foreignObject><p>hi</p></foreignObject></svg>`],
    ["non-ASCII names and text", `<svg ${NS}><título ñ="é">日本語</título></svg>`],
    ["text that holds '>' and ']' but not ']]>'", `<svg ${NS}><text>a > b ] c</text></svg>`],
    [
      "a name with dots, dashes and colons",
      `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#a" data-x.y-z="1"/>`,
    ],
    ["Windows line ends", `<svg ${NS}>\r\n<g/>\r\n</svg>\r\n`],
  ])("accepts %s", (_label, text) => {
    expect(isSvgText(text)).toBe(true);
  });

  it("accepts a document with a byte-order mark, and decodes UTF-8", () => {
    expect(
      isSvg(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(`<svg ${NS}><text>é</text></svg>`)])),
    ).toBe(true);
    expect(binaryType(utf8(`<svg ${NS}/>`))).toBe("image/svg+xml");
  });

  it("accepts a deep document within the limit and a large one", () => {
    expect(isSvgText(`<svg>${"<g>".repeat(250)}${"</g>".repeat(250)}</svg>`)).toBe(true);
    // Five megabytes of elements: a real scan of a big file, in one go.
    const many = `<svg ${NS}>${'<path d="M0 0L1 1" fill="#ff0000"/>'.repeat(140_000)}</svg>`;
    expect(many.length).toBeGreaterThan(4_800_000);
    expect(isSvgText(many)).toBe(true);
  });
});

describe("isSvgText: what is refused", () => {
  it.each([
    ["nothing", ""],
    ["whitespace", " \n "],
    ["text", "hello"],
    ["an HTML page", "<html><body>hi</body></html>"],
    ["an HTML page with an svg inside", "<html><body><svg/></body></html>"],
    ["an HTML5 DOCTYPE", "<!doctype html><svg/>"],
    ["a root that is another element", "<g/>"],
    ["a root whose name only starts with svg", "<svgx/>"],
    ["a root whose name only ends with svg", "<xsvg/>"],
    ["a root whose local part is not svg", "<a:b/>"],
    ["a case that is not svg", "<SVG/>"],
    ["a root that is not closed", `<svg ${NS}>`],
    ["a closing tag that does not match", `<svg ${NS}><g></h></svg>`],
    ["a closing tag with nothing open", "</svg>"],
    ["tags that cross", `<svg ${NS}><a><b></a></b></svg>`],
    ["two roots", `<svg ${NS}/><svg ${NS}/>`],
    ["a second root of another name", `<svg ${NS}/><g/>`],
    ["text after the root", `<svg ${NS}/>junk`],
    ["text before the root", `junk<svg ${NS}/>`],
    ["a character reference after the root", `<svg ${NS}/>&amp;`],
    ["an attribute without quotes", `<svg ${NS} a=1/>`],
    ["an attribute without a value", `<svg ${NS} a/>`],
    ["an attribute without a space before it", `<svg ${NS}a="1"/>`],
    ["a repeated attribute", `<svg ${NS} a="1" a="2"/>`],
    ["a '<' in an attribute value", `<svg ${NS} a="<"/>`],
    ["an unterminated attribute value", `<svg ${NS} a="1/>`],
    ["an unterminated tag", `<svg ${NS}`],
    ["a tag with nothing after '<'", `<svg ${NS}><</svg>`],
    ["a name that starts with a digit", "<1svg/>"],
    ["an HTML entity", `<svg ${NS}><text>&nbsp;</text></svg>`],
    ["a bare ampersand in text", `<svg ${NS}><text>a & b</text></svg>`],
    ["a bare ampersand in an attribute", `<svg ${NS} a="a & b"/>`],
    ["an entity without its semicolon", `<svg ${NS}><text>&amp</text></svg>`],
    ["a character reference to nothing", `<svg ${NS}><text>&#0;</text></svg>`],
    ["a character reference out of range", `<svg ${NS}><text>&#x110000;</text></svg>`],
    ["a reference to a control character", `<svg ${NS}><text>&#1;</text></svg>`],
    ["a DOCTYPE with an internal subset", `<!DOCTYPE svg [<!ENTITY a "b">]><svg ${NS}/>`],
    [
      "an entity bomb",
      `<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><svg ${NS}>&b;</svg>`,
    ],
    ["a DOCTYPE after the root", `<svg ${NS}/><!DOCTYPE svg>`],
    ["two DOCTYPEs", `<!DOCTYPE svg><!DOCTYPE svg><svg ${NS}/>`],
    ["a DOCTYPE inside the root", `<svg ${NS}><!DOCTYPE svg></svg>`],
    ["a declaration that is not one", `<svg ${NS}><!ELEMENT a></svg>`],
    ["CDATA outside the root", `<![CDATA[x]]><svg ${NS}/>`],
    ["CDATA that is not closed", `<svg ${NS}><![CDATA[x</svg>`],
    ["']]>' in text", `<svg ${NS}><text>a ]]> b</text></svg>`],
    ["a comment with '--' inside", `<svg ${NS}><!-- a -- b --></svg>`],
    ["a comment that ends with '-'", `<svg ${NS}><!-- a ---></svg>`],
    ["a comment that is not closed", `<svg ${NS}><!-- a</svg>`],
    ["an instruction that is not closed", `<?pi <svg ${NS}/>`],
    ["an XML declaration after whitespace", ` <?xml version="1.0"?><svg ${NS}/>`],
    ["an XML declaration after the start", `<!-- a --><?xml version="1.0"?><svg ${NS}/>`],
    ["an XML declaration without a version", `<?xml encoding="UTF-8"?><svg ${NS}/>`],
    ["a control character", `<svg ${NS}><text>a\u0001b</text></svg>`],
    ["a NUL", `<svg ${NS}>\u0000</svg>`],
    ["U+FFFE", `<svg ${NS}>￾</svg>`],
    ["nesting deeper than the limit", `<svg>${"<g>".repeat(300)}${"</g>".repeat(300)}</svg>`],
  ])("refuses %s", (_label, text) => {
    expect(isSvgText(text)).toBe(false);
  });

  it("refuses bytes that are not UTF-8, and a UTF-16 document", () => {
    expect(
      isSvg(new Uint8Array([...utf8(`<svg ${NS}><text>`), 0xff, 0xfe, ...utf8("</text></svg>")])),
    ).toBe(false);
    // UTF-16LE with its mark: a valid SVG to a browser, and not what this accepts.
    const utf16 = new Uint8Array([
      0xff,
      0xfe,
      ...[...`<svg ${NS}/>`].flatMap((c) => [c.charCodeAt(0), 0]),
    ]);
    expect(isSvg(utf16)).toBe(false);
  });
});
