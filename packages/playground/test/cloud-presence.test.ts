import { presenceColour } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import {
  HEARTBEAT_MS,
  PEER_TIMEOUT_MS,
  Presence,
  THROTTLE_MS,
  fitSelection,
  pageOf,
  studioSource,
  type PaneSelection,
  type PresenceSource,
} from "../src/cloud/presence.js";
import { positionIn, type LaserBatch } from "../src/cloud/presence-wire.js";
import { presenceMessage } from "../src/canvas-host.js";
import { ManualTimers } from "./support/clock.js";
import { FakePane, newStudio } from "./support/cloud.js";

const PAGE = "https://diagrams.example/";
const API = "aaaaaaaaaaaaaaa2";
const WEB = "bbbbbbbbbbbbbbb2";
const API_PATH = "diagrams/api.meltemi";
const WEB_PATH = "diagrams/web.meltemi";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A project of two files. */
function project(): Y.Doc {
  const doc = new Y.Doc();
  const cloud = cloudDoc(doc);
  addTextFile(cloud, API_PATH, "hello world\nsecond line", { id: API });
  addTextFile(cloud, WEB_PATH, "web page", { id: WEB });
  return doc;
}

/** What the person does, as presence reads it. */
interface Inputs {
  open: string;
  selection: PaneSelection | undefined;
  canvas: string[];
}

interface Page {
  readonly timers: ManualTimers;
  readonly doc: Y.Doc;
  readonly presence: Presence;
  readonly inputs: Inputs;
  /** The payloads presence sent, in order. */
  readonly sent: Uint8Array[];
  /** What the socket does with a send: false when it is down. */
  readonly socket: { up: boolean };
  /** How many times the listeners were told. */
  readonly changes: { count: number };
}

function page(options: { doc?: Y.Doc; timers?: ManualTimers; attach?: boolean } = {}): Page {
  const timers = options.timers ?? new ManualTimers();
  const doc = options.doc ?? project();
  const sent: Uint8Array[] = [];
  const socket = { up: true };
  const inputs: Inputs = { open: API_PATH, selection: { start: 0, end: 0 }, canvas: [] };
  const presence = new Presence({
    doc: () => doc,
    timers,
    now: () => timers.now,
    page: PAGE,
    send: (payload) => {
      if (!socket.up) return false;
      sent.push(payload);
      return true;
    },
  });
  const changes = { count: 0 };
  presence.listen(() => changes.count++);
  if (options.attach !== false) {
    const source: PresenceSource = {
      open: () => inputs.open,
      selection: () => inputs.selection,
      canvas: () => inputs.canvas,
    };
    presence.attach(source);
  }
  return { timers, doc, presence, inputs, sent, socket, changes };
}

/** The socket opens and the room says hello. */
function hello(p: Page, you: unknown = { id: "c-me", sub: "u_ana", name: "Ana" }): void {
  p.presence.phase("open");
  p.presence.opened(you);
}

/** A state as the room takes it, read loosely: a test looks at the parts it expects. */
interface SentState {
  file: string;
  caret: { anchor: string; head: string };
  canvas: { selection: string[] };
}

const states = (p: Page) =>
  p.sent.map((payload) => JSON.parse(decoder.decode(payload)) as Record<string, SentState>);

/** What the room relays of a sender's message: its state under its id, with the room's user. */
function relayed(
  payload: Uint8Array,
  id: string,
  who: { sub: string; name: string; picture?: string },
): Uint8Array {
  const message = JSON.parse(decoder.decode(payload)) as Record<string, object>;
  const state = Object.values(message)[0];
  return encoder.encode(
    JSON.stringify({
      [id]: {
        ...state,
        user: { ...who, picture: who.picture ?? "", colour: presenceColour(who.sub) },
      },
    }),
  );
}

describe("the state the page publishes", () => {
  it("is the open file, the caret as encoded relative positions and the canvas selection", () => {
    const p = page();
    p.inputs.selection = { start: 6, end: 11 };
    p.inputs.canvas = ["api", "db"];
    hello(p);
    const [message] = states(p);
    expect(Object.keys(message!)).toEqual(["c-me"]);
    const state = message!["c-me"];
    expect(state.file).toBe(API);
    expect(state.canvas).toEqual({ selection: ["api", "db"] });
    const text = cloudDoc(p.doc).files.get(API)!;
    expect(positionIn(state.caret.anchor, p.doc, text)).toBe(6);
    expect(positionIn(state.caret.head, p.doc, text)).toBe(11);
  });

  it("never says who the person is: the room knows, and says it", () => {
    const p = page();
    hello(p, { id: "c-me", sub: "u_ana", name: "Ana", picture: "https://x.example/a.png" });
    const text = decoder.decode(p.sent[0]);
    expect(text).not.toMatch(/user|u_ana|Ana|picture|colour/);
    for (const state of Object.values(states(p)[0]!)) {
      expect(Object.keys(state).sort()).toEqual(["caret", "file"]);
    }
  });

  it("names the file by its id, so that a rename changes nothing about it", () => {
    const p = page();
    hello(p);
    const before = states(p)[0]!["c-me"].file;
    cloudDoc(p.doc).paths.set(API, "diagrams/backend.meltemi");
    p.inputs.open = "diagrams/backend.meltemi";
    p.presence.moved();
    p.timers.advance(THROTTLE_MS);
    // The same file, the same caret: the room already has this state.
    expect(before).toBe(API);
    expect(p.sent).toHaveLength(1);
  });

  it("is the file alone when the open file has no caret to give (an image) or is not the project's", () => {
    const p = page();
    hello(p);
    p.inputs.open = "assets/logo.png";
    p.presence.moved();
    p.timers.advance(THROTTLE_MS);
    expect(states(p).at(-1)!["c-me"]).toEqual({});
    p.inputs.open = "";
    p.presence.moved();
    p.timers.advance(THROTTLE_MS);
    expect(states(p).at(-1)!["c-me"]).toEqual({});
  });

  it("holds no canvas selection of a file that is not open, and no more ids than fit", () => {
    const p = page();
    p.inputs.canvas = Array.from({ length: 1000 }, (_, i) => `id${i}`);
    hello(p);
    expect(states(p)[0]!["c-me"].canvas.selection).toHaveLength(200);
    p.inputs.open = "";
    p.presence.moved();
    p.timers.advance(THROTTLE_MS);
    expect(states(p).at(-1)!["c-me"]).toEqual({});
  });

  it("keeps a backward selection backward: the anchor is where it began", () => {
    const p = page();
    p.inputs.selection = { start: 6, end: 11, backward: true };
    hello(p);
    const { caret } = states(p)[0]!["c-me"];
    const text = cloudDoc(p.doc).files.get(API)!;
    expect(positionIn(caret.anchor, p.doc, text)).toBe(11);
    expect(positionIn(caret.head, p.doc, text)).toBe(6);
  });
});

describe("when the page publishes", () => {
  it("sends nothing before the room's hello, and the whole state at it", () => {
    const p = page();
    p.inputs.selection = { start: 3, end: 3 };
    p.presence.moved();
    expect(p.sent).toEqual([]);
    p.presence.phase("open");
    expect(p.sent).toEqual([]);
    p.presence.opened({ id: "c1" });
    expect(p.sent).toHaveLength(1);
    expect(states(p)[0]!["c1"].file).toBe(API);
  });

  it("sends nothing while nothing is attached", () => {
    const p = page({ attach: false });
    hello(p);
    p.timers.advance(HEARTBEAT_MS * 3);
    expect(p.sent).toEqual([]);
    expect(p.timers.waiting).toBe(0);
  });

  it("sends a move at once, and a burst of moves as one message with the last of them", () => {
    const p = page();
    hello(p);
    p.timers.advance(THROTTLE_MS);
    p.sent.length = 0;
    p.inputs.selection = { start: 1, end: 1 };
    p.presence.moved();
    expect(p.sent).toHaveLength(1);
    for (let i = 2; i <= 9; i++) {
      p.timers.advance(10);
      p.inputs.selection = { start: i, end: i };
      p.presence.moved();
    }
    // Eight more moves in eighty milliseconds: still just the first message.
    expect(p.sent).toHaveLength(1);
    p.timers.advance(THROTTLE_MS);
    expect(p.sent).toHaveLength(2);
    const text = cloudDoc(p.doc).files.get(API)!;
    const last = states(p)[1]!["c-me"].caret;
    expect(positionIn(last.head, p.doc, text)).toBe(9);
  });

  it("sends at most four messages a second however much the person moves", () => {
    const p = page();
    hello(p);
    p.sent.length = 0;
    for (let at = 0; at < 2000; at += 10) {
      p.inputs.selection = { start: (at / 10) % 20, end: (at / 10) % 20 };
      p.presence.moved();
      p.timers.advance(10);
    }
    // Two seconds of constant movement: a message per window, never faster.
    expect(p.sent.length).toBeLessThanOrEqual(2000 / THROTTLE_MS + 1);
    expect(p.sent.length).toBeGreaterThanOrEqual(2000 / THROTTLE_MS - 1);
  });

  it("does not send a state the room already has", () => {
    const p = page();
    hello(p);
    p.sent.length = 0;
    // The pane reports the same place, and a different one that names the same characters.
    p.presence.moved();
    p.timers.advance(THROTTLE_MS * 2);
    expect(p.sent).toEqual([]);
    p.inputs.canvas = [];
    p.presence.moved();
    expect(p.sent).toEqual([]);
  });

  it("sends the state again every fifteen seconds as a heartbeat, even if it did not change", () => {
    const p = page();
    hello(p);
    expect(p.sent).toHaveLength(1);
    p.timers.advance(HEARTBEAT_MS - 1);
    expect(p.sent).toHaveLength(1);
    p.timers.advance(1);
    expect(p.sent).toHaveLength(2);
    expect(states(p)[1]).toEqual(states(p)[0]);
    p.timers.advance(HEARTBEAT_MS);
    expect(p.sent).toHaveLength(3);
  });

  it("counts the fifteen seconds from the last message, whatever sent it", () => {
    const p = page();
    hello(p);
    p.timers.advance(10_000);
    p.inputs.selection = { start: 4, end: 4 };
    p.presence.moved();
    expect(p.sent).toHaveLength(2);
    p.timers.advance(HEARTBEAT_MS - 1);
    expect(p.sent).toHaveLength(2);
    p.timers.advance(1);
    expect(p.sent).toHaveLength(3);
  });

  it("keeps what it could not send for the next hello", () => {
    const p = page();
    hello(p);
    p.socket.up = false;
    p.sent.length = 0;
    p.inputs.selection = { start: 5, end: 5 };
    p.presence.moved();
    p.timers.advance(THROTTLE_MS * 3);
    expect(p.sent).toEqual([]);
    p.socket.up = true;
    p.presence.resend();
    expect(p.sent).toHaveLength(1);
  });

  it("starts publishing when a source is attached after the hello", () => {
    const p = page({ attach: false });
    hello(p);
    expect(p.sent).toEqual([]);
    p.presence.attach({ open: () => WEB_PATH, selection: () => undefined, canvas: () => [] });
    expect(states(p)).toEqual([{ "c-me": { file: WEB } }]);
  });

  it("leaves no timer behind when it is destroyed", () => {
    const p = page();
    hello(p);
    p.presence.receive(relayed(p.sent[0]!, "c-ben", { sub: "u_ben", name: "Ben" }));
    expect(p.timers.waiting).toBeGreaterThan(0);
    p.presence.destroy();
    expect(p.timers.waiting).toBe(0);
    p.presence.moved();
    p.presence.receive(relayed(p.sent[0]!, "c-eva", { sub: "u_eva", name: "Eva" }));
    expect(p.presence.peers).toEqual([]);
  });
});

describe("the connection coming and going", () => {
  it("leaves no peers and no sends while the socket is not open", () => {
    const p = page();
    hello(p);
    p.presence.receive(relayed(p.sent[0]!, "c-ben", { sub: "u_ben", name: "Ben" }));
    expect(p.presence.peers).toHaveLength(1);
    const told = p.changes.count;
    p.presence.phase("waiting");
    expect(p.presence.peers).toEqual([]);
    expect(p.changes.count).toBe(told + 1);
    expect(p.timers.waiting).toBe(0);
    p.sent.length = 0;
    p.inputs.selection = { start: 7, end: 7 };
    p.presence.moved();
    p.timers.advance(HEARTBEAT_MS * 2);
    expect(p.sent).toEqual([]);
  });

  it("sends the state again at the next hello, though the room had it before the drop", () => {
    const p = page();
    p.inputs.selection = { start: 2, end: 4 };
    hello(p);
    const first = states(p)[0]!["c-me"];
    p.presence.phase("waiting");
    p.presence.phase("connecting");
    p.presence.phase("open");
    p.presence.opened({ id: "c-me-2", sub: "u_ana" });
    expect(p.sent).toHaveLength(2);
    // The room knows this connection as someone new: the same state, under the new id.
    expect(states(p)[1]).toEqual({ "c-me-2": first });
  });

  it("sends the move made while the socket was down at the next hello", () => {
    const p = page();
    hello(p);
    p.presence.phase("waiting");
    p.inputs.selection = { start: 9, end: 9 };
    p.presence.moved();
    p.presence.phase("open");
    p.presence.opened({ id: "c-me" });
    const text = cloudDoc(p.doc).files.get(API)!;
    expect(positionIn(states(p).at(-1)!["c-me"].caret.head, p.doc, text)).toBe(9);
  });

  it("keeps the peers the room tells about before its hello", () => {
    const p = page();
    p.presence.phase("connecting");
    const other = page();
    other.presence.attach({
      open: () => API_PATH,
      selection: () => ({ start: 1, end: 1 }),
      canvas: () => [],
    });
    hello(other, { id: "c-ben" });
    p.presence.receive(relayed(other.sent[0]!, "c-ben", { sub: "u_ben", name: "Ben" }));
    p.presence.phase("open");
    p.presence.opened({ id: "c-me" });
    expect(p.presence.peers.map((peer) => peer.name)).toEqual(["Ben"]);
  });
});

describe("the others", () => {
  /** Ben's page publishes; Ana's page hears what the room relays. */
  function pair() {
    const timers = new ManualTimers();
    const ana = page({ timers });
    const ben = page({ timers, doc: new Y.Doc() });
    Y.applyUpdate(ben.doc, Y.encodeStateAsUpdate(ana.doc));
    hello(ana, { id: "c-ana", sub: "u_ana", name: "Ana" });
    hello(ben, { id: "c-ben", sub: "u_ben", name: "Ben" });
    const deliver = (from: Page, id: string, who: { sub: string; name: string }, to: Page) => {
      // What the sender's page had to say has been said by now (a move waits at most a window).
      timers.advance(THROTTLE_MS);
      to.presence.receive(relayed(from.sent.at(-1)!, id, who));
    };
    const sync = () => {
      Y.applyUpdate(ben.doc, Y.encodeStateAsUpdate(ana.doc, Y.encodeStateVector(ben.doc)));
      Y.applyUpdate(ana.doc, Y.encodeStateAsUpdate(ben.doc, Y.encodeStateVector(ana.doc)));
    };
    return { timers, ana, ben, deliver, sync };
  }
  const BEN = { sub: "u_ben", name: "Ben" };

  it("show where they are: Ben selects a word and Ana sees it, in his colour, with his name", () => {
    const { ana, ben, deliver } = pair();
    ben.inputs.selection = { start: 6, end: 11 };
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    const carets = ana.presence.carets(API_PATH, "hello world\nsecond line", "Someone");
    expect(carets).toEqual([
      {
        id: "c-ben",
        name: "Ben",
        colour: presenceColour("u_ben"),
        guest: false,
        head: 11,
        start: 6,
        end: 11,
        movedAt: expect.any(Number),
      },
    ]);
    const people = ana.presence.people();
    expect(people).toEqual([
      {
        sub: "u_ben",
        name: "Ben",
        picture: undefined,
        colour: presenceColour("u_ben"),
        guest: false,
        file: { id: API, path: API_PATH },
        connections: 1,
      },
    ]);
  });

  it("converge on the same characters when both edit the same line at once", () => {
    const { ana, ben, deliver, sync } = pair();
    ben.inputs.selection = { start: 6, end: 11 };
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    // At the same moment Ana types at the start of the line and Ben types in the middle of it.
    const anaText = cloudDoc(ana.doc).files.get(API)!;
    const benText = cloudDoc(ben.doc).files.get(API)!;
    anaText.insert(0, "ANA ");
    benText.insert(3, "ben");
    sync();
    expect(anaText.toString()).toBe(benText.toString());
    const [caret] = ana.presence.carets(API_PATH, anaText.toString(), "Someone");
    expect(anaText.toString().slice(caret!.start, caret!.end)).toBe("world");
  });

  it("follow their text through edits that arrive after the state did", () => {
    const { ana, ben, deliver } = pair();
    ben.inputs.selection = { start: 6, end: 11 };
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    const anaText = cloudDoc(ana.doc).files.get(API)!;
    anaText.insert(0, ">>> ");
    const [caret] = ana.presence.carets(API_PATH, anaText.toString(), "Someone");
    expect([caret!.start, caret!.end]).toEqual([10, 15]);
  });

  it("are in the header with the file they have open, and in no file's pane but their own", () => {
    const { ana, ben, deliver } = pair();
    ben.inputs.open = WEB_PATH;
    ben.inputs.selection = { start: 2, end: 2 };
    ben.presence.moved();
    ben.timers.advance(THROTTLE_MS);
    deliver(ben, "c-ben", BEN, ana);
    expect(ana.presence.people()[0]?.file?.path).toBe(WEB_PATH);
    expect(ana.presence.carets(API_PATH, "hello world\nsecond line", "?")).toEqual([]);
    expect(ana.presence.carets(WEB_PATH, "web page", "?")).toHaveLength(1);
  });

  it("keep their place when a file is renamed, and show its new name", () => {
    const { ana, ben, deliver, sync } = pair();
    ben.inputs.selection = { start: 6, end: 11 };
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    cloudDoc(ana.doc).paths.set(API, "diagrams/backend.meltemi");
    sync();
    expect(ana.presence.people()[0]?.file).toEqual({ id: API, path: "diagrams/backend.meltemi" });
    expect(
      ana.presence.carets("diagrams/backend.meltemi", "hello world\nsecond line", "?"),
    ).toHaveLength(1);
    // The old name is no file any more.
    expect(ana.presence.carets(API_PATH, "hello world\nsecond line", "?")).toEqual([]);
  });

  it("ignore a state of a file the page does not have, but list the person", () => {
    const { ana, ben, deliver } = pair();
    // Ben's page knows a file Ana's lacks.
    addTextFile(cloudDoc(ben.doc), "diagrams/new.meltemi", "new", { id: "ccccccccccccccc2" });
    ben.inputs.open = "diagrams/new.meltemi";
    ben.inputs.selection = { start: 1, end: 2 };
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    expect(ana.presence.peers).toHaveLength(1);
    expect(ana.presence.carets(API_PATH, "hello world\nsecond line", "?")).toEqual([]);
    expect(ana.presence.carets(WEB_PATH, "web page", "?")).toEqual([]);
    expect(ana.presence.people()).toMatchObject([{ name: "Ben", file: undefined }]);
  });

  it("show the canvas selection of the people who have the same file open", () => {
    const { ana, ben, deliver } = pair();
    ben.inputs.canvas = ["api", "db"];
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    expect(ana.presence.canvas(API_PATH, "Someone")).toEqual([
      { name: "Ben", colour: presenceColour("u_ben"), selection: ["api", "db"] },
    ]);
    expect(ana.presence.canvas(WEB_PATH, "Someone")).toEqual([]);
  });

  it("take their identity from the room alone, whatever the payload they sent claims", () => {
    const { ana } = pair();
    // A payload as it would reach the page if a peer's own claims were passed on beside the room's.
    ana.presence.receive(
      encoder.encode(
        JSON.stringify({
          "c-ben": {
            file: API,
            caret: { anchor: "AAA=", head: "AAA=", user: { sub: "u_ana", name: "Ana" } },
            canvas: { selection: ["api"], user: { sub: "u_ana", name: "Ana" } },
            name: "Ana",
            sub: "u_ana",
            picture: "https://evil.example/ana.png",
            colour: "#00ff00",
            user: { sub: "u_ben", name: "Ben", picture: "", colour: "#00ff00" },
          },
        }),
      ),
    );
    const [peer] = ana.presence.peers;
    expect(peer).toMatchObject({ sub: "u_ben", name: "Ben", picture: undefined });
    expect(peer?.colour).toBe(presenceColour("u_ben"));
    // Ana's own account is not listed, and nobody is called Ana.
    expect(ana.presence.people().map((person) => person.name)).toEqual(["Ben"]);
  });

  it("ignore messages that are not states, without throwing", () => {
    const { ana } = pair();
    for (const junk of [
      new Uint8Array(0),
      encoder.encode("{"),
      encoder.encode("null"),
      encoder.encode('{"c1":7}'),
      encoder.encode('{"c1":{"file":"x"}}'),
      encoder.encode('{"c1":{"user":{"sub":""}}}'),
      new Uint8Array([255, 254, 253]),
    ]) {
      expect(() => ana.presence.receive(junk)).not.toThrow();
    }
    expect(ana.presence.peers).toEqual([]);
  });

  it("do not include this page's own connection", () => {
    const { ana, ben, deliver } = pair();
    ben.presence.moved();
    deliver(ben, "c-ana", { sub: "u_ana", name: "Ana" }, ana);
    expect(ana.presence.peers).toEqual([]);
  });

  it("are not listed for this account's other windows, which are not another person", () => {
    const { ana, ben, deliver } = pair();
    ben.presence.moved();
    deliver(ben, "c-ana-2", { sub: "u_ana", name: "Ana" }, ana);
    expect(ana.presence.peers).toHaveLength(1);
    expect(ana.presence.people()).toEqual([]);
  });

  it("disappear when the room says they are gone", () => {
    const { ana, ben, deliver } = pair();
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    const told = ana.changes.count;
    ana.presence.receive(encoder.encode(JSON.stringify({ "c-ben": null })));
    expect(ana.presence.peers).toEqual([]);
    expect(ana.changes.count).toBe(told + 1);
  });

  it("are not told again about a heartbeat that changes nothing", () => {
    const { ana, ben, deliver, timers } = pair();
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    const told = ana.changes.count;
    timers.advance(HEARTBEAT_MS);
    deliver(ben, "c-ben", BEN, ana);
    expect(ana.changes.count).toBe(told);
  });

  it("go on their own when the room never says they left, a while after it last spoke of them", () => {
    const { ana, ben, deliver, timers } = pair();
    ben.presence.moved();
    deliver(ben, "c-ben", BEN, ana);
    expect(ana.presence.peers).toHaveLength(1);
    timers.advance(PEER_TIMEOUT_MS - 1_000);
    expect(ana.presence.peers).toHaveLength(1);
    // A heartbeat keeps a person here.
    timers.advance(0);
    deliver(ben, "c-ben", BEN, ana);
    timers.advance(PEER_TIMEOUT_MS - 1_000);
    expect(ana.presence.peers).toHaveLength(1);
    timers.advance(HEARTBEAT_MS * 4);
    expect(ana.presence.peers).toEqual([]);
  });

  it("show a stroke Ben draws batch by batch, with its pen part, to the canvas of the same diagram", () => {
    const { ana, ben, deliver } = pair();
    const pen = { width: 4, colour: "#e03131", opacity: 1, stroke: 1 };
    const first = Array.from({ length: 10 }, (_, i) => ({ x: 10 + i, y: 20, t: i * 10 }));
    const second = Array.from({ length: 10 }, (_, i) => ({ x: 20 + i, y: 20, t: i * 10 }));
    ben.presence.laser(first, "flow", pen);
    deliver(ben, "c-ben", BEN, ana);
    const person = { name: "Ben", colour: presenceColour("u_ben"), selection: [] };
    expect(presenceMessage(ana.presence.canvas(API_PATH, "Someone", "flow"))).toEqual({
      type: "presence",
      people: [{ ...person, laser: { batch: 1, points: first, pen } }],
    });
    ben.presence.laser(second, "flow", pen);
    deliver(ben, "c-ben", BEN, ana);
    expect(ana.presence.canvas(API_PATH, "Someone", "flow")).toEqual([
      { ...person, laser: { batch: 2, points: second, pen } },
    ]);
    // Over another diagram of the file the points are not this one's: nothing is drawn.
    expect(ana.presence.canvas(API_PATH, "Someone", "other")).toEqual([]);
  });
});

describe("the page's own state", () => {
  it("is read from the Studio and the code pane: the open file, and the ids the canvas selected", () => {
    const studio = newStudio();
    const pane = new FakePane(studio);
    studio.load(
      [[API_PATH, 'diagram a: flow {\n  title "a"\n  x["X"]\n  y["Y"]\n  x -> y\n}\n']],
      API_PATH,
    );
    pane.select(4, 9);
    const source = studioSource(studio, () => pane.selection);
    expect(source.open()).toBe(API_PATH);
    expect(source.selection()).toEqual({ start: 4, end: 9 });
    expect(source.canvas()).toEqual([]);
    // The canvas reports its selection to the session, as it does for the extension.
    studio.receive({ type: "select", ids: ["x", "y"] });
    expect(source.canvas()).toEqual(["x", "y"]);
    expect(Array.isArray(source.canvas())).toBe(true);
  });

  it("has no canvas selection when no file is open", () => {
    const studio = newStudio();
    const source = studioSource(studio, () => undefined);
    expect(source.open()).toBe("");
    expect(source.canvas()).toEqual([]);
  });
});

describe("a canvas selection, as much of it as the room takes", () => {
  it("leaves out ids that are empty or absurdly long, and keeps the order of the rest", () => {
    expect(fitSelection(["a", "", "b", "x".repeat(201), "c"])).toEqual(["a", "b", "c"]);
  });

  it("is no more than 200 ids", () => {
    expect(fitSelection(Array.from({ length: 1000 }, (_, i) => `id${i}`))).toHaveLength(200);
  });

  it("stays under what a message of the room may hold, however long and wide the ids are", () => {
    const long = fitSelection(Array.from({ length: 200 }, (_, i) => `${i}`.padEnd(200, "x")));
    expect(long.length).toBeLessThan(200);
    const wide = fitSelection(Array.from({ length: 200 }, () => "é".repeat(150)));
    for (const ids of [long, wide]) {
      const bytes = new TextEncoder().encode(JSON.stringify({ canvas: { selection: ids } }));
      expect(bytes.byteLength).toBeLessThan(16 * 1024 - 1024);
    }
  });
});

describe("the page's address", () => {
  it("is the room's with the scheme of the page", () => {
    expect(pageOf("wss://diagrams.example/rooms/abc")).toBe("https://diagrams.example");
    expect(pageOf("ws://127.0.0.1:8787/rooms/abc")).toBe("http://127.0.0.1:8787");
    expect(pageOf("not an address")).toBe("not an address");
  });
});

describe("the Pointer trail", () => {
  /** Points of a stroke 10 ms apart, along x. */
  const stroke = (count: number, from = 0) =>
    Array.from({ length: count }, (_, i) => ({ x: from + i * 4, y: 10, t: i * 10 }));
  const laserOf = (p: Page) =>
    (states(p).at(-1)!["c-me"].canvas as { laser?: { diagram?: string; points: unknown[] } }).laser;

  it("leaves in the next state, and a heartbeat carries none", () => {
    const p = page();
    hello(p);
    p.presence.laser(stroke(5), "flow");
    // The window of the hello's send is still open: the stroke waits for it to end.
    expect(p.sent).toHaveLength(1);
    p.timers.advance(THROTTLE_MS);
    expect(p.sent).toHaveLength(2);
    expect(laserOf(p)).toEqual({ diagram: "flow", points: stroke(5) });
    p.timers.advance(HEARTBEAT_MS);
    const heartbeat = states(p).at(-1)!["c-me"];
    expect(heartbeat.canvas).toBeUndefined();
    expect(p.sent.length).toBeGreaterThanOrEqual(3);
  });

  it("makes a canvas part on its own, with an empty selection", () => {
    const p = page();
    hello(p);
    p.presence.laser(stroke(2));
    p.timers.advance(THROTTLE_MS);
    expect(states(p).at(-1)!["c-me"].canvas).toEqual({
      selection: [],
      laser: { points: stroke(2) },
    });
  });

  it("keeps the most recent 64 points of a long stroke, from 0", () => {
    const p = page();
    hello(p);
    p.presence.laser(Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0, t: i * 5 })));
    p.timers.advance(THROTTLE_MS);
    const points = laserOf(p)!.points as { x: number; t: number }[];
    expect(points).toHaveLength(64);
    expect(points[0]).toMatchObject({ x: 36, t: 0 });
    expect(points[63]).toMatchObject({ x: 99 });
    for (let i = 1; i < points.length; i++) expect(points[i]!.t).toBeGreaterThan(points[i - 1]!.t);
  });

  it("joins the strokes of one window, the later ones where their time puts them", () => {
    const p = page();
    hello(p);
    p.presence.laser(stroke(5));
    p.timers.advance(100);
    p.presence.laser(stroke(3, 200));
    p.timers.advance(THROTTLE_MS);
    const points = laserOf(p)!.points as { x: number; t: number }[];
    expect(points).toHaveLength(8);
    expect(points[0]!.t).toBe(0);
    // The first began 40 ms before it was posted; the second 20 ms before 100 ms later: 120 apart.
    expect(points[5]).toMatchObject({ x: 200, t: 120 });
  });

  it("sends no stale stroke: one made before the hello, or while the socket was closed", () => {
    const p = page();
    p.presence.laser(stroke(3));
    hello(p);
    expect((states(p)[0]!["c-me"] as { canvas?: unknown }).canvas).toBeUndefined();
    p.presence.laser(stroke(3));
    p.presence.phase("idle");
    p.presence.phase("open");
    p.timers.advance(THROTTLE_MS);
    expect(p.sent).toHaveLength(1);
  });

  it("is not published for an empty stroke", () => {
    const p = page();
    hello(p);
    p.presence.laser([]);
    p.timers.advance(THROTTLE_MS);
    expect(p.sent).toHaveLength(1);
  });

  it("names the colour the others see: the account's, once the room said who this is", () => {
    const p = page();
    expect(p.presence.colour).toBeUndefined();
    hello(p);
    expect(p.presence.colour).toBe(presenceColour("u_ana"));
  });
});

describe("a stroke of the pen or the highlighter", () => {
  /** Points of a stroke 10 ms apart, along x. */
  const stroke = (count: number, from = 0) =>
    Array.from({ length: count }, (_, i) => ({ x: from + i * 4, y: 10, t: i * 10 }));
  const PEN = { width: 4, colour: "#e03131", opacity: 1, stroke: 1 };
  const HIGHLIGHTER = { width: 20, colour: "#ffd43b", opacity: 0.35, stroke: 1 };
  const laserOf = (p: Page) =>
    (states(p).at(-1)!["c-me"].canvas as { laser?: LaserBatch } | undefined)?.laser;

  it("leaves with its pen part in the next state, in the same message, and a heartbeat carries none", () => {
    const p = page();
    hello(p);
    p.inputs.canvas = ["api"];
    p.presence.pointer({ x: 52, y: 10, diagram: "flow" });
    p.presence.laser(stroke(5), "flow", PEN);
    // The window of the hello's send is still open: the stroke waits for it to end, as a trail does.
    expect(p.sent).toHaveLength(1);
    p.timers.advance(THROTTLE_MS);
    expect(p.sent).toHaveLength(2);
    expect(states(p).at(-1)!["c-me"].canvas).toEqual({
      selection: ["api"],
      pointer: { x: 52, y: 10, diagram: "flow" },
      laser: { diagram: "flow", points: stroke(5), pen: PEN },
    });
    p.timers.advance(HEARTBEAT_MS);
    expect(p.sent.length).toBeGreaterThanOrEqual(3);
    expect(laserOf(p)).toBeUndefined();
  });

  it("goes out batch by batch while it is drawn, each with the pen part, at the throttle's pace", () => {
    const p = page();
    hello(p);
    p.timers.advance(THROTTLE_MS);
    p.presence.laser(stroke(3), "flow", HIGHLIGHTER);
    expect(laserOf(p)).toEqual({ diagram: "flow", points: stroke(3), pen: HIGHLIGHTER });
    // The next batch, 50 ms later, waits for the window of the first.
    p.timers.advance(50);
    p.presence.laser(stroke(3, 12), "flow", HIGHLIGHTER);
    p.timers.advance(50);
    p.presence.laser(stroke(3, 24), "flow", HIGHLIGHTER);
    expect(p.sent).toHaveLength(2);
    p.timers.advance(THROTTLE_MS - 100);
    expect(p.sent).toHaveLength(3);
    const joined = laserOf(p)!;
    expect(joined.pen).toEqual(HIGHLIGHTER);
    expect(joined.points.map((point) => point.x)).toEqual([12, 16, 20, 24, 28, 32]);
    expect(joined.points[0]!.t).toBe(0);
    expect(joined.points[3]!.t).toBe(50);
  });

  it("never joins points of another look in a batch: a stroke and a trail are never one batch", () => {
    const p = page();
    hello(p);
    // A Pointer's trail, then a stroke of the pen in the same window: the trail is let go of.
    p.presence.laser(stroke(3), "flow");
    p.timers.advance(100);
    p.presence.laser(stroke(2, 100), "flow", PEN);
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)).toEqual({ diagram: "flow", points: stroke(2, 100), pen: PEN });
    // A stroke of the pen, then one of the highlighter: the second goes in the state after.
    p.timers.advance(THROTTLE_MS);
    const highlighter = { ...HIGHLIGHTER, stroke: 2 };
    p.presence.laser(stroke(3), "flow", { ...PEN, stroke: 2 });
    p.presence.laser(stroke(2, 100), "flow", highlighter);
    expect(laserOf(p)).toEqual({ diagram: "flow", points: stroke(3), pen: { ...PEN, stroke: 2 } });
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)).toEqual({ diagram: "flow", points: stroke(2, 100), pen: highlighter });
    // A stroke, then the Pointer's trail: the trail waits behind it.
    p.timers.advance(THROTTLE_MS);
    p.presence.laser(stroke(3), "flow", { ...PEN, stroke: 3 });
    p.presence.laser(stroke(2, 100), "flow");
    expect(laserOf(p)).toEqual({ diagram: "flow", points: stroke(3), pen: { ...PEN, stroke: 3 } });
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)).toEqual({ diagram: "flow", points: stroke(2, 100) });
  });

  it("joins the batches of one stroke in a window, though the pen part is another object", () => {
    const p = page();
    hello(p);
    p.presence.laser(stroke(3), "flow", PEN);
    p.presence.laser(stroke(2, 12), "flow", { ...PEN });
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)?.points).toHaveLength(5);
    expect(laserOf(p)?.pen).toEqual(PEN);
  });

  it("is not sent with a pen part out of the room's bounds, which would cost the whole state", () => {
    for (const pen of [
      { ...PEN, width: 0 },
      { ...PEN, width: 65 },
      { ...PEN, width: 2.5 },
      { ...PEN, colour: "#".padEnd(33, "f") },
      { ...PEN, opacity: 1.5 },
      { ...PEN, opacity: -0.1 },
      { ...PEN, opacity: Number.NaN },
      { ...PEN, stroke: -1 },
      { ...PEN, stroke: 2_147_483_648 },
      { ...PEN, stroke: 0.5 },
      { ...PEN, cancel: false as unknown as true },
    ]) {
      const p = page();
      hello(p);
      p.presence.laser(stroke(3), "flow", pen);
      p.timers.advance(THROTTLE_MS);
      expect(p.sent, JSON.stringify(pen)).toHaveLength(1);
    }
  });

  it("takes the edges of the bounds, and nothing of the pen part but its width, colour, opacity and number", () => {
    const p = page();
    hello(p);
    const edge = { width: 64, colour: "#".padEnd(32, "f"), opacity: 0, stroke: 2_147_483_647 };
    p.presence.laser(stroke(2), "flow", { ...edge, dash: [4, 2] } as LaserBatch["pen"]);
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)?.pen).toEqual(edge);
    p.timers.advance(THROTTLE_MS);
    p.presence.laser(stroke(2), "flow", { width: 1, colour: "#000", opacity: 1, stroke: 0 });
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)?.pen).toEqual({ width: 1, colour: "#000", opacity: 1, stroke: 0 });
  });

  it("stays under what a message of the room may hold, with the longest selection, batch and pen part", () => {
    const p = page();
    hello(p);
    p.inputs.canvas = Array.from({ length: 200 }, (_, i) => `${i}`.padEnd(200, "x"));
    p.inputs.selection = { start: 0, end: 11 };
    p.presence.pointer({ x: -999_999, y: -999_999, diagram: "d".repeat(200) });
    // The canvas sends its points to a tenth.
    const longest = Array.from({ length: 64 }, (_, i) => ({
      x: Math.round((-999_999.9 + i) * 10) / 10,
      y: -999_999.9,
      t: i * 15,
    }));
    p.presence.laser(longest, "d".repeat(200), {
      width: 64,
      colour: "#".padEnd(32, "f"),
      opacity: 0.35,
      stroke: 2_147_483_647,
    });
    p.presence.laser([], "d".repeat(200), {
      width: 64,
      colour: "#".padEnd(32, "f"),
      opacity: 0.35,
      stroke: 2_147_483_647,
      cancel: true,
    });
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)?.points).toHaveLength(64);
    expect(laserOf(p)?.pen?.cancel).toBe(true);
    expect(p.sent.at(-1)!.byteLength).toBeLessThan(16 * 1024);
  });

  it("goes with its number, the same in every batch of one stroke and another for the next", () => {
    const p = page();
    hello(p);
    p.timers.advance(THROTTLE_MS);
    p.presence.laser(stroke(3), "flow", PEN);
    expect(laserOf(p)?.pen?.stroke).toBe(1);
    p.timers.advance(THROTTLE_MS);
    p.presence.laser(stroke(3, 12), "flow", { ...PEN, stroke: 2 });
    expect(laserOf(p)).toEqual({
      diagram: "flow",
      points: stroke(3, 12),
      pen: { ...PEN, stroke: 2 },
    });
  });

  it("sends the end of a stroke before the next stroke that starts in the same window", () => {
    const p = page();
    hello(p);
    // The end of stroke 1, and stroke 2 begun 100 ms later, before the window ends.
    p.presence.laser(stroke(3), "flow", PEN);
    p.timers.advance(100);
    p.presence.laser(stroke(2, 100), "flow", { ...PEN, stroke: 2 });
    p.presence.laser(stroke(2, 108), "flow", { ...PEN, stroke: 2 });
    expect(p.sent).toHaveLength(1);
    p.timers.advance(THROTTLE_MS - 100);
    expect(p.sent).toHaveLength(2);
    expect(laserOf(p)).toEqual({ diagram: "flow", points: stroke(3), pen: PEN });
    // The next stroke, whole, in the state after.
    p.timers.advance(THROTTLE_MS);
    expect(p.sent).toHaveLength(3);
    expect(laserOf(p)?.pen).toEqual({ ...PEN, stroke: 2 });
    expect(laserOf(p)?.points.map((point) => point.x)).toEqual([100, 104, 108, 112]);
    // Nothing more waits.
    p.timers.advance(THROTTLE_MS * 4);
    expect(p.sent).toHaveLength(3);
  });

  it("sends the cancel of a stroke, with its last points or none, and never loses it to the next", () => {
    const p = page();
    hello(p);
    p.timers.advance(THROTTLE_MS);
    p.presence.laser(stroke(3), "flow", PEN);
    expect(laserOf(p)?.pen).toEqual(PEN);
    // Escape: the cancel comes with no points, and goes in the next state.
    p.presence.laser([], "flow", { ...PEN, cancel: true });
    // A new stroke at once: it waits behind the cancel.
    p.presence.laser(stroke(2, 40), "flow", { ...PEN, stroke: 2 });
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)).toEqual({ diagram: "flow", points: [], pen: { ...PEN, cancel: true } });
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)).toEqual({
      diagram: "flow",
      points: stroke(2, 40),
      pen: { ...PEN, stroke: 2 },
    });
    // A cancel that joins the stroke's last points in the window carries them.
    p.timers.advance(THROTTLE_MS);
    p.presence.laser(stroke(2), "flow", { ...PEN, stroke: 3 });
    p.presence.laser(stroke(2, 8), "flow", { ...PEN, stroke: 3 });
    p.presence.laser([], "flow", { ...PEN, stroke: 3, cancel: true });
    p.timers.advance(THROTTLE_MS);
    expect(laserOf(p)?.pen).toEqual({ ...PEN, stroke: 3, cancel: true });
    expect(laserOf(p)?.points.map((point) => point.x)).toEqual([8, 12]);
  });
});
