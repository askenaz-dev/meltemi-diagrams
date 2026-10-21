import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  COMPACT_AFTER,
  DATABASE_NAME,
  DOCS,
  LAST_OPEN_KEY,
  OPEN_TIMEOUT_MS,
  REMEMBERED_PROJECTS,
  UPDATES,
  openDatabase,
  rememberFile,
  rememberedFile,
  type DocSource,
  type KeyValueStore,
} from "../src/cloud/persistence.js";
import { ManualTimers, settle } from "./support/clock.js";
import { FakeIdb } from "./support/fake-idb.js";

/** A document and what a project's store needs to know about it. */
function source(unsynced = false): { doc: Y.Doc; source: DocSource; flag: { value: boolean } } {
  const doc = new Y.Doc();
  const flag = { value: unsynced };
  return {
    doc,
    flag,
    source: { snapshot: () => Y.encodeStateAsUpdate(doc), unsynced: () => flag.value },
  };
}

/** An update that adds `text` to the document's text, as a local edit would. */
function typed(doc: Y.Doc, text: string): Uint8Array {
  let update!: Uint8Array;
  const listen = (u: Uint8Array) => (update = u);
  doc.on("update", listen);
  doc.getText("t").insert(doc.getText("t").length, text);
  doc.off("update", listen);
  return update;
}

const textOf = (stored: { state?: Uint8Array | undefined; updates: readonly Uint8Array[] }) => {
  const doc = new Y.Doc();
  if (stored.state) Y.applyUpdate(doc, stored.state);
  for (const update of stored.updates) Y.applyUpdate(doc, update);
  return doc.getText("t").toString();
};

async function open(idb = new FakeIdb()) {
  const database = await openDatabase(idb);
  return { idb, database };
}

describe("the database", () => {
  it("is `meltemi-cloud`, with a store of documents and a store of updates", async () => {
    const { idb, database } = await open();
    expect(database.available).toBe(true);
    expect(DATABASE_NAME).toBe("meltemi-cloud");
    expect([...(idb.databases.get(DATABASE_NAME)?.stores.keys() ?? [])]).toEqual([DOCS, UPDATES]);
    expect(DOCS).toBe("docs");
    expect(UPDATES).toBe("updates");
  });

  it("keeps nothing of a project it never saw", async () => {
    const { database } = await open();
    const { source: s } = source();
    expect(await database.project("p", s).load()).toBeUndefined();
  });
});

describe("a project's updates", () => {
  it("are kept as they are made and come back in order", async () => {
    const { database } = await open();
    const { doc, source: s } = source();
    const store = database.project("p", s);
    store.append(typed(doc, "a"));
    store.append(typed(doc, "b"));
    store.append(typed(doc, "c"));
    await store.flush();
    const again = await database.project("p", source().source).load();
    expect(again?.state).toBeUndefined();
    expect(again?.updates).toHaveLength(3);
    expect(textOf(again!)).toBe("abc");
    // Updates waiting mean the room may not have them.
    expect(again?.unsynced).toBe(true);
  });

  it("belong to their project: another's are not read", async () => {
    const { database } = await open();
    const a = source();
    const b = source();
    const storeA = database.project("a", a.source);
    const storeB = database.project("b", b.source);
    storeA.append(typed(a.doc, "A"));
    storeB.append(typed(b.doc, "B"));
    await Promise.all([storeA.flush(), storeB.flush()]);
    expect(textOf((await database.project("a", a.source).load())!)).toBe("A");
    expect(textOf((await database.project("b", b.source).load())!)).toBe("B");
  });
});

describe("compaction", () => {
  it("folds the updates into the document's state and clears them", async () => {
    const { idb, database } = await open();
    const { doc, source: s } = source();
    const store = database.project("p", s);
    store.append(typed(doc, "hello "));
    store.append(typed(doc, "world"));
    await store.compact();
    expect(idb.rows(DATABASE_NAME, UPDATES)).toEqual([]);
    const again = await database.project("p", source().source).load();
    expect(again?.updates).toEqual([]);
    expect(textOf(again!)).toBe("hello world");
    expect(again?.unsynced).toBe(false);
  });

  it("keeps the mark that the room may not have the changes, when the source says so", async () => {
    const { database } = await open();
    const { doc, flag, source: s } = source(true);
    const store = database.project("p", s);
    typed(doc, "x");
    await store.compact();
    expect((await database.project("p", s).load())?.unsynced).toBe(true);
    flag.value = false;
    await store.compact();
    expect((await database.project("p", s).load())?.unsynced).toBe(false);
  });

  it("happens by itself past the limit, and loses nothing", async () => {
    const { idb, database } = await open();
    const { doc, source: s } = source();
    const store = database.project("p", s);
    let expected = "";
    for (let i = 0; i < COMPACT_AFTER + 20; i++) {
      const char = String(i % 10);
      expected += char;
      store.append(typed(doc, char));
    }
    await store.flush();
    await settle(40);
    await store.flush();
    // The updates that came after the fold are the only ones left.
    expect(idb.rows(DATABASE_NAME, UPDATES).length).toBeLessThan(COMPACT_AFTER);
    const again = await database.project("p", source().source).load();
    expect(again?.state).toBeDefined();
    expect(textOf(again!)).toBe(expected);
  });

  it("is not triggered by exactly the limit", async () => {
    const { idb, database } = await open();
    const { doc, source: s } = source();
    const store = database.project("p", s);
    for (let i = 0; i < COMPACT_AFTER; i++) store.append(typed(doc, "x"));
    await store.flush();
    expect(idb.rows(DATABASE_NAME, UPDATES)).toHaveLength(COMPACT_AFTER);
    expect(idb.rows(DATABASE_NAME, DOCS)).toEqual([]);
  });

  it("counts the updates it finds when it loads, so that a project reopened keeps counting", async () => {
    const { idb, database } = await open();
    const first = source();
    const store = database.project("p", first.source);
    for (let i = 0; i < COMPACT_AFTER - 5; i++) store.append(typed(first.doc, "x"));
    await store.flush();
    const second = source();
    const reopened = database.project("p", second.source);
    const loaded = await reopened.load();
    for (const update of loaded!.updates) Y.applyUpdate(second.doc, update);
    for (let i = 0; i < 10; i++) reopened.append(typed(second.doc, "y"));
    await reopened.flush();
    await settle(40);
    await reopened.flush();
    expect(idb.rows(DATABASE_NAME, DOCS)).toHaveLength(1);
  });

  it("writes a compaction after the appends queued before it, and the appends after it after", async () => {
    const { database } = await open();
    const { doc, source: s } = source();
    const store = database.project("p", s);
    store.append(typed(doc, "a"));
    const folded = store.compact();
    store.append(typed(doc, "b"));
    await folded;
    await store.flush();
    const again = await database.project("p", source().source).load();
    expect(textOf(again!)).toBe("ab");
    expect(again?.updates).toHaveLength(1);
  });
});

describe("forgetting a project", () => {
  it("removes its document and its updates and leaves the others", async () => {
    const { database } = await open();
    const a = source();
    const b = source();
    const storeA = database.project("a", a.source);
    const storeB = database.project("b", b.source);
    storeA.append(typed(a.doc, "A"));
    await storeA.compact();
    storeA.append(typed(a.doc, "!"));
    storeB.append(typed(b.doc, "B"));
    await Promise.all([storeA.flush(), storeB.flush()]);
    await database.forget("a");
    expect(await database.project("a", a.source).load()).toBeUndefined();
    expect(textOf((await database.project("b", b.source).load())!)).toBe("B");
  });
});

describe("where nothing can be kept", () => {
  it("is a database that keeps nothing when there is no IndexedDB", async () => {
    const database = await openDatabase(undefined);
    expect(database.available).toBe(false);
    const { doc, source: s } = source();
    const store = database.project("p", s);
    expect(store.available).toBe(false);
    store.append(typed(doc, "x"));
    await store.compact();
    await store.flush();
    expect(await store.load()).toBeUndefined();
    await database.forget("p");
    database.close();
  });

  for (const failure of ["error", "blocked", "throw"] as const) {
    it(`is unavailable when opening ${failure === "throw" ? "throws" : `is ${failure}`}`, async () => {
      const idb = new FakeIdb();
      idb.failure.open = failure;
      const database = await openDatabase(idb);
      expect(database.available).toBe(false);
      expect(database.project("p", source().source).available).toBe(false);
    });
  }

  it("is unavailable when opening never answers, after the time allowed", async () => {
    const idb = new FakeIdb();
    idb.failure.open = "hang";
    const timers = new ManualTimers();
    let result: boolean | undefined;
    void openDatabase(idb, { timers }).then((database) => (result = database.available));
    await settle();
    timers.advance(OPEN_TIMEOUT_MS - 1);
    await settle();
    expect(result).toBeUndefined();
    timers.advance(1);
    await settle();
    expect(result).toBe(false);
  });

  it("closes a database that opened after the page gave up on it", async () => {
    const idb = new FakeIdb();
    const timers = new ManualTimers();
    // The request answers a moment after it was made, and the time allowed is up before that.
    const slow = openDatabase(idb, { timers, timeoutMs: 0 });
    timers.advance(0);
    const database = await slow;
    await settle();
    expect(database.available).toBe(false);
    expect(idb.connections.every((connection) => connection.closed)).toBe(true);
  });

  it("stops keeping, and says so once, when a write fails", async () => {
    const { idb, database } = await open();
    const { doc, source: s } = source();
    let failures = 0;
    const store = database.project("p", s, () => failures++);
    idb.failure.write = UPDATES;
    store.append(typed(doc, "a"));
    await store.flush();
    expect(store.available).toBe(false);
    expect(failures).toBe(1);
    store.append(typed(doc, "b"));
    await store.compact();
    expect(failures).toBe(1);
    expect(idb.rows(DATABASE_NAME, UPDATES)).toEqual([]);
  });

  it("reads nothing, and says so, when reading fails", async () => {
    const { idb, database } = await open();
    const { source: s } = source();
    let failures = 0;
    const store = database.project("p", s, () => failures++);
    idb.databases.get(DATABASE_NAME)!.stores.delete(DOCS);
    for (const connection of idb.connections) connection.stores.delete(DOCS);
    expect(await store.load()).toBeUndefined();
    expect(store.available).toBe(false);
    expect(failures).toBe(1);
  });

  it("closes the connection of another tab that upgrades the database", async () => {
    const { idb, database } = await open();
    idb.connections[0]!.onversionchange?.({});
    expect(idb.connections[0]!.closed).toBe(true);
    expect(database.available).toBe(false);
  });
});

describe("the file each project had open", () => {
  const memory = (): KeyValueStore & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
    };
  };

  it("is remembered per project in this browser", () => {
    const storage = memory();
    rememberFile(storage, "a", "diagrams/one.meltemi");
    rememberFile(storage, "b", "diagrams/two.meltemi");
    expect(rememberedFile(storage, "a")).toBe("diagrams/one.meltemi");
    expect(rememberedFile(storage, "b")).toBe("diagrams/two.meltemi");
    expect(rememberedFile(storage, "c")).toBeUndefined();
    expect(Object.keys(JSON.parse(storage.map.get(LAST_OPEN_KEY)!))).toEqual(["a", "b"]);
  });

  it("is replaced when the person opens another file", () => {
    const storage = memory();
    rememberFile(storage, "a", "one");
    rememberFile(storage, "a", "two");
    expect(rememberedFile(storage, "a")).toBe("two");
  });

  it("forgets the oldest projects past the most it keeps", () => {
    const storage = memory();
    for (let i = 0; i < REMEMBERED_PROJECTS + 5; i++) rememberFile(storage, `p${i}`, `f${i}`);
    expect(rememberedFile(storage, "p0")).toBeUndefined();
    expect(rememberedFile(storage, "p4")).toBeUndefined();
    expect(rememberedFile(storage, "p5")).toBe("f5");
    expect(rememberedFile(storage, `p${REMEMBERED_PROJECTS + 4}`)).toBe(
      `f${REMEMBERED_PROJECTS + 4}`,
    );
  });

  it("works when there is no storage, or storage that refuses", () => {
    rememberFile(undefined, "a", "one");
    expect(rememberedFile(undefined, "a")).toBeUndefined();
    const refusing: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    rememberFile(refusing, "a", "one");
    expect(rememberedFile(refusing, "a")).toBeUndefined();
  });

  it("ignores what is kept when it is not a map of strings", () => {
    for (const kept of ["not json", "[]", "null", "5", '{"a":5}']) {
      const storage = memory();
      storage.map.set(LAST_OPEN_KEY, kept);
      expect(rememberedFile(storage, "a")).toBeUndefined();
    }
    const storage = memory();
    storage.map.set(LAST_OPEN_KEY, '{"a":5,"b":"two"}');
    expect(rememberedFile(storage, "b")).toBe("two");
  });

  it("does not remember an empty path", () => {
    const storage = memory();
    rememberFile(storage, "a", "");
    expect(storage.map.size).toBe(0);
  });
});
