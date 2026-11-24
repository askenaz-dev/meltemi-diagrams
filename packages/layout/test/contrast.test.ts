import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale, type Locale } from "@meltemi/diagrams-i18n";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  auditContrast,
  contrastRatio,
  layoutDiagram,
  parseColour,
  passingColour,
  type GroupItem,
  type LayoutOptions,
  type Scene,
  type SceneItem,
} from "../src/index.js";

const measurer = createNodeFontLibrary();

const rgb = (text: string) => parseColour(text)!;
const ratio = (a: string, b: string) => contrastRatio(rgb(a), rgb(b));

const text = (x: number, y: number, value: string, fill: string, size = 12, weight = 400) =>
  ({
    kind: "text",
    x,
    y,
    baseline: y + 4,
    text: value,
    size,
    weight,
    font: "body",
    anchor: "middle",
    fill,
  }) satisfies SceneItem;

const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  opacity?: number,
) =>
  ({
    kind: "rect",
    x,
    y,
    width,
    height,
    radius: 0,
    fill,
    stroke: "#000000",
    strokeWidth: 1,
    dashed: false,
    ...(opacity === undefined ? {} : { opacity }),
  }) satisfies SceneItem;

const group = (id: string, items: SceneItem[], extra: Partial<GroupItem> = {}): GroupItem => ({
  kind: "group",
  id,
  role: "element",
  items,
  ...extra,
});

const scene = (...items: SceneItem[]): Scene => ({
  width: 600,
  height: 400,
  background: "#FFFFFF",
  title: null,
  description: null,
  fonts: { body: "Inter", mono: "Cascadia Mono" },
  gradients: [],
  patterns: [],
  items,
});

describe("colours and ratios", () => {
  it("reads hexadecimal and rgb() colours, and refuses what it cannot weigh", () => {
    expect(parseColour("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColour("#DAE8FC")).toEqual({ r: 218, g: 232, b: 252 });
    expect(parseColour("#dae8fcff")).toEqual({ r: 218, g: 232, b: 252 });
    expect(parseColour("rgb(8, 145, 178)")).toEqual({ r: 8, g: 145, b: 178 });
    expect(parseColour("rgba(8, 145, 178, 1)")).toEqual({ r: 8, g: 145, b: 178 });
    expect(parseColour("#dae8fc80")).toBeNull();
    expect(parseColour("rgba(8, 145, 178, 0.5)")).toBeNull();
    expect(parseColour("rgb(300, 0, 0)")).toBeNull();
    expect(parseColour("tomato")).toBeNull();
    expect(parseColour("url(#dots)")).toBeNull();
    expect(parseColour("#12345")).toBeNull();
  });

  it("computes the ratios of WCAG 2", () => {
    expect(ratio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(ratio("#FFFFFF", "#dae8fc").toFixed(2)).toBe("1.24");
    expect(ratio("#FFFFFF", "#F59E0B").toFixed(2)).toBe("2.15");
    expect(ratio("#3B82F6", "#1b1f24")).toBeGreaterThan(4.5);
    expect(ratio("#3B82F6", "#1b1f24")).toBeLessThan(4.503);
    expect(ratio("#0B1830", "#FDE68A").toFixed(2)).toBe("14.20");
  });

  it("proposes the ink when it passes, else black or white", () => {
    expect(passingColour("#FDE68A", "#0B1830", 4.5)).toBe("#0B1830");
    expect(passingColour("#0891B2", "#F7FBFF", 4.5)).toBe("#000000");
    expect(passingColour("#1D4ED8", "#0B1830", 4.5)).toBe("#FFFFFF");
  });
});

describe("contrast audit", () => {
  it("compares a text with the last fill painted under its centre", () => {
    const problems = auditContrast(
      scene(
        rect(0, 0, 400, 300, "#0B1830"),
        group("api", [rect(20, 20, 160, 56, "#dae8fc"), text(100, 48, "Order API", "#FFFFFF")]),
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      owner: "api",
      text: "Order API",
      color: "#FFFFFF",
      fill: "#DAE8FC",
      needed: 4.5,
    });
  });

  it("takes the label's pill over the band behind it", () => {
    const label = group(
      "request",
      [rect(80, 40, 60, 16, "#FFFFFF"), text(110, 48, "HTTPS", "#526579")],
      { role: "label" },
    );
    expect(auditContrast(scene(rect(0, 0, 400, 300, "#526579"), label))).toEqual([]);
  });

  it("falls back to the background, and leaves what it cannot weigh unchecked", () => {
    const pale = { ...scene(text(100, 100, "Title", "#FFFFFF")), background: "#F7FBFF" };
    expect(auditContrast(pale)).toHaveLength(1);
    const unchecked = scene(
      rect(0, 0, 100, 100, "#FFFFFF", 0.5),
      text(50, 50, "Translucent", "#FFFFFF"),
      rect(100, 0, 100, 100, "url(#g)"),
      text(150, 50, "Gradient", "#FFFFFF"),
      { kind: "image", x: 200, y: 0, width: 100, height: 100, href: "data:,", title: null },
      text(250, 50, "Image", "#FFFFFF"),
      rect(300, 0, 100, 100, "tomato"),
      text(350, 50, "Named", "#FFFFFF"),
      group("faded", [rect(0, 200, 100, 100, "#FFFFFF"), text(50, 250, "Faded", "#FFFFFF")], {
        styleOpacity: 0.5,
      }),
    );
    expect(auditContrast(unchecked)).toEqual([]);
  });

  it("needs 3 to 1 of large texts", () => {
    const big = scene(text(100, 100, "Title", "#6B7C8F", 28));
    const bold = scene(text(100, 100, "Title", "#6B7C8F", 18.66, 700));
    const small = scene(text(100, 100, "Note", "#6B7C8F", 11));
    expect(auditContrast(big)).toEqual([]);
    expect(auditContrast(bold)).toEqual([]);
    expect(auditContrast(small)[0]).toMatchObject({ needed: 4.5 });
    expect(auditContrast(small)[0]!.ratio.toFixed(2)).toBe("4.28");
  });

  it("reports each pair of colours once, on the owner first in order, naming the others", () => {
    const tag = (id: string, x: number) =>
      group(id, [rect(x, 20, 60, 20, "#FDE68A"), text(x + 30, 30, id, "#FFFFFF")], {
        role: "element",
      });
    const order = new Map([
      ["c", 10],
      ["a", 20],
      ["b", 30],
    ]);
    const problems = auditContrast(scene(tag("a", 0), tag("b", 100), tag("c", 200)), {
      order: (owner) => order.get(owner) ?? 0,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ owner: "c", others: ["a", "b"] });
  });

  it("skips groups drawn in their own units and reads turned groups in their coordinates", () => {
    const mark = group("frame", [rect(0, 0, 256, 256, "#FFFFFF"), text(128, 128, "M", "#FFFFFF")], {
      transform: "translate(10 10) scale(0.1)",
      role: "frame",
    });
    const turned = group(
      "label",
      [rect(20, 20, 160, 56, "#dae8fc"), text(100, 48, "Up the side", "#FFFFFF")],
      { transform: "rotate(270 100 48)" },
    );
    const problems = auditContrast(scene(mark, turned));
    expect(problems.map((p) => p.owner)).toEqual(["label"]);
  });
});

/** Lays out the first diagram of a text with the interface in `locale`. */
function lay(text: string, options: LayoutOptions = {}, locale: Locale = "en") {
  setLocale(locale);
  const compilation = compile(text);
  return layoutDiagram(compilation, compilation.document.diagrams[0]!, {
    measurer,
    engine: gridEngine,
    ...options,
  });
}

const contrast = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.filter((d) => d.code === "layout.low-contrast");

describe("low contrast in every profile", () => {
  afterEach(() => setLocale("en"));

  it("reports white on a pale fill in a flow sheet, with the theme's ink as the hint", () => {
    const found = contrast(
      lay(`diagram d: flow {
  api["Order API"]
  db[("Orders")]
  api -> db
  style api { fill "#dae8fc"; color "#FFFFFF" }
}
`).diagnostics,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe(
      'The text "Order API" of `api` is #FFFFFF on #DAE8FC: a contrast of 1.24 to 1, under the 4.5 to 1 it needs.',
    );
    expect(found[0]!.hints).toEqual([
      'Give the text a colour that can be read on #DAE8FC, such as `color "#0B1830"`.',
    ]);
    expect(found[0]!.range.start.line).toBe(2);
    expect(found[0]!.data?.ids).toEqual(["api"]);
  });

  it("says the same in Spanish, with the decimal comma", () => {
    const source = `diagram d: flow {
  api["Order API"]
  style api { fill "#dae8fc"; color "#FFFFFF" }
}
`;
    const english = contrast(lay(source).diagnostics);
    const spanish = contrast(lay(source, {}, "es").diagnostics);
    expect(spanish.map((d) => [d.code, d.range, d.data])).toEqual(
      english.map((d) => [d.code, d.range, d.data]),
    );
    expect(spanish[0]!.message).toBe(
      'El texto "Order API" de `api` es #FFFFFF sobre #DAE8FC: un contraste de 1,24 a 1, por debajo del 4,5 a 1 que necesita.',
    );
    expect(spanish[0]!.hints).toEqual([
      'Dale al texto un color que se lea sobre #DAE8FC, como `color "#0B1830"`.',
    ]);
  });

  it("reports nothing for a sheet drawn with the theme's own colours", () => {
    const sheet = readFileSync(join(CORPUS_ROOT, "valid", "checkout.meltemi"), "utf8");
    expect(contrast(lay(sheet).diagnostics)).toEqual([]);
  });

  it("reports a sequence participant", () => {
    const found = contrast(
      lay(`diagram pay: sequence {
  participant app "App"
  participant bank "Bank"
  app -> bank: "Authorise"
  style bank { fill "#F59E0B"; color "#FFFFFF" }
}
`).diagnostics,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("`bank` is #FFFFFF on #F59E0B: a contrast of 2.15 to 1");
  });

  it("reports a group's title on its own band", () => {
    const found = contrast(
      lay(`diagram d: flow {
  group g "Backend" {
    api["API"]
  }
  style g { fill "#0B1830" }
}
`).diagnostics,
    );
    expect(found.map((d) => d.data?.ids)).toEqual([["g"]]);
    expect(found[0]!.message).toContain('"Backend"');
  });

  it("reports one pair of a theme's colours once, counting the others", () => {
    const found = contrast(
      lay(`theme acme {
  extends "technical.light"
  tag "#FDE68A"
}

diagram d: flow {
  theme "acme"
  layout manual
  tag one "One"
  tag two "Two"
  tag three "Three"
  tag four "Four"
  placement {
    place one at (60, 40)
    place two at (160, 40)
    place three at (260, 40)
    place four at (360, 40)
  }
}
`).diagnostics,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("`one` is #FFFFFF on #FDE68A: a contrast of 1.25 to 1");
    expect(found[0]!.message).toContain("3 other texts of the diagram have the same colours.");
    expect(found[0]!.hints![0]).toContain('`color "#0B1830"`');
  });

  it("needs less of a large free text than of a small note", () => {
    const found = contrast(
      lay(`diagram slide: free {
  text heading "Event platform" { fontSize 28; color "#6B7C8F" }
  note small "Retention: 7 days"
  style small { fill "#FFFFFF"; color "#6B7C8F" }
  placement {
    place heading at (200, 40)
    place small at (200, 140)
  }
}
`).diagnostics,
    );
    expect(found.map((d) => d.data?.ids)).toEqual([["small"]]);
    expect(found[0]!.message).toContain("4.28 to 1, under the 4.5 to 1");
  });

  it("reports a gantt bar's text on its own fill", () => {
    const found = contrast(
      lay(`diagram plan: gantt {
  section build "Build" {
    task design "Design" from 2026-01-05 for 10d
    task code "Code" after design for 15d
  }
  style design { fill "#FDE68A"; color "#FFFFFF" }
}
`).diagnostics,
    );
    expect(found.map((d) => d.data?.ids)).toEqual([["design"]]);
    expect(found[0]!.message).toContain("1.25 to 1");
  });

  it("leaves a patterned fill unchecked", () => {
    const found = contrast(
      lay(`diagram d: flow {
  api["API"]
  style api { fill "#dae8fc"; color "#FFFFFF"; pattern dots }
}
`).diagnostics,
    );
    expect(found).toEqual([]);
  });
});

describe("the built-in C4 classes", () => {
  const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
  const containers = commerce
    .replace('  theme "editorial.light"\n', "")
    .replace("  layout assisted\n", "");

  const person = (theme: string, source = containers) => {
    const compilation = compile(source);
    const diagram = compilation.document.diagrams.find((d) => d.id === "containers")!;
    const result = layoutDiagram(compilation, diagram, {
      measurer,
      engine: gridEngine,
      theme,
    });
    const find = (items: readonly SceneItem[]): GroupItem | undefined => {
      for (const item of items) {
        if (item.kind !== "group") continue;
        if (item.id === "customer" && item.role === "element") return item;
        const inner = find(item.items);
        if (inner) return inner;
      }
      return undefined;
    };
    const texts = find(result.scene!.items)!
      .items.filter((i) => i.kind === "text")
      .map((i) => (i.kind === "text" ? i.fill : ""));
    return { texts, found: contrast(result.diagnostics) };
  };

  it("draws a person's texts in the theme's ink where the class's colour cannot be read", () => {
    const { texts, found } = person("technical.light");
    expect(texts.length).toBeGreaterThan(0);
    expect(new Set(texts)).toEqual(new Set(["#0B1830"]));
    expect(found).toEqual([]);
  });

  it("keeps the class's colour where it can be read", () => {
    const { texts, found } = person("technical.dark");
    expect(new Set(texts)).toEqual(new Set(["#07111F"]));
    expect(found).toEqual([]);
  });

  it("keeps the colours of a class that shadows the built-in one", () => {
    const shadowed = containers.replace(
      "diagram containers: c4 using commerce {\n",
      'diagram containers: c4 using commerce {\n  class c4_person { fill "#dae8fc"; color "#FFFFFF" }\n',
    );
    const { texts, found } = person("technical.light", shadowed);
    expect(new Set(texts)).toEqual(new Set(["#FFFFFF"]));
    expect(found.map((d) => d.data?.ids)).toEqual([["customer"]]);
  });

  it("keeps a colour the person wrote, and reports it", () => {
    const written = containers.replace(
      '  label shop.api "API de pedidos"\n',
      '  label shop.api "API de pedidos"\n  style customer { color "#FFFFFF" }\n',
    );
    const { texts, found } = person("technical.light", written);
    expect(new Set(texts)).toEqual(new Set(["#FFFFFF"]));
    expect(found.map((d) => d.data?.ids)).toEqual([["customer"]]);
  });
});
