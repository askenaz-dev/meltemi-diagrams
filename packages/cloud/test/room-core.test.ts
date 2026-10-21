// The room's persistence, protocol and validation (`cloud-document`, "A project is a Yjs document
// in a room" and "The room's protocol"), over a fake socket pair, a fake storage and a fake clock:
// the room's real logic with no platform.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { snapshot } from "../src/document.js";
import { CHUNK_BYTES, toChunks } from "../src/room-core.js";
import { KIND, frame } from "../src/room-protocol.js";
import { fakeClock, memoryStore } from "./support/index.js";
import {
  A,
  B,
  C,
  HASH,
  PROJECT,
  UNKNOWN_HASH,
  addText,
  textOf,
  typeInto,
  world,
  type RoomClient,
  type World,
} from "./support/rooms.js";

const SECOND = 1000;

async function setup(options: Partial<Parameters<typeof world>[0]> = {}): Promise<World> {
  return world({ clock: fakeClock(), store: memoryStore(), ...options });
}

/** What the room's document holds as paths, which is what every reader sees. */
const held = (w: World) => w.room.core.readFiles();

/** The document the storage holds, after the room wrote what it had. */
async function stored(w: World): Promise<ReturnType<typeof snapshot>> {
  await w.room.core.flush();
  return snapshot(w.room.storage.document());
}

describe("persistence", () => {
  it("writes while a client types: updates every 200 ms for five seconds are written five to seven times", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi");
    for (let i = 0; i < 25; i++) {
      await typeInto(client, A, `line ${i}\n`);
      await w.rooms.advance(200);
    }
    await w.rooms.advance(30 * SECOND);

    const { saves } = w.room.storage;
    expect(saves.length).toBeGreaterThanOrEqual(5);
    expect(saves.length).toBeLessThanOrEqual(7);
    // Every update is in the stored document, and the revision counts every transaction.
    expect(saves.at(-1)?.revision).toBe(26);
    expect(w.room.storage.revision).toBe(26);
    expect(snapshot(w.room.storage.document()).files["a.meltemi"]).toBe(textOf(client, A));
    expect(textOf(client, A).split("\n")).toHaveLength(26);
  });

  it("writes the first change at once, and at most once a second after that", async () => {
    const w = await setup();
    const client = await w.open();

    await addText(client, A, "a.meltemi", "x");
    await w.rooms.advance(0);
    expect(w.room.storage.saves).toHaveLength(1);

    // Two more changes inside the second: one write, a second after the last.
    await w.rooms.advance(100);
    await typeInto(client, A, "y");
    await w.rooms.advance(100);
    await typeInto(client, A, "z");
    await w.rooms.advance(799);
    expect(w.room.storage.saves).toHaveLength(1);
    await w.rooms.advance(1);
    expect(w.room.storage.saves).toHaveLength(2);
    const [first, second] = w.room.storage.saves as unknown as [{ at: number }, { at: number }];
    expect(second.at - first.at).toBe(SECOND);
    expect(await stored(w)).toMatchObject({ files: { "a.meltemi": "xyz" } });

    // Nothing changed: nothing more is written.
    await w.rooms.advance(60 * SECOND);
    expect(w.room.storage.saves).toHaveLength(2);
  });

  it("never holds a change unwritten for more than ten seconds, even when a client never pauses", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi");

    let oldest = 0;
    for (let at = 0; at < 90 * SECOND; at += 500) {
      await typeInto(client, A, ".");
      await w.rooms.advance(500);
      const last = w.room.storage.saves.at(-1);
      oldest = Math.max(oldest, w.clock.now().getTime() - (last?.at ?? 0));
    }

    // The state in storage is at most ten seconds old at any moment (in fact about a second).
    expect(oldest).toBeLessThanOrEqual(10 * SECOND);
    const gaps = w.room.storage.saves
      .slice(1)
      .map((save, i) => save.at - (w.room.storage.saves[i]?.at as number));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(10 * SECOND);
    expect(w.room.storage.saves.length).toBeGreaterThan(80);
  });

  it("writes at once when the last client leaves, and not when a client leaves and another stays", async () => {
    const w = await setup();
    const first = await w.open();
    const second = await w.open({ sub: "u1" });
    await addText(first, A, "a.meltemi", "start");
    await w.rooms.advance(0);
    expect(w.room.storage.saves).toHaveLength(1);

    await typeInto(first, A, " more");
    await w.rooms.advance(100);
    await first.leave();
    expect(w.room.storage.saves).toHaveLength(1);

    await typeInto(second, A, " again");
    await w.rooms.advance(100);
    await second.leave();
    expect(w.room.storage.saves).toHaveLength(2);
    expect(snapshot(w.room.storage.document()).files["a.meltemi"]).toBe("start more again");
  });

  it("stores the encoded document in chunks of at most 1 MiB with the revision in one write", async () => {
    expect(CHUNK_BYTES).toBe(1024 * 1024);
    const sizes = (bytes: number) => toChunks(new Uint8Array(bytes)).map((chunk) => chunk.length);
    expect(sizes(0)).toEqual([0]);
    expect(sizes(1)).toEqual([1]);
    expect(sizes(CHUNK_BYTES)).toEqual([CHUNK_BYTES]);
    expect(sizes(CHUNK_BYTES + 1)).toEqual([CHUNK_BYTES, 1]);
    expect(sizes(3 * CHUNK_BYTES)).toEqual([CHUNK_BYTES, CHUNK_BYTES, CHUNK_BYTES]);
  });

  it("reloads a large document: a state of about 3 MiB is written in three chunks and a room constructed again equals it", async () => {
    const w = await setup();
    const first = "first ".repeat(250_000);
    const second = "second".repeat(250_000);
    await w.rooms.restore(PROJECT, { "big/a.txt": first, "big/b.txt": second }, {});
    await w.room.core.flush();

    const save = w.room.storage.saves.at(-1);
    expect(save?.bytes).toBeGreaterThan(2 * CHUNK_BYTES);
    expect(save?.bytes).toBeLessThanOrEqual(3 * CHUNK_BYTES);
    expect(save?.chunks).toBe(3);
    expect(w.room.storage.chunks?.map((chunk) => chunk.length).slice(0, 2)).toEqual([
      CHUNK_BYTES,
      CHUNK_BYTES,
    ]);

    const before = await held(w);
    w.room.evict();
    const after = await held(w);
    expect(after).toEqual(before);
    expect(after.files["big/a.txt"]).toBe(first);
    expect(after.files["big/b.txt"]).toBe(second);
    expect(after.revision).toBe(1);
  });

  it("starts from the revision it stored, and counts on from there", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi", "one");
    await typeInto(client, A, " two");
    await client.leave();
    expect(w.room.storage.revision).toBe(2);

    w.room.evict();
    const again = await w.open();
    expect(again.hello?.["revision"]).toBe(2);
    await again.sync();
    await typeInto(again, A, "!");
    expect((await held(w)).revision).toBe(3);
  });

  it("keeps the document and tries again when the storage refuses a write", async () => {
    const w = await setup();
    const client = await w.open();
    w.room.storage.failures = 2;
    await addText(client, A, "a.meltemi", "kept");

    await w.rooms.advance(0);
    expect(w.room.storage.saves).toHaveLength(0);
    expect(w.room.warnings).toEqual(["room: the document could not be written to storage"]);
    expect((await held(w)).files).toEqual({ "a.meltemi": "kept" });

    // One second after each refusal it tries again; the second try also fails, the third works.
    await w.rooms.advance(SECOND);
    expect(w.room.storage.saves).toHaveLength(0);
    await w.rooms.advance(SECOND);
    expect(w.room.storage.saves).toHaveLength(1);
    expect(snapshot(w.room.storage.document()).files).toEqual({ "a.meltemi": "kept" });
  });

  it("loses at most the unwritten changes when the object is evicted, and a client that resends gets them back", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi", "written");
    await w.rooms.advance(0);
    await typeInto(client, A, " and then");
    expect(w.room.storage.saves).toHaveLength(1);

    // The object goes with its timers: what was not written is gone from the room.
    w.room.evict();
    expect((await held(w)).files).toEqual({ "a.meltemi": "written" });

    // The next edit depends on the lost one: the room says what it holds, the client answers.
    const before = client.messages.length;
    await typeInto(client, A, " and later");
    const asked = client.messages.slice(before).filter((message) => message.kind === KIND.sync);
    expect(asked).toHaveLength(1);
    expect((await held(w)).files).toEqual({ "a.meltemi": "written" });
    await client.push();
    expect((await held(w)).files).toEqual({ "a.meltemi": "written and then and later" });
    expect((await held(w)).revision).toBe(2);
  });
});

describe("the protocol", () => {
  it("greets a client with hello and the room's state vector", async () => {
    const w = await setup();
    const owner = await w.open({ sub: "u1", name: "Ana", picture: "https://x.example/a.png" });
    await addText(owner, A, "a.meltemi", "text");

    const client = await w.open({ sub: "u1", role: "editor", name: "Beto" });

    const hello = client.hello as Record<string, unknown>;
    expect(hello).toMatchObject({
      role: "editor",
      revision: 1,
      collisions: [],
      you: { sub: "u1", name: "Beto", picture: "" },
      limits: {
        files: 2000,
        documentBytes: 16 * 1024 * 1024,
        textCharacters: 2 * 1024 * 1024,
        message: 512 * 1024,
        clients: 20,
      },
    });
    expect((hello["you"] as { id: string }).id).toMatch(/^c\d+$/);
    expect(client.messages.map((message) => message.kind)).toEqual([KIND.hello, KIND.sync]);
    expect(client.roomVector).toEqual(Y.encodeStateVector(owner.doc));
  });

  it("lists the collisions in hello", async () => {
    const w = await setup();
    const first = await w.open();
    const second = await w.open();
    await addText(first, B, "a.meltemi", "from b");
    await addText(second, A, "a.meltemi", "from a");

    const third = await w.open();

    expect(third.hello?.["collisions"]).toEqual([
      { path: "a.meltemi", keeper: A, id: B, shown: `a.meltemi~${B}` },
    ]);
  });

  it("answers a state vector with what the client lacks, and an up to date client with nothing new", async () => {
    const w = await setup();
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "hello");
    await addText(owner, B, "b.meltemi", "world");

    const fresh = await w.open();
    await fresh.sync();
    const answers = fresh.of(KIND.update);
    expect(answers).toHaveLength(1);
    expect(snapshot(fresh.cloud).files).toEqual({ "a.meltemi": "hello", "b.meltemi": "world" });

    await fresh.sync();
    expect(fresh.of(KIND.update)).toHaveLength(2);
    expect(snapshot(fresh.cloud).files).toEqual({ "a.meltemi": "hello", "b.meltemi": "world" });
    expect((await held(w)).revision).toBe(2);
  });

  it("applies an update, bumps the revision, persists it and tells every other client", async () => {
    const w = await setup();
    const sender = await w.open();
    const other = await w.open();
    const another = await w.open();

    await addText(sender, A, "a.meltemi", "news");

    expect(textOf(other, A)).toBe("news");
    expect(textOf(another, A)).toBe("news");
    // The sender is not told what it sent.
    expect(sender.of(KIND.update)).toHaveLength(0);
    expect((await held(w)).revision).toBe(1);
    await w.rooms.advance(0);
    expect(w.room.storage.revision).toBe(1);
  });

  it("converges two devices that edit different lines of one file, and counts both transactions", async () => {
    const w = await setup();
    const phone = await w.open();
    const laptop = await w.open();
    await addText(phone, A, "a.meltemi", "line one\nline two\nline three\n");
    expect(textOf(laptop, A)).toBe("line one\nline two\nline three\n");
    const revision = (await held(w)).revision;

    // Both edit before either has seen the other's change.
    const onPhone = phone.edit((c) => (c.files.get(A) as Y.Text).insert(0, "PHONE "));
    const onLaptop = laptop.edit((c) => {
      const text = c.files.get(A) as Y.Text;
      text.insert(text.length, "LAPTOP\n");
    });
    await Promise.all([onPhone, onLaptop]);

    const expected = "PHONE line one\nline two\nline three\nLAPTOP\n";
    expect(textOf(phone, A)).toBe(expected);
    expect(textOf(laptop, A)).toBe(expected);
    expect((await held(w)).files["a.meltemi"]).toBe(expected);
    expect((await held(w)).revision).toBe(revision + 2);
  });

  it("does not count an update it already has: no revision, no broadcast, no write", async () => {
    const w = await setup();
    const sender = await w.open();
    const other = await w.open();
    const update = await addText(sender, A, "a.meltemi", "once");
    await w.rooms.advance(5 * SECOND);
    const saves = w.room.storage.saves.length;
    const heard = other.of(KIND.update).length;

    await sender.send(frame(KIND.update, update));
    await w.rooms.advance(5 * SECOND);

    expect((await held(w)).revision).toBe(1);
    expect(other.of(KIND.update)).toHaveLength(heard);
    expect(w.room.storage.saves).toHaveLength(saves);
  });

  it("lets a client send what the room lacks, from the state vector the room gave it", async () => {
    const w = await setup();
    const client = await w.open();
    // An offline edit: the client changes its document without telling the room.
    client.doc.transact(() => {
      const text = new Y.Text();
      client.cloud.files.set(A, text);
      text.insert(0, "written offline");
      client.cloud.paths.set(A, "offline.meltemi");
    });
    expect((await held(w)).files).toEqual({});

    await client.push();

    expect((await held(w)).files).toEqual({ "offline.meltemi": "written offline" });
  });

  it("tells a client that waits for what it depends on what the room holds", async () => {
    const w = await setup();
    const client = await w.open();
    // Two local changes; the first never reached the room.
    client.doc.transact(() => {
      const text = new Y.Text();
      client.cloud.files.set(A, text);
      text.insert(0, "first");
      client.cloud.paths.set(A, "a.meltemi");
    });
    const before = client.messages.length;
    await typeInto(client, A, " second");

    expect((await held(w)).files).toEqual({});
    expect(client.messages.slice(before).filter((m) => m.kind === KIND.sync)).toHaveLength(1);
    await client.push();
    expect((await held(w)).files).toEqual({ "a.meltemi": "first second" });
    expect((await held(w)).revision).toBe(1);
  });

  it("always answers a sync with a kind 1, even when the update has nothing in it: a client with no copy waits for that answer", async () => {
    const w = await setup();
    // The room is empty and the client has no copy: there is nothing to send, and it is answered.
    const first = await w.open();
    await first.sync();
    expect(first.of(KIND.update)).toHaveLength(1);
    const empty = first.of(KIND.update)[0]?.payload as Uint8Array;
    const probe = new Y.Doc();
    Y.applyUpdate(probe, empty);
    expect(Y.decodeUpdate(empty).structs).toEqual([]);
    expect(snapshot(probe)).toEqual({ files: {}, binaries: {}, collisions: [] });

    // A client that already has everything is answered too, and every sync gets exactly one answer.
    await addText(first, A, "a.meltemi", "text");
    await first.sync();
    await first.sync();
    const answers = first.of(KIND.update);
    expect(answers).toHaveLength(3);
    for (const answer of answers.slice(1)) {
      expect(Y.decodeUpdate(answer.payload).structs).toEqual([]);
    }

    // And a client that has nothing, in a room that has something, gets all of it.
    const second = await w.open();
    await second.sync();
    expect(second.of(KIND.update)).toHaveLength(1);
    expect(textOf(second, A)).toBe("text");
  });

  it("applies an update that adds nothing idempotently, whole or in part: no revision, no write, no broadcast for what is known", async () => {
    const w = await setup();
    const sender = await w.open();
    const other = await w.open();
    await addText(sender, A, "a.meltemi", "known ");
    await w.rooms.advance(5 * SECOND);
    const saves = w.room.storage.saves.length;
    const heard = other.of(KIND.update).length;

    // Everything the sender holds, again: all of it is known.
    await sender.send(frame(KIND.update, Y.encodeStateAsUpdate(sender.doc)));
    await sender.send(frame(KIND.update, Y.encodeStateAsUpdate(sender.doc)));
    await w.rooms.advance(5 * SECOND);
    expect((await held(w)).revision).toBe(1);
    expect(other.of(KIND.update)).toHaveLength(heard);
    expect(w.room.storage.saves).toHaveLength(saves);

    // The same again with one new character in it: one transaction, and the others are told only
    // of the new character, not of what they have.
    sender.doc.transact(() => (sender.cloud.files.get(A) as Y.Text).insert(6, "new"));
    await sender.send(frame(KIND.update, Y.encodeStateAsUpdate(sender.doc)));
    expect((await held(w)).revision).toBe(2);
    expect(textOf(other, A)).toBe("known new");
    const told = other.of(KIND.update).slice(heard);
    expect(told).toHaveLength(1);
    expect((told[0]?.payload.length as number) < 40).toBe(true);
    await w.rooms.advance(5 * SECOND);
    expect(w.room.storage.saves).toHaveLength(saves + 1);
  });

  it("sends its own state vector after hello, and a client that answers with the difference sends only what the room lacks", async () => {
    const w = await setup();
    const device = await w.open();
    await addText(device, A, "big.meltemi", "x".repeat(200_000));
    await device.leave();

    // The device keeps its copy offline, edits it, and comes back: the room tells it what it holds.
    const held0 = Y.encodeStateVector(device.doc);
    device.doc.transact(() => (device.cloud.files.get(A) as Y.Text).insert(100_000, "OFFLINE"));
    const back = await w.open({}, device.doc);
    expect(back.messages.map((message) => message.kind).slice(0, 2)).toEqual([
      KIND.hello,
      KIND.sync,
    ]);
    // What the room holds is what the device had before it edited offline.
    expect(back.roomVector).toEqual(held0);

    const whole = Y.encodeStateAsUpdate(back.doc).length;
    const difference = Y.encodeStateAsUpdate(back.doc, back.roomVector).length;
    expect(whole).toBeGreaterThan(200_000);
    expect(difference).toBeLessThan(100);

    await back.push();
    const read = await held(w);
    expect(read.files["big.meltemi"]).toHaveLength(200_007);
    expect(read.files["big.meltemi"]?.slice(99_990, 100_010)).toContain("OFFLINE");
    expect(read.revision).toBe(2);
  });

  it("ignores an awareness message that is not a state: it neither answers nor reaches anybody", async () => {
    const w = await setup();
    const sender = await w.open();
    const other = await w.open();
    const heard = other.messages.length;

    await sender.send(frame(KIND.awareness, new Uint8Array([1, 2, 3])));

    expect(sender.closed).toBeUndefined();
    expect(other.messages).toHaveLength(heard);
    expect((await held(w)).revision).toBe(0);
  });

  const MALFORMED: [string, () => Uint8Array | string][] = [
    ["an empty message", () => new Uint8Array(0)],
    ["a text frame", () => "hello"],
    ["an unknown kind", () => frame(9, new Uint8Array([1]))],
    ["kind 3 from a client", () => frame(KIND.hello, new TextEncoder().encode("{}"))],
    ["kind 4 from a client", () => frame(KIND.error, new TextEncoder().encode("{}"))],
    [
      "an update that is not one",
      () => frame(KIND.update, new Uint8Array([255, 255, 255, 255, 255])),
    ],
    ["an update cut short", () => frame(KIND.update, new Uint8Array([1, 2, 3, 4, 5]))],
    [
      "a state vector that is not one",
      () => frame(KIND.sync, new Uint8Array([255, 255, 255, 255])),
    ],
    ["a state vector that is empty", () => frame(KIND.sync, new Uint8Array(0))],
  ];

  it.each(MALFORMED)(
    "closes the socket of a client that sends %s, with doc.invalid, and keeps the document",
    async (_name, message) => {
      const w = await setup();
      const owner = await w.open();
      await addText(owner, A, "a.meltemi", "safe");
      const other = await w.open();
      await other.sync();
      const before = await held(w);
      const culprit = await w.open();

      await culprit.send(message());

      expect(culprit.errors).toEqual(["doc.invalid"]);
      expect(culprit.closed).toEqual({ code: 4400, reason: "doc.invalid" });
      expect(await held(w)).toEqual(before);
      // The others are not told and carry on.
      expect(other.closed).toBeUndefined();
      await typeInto(other, A, " still");
      expect((await held(w)).files["a.meltemi"]).toBe("safe still");
      expect(textOf(owner, A)).toBe("safe still");
    },
  );

  it("ignores what a closed client still sends", async () => {
    const w = await setup();
    const culprit = await w.open();
    await culprit.send("text");
    expect(culprit.errors).toEqual(["doc.invalid"]);

    await addText(culprit, A, "a.meltemi", "late");
    await culprit.send(frame(KIND.sync, Y.encodeStateVector(culprit.doc)));

    expect(culprit.errors).toEqual(["doc.invalid"]);
    expect((await held(w)).files).toEqual({});
  });

  it("closes a viewer that sends an update with access.denied, and lets a viewer read", async () => {
    const w = await setup();
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "text");
    const viewer = await w.open({ sub: "u2", role: "viewer" });

    // A viewer syncs and is told what changes.
    await viewer.sync();
    expect(textOf(viewer, A)).toBe("text");
    await typeInto(owner, A, "!");
    expect(textOf(viewer, A)).toBe("text!");
    expect(viewer.hello?.["role"]).toBe("viewer");

    await typeInto(viewer, A, " vandalism");

    expect(viewer.errors).toEqual(["access.denied"]);
    expect(viewer.closed).toEqual({ code: 4403, reason: "access.denied" });
    expect((await held(w)).files["a.meltemi"]).toBe("text!");
    expect(textOf(owner, A)).toBe("text!");
    expect((await held(w)).revision).toBe(2);
  });

  it("closes a client whose message is over 512 KiB with message.too-large, and accepts one at the limit", async () => {
    const w = await setup();
    const client = await w.open();

    // An update of nothing but zeros is an empty one with padding: harmless, whatever its size.
    await client.send(frame(KIND.update, new Uint8Array(512 * 1024 - 1)));
    expect(client.closed).toBeUndefined();

    await client.send(frame(KIND.update, new Uint8Array(512 * 1024)));
    expect(client.errors).toEqual(["message.too-large"]);
    expect(client.closed).toEqual({ code: 4413, reason: "message.too-large" });
  });

  it("admits twenty clients and refuses the 21st with room.full, until one leaves", async () => {
    const w = await setup();
    const clients: RoomClient[] = [];
    for (let i = 0; i < 20; i++) clients.push(await w.open({ sub: `u${i}` }));
    expect(clients.every((client) => client.hello !== undefined && !client.closed)).toBe(true);

    const refused = await w.open({ sub: "u20" });

    expect(refused.errors).toEqual(["room.full"]);
    expect(refused.closed).toEqual({ code: 4409, reason: "room.full" });
    expect(refused.hello).toBeUndefined();
    expect(w.room.core.stats().clients).toBe(20);
    // It is told nothing, and nobody else is disturbed.
    await addText(clients[0] as RoomClient, A, "a.meltemi", "x");
    expect(textOf(clients[19] as RoomClient, A)).toBe("x");
    expect(refused.of(KIND.update)).toHaveLength(0);

    await (clients[5] as RoomClient).leave();
    const admitted = await w.open({ sub: "u21" });
    expect(admitted.hello).toBeDefined();
    expect(admitted.closed).toBeUndefined();
  });

  it("does not let a room full of viewers keep the owner and the editors out: one of the viewers gives up its place", async () => {
    const w = await setup({ limits: { clients: 3 } });
    const first = await w.open({ sub: "reader-1", role: "viewer" });
    const second = await w.open({ sub: "reader-2", role: "viewer" });
    const third = await w.open({ sub: "reader-3", role: "viewer" });

    const editor = await w.open({ sub: "editor", role: "editor" });

    // The newest viewer lost its place, as if it had come last; nobody else was disturbed.
    expect(editor.hello).toBeDefined();
    expect(editor.closed).toBeUndefined();
    expect(third.errors).toEqual(["room.full"]);
    expect(third.closed).toEqual({ code: 4409, reason: "room.full" });
    expect([first.closed, second.closed]).toEqual([undefined, undefined]);
    expect(w.room.core.stats().clients).toBe(3);

    // The owner takes the place of another; a viewer is still refused when the room is full.
    const owner = await w.open({ sub: "owner", role: "owner" });
    expect(owner.hello).toBeDefined();
    expect(second.closed).toEqual({ code: 4409, reason: "room.full" });
    const late = await w.open({ sub: "reader-4", role: "viewer" });
    expect(late.errors).toEqual(["room.full"]);
    expect(first.closed).toBeUndefined();
  });

  it("takes the place from the account that holds the most sockets, so that one account cannot keep a room full", async () => {
    const w = await setup({ limits: { clients: 4 } });
    const polite = await w.open({ sub: "polite", role: "viewer" });
    const hogs = [];
    for (let i = 0; i < 3; i++) hogs.push(await w.open({ sub: "hog", role: "viewer" }));

    const editor = await w.open({ sub: "editor", role: "editor" });

    expect(editor.hello).toBeDefined();
    expect(polite.closed).toBeUndefined();
    expect(hogs.map((client) => client.closed?.code)).toEqual([undefined, undefined, 4409]);
  });

  it("refuses a person who can write when nobody in a full room is a viewer", async () => {
    const w = await setup({ limits: { clients: 2 } });
    const owner = await w.open({ sub: "owner", role: "owner" });
    const editor = await w.open({ sub: "editor", role: "editor" });

    const another = await w.open({ sub: "another", role: "editor" });

    expect(another.errors).toEqual(["room.full"]);
    expect(another.closed).toEqual({ code: 4409, reason: "room.full" });
    expect([owner.closed, editor.closed]).toEqual([undefined, undefined]);
  });

  it("does not take a refused client for the last one leaving", async () => {
    const w = await setup({ limits: { clients: 1 } });
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "x");
    await w.rooms.advance(0);
    await typeInto(owner, A, "y");
    const saves = w.room.storage.saves.length;
    const refused = await w.open();
    expect(refused.errors).toEqual(["room.full"]);
    await w.rooms.advance(0);

    expect(w.room.storage.saves).toHaveLength(saves);
    expect(w.room.materialised).toHaveLength(0);
  });

  it("goes on when a client disconnects in the middle of a sync", async () => {
    const w = await setup();
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "text");
    const leaving = await w.open();

    // The socket is gone before the room answers: the answer goes nowhere and nothing breaks.
    leaving.connection.broken = true;
    await leaving.sync();
    await leaving.leave();

    await typeInto(owner, A, "!");
    expect((await held(w)).files["a.meltemi"]).toBe("text!");
    const stayer = await w.open();
    await stayer.sync();
    expect(textOf(stayer, A)).toBe("text!");
  });

  it("keeps two rooms apart: each has its own document, revision, storage and clients", async () => {
    const w = await setup();
    const store = w.store;
    const other = "01h2x5z8kq3m7n9p2r4u";
    await store.createProject(
      {
        id: other,
        ownerSub: "u1",
        name: "Other",
        description: "",
        createdAt: w.clock.now().toISOString(),
      },
      100,
    );
    const here = await w.open();
    const there = await w.rooms.room(other).open();

    await addText(here, A, "here.meltemi", "in the first");
    await addText(there, B, "there.meltemi", "in the second");
    await w.rooms.advance(5 * SECOND);

    expect((await w.rooms.read(PROJECT)).files).toEqual({ "here.meltemi": "in the first" });
    expect((await w.rooms.read(other)).files).toEqual({ "there.meltemi": "in the second" });
    expect(here.of(KIND.update)).toHaveLength(0);
    expect(there.of(KIND.update)).toHaveLength(0);
    expect(w.room.storage.saves.length).toBeGreaterThan(0);
    expect(w.rooms.room(other).storage).not.toBe(w.room.storage);
    expect(w.rooms.room(other).storage.revision).toBe(1);
    await w.rooms.destroy(other);
    expect((await w.rooms.read(PROJECT)).files).toEqual({ "here.meltemi": "in the first" });
  });
});

describe("a transaction that breaks a rule", () => {
  /** What every refusal leaves: the document as it was, the revision, the storage, the others. */
  async function expectRolledBack(
    w: World,
    culprit: RoomClient,
    others: RoomClient[],
    before: Awaited<ReturnType<typeof held>>,
    code: string,
    close: number,
  ): Promise<void> {
    expect(culprit.errors).toEqual([code]);
    expect(culprit.closed).toEqual({ code: close, reason: code });
    expect(await held(w)).toEqual(before);
    expect(await stored(w)).toEqual({
      files: before.files,
      binaries: before.binaries,
      collisions: before.collisions,
    });
    for (const other of others) expect(other.closed).toBeUndefined();
    // The room is still a room: a good change from somebody else goes through.
    const keeper = others[0] as RoomClient;
    await typeInto(keeper, A, "+");
    expect((await held(w)).files["a.meltemi"]).toBe(`${before.files["a.meltemi"]}+`);
    expect((await held(w)).revision).toBe(before.revision + 1);
    for (const other of others) expect(textOf(other, A)).toBe(`${before.files["a.meltemi"]}+`);
  }

  async function start(): Promise<{
    w: World;
    owner: RoomClient;
    culprit: RoomClient;
    before: Awaited<ReturnType<typeof held>>;
  }> {
    const w = await setup();
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "the original");
    await typeInto(owner, A, " text");
    const culprit = await w.open();
    await culprit.sync();
    const before = await held(w);
    return { w, owner, culprit, before };
  }

  it("rolls back an update that would make a text exceed 2 Mi characters, in messages of 400 000 characters", async () => {
    const w = await setup();
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "");
    const writer = await w.open();
    await writer.sync();

    // Five messages of 400 000 characters fit (2 000 000); the sixth would make 2 400 000.
    for (let i = 0; i < 5; i++) await typeInto(writer, A, "x".repeat(400_000));
    expect(writer.closed).toBeUndefined();
    const before = await held(w);
    expect(before.files["a.meltemi"]).toHaveLength(2_000_000);

    await typeInto(writer, A, "x".repeat(400_000));

    expect(writer.errors).toEqual(["doc.too-large"]);
    expect(writer.closed).toEqual({ code: 4413, reason: "doc.too-large" });
    expect(await held(w)).toEqual(before);
    expect(textOf(owner, A)).toHaveLength(2_000_000);
    expect((await stored(w)).files["a.meltemi"]).toHaveLength(2_000_000);
    // 97 152 more characters (up to exactly 2 Mi) are still fine from someone else.
    await typeInto(owner, A, "y".repeat(2 * 1024 * 1024 - 2_000_000));
    expect(owner.closed).toBeUndefined();
    expect((await held(w)).files["a.meltemi"]).toHaveLength(2 * 1024 * 1024);
  });

  it.each(["../secrets.meltemi", ".git/hooks/post-checkout"])(
    "rolls back a rename to %s, and the same path on a new file, with path.invalid",
    async (path) => {
      const { w, owner, culprit, before } = await start();
      const renamed = culprit;
      await renamed.edit((c) => c.paths.set(A, path));
      await expectRolledBack(w, renamed, [owner], before, "path.invalid", 4400);

      const added = await w.open();
      await added.sync();
      const beforeAdd = await held(w);
      await addText(added, B, path, "evil");
      expect(added.errors).toEqual(["path.invalid"]);
      expect(added.closed).toEqual({ code: 4400, reason: "path.invalid" });
      expect(await held(w)).toEqual(beforeAdd);
    },
  );

  it("rolls back a binary with a hash the project never uploaded with blob.unknown, and keeps one it did", async () => {
    const { w, owner, culprit, before } = await start();

    await culprit.edit((c) => {
      c.binaries.set(B, UNKNOWN_HASH);
      c.paths.set(B, "assets/logo.png");
    });
    await expectRolledBack(w, culprit, [owner], before, "blob.unknown", 4400);

    const good = await w.open();
    await good.sync();
    await good.edit((c) => {
      c.binaries.set(C, HASH);
      c.paths.set(C, "assets/logo.png");
    });
    expect(good.closed).toBeUndefined();
    expect((await held(w)).binaries).toEqual({ "assets/logo.png": HASH });
    expect(owner.cloud.binaries.get(C)).toBe(HASH);
  });

  it.each([
    [
      "a Y.Map where a text belongs",
      (c: RoomClient["cloud"]) => {
        c.files.set(B, new Y.Map());
        c.paths.set(B, "b.meltemi");
      },
    ],
    [
      "a file that has no path",
      (c: RoomClient["cloud"]) => {
        c.files.set(B, new Y.Text());
      },
    ],
    [
      "a path that is no string",
      (c: RoomClient["cloud"]) => {
        c.files.set(B, new Y.Text());
        c.paths.set(B, 42);
      },
    ],
    [
      "a hash that is not 64 lowercase hex",
      (c: RoomClient["cloud"]) => {
        c.binaries.set(B, "ABC");
        c.paths.set(B, "b.png");
      },
    ],
    [
      "an id that is both a text and a binary",
      (c: RoomClient["cloud"]) => {
        c.files.set(B, new Y.Text());
        c.binaries.set(B, HASH);
        c.paths.set(B, "b.png");
      },
    ],
    [
      "a path removed under a file that stays",
      (c: RoomClient["cloud"]) => {
        c.paths.delete(A);
      },
    ],
  ])("rolls back %s with doc.invalid", async (_name, change) => {
    const { w, owner, culprit, before } = await start();
    await culprit.edit(change);
    await expectRolledBack(w, culprit, [owner], before, "doc.invalid", 4400);
  });

  it("rolls back a root type of its own with doc.invalid", async () => {
    const { w, owner, culprit, before } = await start();
    const rogue = new Y.Doc();
    rogue.getMap("secrets").set("k", "v");

    await culprit.send(frame(KIND.update, Y.encodeStateAsUpdate(rogue)));

    await expectRolledBack(w, culprit, [owner], before, "doc.invalid", 4400);
  });

  it("rolls back the 2001st file with quota.files", async () => {
    const w = await setup();
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "keep");
    const writer = await w.open();
    await writer.sync();
    const before = await held(w);
    // Sixteen letters a to z, counting in base 26 (valid file ids), none of them the owner's `A`.
    const fileId = (n: number): string => {
      let id = "";
      for (let k = 0; k < 16; k++, n = Math.floor(n / 26)) id += String.fromCharCode(97 + (n % 26));
      return id;
    };
    const ids = Array.from({ length: 2000 }, (_, i) => fileId(i + 100));

    // 1999 more files make 2000, which is allowed...
    await writer.edit((c) => {
      for (const id of ids.slice(0, 1999)) {
        c.files.set(id, new Y.Text());
        c.paths.set(id, `files/${id}.md`);
      }
    });
    expect(writer.closed).toBeUndefined();
    expect(Object.keys((await held(w)).files)).toHaveLength(2000);

    // ... and one more is not.
    await writer.edit((c) => {
      c.files.set(ids[1999] as string, new Y.Text());
      c.paths.set(ids[1999] as string, "files/one-too-many.md");
    });
    expect(writer.errors).toEqual(["quota.files"]);
    expect(writer.closed).toEqual({ code: 4413, reason: "quota.files" });
    expect(Object.keys((await held(w)).files)).toHaveLength(2000);
    expect((await held(w)).revision).toBe(before.revision + 1);
  });

  it("rolls back a change that would make the encoded document too large, with doc.too-large", async () => {
    const w = await setup({ limits: { documentBytes: 3_000 } });
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "small");
    const writer = await w.open();
    await writer.sync();
    const before = await held(w);

    await typeInto(writer, A, "z".repeat(4_000));

    expect(writer.errors).toEqual(["doc.too-large"]);
    expect(writer.closed).toEqual({ code: 4413, reason: "doc.too-large" });
    expect(await held(w)).toEqual(before);
    expect((await stored(w)).files).toEqual({ "a.meltemi": "small" });
  });

  it("measures the document when the updates it has seen add up to the limit, and does not refuse one that fits", async () => {
    // Every update of a character typed and deleted is a few bytes and the document stays tiny:
    // the sum of the updates passes the limit long before the document does.
    const w = await setup({ limits: { documentBytes: 3_000 } });
    const client = await w.open();
    await addText(client, A, "a.meltemi", "x");
    const text = client.cloud.files.get(A) as Y.Text;

    for (let i = 0; i < 600; i++) {
      await client.edit(() => text.insert(1, "a"));
      await client.edit(() => text.delete(1, 1));
    }

    expect(client.closed).toBeUndefined();
    expect((await held(w)).files).toEqual({ "a.meltemi": "x" });
    expect((await held(w)).revision).toBe(1201);
    expect((await stored(w)).files).toEqual({ "a.meltemi": "x" });
  });

  it("rolls back several updates' worth: the log of committed updates replays, the bad one does not", async () => {
    const w = await setup();
    const owner = await w.open();
    await addText(owner, A, "a.meltemi", "");
    await w.rooms.advance(0);
    // Three good updates inside one write window, then a bad one, then a good one.
    await typeInto(owner, A, "one ");
    await typeInto(owner, A, "two ");
    const other = await w.open();
    await other.sync();
    await typeInto(other, A, "three ");
    const culprit = await w.open();
    await culprit.sync();
    await culprit.edit((c) => c.paths.set(A, "..\\bad.meltemi"));
    expect(culprit.closed?.code).toBe(4400);

    await typeInto(owner, A, "four");

    expect((await held(w)).files).toEqual({ "a.meltemi": "one two three four" });
    expect((await held(w)).revision).toBe(5);
    expect((await stored(w)).files).toEqual({ "a.meltemi": "one two three four" });
    // And a room built again from storage holds the same.
    w.room.evict();
    expect((await held(w)).files).toEqual({ "a.meltemi": "one two three four" });
  });

  it("makes a rename one small change of paths: under 1 KiB for a 1 Mi-character file, the same Y.Text", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "docs/long.md", "");
    // 1 Mi characters, in messages the room accepts.
    const text = client.cloud.files.get(A) as Y.Text;
    for (let i = 0; i < 3; i++) await typeInto(client, A, "m".repeat(349_000));
    await typeInto(client, A, "m".repeat(1024 * 1024 - 3 * 349_000));
    expect(text.length).toBe(1024 * 1024);
    expect(client.closed).toBeUndefined();
    const other = await w.open();
    await other.sync();
    const otherText = other.cloud.files.get(A);

    const update = await client.edit((c) => c.paths.set(A, "docs/renamed.md"));

    expect(update.length).toBeLessThan(1024);
    expect(client.cloud.files.get(A)).toBe(text);
    expect(other.cloud.files.get(A)).toBe(otherText);
    expect(other.cloud.paths.get(A)).toBe("docs/renamed.md");
    const files = (await held(w)).files;
    expect(Object.keys(files)).toEqual(["docs/renamed.md"]);
    expect(files["docs/renamed.md"]).toHaveLength(1024 * 1024);
    // The text never moved: a concurrent edit of it merges with the rename.
    await typeInto(other, A, "!");
    expect(textOf(client, A)).toHaveLength(1024 * 1024 + 1);
  });
});
