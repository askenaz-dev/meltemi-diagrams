import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { corpusFiles } from "../../../test-support/corpus.js";
import { renderSvg } from "../src/index.js";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";

const measurer = createNodeFontLibrary();
// `auto` and `assisted` sheets are arranged by ELK, as the command line does.
const engine = createElkEngine();

const snapshotPath = (path: string, suffix: string) => path.replace(/\.meltemi$/, suffix);

describe("corpus/valid renders", () => {
  const renderable = corpusFiles("valid").filter((file) => {
    const compilation = compile(file.text);
    return (
      compilation.document.diagrams.length === 1 &&
      layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer, engine }).scene !==
        null
    );
  });

  it("covers the annotations, checkout and layout sheets", () => {
    const names = renderable.map((f) => f.name);
    for (const name of [
      "valid/edge/annotations.meltemi",
      "valid/checkout.meltemi",
      "valid/layout/auto.meltemi",
      "valid/layout/assisted.meltemi",
      "valid/layout/ports.meltemi",
      "valid/free/overview.meltemi",
    ])
      expect(names).toContain(name);
  });

  it.each(renderable.map((f) => [f.name, f] as const))(
    "%s matches its SVG",
    async (_name, file) => {
      const compilation = compile(file.text);
      const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
        measurer,
        engine,
      });
      expect(result.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
      const svg = renderSvg(result.scene!);
      expect(svg).toContain(`data-id="${compilation.document.diagrams[0]!.elements[0]!.id}"`);
      await expect(svg).toMatchFileSnapshot(snapshotPath(file.path, ".svg"));
    },
  );
});
