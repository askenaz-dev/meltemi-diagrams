import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { loadElkWorkerFile } from "@meltemi/diagrams-layout-elk";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { Outcome } from "../src/cloud/client.js";
import type { KeyValueStore } from "../src/cloud/persistence.js";
import { drawsSomething, renderThumbnail } from "../src/cloud/thumbnail-render.js";
import {
  REMEMBERED_THUMBNAILS,
  THUMBNAIL_EVERY_MS,
  THUMBNAIL_HASH_KEY,
  THUMBNAIL_SETTLE_MS,
  ThumbnailStamps,
  Thumbnails,
  byteLength,
  thumbnailMemory,
  type ThumbnailMemory,
  type ThumbnailRender,
} from "../src/cloud/thumbnails.js";
import { LazyFiles } from "../src/lazy.js";
import { Studio } from "../src/studio.js";
import { ManualTimers, settle } from "./support/clock.js";

const A = "abcdefghij0123456789";
const B = "zyxwvutsrq9876543210";

const ok: Outcome<null> = { ok: true, value: null };
const refused = (status: number, code?: string): Outcome<null> => ({
  ok: false,
  failure: { kind: "refused", status, ...(code ? { code } : {}) },
});
const unreachable: Outcome<null> = { ok: false, failure: { kind: "unreachable", status: 0 } };

interface Rig {
  readonly thumbnails: Thumbnails;
  readonly timers: ManualTimers;
  readonly sends: { project: string; svg: string }[];
  readonly sentEvents: string[];
  /** What rendering gives now, and how many renderings were made. */
  readonly state: {
    render: () => Promise<ThumbnailRender>;
    answer: () => Promise<Outcome<null>>;
    renders: number;
  };
}

const svg = (text: string): ThumbnailRender => ({ kind: "svg", svg: `<svg>${text}</svg>` });

function rig(options: { memory?: ThumbnailMemory } = {}): Rig {
  const timers = new ManualTimers();
  const sends: Rig["sends"] = [];
  const sentEvents: string[] = [];
  const state: Rig["state"] = {
    render: async () => svg("one"),
    answer: async () => ok,
    renders: 0,
  };
  const thumbnails = new Thumbnails({
    timers,
    now: () => timers.now,
    render: () => {
      state.renders++;
      return state.render();
    },
    hash: async (picture) => `hash:${picture}`,
    send: (project, picture) => {
      sends.push({ project, svg: picture });
      return state.answer();
    },
    sent: (project) => sentEvents.push(project),
    ...(options.memory ? { memory: options.memory } : {}),
  });
  return { thumbnails, timers, sends, sentEvents, state };
}

/** Turns the clock and lets what the timers started finish. */
async function advance(r: Rig, milliseconds: number): Promise<void> {
  r.timers.advance(milliseconds);
  await settle();
}

describe("when a thumbnail is sent", () => {
  it("five seconds after the analysis of a drawable file settles, and not before", async () => {
    const r = rig();
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS - 1);
    expect(r.state.renders).toBe(0);
    expect(r.sends).toEqual([]);
    await advance(r, 1);
    expect(r.state.renders).toBe(1);
    expect(r.sends).toEqual([{ project: A, svg: "<svg>one</svg>" }]);
    expect(r.sentEvents).toEqual([A]);
  });

  it("waits the five seconds again each time the analysis settles anew", async () => {
    const r = rig();
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, 3000);
    r.thumbnails.analysed(true);
    await advance(r, 4999);
    expect(r.state.renders).toBe(0);
    await advance(r, 1);
    expect(r.state.renders).toBe(1);
  });

  it("renders a project's picture at most once a minute, however often the file changes", async () => {
    const r = rig();
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toHaveLength(1);
    // The person changes the label, then again; a minute counts from the first picture.
    r.state.render = async () => svg("two");
    r.thumbnails.analysed(true);
    await advance(r, 10_000);
    r.state.render = async () => svg("three");
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS - 10_000 - 1);
    expect(r.state.renders).toBe(1);
    await advance(r, 1);
    expect(r.state.renders).toBe(2);
    expect(r.sends.map((s) => s.svg)).toEqual(["<svg>one</svg>", "<svg>three</svg>"]);
  });

  it("sends a picture only when it differs from the one the service took last", async () => {
    const r = rig();
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    // Rendered again, and the same picture: nothing is sent.
    expect(r.state.renders).toBe(2);
    expect(r.sends).toHaveLength(1);
    r.state.render = async () => svg("changed");
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.sends).toHaveLength(2);
    // And back to the first: it is a change again.
    r.state.render = async () => svg("one");
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.sends).toHaveLength(3);
  });

  it("does not send a picture over 200 KiB, and sends one of exactly 200 KiB", async () => {
    const r = rig();
    const wrap = "<svg></svg>".length;
    const exact = "x".repeat(CLOUD_LIMITS.thumbnailBytes - wrap);
    r.state.render = async () => ({ kind: "svg", svg: `<svg>${exact}</svg>` });
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toHaveLength(1);
    expect(byteLength(r.sends[0]!.svg)).toBe(CLOUD_LIMITS.thumbnailBytes);
    r.state.render = async () => ({ kind: "svg", svg: `<svg>${exact}y</svg>` });
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.state.renders).toBe(2);
    expect(r.sends).toHaveLength(1);
    // Bytes, not characters: a picture of 100 000 three-byte characters is over, though it is under in length.
    r.state.render = async () => ({ kind: "svg", svg: `<svg>${"€".repeat(100_000)}</svg>` });
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.sends).toHaveLength(1);
  });

  it("sends nothing for a file that draws nothing: no wait is started, and a render that gives nothing sends nothing", async () => {
    const r = rig();
    r.thumbnails.open(A);
    // A file that holds only a `model` block: the analysis found nothing drawable.
    r.thumbnails.analysed(false);
    expect(r.thumbnails.waiting).toBe(false);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.state.renders).toBe(0);
    // A drawable file that has become one that draws nothing by the time the wait is over.
    r.state.render = async () => ({ kind: "none" });
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.state.renders).toBe(1);
    expect(r.sends).toEqual([]);
    expect(r.sentEvents).toEqual([]);
  });

  it("sends nothing when the picture cannot be made", async () => {
    const r = rig();
    r.state.render = async () => {
      throw new Error("layout failed");
    };
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toEqual([]);
    // The next settle tries again.
    r.state.render = async () => svg("fine");
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.sends).toHaveLength(1);
  });

  it("sends nothing while no cloud project is open", async () => {
    const r = rig();
    r.thumbnails.analysed(true);
    expect(r.thumbnails.waiting).toBe(false);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.state.renders).toBe(0);
    expect(r.sends).toEqual([]);
  });
});

describe("what cancels a thumbnail", () => {
  it("opening another project drops what waited for the first", async () => {
    const r = rig();
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, 2000);
    r.thumbnails.open(B);
    expect(r.thumbnails.waiting).toBe(false);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.state.renders).toBe(0);
    expect(r.sends).toEqual([]);
    // The second project starts its own wait.
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toEqual([{ project: B, svg: "<svg>one</svg>" }]);
  });

  it("opening another project drops a picture that was being made for the first", async () => {
    const r = rig();
    let finish!: (value: ThumbnailRender) => void;
    r.state.render = () => new Promise((resolve) => (finish = resolve));
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.state.renders).toBe(1);
    r.thumbnails.open(B);
    finish(svg("late"));
    await settle();
    expect(r.sends).toEqual([]);
  });

  it("leaving the project (as signing out does) drops what waited, and what was being made", async () => {
    const r = rig();
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, 2000);
    r.thumbnails.close();
    expect(r.thumbnails.project).toBeUndefined();
    expect(r.thumbnails.waiting).toBe(false);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.sends).toEqual([]);

    // Under way: the call itself cannot be taken back, but nothing follows it.
    const s = rig();
    let finish!: (value: Outcome<null>) => void;
    s.state.answer = () => new Promise((resolve) => (finish = resolve));
    s.thumbnails.open(A);
    s.thumbnails.analysed(true);
    await advance(s, THUMBNAIL_SETTLE_MS);
    expect(s.sends).toHaveLength(1);
    s.thumbnails.close();
    finish(refused(429, "thumbnail.rate"));
    await settle();
    expect(s.thumbnails.waiting).toBe(false);
  });

  it("keeps counting a minute for a project that was left and opened again", async () => {
    const r = rig();
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toHaveLength(1);
    r.thumbnails.open(B);
    await advance(r, 5000);
    r.thumbnails.open(A);
    r.state.render = async () => svg("edited");
    r.thumbnails.analysed(true);
    // Ten seconds after the first picture, not a minute: it waits until a minute has passed.
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.state.renders).toBe(1);
    await advance(r, THUMBNAIL_EVERY_MS - 10_000);
    expect(r.state.renders).toBe(2);
    expect(r.sends.map((s) => s.svg)).toEqual(["<svg>one</svg>", "<svg>edited</svg>"]);
  });

  it("opening the project that is already open changes nothing", async () => {
    const r = rig();
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    r.thumbnails.open(A);
    expect(r.thumbnails.waiting).toBe(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toHaveLength(1);
  });
});

describe("what the service answers", () => {
  it("takes too many thumbnails as no error: nothing is said, and one more try follows a minute later", async () => {
    const r = rig();
    const answers = [refused(429, "thumbnail.rate"), ok];
    r.state.answer = async () => answers.shift()!;
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toHaveLength(1);
    expect(r.sentEvents).toEqual([]);
    // Not marked as sent: the retry sends the same picture, a minute after the first try.
    await advance(r, THUMBNAIL_EVERY_MS - 1);
    expect(r.sends).toHaveLength(1);
    await advance(r, 1);
    expect(r.sends).toHaveLength(2);
    expect(r.sentEvents).toEqual([A]);
    expect(r.thumbnails.waiting).toBe(false);
  });

  it("tries once more after a refusal for too many, and then waits for the next settle", async () => {
    const r = rig();
    r.state.answer = async () => refused(429, "thumbnail.rate");
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toHaveLength(1);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.sends).toHaveLength(2);
    expect(r.thumbnails.waiting).toBe(false);
    await advance(r, THUMBNAIL_EVERY_MS * 3);
    expect(r.sends).toHaveLength(2);
    // The next settle starts afresh.
    r.state.answer = async () => ok;
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.sends).toHaveLength(3);
    expect(r.sentEvents).toEqual([A]);
  });

  it("stops for good, until another project opens, when the person is signed out or the project is gone", async () => {
    for (const answer of [
      refused(401, "auth.required"),
      refused(401),
      refused(404, "project.not-found"),
    ]) {
      const r = rig();
      r.state.answer = async () => answer;
      r.thumbnails.open(A);
      r.thumbnails.analysed(true);
      await advance(r, THUMBNAIL_SETTLE_MS);
      expect(r.sends).toHaveLength(1);
      r.thumbnails.analysed(true);
      expect(r.thumbnails.waiting).toBe(false);
      await advance(r, THUMBNAIL_EVERY_MS * 2);
      expect(r.sends).toHaveLength(1);
      // Another project is not blocked.
      r.state.answer = async () => ok;
      r.thumbnails.open(B);
      r.thumbnails.analysed(true);
      await advance(r, THUMBNAIL_SETTLE_MS);
      expect(r.sends).toHaveLength(2);
    }
  });

  it("leaves a failed call for the next settle: no connection, a service that fails", async () => {
    const r = rig();
    const answers = [unreachable, refused(500), ok];
    r.state.answer = async () => answers.shift()!;
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.thumbnails.waiting).toBe(false);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    expect(r.thumbnails.waiting).toBe(false);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_EVERY_MS);
    // The picture was never marked as sent, so it went again until the service took it.
    expect(r.sends).toHaveLength(3);
    expect(r.sentEvents).toEqual([A]);
  });
});

describe("what is kept between visits", () => {
  const memory = (): ThumbnailMemory & { held: Map<string, string> } => {
    const held = new Map<string, string>();
    return { held, get: (project) => held.get(project), set: (p, h) => void held.set(p, h) };
  };

  it("sends nothing on opening a project whose picture is the one sent last time", async () => {
    const kept = memory();
    kept.held.set(A, "hash:<svg>one</svg>");
    const r = rig({ memory: kept });
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.state.renders).toBe(1);
    expect(r.sends).toEqual([]);
  });

  it("remembers the picture the service took, and sends the first picture of a project it never sent", async () => {
    const kept = memory();
    const r = rig({ memory: kept });
    r.thumbnails.open(A);
    r.thumbnails.analysed(true);
    await advance(r, THUMBNAIL_SETTLE_MS);
    expect(r.sends).toHaveLength(1);
    expect(kept.held.get(A)).toBe("hash:<svg>one</svg>");
    // A page that starts afresh sends nothing for the same picture.
    const again = rig({ memory: kept });
    again.thumbnails.open(A);
    again.thumbnails.analysed(true);
    await advance(again, THUMBNAIL_SETTLE_MS);
    expect(again.sends).toEqual([]);
  });

  it("keeps the hash of the last thumbnail per project in the browser's storage", () => {
    const values = new Map<string, string>();
    const storage: KeyValueStore = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    };
    const kept = thumbnailMemory(storage)!;
    expect(kept.get(A)).toBeUndefined();
    kept.set(A, "aaa");
    kept.set(B, "bbb");
    expect(thumbnailMemory(storage)!.get(A)).toBe("aaa");
    expect(JSON.parse(values.get(THUMBNAIL_HASH_KEY)!)).toEqual({ [A]: "aaa", [B]: "bbb" });
    // The oldest go first when there are too many.
    for (let i = 0; i < REMEMBERED_THUMBNAILS; i++) kept.set(`p${i}`, "h");
    expect(kept.get(A)).toBeUndefined();
    expect(kept.get(`p${REMEMBERED_THUMBNAILS - 1}`)).toBe("h");
    expect(Object.keys(JSON.parse(values.get(THUMBNAIL_HASH_KEY)!))).toHaveLength(
      REMEMBERED_THUMBNAILS,
    );
  });

  it("works without storage, with storage that refuses and with storage that holds nonsense", () => {
    expect(thumbnailMemory(undefined)).toBeUndefined();
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const kept = thumbnailMemory(broken)!;
    expect(kept.get(A)).toBeUndefined();
    expect(() => kept.set(A, "x")).not.toThrow();
    const nonsense = thumbnailMemory({ getItem: () => "[1,2", setItem: () => undefined })!;
    expect(nonsense.get(A)).toBeUndefined();
    const array = thumbnailMemory({ getItem: () => "[1]", setItem: () => undefined })!;
    expect(array.get(A)).toBeUndefined();
  });
});

describe("the address a thumbnail is shown from", () => {
  const LIST = "https://diagrams.example/api/projects/abc/thumbnail";

  it("is the list's own until this page sends a thumbnail, and then carries a stamp the drawer reloads by", () => {
    let now = 1000;
    const stamps = new ThumbnailStamps(() => now);
    expect(stamps.address("abc", LIST)).toBe(LIST);
    expect(stamps.address("abc", undefined)).toBeUndefined();
    stamps.sent("abc");
    expect(stamps.address("abc", LIST)).toBe(`${LIST}?t=1000`);
    now = 2000;
    stamps.sent("abc");
    expect(stamps.address("abc", `${LIST}?t=1000`)).toBe(`${LIST}?t=2000`);
    expect(stamps.address("abc", `${LIST}?v=7`)).toBe(`${LIST}?v=7&t=2000`);
    // Another project keeps its address.
    expect(stamps.address("other", LIST)).toBe(LIST);
    // An address that is not one is left alone.
    expect(stamps.address("abc", "not a url")).toBe("not a url");
    // A project with no thumbnail in the list has none to refresh.
    expect(stamps.address("abc", undefined)).toBeUndefined();
  });

  it("tells whoever listens which project's thumbnail was sent, until they stop", () => {
    const stamps = new ThumbnailStamps(() => 1);
    const heard: string[] = [];
    const stop = stamps.listen((project) => heard.push(project));
    stamps.sent("a");
    stop();
    stamps.sent("b");
    expect(heard).toEqual(["a"]);
  });
});

const nothing = async () => undefined;

/** The real studio with the real layout engine and no font files: enough to draw a diagram. */
function newStudio(): Studio {
  const require = createRequire(import.meta.url);
  return new Studio({
    toolVersion: "test",
    fonts: new LazyFiles("fonts/", nothing),
    assets: new LazyFiles("assets/", nothing),
    elk: () => loadElkWorkerFile(require.resolve("elkjs/lib/elk-worker.min.js")),
  });
}

describe("the picture a thumbnail is made of", () => {
  const FLOW = 'diagram main: flow {\n  title "Main"\n\n  a["Start"]\n  b["Done"]\n\n  a -> b\n}\n';
  const MODEL_ONLY = [
    'language "0.2"',
    "",
    "model commerce {",
    '  person customer "Customer"',
    '  system shop "Shop"',
    '  customer -> shop: "Buys"',
    "}",
    "",
  ].join("\n");

  it("is the open diagram as the SVG export writes it", async () => {
    const studio = newStudio();
    studio.load([["diagrams/main.meltemi", FLOW]]);
    expect(drawsSomething(studio.analysis)).toBe(true);
    const rendered = await renderThumbnail(studio);
    expect(rendered.kind).toBe("svg");
    if (rendered.kind !== "svg") return;
    expect(rendered.svg.startsWith("<svg ")).toBe(true);
    expect(rendered.svg).toContain("Start");
    expect(rendered.svg).toContain("Done");
    // It carries the change the person makes.
    studio.setText("diagrams/main.meltemi", FLOW.replace("Start", "Begin"));
    const changed = await renderThumbnail(studio);
    expect(changed.kind === "svg" && changed.svg).toContain("Begin");
  });

  it("is nothing for a file that holds only a model block", async () => {
    const studio = newStudio();
    studio.load([["models/commerce.meltemi", MODEL_ONLY]]);
    expect(drawsSomething(studio.analysis)).toBe(false);
    expect(await renderThumbnail(studio)).toEqual({ kind: "none" });
  });

  it("is nothing for a file that is not a diagram, and for no file", async () => {
    const studio = newStudio();
    studio.load([
      ["README.md", "# Notes\n"],
      ["diagrams/main.meltemi", FLOW],
    ]);
    studio.select("README.md");
    expect(drawsSomething(studio.analysis)).toBe(false);
    expect(await renderThumbnail(studio)).toEqual({ kind: "none" });
    expect(drawsSomething(undefined)).toBe(false);
    const empty = newStudio();
    expect(await renderThumbnail(empty)).toEqual({ kind: "none" });
  });

  it("is nothing for a diagram with errors", async () => {
    const studio = newStudio();
    studio.load([["diagrams/main.meltemi", "diagram main: flow {\n  a -> \n}\n"]]);
    expect(drawsSomething(studio.analysis)).toBe(false);
    expect(await renderThumbnail(studio)).toEqual({ kind: "none" });
  });
});
