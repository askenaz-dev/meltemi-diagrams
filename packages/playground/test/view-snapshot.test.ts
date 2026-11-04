// What an anonymous viewer reads (`project-sharing`, "Viewing by link"): the files once, the bytes of
// the images and fonts, into the Studio and nowhere else; and the hint, after five minutes, that the
// project may have changed. The clock is a fake, and so are the service's answers.
import { describe, expect, it } from "vitest";
import type { CloudApi, Outcome, ProjectFiles } from "../src/cloud/client.js";
import { SnapshotViewer } from "../src/cloud/snapshot.js";
import { STALE_AFTER_MS } from "../src/cloud/view-model.js";
import type { StudioChange } from "../src/studio.js";
import { ManualTimers, settle } from "./support/clock.js";
import { newStudio } from "./support/cloud.js";

const ID = "abcdefghij0123456789";
const A = "diagrams/a.meltemi";
const B = "diagrams/b.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const SOURCE_B = 'diagram b: flow {\n  title "b"\n}\n';
const LOGO = new Uint8Array([137, 80, 78, 71, 1]);
const hash = (n: number) => String(n).repeat(64).slice(0, 64);

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (status: number, code: string): Outcome<never> => ({
  ok: false,
  failure: { kind: "refused", status, code },
});

function rig(
  options: {
    files?: Outcome<ProjectFiles>;
    blob?: (hash: string) => Outcome<Uint8Array> | Promise<Outcome<Uint8Array>>;
  } = {},
) {
  const timers = new ManualTimers();
  const studio = newStudio();
  const stale: boolean[] = [];
  const calls: string[] = [];
  let files =
    options.files ??
    ok({ revision: 1, files: { [A]: SOURCE_A, [B]: SOURCE_B }, binaries: {}, collisions: [] });
  let inFlight = 0;
  let peak = 0;
  const api: Pick<CloudApi, "files" | "blob"> = {
    files: (id) => {
      calls.push(`files ${id}`);
      return Promise.resolve(files);
    },
    blob: async (_id, h) => {
      calls.push(`blob ${h.slice(0, 4)}`);
      inFlight++;
      peak = Math.max(peak, inFlight);
      try {
        await settle(3);
        return (await options.blob?.(h)) ?? ok(LOGO);
      } finally {
        inFlight--;
      }
    },
  };
  const changes: StudioChange[] = [];
  const changed: string[] = [];
  studio.listen({ change: (c) => changes.push(c), changed: (p) => changed.push(p) });
  const snapshot = new SnapshotViewer({
    studio,
    api,
    timers,
    stale: (value) => stale.push(value),
  });
  return {
    timers,
    studio,
    snapshot,
    stale,
    calls,
    changes,
    changed,
    set files(next: Outcome<ProjectFiles>) {
      files = next;
    },
    get peak() {
      return peak;
    },
  };
}

describe("reading a project once", () => {
  it("puts the files in the Studio and opens the first source", async () => {
    const r = rig();
    const result = await r.snapshot.load(ID);
    expect(result).toEqual({ ok: true, value: { files: 2, missing: [], cancelled: false } });
    expect(r.studio.host.paths()).toEqual([A, B]);
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect(r.studio.open).toBe(A);
    expect(r.snapshot.id).toBe(ID);
    expect(r.calls).toEqual([`files ${ID}`]);
  });

  it("fetches the bytes of images and fonts, a few at a time, and shows them as files", async () => {
    const binaries: Record<string, string> = {};
    for (let i = 0; i < 9; i++) binaries[`img/i${i}.png`] = hash(i);
    const r = rig({
      files: ok({ revision: 1, files: { [A]: SOURCE_A }, binaries, collisions: [] }),
      blob: (h) => ok(new Uint8Array([h.charCodeAt(0)])),
    });
    const result = await r.snapshot.load(ID);
    expect(result.ok && result.value.files).toBe(10);
    expect(r.calls.filter((c) => c.startsWith("blob"))).toHaveLength(9);
    expect(r.peak).toBeLessThanOrEqual(4);
    expect(r.peak).toBeGreaterThan(1);
    expect(r.studio.host.get("img/i3.png")).toEqual(new Uint8Array(["3".charCodeAt(0)]));
  });

  it("shows the project without an image whose bytes cannot be fetched, and says which", async () => {
    const r = rig({
      files: ok({
        revision: 1,
        files: { [A]: SOURCE_A },
        binaries: { "logo.png": hash(1), "bad.png": hash(2) },
        collisions: [],
      }),
      blob: (h) => (h.startsWith("2") ? refused(404, "blob.unknown") : ok(LOGO)),
    });
    const result = await r.snapshot.load(ID);
    expect(result).toEqual({
      ok: true,
      value: { files: 2, missing: ["bad.png"], cancelled: false },
    });
    expect(r.studio.host.has("logo.png")).toBe(true);
    expect(r.studio.host.has("bad.png")).toBe(false);
  });

  it("answers the failure when the files cannot be read, and leaves the Studio alone", async () => {
    const r = rig({ files: refused(404, "project.not-found") });
    r.studio.load([["mine.md", "mine"]]);
    const result = await r.snapshot.load(ID);
    expect(result).toEqual(refused(404, "project.not-found"));
    expect(r.studio.host.paths()).toEqual(["mine.md"]);
    expect(r.snapshot.id).toBeUndefined();
    r.timers.advance(STALE_AFTER_MS * 2);
    expect(r.stale).toEqual([]);
  });

  it("loads as a bound document does, which is no edit of the person's and moves nothing to storage", async () => {
    const r = rig({
      files: ok({
        revision: 1,
        files: { [A]: SOURCE_A },
        binaries: { "logo.png": hash(1) },
        collisions: [],
      }),
    });
    await r.snapshot.load(ID);
    await r.snapshot.reload();
    // What keeps the anonymous project in the browser follows `changed` (and the page's own
    // actions): a read of the service raises none, and every change it reports is the service's.
    expect(r.changed).toEqual([]);
    expect(r.changes.length).toBeGreaterThan(0);
    expect(r.changes.every((change) => change.remote)).toBe(true);
    // And it needs no storage at all: nothing is handed to it.
    expect(r.timers.waiting).toBe(1);
  });
});

describe("the reload hint", () => {
  it("comes after five minutes, once, and not before", async () => {
    const r = rig();
    await r.snapshot.load(ID);
    expect(r.stale).toEqual([false]);
    r.timers.advance(STALE_AFTER_MS - 1);
    expect(r.stale).toEqual([false]);
    r.timers.advance(1);
    expect(r.stale).toEqual([false, true]);
    r.timers.advance(STALE_AFTER_MS * 3);
    expect(r.stale).toEqual([false, true]);
  });

  it("goes when the project is read again, and comes back five minutes after that", async () => {
    const r = rig();
    await r.snapshot.load(ID);
    r.timers.advance(STALE_AFTER_MS);
    expect(r.stale.at(-1)).toBe(true);
    r.timers.advance(60_000);
    await r.snapshot.reload();
    expect(r.stale.slice(-2)).toEqual([true, false]);
    r.timers.advance(STALE_AFTER_MS - 1);
    expect(r.stale.at(-1)).toBe(false);
    r.timers.advance(1);
    expect(r.stale.at(-1)).toBe(true);
  });

  it("keeps the file the person has open, and shows what changed", async () => {
    const r = rig();
    await r.snapshot.load(ID);
    r.studio.select(B);
    r.files = ok({
      revision: 2,
      files: { [A]: SOURCE_A, [B]: `${SOURCE_B}// newer\n` },
      binaries: {},
      collisions: [],
    });
    const result = await r.snapshot.reload();
    expect(result.ok).toBe(true);
    expect(r.studio.open).toBe(B);
    expect(r.studio.text(B)).toBe(`${SOURCE_B}// newer\n`);
  });

  it("leaves what is shown as it is when reading again fails, and says why", async () => {
    const r = rig();
    await r.snapshot.load(ID);
    r.files = refused(404, "project.not-found");
    const result = await r.snapshot.reload();
    expect(result).toEqual(refused(404, "project.not-found"));
    expect(r.studio.text(A)).toBe(SOURCE_A);
  });

  it("has nothing to read again before a project was read", async () => {
    const r = rig();
    expect(await r.snapshot.reload()).toEqual({
      ok: false,
      failure: { kind: "unexpected", status: 0 },
    });
  });

  it("is dropped when the page leaves the project, and what was in flight loads nothing", async () => {
    const r = rig({
      files: ok({
        revision: 1,
        files: { [A]: SOURCE_A },
        binaries: { "logo.png": hash(1) },
        collisions: [],
      }),
    });
    const loading = r.snapshot.load(ID);
    r.snapshot.close();
    const result = await loading;
    expect(result).toEqual({ ok: true, value: { files: 0, missing: [], cancelled: true } });
    expect(r.studio.host.paths()).toEqual([]);
    expect(r.timers.waiting).toBe(0);
    await r.snapshot.load(ID);
    r.snapshot.close();
    expect(r.timers.waiting).toBe(0);
    r.timers.advance(STALE_AFTER_MS * 2);
    expect(r.stale).toEqual([false]);
  });
});
