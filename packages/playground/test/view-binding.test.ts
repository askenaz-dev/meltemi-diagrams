// The binding of a viewer's page (`project-sharing`): the document is the room's, the Studio shows
// it and follows it, and nothing of this page ever reaches the document or the room. The clock is
// faked for the whole file, before the imports, as in `binding.test.ts` (Yjs reads `Date.now` once).
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.useFakeTimers();
});

import * as Y from "yjs";
import { REMOTE, addTextFile, cloudDoc } from "../src/cloud/doc.js";
import { device, texts } from "./support/cloud.js";

const advance = (milliseconds: number) => vi.advanceTimersByTime(milliseconds);
const PAUSE = 800;
const A = "diagrams/a.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';

/** A document state holding these text files, as a room would hold it. */
function seeded(files: Record<string, string>): Uint8Array {
  const doc = new Y.Doc();
  for (const [path, text] of Object.entries(files)) {
    addTextFile(cloudDoc(doc), path, text, { origin: REMOTE });
  }
  return Y.encodeStateAsUpdate(doc);
}

const state = () => seeded({ [A]: SOURCE_A, "notes.md": "notes\n" });

describe("a viewer's binding", () => {
  it("loads the document's files into the Studio, as any binding does, and sends nothing for it", () => {
    const viewer = device("viewer", { state: state(), readOnly: true });
    expect(texts(viewer)).toEqual({ [A]: SOURCE_A, "notes.md": "notes\n" });
    expect(viewer.studio.open).toBe(A);
    expect(viewer.studio.isBound(viewer.binding)).toBe(true);
    advance(PAUSE);
    expect(viewer.sent).toEqual([]);
    expect(viewer.local).toEqual([]);
  });

  it("follows what the room brings: a text, a new file, a rename and a deletion", () => {
    // Both start from the same document, as two pages of one project do.
    const base = state();
    const editor = device("editor", { state: base });
    const viewer = device("viewer", { state: base, readOnly: true });
    editor.pane.select(SOURCE_A.length);
    editor.pane.type("// from the editor\n");
    advance(PAUSE);
    for (const update of editor.sent) viewer.binding.apply(update);
    expect(viewer.studio.text(A)).toBe(`${SOURCE_A}// from the editor\n`);
    editor.studio.addFiles([["more.md", "more\n"]]);
    editor.studio.renameFile("notes.md", "notes-2.md");
    advance(PAUSE);
    for (const update of editor.sent) viewer.binding.apply(update);
    expect(texts(viewer)).toEqual(texts(editor));
    editor.studio.deleteFile("more.md");
    advance(PAUSE);
    for (const update of editor.sent) viewer.binding.apply(update);
    expect(viewer.studio.host.has("more.md")).toBe(false);
    // All of it arrived as the room's, and none of it left again.
    expect(viewer.sent).toEqual([]);
    expect(viewer.local).toEqual([]);
    expect(viewer.errors).toEqual([]);
  });

  it("never sends an update, whatever the Studio reports: typing, files, images, flush and destroy", () => {
    const viewer = device("viewer", { state: state(), readOnly: true });
    const uploaded: string[] = [];
    const removed: string[] = [];
    // The same binding with calls that would show a transfer, bound by hand to a Studio of its own.
    const other = device("other", {
      state: state(),
      readOnly: true,
      uploadBinary: async (path) => void uploaded.push(path),
      removeBinary: (path) => void removed.push(path),
    });
    for (const d of [viewer, other]) {
      const before = Y.encodeStateVector(d.doc);
      // The Studio itself is not in view mode here: this is the binding's own guard.
      d.pane.select(0);
      d.pane.type("// typed\n");
      d.pane.backspace();
      d.studio.setText(A, "// replaced\n");
      d.studio.addFiles([["new.md", "new\n"]]);
      d.studio.addFiles([["logo.png", new Uint8Array([137, 80, 78, 71])]]);
      d.studio.renameFile("notes.md", "notes-2.md");
      d.studio.deleteFile("new.md");
      advance(PAUSE);
      d.binding.flush();
      expect(d.sent).toEqual([]);
      expect(d.local).toEqual([]);
      expect(Y.encodeStateVector(d.doc)).toEqual(before);
    }
    expect(uploaded).toEqual([]);
    expect(removed).toEqual([]);
    viewer.binding.destroy();
    advance(PAUSE);
    expect(viewer.sent).toEqual([]);
  });

  it("has nothing to undo or redo, and refuses to", () => {
    const viewer = device("viewer", { state: state(), readOnly: true });
    viewer.pane.type("// typed\n");
    advance(PAUSE);
    expect(viewer.binding.canUndo()).toBe(false);
    expect(viewer.binding.canRedo()).toBe(false);
    expect(viewer.binding.undo()).toBe(false);
    expect(viewer.binding.redo()).toBe(false);
    expect(viewer.studio.canUndo()).toBe(false);
  });

  it("is a binding that sends, when it is not a viewer's", () => {
    // The control: the same steps on an editor's device do reach the document and leave.
    const editor = device("editor", { state: state() });
    editor.pane.select(0);
    editor.pane.type("// typed\n");
    advance(PAUSE);
    expect(editor.sent.length).toBeGreaterThan(0);
    expect(editor.local.length).toBeGreaterThan(0);
    expect(editor.binding.canUndo()).toBe(true);
  });
});
