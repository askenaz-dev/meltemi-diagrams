// The binding of a cloud project's document to the Studio, with two devices in Node. The clock is
// faked for the whole file, and before the imports: Yjs reads `Date.now` once, when it loads, to
// time the coalescing of undo steps, so the fake must already be there.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.useFakeTimers();
});

import * as Y from "yjs";
import { SEND_INTERVAL, createBinding } from "../src/cloud/binding.js";
import {
  REMOTE,
  addBinaryFile,
  addTextFile,
  cloudDoc,
  resolveFiles,
  sha256Hex,
} from "../src/cloud/doc.js";
import { ANALYSIS_DELAY } from "../src/studio.js";
import { counter, device, sync, texts, type Device } from "./support/cloud.js";

const advance = (milliseconds: number) => vi.advanceTimersByTime(milliseconds);

/** A pause long enough for typing to start a new undo step and for a send to leave. */
const PAUSE = 800;

/** A document state holding these text files, as a room would hold it. */
function seeded(files: Record<string, string>): Uint8Array {
  const doc = new Y.Doc();
  for (const [path, text] of Object.entries(files)) {
    addTextFile(cloudDoc(doc), path, text, { origin: REMOTE });
  }
  return Y.encodeStateAsUpdate(doc);
}

/** The id of the file shown at a path. */
function idOf(device: Device, path: string): string {
  const file = [...resolveFiles(cloudDoc(device.doc)).files.values()].find((f) => f.shown === path);
  if (!file) throw new Error(`no file ${path}`);
  return file.id;
}

/** The text of a file in the document. */
function inDoc(device: Device, path: string): string {
  return cloudDoc(device.doc).files.get(idOf(device, path))!.toString();
}

/** Every text and path of the document, by shown path. */
function docTexts(device: Device): Record<string, string> {
  return Object.fromEntries(
    [...resolveFiles(cloudDoc(device.doc)).files.values()]
      .filter((f) => f.kind === "text")
      .map((f) => [f.shown, f.text!.toString()]),
  );
}

const NOTES = "one\ntwo\nthree\nfour\n";

describe("opening", () => {
  it("loads the document's files into the studio and opens one", () => {
    const state = seeded({ "diagrams/x.meltemi": "diagram x: flow {\n}\n", "notes.md": "hi" });
    const a = device("a", { state, files: [["anonymous.md", "not the cloud's"]] });
    expect(texts(a)).toEqual({ "diagrams/x.meltemi": "diagram x: flow {\n}\n", "notes.md": "hi" });
    expect(a.studio.open).toBe("diagrams/x.meltemi");
    expect(a.studio.isBound(a.binding)).toBe(true);
    expect(a.errors).toEqual([]);
    // Loading is not an edit: nothing leaves.
    expect(a.local).toEqual([]);
    advance(PAUSE);
    expect(a.sent).toEqual([]);
  });

  it("opens the file asked for", () => {
    const a = device("a", { state: seeded({ "a.md": "a", "b.md": "b" }), open: "b.md" });
    expect(a.studio.open).toBe("b.md");
  });

  it("opens an empty document, and shows the first file that arrives", () => {
    const a = device("a", { state: seeded({}) });
    expect(a.studio.open).toBe("");
    const b = device("b", { state: seeded({ "n.md": "n" }) });
    a.binding.apply(Y.encodeStateAsUpdate(b.doc));
    expect(a.studio.open).toBe("n.md");
    expect(texts(a)).toEqual({ "n.md": "n" });
  });

  it("brings in images and fonts by hash", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const hash = await sha256Hex(bytes);
    const doc = new Y.Doc();
    addTextFile(cloudDoc(doc), "a.md", "a", { origin: REMOTE });
    addBinaryFile(cloudDoc(doc), "img/logo.png", hash, { origin: REMOTE });
    const fetched: string[] = [];
    const a = device("a", {
      state: Y.encodeStateAsUpdate(doc),
      fetchBlob: async (h) => (fetched.push(h), bytes),
    });
    expect(a.studio.host.has("img/logo.png")).toBe(false);
    await a.binding.settled();
    expect(fetched).toEqual([hash]);
    expect(a.studio.host.get("img/logo.png")).toEqual(bytes);
    expect(a.errors).toEqual([]);
  });

  it("says so when a blob cannot be fetched", async () => {
    const doc = new Y.Doc();
    addBinaryFile(cloudDoc(doc), "logo.png", "ab".repeat(32), { origin: REMOTE });
    const a = device("a", {
      state: Y.encodeStateAsUpdate(doc),
      fetchBlob: async () => {
        throw new Error("offline");
      },
    });
    await a.binding.settled();
    expect(a.errors).toMatchObject([{ code: "binary.fetch", path: "logo.png" }]);
    expect(a.studio.host.has("logo.png")).toBe(false);
  });
});

describe("the person's edits reach the document", () => {
  it("turns typing into the smallest edit of the text", () => {
    const a = device("a", { state: seeded({ "notes.md": NOTES }) });
    const deltas: unknown[] = [];
    cloudDoc(a.doc)
      .files.get(idOf(a, "notes.md"))!
      .observe((e) => deltas.push(e.delta));
    a.pane.select(4);
    a.pane.type("X");
    a.pane.backspace();
    a.pane.backspace();
    expect(deltas).toEqual([
      [{ retain: 4 }, { insert: "X" }],
      [{ retain: 4 }, { delete: 1 }],
      [{ retain: 3 }, { delete: 1 }],
    ]);
    expect(inDoc(a, "notes.md")).toBe("onetwo\nthree\nfour\n");
  });

  it("turns a canvas edit of a few characters into an edit of those characters", () => {
    const a = device("a", { state: seeded({ "notes.md": "place 10 20\nplace 30 40\n" }) });
    const deltas: unknown[] = [];
    cloudDoc(a.doc)
      .files.get(idOf(a, "notes.md"))!
      .observe((e) => deltas.push(e.delta));
    a.studio.applyEdits(new Map([["notes.md", [{ start: 6, end: 8, newText: "99" }]]]));
    expect(deltas).toEqual([[{ retain: 6 }, { delete: 2 }, { insert: "99" }]]);
    expect(inDoc(a, "notes.md")).toBe("place 99 20\nplace 30 40\n");
  });

  it("writes the edit of every file of a step", () => {
    const a = device("a", { state: seeded({ "a.md": "alpha", "b.md": "beta" }), open: "a.md" });
    a.studio.applyEdits(
      new Map([
        ["a.md", [{ start: 0, end: 1, newText: "A" }]],
        ["b.md", [{ start: 0, end: 1, newText: "B" }]],
      ]),
    );
    expect(docTexts(a)).toEqual({ "a.md": "Alpha", "b.md": "Beta" });
  });

  it("adds a file with a new id and its text", () => {
    const a = device("a", { state: seeded({ "a.md": "a" }), random: counter(3) });
    a.studio.addFiles([["docs/new.md", "fresh"]], "docs/new.md");
    const cloud = cloudDoc(a.doc);
    expect(cloud.paths.get("aaaaaaaaaaaaaaad")).toBe("docs/new.md");
    expect(cloud.files.get("aaaaaaaaaaaaaaad")!.toString()).toBe("fresh");
    expect(a.errors).toEqual([]);
  });

  it("writes icons the canvas adds as text files of the document, as an editing guest may", () => {
    const pin = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
    const a = device("a", {
      state: seeded({
        "project.json": '{ "name": "p", "language": "0.2" }\n',
        "d.meltemi": 'language "0.2"\n\ndiagram d: flow {\n  api["API"]\n}\n',
      }),
    });
    a.studio.select("d.meltemi");
    a.studio.analyzeNow();
    a.studio.receive({
      type: "addIcons",
      token: 1,
      prefix: "project",
      licence: "MIT",
      files: [{ file: "pin.svg", name: "pin", svg: pin }],
      targets: [],
    });
    const texts = docTexts(a);
    expect(texts["assets/icons/project/pin.svg"]).toBe(pin);
    expect(JSON.parse(texts["assets/licenses.json"]!)).toEqual({
      icons: { project: { license: "MIT" } },
    });
    expect(JSON.parse(texts["assets/libraries/project.json"]!).categories[0].items).toEqual([
      { icon: "project:pin", label: "Pin" },
    ]);
    // Nothing is uploaded as a blob: the icon is text.
    expect(cloudDoc(a.doc).binaries.size).toBe(0);
    expect(a.errors).toEqual([]);
  });

  it("keeps a file's id and history when an import replaces its text", () => {
    const a = device("a", { state: seeded({ "a.md": "old text" }) });
    const id = idOf(a, "a.md");
    a.studio.addFiles([["a.md", "old words"]]);
    expect(idOf(a, "a.md")).toBe(id);
    expect(inDoc(a, "a.md")).toBe("old words");
    expect(a.studio.undo()).toBe(true);
    expect(inDoc(a, "a.md")).toBe("old text");
    expect(a.studio.text("a.md")).toBe("old text");
  });

  it("renames a file by changing its path alone", () => {
    const a = device("a", { state: seeded({ "a.md": "text" }) });
    const id = idOf(a, "a.md");
    const text = cloudDoc(a.doc).files.get(id);
    const before = Y.encodeStateVector(a.doc);
    a.studio.renameFile("a.md", "docs/b.md");
    expect(cloudDoc(a.doc).paths.get(id)).toBe("docs/b.md");
    expect(cloudDoc(a.doc).files.get(id)).toBe(text);
    expect(Y.encodeStateAsUpdate(a.doc, before).length).toBeLessThan(100);
  });

  it("removes a deleted file's id from the three maps", () => {
    const doc = new Y.Doc();
    const id = addTextFile(cloudDoc(doc), "a.md", "a", { origin: REMOTE });
    addTextFile(cloudDoc(doc), "b.md", "b", { origin: REMOTE });
    const a = device("a", { state: Y.encodeStateAsUpdate(doc) });
    a.studio.deleteFile("a.md");
    const cloud = cloudDoc(a.doc);
    expect(cloud.files.has(id)).toBe(false);
    expect(cloud.paths.has(id)).toBe(false);
    expect(cloud.binaries.has(id)).toBe(false);
    expect(docTexts(a)).toEqual({ "b.md": "b" });
  });

  it("replaces the files of a loaded project and keeps the ids of those that stay", () => {
    const a = device("a", { state: seeded({ "a.md": "a", "b.md": "b" }) });
    const id = idOf(a, "b.md");
    a.studio.load([
      ["b.md", "B"],
      ["c.md", "c"],
    ]);
    expect(docTexts(a)).toEqual({ "b.md": "B", "c.md": "c" });
    expect(idOf(a, "b.md")).toBe(id);
  });

  it("does not write a path the document would refuse", () => {
    const a = device("a", { state: seeded({ "a.md": "a" }) });
    a.studio.addFiles([["../secrets.md", "x"]]);
    a.studio.addFiles([["has:colon.md", "x"]]);
    expect(a.errors).toMatchObject([
      { code: "path.invalid", path: "../secrets.md" },
      { code: "path.invalid", path: "has:colon.md" },
    ]);
    expect(docTexts(a)).toEqual({ "a.md": "a" });
    expect(cloudDoc(a.doc).paths.size).toBe(1);
  });

  it("writes every change inside one transaction of the LOCAL origin", () => {
    const a = device("a", { state: seeded({ "a.md": "a" }) });
    const origins: unknown[] = [];
    a.doc.on("afterTransaction", (tr: Y.Transaction) => {
      if (tr.changed.size > 0) origins.push(tr.origin);
    });
    a.studio.addFiles([["b.md", "b"]]);
    a.studio.renameFile("b.md", "c.md");
    a.pane.type("x");
    expect(origins).toHaveLength(3);
    expect(new Set(origins).size).toBe(1);
    expect(String(origins[0])).toBe("Symbol(meltemi.local)");
  });
});

describe("sending", () => {
  it("hands local updates out merged, every 250 ms at most", () => {
    const state = seeded({ "n.md": "" });
    const a = device("a", { state });
    a.pane.type("a");
    advance(100);
    a.pane.type("b");
    advance(100);
    a.pane.type("c");
    expect(a.sent).toHaveLength(0);
    advance(SEND_INTERVAL - 200);
    expect(a.sent).toHaveLength(1);
    expect(a.local).toHaveLength(3);
    // The one update carries the three edits.
    const base = new Y.Doc();
    Y.applyUpdate(base, state);
    Y.applyUpdate(base, a.sent[0]!);
    expect(docTextsOf(base)).toEqual({ "n.md": "abc" });
    // The next edit waits for its own interval.
    a.pane.type("d");
    advance(SEND_INTERVAL - 1);
    expect(a.sent).toHaveLength(1);
    advance(1);
    expect(a.sent).toHaveLength(2);
    advance(5000);
    expect(a.sent).toHaveLength(2);
  });

  it("sends at most four times a second while typing never stops", () => {
    const state = seeded({ "n.md": "" });
    const a = device("a", { state });
    for (let i = 0; i < 100; i++) {
      a.pane.type("x");
      advance(50);
    }
    advance(SEND_INTERVAL);
    expect(a.sent.length).toBeLessThanOrEqual(21);
    expect(a.sent.length).toBeGreaterThanOrEqual(19);
    const replay = new Y.Doc();
    Y.applyUpdate(replay, state);
    for (const update of a.sent) Y.applyUpdate(replay, update);
    expect(docTextsOf(replay)["n.md"]).toBe("x".repeat(100));
  });

  it("sends what waits at once on flush and on destroy", () => {
    const a = device("a", { state: seeded({ "n.md": "" }) });
    a.pane.type("a");
    a.binding.flush();
    expect(a.sent).toHaveLength(1);
    a.binding.flush();
    expect(a.sent).toHaveLength(1);
    a.pane.type("b");
    a.binding.destroy();
    expect(a.sent).toHaveLength(2);
    advance(5000);
    expect(a.sent).toHaveLength(2);
  });

  it("sends the person's undo as well", () => {
    const state = seeded({ "n.md": "" });
    const a = device("a", { state });
    a.pane.type("abc");
    advance(PAUSE);
    const replay = new Y.Doc();
    Y.applyUpdate(replay, state);
    for (const update of a.sent) Y.applyUpdate(replay, update);
    expect(docTextsOf(replay)["n.md"]).toBe("abc");
    a.studio.undo();
    advance(PAUSE);
    expect(a.sent).toHaveLength(2);
    Y.applyUpdate(replay, a.sent[1]!);
    expect(docTextsOf(replay)["n.md"]).toBe("");
    expect(inDoc(a, "n.md")).toBe("");
  });

  it("does not send what the room sent it", () => {
    const state = seeded({ "n.md": "base" });
    const a = device("a", { state });
    const b = device("b", { state });
    a.pane.select(4);
    a.pane.type("!");
    advance(PAUSE);
    sync(a, b);
    advance(PAUSE);
    expect(b.sent).toEqual([]);
    expect(b.local).toEqual([]);
    expect(b.studio.text("n.md")).toBe("base!");
  });

  it("takes an update whatever origin it is given, but never as the person's own", () => {
    const state = seeded({ "n.md": "base" });
    const a = device("a", { state });
    const b = device("b", { state });
    b.pane.select(4);
    b.pane.type("?");
    a.binding.apply(Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)), "websocket");
    expect(a.studio.text("n.md")).toBe("base?");
    expect(a.studio.canUndo()).toBe(false);
    expect(a.local).toEqual([]);
    const c = device("c", { state });
    c.pane.select(0);
    c.pane.type(">");
    // A caller that passes a local origin by mistake is not believed.
    a.binding.apply(Y.encodeStateAsUpdate(c.doc, Y.encodeStateVector(a.doc)), createLocalLike());
    expect(a.local).toEqual([]);
    expect(a.studio.canUndo()).toBe(false);
  });
});

describe("two devices", () => {
  it("converge when they edit different lines", () => {
    const state = seeded({ "notes.md": NOTES, "other.md": "other" });
    const a = device("a", { state, open: "notes.md" });
    const b = device("b", { state, open: "notes.md" });
    a.pane.select(0);
    a.pane.type("A: ");
    b.pane.select(NOTES.length);
    b.pane.type("four and a half\n");
    sync(a, b);
    expect(texts(a)).toEqual(texts(b));
    expect(texts(a)["notes.md"]).toBe("A: one\ntwo\nthree\nfour\nfour and a half\n");
    expect(docTexts(a)).toEqual(docTexts(b));
    expect(Y.encodeStateAsUpdate(a.doc).length).toBe(Y.encodeStateAsUpdate(b.doc).length);
    expect(a.pane.text).toBe(b.pane.text);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
  });

  it("keeps the caret on the same text when a remote change inserts above it", () => {
    const state = seeded({ "notes.md": NOTES });
    const a = device("a", { state });
    const b = device("b", { state });
    const at = NOTES.indexOf("three") + 2;
    b.pane.select(at);
    a.pane.select(0);
    a.pane.type("new 1\nnew 2\n");
    sync(a, b);
    expect(b.pane.text).toBe("new 1\nnew 2\n" + NOTES);
    expect(b.pane.selection).toEqual({ start: at + 12, end: at + 12 });
    expect(b.pane.text.slice(b.pane.selection.start - 2, b.pane.selection.start)).toBe("th");
  });

  it("keeps a selection, and leaves the caret alone when the change is after it", () => {
    const state = seeded({ "notes.md": NOTES });
    const a = device("a", { state });
    const b = device("b", { state });
    b.pane.select(4, 7);
    a.pane.select(NOTES.length);
    a.pane.type("five\n");
    sync(a, b);
    expect(b.pane.selection).toEqual({ start: 4, end: 7 });
    a.pane.select(0);
    a.pane.type(">>");
    sync(a, b);
    expect(b.pane.selection).toEqual({ start: 6, end: 9 });
    expect(b.pane.text.slice(6, 9)).toBe("two");
  });

  it("keeps the caret when the text under it is deleted", () => {
    const state = seeded({ "notes.md": "abcdef" });
    const a = device("a", { state });
    const b = device("b", { state });
    b.pane.select(3);
    a.pane.select(6);
    a.pane.backspace();
    a.pane.backspace();
    a.pane.backspace();
    a.pane.backspace();
    sync(a, b);
    expect(b.pane.text).toBe("ab");
    expect(b.pane.selection.start).toBeGreaterThanOrEqual(0);
    expect(b.pane.selection.start).toBeLessThanOrEqual(2);
  });

  it("keeps the caret when another file is added, deleted or renamed", () => {
    const state = seeded({ "notes.md": NOTES, "other.md": "other" });
    const a = device("a", { state, open: "notes.md" });
    const b = device("b", { state, open: "notes.md" });
    b.pane.select(9);
    const reopened = b.pane.reopened;
    a.studio.addFiles([["added.md", "added"]]);
    sync(a, b);
    expect(b.pane.reopened).toBeGreaterThan(reopened);
    expect(b.pane.selection).toEqual({ start: 9, end: 9 });
    a.studio.renameFile("other.md", "renamed.md");
    sync(a, b);
    expect(b.pane.selection).toEqual({ start: 9, end: 9 });
    a.studio.deleteFile("added.md");
    sync(a, b);
    expect(b.pane.selection).toEqual({ start: 9, end: 9 });
    expect(texts(b)).toEqual({ "notes.md": NOTES, "renamed.md": "other" });
  });

  it("shows a file renamed on the other device while typing in it", () => {
    const state = seeded({ "notes.md": "base", "other.md": "x" });
    const a = device("a", { state, open: "notes.md" });
    const b = device("b", { state, open: "notes.md" });
    a.studio.renameFile("notes.md", "docs/notes.md");
    b.pane.select(4);
    b.pane.type(" and more");
    sync(a, b);
    for (const d of [a, b]) {
      expect(texts(d)).toEqual({ "docs/notes.md": "base and more", "other.md": "x" });
      expect(docTexts(d)).toEqual(texts(d));
    }
    expect(b.studio.open).toBe("docs/notes.md");
    expect(b.pane.text).toBe("base and more");
    expect(b.pane.selection).toEqual({ start: 13, end: 13 });
    // The id and its text are the ones typed in.
    expect(idOf(a, "docs/notes.md")).toBe(idOf(b, "docs/notes.md"));
  });

  it("shows a rename and an edit of the same file that arrive as one change", () => {
    const state = seeded({ "notes.md": "base" });
    const a = device("a", { state });
    const b = device("b", { state });
    b.pane.select(2);
    a.studio.renameFile("notes.md", "docs/notes.md");
    a.pane.select(0);
    a.pane.type(">> ");
    sync(a, b);
    expect(texts(b)).toEqual({ "docs/notes.md": ">> base" });
    expect(b.studio.open).toBe("docs/notes.md");
    expect(b.pane.text).toBe(">> base");
    expect(b.pane.selection).toEqual({ start: 5, end: 5 });
    expect(b.errors).toEqual([]);
  });

  it("shows a deleted file's removal and a file added on the other device", () => {
    const state = seeded({ "a.md": "a", "b.md": "b" });
    const a = device("a", { state, open: "a.md" });
    const b = device("b", { state, open: "a.md" });
    a.studio.deleteFile("a.md");
    a.studio.addFiles([["c.md", "c"]]);
    sync(a, b);
    expect(texts(b)).toEqual({ "b.md": "b", "c.md": "c" });
    expect(b.studio.open).toBe("b.md");
  });

  it("shows many files deleted, renamed and added by one transaction with one analysis", () => {
    const names = Array.from({ length: 40 }, (_, i) => `docs/n${i}.md`);
    const state = seeded(Object.fromEntries(names.map((name) => [name, name])));
    const a = device("a", { state, open: "docs/n0.md" });
    const b = device("b", { state, open: "docs/n0.md" });
    // The open file goes too, so that the Studio has to open another one.
    for (let i = 0; i < 10; i++) a.studio.deleteFile(names[i]!);
    for (let i = 10; i < 30; i++) a.studio.renameFile(names[i]!, `moved/n${i}.md`);
    a.studio.addFiles([
      ["new/a.md", "a"],
      ["new/b.md", "b"],
    ]);
    let files = 0;
    let analyses = 0;
    b.studio.listen({ files: () => files++, analysis: () => analyses++ });
    sync(a, b);
    expect(texts(b)).toEqual(texts(a));
    expect(Object.keys(texts(b))).toHaveLength(32);
    expect(b.studio.host.has(b.studio.open)).toBe(true);
    // One transaction: the file list is rebuilt once and the open file analysed once.
    expect(files).toBe(1);
    expect(analyses).toBe(1);
    expect(b.errors).toEqual([]);
  });

  it("analyses once for the images of a project that arrive one after the other", async () => {
    const doc = new Y.Doc();
    addTextFile(cloudDoc(doc), "a.md", "a", { origin: REMOTE });
    const blobs = new Map<string, Uint8Array>();
    for (let i = 0; i < 12; i++) {
      const data = new Uint8Array([137, 80, 78, 71, i]);
      const hash = await sha256Hex(data);
      blobs.set(hash, data);
      addBinaryFile(cloudDoc(doc), `img/${i}.png`, hash, { origin: REMOTE });
    }
    const a = device("a", {
      state: Y.encodeStateAsUpdate(doc),
      fetchBlob: async (hash) => blobs.get(hash)!,
    });
    let analyses = 0;
    a.studio.listen({ analysis: () => analyses++ });
    await a.binding.settled();
    advance(ANALYSIS_DELAY);
    expect(a.studio.host.paths()).toHaveLength(13);
    expect(analyses).toBeLessThanOrEqual(1);
    expect(a.errors).toEqual([]);
  });

  it("keeps both files when two devices add one path offline, the smaller id keeping it", () => {
    const state = seeded({ "base.md": "base" });
    const a = device("a", { state, random: counter(1) });
    const b = device("b", { state, random: counter(5) });
    a.studio.addFiles([["x.md", "from a"]], "x.md");
    b.studio.addFiles([["x.md", "from b"]], "x.md");
    expect(a.collisions).toEqual([]);
    sync(a, b);
    const loser = "x.md~aaaaaaaaaaaaaaaf";
    for (const d of [a, b]) {
      expect(texts(d)).toEqual({ "base.md": "base", "x.md": "from a", [loser]: "from b" });
      expect(d.binding.collisions()).toEqual([
        { path: "x.md", keeper: "aaaaaaaaaaaaaaab", id: "aaaaaaaaaaaaaaaf", shown: loser },
      ]);
      expect(d.collisions).toEqual([d.binding.collisions()]);
    }
    expect(a.errors).toEqual([]);
    // The file that lost the path is edited by its id.
    b.studio.select(loser);
    b.pane.select(b.pane.text.length);
    b.pane.type("!");
    sync(a, b);
    expect(a.studio.text(loser)).toBe("from b!");
    expect(inDoc(a, loser)).toBe("from b!");
    // When the keeper goes, the other takes the path.
    a.studio.deleteFile("x.md");
    sync(a, b);
    for (const d of [a, b]) {
      expect(texts(d)).toEqual({ "base.md": "base", "x.md": "from b!" });
      expect(d.binding.collisions()).toEqual([]);
      expect(d.collisions.at(-1)).toEqual([]);
    }
  });

  it("agrees on collisions made by renames", () => {
    const state = seeded({ "a.md": "a", "b.md": "b" });
    const a = device("a", { state });
    const b = device("b", { state });
    a.studio.renameFile("a.md", "c.md");
    b.studio.renameFile("b.md", "c.md");
    sync(a, b);
    expect(Object.keys(texts(a)).sort()).toEqual(Object.keys(texts(b)).sort());
    expect(a.binding.collisions()).toHaveLength(1);
    expect(a.binding.collisions()).toEqual(b.binding.collisions());
    expect(Object.keys(texts(a))).toHaveLength(2);
  });

  it("swaps two names renamed on the other device", () => {
    const state = seeded({ "a.md": "A", "b.md": "B" });
    const a = device("a", { state });
    const b = device("b", { state });
    a.studio.renameFile("a.md", "tmp.md");
    a.studio.renameFile("b.md", "a.md");
    a.studio.renameFile("tmp.md", "b.md");
    sync(a, b);
    expect(texts(a)).toEqual({ "a.md": "B", "b.md": "A" });
    expect(texts(b)).toEqual({ "a.md": "B", "b.md": "A" });
    expect(b.errors).toEqual([]);
  });

  it("brings an image the other device uploaded, and drops it when it is deleted", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const hash = await sha256Hex(bytes);
    const state = seeded({ "a.md": "a" });
    const room = new Y.Doc();
    Y.applyUpdate(room, state);
    const blobs = new Map<string, Uint8Array>();
    const uploads: string[] = [];
    const fetched: string[] = [];
    const sendToDevices: Device[] = [];
    const a: Device = device("a", {
      state,
      uploadBinary: async (path, data) => {
        uploads.push(path);
        const h = await sha256Hex(data);
        blobs.set(h, data);
        // What the Worker does: the file's entries go into the room, which tells the devices.
        addBinaryFile(cloudDoc(room), path, h, { origin: REMOTE });
        for (const d of sendToDevices) {
          d.binding.apply(Y.encodeStateAsUpdate(room, Y.encodeStateVector(d.doc)), "socket");
        }
      },
    });
    const b: Device = device("b", {
      state,
      fetchBlob: async (h) => (fetched.push(h), blobs.get(h)!),
    });
    sendToDevices.push(a, b);
    a.studio.addFiles([["img/logo.png", bytes]]);
    // The binding writes no entry for the binary: the Worker does.
    expect(cloudDoc(a.doc).binaries.size).toBe(0);
    await a.binding.settled();
    await b.binding.settled();
    expect(uploads).toEqual(["img/logo.png"]);
    expect(cloudDoc(b.doc).binaries.size).toBe(1);
    expect([...cloudDoc(b.doc).binaries.values()]).toEqual([hash]);
    expect(b.studio.host.get("img/logo.png")).toEqual(bytes);
    expect(fetched).toEqual([hash]);
    // The device that uploaded already holds the bytes: nothing was fetched for it.
    expect(a.studio.host.get("img/logo.png")).toEqual(bytes);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    // A rename of an image is a rename of the path; a delete removes its entries.
    a.studio.renameFile("img/logo.png", "img/brand.png");
    sync(a, b);
    expect(b.studio.host.get("img/brand.png")).toEqual(bytes);
    expect(b.studio.host.has("img/logo.png")).toBe(false);
    a.studio.deleteFile("img/brand.png");
    sync(a, b);
    expect(b.studio.host.has("img/brand.png")).toBe(false);
    expect(cloudDoc(a.doc).binaries.size).toBe(0);
    expect(cloudDoc(a.doc).paths.size).toBe(1);
  });

  it("says so when an image is added and nothing can store it, or the upload fails", async () => {
    const a = device("a", { state: seeded({ "a.md": "a" }) });
    a.studio.addFiles([["logo.png", new Uint8Array([1])]]);
    expect(a.errors).toMatchObject([{ code: "binary.unsupported", path: "logo.png" }]);
    const b = device("b", {
      state: seeded({ "a.md": "a" }),
      uploadBinary: async () => {
        throw new Error("quota.binary");
      },
    });
    b.studio.addFiles([["logo.png", new Uint8Array([1])]]);
    await b.binding.settled();
    expect(b.errors).toMatchObject([{ code: "binary.upload", path: "logo.png" }]);
    // The image is still on this page, though not in the document.
    expect(b.studio.host.has("logo.png")).toBe(true);
    expect(cloudDoc(b.doc).paths.size).toBe(1);
  });

  it("does not fetch an image that was renamed or removed while its bytes came", async () => {
    const state = new Y.Doc();
    addBinaryFile(cloudDoc(state), "logo.png", "cd".repeat(32), { origin: REMOTE });
    addTextFile(cloudDoc(state), "a.md", "a", { origin: REMOTE });
    let release: (bytes: Uint8Array) => void = () => undefined;
    const a = device("a", {
      state: Y.encodeStateAsUpdate(state),
      fetchBlob: () => new Promise<Uint8Array>((resolve) => (release = resolve)),
    });
    a.studio.select("a.md");
    cloudDoc(a.doc).paths.delete(idOf(a, "logo.png"));
    release(new Uint8Array([1]));
    await a.binding.settled();
    expect(a.studio.host.has("logo.png")).toBe(false);
  });
});

describe("removing images and fonts", () => {
  const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

  /** The document of a project holding `a.md` and these images (the same bytes under each path). */
  async function imagesDoc(paths: string[]): Promise<Uint8Array> {
    const hash = await sha256Hex(PNG);
    const doc = new Y.Doc();
    addTextFile(cloudDoc(doc), "a.md", "a", { origin: REMOTE });
    for (const path of paths) addBinaryFile(cloudDoc(doc), path, hash, { origin: REMOTE });
    return Y.encodeStateAsUpdate(doc);
  }

  /**
   * A device that holds the images, and what it told the service: the path, and how many images
   * the document still had at that moment.
   */
  async function holding(state: Uint8Array) {
    const told: { path: string; entries: number }[] = [];
    const a: Device = device("a", {
      state,
      open: "a.md",
      fetchBlob: async () => PNG,
      removeBinary: (path) => told.push({ path, entries: cloudDoc(a.doc).binaries.size }),
    });
    await a.binding.settled();
    return { a, told };
  }

  it("tells the service before the document changes, and the removal cannot be undone", async () => {
    const { a, told } = await holding(await imagesDoc(["img/logo.png"]));
    expect(a.studio.host.get("img/logo.png")).toEqual(PNG);
    a.pane.select(1);
    a.pane.type("!");
    advance(PAUSE);

    a.studio.deleteFile("img/logo.png");

    // The service looks the file up in the room: it was still there when the page said so.
    expect(told).toEqual([{ path: "img/logo.png", entries: 1 }]);
    expect(cloudDoc(a.doc).binaries.size).toBe(0);
    expect(cloudDoc(a.doc).paths.size).toBe(1);
    // Its bytes are no longer the project's, so no undo can bring the file back: undo takes the
    // typing back, and there is nothing after it.
    expect(a.studio.undo()).toBe(true);
    expect(a.studio.text("a.md")).toBe("a");
    expect(a.studio.host.has("img/logo.png")).toBe(false);
    expect(a.studio.canUndo()).toBe(false);
    expect(a.errors).toEqual([]);
  });

  it("does not tell the service of a rename, which is no removal", async () => {
    const { a, told } = await holding(await imagesDoc(["img/logo.png"]));
    a.studio.renameFile("img/logo.png", "img/brand.png");
    expect(told).toEqual([]);
    // The image can still be taken back by undo, as the rename can.
    expect(a.studio.undo()).toBe(true);
    expect(a.studio.host.has("img/logo.png")).toBe(true);
    a.studio.renameFile("img/logo.png", "img/brand.png");
    a.studio.deleteFile("img/brand.png");
    expect(told).toEqual([{ path: "img/brand.png", entries: 1 }]);
  });

  it("does not tell the service of a removal that came from the document", async () => {
    const state = await imagesDoc(["img/logo.png"]);
    const first = await holding(state);
    const second = await holding(state);
    second.a.studio.deleteFile("img/logo.png");
    sync(first.a, second.a);
    // The page that removed it told the service; the other one only follows.
    expect(second.told).toHaveLength(1);
    expect(first.told).toEqual([]);
    expect(first.a.studio.host.has("img/logo.png")).toBe(false);
    expect(first.a.errors).toEqual([]);
  });

  it("tells the service of each path, even when two share the same bytes", async () => {
    const { a, told } = await holding(await imagesDoc(["img/a.png", "img/b.png"]));
    a.studio.deleteFile("img/a.png");
    a.studio.deleteFile("img/b.png");
    // What is left of the bytes is the service's to decide: it keeps them while a path uses them.
    expect(told).toEqual([
      { path: "img/a.png", entries: 2 },
      { path: "img/b.png", entries: 1 },
    ]);
  });

  it("says nothing of a file that lost a name collision, which the service cannot address", async () => {
    const hash = await sha256Hex(PNG);
    const doc = new Y.Doc();
    addTextFile(cloudDoc(doc), "a.md", "a", { origin: REMOTE });
    addBinaryFile(cloudDoc(doc), "logo.png", hash, { id: "aaaaaaaaaaaaaaaa", origin: REMOTE });
    addBinaryFile(cloudDoc(doc), "logo.png", hash, { id: "zzzzzzzzzzzzzzzz", origin: REMOTE });
    const { a, told } = await holding(Y.encodeStateAsUpdate(doc));
    const loser = "logo.png~zzzzzzzzzzzzzzzz";
    expect(a.studio.host.has(loser)).toBe(true);

    a.studio.deleteFile(loser);
    expect(told).toEqual([]);
    // It was not dropped, so it can come back.
    expect(a.studio.undo()).toBe(true);
    await a.binding.settled();
    expect(a.studio.host.has(loser)).toBe(true);

    a.studio.deleteFile("logo.png");
    expect(told).toEqual([{ path: "logo.png", entries: 2 }]);
  });

  it("keeps a removal undoable when nothing is told to the service", async () => {
    const hash = await sha256Hex(PNG);
    const doc = new Y.Doc();
    addTextFile(cloudDoc(doc), "a.md", "a", { origin: REMOTE });
    addBinaryFile(cloudDoc(doc), "logo.png", hash, { origin: REMOTE });
    const a = device("a", { state: Y.encodeStateAsUpdate(doc), fetchBlob: async () => PNG });
    await a.binding.settled();
    a.studio.deleteFile("logo.png");
    expect(a.studio.undo()).toBe(true);
    await a.binding.settled();
    expect(a.studio.host.get("logo.png")).toEqual(PNG);
  });
});

describe("undo of one's own edits", () => {
  function typing() {
    const a = device("a", { state: seeded({ "notes.md": "" }) });
    return a;
  }

  it("has nothing to undo at first", () => {
    const a = typing();
    expect(a.studio.canUndo()).toBe(false);
    expect(a.studio.canRedo()).toBe(false);
    expect(a.studio.undo()).toBe(false);
    expect(a.studio.redo()).toBe(false);
  });

  it("undoes typing within 700 ms as one step, and redoes it", () => {
    const a = typing();
    a.pane.type("a");
    advance(200);
    a.pane.type("b");
    advance(200);
    a.pane.type("c");
    expect(a.studio.canUndo()).toBe(true);
    expect(a.studio.undo()).toBe(true);
    expect(a.studio.text("notes.md")).toBe("");
    expect(a.pane.text).toBe("");
    expect(inDoc(a, "notes.md")).toBe("");
    expect(a.studio.canUndo()).toBe(false);
    expect(a.studio.canRedo()).toBe(true);
    expect(a.studio.redo()).toBe(true);
    expect(a.studio.text("notes.md")).toBe("abc");
    expect(a.pane.text).toBe("abc");
    expect(a.studio.canRedo()).toBe(false);
    // The history of the anonymous project was not touched.
    expect(a.studio.history.canUndo("notes.md")).toBe(false);
  });

  it("starts a new step after a pause of 700 ms", () => {
    const a = typing();
    a.pane.type("a");
    advance(699);
    a.pane.type("b");
    advance(PAUSE);
    a.pane.type("c");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("ab");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("");
  });

  it("undoes a drag and the typing after it separately, within 700 ms", () => {
    const a = device("a", { state: seeded({ "notes.md": "place 10 20\n" }) });
    a.studio.applyEdits(new Map([["notes.md", [{ start: 6, end: 8, newText: "99" }]]]));
    advance(100);
    a.pane.select(a.pane.text.length);
    a.pane.type("x");
    expect(a.studio.text("notes.md")).toBe("place 99 20\nx");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("place 99 20\n");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("place 10 20\n");
    expect(a.studio.canUndo()).toBe(false);
  });

  it("undoes typing and the canvas edit after it separately, and every canvas edit alone", () => {
    const a = device("a", { state: seeded({ "notes.md": "a 1\n" }) });
    a.pane.select(3);
    a.pane.type("2");
    advance(50);
    a.studio.applyEdits(new Map([["notes.md", [{ start: 0, end: 1, newText: "b" }]]]));
    advance(50);
    a.studio.applyEdits(new Map([["notes.md", [{ start: 0, end: 1, newText: "c" }]]]));
    expect(a.studio.text("notes.md")).toBe("c 12\n");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("b 12\n");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("a 12\n");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("a 1\n");
  });

  it("ends the step at Enter: the next typing undoes alone, the line break stays", () => {
    const a = typing();
    a.pane.type("a");
    a.pane.type("b");
    a.pane.type("\n");
    a.pane.type("c");
    expect(a.studio.text("notes.md")).toBe("ab\nc");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("ab\n");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("");
  });

  it("ends the step at a deletion", () => {
    const a = typing();
    a.pane.type("a");
    a.pane.type("b");
    a.pane.type("c");
    a.pane.backspace();
    a.pane.type("d");
    expect(a.studio.text("notes.md")).toBe("abd");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("ab");
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("");
  });

  it("puts the caret back where it was before the step, and after it on redo", () => {
    const a = device("a", { state: seeded({ "notes.md": "hello world" }) });
    a.pane.select(5);
    a.pane.type("!");
    a.pane.type("!");
    expect(a.pane.selection).toEqual({ start: 7, end: 7 });
    a.pane.select(11);
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe("hello world");
    expect(a.pane.selection).toEqual({ start: 5, end: 5 });
    a.studio.redo();
    expect(a.studio.text("notes.md")).toBe("hello!! world");
    expect(a.pane.selection).toEqual({ start: 7, end: 7 });
  });

  it("starts a new redo line when the person edits after undoing", () => {
    const a = typing();
    a.pane.type("a");
    advance(PAUSE);
    a.pane.type("b");
    a.studio.undo();
    expect(a.studio.canRedo()).toBe(true);
    a.pane.type("c");
    expect(a.studio.canRedo()).toBe(false);
    expect(a.studio.redo()).toBe(false);
    expect(a.studio.text("notes.md")).toBe("ac");
  });

  it("undoes the files of one step together, from the open file", () => {
    const a = device("a", { state: seeded({ "a.md": "alpha", "b.md": "beta" }), open: "a.md" });
    a.studio.applyEdits(
      new Map([
        ["a.md", [{ start: 0, end: 1, newText: "A" }]],
        ["b.md", [{ start: 0, end: 1, newText: "B" }]],
      ]),
    );
    expect(texts(a)).toEqual({ "a.md": "Alpha", "b.md": "Beta" });
    expect(a.studio.undo()).toBe(true);
    expect(texts(a)).toEqual({ "a.md": "alpha", "b.md": "beta" });
    expect(docTexts(a)).toEqual({ "a.md": "alpha", "b.md": "beta" });
    expect(a.studio.redo()).toBe(true);
    expect(texts(a)).toEqual({ "a.md": "Alpha", "b.md": "Beta" });
    // From the other file the same step goes the same way.
    a.studio.select("b.md");
    a.studio.undo();
    expect(texts(a)).toEqual({ "a.md": "alpha", "b.md": "beta" });
  });

  it("leaves another file alone when its last step is not the one being undone", () => {
    const a = device("a", { state: seeded({ "a.md": "alpha", "b.md": "beta" }), open: "a.md" });
    a.studio.applyEdits(
      new Map([
        ["a.md", [{ start: 0, end: 1, newText: "A" }]],
        ["b.md", [{ start: 0, end: 1, newText: "B" }]],
      ]),
    );
    a.studio.select("b.md");
    a.pane.select(4);
    a.pane.type("!");
    a.studio.select("a.md");
    a.studio.undo();
    expect(texts(a)).toEqual({ "a.md": "alpha", "b.md": "Beta!" });
    // Redoing from the file that was not undone does not bring the other back.
    a.studio.select("b.md");
    expect(a.studio.redo()).toBe(false);
  });

  it("undoes a file rename on its own, with the same text", () => {
    const a = device("a", { state: seeded({ "a.meltemi": "diagram a: flow {\n}\n" }) });
    a.pane.select(0);
    a.pane.type("x");
    advance(PAUSE);
    const id = idOf(a, "a.meltemi");
    a.studio.renameFile("a.meltemi", "b.meltemi");
    expect(a.studio.canUndo()).toBe(true);
    expect(a.studio.undo()).toBe(true);
    expect(Object.keys(texts(a))).toEqual(["a.meltemi"]);
    expect(a.studio.text("a.meltemi")).toBe("xdiagram a: flow {\n}\n");
    expect(cloudDoc(a.doc).paths.get(id)).toBe("a.meltemi");
    expect(a.studio.open).toBe("a.meltemi");
    // The typing before the rename is the next step, and the file is the same one.
    expect(a.studio.undo()).toBe(true);
    expect(a.studio.text("a.meltemi")).toBe("diagram a: flow {\n}\n");
    expect(idOf(a, "a.meltemi")).toBe(id);
    expect(a.studio.redo()).toBe(true);
    expect(a.studio.redo()).toBe(true);
    expect(Object.keys(texts(a))).toEqual(["b.meltemi"]);
    expect(a.studio.text("b.meltemi")).toBe("xdiagram a: flow {\n}\n");
  });

  it("moves a file with the imports that follow it as one step, and undoes them together", () => {
    const views = 'language "0.2"\n\nimport "../models/system.meltemi" as sys\n';
    const a = device("a", {
      state: seeded({
        "project.json": '{ "name": "p" }\n',
        "models/system.meltemi": 'language "0.2"\n',
        "diagrams/views.meltemi": views,
      }),
      open: "diagrams/views.meltemi",
    });
    const b = device("b", { state: Y.encodeStateAsUpdate(a.doc) });
    const before = a.sent.length;
    a.studio.moveFiles([["models/system.meltemi", "models/core/system.meltemi"]]);
    advance(SEND_INTERVAL);
    // The path and the import leave together, in one message to the room.
    expect(a.sent.length - before).toBe(1);
    expect(docTexts(a)["diagrams/views.meltemi"]).toContain('"../models/core/system.meltemi"');
    sync(a, b);
    expect(texts(b)).toMatchObject({
      "models/core/system.meltemi": 'language "0.2"\n',
      "diagrams/views.meltemi": views.replace("../models/", "../models/core/"),
    });
    expect(a.studio.undo()).toBe(true);
    expect(docTexts(a)).toMatchObject({
      "models/system.meltemi": 'language "0.2"\n',
      "diagrams/views.meltemi": views,
    });
    expect(a.studio.canUndo()).toBe(false);
  });

  it("makes two renames two steps", () => {
    const a = device("a", { state: seeded({ "a.md": "a" }) });
    a.studio.renameFile("a.md", "b.md");
    a.studio.renameFile("b.md", "c.md");
    a.studio.undo();
    expect(Object.keys(texts(a))).toEqual(["b.md"]);
    a.studio.undo();
    expect(Object.keys(texts(a))).toEqual(["a.md"]);
  });

  it("undoes the deletion of a file, which comes back with its text", () => {
    const a = device("a", { state: seeded({ "a.md": "alpha", "b.md": "beta" }), open: "a.md" });
    a.pane.select(5);
    a.pane.type("!");
    advance(PAUSE);
    a.studio.deleteFile("a.md");
    expect(texts(a)).toEqual({ "b.md": "beta" });
    expect(a.studio.open).toBe("b.md");
    expect(a.studio.canUndo()).toBe(true);
    expect(a.studio.undo()).toBe(true);
    expect(texts(a)).toEqual({ "a.md": "alpha!", "b.md": "beta" });
    expect(docTexts(a)).toEqual({ "a.md": "alpha!", "b.md": "beta" });
    expect(a.studio.open).toBe("a.md");
    // Typing in the restored file is undoable again.
    a.pane.select(6);
    a.pane.type("?");
    a.studio.undo();
    expect(a.studio.text("a.md")).toBe("alpha!");
    // And the deletion can be redone.
    a.studio.undo();
    expect(a.errors).toEqual([]);
  });

  it("undoes the addition of a file and redoes it", () => {
    const a = device("a", { state: seeded({ "a.md": "a" }), open: "a.md" });
    a.studio.addFiles([["new.md", "fresh"]], "new.md");
    expect(a.studio.undo()).toBe(true);
    expect(texts(a)).toEqual({ "a.md": "a" });
    expect(docTexts(a)).toEqual({ "a.md": "a" });
    expect(a.studio.redo()).toBe(true);
    expect(texts(a)).toEqual({ "a.md": "a", "new.md": "fresh" });
    expect(docTexts(a)).toEqual({ "a.md": "a", "new.md": "fresh" });
  });

  it("undoes an import of several files as one step", () => {
    const a = device("a", { state: seeded({ "a.md": "a" }), open: "a.md" });
    a.studio.addFiles(
      [
        ["x.md", "x"],
        ["y.md", "y"],
        ["z.md", "z"],
      ],
      "x.md",
    );
    expect(a.studio.undo()).toBe(true);
    expect(texts(a)).toEqual({ "a.md": "a" });
    expect(docTexts(a)).toEqual({ "a.md": "a" });
    expect(a.studio.canUndo()).toBe(false);
    expect(a.studio.redo()).toBe(true);
    expect(texts(a)).toEqual({ "a.md": "a", "x.md": "x", "y.md": "y", "z.md": "z" });
    expect(docTexts(a)).toEqual(texts(a));
  });

  it("undoes an import that replaced a text and added a file as one step", () => {
    const a = device("a", { state: seeded({ "a.md": "old" }), open: "a.md" });
    a.studio.addFiles(
      [
        ["a.md", "new"],
        ["n.md", "n"],
      ],
      "a.md",
    );
    expect(texts(a)).toEqual({ "a.md": "new", "n.md": "n" });
    a.studio.undo();
    expect(texts(a)).toEqual({ "a.md": "old" });
    expect(docTexts(a)).toEqual({ "a.md": "old" });
    a.studio.redo();
    expect(texts(a)).toEqual({ "a.md": "new", "n.md": "n" });
  });

  it("undoes a replaced project as one step", () => {
    const a = device("a", { state: seeded({ "a.md": "a", "b.md": "b" }) });
    a.studio.load([
      ["b.md", "B"],
      ["c.md", "c"],
    ]);
    expect(docTexts(a)).toEqual({ "b.md": "B", "c.md": "c" });
    expect(a.studio.undo()).toBe(true);
    expect(texts(a)).toEqual({ "a.md": "a", "b.md": "b" });
    expect(docTexts(a)).toEqual({ "a.md": "a", "b.md": "b" });
    expect(a.studio.redo()).toBe(true);
    expect(texts(a)).toEqual({ "b.md": "B", "c.md": "c" });
    expect(docTexts(a)).toEqual({ "b.md": "B", "c.md": "c" });
  });

  it("takes the rename before the typing when the rename came last", () => {
    const a = device("a", { state: seeded({ "a.md": "a" }) });
    a.pane.select(1);
    a.pane.type("b");
    advance(PAUSE);
    a.studio.renameFile("a.md", "z.md");
    a.studio.undo();
    expect(texts(a)).toEqual({ "a.md": "ab" });
    a.studio.undo();
    expect(texts(a)).toEqual({ "a.md": "a" });
  });

  it("never undoes a change that came from the other device", () => {
    const state = seeded({ "notes.md": "base" });
    const a = device("a", { state });
    const b = device("b", { state });
    a.pane.select(0);
    a.pane.type("A");
    advance(PAUSE);
    b.pane.select(4);
    b.pane.type("B");
    sync(a, b);
    expect(a.studio.text("notes.md")).toBe("AbaseB");
    expect(a.studio.undo()).toBe(true);
    expect(a.studio.text("notes.md")).toBe("baseB");
    expect(a.studio.undo()).toBe(false);
    expect(a.studio.text("notes.md")).toBe("baseB");
    sync(a, b);
    expect(b.studio.text("notes.md")).toBe("baseB");
  });

  it("has nothing of its own to undo when only remote changes arrived", () => {
    const state = seeded({ "notes.md": "base" });
    const a = device("a", { state });
    const b = device("b", { state });
    b.pane.select(4);
    b.pane.type("!");
    b.studio.addFiles([["more.md", "m"]]);
    b.studio.renameFile("notes.md", "renamed.md");
    sync(a, b);
    expect(texts(a)).toEqual({ "renamed.md": "base!", "more.md": "m" });
    expect(a.studio.canUndo()).toBe(false);
    expect(a.studio.canRedo()).toBe(false);
    expect(a.studio.undo()).toBe(false);
    expect(texts(a)).toEqual({ "renamed.md": "base!", "more.md": "m" });
  });

  it("does not undo into a text another device has deleted", () => {
    const state = seeded({ "notes.md": "abcdef" });
    const a = device("a", { state });
    const b = device("b", { state });
    a.pane.select(6);
    a.pane.type("XYZ");
    sync(a, b);
    b.pane.select(9);
    for (let i = 0; i < 3; i++) b.pane.backspace();
    sync(a, b);
    expect(a.studio.text("notes.md")).toBe("abcdef");
    expect(a.studio.undo()).toBe(false);
    expect(a.studio.text("notes.md")).toBe("abcdef");
  });

  it("forgets what could be undone and redone when asked, and never touches the text", () => {
    const a = device("a", { state: seeded({ "notes.md": "base\n", "other.md": "o" }) });
    a.pane.select(4);
    a.pane.type("A");
    advance(PAUSE);
    a.pane.select(5);
    a.pane.backspace();
    advance(PAUSE);
    a.studio.renameFile("other.md", "renamed.md");
    a.studio.undo();
    expect(a.studio.canUndo()).toBe(true);
    expect(a.studio.canRedo()).toBe(true);
    const before = texts(a);

    a.binding.clearUndo();
    expect(a.studio.canUndo()).toBe(false);
    expect(a.studio.canRedo()).toBe(false);
    expect(a.studio.undo()).toBe(false);
    expect(a.studio.redo()).toBe(false);
    expect(texts(a)).toEqual(before);

    // Later steps are undone as usual, and only they.
    advance(PAUSE);
    a.pane.select(a.pane.text.length);
    a.pane.type("z");
    expect(a.studio.canUndo()).toBe(true);
    a.studio.undo();
    expect(a.studio.text("notes.md")).toBe(before["notes.md"]);
    expect(a.studio.canUndo()).toBe(false);
  });

  it("does not undo into a restored text: the steps taken before a restore are forgotten", () => {
    // The room replaces the text by a version's (an edit of the part that differs); the person's
    // earlier deletion would otherwise bring back a character into the restored text.
    const state = seeded({ "notes.md": "version one" });
    const a = device("a", { state });
    const b = device("b", { state });
    a.pane.select(11);
    a.pane.backspace();
    a.pane.backspace();
    advance(PAUSE);
    sync(a, b);
    expect(a.studio.text("notes.md")).toBe("version o");
    b.studio.setText("notes.md", "version one");
    sync(a, b);
    expect(a.studio.text("notes.md")).toBe("version one");
    // The person's deletion is still on the stack: undone, it would put the characters back.
    expect(a.studio.canUndo()).toBe(true);
    a.binding.clearUndo();
    expect(a.studio.canUndo()).toBe(false);
    expect(a.studio.undo()).toBe(false);
    expect(a.studio.text("notes.md")).toBe("version one");
  });

  it("goes back to the studio's history when the binding is destroyed", () => {
    const a = typing();
    a.pane.type("a");
    a.binding.destroy();
    expect(a.studio.isBound()).toBe(false);
    // The history never saw it: typing was recorded while the document held the undo too.
    expect(a.studio.canUndo()).toBe(a.studio.history.canUndo("notes.md"));
    a.pane.type("b");
    expect(inDoc(a, "notes.md")).toBe("a");
  });

  it("follows the open file: the buttons ask the file in front", () => {
    const a = device("a", { state: seeded({ "a.md": "a", "b.md": "b" }), open: "a.md" });
    a.pane.select(1);
    a.pane.type("1");
    expect(a.studio.canUndo()).toBe(true);
    a.studio.select("b.md");
    expect(a.studio.canUndo()).toBe(false);
    a.studio.select("a.md");
    expect(a.studio.canUndo()).toBe(true);
  });
});

describe("a destroyed binding", () => {
  it("stops following the studio and the document", () => {
    const state = seeded({ "n.md": "base" });
    const a = device("a", { state });
    const b = device("b", { state });
    a.binding.destroy();
    a.binding.destroy();
    a.studio.addFiles([["x.md", "x"]]);
    expect(a.errors).toEqual([]);
    expect(cloudDoc(a.doc).paths.size).toBe(1);
    b.pane.select(4);
    b.pane.type("!");
    a.binding.apply(Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)));
    expect(a.studio.text("n.md")).toBe("base");
    expect(inDoc(a, "n.md")).toBe("base!");
  });

  it("can be made again on the same studio with the room's state", () => {
    const state = seeded({ "n.md": "base" });
    const a = device("a", { state });
    a.pane.select(4);
    a.pane.type("!");
    a.binding.destroy();
    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, state, REMOTE);
    const sent: Uint8Array[] = [];
    const again = createBinding({ doc: fresh, studio: a.studio, send: (u) => sent.push(u) });
    expect(a.studio.text("n.md")).toBe("base");
    expect(a.studio.isBound(again)).toBe(true);
    again.destroy();
    expect(a.studio.isBound()).toBe(false);
  });
});

/** The documents' text files by path. */
function docTextsOf(doc: Y.Doc): Record<string, string> {
  return Object.fromEntries(
    [...resolveFiles(cloudDoc(doc)).files.values()]
      .filter((f) => f.kind === "text")
      .map((f) => [f.shown, f.text!.toString()]),
  );
}

/** An undo manager, which is what the origin of an undo is. */
function createLocalLike(): unknown {
  return new Y.UndoManager(new Y.Doc().getText("t"));
}
