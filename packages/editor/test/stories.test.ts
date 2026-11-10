import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  CanvasSession,
  completions,
  definition,
  documentSymbols,
  highlights,
  hover,
  prepareRename,
  references,
  rename,
  semanticTokens,
  type HostMessage,
} from "../src/index.js";
import { ProjectSessions } from "../src/node.js";

const purchase = readFileSync(join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"), "utf8");
const analysis = analyzeDocument({ text: purchase });
/** The offset of the `n`-th occurrence of `needle`, plus `shift`. */
const find = (needle: string, n = 1, shift = 0) => {
  let at = -1;
  for (let i = 0; i < n; i++) at = purchase.indexOf(needle, at + 1);
  return at + shift;
};

/** Completion labels at the end of `line`, written as a new line of the scene `processing`. */
function completeIn(line: string, where = "    hold 2s\n") {
  const at = purchase.indexOf(where) + where.length;
  const text = purchase.slice(0, at) + line + purchase.slice(at);
  return completions(analyzeDocument({ text }), at + line.length).map((i) => i.label);
}

describe("story completion", () => {
  it("offers statements in a story and in a scene", () => {
    expect(completeIn("  ", '  title "A purchase"\n')).toEqual(["title", "description", "scene"]);
    const scene = completeIn("    ");
    expect(scene).toEqual(
      expect.arrayContaining([
        "view",
        "overlap",
        "transition",
        "reveal",
        "trace",
        "hold",
        "parallel",
      ]),
    );
  });

  it("offers the ids of the scene's view as targets", () => {
    expect(completeIn("    reveal ")).toEqual(
      expect.arrayContaining(["client", "api", "orders", "db", "request", "create", "save"]),
    );
    expect(completeIn("    reveal client, ")).not.toContain("client");
    expect(completeIn("    trace ")).toEqual(["request", "create", "save"]);
    expect(completeIn("    focus ")).toContain("all");
    expect(completeIn("    highlight db ")).toEqual(["over"]);
  });

  it("offers diagrams, transitions and the header", () => {
    expect(completeIn("    view ")).toContain("checkout");
    expect(completeIn("    transition ")).toEqual(["cut", "fade", "morph"]);
    const text = `${purchase}\nstory other for `;
    expect(completions(analyzeDocument({ text }), text.length).map((i) => i.label)).toContain(
      "checkout",
    );
    const top = completions(analyzeDocument({ text: `${purchase}\n` }), purchase.length + 1).map(
      (i) => i.label,
    );
    expect(top).toContain("story");
  });
});

describe("story hover and outline", () => {
  it("documents the overlap header and its bound", () => {
    const text = purchase.replace("  scene processing {", "  scene processing {\n    overlap 1s");
    const result = hover(analyzeDocument({ text }), text.indexOf("overlap") + 1)!;
    expect(result.markdown).toContain("Starts this scene before the previous one ends");
    expect(result.markdown).toContain("cannot exceed either scene's duration");
  });

  it("documents actions with their place on the clock", () => {
    const action = hover(analysis, find("reveal client") + 1)!;
    expect(action.markdown).toContain("**reveal** — Fades the targets in");
    expect(action.markdown).toContain("From 0 s for 800 ms.");
    const hold = hover(analysis, find("hold 2s") + 1)!;
    expect(hold.markdown).toContain("From 5.4 s for 2 s.");
  });

  it("describes the story, its scenes and targets", () => {
    expect(hover(analysis, find("story purchase", 1, 7))!.markdown).toContain(
      "7.4 s in 2 scenes, about `checkout`",
    );
    expect(hover(analysis, find("scene processing", 1, 7))!.markdown).toContain(
      "1.8 s to 7.4 s · view `checkout`",
    );
    const target = hover(analysis, find("highlight db", 1, 11))!;
    expect(target.markdown).toContain("`db`");
    expect(target.markdown).toContain("in `checkout`");
    expect(hover(analysis, find("for checkout", 1, 5))!.markdown).toContain(
      "**flow diagram** `checkout`",
    );
  });

  it("lists stories and scenes in the outline", () => {
    const story = documentSymbols(analysis).find((s) => s.kind === "story")!;
    expect(story.name).toBe("purchase");
    expect(story.children.map((c) => [c.name, c.kind])).toEqual([
      ["overview", "scene"],
      ["processing", "scene"],
    ]);
  });

  it("classifies story ids and targets", () => {
    const tokens = semanticTokens(analysis);
    expect(tokens.find((t) => t.start === find("purchase for"))).toMatchObject({
      type: "type",
      declaration: true,
    });
    expect(tokens.find((t) => t.start === find("trace request", 1, 6))).toMatchObject({
      type: "function",
    });
  });
});

describe("story navigation", () => {
  const db = find("db[(");

  it("leads from a target and a view name to their declarations", () => {
    expect(definition(analysis, find("highlight db", 1, 11))!.start.offset).toBe(db);
    expect(definition(analysis, find("for checkout", 1, 5))!.start.offset).toBe(
      find("diagram checkout", 1, 8),
    );
  });

  it("finds story uses among the references", () => {
    const uses = references(analysis, db).map((r) => r.start.offset);
    expect(uses).toContain(find("orders, db", 1, 8));
    expect(uses).toContain(find("highlight db", 1, 10));
    // The same set from a story target.
    expect(references(analysis, find("highlight db", 1, 11)).map((r) => r.start.offset)).toEqual(
      uses,
    );
    expect(highlights(analysis, db).filter((h) => h.kind === "read").length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("renames from a story target", () => {
    const at = find("highlight db", 1, 11);
    expect(prepareRename(analysis, at)).toMatchObject({ ok: true, placeholder: "db" });
    const result = rename(analysis, at, "store");
    if (!result.ok) throw new Error(result.rejection.reason);
    const next = applyTextEdits(purchase, result.plan.edits);
    expect(next).toContain('store[("PostgreSQL")]');
    expect(next).toContain("      highlight store over 1200ms\n");
  });

  it("renames and hovers entities named by a story in a C4 view", () => {
    const text = [
      'language "0.2"',
      "model shop {",
      '  system web "Web" {',
      '    container api "API"',
      "  }",
      "}",
      "diagram inside: c4 using shop {",
      "  level container",
      "  scope web",
      "}",
      "story tour for inside {",
      "  scene one {",
      "    reveal web.api",
      "  }",
      "}",
      "",
    ].join("\n");
    const c4 = analyzeDocument({ text });
    const at = text.indexOf("web.api") + 5;
    expect(hover(c4, at)!.markdown).toContain("**container** `web.api` — API");
    expect(definition(c4, at)!.start.offset).toBe(text.indexOf("api "));
    const result = rename(c4, at, "backend");
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(applyTextEdits(text, result.plan.edits)).toContain("    reveal web.backend\n");
  });
});

describe("stories across the files of a project", () => {
  const root = mkdtempSync(join(tmpdir(), "mdg-stories-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "diagrams"));
  mkdirSync(join(root, "stories"));
  writeFileSync(
    join(root, "project.json"),
    JSON.stringify({ name: "p", language: "0.2", sources: ["diagrams", "stories"] }),
  );
  const checkout =
    'language "0.2"\ndiagram checkout: flow {\n  node api\n  node db\n  api -> db as save\n}\n';
  const tour =
    'language "0.2"\nimport checkout from "../diagrams/checkout.meltemi"\nstory tour for checkout {\n  scene one {\n    reveal api, db\n    trace save\n  }\n}\n';
  writeFileSync(join(root, "diagrams", "checkout.meltemi"), checkout);
  writeFileSync(join(root, "stories", "tour.meltemi"), tour);
  const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
  const checkoutPath = join(root, "diagrams", "checkout.meltemi").replace(/\\/g, "/");
  const tourPath = join(root, "stories", "tour.meltemi").replace(/\\/g, "/");
  const short = (path: string) => path.slice(path.lastIndexOf("/") + 1);

  it("leads from a target of an imported view to its declaration", () => {
    expect(sessions.analyze(tourPath).diagnostics).toEqual([]);
    const target = sessions.storyDefinition(tourPath, tour.indexOf("db"))!;
    expect(short(target.path)).toBe("checkout.meltemi");
    expect(target.range.start.offset).toBe(checkout.indexOf("db"));
    const view = sessions.storyDefinition(tourPath, tour.indexOf("for checkout") + 5)!;
    expect(view.range.start.offset).toBe(checkout.indexOf("checkout"));
  });

  it("offers no new diagram while a story of a file without diagrams plays", () => {
    const canvas = new CanvasSession();
    expect(canvas.update(sessions.analyze(tourPath, undefined, 1))[0]).toMatchObject({
      type: "empty",
      creatable: ["flow", "sequence", "c4", "gantt", "whiteboard", "kanban", "free"],
    });
    const played = canvas.receive({ type: "pickStory", story: "tour" }).messages;
    expect(played[0]).toMatchObject({ type: "empty", creatable: [] });
    expect(played[1]).toMatchObject({ type: "story", playback: { id: "tour" } });
    const left = canvas.receive({ type: "pickStory", story: null }).messages;
    expect(left[0]).toMatchObject({
      type: "empty",
      creatable: ["flow", "sequence", "c4", "gantt", "whiteboard", "kanban", "free"],
    });
  });

  it("reorders a separate story of an imported diagram without changing that diagram", () => {
    const project = new ProjectSessions({ toolVersion: "1.0.0" });
    const canvas = new CanvasSession({ path: tourPath });
    canvas.update(project.analyze(tourPath, undefined, 1));
    const before = canvas
      .receive({ type: "pickStory", story: "tour" })
      .messages.find((m) => m.type === "story")!;
    const result = canvas.receive({
      type: "action",
      revision: 1,
      action: { kind: "reorderStoryAction", story: "tour", path: [0, 1], index: 0 },
    });
    expect(result.plan, JSON.stringify(result.messages)).toBeDefined();
    const moved = applyTextEdits(tour, result.plan!.edits);
    expect(moved.indexOf("trace save")).toBeLessThan(moved.indexOf("reveal api"));
    const analysis = project.analyze(tourPath, moved, 2);
    expect(analysis.diagnostics).toEqual([]);
    const after = canvas.update(analysis).find((m) => m.type === "story")!;
    expect(after).toMatchObject({ reordered: { story: "tour", path: [0, 1], index: 0 } });
    expect(after.playback!.timeline.durationMs).toBe(before.playback!.timeline.durationMs);
    expect(after.playback!.timeline.views).toEqual(before.playback!.timeline.views);
    expect(readFileSync(checkoutPath, "utf8")).toBe(checkout);
    expect(readFileSync(tourPath, "utf8")).toBe(tour);
    expect(applyTextEdits(moved, result.plan!.inverse)).toBe(tour);
  });

  it("finds the uses in other files", () => {
    const uses = sessions.targetReferences(checkoutPath, checkout.indexOf("db"))!;
    expect(uses.map((u) => [short(u.path), u.range.start.offset])).toEqual([
      ["checkout.meltemi", checkout.indexOf("db")],
      ["checkout.meltemi", checkout.indexOf("db as")],
      ["tour.meltemi", tour.indexOf("db")],
    ]);
  });

  it("renames in both files from either side", () => {
    const fromStory = sessions.storyTargetRename(tourPath, tour.indexOf("save"), "persist")!;
    if (!fromStory.ok) throw new Error(fromStory.reason);
    const edited = new Map([...fromStory.edits].map(([path, edits]) => [short(path), edits]));
    expect(applyTextEdits(checkout, edited.get("checkout.meltemi")!)).toContain(
      "api -> db as persist",
    );
    expect(applyTextEdits(tour, edited.get("tour.meltemi")!)).toContain("    trace persist\n");
    const fromDiagram = sessions.storyRenames(checkoutPath, {
      kind: "renameElement",
      diagram: "checkout",
      element: "api",
      newId: "gateway",
    });
    expect([...fromDiagram.keys()].map(short)).toEqual(["tour.meltemi"]);
    expect(applyTextEdits(tour, [...fromDiagram.values()][0]!)).toContain(
      "    reveal gateway, db\n",
    );
  });
});

describe("story mode of the canvas session", () => {
  it("explicitly clears playback for a document without stories", () => {
    const canvas = new CanvasSession();
    const messages = canvas.update(
      analyzeDocument({ text: "diagram d: flow { node a }", revision: 1 }),
    );
    expect(messages).toContainEqual({ type: "story", revision: 1, stories: [], playback: null });
  });

  it("clears the last story when it disappears and exits on a diagram pick", () => {
    const text = "diagram d: flow { node a }\nstory tour for d { scene first { hold 1s } }";
    const canvas = new CanvasSession();
    canvas.update(analyzeDocument({ text, revision: 1 }));
    canvas.receive({ type: "pickStory", story: "tour" });
    const picked = canvas.receive({ type: "pickDiagram", diagram: "d" }).messages;
    expect(picked.find((m) => m.type === "story")).toMatchObject({ playback: null });
    canvas.receive({ type: "pickStory", story: "tour" });
    const removed = canvas.update(
      analyzeDocument({ text: text.slice(0, text.indexOf("\nstory")), revision: 2 }),
    );
    expect(removed).toContainEqual({ type: "story", revision: 2, stories: [], playback: null });
  });

  it("keeps an invalid present story's last frame, then clears it when that story is removed", () => {
    const canvas = new CanvasSession({ path: "diagrams/one.meltemi" });
    canvas.update(analyzeDocument({ text: purchase, revision: 1 }));
    const played = canvas.receive({ type: "pickStory", story: "purchase" }).messages;
    expect(played.find((m) => m.type === "story")).toMatchObject({
      document: "diagrams/one.meltemi",
      playback: { id: "purchase" },
    });
    const invalid = canvas.update(
      analyzeDocument({ text: purchase.replace("for checkout", "for absent"), revision: 2 }),
    );
    expect(invalid.some((m) => m.type === "story")).toBe(false);
    const removed = canvas.update(
      analyzeDocument({ text: purchase.slice(0, purchase.indexOf("story purchase")), revision: 3 }),
    );
    expect(removed.find((m) => m.type === "story")).toMatchObject({ playback: null, stories: [] });
  });

  function session(text: string) {
    const canvas = new CanvasSession();
    let current = text;
    let revision = 1;
    let messages = canvas.update(analyzeDocument({ text: current, revision }));
    const send = (message: unknown) => {
      const result = canvas.receive(message);
      if (result.plan) {
        current = applyTextEdits(current, result.plan.edits);
        revision++;
        messages = canvas.update(analyzeDocument({ text: current, revision }));
      } else messages = [...result.messages];
      return result;
    };
    const story = () =>
      messages.find((m): m is HostMessage & { type: "story" } => m.type === "story");
    return { send, story, text: () => current, revision: () => revision };
  }

  it("lists the stories and plays one as plain data", () => {
    const canvas = session(purchase);
    expect(canvas.story()).toMatchObject({
      stories: [{ id: "purchase", title: "A purchase" }],
      playback: null,
    });
    canvas.send({ type: "pickStory", story: "purchase" });
    const playback = canvas.story()!.playback!;
    expect(playback.timeline.durationMs).toBe(7400);
    expect(Object.keys(playback.views)).toEqual(["checkout"]);
    expect(playback.targets.checkout!.map((t) => t.id)).toEqual(
      expect.arrayContaining(["client", "api", "orders", "db", "request"]),
    );
    expect(JSON.parse(JSON.stringify(playback))).toEqual(playback);
    canvas.send({ type: "pickStory", story: null });
    expect(canvas.story()!.playback).toBeNull();
    expect(canvas.send({ type: "pickStory", story: "nope" }).messages).toEqual([]);
  });

  it("turns timeline actions into edits of the story", () => {
    const canvas = session(purchase);
    canvas.send({ type: "pickStory", story: "purchase" });
    canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: { kind: "setStoryTiming", story: "purchase", path: [1, 3], durationMs: 3000 },
    });
    expect(canvas.text()).toContain("    hold 3000ms\n");
    // Still in story mode, with the new time.
    expect(canvas.story()!.playback!.timeline.durationMs).toBe(8400);
    canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: {
        kind: "addToScene",
        story: "purchase",
        scene: "overview",
        action: "highlight",
        ids: ["api"],
      },
    });
    expect(canvas.text()).toContain("    hold 1s\n    highlight api\n  }");
    canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: { kind: "insertScene", story: "purchase", after: "overview" },
    });
    expect(canvas.text()).toContain("  scene scene3 {\n  }\n\n  scene processing {");
    canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: { kind: "removeStoryAction", story: "purchase", path: [0, 2] },
    });
    expect(canvas.text()).not.toContain("highlight api");
    const refused = canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: {
        kind: "addToScene",
        story: "purchase",
        scene: "overview",
        action: "trace",
        ids: ["api"],
      },
    });
    expect(refused.messages[0]).toMatchObject({ type: "rejected", code: "edit.invalid-value" });
  });

  it("reorders a story action through one revision-checked edit and acknowledges its new path once", () => {
    const canvas = session(purchase);
    canvas.send({ type: "pickStory", story: "purchase" });
    const before = canvas.story()!.playback!.timeline;
    const action = { kind: "reorderStoryAction", story: "purchase", path: [0, 1], index: 0 };
    const stale = canvas.send({ type: "action", revision: 0, action });
    expect(stale.plan).toBeUndefined();
    expect(stale.messages[0]).toMatchObject({ type: "rejected" });
    expect(canvas.text()).toBe(purchase);
    const reordered = canvas.send({ type: "action", revision: canvas.revision(), action });
    expect(reordered.plan).toBeDefined();
    const message = canvas.story()!;
    expect(message).toMatchObject({
      reordered: { story: "purchase", path: [0, 1], index: 0 },
    });
    const timeline = message.playback!.timeline;
    expect(timeline.durationMs).toBe(before.durationMs);
    expect(timeline.scenes[0]!.actions.map((a) => [a.kind, a.startMs, a.durationMs])).toEqual([
      ["hold", 0, 1000],
      ["reveal", 1000, 800],
    ]);
    expect(timeline.scenes.slice(1)).toEqual(before.scenes.slice(1));
    expect(applyTextEdits(canvas.text(), reordered.plan!.inverse)).toBe(purchase);
    canvas.send({ type: "ready" });
    expect(canvas.story()!.reordered).toBeUndefined();
  });

  it.each(["changed text", "changed document", "left story", "older analysis"])(
    "does not acknowledge a positional reorder after %s",
    (change) => {
      let document = "one.meltemi";
      const canvas = new CanvasSession({ path: () => document });
      canvas.update(analyzeDocument({ text: purchase, revision: 1 }));
      canvas.receive({ type: "pickStory", story: "purchase" });
      const result = canvas.receive({
        type: "action",
        revision: 1,
        action: { kind: "reorderStoryAction", story: "purchase", path: [0, 1], index: 0 },
      });
      expect(result.plan).toBeDefined();
      const expected = applyTextEdits(purchase, result.plan!.edits);
      if (change === "changed document") document = "another.meltemi";
      if (change === "left story") canvas.receive({ type: "pickStory", story: null });
      if (change === "older analysis")
        canvas.update(analyzeDocument({ text: purchase, revision: 0 }));
      const text = change === "changed text" ? `// Concurrent edit\n${expected}` : expected;
      const messages = canvas.update(analyzeDocument({ text, revision: 2 }));
      const story = messages.find((m) => m.type === "story");
      expect(story).toBeDefined();
      expect(story).not.toHaveProperty("reordered");
      // A later coincidental source match must not revive an abandoned acknowledgement.
      const later = canvas.update(analyzeDocument({ text: expected, revision: 3 }));
      expect(later.find((m) => m.type === "story")).not.toHaveProperty("reordered");
    },
  );

  it("edits scene totals and removes stories through revision-checked plans", () => {
    const canvas = session(purchase);
    canvas.send({ type: "pickStory", story: "purchase" });
    const timing = {
      kind: "setSceneDuration",
      story: "purchase",
      scene: "overview",
      durationMs: 2400,
    };
    const stale = canvas.send({ type: "action", revision: 0, action: timing });
    expect(stale.plan).toBeUndefined();
    expect(stale.messages[0]).toMatchObject({ type: "rejected" });
    expect(canvas.text()).toBe(purchase);
    canvas.send({ type: "action", revision: canvas.revision(), action: timing });
    expect(canvas.text()).toContain("    hold 1600ms\n");
    expect(canvas.story()!.playback!.timeline.scenes[1]!.startMs).toBe(2400);
    const timed = canvas.text();
    const short = canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: { ...timing, durationMs: 100 },
    });
    expect(short.messages[0]).toMatchObject({ type: "rejected", code: "edit.invalid-value" });
    expect(canvas.text()).toBe(timed);
    const dependent = canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: { kind: "removeStory", story: "purchase", cascade: false },
    });
    expect(dependent.messages[0]).toMatchObject({
      type: "rejected",
      code: "edit.has-dependents",
      retry: { kind: "removeStory", cascade: true },
    });
    expect(canvas.text()).toBe(timed);
    const removed = canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: { kind: "removeStory", story: "purchase", cascade: true },
    });
    expect(removed.plan).toBeDefined();
    expect(canvas.text()).not.toContain("story purchase");
    expect(canvas.story()).toMatchObject({ playback: null, stories: [] });
    expect(applyTextEdits(canvas.text(), removed.plan!.inverse)).toBe(timed);
  });

  it("creates a story for the diagram shown and plays it on its empty scene", () => {
    const text = 'language "0.2"\n\ndiagram checkout: flow {\n  a -> b as ab\n}\n';
    const canvas = session(text);
    expect(canvas.story()).toMatchObject({ stories: [], playback: null });
    const result = canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: { kind: "createStory" },
    });
    expect(result.plan).toBeDefined();
    expect(canvas.text()).toBe(`${text}\nstory story1 for checkout {\n  scene scene1 {\n  }\n}\n`);
    const story = canvas.story()!;
    expect(story.stories).toEqual([{ id: "story1", title: null }]);
    expect(story.playback!.id).toBe("story1");
    expect(story.playback!.timeline.scenes.map((s) => [s.id, s.actions.length])).toEqual([
      ["scene1", 0],
    ]);
  });

  it("says what to do with the new story, and makes the next one for the playing story's diagram", () => {
    const canvas = new CanvasSession();
    let text = purchase;
    let revision = 1;
    canvas.update(analyzeDocument({ text, revision }));
    canvas.receive({ type: "pickStory", story: "purchase" });
    const result = canvas.receive({ type: "action", revision, action: { kind: "createStory" } });
    text = applyTextEdits(text, result.plan!.edits);
    expect(text).toContain("\nstory story1 for checkout {\n  scene scene1 {\n  }\n}\n");
    const messages = canvas.update(analyzeDocument({ text, revision: ++revision }));
    expect(messages.find((m) => m.type === "status")).toEqual({
      type: "status",
      message:
        "Created the story `story1`: select on the frame and press Add to scene to fill its first scene.",
    });
    const shown = messages.find((m): m is HostMessage & { type: "story" } => m.type === "story")!;
    expect(shown.stories.map((s) => s.id)).toEqual(["purchase", "story1"]);
    expect(shown.playback!.id).toBe("story1");
    // The status is said once.
    expect(canvas.state().some((m) => m.type === "status")).toBe(false);
    // Undone: story mode ends, as for any story that is gone.
    const undone = canvas.update(analyzeDocument({ text: purchase, revision: revision + 1 }));
    expect(
      undone.find((m): m is HostMessage & { type: "story" } => m.type === "story")!.playback,
    ).toBeNull();
  });

  it("asks the host for the pictures of every scene of a story", () => {
    const canvas = session(purchase);
    expect(canvas.send({ type: "exportScenes", story: "purchase" })).toEqual({
      messages: [],
      command: "exportScenes",
      story: "purchase",
    });
    expect(canvas.send({ type: "exportScenes", story: "tour" }).messages).toEqual([]);
    expect(canvas.send({ type: "exportScenes", story: "tour" }).command).toBeUndefined();
  });

  it("makes no story without a diagram of the file to tell", () => {
    const text =
      'language "0.2"\nimport checkout from "./checkout.meltemi"\nstory s for checkout {\n  scene one { hold 1s }\n}\n';
    const canvas = session(text);
    const refused = canvas.send({
      type: "action",
      revision: canvas.revision(),
      action: { kind: "createStory" },
    });
    expect(refused.messages).toEqual([
      {
        type: "rejected",
        code: "edit.unsafe-target",
        reason: "A story is made for a diagram of this file; show one first.",
      },
    ]);
  });

  it("plays stories of a file without diagrams", () => {
    const text =
      'language "0.2"\nimport checkout from "./checkout.meltemi"\nstory s for checkout {\n  scene one { hold 1s }\n}\n';
    const canvas = session(text);
    expect(canvas.story()).toMatchObject({ stories: [{ id: "s" }], playback: null });
  });
});
