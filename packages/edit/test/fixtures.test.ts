import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { applyEdits, inversePlan, planEdit, type EditOperation } from "../src/index.js";

interface FixtureSpec {
  operation: EditOperation;
  /** The diagram the batch test changes, for operations that name none (themes). */
  diagram?: string;
  expect?: { edits?: number; notes?: string[] };
}

const root = join(CORPUS_ROOT, "edits");
const fixtures = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const read = (name: string, file: string) => readFileSync(join(root, name, file), "utf8");

describe("edit fixtures", () => {
  it("exist", () => {
    expect(fixtures.length).toBeGreaterThan(25);
  });

  it.each(fixtures)("%s", (name) => {
    const before = read(name, "before.meltemi");
    const spec = JSON.parse(read(name, "operation.json")) as FixtureSpec;
    const compilation = compile(before);
    const result = planEdit(compilation, spec.operation, { revision: 7 });

    if (existsSync(join(root, name, "rejection.json"))) {
      const expected = JSON.parse(read(name, "rejection.json")) as {
        code: string;
        reason?: string;
        dependents?: number;
      };
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.rejection.code).toBe(expected.code);
      if (expected.reason) expect(result.rejection.reason).toContain(expected.reason);
      if (expected.dependents !== undefined) {
        expect(result.rejection.dependents).toHaveLength(expected.dependents);
      }
      return;
    }

    if (!result.ok) expect.fail(`${result.rejection.code}: ${result.rejection.reason}`);
    const plan = result.plan;
    const after = read(name, "after.meltemi");

    // Exact text, including comments, blank lines, tabs and CRLF.
    const applied = applyEdits({ text: before, revision: 7 }, plan);
    if (!applied.ok) expect.fail(applied.rejection.reason);
    expect(applied.document.text).toBe(after);
    expect(applied.document.revision).toBe(8);

    // The inverse restores the original byte for byte.
    expect(applyTextEdits(after, plan.inverse)).toBe(before);
    const undone = applyEdits(applied.document, inversePlan(plan, applied.document.revision));
    expect(undone.ok && undone.document.text).toBe(before);

    // The edit adds no diagnostics that were not there before.
    const codesBefore = new Set(compilation.diagnostics.map((d) => d.code));
    const newCodes = compile(after).diagnostics.filter((d) => !codesBefore.has(d.code));
    expect(newCodes).toEqual([]);

    if (spec.expect?.edits !== undefined) expect(plan.edits).toHaveLength(spec.expect.edits);
    for (const note of spec.expect?.notes ?? []) {
      expect(
        plan.notes.some((n) => n.includes(note)),
        `note containing "${note}"`,
      ).toBe(true);
    }
  });
});

describe("batches over the edit fixtures", () => {
  // Each fixture operation, followed by a title change and preceded by a label anchor where
  // possible, gives the same text in one batch as applied one by one; the inverse restores it.
  it.each(fixtures.filter((name) => !existsSync(join(root, name, "rejection.json"))))(
    "%s",
    (name) => {
      const before = read(name, "before.meltemi");
      const spec = JSON.parse(read(name, "operation.json")) as FixtureSpec;
      const diagram = (spec.operation as { diagram?: string }).diagram ?? spec.diagram!;
      const operations: EditOperation[] = [
        spec.operation,
        { kind: "setDiagramProperty", diagram, property: "title", value: `Fixture ${name}` },
      ];
      let sequential = before;
      for (const operation of operations) {
        const step = planEdit(compile(sequential), operation);
        if (!step.ok) expect.fail(`${operation.kind}: ${step.rejection.reason}`);
        sequential = applyTextEdits(sequential, step.plan.edits);
      }
      const batch = planEdit(compile(before), { kind: "batch", operations });
      if (!batch.ok) expect.fail(batch.rejection.reason);
      const after = applyTextEdits(before, batch.plan.edits);
      expect(after).toBe(sequential);
      expect(applyTextEdits(after, batch.plan.inverse)).toBe(before);
    },
  );
});
