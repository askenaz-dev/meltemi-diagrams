import { presenceColour } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addTextFile, cloudDoc, resolveFiles } from "../src/cloud/doc.js";
import {
  MAX_PEERS,
  PeerBook,
  canvasPeople,
  drawnCarets,
  whoIsHere,
} from "../src/cloud/presence-model.js";
import { encodeCaret } from "../src/cloud/presence-wire.js";

const PAGE = "https://diagrams.example/";
const API = "aaaaaaaaaaaaaaa2";
const WEB = "bbbbbbbbbbbbbbb2";

interface Sent {
  file?: string;
  caret?: { anchor: string; head: string };
  selection?: string[];
  user?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A state as the room relays it. */
function state(sub: string, name: string, sent: Sent = {}): Record<string, unknown> {
  const { selection, user, ...rest } = sent;
  return {
    ...rest,
    ...(selection ? { canvas: { selection } } : {}),
    user: { sub, name, picture: "", colour: "#000000", ...user },
  };
}

/** A project of two files. */
function project(): { doc: Y.Doc; api: Y.Text; web: Y.Text } {
  const doc = new Y.Doc();
  const cloud = cloudDoc(doc);
  addTextFile(cloud, "diagrams/api.meltemi", "hello world\nsecond line", { id: API });
  addTextFile(cloud, "diagrams/web.meltemi", "web", { id: WEB });
  return { doc, api: cloud.files.get(API)!, web: cloud.files.get(WEB)! };
}

describe("the peers of the room", () => {
  it("are the room's clients, with their identity from the room's user and a colour from their sub", () => {
    const book = new PeerBook(PAGE);
    expect(
      book.apply(
        [
          // The room's colour is not the one the page uses: it computes its own from the account.
          {
            id: "c1",
            state: state("u_ben", "Ben", { file: API, user: { colour: "#ff00ff" } }),
          },
        ],
        1000,
      ),
    ).toBe(true);
    expect(book.list()).toEqual([
      {
        id: "c1",
        sub: "u_ben",
        name: "Ben",
        picture: undefined,
        colour: presenceColour("u_ben"),
        guest: false,
        file: API,
        caret: undefined,
        selection: [],
        pointer: undefined,
        movedAt: 1000,
        heardAt: 1000,
        joinedAt: 1000,
      },
    ]);
  });

  it("take nothing of who they are from their own payload", () => {
    const book = new PeerBook(PAGE);
    book.apply(
      [
        {
          id: "c1",
          state: {
            ...state("u_ben", "Ben", { file: API }),
            // What a client claims of itself, beside the room's user and inside the selection.
            sub: "u_ana",
            name: "Ana",
            picture: "https://evil.example/ana.png",
            colour: "#00ff00",
            canvas: { selection: ["api"], user: { sub: "u_ana", name: "Ana" } },
          },
        },
      ],
      0,
    );
    const [ben] = book.list();
    expect(ben).toMatchObject({ sub: "u_ben", name: "Ben", picture: undefined });
    expect(ben?.colour).toBe(presenceColour("u_ben"));
    expect(ben?.colour).not.toBe("#00ff00");
    expect(ben?.selection).toEqual(["api"]);
  });

  it("ignore a state without the room's user, and a state that is not one, without throwing", () => {
    const book = new PeerBook(PAGE);
    expect(
      book.apply(
        [
          { id: "c1", state: { file: API, name: "Ana", sub: "u_ana" } },
          { id: "c2", state: { user: "u_ana" } },
          { id: "c3", state: { user: { sub: 4 } } },
          { id: "c4", state: 42 },
          { id: "c5", state: [] },
        ],
        0,
      ),
    ).toBe(false);
    expect(book.size).toBe(0);
  });

  it("are removed when the room says so, and only then", () => {
    const book = new PeerBook(PAGE);
    book.apply([{ id: "c1", state: state("u_ben", "Ben") }], 0);
    book.apply([{ id: "c2", state: state("u_eva", "Eva") }], 0);
    expect(book.apply([{ id: "c1", state: null }], 5)).toBe(true);
    expect(book.list().map((peer) => peer.name)).toEqual(["Eva"]);
    expect(book.apply([{ id: "c1", state: null }], 6)).toBe(false);
    // A malformed state of a client already here neither changes it nor removes it.
    book.apply([{ id: "c2", state: { junk: true } }], 7);
    expect(book.list().map((peer) => peer.name)).toEqual(["Eva"]);
  });

  it("do not include this page's own connection", () => {
    const book = new PeerBook(PAGE);
    book.apply([{ id: "me", state: state("u_ana", "Ana") }], 0);
    expect(book.size).toBe(1);
    book.setOwn("me");
    expect(book.size).toBe(0);
    expect(book.apply([{ id: "me", state: state("u_ana", "Ana") }], 1)).toBe(false);
    expect(book.size).toBe(0);
  });

  it("keep when a caret last moved: a heartbeat that repeats a state is not a move", () => {
    const book = new PeerBook(PAGE);
    const caret = { anchor: "AAA=", head: "AAA=" };
    book.apply([{ id: "c1", state: state("u_ben", "Ben", { file: API, caret }) }], 100);
    // The same state again, fifteen seconds later: nothing changed, so nothing to show.
    expect(
      book.apply([{ id: "c1", state: state("u_ben", "Ben", { file: API, caret }) }], 15_100),
    ).toBe(false);
    expect(book.list()[0]).toMatchObject({ movedAt: 100, heardAt: 15_100, joinedAt: 100 });
    // A new caret is a move.
    expect(
      book.apply(
        [
          {
            id: "c1",
            state: state("u_ben", "Ben", { file: API, caret: { anchor: "AQE=", head: "AQE=" } }),
          },
        ],
        16_000,
      ),
    ).toBe(true);
    expect(book.list()[0]).toMatchObject({ movedAt: 16_000, joinedAt: 100 });
    // So is another file.
    book.apply([{ id: "c1", state: state("u_ben", "Ben", { file: WEB }) }], 17_000);
    expect(book.list()[0]?.movedAt).toBe(17_000);
  });

  it("are forgotten when the room has not spoken of them for a long time", () => {
    const book = new PeerBook(PAGE);
    book.apply([{ id: "c1", state: state("u_ben", "Ben") }], 0);
    book.apply([{ id: "c2", state: state("u_eva", "Eva") }], 40_000);
    expect(book.expire(46_000, 45_000)).toBe(true);
    expect(book.list().map((peer) => peer.name)).toEqual(["Eva"]);
    expect(book.expire(46_000, 45_000)).toBe(false);
  });

  it("are no more than a room can hold, however many ids are made up", () => {
    const book = new PeerBook(PAGE);
    book.apply(
      Array.from({ length: MAX_PEERS + 20 }, (_, i) => ({
        id: `c${i}`,
        state: state(`u_${i}`, `P${i}`),
      })),
      0,
    );
    expect(book.size).toBe(MAX_PEERS);
  });

  it("go when the socket drops", () => {
    const book = new PeerBook(PAGE);
    book.apply([{ id: "c1", state: state("u_ben", "Ben") }], 0);
    expect(book.clear()).toBe(true);
    expect(book.clear()).toBe(false);
    expect(book.size).toBe(0);
  });
});

describe("the people of the header", () => {
  const peers = (entries: [string, Record<string, unknown>][], now = 0) => {
    const book = new PeerBook(PAGE);
    entries.forEach(([id, value], i) => book.apply([{ id, state: value }], now + i));
    return book.list();
  };

  it("are one for each account, in the order they came, with the path of their file", () => {
    const { doc } = project();
    const files = resolveFiles(cloudDoc(doc)).files;
    const people = whoIsHere(
      peers([
        ["c1", state("u_ben", "Ben", { file: API })],
        ["c2", state("u_eva", "Eva", { file: WEB })],
      ]),
      files,
      "u_ana",
    );
    expect(people.map((person) => [person.name, person.file?.path])).toEqual([
      ["Ben", "diagrams/api.meltemi"],
      ["Eva", "diagrams/web.meltemi"],
    ]);
    expect(people[0]).toMatchObject({ sub: "u_ben", colour: presenceColour("u_ben") });
  });

  it("do not list this account again: the account control is already them", () => {
    const { doc } = project();
    const files = resolveFiles(cloudDoc(doc)).files;
    const people = whoIsHere(
      peers([
        ["c1", state("u_ana", "Ana", { file: API })],
        ["c2", state("u_ben", "Ben", { file: API })],
      ]),
      files,
      "u_ana",
    );
    expect(people.map((person) => person.name)).toEqual(["Ben"]);
  });

  it("join the connections of one account at the file of the one that moved last", () => {
    const { doc } = project();
    const files = resolveFiles(cloudDoc(doc)).files;
    const book = new PeerBook(PAGE);
    book.apply([{ id: "c1", state: state("u_ben", "Ben", { file: API }) }], 100);
    book.apply([{ id: "c2", state: state("u_ben", "Ben", { file: WEB }) }], 200);
    const [ben, ...rest] = whoIsHere(book.list(), files, undefined);
    expect(rest).toEqual([]);
    expect(ben).toMatchObject({ connections: 2, file: { id: WEB, path: "diagrams/web.meltemi" } });
    // The other one moves later: the person is there now.
    book.apply(
      [
        {
          id: "c1",
          state: state("u_ben", "Ben", { file: API, caret: { anchor: "AA==", head: "AA==" } }),
        },
      ],
      300,
    );
    expect(whoIsHere(book.list(), files, undefined)[0]?.file?.id).toBe(API);
  });

  it("say no file for one the project does not have", () => {
    const { doc } = project();
    const files = resolveFiles(cloudDoc(doc)).files;
    const people = whoIsHere(
      peers([["c1", state("u_ben", "Ben", { file: "ccccccccccccccc2" })]]),
      files,
      undefined,
    );
    expect(people).toHaveLength(1);
    expect(people[0]?.file).toBeUndefined();
  });

  it("follow a rename: a file is its id, and the path is whatever it is now", () => {
    const { doc } = project();
    const cloud = cloudDoc(doc);
    const book = peers([["c1", state("u_ben", "Ben", { file: API })]]);
    expect(whoIsHere(book, resolveFiles(cloud).files, undefined)[0]?.file?.path).toBe(
      "diagrams/api.meltemi",
    );
    cloud.paths.set(API, "diagrams/backend.meltemi");
    expect(whoIsHere(book, resolveFiles(cloud).files, undefined)[0]?.file).toEqual({
      id: API,
      path: "diagrams/backend.meltemi",
    });
  });

  it("keep a name as the characters it is, and an empty one empty for the view to word", () => {
    const { doc } = project();
    const files = resolveFiles(cloudDoc(doc)).files;
    const people = whoIsHere(
      peers([
        ["c1", state("u_ben", "<b>Ben</b>", { file: API })],
        ["c2", state("u_eva", "", { file: API })],
      ]),
      files,
      undefined,
    );
    expect(people.map((person) => person.name)).toEqual(["<b>Ben</b>", ""]);
  });
});

describe("the carets drawn in a file", () => {
  const draw = (book: PeerBook, p: ReturnType<typeof project>, fileId = API, text = p.api) =>
    drawnCarets(book.list(), fileId, p.doc, text, text.length, "Someone");

  it("are where the people who have the file open have their caret and selection", () => {
    const p = project();
    const book = new PeerBook(PAGE);
    book.apply(
      [
        { id: "c1", state: state("u_ben", "Ben", { file: API, caret: encodeCaret(p.api, 6, 11) }) },
        // Eva is in another file: nothing of her in this one.
        { id: "c2", state: state("u_eva", "Eva", { file: WEB, caret: encodeCaret(p.web, 1, 1) }) },
        // Nobody has a caret without saying where.
        { id: "c3", state: state("u_max", "Max", { file: API }) },
      ],
      500,
    );
    expect(draw(book, p)).toEqual([
      {
        id: "c1",
        name: "Ben",
        colour: presenceColour("u_ben"),
        guest: false,
        head: 11,
        start: 6,
        end: 11,
        movedAt: 500,
      },
    ]);
  });

  it("put the caret bar at the head, whichever end of the selection that is", () => {
    const p = project();
    const book = new PeerBook(PAGE);
    book.apply(
      [{ id: "c1", state: state("u_ben", "Ben", { file: API, caret: encodeCaret(p.api, 11, 6) }) }],
      0,
    );
    expect(draw(book, p)[0]).toMatchObject({ head: 6, start: 6, end: 11 });
  });

  it("move with the edits that come after them: resolved against the text as it is now", () => {
    const p = project();
    const book = new PeerBook(PAGE);
    book.apply(
      [{ id: "c1", state: state("u_ben", "Ben", { file: API, caret: encodeCaret(p.api, 6, 11) }) }],
      0,
    );
    // Ana types at the start and deletes a word inside the line below, in two documents' worth of
    // concurrent history: the selection stays on "world".
    p.api.insert(0, ">>> ");
    p.api.delete(p.api.toString().indexOf("second"), "second ".length);
    const [ben] = draw(book, p);
    expect(p.api.toString().slice(ben!.start, ben!.end)).toBe("world");
    expect(ben).toMatchObject({ start: 10, end: 15 });
  });

  it("are not drawn for a file the page does not have, or in a text that is not that file's", () => {
    const p = project();
    const book = new PeerBook(PAGE);
    book.apply(
      [
        { id: "c1", state: state("u_ben", "Ben", { file: "ccccccccccccccc2" }) },
        { id: "c2", state: state("u_eva", "Eva", { file: API, caret: encodeCaret(p.api, 1, 1) }) },
      ],
      0,
    );
    expect(drawnCarets(book.list(), "ccccccccccccccc2", p.doc, undefined, 0, "?")).toEqual([]);
    expect(drawnCarets(book.list(), undefined, p.doc, p.api, 5, "?")).toEqual([]);
    // Eva's positions are in the api text: against the web text they name nothing.
    expect(drawnCarets(book.list(), API, p.doc, p.web, 3, "?")).toEqual([]);
  });

  it("are not drawn once the file is deleted", () => {
    const p = project();
    const cloud = cloudDoc(p.doc);
    const book = new PeerBook(PAGE);
    book.apply(
      [{ id: "c1", state: state("u_ben", "Ben", { file: API, caret: encodeCaret(p.api, 2, 3) }) }],
      0,
    );
    expect(draw(book, p)).toHaveLength(1);
    cloud.files.delete(API);
    cloud.paths.delete(API);
    expect(draw(book, p)).toEqual([]);
  });

  it("stay inside the text the pane shows, and take a name for one who gave none", () => {
    const p = project();
    const book = new PeerBook(PAGE);
    book.apply(
      [{ id: "c1", state: state("u_ben", "", { file: API, caret: encodeCaret(p.api, 5, 20) }) }],
      0,
    );
    // The pane shows less than the document has for a moment (a change on its way).
    const [ben] = drawnCarets(book.list(), API, p.doc, p.api, 8, "Someone");
    expect(ben).toMatchObject({ name: "Someone", start: 5, end: 8, head: 8 });
  });
});

describe("what the canvas is told", () => {
  it("is the selection of each person who has the file open and something selected", () => {
    const book = new PeerBook(PAGE);
    book.apply(
      [
        { id: "c1", state: state("u_ben", "Ben", { file: API, selection: ["api", "db"] }) },
        { id: "c2", state: state("u_eva", "Eva", { file: WEB, selection: ["web"] }) },
        { id: "c3", state: state("u_max", "Max", { file: API }) },
        { id: "c4", state: state("u_zoe", "", { file: API, selection: ["queue"] }) },
      ],
      0,
    );
    expect(canvasPeople(book.list(), API, "Someone")).toEqual([
      { name: "Ben", colour: presenceColour("u_ben"), selection: ["api", "db"] },
      { name: "Someone", colour: presenceColour("u_zoe"), selection: ["queue"] },
    ]);
    expect(canvasPeople(book.list(), WEB, "Someone").map((person) => person.name)).toEqual(["Eva"]);
    // Nothing is told for a file the page does not have open.
    expect(canvasPeople(book.list(), undefined, "Someone")).toEqual([]);
  });

  it("holds a name as the characters it is", () => {
    const book = new PeerBook(PAGE);
    book.apply(
      [{ id: "c1", state: state("u_ben", "<img src=x>", { file: API, selection: ["api"] }) }],
      0,
    );
    expect(canvasPeople(book.list(), API, "Someone")[0]?.name).toBe("<img src=x>");
  });
});
