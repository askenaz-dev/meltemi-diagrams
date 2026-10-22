import { describe, expect, it } from "vitest";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { CloudApi, Outcome, Usage } from "../src/cloud/client.js";
import { watchUsage } from "../src/cloud/controller.js";
import { AccountUsage, formatBytes, usageView } from "../src/cloud/usage.js";
import { settle } from "./support/clock.js";

const KIB = 1024;
const MIB = 1024 * 1024;

const usage = (projects: number, storageBytes: number, limits: Usage["limits"] = {}): Usage => ({
  projects,
  storageBytes,
  limits,
});

const answered = (value: Usage): Outcome<Usage> => ({ ok: true, value });
const unreachable: Outcome<Usage> = { ok: false, failure: { kind: "unreachable", status: 0 } };

/** A promise the test settles when it likes: the service's answer. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("the size of what an account holds", () => {
  it("is written in the unit a person reads at a glance", () => {
    expect(formatBytes(0, "en")).toBe("0 B");
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(340 * KIB, "en")).toBe("340 KiB");
    expect(formatBytes(Math.round(5.2 * MIB), "en")).toBe("5.2 MiB");
    expect(formatBytes(CLOUD_LIMITS.storageBytes, "en")).toBe("200 MiB");
  });

  it("does not round a size up into a unit it has not reached", () => {
    expect(formatBytes(MIB - 10, "en")).toBe("1 MiB");
    expect(formatBytes(MIB - 1024 * 2, "en")).toBe("1,022 KiB");
  });

  it("uses the separators of the page's language", () => {
    expect(formatBytes(Math.round(5.2 * MIB), "es")).toBe("5,2 MiB");
    expect(formatBytes(1500 * MIB, "en")).toBe("1,500 MiB");
  });
});

describe("the numbers the menu shows", () => {
  it("are the service's, with its limits", () => {
    expect(usageView(usage(3, 1024, { projects: 50, storageBytes: 1000 }))).toEqual({
      projects: 3,
      maxProjects: 50,
      storageBytes: 1024,
      maxStorageBytes: 1000,
      limits: {
        files: CLOUD_LIMITS.files,
        documentBytes: CLOUD_LIMITS.documentBytes,
        binaryBytes: CLOUD_LIMITS.binaryBytes,
        versions: CLOUD_LIMITS.versions,
      },
    });
  });

  it("carry the other limits the service gives, for the account panel", () => {
    expect(
      usageView(usage(1, 1, { files: 10, documentBytes: 20, binaryBytes: 30, versions: 40 }))
        .limits,
    ).toEqual({ files: 10, documentBytes: 20, binaryBytes: 30, versions: 40 });
  });

  it("fall back to the page's own limits for any the service leaves out or gives as nothing", () => {
    expect(usageView(usage(3, 1024))).toEqual({
      projects: 3,
      maxProjects: CLOUD_LIMITS.projects,
      storageBytes: 1024,
      maxStorageBytes: CLOUD_LIMITS.storageBytes,
      limits: {
        files: CLOUD_LIMITS.files,
        documentBytes: CLOUD_LIMITS.documentBytes,
        binaryBytes: CLOUD_LIMITS.binaryBytes,
        versions: CLOUD_LIMITS.versions,
      },
    });
    expect(usageView(usage(0, 0, { projects: 0, storageBytes: -5 }))).toMatchObject({
      maxProjects: CLOUD_LIMITS.projects,
      maxStorageBytes: CLOUD_LIMITS.storageBytes,
    });
  });
});

describe("the account's usage", () => {
  it("has no numbers until the service answers, and holds them when it does", async () => {
    const answer = deferred<Outcome<Usage>>();
    const model = new AccountUsage(() => answer.promise);
    const heard: (number | undefined)[] = [];
    model.listen(() => heard.push(model.view?.projects));
    expect(model.view).toBeUndefined();

    const reading = model.refresh();
    expect(model.view).toBeUndefined();
    answer.resolve(answered(usage(4, 2 * MIB)));
    await reading;

    expect(model.view).toMatchObject({ projects: 4, storageBytes: 2 * MIB });
    expect(heard).toEqual([4]);
  });

  it("says nothing when the service cannot be reached, answers badly or throws", async () => {
    const outcomes: (() => Promise<Outcome<Usage>>)[] = [
      () => Promise.resolve(unreachable),
      () =>
        Promise.resolve({
          ok: false,
          failure: { kind: "refused", status: 401, code: "auth.required" },
        }),
      () => Promise.reject(new Error("the call itself failed")),
    ];
    for (const load of outcomes) {
      const model = new AccountUsage(load);
      let heard = 0;
      model.listen(() => heard++);
      await expect(model.refresh()).resolves.toBeUndefined();
      expect(model.view).toBeUndefined();
      expect(heard).toBe(0);
    }
  });

  it("keeps the numbers it has when a later read fails, and offers none once they are known to be old", async () => {
    let next: Outcome<Usage> = answered(usage(2, 10));
    const model = new AccountUsage(() => Promise.resolve(next));
    const heard: (number | undefined)[] = [];
    model.listen(() => heard.push(model.view?.projects));
    await model.refresh();
    next = unreachable;
    await model.refresh();
    expect(model.view?.projects).toBe(2);
    expect(heard).toEqual([2]);

    // A project was made: what is held is wrong now, and nothing can say what is right.
    model.changed();
    expect(model.view).toBeUndefined();
    await model.refresh();
    expect(model.view).toBeUndefined();
    // Whoever shows the numbers is told that they are gone.
    expect(heard.at(-1)).toBeUndefined();

    next = answered(usage(3, 10));
    await model.refresh();
    expect(model.view?.projects).toBe(3);
  });

  it("makes one read at a time, and one more after it when asked meanwhile", async () => {
    const answers = [deferred<Outcome<Usage>>(), deferred<Outcome<Usage>>()];
    let reads = 0;
    const model = new AccountUsage(() => answers[reads++]!.promise);

    const first = model.refresh();
    const second = model.refresh();
    const third = model.refresh();
    expect(reads).toBe(1);

    answers[0]!.resolve(answered(usage(1, 0)));
    await settle();
    expect(reads).toBe(2);
    answers[1]!.resolve(answered(usage(2, 0)));
    await Promise.all([first, second, third]);

    expect(reads).toBe(2);
    expect(model.view?.projects).toBe(2);
  });

  it("reads again after a change, at once when someone is looking and otherwise at the next look", async () => {
    let reads = 0;
    const model = new AccountUsage(() => Promise.resolve(answered(usage(++reads, 0))));
    model.changed();
    await settle();
    expect(reads).toBe(0);

    const stop = model.listen(() => undefined);
    model.changed();
    await settle();
    expect(reads).toBe(1);

    stop();
    model.changed();
    await settle();
    expect(reads).toBe(1);
  });

  it("does not trust a read that a change overtook", async () => {
    const answers = [deferred<Outcome<Usage>>(), deferred<Outcome<Usage>>()];
    let reads = 0;
    const model = new AccountUsage(() => answers[reads++]!.promise);
    const reading = model.refresh();
    // A version was made while the first read was on its way.
    model.changed();
    answers[0]!.resolve(answered(usage(1, 0)));
    await settle();
    expect(reads).toBe(2);
    answers[1]!.resolve(answered(usage(2, 5)));
    await reading;
    expect(model.view).toMatchObject({ projects: 2, storageBytes: 5 });
  });

  it("stops telling a listener that stopped listening", async () => {
    const model = new AccountUsage(() => Promise.resolve(answered(usage(1, 1))));
    let heard = 0;
    const stop = model.listen(() => heard++);
    await model.refresh();
    stop();
    await model.refresh();
    expect(heard).toBe(1);
  });
});

describe("the calls that change what the account holds", () => {
  const ok = { ok: true, value: null } as const;
  const failed: Outcome<never> = { ok: false, failure: { kind: "refused", status: 413 } };

  /** An API whose every call answers `outcome`, to see which calls the page watches. */
  function answering(outcome: Outcome<unknown>): CloudApi {
    const call = () => Promise.resolve(outcome);
    return {
      list: call,
      create: call,
      get: call,
      update: call,
      duplicate: call,
      remove: call,
      files: call,
      uploadBinary: call,
      deleteBinary: call,
      blob: call,
      versions: call,
      createVersion: call,
      restoreVersion: call,
      putThumbnail: call,
      usage: call,
    } as unknown as CloudApi;
  }

  /** The calls after which `changed` was told, given the answer the service gives. */
  async function watched(outcome: Outcome<unknown>): Promise<string[]> {
    const told: string[] = [];
    let current = "";
    const api = watchUsage(answering(outcome), () => told.push(current));
    const calls: [string, () => Promise<unknown>][] = [
      ["list", () => api.list()],
      ["create", () => api.create({ name: "x" })],
      ["get", () => api.get("p")],
      ["update", () => api.update("p", { name: "y" })],
      ["duplicate", () => api.duplicate("p")],
      ["remove", () => api.remove("p")],
      ["files", () => api.files("p")],
      ["uploadBinary", () => api.uploadBinary("p", "a.png", new Uint8Array(1))],
      ["deleteBinary", () => api.deleteBinary("p", "a.png")],
      ["blob", () => api.blob("p", "h")],
      ["versions", () => api.versions("p")],
      ["createVersion", () => api.createVersion("p", "x")],
      ["restoreVersion", () => api.restoreVersion("p", 1)],
      ["putThumbnail", () => api.putThumbnail("p", "<svg/>")],
      ["usage", () => api.usage()],
    ];
    for (const [name, run] of calls) {
      current = name;
      await run();
    }
    return told;
  }

  it("tell the usage when the service accepted them, and no other call does", async () => {
    expect(await watched(ok)).toEqual([
      "create",
      "duplicate",
      "remove",
      "uploadBinary",
      "deleteBinary",
      "createVersion",
      "restoreVersion",
    ]);
  });

  it("tell it nothing when the service refused them", async () => {
    expect(await watched(failed)).toEqual([]);
  });

  it("hand the answer through as it is", async () => {
    const api = watchUsage(answering(ok), () => undefined);
    expect(await api.create({ name: "x" })).toBe(ok);
  });
});
