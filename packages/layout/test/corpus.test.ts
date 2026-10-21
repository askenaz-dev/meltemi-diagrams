import { describe, expect, it } from "vitest";
import { compile, diagnosticsToJson, stringifyJson } from "@meltemi/diagrams-model";
import { corpusFiles } from "../../../test-support/corpus.js";
import { gridEngine } from "../../../test-support/grid-engine.js";
import { layoutDiagram } from "../src/index.js";

const snapshotPath = (path: string, suffix: string) => path.replace(/\.meltemi$/, suffix);

describe("corpus/valid lays out", () => {
  it.each(corpusFiles("valid").map((f) => [f.name, f] as const))(
    "%s produces a scene or is reported as not placeable",
    (_name, file) => {
      const compilation = compile(file.text);
      expect(compilation.ok).toBe(true);
      for (const diagram of compilation.document.diagrams) {
        const result = layoutDiagram(compilation, diagram);
        if (result.scene) {
          expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
          expect(result.scene.items.length).toBeGreaterThan(0);
        } else {
          // Files written for the assisted or auto modes wait for the layout engine.
          expect(result.diagnostics.map((d) => d.code)).toEqual(["layout.mode-unsupported"]);
        }
        // With an engine every valid diagram renders.
        const arranged = layoutDiagram(compilation, diagram, { engine: gridEngine });
        expect(arranged.scene).not.toBeNull();
        expect(arranged.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      }
    },
  );
});

describe("corpus/invalid layout diagnostics", () => {
  const files = corpusFiles("invalid").filter((f) => /^invalid\/layout\./.test(f.name));

  it("has layout examples", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files.map((f) => [f.name, f] as const))("%s reports its code", async (name, file) => {
    const compilation = compile(file.text);
    const code = name.replace(/^invalid\//, "").replace(/\.meltemi$/, "");
    const diagnostics = [...compilation.diagnostics];
    // Every example but the missing engine itself is laid out with a test engine.
    const options = code === "layout.mode-unsupported" ? {} : { engine: gridEngine };
    for (const diagram of compilation.document.diagrams) {
      diagnostics.push(...layoutDiagram(compilation, diagram, options).diagnostics);
    }
    expect(diagnostics.map((d) => d.code)).toContain(code);
    await expect(stringifyJson(diagnosticsToJson(diagnostics))).toMatchFileSnapshot(
      snapshotPath(file.path, ".diagnostics.json"),
    );
  });
});
