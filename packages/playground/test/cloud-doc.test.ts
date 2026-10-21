import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  FILE_ID,
  LOCAL,
  REMOTE,
  addBinaryFile,
  addTextFile,
  cloudDoc,
  isLocalOrigin,
  minimalEdit,
  newFileId,
  resolveFiles,
  sha256Hex,
} from "../src/cloud/doc.js";

/** The document with the three maps by their names. */
describe("the document", () => {
  it("has files, paths and binaries as maps of the document", () => {
    const doc = new Y.Doc();
    const cloud = cloudDoc(doc);
    expect(cloud.files).toBe(doc.getMap("files"));
    expect(cloud.paths).toBe(doc.getMap("paths"));
    expect(cloud.binaries).toBe(doc.getMap("binaries"));
  });

  it("tells the person's own transactions from the others", () => {
    const doc = new Y.Doc();
    const manager = new Y.UndoManager(doc.getText("t"), { trackedOrigins: new Set([LOCAL]) });
    expect(isLocalOrigin(LOCAL)).toBe(true);
    expect(isLocalOrigin(manager)).toBe(true);
    expect(isLocalOrigin(REMOTE)).toBe(false);
    expect(isLocalOrigin(null)).toBe(false);
    expect(isLocalOrigin("websocket")).toBe(false);
    expect(isLocalOrigin(undefined)).toBe(false);
  });
});

describe("file ids", () => {
  it("are 16 characters of base32 from 10 random bytes", () => {
    for (let i = 0; i < 50; i++) expect(newFileId()).toMatch(FILE_ID);
    const asked: number[] = [];
    const id = newFileId((length) => {
      asked.push(length);
      return new Uint8Array(length);
    });
    expect(asked).toEqual([10]);
    expect(id).toBe("aaaaaaaaaaaaaaaa");
  });

  it("carry every bit of the bytes, five at a time", () => {
    const ones = newFileId((length) => new Uint8Array(length).fill(255));
    expect(ones).toBe("7777777777777777");
    // 0b00000_001 00000_... : the first byte 0x08 is 00001 000.. so the first character is `b`.
    const first = newFileId((length) => {
      const bytes = new Uint8Array(length);
      bytes[0] = 0x08;
      return bytes;
    });
    expect(first).toBe("baaaaaaaaaaaaaaa");
    const last = newFileId((length) => {
      const bytes = new Uint8Array(length);
      bytes[length - 1] = 1;
      return bytes;
    });
    expect(last).toBe("aaaaaaaaaaaaaaab");
  });

  it("differ from one call to the next", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newFileId()));
    expect(ids.size).toBe(200);
  });
});

describe("files by path", () => {
  it("lists text and binary files with the path they are shown under", () => {
    const cloud = cloudDoc(new Y.Doc());
    const a = addTextFile(cloud, "diagrams/a.meltemi", "diagram a", { id: "aaaaaaaaaaaaaaaa" });
    const b = addBinaryFile(cloud, "logo.png", "ab".repeat(32), { id: "bbbbbbbbbbbbbbbb" });
    const { files, collisions } = resolveFiles(cloud);
    expect([...files.keys()].sort()).toEqual([a, b]);
    expect(files.get(a)).toMatchObject({
      kind: "text",
      path: "diagrams/a.meltemi",
      shown: "diagrams/a.meltemi",
    });
    expect(files.get(a)!.text!.toString()).toBe("diagram a");
    expect(files.get(b)).toMatchObject({
      kind: "binary",
      hash: "ab".repeat(32),
      shown: "logo.png",
    });
    expect(collisions).toEqual([]);
  });

  it("does not show an entry of paths that has neither a text nor a hash", () => {
    const cloud = cloudDoc(new Y.Doc());
    cloud.paths.set("cccccccccccccccc", "ghost.md");
    expect(resolveFiles(cloud).files.size).toBe(0);
  });

  it("keeps the path for the smaller id and shows the others as path~id", () => {
    const cloud = cloudDoc(new Y.Doc());
    addTextFile(cloud, "x.md", "one", { id: "ddddddddddddddd2" });
    addTextFile(cloud, "x.md", "two", { id: "bbbbbbbbbbbbbbbb" });
    addTextFile(cloud, "x.md", "three", { id: "cccccccccccccccc" });
    addTextFile(cloud, "y.md", "alone", { id: "aaaaaaaaaaaaaaaa" });
    const { files, collisions } = resolveFiles(cloud);
    expect(files.get("bbbbbbbbbbbbbbbb")!.shown).toBe("x.md");
    expect(files.get("cccccccccccccccc")!.shown).toBe("x.md~cccccccccccccccc");
    expect(files.get("ddddddddddddddd2")!.shown).toBe("x.md~ddddddddddddddd2");
    expect(files.get("ddddddddddddddd2")!.path).toBe("x.md");
    expect(collisions).toEqual([
      {
        path: "x.md",
        keeper: "bbbbbbbbbbbbbbbb",
        id: "cccccccccccccccc",
        shown: "x.md~cccccccccccccccc",
      },
      {
        path: "x.md",
        keeper: "bbbbbbbbbbbbbbbb",
        id: "ddddddddddddddd2",
        shown: "x.md~ddddddddddddddd2",
      },
    ]);
  });

  it("agrees on the keeper whatever the order the entries were made in", () => {
    const one = cloudDoc(new Y.Doc());
    const two = cloudDoc(new Y.Doc());
    addTextFile(one, "x.md", "1", { id: "aaaaaaaaaaaaaaab" });
    addTextFile(one, "x.md", "2", { id: "aaaaaaaaaaaaaaaa" });
    addTextFile(two, "x.md", "2", { id: "aaaaaaaaaaaaaaaa" });
    addTextFile(two, "x.md", "1", { id: "aaaaaaaaaaaaaaab" });
    expect(resolveFiles(one).collisions).toEqual(resolveFiles(two).collisions);
    expect(resolveFiles(one).collisions[0]!.keeper).toBe("aaaaaaaaaaaaaaaa");
  });
});

describe("a hash of bytes", () => {
  it("is the lowercase hex SHA-256", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("the smallest edit", () => {
  const apply = (before: string, edit: { index: number; remove: number; insert: string }) =>
    before.slice(0, edit.index) + edit.insert + before.slice(edit.index + edit.remove);

  it("is nothing for equal texts", () => {
    expect(minimalEdit("", "")).toBeUndefined();
    expect(minimalEdit("same", "same")).toBeUndefined();
  });

  it("finds an insertion, a deletion and a replacement", () => {
    expect(minimalEdit("hello", "hello!")).toEqual({ index: 5, remove: 0, insert: "!" });
    expect(minimalEdit("hello", "hllo")).toEqual({ index: 1, remove: 1, insert: "" });
    expect(minimalEdit("a b c", "a X c")).toEqual({ index: 2, remove: 1, insert: "X" });
    expect(minimalEdit("", "new")).toEqual({ index: 0, remove: 0, insert: "new" });
    expect(minimalEdit("old", "")).toEqual({ index: 0, remove: 3, insert: "" });
  });

  it("sets aside the common start and the common end", () => {
    expect(minimalEdit("line 1\nline 2\nline 3", "line 1\nline two\nline 3")).toEqual({
      index: 12,
      remove: 1,
      insert: "two",
    });
  });

  it("does not let the start and the end overlap on repeated text", () => {
    expect(minimalEdit("aa", "aaa")).toEqual({ index: 2, remove: 0, insert: "a" });
    expect(minimalEdit("aaa", "aa")).toEqual({ index: 2, remove: 1, insert: "" });
    expect(minimalEdit("abab", "ab")).toEqual({ index: 2, remove: 2, insert: "" });
  });

  it("never cuts a surrogate pair in two", () => {
    // Two emoji that share their high surrogate.
    const smile = "\u{1F600}";
    const grin = "\u{1F601}";
    const edit = minimalEdit(`a${smile}b`, `a${grin}b`)!;
    expect(edit).toEqual({ index: 1, remove: 2, insert: grin });
    // A suffix that starts on a low surrogate stays out of the common end.
    const other = minimalEdit(`${smile}`, `${grin}`)!;
    expect(other).toEqual({ index: 0, remove: 2, insert: grin });
    const inserted = minimalEdit("ab", `a${smile}b`)!;
    expect(apply("ab", inserted)).toBe(`a${smile}b`);
  });

  it("turns any text into any other", () => {
    const alphabet = ["a", "b", "\n", " ", "\u{1F600}", "\u{1F601}", "é"];
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const text = () =>
      Array.from(
        { length: Math.floor(random() * 12) },
        () => alphabet[Math.floor(random() * 7)],
      ).join("");
    for (let i = 0; i < 500; i++) {
      const before = text();
      const after = text();
      const edit = minimalEdit(before, after);
      if (edit === undefined) expect(before).toBe(after);
      else {
        expect(apply(before, edit)).toBe(after);
        // No pair of the result is cut: the edit starts and ends outside a surrogate pair.
        expect(
          /[\udc00-\udfff]/.test(before[edit.index] ?? "") &&
            edit.index > 0 &&
            /[\ud800-\udbff]/.test(before[edit.index - 1] ?? ""),
        ).toBe(false);
      }
    }
  });
});
