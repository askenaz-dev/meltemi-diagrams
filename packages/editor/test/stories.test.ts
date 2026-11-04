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
      expect.arrayContaining(["view", "transition", "reveal", "trace", "hold", "parallel"]),
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
      creatable: ["flow", "free", "sequence"],
    });
    const played = canvas.receive({ type: "pickStory", story: "tour" }).messages;
    expect(played[0]).toMatchObject({ type: "empty", creatable: [] });
    expect(played[1]).toMatchObject({ type: "story", playback: { id: "tour" } });
    const left = canvas.receive({ type: "pickStory", story: null }).messages;
    expect(left[0]).toMatchObject({ type: "empty", creatable: ["flow", "free", "sequence"] });
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

  it("plays stories of a file without diagrams", () => {
    const text =
      'language "0.2"\nimport checkout from "./checkout.meltemi"\nstory s for checkout {\n  scene one { hold 1s }\n}\n';
    const canvas = session(text);
    expect(canvas.story()).toMatchObject({ stories: [{ id: "s" }], playback: null });
  });
});
