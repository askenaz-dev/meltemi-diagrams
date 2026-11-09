import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { DIAGRAM_STARTERS } from "@meltemi/diagrams-edit/starters";
import { CanvasSession, analyzeDocument } from "../src/index.js";

describe("starter sessions", () => {
  for (const starter of DIAGRAM_STARTERS)
    it(`appends and selects ${starter}`, () => {
      const text = "diagram overview: flow {}\n// keep this comment\n";
      const session = new CanvasSession();
      session.update(analyzeDocument({ text, revision: 1 }));
      const result = session.receive({
        type: "action",
        revision: 1,
        action: { kind: "createDiagram", type: starter },
      });
      expect(result.plan).toBeDefined();
      const next = applyTextEdits(text, result.plan!.edits);
      const messages = session.update(analyzeDocument({ text: next, revision: 2 }));
      const render = messages.find((m) => m.type === "render");
      expect(render?.type === "render" && render.diagram).toBe("diagram1");
      expect(next).toContain("// keep this comment");
      expect(applyTextEdits(next, result.plan!.inverse)).toBe(text);
    });
  it("advertises the entire catalogue for an empty document", () => {
    const messages = new CanvasSession().update(analyzeDocument({ text: "", revision: 1 }));
    const empty = messages.find((m) => m.type === "empty");
    expect(empty?.type === "empty" && empty.creatable).toEqual(DIAGRAM_STARTERS);
  });

  it("leaves story playback when adding a new C4 view and allocates fresh names on repetition", () => {
    let text =
      "diagram original: flow { node a }\nstory tour for original { scene first { hold 1s } }\n";
    const session = new CanvasSession();
    session.update(analyzeDocument({ text, revision: 1 }));
    const picked = session.receive({ type: "pickStory", story: "tour" });
    expect(picked.messages.find((m) => m.type === "story")).toMatchObject({
      playback: { id: "tour" },
    });
    for (const revision of [1, 2]) {
      const result = session.receive({
        type: "action",
        revision,
        action: { kind: "createDiagram", type: "c4" },
      });
      expect(result.plan).toBeDefined();
      text = applyTextEdits(text, result.plan!.edits);
      const messages = session.update(analyzeDocument({ text, revision: revision + 1 }));
      expect(messages.find((m) => m.type === "story")).toMatchObject({ playback: null });
      expect(messages.find((m) => m.type === "render")).toMatchObject({
        diagram: `diagram${revision}`,
      });
    }
    expect(text).toContain("model model1");
    expect(text).toContain("model model2");
    expect(text).toContain("story tour for original");
  });

  it("refuses a stale creation and ignores an unknown starter before producing an edit", () => {
    const session = new CanvasSession();
    session.update(analyzeDocument({ text: "diagram d: flow {}", revision: 2 }));
    const stale = session.receive({
      type: "action",
      revision: 1,
      action: { kind: "createDiagram", type: "c4" },
    });
    expect(stale.plan).toBeUndefined();
    expect(stale.messages).toContainEqual(
      expect.objectContaining({ type: "rejected", code: "edit.stale-revision" }),
    );
    expect(
      session.receive({
        type: "action",
        revision: 2,
        action: { kind: "createDiagram", type: "unknown" },
      }).plan,
    ).toBeUndefined();
  });
});
