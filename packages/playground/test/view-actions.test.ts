// What a viewer does with the project in front of them (`project-sharing`, "Viewing by link"): make a
// copy as the project of this browser, save a copy to their projects, read the snapshot again.
import { describe, expect, it } from "vitest";
import type { CloudProject, Outcome } from "../src/cloud/client.js";
import type { OpenOutcome } from "../src/cloud/projects-model.js";
import { ViewActions, type ActionsHost, type KeptWork } from "../src/cloud/view-actions.js";
import { ViewMode } from "../src/cloud/view-mode.js";
import { en } from "../src/messages/en.js";
import { newStudio } from "./support/cloud.js";

const ID = "abcdefghij0123456789";
const COPY_ID = "zyxwvutsrq9876543210";
const A = "diagrams/a.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';

const row = (id: string, name: string): CloudProject => ({
  id,
  name,
  description: "",
  updatedAt: "",
  thumbnail: undefined,
  role: "owner",
});

interface Options {
  readonly signedIn?: boolean;
  readonly kept?: KeptWork;
  readonly template?: boolean;
  readonly confirmed?: boolean;
  readonly duplicate?: Outcome<CloudProject>;
  readonly opened?: OpenOutcome;
  readonly reload?: "ok" | "fail" | "missing" | "cancelled";
  readonly live?: boolean;
  /** The snapshot's files are still on their way: the Studio shows nothing of the project yet. */
  readonly loading?: boolean;
}

function rig(options: Options = {}) {
  const studio = newStudio();
  studio.load([[A, SOURCE_A]], A);
  const mode = new ViewMode(studio);
  const log: string[] = [];
  const reports: string[] = [];
  const asked: { title: string; message: string; action: string }[] = [];
  let release: (() => void) | undefined;
  const snapshot = { read: options.loading !== true };
  const host: ActionsHost = {
    mode,
    studio,
    cloud: options.signedIn
      ? {
          duplicate: (id) => {
            log.push(`duplicate ${id}`);
            return Promise.resolve(
              options.duplicate ?? { ok: true, value: row(COPY_ID, "Purchase (copy)") },
            );
          },
          open: (id) => {
            log.push(`open ${id}`);
            return Promise.resolve(options.opened ?? "opened");
          },
        }
      : undefined,
    snapshot: {
      // The project the snapshot shows, once it is read.
      get id() {
        return snapshot.read ? ID : undefined;
      },
      reload: () => {
        log.push("reload");
        if (options.reload === "fail") {
          return Promise.resolve({
            ok: false,
            failure: { kind: "refused", status: 404, code: "project.not-found" },
          });
        }
        return Promise.resolve({
          ok: true,
          value: {
            files: 1,
            missing: options.reload === "missing" ? ["logo.png"] : [],
            cancelled: options.reload === "cancelled",
          },
        });
      },
    } as unknown as ActionsHost["snapshot"],
    words: () => ({ viewing: en.viewing, cloud: en.cloud }),
    report: (message) => reports.push(message),
    files: () =>
      new Map<string, string | Uint8Array>([
        [A, SOURCE_A],
        ["logo.png", new Uint8Array([1])],
      ]),
    keptWork: () => options.kept,
    isTemplate: () => options.template === true,
    confirm: (title, message, action) => {
      asked.push({ title, message, action });
      if (options.confirmed !== undefined) return Promise.resolve(options.confirmed);
      return new Promise((resolve) => (release = () => resolve(true)));
    },
    leave: () => {
      log.push("leave");
      mode.leave();
    },
    replaceProject: (files, open) =>
      log.push(`replace ${[...files.keys()].join(",")} open=${open}`),
  };
  mode.enter({
    id: ID,
    name: "Purchase",
    live: options.live ?? false,
    signedIn: options.signedIn === true,
  });
  return {
    actions: new ViewActions(host),
    mode,
    studio,
    snapshot,
    log,
    reports,
    asked,
    answer: () => release?.(),
  };
}

const kept = (files: Record<string, string>): KeptWork => ({
  open: A,
  files: new Map(Object.entries(files)),
});

describe("make a copy", () => {
  it("replaces the project of this browser with the viewed files, after asking when that is work", async () => {
    const r = rig({ kept: kept({ "mine.md": "my work" }), confirmed: true });
    expect(await r.actions.makeCopy()).toBe(true);
    expect(r.asked).toEqual([
      {
        title: en.viewing.copyConfirmTitle,
        message: en.viewing.copyConfirmMessage,
        action: en.viewing.copyConfirm,
      },
    ]);
    // The anonymous project comes back first, then the copy replaces it (keeping it as the previous one).
    expect(r.log).toEqual(["leave", `replace ${A},logo.png open=${A}`]);
    expect(r.reports).toEqual([en.viewing.copied("Purchase")]);
    expect(r.mode.active).toBe(false);
    expect(r.studio.readOnly).toBe(false);
  });

  it("changes nothing when the person declines", async () => {
    const r = rig({ kept: kept({ "mine.md": "my work" }), confirmed: false });
    expect(await r.actions.makeCopy()).toBe(false);
    expect(r.log).toEqual([]);
    expect(r.reports).toEqual([]);
    expect(r.mode.active).toBe(true);
    expect(r.studio.readOnly).toBe(true);
  });

  it("does not ask when the browser keeps nothing, or only a template", async () => {
    for (const options of [
      {},
      { kept: kept({}) },
      { kept: kept({ "a.md": "x" }), template: true },
    ]) {
      const r = rig(options);
      expect(await r.actions.makeCopy()).toBe(true);
      expect(r.asked).toEqual([]);
      expect(r.log[0]).toBe("leave");
    }
  });

  it("does not ask when the browser already keeps exactly this project", async () => {
    // The viewed files are `A` and an image; a kept project of just `A` differs, so it asks...
    const differs = rig({ kept: kept({ [A]: SOURCE_A }), confirmed: false });
    expect(await differs.actions.makeCopy()).toBe(false);
    expect(differs.asked).toHaveLength(1);
    // ...and one holding exactly the viewed files does not.
    const same = rig({
      kept: {
        open: A,
        files: new Map<string, string | Uint8Array>([
          [A, SOURCE_A],
          ["logo.png", new Uint8Array([1])],
        ]),
      },
    });
    expect(await same.actions.makeCopy()).toBe(true);
    expect(same.asked).toEqual([]);
  });

  it("makes no copy while the snapshot is still being read, and says so", async () => {
    // Nothing kept, so nothing is asked: the empty Studio would replace the project of the browser.
    const r = rig({ loading: true });
    expect(await r.actions.makeCopy()).toBe(false);
    expect(r.log).toEqual([]);
    expect(r.reports).toEqual([en.viewing.copyLoading]);
    expect(r.mode.active).toBe(true);
    expect(r.studio.readOnly).toBe(true);
    // Work the browser keeps is not even asked about.
    const kept = rig({ loading: true, kept: { open: A, files: new Map([["mine.md", "work"]]) } });
    expect(await kept.actions.makeCopy()).toBe(false);
    expect(kept.asked).toEqual([]);
    expect(kept.log).toEqual([]);
  });

  it("makes no copy when the snapshot is still being read as the person confirms", async () => {
    const r = rig({ kept: kept({ "mine.md": "my work" }) });
    const pending = r.actions.makeCopy();
    // The snapshot was read again (or cancelled) while the question was open.
    r.snapshot.read = false;
    r.answer();
    expect(await pending).toBe(false);
    expect(r.log).toEqual([]);
    expect(r.reports).toEqual([en.viewing.copyLoading]);
  });

  it("copies a followed room at once: its files are in the Studio before the header offers anything", async () => {
    const r = rig({ live: true, loading: true });
    expect(await r.actions.makeCopy()).toBe(true);
    expect(r.log[0]).toBe("leave");
  });

  it("does not copy a project the page left while the person decided", async () => {
    const r = rig({ kept: kept({ "mine.md": "my work" }) });
    const pending = r.actions.makeCopy();
    r.mode.leave();
    r.answer();
    expect(await pending).toBe(false);
    expect(r.log).toEqual([]);
  });

  it("is one copy at a time", async () => {
    const r = rig({ kept: kept({ "mine.md": "my work" }) });
    const first = r.actions.makeCopy();
    expect(await r.actions.makeCopy()).toBe(false);
    r.answer();
    expect(await first).toBe(true);
  });

  it("does nothing outside view mode", async () => {
    const r = rig();
    r.mode.leave();
    expect(await r.actions.makeCopy()).toBe(false);
    expect(r.log).toEqual([]);
  });
});

describe("save a copy to my projects", () => {
  it("duplicates the project into the account and opens the copy", async () => {
    const r = rig({ signedIn: true, live: true });
    expect(r.actions.canSave).toBe(true);
    expect(await r.actions.saveCopy()).toBe(true);
    expect(r.log).toEqual([`duplicate ${ID}`, `open ${COPY_ID}`]);
    expect(r.reports).toEqual([
      en.viewing.savingCopy("Purchase"),
      en.viewing.savedCopy("Purchase (copy)"),
    ]);
  });

  it("says the account's limit as the drawer does, and opens nothing", async () => {
    const r = rig({
      signedIn: true,
      duplicate: { ok: false, failure: { kind: "refused", status: 413, code: "quota.projects" } },
    });
    expect(await r.actions.saveCopy()).toBe(false);
    expect(r.log).toEqual([`duplicate ${ID}`]);
    expect(r.reports.at(-1)).toMatch(/at most 100 projects/);
  });

  it("does not say the copy is saved when it could not be opened", async () => {
    const r = rig({ signedIn: true, opened: "failed" });
    expect(await r.actions.saveCopy()).toBe(false);
    expect(r.reports).toEqual([en.viewing.savingCopy("Purchase")]);
  });

  it("is for a person signed in: nobody has an account to save to", async () => {
    const r = rig();
    expect(r.actions.canSave).toBe(false);
    expect(await r.actions.saveCopy()).toBe(false);
    expect(r.log).toEqual([]);
  });
});

describe("reading the snapshot again", () => {
  it("reads it and says so", async () => {
    const r = rig();
    expect(await r.actions.reload()).toBe(true);
    expect(r.log).toEqual(["reload"]);
    expect(r.reports).toEqual([en.viewing.reloaded]);
  });

  it("says why when it cannot, and which image is missing when one is", async () => {
    const failed = rig({ reload: "fail" });
    expect(await failed.actions.reload()).toBe(false);
    expect(failed.reports).toEqual([en.cloud.errors.notFound]);
    const missing = rig({ reload: "missing" });
    expect(await missing.actions.reload()).toBe(true);
    expect(missing.reports).toEqual([en.cloud.project.binaryFetch("logo.png")]);
    const cancelled = rig({ reload: "cancelled" });
    expect(await cancelled.actions.reload()).toBe(false);
    expect(cancelled.reports).toEqual([]);
  });

  it("is for a snapshot: a live viewer already sees the changes", async () => {
    const r = rig({ signedIn: true, live: true });
    expect(await r.actions.reload()).toBe(false);
    expect(r.log).toEqual([]);
  });
});
