import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { CredentialsStore } from "../src/credentials.js";
import { run } from "../src/index.js";
import { CloudStub, type StubProject } from "./cloud-stub.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-review-cloud-"));
const ARCHITECTURE = join(CORPUS_ROOT, "projects", "valid", "architecture");
const stub = new CloudStub();

beforeAll(async () => {
  await stub.start();
});
afterAll(async () => {
  await stub.stop();
  rmSync(scratch, { recursive: true, force: true });
});
beforeEach(() => {
  stub.requests.length = 0;
  stub.projects.clear();
});
afterEach(() => setLocale("en"));

let counter = 0;
function home(extra: Record<string, string> = {}) {
  const root = join(scratch, `home-${counter++}`);
  mkdirSync(root, { recursive: true });
  const env: Record<string, string> = {
    APPDATA: join(root, "AppData"),
    XDG_CONFIG_HOME: join(root, "config"),
    HOME: root,
    USERPROFILE: root,
    MELTEMI_HOST: stub.url,
    ...extra,
  };
  const store = new CredentialsStore({ env });
  const { token, id } = stub.mint("CLI");
  store.save(stub.url, { token, id, user: { sub: "u_7d3f", name: "Ana" } });
  return { env, store, token };
}

async function mdg(cwd: string, args: string[], env: Record<string, string>) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
    env,
  });
  return { code, stdout, stderr };
}

/** The architecture project's text files, as a cloud project holds them. */
const SOURCES = [
  "models/commerce",
  "diagrams/containers",
  "diagrams/context",
  "diagrams/purchase",
  "stories/tour",
];
function originalFiles(): Record<string, string> {
  const files: Record<string, string> = {
    "project.json": readFileSync(join(ARCHITECTURE, "project.json"), "utf8"),
  };
  for (const source of SOURCES) {
    files[`${source}.meltemi`] = readFileSync(join(ARCHITECTURE, `${source}.meltemi`), "utf8");
  }
  return files;
}

/** What somebody did in the page: relabelled the API container; renamed the bank in the payment. */
const relabel = (text: string) =>
  text.replace('label shop.api "API de pedidos"', 'label shop.api "Pedidos API"');
const rename = (text: string) =>
  text
    .replace("participant bank { link commerce.bank }", "participant issuer { link commerce.bank }")
    .replace("api -> bank:", "api -> issuer:")
    .replace("bank --> api:", "issuer --> api:");

/** A cloud project that someone edited after version 1 (only the relabel) and again (the rename). */
function editedCloud(): StubProject {
  const files = originalFiles();
  files["diagrams/containers.meltemi"] = relabel(files["diagrams/containers.meltemi"]!);
  const project = stub.addProject({ name: "Architecture", files });
  stub.addVersion(project, "after the relabel");
  project.files.set("diagrams/purchase.meltemi", rename(files["diagrams/purchase.meltemi"]!));
  project.revision = 5;
  return project;
}

/** The architecture project as a folder, its manifest naming the cloud project (or not). */
function folder(name: string, cloud?: { host: string; project: string }): string {
  const root = join(scratch, name);
  cpSync(ARCHITECTURE, root, { recursive: true });
  for (const svg of ["containers", "context", "purchase"]) {
    rmSync(join(root, "diagrams", `${svg}.svg`), { force: true });
  }
  if (cloud) {
    const manifest = JSON.parse(readFileSync(join(root, "project.json"), "utf8")) as object;
    writeFileSync(join(root, "project.json"), JSON.stringify({ ...manifest, cloud }, null, 2));
  }
  return root;
}

describe("review --base cloud", () => {
  it("reports what someone changed in the browser, by id, against the cloud's current files", async () => {
    const project = editedCloud();
    const root = folder("current", { host: stub.url, project: project.id });
    const { env, token } = home();
    const result = await mdg(root, ["review", "--base", "cloud"], env);
    expect(result.code, result.stderr).toBe(0);
    // The cloud has the rename and the relabel the folder lacks: reported by id, as a rename.
    expect(result.stdout).toContain("~ diagrams/purchase.meltemi\n    diagram purchase\n");
    expect(result.stdout).toContain('> element issuer → bank "Banco"');
    expect(result.stdout).not.toContain("- element issuer");
    expect(result.stdout).toContain('label "Pedidos API" → "API de pedidos"');
    expect(result.stdout).toMatch(
      /^2 files changed: 0 added, 0 removed, \d+ renamed, \d+ changed\.$/m,
    );
    expect(result.stderr).toBe("");
    // One read of the files, with the token, to the host named and no other.
    expect(stub.requests.map((r) => `${r.method} ${r.path.replace(project.id, "<id>")}`)).toEqual([
      "GET /api/projects/<id>/files",
    ]);
    expect(stub.requests[0]!.headers.authorization).toBe(`Bearer ${token}`);
  });

  it("writes out the control characters of the cloud's labels: a collaborator's escape sequence never reaches the terminal", async () => {
    const files = originalFiles();
    // ESC [ 2 J clears the screen; OSC 52 writes to the clipboard.
    const hostile = "Pedidos \u001b[2J\u001b]52;c;eA==\u0007 API";
    files["diagrams/containers.meltemi"] = files["diagrams/containers.meltemi"]!.replace(
      'label shop.api "API de pedidos"',
      `label shop.api "${hostile}"`,
    );
    const project = stub.addProject({ name: "Architecture", files });
    const root = folder("hostile", { host: stub.url, project: project.id });
    const { env } = home();
    const result = await mdg(root, ["review", "--base", "cloud"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("\\u001b[2J");
    expect(result.stdout).toContain("\\u001b]52;c;eA==\\u0007");
    // Not one raw control character besides the line breaks.
    // eslint-disable-next-line no-control-regex
    expect(result.stdout).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
  });

  it("reports nothing when the folder is what the cloud holds", async () => {
    const files = originalFiles();
    const project = stub.addProject({ name: "Architecture", files });
    const root = folder("same", { host: stub.url, project: project.id });
    const { env } = home();
    const result = await mdg(root, ["review", "--base", "cloud", "--exit-code"], env);
    expect(result.stdout).toBe("No changes.\n");
    expect(result.code).toBe(0);
  });

  it("compares with a version: cloud:<n>", async () => {
    const project = editedCloud();
    const root = folder("version", { host: stub.url, project: project.id });
    const { env } = home();
    const first = await mdg(root, ["review", "--base", "cloud:1", "--exit-code"], env);
    expect(first.code, first.stderr).toBe(1);
    // Version 1 has the relabel and not the rename.
    expect(first.stdout).toContain('label "Pedidos API" → "API de pedidos"');
    expect(first.stdout).not.toContain("issuer");
    expect(first.stdout).toMatch(/^1 file changed: /m);
    expect(stub.requests.some((r) => r.path === `/api/projects/${project.id}/versions/1`)).toBe(
      true,
    );
    // The version's files, not the current ones.
    expect(stub.requests.some((r) => r.path === `/api/projects/${project.id}/files`)).toBe(false);
  });

  it("fails with exit code 1, naming the version, when it does not exist", async () => {
    const project = editedCloud();
    const root = folder("unknown-version", { host: stub.url, project: project.id });
    const { env } = home();
    const result = await mdg(root, ["review", "--base", "cloud:99"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("meltemi-diagrams review: version.not-found:");
    expect(result.stderr).toContain("version 99");
    expect(result.stdout).toBe("");
    const spanish = await mdg(root, ["review", "--base", "cloud:99", "--lang", "es"], env);
    expect(spanish.code).toBe(1);
    expect(spanish.stderr).toContain("no tiene la versión 99");
  });

  it("fails with pull.unsafe-path, naming it, and compares nothing, when the cloud holds a path outside the folder", async () => {
    const files = { ...originalFiles(), "../x.meltemi": 'language "0.2"\n' };
    const project = stub.addProject({ name: "Architecture", files });
    const root = folder("unsafe", { host: stub.url, project: project.id });
    const { env } = home();
    const result = await mdg(root, ["review", "--base", "cloud", "--exit-code"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pull.unsafe-path");
    expect(result.stderr).toContain("../x.meltemi");
    expect(result.stdout).toBe("");
    // A dotfile path too.
    project.files.delete("../x.meltemi");
    project.files.set(".git/hooks/post-checkout", "x");
    const hidden = await mdg(root, ["review", "--base", "cloud"], env);
    expect(hidden.code).toBe(1);
    expect(hidden.stderr).toContain(".git/hooks/post-checkout");
    expect(hidden.stdout).toBe("");
  });

  // The same refusals as `pull` makes (pull.test.ts), by the same rules (cloud-paths.ts): a cloud
  // path that Windows could not keep, or that could not be written beside the others.
  it.each([
    ["a Windows device name", "con.meltemi"],
    ["a Windows device name in a folder", "docs/NUL"],
    ["a numbered Windows device", "lpt1.txt"],
    ["a name ending with a dot", "report."],
    ["a name ending with a space", "dir /file.md"],
    ["a colon", "a.meltemi:stream"],
    ["an accented name", "café.meltemi"],
    ["a control character", "a\u0001b.meltemi"],
  ])("refuses %s (%j) as pull does, names it escaped and compares nothing", async (_what, path) => {
    const project = stub.addProject({
      name: "Architecture",
      files: { ...originalFiles(), [path]: "x" },
    });
    const root = folder("unsafe-name", { host: stub.url, project: project.id });
    const { env } = home();
    const result = await mdg(root, ["review", "--base", "cloud", "--exit-code"], env);
    expect(result.code, path).toBe(1);
    expect(result.stderr, path).toContain("pull.unsafe-path");
    const shown = path.replace(
      /\p{Cc}/gu,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
    expect(result.stderr, path).toContain(`holds the path ${shown},`);
    // Nothing a terminal would act on, other than the line break that ends the message.
    expect(result.stderr, path).not.toMatch(/\p{Cc}(?<!\n)/u);
    expect(result.stdout, path).toBe("");
    expect(
      stub.requests.filter((r) => r.path.includes("/blobs/")),
      path,
    ).toHaveLength(0);
  });

  it("refuses two paths that differ only in letter case, and a file that is also a folder, as pull does", async () => {
    for (const [extra, named] of [
      [{ "diagrams/Context.meltemi": "x" }, "diagrams/context.meltemi"],
      [{ models: "a file" }, "models"],
    ] as const) {
      stub.projects.clear();
      const project = stub.addProject({
        name: "Architecture",
        files: { ...originalFiles(), ...extra },
      });
      const root = folder("unsafe-set", { host: stub.url, project: project.id });
      const { env } = home();
      const result = await mdg(root, ["review", "--base", "cloud", "--exit-code"], env);
      expect(result.code, named).toBe(1);
      expect(result.stderr, named).toContain("pull.unsafe-path");
      expect(result.stderr, named).toContain(named);
      expect(result.stdout, named).toBe("");
    }
  });

  it("names --project and push --create when the folder names no cloud project, before any request", async () => {
    const root = folder("no-cloud");
    const { env } = home();
    const result = await mdg(root, ["review", "--base", "cloud"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cloud.no-project");
    expect(result.stderr).toContain("--project <id>");
    expect(result.stderr).toContain('"meltemi-diagrams push --create"');
    expect(stub.requests).toHaveLength(0);
    // In Spanish too.
    const spanish = await mdg(root, ["review", "--base", "cloud", "--lang", "es"], env);
    expect(spanish.stderr).toContain("no nombra ningún proyecto de la nube");
  });

  it("takes the cloud project from --project when the manifest names none", async () => {
    const project = editedCloud();
    const root = folder("by-option");
    const { env } = home();
    const result = await mdg(root, ["review", "--base", "cloud", "--project", project.id], env);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('> element issuer → bank "Banco"');
    // --project wins over the manifest's.
    const other = stub.addProject({ name: "Other", files: originalFiles() });
    const named = folder("by-option-named", { host: stub.url, project: project.id });
    const overridden = await mdg(named, ["review", "--base", "cloud", "--project", other.id], env);
    expect(overridden.stdout).toBe("No changes.\n");
    const unknown = await mdg(
      root,
      ["review", "--base", "cloud", "--project", "a".repeat(20)],
      env,
    );
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("project.not-found");
    expect(unknown.stderr).toContain("a".repeat(20));
  });

  it("fails with cloud.host-mismatch, naming both hosts and --host, before any request", async () => {
    const root = folder("mismatch", { host: "https://evil.example", project: "a".repeat(20) });
    const { env } = home();
    const result = await mdg(root, ["review", "--base", "cloud"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cloud.host-mismatch");
    expect(result.stderr).toContain("https://evil.example");
    expect(result.stderr).toContain(stub.url);
    expect(result.stderr).toContain("--host");
    expect(stub.requests).toHaveLength(0);
    // The manifest's host is the one given: it is the host, and the token of that host is asked for.
    const given = await mdg(
      root,
      ["review", "--base", "cloud", "--host", "https://evil.example"],
      env,
    );
    expect(given.code).toBe(3);
    expect(given.stderr).toContain("cloud.not-signed-in");
    expect(stub.requests).toHaveLength(0);
  });

  it("exits with 3 and says to run login when nobody is signed in, and with 1 when the cloud cannot be reached", async () => {
    const project = editedCloud();
    const root = folder("signed-out", { host: stub.url, project: project.id });
    const { env } = home();
    const empty = {
      ...env,
      APPDATA: join(scratch, "nobody"),
      XDG_CONFIG_HOME: join(scratch, "nobody"),
    };
    const result = await mdg(root, ["review", "--base", "cloud"], empty);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('run "meltemi-diagrams login"');
    expect(stub.requests).toHaveLength(0);
    stub.fail(`GET /api/projects/${project.id}/files`, {
      status: 401,
      body: { code: "token.invalid", message: "No." },
    });
    const refused = await mdg(root, ["review", "--base", "cloud"], env);
    expect(refused.code).toBe(3);
    stub.fail(`GET /api/projects/${project.id}/files`, {
      status: 500,
      body: { code: "internal", message: "Broke." },
    });
    const broken = await mdg(root, ["review", "--base", "cloud"], env);
    expect(broken.code).toBe(1);
    expect(broken.stderr).toContain("internal: Broke.");
  });

  it("writes the review page and prints JSON as with a Git revision, with the cloud project named", async () => {
    const project = editedCloud();
    const root = folder("outputs", { host: stub.url, project: project.id });
    const { env } = home();
    const json = await mdg(root, ["review", "--base", "cloud:1", "--json"], env);
    expect(json.code).toBe(0);
    const parsed = JSON.parse(json.stdout) as {
      compared: string;
      files: { path: string; status: string }[];
      summary: { files: number };
    };
    expect(parsed.compared).toBe(
      `Compared version 1 of the cloud project ${project.id} with the working tree`,
    );
    expect(parsed.files.map((f) => `${f.status} ${f.path}`)).toEqual([
      "changed diagrams/containers.meltemi",
    ]);
    const out = join(scratch, "outputs-review");
    const written = await mdg(root, ["review", "--base", "cloud", "--out", out], env);
    expect(written.code, written.stderr).toBe(0);
    const page = readFileSync(join(out, "index.html"), "utf8");
    expect(page).toContain(`Compared the cloud project ${project.id} with the working tree`);
    expect(page).toContain('src="diagrams/purchase/purchase.before.svg"');
    expect(page).not.toContain(scratch);
    expect(existsSync(join(out, "diagrams", "purchase", "purchase.after.svg"))).toBe(true);
    // The language of the written report is the project's, and --lang the command's.
    const spanish = await mdg(root, ["review", "--base", "cloud:1", "--lang", "es"], env);
    expect(spanish.stdout).toContain("1 archivo cambió");
    const spanishJson = await mdg(
      root,
      ["review", "--base", "cloud:1", "--json", "--lang", "es"],
      env,
    );
    expect(JSON.parse(spanishJson.stdout).compared).toBe(
      `Comparación de la versión 1 del proyecto de la nube ${project.id} con el árbol de trabajo`,
    );
  });

  it("reviews a file of the project as well as its folder", async () => {
    const project = editedCloud();
    const root = folder("file", { host: stub.url, project: project.id });
    const { env } = home();
    const result = await mdg(
      root,
      ["review", join("diagrams", "purchase.meltemi"), "--base", "cloud"],
      env,
    );
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('> element issuer → bank "Banco"');
    expect(result.stdout).toMatch(/^1 file changed: /m);
  });

  it("shows no token anywhere: the cloud's text, a service message or the page", async () => {
    const files = originalFiles();
    files["diagrams/containers.meltemi"] = relabel(files["diagrams/containers.meltemi"]!).replace(
      '"Pedidos API"',
      '"Pedidos mdg_LeakedByTheCloud-123"',
    );
    const project = stub.addProject({ name: "Architecture", files });
    const root = folder("redacted", { host: stub.url, project: project.id });
    const { env, token } = home();
    const result = await mdg(root, ["review", "--base", "cloud"], env);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("mdg_…");
    expect(result.stdout).not.toContain("LeakedByTheCloud");
    const out = join(scratch, "redacted-review");
    const json = await mdg(root, ["review", "--base", "cloud", "--json", "--out", out], env);
    expect(json.stdout).not.toContain("LeakedByTheCloud");
    expect(readFileSync(join(out, "index.html"), "utf8")).not.toContain("LeakedByTheCloud");
    for (const output of [result, json]) {
      expect(output.stdout + output.stderr).not.toContain(token);
    }
    // And in an error.
    stub.fail(`GET /api/projects/${project.id}/files`, {
      status: 500,
      body: { code: "internal", message: "Broke for mdg_AnotherSecret_456." },
    });
    const failed = await mdg(root, ["review", "--base", "cloud"], env);
    expect(failed.stderr).toContain("internal: Broke for mdg_….");
    expect(failed.stderr).not.toContain("AnotherSecret");
  });

  it("uses a usage error for what --base cannot say, and for options that go with the cloud only", async () => {
    const project = editedCloud();
    const root = folder("usage", { host: stub.url, project: project.id });
    const { env } = home();
    const odd = await mdg(root, ["review", "--base", "cloud:x"], env);
    expect(odd.code).toBe(2);
    expect(odd.stderr).toContain("cloud:3");
    expect((await mdg(root, ["review", "--base", "cloud:"], env)).code).toBe(2);
    expect((await mdg(root, ["review", "--base", "cloud:1.5"], env)).code).toBe(2);
    const alone = await mdg(root, ["review", "--project", project.id], env);
    expect(alone.code).toBe(2);
    expect(alone.stderr).toContain("--base cloud");
    expect((await mdg(root, ["review", "--host", stub.url, "--before", root], env)).code).toBe(2);
    expect((await mdg(root, ["review", "--base", "cloud", "--before", root], env)).code).toBe(2);
    expect(stub.requests).toHaveLength(0);
    const help = await mdg(root, ["review", "--help"], env);
    expect(help.stdout).toContain("--base <revision>");
    expect(help.stdout).toContain("cloud:<n>");
    expect(help.stdout).toContain("--project <id>");
  });
});
