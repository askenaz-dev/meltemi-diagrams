import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { CredentialsStore } from "../src/credentials.js";
import { run } from "../src/index.js";
import { createPublishCommand, oversize, slugOf } from "../src/publish-command.js";
import type { CloudCommand } from "../src/cloud-context.js";
import { CloudStub, projectId, type StubProject } from "./cloud-stub.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-publish-"));
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
  stub.account.handle = null;
  stub.takenHandles.clear();
  stub.tokensMayChooseHandle = true;
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

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  /** The questions that were asked. */
  readonly asked: string[];
}

/** Runs the command line; `answers` are what a person at a terminal types (none: no terminal). */
async function mdg(
  cwd: string,
  args: string[],
  env: Record<string, string>,
  answers?: string[],
): Promise<Run> {
  let stdout = "";
  let stderr = "";
  const asked: string[] = [];
  const queue = [...(answers ?? [])];
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
    env,
    ...(answers === undefined
      ? {}
      : {
          ask: async (question: string) => {
            asked.push(question);
            return queue.shift() ?? "";
          },
        }),
  });
  return { code, stdout, stderr, asked };
}

const FLOW =
  'language "0.2"\n\ndiagram overview: flow {\n  web["Web"]\n  api["API"]\n  web -> api\n}\n';

interface Fixture {
  readonly root: string;
  readonly id: string;
  readonly project: StubProject;
}

/**
 * A project folder whose manifest names a cloud project, and the cloud project holding the same
 * files: what `push` finds nothing to change in. `files` are the folder's other texts.
 */
function fixture(
  name: string,
  options: {
    files?: Record<string, string>;
    cloud?: boolean;
    manifest?: Record<string, unknown>;
  } = {},
): Fixture {
  const root = join(scratch, name);
  mkdirSync(join(root, "diagrams"), { recursive: true });
  const id = projectId();
  const manifest = {
    name: "Shop architecture",
    language: "0.2",
    ...(options.cloud === false ? {} : { cloud: { host: stub.url, project: id } }),
    ...options.manifest,
  };
  const files: Record<string, string> = {
    "project.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "diagrams/overview.meltemi": FLOW,
    ...options.files,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, ...path.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(root, ...path.split("/")), text);
  }
  const project = stub.addProject({ id, name: "Shop architecture", files });
  return { root, id, project };
}

/** The requests the stub saw, as `METHOD path` with the project's id left out. */
function seen(id: string): string[] {
  return stub.requests.map((r) => `${r.method} ${r.path.replace(id, "<id>")}`);
}

const publishes = (id: string) => stub.to(`/api/projects/${id}/publish`, "PUT");

describe("mdg publish", () => {
  it("publishes the first time with --handle: the handle is set, the catalog sent, the address ends with /ana/purchase/", async () => {
    const { root, id, project } = fixture("first");
    const { env, token } = home();
    const result = await mdg(root, ["publish", "--slug", "purchase", "--handle", "ana"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(stub.account.handle).toBe("ana");
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines.at(-1)).toBe(`${stub.url}/_published/ana/purchase/`);
    expect(lines.at(-1)).toMatch(/\/ana\/purchase\/$/);
    expect(result.stdout).toContain("Handle set: ana");
    expect(result.stdout).toMatch(/^Published 1 diagram, 0 stories \(\d+ KB\)\.$/m);
    expect(project.publications.has("purchase")).toBe(true);
    expect(result.stderr).toBe("");
    // The owner's state first, then the handle, the push's comparison, and the page.
    expect(seen(id)).toEqual([
      "GET /api/projects/<id>/publish",
      "PATCH /api/account",
      "GET /api/projects/<id>/files",
      "PUT /api/projects/<id>/publish",
    ]);
    expect(JSON.parse(stub.to("/api/account", "PATCH")[0]!.body.toString())).toEqual({
      handle: "ana",
    });
    expect(stub.requests.every((r) => r.headers.authorization === `Bearer ${token}`)).toBe(true);
  }, 60_000);

  it("sends exactly the catalog that build catalog writes", async () => {
    const { root, id, project } = fixture("exact");
    const { env } = home();
    stub.account.handle = "ana";
    const built = join(scratch, "exact-built.html");
    const build = await mdg(root, ["build", "catalog", ".", "--out", built], env);
    expect(build.code, build.stderr).toBe(0);
    const result = await mdg(root, ["publish", "--slug", "shop"], env);
    expect(result.code, result.stderr).toBe(0);
    const sent = JSON.parse(publishes(id)[0]!.body.toString()) as { slug: string; html: string };
    expect(sent.slug).toBe("shop");
    expect(sent.html).toBe(readFileSync(built, "utf8"));
    expect(project.publications.get("shop")!.html).toBe(sent.html);
    // The language of the page is --lang's, as for build catalog.
    const builtEs = join(scratch, "exact-built-es.html");
    await mdg(root, ["build", "catalog", ".", "--out", builtEs, "--lang", "es"], env);
    const spanish = await mdg(root, ["publish", "--slug", "shop", "--lang", "es"], env);
    expect(spanish.code, spanish.stderr).toBe(0);
    expect(spanish.stdout).toMatch(/^Publicado: 1 diagrama, 0 historias \(\d+ KB\)\.$/m);
    expect(JSON.parse(publishes(id)[1]!.body.toString()).html).toBe(readFileSync(builtEs, "utf8"));
    expect(JSON.parse(publishes(id)[1]!.body.toString()).html).not.toBe(sent.html);
  }, 60_000);

  it("takes the slug from the project's name, simplified, when --slug is not given", async () => {
    const { root, id } = fixture("slug", { manifest: { name: "Árbol de pedidos · v2" } });
    const { env } = home();
    stub.account.handle = "ana";
    const result = await mdg(root, ["publish"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(publishes(id)[0]!.body.toString()).slug).toBe("arbol-de-pedidos-v2");
    expect(result.stdout.trimEnd().split("\n").at(-1)).toBe(
      `${stub.url}/_published/ana/arbol-de-pedidos-v2/`,
    );
  }, 60_000);

  it("makes a page name of any text: ASCII, hyphens, 60 characters at most, never empty", () => {
    expect(slugOf("Shop architecture")).toBe("shop-architecture");
    expect(slugOf("Árbol de pedidos · v2")).toBe("arbol-de-pedidos-v2");
    expect(slugOf("  --Already-hyphenated--  ")).toBe("already-hyphenated");
    expect(slugOf("日本語")).toBe("diagrams");
    expect(slugOf("")).toBe("diagrams");
    expect(slugOf("x".repeat(100))).toBe("x".repeat(60));
    expect(slugOf(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
    for (const text of ["A/B\\C", "a.b.c", "A_B", "x y"]) {
      expect(slugOf(text)).toMatch(/^[a-z0-9-]{1,60}$/);
    }
  });

  it("asks for the handle on a terminal the first time, and shows a wrong answer", async () => {
    const { root, id } = fixture("asked");
    const { env } = home();
    const result = await mdg(root, ["publish", "--slug", "p"], env, ["Ana!", "ana"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.asked).toHaveLength(2);
    expect(result.asked[0]).toContain("Choose your handle");
    expect(result.stderr).toContain("Ana! is not a handle");
    expect(stub.account.handle).toBe("ana");
    expect(seen(id)).toContain("PATCH /api/account");
    // In Spanish.
    stub.account.handle = null;
    stub.projects.get(id)!.publications.clear();
    const spanish = await mdg(root, ["publish", "--slug", "p", "--lang", "es"], env, ["ana"]);
    expect(spanish.asked[0]).toContain("Elige tu handle");
    expect(spanish.stdout).toContain("Handle elegido: ana");
  }, 60_000);

  it("fails with handle.required, before anything is built or pushed, when there is no handle, no --handle and no terminal", async () => {
    const { root, id } = fixture("no-handle");
    const { env } = home();
    const result = await mdg(root, ["publish", "--slug", "p"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("handle.required");
    expect(result.stderr).toContain("--handle <name>");
    expect(stub.account.handle).toBeNull();
    expect(seen(id)).toEqual(["GET /api/projects/<id>/publish"]);
    // An empty answer on a terminal, and answers that are never right, are the same.
    expect((await mdg(root, ["publish", "--slug", "p"], env, [""])).code).toBe(1);
    const wrong = await mdg(root, ["publish", "--slug", "p"], env, ["a", "B", "no spaces"]);
    expect(wrong.code).toBe(1);
    expect(wrong.asked).toHaveLength(3);
    expect(wrong.stderr).toContain("handle.required");
    expect(stub.to(/\/publish$/, "PUT")).toHaveLength(0);
  }, 60_000);

  it("prints that the handle is taken and exits with 1, publishing nothing", async () => {
    const { root, id, project } = fixture("taken");
    const { env } = home();
    stub.takenHandles.add("ana");
    const result = await mdg(root, ["publish", "--slug", "p", "--handle", "ana"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("handle.taken");
    expect(result.stderr).toContain("the handle ana is taken");
    expect(stub.account.handle).toBeNull();
    expect(project.publications.size).toBe(0);
    expect(seen(id)).toEqual(["GET /api/projects/<id>/publish", "PATCH /api/account"]);
    const spanish = await mdg(
      root,
      ["publish", "--slug", "p", "--handle", "ana", "--lang", "es"],
      env,
    );
    expect(spanish.stderr).toContain("el handle ana lo tiene otra cuenta");
  }, 60_000);

  it("says the handle is locked while pages are published under the one the account has", async () => {
    const { root, id, project } = fixture("locked");
    const { env } = home();
    stub.account.handle = "ana";
    project.publications.set("old", { html: "<p>", publishedAt: "2026-10-01T00:00:00.000Z" });
    const result = await mdg(root, ["publish", "--slug", "p", "--handle", "bob"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("handle.locked");
    expect(result.stderr).toContain("your handle is ana");
    expect(result.stderr).toContain("--unpublish");
    expect(stub.account.handle).toBe("ana");
    expect(publishes(id)).toHaveLength(0);
  }, 60_000);

  it("does not ask the service to set the handle the account already has", async () => {
    const { root, id } = fixture("same-handle");
    const { env } = home();
    stub.account.handle = "ana";
    stub.tokensMayChooseHandle = false;
    // With --handle equal to the account's, and with none: no PATCH, which a token could not make.
    for (const args of [["--handle", "ana"], []]) {
      const result = await mdg(root, ["publish", "--slug", "p", ...args], env);
      expect(result.code, result.stderr).toBe(0);
    }
    expect(seen(id)).not.toContain("PATCH /api/account");
    expect(publishes(id)).toHaveLength(2);
  }, 60_000);

  it("tells a person whose token the service refuses to choose the handle in the page", async () => {
    const { root, id, project } = fixture("forbidden");
    const { env } = home();
    stub.tokensMayChooseHandle = false;
    const result = await mdg(root, ["publish", "--slug", "p", "--handle", "ana"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("publish.handle-in-page");
    expect(result.stderr).toContain("does not let an API token choose the handle ana");
    expect(result.stderr).toContain("choose it in the page");
    expect(stub.account.handle).toBeNull();
    expect(project.publications.size).toBe(0);
    // Nothing was pushed or published on the way.
    expect(seen(id)).toEqual(["GET /api/projects/<id>/publish", "PATCH /api/account"]);
    const spanish = await mdg(
      root,
      ["publish", "--slug", "p", "--handle", "ana", "--lang", "es"],
      env,
    );
    expect(spanish.stderr).toContain("elígelo en la página");
  }, 60_000);

  it("pushes the folder first when it differs, with the same question as push", async () => {
    const { root, id, project } = fixture("differs");
    const { env } = home();
    stub.account.handle = "ana";
    // The cloud was edited in the page: its copy of the diagram is not the folder's.
    project.files.set("diagrams/overview.meltemi", FLOW.replace('"API"', '"Gateway"'));

    // No terminal and no --force: push refuses, and nothing is published.
    const refused = await mdg(root, ["publish", "--slug", "p"], env);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("push.differs");
    expect(publishes(id)).toHaveLength(0);
    expect(project.files.get("diagrams/overview.meltemi")).toContain("Gateway");

    // A terminal that says no.
    const declined = await mdg(root, ["publish", "--slug", "p"], env, ["n"]);
    expect(declined.code).toBe(1);
    expect(declined.asked).toEqual(["Overwrite these changes in the cloud? [y/N] "]);
    expect(declined.stderr).toContain("push.declined");
    expect(publishes(id)).toHaveLength(0);

    // A terminal that says yes: pushed, then published.
    const accepted = await mdg(root, ["publish", "--slug", "p"], env, ["y"]);
    expect(accepted.code, accepted.stderr).toBe(0);
    expect(project.files.get("diagrams/overview.meltemi")).toBe(FLOW);
    expect(publishes(id)).toHaveLength(1);
    const order = seen(id);
    expect(order.lastIndexOf("PUT /api/projects/<id>/files")).toBeLessThan(
      order.lastIndexOf("PUT /api/projects/<id>/publish"),
    );

    // --force answers it, as in CI.
    project.files.set("diagrams/overview.meltemi", 'language "0.2"\n');
    const forced = await mdg(root, ["publish", "--slug", "p", "--force"], env);
    expect(forced.code, forced.stderr).toBe(0);
    expect(forced.asked).toEqual([]);
    expect(project.files.get("diagrams/overview.meltemi")).toBe(FLOW);
  }, 120_000);

  it("pushes nothing when the cloud project is what the folder holds", async () => {
    const { root, id } = fixture("identical");
    const { env } = home();
    stub.account.handle = "ana";
    const result = await mdg(root, ["publish", "--slug", "p"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(seen(id)).not.toContain("PUT /api/projects/<id>/files");
    expect(result.stdout).toContain("already matches the folder; nothing to push");
  }, 60_000);

  it("removes a publication with --unpublish, building and pushing nothing", async () => {
    const { root, id, project } = fixture("unpublish");
    const { env } = home();
    stub.account.handle = "ana";
    expect((await mdg(root, ["publish", "--slug", "p"], env)).code).toBe(0);
    stub.requests.length = 0;
    const result = await mdg(root, ["publish", "--unpublish", "--slug", "p"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe("Unpublished p.\n");
    expect(project.publications.size).toBe(0);
    expect(seen(id)).toEqual(["DELETE /api/projects/<id>/publish/p"]);
    // Again: the project publishes nothing under that name.
    const again = await mdg(root, ["publish", "--unpublish", "--slug", "p"], env);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("publish.not-published");
    expect(again.stderr).toContain("publishes nothing under p");
    // The page name defaults as it does for publishing.
    project.publications.set("shop-architecture", { html: "<p>", publishedAt: "x" });
    const byName = await mdg(root, ["publish", "--unpublish"], env, []);
    expect(byName.code, byName.stderr).toBe(0);
    expect(project.publications.size).toBe(0);
    // It takes no handle and builds nothing: only usage.
    for (const option of [["--handle", "ana"], ["--force"], ["--strict"]]) {
      const usage = await mdg(root, ["publish", "--unpublish", ...option], env);
      expect(usage.code).toBe(2);
      expect(usage.stderr).toContain("Usage: publish");
    }
  }, 60_000);

  it("prints the service's refusals with exit code 1: publish.taken, publish.rate, publish.too-large", async () => {
    const { root, id } = fixture("refusals");
    const { env } = home();
    stub.account.handle = "ana";

    // Another project of the person publishes the name.
    const other = stub.addProject({ name: "Other" });
    other.publications.set("p", { html: "<p>", publishedAt: "x" });
    const taken = await mdg(root, ["publish", "--slug", "p"], env);
    expect(taken.code).toBe(1);
    expect(taken.stderr).toContain("publish.taken");
    expect(taken.stderr).toContain("already publishes p");
    other.publications.clear();

    // Ten publications in an hour: Retry-After is printed.
    stub.fail(`PUT /api/projects/${id}/publish`, {
      status: 429,
      body: { code: "publish.rate", message: "Slow down." },
      headers: { "Retry-After": "1800" },
    });
    const rate = await mdg(root, ["publish", "--slug", "p"], env);
    expect(rate.code).toBe(1);
    expect(rate.stderr).toContain("publish.rate");
    expect(rate.stderr).toContain("try again in 1800 seconds");
    stub.fail(`PUT /api/projects/${id}/publish`, {
      status: 429,
      body: { code: "publish.rate", message: "Slow down." },
      headers: { "Retry-After": "90" },
    });
    expect((await mdg(root, ["publish", "--slug", "p", "--lang", "es"], env)).stderr).toContain(
      "inténtalo de nuevo dentro de 90 segundos",
    );

    // The service's own refusal for a page that is too large, with the size we know.
    stub.fail(`PUT /api/projects/${id}/publish`, {
      status: 413,
      body: { code: "publish.too-large", message: "Too large." },
    });
    const large = await mdg(root, ["publish", "--slug", "p"], env);
    expect(large.code).toBe(1);
    expect(large.stderr).toContain("publish.too-large");
    expect(large.stderr).toMatch(/the catalog \(\d+ KB\) is larger than the 16 MiB a page may be/);

    // And invalid names never leave the machine.
    stub.requests.length = 0;
    expect((await mdg(root, ["publish", "--slug", "Not Valid"], env)).code).toBe(2);
    expect(stub.requests).toHaveLength(0);
  }, 120_000);

  it("refuses a page over 16 MiB, or a request over 24 MiB, before sending anything", () => {
    expect(oversize("p", "x".repeat(1024))).toBeUndefined();
    expect(oversize("p", "x".repeat(16 * 1024 * 1024))).toBeUndefined();
    expect(oversize("p", "x".repeat(16 * 1024 * 1024 + 1))).toBe(16 * 1024 * 1024 + 1);
    // 14 MiB of quotes is under the page's limit, and over the request's once JSON escapes them.
    const quotes = '"'.repeat(14 * 1024 * 1024);
    expect(oversize("p", quotes)).toBeGreaterThan(24 * 1024 * 1024);
    expect(oversize("p", '"'.repeat(11 * 1024 * 1024))).toBeUndefined();
    // Characters of more bytes are not escaped: 5 M of two-byte letters fit.
    expect(oversize("p", "é".repeat(5 * 1024 * 1024))).toBeUndefined();
  });

  it("stops at access.denied before building anything when the person is not the owner", async () => {
    const { root, id, project } = fixture("editor");
    const { env } = home();
    stub.account.handle = "ana";
    project.role = "editor";
    const result = await mdg(root, ["publish", "--slug", "p"], env);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("access.denied");
    expect(result.stderr).toContain("publishing, sharing, renaming and deleting are the owner's");
    expect(seen(id)).toEqual(["GET /api/projects/<id>/publish"]);
    const gone = await mdg(root, ["publish", "--unpublish", "--slug", "p"], env);
    expect(gone.code).toBe(1);
    expect(gone.stderr).toContain("access.denied");
  }, 60_000);

  it("names a cloud project that does not exist, and a folder that names none", async () => {
    const { root } = fixture("ghost");
    const { env } = home();
    const ghost = await mdg(root, ["publish", "--slug", "p", "--project", "a".repeat(20)], env);
    expect(ghost.code).toBe(1);
    expect(ghost.stderr).toContain("project.not-found");
    expect(ghost.stderr).toContain(`the cloud project ${"a".repeat(20)} does not exist`);

    const bare = fixture("bare", { cloud: false });
    stub.requests.length = 0;
    const none = await mdg(bare.root, ["publish", "--slug", "p"], env);
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("cloud.no-project");
    expect(none.stderr).toContain("--project <id>");
    expect(none.stderr).toContain("push --create");
    expect(stub.requests).toHaveLength(0);
    // --project names it, as for push.
    stub.account.handle = "ana";
    const named = await mdg(
      bare.root,
      ["publish", "--slug", "p", "--project", bare.id, "--force"],
      env,
    );
    expect(named.code, named.stderr).toBe(0);
  }, 60_000);

  it("exits with 3 when nobody is signed in or the token is refused, and with 1 on cloud.host-mismatch, before any request", async () => {
    const { root, id } = fixture("auth");
    const { env, store } = home();
    const empty = {
      ...env,
      APPDATA: join(scratch, "nobody"),
      XDG_CONFIG_HOME: join(scratch, "nobody"),
    };
    const signedOut = await mdg(root, ["publish", "--slug", "p"], empty);
    expect(signedOut.code).toBe(3);
    expect(signedOut.stderr).toContain('run "meltemi-diagrams login"');
    expect(stub.requests).toHaveLength(0);

    stub.fail(`GET /api/projects/${id}/publish`, {
      status: 401,
      body: { code: "token.invalid", message: "No." },
    });
    expect((await mdg(root, ["publish", "--slug", "p"], env)).code).toBe(3);
    expect(store.entry(stub.url)).toBeDefined();

    const elsewhere = fixture("elsewhere", {
      manifest: { cloud: { host: "https://evil.example", project: id } },
    });
    stub.requests.length = 0;
    const mismatch = await mdg(elsewhere.root, ["publish", "--slug", "p"], env);
    expect(mismatch.code).toBe(1);
    expect(mismatch.stderr).toContain("cloud.host-mismatch");
    expect(mismatch.stderr).toContain("https://evil.example");
    expect(mismatch.stderr).toContain("--host");
    expect(stub.requests).toHaveLength(0);
  }, 60_000);

  it("publishes nothing from a project with nothing to catalog, and with errors under --strict", async () => {
    const empty = fixture("empty", { files: {} });
    rmSync(join(empty.root, "diagrams", "overview.meltemi"), { force: true });
    const { env } = home();
    stub.account.handle = "ana";
    const nothing = await mdg(empty.root, ["publish", "--slug", "p", "--force"], env);
    expect(nothing.code).toBe(1);
    expect(nothing.stderr).toContain("publish.empty");
    expect(stub.to(/\/publish$/, "PUT")).toHaveLength(0);
    expect(stub.to(/\/files$/, "PUT")).toHaveLength(0);

    const broken = fixture("broken", {
      files: {
        "diagrams/bad.meltemi":
          'language "0.2"\n\ndiagram broken: flow {\n  api["API"]\n  placement {\n    place gateway at (10, 20)\n  }\n}\n',
      },
    });
    stub.requests.length = 0;
    const strict = await mdg(broken.root, ["publish", "--slug", "p", "--strict"], env);
    expect(strict.code).toBe(1);
    expect(strict.stdout).toContain("diagrams/bad.meltemi:6:11: error ref.unknown-element");
    expect(strict.stderr).toContain("publish.errors");
    expect(strict.stderr).toContain("nothing was pushed or published");
    expect(stub.to(/\/publish$/, "PUT")).toHaveLength(0);
    // Not strict: the diagnostics are printed, the diagram that has errors is left out, and the rest goes.
    const lenient = await mdg(broken.root, ["publish", "--slug", "p", "--force"], env);
    expect(lenient.code, lenient.stderr).toBe(0);
    expect(lenient.stdout).toContain("error ref.unknown-element");
    expect(lenient.stderr).toContain("skipped diagrams/bad.meltemi#broken");
    expect(lenient.stdout).toMatch(/^Published 1 diagram, /m);
  }, 120_000);

  it("shows no token in anything it prints", async () => {
    const { root, id } = fixture("redacted");
    const { env, token } = home();
    stub.account.handle = "ana";
    stub.fail(`GET /api/projects/${id}/publish`, {
      status: 500,
      body: { code: "internal", message: "Broke for mdg_LeakedByTheService-123." },
    });
    const failed = await mdg(root, ["publish", "--slug", "p"], env);
    expect(failed.stderr).toContain("internal: Broke for mdg_….");
    expect(failed.stderr).not.toContain("LeakedByTheService");
    const ok = await mdg(root, ["publish", "--slug", "p"], env);
    expect(ok.code, ok.stderr).toBe(0);
    for (const output of [failed, ok]) expect(output.stdout + output.stderr).not.toContain(token);
  }, 60_000);

  it("is listed by --help beside projects, in both languages, and refuses what it does not take", async () => {
    const { root } = fixture("usage");
    const { env } = home();
    const english = await mdg(root, ["--help"], env);
    expect(english.stdout).toMatch(
      /^ {2}publish \[folder\] {2,}Publish the catalog as a web page/m,
    );
    expect(english.stdout).toMatch(/^ {2}projects {2,}List your cloud projects/m);
    expect(english.stdout).toContain("Options for publish:");
    expect(english.stdout).toContain("--unpublish");
    const spanish = await mdg(root, ["--help", "--lang", "es"], env);
    expect(spanish.stdout).toMatch(
      /^ {2}publish \[carpeta\] {2,}Publicar el catálogo como una página web/m,
    );
    expect(spanish.stdout).toMatch(/^ {2}projects {2,}Listar tus proyectos de la nube/m);
    expect(spanish.stdout).toContain("Opciones de publish:");

    const help = await mdg(root, ["publish", "--help"], env);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: publish [folder] [options]");
    expect((await mdg(root, ["publish", "--help", "--lang", "es"], env)).stdout).toContain(
      "Uso: publish [carpeta] [opciones]",
    );
    for (const args of [
      ["publish", "--sync"],
      ["publish", "a", "b"],
      ["publish", "--handle", "ab"],
      ["publish", "--handle", "Ana"],
      ["publish", "--slug", ""],
      ["publish", "--slug", "x".repeat(61)],
      ["publish", "--slug"],
    ]) {
      const result = await mdg(root, args, env);
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.stderr).toContain("Usage: publish");
    }
    const missing = await mdg(root, ["publish", "nowhere"], env);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("path not found: nowhere");
    expect(stub.requests).toHaveLength(0);
  }, 60_000);
});

describe("publish with the step that pushes given", () => {
  it("runs the step with the folder, the project, the host and the flags, after the handle, and stops on its failure", async () => {
    const { root, id } = fixture("step");
    const { env } = home();
    stub.account.handle = "ana";
    const calls: string[][] = [];
    let result = 0;
    const step: CloudCommand = async (args) => {
      calls.push([...args]);
      return result;
    };
    const publish = createPublishCommand(step);
    const context = {
      name: "meltemi-diagrams",
      command: "publish",
      stdout: () => undefined,
      stderr: () => undefined,
      cwd: root,
      display: (p: string) => p,
      env,
      toolVersion: "1.7.0",
      hooks: {},
      credentials: new CredentialsStore({ env }),
      used: {},
    };
    expect(await publish(["--slug", "p", "--force", "--strict"], context)).toBe(0);
    expect(calls).toEqual([[".", "--project", id, "--host", stub.url, "--force", "--strict"]]);
    expect(publishes(id)).toHaveLength(1);
    // Its exit code is the command's, and nothing is published.
    result = 1;
    stub.requests.length = 0;
    expect(await publish(["--slug", "q", "sub"], context)).toBe(2);
    expect(await publish(["--slug", "q"], context)).toBe(1);
    expect(calls.at(-1)).toEqual([".", "--project", id, "--host", stub.url]);
    expect(publishes(id)).toHaveLength(0);
  }, 60_000);
});

describe("the command table", () => {
  it("has publish and projects beside the others", async () => {
    const { CLOUD_COMMAND_NAMES } = await import("../src/cloud-command.js");
    expect(CLOUD_COMMAND_NAMES).toEqual(expect.arrayContaining(["publish", "projects"]));
  });
});
