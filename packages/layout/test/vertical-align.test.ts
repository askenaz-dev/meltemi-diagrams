import { describe, expect, it } from "vitest";
import { IconRegistry } from "@meltemi/diagrams-assets";
import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import { compile } from "@meltemi/diagrams-model";
import { setLocale } from "@meltemi/diagrams-i18n";
import { layoutDiagram, type GroupItem, type Scene, type TextItem } from "../src/index.js";

const icons = new IconRegistry(createNodeIconPacks());
const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';
/** The technical themes' padding and label size. */
const PADDING = 16;
const LABEL = 13;

function run(body: string) {
  const source = `${PLAIN}diagram d: free {\n  layout manual\n  theme "plain"\n${body}\n}\n`;
  const compilation = compile(source);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { icons });
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return { ...result, scene: result.scene, codes: result.diagnostics.map((d) => d.code) };
}

function group(s: Scene, id: string): GroupItem {
  const found = s.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === "element",
  );
  if (!found) throw new Error(`no element ${id}`);
  return found;
}

const texts = (g: GroupItem) => g.items.filter((i): i is TextItem => i.kind === "text");

/** A box `a` of `size` placed at (100, 60) with `style`, and its group, label and drawn box. */
function boxed(style: string, label = "A", size = "(200, 120)") {
  const result = run(
    `  box a "${label}"\n  placement {\n    place a at (100, 60)\n    size a ${size}\n  }\n  style a { ${style} }`,
  );
  const g = group(result.scene, "a");
  return { result, group: g, label: texts(g)[0]!, bounds: g.bounds! };
}

describe("vertical alignment in shapes", () => {
  it("puts the label 16 px plus half a line inside the top or the bottom of a rectangle", () => {
    const top = boxed("shape rectangle; verticalAlign top");
    expect(top.label.y - top.bounds.y).toBeCloseTo(PADDING + LABEL / 2, 5);
    const bottom = boxed("shape rectangle; verticalAlign bottom");
    expect(bottom.bounds.y + bottom.bounds.height - bottom.label.y).toBeCloseTo(
      PADDING + LABEL / 2,
      5,
    );
    // `middle` is the shape's text centre, as without the property.
    const middle = boxed("shape rectangle; verticalAlign middle");
    expect(middle.label.y).toBe(boxed("shape rectangle").label.y);
    expect([top.result.codes, bottom.result.codes, middle.result.codes]).toEqual([[], [], []]);
  });

  it("keeps the label inside an ellipse's curve at the top, and moves a wide one down", () => {
    const short = boxed("shape ellipse; verticalAlign top", "Short", "(240, 120)");
    const centre = short.bounds.y + short.bounds.height / 2;
    expect(short.label.y).toBeLessThan(centre - 20);
    expect(short.label.y - short.bounds.y).toBeGreaterThanOrEqual(PADDING + LABEL / 2);
    // The curve's width at the label's top row holds the word with the padding on each side.
    const dy = (short.label.y - LABEL / 2 - centre) / (short.bounds.height / 2);
    const across = short.bounds.width * Math.sqrt(1 - dy * dy);
    expect(across).toBeGreaterThan(2 * PADDING + 30);
    expect(short.result.codes).toEqual([]);
    const wide = boxed(
      "shape ellipse; verticalAlign top",
      "A considerably longer label",
      "(240, 120)",
    );
    expect(wide.label.y).toBeGreaterThan(short.label.y);
    expect(wide.label.y).toBeLessThanOrEqual(centre);
    expect(wide.result.codes).not.toContain("layout.label-cut");
  });

  it("sits under a cylinder's top rim and above its bottom rim", () => {
    const top = boxed("shape cylinder; verticalAlign top", "Orders", "(160, 120)");
    const rectangle = boxed("shape rectangle; verticalAlign top", "Orders", "(160, 120)");
    expect(top.label.y).toBeGreaterThan(rectangle.label.y + 8);
    const bottom = boxed("shape cylinder; verticalAlign bottom", "Orders", "(160, 120)");
    const middle = boxed("shape cylinder", "Orders", "(160, 120)");
    expect(bottom.label.y).toBeGreaterThan(middle.label.y);
    expect(bottom.bounds.y + bottom.bounds.height - bottom.label.y).toBeGreaterThan(
      PADDING + LABEL / 2,
    );
    expect([top.result.codes, bottom.result.codes]).toEqual([[], []]);
  });

  it("moves the icon beside the label with it, left of the text area", () => {
    const {
      group: g,
      label,
      bounds,
    } = boxed('icon "tabler:server"; verticalAlign top; textAlign left');
    const icon = g.items.find((i): i is GroupItem => i.kind === "group" && i.role === "icon")!;
    const [, x, y, s] = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(
      icon.transform!,
    )!;
    const side = Number(s) * 24;
    // One row: the icon's middle on the label's, at the top band.
    expect(Number(y) + side / 2).toBeCloseTo(label.y, 0);
    expect(label.y - bounds.y).toBeLessThan(bounds.height / 2 - 10);
    expect(Number(x)).toBeCloseTo(bounds.x + PADDING, 0);
  });

  it("leaves a block taller than its box at the middle", () => {
    const tall = boxed("verticalAlign top", "One\\nTwo\\nThree\\nFour", "(160, 40)");
    const middle = boxed("verticalAlign middle", "One\\nTwo\\nThree\\nFour", "(160, 40)");
    expect(texts(tall.group).map((t) => t.y)).toEqual(texts(middle.group).map((t) => t.y));
    expect(tall.result.codes).toEqual(middle.result.codes);
  });
});

describe("vertical alignment ignored", () => {
  it("is reported once on a star, whose label stays at its centre", () => {
    const star = boxed("shape star; verticalAlign top", "S", "(120, 120)");
    expect(star.result.codes).toEqual(["layout.vertical-align-ignored"]);
    const [warning] = star.result.diagnostics;
    expect(warning!.severity).toBe("warning");
    expect(warning!.hints![0]).toMatch(/text band/);
    expect(star.label.y).toBe(boxed("shape star", "S", "(120, 120)").label.y);
  });

  it("names labelPosition when a centred icon puts the band at an edge", () => {
    const db = boxed(
      'icon "tabler:database"; iconPosition center; labelPosition top; verticalAlign bottom',
      "Orders",
    );
    expect(db.result.codes).toEqual(["layout.vertical-align-ignored"]);
    expect(db.result.diagnostics[0]!.hints![0]).toContain("labelPosition");
  });

  it("is quiet for a rule that one box uses", () => {
    const result = run(
      '  box r "R"\n  box s "S"\n  rule box { verticalAlign top }\n  style s { shape star }\n  placement {\n    place r at (100, 60)\n    place s at (400, 60)\n  }',
    );
    expect(result.codes).toEqual([]);
  });

  it("says to remove it from a text, in Spanish too", () => {
    const body =
      '  text t "T"\n  style t { verticalAlign top }\n  placement {\n    place t at (100, 60)\n  }';
    const english = run(body).diagnostics;
    expect(english.map((d) => d.code)).toEqual(["layout.vertical-align-ignored"]);
    setLocale("es");
    try {
      const spanish = run(body).diagnostics;
      expect(spanish.map((d) => [d.code, d.range])).toEqual(english.map((d) => [d.code, d.range]));
      expect(spanish[0]!.message).not.toBe(english[0]!.message);
      expect(spanish[0]!.hints![0]).not.toBe(english[0]!.hints![0]);
    } finally {
      setLocale("en");
    }
  });
});
