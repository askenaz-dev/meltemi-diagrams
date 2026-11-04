import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planEdit, type EditOperation } from "@meltemi/diagrams-edit";
import { analyzeDocument, type DocumentAnalysis } from "@meltemi/diagrams-editor";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { applyTextEdits, tokenize } from "@meltemi/diagrams-language";
import type { Scene, SceneItem } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import type { SequenceEvent } from "@meltemi/diagrams-model";
import { ACCEPTANCE_ROOT } from "../src/corpus.js";

interface Step {
  readonly name: string;
  readonly operation: EditOperation;
  /** Every changed line (removed or added) matches one of these. */
  readonly changed?: readonly string[];
  readonly absent?: readonly string[];
  readonly present?: readonly string[];
  /** Elements, by diagram, whose boxes stay where they were. */
  readonly unmoved?: Readonly<Record<string, readonly string[]>>;
  /** Elements, by diagram, and the centre their box has afterwards. */
  readonly at?: Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>>;
  /** A sequence diagram whose messages keep their order. */
  readonly order?: string;
  readonly rejected?: string;
}

interface Scenario {
  readonly description: string;
  readonly sheet: string;
  readonly steps: readonly Step[];
}

const fonts = createNodeFontLibrary();
const engine = createElkEngine();
const analyze = (text: string) => analyzeDocument({ text, layout: { measurer: fonts, engine } });

const folder = join(ACCEPTANCE_ROOT, "edits");
const scenarios = readdirSync(folder)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({
    file: f,
    scenario: JSON.parse(readFileSync(join(folder, f), "utf8")) as Scenario,
  }));

/** The comments of a text, in order. */
function comments(text: string): string[] {
  return tokenize(text).tokens.flatMap((t) =>
    t.leadingTrivia
      .filter((v) => v.kind === "LineComment" || v.kind === "BlockComment")
      .map((v) => v.text),
  );
}

/** Lines removed from `before` and added in `after`, as multisets. */
function changedLines(before: string, after: string): string[] {
  const count = new Map<string, number>();
  for (const line of before.split("\n")) count.set(line, (count.get(line) ?? 0) + 1);
  const added: string[] = [];
  for (const line of after.split("\n")) {
    const n = count.get(line) ?? 0;
    if (n > 0) count.set(line, n - 1);
    else added.push(line);
  }
  const removed = [...count].flatMap(([line, n]) => Array.from({ length: n }, () => line));
  return [...removed, ...added].filter((l) => l.trim() !== "");
}

/** The fill and stroke of each element's first shape, by element id. */
function shapeStyles(scene: Scene): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (items: readonly SceneItem[]) => {
    for (const item of items) {
      if (item.kind !== "group") continue;
      if (item.role === "element") {
        const shape = item.items.find((i) => i.kind === "rect" || i.kind === "path");
        if (shape && (shape.kind === "rect" || shape.kind === "path"))
          out.set(item.id, `${shape.fill}|${shape.stroke}`);
      }
      walk(item.items);
    }
  };
  walk(scene.items);
  return out;
}

/** The relation keys of the messages of a sequence diagram, in source order. */
function messageOrder(events: readonly SequenceEvent[]): string[] {
  return events.flatMap((e) =>
    e.kind === "message"
      ? [e.relation]
      : e.kind === "fragment"
        ? e.branches.flatMap((b) => messageOrder(b.events))
        : [],
  );
}

const view = (analysis: DocumentAnalysis, id: string) =>
  analysis.diagrams.find((d) => d.id === id)!;

/** The message keys of a sequence diagram in the order the scene draws them, top to bottom. */
function drawnOrder(scene: Scene): string[] {
  return scene.items
    .filter(
      (i): i is Extract<SceneItem, { kind: "group" }> =>
        i.kind === "group" && i.role === "relation" && !!i.track,
    )
    .map((g) => ({ id: g.id, y: Math.min(...g.track!.map((p) => p.y)) }))
    .sort((a, b) => a.y - b.y)
    .map((g) => g.id);
}

describe.each(scenarios.map((s) => [s.file, s.scenario] as const))(
  "edits: %s",
  (_file, scenario) => {
    it(scenario.description, () => {
      let text = readFileSync(join(ACCEPTANCE_ROOT, scenario.sheet), "utf8");
      const original = comments(text);
      for (const step of scenario.steps) {
        const before = analyze(text);
        expect(
          before.diagnostics.filter((d) => d.severity === "error"),
          step.name,
        ).toEqual([]);
        const planned = planEdit(before.compilation, step.operation);
        if (step.rejected) {
          expect(planned.ok, step.name).toBe(false);
          if (!planned.ok) expect(planned.rejection.code, step.name).toBe(step.rejected);
          continue;
        }
        expect(planned.ok, `${step.name}: ${planned.ok ? "" : planned.rejection.reason}`).toBe(
          true,
        );
        if (!planned.ok) return;
        const next = applyTextEdits(text, planned.plan.edits);
        const after = analyze(next);
        // Source: the expected lines change, every comment stays, nothing breaks.
        expect(
          after.diagnostics.filter((d) => d.severity !== "info").map((d) => d.message),
          step.name,
        ).toEqual([]);
        for (const line of changedLines(text, next)) {
          expect(
            (step.changed ?? []).some((p) => new RegExp(p).test(line)),
            `${step.name}: unexpected change "${line}"`,
          ).toBe(true);
        }
        for (const comment of original)
          expect(next, `${step.name}: keeps ${comment}`).toContain(comment);
        for (const p of step.absent ?? []) expect(next, step.name).not.toMatch(new RegExp(p));
        for (const p of step.present ?? []) expect(next, step.name).toMatch(new RegExp(p));
        // Persistence and layout: placed boxes stay, moved ones are where they were put.
        for (const [diagram, ids] of Object.entries(step.unmoved ?? {})) {
          const was = view(before, diagram).layout!.boxes!;
          const is = view(after, diagram).layout!.boxes!;
          for (const id of ids)
            expect(is.get(id), `${step.name}: ${diagram}.${id}`).toEqual(was.get(id));
        }
        for (const [diagram, centres] of Object.entries(step.at ?? {})) {
          const boxes = view(after, diagram).layout!.boxes!;
          for (const [id, [x, y]] of Object.entries(centres)) {
            const box = boxes.get(id)!;
            expect([box.x + box.width / 2, box.y + box.height / 2], `${step.name}: ${id}`).toEqual([
              x,
              y,
            ]);
          }
        }
        // Style: every element that is still there looks the same.
        for (const v of after.diagrams) {
          const was = before.diagrams.find((d) => d.id === v.id)?.layout?.scene;
          if (!was || !v.layout?.scene) continue;
          const old = shapeStyles(was);
          for (const [id, style] of shapeStyles(v.layout.scene)) {
            if (old.has(id)) expect(style, `${step.name}: style of ${id}`).toBe(old.get(id));
          }
        }
        // Sequence: visual adjustments keep the order of messages.
        if (step.order) {
          const diagram = view(after, step.order);
          const source = messageOrder(diagram.diagram.events);
          expect(source.length, step.name).toBeGreaterThan(3);
          // Messages in parallel branches are drawn side by side in time; the rest in source order.
          const drawn = drawnOrder(diagram.layout!.scene!).filter((k) => source.includes(k));
          expect(drawn, step.name).toEqual(source);
        }
        text = next;
      }
    });
  },
);
