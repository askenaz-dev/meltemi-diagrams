import { describe, expect, it } from "vitest";
import { IconRegistry, SvgFolderPack } from "@meltemi/diagrams-assets";
import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import { compile } from "@meltemi/diagrams-model";
import {
  THEMES,
  layoutDiagram,
  type GroupItem,
  type PathItem,
  type RectItem,
  type Scene,
  type TextItem,
} from "../src/index.js";

const provider = new SvgFolderPack(
  "aws",
  new Map([
    [
      "lambda",
      '<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#ED7100"/><path fill="#FFFFFF" d="M18 50h8l7-15 9 15h6L35 26z"/></svg>',
    ],
    [
      "s3",
      '<svg viewBox="0 0 64 64"><defs><linearGradient id="g"><stop offset="0" stop-color="#1B660F"/><stop offset="1" stop-color="#6CAE3E"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>',
    ],
  ]),
  {
    title: "aws",
    version: "1",
    source: "assets/icons/aws",
    license: "LicenseRef-Test",
    author: null,
    url: null,
    redistribute: false,
  },
);
// The test's own `aws` pack comes first: it replaces the built-in provider pack, as a project's would.
const icons = new IconRegistry([provider, ...createNodeIconPacks()]);

const sheet = (body: string, theme = "plain") =>
  `theme plain { extends "technical.light"; frame none }\ndiagram d: flow {\n  layout manual\n  theme "${theme}"\n${body}\n}\n`;

function layout(text: string, withIcons = true) {
  const compilation = compile(text);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return layoutDiagram(compilation, compilation.document.diagrams[0]!, withIcons ? { icons } : {});
}

function scene(text: string, withIcons = true): Scene {
  const result = layout(text, withIcons);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return result.scene;
}

function group(s: Scene, id: string, role = "element"): GroupItem {
  const found = s.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === role,
  );
  if (!found) throw new Error(`no ${role} ${id}`);
  return found;
}

const iconOf = (g: GroupItem) =>
  g.items.find((i): i is GroupItem => i.kind === "group" && i.role === "icon");
const texts = (g: GroupItem) => g.items.filter((i): i is TextItem => i.kind === "text");
const rects = (g: GroupItem) => g.items.filter((i): i is RectItem => i.kind === "rect");
const translate = (g: GroupItem) => {
  const [, x, y, s] = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(g.transform!)!;
  return { x: Number(x), y: Number(y), scale: Number(s) };
};

const node = (style: string, theme = "plain", label = "API Gateway") =>
  sheet(
    `  api["${label}"]\n  style api { ${style} }\n  placement { place api at (200, 100) }`,
    theme,
  );

describe("icon placement", () => {
  it("puts the icon left of start-anchored text and widens the box", () => {
    const long = "API Gateway Service Layer";
    const plain = rects(group(scene(node('fill "#fff"', "plain", long)), "api"))[0]!;
    expect(plain.width).toBeGreaterThan(160);
    const g = group(scene(node('icon "tabler:server"', "plain", long)), "api");
    const icon = iconOf(g)!;
    expect(icon.id).toBe("tabler:server");
    const label = texts(g)[0]!;
    expect(label.anchor).toBe("start");
    const { x, scale } = translate(icon);
    // A Tabler view box (24 units) is drawn 18 px wide: the technical icon size.
    expect(scale).toBeCloseTo(18 / 24, 3);
    expect(label.x).toBeCloseTo(x + 18 + Math.round(18 * 0.4), 1);
    expect(rects(g)[0]!.width).toBeGreaterThan(plain.width);
  });

  it("puts the icon on top with centred text and a taller box", () => {
    const g = group(scene(node('icon "tabler:server"; iconPosition top')), "api");
    const icon = translate(iconOf(g)!);
    const label = texts(g)[0]!;
    const box = rects(g)[0]!;
    expect(label.anchor).toBe("middle");
    expect(icon.x + 9).toBeCloseTo(label.x, 1);
    expect(icon.y + 18).toBeLessThan(label.y);
    expect(box.height).toBeGreaterThan(56);
  });

  it("uses the stage theme's top position and size", () => {
    const g = group(scene(node('icon "tabler:server"', "stage.light")), "api");
    expect(texts(g)[0]!.anchor).toBe("middle");
    expect(translate(iconOf(g)!).scale).toBeCloseTo(24 / 24, 3);
  });

  it("draws icons in groups, tags, notes and relation pills", () => {
    const s = scene(
      sheet(
        [
          '  group edge "Edge" { a["A"] }',
          '  tag t "NEW"',
          '  note n "Quota"',
          "  a -> b as call",
          '  a -> c: "jobs" as jobs',
          '  style edge { icon "tabler:cloud" }',
          '  style t { icon "tabler:star" }',
          '  style n { icon "tabler:alert-triangle" }',
          '  style call { icon "tabler:lock" }',
          '  style jobs { icon "tabler:clock" }',
          "  placement { place a at (100, 100); place b at (400, 100); place c at (100, 300); place t at (300, 300); place n at (400, 300) }",
        ].join("\n"),
      ),
    );
    expect(iconOf(group(s, "edge"))!.id).toBe("tabler:cloud");
    expect(iconOf(group(s, "t"))!.id).toBe("tabler:star");
    expect(iconOf(group(s, "n"))!.id).toBe("tabler:alert-triangle");
    const call = group(s, "call", "relation");
    const pill = call.items.find((i): i is GroupItem => i.kind === "group" && i.role === "label")!;
    expect(iconOf(pill)!.id).toBe("tabler:lock");
    expect(texts(pill)).toEqual([]);
    const jobs = group(s, "jobs", "relation");
    const jobsPill = jobs.items.find(
      (i): i is GroupItem => i.kind === "group" && i.role === "label",
    )!;
    expect(iconOf(jobsPill)!.id).toBe("tabler:clock");
    expect(texts(jobsPill)[0]!.anchor).toBe("start");
  });

  it("draws nothing without a resolver or for unknown icons", () => {
    expect(iconOf(group(scene(node('icon "tabler:server"'), false), "api"))).toBeUndefined();
    expect(iconOf(group(scene(node('icon "tabler:nope"')), "api"))).toBeUndefined();
  });

  it("counts the icon in overflow checks", () => {
    const text = sheet(
      '  api["API"]\n  style api { icon "tabler:server" }\n  placement { place api at (200, 100); size api (50, 56) }',
    );
    const withIcon = layout(text).diagnostics.map((d) => d.code);
    const without = layout(text, false).diagnostics.map((d) => d.code);
    expect(withIcon).toEqual(["layout.text-overflow"]);
    expect(without).toEqual([]);
  });
});

describe("icon colour and shape", () => {
  it("paints monochrome icons with iconColor or the label colour", () => {
    const accent = iconOf(
      group(scene(node('icon "tabler:server"; iconColor accent', "technical.dark")), "api"),
    )!;
    const strokes = new Set((accent.items as PathItem[]).map((p) => p.stroke));
    expect([...strokes]).toEqual([THEMES["technical.dark"]!.accent]);
    const label = iconOf(group(scene(node('icon "tabler:server"; color "#123456"')), "api"))!;
    expect((label.items[0] as PathItem).stroke).toBe("#123456");
    expect((label.items[0] as PathItem).rounded).toBe(true);
  });

  it("keeps the colours of multicolour icons and scales them optically", () => {
    const icon = iconOf(group(scene(node('icon "aws:lambda"; iconColor "#000000"')), "api"))!;
    expect((icon.items as PathItem[]).map((p) => p.fill)).toEqual(["#ED7100", "#FFFFFF"]);
    expect(translate(icon).scale).toBeCloseTo((18 * (20 / 24)) / 64, 3);
  });

  it("gives each icon instance its own gradient ids", () => {
    const s = scene(
      sheet(
        '  a["A"]\n  b["B"]\n  style a, b { icon "aws:s3" }\n  placement { place a at (100, 100); place b at (400, 100) }',
      ),
    );
    expect(s.gradients.map((g) => g.id)).toEqual(["icon-1-g", "icon-2-g"]);
    expect((iconOf(group(s, "a"))!.items[0] as PathItem).fill).toBe("url(#icon-1-g)");
    expect((iconOf(group(s, "b"))!.items[0] as PathItem).fill).toBe("url(#icon-2-g)");
  });
});
