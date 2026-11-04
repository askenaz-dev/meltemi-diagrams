import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, tokensOf } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  applyEdits,
  inversePlan,
  planEdit,
  type EditOperation,
  type EditPlan,
  type VersionedDocument,
} from "../src/index.js";

/**
 * Stage 1 gate from the proposal: drag, rename and connection edits must not lose comments.
 * Each step is planned against the latest revision, as an editor would do.
 */
export const GATE_STEPS: EditOperation[] = [
  { kind: "setPosition", diagram: "checkout", element: "api", x: 380, y: 200 },
  { kind: "setPosition", diagram: "checkout", element: "db", x: 1040, y: 180 },
  { kind: "setSize", diagram: "checkout", element: "orders", width: 240, height: 120 },
  {
    kind: "setRoute",
    diagram: "checkout",
    relation: "create",
    to: "north",
    via: [
      { x: 540, y: 180 },
      { x: 700, y: 90 },
    ],
  },
  {
    kind: "setLabelAnchor",
    diagram: "checkout",
    relation: "create",
    at: 35,
    offset: { x: 0, y: -20 },
  },
  {
    kind: "setRelationLabel",
    diagram: "checkout",
    relation: "create",
    label: "Crear pedido (POST /orders)",
  },
  { kind: "materializeRelationId", diagram: "checkout", relationKey: "orders->db#2", id: "read" },
  {
    kind: "setRoute",
    diagram: "checkout",
    relation: "read",
    from: "south",
    to: "south",
    via: [{ x: 870, y: 300 }],
  },
  { kind: "renameElement", diagram: "checkout", element: "api", newId: "gateway" },
  { kind: "renameElement", diagram: "checkout", element: "orders", newId: "orderService" },
];

export const gateInput = readFileSync(
  join(CORPUS_ROOT, "valid", "edge", "commented-checkout.meltemi"),
  "utf8",
);

function comments(text: string): string[] {
  const found: string[] = [];
  for (const token of tokensOf(parse(text).root)) {
    for (const trivia of token.leadingTrivia) {
      if (trivia.kind === "LineComment" || trivia.kind === "BlockComment") found.push(trivia.text);
    }
  }
  return found;
}

export function runGate(): {
  final: VersionedDocument;
  history: { plan: EditPlan; document: VersionedDocument }[];
} {
  let document: VersionedDocument = { text: gateInput, revision: 0 };
  const history: { plan: EditPlan; document: VersionedDocument }[] = [];
  for (const operation of GATE_STEPS) {
    const result = planEdit(compile(document.text), operation, { revision: document.revision });
    if (!result.ok) throw new Error(`${operation.kind}: ${result.rejection.reason}`);
    const applied = applyEdits(document, result.plan);
    if (!applied.ok) throw new Error(applied.rejection.reason);
    document = applied.document;
    history.push({ plan: result.plan, document });
  }
  return { final: document, history };
}

describe("Stage 1 gate", () => {
  it("keeps every comment through drag, resize, route, label and rename edits", () => {
    const { final } = runGate();
    expect(final.revision).toBe(GATE_STEPS.length);
    expect(comments(gateInput)).toHaveLength(16);
    expect(comments(final.text)).toEqual(comments(gateInput));
    const compilation = compile(final.text);
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    expect(diagram.elementsById.has("gateway")).toBe(true);
    expect(diagram.elementsById.has("orderService")).toBe(true);
    expect(
      diagram.placement.find((p) => p.statement === "place" && p.target === "gateway"),
    ).toMatchObject({
      x: 380,
      y: 200,
    });
    expect(diagram.relationsByKey.get("read")).toMatchObject({
      from: "orderService",
      to: "db",
      label: "Leer",
    });
  });

  it("changes only the edited lines", () => {
    const { final } = runGate();
    const before = gateInput.split("\n");
    const after = final.text.split("\n");
    const added = after.filter((line) => !before.includes(line));
    const removed = before.filter((line) => !after.includes(line));
    // One new `place`, one new `size` and one new `route` line are inserted; nothing else moves.
    expect(after.length - before.length).toBe(3);
    expect(added).toHaveLength(removed.length + 3);
    expect(removed.every((line) => /\b(api|orders|place|route|label)\b/.test(line))).toBe(true);
    expect(
      added.every((line) => /gateway|orderService|place|size|route|label|read/.test(line)),
    ).toBe(true);
    // Lines without edits keep their exact text and order.
    const untouched = before.filter((line) => after.includes(line));
    expect(after.filter((line) => untouched.includes(line))).toEqual(untouched);
  });

  it("undoes every step in reverse order back to the original bytes", () => {
    const { final, history } = runGate();
    let document = final;
    for (const { plan, document: produced } of [...history].reverse()) {
      expect(document.text).toBe(produced.text);
      const undone = applyEdits(document, inversePlan(plan, document.revision));
      if (!undone.ok) throw new Error(undone.rejection.reason);
      document = undone.document;
    }
    expect(document.text).toBe(gateInput);
  });
});
