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
import { positionIn } from "../src/cloud/presence-wire.js";
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
