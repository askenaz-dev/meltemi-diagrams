import { describe, expect, it } from "vitest";
import { KIND } from "../src/room-protocol.js";
import { fakeClock, memoryStore } from "./support/index.js";
import { A, HASH, PROJECT, addText, typeInto, world } from "./support/rooms.js";

async function setup(durableUpdates = false) {
  return world({ clock: fakeClock(), store: memoryStore(), durableUpdates });
}

describe("acknowledged room durability", () => {
  it("preserves rapid API pushes and binaries through immediate reconstruction without timers", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "notes.txt": "seed" } });
    await w.rooms.push(PROJECT, { binaries: { "assets/pixel.png": HASH }, ifRevision: 1 });
    await w.rooms.push(PROJECT, { files: { "notes.txt": "acknowledged" }, ifRevision: 2 });
    const before = await w.rooms.read(PROJECT);
    expect(before.revision).toBe(3);
    w.room.evict();
    expect(await w.rooms.read(PROJECT)).toEqual(before);
  });

  it("preserves an API restore immediately, including removals", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "notes.txt": "old", "removed.txt": "remove" } });
    await w.rooms.restore(PROJECT, { "notes.txt": "restored" }, { "assets/pixel.png": HASH }, 1);
    const restored = await w.rooms.read(PROJECT);
    w.room.evict();
    expect(await w.rooms.read(PROJECT)).toEqual(restored);
    expect(restored.files).toEqual({ "notes.txt": "restored" });
  });

  it.each(["push", "restore"] as const)(
    "refuses a failed %s save before revision/broadcast and retries with the original revision",
    async (operation) => {
      const w = await setup();
      await w.rooms.push(PROJECT, { files: { "notes.txt": "kept" } });
      const peer = await w.open();
      const before = await w.rooms.read(PROJECT);
      const updates = peer.of(KIND.update).length;
      w.room.storage.failures = 1;
      const write = () =>
        operation === "push"
          ? w.rooms.push(PROJECT, { files: { "notes.txt": "new" }, ifRevision: before.revision })
          : w.rooms.restore(PROJECT, { "notes.txt": "new" }, {}, before.revision);
      await expect(write()).rejects.toMatchObject({ code: "internal" });
      expect(await w.rooms.read(PROJECT)).toEqual(before);
      expect(peer.of(KIND.update)).toHaveLength(updates);
      await write();
      w.room.evict();
      expect((await w.rooms.read(PROJECT)).files["notes.txt"]).toBe("new");
      expect((await w.rooms.read(PROJECT)).revision).toBe(before.revision + 1);
    },
  );

  it("keeps accepted hosted socket changes when a later API save fails", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "notes.txt", "accepted socket text");
    const before = await w.rooms.read(PROJECT);
    w.room.storage.failures = 1;
    await expect(
      w.rooms.push(PROJECT, { files: { "other.txt": "refused" }, ifRevision: before.revision }),
    ).rejects.toMatchObject({ code: "internal" });
    expect(await w.rooms.read(PROJECT)).toEqual(before);
    await w.rooms.advance(0);
    w.room.evict();
    expect(await w.rooms.read(PROJECT)).toEqual(before);
  });

  it("checkpoints hosted socket state before a positive materialisation/version boundary", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "notes.txt", "version content");
    const before = await w.rooms.read(PROJECT);
    w.room.storage.failures = 1;
    expect(await w.room.core.materialiseNow()).toBe(false);
    expect(w.room.materialised).toHaveLength(0);
    expect(await w.room.core.materialiseNow()).toEqual({ revision: before.revision });
    w.room.evict();
    expect(await w.rooms.read(PROJECT)).toEqual(before);
  });
});

describe("the local room's constructor policy", () => {
  it("commits every local socket update before immediate reconstruction, without advancing timers", async () => {
    const w = await setup(true);
    const client = await w.open();
    await addText(client, A, "notes.txt", "first");
    await typeInto(client, A, " second");
    const before = await w.rooms.read(PROJECT);
    expect(w.room.storage.saves).toHaveLength(2);
    w.room.evict();
    expect(await w.rooms.read(PROJECT)).toEqual(before);
  });

  it("refuses and rolls back a local socket update when storage fails", async () => {
    const w = await setup(true);
    await w.rooms.push(PROJECT, { files: { "kept.txt": "persisted" } });
    const sender = await w.open();
    const peer = await w.open();
    const before = await w.rooms.read(PROJECT);
    const updates = peer.of(KIND.update).length;
    w.room.storage.failures = 1;
    await addText(sender, A, "refused.txt", "not published");
    expect(sender.closed?.code).toBeGreaterThanOrEqual(4000);
    expect(peer.of(KIND.update)).toHaveLength(updates);
    expect(await w.rooms.read(PROJECT)).toEqual(before);
    w.room.evict();
    expect(await w.rooms.read(PROJECT)).toEqual(before);
  });
});
