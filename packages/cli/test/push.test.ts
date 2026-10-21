import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import type { CloudHooks } from "../src/cloud-context.js";
import { MANIFEST, Scratch, mdg, png, sheet, signIn } from "./cloud-fixtures.js";
import { CloudStub, sha256, type Recorded, type StubProject } from "./cloud-stub.js";

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

/** A sheet with an error: its id is declared twice. */
const BROKEN = 'language "0.2"\n\ndiagram broken: flow {\n  a["A"]\n  a["B"]\n}\n';

/** A person signed in at a home of their own, and a project in the cloud with these files. */
function setup(cloud: Record<string, string> = {}, binaries: Record<string, Buffer> = {}) {
  const home = scratch.home(stub);
  const token = signIn(stub, home.store);
  const project = stub.addProject({ files: cloud, binaries });
  return { ...home, token, project };
}

/** The manifest text of a project that names the cloud project. */
function linkedManifest(project: { id: string }, manifest = MANIFEST): string {
  const cloud = JSON.stringify({ host: stub.url, project: project.id });
  return manifest.replace(/\n}\n$/, `,\n  "cloud": ${cloud}\n}\n`);
}

/** A folder that names the cloud project in its manifest, with these files. */
function linked(project: { id: string }, files: Record<string, string | Buffer> = {}): string {
  return scratch.folder({ "project.json": linkedManifest(project), ...files });
}

/** The requests that changed something, as `METHOD path`. */
const writes = () =>
  stub.requests
    .filter((r) => r.method !== "GET" && r.method !== "HEAD")
    .map((r) => `${r.method} ${r.path}`);

const bodyOf = (request: Recorded) => JSON.parse(request.body.toString("utf8"));
const pushes = (project: StubProject) => stub.to(`/api/projects/${project.id}/files`, "PUT");

/** The cloud as a test sees it: texts by path, and binaries by path with their hash. */
const cloudOf = (project: StubProject) => ({
  files: Object.fromEntries([...project.files].sort(([a], [b]) => (a < b ? -1 : 1))),
  binaries: Object.fromEntries([...project.binaries].sort(([a], [b]) => (a < b ? -1 : 1))),
});

describe("mdg push --create", () => {
  it("makes the project from a folder with three sources and an image, and records it in project.json", async () => {
    const { env } = setup();
    const logo = png("logo");
    const root = scratch.folder({
      "docs/architecture/project.json": MANIFEST,
      "docs/architecture/a.meltemi": sheet("A"),
      "docs/architecture/b.meltemi": sheet("B"),
      "docs/architecture/c.meltemi": sheet("C"),
      "docs/architecture/assets/logo.png": logo,
    });
    const result = await mdg(["push", "docs/architecture", "--create"], { cwd: root, env });
    expect(result.code, result.stderr).toBe(0);

    // The service holds the three texts, the manifest and the image by hash.
    const created = [...stub.projects.values()].at(-1)!;
    expect(Object.keys(cloudOf(created).files)).toEqual([
      "a.meltemi",
      "b.meltemi",
      "c.meltemi",
      "project.json",
    ]);
    expect(created.binaries.get("assets/logo.png")).toBe(sha256(logo));
    expect(created.blobs.get(sha256(logo))?.equals(logo)).toBe(true);

    // project.json carries the project, with its formatting kept; the cloud holds that very text.
    const manifest = readFileSync(join(root, "docs/architecture/project.json"), "utf8");
    expect(JSON.parse(manifest).cloud).toEqual({ host: stub.url, project: created.id });
    expect(manifest).toBe(
      `{\n  "name": "Shop",\n  "language": "0.2",\n  "cloud": { "host": "${stub.url}", "project": "${created.id}" }\n}\n`,
    );
    expect(created.files.get("project.json")).toBe(manifest);
    expect(result.stdout).toContain(`Created the cloud project ${created.id} (Shop).`);
    expect(result.stdout).toContain("Recorded the cloud project in docs/architecture/project.json");
    expect(result.stdout).toContain(`Open it at ${stub.url}/p/${created.id}`);

    // One create, then the image by hash, then the one transaction that carries the manifest.
    const order = stub.requests
      .map((r) => `${r.method} ${r.path.replace(created.id, "<id>")}`)
      .filter((line) => !line.startsWith("GET /api/session"));
    expect(order).toEqual([
      "POST /api/projects",
      "GET /api/projects/<id>/files",
      "HEAD /api/projects/<id>/blobs/" + sha256(logo),
      "PUT /api/projects/<id>/binaries/assets/logo.png",
      "PUT /api/projects/<id>/files",
    ]);
    // The upload advanced the room by one: the push carries the revision it knows.
    const [push] = pushes(created);
    expect(bodyOf(push!).ifRevision).toBe(2);
    expect(Object.keys(bodyOf(push!).files)).toEqual(["project.json"]);
    expect(bodyOf(push!).binaries).toEqual({ "assets/logo.png": sha256(logo) });

    // The next push finds the cloud equal to the folder.
    stub.requests.length = 0;
    const again = await mdg(["push", "docs/architecture"], { cwd: root, env });
    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toContain("already matches the folder; nothing to push.");
    expect(writes()).toEqual([]);
  });

  it("keeps a CRLF, four-space manifest as it is and adds the field in its style", async () => {
    const { env } = setup();
    const manifest = '{\r\n    "name": "Shop",\r\n    "language": "0.2"\r\n}\r\n';
    const folder = scratch.folder({ "project.json": manifest, "a.meltemi": sheet() });
    const result = await mdg(["push", folder, "--create", "--name", "Crlf shop"], {
      cwd: scratch.root,
      env,
    });
    expect(result.code, result.stderr).toBe(0);
    const created = [...stub.projects.values()].find((p) => p.name === "Crlf shop")!;
    expect(readFileSync(join(folder, "project.json"), "utf8")).toBe(
      `{\r\n    "name": "Shop",\r\n    "language": "0.2",\r\n    "cloud": { "host": "${stub.url}", "project": "${created.id}" }\r\n}\r\n`,
    );
    expect(created.files.get("project.json")).toBe(
      readFileSync(join(folder, "project.json"), "utf8"),
    );
  });

  it("makes a project.json when the folder has none, named after the folder, and pushes it", async () => {
    const { env } = setup();
    const folder = scratch.folder({ "a.meltemi": sheet() }, "my-diagrams");
    const result = await mdg(["push", folder, "--create"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    const created = [...stub.projects.values()].find((p) => p.name === "my-diagrams")!;
    const text = readFileSync(join(folder, "project.json"), "utf8");
    expect(JSON.parse(text)).toEqual({
      name: "my-diagrams",
      language: "0.2",
      cloud: { host: stub.url, project: created.id },
    });
    expect(created.files.get("project.json")).toBe(text);
  });

  it("names the project --name, else the manifest's name", async () => {
    const { env } = setup();
    const one = scratch.folder({ "project.json": MANIFEST, "a.meltemi": sheet() });
    await mdg(["push", one, "--create"], { cwd: scratch.root, env });
    const two = scratch.folder({ "project.json": MANIFEST, "a.meltemi": sheet() });
    await mdg(["push", two, "--create", "--name", "  Another name  "], { cwd: scratch.root, env });
    const names = [...stub.projects.values()].slice(-2).map((p) => p.name);
    expect(names).toEqual(["Shop", "Another name"]);
  });

  it("refuses what cannot be combined, and a project that is already linked, before creating anything", async () => {
    const { env, project } = setup();
    const before = stub.projects.size;
    const folder = scratch.folder({ "project.json": MANIFEST, "a.meltemi": sheet() });
    const run = (...args: string[]) => mdg(["push", folder, ...args], { cwd: scratch.root, env });
    for (const [args, message] of [
      [["--create", "--project", project.id], "cannot be combined with --project"],
      [["--name", "x"], "--name goes with --create"],
      [["--create", "--name", " "], "--name needs a name"],
      [["--create", "--check"], "cannot be combined with --create"],
    ] as const) {
      const result = await run(...args);
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.stderr).toContain(message);
      expect(result.stderr).toContain("Usage: push");
    }
    const already = linked(project, { "a.meltemi": sheet() });
    const result = await mdg(["push", already, "--create"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `push.already-linked: project.json already names the cloud project ${project.id}`,
    );
    expect(stub.projects.size).toBe(before);
    expect(writes()).toEqual([]);
  });

  it("sends the project.json of a folder linked to one project to another as that other project's own", async () => {
    // The setting would otherwise travel with the manifest: the other project would be linked to the
    // first, and the next push from a copy of it would overwrite the wrong project.
    const { env, project } = setup();
    const other = stub.addProject({ files: { "project.json": MANIFEST } });
    const folder = linked(project, { "a.meltemi": sheet() });
    const before = readFileSync(join(folder, "project.json"), "utf8");
    const result = await mdg(["push", folder, "--project", other.id, "--force"], {
      cwd: scratch.root,
      env,
    });
    expect(result.code, result.stderr).toBe(0);
    const sent = other.files.get("project.json") ?? "";
    expect(sent).toContain(other.id);
    expect(sent).not.toContain(project.id);
    // The file in the folder is not touched.
    expect(readFileSync(join(folder, "project.json"), "utf8")).toBe(before);
    expect(before).toContain(project.id);
  });

  it("refuses a manifest it cannot edit, and never replaces one it cannot read", async () => {
    const { env } = setup();
    const before = stub.projects.size;
    const broken = scratch.folder({ "project.json": "{ not json", "a.meltemi": sheet() });
    const first = await mdg(["push", broken, "--create"], { cwd: scratch.root, env });
    expect(first.code).toBe(1);
    expect(first.stderr).toContain("push.manifest-invalid");
    expect(readFileSync(join(broken, "project.json"), "utf8")).toBe("{ not json");
    const latin = scratch.folder({ "a.meltemi": sheet() });
    writeFileSync(join(latin, "project.json"), Buffer.from([0x7b, 0x22, 0xe9, 0x22, 0x7d]));
    const second = await mdg(["push", latin, "--create"], { cwd: scratch.root, env });
    expect(second.code).toBe(1);
    expect(second.stderr).toContain("push.manifest-invalid");
    expect(readFileSync(join(latin, "project.json")).length).toBe(5);
    expect(stub.projects.size).toBe(before);
    expect(writes()).toEqual([]);
  });

  it("says which project was made when project.json cannot be written afterwards", async () => {
    const { env } = setup();
    const folder = scratch.folder({ "project.json": MANIFEST, "a.meltemi": sheet() });
    const hooks: CloudHooks = {
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (init?.method === "POST" && String(input).endsWith("/api/projects")) {
          // Something takes project.json's place between the create and the write.
          unlinkSync(join(folder, "project.json"));
          mkdirSync(join(folder, "project.json"));
        }
        return response;
      },
    };
    const result = await mdg(["push", folder, "--create"], { cwd: scratch.root, env, hooks });
    expect(result.code).toBe(1);
    const created = [...stub.projects.values()].at(-1)!;
    expect(result.stderr).toContain("push.manifest-not-written");
    expect(result.stderr).toContain(
      `the cloud project ${created.id} was created with the folder's text files`,
    );
    expect(result.stderr).toContain(`"host": "${stub.url}", "project": "${created.id}"`);
  });
});

describe("mdg push: what differs", () => {
  it("refuses without a terminal and without --force, naming the file by id, and pushes nothing", async () => {
    // Someone renamed the label of `start` in the page; the folder lacks that change.
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet("Beginning"),
    });
    const folder = linked(project, { "flow.meltemi": sheet("Start") });
    const result = await mdg(["push", folder], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("The cloud project differs from the folder in 2 paths:");
    expect(result.stdout).toContain("  flow.meltemi differs");
    expect(result.stdout).toContain("  project.json differs");
    expect(result.stdout).toContain("By id, what pushing changes in the diagrams:");
    expect(result.stdout).toContain('~ element start "Start": label "Beginning" → "Start"');
    expect(result.stderr).toContain(
      "meltemi-diagrams push: push.differs: the cloud project differs",
    );
    expect(result.stderr).toContain("pass --force");
    expect(writes()).toEqual([]);
    expect(project.files.get("flow.meltemi")).toBe(sheet("Beginning"));
  });

  it("overwrites with --force, in one transaction that carries the fetched revision", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet("Beginning"),
      "old.meltemi": sheet("Old"),
    });
    const folder = linked(project, { "flow.meltemi": sheet("Start") });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(cloudOf(project).files).toEqual({
      "flow.meltemi": sheet("Start"),
      "project.json": linkedManifest(project),
    });
    expect(result.stdout).toContain(
      `Pushed to the cloud project ${project.id}: 2 files written, 1 file deleted.`,
    );
    expect(writes()).toEqual([`PUT /api/projects/${project.id}/files`]);
    const [push] = pushes(project);
    expect(bodyOf(push!)).toEqual({
      files: {
        "flow.meltemi": sheet("Start"),
        "old.meltemi": null,
        "project.json": linkedManifest(project),
      },
      binaries: {},
      ifRevision: 1,
    });
    // Everything it sent went to the host it was asked to talk to, with the person's token.
    expect(push!.headers.authorization).toMatch(/^Bearer mdg_/);
  });

  it("asks on a terminal, and pushes only on a yes", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet("Beginning"),
    });
    const folder = linked(project, { "flow.meltemi": sheet("Start") });
    const declined = await mdg(["push", folder], { cwd: scratch.root, env, answers: ["n"] });
    expect(declined.code).toBe(1);
    expect(declined.asked).toEqual(["Overwrite these changes in the cloud? [y/N] "]);
    expect(declined.stderr).toContain("push.declined: nothing was pushed.");
    expect(writes()).toEqual([]);

    const empty = await mdg(["push", folder], { cwd: scratch.root, env, answers: [""] });
    expect(empty.code).toBe(1);
    expect(writes()).toEqual([]);

    const accepted = await mdg(["push", folder], { cwd: scratch.root, env, answers: ["y"] });
    expect(accepted.code, accepted.stderr).toBe(0);
    expect(project.files.get("flow.meltemi")).toBe(sheet("Start"));
    expect(accepted.stdout).toContain("Pushed to the cloud project");
  });

  it("asks in Spanish with --lang es, and a sí is a yes", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet("Beginning"),
    });
    const folder = linked(project, { "flow.meltemi": sheet("Start") });
    const result = await mdg(["push", folder, "--lang", "es"], {
      cwd: scratch.root,
      env,
      answers: ["sí"],
    });
    expect(result.code, result.stderr).toBe(0);
    expect(result.asked).toEqual(["¿Sobrescribir estos cambios en la nube? [s/N] "]);
    expect(result.stdout).toContain("El proyecto de la nube difiere de la carpeta en 2 rutas:");
    expect(result.stdout).toContain("  flow.meltemi difiere");
    expect(result.stdout).toContain("Por id, lo que el push cambia en los diagramas:");
    expect(result.stdout).toContain(
      `Enviado al proyecto ${project.id} de la nube: 2 archivos escritos.`,
    );
    const refused = await mdg(["push", folder, "--lang", "es", "--force"], {
      cwd: scratch.root,
      env,
    });
    expect(refused.code).toBe(0);
    expect(refused.stdout).toContain("ya coincide con la carpeta");
  });

  it("lists that only project.json differs, with a review that reports nothing, then asks or refuses", async () => {
    const { env, project } = setup({ "project.json": MANIFEST, "flow.meltemi": sheet() });
    const folder = linked(project, { "flow.meltemi": sheet() });
    const refused = await mdg(["push", folder], { cwd: scratch.root, env });
    expect(refused.code).toBe(1);
    expect(refused.stdout).toContain("The cloud project differs from the folder in 1 path:");
    expect(refused.stdout).toContain("  project.json differs");
    expect(refused.stdout).toMatch(/By id, what pushing changes in the diagrams:\nNo changes\.\n/);
    expect(refused.stdout).not.toContain("flow.meltemi");
    expect(writes()).toEqual([]);

    const asked = await mdg(["push", folder], { cwd: scratch.root, env, answers: ["yes"] });
    expect(asked.code, asked.stderr).toBe(0);
    expect(asked.asked).toHaveLength(1);
    expect(project.files.get("project.json")).toBe(linkedManifest(project));
  });

  it("lists added files, changed images and deletions of images", async () => {
    const { env, project } = setup(
      { "project.json": MANIFEST },
      { "assets/a.png": png("a"), "assets/gone.png": png("gone"), "assets/same.png": png("same") },
    );
    const folder = linked(project, {
      "assets/a.png": png("a changed"),
      "assets/same.png": png("same"),
      "assets/new.png": png("new"),
      "new.meltemi": sheet(),
    });
    const result = await mdg(["push", folder, "--check"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("  assets/a.png differs");
    expect(result.stdout).toContain("  assets/gone.png is only in the cloud (pushing deletes it)");
    expect(result.stdout).toContain("  assets/new.png is not in the cloud yet");
    expect(result.stdout).toContain("  new.meltemi is not in the cloud yet");
    expect(result.stdout).not.toContain("assets/same.png");
    expect(result.stdout).toContain("5 paths differ; pushing would change the cloud project.");
  });

  it("proceeds without asking, and without a write, when the cloud already matches", async () => {
    const { env, project } = setup({}, { "assets/a.png": png("a") });
    const text = linkedManifest(project);
    project.files.set("project.json", text);
    project.files.set("flow.meltemi", sheet());
    const folder = scratch.folder({
      "project.json": text,
      "flow.meltemi": sheet(),
      "assets/a.png": png("a"),
    });
    const result = await mdg(["push", folder], { cwd: scratch.root, env, answers: [] });
    expect(result.code, result.stderr).toBe(0);
    expect(result.asked).toEqual([]);
    expect(result.stdout).toBe(
      `The cloud project ${project.id} already matches the folder; nothing to push.\n`,
    );
    expect(stub.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /api/projects/${project.id}/files`,
    ]);
  });
});

describe("mdg push: a change that arrives during the push", () => {
  /** A cloud that someone else changes at the moment of the push: the revision moves. */
  function theirChange(project: StubProject): void {
    project.files.set("theirs.meltemi", sheet("Theirs"));
    project.revision++;
  }

  it("compares again, asks again and overwrites nothing without the question", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet("Beginning"),
    });
    const folder = linked(project, { "flow.meltemi": sheet("Start") });
    const result = await mdg(["push", folder], {
      cwd: scratch.root,
      env,
      answers: [
        () => {
          theirChange(project);
          return "y";
        },
        "n",
      ],
    });
    expect(result.code).toBe(1);
    expect(result.asked).toHaveLength(2);
    expect(result.stdout).toContain("The cloud project changed while pushing; comparing again.");
    // The second list shows what arrived, and nothing was overwritten.
    const second = result.stdout.slice(result.stdout.indexOf("comparing again."));
    expect(second).toContain("  theirs.meltemi is only in the cloud (pushing deletes it)");
    expect(second).toContain("The cloud project differs from the folder in 3 paths:");
    expect(result.stderr).toContain("push.declined");
    expect(project.files.get("theirs.meltemi")).toBe(sheet("Theirs"));
    expect(project.files.get("flow.meltemi")).toBe(sheet("Beginning"));
    // The first push was refused by the service (409), the second never made.
    expect(pushes(project)).toHaveLength(1);
  });

  it("compares again and pushes with --force, on the new revision", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet("Beginning"),
    });
    const folder = linked(project, { "flow.meltemi": sheet("Start") });
    let changed = false;
    const hooks: CloudHooks = {
      fetch: (input, init) => {
        if (!changed && init?.method === "PUT" && String(input).endsWith("/files")) {
          changed = true;
          theirChange(project);
        }
        return fetch(input, init);
      },
    };
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env, hooks });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("comparing again.");
    const sent = pushes(project).map((r) => bodyOf(r).ifRevision);
    expect(sent).toEqual([1, 2]);
    expect(project.files.has("theirs.meltemi")).toBe(false);
    expect(project.files.get("flow.meltemi")).toBe(sheet("Start"));
  });

  it("gives up with revision.mismatch when the cloud changes again, still overwriting nothing", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet("Beginning"),
    });
    const folder = linked(project, { "flow.meltemi": sheet("Start") });
    const hooks: CloudHooks = {
      fetch: (input, init) => {
        if (init?.method === "PUT" && String(input).endsWith("/files")) theirChange(project);
        return fetch(input, init);
      },
    };
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env, hooks });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "revision.mismatch: the cloud project changed again while pushing",
    );
    expect(pushes(project)).toHaveLength(2);
    expect(project.files.get("flow.meltemi")).toBe(sheet("Beginning"));
  });
});

describe("mdg push --check", () => {
  it("reports and exits 1 when something differs, and 0 when nothing does, writing nothing", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet("Beginning"),
    });
    const folder = linked(project, { "flow.meltemi": sheet("Start") });
    const differs = await mdg(["push", folder, "--check"], { cwd: scratch.root, env });
    expect(differs.code).toBe(1);
    expect(differs.stdout).toContain("  flow.meltemi differs");
    expect(differs.stdout).toContain("2 paths differ; pushing would change the cloud project.");
    expect(differs.stderr).toBe("");
    expect(writes()).toEqual([]);

    // --force does not make --check write.
    const forced = await mdg(["push", folder, "--check", "--force"], { cwd: scratch.root, env });
    expect(forced.code).toBe(1);
    expect(writes()).toEqual([]);

    project.files.set("project.json", linkedManifest(project));
    project.files.set("flow.meltemi", sheet("Start"));
    const same = await mdg(["push", folder, "--check"], { cwd: scratch.root, env });
    expect(same.code).toBe(0);
    expect(same.stdout).toContain("already matches the folder");
    expect(writes()).toEqual([]);
  });
});

describe("mdg push: validation", () => {
  it("prints the diagnostics and still pushes, since errors only warn without --strict", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, { "broken.meltemi": BROKEN });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/broken\.meltemi:\d+:\d+: error ref\.duplicate-id/);
    expect(result.stdout).toContain("Checked 1 file: 1 error, 0 warnings.");
    expect(project.files.get("broken.meltemi")).toBe(BROKEN);
  });

  it("prints the diagnostics, pushes nothing and exits 1 with --strict when a source has an error", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, { "broken.meltemi": BROKEN });
    const result = await mdg(["push", folder, "--strict", "--force"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/broken\.meltemi:\d+:\d+: error ref\.duplicate-id/);
    expect(result.stderr).toContain(
      "push.strict: 1 validation error, and --strict is given, so nothing was pushed.",
    );
    // Not even the cloud was asked.
    expect(stub.requests).toEqual([]);
    expect(project.files.has("broken.meltemi")).toBe(false);
  });

  it("pushes a project without errors with --strict", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, { "flow.meltemi": sheet() });
    const result = await mdg(["push", folder, "--strict", "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(project.files.get("flow.meltemi")).toBe(sheet());
  });
});

describe("mdg push: images and fonts by hash", () => {
  it("uploads what the cloud lacks and skips what it has, and carries the revision it knows", async () => {
    const held = png("held");
    const fresh = png("fresh");
    const { env, project } = setup({ "project.json": MANIFEST }, { "elsewhere/held.png": held });
    project.revision = 7;
    const folder = linked(project, {
      "assets/held.png": held,
      "assets/fresh.png": fresh,
      "fonts/Body.woff2": Buffer.from("wOF2 body font"),
    });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    // Each hash is asked about; `held` is in the cloud already (under another name), so it is not
    // uploaded again.
    const asked = stub.to(/\/blobs\//, "HEAD").map((r) => r.path.split("/").pop()!);
    expect(asked.sort()).toEqual([sha256(fresh), sha256(held), sha256("wOF2 body font")].sort());
    expect(
      stub
        .to(/\/binaries\//, "PUT")
        .map((r) => r.path.split("/binaries/")[1]!)
        .sort(),
    ).toEqual(["assets/fresh.png", "fonts/Body.woff2"]);
    // Two uploads changed the room: the push carries 7 + 2.
    expect(bodyOf(pushes(project)[0]!).ifRevision).toBe(9);
    // The cloud's own copy under another name is not in the folder: deleted, with the other changes.
    expect(cloudOf(project).binaries).toEqual({
      "assets/fresh.png": sha256(fresh),
      "assets/held.png": sha256(held),
      "fonts/Body.woff2": sha256("wOF2 body font"),
    });
    expect(result.stdout).toContain("4 files written, 1 file deleted, 2 images or fonts uploaded");
  });

  it("neither asks nor uploads for an image the cloud has at the same path, and uploads a changed one", async () => {
    const { env, project } = setup(
      { "project.json": MANIFEST },
      { "a.png": png("a"), "b.png": png("b") },
    );
    const folder = linked(project, { "a.png": png("a"), "b.png": png("b changed") });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(stub.to(/\/blobs\//, "HEAD")).toHaveLength(1);
    expect(stub.to(/\/binaries\//, "PUT").map((r) => r.path.split("/").pop())).toEqual(["b.png"]);
    expect(project.binaries.get("b.png")).toBe(sha256(png("b changed")));
  });

  it("uploads an image the cloud only keeps in an old version when the push says it is unknown", async () => {
    const old = png("old version");
    const { env, project } = setup({ "project.json": MANIFEST });
    // The service says it holds the bytes (a version does) but the project cannot use the hash.
    project.blobs.set(sha256(old), old);
    const folder = linked(project, { "assets/old.png": old });
    stub.fail(`PUT /api/projects/${project.id}/files`, {
      status: 400,
      body: { code: "blob.unknown", message: "The project holds no image or font with that hash." },
    });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(project.binaries.get("assets/old.png")).toBe(sha256(old));
    expect(stub.to(/\/binaries\//, "PUT")).toHaveLength(1);
    expect(pushes(project)).toHaveLength(2);
  });

  it("names the file the service refused as an image, and pushes nothing", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, { "assets/broken.png": png("not really") });
    stub.fail(`PUT /api/projects/${project.id}/binaries/assets/broken.png`, {
      status: 400,
      body: { code: "binary.invalid", message: "That is not an image." },
    });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "binary.invalid: assets/broken.png is not a PNG, JPEG, GIF, WebP, woff2, ttf or otf by its bytes.",
    );
    expect(pushes(project)).toHaveLength(0);
  });

  it("does not send a file that changed after it was compared", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, { "assets/a.png": png("a") });
    const hooks: CloudHooks = {
      fetch: (input, init) => {
        // Between the comparison and the upload the file is edited.
        if (init?.method === "HEAD") writeFileSync(join(folder, "assets", "a.png"), png("edited"));
        return fetch(input, init);
      },
    };
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env, hooks });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "push.file-changed: assets/a.png changed while it was being pushed",
    );
    expect(stub.to(/\/binaries\//, "PUT")).toHaveLength(0);
    expect(pushes(project)).toHaveLength(0);
  });
});

describe("mdg push: what the folder offers", () => {
  it("sends neither hidden files, node_modules, what project.json excludes nor the catalog", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const manifest =
      '{\n  "name": "Shop",\n  "language": "0.2",\n  "exclude": ["drafts", "notes/private.md"]\n}\n';
    const folder = scratch.folder({
      "project.json": linkedManifest(project, manifest),
      "flow.meltemi": sheet(),
      ".git/config": "[core]",
      ".hidden.meltemi": sheet(),
      ".meltemi/state.json": "{}",
      "node_modules/pkg/index.json": "{}",
      "deep/node_modules/x.md": "x",
      "drafts/draft.meltemi": sheet(),
      "notes/private.md": "private",
      "notes/public.md": "public",
      "catalog/index.json": "{}",
      "catalog/data.svg": "<svg/>",
    });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(Object.keys(cloudOf(project).files)).toEqual([
      "flow.meltemi",
      "notes/public.md",
      "project.json",
    ]);
    // The catalog's output moves with the manifest's setting.
    const catalog =
      '{\n  "name": "Shop",\n  "language": "0.2",\n  "catalog": { "out": "site" }\n}\n';
    const second = scratch.folder({
      "project.json": linkedManifest(project, catalog),
      "catalog/keep.md": "kept",
      "site/index.md": "left out",
    });
    await mdg(["push", second, "--force"], { cwd: scratch.root, env });
    expect(Object.keys(cloudOf(project).files)).toEqual(["catalog/keep.md", "project.json"]);
  });

  it("does not delete what the folder leaves out on purpose, nor what it could not read", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "drafts/theirs.meltemi": sheet("Theirs"),
      "notes.md": "from the page",
      "gone.md": "to delete",
    });
    const manifest = '{\n  "name": "Shop",\n  "language": "0.2",\n  "exclude": ["drafts"]\n}\n';
    const folder = scratch.folder({ "project.json": linkedManifest(project, manifest) });
    // A notes.md that is not UTF-8 text cannot be sent, and so cannot be taken as absent.
    writeFileSync(join(folder, "notes.md"), Buffer.from([0x66, 0xe9, 0x6c]));
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("warning: notes.md is not sent: it is not UTF-8 text.");
    expect(Object.keys(cloudOf(project).files)).toEqual([
      "drafts/theirs.meltemi",
      "notes.md",
      "project.json",
    ]);
  });

  it("reports a file whose name the cloud would refuse, never sends it, and --strict refuses the push", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, {
      "flow.meltemi": sheet(),
      "Café.meltemi": sheet("Café"),
      "a~b.md": "tilde",
      "semi;colon.md": "x",
      "accents/é.md": "x",
      "Ñandú/inside.md": "x",
      [`${"long".repeat(26)}.md`]: "x",
    });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    for (const path of ["Café.meltemi", "a~b.md", "semi;colon.md", "accents/é.md", "Ñandú/"]) {
      expect(result.stdout).toContain(
        `warning: ${path} is not sent: its name is not one the cloud keeps`,
      );
    }
    expect(result.stdout).toContain(`${"long".repeat(26)}.md is not sent`);
    expect(Object.keys(cloudOf(project).files)).toEqual(["flow.meltemi", "project.json"]);
    // Never in anything that was sent.
    for (const request of stub.requests) {
      expect(request.body.toString("utf8")).not.toContain("tilde");
      expect(request.path).not.toContain("~");
    }

    const strict = await mdg(["push", folder, "--force", "--strict"], { cwd: scratch.root, env });
    expect(strict.code).toBe(1);
    expect(strict.stderr).toContain(
      "push.strict: 6 files that cannot be sent, and --strict is given",
    );
  });

  it("says which files the cloud does not keep, and leaves links and other kinds out", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, {
      "flow.meltemi": sheet(),
      "report.pdf": "x",
      "data.bin": "x",
      "fonts/old.woff": "x",
      "Plain.PNG": png("upper"),
    });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "3 files not kept in the cloud (it keeps diagrams, text, images and fonts): data.bin, fonts/old.woff, report.pdf",
    );
    // The extension is matched without regard to case.
    expect(project.binaries.has("Plain.PNG")).toBe(true);
  });

  it("leaves alone the copies two people made at once in the cloud, and says so", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet(),
      "flow.meltemi~k4c2w7x5q3y6m2n5": sheet("Other"),
    });
    project.collisions.push({
      path: "flow.meltemi",
      keeper: "a",
      id: "k4c2w7x5q3y6m2n5",
      shown: "flow.meltemi~k4c2w7x5q3y6m2n5",
    });
    const folder = linked(project, { "flow.meltemi": sheet() });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "flow.meltemi~k4c2w7x5q3y6m2n5 is a copy that two people made at once",
    );
    expect(project.files.has("flow.meltemi~k4c2w7x5q3y6m2n5")).toBe(true);
    for (const request of pushes(project)) {
      expect(request.body.toString("utf8")).not.toContain("~");
    }
  });

  it("never sends a path the cloud's rule refuses, not even to delete it", async () => {
    const { env, project } = setup({
      "project.json": MANIFEST,
      "flow.meltemi": sheet(),
      "../escape.meltemi": "evil",
      ".git/hooks/post-checkout": "evil",
      "removed.md": "bye",
    });
    const folder = linked(project, { "flow.meltemi": sheet() });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code, result.stderr).toBe(0);
    const [push] = pushes(project);
    expect(Object.keys(bodyOf(push!).files).sort()).toEqual(["project.json", "removed.md"]);
    expect(project.files.has("../escape.meltemi")).toBe(true);
    expect(project.files.has("removed.md")).toBe(false);
  });
});

describe("mdg push and mdg pull together", () => {
  it("round trips: what one folder pushed, another pulls, and pushing that finds nothing to do", async () => {
    const { env } = setup();
    const logo = png("round trip");
    const source = scratch.folder({
      "project.json": MANIFEST,
      "diagrams/flow.meltemi": sheet(),
      "notes.md": "# Notes\r\nCRLF kept\r\n",
      "assets/logo.png": logo,
    });
    const created = await mdg(["push", source, "--create"], { cwd: scratch.root, env });
    expect(created.code, created.stderr).toBe(0);

    const copy = join(scratch.root, "round-trip-copy");
    const pulled = await mdg(["pull", "--lang", "en", [...stub.projects.keys()].at(-1)!, copy], {
      cwd: scratch.root,
      env,
    });
    expect(pulled.code, pulled.stderr).toBe(0);
    expect(readFileSync(join(copy, "project.json"), "utf8")).toBe(
      readFileSync(join(source, "project.json"), "utf8"),
    );
    expect(readFileSync(join(copy, "notes.md"), "utf8")).toBe("# Notes\r\nCRLF kept\r\n");
    expect(readFileSync(join(copy, "assets", "logo.png")).equals(logo)).toBe(true);

    stub.requests.length = 0;
    const pushed = await mdg(["push", copy], { cwd: scratch.root, env });
    expect(pushed.code, pushed.stderr).toBe(0);
    expect(pushed.stdout).toContain("already matches the folder; nothing to push.");
    expect(writes()).toEqual([]);

    // And the folder it came from is just as equal.
    const again = await mdg(["push", source, "--check"], { cwd: scratch.root, env });
    expect(again.code, again.stderr).toBe(0);
  });
});

describe("mdg push: the limits of the cloud", () => {
  it("refuses a text over 2 Mi characters, and a document of 17 MiB, with the service's code and no request", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const big = linked(project, { "notes.md": "a".repeat(2 * 1024 * 1024 + 1) });
    const one = await mdg(["push", big, "--force"], { cwd: scratch.root, env });
    expect(one.code).toBe(1);
    expect(one.stderr).toContain(
      "doc.too-large: notes.md is larger than the 2 Mi characters a text file may have.",
    );

    const huge = linked(project, { "dump.md": Buffer.alloc(17 * 1024 * 1024 + 1, 97) });
    const two = await mdg(["push", huge, "--force"], { cwd: scratch.root, env });
    expect(two.code).toBe(1);
    expect(two.stderr).toContain("doc.too-large: dump.md is larger than");

    // Many texts, each within its limit, that together fill more than a project's document.
    const parts: Record<string, string> = {};
    for (let i = 0; i < 9; i++) parts[`part${i}.md`] = "b".repeat(1_900_000);
    const many = linked(project, parts);
    const three = await mdg(["push", many, "--force"], { cwd: scratch.root, env });
    expect(three.code).toBe(1);
    expect(three.stderr).toContain(
      "doc.too-large: the texts of the folder are larger than the 16 MiB",
    );
    expect(stub.requests).toEqual([]);
  });

  it("refuses an image or font over 10 MiB with quota.binary, naming it, before any request", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, {
      "assets/ok.png": png("ok"),
      "assets/huge.png": Buffer.alloc(10 * 1024 * 1024 + 1, 1),
    });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "quota.binary: assets/huge.png is larger than the 10 MiB an image or font may be.",
    );
    expect(stub.requests).toEqual([]);
  });

  it("refuses more than 2000 files with quota.files, before any request", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const files: Record<string, string> = {};
    for (let i = 0; i < 2001; i++) files[`f${String(i).padStart(4, "0")}.md`] = "x";
    const folder = linked(project, files);
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("quota.files: a project holds at most 2000 files.");
    expect(stub.requests).toEqual([]);
  });

  it("prints the service's own refusals in the interface language and exits 1", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = linked(project, { "flow.meltemi": sheet() });
    for (const [status, code, text] of [
      [413, "quota.files", "a project holds at most 2000 files."],
      [413, "doc.too-large", "the texts of the folder are larger than the 16 MiB"],
      [413, "quota.storage", "this account would go over its 200 MiB of storage."],
      [403, "access.denied", "your role on this project does not allow that"],
      [400, "path.invalid", "a path is not one the cloud keeps."],
    ] as const) {
      stub.fail(`PUT /api/projects/${project.id}/files`, {
        status,
        body: { code, message: `service says ${code}` },
      });
      const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
      expect(result.code, code).toBe(1);
      expect(result.stderr, code).toContain(`push: ${code}: `);
      expect(result.stderr, code).toContain(text);
    }
    stub.fail(`PUT /api/projects/${project.id}/files`, {
      status: 413,
      body: { code: "quota.files", message: "Too many files." },
    });
    const spanish = await mdg(["push", folder, "--force", "--lang", "es"], {
      cwd: scratch.root,
      env,
    });
    expect(spanish.stderr).toContain("quota.files: un proyecto guarda como máximo 2000 archivos.");
    // Nothing was changed by any of them.
    expect(project.files.has("flow.meltemi")).toBe(false);
  });
});

describe("mdg push: where it goes and who is asking", () => {
  it("fails with cloud.host-mismatch, naming both hosts and --host, before any request", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const manifest = MANIFEST.replace(
      /\n}\n$/,
      `,\n  "cloud": { "host": "https://evil.example", "project": "${project.id}" }\n}\n`,
    );
    const folder = scratch.folder({ "project.json": manifest, "flow.meltemi": sheet() });
    let fetched = false;
    const result = await mdg(["push", folder, "--force"], {
      cwd: scratch.root,
      env,
      hooks: {
        fetch: () => {
          fetched = true;
          return Promise.reject(new Error("no request may be made"));
        },
      },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "push: cloud.host-mismatch: project.json names https://evil.example",
    );
    expect(result.stderr).toContain(stub.url);
    expect(result.stderr).toContain("--host");
    expect(fetched).toBe(false);
    expect(stub.requests).toEqual([]);
  });

  it("exits with 3 and says to run login when there is no token, before any request", async () => {
    const home = scratch.home(stub);
    const project = stub.addProject({ files: { "project.json": MANIFEST } });
    const folder = linked(project, { "flow.meltemi": sheet() });
    const result = await mdg(["push", folder], { cwd: scratch.root, env: home.env });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain(
      `push: cloud.not-signed-in: not signed in to ${stub.url}; run "meltemi-diagrams login".`,
    );
    expect(stub.requests).toEqual([]);
    const refused = await mdg(["push", folder], {
      cwd: scratch.root,
      env: { ...home.env, MELTEMI_TOKEN: "mdg_unknownToken0123456789" },
    });
    expect(refused.code).toBe(3);
    expect(refused.stderr).toContain("token.invalid");
    expect(refused.stderr).not.toContain("mdg_unknownToken0123456789");
  });

  it("sends the token to the development host and to nowhere else, and never over plain http to another host", async () => {
    const { env, project, token } = setup({ "project.json": MANIFEST });
    const folder = linked(project, { "flow.meltemi": sheet() });
    const seen: string[] = [];
    const result = await mdg(["push", folder, "--force", "--host", stub.url], {
      cwd: scratch.root,
      env: { ...env, MELTEMI_HOST: "https://not-this.example" },
      hooks: {
        fetch: (input, init) => {
          seen.push(String(input));
          return fetch(input, init);
        },
      },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(new Set(seen.map((u) => new URL(u).origin))).toEqual(new Set([stub.url]));
    expect(stub.requests.every((r) => r.headers.authorization === `Bearer ${token.token}`)).toBe(
      true,
    );

    let fetched = false;
    const insecure = await mdg(["push", folder, "--host", "http://diagrams.example"], {
      cwd: scratch.root,
      env,
      hooks: {
        fetch: () => {
          fetched = true;
          return Promise.reject(new Error("no"));
        },
      },
    });
    expect(insecure.code).toBe(1);
    expect(insecure.stderr).toContain("cloud.insecure-host");
    expect(insecure.stderr).toContain("http://diagrams.example");
    expect(fetched).toBe(false);
  });

  it("fails naming --project and --create when no cloud project is named, and --project names one", async () => {
    const { env, project } = setup({ "project.json": MANIFEST });
    const folder = scratch.folder({ "project.json": MANIFEST, "flow.meltemi": sheet() });
    const none = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("cloud.no-project");
    expect(none.stderr).toContain("--project");
    expect(none.stderr).toContain("push --create");
    expect(stub.requests).toEqual([]);

    const named = await mdg(["push", folder, "--force", "--project", project.id], {
      cwd: scratch.root,
      env,
    });
    expect(named.code, named.stderr).toBe(0);
    expect(project.files.get("flow.meltemi")).toBe(sheet());
    // --project wins over the manifest's.
    const other = stub.addProject({ files: { "project.json": MANIFEST } });
    const manifestOne = linked(project, { "flow.meltemi": sheet("Other") });
    const overridden = await mdg(["push", manifestOne, "--force", "--project", other.id], {
      cwd: scratch.root,
      env,
    });
    expect(overridden.code, overridden.stderr).toBe(0);
    expect(other.files.get("flow.meltemi")).toBe(sheet("Other"));
    expect(project.files.get("flow.meltemi")).toBe(sheet());
  });

  it("names the project that does not exist or that the person may not open", async () => {
    const { env } = setup();
    const folder = scratch.folder({ "project.json": MANIFEST, "flow.meltemi": sheet() });
    const missing = "z".repeat(20);
    const result = await mdg(["push", folder, "--force", "--project", missing], {
      cwd: scratch.root,
      env,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `project.not-found: the cloud project ${missing} does not exist`,
    );
    const malformed = await mdg(["push", folder, "--force", "--project", "nope"], {
      cwd: scratch.root,
      env,
    });
    expect(malformed.code).toBe(1);
    expect(malformed.stderr).toContain("project.not-found");
  });

  it("shows no token in anything it prints, whatever the service says", async () => {
    const { env, project, token } = setup({ "project.json": MANIFEST });
    const folder = linked(project, { "flow.meltemi": sheet() });
    stub.fail(`GET /api/projects/${project.id}/files`, {
      status: 500,
      body: { code: "internal", message: `Failed for ${token.token} today.` },
    });
    const result = await mdg(["push", folder, "--force"], { cwd: scratch.root, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("internal: Failed for mdg_… today.");
    expect(result.stdout + result.stderr).not.toContain(token.token);
  });
});

describe("mdg push: usage", () => {
  it("prints its help in both languages", async () => {
    const { env } = setup();
    const english = await mdg(["push", "--help"], { cwd: scratch.root, env });
    expect(english.code).toBe(0);
    expect(english.stdout).toContain("Usage: push [folder] [options]");
    for (const option of [
      "--create",
      "--name",
      "--project",
      "--force",
      "--check",
      "--strict",
      "--host",
    ]) {
      expect(english.stdout).toContain(option);
    }
    const spanish = await mdg(["push", "--help", "--lang", "es"], { cwd: scratch.root, env });
    expect(spanish.stdout).toContain("Uso: push [carpeta] [opciones]");
    const main = await mdg(["--help"], { cwd: scratch.root, env });
    expect(main.stdout).toMatch(
      /^ {2}push \[folder\] {2,}Make the cloud project match the folder/m,
    );
    expect(main.stdout).toContain("Options for push:");
    const mainEs = await mdg(["--help", "--lang", "es"], { cwd: scratch.root, env });
    expect(mainEs.stdout).toMatch(
      /^ {2}push \[carpeta\] {2,}Hacer que el proyecto de la nube coincida/m,
    );
    expect(mainEs.stdout).toContain("Opciones de push:");
    expect(stub.requests).toEqual([]);
  });

  it("exits 2 for an unknown option, more than one folder, a missing folder and a file", async () => {
    const { env } = setup();
    const folder = scratch.folder({ "a.meltemi": sheet() });
    const run = (...args: string[]) => mdg(["push", ...args], { cwd: scratch.root, env });
    const unknown = await run(folder, "--sync");
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("Usage: push [folder] [options]");
    expect((await run(folder, folder)).code).toBe(2);
    const missing = await run(join(scratch.root, "nowhere"));
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("nowhere");
    const file = await run(join(folder, "a.meltemi"));
    expect(file.code).toBe(2);
    expect(file.stderr).toContain("is not a folder");
    expect(existsSync(folder)).toBe(true);
    expect(stub.requests).toEqual([]);
  });
});
