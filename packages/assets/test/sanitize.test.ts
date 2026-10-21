import { describe, expect, it } from "vitest";
import {
  ASSET_LIMITS,
  iconFromNodes,
  opticalRatio,
  parseXml,
  sanitizeBody,
  sanitizeSvg,
  type IconResult,
} from "../src/index.js";

const svg = (body: string, root = 'viewBox="0 0 24 24"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

function ok(result: IconResult) {
  if (!result.ok) throw new Error(result.problem.message);
  return result.icon;
}

function problem(result: IconResult) {
  if (result.ok) throw new Error("expected a problem");
  return result.problem;
}

describe("XML reader", () => {
  it("reads elements, attributes and entities", () => {
    const result = parseXml(
      '<?xml version="1.0"?><!-- c --><a x="1 &amp; 2"><b y=\'&#65;\'/></a>',
      {
        maxElements: 10,
        maxDepth: 5,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.name).toBe("a");
    expect(result.root.attributes.get("x")).toBe("1 & 2");
    expect(result.root.children[0]!.attributes.get("y")).toBe("A");
  });

  it("refuses DTDs, custom entities and malformed documents", () => {
    const limits = { maxElements: 10, maxDepth: 5 };
    expect(parseXml('<!DOCTYPE svg [<!ENTITY a "x">]><svg/>', limits)).toMatchObject({
      ok: false,
      reason: "unsafe",
    });
    expect(parseXml('<svg a="&custom;"/>', limits)).toMatchObject({ ok: false, reason: "unsafe" });
    expect(parseXml("<a><b></a>", limits)).toMatchObject({ ok: false, reason: "invalid" });
    expect(parseXml("<a/><b/>", limits)).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("SVG sanitising", () => {
  it("converts shapes to paths with absolute commands", () => {
    const icon = ok(
      sanitizeSvg(
        svg(
          '<rect x="2" y="2" width="10" height="6"/><circle cx="12" cy="12" r="4"/><line x1="0" y1="0" x2="4" y2="4" stroke="#000"/><polygon points="1 1 3 1 2 3"/>',
        ),
      ),
    );
    expect(icon.paths.map((p) => p.d)).toEqual([
      "M2 2L12 2L12 8L2 8Z",
      "M8 12A4 4 0 1 0 16 12A4 4 0 1 0 8 12Z",
      "M0 0L4 4",
      "M1 1L3 1L2 3Z",
    ]);
    expect(icon.monochrome).toBe(true);
    expect(icon.paths[0]!.fill).toEqual({ kind: "current" });
  });

  it("keeps colours of multicolour icons and paints unset fills black", () => {
    const icon = ok(
      sanitizeSvg(svg('<rect width="24" height="24" fill="#ED7100"/><path d="M4 4h8"/>')),
    );
    expect(icon.monochrome).toBe(false);
    expect(icon.paths.map((p) => p.fill)).toEqual([
      { kind: "color", value: "#ED7100" },
      { kind: "color", value: "#000000" },
    ]);
  });

  it("inherits paint from groups and reads style declarations", () => {
    const icon = ok(
      sanitizeSvg(
        svg(
          '<g fill="none" stroke="currentColor" style="stroke-width: 1.5; stroke-linecap: round"><path d="M1 1L5 5"/></g>',
        ),
      ),
    );
    expect(icon.paths[0]).toMatchObject({
      fill: { kind: "none" },
      stroke: { kind: "current" },
      strokeWidth: 1.5,
      lineCap: "round",
    });
  });

  it("applies transforms to bounds and keeps them on paths", () => {
    const icon = ok(
      sanitizeSvg(svg('<g transform="translate(10 0)"><rect width="4" height="4"/></g>')),
    );
    expect(icon.paths[0]!.transform).toBe("matrix(1 0 0 1 10 0)");
    expect(icon.bounds).toEqual({ minX: 10, minY: 0, maxX: 14, maxY: 4 });
  });

  it("resolves local gradients, inheritance and fallbacks", () => {
    const icon = ok(
      sanitizeSvg(
        svg(
          '<defs><linearGradient id="a" x2="100%"><stop offset="0" stop-color="#000"/><stop offset="100%" stop-color="#fff" stop-opacity="0.5"/></linearGradient><linearGradient id="b" xlink:href="#a" y2="100%"/></defs><rect width="24" height="24" fill="url(#b)"/><rect width="2" height="2" fill="url(#missing) #f00"/>',
        ),
      ),
    );
    expect(icon.gradients).toEqual([
      {
        id: "b",
        kind: "linear",
        units: "objectBoundingBox",
        transform: null,
        spread: "pad",
        coordinates: { x2: "100%", y2: "100%" },
        stops: [
          { offset: 0, color: "#000", opacity: 1 },
          { offset: 1, color: "#fff", opacity: 0.5 },
        ],
      },
    ]);
    expect(icon.paths.map((p) => p.fill)).toEqual([
      { kind: "gradient", id: "b" },
      { kind: "color", value: "#f00" },
    ]);
  });

  it.each([
    ["script", "<script>alert(1)</script>", "`<script>`"],
    ["image", '<image href="x.png"/>', "`<image>`"],
    ["use", '<use href="#a"/>', "`<use>`"],
    ["event", '<path onclick="x()" d="M0 0"/>', "onclick"],
    [
      "external paint",
      '<path fill="url(https://example.com/a.svg#g)" d="M0 0"/>',
      "https://example.com",
    ],
    ["mask", "<mask/>", "`<mask>`"],
    ["link on a shape", '<path xlink:href="#a" d="M0 0"/>', "Link"],
  ])("refuses %s", (_name, body, mention) => {
    const result = problem(sanitizeSvg(svg(body)));
    expect(result.reason).toBe("unsafe");
    expect(result.message).toContain(mention);
  });

  it("skips titles, metadata and editor namespaces", () => {
    const icon = ok(
      sanitizeSvg(
        svg(
          '<title>x</title><metadata><rdf:RDF/></metadata><sodipodi:namedview/><path inkscape:label="a" d="M0 0L1 1" stroke="#000"/>',
        ),
      ),
    );
    expect(icon.paths).toHaveLength(1);
  });

  it("enforces size, depth and path limits", () => {
    expect(problem(sanitizeSvg(svg(`<path d="M0 0${"L1 1".repeat(70000)}"/>`))).reason).toBe(
      "too-large",
    );
    const deep = `${"<g>".repeat(ASSET_LIMITS.depth + 1)}<path d="M0 0"/>${"</g>".repeat(ASSET_LIMITS.depth + 1)}`;
    expect(problem(sanitizeSvg(svg(deep)))).toMatchObject({ reason: "too-large" });
    const long = `<path d="M0 0${" L1 1".repeat(60000)}"/>`;
    expect(problem(sanitizeSvg(svg(long), 10 * 1024 * 1024))).toMatchObject({
      reason: "too-large",
    });
  });

  it("needs a view box", () => {
    expect(problem(sanitizeSvg("<svg/>")).message).toContain("viewBox");
    expect(
      ok(sanitizeSvg(svg('<path d="M0 0L4 4" stroke="#000"/>', 'width="32px" height="16"')))
        .viewBox,
    ).toEqual({
      x: 0,
      y: 0,
      width: 32,
      height: 16,
    });
  });

  it("reads Iconify bodies and Tabler nodes", () => {
    const body = ok(
      sanitizeBody('<path fill="currentColor" d="M2 2h20v20H2z"/>', {
        x: 0,
        y: 0,
        width: 24,
        height: 24,
      }),
    );
    expect(opticalRatio(body)).toBeCloseTo(20 / 24, 3);
    const tabler = ok(
      iconFromNodes(
        [["path", { d: "M3 7h18" }]],
        { x: 0, y: 0, width: 24, height: 24 },
        { fill: "none", stroke: "currentColor", "stroke-width": "2" },
      ),
    );
    expect(tabler.paths[0]).toMatchObject({ stroke: { kind: "current" }, strokeWidth: 2 });
    expect(tabler.bounds).toEqual({ minX: 2, minY: 6, maxX: 22, maxY: 8 });
  });
});
