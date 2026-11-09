import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sceneStills, storyTimeline } from "@meltemi/diagrams-motion";
import { planEdit } from "@meltemi/diagrams-edit";
import { applyTextEdits } from "@meltemi/diagrams-language";
import type { StoryPlayerDocument } from "@meltemi/diagrams-player";
import { BROKEN_STORY, FLOWS_SOURCE } from "../../../test-support/flows.js";
import {
  produceExport,
  ProjectSessions,
  sceneFileName,
  type ExportContext,
  type ExportOutput,
  type ExportRequest,
} from "../src/node.js";

/** A story over two views of different sizes. */
const TWO_VIEWS = `language "0.2"

diagram small: free {
  canvas (480, 300)
  box a "A"
  placement {
    place a at (40, 40)
  }
}

diagram large: free {
  canvas (640, 400)
  box b "B"
  placement {
    place b at (80, 80)
  }
}

story tour for small {
  scene first {
    reveal a over 400ms
  }

  scene second {
    view large
    transition fade over 300ms
    reveal b over 400ms
  }
}
`;

const root = mkdtempSync(join(tmpdir(), "mdg-story-exports-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const write = (name: string, text: string) => {
  writeFileSync(join(root, name), text);
  return join(root, name).split(sep).join("/");
};
const flows = write("flows.meltemi", FLOWS_SOURCE);
const broken = write("broken.meltemi", `${FLOWS_SOURCE}${BROKEN_STORY}`);
const twoViews = write("views.meltemi", TWO_VIEWS);

function contextOf(path: string, reported: string[] = []): ExportContext {
  const projects = new ProjectSessions({ toolVersion: "1.0.0" });
  const workspace = projects.forFile(path);
  return {
    file: workspace.file(path)!,
    workspace,
    projects,
    playerScript: () => "/* runtime */",
    // Once per layout: what it reports, even nothing.
    report: (path) => reported.push(path),
    printed: new Set(),
  };
}

const request = (
  target: ExportRequest["target"],
  format: ExportRequest["format"],
  options: Partial<ExportRequest> = {},
): ExportRequest => ({
  target,
  format,
  theme: null,
  fonts: "system",
  motion: "static",
  at: null,
  scenario: undefined,
  scale: 1,
  size: null,
  background: null,
  link: null,
  embed: false,
  autoplay: false,
  loop: false,
  fps: null,
  durationMs: null,
  out: null,
  ...options,
});

const storiesOf = (context: ExportContext) => context.file.compilation.document.stories;
const storyOf = (context: ExportContext, id: string) =>
  storiesOf(context).find((s) => s.id === id)!;

/** The player document a page embeds. */
const embedded = (output: ExportOutput): StoryPlayerDocument => {
  if (!("text" in output)) throw new Error(JSON.stringify(output));
  const json = /<script type="application\/json">(.*?)<\/script>/s.exec(output.text)![1]!;
  return JSON.parse(json.replace(/\\u003c/g, "<")) as StoryPlayerDocument;
};

describe("every story in one player", () => {
  it("writes the page of every story of the file over the views they share", () => {
    const context = contextOf(flows);
    const output = produceExport(
      context,
      request({ kind: "stories", stories: storiesOf(context) }, "html"),
    );
    if (!("text" in output)) throw new Error(JSON.stringify(output));
    expect(output.stories).toEqual(["purchase", "refund"]);
    expect(output.notices).toBeUndefined();
    const doc = embedded(output);
    expect(doc.stories.map((s) => s.id)).toEqual(["purchase", "refund"]);
    expect(Object.keys(doc.views)).toEqual(["checkout"]);
    expect(output.text.startsWith("<!doctype html>")).toBe(true);
    // The same page twice, and in the order asked.
    expect(
      produceExport(context, request({ kind: "stories", stories: storiesOf(context) }, "html")),
    ).toEqual(output);
    const reversed = produceExport(
      context,
      request({ kind: "stories", stories: [...storiesOf(context)].reverse() }, "html", {
        embed: true,
      }),
    );
    expect(embedded(reversed).stories.map((s) => s.id)).toEqual(["refund", "purchase"]);
    expect("text" in reversed && reversed.text.startsWith("<meltemi-player>")).toBe(true);
  });

  it("leaves out a story that cannot be drawn, with one notice, and lays out a view once", () => {
    const reported: string[] = [];
    const context = contextOf(broken, reported);
    const output = produceExport(
      context,
      request({ kind: "stories", stories: storiesOf(context) }, "html"),
    );
    if (!("text" in output)) throw new Error(JSON.stringify(output));
    expect(output.stories).toEqual(["purchase", "refund"]);
    expect(output.notices).toEqual([
      "The story `outage` was left out: it shows a diagram that cannot be drawn.",
    ]);
    expect(embedded(output).stories.map((s) => s.id)).toEqual(["purchase", "refund"]);
    // `checkout`, shown by both stories, is laid out once.
    expect(reported).toEqual([broken]);
    const none = produceExport(
      context,
      request({ kind: "stories", stories: [storyOf(context, "outage")] }, "html"),
    );
    expect(none).toEqual({
      problem: "No story can be drawn: `outage` shows a diagram that cannot be drawn.",
    });
  });

  it("is an HTML player only", () => {
    const context = contextOf(flows);
    for (const format of ["svg", "png", "mp4"] as const) {
      expect(
        produceExport(context, request({ kind: "stories", stories: storiesOf(context) }, format)),
      ).toEqual({ problem: "Every story goes into one HTML player; choose the HTML format." });
    }
  });
});

describe("a picture per scene", () => {
  it("uses edited scene totals in the player and every exported scene frame", () => {
    const before = contextOf(twoViews);
    const plan = planEdit(before.file.compilation, {
      kind: "setSceneDuration",
      story: "tour",
      scene: "first",
      durationMs: 1500,
    });
    if (!plan.ok) throw new Error(plan.rejection.reason);
    const changed = applyTextEdits(TWO_VIEWS, plan.plan.edits);
    expect(applyTextEdits(changed, plan.plan.inverse)).toBe(TWO_VIEWS);
    const context = contextOf(write("timed-views.meltemi", changed));
    const story = storyOf(context, "tour");
    const timeline = storyTimeline(story);
    expect(timeline.durationMs).toBe(2200);
    expect(timeline.scenes[1]!.startMs).toBe(1500);
    const player = embedded(produceExport(context, request({ kind: "story", story }, "html")));
    expect(player.stories[0]!.timeline.durationMs).toBe(2200);
    const scenes = produceExport(
      context,
      request({ kind: "story", story }, "svg", { scenes: true }),
    );
    if (!("texts" in scenes)) throw new Error(JSON.stringify(scenes));
    const instants = sceneStills(timeline).map((s) => s.atMs);
    expect(instants).toEqual([1499.99, 2200]);
    scenes.texts.forEach((scene, i) => {
      const frame = produceExport(
        context,
        request({ kind: "story", story }, "svg", { at: instants[i]! }),
      );
      expect("text" in frame && frame.text).toBe(scene.output);
    });
  });

  it("names a scene's file after the one-frame name", () => {
    expect(sceneFileName("purchase.purchase.svg", "overview")).toBe(
      "purchase.purchase.overview.svg",
    );
    expect(sceneFileName("out/a.b/purchase.slides.png", "x")).toBe("out/a.b/purchase.slides.x.png");
    expect(sceneFileName("C:\\out\\deck", "x")).toBe("C:\\out\\deck.x");
  });

  it("writes the SVG of every scene's final state, equal to the frame at its instant", () => {
    const context = contextOf(flows);
    const story = storyOf(context, "purchase");
    const output = produceExport(
      context,
      request({ kind: "story", story }, "svg", { scenes: true, out: "/out/flows.purchase.svg" }),
    );
    if (!("texts" in output)) throw new Error(JSON.stringify(output));
    expect(output.texts.map((t) => [t.scene, t.name, t.out])).toEqual([
      ["overview", "flows.purchase.overview.svg", "/out/flows.purchase.overview.svg"],
      ["processing", "flows.purchase.processing.svg", "/out/flows.purchase.processing.svg"],
    ]);
    const instants = sceneStills(storyTimeline(story)).map((s) => s.atMs);
    expect(instants).toEqual([1800 - 0.01, 7400]);
    output.texts.forEach((text, i) => {
      const at = produceExport(
        context,
        request({ kind: "story", story }, "svg", { at: instants[i]! }),
      );
      expect("text" in at && at.text).toBe(text.output);
    });
    // The final state of the overview: every box revealed.
    expect(output.texts[0]!.output).not.toContain('opacity="0"');
    // Without `out`, the names are the file's stem, the story and the scene.
    const unnamed = produceExport(
      context,
      request({ kind: "story", story }, "svg", { scenes: true }),
    );
    expect("texts" in unnamed && unnamed.texts.map((t) => [t.name, t.out])).toEqual([
      ["flows.purchase.overview.svg", null],
      ["flows.purchase.processing.svg", null],
    ]);
  });

  it("captures a PNG per scene", () => {
    const context = contextOf(flows);
    const output = produceExport(
      context,
      request({ kind: "story", story: storyOf(context, "refund") }, "png", {
        scenes: true,
        scale: 2,
        out: "flows.refund.png",
      }),
    );
    if (!("jobs" in output)) throw new Error(JSON.stringify(output));
    expect(output.jobs.map((j) => [j.name, j.output.kind, j.output.scale])).toEqual([
      ["flows.refund.request.png", "png", 2],
      ["flows.refund.refunded.png", "png", 2],
    ]);
  });

  it("prints one PDF with a page per scene, every page the largest frame's size", () => {
    const context = contextOf(twoViews);
    const output = produceExport(
      context,
      request({ kind: "story", story: storyOf(context, "tour") }, "pdf", {
        scenes: true,
        out: "views.tour.pdf",
      }),
    );
    if (!("job" in output)) throw new Error(JSON.stringify(output));
    const { job } = output;
    expect([job.kind, job.width, job.height, job.pages?.length]).toEqual(["pdf", 640, 400, 2]);
    // Each page is a frame of its own view.
    expect(job.pages![0]!.svg).toContain('viewBox="0 0 480 300"');
    expect(job.pages![1]!.svg).toContain('viewBox="0 0 640 400"');
    expect(job.svg).toBe(job.pages![0]!.svg);
  });

  it("refuses an instant, another format and a diagram", () => {
    const context = contextOf(flows);
    const story = storyOf(context, "purchase");
    expect(
      produceExport(context, request({ kind: "story", story }, "svg", { scenes: true, at: 1000 })),
    ).toEqual({
      problem: "A picture per scene draws every scene's final state; it cannot take an instant.",
    });
    for (const format of ["html", "gif"] as const) {
      expect(
        produceExport(context, request({ kind: "story", story }, format, { scenes: true })),
      ).toEqual({ problem: "A picture per scene is an SVG, PNG or PDF export." });
    }
    const diagram = context.file.compilation.document.diagrams[0]!;
    expect(
      produceExport(
        context,
        request({ kind: "diagram", diagram, owner: context.file }, "svg", { scenes: true }),
      ),
    ).toEqual({ problem: "A picture per scene takes a story." });
  });
});
