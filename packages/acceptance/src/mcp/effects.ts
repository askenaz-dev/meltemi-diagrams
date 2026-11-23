// The effect-frame journey (`mcp-acceptance`, "Effect frame acceptance"): an agent that wrote
// `animate` on an arrow checks, with the tools alone and without a story, that the arrow moves. It
// runs against the hosted endpoint and the Worker's in-memory test host; three previews, so the
// previews' rate is not at stake.
import assert from "node:assert/strict";
import type { Agent } from "./agent.js";

export type EffectsAgent = Pick<Agent, "ok" | "call">;

export const EFFECTS_PATH = "effects.meltemi";

/** A diagram with one animated arrow and no story: what "animate this arrow" writes. */
export const EFFECTS_SOURCE = `language "0.2"

// The arrow is animated in the diagram's ordinary view: this file has no story.
diagram pkce: flow {
  direction LR
  app["App"]
  server["Authorization server"]
  app -> server: "code_challenge" as authorize

  animate authorize { effect flow; duration 1200ms }
}
`;

interface Mark {
  readonly x: number;
  readonly y: number;
  readonly along: number;
}

interface Effect {
  readonly target: string;
  readonly role: string;
  readonly effect: string;
  readonly durationMs: number;
  readonly phase: number | null;
  readonly marks: readonly Mark[];
}

interface Motion {
  readonly atMs: number;
  readonly loopMs: number | null;
  readonly effects: readonly Effect[];
  readonly truncated: boolean;
}

/** What the journey found, for the step's log. */
export interface EffectFrames {
  readonly revision: number;
  /** The mark's share of the arrow at the two instants. */
  readonly along: readonly [number, number];
}

/** The circle a frame draws for a particle, as `circlePath` writes it: its centre. */
function particleOf(svg: string): { x: number; y: number } | undefined {
  const relation = /<g data-id="authorize" data-role="relation">[\s\S]*?<\/g>/.exec(svg)?.[0] ?? "";
  const circle = /<path d="M(-?[\d.]+) (-?[\d.]+) a([\d.]+) /.exec(relation);
  return circle ? { x: Number(circle[1]) + Number(circle[3]), y: Number(circle[2]) } : undefined;
}

/** Prove an animated arrow with two frames of the diagram itself, and nothing but the tools. */
export async function effectFramesJourney(
  agent: EffectsAgent,
  project: string,
): Promise<EffectFrames> {
  const before = await agent.ok("read_files", { project });
  const written = await agent.ok("write_files", {
    project,
    files: { [EFFECTS_PATH]: EFFECTS_SOURCE },
    ifRevision: before["revision"],
  });
  const revision = written["revision"] as number;
  const checked = await agent.ok("validate", { project, path: EFFECTS_PATH });
  assert.equal(
    checked["errors"],
    0,
    `the animated diagram validates: ${JSON.stringify(checked["diagnostics"])}`,
  );

  const frame = async (at?: string) => {
    const result = await agent.call("preview", {
      project,
      path: EFFECTS_PATH,
      format: "svg",
      ...(at ? { at } : {}),
    });
    assert.ok(!result.isError, `a preview${at ? ` at ${at}` : ""} is drawn`);
    const svg = result.content.find((item) => item.type === "text")?.text ?? "";
    assert.match(svg, /^<svg\b/, "the picture is an SVG");
    const report = result.structuredContent ?? {};
    assert.equal(report["revision"], revision, "the frame is of the revision written");
    return { svg, motion: report["motion"] as Motion | undefined };
  };

  // Still by default: the ordinary picture says nothing of motion and draws no particle.
  const still = await frame();
  assert.equal(still.motion, undefined, "a still picture carries no motion");
  assert.equal(particleOf(still.svg), undefined, "a still picture draws no particle");

  // Two instants of one cycle, a quarter and three quarters of the way.
  const first = await frame("300ms");
  const second = await frame("900ms");
  const marks: Mark[] = [];
  for (const [at, phase, shot] of [
    [300, 0.25, first],
    [900, 0.75, second],
  ] as const) {
    assert.ok(shot.motion, `the frame at ${at} ms reports its motion`);
    assert.equal(shot.motion.atMs, at);
    assert.equal(shot.motion.loopMs, 1200);
    assert.equal(shot.motion.truncated, false);
    assert.equal(shot.motion.effects.length, 1, "one effect is drawn");
    const [effect] = shot.motion.effects;
    assert.deepEqual(
      [effect!.target, effect!.role, effect!.effect, effect!.durationMs, effect!.phase],
      ["authorize", "relation", "flow", 1200, phase],
    );
    assert.equal(effect!.marks.length, 1, "a flow of one particle has one mark");
    const [mark] = effect!.marks;
    assert.equal(mark!.along, phase, "the mark is that share of the arrow along it");
    // The report is of the picture: the mark is where the SVG draws the particle.
    const drawn = particleOf(shot.svg);
    assert.ok(drawn, `the frame at ${at} ms draws the particle`);
    assert.ok(Math.abs(drawn.x - mark!.x) < 0.02 && Math.abs(drawn.y - mark!.y) < 0.02);
    marks.push(mark!);
  }
  const [from, to] = marks as [Mark, Mark];
  // The diagram runs left to right, so a mark that advanced toward the target moved right.
  assert.ok(to.x > from.x, "the mark advanced along the arrow, toward its target");
  assert.notEqual(first.svg, second.svg, "the two frames are different pictures");
  assert.notEqual(first.svg, still.svg, "a frame is not the still picture");
  return { revision, along: [from.along, to.along] };
}
