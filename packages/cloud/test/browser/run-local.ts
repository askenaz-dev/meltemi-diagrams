/** Real local-runtime acceptance. The caller owns startup/storage; this run touches only its own project. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { request as rawHttpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CATALOGUE } from "../../../mcp/src/catalogue/index.js";
import { chromium, type Browser, type Page } from "playwright-core";
import { browserPath } from "../../../vscode/scripts/browser.mjs";

const origin = process.env["MELTEMI_TEST_ORIGIN"] ?? "http://127.0.0.1:8879";
assert.equal(new URL(origin).hostname, "127.0.0.1", "Acceptance runs only on host loopback");
const output = fileURLToPath(new URL("../../../../.test-output/local-compose/", import.meta.url));
mkdirSync(output, { recursive: true });

interface Result {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
}
interface Snapshot {
  revision: number;
  files: Record<string, string>;
  binaries: Record<string, string>;
}
const touched = new Set<string>();
const report: Record<string, unknown> = { origin, startedAt: new Date().toISOString() };
let browser: Browser | undefined;
let page: Page | undefined;
let project: string | undefined;
const client = new Client({ name: "meltemi-local-acceptance", version: "1.0.0" });
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function waitFor(
  label: string,
  test: () => Promise<boolean>,
  milliseconds = 30_000,
): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (!(await test())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  touched.add(name);
  return (await client.callTool({ name, arguments: args })) as unknown as Result;
}
async function ok<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = await call(name, args);
  assert.ok(!result.isError, `${name}: ${JSON.stringify(result.structuredContent)}`);
  return result.structuredContent as T;
}
const read = () => ok<Snapshot>("read_files", { project });

try {
  await waitFor("runtime ready", async () => {
    try {
      return (await fetch(`${origin}/healthz`)).ok;
    } catch {
      return false;
    }
  });
  const sessionResponse = await fetch(`${origin}/api/session`);
  assert.equal(sessionResponse.headers.get("set-cookie"), null);
  const session = (await sessionResponse.json()) as {
    mode: string;
    user: { sub: string };
    defaultProject: { id: string; url: string };
  };
  assert.equal(session.mode, "local-single-user");
  report["owner"] = session.user.sub;
  report["defaultProject"] = session.defaultProject.id;

  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("Authorization"), null, "Native MCP has no bearer credential");
        assert.equal(headers.get("Cookie"), null, "Native MCP has no cookie");
        const response = await fetch(input, init);
        assert.equal(response.headers.get("Mcp-Session-Id"), null, "Transport is stateless");
        assert.equal(response.headers.get("set-cookie"), null);
        return response;
      },
    }),
  );
  assert.equal((await client.listTools()).tools.length, 27);
  assert.equal((await ok("whoami"))["sub"], session.user.sub);
  const nonce = randomUUID();
  const created = await ok<{ id: string; url: string }>("create_project", {
    name: `Compose acceptance ${nonce}`,
    template: "free",
    idempotencyKey: `compose-create-${nonce}`,
  });
  project = created.id;
  assert.notEqual(project, session.defaultProject.id, "Never mutate the default project");
  const replayCreate = await ok<{ id: string }>("create_project", {
    name: `Compose acceptance ${nonce}`,
    template: "free",
    idempotencyKey: `compose-create-${nonce}`,
  });
  assert.equal(replayCreate.id, project);
  await ok("get_project", { project });
  assert.ok(
    (await ok<{ projects: { id: string }[] }>("list_projects")).projects.some(
      (entry) => entry.id === project,
    ),
  );
  await ok("rename_project", { project, name: `Acceptance ${nonce}` });

  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const uploaded = await ok<{ hash: string }>("upload_image", {
    project,
    path: "diagrams/assets/pixel.png",
    data: pngBytes.toString("base64"),
  });
  assert.equal(uploaded.hash, hash(pngBytes));
  assert.equal(
    hash(
      new Uint8Array(
        await (
          await fetch(`${origin}/api/projects/${project}/blobs/${uploaded.hash}`)
        ).arrayBuffer(),
      ),
    ),
    uploaded.hash,
  );
  const before = await read();
  const file = "diagrams/slide.meltemi";
  const source = before.files[file]!;
  assert.ok(source.includes('box browser "Browser"'));
  const agentText = source
    .replace('box browser "Browser"', 'box browser "Agent browser"')
    .replace(
      "  placement {",
      '  image logo "assets/pixel.png"\n\n  placement {\n    place logo at (1100, 80)\n    size logo (50, 50)',
    );

  browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
  });
  page = await context.newPage();
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin)
      external.push(request.url());
  });
  page.on("websocket", (socket) => assert.equal(new URL(socket.url()).host, new URL(origin).host));
  await page.goto(created.url);
  await page.waitForFunction(
    () => document.querySelector(".cloud-status")?.getAttribute("data-state") === "connected",
  );
  await page.waitForFunction(
    () => document.querySelectorAll('#app .content g[data-role="element"]').length > 0,
  );
  assert.equal(await page.locator(".local-workspace-label").textContent(), "Local workspace");
  assert.equal(await page.locator(".account-button,.sign-in").count(), 0);
  assert.deepEqual(await context.cookies(), [], "No implicit browser authentication is issued");

  const written = await ok<{ revision: number }>("write_files", {
    project,
    files: { [file]: agentText },
    ifRevision: before.revision,
    idempotencyKey: `compose-write-${nonce}`,
  });
  const replay = await ok<{ revision: number }>("write_files", {
    project,
    files: { [file]: agentText },
    ifRevision: before.revision,
    idempotencyKey: `compose-write-${nonce}`,
  });
  assert.equal(replay.revision, written.revision);
  await page.waitForFunction(() =>
    (document.querySelector(".code-input") as HTMLTextAreaElement | null)?.value.includes(
      'box browser "Agent browser"',
    ),
  );
  await page.waitForFunction(
    () => document.querySelector('#app .content g[data-id="logo"]') !== null,
  );
  const stale = await call("write_files", {
    project,
    files: { "notes.txt": "stale" },
    ifRevision: before.revision,
  });
  assert.equal(stale.structuredContent?.["code"], "revision.mismatch");
  const current = await read();
  const invalid = await call("write_files", {
    project,
    files: { "bad.meltemi": "diagram x: flow {\n a ->\n}\n" },
    ifRevision: current.revision,
  });
  assert.equal(invalid.structuredContent?.["code"], "diagram.invalid");
  assert.deepEqual(await read(), current, "Invalid source changes no file or revision");
  assert.equal((await ok("validate", { project }))["errors"], 0);
  const svg = await call("preview", { project, path: file, format: "svg" });
  assert.ok(!svg.isError, JSON.stringify(svg.structuredContent));
  assert.match(svg.content[0]?.text ?? "", /^<svg/);
  writeFileSync(join(output, "preview.svg"), svg.content[0]!.text!);
  const png = await call("preview", { project, path: file, format: "png", width: 640 });
  assert.ok(!png.isError, JSON.stringify(png.structuredContent));
  const image = png.content.find((item) => item.type === "image")!;
  assert.equal(image.mimeType, "image/png");
  const rendered = Buffer.from(image.data!, "base64");
  assert.equal(rendered.readUInt32BE(16), 640);
  writeFileSync(join(output, "preview.png"), rendered);

  // A real human keystroke reaches the same room and becomes the agent's next source read.
  await page.locator(".code-input").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n// Typed by the person in the editor", { delay: 5 });
  await waitFor("human source reaches MCP", async () =>
    (await read()).files[file]!.includes("// Typed by the person in the editor"),
  );
  await page.waitForFunction(() => {
    const studio = (
      window as unknown as { meltemiPlayground: { studio: { analysis?: { text: string } } } }
    ).meltemiPlayground.studio;
    return (
      studio.analysis?.text === (document.querySelector(".code-input") as HTMLTextAreaElement).value
    );
  });
  const preDrag = (await read()).files[file]!;
  const beforePlacement = /place browser at \([^)]*\)/.exec(preDrag)?.[0];
  assert.ok(beforePlacement);
  const element = page.locator('#app .content g[data-id="browser"][data-role="element"]').first();
  const box = await element.boundingBox();
  assert.ok(box, "Browser element drawn for visual edit");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 25, { steps: 8 });
  await page.mouse.up();
  await waitFor(
    "visual drag reaches MCP source",
    async () =>
      /place browser at \([^)]*\)/.exec((await read()).files[file]!)?.[0] !== beforePlacement,
  );
  const dragged = (await read()).files[file]!;
  assert.notEqual(
    /place browser at \([^)]*\)/.exec(dragged)?.[0],
    beforePlacement,
    "Canvas drag changed the placed coordinates read by the agent",
  );
  await page.getByRole("button", { name: "Set up my agent", exact: true }).click();
  const uiPrompt = await page.locator(".local-agent-prompt").inputValue();
  assert.ok(
    uiPrompt.includes(project) && uiPrompt.includes(`${origin}/agent-setup/local/prompt.md`),
    "The visible copyable prompt preserves the selected project and local setup address",
  );
  const setupAddress = uiPrompt.match(
    /http:\/\/[^\s/]+\/agent-setup\/local\/prompt\.md\?project=[a-z0-9]{20}/,
  )?.[0];
  assert.ok(setupAddress, "The copied setup URL carries its selected project query");
  assert.equal(new URL(setupAddress).searchParams.get("project"), project);
  const selectedInstructions = await (await fetch(setupAddress)).text();
  assert.ok(
    selectedInstructions.includes(`Selected project: ${project}`),
    "Instructions fetched from the visible URL keep the selected project rather than the default",
  );
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.screenshot({ path: join(output, "shared-editor.png"), fullPage: true });

  const version = await ok<{ number: number }>("create_version", {
    project,
    label: "Compose acceptance",
  });
  assert.ok(
    (await ok<{ versions: { number: number }[] }>("list_versions", { project })).versions.some(
      (entry) => entry.number === version.number,
    ),
  );
  const saved = await read();
  await ok("write_files", {
    project,
    files: { "temporary.txt": "to be restored" },
    ifRevision: saved.revision,
  });
  await ok("restore_version", { project, number: version.number });
  assert.deepEqual((await read()).files, saved.files);
  assert.equal((await ok("open_url", { project }))["url"], created.url);

  const disabled = CATALOGUE.filter(
    (tool) => !["projects:read", "projects:write"].includes(tool.scope),
  );
  assert.equal(disabled.length, 13);
  for (const tool of disabled) {
    const result = await call(tool.name);
    assert.equal(result.isError, true, tool.name);
    assert.equal(result.structuredContent?.["code"], "local.feature-unavailable", tool.name);
  }
  const refusedHeaders: Record<string, string>[] = [
    { Origin: "null" },
    { Origin: "https://evil.example" },
  ];
  for (const headers of refusedHeaders) {
    const response = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: "{}",
    });
    assert.equal(response.status, 403);
  }
  // Node's fetch drops an overridden Host header; send this actual rebinding request on the wire.
  const rebindingStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = rawHttpRequest(
      `${origin}/mcp`,
      {
        method: "POST",
        headers: {
          Host: "evil.example",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
  });
  assert.equal(rebindingStatus, 403);
  assert.equal(
    (
      await fetch(`${origin}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"name":"must not exist"}',
      })
    ).status,
    403,
  );
  for (const path of [
    "/api/tokens",
    "/oauth/register",
    "/.well-known/oauth-authorization-server",
    "/api/dev/collect",
    `/api/projects/${project}/publish`,
    `/api/projects/${project}/sharing`,
    "/__scheduled",
  ]) {
    assert.equal((await fetch(origin + path)).status, 409, path);
  }
  for (const method of ["GET", "DELETE"])
    assert.equal((await fetch(`${origin}/mcp`, { method })).status, 405);
  assert.equal(
    (
      await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "1999-01-01" },
        body: "{}",
      })
    ).status,
    400,
  );

  await waitFor(
    "plugin bundles built",
    async () => (await fetch(`${origin}/agent-setup/local/manifest.json`)).ok,
    60_000,
  );
  const manifestResponse = await fetch(`${origin}/agent-setup/local/manifest.json`);
  const manifest = (await manifestResponse.json()) as {
    authentication: string;
    origin: string;
    mcpUrl: string;
    bundles: Record<string, { url: string; sha256: string }>;
  };
  assert.equal(manifest.authentication, "none");
  assert.equal(manifest.origin, origin);
  assert.equal(manifest.mcpUrl, origin + "/mcp");
  for (const [name, bundle] of Object.entries(manifest.bundles)) {
    assert.equal(new URL(bundle.url).origin, origin);
    const bytes = new Uint8Array(await (await fetch(bundle.url)).arrayBuffer());
    assert.equal(hash(bytes), bundle.sha256, `${name} bundle integrity`);
    assert.equal(Buffer.from(bytes).readUInt32LE(0), 0x04034b50);
  }
  const prompt = await (
    await fetch(`${origin}/agent-setup/local/prompt.md?project=${project}`)
  ).text();
  assert.ok(prompt.includes(`Selected project: ${project}`));
  assert.ok(prompt.includes(`${origin}/mcp`) || prompt.includes("MCP"));
  assert.deepEqual(external, [], "Browser makes no external request");
  assert.deepEqual(errors, [], "No page error");
  assert.deepEqual(await context.cookies(), []);
  assert.equal(touched.size, 27, "All fourteen core and thirteen unavailable tools were exercised");
  report["success"] = true;
  report["tools"] = [...touched].sort();
  report["browser"] = browser.version();
  report["project"] = project;
  console.log(
    "Local Compose acceptance: 27 tools, shared editor/agent source and canvas, SVG/PNG, boundaries and plugin bundles passed.",
  );
} catch (error) {
  report["success"] = false;
  report["error"] = error instanceof Error ? error.message : String(error);
  if (page)
    await page.screenshot({ path: join(output, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await client.close().catch(() => {});
  await browser?.close();
  if (project) {
    const removed = await fetch(`${origin}/api/projects/${project}`, {
      method: "DELETE",
      headers: { Origin: origin },
    }).catch(() => undefined);
    report["testProjectRemoved"] = removed?.status === 204;
  }
  report["finishedAt"] = new Date().toISOString();
  writeFileSync(join(output, "acceptance.json"), JSON.stringify(report, null, 2) + "\n");
}
