import { readFileSync } from "node:fs";
import { CanvasSession, type DocumentAnalysis } from "@meltemi/diagrams-editor";
import type { ProjectSessions } from "@meltemi/diagrams-editor/node";
import { applyTextEdits } from "@meltemi/diagrams-language";

/** The targets of decision 0032, in milliseconds at the 95th percentile. */
export const TARGETS = {
  /** Analysis of a file after an edit: compile, layout and diagnostics inside its project. */
  analysis: 500,
  /** A canvas drag: message, plan, edit, analysis and the messages back. */
  canvas: 100,
  /** The first export from a template, machine time. */
  firstExport: 60_000,
} as const;

export interface Timing {
  readonly median: number;
  readonly p95: number;
  readonly runs: number;
}

/** Median and 95th percentile of `runs` calls after `warm` unmeasured ones. */
export function time(runs: number, fn: (i: number) => void, warm = 3): Timing {
  for (let i = 0; i < warm; i++) fn(-1 - i);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn(i);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))]!;
  return { median: at(0.5), p95: at(0.95), runs };
}

/**
 * The analysis of a file after a small edit, as the editor runs it while a person types: the text
 * changes (a comment grows) and the file is analysed inside its project.
 */
export function analysisAfterEdit(sessions: ProjectSessions, path: string, runs: number): Timing {
  const text = readFileSync(path, "utf8");
  let revision = 1;
  const result = time(runs, (i) => {
    sessions.analyze(path, `${text}// edit ${i}\n`, ++revision);
  });
  sessions.close(path);
  return result;
}

/** The first element of a diagram the canvas can move: a box, not a group. */
function movable(analysis: DocumentAnalysis, diagram: string): string | undefined {
  const view = analysis.diagrams.find((d) => d.id === diagram);
  return view?.diagram.elements.find((e) => e.kind !== "group" && view.layout?.boxes?.has(e.id))
    ?.id;
}

/**
 * A canvas drag round trip as the editor runs it: the canvas sends a move, the session plans it,
 * the edit is applied, the file is analysed again and the session answers with the new drawing.
 */
export function canvasRoundTrip(sessions: ProjectSessions, path: string, runs: number): Timing {
  let text = readFileSync(path, "utf8");
  let revision = 1;
  let analysis = sessions.analyze(path, text, revision);
  const session = new CanvasSession({ grid: 14 });
  session.update(analysis);
  const diagram = session.current!;
  const id = movable(analysis, diagram);
  if (!id) throw new Error(`${path} has nothing to move.`);
  const result = time(runs, (i) => {
    const step = i % 2 === 0 ? 14 : -14;
    const outcome = session.receive({
      type: "action",
      revision: analysis.revision,
      action: { kind: "move", ids: [id], delta: { x: step, y: 0 } },
    });
    if (!outcome.plan) throw new Error(`The move of ${id} in ${path} was not planned.`);
    text = applyTextEdits(text, outcome.plan.edits);
    analysis = sessions.analyze(path, text, ++revision);
    session.update(analysis);
  });
  sessions.close(path);
  return result;
}
