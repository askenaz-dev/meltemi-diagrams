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
  MAX_LASER_MS,
  MAX_LASER_POINTS,
  MAX_PEN_COLOUR,
  MAX_PEN_STROKE,
  MAX_PEN_WIDTH,
  MIN_PEN_WIDTH,
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

describe("parseAwareness: the Pointer trail", () => {
  const point = (i: number) => ({ x: 120 + i, y: 80, t: i * 20 });
  const points = Array.from({ length: 10 }, (_, i) => point(i));

  it("reads a laser alone, with a selection, and keeps its diagram", () => {
    expect(parseAwareness(encode({ k: { canvas: { laser: { points } } } }))).toEqual({
      state: { canvas: { selection: [], laser: { points } } },
    });
    expect(
      parseAwareness(
        encode({ k: { canvas: { selection: ["n1"], laser: { points, diagram: "flow" } } } }),
      ),
    ).toEqual({
      state: { canvas: { selection: ["n1"], laser: { points, diagram: "flow" } } },
    });
  });

  it("reads it beside a pointer, in the same message", () => {
    const parsed = parseAwareness(
      encode({ k: { canvas: { selection: [], pointer: { x: 1.4, y: 2 }, laser: { points } } } }),
    );
    expect(parsed).toEqual({
      state: { canvas: { selection: [], pointer: { x: 1, y: 2 }, laser: { points } } },
    });
  });

  it("takes the longest batch and the longest moment, and no more", () => {
    const edge = Array.from({ length: MAX_LASER_POINTS }, (_, i) => ({ x: i, y: 0, t: 0 }));
    expect(parseAwareness(encode({ k: { canvas: { laser: { points: edge } } } }))).toBeDefined();
    expect(
      parseAwareness(encode({ k: { canvas: { laser: { points: [...edge, edge[0]] } } } })),
    ).toBeUndefined();
    const last = { x: 0, y: 0, t: MAX_LASER_MS };
    expect(parseAwareness(encode({ k: { canvas: { laser: { points: [last] } } } }))).toBeDefined();
    const over = { x: 0, y: 0, t: MAX_LASER_MS + 1 };
    expect(
      parseAwareness(encode({ k: { canvas: { laser: { points: [over] } } } })),
    ).toBeUndefined();
  });

  it("is invalid, whole, for a point or a batch of the wrong shape", () => {
    for (const laser of [
      { points: [{ x: 2_000_000, y: 0, t: 0 }] },
      { points: [{ x: 0, y: 0, t: 5000 }] },
      { points: [{ x: 0, y: 0, t: -1 }] },
      { points: [{ x: 0, y: 0, t: 1.5 }] },
      { points: [{ x: "1", y: 0, t: 0 }] },
      { points: [{ x: 0, y: 0 }] },
      { points: [null] },
      { points: "none" },
      { points: [], diagram: 5 },
      { points: [], diagram: "" },
      { points: [], diagram: "d".repeat(257) },
      "points",
      [],
    ]) {
      const parsed = parseAwareness(encode({ k: { canvas: { laser } } }));
      expect(parsed, JSON.stringify(laser)).toBeUndefined();
    }
  });

  it("is no part when it is null, and a canvas with nothing in it is still no part", () => {
    expect(parseAwareness(encode({ k: { canvas: { laser: null } } }))).toBeUndefined();
    expect(parseAwareness(encode({ k: { canvas: { selection: [], laser: null } } }))).toEqual({
      state: { canvas: { selection: [] } },
    });
  });

  it("rounds to a tenth and keeps no other field of a point", () => {
    const parsed = parseAwareness(
      encode({ k: { canvas: { laser: { points: [{ x: 1.26, y: -2.04, t: 3, user: "Ana" }] } } } }),
    );
    expect(parsed).toEqual({
      state: { canvas: { selection: [], laser: { points: [{ x: 1.3, y: -2, t: 3 }] } } },
    });
  });

  it("is never kept in the record of the attachment: it is relayed once", () => {
    const record: AwarenessRecord = { colour: "#e03131", file: FILE, seen: 1 };
    expect(fitRecord({ sub: "u", name: "Ana", picture: "" }, record)).toEqual(record);
    expect(Object.keys(fitRecord({}, record))).not.toContain("canvas");
  });

  it("fits a full batch in a message, far under the cap", () => {
    const edge = Array.from({ length: MAX_LASER_POINTS }, (_, i) => ({
      x: 999_999.9 - i,
      y: -999_999.9 + i,
      t: 999,
    }));
    const bytes = encode({ k: { file: FILE, canvas: { selection: [], laser: { points: edge } } } });
    expect(bytes.length).toBeLessThan(AWARENESS_MESSAGE_BYTES / 2);
  });
});

describe("parseAwareness: a stroke being drawn", () => {
  const points = Array.from({ length: 10 }, (_, i) => ({ x: 120 + i * 4, y: 80, t: i * 20 }));
  const pen = { width: 4, colour: "#e03131", opacity: 1, stroke: 7 };
  /** A message whose canvas part holds a batch with `look` as its pen part, beside a selection. */
  const stroke = (look: unknown) =>
    parseAwareness(
      encode({ k: { file: FILE, canvas: { selection: ["n1"], laser: { points, pen: look } } } }),
    );

  it("are 1 to 64 pixels wide, a colour of at most 32 characters, an opacity of 0 to 1 and a number", () => {
    expect([MIN_PEN_WIDTH, MAX_PEN_WIDTH, MAX_PEN_COLOUR]).toEqual([1, 64, 32]);
    expect(MAX_PEN_STROKE).toBe(2_147_483_647);
  });

  it("reads the stroke's number, and the cancel of the batch that ends it, maybe with no points", () => {
    for (const number of [0, 1, MAX_PEN_STROKE]) {
      const look = { ...pen, stroke: number };
      expect(stroke(look), String(number)).toEqual({
        state: { file: FILE, canvas: { selection: ["n1"], laser: { points, pen: look } } },
      });
    }
    const cancelled = { ...pen, cancel: true };
    expect(stroke(cancelled)).toEqual({
      state: { file: FILE, canvas: { selection: ["n1"], laser: { points, pen: cancelled } } },
    });
    expect(
      parseAwareness(encode({ k: { canvas: { laser: { points: [], pen: cancelled } } } })),
    ).toEqual({ state: { canvas: { selection: [], laser: { points: [], pen: cancelled } } } });
  });

  it("is invalid, whole, for a stroke's number or a cancel out of bounds", () => {
    for (const look of [
      { width: 4, colour: "#e03131", opacity: 1 },
      { ...pen, stroke: -1 },
      { ...pen, stroke: MAX_PEN_STROKE + 1 },
      { ...pen, stroke: 7.5 },
      { ...pen, stroke: "7" },
      { ...pen, stroke: null },
      { ...pen, cancel: false },
      { ...pen, cancel: "true" },
      { ...pen, cancel: 1 },
      { ...pen, cancel: null },
    ]) {
      expect(stroke(look), JSON.stringify(look)).toBeUndefined();
    }
  });

  it("reads the pen part beside the points and the diagram, and relays it as it came", () => {
    expect(
      parseAwareness(encode({ k: { canvas: { laser: { diagram: "flow", points, pen } } } })),
    ).toEqual({ state: { canvas: { selection: [], laser: { diagram: "flow", points, pen } } } });
    expect(stroke(pen)).toEqual({
      state: { file: FILE, canvas: { selection: ["n1"], laser: { points, pen } } },
    });
  });

  it("reads the highlighter's translucent 20 px stroke", () => {
    const highlighter = { width: 20, colour: "#ffd43b", opacity: 0.35, stroke: 7 };
    expect(stroke(highlighter)).toEqual({
      state: { file: FILE, canvas: { selection: ["n1"], laser: { points, pen: highlighter } } },
    });
  });

  it("takes every edge of the bounds", () => {
    for (const look of [
      { width: MIN_PEN_WIDTH, colour: "#000", opacity: 0, stroke: 7 },
      { width: MAX_PEN_WIDTH, colour: "c".repeat(MAX_PEN_COLOUR), opacity: 1, stroke: 7 },
      { width: 3, colour: "", opacity: 0.5, stroke: 7 },
    ]) {
      expect(stroke(look), JSON.stringify(look)).toBeDefined();
    }
  });

  it("is invalid, whole, for a pen part over the bounds or of the wrong shape: the selection is lost with it", () => {
    for (const look of [
      { width: 0, colour: "#e03131", opacity: 1, stroke: 7 },
      { width: 65, colour: "#e03131", opacity: 1, stroke: 7 },
      { width: 900, colour: "#e03131", opacity: 1, stroke: 7 },
      { width: 2.5, colour: "#e03131", opacity: 1, stroke: 7 },
      { width: -4, colour: "#e03131", opacity: 1, stroke: 7 },
      { width: "4", colour: "#e03131", opacity: 1, stroke: 7 },
      { colour: "#e03131", opacity: 1, stroke: 7 },
      { width: 4, colour: "c".repeat(MAX_PEN_COLOUR + 1), opacity: 1, stroke: 7 },
      { width: 4, colour: "c".repeat(100), opacity: 1, stroke: 7 },
      { width: 4, colour: 255, opacity: 1, stroke: 7 },
      { width: 4, opacity: 1, stroke: 7 },
      { width: 4, colour: "#e03131", opacity: 1.5, stroke: 7 },
      { width: 4, colour: "#e03131", opacity: -0.1, stroke: 7 },
      { width: 4, colour: "#e03131", opacity: "1", stroke: 7 },
      { width: 4, colour: "#e03131", stroke: 7 },
      "pen",
      [4, "#e03131", 1],
      true,
    ]) {
      expect(stroke(look), JSON.stringify(look)).toBeUndefined();
    }
  });

  it("is no part when it is null: the batch is a Pointer's trail", () => {
    expect(stroke(null)).toEqual({
      state: { file: FILE, canvas: { selection: ["n1"], laser: { points } } },
    });
  });

  it("keeps no other field of the pen part", () => {
    expect(stroke({ ...pen, user: "Ana", dash: [4, 2] })).toEqual({
      state: { file: FILE, canvas: { selection: ["n1"], laser: { points, pen } } },
    });
  });

  it("fits a full batch with its pen part and the longest colour in a message, far under the cap", () => {
    const edge = Array.from({ length: MAX_LASER_POINTS }, (_, i) => ({
      x: 999_999.9 - i,
      y: -999_999.9 + i,
      t: 999,
    }));
    const look = {
      width: MAX_PEN_WIDTH,
      colour: "c".repeat(MAX_PEN_COLOUR),
      opacity: 0.35,
      stroke: MAX_PEN_STROKE,
      cancel: true,
    };
    const bytes = encode({
      k: { file: FILE, canvas: { selection: [], laser: { points: edge, pen: look } } },
    });
    expect(bytes.length).toBeLessThan(AWARENESS_MESSAGE_BYTES / 2);
    expect(parseAwareness(bytes)).toBeDefined();
  });
});
