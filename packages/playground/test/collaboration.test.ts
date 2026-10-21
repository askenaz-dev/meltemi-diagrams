// Collaboration in Node (`live-collaboration`, "Editing together"): two or three devices, each a real
// Studio with a code pane stand-in and the binding to its own Yjs document, joined by a room that
// delivers when the test says so. Edits are interleaved: devices type, drag and delete before they
// have heard of each other's changes, updates reach them late and in the wrong order, and the end
// state is checked on every page and in the room.
//
// What the other tests already cover, so that this file adds only what is missing (audit of task 3.1):
// - `binding.test.ts`: devices that edit different lines and then sync; a caret kept through a remote
//   change; a person's undo that never reaches a change of the other device (one after the other).
// - `cloud-presence.test.ts` / `cloud-presence-wire.test.ts`: two documents typed in at the same
//   place as raw text, and a relative position through one concurrent insert at the start.
// - `cloud-presence-project.test.ts`: two open projects, a selection that follows what the other types.
// What was missing, and is here: the same position typed key by key from both devices through the
// binding; a canvas edit interleaved with typing; three devices; updates delivered late and reversed;
// a seeded stress of random edits with random delivery; the undo of each device after the merge, in
// every case, removing its own characters and nobody else's (and redo); a remote change in the middle
// of a typing step; relative positions through many concurrent edits at once, read the same on every
// document including one that joined late.
//
// The clock is faked for the whole file, and before the imports: Yjs reads `Date.now` once, when it
// loads, to time the coalescing of undo steps (see `binding.test.ts`).
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.useFakeTimers();
});

import * as Y from "yjs";
import { SEND_INTERVAL } from "../src/cloud/binding.js";
import { REMOTE, addTextFile, cloudDoc, resolveFiles } from "../src/cloud/doc.js";
import { drawnCarets, type Peer } from "../src/cloud/presence-model.js";
import { encodeCaret, positionIn } from "../src/cloud/presence-wire.js";
import { device, texts, type Device } from "./support/cloud.js";

const advance = (milliseconds: number) => vi.advanceTimersByTime(milliseconds);

/** A pause long enough to end a typing step (700 ms) and to let a send leave. */
const PAUSE = 800;

const FILE = "notes.md";
const BASE = "line one\nline two\nline three\n";

/** A document holding these text files, as a room would hold it. */
function seeded(files: Record<string, string>): Uint8Array {
  const doc = new Y.Doc();
  for (const [path, text] of Object.entries(files)) {
    addTextFile(cloudDoc(doc), path, text, { origin: REMOTE });
  }
  return Y.encodeStateAsUpdate(doc);
}

/** The Yjs text of a file in a document. */
function textIn(doc: Y.Doc, path = FILE): Y.Text {
  const file = [...resolveFiles(cloudDoc(doc)).files.values()].find((f) => f.shown === path);
  if (!file?.text) throw new Error(`no text file ${path}`);
  return file.text;
}

/**
 * A room between devices: what a device hands out waits here until `take` collects it, the room
 * applies it to its own document, and queues it for every other device until `deliver` hands it over.
 * Nothing is delivered unless the test says so, so edits made before another's arrival are concurrent.
 */
class Relay {
  readonly doc = new Y.Doc();
  private readonly taken = new Map<Device, number>();
  private readonly inbox = new Map<Device, Uint8Array[]>();

  constructor(
    readonly devices: Device[],
    state?: Uint8Array,
  ) {
    if (state) Y.applyUpdate(this.doc, state, REMOTE);
    for (const member of devices) this.add(member);
  }

  add(member: Device): void {
    this.taken.set(member, member.sent.length);
    this.inbox.set(member, []);
    if (!this.devices.includes(member)) this.devices.push(member);
  }

  /** The room takes what the devices handed out since the last time and queues it for the others. */
  take(): void {
    for (const from of this.devices) {
      for (const update of from.sent.slice(this.taken.get(from))) {
        Y.applyUpdate(this.doc, update, from);
        for (const other of this.devices) if (other !== from) this.inbox.get(other)?.push(update);
      }
      this.taken.set(from, from.sent.length);
    }
  }

  /** How many updates wait for a device. */
  waiting(member: Device): number {
    return this.inbox.get(member)?.length ?? 0;
  }

  /** Hands a device what waits for it (the first `count` of it), in the order sent or reversed. */
  deliver(member: Device, options: { reversed?: boolean; count?: number } = {}): void {
    const batch = (this.inbox.get(member) ?? []).splice(0, options.count ?? Infinity);
    if (options.reversed) batch.reverse();
    for (const update of batch) member.binding.apply(update);
  }

  /** Everything the devices made reaches the room and every device. */
  settle(): void {
    for (let round = 0; round < 4; round++) {
      for (const member of this.devices) member.binding.flush();
      this.take();
      for (const member of this.devices) this.deliver(member);
    }
  }

  text(path = FILE): string {
    return textIn(this.doc, path).toString();
  }
}

/** Decoded state vector of a document, to compare what two documents know. */
const known = (doc: Y.Doc) => [...Y.decodeStateVector(Y.encodeStateVector(doc))].sort();

/** After the relay settled: one text on every page, every document and the room. */
function expectOneText(relay: Relay, path = FILE): string {
  relay.settle();
  const text = relay.text(path);
  for (const member of relay.devices) {
    expect(textIn(member.doc, path).toString(), `${member.name}'s document`).toBe(text);
    expect(member.studio.text(path), `${member.name}'s studio`).toBe(text);
    expect(texts(member)[path], `${member.name}'s files`).toBe(text);
    expect(member.errors, `${member.name}'s errors`).toEqual([]);
    expect(known(member.doc), `what ${member.name} knows`).toEqual(known(relay.doc));
  }
  return text;
}

/** `text` with the characters of `own` kept: what one person typed, in the order it stands. */
const only = (text: string, own: string): string =>
  [...text].filter((character) => own.includes(character)).join("");

describe("two devices typing at the same place", () => {
  it("keep every key of both, one key at a time, while each hears of the other late", () => {
    const state = seeded({ [FILE]: BASE });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);
    const at = BASE.indexOf("\n");
    ana.pane.select(at);
    ben.pane.select(at);
    const anaWord = "KIWI";
    const benWord = "mango";

    // Five rounds of 100 ms: both type their next key, then what each handed out reaches the room;
    // the room hands it over one round later, so each page types on without having heard of the other.
    for (let round = 0; round < 5; round++) {
      if (anaWord[round]) ana.pane.type(anaWord[round]!);
      if (benWord[round]) ben.pane.type(benWord[round]!);
      advance(100);
      relay.take();
      if (round >= 1) {
        relay.deliver(ana);
        relay.deliver(ben);
      }
    }
    const text = expectOneText(relay);
    const segment = text.slice(at, text.length - (BASE.length - at));
    // Everything before and after the place is as it was; between them are exactly the nine keys,
    // each person's in the order they were typed. They are mixed here ("manKIWgoI" with this
    // schedule): the caret of a page that hears of a key at its caret ends up after it, as in any
    // editor that merges text, so the next key of that person goes after the other's.
    expect(text.startsWith(BASE.slice(0, at))).toBe(true);
    expect(text.endsWith(BASE.slice(at))).toBe(true);
    expect(segment).toHaveLength(anaWord.length + benWord.length);
    expect(only(segment, anaWord)).toBe(anaWord);
    expect(only(segment, benWord)).toBe(benWord);
    expect(ana.pane.text).toBe(text);
    expect(ben.pane.text).toBe(text);
  });

  it("keep both words whole when each is typed at once, in one order or the other, on every page", () => {
    const state = seeded({ [FILE]: BASE });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);
    const at = BASE.indexOf("\n");
    ana.pane.select(at);
    ben.pane.select(at);
    ana.pane.type("KIWI");
    ben.pane.type("mango");
    advance(SEND_INTERVAL);
    relay.take();
    relay.deliver(ana);
    relay.deliver(ben);
    const text = expectOneText(relay);
    expect([
      BASE.slice(0, at) + "KIWImango" + BASE.slice(at),
      BASE.slice(0, at) + "mangoKIWI" + BASE.slice(at),
    ]).toContain(text);
    expect(ana.pane.text).toBe(ben.pane.text);
  });

  it("converge with three devices typing in one line and a fourth that joins late", () => {
    const state = seeded({ [FILE]: BASE });
    const [ana, ben, eva] = ["ana", "ben", "eva"].map((name) => device(name, { state })) as [
      Device,
      Device,
      Device,
    ];
    const relay = new Relay([ana, ben, eva], state);
    const at = BASE.indexOf("two");
    for (const member of [ana, ben, eva]) member.pane.select(at);
    for (const round of [0, 1, 2]) {
      ana.pane.type("A");
      ben.pane.type("B");
      eva.pane.type("E");
      advance(SEND_INTERVAL);
      relay.take();
      // Rounds are delivered to one device at a time, in the order of the room, then the others.
      if (round === 1) relay.deliver(eva);
    }
    const late = device("late", { state: Y.encodeStateAsUpdate(relay.doc) });
    relay.add(late);
    const text = expectOneText(relay);
    expect([...text].filter((c) => c === "A")).toHaveLength(3);
    expect([...text].filter((c) => c === "B")).toHaveLength(3);
    expect([...text].filter((c) => c === "E")).toHaveLength(3);
    expect(late.studio.text(FILE)).toBe(text);
  });

  it("converge whatever order the room's updates reach a page in", () => {
    const state = seeded({ [FILE]: BASE });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);
    ana.pane.select(0);
    ben.pane.select(BASE.length);
    for (let i = 0; i < 6; i++) {
      ana.pane.type(`a${i} `);
      ben.pane.type(` b${i}`);
      // A pause between keys splits the updates, so that there are several to hand over.
      advance(PAUSE);
      relay.take();
    }
    expect(relay.waiting(ana)).toBeGreaterThan(3);
    // Ana hears them backwards, Ben in pieces.
    relay.deliver(ana, { reversed: true });
    relay.deliver(ben, { count: 2 });
    relay.deliver(ben, { reversed: true });
    const text = expectOneText(relay);
    expect(text.startsWith("a0 a1 a2 a3 a4 a5 line one")).toBe(true);
    expect(text.endsWith("line three\n b0 b1 b2 b3 b4 b5")).toBe(true);
  });
});

describe("a canvas edit and typing, at the same time", () => {
  const SLIDE = [
    "place heading at (640, 90)",
    "place browser at (220, 400)",
    "place db at (450, 110)",
  ];

  it("keeps the dragged element's new place and the text typed meanwhile, whoever is heard first", () => {
    const text = `${SLIDE.join("\n")}\n`;
    const state = seeded({ [FILE]: text });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);

    // Ana drags the element in three steps (each one is a step of her own) while Ben types a
    // comment at the end of the file and a word inside the first line.
    const from = text.indexOf("220, 400");
    ben.pane.select(text.length);
    const drags: [number, number][] = [
      [240, 410],
      [260, 420],
      [280, 430],
    ];
    let current = "220, 400";
    for (const [round, [x, y]] of drags.entries()) {
      const place = `${x}, ${y}`;
      ana.studio.applyEdits(
        new Map([[FILE, [{ start: from, end: from + current.length, newText: place }]]]),
      );
      current = place;
      ben.pane.type(`// ben ${round}\n`);
      advance(100);
      relay.take();
    }
    const merged = expectOneText(relay);
    expect(merged).toContain("place browser at (280, 430)");
    expect(merged).not.toContain("(220, 400)");
    for (const round of [0, 1, 2]) expect(merged).toContain(`// ben ${round}\n`);
    expect(merged.startsWith("place heading at (640, 90)\n")).toBe(true);

    // Ana's undo takes back her last drag only, and Ben's lines stay.
    expect(ana.studio.undo()).toBe(true);
    const afterAna = expectOneText(relay);
    expect(afterAna).toContain("place browser at (260, 420)");
    for (const round of [0, 1, 2]) expect(afterAna).toContain(`// ben ${round}\n`);
    // Ben's undo takes back what he typed (each line ends a step) and none of the drags.
    let steps = 0;
    while (ben.studio.canUndo()) {
      expect(ben.studio.undo()).toBe(true);
      expect(++steps).toBeLessThan(10);
    }
    const afterBen = expectOneText(relay);
    expect(afterBen).toContain("place browser at (260, 420)");
    expect(afterBen).not.toContain("// ben");
    // And Ana's others are still hers to undo.
    expect(ana.studio.canUndo()).toBe(true);
  });
});

describe("each person's undo", () => {
  /** Ana and Ben have typed their words at the same place, key by key, and everything has settled. */
  function typedTogether(anaWord: string, benWord: string) {
    const state = seeded({ [FILE]: BASE });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);
    const at = BASE.indexOf("\n");
    ana.pane.select(at);
    ben.pane.select(at);
    for (let round = 0; round < Math.max(anaWord.length, benWord.length); round++) {
      if (anaWord[round]) ana.pane.type(anaWord[round]!);
      if (benWord[round]) ben.pane.type(benWord[round]!);
      advance(100);
      relay.take();
      if (round % 2 === 1) {
        relay.deliver(ana);
        relay.deliver(ben);
      }
    }
    const merged = expectOneText(relay);
    return { ana, ben, relay, at, merged };
  }

  it("removes the person's own word and nothing of the other's, and the other's removes theirs", () => {
    const { ana, ben, relay, at, merged } = typedTogether("KIWI", "mango");
    expect(only(merged, "KIWI")).toBe("KIWI");
    const withBen = BASE.slice(0, at) + "mango" + BASE.slice(at);
    const withAna = BASE.slice(0, at) + "KIWI" + BASE.slice(at);

    // Ana's Ctrl+Z is one step: all her keys went in 400 ms, though Ben's changes arrived meanwhile.
    expect(ana.studio.canUndo()).toBe(true);
    expect(ana.studio.undo()).toBe(true);
    expect(ana.studio.canUndo()).toBe(false);
    expect(ana.studio.text(FILE)).toBe(withBen);
    expect(expectOneText(relay)).toBe(withBen);

    // Ben's is still there, and takes his word only.
    expect(ben.studio.canUndo()).toBe(true);
    expect(ben.studio.undo()).toBe(true);
    expect(expectOneText(relay)).toBe(BASE);
    expect(ben.studio.canUndo()).toBe(false);

    // Redo brings back the person's own word and no other.
    expect(ana.studio.redo()).toBe(true);
    expect(expectOneText(relay)).toBe(withAna);
    expect(ben.studio.canRedo()).toBe(true);
    expect(ben.studio.redo()).toBe(true);
    const both = expectOneText(relay);
    const segment = both.slice(at, both.length - (BASE.length - at));
    expect(only(segment, "KIWI")).toBe("KIWI");
    expect(only(segment, "mango")).toBe("mango");
    expect(both).toHaveLength(BASE.length + 9);
  });

  it("works the same in the other order: Ben first, then Ana", () => {
    const { ana, ben, relay, at } = typedTogether("KIWI", "mango");
    expect(ben.studio.undo()).toBe(true);
    expect(expectOneText(relay)).toBe(BASE.slice(0, at) + "KIWI" + BASE.slice(at));
    expect(ana.studio.undo()).toBe(true);
    expect(expectOneText(relay)).toBe(BASE);
  });

  it("is not broken into two steps by a change of the other person arriving in the middle of typing", () => {
    const state = seeded({ [FILE]: "base" });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);
    ana.pane.select(4);
    ana.pane.type("a");
    advance(100);
    ben.pane.select(0);
    ben.pane.type(">");
    ben.binding.flush();
    relay.take();
    relay.deliver(ana);
    expect(ana.studio.text(FILE)).toBe(">basea");
    // The caret stayed after what Ana typed; she goes on within the 700 ms of the step.
    expect(ana.pane.selection).toEqual({ start: 6, end: 6 });
    ana.pane.type("b");
    advance(200);
    ana.pane.type("c");
    expect(ana.studio.text(FILE)).toBe(">baseabc");
    expect(ana.studio.undo()).toBe(true);
    expect(ana.studio.text(FILE)).toBe(">base");
    expect(ana.studio.canUndo()).toBe(false);
    expect(expectOneText(relay)).toBe(">base");
  });

  it("leaves the other person's letters that landed inside a word when that word is undone", () => {
    const state = seeded({ [FILE]: "" });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);
    ana.pane.type("abcdef");
    ana.binding.flush();
    relay.take();
    relay.deliver(ben);
    // Ben types in the middle of Ana's word, after her word reached him.
    ben.pane.select(3);
    ben.pane.type("XYZ");
    ben.binding.flush();
    relay.take();
    relay.deliver(ana);
    expect(expectOneText(relay)).toBe("abcXYZdef");
    expect(ana.studio.undo()).toBe(true);
    expect(expectOneText(relay)).toBe("XYZ");
    expect(ben.studio.undo()).toBe(true);
    expect(expectOneText(relay)).toBe("");
  });

  it("goes no further than the person's own steps, even when the other typed after them", () => {
    const state = seeded({ [FILE]: "x" });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);
    ana.pane.select(1);
    ana.pane.type("1");
    advance(PAUSE);
    ben.pane.select(1);
    ben.pane.type("B");
    advance(PAUSE);
    ana.pane.select(ana.pane.text.length);
    ana.pane.type("2");
    advance(PAUSE);
    relay.take();
    relay.deliver(ana);
    relay.deliver(ben);
    // The 1 and the B were typed at the same place at once: either may stand first, and the 2 follows the 1.
    expect(["x12B", "xB12"]).toContain(expectOneText(relay));
    expect(ana.studio.undo()).toBe(true);
    expect(ana.studio.undo()).toBe(true);
    // Two steps of her own are gone, and a third undo finds none: Ben's B is not hers to undo.
    expect(ana.studio.canUndo()).toBe(false);
    expect(ana.studio.undo()).toBe(false);
    expect(expectOneText(relay)).toBe("xB");
    expect(ben.studio.canUndo()).toBe(true);
  });
});

describe("a seeded stress of random edits and random delivery", () => {
  /** A small, repeatable random generator (mulberry32). */
  function generator(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const LETTERS = ["A", "B", "C"] as const;

  /** Three devices doing random things for `steps` steps; the relay is left holding undelivered updates. */
  function play(seed: number, steps: number, withDeletes: boolean) {
    const random = generator(seed);
    const pick = (count: number) => Math.floor(random() * count);
    const state = seeded({ [FILE]: BASE });
    const people = LETTERS.map((letter) => device(letter, { state }));
    const relay = new Relay(people, state);
    const typed: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (let step = 0; step < steps; step++) {
      const member = people[pick(3)]!;
      const letter = member.name;
      const action = random();
      if (action < 0.5) {
        member.pane.select(pick(member.pane.text.length + 1));
        const keys = 1 + pick(3);
        member.pane.type(letter.repeat(keys));
        typed[letter] = (typed[letter] ?? 0) + keys;
      } else if (action < 0.6 && withDeletes && member.pane.text.length > 2) {
        const from = pick(member.pane.text.length - 1);
        member.pane.select(from, from + 1 + pick(2));
        member.pane.backspace();
      } else if (action < 0.75) {
        advance(pick(900));
      } else if (action < 0.88) {
        relay.take();
      } else {
        relay.take();
        relay.deliver(people[pick(3)]!, { reversed: random() < 0.5, count: 1 + pick(3) });
      }
    }
    return { people, relay, typed };
  }

  it("converge on one text on every page, in every document and in the room, for thirty seeds", () => {
    let apart = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { people, relay } = play(seed, 70, true);
      // The devices really had different texts when the room settled: the edits were concurrent.
      if (new Set(people.map((member) => member.pane.text)).size > 1) apart++;
      try {
        const text = expectOneText(relay);
        for (const member of people) expect(member.pane.text).toBe(text);
      } catch (error) {
        throw new Error(`seed ${seed}: ${(error as Error).message}`, { cause: error });
      }
    }
    expect(apart).toBeGreaterThan(25);
  });

  it("let each device undo every step of its own, taking its letters out and leaving the others'", () => {
    let undone = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { people, relay, typed } = play(seed, 60, false);
      try {
        const merged = expectOneText(relay);
        for (const letter of LETTERS) {
          expect([...merged].filter((c) => c === letter).length).toBe(typed[letter]);
        }
        // Each seed undoes in another order, starting from another device.
        const order = [...people.slice(seed % 3), ...people.slice(0, seed % 3)];
        const left = new Set<string>(LETTERS);
        for (const member of order) {
          let steps = 0;
          while (member.studio.canUndo()) {
            expect(member.studio.undo()).toBe(true);
            steps++;
            expect(steps).toBeLessThan(500);
          }
          undone += steps;
          left.delete(member.name);
          const now = expectOneText(relay);
          // Its letters are all gone; the letters of the devices that did not undo yet are all there.
          expect([...now].filter((c) => c === member.name)).toHaveLength(0);
          for (const other of left) {
            expect(
              [...now].filter((c) => c === other).length,
              `${other} after ${member.name}`,
            ).toBe(typed[other]);
          }
        }
        expect(relay.text()).toBe(BASE);
      } catch (error) {
        throw new Error(`seed ${seed}: ${(error as Error).message}`, { cause: error });
      }
    }
    // Many steps were undone over the seeds (a few typing steps each, split by the pauses).
    expect(undone).toBeGreaterThan(150);
  });
});

describe("relative positions through concurrent edits", () => {
  const T = "t";

  /** Two documents holding `content`, as two pages that have the same text. */
  function pair(content: string): [Y.Doc, Y.Doc] {
    const a = new Y.Doc();
    a.getText(T).insert(0, content);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    return [a, b];
  }

  /** Each document hears of what the other has that it lacks. */
  function exchange(...docs: Y.Doc[]): void {
    for (const from of docs) {
      for (const to of docs) {
        if (from !== to) Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)));
      }
    }
  }

  it("keep a caret before the same character through inserts, deletes and a rewrite made at once", () => {
    const [ana, ben] = pair("alpha beta gamma delta");
    const at = ben.getText(T).toString().indexOf("gamma");
    const caret = encodeCaret(ben.getText(T), at, at);
    // Ana, at the same moment: a word before, a word right at the caret, a word deleted after it.
    ana.getText(T).insert(0, ">>> ");
    ana.getText(T).insert(ana.getText(T).toString().indexOf("gamma"), "NEW ");
    ana.getText(T).delete(ana.getText(T).toString().indexOf(" delta"), 6);
    // Ben, at the same moment: deletes the word before the caret and types inside the one after.
    ben.getText(T).delete(ben.getText(T).toString().indexOf("beta"), 5);
    ben.getText(T).insert(ben.getText(T).toString().indexOf("gamma") + 3, "--");
    exchange(ana, ben);
    const text = ana.getText(T).toString();
    expect(text).toBe(ben.getText(T).toString());
    expect(text).toBe(">>> alpha NEW gam--ma");
    // The caret is still before the "g" it was before; "NEW " was typed at it and stands before it.
    for (const doc of [ana, ben]) {
      const position = positionIn(caret.head, doc, doc.getText(T)) as number;
      expect(text.slice(0, position)).toBe(">>> alpha NEW ");
      expect(text.slice(position)).toBe("gam--ma");
    }
  });

  it("keep a selection on its characters, while text typed at its edges falls outside", () => {
    const [ana, ben] = pair("one two three four five");
    const start = "one two three four five".indexOf("three");
    const selection = encodeCaret(ben.getText(T), start, start + 5);
    ana.getText(T).insert(start, "[");
    ana.getText(T).insert(start + 5 + 1, "]");
    ben.getText(T).insert(0, "ZERO ");
    exchange(ana, ben);
    const text = ana.getText(T).toString();
    expect(text).toBe("ZERO one two [three] four five");
    for (const doc of [ana, ben]) {
      const a = positionIn(selection.anchor, doc, doc.getText(T));
      const h = positionIn(selection.head, doc, doc.getText(T));
      expect(text.slice(a, h)).toBe("three");
    }
  });

  it("collapse to the place where deleted text was, the same place on every document", () => {
    const [ana, ben] = pair("keep DELETED keep");
    const from = "keep DELETED keep".indexOf("DELETED");
    const selection = encodeCaret(ben.getText(T), from + 2, from + 5);
    ana.getText(T).delete(from, "DELETED ".length);
    exchange(ana, ben);
    const late = new Y.Doc();
    Y.applyUpdate(late, Y.encodeStateAsUpdate(ana));
    const places = [ana, ben, late].map((doc) => [
      positionIn(selection.anchor, doc, doc.getText(T)),
      positionIn(selection.head, doc, doc.getText(T)),
    ]);
    expect(places[0]).toEqual(places[1]);
    expect(places[0]).toEqual(places[2]);
    const [start, end] = places[0] as [number, number];
    expect(start).toBeLessThanOrEqual(end);
    expect(end).toBeLessThanOrEqual(ana.getText(T).length);
    expect(ana.getText(T).toString()).toBe("keep keep");
  });

  it("are the same on every document after many concurrent edits, one that joined late included", () => {
    for (let seed = 1; seed <= 40; seed++) {
      let state = seed;
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
      };
      const pick = (count: number) => Math.floor(random() * count);
      const [one, two] = pair("aaaa QRS bbbb");
      const three = new Y.Doc();
      Y.applyUpdate(three, Y.encodeStateAsUpdate(one));
      const docs = [one, two, three];
      // Three people each keep a caret before the Q and a selection of QRS in their own document.
      const carets = docs.map((doc) => {
        const q = doc.getText(T).toString().indexOf("QRS");
        return {
          caret: encodeCaret(doc.getText(T), q, q),
          selection: encodeCaret(doc.getText(T), q, q + 3),
        };
      });
      // Then they all edit at once, around and away from the characters, never inside QRS and
      // never deleting it; some updates reach some documents midway.
      for (let step = 0; step < 24; step++) {
        const doc = docs[pick(3)]!;
        const text = doc.getText(T);
        const q = text.toString().indexOf("QRS");
        let index = pick(text.length + 1);
        if (index > q && index < q + 3) index = q;
        if (random() < 0.65) {
          text.insert(index, "xyz".slice(0, 1 + pick(3)));
        } else {
          const length = 1 + pick(3);
          const end = Math.min(index + length, text.length);
          if (index + length <= q || index >= q + 3) text.delete(index, end - index);
        }
        if (random() < 0.2) exchange(docs[pick(3)]!, docs[pick(3)]!);
      }
      exchange(...docs);
      const late = new Y.Doc();
      Y.applyUpdate(late, Y.encodeStateAsUpdate(one));
      const text = one.getText(T).toString();
      const q = text.indexOf("QRS");
      expect(q, `seed ${seed}`).toBeGreaterThan(-1);
      for (const doc of [...docs, late]) {
        expect(doc.getText(T).toString(), `seed ${seed}`).toBe(text);
        for (const { caret, selection } of carets) {
          expect(positionIn(caret.head, doc, doc.getText(T)), `seed ${seed} caret`).toBe(q);
          const a = positionIn(selection.anchor, doc, doc.getText(T));
          const h = positionIn(selection.head, doc, doc.getText(T));
          expect(text.slice(a, h), `seed ${seed} selection`).toBe("QRS");
        }
      }
    }
  });

  it("put the carets the pane draws on the same characters on every page", () => {
    const state = seeded({ [FILE]: BASE });
    const ana = device("ana", { state });
    const ben = device("ben", { state });
    const relay = new Relay([ana, ben], state);
    // Ben selects "two"; his page publishes the positions, which reach Ana's page.
    const from = BASE.indexOf("two");
    const benText = textIn(ben.doc);
    const caret = encodeCaret(benText, from, from + 3);
    const file = [...resolveFiles(cloudDoc(ben.doc)).files.values()].find((f) => f.shown === FILE)!;
    const peer: Peer = {
      id: "c-ben",
      sub: "u-ben",
      name: "Ben",
      picture: undefined,
      colour: "#1c7ed6",
      file: file.id,
      caret,
      selection: [],
      movedAt: 0,
      heardAt: 0,
      joinedAt: 0,
    };
    // Both type before it, and Ana also types in the middle of the line, before they have heard.
    ana.pane.select(0);
    ana.pane.type("// by Ana\n");
    ben.pane.select(0);
    ben.pane.type("// by Ben\n");
    ana.pane.select(ana.pane.text.indexOf("two") - 1);
    ana.pane.type("!");
    advance(SEND_INTERVAL);
    const text = expectOneText(relay);
    for (const member of [ana, ben, { name: "room", doc: relay.doc }]) {
      const doc = member.doc;
      const resolved = textIn(doc);
      const [drawn] = drawnCarets([peer], file.id, doc, resolved, resolved.length, "Someone");
      expect(text.slice(drawn!.start, drawn!.end), member.name).toBe("two");
    }
  });
});
