import { describe, expect, it } from "vitest";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { CloudApi, Outcome, ProjectVersion } from "../src/cloud/client.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import {
  CHANGED_SHOWN,
  LABEL_MAX,
  VersionsModel,
  changedPaths,
  checkVersionLabel,
  labelProblem,
  newestFirst,
  type VersionsHost,
  type VersionsState,
} from "../src/cloud/versions-model.js";

const ID = "abcdefghij0123456789";
const OTHER = "zyxwvutsrq9876543210";

const version = (number: number, patch: Partial<ProjectVersion> = {}): ProjectVersion => ({
  number,
  label: null,
  auto: false,
  createdAt: "2026-10-14T10:00:00.000Z",
  createdBy: "u-ana",
  changed: [],
  ...patch,
});

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (status: number, code: string): Outcome<never> => ({
  ok: false,
  failure: { kind: "refused", status, code },
});
const unreachable: Outcome<never> = { ok: false, failure: { kind: "unreachable", status: 0 } };

/** A promise the test settles itself, to hold a call in the air. */
function deferred<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
}

interface Rig {
  readonly model: VersionsModel;
  readonly states: VersionsState[];
  /** What happened, in order: the page's flush and the calls to the service. */
  readonly calls: string[];
  /** What was said in the status line. */
  readonly reports: string[];
  /** The service: what it holds, and how it answers each call (a test replaces them). */
  readonly service: {
    versions: ProjectVersion[];
    list: () => Promise<Outcome<ProjectVersion[]>>;
    create: (label: string | undefined) => Promise<Outcome<ProjectVersion>>;
    restore: (number: number) => Promise<Outcome<null>>;
  };
  readonly page: { current: string | undefined };
  /** How many times the page was told a version was restored. */
  readonly restored: { count: number };
}

function rig(initial: ProjectVersion[] = [], words: () => typeof en.cloud = () => en.cloud): Rig {
  const calls: string[] = [];
  const reports: string[] = [];
  const page = { current: ID as string | undefined };
  const restored = { count: 0 };
  const service: Rig["service"] = {
    versions: initial,
    list: async () => ok([...service.versions]),
    create: async (label) => {
      const made = version(Math.max(0, ...service.versions.map((v) => v.number)) + 1, {
        label: label ?? null,
      });
      service.versions.push(made);
      return ok(made);
    },
    restore: async (number) => {
      if (!service.versions.some((v) => v.number === number)) {
        return refused(404, "version.not-found");
      }
      // The state before the restore, kept as an automatic version.
      service.versions.push(
        version(Math.max(...service.versions.map((v) => v.number)) + 1, { auto: true }),
      );
      return ok(null);
    },
  };
  const api: Pick<CloudApi, "versions" | "createVersion" | "restoreVersion"> = {
    versions: (id) => {
      calls.push(`list ${id}`);
      return service.list();
    },
    createVersion: (id, label) => {
      calls.push(`create ${id} ${label === undefined ? "(no label)" : label}`);
      return service.create(label);
    },
    restoreVersion: (id, number) => {
      calls.push(`restore ${id} ${number}`);
      return service.restore(number);
    },
  };
  const host: VersionsHost = {
    api,
    current: () => page.current,
    flush: () => calls.push("flush"),
    report: (message) => reports.push(message),
    restored: () => void restored.count++,
  };
  const states: VersionsState[] = [];
  const model = new VersionsModel(host, ID, words, (state) => states.push(state));
  return { model, states, calls, reports, service, page, restored };
}

describe("a version's label", () => {
  it("is trimmed, at most 80 characters, and may be empty", () => {
    expect(checkVersionLabel("  before review  ")).toEqual({ ok: true, label: "before review" });
    expect(checkVersionLabel("")).toEqual({ ok: true, label: undefined });
    expect(checkVersionLabel("   ")).toEqual({ ok: true, label: undefined });
    expect(checkVersionLabel("a".repeat(LABEL_MAX)).ok).toBe(true);
    expect(checkVersionLabel("a".repeat(LABEL_MAX + 1))).toEqual({ ok: false, reason: "long" });
    expect(LABEL_MAX).toBe(80);
  });

  it("counts characters, not code units, and holds nothing that cannot be shown", () => {
    expect(checkVersionLabel("😀".repeat(80)).ok).toBe(true);
    expect(checkVersionLabel("😀".repeat(81))).toEqual({ ok: false, reason: "long" });
    expect(checkVersionLabel("a\nb")).toEqual({ ok: false, reason: "control" });
    expect(checkVersionLabel("a b")).toEqual({ ok: false, reason: "control" });
    expect(checkVersionLabel("a\ud800b")).toEqual({ ok: false, reason: "control" });
  });

  it("is refused in the words of each language", () => {
    expect(labelProblem("long", en.cloud)).toBe("The name takes at most 80 characters.");
    expect(labelProblem("long", es.cloud)).toBe("El nombre admite como máximo 80 caracteres.");
    expect(labelProblem("control", en.cloud)).toBe(en.cloud.versions.nameControl);
  });
});

describe("the files a version changed", () => {
  it("lists the first few paths and counts the rest", () => {
    const few = ["a.meltemi", "b.meltemi"];
    expect(changedPaths(few)).toEqual({ shown: few, more: 0 });
    const many = Array.from({ length: CHANGED_SHOWN + 5 }, (_, i) => `f${i}.md`);
    const listed = changedPaths(many);
    expect(listed.shown).toHaveLength(CHANGED_SHOWN);
    expect(listed.shown[0]).toBe("f0.md");
    expect(listed.more).toBe(5);
    expect(changedPaths([])).toEqual({ shown: [], more: 0 });
  });

  it("is said in words, with the singular and the plural in each language", () => {
    expect(en.cloud.versions.changed(0)).toBe("No files changed");
    expect(en.cloud.versions.changed(1)).toBe("1 file changed");
    expect(en.cloud.versions.changed(3)).toBe("3 files changed");
    expect(en.cloud.versions.changedMore(2)).toBe("and 2 more");
    expect(es.cloud.versions.changed(1)).toBe("1 archivo cambió");
    expect(es.cloud.versions.changed(3)).toBe("3 archivos cambiaron");
    expect(es.cloud.versions.changedMore(2)).toBe("y 2 más");
  });
});

describe("the list of versions", () => {
  it("shows the newest first, whatever order the service gives, with what each holds", async () => {
    const r = rig([
      version(1, { label: "first", changed: ["a.meltemi", "b.meltemi"] }),
      version(3, { auto: true, changed: ["a.meltemi"] }),
      version(2, { changed: [] }),
    ]);
    await r.model.load();
    expect(r.states[0]).toMatchObject({ list: "loading", status: en.cloud.versions.loading });
    expect(r.model.state.list).toBe("ready");
    expect(r.model.state.status).toBe("");
    expect(r.model.state.versions.map((v) => v.number)).toEqual([3, 2, 1]);
    expect(r.model.state.versions[2]).toMatchObject({
      label: "first",
      changed: ["a.meltemi", "b.meltemi"],
    });
    expect(r.model.state.versions[0]?.auto).toBe(true);
    expect(newestFirst([version(1), version(2)]).map((v) => v.number)).toEqual([2, 1]);
    expect(r.calls).toEqual([`list ${ID}`]);
  });

  it("is empty for a project with no versions", async () => {
    const r = rig();
    await r.model.load();
    expect(r.model.state).toMatchObject({ list: "ready", versions: [], busy: false, problem: "" });
  });

  it("says in the panel and in the status line when it cannot be read, and reads again on request", async () => {
    const r = rig([version(1)]);
    r.service.list = async () => unreachable;
    await r.model.load();
    expect(r.model.state).toMatchObject({
      list: "failed",
      problem: en.cloud.errors.unreachable,
      status: "",
    });
    expect(r.reports).toEqual([en.cloud.errors.unreachable]);
    r.service.list = async () => ok([version(1)]);
    await r.model.load();
    expect(r.model.state).toMatchObject({ list: "ready", problem: "" });
    expect(r.model.state.versions).toHaveLength(1);
  });
});

describe("naming the current state", () => {
  it("sends the person's last edit to the room, then the label, shows the new version first and says so", async () => {
    const r = rig([version(1)]);
    await r.model.load();
    r.calls.length = 0;
    expect(await r.model.name("  before review ")).toBe(true);
    // The page sends what waits before the service looks at the room.
    expect(r.calls).toEqual(["flush", `create ${ID} before review`, `list ${ID}`]);
    expect(r.model.state.versions.map((v) => [v.number, v.label])).toEqual([
      [2, "before review"],
      [1, null],
    ]);
    expect(r.model.state).toMatchObject({
      busy: false,
      problem: "",
      status: en.cloud.versions.created(2, "before review"),
    });
    expect(r.reports).toEqual([en.cloud.versions.created(2, "before review")]);
  });

  it("makes a version with no label from an empty name", async () => {
    const r = rig();
    await r.model.load();
    r.calls.length = 0;
    expect(await r.model.name("   ")).toBe(true);
    expect(r.calls[1]).toBe(`create ${ID} (no label)`);
    expect(r.model.state.versions[0]?.label).toBeNull();
    expect(r.reports).toEqual([en.cloud.versions.created(1, null)]);
  });

  it("accepts a label of exactly 80 characters", async () => {
    const r = rig();
    await r.model.load();
    const label = "x".repeat(80);
    expect(await r.model.name(label)).toBe(true);
    expect(r.calls).toContain(`create ${ID} ${label}`);
  });

  it("refuses a label of 81 characters in the panel, and creates nothing", async () => {
    const r = rig([version(1)]);
    await r.model.load();
    const before = r.model.state.versions;
    r.calls.length = 0;
    expect(await r.model.name("x".repeat(81))).toBe(false);
    // Nothing was flushed, created or listed.
    expect(r.calls).toEqual([]);
    expect(r.service.versions).toHaveLength(1);
    expect(r.model.state).toMatchObject({ busy: false, problem: en.cloud.versions.nameLong(80) });
    expect(r.model.state.versions).toBe(before);
    expect(r.reports).toEqual([]);
    // Changing the label to a good one clears the refusal.
    expect(await r.model.name("short")).toBe(true);
    expect(r.model.state.problem).toBe("");
  });

  it("refuses a label with a control character, and creates nothing", async () => {
    const r = rig();
    await r.model.load();
    r.calls.length = 0;
    expect(await r.model.name("a\tb")).toBe(false);
    expect(r.calls).toEqual([]);
    expect(r.model.state.problem).toBe(en.cloud.versions.nameControl);
  });

  it("does nothing while another action is on its way", async () => {
    const r = rig();
    await r.model.load();
    const held = deferred<Outcome<ProjectVersion>>();
    r.service.create = () => held.promise;
    const first = r.model.name("one");
    expect(r.model.state.busy).toBe(true);
    expect(r.model.state.status).toBe(en.cloud.versions.creating);
    expect(await r.model.name("two")).toBe(false);
    expect(await r.model.restore(version(1))).toBe(false);
    held.settle(ok(version(1, { label: "one" })));
    expect(await first).toBe(true);
    expect(r.calls.filter((call) => call.startsWith("create"))).toHaveLength(1);
    expect(r.model.state.busy).toBe(false);
  });
});

describe("restoring a version", () => {
  it("sends the person's last edit first, restores, says so, and lists the automatic version of the state before", async () => {
    const r = rig([version(1, { label: "before review" })]);
    await r.model.load();
    r.calls.length = 0;
    expect(await r.model.restore(r.model.state.versions[0]!)).toBe(true);
    expect(r.calls).toEqual(["flush", `restore ${ID} 1`, `list ${ID}`]);
    // The list shows the version of the state before the restore, newest first, and the named one stays.
    expect(r.model.state.versions.map((v) => [v.number, v.auto, v.label])).toEqual([
      [2, true, null],
      [1, false, "before review"],
    ]);
    expect(r.model.state).toMatchObject({
      busy: false,
      problem: "",
      status: en.cloud.versions.restored(1),
    });
    expect(r.reports).toEqual([en.cloud.versions.restored(1)]);
  });

  it("tells the page, so that what the person could undo before it is forgotten, only when it was restored", async () => {
    const r = rig([version(1, { label: "before review" })]);
    await r.model.load();
    expect(r.restored.count).toBe(0);
    expect(await r.model.restore(r.model.state.versions[0]!)).toBe(true);
    expect(r.restored.count).toBe(1);
    // A restore the service refused changed nothing, so nothing is forgotten.
    r.service.restore = async () => refused(404, "version.not-found");
    expect(await r.model.restore(r.model.state.versions.at(-1)!)).toBe(false);
    r.service.restore = async () => unreachable;
    expect(await r.model.restore(r.model.state.versions.at(-1)!)).toBe(false);
    expect(r.restored.count).toBe(1);
  });

  it("says a version that is gone, and reads the list again", async () => {
    const r = rig([version(1), version(2)]);
    await r.model.load();
    const gone = r.model.state.versions[0]!;
    // Thinned away meanwhile.
    r.service.versions = [version(1)];
    r.calls.length = 0;
    expect(await r.model.restore(gone)).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.errors.versionNotFound);
    expect(r.reports).toEqual([en.cloud.errors.versionNotFound]);
    expect(r.calls).toEqual(["flush", `restore ${ID} 2`, `list ${ID}`]);
    expect(r.model.state.versions.map((v) => v.number)).toEqual([1]);
    expect(r.model.state.busy).toBe(false);
  });
});

describe("what the service refuses, in the status line", () => {
  const cases: [string, number, string, string][] = [
    ["quota.versions", 413, "the project is full of versions", en.cloud.errors.quotaVersions(200)],
    ["versions.rate", 429, "too many versions in a minute", en.cloud.errors.versionsRate],
    ["project.not-found", 404, "the project is gone", en.cloud.errors.notFound],
  ];

  it.each(cases)("%s on naming a version", async (code, status, _what, words) => {
    const r = rig([version(1)]);
    await r.model.load();
    const before = r.model.state.versions;
    r.service.create = async () => refused(status, code);
    expect(await r.model.name("keep")).toBe(false);
    expect(r.model.state).toMatchObject({ busy: false, status: "", problem: words });
    expect(r.model.state.versions).toBe(before);
    expect(r.reports).toEqual([words]);
    // The panel is usable again.
    r.service.create = async () => ok(version(2, { label: "keep" }));
    expect(await r.model.name("keep")).toBe(true);
  });

  it.each(cases)("%s on restoring a version", async (code, status, _what, words) => {
    const r = rig([version(1)]);
    await r.model.load();
    const before = r.model.state.versions;
    r.service.restore = async () => refused(status, code);
    expect(await r.model.restore(before[0]!)).toBe(false);
    expect(r.model.state).toMatchObject({ busy: false, status: "", problem: words });
    expect(r.model.state.versions).toBe(before);
    expect(r.reports).toEqual([words]);
  });

  it("says 404 version.not-found for a version that is not there", async () => {
    const r = rig([version(1)]);
    await r.model.load();
    expect(await r.model.restore(version(99))).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.errors.versionNotFound);
  });

  it("says a service that cannot be reached, and one that answers what the page cannot read", async () => {
    const r = rig([version(1)]);
    await r.model.load();
    r.service.create = async () => unreachable;
    await r.model.name("x");
    expect(r.model.state.problem).toBe(en.cloud.errors.unreachable);
    r.service.restore = async () => ({
      ok: false,
      failure: { kind: "unexpected", status: 200 },
    });
    await r.model.restore(version(1));
    expect(r.model.state.problem).toBe(en.cloud.errors.unexpected);
  });

  it("speaks the language of the page", async () => {
    const r = rig([version(1)], () => es.cloud);
    await r.model.load();
    r.service.create = async () => refused(413, "quota.versions");
    await r.model.name("x");
    expect(r.model.state.problem).toBe(es.cloud.errors.quotaVersions(CLOUD_LIMITS.versions));
    expect(r.model.state.problem).toMatch(/versiones/);
    r.service.create = async () => refused(429, "versions.rate");
    await r.model.name("x");
    expect(r.model.state.problem).toBe(es.cloud.errors.versionsRate);
    expect(await r.model.name("a".repeat(81))).toBe(false);
    expect(r.model.state.problem).toBe("El nombre admite como máximo 80 caracteres.");
  });

  it("says the list could not be read after an action that worked, and offers to try again", async () => {
    const r = rig([version(1)]);
    await r.model.load();
    r.service.list = async () => unreachable;
    expect(await r.model.name("kept")).toBe(true);
    // The version was made; the list could not be refreshed.
    expect(r.service.versions).toHaveLength(2);
    expect(r.model.state).toMatchObject({
      list: "failed",
      busy: false,
      problem: en.cloud.errors.unreachable,
      status: en.cloud.versions.created(2, "kept"),
    });
  });
});

describe("another project opened meanwhile", () => {
  it("leaves alone what a call that was in the air brings back", async () => {
    const r = rig([version(1)]);
    await r.model.load();
    const held = deferred<Outcome<null>>();
    r.service.restore = () => held.promise;
    const restoring = r.model.restore(version(1));
    r.page.current = OTHER;
    r.reports.length = 0;
    const states = r.states.length;
    held.settle(ok(null));
    expect(await restoring).toBe(false);
    expect(r.reports).toEqual([]);
    expect(r.states).toHaveLength(states);
    // And a panel whose project is not the open one does nothing.
    expect(await r.model.name("late")).toBe(false);
    expect(await r.model.restore(version(1))).toBe(false);
    expect(r.calls.filter((call) => call.startsWith("create"))).toEqual([]);
  });
});
