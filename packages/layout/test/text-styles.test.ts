import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  THEMES,
  TextMetrics,
  auditLabels,
  layoutDiagram,
  type GroupItem,
  type LayoutOptions,
  type SceneItem,
  type TextItem,
} from "../src/index.js";

const fonts = createNodeFontLibrary();
const LIGHT = THEMES["technical.light"]!;

function run(type: string, body: string, options: LayoutOptions = {}, before = "") {
  const compilation = compile(
    `language "0.2"\ntheme plain {\n  extends "technical.light"\n  frame none\n}\n${before}diagram d: ${type} {\n  theme "plain"\n${body}\n}\n`,
  );
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const diagram = compilation.document.diagrams.find((d) => d.id === "d")!;
  const result = layoutDiagram(compilation, diagram, { measurer: fonts, ...options });
  expect(result.scene).not.toBeNull();
  return result;
}

function find(items: readonly SceneItem[], id: string, role: string): GroupItem | undefined {
  for (const item of items) {
    if (item.kind !== "group") continue;
    if (item.id === id && item.role === role) return item;
    const inner = find(item.items, id, role);
    if (inner) return inner;
  }
  return undefined;
}

function textsOf(item: GroupItem | undefined): TextItem[] {
  return (item?.items ?? []).flatMap((i) =>
    i.kind === "text" ? [i] : i.kind === "group" ? textsOf(i) : [],
  );
}

describe("measuring a written stack", () => {
  it("measures with the written family alone, and estimates a stack nobody has", () => {
    const metrics = new TextMetrics(fonts, LIGHT);
    const roboto = metrics.width("Orders", { role: "body", stack: "Roboto" }, 600, 13);
    expect(roboto).toBe(fonts.width("Orders", "Roboto", 600, 13));
    expect(roboto).not.toBe(metrics.width("Orders", "body", 600, 13));
    expect(metrics.unknownFonts.size).toBe(0);
    metrics.width("Orders", { role: "body", stack: "Comic Sans MS" }, 600, 13);
    metrics.width("Again", { role: "body", stack: "Comic Sans MS" }, 600, 13);
    expect([...metrics.unknownFonts]).toEqual(["Comic Sans MS"]);
    expect(metrics.baseline(100, { role: "body", stack: "Lora" }, 400, 20)).toBeCloseTo(
      100 + (fonts.capHeight("Lora", 400) * 20) / 2,
    );
  });
});

describe("written text in flow diagrams", () => {
  it("grows a node for a larger label and scales its description", () => {
    const body = (style: string) =>
      `  api["Gateway Service"] { description "REST" }\n  layout manual\n  placement { place api at (200, 100) }\n${style}`;
    const plain = run("flow", body(""));
    const sized = run("flow", body("  style api { fontSize 20 }"));
    const a = plain.boxes!.get("api")!;
    const b = sized.boxes!.get("api")!;
    expect([a.width, a.height]).toEqual([160, 56]);
    expect(b.width).toBeGreaterThan(a.width);
    expect(b.height).toBeGreaterThan(a.height);
    const [label, description] = textsOf(find(sized.scene!.items, "api", "element"));
    expect(label).toMatchObject({ text: "Gateway Service", size: 20 });
    expect(description).toMatchObject({ text: "REST", size: 17 });
    for (const text of [label!, description!]) {
      expect(text.y).toBeGreaterThan(b.y + sized.offset!.y);
      expect(text.y).toBeLessThan(b.y + b.height + sized.offset!.y);
    }
  });

  it("draws a written font with its stack and measures with it", () => {
    const result = run(
      "flow",
      '  api["Orders"]\n  db["Orders"]\n  layout manual\n  placement { place api at (100, 100); place db at (400, 100) }\n  style api { font "Roboto" }',
    );
    const [api] = textsOf(find(result.scene!.items, "api", "element"));
    const [db] = textsOf(find(result.scene!.items, "db", "element"));
    expect(api!.stack).toBe("Roboto");
    expect(db!.stack).toBeUndefined();
    expect(result.diagnostics.filter((d) => d.code === "layout.unmeasured-font")).toEqual([]);
  });

  it("sizes a tag's pill and a relation's pill at their written sizes", () => {
    const result = run(
      "flow",
      '  a["A"]\n  b["B"]\n  tag jwt "JWT"\n  a -> b: "Pay" as pay\n  layout manual\n  placement { place a at (100, 100); place b at (400, 100); place jwt at (100, 220) }\n  style jwt { fontSize 14 }\n  style pay { fontSize 14; fontWeight 600 }',
    );
    const tag = result.boxes!.get("jwt")!;
    expect(tag.height).toBe(Math.round((14 * 18) / 10.5));
    const scale = (size: number) => Math.round((size * 18) / 10.5);
    expect(tag.width).toBe(Math.ceil(fonts.width("JWT", LIGHT.mono, 500, 14) + scale(14)));
    const pill = result.labels!.get("pay")!;
    expect(pill.height).toBe(Math.round((14 * 18) / 11));
    const [text] = textsOf(find(result.scene!.items, "pay", "label"));
    expect(text).toMatchObject({ size: 14, weight: 600 });
  });

  it("draws a group title in a hand font, in a taller band", () => {
    const body = (style: string) =>
      `  group backend "Backend" {\n    api["API"]\n  }\n  layout manual\n  placement { place api at (200, 160) }\n${style}`;
    const plain = run("flow", body(""));
    const sized = run("flow", body('  style backend { font "Caveat"; fontSize 22 }'));
    const [title] = textsOf(find(sized.scene!.items, "backend", "element"));
    expect(title).toMatchObject({ text: "Backend", size: 22, stack: "Caveat" });
    const header = (r: typeof plain) => r.boxes!.get("api")!.y - r.boxes!.get("backend")!.y;
    expect(header(sized)).toBeGreaterThan(header(plain));
  });

  it("takes rules of nodes, and leaves decisions and data stores at the theme's weight", () => {
    const result = run(
      "flow",
      '  a["A"]\n  decision ok "OK?"\n  db[("DB")]\n  layout manual\n  placement { place a at (100, 100); place ok at (400, 100); place db at (700, 100) }\n  rule node { fontWeight 500 }',
    );
    const weight = (id: string) => textsOf(find(result.scene!.items, id, "element"))[0]!.weight;
    expect(weight("a")).toBe(500);
    expect(weight("ok")).toBe(LIGHT.labelWeight);
    expect(weight("db")).toBe(LIGHT.labelWeight);
  });

  it("reports a written size that overflows a written box, with a hint that fits", () => {
    const body = (size: number) =>
      `  api["API Gateway"]\n  layout manual\n  placement { place api at (200, 100); size api (160, 56) }\n  style api { fontSize ${size} }`;
    const big = run("flow", body(32)).diagnostics.filter((d) => d.code === "layout.text-overflow");
    expect(big).toHaveLength(1);
    const width = Math.ceil(fonts.width("API Gateway", LIGHT.font, LIGHT.labelWeight, 32) + 32);
    expect(big[0]!.hints![0]).toContain(`size api (${width}, 56)`);
    expect(
      run("flow", body(13)).diagnostics.filter((d) => d.code === "layout.text-overflow"),
    ).toEqual([]);
  });

  it("estimates a style's unknown font and reports it once", () => {
    const result = run(
      "flow",
      '  api["API"]\n  db["DB"]\n  layout manual\n  placement { place api at (100, 100); place db at (400, 100) }\n  style api, db { font "Comic Sans MS" }',
    );
    const reports = result.diagnostics.filter((d) => d.code === "layout.unmeasured-font");
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("Comic Sans MS");
  });

  it("keeps a sticky's, a text's and a box's defaults", () => {
    const result = run(
      "free",
      '  sticky s "Note"\n  text t "Title"\n  box b "Box"\n  placement {\n    place s at (100, 100)\n    place t at (400, 100)\n    place b at (700, 100)\n  }',
    );
    const size = (id: string) => textsOf(find(result.scene!.items, id, "element"))[0]!;
    expect(size("s")).toMatchObject({
      size: Math.round(LIGHT.labelSize * 1.2 * 100) / 100,
      weight: 400,
    });
    expect(size("t").size).toBe(Math.round(LIGHT.labelSize * 1.6));
    expect(size("b").size).toBe(LIGHT.labelSize);
  });
});

describe("written text in sequence diagrams", () => {
  const seq = (body: string) => run("sequence", body);

  it("grows a head for a larger label in another family", () => {
    const body = (style: string) =>
      `  participant api "Order API"\n  participant db "DB"\n  api -> db: "Save"\n${style}`;
    const plain = seq(body(""));
    const sized = seq(body('  style api { fontSize 18; font "Montserrat" }'));
    expect(sized.boxes!.get("api")!.width).toBeGreaterThan(plain.boxes!.get("api")!.width);
    expect(sized.boxes!.get("db")!.width).toBe(plain.boxes!.get("db")!.width);
    const label = textsOf(find(sized.scene!.items, "api", "element")).find(
      (t) => t.text === "Order API",
    )!;
    expect(label).toMatchObject({ size: 18, stack: "Montserrat" });
  });

  it("wraps a larger message between pulled participants at its own size", () => {
    const result = seq(
      '  participant a "A"\n  participant b "B"\n  a -> b: "Validate the card number" as m1\n  style m1 { fontSize 16 }\n  placement { gap b -40 }',
    );
    const text = result.messageTexts!.get("m1")!;
    expect(text.size).toBe(16);
    expect(text.line).toBe(20);
    const longest = Math.max(
      ...["Validate", "the", "card", "number"].map((w) => fonts.width(w, LIGHT.font, 400, 16)),
    );
    expect(text.area.width + 0.5).toBeGreaterThanOrEqual(longest);
    for (const line of text.lines) {
      expect(fonts.width(line, LIGHT.font, 400, 16)).toBeLessThanOrEqual(text.area.width + 0.5);
    }
  });

  it("measures a note in a hand font", () => {
    const result = seq(
      '  participant a "A"\n  a -> a: "Retry"\n  note n1 over a "Retries twice"\n  style n1 { font "Caveat"; fontSize 14 }',
    );
    const [line] = textsOf(find(result.scene!.items, "n1", "event"));
    expect(line).toMatchObject({ text: "Retries twice", size: 14, stack: "Caveat" });
    const box = result.boxes!.get("n1")!;
    expect(box.width).toBeGreaterThanOrEqual(fonts.width("Retries twice", "Caveat", 400, 14));
  });

  it("draws a fragment's operator and condition at its size", () => {
    const result = seq(
      '  participant a "A"\n  participant b "B"\n  alt f1 "paid" {\n    a -> b: "Ship"\n  }\n  style f1 { fontSize 13 }',
    );
    const header = textsOf(find(result.scene!.items, "f1", "label"));
    expect(header.find((t) => t.text === "alt")).toMatchObject({ size: 13, weight: 600 });
    expect(header.find((t) => t.text === "[paid]")).toMatchObject({ size: 13, weight: 400 });
  });
});

describe("written text in C4 views", () => {
  const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
  const view = (extra: string) => {
    const text = commerce.replace(
      '  label shop.api "API de pedidos"\n',
      `  label shop.api "API de pedidos"\n${extra}`,
    );
    const compilation = compile(text);
    const diagram = compilation.document.diagrams.find((d) => d.id === "containers")!;
    return layoutDiagram(compilation, diagram, { engine: gridEngine, measurer: fonts });
  };

  it("grows a container with a larger name in another family", () => {
    const plain = view("");
    const sized = view('  style shop.api { fontSize 20; font "Open Sans" }\n');
    const box = sized.boxes!.get("shop.api")!;
    expect(box.width).toBeGreaterThan(plain.boxes!.get("shop.api")!.width);
    const texts0 = textsOf(find(sized.scene!.items, "shop.api", "element"));
    for (const text of texts0) {
      expect(text.y).toBeGreaterThan(box.y + sized.offset!.y);
      expect(text.y).toBeLessThan(box.y + box.height + sized.offset!.y);
    }
    const texts = textsOf(find(sized.scene!.items, "shop.api", "element"));
    expect(texts[0]).toMatchObject({ size: 20, stack: "Open Sans" });
    expect(sized.boxes!.get("shop.web")).toEqual(plain.boxes!.get("shop.web"));
  });

  it("scales a relation's technology line with its label", () => {
    const sized = view("  style request { fontSize 14 }\n");
    const [label, technology] = textsOf(find(sized.scene!.items, "request", "label"));
    expect(label).toMatchObject({ text: "HTTPS", size: 14, weight: 500 });
    expect(technology).toMatchObject({ text: "[JSON/HTTPS]", size: Math.round(14 * 0.85) });
  });
});

describe("the audit measures written fonts", () => {
  it("cuts a label that a wide family pushes out of its box, and not in the theme's font", () => {
    const body = (style: string) =>
      `  api["Orders API"]\n  layout manual\n  placement { place api at (200, 100); size api (120, 56) }\n${style}`;
    const wide = run("flow", body('  style api { font "Playfair Display"; fontSize 30 }'));
    const cuts = auditLabels(wide.scene!, fonts).filter((p) => p.kind === "cut");
    expect(cuts.map((p) => p.text.owner)).toContain("api");
    const plain = run("flow", body(""));
    expect(auditLabels(plain.scene!, fonts).filter((p) => p.kind === "cut")).toEqual([]);
  });
});
