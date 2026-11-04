import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { catalogScript } from "@meltemi/diagrams-catalog/node";
import { ProjectSessions } from "@meltemi/diagrams-editor/node";
import { toProjectPath } from "@meltemi/diagrams-project";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { CLI_VERSION, run } from "../src/index.js";
import { startPreview, type PreviewServer } from "../src/preview.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-preview-"));
const servers: PreviewServer[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
  rmSync(scratch, { recursive: true, force: true });
});

function get(url: string, host?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: host ? { Host: host } : {} }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** The first `count` events of the preview's stream. */
function events(url: string, count: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        text += chunk;
        if ((text.match(/event: reload/g) ?? []).length >= count) {
          req.destroy();
          resolve(text);
        }
      });
    });
    req.on("error", (error) => (error.message.includes("aborted") ? undefined : reject(error)));
    req.end();
  });
}

async function preview(target: string, isFolder: boolean): Promise<PreviewServer> {
  const server = await startPreview({
    target: toProjectPath(target),
    isFolder,
    port: 0,
    projects: () => new ProjectSessions({ toolVersion: CLI_VERSION }),
    generator: `Meltemi Diagrams ${CLI_VERSION}`,
    script: catalogScript,
    report: () => undefined,
  });
  servers.push(server);
  return server;
}

describe("preview", () => {
  const project = join(scratch, "architecture");
  cpSync(join(CORPUS_ROOT, "projects", "valid", "architecture"), project, { recursive: true });

  it("serves the catalog with live reload on this machine only", async () => {
    const server = await preview(project, true);
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await get(server.url);
    expect(page.status).toBe(200);
    expect(page.body).toContain("connect-src 'self'");
    expect(page.body).toContain('new EventSource("/events")');
    expect((await get(`${server.url}missing`)).status).toBe(404);
    expect((await get(server.url, "attacker.example")).status).toBe(403);
  });

  it("builds again when a source changes and tells open pages to reload", async () => {
    const server = await preview(project, true);
    const base = server.url;
    const stream = events(`${base}events`, 1);
    await new Promise((r) => setTimeout(r, 300));
    const file = join(project, "diagrams", "context.meltemi");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace("level context", 'level context\n  title "Shop context"'),
    );
    expect(await stream).toContain("event: reload\ndata: 2\n");
    expect(server.builds).toBe(2);
    expect((await get(base)).body).toContain("Shop context");
  }, 30_000);

  it("opens a file on its first diagram", async () => {
    const server = await preview(join(project, "diagrams", "purchase.meltemi"), false);
    expect(server.url).toMatch(/\/#\/diagram\/diagrams\/purchase\/purchase$/);
  });

  it("refuses usage errors before serving", () => {
    const io = { stdout: () => undefined, stderr: () => undefined, cwd: scratch };
    expect(run(["preview", "missing"], io)).toBe(2);
    expect(run(["preview", "--port", "http"], io)).toBe(2);
    expect(run(["preview", "a", "b"], io)).toBe(2);
    let help = "";
    run(["preview", "--help"], { ...io, stdout: (t) => (help += t) });
    expect(help).toContain("Usage: preview [path]");
  });
});
