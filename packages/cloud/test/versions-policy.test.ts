// The policy of versions (`cloud-projects`, "Versions"; task 2.5): the label, the ISO week, which
// versions thinning lets go, and the one place a version is recorded (`recordVersion`), over both
// stores. A fake clock walks the weeks. No request is made here: the routes are `versions.test.ts`.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import { d1Store } from "../src/store/d1.js";
import { memoryStore } from "../src/store/memory.js";
import type { CloudStore, Version } from "../src/store/types.js";
import {
  MAX_LABEL_LENGTH,
  changedPaths,
  dayOf,
  isoWeek,
  readLabel,
  recordDailyVersion,
  recordVersion,
  sameFiles,
  versionsToThin,
} from "../src/versions.js";
import { DAY, MINUTE, T } from "./support/projects.js";
import { openDatabase, sqliteAvailable } from "./support/sqlite.js";

const OWNER = "u-ana";
const ID = "ana00000000000000001";
const START = Date.parse(T);

/** A version for the pure functions: only what the policy reads is real. */
function version(number: number, createdAt: string, label: string | null = null): Version {
  return { projectId: ID, number, label, auto: false, createdBy: OWNER, createdAt };
}

const at = (days: number, hours = 0): string =>
  new Date(START + days * DAY + hours * 60 * MINUTE).toISOString();

describe("readLabel", () => {
  it("reads no label, null and an empty or blank one as no label", () => {
    for (const given of [undefined, null, "", "   ", "\t\n"]) {
      expect(readLabel(given), JSON.stringify(given)).toBeNull();
    }
  });

  it("trims a label and keeps it as it is otherwise", () => {
    expect(readLabel("  Before the review  ")).toBe("Before the review");
    expect(readLabel("v1 — Ñandú 日本")).toBe("v1 — Ñandú 日本");
  });

  it("counts characters, not UTF-16 units: 80 are allowed, 81 are not", () => {
    expect(MAX_LABEL_LENGTH).toBe(80);
    expect(readLabel("a".repeat(80))).toBe("a".repeat(80));
    expect(readLabel("a".repeat(81))).toBeUndefined();
    // An emoji is two UTF-16 units and one character.
    const emoji = "\u{1F600}".repeat(80);
    expect(emoji.length).toBe(160);
    expect(readLabel(emoji)).toBe(emoji);
    expect(readLabel("\u{1F600}".repeat(81))).toBeUndefined();
    // The limit is on the trimmed label.
    expect(readLabel(` ${"a".repeat(80)} `)).toBe("a".repeat(80));
  });

  it("refuses what is not text and what cannot be shown", () => {
    for (const given of [1, true, {}, [], ["a"]]) {
      expect(readLabel(given), JSON.stringify(given)).toBeUndefined();
    }
    for (const bad of ["a\u0000b", "a\nb", "a b", "a b", "a\u007fb", "a\ud800b"]) {
      expect(readLabel(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });
});

describe("isoWeek", () => {
  it.each([
    ["2026-01-01T00:00:00.000Z", "2026-W01"],
    ["2025-12-29T12:00:00.000Z", "2026-W01"],
    ["2026-10-14T12:00:00.000Z", "2026-W42"],
    ["2026-10-18T23:59:59.999Z", "2026-W42"],
    ["2026-10-19T00:00:00.000Z", "2026-W43"],
    ["2027-01-01T00:00:00.000Z", "2026-W53"],
    ["2027-01-03T23:59:59.999Z", "2026-W53"],
    ["2027-01-04T00:00:00.000Z", "2027-W01"],
    ["2024-12-30T00:00:00.000Z", "2025-W01"],
    ["2024-12-29T00:00:00.000Z", "2024-W52"],
    ["2020-12-31T00:00:00.000Z", "2020-W53"],
    ["2021-01-03T00:00:00.000Z", "2020-W53"],
    ["2021-01-04T00:00:00.000Z", "2021-W01"],
  ])("puts %s in %s", (time, week) => {
    expect(isoWeek(new Date(time))).toBe(week);
  });

  it("is of the UTC day, whatever the machine's zone", () => {
    // Sunday 23:30 in UTC is still Sunday; a minute later it is Monday, the next week.
    expect(isoWeek(new Date("2026-10-18T23:30:00.000Z"))).toBe("2026-W42");
    expect(isoWeek(new Date("2026-10-19T00:00:00.000Z"))).toBe("2026-W43");
  });
});

describe("versionsToThin", () => {
  const NOW = new Date(at(100));

  it("lets nothing go from a project within the policy", () => {
    expect(versionsToThin([], NOW)).toEqual([]);
    const some = Array.from({ length: 100 }, (_, i) => version(i + 1, at(100, -i - 1)));
    expect(versionsToThin(some, NOW)).toEqual([]);
  });

  // The last days before `NOW`, one version an hour: all within the thirty days that are left alone.
  const recentOnes = (first: number, count: number) =>
    Array.from({ length: count }, (_, i) => version(first + i, at(80, i)));

  it("lets the oldest unlabelled versions beyond 100 go, oldest first", () => {
    const many = Array.from({ length: 130 }, (_, i) => version(i + 1, at(100, -(200 - i))));
    expect(versionsToThin(many, NOW)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("never lets a labelled version go, and counts none of them toward the 100", () => {
    const labelled = Array.from({ length: 80 }, (_, i) => version(i + 1, at(1, i), `v${i}`));
    const unlabelled = recentOnes(81, 100);
    expect(versionsToThin([...labelled, ...unlabelled], NOW)).toEqual([]);
    // One more unlabelled: the oldest unlabelled goes, however old the labelled ones are.
    const plus = [...labelled, ...unlabelled, version(181, at(80, 120))];
    expect(versionsToThin(plus, NOW)).toEqual([81]);
  });

  it("counts the version about to be made, so that the oldest one goes to make room for it", () => {
    const full = recentOnes(1, 100);
    expect(versionsToThin(full, NOW)).toEqual([]);
    expect(versionsToThin(full, NOW, { incoming: true })).toEqual([1]);
    expect(versionsToThin(full, NOW, { incoming: false })).toEqual([]);
  });

  it("keeps the newest unlabelled version of each ISO week once they are older than thirty days", () => {
    // Now is 2026-10-14 + 100 days = 2027-01-22 (a Friday). Thirty days before: 2026-12-23 12:00.
    // Old ones: 2026-10-14 (Wed), 15 (Thu), 17 (Sat) of W42; 2026-10-19 (Mon) and 20 (Tue) of W43.
    const old = [
      version(1, at(0)),
      version(2, at(1)),
      version(3, at(3)),
      version(4, at(5)),
      version(5, at(6)),
    ];
    expect(versionsToThin(old, NOW)).toEqual([1, 2, 4]);
  });

  it("leaves the unlabelled versions of the last thirty days alone, however many a week holds", () => {
    const recent = Array.from({ length: 28 }, (_, i) => version(i + 1, at(100, -(i + 1) * 24)));
    expect(versionsToThin(recent, NOW)).toEqual([]);
  });

  it("counts a version as old only when it is more than thirty days old: exactly thirty stays", () => {
    const thirty = at(70);
    expect(thirty).toBe(new Date(NOW.getTime() - 30 * DAY).toISOString());
    // Two in one week, one exactly thirty days old and one a millisecond older.
    const exactly = version(2, thirty);
    const older = version(1, new Date(Date.parse(thirty) - 1).toISOString());
    // Only `older` is old, and alone in its week: it stays.
    expect(versionsToThin([older, exactly], NOW)).toEqual([]);
    // Both a little older than thirty days: both are old, of one week, and the later one stays.
    const beyond = version(2, new Date(Date.parse(thirty) - 2).toISOString());
    expect(versionsToThin([older, beyond], NOW)).toEqual([2]);
  });

  it("never lets an old labelled version go, and does not count it as its week's newest", () => {
    const named = version(2, at(1), "Before the rewrite");
    const unnamed = version(1, at(0));
    const later = version(3, at(2));
    // The week's newest unlabelled one is #3; the labelled #2 is untouched and #1 goes.
    expect(versionsToThin([unnamed, named, later], NOW)).toEqual([1]);
    expect(versionsToThin([unnamed, named], NOW)).toEqual([]);
  });

  it("keeps, of two versions made at the same instant, the later one", () => {
    expect(versionsToThin([version(1, at(0)), version(2, at(0))], NOW)).toEqual([1]);
  });

  it("applies the weeks first and then the 100: what the weeks free is not taken from the recent ones", () => {
    // 30 old versions of one week and 100 recent ones: the weeks leave one old and 100 recent, then
    // the 100 keeps the 100 newest, which are the recent ones.
    const old = Array.from({ length: 30 }, (_, i) => version(i + 1, at(0, i)));
    const recent = recentOnes(31, 100);
    expect(versionsToThin([...old, ...recent], NOW)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    // With 99 recent ones the old week's version is one of the 100 and stays.
    expect(versionsToThin([...old, ...recent.slice(1)], NOW)).toEqual(
      Array.from({ length: 29 }, (_, i) => i + 1),
    );
  });

  it("does not trust a time it cannot read: such a version counts as recent", () => {
    const broken = version(1, "not a time");
    expect(versionsToThin([broken, version(2, at(0))], NOW)).toEqual([]);
  });

  it("is the same for the same input, whatever the order it is given in", () => {
    const list = [version(3, at(2)), version(1, at(0)), version(2, at(1))];
    expect(versionsToThin(list, NOW)).toEqual(versionsToThin([...list].reverse(), NOW));
  });
});

describe("changedPaths and sameFiles", () => {
  const files = (entries: [string, string][]) => new Map(entries);

  it("lists what was added, changed and removed in binary order", () => {
    const before = files([
      ["b.md", "1"],
      ["a.md", "1"],
      ["gone.md", "1"],
    ]);
    const after = files([
      ["a.md", "1"],
      ["b.md", "2"],
      ["new.md", "1"],
    ]);
    expect(changedPaths(before, after)).toEqual(["b.md", "gone.md", "new.md"]);
  });

  it("lists every path for a first version, none for an unchanged one", () => {
    expect(
      changedPaths(
        undefined,
        files([
          ["b", "1"],
          ["a", "1"],
        ]),
      ),
    ).toEqual(["a", "b"]);
    expect(changedPaths(files([["a", "1"]]), files([["a", "1"]]))).toEqual([]);
    expect(changedPaths(undefined, files([]))).toEqual([]);
  });

  it("compares the paths and the hashes", () => {
    expect(sameFiles(files([["a", "1"]]), files([["a", "1"]]))).toBe(true);
    expect(sameFiles(files([["a", "1"]]), files([["a", "2"]]))).toBe(false);
    expect(sameFiles(files([["a", "1"]]), files([["b", "1"]]))).toBe(false);
    expect(
      sameFiles(
        files([["a", "1"]]),
        files([
          ["a", "1"],
          ["b", "1"],
        ]),
      ),
    ).toBe(false);
    expect(sameFiles(files([]), files([]))).toBe(true);
  });

  it("names the day of a stored time", () => {
    expect(dayOf("2026-10-14T23:59:59.999Z")).toBe("2026-10-14");
  });
});

// ---------------------------------------------------------------------------------------------
// Recording, over both stores

const stores: [string, () => Promise<CloudStore>][] = [
  ["the in-memory store", async () => memoryStore()],
];
if (sqliteAvailable) {
  stores.push(["d1Store on the real migration", async () => d1Store(openDatabase())]);
}

/** A store with Ana, a project of hers holding two materialised files, and nothing else. */
async function seeded(make: () => Promise<CloudStore>): Promise<CloudStore> {
  const store = await make();
  await store.upsertUser(
    { sub: OWNER, name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
    T,
  );
  expect(
    await store.createProject(
      { id: ID, ownerSub: OWNER, name: "P", description: "", createdAt: T },
      100,
    ),
  ).toBe("created");
  await store.addBlobs(
    [
      { hash: "1".repeat(64), size: 10, mediaType: "text/plain" },
      { hash: "2".repeat(64), size: 20, mediaType: "text/plain" },
    ],
    T,
  );
  await store.applyMaterialisation({
    projectId: ID,
    upserts: new Map([
      ["a.meltemi", "1".repeat(64)],
      ["notes.md", "2".repeat(64)],
    ]),
    deletes: [],
    blobs: [],
    revision: 1,
    now: T,
  });
  return store;
}

/** Records a version the way a person's request does, at `now`. */
const record = (
  store: CloudStore,
  now: Date,
  options: { label?: string | null; auto?: boolean; rated?: boolean } = {},
) =>
  recordVersion(store, {
    projectId: ID,
    owner: OWNER,
    label: options.label ?? null,
    auto: options.auto ?? false,
    createdBy: OWNER,
    now,
    rated: options.rated ?? true,
  });

/** Puts versions straight into the store, as many as a test needs, with a cap that does not stop it. */
async function put(
  store: CloudStore,
  count: number,
  make: (i: number) => { label: string | null; createdAt: string },
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const { label, createdAt } = make(i);
    const made = await store.createVersion(
      { projectId: ID, label, auto: false, createdBy: OWNER, createdAt },
      { maxVersions: 10_000 },
    );
    expect(typeof made).toBe("object");
  }
}

describe.each(stores)("recordVersion over %s", (_name, make) => {
  it("records a version of the materialised files and answers it with what the project holds", async () => {
    const store = await seeded(make);

    const recorded = await record(store, new Date(START), { label: "First" });

    expect(recorded).toMatchObject({
      version: { number: 1, label: "First", auto: false, createdBy: OWNER, createdAt: T },
    });
    if (typeof recorded === "string") throw new Error("not recorded");
    expect(recorded.remaining.map((held) => held.number)).toEqual([1]);
    expect(await store.versionFiles(ID, 1)).toEqual(await store.projectFiles(ID));
    // The usage follows what the versions reference: the files are the project's anyway.
    expect((await store.usage(OWNER)).storageBytes).toBe(30);
  });

  it("answers missing for a project that is gone", async () => {
    const store = await seeded(make);
    await store.deleteProject(OWNER, ID);

    expect(await record(store, new Date(START))).toBe("missing");
  });

  it("walks thirty-five days of a version a day: each day's is kept for thirty, then one a week", async () => {
    const store = await seeded(make);
    const day = (n: number) => new Date(START + n * DAY).toISOString().slice(0, 10);

    for (let n = 0; n <= 35; n++) {
      const recorded = await record(store, new Date(START + n * DAY));
      expect(typeof recorded, `day ${n}`).toBe("object");
      const held = (await store.listVersions(ID)).map((v) => dayOf(v.createdAt));
      if (n <= 30) {
        // Within thirty days nothing goes.
        expect(held, `day ${n}`).toHaveLength(n + 1);
      } else {
        // From the thirty-first day the days older than thirty (all of week 42, the 14th to the
        // 18th) are one version, the newest of them, and it moves up a day each day.
        expect(held, `day ${n}`).toEqual([
          day(n - 31),
          ...Array.from({ length: 31 }, (_, i) => day(n - 30 + i)),
        ]);
      }
    }

    // Day 35 is 2026-11-18: of the old week only Sunday the 18th is left, and the last thirty-one days.
    const final = await store.listVersions(ID);
    expect(final).toHaveLength(32);
    expect(dayOf(final[0]?.createdAt ?? "")).toBe("2026-10-18");
    expect(dayOf(final[1]?.createdAt ?? "")).toBe("2026-10-19");
    // The numbers go on from where they were: thinning never reuses one.
    expect(final.map((v) => v.number)).toEqual([5, ...Array.from({ length: 31 }, (_, i) => 6 + i)]);
    expect(final.at(-1)?.number).toBe(36);
  });

  it("keeps one unlabelled version of each week once seventy days have passed", async () => {
    const store = await seeded(make);
    for (let n = 0; n <= 70; n++) await record(store, new Date(START + n * DAY));

    const held = (await store.listVersions(ID)).map((v) =>
      Math.round((Date.parse(v.createdAt) - START) / DAY),
    );
    // Day 0 is a Wednesday: the Sundays are the days 4, 11, 18, 25, 32 and 39 (the old ones, which
    // are the days before day 40), and every day of the last thirty is kept.
    expect(held).toEqual([4, 11, 18, 25, 32, 39, ...Array.from({ length: 31 }, (_, i) => 40 + i)]);
  });

  it("lets the oldest unlabelled version go when a 101st is made, and keeps the named one", async () => {
    const store = await seeded(make);
    await put(store, 1, () => ({ label: "v1", createdAt: at(1) }));
    await put(store, 100, (i) => ({ label: null, createdAt: at(0, i) }));
    expect(await store.countVersions(ID)).toBe(101);
    const numbers = (await store.listVersions(ID)).map((v) => v.number);

    const recorded = await record(store, new Date(START + 5 * DAY));

    expect(typeof recorded).toBe("object");
    const held = await store.listVersions(ID);
    expect(held).toHaveLength(101);
    // v1 (a label) is still there; the oldest of the hundred is gone; the new one is there.
    expect(held[0]).toMatchObject({ number: 1, label: "v1" });
    expect(held.map((v) => v.number)).not.toContain(numbers[1]);
    expect(held.map((v) => v.number)).toEqual([1, ...numbers.slice(2), 102]);
  });

  it("does not thin for a new labelled version: a label is not one of the hundred", async () => {
    const store = await seeded(make);
    await put(store, 100, (i) => ({ label: null, createdAt: at(0, i) }));

    const recorded = await record(store, new Date(START + 5 * DAY), { label: "Named" });

    expect(typeof recorded).toBe("object");
    expect(await store.countVersions(ID)).toBe(101);
  });

  it("refuses the 201st, with nothing recorded, when the project is full of labelled versions", async () => {
    const store = await seeded(make);
    await put(store, CLOUD_LIMITS.versions, (i) => ({ label: `v${i}`, createdAt: at(-10, i) }));

    const recorded = await record(store, new Date(START + 5 * DAY));

    expect(recorded).toBe("quota");
    expect(await store.countVersions(ID)).toBe(200);
    // Nor a labelled one, nor an automatic one that no rate limits.
    expect(await record(store, new Date(START + 5 * DAY), { label: "x" })).toBe("quota");
    expect(await record(store, new Date(START + 5 * DAY), { auto: true, rated: false })).toBe(
      "quota",
    );
    expect(await store.countVersions(ID)).toBe(200);
  });

  it("makes room in a full project by letting its oldest unlabelled version go", async () => {
    const store = await seeded(make);
    await put(store, 100, (i) => ({ label: `v${i}`, createdAt: at(-10, i) }));
    await put(store, 100, (i) => ({ label: null, createdAt: at(-5, i) }));
    expect(await store.countVersions(ID)).toBe(200);
    const oldest = (await store.listVersions(ID)).find((v) => v.label === null)?.number;

    const recorded = await record(store, new Date(START + 5 * DAY));

    expect(typeof recorded).toBe("object");
    const held = await store.listVersions(ID);
    expect(held).toHaveLength(200);
    expect(held.map((v) => v.number)).not.toContain(oldest);
    expect(held.filter((v) => v.label !== null)).toHaveLength(100);
    // A labelled one finds no room: only unlabelled versions make way, and only for unlabelled ones.
    expect(await record(store, new Date(START + 5 * DAY), { label: "one more" })).toBe("quota");
    expect(await store.countVersions(ID)).toBe(200);
  });

  it("makes room by what has grown old since: a project full of weeks thins itself at the next version", async () => {
    const store = await seeded(make);
    // 100 labelled and 100 unlabelled versions made on one day (all the same ISO week), then 40 days on.
    await put(store, 100, (i) => ({ label: `v${i}`, createdAt: at(0, i) }));
    await put(store, 100, (i) => ({ label: null, createdAt: at(0, i) }));

    const recorded = await record(store, new Date(START + 40 * DAY));

    expect(typeof recorded).toBe("object");
    // The hundred unlabelled ones of one old week are one; the labelled ones all stay.
    const held = await store.listVersions(ID);
    expect(held.filter((v) => v.label !== null)).toHaveLength(100);
    expect(held.filter((v) => v.label === null)).toHaveLength(2);
  });

  it("refuses the seventh version of a minute, and the minute is counted back from now", async () => {
    const store = await seeded(make);
    const now = new Date(START);
    for (let i = 0; i < 6; i++)
      expect(typeof (await record(store, now)), `#${i + 1}`).toBe("object");

    expect(await record(store, now)).toBe("rate");
    expect(await store.countVersions(ID)).toBe(6);
    // 59 seconds later the first six are still within the minute; a full minute on they are not.
    expect(await record(store, new Date(START + 59_000))).toBe("rate");
    expect(typeof (await record(store, new Date(START + 60_001)))).toBe("object");
  });

  it("does not rate an automatic version that nobody asked for, though it counts toward the next one", async () => {
    const store = await seeded(make);
    const now = new Date(START);
    for (let i = 0; i < 6; i++) await record(store, now, { auto: true, rated: false });
    for (let i = 0; i < 3; i++) {
      expect(typeof (await record(store, now, { auto: true, rated: false }))).toBe("object");
    }
    // Nine in the minute: a person's request is refused.
    expect(await record(store, now)).toBe("rate");
  });

  it("reports the cap before the rate", async () => {
    const store = await seeded(make);
    // Two hundred versions, all made within the last minute: the cap and the rate are both over.
    await put(store, CLOUD_LIMITS.versions, (i) => ({
      label: `v${i}`,
      createdAt: new Date(START - 1000 * (i % 50)).toISOString(),
    }));

    // The cap is what is told.
    expect(await record(store, new Date(START))).toBe("quota");
  });

  it("deletes nothing for a request the rate refuses, though the project is full and thinning could make room", async () => {
    const store = await seeded(make);
    await put(store, 100, (i) => ({ label: `v${i}`, createdAt: at(-10, i) }));
    await put(store, 94, (i) => ({ label: null, createdAt: at(-5, i) }));
    // Six unlabelled ones made within the last minute.
    await put(store, 6, () => ({ label: null, createdAt: new Date(START - 10_000).toISOString() }));
    expect(await store.countVersions(ID)).toBe(200);
    const before = (await store.listVersions(ID)).map((v) => v.number);

    expect(await record(store, new Date(START))).toBe("rate");

    expect((await store.listVersions(ID)).map((v) => v.number)).toEqual(before);
    // A minute later the same request makes room and is recorded.
    expect(typeof (await record(store, new Date(START + 2 * MINUTE)))).toBe("object");
    expect(await store.countVersions(ID)).toBe(200);
  });

  it("refreshes the usage after thinning: the bytes only a thinned version held are no longer the person's", async () => {
    const store = await seeded(make);
    await store.addBlobs([{ hash: "3".repeat(64), size: 1000, mediaType: "text/plain" }], T);
    // Version 1 holds a file the project no longer has.
    await store.applyMaterialisation({
      projectId: ID,
      upserts: new Map([["old.md", "3".repeat(64)]]),
      deletes: [],
      blobs: [],
      revision: 2,
      now: T,
    });
    await record(store, new Date(START));
    await store.applyMaterialisation({
      projectId: ID,
      upserts: new Map(),
      deletes: ["old.md"],
      blobs: [],
      revision: 3,
      now: T,
    });
    await store.refreshStorageBytes(OWNER);
    expect((await store.usage(OWNER)).storageBytes).toBe(1030);
    // Ninety-nine more, and the hundred and first unlabelled version thins the first.
    await put(store, 99, (i) => ({ label: null, createdAt: at(-20, i) }));

    await record(store, new Date(START + 2 * DAY));

    expect((await store.versionFiles(ID, 1)) === undefined).toBe(true);
    expect((await store.usage(OWNER)).storageBytes).toBe(30);
  });
});

describe.each(stores)("the daily version over %s", (_name, make) => {
  const files = (...entries: [string, string][]) => new Map(entries);
  const A = "a".repeat(64);
  const B = "b".repeat(64);
  const day = (n: number, hours = 0) => new Date(START + n * DAY + hours * 60 * MINUTE);

  it("is not made on the day the project was created", async () => {
    const store = await seeded(make);

    expect(
      await recordDailyVersion(store, { projectId: ID, files: files(["a", A]), now: day(0, 5) }),
    ).toBe(0);
    expect(await store.countVersions(ID)).toBe(0);
  });

  it("is the first one a project gets, on a day after its creation, and counts its rows", async () => {
    const store = await seeded(make);
    const current = await store.projectFiles(ID);

    const rows = await recordDailyVersion(store, { projectId: ID, files: current, now: day(1) });

    expect(rows).toBe(1 + current.size);
    expect(await store.listVersions(ID)).toEqual([
      {
        projectId: ID,
        number: 1,
        label: null,
        auto: true,
        createdBy: OWNER,
        createdAt: day(1).toISOString(),
      },
    ]);
  });

  it("is made once a day: not again while a version of the day exists, whoever made it", async () => {
    const store = await seeded(make);
    const current = await store.projectFiles(ID);
    await recordDailyVersion(store, { projectId: ID, files: current, now: day(1) });

    expect(
      await recordDailyVersion(store, { projectId: ID, files: files(["z", B]), now: day(1, 6) }),
    ).toBe(0);
    expect(await store.countVersions(ID)).toBe(1);
    // A named version of today counts as the day's too.
    await record(store, day(2), { label: "Named" });
    expect(
      await recordDailyVersion(store, { projectId: ID, files: files(["z", B]), now: day(2, 6) }),
    ).toBe(0);
    expect(await store.countVersions(ID)).toBe(2);
  });

  it("is not made when the files are the latest version's", async () => {
    const store = await seeded(make);
    const current = await store.projectFiles(ID);
    await record(store, day(0, 1));

    expect(await recordDailyVersion(store, { projectId: ID, files: current, now: day(1) })).toBe(0);
    expect(await store.countVersions(ID)).toBe(1);
    // Changed: made.
    expect(
      await recordDailyVersion(store, { projectId: ID, files: files(["z", B]), now: day(2) }),
    ).toBe(2);
  });

  it("is not made for a project with no files and no version", async () => {
    const store = await seeded(make);

    expect(await recordDailyVersion(store, { projectId: ID, files: files(), now: day(1) })).toBe(0);
  });

  it("is made for a project that lost every file since its latest version", async () => {
    const store = await seeded(make);
    await record(store, day(0, 1));
    await store.applyMaterialisation({
      projectId: ID,
      upserts: new Map(),
      deletes: ["a.meltemi", "notes.md"],
      blobs: [],
      revision: 2,
      now: T,
    });

    expect(await recordDailyVersion(store, { projectId: ID, files: files(), now: day(1) })).toBe(1);
    expect(await store.versionFiles(ID, 2)).toEqual(new Map());
  });

  it("is skipped, silently, when the project is full of labelled versions", async () => {
    const store = await seeded(make);
    await put(store, CLOUD_LIMITS.versions, (i) => ({ label: `v${i}`, createdAt: at(0, i % 5) }));

    expect(
      await recordDailyVersion(store, { projectId: ID, files: files(["z", B]), now: day(3) }),
    ).toBe(0);
    expect(await store.countVersions(ID)).toBe(200);
  });

  it("makes room for itself like any version: a full project of unlabelled ones lets its oldest go", async () => {
    const store = await seeded(make);
    await put(store, 100, (i) => ({ label: `v${i}`, createdAt: at(0, i % 5) }));
    await put(store, 100, (i) => ({ label: null, createdAt: at(0, i % 5) }));

    expect(
      await recordDailyVersion(store, { projectId: ID, files: files(["z", B]), now: day(2) }),
    ).toBe(2);
    expect(await store.countVersions(ID)).toBe(200);
  });

  it("is nothing for a project that is gone", async () => {
    const store = await seeded(make);
    await store.deleteProject(OWNER, ID);

    expect(
      await recordDailyVersion(store, { projectId: ID, files: files(["z", B]), now: day(2) }),
    ).toBe(0);
  });

  it("knows the owner it is told and asks for it otherwise", async () => {
    const store = await seeded(make);
    const current = await store.projectFiles(ID);

    expect(
      await recordDailyVersion(store, { projectId: ID, files: current, now: day(1), owner: OWNER }),
    ).toBeGreaterThan(0);
    expect((await store.latestVersion(ID))?.createdBy).toBe(OWNER);
  });
});
