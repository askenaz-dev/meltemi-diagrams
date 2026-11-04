import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMemoryHost } from "@meltemi/diagrams-project";
import { CloudClient } from "../src/cloud-client.js";
import {
  cloudHost,
  cloudSnapshotHost,
  checkCloudPaths,
  fetchCloudSnapshot,
  unsafeCloudPath,
} from "../src/cloud-host.js";
import { CloudError, isCloudError } from "../src/cloud-errors.js";
import { CloudStub } from "./cloud-stub.js";

const stub = new CloudStub();
beforeAll(async () => {
  await stub.start();
});
afterAll(async () => {
  await stub.stop();
});
beforeEach(() => {
  stub.requests.length = 0;
  stub.projects.clear();
});

const ROOT = "C:/work/shop";

function client(): CloudClient {
  return new CloudClient({ host: stub.url, token: stub.mint("test").token });
}

/** What a promise rejects with. */
async function failure(run: () => Promise<unknown>): Promise<CloudError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(CloudError);
    return error as CloudError;
  }
  throw new Error("it did not fail");
}

const LOGO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe("cloudHost: a cloud project as a ProjectHost", () => {
  it("answers the texts and bytes of the project under the local root, as a git revision does", async () => {
    const project = stub.addProject({
      files: { "project.json": '{ "name": "Shop" }', "diagrams/flow.meltemi": "diagram flow" },
      binaries: { "assets/logo.png": LOGO, "assets/fonts/x.woff2": Buffer.from("font") },
    });
    const host = await cloudHost(client(), { project: project.id, root: ROOT });

    expect(host.readFile(`${ROOT}/project.json`)).toBe('{ "name": "Shop" }');
    expect(host.readFile(`${ROOT}/diagrams/flow.meltemi`)).toBe("diagram flow");
    expect(Buffer.from(host.readBinary!(`${ROOT}/assets/logo.png`)!)).toEqual(LOGO);
    // A text is bytes too, and a binary has no text: as the git host answers.
    expect(new TextDecoder().decode(host.readBinary!(`${ROOT}/diagrams/flow.meltemi`))).toBe(
      "diagram flow",
    );
    expect(host.readFile(`${ROOT}/assets/logo.png`)).toBeUndefined();
    expect(host.readFile(`${ROOT}/missing.meltemi`)).toBeUndefined();
    expect(host.readFile("C:/elsewhere/project.json")).toBeUndefined();

    expect(host.readDirectory(ROOT)).toEqual(
      expect.arrayContaining([
        { name: "project.json", kind: "file" },
        { name: "diagrams", kind: "directory" },
        { name: "assets", kind: "directory" },
      ]),
    );
    expect(host.readDirectory(`${ROOT}/assets`)).toEqual(
      expect.arrayContaining([
        { name: "logo.png", kind: "file" },
        { name: "fonts", kind: "directory" },
      ]),
    );
    expect(host.readDirectory(`${ROOT}/nothing`)).toBeUndefined();
  });

  it("is filled by one prefetch: the files once, each blob once, nothing on reading", async () => {
    const project = stub.addProject({
      files: { "project.json": "{}" },
      binaries: { "a.png": LOGO, "b.png": LOGO, "c.png": Buffer.from("other") },
    });
    const host = await cloudHost(client(), { project: project.id, root: ROOT });
    const requests = stub.requests.map((r) => `${r.method} ${r.path.replace(project.id, "<id>")}`);
    expect(requests.filter((r) => r === "GET /api/projects/<id>/files")).toHaveLength(1);
    // Two paths with the same bytes are one blob.
    expect(requests.filter((r) => r.startsWith("GET /api/projects/<id>/blobs/"))).toHaveLength(2);
    const count = stub.requests.length;
    host.readFile(`${ROOT}/project.json`);
    host.readBinary!(`${ROOT}/a.png`);
    host.readBinary!(`${ROOT}/b.png`);
    host.readDirectory(ROOT);
    expect(stub.requests).toHaveLength(count);
    expect(stub.requests.every((r) => r.headers.authorization?.startsWith("Bearer mdg_"))).toBe(
      true,
    );
  });

  it("reads a version instead of the current files", async () => {
    const project = stub.addProject({
      files: { "project.json": "{}", "a.meltemi": "old" },
      binaries: { "logo.png": LOGO },
    });
    stub.addVersion(project, "first");
    project.files.set("a.meltemi", "new");
    project.files.set("b.meltemi", "only now");
    const now = await cloudHost(client(), { project: project.id, root: ROOT });
    const then = await cloudHost(client(), { project: project.id, root: ROOT, version: 1 });
    expect(now.readFile(`${ROOT}/a.meltemi`)).toBe("new");
    expect(now.readFile(`${ROOT}/b.meltemi`)).toBe("only now");
    expect(then.readFile(`${ROOT}/a.meltemi`)).toBe("old");
    expect(then.readFile(`${ROOT}/b.meltemi`)).toBeUndefined();
    expect(Buffer.from(then.readBinary!(`${ROOT}/logo.png`)!)).toEqual(LOGO);
    expect(stub.requests.some((r) => r.path === `/api/projects/${project.id}/versions/1`)).toBe(
      true,
    );
  });

  it("names the version that does not exist, and the project", async () => {
    const project = stub.addProject({ files: { "project.json": "{}" } });
    const unknown = await failure(() =>
      cloudHost(client(), { project: project.id, root: ROOT, version: 99 }),
    );
    expect(unknown.code).toBe("version.not-found");
    expect(unknown.details).toMatchObject({ version: 99, project: project.id });
    expect(unknown.exitCode).toBe(1);
    const zero = await failure(() =>
      cloudHost(client(), { project: project.id, root: ROOT, version: 0 }),
    );
    expect(zero.code).toBe("version.not-found");
    expect(zero.details["version"]).toBe(0);
    const missing = await failure(() =>
      cloudHost(client(), { project: "a".repeat(20), root: ROOT }),
    );
    expect(missing.code).toBe("project.not-found");
    const malformed = await failure(() => cloudHost(client(), { project: "../x", root: ROOT }));
    expect(malformed.code).toBe("project.not-found");
  });

  it("refuses a path that is not safe inside the folder, naming it, before any blob is fetched", async () => {
    for (const bad of [
      "../x.meltemi",
      ".git/hooks/post-checkout",
      "a/../../b.meltemi",
      "a\\b.meltemi",
      "/etc/passwd",
      "C:/x.meltemi",
      "a/./b.meltemi",
    ]) {
      stub.projects.clear();
      stub.requests.length = 0;
      const project = stub.addProject({
        files: { "project.json": "{}", [bad]: "x" },
        binaries: { "logo.png": LOGO },
      });
      const error = await failure(() => cloudHost(client(), { project: project.id, root: ROOT }));
      expect(error.code, bad).toBe("pull.unsafe-path");
      expect(error.details["path"], bad).toBe(bad);
      expect(error.exitCode).toBe(1);
      expect(
        stub.requests.filter((r) => r.path.includes("/blobs/")),
        bad,
      ).toHaveLength(0);
    }
    // A binary path is checked as well as a text path.
    const project = stub.addProject({ binaries: { "../logo.png": LOGO } });
    expect(
      (await failure(() => cloudHost(client(), { project: project.id, root: ROOT }))).code,
    ).toBe("pull.unsafe-path");
    // Also in a version.
    const versioned = stub.addProject({ files: { "../v.meltemi": "x" } });
    stub.addVersion(versioned);
    const inVersion = await failure(() =>
      cloudHost(client(), { project: versioned.id, root: ROOT, version: 1 }),
    );
    expect(inVersion.code).toBe("pull.unsafe-path");
    expect(inVersion.details["path"]).toBe("../v.meltemi");
  });

  it("refuses what pull refuses: names Windows cannot keep, letter-case twins and a file that is also a folder, before any blob is fetched", async () => {
    // Each case: the files and the binaries of a project, and the path that is named.
    const cases: [string, Record<string, string>, Record<string, Buffer>, string][] = [
      ["a device name", { "diagrams/con.meltemi": "x" }, {}, "diagrams/con.meltemi"],
      ["a device name in capitals", { "NUL.meltemi": "x" }, {}, "NUL.meltemi"],
      ["a device name with a digit", { "a/lpt9.meltemi": "x" }, {}, "a/lpt9.meltemi"],
      ["a device name as a folder", { "aux/a.meltemi": "x" }, {}, "aux/a.meltemi"],
      ["a binary with a device name", {}, { "assets/com1.png": LOGO }, "assets/com1.png"],
      ["a name that ends with a dot", { "diagrams/a.": "x" }, {}, "diagrams/a."],
      [
        "a name that ends with a space",
        { "diagrams/a /b.meltemi": "x" },
        {},
        "diagrams/a /b.meltemi",
      ],
      [
        "two texts that differ only in letter case (the later is named)",
        { "diagrams/A.meltemi": "x", "diagrams/a.meltemi": "y" },
        {},
        "diagrams/a.meltemi",
      ],
      [
        "a text and a binary that differ only in letter case",
        { "assets/LOGO.png": "x" },
        { "assets/logo.png": LOGO },
        "assets/logo.png",
      ],
      [
        "a file where another path needs a folder",
        { docs: "x", "docs/a.meltemi": "y" },
        {},
        "docs",
      ],
      [
        "a file where another path needs a folder, in another letter case",
        { Docs: "x", "docs/a.meltemi": "y" },
        {},
        "Docs",
      ],
    ];
    for (const [label, files, binaries, named] of cases) {
      stub.projects.clear();
      stub.requests.length = 0;
      const project = stub.addProject({
        files: { "project.json": "{}", ...files },
        binaries: { "logo.png": LOGO, ...binaries },
      });
      const error = await failure(() => cloudHost(client(), { project: project.id, root: ROOT }));
      expect(error.code, label).toBe("pull.unsafe-path");
      expect(error.details["path"], label).toBe(named);
      expect(
        stub.requests.filter((r) => r.path.includes("/blobs/")),
        label,
      ).toHaveLength(0);
    }
    // Names that only look like those are fine, and so are letter-case twins in other folders.
    stub.projects.clear();
    const fine = stub.addProject({
      files: {
        "project.json": "{}",
        "console.meltemi": "x",
        "diagrams/com10.meltemi": "x",
        "a/b.meltemi": "x",
        "A/c.meltemi": "x",
        docs2: "x",
        "docs/a.meltemi": "y",
      },
    });
    const host = await cloudHost(client(), { project: fine.id, root: ROOT });
    expect(host.readFile(`${ROOT}/console.meltemi`)).toBe("x");
  });

  it("names a path as pull names it: an escape sequence in it never reaches the terminal", async () => {
    const project = stub.addProject({
      files: { "project.json": "{}", "a\u001b[2Jb.meltemi": "x" },
    });
    const error = await failure(() => cloudHost(client(), { project: project.id, root: ROOT }));
    expect(error.code).toBe("pull.unsafe-path");
    expect(error.details["path"]).toBe("a\\u001b[2Jb.meltemi");
    expect(error.message).not.toContain("\u001b");
    expect(error.details["path"]).not.toContain("\u001b");
  });

  it("leaves out the loser of a name collision (<path>~<id>) and says so", async () => {
    const project = stub.addProject({
      files: {
        "diagrams/a.meltemi": "keeper",
        "diagrams/a.meltemi~k4c2w7x5q3y6m2n5": "loser",
      },
    });
    project.collisions.push({
      path: "diagrams/a.meltemi",
      keeper: "keeperidkeeperidk",
      id: "k4c2w7x5q3y6m2n5",
      shown: "diagrams/a.meltemi~k4c2w7x5q3y6m2n5",
    });
    const snapshot = await fetchCloudSnapshot(client(), { project: project.id, root: ROOT });
    expect([...snapshot.files.keys()]).toEqual(["diagrams/a.meltemi"]);
    expect(snapshot.skipped).toEqual(["diagrams/a.meltemi~k4c2w7x5q3y6m2n5"]);
    const host = cloudSnapshotHost(ROOT, snapshot);
    expect(host.readFile(`${ROOT}/diagrams/a.meltemi`)).toBe("keeper");
    expect(host.readDirectory(`${ROOT}/diagrams`)).toEqual([{ name: "a.meltemi", kind: "file" }]);
  });

  it("gives the snapshot its revision, and none to a version", async () => {
    const project = stub.addProject({ files: { "project.json": "{}" }, revision: 7 });
    stub.addVersion(project);
    const current = await fetchCloudSnapshot(client(), { project: project.id, root: ROOT });
    expect(current.revision).toBe(7);
    expect(current.version).toBeUndefined();
    const version = await fetchCloudSnapshot(client(), {
      project: project.id,
      root: ROOT,
      version: 1,
    });
    expect(version.revision).toBeUndefined();
    expect(version.version).toBe(1);
  });

  it("fails with the error of a blob that cannot be read, and shows no token in it", async () => {
    const project = stub.addProject({ binaries: { "logo.png": LOGO } });
    const hash = project.binaries.get("logo.png")!;
    stub.fail(`GET /api/projects/${project.id}/blobs/${hash}`, {
      status: 500,
      body: { code: "internal", message: "Failed for mdg_LeakedToken123 today." },
    });
    const error = await failure(() => cloudHost(client(), { project: project.id, root: ROOT }));
    expect(error.code).toBe("internal");
    expect(error.message).toBe("Failed for mdg_… today.");
  });
});

describe("the path rule a cloud path must pass", () => {
  it("accepts the paths the cloud keeps and refuses the rest", () => {
    for (const good of [
      "project.json",
      "diagrams/flow.meltemi",
      "assets/a b (1).png",
      // Names that only look like a device name.
      "console.meltemi",
      "diagrams/com10.meltemi",
      "diagrams/auxiliary.meltemi",
    ]) {
      expect(unsafeCloudPath(ROOT, good), good).toBe(false);
    }
    for (const bad of [
      "",
      "..",
      "../x",
      ".git/config",
      "a//b",
      "./a",
      "a\\b",
      "a:b",
      "é.meltemi",
      // What Windows cannot keep: device names (with or without an extension, in any case), and
      // names that end with a dot or a space.
      "con",
      "diagrams/NUL.meltemi",
      "com1.png",
      "a/Lpt3.txt",
      "prn/a.meltemi",
      "a.",
      "diagrams/a./b.meltemi",
      "diagrams/b /c.meltemi",
    ]) {
      expect(unsafeCloudPath(ROOT, bad), bad).toBe(true);
    }
    expect(() => checkCloudPaths(ROOT, ["a.meltemi", "b/c.meltemi"])).not.toThrow();
    try {
      checkCloudPaths(ROOT, ["a.meltemi", "../x.meltemi", ".git/y"]);
      expect.unreachable();
    } catch (error) {
      // The first one is named.
      expect(isCloudError(error, "pull.unsafe-path")).toBe(true);
      expect((error as CloudError).details["path"]).toBe("../x.meltemi");
    }
  });

  it("checks a set of paths together: what only the set shows is named, the first in the set's own order", () => {
    const named = (paths: string[]): string | undefined => {
      try {
        checkCloudPaths(ROOT, paths);
      } catch (error) {
        expect(isCloudError(error, "pull.unsafe-path")).toBe(true);
        return (error as CloudError).details["path"] as string;
      }
      return undefined;
    };
    // The later of two letter-case twins, whichever order they come in.
    expect(named(["a.meltemi", "A.meltemi"])).toBe("a.meltemi");
    expect(named(["A.meltemi", "a.meltemi"])).toBe("a.meltemi");
    // A path that is also the folder of another, in any letter case.
    expect(named(["docs/a.meltemi", "docs"])).toBe("docs");
    expect(named(["docs/a.meltemi", "DOCS"])).toBe("DOCS");
    // Alone, or in other folders, they are fine.
    expect(named(["docs", "docs2", "a/x.meltemi", "A/y.meltemi"])).toBeUndefined();
    // A path that is unsafe by itself is named first when it comes first.
    expect(named(["con.meltemi", "a.meltemi", "A.meltemi"])).toBe("con.meltemi");
    expect(named(["a.meltemi", "A.meltemi", "con.meltemi"])).toBe("a.meltemi");
    expect(named([])).toBeUndefined();
    // Any iterable of paths will do.
    expect(named([...new Set(["a.meltemi", "b.meltemi"])])).toBeUndefined();
  });

  it("serves a snapshot like the in-memory host the project package has", async () => {
    const project = stub.addProject({
      files: { "project.json": "{}", "a/b.meltemi": "x" },
      binaries: { "a/c.png": LOGO },
    });
    const snapshot = await fetchCloudSnapshot(client(), { project: project.id, root: ROOT });
    const host = cloudSnapshotHost(ROOT, snapshot);
    const memory = createMemoryHost({
      [`${ROOT}/project.json`]: "{}",
      [`${ROOT}/a/b.meltemi`]: "x",
      [`${ROOT}/a/c.png`]: new Uint8Array(LOGO),
    });
    for (const path of [ROOT, `${ROOT}/a`, `${ROOT}/zzz`]) {
      expect(host.readDirectory(path), path).toEqual(memory.readDirectory(path));
    }
    expect(host.readFile(`${ROOT}/a/b.meltemi`)).toBe(memory.readFile(`${ROOT}/a/b.meltemi`));
  });
});
