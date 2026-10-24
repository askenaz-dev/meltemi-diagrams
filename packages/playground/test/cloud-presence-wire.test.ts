import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  MAX_ID_LENGTH,
  MAX_LASER_MS,
  MAX_LASER_POINTS,
  MAX_NAME_LENGTH,
  MAX_SELECTED,
  decodeAwareness,
  encodeCaret,
  encodeLocal,
  fromBase64,
  positionIn,
  readLaser,
  readState,
  toBase64,
} from "../src/cloud/presence-wire.js";

const PAGE = "https://diagrams.example/";
const FILE = "abcdefghijklmnop";
const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value));
const user = (extra: Record<string, unknown> = {}) => ({
  sub: "u_ben",
  name: "Ben",
  picture: "https://avatars.example/ben.png",
  colour: "#123456",
  ...extra,
});

describe("what the page sends", () => {
  it("is a map keyed by the client id, and holds no identity", () => {
    const payload = encodeLocal("c7", {
      file: FILE,
      caret: { anchor: "AAA=", head: "AAA=" },
      canvas: { selection: ["api"] },
    });
    const text = new TextDecoder().decode(payload);
    expect(JSON.parse(text)).toEqual({
      c7: { file: FILE, caret: { anchor: "AAA=", head: "AAA=" }, canvas: { selection: ["api"] } },
    });
    // The room knows who the person is and says it: the page never sends a name or an account.
    expect(text).not.toMatch(/user|sub|name|picture|colour/);
  });
});

describe("what the room sends", () => {
  it("is read as a map of clients with a state, or null when a client is gone", () => {
    const entries = decodeAwareness(
      bytes({ c1: { file: FILE, user: user() }, c2: null, c3: { user: user() } }),
    );
    expect(entries.map((entry) => entry.id)).toEqual(["c1", "c2", "c3"]);
    expect(entries[1]?.state).toBeNull();
  });

  it("is ignored, without throwing, when it is not a message of the format", () => {
    for (const junk of [
      new Uint8Array(0),
      encoder.encode("not json"),
      encoder.encode("[1,2]"),
      encoder.encode("42"),
      encoder.encode("null"),
      encoder.encode('"text"'),
      new Uint8Array([0xff, 0xfe, 0x00]),
    ]) {
      expect(decodeAwareness(junk)).toEqual([]);
    }
    // A client whose state is not an object, or whose id is empty or absurd, is skipped alone.
    const entries = decodeAwareness(
      bytes({
        ok: { user: user() },
        bad: 7,
        list: [1],
        "": { user: user() },
        [`x${"y".repeat(300)}`]: {},
      }),
    );
    expect(entries.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("speaks of no more clients than a room holds and then some", () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) many[`c${i}`] = { user: user() };
    expect(decodeAwareness(bytes(many)).length).toBeLessThanOrEqual(64);
  });
});

describe("a peer's state", () => {
  it("is the room's user, the file, the caret and the canvas selection", () => {
    const state = readState(
      {
        file: FILE,
        caret: { anchor: "AAEC", head: "AwQF" },
        canvas: { selection: ["api", "db"] },
        user: user(),
      },
      PAGE,
    );
    expect(state).toEqual({
      user: { sub: "u_ben", name: "Ben", picture: "https://avatars.example/ben.png", guest: false },
      file: FILE,
      caret: { anchor: "AAEC", head: "AwQF" },
      selection: ["api", "db"],
      pointer: undefined,
    });
  });

  it("names nobody without the room's user, and ignores what a peer claims beside it", () => {
    expect(readState({ file: FILE }, PAGE)).toBeUndefined();
    expect(readState({ file: FILE, name: "Ana", sub: "u_ana" }, PAGE)).toBeUndefined();
    expect(readState({ user: { name: "Ben" } }, PAGE)).toBeUndefined();
    expect(readState({ user: { sub: "" } }, PAGE)).toBeUndefined();
    expect(readState({ user: "u_ana" }, PAGE)).toBeUndefined();
    expect(readState(null, PAGE)).toBeUndefined();
    expect(readState([], PAGE)).toBeUndefined();
    // Beside the room's user, a name, an account or a picture is a claim of the peer.
    const forged = readState(
      {
        user: user(),
        name: "Ana",
        sub: "u_ana",
        picture: "https://evil.example/ana.png",
        caret: { anchor: "AAA=", head: "AAA=", user: { sub: "u_ana", name: "Ana" } },
        canvas: { selection: ["api"], user: { sub: "u_ana", name: "Ana" } },
      },
      PAGE,
    );
    expect(forged?.user).toEqual({
      sub: "u_ben",
      name: "Ben",
      picture: "https://avatars.example/ben.png",
      guest: false,
    });
  });

  it("keeps a name that looks like markup as the characters it is", () => {
    const state = readState({ user: user({ name: "<b>Ben</b>" }) }, PAGE);
    expect(state?.user.name).toBe("<b>Ben</b>");
  });

  it("makes a name one line, and no longer than a name may be", () => {
    expect(readState({ user: user({ name: "  Be\nn\u0007\t " }) }, PAGE)?.user.name).toBe("Be n");
    const long = readState({ user: user({ name: "é".repeat(500) }) }, PAGE);
    expect(Array.from(long?.user.name ?? "")).toHaveLength(MAX_NAME_LENGTH);
    expect(readState({ user: user({ name: 42 }) }, PAGE)?.user.name).toBe("");
  });

  it("takes a picture only by the rule of the account control", () => {
    const picture = (value: unknown) =>
      readState({ user: user({ picture: value }) }, PAGE)?.user.picture;
    expect(picture("https://avatars.example/ben.png")).toBe("https://avatars.example/ben.png");
    expect(picture("https://diagrams.example/a.png")).toBe("https://diagrams.example/a.png");
    expect(picture("http://diagrams.example/a.png")).toBeUndefined();
    expect(picture("http://evil.example/a.png")).toBeUndefined();
    expect(picture("javascript:alert(1)")).toBeUndefined();
    expect(picture("data:image/png;base64,AAAA")).toBeUndefined();
    expect(picture("https://user:pass@avatars.example/a.png")).toBeUndefined();
    expect(picture("/relative.png")).toBeUndefined();
    expect(picture(7)).toBeUndefined();
    expect(picture("")).toBeUndefined();
    // A page served locally over http draws pictures from its own origin.
    const local = "http://127.0.0.1:8787/";
    expect(
      readState({ user: user({ picture: "http://127.0.0.1:8787/a.png" }) }, local)?.user.picture,
    ).toBe("http://127.0.0.1:8787/a.png");
  });

  it("takes a file only when it is the shape of a file id", () => {
    expect(readState({ user: user(), file: "../../etc" }, PAGE)?.file).toBeUndefined();
    expect(readState({ user: user(), file: "ABCDEFGHIJKLMNOP" }, PAGE)?.file).toBeUndefined();
    expect(readState({ user: user(), file: 7 }, PAGE)?.file).toBeUndefined();
    expect(readState({ user: user(), file: FILE }, PAGE)?.file).toBe(FILE);
  });

  it("takes a caret only when both ends are encoded positions", () => {
    const caret = (value: unknown) => readState({ user: user(), caret: value }, PAGE)?.caret;
    expect(caret({ anchor: "AAA=", head: "AAA=" })).toEqual({ anchor: "AAA=", head: "AAA=" });
    expect(caret({ anchor: "AAA=" })).toBeUndefined();
    expect(caret({ anchor: "AAA=", head: 4 })).toBeUndefined();
    expect(caret({ anchor: "<script>", head: "AAA=" })).toBeUndefined();
    expect(caret({ anchor: "", head: "AAA=" })).toBeUndefined();
    expect(caret({ anchor: "A".repeat(500), head: "AAA=" })).toBeUndefined();
    expect(caret("AAA=")).toBeUndefined();
  });

  it("takes a canvas selection of ids, as many as fit and none that is not text", () => {
    const selection = (value: unknown) =>
      readState({ user: user(), canvas: { selection: value } }, PAGE)?.selection;
    expect(selection(["a", 7, "", null, "b", "x".repeat(MAX_ID_LENGTH + 1)])).toEqual(["a", "b"]);
    expect(selection("api")).toEqual([]);
    expect(selection(Array.from({ length: 1000 }, (_, i) => `id${i}`))).toHaveLength(MAX_SELECTED);
    expect(readState({ user: user(), canvas: "api" }, PAGE)?.selection).toEqual([]);
  });
});

describe("encoded positions", () => {
  function text(content: string): { doc: Y.Doc; text: Y.Text } {
    const doc = new Y.Doc();
    const t = doc.getText("t");
    t.insert(0, content);
    return { doc, text: t };
  }

  it("round trip through base64", () => {
    const sample = new Uint8Array([0, 1, 2, 250, 255, 128]);
    expect(fromBase64(toBase64(sample))).toEqual(sample);
    expect(fromBase64("not base64!")).toBeUndefined();
    expect(fromBase64("")).toBeUndefined();
  });

  it("name the offsets they were made from, for a caret and for a selection", () => {
    const { doc, text: t } = text("hello world");
    const caret = encodeCaret(t, 4, 4);
    expect(positionIn(caret.anchor, doc, t)).toBe(4);
    expect(positionIn(caret.head, doc, t)).toBe(4);
    const selection = encodeCaret(t, 6, 11);
    expect(positionIn(selection.anchor, doc, t)).toBe(6);
    expect(positionIn(selection.head, doc, t)).toBe(11);
    const backward = encodeCaret(t, 11, 6);
    expect(positionIn(backward.anchor, doc, t)).toBe(11);
    expect(positionIn(backward.head, doc, t)).toBe(6);
  });

  it("keep offsets inside the text", () => {
    const { doc, text: t } = text("abc");
    const caret = encodeCaret(t, -5, 99);
    expect(positionIn(caret.anchor, doc, t)).toBe(0);
    expect(positionIn(caret.head, doc, t)).toBe(3);
  });

  it("stay on the same characters while others edit: two documents, concurrent edits", () => {
    const a = text("hello world");
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc));
    const bText = b.getText("t");
    // Ben selects "world"; meanwhile Ana types at the start and Ben's page hears of it.
    const selection = encodeCaret(bText, 6, 11);
    a.text.insert(0, ">> ");
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b)));
    expect(bText.toString()).toBe(">> hello world");
    expect(positionIn(selection.anchor, b, bText)).toBe(9);
    expect(positionIn(selection.head, b, bText)).toBe(14);
    // Text typed at the edges of the selection falls outside it.
    bText.insert(9, "[");
    bText.insert(bText.length, "]");
    expect(positionIn(selection.anchor, b, bText)).toBe(10);
    expect(positionIn(selection.head, b, bText)).toBe(15);
    expect(bText.toString().slice(10, 15)).toBe("world");
  });

  it("are nothing for another text, a text that is gone, or bytes that are not a position", () => {
    const { doc, text: t } = text("abc");
    const other = doc.getText("other");
    other.insert(0, "xyz");
    const caret = encodeCaret(t, 1, 2);
    expect(positionIn(caret.anchor, doc, other)).toBeUndefined();
    expect(positionIn("////", doc, t)).toBeUndefined();
    expect(positionIn("AAAA", doc, t)).toBeUndefined();
    expect(positionIn("not base64!", doc, t)).toBeUndefined();
    // A text of a map that was deleted.
    const files = doc.getMap<Y.Text>("files");
    const kept = new Y.Text();
    files.set("f", kept);
    kept.insert(0, "gone soon");
    const encoded = encodeCaret(kept, 2, 4);
    expect(positionIn(encoded.anchor, doc, kept)).toBe(2);
    files.delete("f");
    expect(positionIn(encoded.anchor, doc, kept)).toBeUndefined();
  });
});

describe("a Pointer trail batch", () => {
  const points = Array.from({ length: 10 }, (_, i) => ({ x: 120 + i * 11, y: 80, t: i * 22 }));

  it("goes out in the canvas part, and comes back as the peer's batch", () => {
    const sent = JSON.parse(
      new TextDecoder().decode(
        encodeLocal("c7", {
          file: FILE,
          canvas: { selection: [], laser: { diagram: "d", points } },
        }),
      ),
    ) as { c7: { canvas: { laser: unknown } } };
    expect(sent.c7.canvas.laser).toEqual({ diagram: "d", points });
    const state = readState(
      { file: FILE, canvas: { selection: [], laser: { diagram: "d", points } }, user: user() },
      PAGE,
    );
    expect(state?.laser).toEqual({ diagram: "d", points });
    expect(
      readState({ file: FILE, canvas: { selection: ["api"] }, user: user() }, PAGE)?.laser,
    ).toBeUndefined();
  });

  it("holds at most 64 points of at most a second, and no more", () => {
    const edge = Array.from({ length: MAX_LASER_POINTS }, (_, i) => ({ x: i, y: 0, t: 0 }));
    expect(readLaser({ points: edge })?.points).toHaveLength(MAX_LASER_POINTS);
    expect(readLaser({ points: [...edge, { x: 0, y: 0, t: 0 }] })).toBeUndefined();
    expect(readLaser({ points: [{ x: 0, y: 0, t: MAX_LASER_MS }] })).toBeDefined();
    expect(readLaser({ points: [{ x: 0, y: 0, t: MAX_LASER_MS + 1 }] })).toBeUndefined();
  });

  it("is dropped, and the rest of the state read, when a point does not fit", () => {
    for (const bad of [
      { x: 2_000_000, y: 0, t: 0 },
      { x: 0, y: Number.NaN, t: 0 },
      { x: "1", y: 0, t: 0 },
      { x: 0, y: 0, t: 5000 },
      { x: 0, y: 0, t: -1 },
      { x: 0, y: 0, t: 1.5 },
      { x: 0, y: 0 },
      null,
    ]) {
      const state = readState(
        {
          file: FILE,
          canvas: { selection: ["api"], laser: { points: [points[0], bad] } },
          user: user(),
        },
        PAGE,
      );
      expect(state?.laser, JSON.stringify(bad)).toBeUndefined();
      expect(state?.selection).toEqual(["api"]);
    }
    expect(readLaser({ points: "none" })).toBeUndefined();
    expect(readLaser(null)).toBeUndefined();
  });

  it("keeps the diagram only when it is a reasonable id", () => {
    expect(readLaser({ points, diagram: "d" })?.diagram).toBe("d");
    expect(readLaser({ points, diagram: "" })).toEqual({ points });
    expect(readLaser({ points, diagram: "x".repeat(MAX_ID_LENGTH + 1) })).toEqual({ points });
    expect(readLaser({ points, diagram: 5 })).toEqual({ points });
  });
});
