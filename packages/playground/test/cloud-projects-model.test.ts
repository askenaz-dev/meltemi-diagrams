import { describe, expect, it } from "vitest";
import type { CloudApi, CloudProject, Outcome } from "../src/cloud/client.js";
import {
  PROJECT_NAME_MAX,
  ProjectsModel,
  checkProjectName,
  nameProblem,
  type OpenOutcome,
  type ProjectsHost,
  type ProjectsState,
} from "../src/cloud/projects-model.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const project = (id: string, name = id, patch: Partial<CloudProject> = {}): CloudProject => ({
  id,
  name,
  description: "",
  updatedAt: "2026-10-14T10:00:00.000Z",
  thumbnail: undefined,
  role: "owner",
  ...patch,
});

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (status: number, code?: string): Outcome<never> => ({
  ok: false,
  failure: { kind: "refused", status, ...(code ? { code } : {}) },
});
const unreachable: Outcome<never> = { ok: false, failure: { kind: "unreachable", status: 0 } };

/** A promise the test settles itself, to hold a call in the air. */
function deferred<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
}

interface Rig {
  readonly model: ProjectsModel;
  readonly states: ProjectsState[];
  readonly reports: string[];
  readonly calls: string[];
  readonly host: {
    current: string | undefined;
    canSave: boolean;
    open: (id: string) => Promise<OpenOutcome>;
    create: (name: string, template: string) => Promise<Outcome<CloudProject>>;
    save: (name: string) => Promise<Outcome<CloudProject>>;
    list: () => Promise<Outcome<CloudProject[]>>;
    update: (id: string, name: string) => Promise<Outcome<CloudProject>>;
    duplicate: (id: string) => Promise<Outcome<CloudProject>>;
    remove: (id: string) => Promise<Outcome<null>>;
    progress: [string, number, number][];
  };
  readonly listeners: Set<(message: string) => void>;
  readonly projectsHost: ProjectsHost;
}

function rig(listed: CloudProject[] = [project("a", "Alpha"), project("b", "Beta")]): Rig {
  const calls: string[] = [];
  const reports: string[] = [];
  const listeners = new Set<(message: string) => void>();
  const host: Rig["host"] = {
    current: undefined,
    canSave: false,
    open: async () => "opened",
    create: async (name) => ok(project("new", name)),
    save: async (name) => ok(project("saved", name)),
    list: async () => ok(listed),
    update: async (id, name) => ok(project(id, name)),
    duplicate: async (id) => ok(project(`${id}2`, `${id} copy`)),
    remove: async () => ok(null),
    progress: [],
  };
  const api = {
    list: () => {
      calls.push("list");
      return host.list();
    },
    update: (id: string, patch: { name?: string }) => {
      calls.push(`update ${id} ${patch.name}`);
      return host.update(id, patch.name ?? "");
    },
    duplicate: (id: string) => {
      calls.push(`duplicate ${id}`);
      return host.duplicate(id);
    },
    remove: (id: string) => {
      calls.push(`remove ${id}`);
      return host.remove(id);
    },
  } as unknown as CloudApi;
  const projectsHost: ProjectsHost = {
    api,
    current: () => host.current,
    canSaveLocal: () => host.canSave,
    open: (id) => {
      calls.push(`open ${id}`);
      return host.open(id);
    },
    createFrom: (name, template) => {
      calls.push(`create ${name} from ${template}`);
      return host.create(name, template);
    },
    saveLocal: (name, progress) => {
      calls.push(`save ${name}`);
      for (const [path, done, total] of host.progress) progress(path, done, total);
      return host.save(name);
    },
    uploadProject: (name, files, progress) => {
      calls.push(`upload ${name} with ${[...files.keys()].join(", ")}`);
      for (const [path, done, total] of host.progress) progress(path, done, total);
      return host.save(name);
    },
    renamed: (id, name) => calls.push(`renamed ${id} ${name}`),
    leaveToLocal: () => {
      calls.push("leave");
      host.current = undefined;
    },
    deleted: (id) => calls.push(`deleted ${id}`),
    report: (message) => {
      reports.push(message);
      for (const listener of [...listeners]) listener(message);
    },
    watch: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const states: ProjectsState[] = [];
  const model = new ProjectsModel(
    projectsHost,
    () => en.cloud,
    (state) => states.push(state),
  );
  return { model, states, reports, calls, host, listeners, projectsHost };
}

describe("a project's name", () => {
  it("is trimmed, from 1 to 100 characters, and holds nothing that cannot be shown", () => {
    expect(checkProjectName("  Purchase  ")).toEqual({ ok: true, name: "Purchase" });
    expect(checkProjectName("")).toEqual({ ok: false, reason: "empty" });
    expect(checkProjectName("   ")).toEqual({ ok: false, reason: "empty" });
    expect(checkProjectName("a".repeat(PROJECT_NAME_MAX)).ok).toBe(true);
    expect(checkProjectName("a".repeat(PROJECT_NAME_MAX + 1))).toEqual({
      ok: false,
      reason: "long",
    });
    // Characters, not code units: 100 emoji are 100.
    expect(checkProjectName("😀".repeat(100)).ok).toBe(true);
    expect(checkProjectName("😀".repeat(101))).toEqual({ ok: false, reason: "long" });
    expect(checkProjectName("a\nb")).toEqual({ ok: false, reason: "control" });
    expect(checkProjectName("a b")).toEqual({ ok: false, reason: "control" });
    expect(checkProjectName("a\ud800b")).toEqual({ ok: false, reason: "control" });
  });

  it("is refused in words, in both languages", () => {
    expect(nameProblem("empty", en.cloud)).toBe("Give the project a name.");
    expect(nameProblem("long", en.cloud)).toBe("The name takes at most 100 characters.");
    expect(nameProblem("control", en.cloud)).toBe("The name cannot hold control characters.");
    expect(nameProblem("long", es.cloud)).toBe("El nombre admite como máximo 100 caracteres.");
  });
});

describe("the list", () => {
  it("starts unread, with what the page knows of the open project and the local one", () => {
    const r = rig();
    r.host.current = "a";
    r.host.canSave = true;
    const model = new ProjectsModel(
      r.projectsHost,
      () => en.cloud,
      () => undefined,
    );
    expect(model.state).toEqual({
      list: "loading",
      projects: [],
      busy: false,
      status: "",
      problem: "",
      current: "a",
      canSave: true,
      limit: 100,
    });
  });

  it("is read from the service", async () => {
    const r = rig();
    await r.model.load();
    expect(r.model.state.list).toBe("ready");
    expect(r.model.state.projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    expect(r.states.map((s) => s.list)).toEqual(["loading", "ready"]);
    expect(r.states[0]!.status).toBe(en.cloud.projects.loading);
    expect(r.model.state.status).toBe("");
  });

  it("fails in words, and can be read again", async () => {
    const r = rig();
    r.host.list = async () => unreachable;
    await r.model.load();
    expect(r.model.state.list).toBe("failed");
    expect(r.model.state.problem).toBe(en.cloud.errors.unreachable);
    r.host.list = async () => ok([project("a")]);
    await r.model.load();
    expect(r.model.state.list).toBe("ready");
    expect(r.model.state.problem).toBe("");
  });

  it("follows which project is open and whether the local one can be saved", async () => {
    const r = rig();
    await r.model.load();
    expect(r.model.state.current).toBeUndefined();
    r.host.current = "b";
    r.host.canSave = true;
    r.model.refreshFlags();
    expect(r.model.state.current).toBe("b");
    expect(r.model.state.canSave).toBe(true);
  });
});

describe("opening a project", () => {
  it("opens it and says the drawer may close", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.open(r.model.state.projects[0]!)).toBe(true);
    expect(r.calls).toContain("open a");
    expect(r.model.state.busy).toBe(false);
    expect(r.model.state.problem).toBe("");
  });

  it("counts a project that is open already as opened", async () => {
    const r = rig();
    r.host.open = async () => "already";
    expect(await r.model.open(project("a"))).toBe(true);
  });

  it("drops a project that is gone from the list and says so", async () => {
    const r = rig();
    await r.model.load();
    r.host.open = async () => "not-found";
    expect(await r.model.open(r.model.state.projects[0]!)).toBe(false);
    expect(r.model.state.projects.map((p) => p.id)).toEqual(["b"]);
    expect(r.model.state.problem).toBe(en.cloud.errors.notFound);
  });

  it("shows in the drawer what the page said when it could not open the project", async () => {
    const r = rig();
    r.host.open = async () => {
      for (const listener of r.listeners) listener("The project could not be opened.");
      return "failed";
    };
    expect(await r.model.open(project("a"))).toBe(false);
    expect(r.model.state.problem).toBe("The project could not be opened.");
    // With nothing said, a general sentence.
    r.host.open = async () => "failed";
    await r.model.open(project("a"));
    expect(r.model.state.problem).toBe(en.cloud.open.failed);
  });

  it("does not open two at once", async () => {
    const r = rig();
    const gate = deferred<OpenOutcome>();
    r.host.open = () => gate.promise;
    const first = r.model.open(project("a"));
    expect(r.model.state.busy).toBe(true);
    expect(await r.model.open(project("b"))).toBe(false);
    gate.settle("opened");
    expect(await first).toBe(true);
    expect(r.calls.filter((c) => c.startsWith("open"))).toEqual(["open a"]);
  });
});

describe("making a project from a template", () => {
  it("creates it, lists it first and opens it", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.create("  Mine ", "purchase")).toBe(true);
    expect(r.calls).toContain("create Mine from purchase");
    expect(r.calls).toContain("open new");
    expect(r.model.state.projects.map((p) => p.id)).toEqual(["new", "a", "b"]);
    expect(r.model.state.status).toBe(en.cloud.projects.created("Mine"));
    expect(r.model.state.busy).toBe(false);
  });

  it("refuses a bad name without asking the service", async () => {
    const r = rig();
    expect(await r.model.create("   ", "flow")).toBe(false);
    expect(await r.model.create("a".repeat(101), "flow")).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.projects.nameLong(100));
    expect(r.calls).toEqual([]);
  });

  it("says the account's limit in the status line when the 101st project is refused, and leaves the list as it was", async () => {
    const r = rig();
    await r.model.load();
    const before = r.model.state.projects;
    r.host.create = async () => refused(413, "quota.projects");
    expect(await r.model.create("One more", "flow")).toBe(false);
    expect(r.reports).toEqual([en.cloud.errors.quotaProjects(100)]);
    expect(r.model.state.problem).toBe(en.cloud.errors.quotaProjects(100));
    expect(r.model.state.projects).toBe(before);
    expect(r.model.state.busy).toBe(false);
    // Nothing was opened.
    expect(r.calls.some((c) => c.startsWith("open"))).toBe(false);
  });

  it("keeps the project it made when it cannot be opened, and says why", async () => {
    const r = rig();
    await r.model.load();
    r.host.open = async () => "failed";
    expect(await r.model.create("Mine", "flow")).toBe(false);
    expect(r.model.state.projects[0]!.id).toBe("new");
    expect(r.model.state.problem).toBe(en.cloud.open.failed);
  });
});

describe("a project from an archive's files", () => {
  it("uploads the files, tells how it goes, and opens the project", async () => {
    const r = rig();
    await r.model.load();
    r.host.progress = [["assets/logo.png", 1, 1]];
    const statuses: string[] = [];
    const watch = new ProjectsModel(
      r.projectsHost,
      () => en.cloud,
      (state) => statuses.push(state.status),
    );
    const files = new Map<string, string | Uint8Array>([
      ["project.json", "{}"],
      ["assets/logo.png", new Uint8Array([1])],
    ]);
    expect(await watch.createFromFiles(" Shop ", files)).toBe(true);
    expect(statuses).toContain(en.cloud.projects.creating("Shop"));
    expect(statuses).toContain(en.cloud.projects.uploading("assets/logo.png", 1, 1));
    expect(statuses.at(-1)).toBe(en.cloud.projects.created("Shop"));
    expect(r.calls).toEqual([
      "list",
      "upload Shop with project.json, assets/logo.png",
      "open saved",
    ]);
  });

  it("says why it could not, and refuses a bad name first", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.createFromFiles("", new Map())).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.projects.nameEmpty);
    r.host.save = async () => refused(413, "quota.storage");
    expect(await r.model.createFromFiles("x", new Map([["a.meltemi", ""]]))).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.errors.quotaStorage(200));
    expect(r.model.state.projects.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("saving the local project", () => {
  it("creates the cloud project, tells how the uploads go, and opens it", async () => {
    const r = rig();
    await r.model.load();
    r.host.canSave = true;
    r.host.progress = [
      ["assets/a.png", 1, 2],
      ["assets/b.png", 2, 2],
    ];
    const statuses: string[] = [];
    const watch = new ProjectsModel(
      r.projectsHost,
      () => en.cloud,
      (state) => statuses.push(state.status),
    );
    expect(await watch.saveLocal("Local flow")).toBe(true);
    expect(statuses).toContain(en.cloud.projects.saving("Local flow"));
    expect(statuses).toContain(en.cloud.projects.uploading("assets/a.png", 1, 2));
    expect(statuses).toContain(en.cloud.projects.uploading("assets/b.png", 2, 2));
    expect(statuses.at(-1)).toBe(en.cloud.projects.saved("Local flow"));
    expect(r.calls).toEqual(["list", "save Local flow", "open saved"]);
  });

  it("says why it could not, and the list stays", async () => {
    const r = rig();
    await r.model.load();
    r.host.save = async () => refused(413, "quota.storage");
    expect(await r.model.saveLocal("x")).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.errors.quotaStorage(200));
    expect(r.reports).toEqual([en.cloud.errors.quotaStorage(200)]);
    expect(r.model.state.projects.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("refuses a bad name before it does anything", async () => {
    const r = rig();
    expect(await r.model.saveLocal("")).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.projects.nameEmpty);
    expect(r.calls).toEqual([]);
  });
});

describe("renaming, duplicating and deleting", () => {
  it("renames: the list shows the new name and the status line says so", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.rename(r.model.state.projects[0]!, "  Alpha 2 ")).toBe(true);
    expect(r.calls).toContain("update a Alpha 2");
    // The page hears it, so that the explorer's header follows when the project is open.
    expect(r.calls).toContain("renamed a Alpha 2");
    expect(r.model.state.projects.map((p) => p.name)).toEqual(["Alpha 2", "Beta"]);
    expect(r.reports).toEqual([en.cloud.projects.renamed("Alpha 2")]);
  });

  it("asks nothing when the name is the same", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.rename(r.model.state.projects[0]!, "Alpha")).toBe(true);
    expect(r.calls).toEqual(["list"]);
  });

  it("refuses a bad name, and a refusal of the service shows in words", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.rename(r.model.state.projects[0]!, "")).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.projects.nameEmpty);
    r.host.update = async () => refused(404, "project.not-found");
    expect(await r.model.rename(r.model.state.projects[0]!, "New")).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.errors.notFound);
    expect(r.model.state.projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  });

  it("duplicates: the copy is listed first", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.duplicate(r.model.state.projects[1]!)).toBe(true);
    expect(r.model.state.projects.map((p) => p.id)).toEqual(["b2", "a", "b"]);
    expect(r.reports).toEqual([en.cloud.projects.duplicated("b copy")]);
  });

  it("says the account's limit when a copy would be the 101st", async () => {
    const r = rig();
    await r.model.load();
    r.host.duplicate = async () => refused(413, "quota.projects");
    expect(await r.model.duplicate(r.model.state.projects[0]!)).toBe(false);
    expect(r.reports).toEqual([en.cloud.errors.quotaProjects(100)]);
    expect(r.model.state.projects).toHaveLength(2);
  });

  it("deletes: it goes from the list and the page is told", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.remove(r.model.state.projects[0]!)).toBe(true);
    expect(r.calls).toContain("remove a");
    expect(r.calls).toContain("deleted a");
    expect(r.model.state.projects.map((p) => p.id)).toEqual(["b"]);
    expect(r.reports).toEqual([en.cloud.projects.deleted("Alpha")]);
  });

  it("counts a project that is gone already as deleted", async () => {
    const r = rig();
    await r.model.load();
    r.host.remove = async () => refused(404, "project.not-found");
    expect(await r.model.remove(r.model.state.projects[0]!)).toBe(true);
    expect(r.model.state.projects.map((p) => p.id)).toEqual(["b"]);
  });

  it("keeps a project the service would not delete", async () => {
    const r = rig();
    await r.model.load();
    r.host.remove = async () => unreachable;
    expect(await r.model.remove(r.model.state.projects[0]!)).toBe(false);
    expect(r.model.state.projects).toHaveLength(2);
    expect(r.calls).not.toContain("deleted a");
    expect(r.model.state.problem).toBe(en.cloud.errors.unreachable);
  });

  it("does one thing at a time", async () => {
    const r = rig();
    await r.model.load();
    const gate = deferred<Outcome<CloudProject>>();
    r.host.duplicate = () => gate.promise;
    const first = r.model.duplicate(r.model.state.projects[0]!);
    expect(await r.model.rename(r.model.state.projects[1]!, "x")).toBe(false);
    expect(await r.model.remove(r.model.state.projects[1]!)).toBe(false);
    expect(await r.model.duplicate(r.model.state.projects[1]!)).toBe(false);
    gate.settle(ok(project("a2")));
    expect(await first).toBe(true);
  });
});

describe("saying something and leaving", () => {
  it("says it in the drawer and in the status line", () => {
    const r = rig();
    r.model.say("The link was copied.");
    expect(r.model.state.status).toBe("The link was copied.");
    expect(r.reports).toEqual(["The link was copied."]);
  });

  it("goes back to the local project", () => {
    const r = rig();
    r.host.current = "a";
    r.model.leaveToLocal();
    expect(r.calls).toEqual(["leave"]);
    expect(r.model.state.current).toBeUndefined();
    expect(r.model.state.status).toBe(en.cloud.projects.openedLocal);
  });

  it("stops listening to the status line when it is disposed", async () => {
    const r = rig();
    expect(r.listeners.size).toBe(1);
    r.model.dispose();
    expect(r.listeners.size).toBe(0);
  });
});
