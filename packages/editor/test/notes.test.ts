import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  CanvasSession,
  codeActions,
  completions,
  definition,
  hover,
  references,
  rename,
  type CanvasAction,
  type HostMessage,
  type InspectorField,
} from "../src/index.js";

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");

const FLOW = `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  cache["Cache"]
  api -> db: "save" as save
  note why "Idempotent" on api
  note where "Primary" on db
  placement {
    place api at (126, 112)
    place db at (420, 112)
    place cache at (420, 266)
    place why at (126, 300)
    place where at (420, 360)
  }
}
`;

/** A session on a text, with helpers that apply one action or one paste. */
function open(text: string, diagram?: string) {
  const session = new CanvasSession();
  let current = text;
  let revision = 1;
  let messages: readonly HostMessage[] = session.update(
    analyzeDocument({ text: current, revision }),
  );
  if (diagram) {
    const picked = session.receive({ type: "pickDiagram", diagram });
    if (picked.messages.length > 0) messages = [...picked.messages];
  }
  const apply = (action: CanvasAction): string => {
    const result = session.receive({ type: "action", revision, action });
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    current = applyTextEdits(current, result.plan.edits);
    revision++;
    messages = session.update(analyzeDocument({ text: current, revision }));
    return current;
  };
  const select = (...ids: string[]) => {
    const result = session.receive({ type: "select", ids });
    if (result.messages.length > 0) messages = [...result.messages];
  };
  const inspector = () =>
    messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model;
  const paste = (clipboard: string, at: { x: number; y: number }): string => {
    const result = session.paste(clipboard, at);
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    return applyTextEdits(current, result.plan.edits);
  };
  const copy = (ids: string[]): string =>
    session.receive({ type: "copy", ids }).clipboard as string;
  return { session, apply, paste, copy, select, inspector };
}

const errors = (text: string) => compile(text).diagnostics.filter((d) => d.severity === "error");

describe("duplicate and paste with notes", () => {
  it("duplicates a note with the element it is attached to, and keeps the clause between them", () => {
    const { apply } = open(FLOW);
    const text = apply({ kind: "duplicate", ids: ["api", "why"] });
    expect(text).toContain('note why_2 "Idempotent" on api_2');
    expect(errors(text)).toEqual([]);
  });

  it("drops the clause of a note copied without its element, and keeps it when the element is copied", () => {
    const { copy, paste } = open(FLOW);
    const alone = copy(["why"]);
    expect(alone).toContain('note why "Idempotent"');
    expect(alone).not.toContain(" on api");
    const pasted = paste(alone, { x: 700, y: 300 });
    expect(pasted).toContain('note why_2 "Idempotent"');
    expect(pasted).not.toMatch(/why_2 "Idempotent" on/);
    expect(errors(pasted)).toEqual([]);
    const together = copy(["api", "why"]);
    expect(together).toContain('note why "Idempotent" on api');
    expect(errors(paste(together, { x: 700, y: 300 }))).toEqual([]);
  });

  it("copies a note inside a group without the element it is attached to outside", () => {
    const text =
      'diagram d: flow {\n  layout manual\n  api["API"]\n  group g "G" {\n    note n "Note" on api\n  }\n  placement {\n    place api at (100, 100)\n    place g at (400, 100)\n    place n at (50, 50)\n  }\n}\n';
    const { copy } = open(text);
    const fragment = copy(["g"]);
    expect(fragment).toContain('note n "Note"');
    expect(fragment).not.toContain("on api");
    expect(errors(fragment)).toEqual([]);
  });
});

describe("duplicate and paste of notes in a C4 view", () => {
  it("duplicates a note of the view, kept on the entity the view draws", () => {
    const { apply } = open(commerce, "containers");
    const text = apply({ kind: "duplicate", ids: ["cache"] });
    expect(text).toMatch(/note cache_2 "Cached 5 min" on shop\.api/);
    expect(errors(text)).toEqual([]);
  });

  it("pastes a note beside an entity copied with it, attached to the copy", () => {
    const { apply, copy } = open(commerce, "containers");
    // The model's own text: copying the entity and its note together.
    const fragment = copy(["shop.db", "cache"]);
    expect(fragment).toContain('note cache "Cached 5 min" { description "shop.api" }');
    const text = apply({ kind: "duplicate", ids: ["shop.db", "cache"] });
    expect(errors(text)).toEqual([]);
    // The note was attached to `shop.api`, which was not copied: it stays on that entity.
    expect(text).toMatch(/note cache_2 "Cached 5 min" on shop\.api/);
    expect(text).toContain("db_2");
  });

  it("attaches a note copied with its entity to the pasted entity", () => {
    const withNote = commerce.replace(
      '  note cache "Cached 5 min" on shop.api\n',
      '  note cache "Cached 5 min" on shop.db\n',
    );
    const { apply } = open(withNote, "containers");
    const text = apply({ kind: "duplicate", ids: ["shop.db", "cache"] });
    expect(errors(text)).toEqual([]);
    expect(text).toMatch(/note cache_2 "Cached 5 min" on shop\.db_2/);
  });

  it("pastes a note alone, and says so when nothing on the clipboard fits", () => {
    const { copy, paste } = open(commerce, "containers");
    const note = copy(["cache"]);
    expect(note).toContain("model clipboard");
    const pasted = paste(note, { x: 500, y: 400 });
    expect(pasted).toMatch(/note cache_2 "Cached 5 min" on shop\.api/);
    expect(errors(pasted)).toEqual([]);
  });
});

describe("notes created and attached on the canvas", () => {
  it("creates a note beside the element it is dropped on, written with its `on` clause", () => {
    const { apply } = open(FLOW);
    const text = apply({
      kind: "create",
      elementKind: "note",
      at: { x: 430, y: 270 },
      attachedTo: "cache",
    });
    expect(text).toMatch(/note note1 "Note" on cache/);
    expect(errors(text)).toEqual([]);
    const place = /place note1 at \((-?\d+), (-?\d+)\)/.exec(text);
    expect(place).not.toBeNull();
    // East of the element rather than where the tool was dropped.
    expect(Number(place![1])).toBeGreaterThan(420 + 20);
  });

  it("creates a note nowhere in particular where it is dropped, without a clause", () => {
    const { apply } = open(FLOW);
    const text = apply({ kind: "create", elementKind: "note", at: { x: 600, y: 80 } });
    expect(text).toMatch(/note note1 "Note"\n/);
    expect(text).toMatch(/place note1 at \(6\d\d, \d+\)/);
    expect(errors(text)).toEqual([]);
  });

  it("attaches, moves and detaches a note with the attachNote action", () => {
    const { apply } = open(FLOW);
    expect(apply({ kind: "attachNote", note: "why", element: "cache" })).toContain(
      'note why "Idempotent" on cache',
    );
    expect(apply({ kind: "attachNote", note: "why", element: null })).toContain(
      'note why "Idempotent"\n',
    );
    const text = apply({ kind: "attachNote", note: "why", element: "db" });
    expect(text).toContain('note why "Idempotent" on db');
    expect(errors(text)).toEqual([]);
  });

  it("refuses an attachment on anything but a note, and says why", () => {
    const { session } = open(FLOW);
    const result = session.receive({
      type: "action",
      revision: 1,
      action: { kind: "create", elementKind: "box", at: { x: 0, y: 0 }, attachedTo: "api" },
    });
    expect(result.plan).toBeUndefined();
    expect(JSON.stringify(result.messages)).toMatch(/Only a note (takes an attachment|can be)/);
  });
});

describe("notes created and attached in a C4 view", () => {
  it("writes a note in the view on the entity the tool was dropped on", () => {
    const { apply } = open(commerce, "containers");
    const text = apply({
      kind: "create",
      elementKind: "note",
      at: { x: 300, y: 300 },
      attachedTo: "shop.db",
    });
    expect(text).toMatch(/note note1 "Note" on shop\.db/);
    expect(errors(text)).toEqual([]);
  });

  it("moves a note of the view to another entity and detaches it", () => {
    const { apply } = open(commerce, "containers");
    const moved = apply({ kind: "attachNote", note: "cache", element: "shop.db" });
    expect(moved).toMatch(/note cache "Cached 5 min" on shop\.db/);
    expect(errors(moved)).toEqual([]);
    const detached = apply({ kind: "attachNote", note: "cache", element: null });
    expect(detached).toMatch(/note cache "Cached 5 min"\n/);
  });

  it("refuses an entity created with an attachment: the model declares entities", () => {
    const { session } = open(commerce, "containers");
    const result = session.receive({
      type: "action",
      revision: 1,
      action: {
        kind: "create",
        elementKind: "container",
        at: { x: 0, y: 0 },
        attachedTo: "shop.api",
      },
    });
    expect(result.plan).toBeUndefined();
    expect(JSON.stringify(result.messages)).toContain("Only a note can be attached");
  });
});

describe("the inspector of a note", () => {
  const field = (fields: readonly InspectorField[], name: string) =>
    fields.find((f) => f.name === name);

  it("shows Attached to after the label, listing the other elements, and writes the clause", () => {
    const canvas = open(FLOW);
    canvas.select("why");
    let names = canvas.inspector().fields.map((f) => f.name);
    expect(names.indexOf("attachedTo")).toBe(names.indexOf("label") + 1);
    expect(field(canvas.inspector().fields, "attachedTo")).toMatchObject({
      label: "Attached to",
      type: "enum",
      value: "api",
      options: ["api", "db", "cache", "where"],
    });
    canvas.apply({ kind: "setField", ids: ["why"], field: "attachedTo", value: "cache" });
    canvas.select("why");
    expect(field(canvas.inspector().fields, "attachedTo")).toMatchObject({ value: "cache" });
    const text = canvas.apply({ kind: "setField", ids: ["why"], field: "attachedTo", value: null });
    expect(text).toContain('note why "Idempotent"\n');
    names = canvas.inspector().fields.map((f) => f.name);
    expect(names).toContain("attachedTo");
  });

  it("is not offered to a node", () => {
    const canvas = open(FLOW);
    canvas.select("api");
    expect(field(canvas.inspector().fields, "attachedTo")).toBeUndefined();
  });

  it("shows a note of a C4 view its own fields and none of an entity's", () => {
    const canvas = open(commerce, "containers");
    canvas.select("cache");
    const { fields } = canvas.inspector();
    const names = fields.map((f) => f.name);
    expect(names.filter((n) => n.startsWith("entity."))).toEqual([]);
    const own = fields.filter((f) => f.section !== "strip").map((f) => f.name);
    expect(own.slice(0, 4)).toEqual(["id", "kind", "label", "attachedTo"]);
    expect(field(fields, "label")).toMatchObject({ value: "Cached 5 min" });
    const attached = field(fields, "attachedTo")!;
    expect(attached.value).toBe("shop.api");
    expect(attached.options).toContain("shop.db");
    expect(attached.options).not.toContain("cache");
  });

  it("writes the label of a note of a view as the note's own text, not a local label", () => {
    const canvas = open(commerce, "containers");
    const text = canvas.apply({ kind: "setField", ids: ["cache"], field: "label", value: "Hot" });
    expect(text).toContain('note cache "Hot" on shop.api');
    expect(text).not.toMatch(/label cache/);
    expect(errors(text)).toEqual([]);
  });

  it("attaches a note of a view to another entity through the field", () => {
    const canvas = open(commerce, "containers");
    const text = canvas.apply({
      kind: "setField",
      ids: ["cache"],
      field: "attachedTo",
      value: "shop.db",
    });
    expect(text).toMatch(/note cache "Cached 5 min" on shop\.db/);
    expect(errors(text)).toEqual([]);
  });
});

describe("editing the note of a C4 view on the canvas", () => {
  it("types the note's text in place, renames it and deletes it with its placement", () => {
    const { apply } = open(commerce, "containers");
    const typed = apply({ kind: "setLabel", id: "cache", label: "Hot" });
    expect(typed).toContain('note cache "Hot" on shop.api');
    expect(typed).not.toMatch(/label cache/);
    const renamed = apply({ kind: "renameId", id: "cache", newId: "hot" });
    expect(renamed).toContain('note hot "Hot" on shop.api');
    expect(errors(renamed)).toEqual([]);
    const removed = apply({ kind: "remove", ids: ["hot"], cascade: false });
    expect(removed).not.toContain("note hot");
    expect(removed).not.toContain("place hot");
    expect(errors(removed)).toEqual([]);
  });
});

describe("language services for notes", () => {
  /** An analysis of a text with `|` at the cursor, and the offset. */
  function cursor(source: string) {
    const offset = source.indexOf("|");
    const text = source.replace("|", "");
    return { analysis: analyzeDocument({ text }), offset, text };
  }

  const FREE_SHEET = (statement: string) =>
    `diagram d: free {\n  box api "API"\n  box db "DB"\n  ${statement}\n}\n`;

  it("offers note among the statements of a free diagram", () => {
    const { analysis, offset } = cursor(FREE_SHEET("no|"));
    expect(completions(analysis, offset).map((i) => i.label)).toContain("note");
  });

  it("offers note among the statements of a C4 view", () => {
    const text = commerce.replace("  include customer", "  no\n  include customer");
    const offset = text.indexOf("  no\n") + 4;
    const labels = completions(analyzeDocument({ text }), offset).map((i) => i.label);
    expect(labels).toContain("note");
    expect(labels).toContain("include");
  });

  it("offers `on` after a note's text, and after `on ` the other elements without the note", () => {
    const afterText = cursor(FREE_SHEET('note n "Text" |'));
    expect(completions(afterText.analysis, afterText.offset).map((i) => i.label)).toEqual(["on"]);
    const target = cursor(FREE_SHEET('note n "Text" on |'));
    expect(completions(target.analysis, target.offset).map((i) => i.label)).toEqual(["api", "db"]);
    // Flow diagrams too.
    const flow = cursor('diagram d: flow {\n  api["API"]\n  note n "Text" on |\n}\n');
    expect(completions(flow.analysis, flow.offset).map((i) => i.label)).toEqual(["api"]);
  });

  it("offers the entities a C4 view draws after `on `, and no note", () => {
    const text = commerce.replace(
      '  note cache "Cached 5 min" on shop.api\n',
      '  note cache "Cached 5 min" on shop.api\n  note more "More" on \n',
    );
    const offset = text.indexOf('note more "More" on ') + 'note more "More" on '.length;
    const labels = completions(analyzeDocument({ text }), offset).map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["customer", "shop.web", "shop.api", "shop.db"]));
    expect(labels).not.toContain("cache");
    expect(labels).not.toContain("more");
  });

  it("offers nothing after the target, and no `on` in a sequence diagram's notes", () => {
    const done = cursor(FREE_SHEET('note n "Text" on api |'));
    expect(completions(done.analysis, done.offset).map((i) => i.label)).not.toContain("on");
  });

  it("hovers and goes to the declaration of the element a note is attached to", () => {
    const { analysis, offset, text } = cursor(FREE_SHEET('note n "Text" on a|pi'));
    const found = hover(analysis, offset);
    expect(found?.markdown).toContain("api");
    const range = definition(analysis, offset);
    expect(range).toBeDefined();
    expect(text.slice(range!.start.offset, range!.end.offset)).toBe("api");
  });

  it("describes the attachment on the word `on`", () => {
    const { analysis, offset } = cursor(FREE_SHEET('note n "Text" o|n api'));
    expect(hover(analysis, offset)?.markdown).toMatch(/Attaches a note to an element/);
  });

  it("goes to the model's entity from an attachment in a view", () => {
    const offset = commerce.indexOf("on shop.api") + "on shop.a".length;
    const analysis = analyzeDocument({ text: commerce });
    const range = definition(analysis, offset);
    expect(range).toBeDefined();
    expect(commerce.slice(range!.start.offset, range!.end.offset)).toBe("api");
    expect(hover(analysis, offset)?.markdown).toMatch(/shop\.api/);
  });

  it("finds the attachment among the references of an element", () => {
    const { analysis, offset } = cursor(
      FREE_SHEET('note n "Text" on api\n  style a|pi { fill "#fff" }'),
    );
    // The declaration, the attachment and the style.
    expect(references(analysis, offset, true)).toHaveLength(3);
  });

  it("offers the close ids as a quick fix for a target the diagram lacks", () => {
    const text = FREE_SHEET('note n "Text" on ap');
    const analysis = analyzeDocument({ text });
    const diagnostic = analysis.diagnostics.find((d) => d.code === "ref.unknown-element");
    expect(diagnostic).toBeDefined();
    const start = diagnostic!.range.start.offset;
    const actions = codeActions(analysis, { start, end: start }, [diagnostic!]);
    const fix = actions.find((a) => a.title.includes("api"));
    expect(fix).toBeDefined();
    const edited = applyTextEdits(text, fix!.edits);
    expect(edited).toContain('note n "Text" on api');
  });

  it("renames the element in the attachment, in a free diagram and in a view", () => {
    const flow = cursor('diagram d: flow {\n  api["API"]\n  note n "Text" on a|pi\n}\n');
    const planned = rename(flow.analysis, flow.offset, "gateway");
    expect(planned.ok).toBe(true);
    if (planned.ok) {
      expect(applyTextEdits(flow.text, planned.plan.edits)).toContain("on gateway");
    }
  });
});
