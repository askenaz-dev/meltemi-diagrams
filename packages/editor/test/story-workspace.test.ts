import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import {
  analyzeDocument,
  CanvasSession,
  isCanvasMessage,
  type CanvasAction,
  type HostMessage,
} from "../src/index.js";

const source = `diagram d: flow { a -> b }
story s for d {
  scene one {hold 10s}
  scene two {hold 6s}
}
`;

function session(text = source) {
  const canvas = new CanvasSession({ path: "diagrams/story.meltemi" });
  let revision = 1;
  let current = text;
  canvas.update(analyzeDocument({ text: current, revision }));
  canvas.receive({ type: "pickStory", story: "s" });
  const act = (action: CanvasAction) => {
    const before = current;
    const result = canvas.receive({ type: "action", revision, action });
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    expect(result.plan).toBeDefined();
    current = applyTextEdits(current, result.plan!.edits);
    expect(applyTextEdits(current, result.plan!.inverse)).toBe(before);
    const messages = canvas.update(analyzeDocument({ text: current, revision: ++revision }));
    return messages.find((m): m is Extract<HostMessage, { type: "story" }> => m.type === "story")!;
  };
  return { canvas, act, text: () => current, revision: () => revision };
}

describe("story workspace actions", () => {
  it("keeps the empty story and its base view after removing the final scene", () => {
    const s = session("diagram d: flow {a -> b}\nstory s for d {scene one {hold 1s}}");
    const message = s.act({ kind: "removeScene", story: "s", scene: "one" });
    expect(message.playback?.id).toBe("s");
    expect(message.playback?.timeline.scenes).toEqual([]);
    expect(Object.keys(message.playback!.views)).toEqual(["d"]);
    expect(message.stories).toEqual([{ id: "s", title: null }]);
    const added = s.act({ kind: "insertScene", story: "s" });
    expect(added.playback?.timeline.scenes).toHaveLength(1);
  });

  it("routes title, overlap and transition actions through reversible revision-checked plans", () => {
    const s = session();
    expect(
      s.act({ kind: "setStoryTitle", story: "s", title: "Development and production" }).playback
        ?.title,
    ).toBe("Development and production");
    expect(
      s.act({ kind: "setSceneTitle", story: "s", scene: "two", title: "Production" }).playback
        ?.timeline.scenes[1]!.title,
    ).toBe("Production");
    expect(
      s.act({ kind: "setSceneOverlap", story: "s", scene: "two", durationMs: 2000 }).playback
        ?.timeline.scenes[1]!.startMs,
    ).toBe(8000);
    const transitioned = s.act({
      kind: "setSceneTransition",
      story: "s",
      scene: "two",
      transition: "fade",
      durationMs: 500,
    });
    expect(transitioned.playback?.timeline.scenes[1]!.transition?.durationMs).toBe(500);
    const before = s.text();
    const stale = s.canvas.receive({
      type: "action",
      revision: 1,
      action: { kind: "removeScene", story: "s", scene: "two" },
    });
    expect(stale.plan).toBeUndefined();
    expect(stale.messages[0]).toMatchObject({ type: "rejected" });
    expect(s.text()).toBe(before);
  });

  it("rejects malformed structured scene messages at the boundary", () => {
    const valid = [
      { kind: "setStoryTitle", story: "s", title: null },
      { kind: "setSceneTitle", story: "s", scene: "one", title: "Title" },
      { kind: "removeScene", story: "s", scene: "one" },
      { kind: "setSceneOverlap", story: "s", scene: "one", durationMs: 0 },
      {
        kind: "setSceneTransition",
        story: "s",
        scene: "one",
        transition: "morph",
        durationMs: 600,
      },
    ];
    for (const action of valid)
      expect(isCanvasMessage({ type: "action", revision: 1, action })).toBe(true);
    const invalid = [
      { kind: "setStoryTitle", story: "s", title: {} },
      { kind: "setSceneTitle", story: "s", title: "Title" },
      { kind: "removeScene", scene: "one" },
      { kind: "setSceneOverlap", story: "s", scene: "one", durationMs: Infinity },
      { kind: "setSceneOverlap", story: "s", scene: "one", durationMs: -1 },
      { kind: "setSceneTransition", story: "s", scene: "one", transition: "slide" },
      { kind: "setSceneTransition", story: "s", scene: "one", transition: "fade", durationMs: NaN },
    ];
    for (const action of invalid)
      expect(isCanvasMessage({ type: "action", revision: 1, action })).toBe(false);
  });
});
