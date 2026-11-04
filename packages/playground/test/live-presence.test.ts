// Pointers and guests in presence (`live-collaboration`, "Presence"; `live-sessions`, "Guest
// identity"): the pointer goes out in the same message and at the same pace as the caret and the
// selection, and leaves the state three seconds after it stopped or when it left the canvas; a
// peer's pointer is read only as two finite numbers within the bound, and drawn only over the
// diagram it was over; a guest is badged from the room's word alone, their name always text.

import { setLocale } from "@meltemi/diagrams-i18n";
import { presenceColour } from "@meltemi/diagrams-project";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import { POINTER_IDLE_MS, Presence, THROTTLE_MS } from "../src/cloud/presence.js";
import { presenceBar } from "../src/cloud/presence-bar.js";
import { PeerBook, canvasPeople, type Person } from "../src/cloud/presence-model.js";
import { readPointer, readState } from "../src/cloud/presence-wire.js";
import { en } from "../src/messages/en.js";
import { ManualTimers } from "./support/clock.js";
import { FakeElement, installFakeDom, textNodesOf, withClass } from "./support/fake-dom.js";

const PAGE = "https://diagrams.example/";
const API = "aaaaaaaaaaaaaaa2";
const API_PATH = "diagrams/api.meltemi";
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function page() {
  const timers = new ManualTimers();
  const doc = new Y.Doc();
  addTextFile(cloudDoc(doc), API_PATH, "hello world", { id: API });
  const sent: Record<string, Record<string, unknown>>[] = [];
  const presence = new Presence({
    doc: () => doc,
    timers,
    now: () => timers.now,
    page: PAGE,
    send: (payload) => {
      sent.push(JSON.parse(decoder.decode(payload)) as Record<string, Record<string, unknown>>);
      return true;
    },
  });
  presence.attach({ open: () => API_PATH, selection: () => undefined, canvas: () => [] });
  presence.phase("open");
  presence.opened({ id: "c-me", sub: "u_ana", name: "Ana" });
  const last = () => Object.values(sent.at(-1) ?? {})[0] ?? {};
  return { timers, presence, sent, last };
}

describe("the person's pointer", () => {
  it("goes out with the state, in diagram units, within the 250 ms window", () => {
    const p = page();
    // The hello's state has gone out, and its window has passed.
    p.timers.advance(THROTTLE_MS);
    const before = p.sent.length;
    p.presence.pointer({ x: 120.4, y: 80.6, diagram: "flow" });
    expect(p.sent).toHaveLength(before + 1);
    expect(p.last()).toEqual({
      file: API,
      canvas: { selection: [], pointer: { x: 120, y: 81, diagram: "flow" } },
    });
    // Moves within the window wait for it; the last of them goes when it ends.
    p.presence.pointer({ x: 130, y: 80, diagram: "flow" });
    p.presence.pointer({ x: 140, y: 80, diagram: "flow" });
    expect(p.sent).toHaveLength(before + 1);
    p.timers.advance(THROTTLE_MS);
    expect(p.sent).toHaveLength(before + 2);
    expect(p.last()).toMatchObject({ canvas: { pointer: { x: 140, y: 80 } } });
  });

  it("leaves the state three seconds after it stopped moving", () => {
    const p = page();
    p.presence.pointer({ x: 1, y: 2 });
    p.timers.advance(POINTER_IDLE_MS - 1);
    expect(p.last()).toHaveProperty("canvas");
    p.timers.advance(1);
    expect(p.last()).toEqual({ file: API });
  });

  it("leaves the state at once when it leaves the canvas", () => {
    const p = page();
    p.presence.pointer({ x: 1, y: 2 });
    p.timers.advance(THROTTLE_MS);
    p.presence.pointer(undefined);
    p.timers.advance(THROTTLE_MS);
    expect(p.last()).toEqual({ file: API });
  });

  it("ignores a pointer that is not two finite numbers", () => {
    const p = page();
    const before = p.sent.length;
    p.presence.pointer({ x: Number.NaN, y: 2 });
    p.timers.advance(THROTTLE_MS);
    expect(p.sent).toHaveLength(before);
  });
});

describe("a peer's pointer", () => {
  it("is read as two finite numbers within the bound, and nothing else", () => {
    expect(readPointer({ x: 120, y: 80, diagram: "flow" })).toEqual({
      x: 120,
      y: 80,
      diagram: "flow",
    });
    expect(readPointer({ x: 1.6, y: -0.4 })).toEqual({ x: 2, y: 0 });
    for (const value of [
      { x: Number.NaN, y: 1 },
      { x: 1, y: Number.POSITIVE_INFINITY },
      { x: "1", y: 2 },
      { x: 2_000_000, y: 0 },
      { x: 1 },
      [1, 2],
      null,
    ]) {
      expect(readPointer(value), JSON.stringify(value)).toBeUndefined();
    }
    // A payload with `NaN` is not JSON: the message is not read at all.
    const p = page();
    p.presence.receive(encoder.encode('{"c1":{"canvas":{"pointer":{"x":NaN,"y":1}}}}'));
    expect(p.presence.peers).toEqual([]);
  });

  it("is drawn over the diagram it was over, and not over another diagram of the file", () => {
    const book = new PeerBook(PAGE);
    book.apply(
      [
        {
          id: "c1",
          state: {
            file: API,
            canvas: { selection: [], pointer: { x: 10, y: 20, diagram: "flow" } },
            user: { sub: "u_ben", name: "Ben", picture: "", colour: "#000" },
          },
        },
      ],
      0,
    );
    expect(canvasPeople(book.list(), API, "Someone", "flow")).toEqual([
      { name: "Ben", colour: presenceColour("u_ben"), selection: [], pointer: { x: 10, y: 20 } },
    ]);
    expect(canvasPeople(book.list(), API, "Someone", "sequence")).toEqual([]);
    // A pointer in another file is no pointer here.
    expect(canvasPeople(book.list(), "bbbbbbbbbbbbbbb2", "Someone", "flow")).toEqual([]);
  });
});

describe("a guest", () => {
  it("is badged from the room's user alone", () => {
    const user = { sub: "guest:abc", name: "Guest 37", picture: "", colour: "#000" };
    expect(readState({ user: { ...user, guest: true } }, PAGE)?.user.guest).toBe(true);
    expect(readState({ user }, PAGE)?.user.guest).toBe(false);
    // A peer's claim beside the room's user is never read.
    expect(readState({ user, guest: true }, PAGE)?.user.guest).toBe(false);
  });

  describe("in the header", () => {
    let dom: ReturnType<typeof installFakeDom>;
    beforeEach(() => {
      dom = installFakeDom();
    });
    afterEach(() => {
      dom.uninstall();
      setLocale("en");
    });

    const guest: Person = {
      sub: "guest:abc",
      name: "<b>Ana</b>",
      picture: undefined,
      colour: "#1c7ed6",
      guest: true,
      file: undefined,
      connections: 1,
    };

    it("shows the badge and the name as the characters it is", () => {
      const view = presenceBar({ open: () => undefined });
      view.update([guest]);
      const root = view.element as unknown as FakeElement;
      const [badge] = withClass(root, "presence-guest");
      expect(badge?.textContent).toBe(en.cloud.live.guestBadge);
      const [name] = withClass(root, "presence-name");
      expect(textNodesOf(name!).map((node) => node.data)).toEqual(["<b>Ana</b>"]);
      expect(withClass(root, "presence-person")[0]?.getAttribute("aria-label")).toContain(
        en.cloud.live.guestBadge,
      );
    });

    it("has no badge for a person with an account", () => {
      const view = presenceBar({ open: () => undefined });
      view.update([{ ...guest, sub: "u_ana", name: "Ana", guest: false }]);
      expect(withClass(view.element as unknown as FakeElement, "presence-guest")).toHaveLength(0);
    });
  });
});
