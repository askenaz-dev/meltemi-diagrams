import { describe, expect, it } from "vitest";
import { corpusFiles, seededRandom } from "../../../test-support/corpus.js";
import { compile, diagnosticsToJson, stringifyJson, toJson } from "../src/index.js";

const snapshotPath = (path: string, suffix: string) => path.replace(/\.meltemi$/, suffix);

describe("corpus/valid", () => {
  const files = corpusFiles("valid");

  it.each(files.map((f) => [f.name, f] as const))(
    "%s compiles without errors",
    async (_name, file) => {
      const compilation = compile(file.text);
      expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(compilation.document.diagrams.length).toBeGreaterThan(0);
      await expect(stringifyJson(toJson(compilation))).toMatchFileSnapshot(
        snapshotPath(file.path, ".model.json"),
      );
    },
  );
});

describe("corpus/invalid", () => {
  const files = corpusFiles("invalid");

  it.each(files.map((f) => [f.name, f] as const))(
    "%s reports the diagnostic it is named after",
    async (name, file) => {
      const compilation = compile(file.text);
      const code = name.replace(/^invalid\//, "").replace(/\.meltemi$/, "");
      // Layout codes and `export.no-diagram` come from the layout and the command line.
      if (!/^layout\./.test(code) && code !== "export.no-diagram") {
        expect(compilation.diagnostics.map((d) => d.code)).toContain(code);
      }
      if (code.startsWith("layout.")) return; // snapshotted by the layout package
      await expect(stringifyJson(diagnosticsToJson(compilation.diagnostics))).toMatchFileSnapshot(
        snapshotPath(file.path, ".diagnostics.json"),
      );
    },
  );

  it("covers every diagnostic code produced by the corpus", () => {
    const named = new Set(
      files.map((f) => f.name.replace(/^invalid\//, "").replace(/\.meltemi$/, "")),
    );
    const produced = new Set(files.flatMap((f) => compile(f.text).diagnostics.map((d) => d.code)));
    for (const code of produced) expect(named).toContain(code);
  });
});

describe("compile never throws", () => {
  it.each([
    ["an empty string", ""],
    ["only closing braces", "}}}}}}"],
    ["a broken diagram header", "diagram : { place }"],
    ["a diagram without a body", "diagram d: flow"],
  ])("on %s", (_name, text) => {
    expect(() => compile(text)).not.toThrow();
  });

  it("on random mutations of the valid corpus", () => {
    const random = seededRandom(7);
    const alphabet = [
      '"',
      "{",
      "}",
      "(",
      ")",
      "[",
      "]",
      "->",
      "as ",
      "place ",
      "route ",
      ",",
      "\n",
      "%",
      "ms",
    ];
    for (const file of corpusFiles("valid")) {
      for (let i = 0; i < 100; i++) {
        const at = Math.floor(random() * (file.text.length + 1));
        const cut = Math.floor(random() * 4);
        const insert = alphabet[Math.floor(random() * alphabet.length)];
        const text = file.text.slice(0, at) + insert + file.text.slice(at + cut);
        expect(() => toJson(compile(text))).not.toThrow();
      }
    }
  });

  it("on 1 MB of random text", () => {
    const random = seededRandom(99);
    const alphabet = ' abxy_09{}()[]:;,."\\/*->=#%\n\n\tdiagram flow place route label style ';
    let text = "diagram d: flow {\n";
    for (let i = 0; i < 1_000_000; i++) text += alphabet[Math.floor(random() * alphabet.length)];
    expect(() => compile(text)).not.toThrow();
  });
});
