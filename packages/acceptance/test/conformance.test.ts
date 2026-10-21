import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { firstDifference, runConformance } from "../src/conformance.js";
import { REPO_ROOT } from "../src/corpus.js";

const OUTPUT = join(REPO_ROOT, "packages", "acceptance", ".test-output", "conformance");

describe("conformance suite", () => {
  it("finds the first differing path", () => {
    expect(firstDifference({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBeNull();
    expect(firstDifference({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe("$.a[1].b");
    expect(firstDifference({ a: [1] }, { a: [1, 2] })).toBe("$.a[1]");
    expect(firstDifference({ a: 1 }, { b: 1 })).toBe("$.a");
  });

  it("passes every case with this implementation", () => {
    const results = runConformance();
    expect(results.filter((r) => !r.passed)).toEqual([]);
    const kinds = new Set(results.map((r) => r.kind));
    expect([...kinds].sort()).toEqual([
      "file diagnostics",
      "invalid project",
      "model",
      "valid project",
    ]);
  }, 120_000);

  it("names the path another implementation gets wrong", () => {
    // An implementation that forgets relation labels: it prints the reference JSON without them.
    mkdirSync(OUTPUT, { recursive: true });
    const stub = join(OUTPUT, "no-labels.mjs");
    writeFileSync(
      stub,
      [
        'import { readFileSync } from "node:fs";',
        'const model = JSON.parse(readFileSync(process.argv[2].replace(/\\.meltemi$/, ".model.json"), "utf8"));',
        "for (const diagram of model.diagrams) for (const relation of diagram.relations ?? []) if (relation.label) delete relation.label;",
        "process.stdout.write(JSON.stringify(model));",
      ].join("\n"),
    );
    const results = runConformance({ command: `node "${stub}" {file}` }).filter(
      (r) => r.kind === "model",
    );
    const failed = results.filter((r) => !r.passed);
    expect(failed.length).toBeGreaterThan(0);
    expect(results.find((r) => r.name === "valid/checkout.meltemi")).toMatchObject({
      passed: false,
      detail: expect.stringMatching(/^differs at \$\.diagrams\[0\]\.relations\[\d+\]\.label$/),
    });
    // Sheets without relation labels still conform.
    expect(results.some((r) => r.passed)).toBe(true);
  }, 120_000);
});
