// What an editor can do to a room with an update no honest page sends (`cloud-document`, "The
// room's rules"): a struct that waits for one that never comes, a root type of another shape, a
// document that is small encoded and heavy in memory. None of it may leave the room unable to take
// an honest edit, or keep the clients asking for ever.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { snapshot } from "../src/document.js";
import { KIND, frame } from "../src/room-protocol.js";
import { fakeClock, memoryStore } from "./support/index.js";
import { A, B, C, PROJECT, addText, textOf, typeInto, world } from "./support/rooms.js";

async function setup(options: Partial<Parameters<typeof world>[0]> = {}) {
  return world({ clock: fakeClock(), store: memoryStore(), ...options });
}

/** A made-up client's update with a gap in its clock (clock 0 never sent) that names a root type. */
function gapNamingARoot(): Uint8Array {
  const stranger = new Y.Doc();
  stranger.clientID = 4242;
  stranger.getMap("paths").set(C, "x.meltemi");
  const before = Y.encodeStateVector(stranger);
  stranger.getMap("evil").set("k", "v");
  return Y.encodeStateAsUpdate(stranger, before);
}

/** The same kind of gap on a map the project has: the struct waits for one that never comes. */
function gapOnAMap(): Uint8Array {
  const stranger = new Y.Doc();
  stranger.clientID = 4242;
  stranger.getMap("paths").set(C, "x.meltemi");
  const before = Y.encodeStateVector(stranger);
  stranger.getMap("paths").set("dddddddddddddddd", "y.meltemi");
  return Y.encodeStateAsUpdate(stranger, before);
}

describe("an update that integrates nothing but names a root type", () => {
  it("is refused, never reaches storage, and leaves the room taking honest edits", async () => {
    const w = await setup();
    const editor = await w.open({ sub: "u-ben", role: "editor" });
    const honest = await w.open({ sub: "u-ana" });
    await addText(honest, A, "a.meltemi", "hello");

    await editor.send(frame(KIND.update, gapNamingARoot()));
    expect(editor.errors).toEqual(["doc.invalid"]);
    expect(editor.closed?.code).toBe(4400);

    // The write that follows must not carry the update, so a rebuilt room is as healthy as this one.
    await w.room.core.flush();
    const stored = w.room.storage.document();
    expect([...stored.share.keys()]).not.toContain("evil");
    expect(stored.store.pendingStructs).toBeNull();

    // Anybody's next write is taken: a push, a restore, a socket update, before and after a reload.
    expect(await w.rooms.push(PROJECT, { files: { "z.meltemi": "fine" } })).toEqual({
      revision: 2,
    });
    await typeInto(honest, A, " there");
    expect(honest.closed).toBeUndefined();
    await w.room.core.flush();
    w.room.evict();
    expect(await w.rooms.push(PROJECT, { files: { "y.meltemi": "still fine" } })).toEqual({
      revision: 4,
    });
    expect((await w.rooms.read(PROJECT)).files).toEqual({
      "a.meltemi": "hello there",
      "z.meltemi": "fine",
      "y.meltemi": "still fine",
    });
  });

  it("does not poison the next honest update when the room never wrote it (a truncated update)", async () => {
    const w = await setup();
    const editor = await w.open({ sub: "u-ben", role: "editor" });
    const honest = await w.open({ sub: "u-ana" });

    const stranger = new Y.Doc();
    stranger.getMap("evil").set("k", "v");
    const whole = Y.encodeStateAsUpdate(stranger);
    await editor.send(frame(KIND.update, whole.slice(0, whole.length - 2)));
    expect(editor.closed).toBeDefined();

    await addText(honest, A, "a.meltemi", "mine");
    expect(honest.closed).toBeUndefined();
    expect(honest.errors).toEqual([]);
    expect((await w.rooms.read(PROJECT)).files).toEqual({ "a.meltemi": "mine" });
  });

  it("is forgotten by a room whose stored state already holds one", async () => {
    const w = await setup();
    const honest = await w.open({ sub: "u-ana" });
    await addText(honest, A, "a.meltemi", "kept");
    await w.room.core.flush();

    // What an earlier room wrote: the document with the waiting struct encoded beside it.
    const poisoned = new Y.Doc();
    Y.applyUpdate(poisoned, Y.encodeStateAsUpdate(w.room.storage.document()));
    Y.applyUpdate(poisoned, gapNamingARoot());
    const bytes = Y.encodeStateAsUpdate(poisoned);
    expect(poisoned.store.pendingStructs).not.toBeNull();
    w.room.storage.save(w.room.storage.revision, [bytes]);

    w.room.evict();
    expect(await w.rooms.push(PROJECT, { files: { "z.meltemi": "fine" } })).toEqual({
      revision: 2,
    });
    // And a rollback of the rebuilt room does not bring it back.
    await expect(w.rooms.push(PROJECT, { files: { "../bad": "x" } })).rejects.toMatchObject({
      code: "path.invalid",
    });
    expect(await w.rooms.push(PROJECT, { files: { "y.meltemi": "fine" } })).toEqual({
      revision: 3,
    });
  });
});

describe("an update that waits for one that never comes", () => {
  it("is not kept: nobody is asked for ever, and what the room writes holds nothing of it", async () => {
    const w = await setup();
    const attacker = await w.open({ sub: "u-ben", role: "editor" });
    const honest = await w.open({ sub: "u-ana" });
    await addText(honest, A, "a.meltemi", "start");

    await attacker.send(frame(KIND.update, gapOnAMap()));
    // The sender is asked once for what the room lacks; it has nothing to give.
    expect(attacker.of(KIND.sync).length).toBe(2);
    await attacker.push();
    expect(attacker.of(KIND.sync).length).toBe(2);

    // The others type, and none of them is ever asked anything.
    const before = honest.messages.length;
    for (let i = 0; i < 5; i++) await typeInto(honest, A, `${i}`);
    const asked = honest.messages.slice(before).filter((m) => m.kind === KIND.sync);
    expect(asked).toEqual([]);

    await w.room.core.flush();
    expect(w.room.storage.document().store.pendingStructs).toBeNull();
    expect(snapshot(w.room.storage.document()).files).toEqual({ "a.meltemi": "start01234" });
  });

  it("is asked once per client, so that two ends lacking something cannot answer one another for ever", async () => {
    const w = await setup();
    const attacker = await w.open({ sub: "u-ben", role: "editor" });
    const first = gapOnAMap();
    await attacker.send(frame(KIND.update, first));
    await attacker.send(frame(KIND.update, first));
    await attacker.send(frame(KIND.update, first));
    // The hello's vector and one question, not one for each update.
    expect(attacker.of(KIND.sync)).toHaveLength(2);

    // Once a whole update came, a later gap is asked about again.
    await addText(attacker, B, "b.meltemi", "whole");
    await attacker.send(frame(KIND.update, first));
    expect(attacker.of(KIND.sync)).toHaveLength(3);
  });

  it("still gives back what the client had, when it answers the question with all of it", async () => {
    const w = await setup();
    const client = await w.open();
    client.doc.transact(() => {
      const text = new Y.Text();
      client.cloud.files.set(A, text);
      text.insert(0, "first");
      client.cloud.paths.set(A, "a.meltemi");
    });
    await typeInto(client, A, " second");
    expect((await w.rooms.read(PROJECT)).files).toEqual({});

    await client.push();
    expect((await w.rooms.read(PROJECT)).files).toEqual({ "a.meltemi": "first second" });
    expect(textOf(client, A)).toBe("first second");
  });
});

describe("a document that is small encoded and heavy in memory", () => {
  /** A document whose text got `count` characters at its start, each its own struct (none can merge). */
  function denseDoc(count: number): Y.Doc {
    const stranger = new Y.Doc();
    stranger.clientID = 7;
    stranger.transact(() => {
      const text = new Y.Text();
      stranger.getMap("files").set(A, text);
      stranger.getMap("paths").set(A, "dense.txt");
      for (let i = 0; i < count; i++) text.insert(0, "x");
    });
    return stranger;
  }

  it("is refused when it holds more structs than the room can hold, whatever its size", async () => {
    const w = await setup({ limits: { items: 200 } });
    const editor = await w.open({ sub: "u-ben", role: "editor" });
    const update = Y.encodeStateAsUpdate(denseDoc(500));
    // Nowhere near the limit in bytes.
    expect(update.length).toBeLessThan(10_000);

    await editor.send(frame(KIND.update, update));
    expect(editor.errors).toEqual(["doc.too-large"]);
    expect(editor.closed?.code).toBe(4413);
    expect((await w.rooms.read(PROJECT)).files).toEqual({});
  });

  it("counts what the room keeps, not what one update adds", async () => {
    const w = await setup({ limits: { items: 200 } });
    const editor = await w.open({ sub: "u-ben", role: "editor" });
    const stranger = denseDoc(100);
    await editor.send(frame(KIND.update, Y.encodeStateAsUpdate(stranger)));
    expect(editor.errors).toEqual([]);
    expect((await w.rooms.read(PROJECT)).files["dense.txt"]).toHaveLength(100);

    // The same client again, 150 more structs: 250 in the document, over the limit.
    const before = Y.encodeStateVector(stranger);
    const text = stranger.getMap("files").get(A) as Y.Text;
    for (let i = 0; i < 150; i++) text.insert(0, "y");
    await editor.send(frame(KIND.update, Y.encodeStateAsUpdate(stranger, before)));
    expect(editor.errors).toEqual(["doc.too-large"]);
    expect((await w.rooms.read(PROJECT)).files["dense.txt"]).toHaveLength(100);
  });
});
