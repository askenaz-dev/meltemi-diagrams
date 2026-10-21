import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentUndo, StudioChange } from "../src/studio.js";
import { newStudio } from "./support/cloud.js";

afterEach(() => {
  vi.useRealTimers();
});

const DIAGRAM = 'diagram x: flow {\n  title "x"\n  a["A"]\n  b["B"]\n  a -> b\n}\n';

/** A studio with files, and the changes it reports from then on. */
function setup(files: [string, string | Uint8Array][] = [], open?: string) {
  const studio = newStudio();
  studio.load(files, open);
  const changes: StudioChange[] = [];
  const texts: { path: string; text: string; selection?: { start: number; end: number } }[] = [];
  let files_ = 0;
  studio.listen({
    change: (change) => changes.push(change),
    text: (path, text, selection) =>
      texts.push({ path, text, ...(selection ? { selection } : {}) }),
    files: () => files_++,
  });
  return { studio, changes, texts, filesEvents: () => files_ };
}

describe("the change listener", () => {
  it("reports typing with its carets, flagged as typing and not remote", () => {
    const { studio, changes } = setup([["notes.md", "hello"]]);
    studio.setText("notes.md", "hello!", {
      typing: true,
      before: { start: 5, end: 5 },
      after: { start: 6, end: 6 },
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "text",
      path: "notes.md",
      before: "hello",
      after: "hello!",
      typing: true,
      remote: false,
      selectionBefore: { start: 5, end: 5 },
      selectionAfter: { start: 6, end: 6 },
    });
  });

  it("reports a text set from elsewhere as not typing", () => {
    const { studio, changes, texts } = setup([["notes.md", "hello"]]);
    studio.setText("notes.md", "hello world", { after: { start: 11, end: 11 } });
    expect(changes).toMatchObject([{ kind: "text", typing: false, remote: false }]);
    expect(texts).toEqual([
      { path: "notes.md", text: "hello world", selection: { start: 11, end: 11 } },
    ]);
  });

  it("reports nothing when the text does not change", () => {
    const { studio, changes } = setup([["notes.md", "hello"]]);
    studio.setText("notes.md", "hello");
    studio.applyEdits(new Map([["notes.md", []]]));
    expect(changes).toEqual([]);
  });

  it("gives the files of one step the same step number, later steps greater ones", () => {
    const { studio, changes } = setup([
      ["a.md", "alpha"],
      ["b.md", "beta"],
    ]);
    studio.applyEdits(
      new Map([
        ["a.md", [{ start: 0, end: 5, newText: "ALPHA" }]],
        ["b.md", [{ start: 0, end: 4, newText: "BETA" }]],
      ]),
      { start: 5, end: 5 },
    );
    studio.setText("a.md", "ALPHA!");
    expect(changes.map((c) => [c.path, c.after])).toEqual([
      ["a.md", "ALPHA"],
      ["b.md", "BETA"],
      ["a.md", "ALPHA!"],
    ]);
    expect(changes[0]!.step).toBe(changes[1]!.step);
    expect(changes[2]!.step).toBeGreaterThan(changes[1]!.step);
    // The caret the canvas or code pane gave belongs to the open file only.
    expect(changes[0]!.selectionAfter).toEqual({ start: 5, end: 5 });
    expect(changes[1]!.selectionAfter).toBeUndefined();
  });

  it("reports added, replaced and deleted files, and the move of a renamed one", () => {
    const logo = new Uint8Array([1, 2, 3]);
    const { studio, changes } = setup([["notes.md", "one"]]);
    studio.addFiles([
      ["new.md", "fresh"],
      ["notes.md", "two"],
      ["logo.png", logo],
    ]);
    expect(changes).toMatchObject([
      { kind: "add", path: "new.md", after: "fresh" },
      { kind: "text", path: "notes.md", before: "one", after: "two" },
      { kind: "add", path: "logo.png", after: logo },
    ]);
    expect(changes[0]!.step).toBe(changes[2]!.step);
    changes.length = 0;
    studio.addFiles([["logo.png", new Uint8Array([9])]]);
    expect(changes).toMatchObject([{ kind: "add", path: "logo.png", before: logo }]);
    changes.length = 0;
    expect(studio.renameFile("notes.md", "docs/notes.md")).toBe(true);
    studio.deleteFile("new.md");
    expect(changes).toMatchObject([
      { kind: "rename", path: "docs/notes.md", from: "notes.md" },
      { kind: "delete", path: "new.md", before: "fresh" },
    ]);
    expect(changes[0]!.step).toBeLessThan(changes[1]!.step);
  });

  it("reports nothing for a rename or a delete that did not happen, or for the same text again", () => {
    const { studio, changes } = setup([
      ["a.md", "a"],
      ["b.md", "b"],
    ]);
    expect(studio.renameFile("a.md", "b.md")).toBe(false);
    expect(studio.renameFile("missing.md", "c.md")).toBe(false);
    studio.deleteFile("missing.md");
    studio.addFiles([["a.md", "a"]]);
    expect(changes).toEqual([]);
  });

  it("reports a file that changes kind as a delete and an add; an svg stays text", () => {
    const { studio, changes } = setup([
      ["data.bin", "text"],
      ["logo.svg", new TextEncoder().encode("<svg/>")],
    ]);
    studio.addFiles([
      ["data.bin", new Uint8Array([1])],
      ["logo.svg", "<svg><g/></svg>"],
    ]);
    expect(changes).toMatchObject([
      { kind: "delete", path: "data.bin", before: "text" },
      { kind: "add", path: "data.bin" },
      { kind: "text", path: "logo.svg", before: "<svg/>", after: "<svg><g/></svg>" },
    ]);
  });

  it("reports a replaced project as the files that went and those that arrive, in one step", () => {
    const { studio, changes } = setup([
      ["a.md", "a"],
      ["b.md", "b"],
      ["c.md", "c"],
    ]);
    studio.load(
      [
        ["b.md", "B"],
        ["d.md", "d"],
      ],
      "d.md",
    );
    expect(changes.map((c) => [c.kind, c.path])).toEqual([
      ["delete", "a.md"],
      ["delete", "c.md"],
      ["text", "b.md"],
      ["add", "d.md"],
    ]);
    expect(new Set(changes.map((c) => c.step)).size).toBe(1);
    expect(studio.open).toBe("d.md");
  });

  it("tells the listener when a change is remote", () => {
    const { studio, changes } = setup([["a.md", "a"]]);
    studio.addFiles([["b.md", "b"]], undefined, { remote: true });
    studio.renameFile("b.md", "c.md", { remote: true });
    studio.deleteFile("c.md", { remote: true });
    studio.replaceText("a.md", "A", { remote: true });
    studio.load([["z.md", "z"]], undefined, { remote: true });
    expect(changes.length).toBeGreaterThanOrEqual(5);
    expect(changes.every((c) => c.remote)).toBe(true);
  });

  it("reports the files a created theme brings and the edit of project.json as one step", () => {
    const { studio, changes } = setup(
      [
        ["project.json", '{ "name": "shop" }'],
        ["diagrams/x.meltemi", DIAGRAM],
      ],
      "diagrams/x.meltemi",
    );
    studio.handle({
      messages: [],
      project: { kind: "createTheme", theme: "brand", extends: "meltemi" },
    });
    expect(changes.map((c) => [c.kind, c.path])).toEqual([
      ["add", "themes/brand.meltemi"],
      ["text", "project.json"],
    ]);
    expect(changes[0]!.step).toBe(changes[1]!.step);
    expect(changes[1]!.after).toContain("themes/brand.meltemi#brand");
  });

  it("keeps saying `changed` with the path, as the page's saving listens for it", () => {
    const studio = newStudio();
    studio.load([["a.md", "a"]]);
    const paths: string[] = [];
    studio.listen({ changed: (path) => paths.push(path) });
    studio.setText("a.md", "b");
    studio.addFiles([["c.md", "c"]]);
    expect(paths).toEqual(["a.md"]);
  });
});

describe("replaceText", () => {
  it("writes the host, shows the text with the selection and records no history", () => {
    const { studio, changes, texts } = setup([["notes.md", "hello"]]);
    studio.replaceText("notes.md", "hello there", {
      remote: true,
      selection: { start: 3, end: 3 },
    });
    expect(studio.text("notes.md")).toBe("hello there");
    expect(texts).toEqual([
      { path: "notes.md", text: "hello there", selection: { start: 3, end: 3 } },
    ]);
    expect(changes).toMatchObject([{ kind: "text", remote: true, after: "hello there" }]);
    expect(studio.history.canUndo("notes.md")).toBe(false);
    expect(studio.canUndo()).toBe(false);
    expect(studio.undo()).toBe(false);
    expect(studio.text("notes.md")).toBe("hello there");
  });

  it("does nothing when the text is the same", () => {
    const { studio, changes, texts } = setup([["notes.md", "hello"]]);
    studio.replaceText("notes.md", "hello", { remote: true });
    expect(changes).toEqual([]);
    expect(texts).toEqual([]);
  });

  it("is not remote unless told", () => {
    const { studio, changes } = setup([["notes.md", "hello"]]);
    studio.replaceText("notes.md", "bye");
    expect(changes).toMatchObject([{ remote: false }]);
    expect(studio.canUndo()).toBe(false);
  });

  it("analyses after the typing pause, or at once when asked", () => {
    vi.useFakeTimers();
    const { studio } = setup([["diagrams/x.meltemi", DIAGRAM]], "diagrams/x.meltemi");
    expect(studio.analysis?.text).toBe(DIAGRAM);
    const changed = DIAGRAM.replace('"x"', '"y"');
    studio.replaceText("diagrams/x.meltemi", changed, { remote: true });
    expect(studio.analysis?.text).toBe(DIAGRAM);
    vi.advanceTimersByTime(250);
    expect(studio.analysis?.text).toBe(changed);
    const again = changed.replace('"y"', '"z"');
    studio.replaceText("diagrams/x.meltemi", again, { remote: true, now: true });
    expect(studio.analysis?.text).toBe(again);
  });

  it("writes a file the host does not have yet", () => {
    const { studio, changes } = setup([["a.md", "a"]]);
    studio.replaceText("b.md", "b", { remote: true });
    expect(studio.text("b.md")).toBe("b");
    expect(changes).toMatchObject([{ kind: "add", path: "b.md", after: "b" }]);
  });
});

describe("remote file operations", () => {
  it("opens the first source when files arrive and none is open", () => {
    const studio = newStudio();
    studio.load([]);
    expect(studio.open).toBe("");
    studio.addFiles(
      [
        ["notes.md", "n"],
        ["diagrams/x.meltemi", DIAGRAM],
      ],
      undefined,
      { remote: true },
    );
    expect(studio.open).toBe("diagrams/x.meltemi");
  });

  it("leaves the open file open when files arrive and one is open", () => {
    const { studio } = setup(
      [
        ["a.meltemi", DIAGRAM],
        ["b.meltemi", DIAGRAM],
      ],
      "b.meltemi",
    );
    studio.addFiles([["c.meltemi", DIAGRAM]], undefined, { remote: true });
    expect(studio.open).toBe("b.meltemi");
  });

  it("follows a rename of the open file and opens another when it is deleted", () => {
    const { studio } = setup(
      [
        ["a.meltemi", DIAGRAM],
        ["b.meltemi", DIAGRAM],
      ],
      "a.meltemi",
    );
    expect(studio.renameFile("a.meltemi", "c.meltemi", { remote: true })).toBe(true);
    expect(studio.open).toBe("c.meltemi");
    studio.deleteFile("c.meltemi", { remote: true });
    expect(studio.open).toBe("b.meltemi");
  });

  it("puts the caret back on the open file only", () => {
    const { studio, texts } = setup(
      [
        ["a.md", "alpha"],
        ["b.md", "beta"],
      ],
      "a.md",
    );
    studio.restoreSelection("b.md", { start: 1, end: 1 });
    expect(texts).toEqual([]);
    studio.restoreSelection("a.md", { start: 2, end: 3 });
    expect(texts).toEqual([{ path: "a.md", text: "alpha", selection: { start: 2, end: 3 } }]);
  });

  it("the local operations stay as they were: add and delete select as before", () => {
    const { studio } = setup([["a.meltemi", DIAGRAM]], "a.meltemi");
    studio.addFiles([["b.meltemi", DIAGRAM]], "b.meltemi");
    expect(studio.open).toBe("b.meltemi");
    studio.deleteFile("b.meltemi");
    expect(studio.open).toBe("a.meltemi");
  });
});

describe("undo", () => {
  /** A bound document that answers as the test says and counts the calls. */
  function document(answers: { undo?: boolean; redo?: boolean; can?: boolean } = {}) {
    const calls: string[] = [];
    const bound: DocumentUndo = {
      undo: () => (calls.push("undo"), answers.undo ?? true),
      redo: () => (calls.push("redo"), answers.redo ?? true),
      canUndo: () => (calls.push("canUndo"), answers.can ?? true),
      canRedo: () => (calls.push("canRedo"), answers.can ?? false),
    };
    return { bound, calls };
  }

  it("is the history's while no document is bound, as it has always been", () => {
    const { studio } = setup([["notes.md", "a"]], "notes.md");
    expect(studio.isBound()).toBe(false);
    expect(studio.canUndo()).toBe(false);
    studio.setText("notes.md", "ab", { typing: true });
    studio.setText("notes.md", "abc", { typing: true });
    expect(studio.canUndo()).toBe(true);
    expect(studio.canRedo()).toBe(false);
    expect(studio.undo()).toBe(true);
    expect(studio.text("notes.md")).toBe("a");
    expect(studio.canUndo()).toBe(false);
    expect(studio.canRedo()).toBe(true);
    expect(studio.redo()).toBe(true);
    expect(studio.text("notes.md")).toBe("abc");
    studio.undo();
    expect(studio.undo()).toBe(false);
  });

  it("keeps the history's own groups across files when nothing is bound", () => {
    const { studio } = setup(
      [
        ["a.md", "alpha"],
        ["b.md", "beta"],
      ],
      "a.md",
    );
    studio.applyEdits(
      new Map([
        ["a.md", [{ start: 0, end: 5, newText: "ALPHA" }]],
        ["b.md", [{ start: 0, end: 4, newText: "BETA" }]],
      ]),
    );
    expect(studio.undo()).toBe(true);
    expect(studio.text("a.md")).toBe("alpha");
    expect(studio.text("b.md")).toBe("beta");
  });

  it("hands undo, redo and the questions to a bound document", () => {
    const { studio } = setup([["notes.md", "a"]], "notes.md");
    studio.setText("notes.md", "ab");
    const { bound, calls } = document();
    studio.bindDocument(bound);
    expect(studio.isBound()).toBe(true);
    expect(studio.isBound(bound)).toBe(true);
    expect(studio.canUndo()).toBe(true);
    expect(studio.canRedo()).toBe(false);
    expect(studio.undo()).toBe(true);
    expect(studio.redo()).toBe(true);
    expect(calls).toEqual(["canUndo", "canRedo", "undo", "redo"]);
    // The history was not consulted: the text is as it was.
    expect(studio.text("notes.md")).toBe("ab");
  });

  it("answers what the bound document answers, even when the history could undo", () => {
    const { studio } = setup([["notes.md", "a"]], "notes.md");
    studio.setText("notes.md", "ab");
    expect(studio.history.canUndo("notes.md")).toBe(true);
    studio.bindDocument(document({ undo: false, can: false }).bound);
    expect(studio.undo()).toBe(false);
    expect(studio.canUndo()).toBe(false);
  });

  it("keeps no history while a document is bound, and goes back to it when unbound", () => {
    const { studio } = setup([["notes.md", "a"]], "notes.md");
    studio.setText("notes.md", "ab");
    const { bound } = document();
    studio.bindDocument(bound);
    // What the history held before is not the document's to undo.
    expect(studio.history.canUndo("notes.md")).toBe(false);
    studio.setText("notes.md", "abc");
    studio.applyEdits(new Map([["notes.md", [{ start: 0, end: 1, newText: "A" }]]]));
    expect(studio.history.canUndo("notes.md")).toBe(false);
    studio.bindDocument(undefined);
    expect(studio.isBound()).toBe(false);
    expect(studio.isBound(bound)).toBe(false);
    expect(studio.canUndo()).toBe(false);
    studio.setText("notes.md", "Abcd");
    expect(studio.undo()).toBe(true);
    expect(studio.text("notes.md")).toBe("Abc");
  });
});
