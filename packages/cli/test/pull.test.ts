import { existsSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { MANIFEST, Scratch, mdg, png, sheet, signIn } from "./cloud-fixtures.js";
import { CloudStub, sha256 } from "./cloud-stub.js";

const scratch = new Scratch();
const stub = new CloudStub();
beforeAll(async () => {
  await stub.start();
});
afterAll(async () => {
  await stub.stop();
  rmSync(scratch.root, { recursive: true, force: true });
});
beforeEach(() => {
  stub.requests.length = 0;
});
afterEach(() => setLocale("en"));

/** A person signed in at a home of their own, and a project in the cloud with these files. */
function setup(cloud: Record<string, string> = {}, binaries: Record<string, Buffer> = {}) {
  const home = scratch.home(stub);
  signIn(stub, home.store);
  const project = stub.addProject({ files: cloud, binaries });
  return { ...home, project };
}

const run = (env: Record<string, string>, ...args: string[]) =>
  mdg(["pull", ...args], { cwd: scratch.root, env });

/** The manifest text of a project that names the cloud project, in the style of `manifest`. */
function withCloud(manifest: string, project: { id: string }): string {
  const cloud = `{ "host": "${stub.url}", "project": "${project.id}" }`;
  return manifest.replace(/\n}\n$/, `,\n  "cloud": ${cloud}\n}\n`);
}

/** Every file under a folder, as `path`, sorted. */
function tree(folder: string, prefix = ""): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? tree(join(folder, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    )
    .sort();
}

const text = (folder: string, path: string) =>
  readFileSync(join(folder, ...path.split("/")), "utf8");

describe("mdg pull", () => {
  it("writes every file of the project into an empty folder, and records the project in project.json", async () => {
    const logo = png("logo");
    const { env, project } = setup(
      {
        "project.json": MANIFEST,
        "diagrams/flow.meltemi": sheet(),
        "diagrams/deep/er.meltemi": sheet("Deep"),
        "notes/readme.md": "# Notes\n",
      },
      { "assets/logo.png": logo },
    );
    const result = await run(env, project.id, "./from-cloud");
    expect(result.code, result.stderr).toBe(0);
    const folder = join(scratch.root, "from-cloud");
    expect(tree(folder)).toEqual([
      "assets/logo.png",
      "diagrams/deep/er.meltemi",
      "diagrams/flow.meltemi",
      "notes/readme.md",
      "project.json",
    ]);
    expect(text(folder, "diagrams/flow.meltemi")).toBe(sheet());
    expect(text(folder, "notes/readme.md")).toBe("# Notes\n");
    expect(readFileSync(join(folder, "assets", "logo.png")).equals(logo)).toBe(true);
    // The manifest names the cloud project; nothing else of it changed.
    expect(text(folder, "project.json")).toBe(withCloud(MANIFEST, project));
    expect(JSON.parse(text(folder, "project.json")).cloud).toEqual({
      host: stub.url,
      project: project.id,
    });
    expect(result.stdout).toContain("  wrote diagrams/flow.meltemi");
    expect(result.stdout).toContain("  wrote assets/logo.png");
    expect(result.stdout).toContain(
      `Recorded the cloud project in ${join("from-cloud", "project.json").split("\\").join("/")}`,
    );
    expect(result.stdout).toContain(
      `Pulled the latest files of the cloud project ${project.id} into from-cloud: 5 written, 0 already identical, 0 kept.`,
    );
    // No temporary file is left behind.
    expect(tree(folder).some((path) => path.endsWith(".tmp"))).toBe(false);
  });

  it("takes the project from the folder's manifest, leaves identical files alone and files only in the folder", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "diagrams/flow.meltemi": sheet(),
      "diagrams/new.meltemi": sheet("New"),
    });
    const folder = scratch.folder({
      "project.json": withCloud(MANIFEST, project),
      "diagrams/flow.meltemi": sheet(),
      "mine.meltemi": sheet("Mine"),
    });
    const before = statSync(join(folder, "diagrams", "flow.meltemi")).mtimeMs;
    const manifestBefore = text(folder, "project.json");
    // The cloud's project.json differs from the folder's only by the cloud setting.
    const result = await mdg(["pull"], { cwd: folder, env });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("  wrote diagrams/new.meltemi");
    expect(result.stdout).toContain("  kept project.json (it differs from the cloud)");
    expect(result.stdout).toContain("Pass --force to overwrite the files that differ.");
    expect(result.stdout).toContain("1 written, 1 already identical, 1 kept.");
    expect(statSync(join(folder, "diagrams", "flow.meltemi")).mtimeMs).toBe(before);
    expect(text(folder, "project.json")).toBe(manifestBefore);
    expect(text(folder, "mine.meltemi")).toBe(sheet("Mine"));
    expect(tree(folder)).toEqual([
      "diagrams/flow.meltemi",
      "diagrams/new.meltemi",
      "mine.meltemi",
      "project.json",
    ]);
  });

  it("lists a file that differs, does not write it and exits 1, until --force", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "diagrams/a.meltemi": sheet("Cloud"),
      "diagrams/b.meltemi": sheet("Same"),
    });
    const folder = scratch.folder({
      "project.json": withCloud(MANIFEST, project),
      "diagrams/a.meltemi": sheet("Local"),
      "diagrams/b.meltemi": sheet("Same"),
    });
    const kept = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(kept.code).toBe(1);
    expect(kept.stdout).toContain("  kept diagrams/a.meltemi (it differs from the cloud)");
    expect(kept.stdout).toContain("Pass --force");
    expect(text(folder, "diagrams/a.meltemi")).toBe(sheet("Local"));

    const forced = await mdg(["pull", project.id, folder, "--force"], { cwd: scratch.root, env });
    expect(forced.code, forced.stderr).toBe(0);
    expect(text(folder, "diagrams/a.meltemi")).toBe(sheet("Cloud"));
    expect(forced.stdout).toContain("  wrote diagrams/a.meltemi");
    expect(forced.stdout).not.toContain("Pass --force");
    // The manifest of the cloud has no cloud setting: it is added after the overwrite.
    expect(text(folder, "project.json")).toBe(withCloud(MANIFEST, project));
  });

  it("compares binaries by hash: identical images are left, different ones are kept until --force", async () => {
    const { env, project } = setup(
      {},
      { "a.png": png("a"), "b.png": png("cloud b"), "c.png": png("c") },
    );
    const folder = scratch.folder({
      "a.png": png("a"),
      "b.png": png("local b"),
    });
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("  wrote c.png");
    expect(result.stdout).toContain("  kept b.png (it differs from the cloud)");
    expect(readFileSync(join(folder, "b.png")).equals(png("local b"))).toBe(true);
    // Only the images that were written were fetched.
    expect(stub.to(/\/blobs\//, "GET")).toHaveLength(1);
    const forced = await mdg(["pull", project.id, folder, "--force"], { cwd: scratch.root, env });
    expect(forced.code).toBe(0);
    expect(readFileSync(join(folder, "b.png")).equals(png("cloud b"))).toBe(true);
  });

  it("writes into a folder that does not exist yet, and into one with other files", async () => {
    const { env, project } = setup({ "a/b/c.meltemi": sheet() });
    const nested = join(scratch.root, "made", "on", "demand");
    const first = await run(env, project.id, nested);
    expect(first.code, first.stderr).toBe(0);
    expect(tree(nested)).toEqual(["a/b/c.meltemi"]);
    const busy = scratch.folder({ "other/x.md": "x", "a/y.md": "y" });
    const second = await run(env, project.id, busy);
    expect(second.code, second.stderr).toBe(0);
    expect(tree(busy)).toEqual(["a/b/c.meltemi", "a/y.md", "other/x.md"]);
  });

  it("treats a lone argument as the id when it has the shape of one, else as the folder", async () => {
    const { env, project } = setup({ "project.json": MANIFEST, "a.meltemi": sheet() });
    const folder = scratch.folder({ "project.json": withCloud(MANIFEST, project) });
    const byFolder = await mdg(["pull", "."], { cwd: folder, env });
    expect(byFolder.code, byFolder.stderr).toBe(1);
    expect(existsSync(join(folder, "a.meltemi"))).toBe(true);
    const empty = scratch.folder();
    const byId = await mdg(["pull", project.id], { cwd: empty, env });
    expect(byId.code, byId.stderr).toBe(0);
    expect(tree(empty)).toEqual(["a.meltemi", "project.json"]);
  });
});

describe("mdg pull: the cloud's paths", () => {
  /** A project with one good file and one path that must refuse the whole pull. */
  async function refused(path: string) {
    const { env, project } = setup({ "good.meltemi": sheet(), [path]: "evil" });
    const folder = join(scratch.root, `refused-${stub.projects.size}`);
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    return { result, folder, project };
  }

  it("refuses ../x.meltemi with pull.unsafe-path naming it, writes nothing and exits 1", async () => {
    const parent = scratch.folder({}, "parent");
    const { env, project } = setup({ "good.meltemi": sheet(), "../x.meltemi": "evil" });
    const folder = join(parent, "target");
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "pull.unsafe-path: the cloud project holds the path ../x.meltemi",
    );
    // Nothing: neither the good file, nor the folder, nor the file outside it.
    expect(existsSync(folder)).toBe(false);
    expect(tree(parent)).toEqual([]);
    expect(result.stdout).toBe("");
  });

  it("refuses .git/hooks/post-checkout, naming it, and creates no .git", async () => {
    const { result, folder } = await refused(".git/hooks/post-checkout");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.unsafe-path");
    expect(result.stderr).toContain(".git/hooks/post-checkout");
    expect(existsSync(folder)).toBe(false);
  });

  it.each([
    ["a backslash", "a\\b.meltemi"],
    ["an absolute path", "/etc/cron.d/evil"],
    ["a drive path", "C:/Windows/evil.meltemi"],
    ["a doubled separator", "a//b.meltemi"],
    ["a dot segment", "./a.meltemi"],
    ["a parent segment inside", "a/../b.meltemi"],
    ["a hidden folder", "x/.hidden/y.meltemi"],
    ["a hidden file", ".env"],
    ["a colon (an alternate stream on Windows)", "a.meltemi:stream"],
    ["an accented name", "café.meltemi"],
    ["a control character", "a\u0001b.meltemi"],
    ["thirteen names", "a/b/c/d/e/f/g/h/i/j/k/l/m.meltemi"],
    ["a name of 101 characters", `${"n".repeat(98)}.md`],
    ["a Windows device name", "con.meltemi"],
    ["a Windows device name in a folder", "docs/NUL"],
    ["a numbered Windows device", "lpt1.txt"],
    ["a name ending with a dot", "report."],
    ["a name ending with a space", "dir /file.md"],
    ["the loser of a collision written wrongly", "../x~k4c2w7x5q3y6m2n5"],
  ])("refuses %s (%j), writes nothing and exits 1", async (_what, path) => {
    const { result, folder } = await refused(path);
    expect(result.code, path).toBe(1);
    expect(result.stderr, path).toContain("pull.unsafe-path");
    // Named as the cloud wrote it, with control characters escaped so that they never reach a terminal.
    const shown = path.replace(
      /\p{Cc}/gu,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
    expect(result.stderr, path).toContain(`holds the path ${shown},`);
    // Nothing a terminal would act on, other than the line break that ends the message.
    expect(result.stderr, path).not.toMatch(/\p{Cc}(?<!\n)/u);
    expect(existsSync(folder), path).toBe(false);
  });

  it("refuses two paths that differ only in letter case, and a file that is also a folder", async () => {
    const first = setup({ "Diagram.meltemi": sheet(), "diagram.meltemi": sheet("Other") });
    const folderOne = join(scratch.root, "case");
    const one = await mdg(["pull", first.project.id, folderOne], {
      cwd: scratch.root,
      env: first.env,
    });
    expect(one.code).toBe(1);
    expect(one.stderr).toContain("pull.unsafe-path");
    expect(existsSync(folderOne)).toBe(false);

    const second = setup({ "docs.md": "a file", "docs.md/inside.md": "inside" });
    const folderTwo = join(scratch.root, "both");
    const two = await mdg(["pull", second.project.id, folderTwo], {
      cwd: scratch.root,
      env: second.env,
    });
    expect(two.code).toBe(1);
    expect(two.stderr).toContain("pull.unsafe-path");
    expect(two.stderr).toContain("docs.md");
    expect(existsSync(folderTwo)).toBe(false);
  });

  it("refuses a path that goes through a link in the folder, and writes nothing through it", async () => {
    const outside = scratch.folder({}, "outside");
    const folder = scratch.folder({ "keep.md": "kept" });
    try {
      // A junction needs no privilege on Windows; elsewhere it is an ordinary link.
      symlinkSync(outside, join(folder, "diagrams"), "junction");
    } catch {
      return;
    }
    const { env, project } = setup({ "good.meltemi": sheet(), "diagrams/a.meltemi": sheet("A") });
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.unsafe-path");
    expect(result.stderr).toContain("diagrams/a.meltemi");
    expect(tree(outside)).toEqual([]);
    expect(existsSync(join(folder, "good.meltemi"))).toBe(false);
  });

  it("never writes through a link that stands where a file belongs", async () => {
    const outside = scratch.folder({ "target.md": "precious" }, "outside-file");
    const folder = scratch.folder({});
    try {
      symlinkSync(join(outside, "target.md"), join(folder, "notes.md"), "file");
    } catch {
      return;
    }
    const { env, project } = setup({ "notes.md": "from the cloud" });
    const result = await mdg(["pull", project.id, folder, "--force"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.unsafe-path");
    expect(readFileSync(join(outside, "target.md"), "utf8")).toBe("precious");
  });

  it("never writes the cloud setting through a project.json that is a link", async () => {
    const outside = scratch.folder({ "project.json": MANIFEST }, "outside-manifest");
    const folder = scratch.folder({});
    try {
      symlinkSync(join(outside, "project.json"), join(folder, "project.json"), "file");
    } catch {
      return;
    }
    const { env, project } = setup({ "a.meltemi": sheet() });
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.manifest-not-updated");
    expect(readFileSync(join(outside, "project.json"), "utf8")).toBe(MANIFEST);
    expect(readFileSync(join(folder, "a.meltemi"), "utf8")).toBe(sheet());
  });

  it("keeps a file where a folder is, and a folder where a file is, and says so", async () => {
    const { env, project } = setup({
      "good.meltemi": sheet(),
      "docs.md": "a file in the cloud",
      "sub/inner.md": "inside",
    });
    const folder = scratch.folder({ "docs.md/x.md": "a folder here", sub: "a file here" });
    const result = await mdg(["pull", project.id, folder, "--force"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("  kept docs.md (a folder is in its place)");
    expect(result.stdout).toContain("  kept sub/inner.md (a folder is in its place)");
    expect(result.stdout).toContain("  wrote good.meltemi");
    expect(text(folder, "docs.md/x.md")).toBe("a folder here");
    expect(text(folder, "sub")).toBe("a file here");
  });

  it("skips the losers of a name collision with a note, and keeps the rest", async () => {
    const { env, project } = setup({
      "flow.meltemi": sheet(),
      "flow.meltemi~k4c2w7x5q3y6m2n5": sheet("Loser"),
      "other.meltemi~abcdefghijklmnop": sheet("Not listed, but shaped like one"),
    });
    project.collisions.push({
      path: "flow.meltemi",
      keeper: "a",
      id: "k4c2w7x5q3y6m2n5",
      shown: "flow.meltemi~k4c2w7x5q3y6m2n5",
    });
    const folder = join(scratch.root, "collisions");
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(tree(folder)).toEqual(["flow.meltemi"]);
    expect(result.stdout).toContain(
      "skipped flow.meltemi~k4c2w7x5q3y6m2n5: a copy two people made at once",
    );
    expect(result.stdout).toContain("skipped other.meltemi~abcdefghijklmnop");
  });
});

describe("mdg pull: project.json", () => {
  const CRLF = '{\r\n    "name": "Shop",\r\n    "language": "0.2"\r\n}\r\n';

  it("adds the cloud setting to a CRLF, four-space manifest and changes nothing else of it", async () => {
    const { env, project } = setup({ "project.json": CRLF, "a.meltemi": sheet() });
    // The folder already holds exactly the cloud's manifest.
    const folder = scratch.folder({ "project.json": CRLF });
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(text(folder, "project.json")).toBe(
      `{\r\n    "name": "Shop",\r\n    "language": "0.2",\r\n    "cloud": { "host": "${stub.url}", "project": "${project.id}" }\r\n}\r\n`,
    );
    expect(result.stdout).toContain("1 written, 1 already identical, 0 kept.");
  });

  it("adds it to the manifest it pulls into an empty folder, in the style of that manifest", async () => {
    const { env, project } = setup({ "project.json": CRLF });
    const folder = join(scratch.root, "crlf-empty");
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(text(folder, "project.json")).toBe(
      `{\r\n    "name": "Shop",\r\n    "language": "0.2",\r\n    "cloud": { "host": "${stub.url}", "project": "${project.id}" }\r\n}\r\n`,
    );
  });

  it("adds it to a manifest that differs from the cloud's, which is kept, and exits 1", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const mine = '{\n    "name": "My own name",\n    "language": "0.2",\n    "sources": ["."]\n}\n';
    const folder = scratch.folder({ "project.json": mine });
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("kept project.json");
    expect(text(folder, "project.json")).toBe(
      `{\n    "name": "My own name",\n    "language": "0.2",\n    "sources": ["."],\n    "cloud": { "host": "${stub.url}", "project": "${project.id}" }\n}\n`,
    );
  });

  it("leaves a manifest that names the project alone, and says when the project has no manifest", async () => {
    const { env, project } = setup({ "a.meltemi": sheet() });
    const manifest = withCloud(MANIFEST, project);
    const folder = scratch.folder({ "project.json": manifest });
    const same = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(same.code, same.stderr).toBe(0);
    expect(text(folder, "project.json")).toBe(manifest);
    expect(same.stdout).not.toContain("Recorded");

    const bare = join(scratch.root, "bare");
    const none = await mdg(["pull", project.id, bare], { cwd: scratch.root, env });
    expect(none.code).toBe(0);
    expect(none.stdout).toContain("The project has no project.json");
    expect(existsSync(join(bare, "project.json"))).toBe(false);
  });

  it("links the folder to the project it was pulled from, not to the one its project.json names", async () => {
    // A copy of a project keeps its files verbatim, project.json included, and so keeps the setting
    // of the project it was copied from.
    const first = stub.addProject({ files: { "a.meltemi": sheet() } });
    const { env, project } = setup({
      "project.json": withCloud(MANIFEST, first),
      "a.meltemi": sheet(),
    });
    const folder = join(scratch.root, "copy");
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code).toBe(0);
    const written = text(folder, "project.json");
    expect(written).toContain(project.id);
    expect(written).not.toContain(first.id);
    expect(result.stdout).toContain("Recorded");
  });

  it("writes the files, then fails with pull.manifest-not-updated, when project.json is not JSON", async () => {
    const { env, project } = setup({ "a.meltemi": sheet() });
    const folder = scratch.folder({ "project.json": "{ not json" });
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.manifest-not-updated");
    expect(text(folder, "project.json")).toBe("{ not json");
    expect(text(folder, "a.meltemi")).toBe(sheet());
  });

  it("refuses to mix two projects in one folder, and a host the manifest does not share", async () => {
    const { env, project } = setup({ "a.meltemi": sheet() });
    const other = stub.addProject({ files: { "b.meltemi": sheet("B") } });
    const folder = scratch.folder({ "project.json": withCloud(MANIFEST, other) });
    const mixed = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(mixed.code).toBe(1);
    expect(mixed.stderr).toContain(
      `pull.other-project: project.json already names the cloud project ${other.id}`,
    );
    expect(existsSync(join(folder, "a.meltemi"))).toBe(false);

    const abroad = scratch.folder({
      "project.json": MANIFEST.replace(
        /\n}\n$/,
        `,\n  "cloud": { "host": "https://evil.example", "project": "${project.id}" }\n}\n`,
      ),
    });
    stub.requests.length = 0;
    const mismatch = await mdg(["pull", "--host", stub.url], { cwd: abroad, env });
    expect(mismatch.code).toBe(1);
    expect(mismatch.stderr).toContain("cloud.host-mismatch");
    expect(stub.requests).toEqual([]);
  });
});

describe("mdg pull --version", () => {
  it("writes the files of that version, not the latest ones", async () => {
    const old = png("old logo");
    const { env, project } = setup(
      { "project.json": MANIFEST, "flow.meltemi": sheet("Version one") },
      { "assets/logo.png": old },
    );
    stub.addVersion(project, "one");
    project.files.set("flow.meltemi", sheet("Version two"));
    project.files.set("later.meltemi", sheet("Later"));
    project.binaries.set("assets/logo.png", sha256(png("new logo")));
    project.blobs.set(sha256(png("new logo")), png("new logo"));
    stub.addVersion(project, "two");
    stub.addVersion(project, "three");

    const folder = join(scratch.root, "version-one");
    const result = await mdg(["pull", project.id, folder, "--version", "1"], {
      cwd: scratch.root,
      env,
    });
    expect(result.code, result.stderr).toBe(0);
    expect(text(folder, "flow.meltemi")).toBe(sheet("Version one"));
    expect(existsSync(join(folder, "later.meltemi"))).toBe(false);
    expect(readFileSync(join(folder, "assets", "logo.png")).equals(old)).toBe(true);
    expect(result.stdout).toContain(`Pulled version 1 of the cloud project ${project.id} into`);
    expect(stub.to(`/api/projects/${project.id}/versions/1`, "GET")).toHaveLength(1);

    const three = join(scratch.root, "version-three");
    await mdg(["pull", project.id, three, "--version", "3"], { cwd: scratch.root, env });
    expect(text(three, "flow.meltemi")).toBe(sheet("Version two"));
    expect(existsSync(join(three, "later.meltemi"))).toBe(true);
  });

  it("fails naming the version when there is none, and refuses what is not a version number", async () => {
    const { env, project } = setup({ "a.meltemi": sheet() });
    stub.addVersion(project);
    const folder = join(scratch.root, "no-version");
    const missing = await mdg(["pull", project.id, folder, "--version", "99"], {
      cwd: scratch.root,
      env,
    });
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("version.not-found: the cloud project has no version 99.");
    expect(existsSync(folder)).toBe(false);
    for (const bad of ["abc", "0", "1.5", "", "-1"]) {
      const result = await mdg(["pull", project.id, folder, "--version", bad], {
        cwd: scratch.root,
        env,
      });
      expect(result.code, bad).toBe(2);
      expect(result.stderr, bad).toContain("Usage: pull");
      // A value that starts with a dash is not taken as the option's value at all.
      if (bad !== "-1") expect(result.stderr, bad).toContain("--version takes a version number");
    }
    expect(existsSync(folder)).toBe(false);
  });

  it("checks the paths of a version too", async () => {
    const { env, project } = setup({ "../x.meltemi": "evil", "ok.meltemi": sheet() });
    stub.addVersion(project);
    const folder = join(scratch.root, "version-unsafe");
    const result = await mdg(["pull", project.id, folder, "--version", "1"], {
      cwd: scratch.root,
      env,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.unsafe-path");
    expect(existsSync(folder)).toBe(false);
  });
});

describe("mdg pull: images and fonts are checked", () => {
  it("refuses bytes that are not the hash they are named by, and writes nothing of that file", async () => {
    const { env, project } = setup({ "a.meltemi": sheet() }, { "assets/logo.png": png("logo") });
    // The service answers other bytes for the hash.
    project.blobs.set(sha256(png("logo")), png("tampered"));
    const folder = join(scratch.root, "tampered");
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cloud.bad-response");
    expect(existsSync(join(folder, "assets", "logo.png"))).toBe(false);
    expect(tree(folder).some((path) => path.endsWith(".tmp"))).toBe(false);
  });

  it("fetches an image once per file and keeps it byte for byte", async () => {
    const bytes = Buffer.from([0, 1, 2, 253, 254, 255, 0, 10, 13]);
    const font = Buffer.concat([Buffer.from("wOF2"), bytes]);
    const { env, project } = setup({}, { "fonts/Body.woff2": font, "images/a.png": png("a") });
    const folder = join(scratch.root, "binary");
    const result = await mdg(["pull", project.id, folder], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(readFileSync(join(folder, "fonts", "Body.woff2")).equals(font)).toBe(true);
    expect(stub.to(/\/blobs\//, "GET")).toHaveLength(2);
  });
});

describe("mdg pull: where it goes and who is asking", () => {
  it("fails with 1 and names the id when the project does not exist, or cannot be one", async () => {
    const { env } = setup();
    const folder = join(scratch.root, "nothing");
    const missing = "z".repeat(20);
    const unknown = await mdg(["pull", missing, folder], { cwd: scratch.root, env });
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain(
      `project.not-found: the cloud project ${missing} does not exist`,
    );
    const malformed = await mdg(["pull", "not-an-id", folder], { cwd: scratch.root, env });
    expect(malformed.code).toBe(1);
    expect(malformed.stderr).toContain("project.not-found");
    expect(malformed.stderr).toContain("not-an-id");
    expect(existsSync(folder)).toBe(false);
  });

  it("asks for an id when the folder names none", async () => {
    const { env } = setup();
    const result = await mdg(["pull"], { cwd: scratch.folder(), env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.no-project");
    expect(result.stderr).toContain("give its id");
    expect(stub.requests).toEqual([]);
  });

  it("exits with 3 without a token, refuses plain http to another host and shows no token", async () => {
    const home = scratch.home(stub);
    const project = stub.addProject({ files: { "a.meltemi": sheet() } });
    const folder = join(scratch.root, "unsigned");
    const unsigned = await mdg(["pull", project.id, folder], { cwd: scratch.root, env: home.env });
    expect(unsigned.code).toBe(3);
    expect(unsigned.stderr).toContain(
      `pull: cloud.not-signed-in: not signed in to ${stub.url}; run "meltemi-diagrams login".`,
    );
    expect(stub.requests).toEqual([]);

    const { env } = setup();
    const insecure = await mdg(["pull", project.id, folder, "--host", "http://diagrams.example"], {
      cwd: scratch.root,
      env,
    });
    expect(insecure.code).toBe(1);
    expect(insecure.stderr).toContain("cloud.insecure-host");

    const signed = scratch.home(stub);
    const entry = signIn(stub, signed.store);
    stub.fail(`GET /api/projects/${project.id}/files`, {
      status: 500,
      body: { code: "internal", message: `Failed for ${entry.token}.` },
    });
    const leaked = await mdg(["pull", project.id, folder], { cwd: scratch.root, env: signed.env });
    expect(leaked.code).toBe(1);
    expect(leaked.stderr).toContain("Failed for mdg_….");
    expect(leaked.stdout + leaked.stderr).not.toContain(entry.token);
  });

  it("refuses a folder that is a file", async () => {
    const { env, project } = setup({ "a.meltemi": sheet() });
    const folder = scratch.folder({ file: "x" });
    const result = await mdg(["pull", project.id, join(folder, "file")], {
      cwd: scratch.root,
      env,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.not-a-folder");
    expect(stub.requests).toEqual([]);
  });

  it("speaks Spanish with --lang es", async () => {
    const { env, project } = setup({ "project.json": MANIFEST, "a.meltemi": sheet("Cloud") });
    const folder = scratch.folder({ "a.meltemi": sheet("Local") });
    const result = await mdg(["pull", project.id, folder, "--lang", "es"], {
      cwd: scratch.root,
      env,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("  se escribió project.json");
    expect(result.stdout).toContain("  se conservó a.meltemi (difiere de la nube)");
    expect(result.stdout).toContain("Pasa --force para sobrescribir los archivos que difieren.");
    expect(result.stdout).toContain("Se anotó el proyecto de la nube en");
    expect(result.stdout).toContain(
      `Se trajeron los últimos archivos del proyecto ${project.id} de la nube`,
    );
    const unsafe = setup({ "../x.meltemi": "evil" });
    const refused = await mdg(
      ["pull", unsafe.project.id, join(scratch.root, "es-unsafe"), "--lang", "es"],
      {
        cwd: scratch.root,
        env: unsafe.env,
      },
    );
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("pull.unsafe-path");
  });

  it("prints its help in both languages, and exits 2 for a usage error", async () => {
    const { env } = setup();
    const english = await mdg(["pull", "--help"], { cwd: scratch.root, env });
    expect(english.code).toBe(0);
    expect(english.stdout).toContain("Usage: pull [<id>] [folder] [options]");
    for (const option of ["--version", "--force", "--host"])
      expect(english.stdout).toContain(option);
    const spanish = await mdg(["pull", "--help", "--lang", "es"], { cwd: scratch.root, env });
    expect(spanish.stdout).toContain("Uso: pull [<id>] [carpeta] [opciones]");
    const main = await mdg(["--help"], { cwd: scratch.root, env });
    expect(main.stdout).toMatch(
      /^ {2}pull \[id\] \[folder\] {2,}Write a cloud project's files into a folder/m,
    );
    expect(main.stdout).toContain("Options for pull:");
    const mainEs = await mdg(["--help", "--lang", "es"], { cwd: scratch.root, env });
    expect(mainEs.stdout).toMatch(
      /^ {2}pull \[id\] \[carpeta\] {2,}Escribir los archivos de un proyecto/m,
    );
    expect(mainEs.stdout).toContain("Opciones de pull:");

    for (const args of [["--sync"], ["a", "b", "c"]]) {
      const result = await mdg(["pull", ...args], { cwd: scratch.root, env });
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.stderr).toContain("Usage: pull");
    }
    expect(stub.requests).toEqual([]);
  });
});
