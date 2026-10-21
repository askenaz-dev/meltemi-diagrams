// The document of a cloud project (`cloud-projects`, "The document"): file ids, the path-keyed
// view, pushes and restores as one transaction, and the validation of a transaction. No Cloudflare
// API is involved: this is the code the room runs.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  BINARIES,
  FILES,
  FILE_ID,
  PATHS,
  PUSH,
  RESTORE,
  allChanges,
  applyFiles,
  cloudDoc,
  collectChanges,
  mergeChanges,
  newFileId,
  restoreFiles,
  snapshot,
  validateChanges,
  validateDocument,
  type CloudDoc,
  type DocumentCode,
  type DocumentLimits,
  type ValidateOptions,
} from "../src/document.js";
import {
  newFileId as pageFileId,
  resolveFiles as pageResolve,
} from "../../playground/src/cloud/doc.js";
import { seededRandom } from "./support/index.js";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const LOCAL = Symbol("local");

/** A document with a seeded id generator, so a run is the same every time. */
function make(seed = 7): { cloud: CloudDoc; random: (length: number) => Uint8Array } {
  return { cloud: cloudDoc(new Y.Doc()), random: seededRandom(seed) };
}

/** Adds a text file the way the page does: the text, then the path, in one transaction. */
function addText(cloud: CloudDoc, id: string, path: string, text: string): Y.Text {
  const ytext = new Y.Text();
  cloud.doc.transact(() => {
    cloud.files.set(id, ytext);
    if (text) ytext.insert(0, text);
    cloud.paths.set(id, path);
  }, LOCAL);
  return ytext;
}

function addBinary(cloud: CloudDoc, id: string, path: string, hash: string): void {
  cloud.doc.transact(() => {
    cloud.binaries.set(id, hash);
    cloud.paths.set(id, path);
  }, LOCAL);
}

/** The transactions a callback makes: their origins, and the updates they produced. */
function record(cloud: CloudDoc, run: () => void): { origins: unknown[]; updates: Uint8Array[] } {
  const origins: unknown[] = [];
  const updates: Uint8Array[] = [];
  const onAfter = (transaction: Y.Transaction) => origins.push(transaction.origin);
  const onUpdate = (update: Uint8Array) => updates.push(update);
  cloud.doc.on("afterTransaction", onAfter);
  cloud.doc.on("update", onUpdate);
  try {
    run();
  } finally {
    cloud.doc.off("afterTransaction", onAfter);
    cloud.doc.off("update", onUpdate);
  }
  return { origins, updates };
}

const ID_A = "aaaaaaaaaaaaaaaa";
const ID_B = "bbbbbbbbbbbbbbbb";
const ID_C = "cccccccccccccccc";

describe("file ids", () => {
  it("are 16 characters of lowercase base32 from 10 bytes", () => {
    expect(newFileId(() => new Uint8Array(10))).toBe("aaaaaaaaaaaaaaaa");
    expect(newFileId(() => new Uint8Array(10).fill(255))).toBe("7777777777777777");
    const random = seededRandom(3);
    for (let i = 0; i < 50; i++) expect(newFileId(random)).toMatch(FILE_ID);
  });

  it("are the page's ids: the same bytes give the same id on both sides", () => {
    const random = seededRandom(11);
    for (let i = 0; i < 20; i++) {
      const bytes = random(10);
      expect(newFileId(() => bytes)).toBe(pageFileId(() => bytes));
    }
  });

  it("are never the same twice in a seeded run, and differ between seeds", () => {
    const first = seededRandom(1);
    const ids = new Set(Array.from({ length: 200 }, () => newFileId(first)));
    expect(ids.size).toBe(200);
    expect(newFileId(seededRandom(1))).not.toBe(newFileId(seededRandom(2)));
  });
});

describe("snapshot", () => {
  it("is empty for an empty document", () => {
    expect(snapshot(new Y.Doc())).toEqual({ files: {}, binaries: {}, collisions: [] });
  });

  it("gives texts and hashes by path, the paths sorted", () => {
    const { cloud } = make();
    addText(cloud, ID_B, "diagrams/b.meltemi", "b text");
    addText(cloud, ID_A, "diagrams/a.meltemi", "a text");
    addBinary(cloud, ID_C, "assets/logo.png", HASH);

    const shot = snapshot(cloud);

    expect(Object.keys(shot.files)).toEqual(["diagrams/a.meltemi", "diagrams/b.meltemi"]);
    expect(shot.files).toEqual({ "diagrams/a.meltemi": "a text", "diagrams/b.meltemi": "b text" });
    expect(shot.binaries).toEqual({ "assets/logo.png": HASH });
    expect(shot.collisions).toEqual([]);
  });

  it("accepts the Y.Doc itself, and holds an empty text as an empty string", () => {
    const { cloud } = make();
    addText(cloud, ID_A, "empty.txt", "");
    expect(snapshot(cloud.doc).files).toEqual({ "empty.txt": "" });
  });

  it("leaves out an entry of paths that has neither a text nor a hash", () => {
    const { cloud } = make();
    cloud.paths.set(ID_A, "dangling.meltemi");
    addText(cloud, ID_B, "real.meltemi", "x");
    expect(snapshot(cloud).files).toEqual({ "real.meltemi": "x" });
  });

  it("keeps a file named __proto__ as a file, and not as a prototype", () => {
    const { cloud } = make();
    addText(cloud, ID_A, "__proto__", "own");
    const shot = snapshot(cloud);
    expect(Object.keys(shot.files)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(shot.files)).toBe(Object.prototype);
  });

  it("resolves two ids with one path: the smaller keeps it, the other is shown as <path>~<id>", () => {
    const { cloud } = make();
    addText(cloud, ID_B, "a.meltemi", "from b");
    addText(cloud, ID_A, "a.meltemi", "from a");

    const shot = snapshot(cloud);

    expect(shot.files).toEqual({ "a.meltemi": "from a", [`a.meltemi~${ID_B}`]: "from b" });
    expect(shot.collisions).toEqual([
      { path: "a.meltemi", keeper: ID_A, id: ID_B, shown: `a.meltemi~${ID_B}` },
    ]);
  });

  it("resolves three ids with one path, and a text against a binary", () => {
    const { cloud } = make();
    addText(cloud, ID_C, "x.svg", "c");
    addBinary(cloud, ID_B, "x.svg", HASH);
    addText(cloud, ID_A, "x.svg", "a");

    const shot = snapshot(cloud);

    expect(shot.files).toEqual({ "x.svg": "a", [`x.svg~${ID_C}`]: "c" });
    expect(shot.binaries).toEqual({ [`x.svg~${ID_B}`]: HASH });
    expect(shot.collisions.map((c) => c.id)).toEqual([ID_B, ID_C]);
    expect(shot.collisions.every((c) => c.keeper === ID_A)).toBe(true);
  });

  it("finds the same collisions as the page does, and the same shown paths", () => {
    const { cloud } = make();
    addText(cloud, ID_B, "a.meltemi", "from b");
    addText(cloud, ID_A, "a.meltemi", "from a");
    addBinary(cloud, ID_C, "a.meltemi", HASH);

    const page = pageResolve({
      doc: cloud.doc,
      files: cloud.files as Y.Map<Y.Text>,
      paths: cloud.paths as Y.Map<string>,
      binaries: cloud.binaries as Y.Map<string>,
    });

    expect(page.collisions).toEqual([...snapshot(cloud).collisions]);
    expect([...page.files.values()].map((file) => file.shown).sort()).toEqual(
      [...Object.keys(snapshot(cloud).files), ...Object.keys(snapshot(cloud).binaries)].sort(),
    );
  });
});

describe("applyFiles", () => {
  it("gives a new path a new id and a text, in one transaction with origin push", () => {
    const { cloud, random } = make();

    const { origins } = record(cloud, () =>
      applyFiles(cloud, { files: { "a.meltemi": "one", "b.md": "two" } }, { random }),
    );

    expect(origins).toEqual([PUSH]);
    expect(snapshot(cloud).files).toEqual({ "a.meltemi": "one", "b.md": "two" });
    const ids = [...cloud.paths.keys()];
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(id).toMatch(FILE_ID);
  });

  it("keeps the id and the Y.Text of a path that exists, and edits the text by the smallest change", () => {
    const { cloud, random } = make();
    const original = addText(
      cloud,
      ID_A,
      "a.meltemi",
      `${"x".repeat(10_000)}OLD${"y".repeat(10_000)}`,
    );

    const { updates } = record(cloud, () =>
      applyFiles(
        cloud,
        { files: { "a.meltemi": `${"x".repeat(10_000)}NEW!${"y".repeat(10_000)}` } },
        { random },
      ),
    );

    expect(cloud.files.get(ID_A)).toBe(original);
    expect([...cloud.paths.keys()]).toEqual([ID_A]);
    expect(snapshot(cloud).files["a.meltemi"]).toBe(
      `${"x".repeat(10_000)}NEW!${"y".repeat(10_000)}`,
    );
    expect(updates).toHaveLength(1);
    expect((updates[0] as Uint8Array).length).toBeLessThan(100);
  });

  it("does nothing, and makes no transaction, for text that is already there", () => {
    const { cloud, random } = make();
    addText(cloud, ID_A, "a.meltemi", "same");

    const { updates } = record(cloud, () =>
      applyFiles(cloud, { files: { "a.meltemi": "same" }, binaries: {} }, { random }),
    );

    expect(updates).toEqual([]);
  });

  it("deletes the file at a path with null, and ignores a path that holds nothing", () => {
    const { cloud, random } = make();
    addText(cloud, ID_A, "a.meltemi", "a");
    addText(cloud, ID_B, "b.meltemi", "b");
    addBinary(cloud, ID_C, "logo.png", HASH);

    const { updates } = record(cloud, () =>
      applyFiles(
        cloud,
        { files: { "a.meltemi": null, "never.meltemi": null }, binaries: { "logo.png": null } },
        { random },
      ),
    );

    expect(updates).toHaveLength(1);
    expect(snapshot(cloud)).toEqual({ files: { "b.meltemi": "b" }, binaries: {}, collisions: [] });
    expect([...cloud.paths.keys()]).toEqual([ID_B]);
    expect([...cloud.binaries.keys()]).toEqual([]);
  });

  it("sets binaries: a new path gets an id, an existing one keeps its id and takes the new hash", () => {
    const { cloud, random } = make();
    addBinary(cloud, ID_A, "logo.png", HASH);

    applyFiles(cloud, { binaries: { "logo.png": OTHER_HASH, "font.woff2": HASH } }, { random });

    expect(cloud.binaries.get(ID_A)).toBe(OTHER_HASH);
    expect(snapshot(cloud).binaries).toEqual({ "font.woff2": HASH, "logo.png": OTHER_HASH });
    expect(cloud.paths.size).toBe(2);
  });

  it("replaces a file of the other kind with a new file under a new id", () => {
    const { cloud, random } = make();
    addText(cloud, ID_A, "x.svg", "<svg/>");

    applyFiles(cloud, { binaries: { "x.svg": HASH } }, { random });
    expect(snapshot(cloud)).toEqual({ files: {}, binaries: { "x.svg": HASH }, collisions: [] });
    expect(cloud.paths.has(ID_A)).toBe(false);
    expect(cloud.files.has(ID_A)).toBe(false);

    applyFiles(cloud, { files: { "x.svg": "<svg/>" } }, { random });
    expect(snapshot(cloud)).toEqual({ files: { "x.svg": "<svg/>" }, binaries: {}, collisions: [] });
    expect(cloud.paths.size).toBe(1);
  });

  it("lets a text be deleted and a binary take its path in one push", () => {
    const { cloud, random } = make();
    addText(cloud, ID_A, "x.svg", "<svg/>");

    applyFiles(cloud, { files: { "x.svg": null }, binaries: { "x.svg": HASH } }, { random });

    expect(snapshot(cloud)).toEqual({ files: {}, binaries: { "x.svg": HASH }, collisions: [] });
  });

  it("names the keeper when two ids share a path, and leaves the other alone", () => {
    const { cloud, random } = make();
    addText(cloud, ID_B, "a.meltemi", "from b");
    addText(cloud, ID_A, "a.meltemi", "from a");

    applyFiles(cloud, { files: { "a.meltemi": "pushed" } }, { random });

    expect(cloud.files.get(ID_A)?.toString()).toBe("pushed");
    expect(cloud.files.get(ID_B)?.toString()).toBe("from b");
  });

  it.each([
    "../x.meltemi",
    "..\\x.meltemi",
    ".git/hooks/post-checkout",
    "a//b.meltemi",
    "./a.meltemi",
    "a\\b.meltemi",
    "C:/x.meltemi",
    "/abs.meltemi",
    "",
    "a/b/c/d/e/f/g/h/i/j/k/l/m.meltemi",
    `${"a".repeat(101)}.meltemi`,
    "ctl\u0001.meltemi",
    "a.meltemi~aaaaaaaaaaaaaaaa",
  ])("refuses the path %j with path.invalid, applying nothing", (path) => {
    const { cloud, random } = make();
    addText(cloud, ID_A, "a.meltemi", "a");
    const before = Y.encodeStateAsUpdate(cloud.doc);

    const { updates } = record(cloud, () => {
      expect(() =>
        applyFiles(cloud, { files: { "fine.meltemi": "x", [path]: "y" } }, { random }),
      ).toThrowError(expect.objectContaining({ code: "path.invalid" }));
      expect(() => applyFiles(cloud, { binaries: { [path]: HASH } }, { random })).toThrowError(
        expect.objectContaining({ code: "path.invalid" }),
      );
      expect(() => applyFiles(cloud, { files: { [path]: null } }, { random })).toThrowError(
        expect.objectContaining({ code: "path.invalid" }),
      );
    });

    expect(updates).toEqual([]);
    expect(Y.encodeStateAsUpdate(cloud.doc)).toEqual(before);
  });

  it("refuses a hash that is not 64 lowercase hex, a text that is not text, and a path that is both", () => {
    const { cloud, random } = make();
    const bad: [Parameters<typeof applyFiles>[1]][] = [
      [{ binaries: { "a.png": "A".repeat(64) } }],
      [{ binaries: { "a.png": "a".repeat(63) } }],
      [{ binaries: { "a.png": "xyz" } }],
      [{ binaries: { "a.png": 5 as unknown as string } }],
      [{ files: { "a.md": 5 as unknown as string } }],
      [{ files: { "a.svg": "<svg/>" }, binaries: { "a.svg": HASH } }],
    ];
    for (const [change] of bad) {
      expect(() => applyFiles(cloud, change, { random })).toThrowError(
        expect.objectContaining({ code: "doc.invalid" }),
      );
    }
    expect(cloud.paths.size).toBe(0);
  });

  it("makes updates that a second document applies to the same result", () => {
    const first = make(1);
    const second = cloudDoc(new Y.Doc());
    addText(first.cloud, ID_A, "a.meltemi", "start");
    Y.applyUpdate(second.doc, Y.encodeStateAsUpdate(first.cloud.doc));

    const { updates } = record(first.cloud, () =>
      applyFiles(
        first.cloud,
        { files: { "a.meltemi": "start, then more", "b.md": "new" }, binaries: { "i.png": HASH } },
        { random: first.random },
      ),
    );
    for (const update of updates) Y.applyUpdate(second.doc, update);

    expect(snapshot(second)).toEqual(snapshot(first.cloud));
  });
});

describe("restoreFiles", () => {
  it("makes the document hold exactly the files, in one transaction with origin restore", () => {
    const { cloud, random } = make();
    const keptText = addText(cloud, ID_A, "keep.meltemi", "old text");
    addText(cloud, ID_B, "gone.meltemi", "going");
    addBinary(cloud, ID_C, "gone.png", HASH);
    cloud.paths.set("dddddddddddddddd", "dangling.txt");

    const { origins } = record(cloud, () =>
      restoreFiles(
        cloud,
        { "keep.meltemi": "restored text", "new.md": "added" },
        { "logo.png": OTHER_HASH },
        { random },
      ),
    );

    expect(origins).toEqual([RESTORE]);
    expect(snapshot(cloud)).toEqual({
      files: { "keep.meltemi": "restored text", "new.md": "added" },
      binaries: { "logo.png": OTHER_HASH },
      collisions: [],
    });
    expect(cloud.files.get(ID_A)).toBe(keptText);
    expect([...cloud.paths.keys()].sort()).toHaveLength(3);
    expect(cloud.paths.has("dddddddddddddddd")).toBe(false);
  });

  it("removes the loser of a collision, whichever path the version names", () => {
    const { cloud, random } = make();
    addText(cloud, ID_B, "a.meltemi", "from b");
    addText(cloud, ID_A, "a.meltemi", "from a");

    restoreFiles(cloud, { "a.meltemi": "version" }, {}, { random });

    expect(snapshot(cloud)).toEqual({
      files: { "a.meltemi": "version" },
      binaries: {},
      collisions: [],
    });
    expect([...cloud.paths.keys()]).toEqual([ID_A]);
  });

  it("empties the document for an empty version", () => {
    const { cloud, random } = make();
    addText(cloud, ID_A, "a.meltemi", "a");
    restoreFiles(cloud, {}, {}, { random });
    expect(snapshot(cloud)).toEqual({ files: {}, binaries: {}, collisions: [] });
    expect(cloud.paths.size + cloud.files.size + cloud.binaries.size).toBe(0);
  });

  it("refuses a path that breaks the rule and a null, applying nothing", () => {
    const { cloud, random } = make();
    addText(cloud, ID_A, "a.meltemi", "a");
    const before = Y.encodeStateAsUpdate(cloud.doc);

    expect(() => restoreFiles(cloud, { "../x.meltemi": "x" }, {}, { random })).toThrowError(
      expect.objectContaining({ code: "path.invalid" }),
    );
    expect(() =>
      restoreFiles(cloud, { "a.meltemi": null as unknown as string }, {}, { random }),
    ).toThrowError(expect.objectContaining({ code: "doc.invalid" }));
    expect(Y.encodeStateAsUpdate(cloud.doc)).toEqual(before);
  });
});

/** Applies a client's update to a server document and collects what the transaction changed. */
async function receive(
  server: CloudDoc,
  update: Uint8Array,
  options: Partial<ValidateOptions> = {},
  limits?: DocumentLimits,
): Promise<DocumentCode | undefined> {
  const seen: ReturnType<typeof collectChanges>[] = [];
  const onAfter = (transaction: Y.Transaction) => seen.push(collectChanges(server, transaction));
  server.doc.on("afterTransaction", onAfter);
  try {
    Y.applyUpdate(server.doc, update, "client");
  } finally {
    server.doc.off("afterTransaction", onAfter);
  }
  return validateChanges(server, mergeChanges(seen), {
    hasBlob: async (hash) => hash === HASH,
    encodedBytes: () => Y.encodeStateAsUpdate(server.doc).length,
    ...(limits ? { limits } : {}),
    ...options,
  });
}

/** What a client's edit sends: the update of one transaction on its own copy of the document. */
function edit(client: CloudDoc, run: (client: CloudDoc) => void): Uint8Array {
  let sent: Uint8Array = new Uint8Array();
  const onUpdate = (update: Uint8Array) => (sent = update);
  client.doc.on("update", onUpdate);
  client.doc.transact(() => run(client), LOCAL);
  client.doc.off("update", onUpdate);
  return sent;
}

/** A client that has the server's state. */
function clientOf(server: CloudDoc): CloudDoc {
  const client = cloudDoc(new Y.Doc());
  Y.applyUpdate(client.doc, Y.encodeStateAsUpdate(server.doc));
  return client;
}

const TINY: DocumentLimits = { files: 3, textCharacters: 100, documentBytes: 1_000_000 };

describe("validating a transaction", () => {
  it("lets a good one through: a new text file, an edit, a rename, a delete, a known binary", async () => {
    const server = cloudDoc(new Y.Doc());
    const client = clientOf(server);

    const steps: ((c: CloudDoc) => void)[] = [
      (c) => {
        const text = new Y.Text();
        c.files.set(ID_A, text);
        text.insert(0, "hello");
        c.paths.set(ID_A, "diagrams/a.meltemi");
      },
      (c) => (c.files.get(ID_A) as Y.Text).insert(5, " world"),
      (c) => c.paths.set(ID_A, "diagrams/renamed.meltemi"),
      (c) => {
        c.binaries.set(ID_B, HASH);
        c.paths.set(ID_B, "assets/logo.png");
      },
      (c) => {
        c.files.delete(ID_A);
        c.paths.delete(ID_A);
      },
    ];
    for (const step of steps) expect(await receive(server, edit(client, step))).toBeUndefined();

    expect(snapshot(server)).toEqual({
      files: {},
      binaries: { "assets/logo.png": HASH },
      collisions: [],
    });
  });

  it("refuses a path that breaks the rule, whether the file is new or renamed", async () => {
    for (const path of ["../secrets.meltemi", ".git/hooks/post-checkout", "a\\b", "a//b"]) {
      const server = cloudDoc(new Y.Doc());
      addText(server, ID_A, "ok.meltemi", "x");
      const client = clientOf(server);

      const renamed = edit(client, (c) => c.paths.set(ID_A, path));
      expect(await receive(server, renamed), `rename to ${path}`).toBe("path.invalid");

      const fresh = clientOf(server);
      const added = edit(fresh, (c) => {
        c.files.set(ID_B, new Y.Text());
        c.paths.set(ID_B, path);
      });
      expect(await receive(server, added), `add ${path}`).toBe("path.invalid");
    }
  });

  it("refuses a key of files or binaries that has no path, and a path that goes while its file stays", async () => {
    const server = cloudDoc(new Y.Doc());
    addText(server, ID_A, "a.meltemi", "x");
    expect(
      await receive(
        server,
        edit(clientOf(server), (c) => c.files.set(ID_B, new Y.Text())),
      ),
    ).toBe("doc.invalid");

    const second = cloudDoc(new Y.Doc());
    addText(second, ID_A, "a.meltemi", "x");
    expect(
      await receive(
        second,
        edit(clientOf(second), (c) => c.paths.delete(ID_A)),
      ),
    ).toBe("doc.invalid");

    const third = cloudDoc(new Y.Doc());
    expect(
      await receive(
        third,
        edit(clientOf(third), (c) => c.binaries.set(ID_A, HASH)),
      ),
    ).toBe("doc.invalid");
  });

  it("refuses values of the wrong kind: a files value that is not a Y.Text, a path that is not text", async () => {
    const wrong: [string, (c: CloudDoc) => void][] = [
      [
        "a Y.Map in files",
        (c) => {
          c.files.set(ID_A, new Y.Map());
          c.paths.set(ID_A, "a.meltemi");
        },
      ],
      [
        "a string in files",
        (c) => {
          c.files.set(ID_A, "plain");
          c.paths.set(ID_A, "a.meltemi");
        },
      ],
      [
        "an XmlText in files",
        (c) => {
          c.files.set(ID_A, new Y.XmlText());
          c.paths.set(ID_A, "a.meltemi");
        },
      ],
      [
        "a number as a path",
        (c) => {
          c.files.set(ID_A, new Y.Text());
          c.paths.set(ID_A, 42);
        },
      ],
      [
        "a Y.Text as a path",
        (c) => {
          c.files.set(ID_A, new Y.Text());
          c.paths.set(ID_A, new Y.Text());
        },
      ],
      [
        "a number as a hash",
        (c) => {
          c.binaries.set(ID_A, 42);
          c.paths.set(ID_A, "a.png");
        },
      ],
      [
        "an uppercase hash",
        (c) => {
          c.binaries.set(ID_A, HASH.toUpperCase());
          c.paths.set(ID_A, "a.png");
        },
      ],
      [
        "a short hash",
        (c) => {
          c.binaries.set(ID_A, "abc");
          c.paths.set(ID_A, "a.png");
        },
      ],
      [
        "an id in files and binaries",
        (c) => {
          c.files.set(ID_A, new Y.Text());
          c.binaries.set(ID_A, HASH);
          c.paths.set(ID_A, "a.png");
        },
      ],
      [
        "an id that is not 16 base32 characters",
        (c) => {
          c.files.set("id-1", new Y.Text());
          c.paths.set("id-1", "a.meltemi");
        },
      ],
    ];
    for (const [name, run] of wrong) {
      const server = cloudDoc(new Y.Doc());
      expect(await receive(server, edit(clientOf(server), run)), name).toBe("doc.invalid");
    }
  });

  it("refuses a document of another shape: a root type of its own, or a list in a map", async () => {
    const server = cloudDoc(new Y.Doc());
    const rogue = new Y.Doc();
    rogue.getMap("secrets").set("k", "v");
    expect(await receive(server, Y.encodeStateAsUpdate(rogue))).toBe("doc.invalid");

    const listy = new Y.Doc();
    listy.getArray(FILES).push(["x"]);
    expect(await receive(cloudDoc(new Y.Doc()), Y.encodeStateAsUpdate(listy))).toBe("doc.invalid");
  });

  it("refuses a hash the project never uploaded, once per distinct hash asked", async () => {
    const server = cloudDoc(new Y.Doc());
    const asked: string[] = [];
    const hasBlob = async (hash: string) => {
      asked.push(hash);
      return hash === HASH;
    };
    const client = clientOf(server);

    const known = edit(client, (c) => {
      c.binaries.set(ID_A, HASH);
      c.binaries.set(ID_B, HASH);
      c.paths.set(ID_A, "a.png");
      c.paths.set(ID_B, "b.png");
    });
    expect(await receive(server, known, { hasBlob })).toBeUndefined();
    expect(asked).toEqual([HASH]);

    const unknown = edit(client, (c) => {
      c.binaries.set(ID_C, OTHER_HASH);
      c.paths.set(ID_C, "c.png");
    });
    expect(await receive(server, unknown, { hasBlob })).toBe("blob.unknown");
  });

  it("does not ask about a hash when a rule that comes first is broken", async () => {
    const server = cloudDoc(new Y.Doc());
    const asked: string[] = [];
    const update = edit(clientOf(server), (c) => {
      c.binaries.set(ID_A, OTHER_HASH);
      c.paths.set(ID_A, "../a.png");
    });
    const code = await receive(server, update, {
      hasBlob: async (hash) => {
        asked.push(hash);
        return false;
      },
    });
    expect(code).toBe("path.invalid");
    expect(asked).toEqual([]);
  });

  it("refuses a text over the limit, whether it was new or grew, and one exactly at it passes", async () => {
    const server = cloudDoc(new Y.Doc());
    const client = clientOf(server);
    const atLimit = edit(client, (c) => {
      const text = new Y.Text();
      c.files.set(ID_A, text);
      text.insert(0, "x".repeat(100));
      c.paths.set(ID_A, "a.meltemi");
    });
    expect(await receive(server, atLimit, {}, TINY)).toBeUndefined();

    const grown = edit(client, (c) => (c.files.get(ID_A) as Y.Text).insert(0, "y"));
    expect(await receive(server, grown, {}, TINY)).toBe("doc.too-large");

    const added = edit(clientOf(server), (c) => {
      const text = new Y.Text();
      c.files.set(ID_B, text);
      text.insert(0, "z".repeat(101));
      c.paths.set(ID_B, "b.meltemi");
    });
    expect(await receive(cloudDoc(new Y.Doc()), added, {}, TINY)).toBe("doc.too-large");
  });

  it("counts the text of a document in characters, not bytes", async () => {
    const server = cloudDoc(new Y.Doc());
    const update = edit(clientOf(server), (c) => {
      const text = new Y.Text();
      c.files.set(ID_A, text);
      text.insert(0, "é".repeat(100));
      c.paths.set(ID_A, "a.meltemi");
    });
    expect(await receive(server, update, {}, TINY)).toBeUndefined();
  });

  it("refuses more files than a project may hold, and the limit itself passes", async () => {
    const server = cloudDoc(new Y.Doc());
    const ids = ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "cccccccccccccccc", "dddddddddddddddd"];
    const client = clientOf(server);
    const three = edit(client, (c) => {
      for (const id of ids.slice(0, 3)) {
        c.files.set(id, new Y.Text());
        c.paths.set(id, `${id}.md`);
      }
    });
    expect(await receive(server, three, {}, TINY)).toBeUndefined();

    const fourth = edit(client, (c) => {
      c.files.set(ids[3] as string, new Y.Text());
      c.paths.set(ids[3] as string, "four.md");
    });
    expect(await receive(server, fourth, {}, TINY)).toBe("quota.files");
  });

  it("refuses 2001 files with the real limit and passes 2000", async () => {
    const random = seededRandom(5);
    const ids = Array.from({ length: 2001 }, () => newFileId(random));
    const update = (count: number) =>
      edit(cloudDoc(new Y.Doc()), (c) => {
        for (const id of ids.slice(0, count)) {
          c.files.set(id, new Y.Text());
          c.paths.set(id, `${id}.md`);
        }
      });
    const twoThousand = cloudDoc(new Y.Doc());
    expect(await receive(twoThousand, update(2000))).toBeUndefined();
    const more = cloudDoc(new Y.Doc());
    expect(await receive(more, update(2001))).toBe("quota.files");
  });

  it("refuses an encoded document over its limit, asking for the size only at the end", async () => {
    const server = cloudDoc(new Y.Doc());
    const update = edit(clientOf(server), (c) => {
      c.files.set(ID_A, new Y.Text());
      c.paths.set(ID_A, "a.meltemi");
    });
    let asked = 0;
    const code = await receive(
      server,
      update,
      {
        encodedBytes: () => {
          asked++;
          return 2_000_000;
        },
      },
      TINY,
    );
    expect(code).toBe("doc.too-large");
    expect(asked).toBe(1);
  });

  it("validates a whole document: every id and every text", async () => {
    const { cloud } = make();
    addText(cloud, ID_A, "a.meltemi", "x".repeat(101));
    const options: ValidateOptions = {
      hasBlob: async () => true,
      encodedBytes: () => 1,
      limits: TINY,
    };
    expect(await validateDocument(cloud, options)).toBe("doc.too-large");

    const good = make().cloud;
    addText(good, ID_A, "a.meltemi", "fine");
    addBinary(good, ID_B, "a.png", HASH);
    expect(await validateDocument(good, { ...options, hasBlob: async (h) => h === HASH })).toBe(
      undefined,
    );
    expect(await validateDocument(good, { ...options, hasBlob: async () => false })).toBe(
      "blob.unknown",
    );
    expect(allChanges(good).ids).toEqual(new Set([ID_A, ID_B]));
  });

  it("looks at what changed: a keystroke in a big document touches one text and no id", async () => {
    const server = cloudDoc(new Y.Doc());
    const random = seededRandom(9);
    applyFiles(
      server,
      { files: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}.md`, "text"])) },
      { random },
    );
    const client = clientOf(server);
    const id = [...server.files.keys()][0] as string;

    const update = edit(client, (c) => (c.files.get(id) as Y.Text).insert(0, "k"));
    const changed: ReturnType<typeof collectChanges>[] = [];
    const onAfter = (transaction: Y.Transaction) =>
      changed.push(collectChanges(server, transaction));
    server.doc.on("afterTransaction", onAfter);
    Y.applyUpdate(server.doc, update);
    server.doc.off("afterTransaction", onAfter);

    expect(changed).toHaveLength(1);
    expect(changed[0]?.ids.size).toBe(0);
    expect(changed[0]?.texts.size).toBe(1);
    expect(changed[0]?.foreign).toBe(false);
  });

  it("names its maps as the page does", () => {
    expect([FILES, PATHS, BINARIES]).toEqual(["files", "paths", "binaries"]);
  });
});
