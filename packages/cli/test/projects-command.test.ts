import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { CredentialsStore } from "../src/credentials.js";
import { run } from "../src/index.js";
import { CloudStub } from "./cloud-stub.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-projects-"));
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
  return { env, token };
}

async function mdg(args: string[], env: Record<string, string>) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: scratch,
    env,
  });
  return { code, stdout, stderr };
}

describe("mdg projects", () => {
  it("lists the cloud projects with id, name, role and last change, as a table", async () => {
    const { env, token } = home();
    const purchase = stub.addProject({ id: "k4c2w7x5q3y6m2n5r7d4", name: "Purchase" });
    const shared = stub.addProject({
      id: "b2c3d4e5f6g7h2i3j4k5",
      name: "A shared architecture",
      role: "editor",
    });
    shared.updatedAt = "2026-10-14T08:00:05.500Z";
    stub.addProject({ id: "m2n3p4q5r6s7t2u3v4w5", name: "Read only", role: "viewer" });
    const result = await mdg(["projects"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.split("\n")).toEqual([
      "ID                    NAME                   ROLE    LAST CHANGE",
      "k4c2w7x5q3y6m2n5r7d4  Purchase               owner   2026-10-15T09:41:02Z",
      "b2c3d4e5f6g7h2i3j4k5  A shared architecture  editor  2026-10-14T08:00:05Z",
      "m2n3p4q5r6s7t2u3v4w5  Read only              viewer  2026-10-15T09:41:02Z",
      "",
    ]);
    expect(purchase.id).toBe("k4c2w7x5q3y6m2n5r7d4");
    // One request, with the token, to the host.
    expect(stub.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /api/projects"]);
    expect(stub.requests[0]!.headers.authorization).toBe(`Bearer ${token}`);
    expect(result.stdout).not.toContain(token);
  });

  it("prints one JSON object with stable field names", async () => {
    const { env } = home();
    stub.addProject({ id: "k4c2w7x5q3y6m2n5r7d4", name: "Purchase", description: "The reference" });
    stub.addProject({ id: "b2c3d4e5f6g7h2i3j4k5", name: "Shared", role: "viewer" });
    const result = await mdg(["projects", "--json"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      host: stub.url,
      projects: [
        {
          id: "k4c2w7x5q3y6m2n5r7d4",
          name: "Purchase",
          description: "The reference",
          role: "owner",
          updated_at: "2026-10-15T09:41:02.118Z",
        },
        {
          id: "b2c3d4e5f6g7h2i3j4k5",
          name: "Shared",
          description: "",
          role: "viewer",
          updated_at: "2026-10-15T09:41:02.118Z",
        },
      ],
    });
    // Nothing but the document; the field names are the service's own, not the interface language's.
    const spanish = await mdg(["projects", "--json", "--lang", "es"], env);
    expect(JSON.parse(spanish.stdout).projects[1].role).toBe("viewer");
    expect(Object.keys(JSON.parse(spanish.stdout).projects[0])).toEqual([
      "id",
      "name",
      "description",
      "role",
      "updated_at",
    ]);
  });

  it("says there are none, and prints an empty list for JSON", async () => {
    const { env } = home();
    const none = await mdg(["projects"], env);
    expect(none.code).toBe(0);
    expect(none.stdout).toBe(
      'You have no cloud projects yet; make one with "meltemi-diagrams push --create".\n',
    );
    expect(JSON.parse((await mdg(["projects", "--json"], env)).stdout)).toEqual({
      host: stub.url,
      projects: [],
    });
    const spanish = await mdg(["projects", "--lang", "es"], env);
    expect(spanish.stdout).toBe(
      'Todavía no tienes proyectos en la nube; crea uno con "meltemi-diagrams push --create".\n',
    );
  });

  it("writes the table in Spanish, with the roles in words", async () => {
    const { env } = home();
    stub.addProject({ id: "k4c2w7x5q3y6m2n5r7d4", name: "Compra" });
    stub.addProject({ id: "b2c3d4e5f6g7h2i3j4k5", name: "Compartido", role: "viewer" });
    const result = await mdg(["projects", "--lang", "es"], env);
    expect(result.stdout.split("\n")).toEqual([
      "ID                    NOMBRE      ROL          ÚLTIMO CAMBIO",
      "k4c2w7x5q3y6m2n5r7d4  Compra      propietario  2026-10-15T09:41:02Z",
      "b2c3d4e5f6g7h2i3j4k5  Compartido  lector       2026-10-15T09:41:02Z",
      "",
    ]);
  });

  it("prints a name that holds a control character with spaces, so a project cannot write to the terminal", async () => {
    const { env } = home();
    stub.addProject({ id: "k4c2w7x5q3y6m2n5r7d4", name: "Evil\u001b[2J\u0007name\u0085x" });
    const result = await mdg(["projects"], env);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Evil [2J name x");
    // eslint-disable-next-line no-control-regex
    expect(result.stdout).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
  });

  it("shows no token in what the service sends back", async () => {
    const { env } = home();
    stub.addProject({ id: "k4c2w7x5q3y6m2n5r7d4", name: "Key mdg_LeakedByTheService-123" });
    const table = await mdg(["projects"], env);
    expect(table.stdout).toContain("Key mdg_…");
    expect(table.stdout).not.toContain("LeakedByTheService");
    expect((await mdg(["projects", "--json"], env)).stdout).not.toContain("LeakedByTheService");
  });

  it("exits with 3 and says to run login when nobody is signed in or the token is refused", async () => {
    const { env } = home();
    const empty = {
      ...env,
      APPDATA: join(scratch, "nobody"),
      XDG_CONFIG_HOME: join(scratch, "nobody"),
    };
    const result = await mdg(["projects"], empty);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('run "meltemi-diagrams login"');
    expect(stub.requests).toHaveLength(0);
    stub.fail("GET /api/projects", {
      status: 401,
      body: { code: "token.invalid", message: "No." },
    });
    expect((await mdg(["projects"], env)).code).toBe(3);
  });

  it("exits with 1 when the service fails, and refuses plain http to a remote host", async () => {
    const { env } = home();
    stub.fail("GET /api/projects", { status: 500, body: { code: "internal", message: "Broke." } });
    const broken = await mdg(["projects"], env);
    expect(broken.code).toBe(1);
    expect(broken.stderr).toContain("internal: Broke.");
    const insecure = await mdg(["projects", "--host", "http://diagrams.example"], env);
    expect(insecure.code).toBe(1);
    expect(insecure.stderr).toContain("cloud.insecure-host");
  });

  it("takes the host from --host, and sends the token only there", async () => {
    const { env } = home({ MELTEMI_HOST: "" });
    const result = await mdg(["projects", "--host", stub.url, "--json"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).host).toBe(stub.url);
    const other = new CloudStub();
    await other.start();
    try {
      const refused = await mdg(["projects", "--host", other.url], env);
      expect(refused.code).toBe(3);
      expect(other.requests).toHaveLength(0);
    } finally {
      await other.stop();
    }
  });

  it("takes only --json and --host, and has its help", async () => {
    const { env } = home();
    for (const args of [
      ["projects", "now"],
      ["projects", "--sort"],
      ["projects", "--project", "x"],
    ]) {
      const result = await mdg(args, env);
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.stderr).toContain("Usage: projects");
    }
    expect(stub.requests).toHaveLength(0);
    const help = await mdg(["projects", "--help"], env);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: projects [options]");
    expect(help.stdout).toContain("updated_at");
    expect((await mdg(["projects", "--help", "--lang", "es"], env)).stdout).toContain(
      "Uso: projects [opciones]",
    );
  });
});
