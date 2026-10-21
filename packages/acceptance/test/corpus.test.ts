import { describe, expect, it } from "vitest";
import type { GroupItem } from "@meltemi/diagrams-layout";
import { BOX_SHAPES } from "@meltemi/diagrams-model";
import { renderSvg } from "@meltemi/diagrams-render";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { PROFILES, acceptanceSheets, labelTargetFiles, projectSessions } from "../src/corpus.js";

const sheets = acceptanceSheets();
const sessions = projectSessions();
const fonts = createNodeFontLibrary();

describe("acceptance corpus", () => {
  it("covers the four profiles with long labels, cycles, nested containers, parallel relations and 30 elements, and flow and free with stacks, shapes and icons", () => {
    const common = ["cycles", "long-labels", "nested", "parallel", "thirty"];
    for (const profile of PROFILES) {
      const names = sheets.filter((s) => s.profile === profile).map((s) => s.name.split("/")[1]);
      const expected =
        profile === "flow" || profile === "free"
          ? [...common, "icons", "shapes", "stacked"].sort()
          : common;
      expect(names, profile).toEqual(expected);
    }
  });

  it.each(sheets.map((s) => [s.name, s] as const))(
    "%s compiles and lays out without a problem, as its snapshot",
    async (_name, sheet) => {
      const analysis = sessions.analyze(sheet.path);
      expect(analysis.diagnostics.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
      expect(analysis.diagrams.length).toBeGreaterThan(0);
      for (const view of analysis.diagrams) {
        expect(view.layout?.scene, view.id).toBeTruthy();
        const svg = renderSvg(view.layout!.scene!, { fonts: "system", provider: fonts });
        const suffix = analysis.diagrams.length > 1 ? `.${view.id}.svg` : ".svg";
        await expect(svg).toMatchFileSnapshot(sheet.path.replace(/\.meltemi$/, suffix));
      }
    },
    60_000,
  );

  it.each(["flow/stacked", "free/stacked"])(
    "%s draws its plain containers and its band without a title, the band behind everything",
    (name) => {
      const sheet = sheets.find((s) => s.name === name)!;
      const scene = sessions.analyze(sheet.path).diagrams[0]!.layout!.scene!;
      const elements = scene.items.filter(
        (i): i is GroupItem => i.kind === "group" && i.role === "element",
      );
      for (const id of ["blue", "pink", "yellow", "band"]) {
        const group = elements.find((g) => g.id === id);
        expect(group, id).toBeDefined();
        expect(
          group!.items.filter((i) => i.kind === "text"),
          id,
        ).toEqual([]);
      }
      expect(elements[0]!.id).toBe("band");
    },
  );

  it.each(["flow/icons", "free/icons"])(
    "%s draws its icon shapes with their labels outside them, and centred icons",
    (name) => {
      const sheet = sheets.find((s) => s.name === name)!;
      const layout = sessions.analyze(sheet.path).diagrams[0]!.layout!;
      const shaped = [...layout.shapes!].filter(([, shape]) => shape === "icon").map(([id]) => id);
      expect(shaped.length).toBeGreaterThanOrEqual(5);
      expect([...layout.elementLabels!.keys()].sort()).toEqual([...shaped].sort());
      for (const id of shaped) {
        const box = layout.boxes!.get(id)!;
        const label = layout.elementLabels!.get(id)!;
        // The label lies beside the icon's square, not on it.
        const apart =
          label.x >= box.x + box.width ||
          label.x + label.width <= box.x ||
          label.y >= box.y + box.height ||
          label.y + label.height <= box.y;
        expect(apart, id).toBe(true);
      }
    },
  );

  it.each(["flow/shapes", "free/shapes"])("%s draws every shape", (name) => {
    const sheet = sheets.find((s) => s.name === name)!;
    const layout = sessions.analyze(sheet.path).diagrams[0]!.layout!;
    expect([...new Set(layout.shapes!.values())].sort()).toEqual([...BOX_SHAPES].sort());
  });
});

describe("label target", () => {
  it("is zero cut or overlapping labels over every corpus, template, example and the gallery", () => {
    const problems: string[] = [];
    let views = 0;
    for (const file of labelTargetFiles()) {
      const analysis = sessions.analyze(file);
      views += analysis.diagrams.filter((d) => d.layout?.scene).length;
      for (const d of analysis.diagnostics) {
        if (d.code === "layout.label-cut" || d.code === "layout.label-overlap") {
          problems.push(`${file}:${d.range.start.line}: ${d.code} ${d.message}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(views).toBeGreaterThan(60);
  });
});
