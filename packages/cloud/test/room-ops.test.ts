// The room's operations for the Worker (`cloud-document`, "Reads and pushes through the room",
// "Materialisation to content-addressed files" and "Rows written stay bounded"): reads, pushes with
// a revision check, restores, materialisation, destroy, the development counters and the cut. They
// are called through `memoryRooms()`, so each answer is the `ApiError` the Worker would get.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { ApiError } from "../src/errors.js";
import type { MaterialiseInput } from "../src/materialise.js";
import { MATERIALISE_DELAY_MS } from "../src/room-core.js";
import type { PushRequest } from "../src/rooms.js";
import { KIND } from "../src/room-protocol.js";
import { fakeClock, memoryStore } from "./support/index.js";
import {
  A,
  B,
  HASH,
  OTHER_PROJECT,
  PROJECT,
  UNKNOWN_HASH,
  addText,
  textOf,
  typeInto,
  world,
  type World,
} from "./support/rooms.js";

const SECOND = 1000;

type Behaviour = (input: MaterialiseInput) => Promise<{ rowsWritten: number } | "gone">;

/** A world whose `materialise()` does what the test says, and records what it was given. */
async function setup(
  options: { materialise?: Behaviour; limits?: Parameters<typeof world>[0]["limits"] } = {},
): Promise<World> {
  return world({
    clock: fakeClock(),
    store: memoryStore(),
    ...(options.materialise ? { materialise: options.materialise } : {}),
    ...(options.limits ? { limits: options.limits } : {}),
  });
}

/** The rejection of a promise, so that a test can look at it. */
async function refusal(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the room to refuse");
}

describe("reading the files", () => {
  it("answers the latest revision, files, binaries and collisions, by path", async () => {
    const w = await setup();
    const first = await w.open();
    const second = await w.open();
    await addText(first, A, "diagrams/a.meltemi", "diagram a");
    await addText(second, B, "diagrams/a.meltemi", "the other a");
    await first.edit((c) => {
      c.binaries.set("cccccccccccccccc", HASH);
      c.paths.set("cccccccccccccccc", "assets/logo.png");
    });

    const read = await w.rooms.read(PROJECT);

    expect(read).toEqual({
      revision: 3,
      files: { "diagrams/a.meltemi": "diagram a", [`diagrams/a.meltemi~${B}`]: "the other a" },
      binaries: { "assets/logo.png": HASH },
      collisions: [
        { path: "diagrams/a.meltemi", keeper: A, id: B, shown: `diagrams/a.meltemi~${B}` },
      ],
    });
  });

  it("is empty at revision 0 for a room nobody has written to", async () => {
    const w = await setup();
    expect(await w.rooms.read(PROJECT)).toEqual({
      revision: 0,
      files: {},
      binaries: {},
      collisions: [],
    });
  });

  it("reads what a client typed a moment ago, before anything was written to storage", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi", "just now");
    expect(w.room.storage.saves).toHaveLength(0);
    expect((await w.rooms.read(PROJECT)).files).toEqual({ "a.meltemi": "just now" });
  });
});

describe("pushing files", () => {
  it("gives a new path a new id and an existing path its own, in one transaction, and counts a revision", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi", "old");

    const pushed = await w.rooms.push(PROJECT, {
      files: { "a.meltemi": "new", "b.md": "fresh" },
      binaries: { "logo.png": HASH },
    });

    expect(pushed).toEqual({ revision: 2 });
    expect(await w.rooms.read(PROJECT)).toMatchObject({
      revision: 2,
      files: { "a.meltemi": "new", "b.md": "fresh" },
      binaries: { "logo.png": HASH },
    });
    // The text kept its id and its Y.Text: the client's own copy of the file edited in place.
    const text = client.cloud.files.get(A);
    expect(textOf(client, A)).toBe("new");
    expect(client.cloud.paths.size).toBe(3);
    expect(client.cloud.files.get(A)).toBe(text);
  });

  it("deletes a file with null, and a push of nothing changes no revision", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi", "a");
    await addText(client, B, "b.meltemi", "b");

    expect(await w.rooms.push(PROJECT, { files: { "a.meltemi": null } })).toEqual({ revision: 3 });
    expect((await w.rooms.read(PROJECT)).files).toEqual({ "b.meltemi": "b" });
    expect(client.cloud.paths.has(A)).toBe(false);

    expect(await w.rooms.push(PROJECT, {})).toEqual({ revision: 3 });
    expect(await w.rooms.push(PROJECT, { files: { "b.meltemi": "b" } })).toEqual({ revision: 3 });
    expect(await w.rooms.push(PROJECT, { files: { "never.meltemi": null } })).toEqual({
      revision: 3,
    });
  });

  it("is seen by a connected client: it receives the update and its text is the pushed one", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "diagrams/a.meltemi", "before");
    const other = await w.open();
    await other.sync();
    const heard = other.of(KIND.update).length;

    await w.rooms.push(PROJECT, {
      files: { "diagrams/a.meltemi": "pushed from the command line" },
    });

    expect(textOf(client, A)).toBe("pushed from the command line");
    expect(textOf(other, A)).toBe("pushed from the command line");
    expect(other.of(KIND.update)).toHaveLength(heard + 1);
    expect(client.of(KIND.update)).toHaveLength(1);
  });

  it("is persisted like any other change", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "stored" } });
    await w.rooms.advance(0);
    expect(w.room.storage.saves).toHaveLength(1);
    expect(w.room.storage.revision).toBe(1);
    w.room.evict();
    expect(await w.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "a.meltemi": "stored" },
    });
  });

  it("is refused with revision.mismatch carrying the current revision when ifRevision is stale, and nothing changes", async () => {
    const w = await setup();
    for (let revision = 1; revision <= 7; revision++) {
      await w.rooms.push(PROJECT, { files: { "a.meltemi": `text ${revision}` } });
    }
    const client = await w.open();
    await client.sync();

    const error = await refusal(
      w.rooms.push(PROJECT, { files: { "a.meltemi": "stale" }, ifRevision: 5 }),
    );

    expect(error.code).toBe("revision.mismatch");
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ revision: 7 });
    expect(await w.rooms.read(PROJECT)).toMatchObject({
      revision: 7,
      files: { "a.meltemi": "text 7" },
    });
    expect(textOf(client, firstId(client))).toBe("text 7");
  });

  it("goes through when ifRevision is the current revision", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "one" } });
    expect(await w.rooms.push(PROJECT, { files: { "a.meltemi": "two" }, ifRevision: 1 })).toEqual({
      revision: 2,
    });
    expect(
      await w.rooms
        .push(PROJECT, { files: { "a.meltemi": "three" }, ifRevision: 0 })
        .catch((error: ApiError) => error.code),
    ).toBe("revision.mismatch");
  });

  it.each([
    "..\\x.meltemi",
    "../x.meltemi",
    ".git/hooks/post-checkout",
    "a//b.meltemi",
    "C:/x.meltemi",
    "",
  ])(
    "is refused with path.invalid for the path %j, and the revision is unchanged",
    async (path) => {
      const w = await setup();
      await w.rooms.push(PROJECT, { files: { "a.meltemi": "kept" } });

      for (const body of [
        { files: { [path]: "x" } },
        { files: { "fine.meltemi": "y", [path]: "x" } },
        { binaries: { [path]: HASH } },
        { files: { [path]: null } },
      ]) {
        const error = await refusal(w.rooms.push(PROJECT, body));
        expect(error.code).toBe("path.invalid");
        expect(error.status).toBe(400);
      }

      expect(await w.rooms.read(PROJECT)).toMatchObject({
        revision: 1,
        files: { "a.meltemi": "kept" },
      });
    },
  );

  it("is refused with blob.unknown for a hash the project never uploaded, and applies nothing", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "kept" } });

    const error = await refusal(
      w.rooms.push(PROJECT, {
        files: { "b.meltemi": "x" },
        binaries: { "ok.png": HASH, "bad.png": UNKNOWN_HASH },
      }),
    );

    expect(error.code).toBe("blob.unknown");
    expect(error.status).toBe(400);
    expect(await w.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "a.meltemi": "kept" },
      binaries: {},
    });
  });

  it("is refused with doc.invalid for a hash that is not a hash and a path that is a text and a binary", async () => {
    const w = await setup();
    expect((await refusal(w.rooms.push(PROJECT, { binaries: { "a.png": "nope" } }))).code).toBe(
      "doc.invalid",
    );
    expect(
      (
        await refusal(
          w.rooms.push(PROJECT, { files: { "a.svg": "<svg/>" }, binaries: { "a.svg": HASH } }),
        )
      ).code,
    ).toBe("doc.invalid");
    // A push that is not even a push (the route never sends one; the room does not trust it).
    expect(
      (await refusal(w.rooms.push(PROJECT, { files: [] } as unknown as PushRequest))).code,
    ).toBe("doc.invalid");
    expect(
      (await refusal(w.rooms.push(PROJECT, { ifRevision: -1 } as unknown as PushRequest))).code,
    ).toBe("doc.invalid");
  });

  it("is rolled back when it would break a limit, and no client hears of it", async () => {
    const w = await setup({ limits: { textCharacters: 50, files: 3 } });
    const client = await w.open();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "ok" } });
    await client.sync();
    const heard = client.of(KIND.update).length;

    expect(
      (await refusal(w.rooms.push(PROJECT, { files: { "a.meltemi": "x".repeat(51) } }))).code,
    ).toBe("doc.too-large");
    expect(
      (await refusal(w.rooms.push(PROJECT, { files: { "b.md": "1", "c.md": "2", "d.md": "3" } })))
        .code,
    ).toBe("quota.files");

    expect(await w.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "a.meltemi": "ok" },
    });
    expect(client.of(KIND.update)).toHaveLength(heard);
    expect(textOf(client, firstId(client))).toBe("ok");
    // The room still takes a push that fits.
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "x".repeat(50) } });
    expect((await w.rooms.read(PROJECT)).revision).toBe(2);
  });

  it("takes pushes and a client's updates one at a time, in the order they came", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi", "");

    await Promise.all([
      typeInto(client, A, "1"),
      w.rooms.push(PROJECT, { files: { "b.meltemi": "pushed" } }),
      typeInto(client, A, "2"),
      w.rooms.push(PROJECT, { files: { "c.meltemi": "pushed too" } }),
    ]);

    const read = await w.rooms.read(PROJECT);
    expect(read.files).toEqual({
      "a.meltemi": "12",
      "b.meltemi": "pushed",
      "c.meltemi": "pushed too",
    });
    expect(read.revision).toBe(5);
  });
});

/** The id of the first file a client holds. */
function firstId(client: { cloud: { paths: Y.Map<unknown> } }): string {
  return [...client.cloud.paths.keys()][0] as string;
}

describe("restoring a version", () => {
  it("makes the room hold exactly the files, tells the clients as one change, and counts a revision", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "keep.meltemi", "before");
    await addText(client, B, "drop.meltemi", "gone");
    const heard = client.of(KIND.update).length;
    const other = await w.open();
    await other.sync();

    const result = await w.rooms.restore(
      PROJECT,
      { "keep.meltemi": "restored", "added.md": "new" },
      { "logo.png": HASH },
    );

    expect(result).toEqual({ revision: 3 });
    expect(await w.rooms.read(PROJECT)).toMatchObject({
      files: { "added.md": "new", "keep.meltemi": "restored" },
      binaries: { "logo.png": HASH },
    });
    expect(client.of(KIND.update)).toHaveLength(heard + 1);
    expect(textOf(client, A)).toBe("restored");
    expect(client.cloud.paths.has(B)).toBe(false);
    expect(textOf(other, A)).toBe("restored");
  });

  it("refuses a path that breaks the rule, a hash the project does not hold and a null, applying nothing", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "kept" } });

    expect((await refusal(w.rooms.restore(PROJECT, { "../x.meltemi": "x" }, {}))).code).toBe(
      "path.invalid",
    );
    expect(
      (await refusal(w.rooms.restore(PROJECT, { "a.meltemi": "x" }, { "a.png": UNKNOWN_HASH })))
        .code,
    ).toBe("blob.unknown");
    expect(
      (
        await refusal(
          w.rooms.restore(PROJECT, { "a.meltemi": null } as unknown as Record<string, string>, {}),
        )
      ).code,
    ).toBe("doc.invalid");

    expect(await w.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "a.meltemi": "kept" },
    });
  });

  it("applies the files only at the revision the caller materialised, and says the revision it is at otherwise", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "kept" } });
    const { revision } = await w.rooms.materialise(PROJECT);
    expect(revision).toBe(1);

    // Somebody types after the materialisation: the restore would delete it, so it is refused.
    await w.rooms.push(PROJECT, { files: { "typed.md": "typed" } });
    const mismatch = await refusal(w.rooms.restore(PROJECT, { "b.md": "b" }, {}, revision));
    expect(mismatch.code).toBe("revision.mismatch");
    expect(mismatch.details).toEqual({ revision: 2 });
    expect((await w.rooms.read(PROJECT)).files).toEqual({
      "a.meltemi": "kept",
      "typed.md": "typed",
    });

    // At the revision it was told to expect, and with none, it applies.
    const again = await w.rooms.materialise(PROJECT);
    expect(again).toEqual({ revision: 2 });
    expect(await w.rooms.restore(PROJECT, { "b.md": "b" }, {}, again.revision)).toEqual({
      revision: 3,
    });
    expect(await w.rooms.restore(PROJECT, { "c.md": "c" }, {})).toEqual({ revision: 4 });
  });
});

describe("materialisation", () => {
  it("runs thirty seconds after the last change, not after the first", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi", "one");
    await w.rooms.advance(20 * SECOND);
    await typeInto(client, A, " two");
    await w.rooms.advance(MATERIALISE_DELAY_MS - 1);
    expect(w.room.materialised).toHaveLength(0);

    await w.rooms.advance(1);

    expect(w.room.materialised).toEqual([
      {
        projectId: PROJECT,
        revision: 2,
        files: { "a.meltemi": "one two" },
        binaries: {},
      },
    ]);
    // Nothing more changed: nothing more is materialised.
    await w.rooms.advance(5 * 60 * SECOND);
    expect(w.room.materialised).toHaveLength(1);
  });

  it("runs when the last client leaves, at once, and not when another client stays", async () => {
    const w = await setup();
    const first = await w.open();
    const second = await w.open();
    await addText(first, A, "a.meltemi", "text");

    await first.leave();
    await w.rooms.advance(0);
    expect(w.room.materialised).toHaveLength(0);

    await second.leave();
    expect(w.room.materialised).toHaveLength(1);
    expect(w.room.materialised[0]).toMatchObject({ revision: 1, files: { "a.meltemi": "text" } });
    // The timer was not left to run it again.
    await w.rooms.advance(MATERIALISE_DELAY_MS * 2);
    expect(w.room.materialised).toHaveLength(1);
  });

  it("is not repeated for a document it already materialised", async () => {
    const w = await setup();
    const client = await w.open();
    await addText(client, A, "a.meltemi", "text");
    await client.leave();
    expect(w.room.materialised).toHaveLength(1);

    const again = await w.open();
    await again.leave();

    expect(w.room.materialised).toHaveLength(1);
  });

  it("runs on demand and tells the caller when it is done; a second call at the same revision does not repeat it", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "one" }, binaries: { "logo.png": HASH } });

    await w.rooms.materialise(PROJECT);

    expect(w.room.materialised).toEqual([
      {
        projectId: PROJECT,
        revision: 1,
        files: { "a.meltemi": "one" },
        binaries: { "logo.png": HASH },
      },
    ]);
    await w.rooms.materialise(PROJECT);
    expect(w.room.materialised).toHaveLength(1);
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "two" } });
    await w.rooms.materialise(PROJECT);
    expect(w.room.materialised).toHaveLength(2);
    expect(w.room.materialised[1]?.files).toEqual({ "a.meltemi": "two" });
  });

  it("leaves the document intact when it fails, logs without the content and tries again at the next trigger", async () => {
    let failing = true;
    const w = await setup({
      materialise: async () => {
        if (failing)
          throw new Error("R2 refused the write of secret-title.meltemi: top secret text");
        return { rowsWritten: 3 };
      },
    });
    const client = await w.open();
    await addText(client, A, "secret-title.meltemi", "top secret text");

    await w.rooms.advance(MATERIALISE_DELAY_MS);

    expect(w.room.materialised).toHaveLength(1);
    expect(w.room.warnings).toEqual(["room: the files could not be materialised"]);
    for (const line of w.room.warnings) {
      expect(line).not.toMatch(/secret|R2|meltemi/);
    }
    expect(await w.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "secret-title.meltemi": "top secret text" },
    });
    expect(client.closed).toBeUndefined();
    expect(await w.rooms.stats(PROJECT)).toMatchObject({
      materialisations: 1,
      materialiseFailures: 1,
      d1RowsWritten: 0,
    });

    // The next trigger: the store works now, and a change makes another thirty seconds.
    failing = false;
    await typeInto(client, A, "!");
    await w.rooms.advance(MATERIALISE_DELAY_MS);
    expect(w.room.materialised).toHaveLength(2);
    expect(await w.rooms.stats(PROJECT)).toMatchObject({
      materialisations: 2,
      materialiseFailures: 1,
      d1RowsWritten: 3,
    });
  });

  it("is retried when the last client leaves after a failure, and on demand answers that it failed", async () => {
    let failing = true;
    const w = await setup({
      materialise: async () => {
        if (failing) throw new Error("down");
        return { rowsWritten: 1 };
      },
    });
    const client = await w.open();
    await addText(client, A, "a.meltemi", "text");

    // On demand the caller must know the files are not materialised.
    const error = await refusal(w.rooms.materialise(PROJECT));
    expect(error.code).toBe("internal");
    expect(error.status).toBe(500);

    failing = false;
    await client.leave();
    expect(w.room.materialised).toHaveLength(2);
    expect((await w.rooms.stats(PROJECT)).d1RowsWritten).toBe(1);
  });

  it("does not hold up the room while it runs: a client's update is applied and told before it ends", async () => {
    let finish!: (result: { rowsWritten: number }) => void;
    let calls = 0;
    const w = await setup({
      // The first run waits for the test; a second run (the change that came meanwhile) does not.
      materialise: () =>
        ++calls > 1
          ? Promise.resolve({ rowsWritten: 1 })
          : new Promise((resolve) => {
              finish = resolve;
            }),
    });
    const writer = await w.open();
    const reader = await w.open();
    await addText(writer, A, "a.meltemi", "one");
    await reader.sync();

    const running = w.rooms.materialise(PROJECT);
    await w.rooms.advance(0);
    expect(w.room.materialised).toHaveLength(1);

    await typeInto(writer, A, " two");
    expect(textOf(reader, A)).toBe("one two");
    expect((await w.rooms.read(PROJECT)).revision).toBe(2);

    finish({ rowsWritten: 5 });
    await running;
    // The change that came meanwhile gets the second run that on demand promises.
    expect(w.room.materialised.map((input) => input.revision)).toEqual([1, 2]);
    expect(await w.rooms.stats(PROJECT)).toMatchObject({ materialisations: 2, d1RowsWritten: 6 });
  });

  it("counts the rows the store says it wrote, and none for a project that is gone", async () => {
    const results: ({ rowsWritten: number } | "gone")[] = [
      { rowsWritten: 4 },
      "gone",
      { rowsWritten: 2 },
    ];
    const w = await setup({ materialise: async () => results.shift() ?? { rowsWritten: 0 } });
    const client = await w.open();

    for (let round = 0; round < 3; round++) {
      await addText(
        client,
        `${String.fromCharCode(97 + round).repeat(16)}`,
        `f${round}.meltemi`,
        "x",
      );
      await w.rooms.materialise(PROJECT);
    }

    expect(await w.rooms.stats(PROJECT)).toMatchObject({ materialisations: 3, d1RowsWritten: 6 });
  });
});

describe("destroying a room", () => {
  it("deletes the storage, tells every client the project is gone and closes their sockets", async () => {
    const w = await setup();
    const first = await w.open();
    const second = await w.open();
    await addText(first, A, "a.meltemi", "doomed");
    await w.rooms.advance(0);
    await typeInto(first, A, " text");
    expect(w.room.storage.chunks).toBeDefined();

    await w.rooms.destroy(PROJECT);

    expect(w.room.storage.chunks).toBeUndefined();
    expect(w.room.storage.destroyed).toBe(1);
    for (const client of [first, second]) {
      expect(client.errors).toEqual(["project.not-found"]);
      expect(client.closed).toEqual({ code: 4404, reason: "project.not-found" });
    }
    // No timer is left to write, or materialise, what is no longer there.
    expect(w.rooms.timers.pending).toBe(0);
    await w.rooms.advance(5 * 60 * SECOND);
    expect(w.room.storage.chunks).toBeUndefined();
    expect(w.room.materialised).toHaveLength(0);
    expect(await w.rooms.read(PROJECT)).toEqual({
      revision: 0,
      files: {},
      binaries: {},
      collisions: [],
    });
  });

  it("refuses what comes after, so that a caller let in before the deletion cannot write the project again", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "first life" } });
    await w.rooms.destroy(PROJECT);

    // A script that reconnects, a token that was valid when the deletion began.
    const late = await w.open();
    expect(late.errors).toEqual(["project.not-found"]);
    expect(late.closed).toEqual({ code: 4404, reason: "project.not-found" });
    expect(late.of(KIND.sync)).toHaveLength(0);
    expect((await refusal(w.rooms.push(PROJECT, { files: { "b.meltemi": "x" } }))).code).toBe(
      "project.not-found",
    );
    expect((await refusal(w.rooms.restore(PROJECT, { "b.meltemi": "x" }, {}))).code).toBe(
      "project.not-found",
    );

    // Nothing was written into the storage that was just emptied, and nothing is scheduled.
    await w.rooms.advance(5 * 60 * SECOND);
    expect(w.room.storage.chunks).toBeUndefined();
    expect(w.room.storage.saves).toHaveLength(0);
    expect(await w.rooms.read(PROJECT)).toMatchObject({ revision: 0, files: {} });
  });

  it("does not touch another project's room", async () => {
    const w = await setup();
    await w.rooms.push(PROJECT, { files: { "a.meltemi": "mine" } });
    await w.rooms.push(OTHER_PROJECT, { files: { "b.meltemi": "theirs" } }).catch(() => undefined);

    await w.rooms.destroy(OTHER_PROJECT);

    expect((await w.rooms.read(PROJECT)).files).toEqual({ "a.meltemi": "mine" });
  });
});

describe("the development counters", () => {
  it("counts storage writes, materialisations, D1 rows and incoming messages", async () => {
    const w = await setup({ materialise: async () => ({ rowsWritten: 2 }) });
    const client = await w.open();
    expect(await w.rooms.stats(PROJECT)).toEqual({
      revision: 0,
      clients: 1,
      storageWrites: 0,
      materialisations: 0,
      materialiseFailures: 0,
      d1RowsWritten: 0,
      messages: 0,
      awareness: 0,
      awarenessDropped: 0,
    });

    await addText(client, A, "a.meltemi", "x");
    await client.sync();
    await typeInto(client, A, "y");
    await w.rooms.advance(MATERIALISE_DELAY_MS);

    expect(await w.rooms.stats(PROJECT)).toEqual({
      revision: 2,
      clients: 1,
      storageWrites: 1,
      materialisations: 1,
      materialiseFailures: 0,
      d1RowsWritten: 2,
      messages: 3,
      awareness: 0,
      awarenessDropped: 0,
    });
  });

  it("stays within the numbers the browser suite asserts for a minute of typing", async () => {
    const w = await setup({ materialise: async () => ({ rowsWritten: 1 }) });
    const client = await w.open();
    await addText(client, A, "a.meltemi", "");

    // The page sends at most every 250 ms; a person pauses under a second.
    for (let at = 0; at < 60 * SECOND; at += 250) {
      await typeInto(client, A, "x");
      await w.rooms.advance(250);
    }

    const stats = await w.rooms.stats(PROJECT);
    expect(stats.storageWrites).toBeGreaterThanOrEqual(20);
    expect(stats.storageWrites).toBeLessThanOrEqual(90);
    expect(stats.materialisations).toBeLessThanOrEqual(3);
    expect(stats.d1RowsWritten).toBeLessThanOrEqual(60);
    expect(stats.messages).toBeLessThanOrEqual(300);
  });
});

describe("cutting connections (development)", () => {
  it("closes the socket of the client it names and no other, and the next connection syncs what it missed", async () => {
    const w = await setup();
    const phone = await w.open({ sub: "u1" });
    const laptop = await w.open({ sub: "u1" });
    await addText(phone, A, "a.meltemi", "start");
    await laptop.sync();

    const id = (laptop.hello?.["you"] as { id: string }).id;
    expect(await w.rooms.disconnect(PROJECT, { id })).toEqual({ closed: 1 });
    expect(laptop.closed).toEqual({ code: 4000, reason: "disconnected" });
    expect(phone.closed).toBeUndefined();

    // While it is away the phone keeps editing; the laptop comes back and asks.
    await typeInto(phone, A, " and more");
    const back = await w.open({ sub: "u1" });
    await back.sync();
    expect(textOf(back, A)).toBe("start and more");
  });

  it("closes every connection of a person, or every connection, as asked", async () => {
    const w = await setup();
    const ana = await w.open({ sub: "ana" });
    const ana2 = await w.open({ sub: "ana" });
    const beto = await w.open({ sub: "beto" });

    expect(await w.rooms.disconnect(PROJECT, { sub: "ana" })).toEqual({ closed: 2 });
    expect([ana.closed?.code, ana2.closed?.code, beto.closed?.code]).toEqual([
      4000,
      4000,
      undefined,
    ]);
    expect(await w.rooms.disconnect(PROJECT)).toEqual({ closed: 1 });
    expect(beto.closed?.code).toBe(4000);
    expect(await w.rooms.disconnect(PROJECT)).toEqual({ closed: 0 });
  });
});
