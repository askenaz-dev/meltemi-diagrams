// Awareness in the room, the pure parts (`live-collaboration` / `cloud-document`: "Awareness relayed by
// the room"): what a client may send, what the room keeps in an attachment, and the rate. The room's
// own scenarios, over the fake socket pair and the fake clock, are in `room-awareness-room.test.ts`.

import { serialize } from "node:v8";
import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_BYTES,
  AWARENESS_CLOSE_ABOVE,
  AWARENESS_DROP_ABOVE,
  AWARENESS_MESSAGE_BYTES,
  AWARENESS_TIMEOUT_MS,
  AwarenessRate,
  attachmentBytes,
  fitRecord,
  parseAwareness,
  type AwarenessRecord,
} from "../src/room-awareness.js";

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const FILE = "aaaaaaaaaaaaaaaa";

describe("the numbers of the specification", () => {
  it("are 16 KiB, thirty seconds, 20 and 100 a second, and an attachment of 2 KiB", () => {
    expect(AWARENESS_MESSAGE_BYTES).toBe(16 * 1024);
    expect(AWARENESS_TIMEOUT_MS).toBe(30_000);
    expect(AWARENESS_DROP_ABOVE).toBe(20);
    expect(AWARENESS_CLOSE_ABOVE).toBe(100);
    expect(ATTACHMENT_BYTES).toBe(2048);
  });
});

describe("parseAwareness", () => {
  it("reads a state: the file, the caret and the canvas selection", () => {
    const state = {
      file: FILE,
      caret: { anchor: "AQID", head: "AQIE" },
      canvas: { selection: ["n1", "n2"] },
    };

    expect(parseAwareness(encode({ "123": state }))).toEqual({ state });
  });

  it("reads any part alone, and an empty state: a client with no file open", () => {
    expect(parseAwareness(encode({ k: {} }))).toEqual({ state: {} });
    expect(parseAwareness(encode({ k: { file: FILE } }))).toEqual({ state: { file: FILE } });
    expect(parseAwareness(encode({ k: { canvas: { selection: [] } } }))).toEqual({
      state: { canvas: { selection: [] } },
    });
  });

  it("takes null for a part as not set, so a page may write what it does not have as null", () => {
    expect(parseAwareness(encode({ k: { file: null, caret: null, canvas: null } }))).toEqual({
      state: {},
    });
  });

  it("reads null as the client having no state any more", () => {
    expect(parseAwareness(encode({ k: null }))).toEqual({ remove: true });
  });

  it("ignores the key and every field it does not know, a user among them", () => {
    const read = parseAwareness(
      encode({
        "whatever key": {
          file: FILE,
          user: { sub: "u-ana", name: "Ana", picture: "x", colour: "#000000" },
          colour: "#000000",
          extra: [1, 2, 3],
        },
      }),
    );

    expect(read).toEqual({ state: { file: FILE } });
  });

  it("keeps __proto__ as the plain key it is in JSON", () => {
    const text = '{"__proto__":{"file":"aaaaaaaaaaaaaaaa"}}';

    expect(parseAwareness(new TextEncoder().encode(text))).toEqual({ state: { file: FILE } });
    expect(({} as Record<string, unknown>)["file"]).toBeUndefined();
  });

  const INVALID: [string, Uint8Array][] = [
    ["bytes that are not JSON", new Uint8Array([1, 2, 3])],
    ["an empty payload", new Uint8Array(0)],
    ["JSON that is cut short", new TextEncoder().encode('{"k":{"file":')],
    ["a number", encode(5)],
    ["a string", encode("state")],
    ["null", encode(null)],
    ["an array", encode([{ file: FILE }])],
    ["a map of no entries", encode({})],
    ["a map of two entries", encode({ a: {}, b: {} })],
    ["a state beside a forged user", encode({ k: {}, user: { sub: "u-ana" } })],
    ["an entry that is a string", encode({ k: "file" })],
    ["an entry that is an array", encode({ k: [] })],
    ["a file that is a number", encode({ k: { file: 7 } })],
    ["a file that is not a file id", encode({ k: { file: "a.meltemi" } })],
    ["a file id of the wrong length", encode({ k: { file: FILE + "a" } })],
    ["a file id in capitals", encode({ k: { file: FILE.toUpperCase() } })],
    ["a caret that is a string", encode({ k: { caret: "1,2" } })],
    ["a caret with no head", encode({ k: { caret: { anchor: "AQID" } } })],
    ["a caret with no anchor", encode({ k: { caret: { head: "AQID" } } })],
    ["a caret whose anchor is a number", encode({ k: { caret: { anchor: 1, head: "AQID" } } })],
    ["a caret with an empty head", encode({ k: { caret: { anchor: "AQID", head: "" } } })],
    [
      "a caret whose head is over 256 characters",
      encode({ k: { caret: { anchor: "AQID", head: "a".repeat(257) } } }),
    ],
    ["a canvas that is an array", encode({ k: { canvas: ["n1"] } })],
    ["a canvas with no selection", encode({ k: { canvas: {} } })],
    ["a selection that is a string", encode({ k: { canvas: { selection: "n1" } } })],
    ["a selection holding a number", encode({ k: { canvas: { selection: ["n1", 2] } } })],
    ["a selection holding an empty id", encode({ k: { canvas: { selection: [""] } } })],
    [
      "a selection holding an id over 256 characters",
      encode({ k: { canvas: { selection: ["a".repeat(257)] } } }),
    ],
  ];

  it.each(INVALID)("refuses %s", (_name, payload) => {
    expect(parseAwareness(payload)).toBeUndefined();
  });

  it("takes a position and an element id of exactly 256 characters", () => {
    const ok = parseAwareness(
      encode({
        k: {
          caret: { anchor: "a".repeat(256), head: "b".repeat(256) },
          canvas: { selection: ["c".repeat(256)] },
        },
      }),
    );

    expect(ok).toEqual({
      state: {
        caret: { anchor: "a".repeat(256), head: "b".repeat(256) },
        canvas: { selection: ["c".repeat(256)] },
      },
    });
  });
});

describe("what an attachment holds", () => {
  const info = { id: "9f3c2a71d04be856", sub: "u-ana", role: "editor", name: "Ana", picture: "" };
  const full: AwarenessRecord = {
    colour: "#e03131",
    file: FILE,
    caret: { anchor: "a".repeat(200), head: "b".repeat(200) },
    seen: 1_760_000_000_000,
  };

  it("estimates at least what the platform's serialisation takes, for strings of every width", () => {
    const strings = [
      "",
      "Ana",
      "Ana María",
      "田中太郎",
      "Ana 田中",
      "😀 emoji",
      "x".repeat(500),
      "ñ".repeat(100),
      `https://avatars.githubusercontent.com/u/${"1".repeat(400)}?v=4`,
      "田".repeat(100),
    ];
    for (const name of strings) {
      for (const picture of strings) {
        const value = { ...info, name, picture, aw: full };
        expect(attachmentBytes(value), `${name} ${picture.slice(0, 8)}`).toBeGreaterThanOrEqual(
          serialize(value).length,
        );
      }
    }
  });

  it("keeps the whole record when it fits in the limit", () => {
    const limit = attachmentBytes({ ...info, aw: full });

    expect(fitRecord(info, full, limit)).toEqual(full);
    expect(fitRecord(info, full)).toEqual(full);
  });

  it("drops the caret first when the whole does not fit, and keeps the file", () => {
    const { caret: _caret, ...withoutCaret } = full;
    const limit = attachmentBytes({ ...info, aw: withoutCaret });

    expect(fitRecord(info, full, limit)).toEqual(withoutCaret);
    // One byte under the whole and the caret goes.
    expect(fitRecord(info, full, attachmentBytes({ ...info, aw: full }) - 1)).toEqual(withoutCaret);
  });

  it("drops the file too when even that does not fit, and keeps the colour and the time", () => {
    const { caret: _caret, file: _file, ...bare } = full;
    const { caret: _c, ...withoutCaret } = full;
    const limit = attachmentBytes({ ...info, aw: bare });

    expect(fitRecord(info, full, attachmentBytes({ ...info, aw: withoutCaret }) - 1)).toEqual(bare);
    expect(fitRecord(info, full, limit)).toEqual(bare);
    // Whatever the limit, the bare record is the least that is kept.
    expect(fitRecord(info, full, 0)).toEqual(bare);
  });

  it("fits the real limit for the longest identity the Worker passes, in the platform's own measure", () => {
    const widest = {
      id: "9f3c2a71d04be856",
      sub: "s".repeat(200),
      role: "editor",
      name: "田".repeat(100),
      picture: "p".repeat(500),
    };
    const big: AwarenessRecord = {
      colour: "#e03131",
      file: FILE,
      caret: { anchor: "a".repeat(256), head: "b".repeat(256) },
      seen: 1_760_000_000_000,
    };

    for (const identity of [info, widest]) {
      const kept = fitRecord(identity, big);
      expect(serialize({ ...identity, aw: kept }).length).toBeLessThanOrEqual(ATTACHMENT_BYTES);
    }
    // The ordinary identity keeps everything; the widest cannot keep the caret.
    expect(fitRecord(info, big)).toEqual(big);
    expect(fitRecord(widest, big).caret).toBeUndefined();
  });
});

describe("AwarenessRate", () => {
  /** What happens to `count` messages sent at one moment. */
  function burst(rate: AwarenessRate, at: number, count: number): string[] {
    return Array.from({ length: count }, () => rate.hit(at));
  }
  const tally = (verdicts: string[]) => ({
    ok: verdicts.filter((verdict) => verdict === "ok").length,
    drop: verdicts.filter((verdict) => verdict === "drop").length,
    close: verdicts.filter((verdict) => verdict === "close").length,
  });

  it("lets 20 messages in a second through, drops the 21st and closes at the 101st", () => {
    expect(tally(burst(new AwarenessRate(), 0, 20))).toEqual({ ok: 20, drop: 0, close: 0 });
    expect(tally(burst(new AwarenessRate(), 0, 21))).toEqual({ ok: 20, drop: 1, close: 0 });
    expect(tally(burst(new AwarenessRate(), 0, 100))).toEqual({ ok: 20, drop: 80, close: 0 });
    expect(tally(burst(new AwarenessRate(), 0, 101))).toEqual({ ok: 20, drop: 80, close: 1 });
  });

  it("slides: a message counts for exactly a second", () => {
    const rate = new AwarenessRate();
    burst(rate, 1000, 20);

    expect(rate.hit(1999)).toBe("drop");
    // The twenty of 1000 are exactly a second old at 2000 and no longer count.
    expect(rate.hit(2000)).toBe("ok");
  });

  it("counts the dropped messages toward the close", () => {
    const rate = new AwarenessRate();
    burst(rate, 0, 100);

    expect(rate.hit(999)).toBe("close");
  });

  it("starts again after a quiet second", () => {
    const rate = new AwarenessRate();
    burst(rate, 0, 100);

    expect(tally(burst(rate, 1000, 20))).toEqual({ ok: 20, drop: 0, close: 0 });
  });

  it("treats 50 messages in one second and 150 in the next as the specification's flood", () => {
    const rate = new AwarenessRate();
    const first = tally(burst(rate, 0, 50));
    const second = tally(burst(rate, 1000, 150));

    expect(first).toEqual({ ok: 20, drop: 30, close: 0 });
    expect(second.ok).toBe(20);
    expect(second.close).toBeGreaterThan(0);
  });
});
